async function snapshotInvoice(client,saleId) {
    await client.query(`UPDATE sales s SET invoice_snapshot=jsonb_build_object('customer',c.name,'customer_phone',c.phone_number,
        'customer_email',c.email,'customer_address',c.address,'item',i.name,
        'company',COALESCE((SELECT to_jsonb(cd) FROM company_details cd WHERE company_id=1),'{}'::jsonb))
        FROM customers c,items i WHERE c.customer_id=s.customer_id AND i.item_id=s.item_id AND s.sales_id=$1`,[saleId]);
}
async function preparePayroll(pool,month) {
    const client=await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(91001)');
        const result=await client.query(`INSERT INTO payroll(employee_id,payroll_month,basic_salary,bonus,deduction,total_salary_cost)
            SELECT e.employee_id,$1::date,expected_payroll_salary(e.employee_id,$1::date),0,0,expected_payroll_salary(e.employee_id,$1::date)
            FROM employees e WHERE e.start_date<($1::date+INTERVAL '1 month') AND (e.salary IS NOT NULL OR EXISTS(SELECT 1 FROM salary_history h WHERE h.employee_id=e.employee_id AND h.effective_date<$1::date+INTERVAL '1 month'))
            ON CONFLICT(employee_id,payroll_month) DO UPDATE SET
            basic_salary=CASE WHEN payroll.payment_status='Paid' THEN payroll.basic_salary ELSE EXCLUDED.basic_salary END,
            total_salary_cost=CASE WHEN payroll.payment_status='Paid' THEN payroll.total_salary_cost
                ELSE GREATEST(EXCLUDED.basic_salary+payroll.bonus-payroll.deduction,0) END,
            needs_review=CASE WHEN payroll.payment_status='Paid' THEN payroll.basic_salary<>EXCLUDED.basic_salary ELSE false END
            RETURNING payroll_id,needs_review`,[month+'-01']);
        const missing=await client.query("SELECT COUNT(*)::int AS total FROM employees WHERE salary IS NULL AND start_date<($1::date+INTERVAL '1 month')",[month+'-01']);
        await client.query('COMMIT');
        return {prepared:result.rowCount,created:result.rowCount,missing_salary:missing.rows[0].total,
            message:'Unpaid payroll recalculated. Paid payroll preserved.'+(result.rows.some(row=>row.needs_review)?' Paid records affected by changes need an adjustment review.':'')};
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
async function markPayrollReview(client,employeeId,date) {
    await client.query("UPDATE payroll SET needs_review=true WHERE employee_id=$1 AND payroll_month+INTERVAL '1 month'>$2::date",[employeeId,date]);
}
module.exports={snapshotInvoice,preparePayroll,markPayrollReview};
async function authorise(pool,type,payload,userId,sql,args) {
    const key=payload.authorisation_key;
    if(key&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) throw Object.assign(new Error('Invalid authorisation reference'),{status:400});
    const canonical=Object.fromEntries(Object.entries(payload).filter(([k])=>k!=='authorisation_key').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,String(v)]));
    const client=await pool.connect();
    try {
        await client.query('BEGIN');
        if(key) {
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
            const existing=await client.query('SELECT * FROM weighing_requests WHERE authorisation_key=$1',[key]);
            if(existing.rowCount) {
                const saved=existing.rows[0];
                if(saved.created_by!==userId||saved.request_type!==type||JSON.stringify(Object.entries(saved.authorisation_payload).sort())!==JSON.stringify(Object.entries(canonical).sort())) {
                    throw Object.assign(new Error('This authorisation reference was already used with different details'),{status:409});
                }
                if(saved.status==='Cancelled') throw Object.assign(new Error('This authorisation has been cancelled. Start a new entry.'),{status:409});
                await client.query('COMMIT');return {rows:[saved]};
            }
        }
        const inserted=await client.query(sql,args);
        if(key) await client.query('UPDATE weighing_requests SET authorisation_key=$1,authorisation_payload=$2 WHERE request_id=$3',[key,canonical,inserted.rows[0].request_id]);
        await client.query('COMMIT');
        return inserted;
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
module.exports.authorise=authorise;
async function historicalBatch(client,request,userId) {
    if(request.request_type!=='Production') return;
    if((await client.query('SELECT 1 FROM production_batches WHERE request_id=$1',[request.request_id])).rowCount)return;
    const record=(await client.query('SELECT * FROM production WHERE production_id=$1',[request.completed_record_id])).rows[0];
    if(!record||!['kernel_used','pko_produced','pkc_produced','sludge_produced'].some(key=>Number(record[key])>0))return;
    await client.query(`INSERT INTO production_batches(request_id,submission_key,kernel_used,pko_produced,pkc_produced,
        sludge_produced,scale_ticket,recorded_by,created_at,legacy_batch)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true)`,[request.request_id,require('crypto').randomUUID(),record.kernel_used,record.pko_produced,
        record.pkc_produced,record.sludge_produced,request.scale_ticket||null,request.completed_by||userId,record.created_at]);
}
async function reopenProduction(pool,id,userId) {
    const {lockStock}=require('./stock-safety');
    const client=await pool.connect();
    try {
        await client.query('BEGIN');await lockStock(client);
        const request=(await client.query("SELECT * FROM weighing_requests WHERE request_id=$1 AND request_type='Production' AND status='Completed' FOR UPDATE",[id])).rows[0];
        if(!request||!(await client.query('SELECT 1 FROM production WHERE production_id=$1',[request.completed_record_id])).rowCount)
            throw Object.assign(new Error('Only a finished production authorisation can be reopened'),{status:409});
        await historicalBatch(client,request,userId);
        await client.query("UPDATE weighing_requests SET status='Awaiting Storekeeper',completed_at=NULL WHERE request_id=$1",[id]);
        await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
module.exports.historicalBatch=historicalBatch;
module.exports.reopenProduction=reopenProduction;
