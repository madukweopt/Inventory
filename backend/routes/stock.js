// Stock: stock movements, the inventory summary, manual stock changes and their history, and daily consumable usage.
// Moved from server.js unchanged; server.js mounts this router where the routes used to be.
const crypto=require('crypto');
const {pool}=require('../db');
const {requireRole}=require('../auth');
const {lockStock,protectStock,stockFloor}=require('../stock-safety');
const {recordStockHistory}=require('../record-corrections');
const {checkKernelReturn,refreshKernelReturns,KERNEL_DATE}=require('../kernel-returns');
const {readInventoryQuantity,readSubmissionKey,stockAdjustmentReasons}=require('../record-rules');
const router=require('express').Router();

// Handles GET /api/stock_counts requests.
router.get("/api/stock_counts",requireRole(['admin','storekeeper']),function(req,res) {
	pool.query(
		"SELECT stock_counts.source_type, stock_counts.source_id, stock_counts.adjustment_reason, stock_counts.count_id, stock_counts.item_id, items.name, to_char(stock_counts.count_date, 'YYYY-MM-DD') AS count_date, stock_counts.created_at, stock_counts.received, stock_counts.issued, SUM(stock_counts.received - stock_counts.issued) OVER (PARTITION BY stock_counts.item_id ORDER BY stock_counts.count_date, stock_counts.created_at, stock_counts.count_id,stock_counts.batch_id) - (stock_counts.received - stock_counts.issued) AS opening_stock, SUM(stock_counts.received - stock_counts.issued) OVER (PARTITION BY stock_counts.item_id ORDER BY stock_counts.count_date, stock_counts.created_at, stock_counts.count_id,stock_counts.batch_id) AS closing_stock FROM timed_stock_movements stock_counts INNER JOIN items ON stock_counts.item_id = items.item_id ORDER BY stock_counts.count_date DESC, stock_counts.created_at DESC, stock_counts.count_id DESC,stock_counts.batch_id DESC",
		// Handles the result of the preceding database query.
		function(err,result) {
			if(err) {
				console.log(err);
				return res.status(500).json({
					err: "Failed to retrieve stock record."
				});
			}
			res.status(200).json(result.rows);
		}
	);
});

// Daily inventory lines for production days and for days when stock moved. Balances are carried through every
// calendar day, so a day left out (nothing happened and no production) never changes the opening or closing stock.
// On a production day every item is listed; on another day only the items that moved.
router.get('/api/inventory-summary',requireRole(['admin','storekeeper']),async function(req,res) {
	try {
		const result=await pool.query(`WITH daily AS (
			-- Kernel returned unused from a production day is shown as less kernel issued that day, not as kernel received.
			SELECT stock_counts.item_id,items.name,stock_counts.count_date,
			MAX(stock_counts.created_at) AS created_at,
			SUM(CASE WHEN stock_counts.return_request_id IS NULL THEN stock_counts.received ELSE 0 END) AS received,
			SUM(stock_counts.issued-CASE WHEN stock_counts.return_request_id IS NULL THEN 0 ELSE stock_counts.received END) AS issued
			FROM stock_counts INNER JOIN items ON items.item_id=stock_counts.item_id
			-- A row left at 0 kg (for example by a reversed production entry) is not a movement and gives no line.
			WHERE stock_counts.received<>0 OR stock_counts.issued<>0
			GROUP BY stock_counts.item_id,items.name,stock_counts.count_date
		), item_days AS (
			SELECT item_id,name,generate_series(MIN(count_date)::timestamp,
				GREATEST(CURRENT_DATE,MAX(count_date))::timestamp,INTERVAL '1 day')::date AS count_date
			FROM daily GROUP BY item_id,name
		), calendar AS (
			SELECT item_days.item_id,item_days.name,item_days.count_date,daily.created_at,
				COALESCE(daily.received,0) AS received,COALESCE(daily.issued,0) AS issued,daily.count_date IS NOT NULL AS moved
			FROM item_days LEFT JOIN daily USING (item_id,name,count_date)
		), balances AS (
			SELECT item_id,name,count_date,created_at,received,issued,moved,
			SUM(received-issued) OVER (PARTITION BY item_id ORDER BY count_date)-
				(received-issued) AS opening_stock,
			SUM(received-issued) OVER (PARTITION BY item_id ORDER BY count_date) AS closing_stock
			FROM calendar
		), production_days AS (
			SELECT DISTINCT request_date AS count_date FROM weighing_requests
			WHERE request_type='Production' AND status<>'Cancelled'
		)
		SELECT ROW_NUMBER() OVER (ORDER BY count_date,item_id) AS summary_id,item_id,name,
		TO_CHAR(count_date,'YYYY-MM-DD') AS count_date,created_at,received,issued,opening_stock,closing_stock
		FROM balances
		WHERE moved OR count_date IN (SELECT count_date FROM production_days)
		ORDER BY count_date DESC,item_id`);
		return res.json(result.rows);
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not load daily Inventory summary' });
	}
});

// Handles POST /api/stock_counts requests.
// Production days that kernel can be returned from: the last 60 days with kernel issued, newest first.
router.get('/api/kernel-return-days',requireRole(['admin']),async function(req,res) {
	try {
		const rows=(await pool.query(`SELECT w.request_id,to_char(w.request_date,'YYYY-MM-DD') AS request_date,w.status,
				to_char(${KERNEL_DATE},'YYYY-MM-DD') AS kernel_date,
				p.kernel_used,p.kernel_returned,GREATEST(p.kernel_used-p.kernel_returned,0) AS returnable
			FROM weighing_requests w JOIN production p ON p.production_id=w.completed_record_id
			WHERE w.request_type='Production' AND w.status<>'Cancelled' AND p.kernel_used>0 AND w.request_date>=CURRENT_DATE-60
			ORDER BY w.request_date DESC,w.request_id DESC`)).rows;
		return res.json(rows);
	} catch(error) {
		console.error(error);
		return res.status(500).json({err:'Could not load production days.'});
	}
});

router.post("/api/stock_counts",requireRole(['admin']),async function(req,res) {
	const stockInventory=req.body;
	const receivedQuantity=readInventoryQuantity(stockInventory.received);
	const issuedQuantity=readInventoryQuantity(stockInventory.issued);
	const reason=stockInventory.adjustment_reason||null;
	if(
		!/^\d{4}-\d{2}-\d{2}$/.test(String(stockInventory.count_date||''))||
		!stockInventory.item_id||
		receivedQuantity===null||
		issuedQuantity===null||
		(receivedQuantity===0&&issuedQuantity===0)||
		// A manual change either adds or removes stock, never both in one entry.
		(receivedQuantity>0&&issuedQuantity>0)||
		(reason!==null&&!stockAdjustmentReasons.includes(reason))
	) {
		return res.status(400).json({
			error: "Could not submit stock"
		});
	}
	let submissionKey;
	try { submissionKey=readSubmissionKey(stockInventory.submission_key); } catch(error) { return res.status(400).json({ err: error.message }); }
    const client=await pool.connect();
    try {
        await client.query('BEGIN');await lockStock(client);
        // The same stock change sent again (double tap or retry) returns the change already saved.
        if(submissionKey) {
            const prior=(await client.query('SELECT * FROM stock_counts WHERE submission_key=$1',[submissionKey])).rows[0];
            if(prior) {
                await client.query('ROLLBACK');
                if(String(prior.item_id)!==String(stockInventory.item_id)||Number(prior.received)!==receivedQuantity||Number(prior.issued)!==issuedQuantity) {
                    return res.status(409).json({ err: 'This stock change was already saved with different details. Refresh before recording another.' });
                }
                return res.status(200).json({...prior,already_saved:true});
            }
        }
        const before=await stockFloor(client);
        // Kernel returned to store names the production day it came back from, so that day's loss is not overstated.
        // It is dated on the day that kernel was issued, so that day's kernel issued is net of it.
        const kernelReturn=await checkKernelReturn(client,{reason,itemId:stockInventory.item_id,received:receivedQuantity,requestId:stockInventory.return_request_id});
        const result=await client.query('INSERT INTO stock_counts(count_date,item_id,received,issued,recorded_by,adjustment_reason,submission_key,return_request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
            [kernelReturn?.date||stockInventory.count_date,stockInventory.item_id,receivedQuantity,issuedQuantity,req.session.user_id,reason,submissionKey,kernelReturn?.requestId??null]);
        await refreshKernelReturns(client,kernelReturn?.requestId);
        await protectStock(client,before);
        await recordStockHistory(client,result.rows[0].count_id,'Created',null,result.rows[0],req.session.user_id);
        await client.query('COMMIT');return res.status(201).json(result.rows[0]);
    }catch(error){await client.query('ROLLBACK');return res.status(error.status||500).json({err:error.status?error.message:'Could not save stock adjustment'});}
    finally{client.release();}
});

// History trail of manual stock changes, newest first, for the Director. 100 at a time; pass offset for more.
router.get('/api/stock-change-history',requireRole(['admin']),async function(req,res) {
    const offset=Math.max(Number.parseInt(req.query.offset,10)||0,0);
    try {
        const rows=(await pool.query(`SELECT h.history_id,h.count_id,h.action,h.before_values,h.after_values,h.backfilled,
            to_char(h.changed_at,'YYYY-MM-DD"T"HH24:MI:SS') AS changed_at,u.username AS changed_by,
            bi.name AS before_item,ai.name AS after_item
            FROM stock_change_history h
            LEFT JOIN users u ON u.user_id=h.changed_by
            LEFT JOIN items bi ON bi.item_id=(h.before_values->>'item_id')::integer
            LEFT JOIN items ai ON ai.item_id=(h.after_values->>'item_id')::integer
            ORDER BY h.changed_at DESC,h.history_id DESC LIMIT 101 OFFSET $1`,[offset])).rows;
        return res.json({rows:rows.slice(0,100),more:rows.length>100});
    } catch(error) {
        console.error(error);
        return res.status(500).json({err:'Could not load the stock change history.'});
    }
});

// Daily electricity, fuel and other consumables are issues, not new purchases.
router.post('/api/consumable-usage',requireRole(['admin','storekeeper']),async function(req,res){
    const usage=req.body,amount=readInventoryQuantity(usage.quantity);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(usage.usage_date||'')||!Number.isInteger(Number(usage.item_id))||Number(usage.item_id)<1||amount===null||amount<=0||
       !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usage.entry_key||'')){
        return res.status(400).json({err:'Enter a date, a consumable and the actual quantity used, with no more than two decimal places.'});
    }
    const client=await pool.connect();
    try{
        await client.query('BEGIN');await lockStock(client);
        const part='Use:'+crypto.createHash('sha256').update(usage.entry_key).digest('hex').slice(0,24);
        const existing=(await client.query("SELECT *,to_char(count_date,'YYYY-MM-DD') AS saved_date FROM stock_counts WHERE source_type='Manual' AND source_part=$1",[part])).rows[0];
        if(existing){
            if(existing.recorded_by!==req.session.user_id||existing.item_id!==Number(usage.item_id)||existing.saved_date!==usage.usage_date||Number(existing.issued)!==amount){
                throw Object.assign(new Error('This usage entry has already been saved with different details. Refresh Inventory Data before recording another entry.'),{status:409});
            }
            await client.query('COMMIT');return res.json({message:'Daily usage already recorded; stock was not deducted again.',record:existing,already_saved:true});
        }
        const item=(await client.query('SELECT item_type FROM items WHERE item_id=$1',[usage.item_id])).rows[0];
        if(!item||item.item_type!=='consumable')throw Object.assign(new Error('This form records consumable usage only. Use Pending Weighing for purchases, sales and kernel issues.'),{status:400});
        const before=await stockFloor(client);
        const record=(await client.query(`INSERT INTO stock_counts(count_date,item_id,received,issued,source_type,source_part,recorded_by)
            VALUES($1::date,$2,0,$3,'Manual',$4,$5) RETURNING *`,[usage.usage_date,usage.item_id,amount,part,req.session.user_id])).rows[0];
        await protectStock(client,before);
        await client.query('DELETE FROM daily_consumable_checks WHERE item_id=$1 AND check_date=$2::date',[usage.item_id,usage.usage_date]);
        await client.query('COMMIT');
        return res.status(201).json({message:'Daily usage saved. Inventory and closing balance have been updated.',record});
    }catch(error){
        await client.query('ROLLBACK');return res.status(error.status||(error.code==='22008'||error.code==='22007'?400:500)).json({err:error.status?error.message:error.code==='22008'||error.code==='22007'?'Enter a valid usage date.':'Could not save daily usage.'});
    }finally{client.release();}
});

module.exports={router};
