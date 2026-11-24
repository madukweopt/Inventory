// Read-only audit: prints counts and internal IDs, never customer details or credentials.
require('dotenv').config({ quiet:true });
const {Pool}=require('pg');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:require('../backend/database-ssl').databaseSsl()});
const checks={
    orphan_authorisations:`SELECT wr.request_id,wr.request_type,wr.status FROM weighing_requests wr
        WHERE wr.status<>'Cancelled' AND wr.completed_record_id IS NOT NULL AND (
            (wr.request_type='Purchase' AND NOT EXISTS (SELECT 1 FROM purchases p WHERE p.purchase_id=wr.completed_record_id)) OR
            (wr.request_type='Sale' AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.sales_id=wr.completed_record_id)) OR
            (wr.request_type='Production' AND NOT EXISTS (SELECT 1 FROM production p WHERE p.production_id=wr.completed_record_id)))`,
    orphan_stock:`SELECT sc.count_id,sc.source_type,sc.source_id FROM stock_counts sc
        LEFT JOIN weighing_requests wr ON wr.request_id=sc.source_id AND wr.request_type=sc.source_type
        WHERE sc.source_type IN ('Purchase','Sale','Production') AND (wr.request_id IS NULL OR wr.status='Cancelled' OR
            (wr.request_type='Purchase' AND NOT EXISTS(SELECT 1 FROM purchases p WHERE p.purchase_id=wr.completed_record_id)) OR
            (wr.request_type='Sale' AND NOT EXISTS(SELECT 1 FROM sales s WHERE s.sales_id=wr.completed_record_id)) OR
            (wr.request_type='Production' AND NOT EXISTS(SELECT 1 FROM production p WHERE p.production_id=wr.completed_record_id)))`,
    // Each purchase or sale is compared with its own stock entry and authorisation. Delivery after the authorisation
    // date is normal and not reported; delivery before it is, unless the correction recorded why. A sale price that differs from its authorisation is
    // reported only when no saved sale correction explains it. Each row says what is wrong.
    purchase_stock_mismatch:`SELECT * FROM (SELECT wr.request_id,p.purchase_id,CASE
            WHEN sc.count_id IS NULL THEN 'No stock entry for this purchase'
            WHEN sc.received<>p.quantity_supplied OR sc.issued<>0 THEN 'Stock received differs from the purchase quantity'
            WHEN sc.item_id<>p.item_id THEN 'Stock entry is for a different item'
            WHEN sc.count_date<>p.purchase_date THEN 'Stock entry is dated differently from the delivery'
            WHEN wr.quantity IS DISTINCT FROM p.quantity_supplied THEN 'Weighed quantity differs from the purchase quantity'
            WHEN wr.item_id IS DISTINCT FROM p.item_id OR wr.supplier_id IS DISTINCT FROM p.supplier_id THEN 'Item or supplier differs from the authorisation'
            WHEN p.purchase_date<wr.request_date AND wr.early_movement_reason IS NULL THEN 'Delivered before it was authorised, with no reason recorded'
            WHEN wr.unit_cost IS DISTINCT FROM p.unit_cost THEN 'Price differs from the authorisation'
        END AS problem
        FROM weighing_requests wr JOIN purchases p ON p.purchase_id=wr.completed_record_id
        LEFT JOIN stock_counts sc ON sc.source_type='Purchase' AND sc.source_id=wr.request_id AND sc.source_part='Received'
        WHERE wr.request_type='Purchase' AND wr.status='Completed') checked WHERE problem IS NOT NULL`,
    sale_stock_mismatch:`SELECT * FROM (SELECT wr.request_id,s.sales_id,CASE
            WHEN sc.count_id IS NULL THEN 'No stock entry for this sale'
            WHEN sc.issued<>COALESCE(s.factory_quantity,s.quantity) OR sc.received<>0 THEN 'Stock issued differs from the quantity dispatched'
            WHEN sc.item_id<>s.item_id THEN 'Stock entry is for a different item'
            WHEN sc.count_date<>s.sales_date THEN 'Stock entry is dated differently from the dispatch'
            WHEN wr.quantity IS DISTINCT FROM COALESCE(s.factory_quantity,s.quantity) THEN 'Weighed quantity differs from the quantity dispatched'
            WHEN wr.item_id IS DISTINCT FROM s.item_id OR wr.customer_id IS DISTINCT FROM s.customer_id THEN 'Item or customer differs from the authorisation'
            WHEN s.sales_date<wr.request_date AND wr.early_movement_reason IS NULL THEN 'Dispatched before it was authorised, with no reason recorded'
            WHEN wr.unit_price IS DISTINCT FROM s.unit_price AND NOT EXISTS(SELECT 1 FROM sale_corrections c
                WHERE c.sales_id=s.sales_id AND (c.new_values->>'unit_price')::numeric=s.unit_price) THEN 'Price differs from the authorisation with no saved correction'
        END AS problem
        FROM weighing_requests wr JOIN sales s ON s.sales_id=wr.completed_record_id
        LEFT JOIN stock_counts sc ON sc.source_type='Sale' AND sc.source_id=wr.request_id AND sc.source_part='Issued'
        WHERE wr.request_type='Sale' AND wr.status='Completed') checked WHERE problem IS NOT NULL`,
    production_batch_mismatch:`SELECT wr.request_id,p.production_id FROM weighing_requests wr JOIN production p ON p.production_id=wr.completed_record_id
        JOIN (SELECT request_id,SUM(kernel_used) AS kernel,SUM(pko_produced) AS pko,SUM(pkc_produced) AS pkc,SUM(sludge_produced) AS sludge
            FROM production_batches WHERE NOT voided GROUP BY request_id) b ON b.request_id=wr.request_id
        WHERE wr.request_type='Production' AND wr.status<>'Cancelled' AND
        (p.kernel_used<>b.kernel OR p.pko_produced<>b.pko OR p.pkc_produced<>b.pkc OR p.sludge_produced<>b.sludge OR wr.request_date<>p.production_date)`,
    overpaid_sales:`SELECT s.sales_id FROM sales s JOIN sale_payments p ON p.sales_id=s.sales_id AND p.reversed_at IS NULL GROUP BY s.sales_id HAVING SUM(p.amount)>round(s.quantity*s.unit_price,2)`,
    unlinked_business_records:`SELECT 'Purchase' AS type,p.purchase_id AS id FROM purchases p WHERE NOT EXISTS(SELECT 1 FROM weighing_requests wr WHERE wr.request_type='Purchase' AND wr.completed_record_id=p.purchase_id)
        UNION ALL SELECT 'Sale',s.sales_id FROM sales s WHERE NOT EXISTS(SELECT 1 FROM weighing_requests wr WHERE wr.request_type='Sale' AND wr.completed_record_id=s.sales_id)
        UNION ALL SELECT 'Production',p.production_id FROM production p WHERE NOT EXISTS(SELECT 1 FROM weighing_requests wr WHERE wr.request_type='Production' AND wr.completed_record_id=p.production_id)`
};
(async()=>{
    const client=await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        for(const [name,sql] of Object.entries(checks)) {
            const result=await client.query(sql);
            console.log(JSON.stringify({check:name,count:result.rowCount,records:result.rows.slice(0,20),truncated:result.rowCount>20}));
        }
        await client.query('COMMIT');
    } catch(error) {
        await client.query('ROLLBACK');
        console.error('Dependency audit failed:',error.code,error.message);
        process.exitCode=1;
    } finally {client.release();await pool.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
