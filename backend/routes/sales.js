// Sales: the sales list, invoices, customer payments and their reversal, and sale authorisation.
// Moved from server.js unchanged; server.js mounts this router where the routes used to be.
const {pool}=require('../db');
const {requireRole}=require('../auth');
const {authorise}=require('../dependency-services');
const {readInventoryQuantity,readSubmissionKey}=require('../record-rules');
const router=require('express').Router();

// Handles GET /api/sales requests.
router.get("/api/sales",requireRole(['admin','manager','storekeeper']),function(req,res) {
	pool.query(
		`SELECT
		sales.item_id,
		sales.sales_id,
		to_char(sales.sales_date, 'YYYY-MM-DD') AS sales_date,
		sales.created_at,
		sales.customer_id,
		customers.name AS customer,
		items.name,
		sales.quantity,sales.billing_basis,COALESCE(sales.factory_quantity,sales.quantity) AS factory_quantity,
        EXISTS(SELECT 1 FROM delivery_notes d WHERE d.sales_id=sales.sales_id) AS has_delivery_note,
		sales.unit_price,
		invoice_amount(sales.quantity,sales.unit_price) AS total,
		sales.invoice_number,
		wr.scale_ticket,wr.vehicle_number,wr.completed_by AS weighed_by,wr.status AS dispatch_status,
		to_char(sales.due_date,'YYYY-MM-DD') AS due_date,
		COALESCE(payments.amount_paid,0) AS amount_paid,
		GREATEST(invoice_amount(sales.quantity,sales.unit_price)-COALESCE(payments.amount_paid,0),0) AS amount_remaining,
		CASE
            WHEN sales.invoice_number IS NULL THEN 'Awaiting customer weight'
			WHEN COALESCE(payments.amount_paid,0)>=invoice_amount(sales.quantity,sales.unit_price) THEN 'Paid'
			WHEN COALESCE(payments.amount_paid,0)>0 THEN 'Partly Paid'
			WHEN sales.due_date<CURRENT_DATE THEN 'Overdue'
			ELSE 'Pending'
		END AS payment_status,
		-- Shown beside Partly Paid too, so a late balance is never hidden by a small deposit.
		CASE WHEN sales.invoice_number IS NOT NULL AND sales.due_date<CURRENT_DATE
			AND COALESCE(payments.amount_paid,0)<invoice_amount(sales.quantity,sales.unit_price) THEN CURRENT_DATE-sales.due_date ELSE 0 END AS days_overdue
		FROM sales
		INNER JOIN customers
		ON sales.customer_id = customers.customer_id
		INNER JOIN items
		ON sales.item_id = items.item_id
		LEFT JOIN weighing_requests wr
		ON wr.request_type='Sale' AND wr.completed_record_id=sales.sales_id AND wr.status='Completed'
		LEFT JOIN (
			SELECT sales_id,SUM(amount) AS amount_paid
			FROM sale_payments WHERE reversed_at IS NULL GROUP BY sales_id
		) AS payments ON payments.sales_id=sales.sales_id
		ORDER BY sales.created_at DESC`,
		// Runs the callback required by the surrounding operation.
		function(err,result) {
			if(err) {
				return res.status(500).json({
					err: "Could not load sales. Database connection failed"
				});
			}
			res.status(200).json(result.rows);
		}
	);
});

// Returns one sale with the company details and every payment recorded against it.
router.get('/api/sales/:id/invoice',requireRole(['admin','manager','storekeeper']),async function(req,res) {
	try {
		const saleResult=await pool.query(`SELECT
			s.sales_id,to_char(s.sales_date,'YYYY-MM-DD') AS sales_date,
			to_char(s.due_date,'YYYY-MM-DD') AS due_date,s.invoice_number,
			s.invoice_snapshot,s.quantity,s.billing_basis,s.unit_price,invoice_amount(s.quantity,s.unit_price) AS total,
            EXISTS(SELECT 1 FROM delivery_notes d WHERE d.sales_id=s.sales_id) AS has_delivery_note,
			c.customer_id,c.name AS customer,c.phone_number AS customer_phone,
			c.email AS customer_email,c.address AS customer_address,i.name AS item,
			COALESCE((SELECT SUM(amount) FROM sale_payments WHERE sales_id=s.sales_id AND reversed_at IS NULL),0) AS amount_paid
		FROM sales s
		JOIN customers c ON c.customer_id=s.customer_id
		JOIN items i ON i.item_id=s.item_id
		WHERE s.sales_id=$1`,[req.params.id]);
		if(saleResult.rows.length===0) return res.status(404).json({ err: 'Sale not found' });
        if(!saleResult.rows[0].invoice_number)return res.status(409).json({err:'Invoice awaits the buyer’s signed weight and any required Director approval.'});
		const paymentsResult=await pool.query(`SELECT
			payment_id,receipt_number,to_char(payment_date,'YYYY-MM-DD') AS payment_date,
			amount,payment_method,reference_number,note,created_at,reversed_at,reversal_reason,
			(SELECT username FROM users WHERE user_id=sale_payments.recorded_by) AS recorded_by_name,
			(SELECT username FROM users WHERE user_id=sale_payments.reversed_by) AS reversed_by_name
		FROM sale_payments WHERE sales_id=$1 ORDER BY payment_date,created_at,payment_id`,[req.params.id]);
		const companyResult=await pool.query('SELECT * FROM company_details WHERE company_id=1');
		const sale=saleResult.rows[0];
        const snapshot=sale.invoice_snapshot;
        if(snapshot) for(const key of ['customer','customer_phone','customer_email','customer_address','item']) sale[key]=snapshot[key];
        return res.json({sale,payments:paymentsResult.rows,company:snapshot?.company||companyResult.rows[0]||{}});
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not load invoice details' });
	}
});

// Records one customer payment and creates its permanent receipt number.
router.post('/api/sales/:id/payments',requireRole(['admin','manager']),async function(req,res) {
	const payment=req.body;
	const amount=readInventoryQuantity(payment.amount);
	if(!payment.payment_date||!payment.payment_method||amount===null||amount<=0) {
		return res.status(400).json({ err: 'Enter a valid payment date, amount and method' });
	}
	let submissionKey;
	try { submissionKey=readSubmissionKey(payment.submission_key); } catch(error) { return res.status(400).json({ err: error.message }); }
	const client=await pool.connect();
	try {
		await client.query('BEGIN');
		const saleResult=await client.query(`SELECT
			sales_id,invoice_number,invoice_amount(quantity,unit_price) AS total
		FROM sales WHERE sales_id=$1 FOR UPDATE`,[req.params.id]);
		if(saleResult.rows.length===0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ err: 'Sale not found' });
		}
		const sale=saleResult.rows[0];
		// The same payment sent again (double tap or retry) returns the payment already saved.
		if(submissionKey) {
			const prior=(await client.query('SELECT * FROM sale_payments WHERE submission_key=$1',[submissionKey])).rows[0];
			if(prior) {
				await client.query('ROLLBACK');
				if(String(prior.sales_id)!==String(sale.sales_id)||Number(prior.amount)!==amount) {
					return res.status(409).json({ err: 'This payment was already saved with different details. Refresh before recording another payment.' });
				}
				return res.status(200).json({...prior,already_saved:true});
			}
		}
        if(!sale.invoice_number){await client.query('ROLLBACK');return res.status(409).json({err:'Finalise the customer weight invoice before recording payment.'});}
        sale.amount_paid=(await client.query('SELECT COALESCE(SUM(amount),0) AS amount_paid FROM sale_payments WHERE sales_id=$1 AND reversed_at IS NULL',[req.params.id])).rows[0].amount_paid;
		if((await client.query('SELECT $1::numeric > $2::numeric-$3::numeric AS excessive',[amount,sale.total,sale.amount_paid])).rows[0].excessive) {
			await client.query('ROLLBACK');
			return res.status(400).json({ err: 'Payment cannot be greater than the remaining amount' });
		}
		const inserted=await client.query(`INSERT INTO sale_payments
			(sales_id,payment_date,amount,payment_method,reference_number,note,recorded_by,submission_key)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING payment_id`,[
			req.params.id,payment.payment_date,amount,payment.payment_method,
			payment.reference_number||null,payment.note||null,req.session.user_id,submissionKey
		]);
		const paymentId=inserted.rows[0].payment_id;
		const receiptNumber='RCT-'+String(payment.payment_date).slice(0,4)+'-'+String(paymentId).padStart(6,'0');
		const saved=await client.query(`UPDATE sale_payments SET receipt_number=$1
			WHERE payment_id=$2 RETURNING *`,[receiptNumber,paymentId]);
		await client.query('COMMIT');
		return res.status(201).json(saved.rows[0]);
	} catch(error) {
		await client.query('ROLLBACK');
		console.error(error);
		return res.status(500).json({ err: 'Could not record payment' });
	} finally {
		client.release();
	}
});

// Reverses a wrongly entered payment; its receipt stays on record marked as reversed.
router.post('/api/sales/:id/payments/:paymentId/reverse',requireRole(['admin']),async function(req,res) {
	const reason=String(req.body.reason||'').trim();
	if(!/^\d+$/.test(req.params.id)||!/^\d+$/.test(req.params.paymentId)||!reason||reason.length>300) {
		return res.status(400).json({ err: 'Enter the reason for reversing this payment' });
	}
	try {
		const result=await pool.query(`UPDATE sale_payments SET reversed_at=CURRENT_TIMESTAMP,reversed_by=$1,reversal_reason=$2
			WHERE payment_id=$3 AND sales_id=$4 AND reversed_at IS NULL RETURNING *`,
			[req.session.user_id,reason,req.params.paymentId,req.params.id]);
		if(result.rowCount===0) return res.status(409).json({ err: 'Payment not found or already reversed. Refresh the sale.' });
		return res.json({ message: 'Payment reversed. Receipt '+result.rows[0].receipt_number+' is kept and marked reversed.',payment: result.rows[0] });
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not reverse the payment' });
	}
});

// Handles POST /api/sales requests.
router.post("/api/sales",requireRole(['admin','manager']),async function(req,res) {
	const sales=req.body;
	if(
		!sales.customer_id||
		!sales.item_id||
		!/^\d{4}-\d{2}-\d{2}$/.test(sales.sales_date)
	) {
		return res.status(400).json({
			error: "could not save sale"
		});
	}
	if(require('../record-rules').futureAuthorisation(sales.sales_date)) return res.status(400).json({ err:'Authorise for today or an earlier day. A future date cannot be authorised.' });
	// The quantity the customer ordered, so the Storekeeper knows how much to load.
	const orderedQuantity=readInventoryQuantity(sales.ordered_quantity);
	if(orderedQuantity===null||orderedQuantity<=0) {
		return res.status(400).json({ err: 'Enter the quantity the customer ordered, with no more than two decimal places.' });
	}
	// The payment date agreed with a credit customer. Blank means payment is due on dispatch.
	const agreedDueDate=sales.agreed_due_date||null;
	if(agreedDueDate!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(agreedDueDate)||agreedDueDate<sales.sales_date)) {
		return res.status(400).json({ err: 'Enter a payment due date on or after the sale date, or leave it blank.' });
	}
	try {
		const priceResult=await pool.query(`SELECT unit_price FROM product_prices
			WHERE item_id=$1 AND effective_date<=$2::date
			ORDER BY effective_date DESC,price_id DESC LIMIT 1`,
			[sales.item_id,sales.sales_date]);
		if(priceResult.rows.length===0) {
			return res.status(400).json({ err: 'No price has been set for this product on the selected date' });
		}
		const savedUnitPrice=priceResult.rows[0].unit_price;
        const basis=sales.billing_basis||'Factory';
        if(!['Factory','Customer'].includes(basis))return res.status(400).json({err:'Choose factory weight or customer weight.'});
        const representative=Number(sales.representative_id||req.session.user_id);
        if(!Number.isInteger(representative)||(req.session.role!=='admin'&&representative!==req.session.user_id))return res.status(403).json({err:'Only the Director can assign another accompanying representative.'});
        // The Director approves releases and weight differences, so they are never the accompanying representative.
        const representativeRole=(await pool.query('SELECT role FROM users WHERE user_id=$1',[representative])).rows[0]?.role;
        if(!representativeRole||representativeRole==='admin')return res.status(400).json({err:'Choose a staff member other than the Director as the accompanying representative.'});
		const inserted=await authorise(pool,'Sale',sales,req.session.user_id,
			`INSERT INTO weighing_requests
			(request_type,request_date,customer_id,item_id,unit_price,created_by,billing_basis,representative_id,ordered_quantity,agreed_due_date)
			VALUES ('Sale',$1::date,$2,$3,$4,$5,$6,$7,$8,$9::date) RETURNING *`,[
			sales.sales_date,
			sales.customer_id,
			sales.item_id,
			savedUnitPrice,
			req.session.user_id,basis,representative,orderedQuantity,agreedDueDate
		]);
		return res.status(201).json(inserted.rows[0]);
	} catch(error) {
		console.error(error);
		return res.status(error.status||500).json({ err: error.status?error.message: 'Could not save sale' });
	}
});

module.exports={router};
