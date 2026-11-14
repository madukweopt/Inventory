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

test('inventory validates decimals and Storekeeper can record stock',async function() {
	const items=await admin.get('/api/items').expect(200);
	for(const item of items.body) ids[item.name]=item.item_id;
	await storekeeper.post('/api/stock_counts').send({
		count_date: '2026-11-13',item_id: ids.PKO,received: 500,issued: '1.234'
	}).expect(400);
	await storekeeper.post('/api/stock_counts').send({
		count_date: '2026-11-13',item_id: ids.PKO,received: 500,issued: 500
	}).expect(201);
	await storekeeper.post('/api/stock_counts').send({
		count_date: '2026-11-13',item_id: ids['P Kernel'],received: 1000,issued: 500
	}).expect(201);
	const stock=await admin.get('/api/stock_counts').expect(200);
	assert.ok(stock.body.some(row => row.name==='PKO'));
});

test('purchases, production and expenses save and appear in their data APIs',async function() {
	await manager.post('/api/purchases').send({
		purchase_date: '2026-11-13',supplier_id: ids.supplier,item_id: ids['P Kernel'],
		quantity_supplied: 1000,unit_cost: 300
	}).expect(201);
	await manager.post('/api/production').send({
		production_date: '2026-11-13',kernel_used: 500,pko_produced: 200,
		pkc_produced: 280,production_hours: '08:00',down_time: '01:00'
	}).expect(201);
	await manager.post('/api/expenses').send({
		expense_date: '2026-11-13',category: 'Expenses',description: 'Test transport',amount_spent: 25000
	}).expect(201);
	assert.equal((await admin.get('/api/purchases').expect(200)).body.length,1);
	assert.equal((await admin.get('/api/production').expect(200)).body.length,1);
	assert.equal((await admin.get('/api/expenses').expect(200)).body.length,1);
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
	const sale=await manager.post('/api/sales').send({
		sales_date: '2026-11-13',customer_id: ids.customer,item_id: ids.PKO,
		quantity: 400,unit_price: 1
	}).expect(201);
	ids.sale=sale.body.sales_id;
	assert.match(sale.body.invoice_number,/^INV-2026-\d{6}$/);

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

test('existing checks detect the difference between Inventory Issued and Sales Quantity',async function() {
	const checks=await admin.get('/api/checks').expect(200);
	const salesDifference=checks.body.find(row =>
		row.item==='PKO'&&row.check_date==='2026-11-13'&&
		row.check_type==='pko_issued vs sold'
	);
	assert.ok(salesDifference,'Expected a PKO difference between 500 kg issued and 400 kg sold');
	assert.equal(Math.abs(Number(salesDifference.difference)),100);
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

test('logout destroys the authenticated session',async function() {
	await manager.post('/api/logout').expect(200);
	await manager.get('/api/current-user').expect(401);
});
