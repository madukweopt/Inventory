// Only repair explicit authorisation links whose source record has already gone.
// Without --apply this prints the proposed counts and changes nothing.
require('dotenv').config({quiet:true});
const fs=require('fs');
const os=require('os');
const path=require('path');
const {Pool}=require('pg');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true}});
(async()=>{
    const client=await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const requests=await client.query(`SELECT wr.* FROM weighing_requests wr WHERE completed_record_id IS NOT NULL AND (
            (request_type='Purchase' AND NOT EXISTS(SELECT 1 FROM purchases p WHERE p.purchase_id=wr.completed_record_id)) OR
            (request_type='Sale' AND NOT EXISTS(SELECT 1 FROM sales s WHERE s.sales_id=wr.completed_record_id)) OR
            (request_type='Production' AND NOT EXISTS(SELECT 1 FROM production p WHERE p.production_id=wr.completed_record_id)))
            ORDER BY request_id FOR UPDATE`);
        const ids=requests.rows.map(row=>row.request_id);
        const stock=await client.query(`SELECT sc.* FROM stock_counts sc JOIN weighing_requests wr
            ON wr.request_id=sc.source_id AND wr.request_type=sc.source_type
            WHERE wr.request_id=ANY($1::integer[]) FOR UPDATE OF sc`,[ids]);
        const active=requests.rows.filter(row=>row.status!=='Cancelled');
        if(!process.argv.includes('--apply')) {
            console.log(JSON.stringify({dry_run:true,authorisations:active.length,stock_entries:stock.rowCount}));
            await client.query('ROLLBACK');
        } else if(active.length||stock.rowCount) {
            const snapshot=path.join(os.tmpdir(),'inventory-orphan-repair-'+Date.now()+'.json');
            fs.writeFileSync(snapshot,JSON.stringify({created_at:new Date().toISOString(),authorisations:requests.rows,stock:stock.rows},null,2),{mode:0o600,flag:'wx'});
            await client.query("UPDATE weighing_requests SET status='Cancelled' WHERE request_id=ANY($1::integer[])",[ids]);
            await client.query('DELETE FROM stock_counts WHERE count_id=ANY($1::integer[])',[stock.rows.map(row=>row.count_id)]);
            await client.query('COMMIT');
            console.log(JSON.stringify({applied:true,authorisations:active.length,stock_entries:stock.rowCount,snapshot}));
        } else {
            await client.query('COMMIT');
            console.log(JSON.stringify({applied:true,authorisations:0,stock_entries:0}));
        }
    } catch(error) {
        await client.query('ROLLBACK');
        console.error('Repair failed:',error.code,error.message);
        process.exitCode=1;
    } finally { client.release();await pool.end(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
