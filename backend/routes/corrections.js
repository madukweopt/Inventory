// Corrections made from the Data pages, entry corrections and older stock record links.
// Moved from server.js unchanged; server.js mounts this router where the routes used to be.
const {pool}=require('../db');
const {requireRole}=require('../auth');
const {correctRecord,correctManualStock}=require('../record-corrections');
const {validExpense,expenseSpreading}=require('../record-rules');
const router=require('express').Router();

// Handles GET /api/correction requests.
router.get("/api/correction",requireRole(['admin']),async function(req,res) {
	try {
		const correctionFor=req.query;
		const stockAndRelated={};
		const stockData=await pool.query(
			`SELECT stock_counts.*,
      items.name,
      to_char(stock_counts.count_date, 'YYYY-MM-DD') AS count_date
      FROM stock_counts
      INNER JOIN items
      ON
      stock_counts.item_id = items.item_id
      WHERE items.name = $1 AND
      stock_counts.count_date = $2::date
      ORDER BY stock_counts.created_at`,
			[correctionFor.item,correctionFor.date]
		);

		stockAndRelated["stock_record"]=stockData.rows;

		let related;
		if(correctionFor.related_source==="production") {
			related=await pool.query(
				`SELECT *,
        to_char(production_date, 'YYYY-MM-DD') AS production_date,
        to_char(production_hours, 'HH24:MI') AS production_hours,
        to_char(down_time, 'HH24:MI') AS down_time
        FROM production
        WHERE
        production.production_date
        = $1::date`,
				[correctionFor.date]
			);

			stockAndRelated["related_record"]=related.rows;
		} else if(correctionFor.related_source==="purchases") {
			related=await pool.query(
				`SELECT
		purchases.purchase_id,
		purchases.item_id,
		purchases.supplier_id,
		suppliers.name AS supplier,
		items.name,
		purchases.quantity_supplied,
		purchases.unit_cost,
		purchases.created_at,
		to_char(purchases.purchase_date, 'YYYY-MM-DD') AS purchase_date
		FROM purchases
		INNER JOIN suppliers
		ON purchases.supplier_id = suppliers.supplier_id
		INNER JOIN items
		ON purchases.item_id = items.item_id
        WHERE items.name = $1
        AND
        purchases.purchase_date =
        $2::date ORDER BY
        purchases.created_at`,
				[correctionFor.item,correctionFor.date]
			);

			stockAndRelated["related_record"]=related.rows;
		} else if(correctionFor.related_source==="sales") {
			related=await pool.query(
				`SELECT
		sales.sales_id,
		sales.item_id,
		sales.customer_id,
		customers.name AS customer,
		items.name,
		sales.quantity,
		sales.unit_price,
		sales.created_at,
		to_char(sales.sales_date, 'YYYY-MM-DD') AS sales_date
		FROM sales
		INNER JOIN customers
		ON sales.customer_id = customers.customer_id
		INNER JOIN items
		ON sales.item_id = items.item_id
        WHERE items.name = $1
        AND
        sales.sales_date =
        $2::date ORDER BY
        sales.created_at`,
				[correctionFor.item,correctionFor.date]
			);

			stockAndRelated["related_record"]=related.rows;
		} else {
			return res.status(400).json({
				err: "Invalid related source"
			});
		}

		return res.status(200).json(stockAndRelated);
	} catch(error) {
		console.log(error);
		res.status(500).json({
			err: "Could not load correction data"
		});
	}
});

require('../batch-corrections')(router,pool,requireRole);
require('../legacy-links')(router,pool,requireRole);

// Handles PATCH /api/correction_edit requests.
router.patch("/api/correction_edit",requireRole(['admin']),async function(req,res) {
	try {
		const kind=req.body.kind;
		const record=req.body.record;

        if(kind==='stock') {
            const corrected=await correctManualStock(pool,record,'edit',req.session.user_id);
            return res.json(corrected);
        }
        if(['purchases','sales','production'].includes(kind)) {
            const corrected=await correctRecord(pool,kind,record,'edit',req.session.user_id);
            return res.status(200).json(corrected);
        }

		let updated;

		if(kind==='expenses') {
			if(!validExpense(record)) {
				return res.status(400).json({ err: "Check the expense date, category, description and amount. Record capital items in Assets and Start-up Costs." });
			}
			if(await expenseFromPartnerPayment(record.expense_id)) {
				return res.status(409).json({ err: "This expense comes from a payment to a partner. Correct it under Other Partners." });
			}
			updated=await pool.query(
				`UPDATE expenses
				SET expense_date = $1::date,
			     category = $2,
				 description = $3,
				 amount_spent = $4,
				 spread_months = COALESCE($6::integer,spread_months),
				 startup_months = LEAST(COALESCE($7::integer,startup_months),COALESCE($6::integer,spread_months))
				 WHERE expense_id = $5
				 returning *`,
				[
					record.expense_date,
					record.category,
					record.description,
					record.amount_spent,
					record.expense_id,
					expenseSpreading(record).spread,
					expenseSpreading(record).startup

				]
			)

		}
		else {
			return res.status(400).json({
				err: "Invalid record type"
			});
		}

        if(!updated.rowCount) return res.status(409).json({ err:'Record not found or generated inventory cannot be edited directly; edit its source purchase, sale or production instead' });
		return res.status(200).json(updated.rows[0]);
	} catch(error) {
		console.log(error);

		return res.status(error.status||500).json({
			err: error.status?error.message:"Could not update record"
		});
	}
});

// Expenses created by a partner payment are corrected through that payment, so each cost is entered once.
async function expenseFromPartnerPayment(expenseId) {
	const linked=await pool.query('SELECT 1 FROM partner_payments WHERE expense_id=$1',[Number(expenseId)||0]);
	return linked.rowCount>0;
}

// Handles DELETE /api/correction_delete requests.
router.delete("/api/correction_delete",requireRole(['admin']),async function(req,res) {
	try {
		const kind=req.body.kind;
		const record=req.body.record;
        if(kind==='stock') {
            const corrected=await correctManualStock(pool,record,'delete',req.session.user_id);
            return res.json({message:'Record deleted successfully'});
        }
        if(['purchases','sales','production'].includes(kind)) {
            await correctRecord(pool,kind,record,'delete');
            return res.status(200).json({ message:'Record deleted successfully' });
        }

		let deleted;

		if(kind==='expenses') {
			if(await expenseFromPartnerPayment(record.expense_id)) {
				return res.status(409).json({ err: "This expense comes from a payment to a partner. Delete the payment under Other Partners instead." });
			}
			deleted=await pool.query(
				`DELETE FROM expenses WHERE expense_id = $1 RETURNING *`,
				[record.expense_id]
			);

		} else {
			return res.status(400).json({
				err: "Invalid record type"
			});
		}

		if(deleted.rowCount===0) {
			return res.status(404).json({
				err: "Record not found or generated inventory cannot be deleted directly; delete its source purchase, sale or production instead"
			});
		}

		return res.status(200).json({
			message: "Record deleted successfully"
		});
	} catch(error) {
		console.log(error);
		return res.status(error.status||500).json({
			err: error.status?error.message:"Could not delete record"
		});
	}
});

module.exports={router};
