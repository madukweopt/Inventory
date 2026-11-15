const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const { Pool }=require('pg');
const argon2=require('argon2');
const request=require('supertest');

const projectRoot=path.join(__dirname,'..');
require('dotenv').config({ path: path.join(projectRoot,'.env') });
const schemaName='inventory_test_'+crypto.randomBytes(6).toString('hex');
const baseDatabaseUrl=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;

function unpooledDatabaseUrl(databaseUrl) {
	const url=new URL(databaseUrl);
	url.hostname=url.hostname.replace('-pooler','');
	return url.toString();
}

function databaseUrlForSchema(databaseUrl,schema) {
	const url=new URL(databaseUrl);
	url.searchParams.set('options','-c search_path='+schema);
	return url.toString();
}

let administrationPool;
let applicationPool;
let app;
let admin;
let manager;
let storekeeper;
let ids={};

async function login(agent,username,password) {
	const response=await agent.post('/api/login').send({ username,password });
	assert.equal(response.status,200,response.text);
	return response.body;
}

test.before(async function() {
	assert.ok(baseDatabaseUrl,'Set TEST_DATABASE_URL or DATABASE_URL before running tests');
	const isolatedDatabaseUrl=unpooledDatabaseUrl(baseDatabaseUrl);
	administrationPool=new Pool({ connectionString: isolatedDatabaseUrl,ssl: { rejectUnauthorized: true } });
	await administrationPool.query('CREATE SCHEMA "'+schemaName+'"');
	const setupClient=await administrationPool.connect();
	try {
		await setupClient.query('SET search_path TO "'+schemaName+'"');
		const schemaSql=fs.readFileSync(path.join(projectRoot,'database','schema.sql'),'utf8');
		await setupClient.query(schemaSql);
		await setupClient.query(`INSERT INTO items (name,item_type) VALUES
			('P Kernel','raw_material'),('PKO','product'),('PKC','product'),
			('Diesel','consumable'),('Electricity','consumable') ON CONFLICT (name) DO NOTHING`);
		await setupClient.query(`INSERT INTO company_details
			(company_id,company_name,phone_number,email,business_address)
			VALUES (1,'Test Oil Company','08000000000','test@example.com','Test Factory')`);
		const passwords={ admin: 'AdminPass123',manager: 'ManagerPass123',storekeeper: 'StorePass123' };
		for(const [role,password] of Object.entries(passwords)) {
			const username=role+'_test';
			const passwordHash=await argon2.hash(password);
			const result=await setupClient.query(
				'INSERT INTO users (username,password_hash,role) VALUES ($1,$2,$3) RETURNING user_id',
				[username,passwordHash,role]
			);
			ids[role+'User']=result.rows[0].user_id;
		}
	} finally {
		setupClient.release();
	}

	process.env.NODE_ENV='test';
	process.env.SESSION_SECRET='test-session-secret-not-for-production';
	process.env.DATABASE_URL=databaseUrlForSchema(isolatedDatabaseUrl,schemaName);
	const server=require('../backend/server');
	app=server.app;
	applicationPool=server.pool;
	admin=request.agent(app);
	manager=request.agent(app);
	storekeeper=request.agent(app);
});

test.after(async function() {
	if(applicationPool) await applicationPool.end();
	if(administrationPool) {
		await administrationPool.query('DROP SCHEMA IF EXISTS "'+schemaName+'" CASCADE');
		await administrationPool.end();
	}
});

test('authentication protects private pages and APIs',async function() {
	await request(app).get('/login.html').expect(200);
	await request(app).get('/forms.html').expect(302).expect('Location','/');
	await request(app).get('/api/items').expect(401);
	const invalidLogin=await request(app).post('/api/login').send({ username: 'admin_test',password: 'wrong' });
	assert.equal(invalidLogin.status,400,invalidLogin.text);
	assert.equal((await login(admin,'admin_test','AdminPass123')).role,'admin');
	assert.equal((await login(manager,'manager_test','ManagerPass123')).role,'manager');
	assert.equal((await login(storekeeper,'storekeeper_test','StorePass123')).role,'storekeeper');
	await admin.get('/forms.html').expect(200);
	await manager.get('/checks.html').expect(302).expect('Location','/index.html');
	await admin.get('/checks.html').expect(200);
});

test('role permissions match the Admin, Manager and Storekeeper rules',async function() {
	await admin.get('/api/users').expect(200);
	await manager.get('/api/users').expect(403);
	await storekeeper.get('/api/employees').expect(403);
	await manager.get('/api/employees').expect(200);
	await manager.get('/api/payroll?month=2026-11').expect(403);
	await storekeeper.post('/api/sales').send({}).expect(403);
	await manager.post('/api/stock_counts').send({}).expect(403);
	await storekeeper.post('/api/stock_counts').send({}).expect(403);
	await storekeeper.get('/api/company').expect(200);
});

test('customers, suppliers, company details and employees can be managed',async function() {
	let response=await admin.post('/api/customers').send({
		name: 'Test Customer',phone: '08011111111',address: 'Customer Street',
		email: 'customer@example.com',note: 'Automated test customer'
	}).expect(201);
	ids.customer=response.body.customer_id;

	response=await manager.post('/api/suppliers').send({
		name: 'Test Supplier',phone: '08022222222',address: 'Supplier Street',
		email: 'supplier@example.com',note: 'Automated test supplier'
	}).expect(201);
	ids.supplier=response.body.supplier_id;

	response=await admin.post('/api/employees')
		.field('start_date','2026-01-01').field('name','Test Employee')
		.field('phone','08033333333').field('address','Employee Street')
		.field('email','employee@example.com').field('role','Machine Operator')
		.field('salary','120000').field('note','Automated test employee')
		.expect(201);
	ids.employee=response.body.employee_id;

	const company=await admin.patch('/api/company')
		.field('company_name','Updated Test Oil Company')
		.field('phone_number','08044444444').field('business_address','Updated Factory')
		.field('remove_logo','false').expect(200);
	assert.equal(company.body.company_name,'Updated Test Oil Company');

	await manager.patch('/api/customers/'+ids.customer).send({
		name: 'Updated Customer',phone: '08011111111',address: 'Updated Street',
		email: 'customer@example.com',note: 'Updated'
	}).expect(200);
	await storekeeper.patch('/api/customers/'+ids.customer).send({}).expect(403);
});

test('salary history, employee status and payroll calculations work',async function() {
	await admin.post('/api/employees/'+ids.employee+'/salary-history').send({
		new_salary: 150000,effective_date: '2026-07-01',reason: 'Annual increase'
	}).expect(200);
	const history=await manager.get('/api/employees/'+ids.employee+'/salary-history').expect(200);
	assert.equal(history.body.length,2);
	assert.equal(Number(history.body[0].new_salary),150000);

	const generated=await admin.post('/api/payroll/generate').send({ month: '2026-11' });
	assert.ok([200,201].includes(generated.status),generated.text);
	const payroll=await admin.get('/api/payroll?month=2026-11').expect(200);
	assert.equal(payroll.body.length,1);
	ids.payroll=payroll.body[0].payroll_id;
	const updated=await admin.patch('/api/payroll/'+ids.payroll).send({
		bonus: 10000,deduction: 5000,payment_status: 'Paid',payment_date: '2026-11-30'
	}).expect(200);
	assert.equal(Number(updated.body.total_salary_cost),155000);

	await admin.patch('/api/employees/'+ids.employee+'/status').send({
		status: 'Inactive',effective_date: '2026-12-01'
	}).expect(200);
	await manager.patch('/api/employees/'+ids.employee+'/status').send({}).expect(403);
});

test('manual Inventory adjustments are Admin-only and validate decimals',async function() {
	const items=await admin.get('/api/items').expect(200);
	for(const item of items.body) ids[item.name]=item.item_id;
    await admin.post('/api/stock_counts').send({count_date:'2026-11-12',item_id:ids.PKO,received:200,issued:0}).expect(201);
	await admin.post('/api/stock_counts').send({
		count_date: '2026-11-13',item_id: ids.Diesel,received: 500,issued: '1.234'
	}).expect(400);
	await admin.post('/api/stock_counts').send({
		count_date: '2026-11-13',item_id: ids.Diesel,received: 500,issued: 0
	}).expect(201);
	const stock=await storekeeper.get('/api/stock_counts').expect(200);
	assert.ok(stock.body.some(row => row.name==='Diesel'));
});

test('Manager authorises work and Storekeeper quantities create Purchase and Production records',async function() {
	const purchaseRequest=await manager.post('/api/purchases').send({
		purchase_date: '2026-11-13',supplier_id: ids.supplier,item_id: ids['P Kernel'],
		unit_cost: 300
	}).expect(201);
	assert.equal(purchaseRequest.body.status,'Awaiting Storekeeper');
	const productionRequest=await manager.post('/api/production').send({
		production_date: '2026-11-13',production_hours: '08:00',down_time: '01:00'
	}).expect(201);
	const pending=await storekeeper.get('/api/weighing-requests').expect(200);
	assert.deepEqual(new Set(pending.body.map(row => row.request_type)),new Set(['Purchase','Production']));
	await manager.patch('/api/weighing-requests/'+purchaseRequest.body.request_id+'/complete').send({ quantity:1000 }).expect(403);
	await storekeeper.patch('/api/weighing-requests/'+purchaseRequest.body.request_id+'/cancel').expect(403);
	await storekeeper.patch('/api/weighing-requests/'+purchaseRequest.body.request_id+'/complete').send({
		quantity: 1000,scale_ticket: 'PURCHASE-TICKET-1',vehicle_number: 'TEST-001'
	}).expect(200);
	await storekeeper.patch('/api/weighing-requests/'+productionRequest.body.request_id+'/complete').send({
		submission_key: crypto.randomUUID(),kernel_used: 500,pko_produced: 200,pkc_produced: 280,sludge_produced: 20,
		scale_ticket: 'PRODUCTION-TICKET-1'
	}).expect(200);
    const batchUrl='/api/weighing-requests/'+productionRequest.body.request_id;
    const secondBatch={ submission_key:crypto.randomUUID(),kernel_used:0,pko_produced:25,pkc_produced:0,sludge_produced:0 };
    await manager.patch(batchUrl+'/complete').send(secondBatch).expect(403);
    await manager.patch(batchUrl+'/cancel').expect(404);
    await storekeeper.patch(batchUrl+'/complete').send({ ...secondBatch,pko_produced:-1 }).expect(400);
    await storekeeper.patch(batchUrl+'/complete').send(secondBatch).expect(200);
    await storekeeper.patch(batchUrl+'/complete').send(secondBatch).expect(200);
    await storekeeper.patch(batchUrl+'/complete').send({ ...secondBatch,pko_produced:30 }).expect(409);
    const daily=(await admin.get('/api/production').expect(200)).body;
    assert.equal(daily.length,1);
    assert.equal(Number(daily[0].pko_produced),225);
    assert.equal(Number(daily[0].kernel_used),500);
    const open=(await storekeeper.get('/api/weighing-requests').expect(200)).body.find(row => row.request_id===productionRequest.body.request_id);
    assert.equal(open.batches.length,2);
    const movements=await applicationPool.query("SELECT SUM(received) AS quantity FROM stock_counts WHERE source_type='Production' AND item_id=$1",[ids.PKO]);
    assert.equal(Number(movements.rows[0].quantity),225);
    await manager.patch(batchUrl+'/finish').expect(403);
    await storekeeper.patch(batchUrl+'/finish').expect(200);
    await storekeeper.patch(batchUrl+'/complete').send({ ...secondBatch,submission_key:crypto.randomUUID() }).expect(409);
    await manager.patch(batchUrl+'/reopen').expect(403);
    await storekeeper.patch(batchUrl+'/reopen').expect(403);
    const completed=(await admin.get('/api/weighing-requests?include_completed=true').expect(200)).body;
    assert.ok(completed.some(row => row.request_id===productionRequest.body.request_id&&row.status==='Completed'));
    const hidden=(await manager.get('/api/weighing-requests?include_completed=true').expect(200)).body;
    assert.ok(!hidden.some(row => row.request_id===productionRequest.body.request_id));
    await admin.patch(batchUrl+'/reopen').expect(200);
    await admin.patch(batchUrl+'/reopen').expect(409);
    await storekeeper.patch(batchUrl+'/complete').send({ submission_key:crypto.randomUUID(),kernel_used:0,pko_produced:0,pkc_produced:0,sludge_produced:1 }).expect(200);
    const reopenedDaily=(await admin.get('/api/production').expect(200)).body;
    assert.equal(reopenedDaily.length,1);
    assert.equal(Number(reopenedDaily[0].sludge_produced),21);
    assert.equal(Number(reopenedDaily[0].pko_produced),225);
    await storekeeper.patch(batchUrl+'/finish').expect(200);
	await manager.post('/api/expenses').send({
		expense_date: '2026-11-13',category: 'Expenses',description: 'Test transport',amount_spent: 25000
	}).expect(201);
	assert.equal((await admin.get('/api/purchases').expect(200)).body.length,1);
	assert.equal((await admin.get('/api/production').expect(200)).body.length,1);
	assert.equal((await admin.get('/api/expenses').expect(200)).body.length,1);
});

test('Managers cancel only their own unused authorisations and Admin cancels all',async function() {
    const create=agent => agent.post('/api/production').send({ production_date:'2026-11-14',production_hours:'08:00',down_time:'00:00' }).expect(201);
    const adminRequest=await create(admin);
    const pendingAdmin=(await manager.get('/api/weighing-requests').expect(200)).body.find(row => row.request_id===adminRequest.body.request_id);
    assert.equal(pendingAdmin.can_cancel,false);
    await manager.patch('/api/weighing-requests/'+adminRequest.body.request_id+'/cancel').expect(404);
    await admin.patch('/api/weighing-requests/'+adminRequest.body.request_id+'/cancel').expect(200);
    const managerRequest=await create(manager);
    await admin.patch('/api/weighing-requests/'+managerRequest.body.request_id+'/cancel').expect(200);
    await admin.patch('/api/weighing-requests/'+managerRequest.body.request_id+'/cancel').expect(404);
    const ownRequest=await create(manager);
    const ownPending=(await manager.get('/api/weighing-requests').expect(200)).body.find(row => row.request_id===ownRequest.body.request_id);
    assert.equal(ownPending.can_cancel,true);
    await manager.patch('/api/weighing-requests/'+ownRequest.body.request_id+'/cancel').expect(200);
    const pending=(await storekeeper.get('/api/weighing-requests').expect(200)).body;
    assert.ok(!pending.some(row => [adminRequest.body.request_id,managerRequest.body.request_id].includes(row.request_id)));
});

test('dated product prices are visible to every role but only Admin can change them',async function() {
	await manager.post('/api/prices').send({
		item_id: ids.PKO,unit_price: 800,effective_date: '2025-01-01'
	}).expect(403);
	await admin.post('/api/prices').send({
		item_id: ids.PKO,unit_price: 800,effective_date: '2025-01-01'
	}).expect(201);
	await admin.post('/api/prices').send({
		item_id: ids.PKO,unit_price: 1000,effective_date: '2026-01-01'
	}).expect(201);
	const oldPrice=await manager.get('/api/prices/lookup?item_id='+ids.PKO+'&date=2025-06-01').expect(200);
	assert.equal(Number(oldPrice.body.unit_price),800);
	const saleDatePrice=await storekeeper.get('/api/prices/lookup?item_id='+ids.PKO+'&date=2026-11-13').expect(200);
	assert.equal(Number(saleDatePrice.body.unit_price),1000);
	assert.equal((await manager.get('/api/prices').expect(200)).body.length,2);
});

test('sales generate invoices and partial payments generate receipts and balances',async function() {
	const saleRequest=await manager.post('/api/sales').send({
		sales_date: '2026-11-13',customer_id: ids.customer,item_id: ids.PKO,
		quantity: 400,unit_price: 1
	}).expect(201);
	assert.equal(Number(saleRequest.body.unit_price),1000,'Pending Sale must copy the official Prices-page value');
	const completed=await storekeeper.patch('/api/weighing-requests/'+saleRequest.body.request_id+'/complete').send({
		quantity: 400,scale_ticket: 'SALE-TICKET-1',vehicle_number: 'TEST-002'
	}).expect(200);
	ids.sale=completed.body.record_id;

	let invoice=await manager.get('/api/sales/'+ids.sale+'/invoice').expect(200);
	assert.equal(Number(invoice.body.sale.total),400000);
	assert.equal(invoice.body.payments.length,0);

	const payment=await manager.post('/api/sales/'+ids.sale+'/payments').send({
		payment_date: '2026-11-14',amount: 150000,payment_method: 'Bank Transfer',
		reference_number: 'TEST-TRANSFER-001',note: 'First instalment'
	}).expect(201);
	assert.match(payment.body.receipt_number,/^RCT-2026-\d{6}$/);
	await manager.post('/api/sales/'+ids.sale+'/payments').send({
		payment_date: '2026-11-15',amount: 300000,payment_method: 'Cash'
	}).expect(400);

	invoice=await storekeeper.get('/api/sales/'+ids.sale+'/invoice').expect(200);
	assert.equal(invoice.body.payments.length,1);
	assert.equal(Number(invoice.body.sale.amount_paid),150000);
	const sales=await admin.get('/api/sales').expect(200);
	const saved=sales.body.find(row => row.sales_id===ids.sale);
	assert.equal(Number(saved.amount_remaining),250000);
	assert.equal(saved.payment_status,'Partly Paid');
});

test('single-source Storekeeper quantities keep Inventory and business records consistent',async function() {
	const checks=await admin.get('/api/checks').expect(200);
	assert.equal(checks.body.length,0);
	const stock=await storekeeper.get('/api/stock_counts').expect(200);
	assert.ok(stock.body.some(row => row.name==='PKO'&&Number(row.issued)===400));
	assert.ok(stock.body.some(row => row.name==='P Kernel'&&Number(row.issued)===500));
	const summary=await storekeeper.get('/api/inventory-summary').expect(200);
	const pkoDay=summary.body.find(row => row.name==='PKO'&&row.count_date==='2026-11-13');
	assert.equal(Number(pkoDay.received),225);
	assert.equal(Number(pkoDay.issued),400);
});

test('dashboard, customer history and supplier history return calculated data',async function() {
	const dashboard=await storekeeper.get('/api/dashboard?date=2026-11-13').expect(200);
	assert.ok(dashboard.body.some(row => row.item==='PKO'));
	await manager.get('/api/dashboard_period?date=2026-11-13').expect(200);
	await storekeeper.get('/api/dashboard_period?date=2026-11-13').expect(403);
	const purchases=await manager.get('/api/customers-purchases?customerId='+ids.customer).expect(200);
	assert.equal(purchases.body.length,1);
	assert.equal(Number(purchases.body[0].total),400000);
	const supplies=await manager.get('/api/supplier-supplies?supplierId='+ids.supplier).expect(200);
	assert.equal(supplies.body.length,1);
});

test('administrator can create users, switch accounts and return without a password',async function() {
	const created=await admin.post('/api/users').send({
		username: 'temporary_manager',password: 'TemporaryPass123',role: 'manager'
	}).expect(201);
	ids.temporaryUser=created.body.user_id;
	await admin.post('/api/switch-account').send({ user_id: ids.temporaryUser }).expect(200);
	let current=await admin.get('/api/current-user').expect(200);
	assert.equal(current.body.role,'manager');
	assert.equal(current.body.switched_from_admin,true);
	await admin.post('/api/return-to-admin').expect(200);
	current=await admin.get('/api/current-user').expect(200);
	assert.equal(current.body.role,'admin');
	await admin.delete('/api/users/'+ids.temporaryUser).expect(200);
});

test('Authorisations are numbered independently by type and day, retaining numbers after cancellation',async function() {
    const date='2026-11-15';
    const purchase=day => manager.post('/api/purchases').send({ purchase_date:day,supplier_id:ids.supplier,item_id:ids['P Kernel'],unit_cost:300 }).expect(201);
    const sale=day => manager.post('/api/sales').send({ sales_date:day,customer_id:ids.customer,item_id:ids.PKO }).expect(201);
    const purchase1=await purchase(date);
    const sale1=await sale(date);
    const purchase2=await purchase(date);
    const sale2=await sale(date);
    const production1=await manager.post('/api/production').send({ production_date:date,production_hours:'08:00',down_time:'00:00' }).expect(201);
    const tomorrow=await sale('2026-11-16');
    const pending=(await manager.get('/api/weighing-requests').expect(200)).body;
    for(const [record,expected] of [[purchase1,1],[sale1,1],[purchase2,2],[sale2,2],[production1,1],[tomorrow,1]]) {
        assert.equal(Number(pending.find(row => row.request_id===record.body.request_id).daily_number),expected);
    }
    await manager.patch('/api/weighing-requests/'+purchase1.body.request_id+'/cancel').expect(200);
    const remaining=(await manager.get('/api/weighing-requests').expect(200)).body;
    assert.equal(Number(remaining.find(row => row.request_id===purchase2.body.request_id).daily_number),2);
});

test('Deleting production cancels its authorisation and removes generated stock while retaining batch history',async function() {
    const request=await manager.post('/api/production').send({ production_date:'2026-11-17',production_hours:'08:00',down_time:'00:00' }).expect(201);
    const url='/api/weighing-requests/'+request.body.request_id;
    const batch=await storekeeper.patch(url+'/complete').send({ submission_key:crypto.randomUUID(),kernel_used:10,pko_produced:4,pkc_produced:5,sludge_produced:1 }).expect(200);
    await manager.delete('/api/correction_delete').send({ kind:'production',record:{ production_id:batch.body.record_id } }).expect(403);
    await admin.delete('/api/correction_delete').send({ kind:'production',record:{ production_id:batch.body.record_id } }).expect(200);
    const pending=(await admin.get('/api/weighing-requests?include_completed=true').expect(200)).body;
    assert.ok(!pending.some(row => row.request_id===request.body.request_id));
    const stock=await applicationPool.query("SELECT * FROM stock_counts WHERE source_type='Production' AND source_id=$1",[request.body.request_id]);
    assert.equal(stock.rowCount,0);
    const history=await applicationPool.query('SELECT * FROM production_batches WHERE request_id=$1',[request.body.request_id]);
    assert.equal(history.rowCount,1);
    await admin.patch(url+'/reopen').expect(409);
    await storekeeper.patch(url+'/complete').send({ submission_key:crypto.randomUUID(),kernel_used:10,pko_produced:0,pkc_produced:0,sludge_produced:0 }).expect(409);
    await admin.delete('/api/correction_delete').send({ kind:'production',record:{ production_id:batch.body.record_id } }).expect(404);
});

async function completedPurchase(day='2026-11-20') {
    const request=await manager.post('/api/purchases').send({ purchase_date:day,supplier_id:ids.supplier,item_id:ids['P Kernel'],unit_cost:300 }).expect(201);
    const saved=await storekeeper.patch('/api/weighing-requests/'+request.body.request_id+'/complete').send({ quantity:100 }).expect(200);
    return { requestId:request.body.request_id,record:{ purchase_id:saved.body.record_id,purchase_date:day,supplier_id:ids.supplier,item_id:ids['P Kernel'],quantity_supplied:100,unit_cost:300 } };
}
async function completedSale(day='2026-11-20') {
    const request=await manager.post('/api/sales').send({ sales_date:day,customer_id:ids.customer,item_id:ids.PKO }).expect(201);
    const saved=await storekeeper.patch('/api/weighing-requests/'+request.body.request_id+'/complete').send({ quantity:10 }).expect(200);
    return { requestId:request.body.request_id,record:{ sales_id:saved.body.record_id,sales_date:day,customer_id:ids.customer,item_id:ids.PKO,quantity:10,unit_price:1000 } };
}
test('Purchase corrections synchronise stock and authorisation; deletion removes only its own receipt',async function() {
    const first=await completedPurchase();
    const second=await completedPurchase();
    const record={ ...first.record,purchase_date:'2026-11-21',item_id:ids.Diesel,quantity_supplied:75.25,unit_cost:450 };
    await admin.patch('/api/correction_edit').send({ kind:'purchases',record }).expect(200);
    let stock=(await applicationPool.query("SELECT *,to_char(count_date,'YYYY-MM-DD') AS day FROM stock_counts WHERE source_type='Purchase' AND source_id=$1",[first.requestId])).rows[0];
    assert.equal(Number(stock.received),75.25);
    assert.equal(stock.item_id,ids.Diesel);
    assert.equal(stock.day,'2026-11-21');
    const link=(await applicationPool.query('SELECT * FROM weighing_requests WHERE request_id=$1',[first.requestId])).rows[0];
    assert.equal(Number(link.quantity),75.25);
    assert.equal(Number(link.unit_cost),450);
    await admin.patch('/api/correction_edit').send({ kind:'purchases',record:{ ...record,quantity_supplied:-1 } }).expect(400);
    assert.equal(Number((await applicationPool.query('SELECT quantity_supplied FROM purchases WHERE purchase_id=$1',[record.purchase_id])).rows[0].quantity_supplied),75.25);
    await admin.delete('/api/correction_delete').send({ kind:'purchases',record }).expect(200);
    assert.equal((await applicationPool.query("SELECT * FROM stock_counts WHERE source_type='Purchase' AND source_id=$1",[first.requestId])).rowCount,0);
    assert.equal((await applicationPool.query('SELECT status FROM weighing_requests WHERE request_id=$1',[first.requestId])).rows[0].status,'Cancelled');
    assert.equal((await applicationPool.query("SELECT * FROM stock_counts WHERE source_type='Purchase' AND source_id=$1",[second.requestId])).rowCount,1);
});
test('Sale corrections synchronise dispatch; unpaid sale deletion restores stock',async function() {
    await admin.post('/api/stock_counts').send({count_date:'2026-11-19',item_id:ids.PKO,received:200,issued:0}).expect(201);
    const sale=await completedSale();
    const record={ ...sale.record,sales_date:'2026-11-21',quantity:12,unit_price:900 };
    await admin.patch('/api/correction_edit').send({ kind:'sales',record }).expect(200);
    const stock=(await applicationPool.query("SELECT *,to_char(count_date,'YYYY-MM-DD') AS day FROM stock_counts WHERE source_type='Sale' AND source_id=$1",[sale.requestId])).rows[0];
    assert.equal(Number(stock.issued),12);
    assert.equal(stock.day,'2026-11-21');
    const invoice=(await admin.get('/api/sales/'+record.sales_id+'/invoice').expect(200)).body;
    assert.equal(invoice.sale.due_date,'2026-11-21');
    await admin.delete('/api/correction_delete').send({ kind:'sales',record }).expect(200);
    assert.equal((await applicationPool.query("SELECT * FROM stock_counts WHERE source_type='Sale' AND source_id=$1",[sale.requestId])).rowCount,0);
    await storekeeper.patch('/api/weighing-requests/'+sale.requestId+'/complete').send({ quantity:10 }).expect(409);
});
test('Paid sales retain receipts and cannot be reduced below payments or moved to another customer',async function() {
    const sale=await completedSale();
    await manager.post('/api/sales/'+sale.record.sales_id+'/payments').send({ payment_date:'2026-11-20',amount:100,payment_method:'Cash' }).expect(201);
    await admin.delete('/api/correction_delete').send({ kind:'sales',record:sale.record }).expect(409);
    await admin.patch('/api/correction_edit').send({ kind:'sales',record:{ ...sale.record,quantity:1,unit_price:50 } }).expect(409);
    await admin.patch('/api/correction_edit').send({ kind:'sales',record:{ ...sale.record,customer_id:999999 } }).expect(409);
    assert.equal((await applicationPool.query('SELECT * FROM sale_payments WHERE sales_id=$1',[sale.record.sales_id])).rowCount,1);
    assert.equal((await applicationPool.query("SELECT * FROM stock_counts WHERE source_type='Sale' AND source_id=$1",[sale.requestId])).rowCount,1);
});
test('Generated inventory cannot be edited or deleted separately from its business record',async function() {
    const purchase=await completedPurchase();
    const stock=(await applicationPool.query("SELECT * FROM stock_counts WHERE source_type='Purchase' AND source_id=$1",[purchase.requestId])).rows[0];
    await admin.patch('/api/correction_edit').send({ kind:'stock',record:{ ...stock,count_date:'2026-11-20',received:50 } }).expect(409);
    await admin.delete('/api/correction_delete').send({ kind:'stock',record:stock }).expect(404);
    assert.equal(Number((await applicationPool.query('SELECT received FROM stock_counts WHERE count_id=$1',[stock.count_id])).rows[0].received),100);
});
test('Production aggregate corrections cannot diverge from batches; duration changes stay linked',async function() {
    const request=await manager.post('/api/production').send({ production_date:'2026-11-22',production_hours:'08:00',down_time:'00:00' }).expect(201);
    const saved=await storekeeper.patch('/api/weighing-requests/'+request.body.request_id+'/complete').send({ submission_key:crypto.randomUUID(),kernel_used:10,pko_produced:4,pkc_produced:5,sludge_produced:1 }).expect(200);
    const record={ production_id:saved.body.record_id,production_date:'2026-11-22',production_hours:'09:00',down_time:'01:00',kernel_used:10,pko_produced:4,pkc_produced:5,sludge_produced:1 };
    await admin.patch('/api/correction_edit').send({ kind:'production',record:{ ...record,pko_produced:8 } }).expect(409);
    await admin.patch('/api/correction_edit').send({ kind:'production',record:{ ...record,production_date:'2026-11-23' } }).expect(409);
    await admin.patch('/api/correction_edit').send({ kind:'production',record }).expect(200);
    const link=(await applicationPool.query("SELECT to_char(production_hours,'HH24:MI') AS hours FROM weighing_requests WHERE request_id=$1",[request.body.request_id])).rows[0];
    assert.equal(link.hours,'09:00');
});
test('Concurrent customer payments cannot exceed the sale balance and reject fractional pennies',async function() {
    const sale=await completedSale();
    const total=Number((await applicationPool.query('SELECT quantity*unit_price AS total FROM sales WHERE sales_id=$1',[sale.record.sales_id])).rows[0].total);
    const pay=amount => manager.post('/api/sales/'+sale.record.sales_id+'/payments').send({ payment_date:'2026-11-20',amount,payment_method:'Cash' });
    await pay('1.001').expect(400);
    const payments=await Promise.all([pay(total*0.6),pay(total*0.6)]);
    assert.deepEqual(payments.map(row => row.status).sort(),[201,400]);
    const paid=Number((await applicationPool.query('SELECT SUM(amount) AS paid FROM sale_payments WHERE sales_id=$1',[sale.record.sales_id])).rows[0].paid);
    assert.equal(paid,total*0.6);
});

test('Legacy records with unlinked inventory cannot be corrected by guessing their stock dependencies',async function() {
    const legacy=await applicationPool.query(`INSERT INTO purchases (purchase_date,supplier_id,item_id,quantity_supplied,unit_cost)
        VALUES ('2026-11-24',$1,$2,10,300) RETURNING *`,[ids.supplier,ids['P Kernel']]);
    const stock=await admin.post('/api/stock_counts').send({ count_date:'2026-11-24',item_id:ids['P Kernel'],received:10,issued:0 }).expect(201);
    await admin.delete('/api/correction_delete').send({ kind:'purchases',record:legacy.rows[0] }).expect(409);
    await admin.patch('/api/correction_edit').send({ kind:'purchases',record:{ ...legacy.rows[0],purchase_date:'2026-11-24',quantity_supplied:20 } }).expect(409);
    assert.equal((await applicationPool.query('SELECT * FROM purchases WHERE purchase_id=$1',[legacy.rows[0].purchase_id])).rowCount,1);
    await admin.delete('/api/correction_delete').send({ kind:'stock',record:stock.body }).expect(200);
});
test('Accounts referenced by business records cannot be deleted and return a dependency explanation',async function() {
    await admin.delete('/api/users/'+ids.managerUser).expect(409);
    assert.equal((await applicationPool.query('SELECT * FROM users WHERE user_id=$1',[ids.managerUser])).rowCount,1);
});

test('Repeated authorisation submissions return one task and reject changed payloads',async function() {
    const body={purchase_date:'2026-12-01',supplier_id:ids.supplier,item_id:ids.Diesel,unit_cost:500,authorisation_key:crypto.randomUUID()};
    const results=await Promise.all([manager.post('/api/purchases').send(body),manager.post('/api/purchases').send(body)]);
    assert.ok(results.every(row=>row.status===201));
    assert.equal(results[0].body.request_id,results[1].body.request_id);
    await manager.post('/api/purchases').send({...body,unit_cost:600}).expect(409);
    const sale={sales_date:'2026-12-01',customer_id:ids.customer,item_id:ids.PKO,authorisation_key:crypto.randomUUID()};
    const first=await manager.post('/api/sales').send(sale).expect(201);
    const retry=await manager.post('/api/sales').send(sale).expect(201);
    assert.equal(first.body.request_id,retry.body.request_id);
});
test('Invoice identities stay fixed when customer and company profiles change',async function() {
    const sale=await completedSale('2026-12-02');
    const before=(await admin.get('/api/sales/'+sale.record.sales_id+'/invoice').expect(200)).body;
    await applicationPool.query("UPDATE customers SET name='New profile name',address='New address' WHERE customer_id=$1",[ids.customer]);
    await applicationPool.query("UPDATE company_details SET company_name='New company profile' WHERE company_id=1");
    const after=(await admin.get('/api/sales/'+sale.record.sales_id+'/invoice').expect(200)).body;
    assert.equal(after.sale.customer,before.sale.customer);
    assert.equal(after.sale.customer_address,before.sale.customer_address);
    assert.equal(after.company.company_name,before.company.company_name);
    const newer=await completedSale('2026-12-02');
    assert.equal((await admin.get('/api/sales/'+newer.record.sales_id+'/invoice').expect(200)).body.sale.customer,'New profile name');
});
test('Employment gaps survive reactivation; unpaid payroll refreshes and paid payroll is preserved',async function() {
    const created=await admin.post('/api/employees').field('start_date','2026-01-01').field('name','Period Employee').field('phone','08000000001').field('address','Factory').field('role','Operator').field('salary','120000').expect(201);
    const employeeId=created.body.employee_id;
    await admin.patch('/api/employees/'+employeeId+'/status').send({status:'Inactive',effective_date:'2026-06-10'}).expect(200);
    await admin.patch('/api/employees/'+employeeId+'/status').send({status:'Active',effective_date:'2026-08-01'}).expect(200);
    await admin.post('/api/payroll/generate').send({month:'2026-07'}).expect(200);
    let payroll=(await admin.get('/api/payroll?month=2026-07').expect(200)).body.find(row=>row.employee_id===employeeId);
    assert.equal(Number(payroll.basic_salary),0);
    await admin.post('/api/payroll/generate').send({month:'2026-08'}).expect(200);
    await admin.post('/api/employees/'+employeeId+'/salary-history').send({new_salary:150000,effective_date:'2026-08-01',reason:'Correct agreed salary'}).expect(200);
    payroll=(await admin.get('/api/payroll?month=2026-08').expect(200)).body.find(row=>row.employee_id===employeeId);
    assert.equal(payroll.needs_review,true);
    await admin.patch('/api/payroll/'+payroll.payroll_id).send({bonus:0,deduction:0,payment_status:'Paid',payment_date:'2026-08-31'}).expect(409);
    await admin.post('/api/payroll/generate').send({month:'2026-08'}).expect(200);
    payroll=(await admin.get('/api/payroll?month=2026-08').expect(200)).body.find(row=>row.employee_id===employeeId);
    assert.equal(Number(payroll.basic_salary),150000);assert.equal(payroll.needs_review,false);
    await admin.patch('/api/payroll/'+payroll.payroll_id).send({bonus:0,deduction:0,payment_status:'Paid',payment_date:'2026-08-31'}).expect(200);
    await admin.post('/api/employees/'+employeeId+'/salary-history').send({new_salary:160000,effective_date:'2026-08-01',reason:'Late correction'}).expect(200);
    await admin.post('/api/payroll/generate').send({month:'2026-08'}).expect(200);
    payroll=(await admin.get('/api/payroll?month=2026-08').expect(200)).body.find(row=>row.employee_id===employeeId);
    assert.equal(Number(payroll.basic_salary),150000);assert.equal(payroll.needs_review,true);
    await admin.post('/api/employees/'+employeeId+'/salary-history').send({new_salary:200000,effective_date:'2099-01-01',reason:'Future agreement'}).expect(200);
    const employee=(await admin.get('/api/employees').expect(200)).body.find(row=>row.employee_id===employeeId);
    assert.equal(Number(employee.salary),160000);
});
test('Admin reviews and links exact legacy inventory without changing quantities',async function() {
    const original=await applicationPool.query("INSERT INTO purchases(purchase_date,supplier_id,item_id,quantity_supplied,unit_cost) VALUES('2026-12-03',$1,$2,17,400) RETURNING purchase_id",[ids.supplier,ids.Diesel]);
    const id=original.rows[0].purchase_id;
    const stock=await admin.post('/api/stock_counts').send({count_date:'2026-12-03',item_id:ids.Diesel,received:17,issued:0}).expect(201);
    await manager.get('/api/legacy-links').expect(403);
    const proposal=await admin.get('/api/legacy-links/purchases/'+id).expect(200);
    assert.ok(proposal.body.options[0].matches.some(row=>row.count_id===stock.body.count_id));
    await admin.post('/api/legacy-links/purchases/'+id).send({movements:{Received:999999}}).expect(409);
    await admin.post('/api/legacy-links/purchases/'+id).send({movements:{Received:stock.body.count_id}}).expect(200);
    const movement=(await applicationPool.query('SELECT * FROM stock_counts WHERE count_id=$1',[stock.body.count_id])).rows[0];
    assert.equal(movement.source_type,'Purchase');assert.equal(Number(movement.received),17);
    await admin.post('/api/legacy-links/purchases/'+id).send({movements:{Received:stock.body.count_id}}).expect(409);
    await admin.delete('/api/correction_delete').send({kind:'purchases',record:{purchase_id:id}}).expect(200);
    assert.equal((await applicationPool.query('SELECT * FROM stock_counts WHERE count_id=$1',[stock.body.count_id])).rowCount,0);
});
test('Batch corrections update totals and stock, reject stale versions, and require reopening finished days',async function() {
    const request=await manager.post('/api/production').send({production_date:'2026-12-04',production_hours:'08:00',down_time:'00:00'}).expect(201);
    await storekeeper.patch('/api/weighing-requests/'+request.body.request_id+'/complete').send({submission_key:crypto.randomUUID(),kernel_used:0,pko_produced:20,pkc_produced:0,sludge_produced:0}).expect(200);
    const pending=(await admin.get('/api/weighing-requests').expect(200)).body.find(row=>row.request_id===request.body.request_id);
    const batch=pending.batches[0];const url='/api/weighing-requests/'+request.body.request_id+'/batches/'+batch.batch_id;
    const values={version:batch.version,kernel_used:0,pko_produced:15,pkc_produced:0,sludge_produced:0};
    await manager.patch(url).send(values).expect(403);
    await admin.patch(url).send(values).expect(200);
    await admin.patch(url).send(values).expect(409);
    const total=(await applicationPool.query('SELECT pko_produced FROM production WHERE production_id=$1',[pending.batches.length? (await applicationPool.query('SELECT completed_record_id FROM weighing_requests WHERE request_id=$1',[request.body.request_id])).rows[0].completed_record_id:0])).rows[0];
    assert.equal(Number(total.pko_produced),15);
    await storekeeper.patch('/api/weighing-requests/'+request.body.request_id+'/finish').expect(200);
    await admin.delete(url).send({version:2}).expect(409);
    await admin.patch('/api/weighing-requests/'+request.body.request_id+'/reopen').expect(200);
    await admin.delete(url).send({version:2}).expect(200);
    const reversed=(await applicationPool.query('SELECT * FROM production_batches WHERE batch_id=$1',[batch.batch_id])).rows[0];
    assert.equal(reversed.voided,true);assert.equal(Number(reversed.pko_produced),15);
});
test('Corrections that remove supply needed by later usage roll back completely',async function() {
    const item=(await applicationPool.query("INSERT INTO items(name,item_type) VALUES('Safety test material','raw_material') RETURNING item_id")).rows[0].item_id;
    const request=await manager.post('/api/purchases').send({purchase_date:'2026-12-05',supplier_id:ids.supplier,item_id:item,unit_cost:100}).expect(201);
    const saved=await storekeeper.patch('/api/weighing-requests/'+request.body.request_id+'/complete').send({quantity:100}).expect(200);
    await admin.post('/api/stock_counts').send({count_date:'2026-12-06',item_id:item,received:0,issued:80}).expect(201);
    await admin.delete('/api/correction_delete').send({kind:'purchases',record:{purchase_id:saved.body.record_id}}).expect(409);
    assert.equal((await applicationPool.query('SELECT * FROM purchases WHERE purchase_id=$1',[saved.body.record_id])).rowCount,1);
    assert.equal((await applicationPool.query("SELECT * FROM stock_counts WHERE source_type='Purchase' AND source_id=$1",[request.body.request_id])).rowCount,1);
});
test('Database rules reject orphan generated stock and direct deletion of a linked purchase',async function() {
    const purchase=await completedPurchase('2026-12-07');
    await assert.rejects(applicationPool.query('DELETE FROM purchases WHERE purchase_id=$1',[purchase.record.purchase_id]),error=>error.code==='23514');
    await assert.rejects(applicationPool.query("INSERT INTO stock_counts(count_date,item_id,received,issued,source_type,source_id,source_part) VALUES('2026-12-07',$1,1,0,'Purchase',999999,'Received')",[ids.Diesel]),error=>error.code==='23503');
});
test('Checks include sludge and consumables and detect mismatches within individual source records',async function() {
    const request=await manager.post('/api/purchases').send({purchase_date:'2026-12-08',supplier_id:ids.supplier,item_id:ids.Diesel,unit_cost:100}).expect(201);
    await storekeeper.patch('/api/weighing-requests/'+request.body.request_id+'/complete').send({quantity:10}).expect(200);
    await applicationPool.query("UPDATE stock_counts SET received=9 WHERE source_type='Purchase' AND source_id=$1",[request.body.request_id]);
    const production=await manager.post('/api/production').send({production_date:'2026-12-08',production_hours:'08:00',down_time:'00:00'}).expect(201);
    await storekeeper.patch('/api/weighing-requests/'+production.body.request_id+'/complete').send({submission_key:crypto.randomUUID(),kernel_used:0,pko_produced:0,pkc_produced:0,sludge_produced:10}).expect(200);
    await applicationPool.query("UPDATE stock_counts SET received=9 WHERE source_type='Production' AND source_id=$1 AND source_part='Sludge Received'",[production.body.request_id]);
    const checks=(await admin.get('/api/checks').expect(200)).body;
    assert.ok(checks.some(row=>row.item==='Diesel'&&Number(row.difference)===-1&&row.related_source==='purchases'));
    assert.ok(checks.some(row=>row.item==='Sludge'&&Number(row.difference)===-1&&row.related_source==='production'));
});
test('Daily continuous costing combines independent weighings into one provisional day total',async function() {
    const day='2027-01-01';
    await completedPurchase(day);
    const request=await manager.post('/api/production').send({production_date:day,production_hours:'08:00',down_time:'00:00'}).expect(201);
    const url='/api/weighing-requests/'+request.body.request_id+'/complete';
    await storekeeper.patch(url).send({submission_key:crypto.randomUUID(),kernel_used:20,pko_produced:10,pkc_produced:9,sludge_produced:1}).expect(200);
    const sale=await manager.post('/api/sales').send({sales_date:day,customer_id:ids.customer,item_id:ids.PKO}).expect(201);
    await storekeeper.patch('/api/weighing-requests/'+sale.body.request_id+'/complete').send({quantity:3}).expect(200);
    const before=(await admin.get('/api/average_cost').expect(200)).body;
    const early=before.product_dispatch_costs.find(row=>row.dispatch_date===day&&row.quantity_dispatched===3);
    assert.ok(early);
    await storekeeper.patch(url).send({submission_key:crypto.randomUUID(),kernel_used:50,pko_produced:30,pkc_produced:19,sludge_produced:1}).expect(200);
    const after=(await admin.get('/api/average_cost').expect(200)).body;
    assert.equal(after.product_dispatch_costs.find(row=>row.dispatch_date===day&&row.quantity_dispatched===3).provisional,true);
    const daily=after.production_costs.filter(row=>row.production_date===day);
    assert.equal(daily.length,1);assert.equal(daily[0].storekeeper_pko_received,40);
});

test('Reopening a linked historical production day preserves its original quantities in costing',async function() {
    const day='2026-12-09';
    const old=(await applicationPool.query(`INSERT INTO production(production_date,kernel_used,pko_produced,pkc_produced,sludge_produced,production_hours,down_time)
        VALUES($1,10,4,5,1,'08:00','00:00') RETURNING production_id`,[day])).rows[0];
    const movements={};
    for(const [part,item,received,issued] of [['Kernel Issued',ids['P Kernel'],0,10],['PKO Received',ids.PKO,4,0],['PKC Received',ids.PKC,5,0],['Sludge Received',ids.Sludge,1,0]]) {
        const stock=await admin.post('/api/stock_counts').send({count_date:day,item_id:item,received,issued}).expect(201);movements[part]=stock.body.count_id;
    }
    await admin.post('/api/legacy-links/production/'+old.production_id).send({movements}).expect(200);
    const request=(await applicationPool.query("SELECT * FROM weighing_requests WHERE request_type='Production' AND completed_record_id=$1",[old.production_id])).rows[0];
    const baseline=(await applicationPool.query('SELECT * FROM production_batches WHERE request_id=$1',[request.request_id])).rows[0];
    assert.equal(baseline.legacy_batch,true);assert.equal(Number(baseline.pko_produced),4);
    await admin.patch('/api/weighing-requests/'+request.request_id+'/reopen').expect(200);
    await storekeeper.patch('/api/weighing-requests/'+request.request_id+'/complete').send({submission_key:crypto.randomUUID(),kernel_used:2,pko_produced:1,pkc_produced:1,sludge_produced:0}).expect(200);
    const record=(await applicationPool.query('SELECT * FROM production WHERE production_id=$1',[old.production_id])).rows[0];assert.equal(Number(record.pko_produced),5);
    const costs=(await admin.get('/api/average_cost').expect(200)).body.production_costs.filter(row=>row.production_date===day);
    assert.equal(costs.length,1);assert.equal(costs[0].storekeeper_pko_received,5);
});
test('Manual receipt deletion is blocked when later manual usage depends on it',async function() {
    const item=(await applicationPool.query("INSERT INTO items(name,item_type) VALUES('Manual safety item','consumable') RETURNING item_id")).rows[0].item_id;
    const receipt=await admin.post('/api/stock_counts').send({count_date:'2026-12-10',item_id:item,received:50,issued:0}).expect(201);
    await admin.post('/api/stock_counts').send({count_date:'2026-12-11',item_id:item,received:0,issued:30}).expect(201);
    await admin.delete('/api/correction_delete').send({kind:'stock',record:receipt.body}).expect(409);
    assert.equal((await applicationPool.query('SELECT * FROM stock_counts WHERE count_id=$1',[receipt.body.count_id])).rowCount,1);
});

test('Independent kernel issues retain unfinished quantity and cost until products are received',async function() {
    const day='2030-01-02';
    await completedPurchase(day);
    const request=await manager.post('/api/production').send({production_date:day,production_hours:'08:00',down_time:'00:00'}).expect(201);
    const url='/api/weighing-requests/'+request.body.request_id+'/complete';
    await storekeeper.patch(url).send({submission_key:crypto.randomUUID(),kernel_used:20,pko_produced:0,pkc_produced:0,sludge_produced:0}).expect(200);
    const before=(await admin.get('/api/average_cost').expect(200)).body;
    assert.ok(before.work_in_progress.quantity>0);
    assert.ok(before.work_in_progress.value>0);
    await storekeeper.patch(url).send({submission_key:crypto.randomUUID(),kernel_used:0,pko_produced:10,pkc_produced:0,sludge_produced:0}).expect(200);
    const after=(await admin.get('/api/average_cost').expect(200)).body;
    const row=after.production_costs.filter(row=>row.production_date===day).at(-1);
    assert.ok(row.completed_production_cost>0);
    assert.equal(after.work_in_progress.quantity,before.work_in_progress.quantity-10);
    assert.ok(after.work_in_progress.value<before.work_in_progress.value);
});

test('Unfinished quantities are internal costing values and do not add storekeeper controls',async function() {
    const day='2031-01-01';await completedPurchase(day);
    const request=await manager.post('/api/production').send({production_date:day,production_hours:'08:00',down_time:'00:00'}).expect(201);
    const url='/api/weighing-requests/'+request.body.request_id;
    const issue={entry_type:'Issue',kernel_used:20,pko_produced:0,pkc_produced:0,sludge_produced:0};
    await storekeeper.patch(url+'/complete').send({...issue,submission_key:crypto.randomUUID()}).expect(200);
    await storekeeper.patch(url+'/complete').send({entry_type:'Receive',submission_key:crypto.randomUUID(),kernel_used:0,pko_produced:5,pkc_produced:0,sludge_produced:0}).expect(200);
    await storekeeper.patch(url+'/complete').send({...issue,submission_key:crypto.randomUUID()}).expect(200);
    await storekeeper.patch(url+'/complete').send({...issue,entry_type:'Receive',submission_key:crypto.randomUUID()}).expect(400);
    const before=(await admin.get('/api/average_cost').expect(200)).body.work_in_progress;
    const profitBefore=(await admin.get('/api/dashboard_period?date='+day).expect(200)).body.day.total_net_profit;
    await storekeeper.get('/api/production-in-progress').expect(404);
    await storekeeper.patch(url+'/production-loss').send({loss_quantity:2}).expect(404);
    await applicationPool.query('UPDATE production SET process_loss=2 WHERE production_id=(SELECT completed_record_id FROM weighing_requests WHERE request_id=$1)',[request.body.request_id]);
    const after=(await admin.get('/api/average_cost').expect(200)).body.work_in_progress;
    assert.equal(after.quantity,before.quantity-2);
    const profitAfter=(await admin.get('/api/dashboard_period?date='+day).expect(200)).body.day;
    assert.ok(profitAfter.production_loss_cost>0);
    assert.ok(Math.abs((profitBefore-profitAfter.total_net_profit)-profitAfter.production_loss_cost)<0.01);
    const saved=(await applicationPool.query('SELECT process_loss FROM production WHERE production_id=(SELECT completed_record_id FROM weighing_requests WHERE request_id=$1)',[request.body.request_id])).rows[0];
    assert.equal(Number(saved.process_loss),2);
    await storekeeper.patch(url+'/finish').expect(200);
    const closed=(await admin.get('/api/average_cost').expect(200)).body.work_in_progress;
    assert.equal(closed.quantity,after.quantity);assert.equal(closed.value,after.value);
    await storekeeper.patch(url+'/production-loss').send({loss_quantity:1}).expect(404);
});

test('An estimated unfinished balance does not block corrections to actual production entries',async function() {
    const day='2032-01-01';await completedPurchase(day);
    const opening=(await admin.get('/api/average_cost').expect(200)).body.work_in_progress.quantity;
    const request=await manager.post('/api/production').send({production_date:day,production_hours:'08:00',down_time:'00:00'}).expect(201);
    const url='/api/weighing-requests/'+request.body.request_id;
    if(opening>0)await storekeeper.patch(url+'/complete').send({entry_type:'Receive',submission_key:crypto.randomUUID(),kernel_used:0,pko_produced:0,pkc_produced:opening,sludge_produced:0}).expect(200);
    await storekeeper.patch(url+'/complete').send({entry_type:'Issue',submission_key:crypto.randomUUID(),kernel_used:20,pko_produced:0,pkc_produced:0,sludge_produced:0}).expect(200);
    await storekeeper.patch(url+'/complete').send({entry_type:'Receive',submission_key:crypto.randomUUID(),kernel_used:0,pko_produced:0,pkc_produced:20,sludge_produced:0}).expect(200);
    const pending=(await admin.get('/api/weighing-requests').expect(200)).body.find(row=>row.request_id===request.body.request_id);
    const issue=pending.batches.find(row=>Number(row.kernel_used)===20);
    await admin.delete(url+'/batches/'+issue.batch_id).send({version:issue.version}).expect(200);
    assert.equal((await applicationPool.query('SELECT voided FROM production_batches WHERE batch_id=$1',[issue.batch_id])).rows[0].voided,true);
});

test('Individual product receipts update only their selected daily total and inventory',async function() {
    const day='2033-01-01';
    const request=await manager.post('/api/production').send({production_date:day,production_hours:'08:00',down_time:'00:00'}).expect(201);
    const url='/api/weighing-requests/'+request.body.request_id+'/complete';
    const receive=(product,quantity,extra={})=>storekeeper.patch(url).send({entry_type:'Receive',received_product:product,submission_key:crypto.randomUUID(),kernel_used:0,pko_produced:0,pkc_produced:0,sludge_produced:0,[product]:quantity,...extra});
    await receive('pko_produced',25).expect(200);
    await receive('pko_produced',10).expect(200);
    await receive('pkc_produced',40).expect(200);
    await receive('sludge_produced',2).expect(200);
    await receive('pko_produced',1,{pkc_produced:1}).expect(400);
    await receive('pko_produced',1,{received_product:'pkc_produced'}).expect(400);
    await receive('pko_produced',0).expect(400);
    const daily=(await applicationPool.query('SELECT * FROM production WHERE production_date=$1',[day])).rows;
    assert.equal(daily.length,1);
    assert.equal(Number(daily[0].kernel_used),0);
    assert.equal(Number(daily[0].pko_produced),35);
    assert.equal(Number(daily[0].pkc_produced),40);
    assert.equal(Number(daily[0].sludge_produced),2);
    const stock=(await applicationPool.query("SELECT source_part,received,issued FROM stock_counts WHERE source_type='Production' AND source_id=$1",[request.body.request_id])).rows;
    assert.equal(Number(stock.find(row=>row.source_part==='PKO Received').received),35);
    assert.equal(Number(stock.find(row=>row.source_part==='PKC Received').received),40);
    assert.equal(Number(stock.find(row=>row.source_part==='Sludge Received').received),2);
    assert.equal(Number(stock.find(row=>row.source_part==='Kernel Issued').issued),0);
});

test('logout destroys the authenticated session',async function() {
	await manager.post('/api/logout').expect(200);
	await manager.get('/api/current-user').expect(401);
});
