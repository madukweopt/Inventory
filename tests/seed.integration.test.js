const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');const path=require('path');const crypto=require('crypto');const os=require('os');
const {Pool}=require('pg');const request=require('supertest');
require('dotenv').config({quiet:true});
const {seedDatabase,buildPlan,datesBetween,backupApplicationData,restoreApplicationData}=require('../backend/seed');
const schemaName='inventory_seed_test_'+crypto.randomBytes(6).toString('hex');
let adminPool,pool,server;
function urlForSchema(value,schema){const url=new URL(value);url.hostname=url.hostname.replace('-pooler','');if(schema)url.searchParams.set('options','-c search_path='+schema);return url.toString();}
test.before(async()=>{
    const database=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;assert.ok(database);
    adminPool=new Pool({connectionString:urlForSchema(database),ssl:{rejectUnauthorized:true}});
    await adminPool.query('CREATE SCHEMA "'+schemaName+'"');
    pool=new Pool({connectionString:urlForSchema(database,schemaName),ssl:{rejectUnauthorized:true}});
    await pool.query(fs.readFileSync(path.join(__dirname,'../database/schema.sql'),'utf8'));
    process.env.NODE_ENV='test';process.env.SESSION_SECRET='isolated-seed-test-session-secret';process.env.DATABASE_URL=urlForSchema(database,schemaName);
    server=require('../backend/server');
});
test.after(async()=>{
    if(server)await server.pool.end();if(pool)await pool.end();
    if(adminPool){await adminPool.query('DROP SCHEMA IF EXISTS "'+schemaName+'" CASCADE');await adminPool.end();}
});
test('Seed dates and plan are deterministic and cover every day requested',()=>{
    assert.equal(datesBetween('2026-06-01','2026-11-18').length,171);
    assert.throws(()=>datesBetween('2026-02-30','2026-11-18'));
    const users=['admin','manager','storekeeper'].map((role,i)=>({user_id:i+1,username:role,password_hash:'not-used',role}));
    const first=buildPlan({users}),second=buildPlan({users});
    assert.deepEqual(first.data,second.data);assert.equal(first.data.production.length,171);
    assert.equal(first.costs.work_in_progress.quantity,200);
    assert.equal(first.costs.work_in_progress.unmatched_output_quantity,0);
    for(const balance of Object.values(first.ending_stock))assert.ok(balance>=0);
});
test('Reset seed populates linked authorisations, single-product weighings, invoices, receipts and payroll',async()=>{
    await assert.rejects(seedDatabase(pool),/Explicit reset/);
    const seeded=await seedDatabase(pool,{reset:true});
    assert.equal(seeded.days,171);assert.equal(seeded.counts.production,171);assert.equal(seeded.counts.session,0);
    assert.equal(seeded.credentials.length,3);assert.ok(seeded.counts.sales>500);assert.ok(seeded.counts.sale_payments>500);
    const admin=request.agent(server.app),manager=request.agent(server.app),keeper=request.agent(server.app);
    for(const [role,agent] of [['admin',admin],['manager',manager],['storekeeper',keeper]]){
        const login=seeded.credentials.find(row=>row.role===role);
        await agent.post('/api/login').send({username:login.username,password:login.password}).expect(200);
    }
    const checks=await admin.get('/api/checks');assert.equal(checks.status,200,checks.text);assert.equal(checks.body.length,0);
    const costs=(await admin.get('/api/average_cost').expect(200)).body;
    assert.equal(costs.work_in_progress.quantity,200);assert.equal(costs.work_in_progress.unmatched_output_quantity,0);assert.equal(costs.work_in_progress.unpriced_materials,false);
    const sales=(await admin.get('/api/sales').expect(200)).body;
    assert.ok(sales.some(s=>s.payment_status==='Paid'));assert.ok(sales.some(s=>s.payment_status==='Partly Paid'));assert.ok(sales.some(s=>Number(s.amount_paid)===0));
    const paid=sales.find(s=>Number(s.amount_paid)>0);
    const invoice=(await keeper.get('/api/sales/'+paid.sales_id+'/invoice').expect(200)).body;
    assert.match(invoice.sale.invoice_number,/^INV-2026-\d{6}$/);assert.equal(invoice.company.company_name,'Demo Palm Products Ltd');
    assert.ok(invoice.payments.length>0);assert.ok(invoice.payments.every(p=>/^RCT-2026-\d{6}$/.test(p.receipt_number)));
    const pending=(await keeper.get('/api/weighing-requests').expect(200)).body;
    assert.ok(pending.some(w=>w.request_type==='Purchase'));assert.ok(pending.some(w=>w.request_type==='Sale'));
    const production=pending.find(w=>w.request_type==='Production');assert.equal(production.request_date,'2026-11-18');
    assert.ok(production.batches.some(b=>Number(b.kernel_used)>0));assert.ok(production.batches.some(b=>Number(b.pko_produced)>0));
    const completed=(await admin.get('/api/weighing-requests?include_completed=true').expect(200)).body;
    const finished=completed.find(w=>w.request_type==='Production'&&w.status==='Completed');assert.ok(finished);
    await manager.patch('/api/weighing-requests/'+finished.request_id+'/reopen').expect(403);
    await admin.patch('/api/weighing-requests/'+finished.request_id+'/reopen').expect(200);
    await keeper.patch('/api/weighing-requests/'+finished.request_id+'/finish').expect(200);
    // Cancellation ownership is enforced by the API regardless of which list exposed it.
    const own=(await manager.get('/api/weighing-requests').expect(200)).body.find(w=>w.request_type==='Purchase'&&w.can_cancel);
    assert.ok(own);await manager.patch('/api/weighing-requests/'+own.request_id+'/cancel').expect(200);
    const profits=(await admin.get('/api/dashboard_period?date=2026-11-15').expect(200)).body;
    assert.ok(profits.day.total_net_profit>0);
    for(const value of Object.values(profits.day.period_gross_profit))assert.ok(value>0);
    const payroll=(await admin.get('/api/payroll?month=2026-11').expect(200)).body;
    assert.equal(payroll.length,6);assert.ok(payroll.every(row=>row.payment_status==='Pending'));
    const history=(await admin.get('/api/employees/1/salary-history').expect(200)).body;assert.equal(history.length,2);
    const nextSale=await manager.post('/api/sales').send({sales_date:'2026-11-18',customer_id:1,item_id:2,authorisation_key:crypto.randomUUID()}).expect(201);
    assert.ok(nextSale.body.request_id>seeded.counts.weighing_requests);
    const newSale=await keeper.patch('/api/weighing-requests/'+nextSale.body.request_id+'/complete').send({quantity:10,scale_ticket:'NEW-SEED-TEST-TICKET'}).expect(200);
    assert.ok(newSale.body.record_id>seeded.counts.sales);
    const newPayment=await manager.post('/api/sales/'+newSale.body.record_id+'/payments').send({payment_date:'2026-11-18',amount:5000,payment_method:'Cash'}).expect(201);
    assert.ok(newPayment.body.payment_id>seeded.counts.sale_payments);
    assert.match(newPayment.body.receipt_number,/^RCT-2026-\d{6}$/);
    const newInvoice=(await keeper.get('/api/sales/'+newSale.body.record_id+'/invoice').expect(200)).body;
    assert.match(newInvoice.sale.invoice_number,/^INV-2026-\d{6}$/);
    assert.equal(Number(newInvoice.sale.amount_paid),5000);

    const usersBefore=(await pool.query('SELECT user_id,username,password_hash,role FROM users ORDER BY user_id')).rows;
    const again=await seedDatabase(pool,{reset:true});assert.equal(again.credentials.length,0);assert.equal(again.accounts_preserved,3);
    const usersAfter=(await pool.query('SELECT user_id,username,password_hash,role FROM users ORDER BY user_id')).rows;
    assert.deepEqual(usersAfter,usersBefore);assert.equal(again.counts.sales,seeded.counts.sales);
    const backupDir=fs.mkdtempSync(path.join(os.tmpdir(),'seed-backup-test-'));
    try{
        const backupFile=path.join(backupDir,'application-data.json');await backupApplicationData(pool,backupFile);
        await pool.query("UPDATE company_details SET company_name='Changed after backup' WHERE company_id=1");
        const restored=await restoreApplicationData(pool,backupFile);assert.equal(restored.sales,seeded.counts.sales);
        assert.equal((await pool.query('SELECT company_name FROM company_details WHERE company_id=1')).rows[0].company_name,'Demo Palm Products Ltd');
        assert.deepEqual((await pool.query('SELECT user_id,username,password_hash,role FROM users ORDER BY user_id')).rows,usersBefore);
        const corrupted=JSON.parse(fs.readFileSync(backupFile,'utf8'));corrupted.checksum='incorrect';fs.writeFileSync(path.join(backupDir,'bad.json'),JSON.stringify(corrupted));
        await assert.rejects(restoreApplicationData(pool,path.join(backupDir,'bad.json')),/integrity/);
    }finally{fs.rmSync(backupDir,{recursive:true,force:true});}

});
