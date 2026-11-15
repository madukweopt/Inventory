const {lockStock,stockFloor,protectStock}=require('./stock-safety');
// Keep corrections to a business record and its generated movements atomic.
const records={
    purchases:{ table:'purchases',id:'purchase_id',type:'Purchase',date:'purchase_date',quantity:'quantity_supplied',party:'supplier_id',price:'unit_cost',part:'Received' },
    sales:{ table:'sales',id:'sales_id',type:'Sale',date:'sales_date',quantity:'quantity',party:'customer_id',price:'unit_price',part:'Issued' },
    production:{ table:'production',id:'production_id',type:'Production',date:'production_date' }
};
function fail(status,message) { throw Object.assign(new Error(message),{ status }); }
function quantity(value) {
    if(!/^\d+(?:\.\d{1,2})?$/.test(String(value??''))) fail(400,'Quantities and prices must be non-negative numbers with no more than two decimal places');
    const number=Number(value);
    if(!Number.isFinite(number)) fail(400,'Invalid quantity or price');
    return number;
}
async function correctRecord(pool,kind,record,operation) {
    const config=records[kind];
    const id=Number(record?.[config.id]);
    if(!Number.isInteger(id)||id<1) fail(400,'Invalid record');
    const client=await pool.connect();
    try {
        await client.query('BEGIN');
        await lockStock(client);
        const before=await stockFloor(client);
        const links=await client.query(`SELECT * FROM weighing_requests
            WHERE request_type=$1 AND completed_record_id=$2 ORDER BY request_id FOR UPDATE`,[config.type,id]);
        const found=await client.query(`SELECT *,to_char(${config.date},'YYYY-MM-DD') AS correction_date FROM ${config.table} WHERE ${config.id}=$1 FOR UPDATE`,[id]);
        if(!found.rows.length) fail(404,'Record was not found');
        const original=found.rows[0];
        const requestIds=links.rows.map(row => row.request_id);
        let paid='0';
        if(kind==='sales') {
            paid=(await client.query('SELECT COALESCE(SUM(amount),0) AS paid FROM sale_payments WHERE sales_id=$1',[id])).rows[0].paid;
        }
        if(!requestIds.length) {
            // Older data has no reliable row-level stock link; never guess by date alone.
            const inventory=await client.query(kind==='production'?
                `SELECT 1 FROM stock_counts sc JOIN items i ON i.item_id=sc.item_id
                 WHERE sc.count_date=$1::date AND LOWER(i.name) IN ('p kernel','pko','pkc','sludge') LIMIT 1`:
                'SELECT 1 FROM stock_counts WHERE count_date=$1::date AND item_id=$2 LIMIT 1',
                kind==='production'?[original.correction_date]:[original.correction_date,original.item_id]);
            if(inventory.rowCount) fail(409,'This legacy record has no authorisation link to its inventory. Reconcile and link the original stock movements before editing or deleting it.');
        }
        let result;
        if(operation==='delete') {
            if(kind==='sales'&&Number(paid)>0) fail(409,'This sale has recorded payments. Resolve its payments before deleting the sale; receipts cannot be silently deleted.');
            result=await client.query(`DELETE FROM ${config.table} WHERE ${config.id}=$1 RETURNING *`,[id]);
            await client.query('DELETE FROM stock_counts WHERE source_type=$1 AND source_id=ANY($2::integer[])',[config.type,requestIds]);
            await client.query("UPDATE weighing_requests SET status='Cancelled' WHERE request_id=ANY($1::integer[])",[requestIds]);
        } else if(kind==='production') {
            const quantities=['kernel_used','pko_produced','pkc_produced','sludge_produced'].map(key => quantity(record[key]??0));
            const existingDate=original.correction_date;
            // Batch quantities are the audit trail; never overwrite the daily aggregate independently.
            if(requestIds.length&&(record.production_date!==existingDate||
                ['kernel_used','pko_produced','pkc_produced','sludge_produced'].some((key,index) => Number(original[key])!==quantities[index]))) {
                fail(409,'Production with weighed batches cannot have its date or totals overwritten. A batch correction workflow is required to change weighed quantities.');
            }
            result=await client.query(`UPDATE production SET production_date=$1,kernel_used=$2,pko_produced=$3,
                pkc_produced=$4,sludge_produced=$5,production_hours=$6::interval,down_time=$7::interval
                WHERE production_id=$8 RETURNING *`,[record.production_date,...quantities,record.production_hours,record.down_time,id]);
            await client.query(`UPDATE weighing_requests SET production_hours=$1::interval,down_time=$2::interval
                WHERE request_id=ANY($3::integer[])`,[record.production_hours,record.down_time,requestIds]);
        } else {
            const amount=quantity(record[config.quantity]);
            const price=quantity(record[config.price]);
            if(amount<=0) fail(400,'Quantity must be greater than zero');
            if(!/^\d{4}-\d{2}-\d{2}$/.test(record[config.date]||'')) fail(400,'Enter a valid record date');
            if(kind==='sales'&&Number(paid)>0) {
                if(Number(record.customer_id)!==original.customer_id) fail(409,'A sale with recorded payments cannot be moved to another customer');
                const tooSmall=await client.query('SELECT $1::numeric*$2::numeric < $3::numeric AS invalid',[amount,price,paid]);
                if(tooSmall.rows[0].invalid) fail(409,'Sale total cannot be less than its recorded payments');
            }
            result=await client.query(`UPDATE ${config.table} SET ${config.date}=$1,${config.party}=$2,
                item_id=$3,${config.quantity}=$4,${config.price}=$5
                ${kind==='sales'?',due_date=CASE WHEN due_date=sales_date THEN $1::date ELSE due_date END':''}
                WHERE ${config.id}=$6 RETURNING *`,
                [record[config.date],record[config.party],record.item_id,amount,price,id]);
            await client.query(`UPDATE weighing_requests SET request_date=$1,${config.party}=$2,
                item_id=$3,quantity=$4,${config.price}=$5 WHERE request_id=ANY($6::integer[])`,
                [record[config.date],record[config.party],record.item_id,amount,price,requestIds]);
            if(kind==='sales'&&(Number(record.customer_id)!==original.customer_id||Number(record.item_id)!==original.item_id)) {
                const party=await client.query('SELECT name,phone_number,email,address FROM customers WHERE customer_id=$1',[record.customer_id]);
                const item=await client.query('SELECT name FROM items WHERE item_id=$1',[record.item_id]);
                const c=party.rows[0];
                await client.query(`UPDATE sales SET invoice_snapshot=COALESCE(invoice_snapshot,'{}'::jsonb)||$1::jsonb WHERE sales_id=$2`,
                    [JSON.stringify({...Number(record.customer_id)!==original.customer_id?{customer:c.name,customer_phone:c.phone_number,customer_email:c.email,customer_address:c.address}:{},
                        ...Number(record.item_id)!==original.item_id?{item:item.rows[0].name}:{}}),id]);
            }
            // Upsert also restores a generated movement removed by the old stock-delete endpoint.
            for(const requestId of requestIds) {
                await client.query(`INSERT INTO stock_counts
                    (count_date,item_id,received,issued,source_type,source_id,source_part,recorded_by)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                    ON CONFLICT (source_type,source_id,source_part) WHERE source_id IS NOT NULL
                    DO UPDATE SET count_date=EXCLUDED.count_date,item_id=EXCLUDED.item_id,
                    received=EXCLUDED.received,issued=EXCLUDED.issued`,
                    [record[config.date],record.item_id,kind==='purchases'?amount:0,kind==='sales'?amount:0,
                        config.type,requestId,config.part,links.rows.find(row => row.request_id===requestId).completed_by]);
            }
        }
        await protectStock(client,before);
        await client.query('COMMIT');
        return result.rows[0];
    } catch(error) {
        await client.query('ROLLBACK');
        throw error;
    } finally { client.release(); }
}
module.exports={ correctRecord };
async function correctManualStock(pool,record,operation) {
    const client=await pool.connect();
    try {
        await client.query('BEGIN');await lockStock(client);
        const before=await stockFloor(client);
        const current=(await client.query('SELECT * FROM stock_counts WHERE count_id=$1 FOR UPDATE',[record?.count_id])).rows[0];
        if(!current) fail(404,'Stock record not found');
        if(current.source_type!=='Manual'||current.source_id!=null) fail(operation==='delete'?404:409,'Generated inventory must be corrected through its source business record');
        let result;
        if(operation==='delete')result=await client.query('DELETE FROM stock_counts WHERE count_id=$1 RETURNING *',[record.count_id]);
        else {
            const received=quantity(record.received),issued=quantity(record.issued);
            if(received===0&&issued===0)fail(400,'Enter a received or issued quantity');
            result=await client.query('UPDATE stock_counts SET count_date=$1,item_id=$2,received=$3,issued=$4 WHERE count_id=$5 RETURNING *',
                [record.count_date,record.item_id,received,issued,record.count_id]);
        }
        await protectStock(client,before);
        await client.query('COMMIT');return result.rows[0];
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
module.exports.correctManualStock=correctManualStock;
