// Kernel returned to store from a production day. Each return names the production authorisation it came back
// from, so that day's kernel processed is what was issued minus what came back. Finish Day uses that net figure
// for production loss, and a return entered after the day was finished recalculates its loss.
const fail=(status,message)=>Object.assign(new Error(message),{status});

// A kernel return is dated on its production day (the authorisation date, the day Production Data shows it under),
// so that day's kernel issued in Inventory Data is net of it, like its kernel used in Production Data.
const KERNEL_DATE=`w.request_date`;

// Checks a return against its production authorisation, inside the caller's transaction.
// Returns { requestId, date } to store (the return is dated on its production day, so no line appears for the
// day the return was entered), or null when the change is not a kernel return.
async function checkKernelReturn(client,{reason,itemId,received,requestId,countId=null}) {
    const item=(await client.query('SELECT name FROM items WHERE item_id=$1',[itemId])).rows[0];
    const isKernelReturn=reason==='Return to store'&&String(item?.name||'').trim().toLowerCase()==='p kernel'&&Number(received)>0;
    if(!isKernelReturn) return null;
    const id=Number(requestId);
    if(!Number.isInteger(id)||id<1) throw fail(400,'Choose the production day this kernel was returned from.');
    const production=(await client.query(`SELECT w.request_id,p.kernel_used,to_char(${KERNEL_DATE},'YYYY-MM-DD') AS kernel_date FROM weighing_requests w
        JOIN production p ON p.production_id=w.completed_record_id
        WHERE w.request_id=$1 AND w.request_type='Production' AND w.status<>'Cancelled' FOR UPDATE OF w`,[id])).rows[0];
    if(!production) throw fail(400,'Choose a production day that has kernel issued to it.');
    const others=Number((await client.query(`SELECT COALESCE(SUM(received),0) AS total FROM stock_counts
        WHERE return_request_id=$1 AND ($2::integer IS NULL OR count_id<>$2)`,[id,countId])).rows[0].total);
    if(Number(received)>Number(production.kernel_used)-others+0.0001)
        throw fail(400,'More kernel is being returned than was issued to that production day ('+
            Math.max(Number(production.kernel_used)-others,0).toLocaleString('en-NG')+' kg can still be returned).');
    return {requestId:id,date:production.kernel_date};
}

// Recalculates the kernel returned to one production day and, if the day is finished, its production loss.
async function refreshKernelReturns(client,requestId) {
    if(!requestId) return;
    await client.query(`UPDATE production p SET kernel_returned=r.total,
            process_loss=CASE WHEN w.status='Completed'
                THEN GREATEST(ROUND(p.kernel_used-r.total-p.pko_produced-p.pkc_produced-p.sludge_produced,2),0) ELSE p.process_loss END
        FROM weighing_requests w
        CROSS JOIN LATERAL (SELECT COALESCE(SUM(received),0) AS total FROM stock_counts WHERE return_request_id=w.request_id) r
        WHERE w.request_id=$1 AND p.production_id=w.completed_record_id`,[requestId]);
}

module.exports={checkKernelReturn,refreshKernelReturns,KERNEL_DATE};
