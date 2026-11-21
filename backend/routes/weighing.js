// Production and Pending Weighing: production records and authorisation, the Storekeeper's pending jobs, recording weighed quantities (receipts, dispatches and production entries), and finishing or reopening production days.
// Moved from server.js unchanged; server.js mounts this router where the routes used to be.
const {pool}=require('../db');
const {requireRole}=require('../auth');
const {reopenProduction,snapshotInvoice}=require('../dependency-services');
const {lockStock,protectStock,stockFloor}=require('../stock-safety');
const {dateText,movementPart}=require('../production-movements');
const {readInventoryQuantity}=require('../record-rules');
const router=require('express').Router();

// Handles GET /api/production requests.
router.get("/api/production",requireRole(['admin','manager','storekeeper']),function(req,res) {
	pool.query(
		`SELECT production.production_id,to_char(production.production_date,'YYYY-MM-DD') AS production_date,
		production.created_at,production.kernel_used,production.pko_produced,production.pkc_produced,
		production.sludge_produced,production.process_loss,ROUND((production.pko_produced/NULLIF(production.kernel_used,0)*100)::numeric,2) AS pko_yield,
		ROUND((production.pkc_produced/NULLIF(production.kernel_used,0)*100)::numeric,2) AS pkc_yield,
		to_char(production.production_hours,'HH24:MI') AS production_hours,
		to_char(production.down_time,'HH24:MI') AS down_time,wr.request_id,wr.scale_ticket,wr.completed_by AS weighed_by,wr.status,
        CASE WHEN wr.status='Awaiting Storekeeper' THEN 'Provisional' ELSE 'Final' END AS yield_status,
        (SELECT COALESCE(json_agg(pb ORDER BY pb.batch_id),'[]'::json)
         FROM production_batches pb WHERE pb.request_id=wr.request_id) AS batches
		FROM production LEFT JOIN weighing_requests wr
		ON wr.request_type='Production' AND wr.completed_record_id=production.production_id AND wr.status IN ('Completed','Awaiting Storekeeper')
		ORDER BY production.created_at DESC`,
		// Handles the result of the preceding database query.
		function(err,result) {
			if(err) {
				console.log(err);
				return res.status(500).json({
					err: "Failed to load production record from database"
				});
			}
			res.status(200).json(result.rows);
		}
	);
});

// Handles POST /api/production requests.
router.post("/api/production",requireRole(['admin','manager']),async function(req,res) {
	const production=req.body;
	if(
		!production.production_date||
		!production.production_hours||
		!production.down_time
	) {
		return res.status(400).json({
			err: "Check your inputs and try again"
		});
	}
    if(!/^\d{2}:[0-5]\d$/.test(production.production_hours)||!/^\d{2}:[0-5]\d$/.test(production.down_time)) {
        return res.status(400).json({err:'Enter production hours and downtime as hours:minutes, for example 00:30 or 08:50'});
    }
	try {
		const existing=await pool.query(`SELECT 1 FROM production WHERE production_date=$1::date
			UNION ALL SELECT 1 FROM weighing_requests
			WHERE request_type='Production' AND request_date=$1::date AND status='Awaiting Storekeeper'`,
		[production.production_date]);
		if(existing.rows.length>0) return res.status(409).json({ err: 'A production record already exists for this date' });
		const result=await pool.query(`INSERT INTO weighing_requests
			(request_type,request_date,production_hours,down_time,created_by)
			VALUES ('Production',$1::date,$2::interval,$3::interval,$4) RETURNING *`,
		[production.production_date,production.production_hours,production.down_time,req.session.user_id]);
		return res.status(201).json(result.rows[0]);
	} catch(error) {
		console.error(error);
        if(error.code==='23505') return res.status(409).json({ err:'A production authorisation already exists for this date' });
		return res.status(500).json({ err: 'Could not send production to Storekeeper' });
	}
});

const {weighingRequestDetails,registerFinishedProduction}=require('../weighing-history');
registerFinishedProduction(router,pool,requireRole);

// Lists authorised activities that are waiting for the Storekeeper's physical quantities.
router.get('/api/weighing-requests',requireRole(['admin','manager','storekeeper']),async function(req,res) {
	try {
		const result=await pool.query(`WITH numbered_requests AS (
            SELECT weighing_requests.*,ROW_NUMBER() OVER (
                PARTITION BY request_type,request_date ORDER BY request_id
            ) AS daily_number FROM weighing_requests
        )  ${weighingRequestDetails}
        WHERE (wr.status='Awaiting Storekeeper'
            OR ($3::boolean AND wr.request_id IN (SELECT request_id FROM weighing_requests
                WHERE request_type='Production' AND status='Completed'
                ORDER BY request_date DESC,request_id DESC LIMIT 10)))
            AND (wr.request_type<>'Production' OR wr.completed_record_id IS NULL
                OR EXISTS (SELECT 1 FROM production p WHERE p.production_id=wr.completed_record_id))
		ORDER BY wr.request_date,wr.created_at,wr.request_id`,
        [req.session.user_id,req.session.role,req.session.role==='admin'&&req.query.include_completed==='true']);
		return res.json(result.rows);
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not load pending Storekeeper work' });
	}
});

// Cancels an incorrect authorisation before the Storekeeper has completed it.
router.patch('/api/weighing-requests/:id/cancel',requireRole(['admin','manager']),async function(req,res) {
	const requestId=Number(req.params.id);
	if(!Number.isInteger(requestId)||requestId<1) return res.status(400).json({ err: 'Invalid request' });
	try {
		const result=await pool.query(`UPDATE weighing_requests SET status='Cancelled'
			WHERE request_id=$1 AND status='Awaiting Storekeeper' AND completed_record_id IS NULL AND ($2::text='admin' OR created_by=$3)
            RETURNING request_id`,[requestId,req.session.role,req.session.user_id]);
		if(result.rows.length===0) return res.status(404).json({ err: 'Authorisation not found, already closed, or has saved quantities; production with saved batches must be finished' });
		return res.json({ message: 'Authorisation cancelled' });
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not cancel the authorisation' });
	}
});

// Adds or changes the ordered quantity on a sale or purchase still waiting for the Storekeeper,
// for authorisations made before it was recorded or when the customer or supplier changes the order.
// The Director can change any; a Manager only their own, like cancelling.
router.patch('/api/weighing-requests/:id/ordered-quantity',requireRole(['admin','manager']),async function(req,res) {
	const requestId=Number(req.params.id);
	const quantity=readInventoryQuantity(req.body.ordered_quantity);
	if(!Number.isInteger(requestId)||requestId<1) return res.status(400).json({ err: 'Invalid request' });
	if(quantity===null||quantity<=0) return res.status(400).json({ err: 'Enter the ordered quantity, with no more than two decimal places.' });
	try {
		const result=await pool.query(`UPDATE weighing_requests SET ordered_quantity=$2
			WHERE request_id=$1 AND status='Awaiting Storekeeper' AND request_type IN ('Sale','Purchase') AND ($3::text='admin' OR created_by=$4)
			RETURNING request_id,ordered_quantity`,[requestId,quantity,req.session.role,req.session.user_id]);
		if(result.rows.length===0) return res.status(404).json({ err: 'Authorisation not found, already completed, or not yours to change.' });
		return res.json({ message: 'Ordered quantity saved.',...result.rows[0] });
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not save the ordered quantity' });
	}
});

// Closes a production day without adding quantities a second time.
router.patch('/api/weighing-requests/:id/finish',requireRole(['admin','storekeeper']),async function(req,res) {
    const requestId=Number(req.params.id);
    if(!Number.isInteger(requestId)||requestId<1) return res.status(400).json({ err:'Invalid request' });
    const client=await pool.connect();
    try {
    await client.query('BEGIN');
    const result=await client.query(`UPDATE weighing_requests SET status='Completed',
        completed_by=$1,completed_at=CURRENT_TIMESTAMP
        WHERE request_id=$2 AND request_type='Production' AND status='Awaiting Storekeeper'
        AND completed_record_id IS NOT NULL RETURNING completed_record_id`,[req.session.user_id,requestId]);
    if(!result.rows.length) { await client.query('ROLLBACK');return res.status(409).json({ err:'Save at least one batch before finishing an open production day' }); }
    // Finish Day means every material has been processed, so kernel not recovered as weighed product is production loss.
    const loss=await client.query(`UPDATE production SET process_loss=GREATEST(ROUND(kernel_used-pko_produced-pkc_produced-sludge_produced,2),0)
        WHERE production_id=$1 RETURNING process_loss`,[result.rows[0].completed_record_id]);
    await client.query('COMMIT');
    const lossQuantity=Number(loss.rows[0]?.process_loss)||0;
    return res.json({ message:'Production day finished'+(lossQuantity>0?'. Production loss recorded: '+lossQuantity+' kg':'') });
    } catch(error) {
        await client.query('ROLLBACK');
        console.error(error);
        return res.status(500).json({ err:'Could not finish production day' });
    } finally {client.release();}
});

// Only Admin can reopen the same daily authorisation; quantities and stock stay intact.
router.patch('/api/weighing-requests/:id/reopen',requireRole(['admin']),async function(req,res) {
    const requestId=Number(req.params.id);
    if(!Number.isInteger(requestId)||requestId<1) return res.status(400).json({ err:'Invalid request' });
    try {
        await reopenProduction(pool,requestId,req.session.user_id);
        return res.json({message:'Production reopened; Storekeeper can add more batches'});
    }catch(error){return res.status(error.status||500).json({err:error.status?error.message:'Could not reopen production'});}
});

// Purchases and sales complete once; production submissions add batches to an open day.
// Saves one production entry (a kernel issue or one product received) inside the caller's transaction.
// Returns { saved:false } when the same entry was already saved by an earlier attempt with the same key,
// and refuses a key reused with different quantities, date or ticket.
async function saveProductionEntry(client,request,entry,movementDate,scaleTicket,userId) {
	const requestId=request.request_id;
	if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.submission_key||'')) {
		throw Object.assign(new Error('A valid batch submission key is required'),{ status:400 });
	}
	const previous=await client.query('SELECT * FROM production_batches WHERE submission_key=$1',[entry.submission_key]);
	if(previous.rows.length) {
		const batch=previous.rows[0];
		if(batch.request_id!==requestId) throw Object.assign(new Error('Batch key belongs to another authorisation'),{ status:409 });
		if(batch.voided) throw Object.assign(new Error('This batch has been reversed. Start a new batch.'),{status:409});
		if(dateText(batch.movement_date||request.request_date)!==movementDate||['kernel_used','pko_produced','pkc_produced','sludge_produced'].some(key =>
			readInventoryQuantity(entry[key])!==Number(batch[key]))||scaleTicket!==batch.scale_ticket) {
			throw Object.assign(new Error('This batch was already saved with different quantities or ticket. Refresh before recording another batch.'),{ status:409 });
		}
		return { saved:false };
	}
	if(entry.entry_type) {
		const kernel=readInventoryQuantity(entry.kernel_used);
		const products=['pko_produced','pkc_produced','sludge_produced'].map(key=>readInventoryQuantity(entry[key]));
		if(!['Issue','Receive'].includes(entry.entry_type)||
			(entry.entry_type==='Issue'&&(!(kernel>0)||products.some(value=>value!==0)))||
			(entry.entry_type==='Receive'&&(kernel!==0||products.filter(value=>value>0).length!==1||
				(entry.received_product&&(!['pko_produced','pkc_produced','sludge_produced'].includes(entry.received_product)||
				 !(readInventoryQuantity(entry[entry.received_product])>0)))))) {
			throw Object.assign(new Error('Record a kernel issue or receive exactly one selected product per entry'),{status:400});
		}
	}
	const quantities={
		kernel_used: readInventoryQuantity(entry.kernel_used),
		pko_produced: readInventoryQuantity(entry.pko_produced),
		pkc_produced: readInventoryQuantity(entry.pkc_produced),
		sludge_produced: readInventoryQuantity(entry.sludge_produced)
	};
	if(Object.values(quantities).some(value => value===null||value<0)||
		!Object.values(quantities).some(value => value>0)) {
		throw Object.assign(new Error('Enter at least one positive batch quantity, using no more than two decimal places'),{ status:400 });
	}
	await client.query(`INSERT INTO production_batches
		(request_id,submission_key,kernel_used,pko_produced,pkc_produced,sludge_produced,scale_ticket,recorded_by,movement_date)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date)`,[requestId,entry.submission_key,
		quantities.kernel_used,quantities.pko_produced,quantities.pkc_produced,quantities.sludge_produced,scaleTicket,userId,movementDate]);
	const production=await client.query(`INSERT INTO production
		(production_date,kernel_used,pko_produced,pkc_produced,sludge_produced,production_hours,down_time)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (production_date) DO UPDATE SET
		kernel_used=production.kernel_used+EXCLUDED.kernel_used,
		pko_produced=production.pko_produced+EXCLUDED.pko_produced,
		pkc_produced=production.pkc_produced+EXCLUDED.pkc_produced,
		sludge_produced=production.sludge_produced+EXCLUDED.sludge_produced
		RETURNING production_id`,
	[request.request_date,quantities.kernel_used,quantities.pko_produced,
		quantities.pkc_produced,quantities.sludge_produced,request.production_hours,request.down_time]);
	const itemRows=await client.query(`SELECT item_id,LOWER(name) AS name FROM items
		WHERE LOWER(name) IN ('p kernel','pko','pkc','sludge')`);
	const ids=Object.fromEntries(itemRows.rows.map(item => [item.name,item.item_id]));
	if(!ids['p kernel']||!ids.pko||!ids.pkc||!ids.sludge) throw new Error('Production inventory items are incomplete');
	const movements=[
		[ids['p kernel'],0,quantities.kernel_used,'Kernel Issued'],
		[ids.pko,quantities.pko_produced,0,'PKO Received'],
		[ids.pkc,quantities.pkc_produced,0,'PKC Received'],
		[ids.sludge,quantities.sludge_produced,0,'Sludge Received']
	];
	for(const movement of movements) {
		await client.query(`INSERT INTO stock_counts
			(count_date,item_id,received,issued,source_type,source_id,source_part,recorded_by)
			VALUES ($1,$2,$3,$4,'Production',$5,$6,$7)
			ON CONFLICT (source_type,source_id,source_part) WHERE source_id IS NOT NULL
			DO UPDATE SET received=stock_counts.received+EXCLUDED.received,
			issued=stock_counts.issued+EXCLUDED.issued,recorded_by=EXCLUDED.recorded_by`,
		[movementDate,movement[0],movement[1],movement[2],requestId,movementPart(movement[3],movementDate,request.request_date),userId]);
	}
	await client.query(`UPDATE weighing_requests SET kernel_used=COALESCE(kernel_used,0)+$1,pko_produced=COALESCE(pko_produced,0)+$2,
		pkc_produced=COALESCE(pkc_produced,0)+$3,sludge_produced=COALESCE(sludge_produced,0)+$4 WHERE request_id=$5`,
	[quantities.kernel_used,quantities.pko_produced,quantities.pkc_produced,quantities.sludge_produced,requestId]);
	return { saved:true,productionId:production.rows[0].production_id };
}

router.patch('/api/weighing-requests/:id/complete',requireRole(['admin','storekeeper']),async function(req,res) {
	const requestId=Number(req.params.id);
	if(!Number.isInteger(requestId)||requestId<1) return res.status(400).json({ err: 'Invalid request' });
	const client=await pool.connect();
	try {
		await client.query('BEGIN');
        await lockStock(client);
        const before=await stockFloor(client);
		const requestResult=await client.query(
			`SELECT * FROM weighing_requests WHERE request_id=$1 FOR UPDATE`,[requestId]
		);
		if(requestResult.rows.length===0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ err: 'Request not found' });
		}
		const request=requestResult.rows[0];
		if(request.status!=='Awaiting Storekeeper') {
			await client.query('ROLLBACK');
			return res.status(409).json({ err: 'This request has already been completed' });
		}
        // Stock moves on the day goods are actually received, issued or dispatched, never before the authorisation date.
        const movementDate=req.body.movement_date||dateText(request.request_date);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(movementDate)||Number(movementDate.slice(0,4))<1||!Number.isFinite(Date.parse(movementDate+'T00:00:00Z'))||new Date(movementDate+'T00:00:00Z').toISOString().slice(0,10)!==movementDate||movementDate<dateText(request.request_date)) {
            throw Object.assign(new Error(request.request_type==='Production'?'Enter a valid issue or receipt date on or after the production date.':
                'Enter a valid date actually '+(request.request_type==='Purchase'?'received':'dispatched')+', on or after the authorisation date.'),{status:400});
        }
        if(req.body.kernel_test!==undefined&&request.request_type!=='Purchase') {
            throw Object.assign(new Error('Kernel sample tests can only accompany a kernel purchase receipt.'),{status:400});
        }
		const scaleTicket=String(req.body.scale_ticket||'').trim()||null;
		const vehicleNumber=String(req.body.vehicle_number||'').trim()||null;
		let completedRecordId;
		let productionEntriesSaved=0;
		if(request.request_type==='Purchase') {
			const quantity=readInventoryQuantity(req.body.quantity);
			if(quantity===null||quantity<=0) throw Object.assign(new Error('Enter the received quantity using no more than two decimal places'),{ status:400 });
			const purchase=await client.query(`INSERT INTO purchases
				(purchase_date,supplier_id,item_id,quantity_supplied,unit_cost)
				VALUES ($1,$2,$3,$4,$5) RETURNING purchase_id`,
			[movementDate,request.supplier_id,request.item_id,quantity,request.unit_cost]);
			completedRecordId=purchase.rows[0].purchase_id;
            if(req.body.kernel_test!==undefined){
                await require('../kernel-impurity').saveReceiptKernelTest(client,completedRecordId,request.item_id,req.body.kernel_test,req.session.user_id);
            }
			await client.query(`INSERT INTO stock_counts
				(count_date,item_id,received,issued,source_type,source_id,source_part,recorded_by)
				VALUES ($1,$2,$3,0,'Purchase',$4,'Received',$5)`,
			[movementDate,request.item_id,quantity,requestId,req.session.user_id]);
			await client.query(`UPDATE weighing_requests SET quantity=$1 WHERE request_id=$2`,[quantity,requestId]);
		} else if(request.request_type==='Sale') {
			const quantity=readInventoryQuantity(req.body.quantity);
			if(quantity===null||quantity<=0) throw Object.assign(new Error('Enter the issued quantity using no more than two decimal places'),{ status:400 });
            // The driver signs for the weighed load before dispatch is confirmed, so no sale exists without a signature.
            const deliveryRules=require('../delivery-notes');
            const driverName=deliveryRules.name(req.body.driver_name,'the driver’s name');
            const driverSignature=deliveryRules.signature(req.body.driver_signature);
			const sale=await client.query(`WITH next_sale AS
				(SELECT nextval('sales_sales_id_seq') AS sales_id)
				INSERT INTO sales
				(sales_id,sales_date,customer_id,item_id,quantity,unit_price,due_date,invoice_number,billing_basis,factory_quantity)
				SELECT sales_id,$1,$2,$3,CASE WHEN $6='Customer' THEN 0 ELSE $4 END,$5,$1,
                CASE WHEN $6='Customer' THEN NULL ELSE 'INV-'||to_char($1::date,'YYYY')||'-'||lpad(sales_id::text,6,'0') END,$6,$4
				FROM next_sale RETURNING sales_id`,
			[movementDate,request.customer_id,request.item_id,quantity,request.unit_price,request.billing_basis]);
			completedRecordId=sale.rows[0].sales_id;
            await snapshotInvoice(client,completedRecordId);
            await client.query(`INSERT INTO delivery_notes(sales_id,representative_id,driver_name,driver_signature,driver_signed_at,driver_recorded_by)
                VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP,$5)`,[completedRecordId,request.representative_id||request.created_by,driverName,driverSignature,req.session.user_id]);
			await client.query(`INSERT INTO stock_counts
				(count_date,item_id,received,issued,source_type,source_id,source_part,recorded_by)
				VALUES ($1,$2,0,$3,'Sale',$4,'Issued',$5)`,
			[movementDate,request.item_id,quantity,requestId,req.session.user_id]);
			await client.query(`UPDATE weighing_requests SET quantity=$1 WHERE request_id=$2`,[quantity,requestId]);
		} else {
			// Several quantities sent together (entries) are saved in this one transaction: all of them or none.
			// A single quantity, sent on its own as before, is a list of one.
			const entries=Array.isArray(req.body.entries)?req.body.entries:[req.body];
			if(entries.length<1||entries.length>4||entries.some(entry=>!entry||typeof entry!=='object')) {
				throw Object.assign(new Error('Send between one and four production entries'),{status:400});
			}
			const keys=entries.map(entry=>String(entry.submission_key||'').toLowerCase());
			if(new Set(keys).size!==keys.length) throw Object.assign(new Error('Each production entry needs its own submission key'),{status:400});
			let saved=0;
			for(const entry of entries) {
				const result=await saveProductionEntry(client,request,entry,movementDate,scaleTicket,req.session.user_id);
				if(result.saved) { saved++;completedRecordId=result.productionId; }
			}
			// Every entry was already saved by an earlier attempt (a retry after a lost connection): nothing changes.
			if(!saved) {
				await client.query('COMMIT');
				return res.json({ message:entries.length>1?'These entries were already saved':'Batch already saved',record_id:request.completed_record_id,saved:0 });
			}
			productionEntriesSaved=saved;
		}
		await client.query(`UPDATE weighing_requests SET status=CASE WHEN request_type='Production' THEN 'Awaiting Storekeeper' ELSE 'Completed' END,completed_by=$1,
			completed_record_id=$2,scale_ticket=$3,vehicle_number=$4,completed_at=CURRENT_TIMESTAMP
			WHERE request_id=$5`,
		[req.session.user_id,completedRecordId,scaleTicket,vehicleNumber,requestId]);
        await protectStock(client,before);
		await client.query('COMMIT');
		return res.json({ message: request.request_type==='Production'?(productionEntriesSaved>1?productionEntriesSaved+' production entries saved; daily totals and stock updated':'Production entry saved; daily totals and stock updated'):request.request_type+' completed successfully',record_id: completedRecordId,saved:productionEntriesSaved||undefined });
	} catch(error) {
		await client.query('ROLLBACK');
		console.error(error);
		return res.status(error.status||500).json({ err: error.status?error.message:'Could not complete the Storekeeper work' });
	} finally {
		client.release();
	}
});

module.exports={router};
