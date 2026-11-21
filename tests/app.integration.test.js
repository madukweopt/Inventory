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

// The driver signs for every dispatch before the Storekeeper confirms it.
const driver={driver_name:'Test Driver',driver_signature:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII='};

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
    const recordFont=await request(app).get('/fonts/Roboto-Variable.ttf').expect(200);
    assert.ok(Number(recordFont.headers['content-length'])>100000,'The record font must be served locally');
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

// The login page posts an ordinary form so phones close the keyboard and can save the password.
test('the login form signs in with a redirect and returns errors to the login page',async function() {
    const form=request.agent(app);
    await form.post('/api/login').type('form').send({username:'manager_test',password:'wrong'})
        .expect(303).expect('Location','/login.html?error=invalid');
    await form.post('/api/login').type('form').set('Origin','https://elsewhere.example').send({username:'manager_test',password:'ManagerPass123'})
        .expect(303).expect('Location','/login.html?error=failed');
    await form.get('/index.html').expect(302);
    await form.post('/api/login').type('form').send({username:'manager_test',password:'ManagerPass123'})
        .expect(303).expect('Location','/index.html');
    await form.get('/index.html').expect(200);
});

test('SOP reader and PDF require login and are available to every staff role',async function(){
    await request(app).get('/sops.html').expect(302).expect('Location','/');
    await request(app).get('/sops.pdf').expect(302).expect('Location','/');
    for(const agent of [admin,manager,storekeeper]){
        const page=await agent.get('/sops.html').expect(200);
        assert.match(page.text,/Table of contents/);
        for(const id of ['workflow','sop-01','sop-02','sop-03','sop-04','sop-05','sop-06']){
            assert.ok(page.text.includes('href="#'+id+'"'));assert.ok(page.text.includes('id="'+id+'"'));
        }
        const pdf=await agent.get('/sops.pdf').expect(200).expect('Content-Type',/application\/pdf/);
        assert.match(pdf.headers['content-disposition'],/SOMAD-Standard-Operating-Procedures.pdf/);
        assert.equal(pdf.body.subarray(0,5).toString(),'%PDF-');
    }
});

test('Only Admin can edit SOPs; saves persist, sanitize unsafe content and keep previous revisions',async function(){
    await request(app).get('/api/sops/editor').expect(401);
    await manager.get('/api/sops/editor').expect(403);await storekeeper.get('/api/sops/editor').expect(403);
    const initial=(await admin.get('/api/sops/editor').expect(200)).body;
    await manager.put('/api/sops').send({html:initial.html,version:initial.version}).expect(403);
    await storekeeper.put('/api/sops').send({html:initial.html,version:initial.version}).expect(403);
    const marker='SOP edit integration marker $&';
    const html=initial.html+'<p onclick="alert(1)">'+marker+'</p><script>alert(1)</script><img src=x onerror="alert(1)">';
    const saved=(await admin.put('/api/sops').send({html,version:initial.version}).expect(200)).body;
    assert.notEqual(saved.version,initial.version);
    const current=(await admin.get('/api/sops/editor').expect(200)).body;
    assert.equal(current.version,saved.version);assert.ok(current.html.includes(marker));assert.doesNotMatch(current.html,/<script|onclick|onerror|<img/);
    const page=await storekeeper.get('/sops.html').expect(200);assert.ok(page.text.includes('SOP edit integration marker $&amp;'));
    const revisions=await applicationPool.query('SELECT content_html FROM sop_revisions ORDER BY revision_id');
    assert.equal(revisions.rows.length,2);assert.ok(!revisions.rows[0].content_html.includes(marker));
    const pdf=await manager.get('/sops.pdf').expect(200).expect('Content-Type',/application\/pdf/);
    assert.equal(pdf.body.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.body.length>10000);
    fs.writeFileSync('/tmp/sop-revision-integration.pdf',pdf.body);
});

test('SOP edits reject stale tabs, incomplete documents and competing saves without overwriting',async function(){
    const initial=(await admin.get('/api/sops/editor').expect(200)).body;
    const responses=await Promise.all(['First competing edit','Second competing edit'].map(value=>admin.put('/api/sops').send({html:initial.html+'<p>'+value+'</p>',version:initial.version})));
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    const current=(await admin.get('/api/sops/editor').expect(200)).body;
    assert.notEqual(current.html.includes('First competing edit'),current.html.includes('Second competing edit'));
    await admin.put('/api/sops').send({html:initial.html,version:initial.version}).expect(409);
    await admin.put('/api/sops').send({html:'<h1>Incomplete manual</h1>',version:current.version}).expect(400);
    assert.equal((await admin.get('/api/sops/editor').expect(200)).body.version,current.version);
    assert.equal(Number((await applicationPool.query('SELECT COUNT(*) FROM sop_revisions')).rows[0].count),3);
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

test('Finished production history is Admin-only, bounded and paginated without repeating or skipping days',async function(){
    const production=await applicationPool.query(`INSERT INTO production(production_date,kernel_used,pko_produced,pkc_produced,sludge_produced)
        SELECT '2040-01-01'::date+n,100,40,55,5 FROM generate_series(0,22) AS n RETURNING production_id`);
    const productionIds=production.rows.map(row=>row.production_id);let requestIds=[];
    try{
        const requests=await applicationPool.query(`INSERT INTO weighing_requests(request_type,request_date,status,created_by,completed_by,completed_record_id,kernel_used,pko_produced,pkc_produced,sludge_produced,production_hours,down_time)
            SELECT 'Production',production_date,'Completed',$1,$1,production_id,100,40,55,5,'8 hours'::interval,'0 hours'::interval
            FROM production WHERE production_id=ANY($2::integer[]) ORDER BY production_date RETURNING request_id`,[ids.adminUser,productionIds]);
        requestIds=requests.rows.map(row=>row.request_id);
        const url='/api/weighing-requests/finished-production';
        await request(app).get(url).expect(401);await manager.get(url).expect(403);await storekeeper.get(url).expect(403);
        const pending=(await admin.get('/api/weighing-requests').expect(200)).body;
        assert.ok(!pending.some(row=>requestIds.includes(row.request_id)));
        const legacy=(await admin.get('/api/weighing-requests?include_completed=true').expect(200)).body;
        assert.ok(legacy.filter(row=>row.status==='Completed').length<=10);
        const first=(await admin.get(url).expect(200)).body;
        assert.equal(first.requests.length,10);assert.equal(first.requests[0].request_date,'2040-01-23');assert.equal(first.has_more,true);
        assert.ok(first.requests.every(row=>row.status==='Completed'&&row.request_type==='Production'&&Number(row.daily_number)===1));
        const second=(await admin.get(url+'?before='+encodeURIComponent(first.next_cursor)).expect(200)).body;
        assert.equal(second.requests.length,10);assert.equal(second.requests[0].request_date,'2040-01-13');
        const third=(await admin.get(url+'?before='+encodeURIComponent(second.next_cursor)).expect(200)).body;
        assert.equal(third.requests.length,3);assert.equal(third.has_more,false);assert.equal(third.next_cursor,null);
        assert.equal(new Set([...first.requests,...second.requests,...third.requests].map(row=>row.request_id)).size,23);
        // Removing a day from the earlier page must not shift or skip the next page.
        await applicationPool.query("UPDATE weighing_requests SET status='Awaiting Storekeeper' WHERE request_id=$1",[first.requests[0].request_id]);
        const after=(await admin.get(url+'?before='+encodeURIComponent(first.next_cursor)).expect(200)).body;
        assert.deepEqual(after.requests.map(row=>row.request_id),second.requests.map(row=>row.request_id));
        assert.equal((await admin.get(url+'?limit=2').expect(200)).body.requests.length,2);
        for(const limit of ['0','51','-1','1.5','invalid'])await admin.get(url+'?limit='+limit).expect(400);
        await admin.get(url+'?before=invalid').expect(400);
        const bad=Buffer.from(JSON.stringify({date:'0000-01-01',id:1})).toString('base64url');await admin.get(url+'?before='+bad).expect(400);
    }finally{
        if(requestIds.length)await applicationPool.query('DELETE FROM weighing_requests WHERE request_id=ANY($1::integer[])',[requestIds]);
        await applicationPool.query('DELETE FROM production WHERE production_id=ANY($1::integer[])',[productionIds]);
    }
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
		count_date: '2026-11-13',item_id: ids.Diesel,received: 500,issued: 20
	}).expect(400,/Could not submit stock/);
	await admin.post('/api/stock_counts').send({
		count_date: '2026-11-13',item_id: ids.Diesel,received: 500,issued: 0
	}).expect(201);
	const stock=await storekeeper.get('/api/stock_counts').expect(200);
	assert.ok(stock.body.some(row => row.name==='Diesel'));
});

test('Manager authorises work and Storekeeper quantities create Purchase and Production records',async function() {
	const purchaseRequest=await manager.post('/api/purchases').send({ordered_quantity:1000,
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
	// The ordered quantity is required, shown to the Storekeeper, and can be changed only while waiting.
	await manager.post('/api/purchases').send({purchase_date:'2026-11-13',supplier_id:ids.supplier,item_id:ids['P Kernel'],unit_cost:300}).expect(400,/quantity ordered/);
	const orderUrl='/api/weighing-requests/'+purchaseRequest.body.request_id+'/ordered-quantity';
	let seen=pending.body.find(row=>row.request_id===purchaseRequest.body.request_id);
	assert.equal(Number(seen.ordered_quantity),1000);assert.equal(seen.can_change_order,false,'The Storekeeper cannot change the order');
	await storekeeper.patch(orderUrl).send({ordered_quantity:1200}).expect(403);
	await manager.patch(orderUrl).send({ordered_quantity:'0'}).expect(400);
	await manager.patch(orderUrl).send({ordered_quantity:1200}).expect(200);
	await admin.patch(orderUrl).send({ordered_quantity:1100}).expect(200);
	seen=(await storekeeper.get('/api/weighing-requests').expect(200)).body.find(row=>row.request_id===purchaseRequest.body.request_id);
	assert.equal(Number(seen.ordered_quantity),1100);
	await storekeeper.patch('/api/weighing-requests/'+purchaseRequest.body.request_id+'/complete').send({
		quantity: 1000,scale_ticket: 'PURCHASE-TICKET-1',vehicle_number: 'TEST-001'
	}).expect(200);
	await admin.patch(orderUrl).send({ordered_quantity:900}).expect(404,/already completed/);
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
	const saleRequest=await manager.post('/api/sales').send({ordered_quantity:1000,
		sales_date: '2026-11-13',customer_id: ids.customer,item_id: ids.PKO,
		quantity: 400,unit_price: 1
	}).expect(201);
	assert.equal(Number(saleRequest.body.unit_price),1000,'Pending Sale must copy the official Prices-page value');
	assert.equal(Number(saleRequest.body.ordered_quantity),1000,'The ordered quantity is saved for the Storekeeper');
	await manager.post('/api/sales').send({sales_date:'2026-11-13',customer_id:ids.customer,item_id:ids.PKO}).expect(400,/quantity the customer ordered/);
	await manager.post('/api/sales').send({sales_date:'2026-11-13',customer_id:ids.customer,item_id:ids.PKO,ordered_quantity:'10.555'}).expect(400);
	const completed=await storekeeper.patch('/api/weighing-requests/'+saleRequest.body.request_id+'/complete').send({
		quantity: 400,scale_ticket: 'SALE-TICKET-1',vehicle_number: 'TEST-002',...driver
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
    assert.equal(saved.dispatch_status,'Completed');
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
    const purchase=day => manager.post('/api/purchases').send({ordered_quantity:1000, purchase_date:day,supplier_id:ids.supplier,item_id:ids['P Kernel'],unit_cost:300 }).expect(201);
    const sale=day => manager.post('/api/sales').send({ordered_quantity:1000, sales_date:day,customer_id:ids.customer,item_id:ids.PKO }).expect(201);
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
    const request=await manager.post('/api/purchases').send({ordered_quantity:1000, purchase_date:day,supplier_id:ids.supplier,item_id:ids['P Kernel'],unit_cost:300 }).expect(201);
    const saved=await storekeeper.patch('/api/weighing-requests/'+request.body.request_id+'/complete').send({ quantity:100 }).expect(200);
    return { requestId:request.body.request_id,record:{ purchase_id:saved.body.record_id,purchase_date:day,supplier_id:ids.supplier,item_id:ids['P Kernel'],quantity_supplied:100,unit_cost:300 } };
}
async function completedSale(day='2026-11-20') {
    const request=await manager.post('/api/sales').send({ordered_quantity:1000, sales_date:day,customer_id:ids.customer,item_id:ids.PKO }).expect(201);
    const saved=await storekeeper.patch('/api/weighing-requests/'+request.body.request_id+'/complete').send({ quantity:10,...driver }).expect(200);
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
test('Signed sale corrections need a reason, synchronise dispatch and cannot be deleted',async function() {
    await admin.post('/api/stock_counts').send({count_date:'2026-11-19',item_id:ids.PKO,received:200,issued:0}).expect(201);
    const sale=await completedSale();
    const record={ ...sale.record,sales_date:'2026-11-21',quantity:12,unit_price:900 };
    await admin.patch('/api/correction_edit').send({ kind:'sales',record }).expect(400);
    await admin.patch('/api/correction_edit').send({ kind:'sales',record:{...record,correction_reason:'Recount at the weighbridge'} }).expect(200);
    const corrections=(await admin.get('/api/delivery-notes/'+record.sales_id).expect(200)).body.note.corrections;
    assert.equal(corrections.length,1);assert.equal(corrections[0].reason,'Recount at the weighbridge');
    assert.equal(corrections[0].previous_values.factory_quantity,10);assert.equal(corrections[0].new_values.factory_quantity,12);assert.equal(corrections[0].new_values.unit_price,900);
    const stock=(await applicationPool.query("SELECT *,to_char(count_date,'YYYY-MM-DD') AS day FROM stock_counts WHERE source_type='Sale' AND source_id=$1",[sale.requestId])).rows[0];
    assert.equal(Number(stock.issued),12);
    assert.equal(stock.day,'2026-11-21');
    const invoice=(await admin.get('/api/sales/'+record.sales_id+'/invoice').expect(200)).body;
    assert.equal(invoice.sale.due_date,'2026-11-21');
    // The driver signed for the goods, so the sale cannot be deleted and its stock movement stays.
    await admin.delete('/api/correction_delete').send({ kind:'sales',record }).expect(409);
    assert.equal((await applicationPool.query("SELECT * FROM stock_counts WHERE source_type='Sale' AND source_id=$1",[sale.requestId])).rowCount,1);
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
    await admin.patch('/api/correction_edit').send({kind:'production',record:{production_id:record.production_id,production_hours:'10:00',down_time:'00:00'}}).expect(200);
    const day=(await admin.get('/api/production').expect(200)).body.find(row=>row.production_id===record.production_id);
    assert.equal(day.request_id,request.body.request_id);
    assert.equal(Number(day.pko_produced),4);
    assert.ok(day.batches[0].batch_id);

});
test('Unlinked production cannot bypass entry corrections by editing daily totals',async function() {
    const original=(await applicationPool.query(`INSERT INTO production(production_date,kernel_used,pko_produced,pkc_produced,sludge_produced,production_hours,down_time)
        VALUES ('2030-01-02',10,4,5,1,'08:00','00:00') RETURNING *`)).rows[0];
    await admin.patch('/api/correction_edit').send({kind:'production',record:{...original,production_date:'2030-01-02',production_hours:'08:00',down_time:'00:00',pko_produced:8}}).expect(409);
    const saved=(await applicationPool.query('SELECT pko_produced FROM production WHERE production_id=$1',[original.production_id])).rows[0];
    assert.equal(Number(saved.pko_produced),4);
    await applicationPool.query('DELETE FROM production WHERE production_id=$1',[original.production_id]);
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
    const body={purchase_date:'2026-12-01',supplier_id:ids.supplier,item_id:ids.Diesel,unit_cost:500,ordered_quantity:1000,authorisation_key:crypto.randomUUID()};
    const results=await Promise.all([manager.post('/api/purchases').send(body),manager.post('/api/purchases').send(body)]);
    assert.ok(results.every(row=>row.status===201));
    assert.equal(results[0].body.request_id,results[1].body.request_id);
    await manager.post('/api/purchases').send({ordered_quantity:1000,...body,unit_cost:600}).expect(409);
    const sale={sales_date:'2026-12-01',customer_id:ids.customer,item_id:ids.PKO,ordered_quantity:1000,authorisation_key:crypto.randomUUID()};
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
    await admin.patch(url).send({...values,pkc_produced:5}).expect(400);
    await admin.patch(url).send(values).expect(200);
    await admin.patch(url).send(values).expect(409);
    const total=(await applicationPool.query('SELECT pko_produced FROM production WHERE production_id=$1',[pending.batches.length? (await applicationPool.query('SELECT completed_record_id FROM weighing_requests WHERE request_id=$1',[request.body.request_id])).rows[0].completed_record_id:0])).rows[0];
    assert.equal(Number(total.pko_produced),15);
    await storekeeper.patch('/api/weighing-requests/'+request.body.request_id+'/finish').expect(response=>assert.equal(response.status,200,response.text));
    await admin.delete(url).send({version:2}).expect(409);
    await admin.patch('/api/weighing-requests/'+request.body.request_id+'/reopen').expect(200);
    await admin.delete(url).send({version:2}).expect(200);
    const reversed=(await applicationPool.query('SELECT * FROM production_batches WHERE batch_id=$1',[batch.batch_id])).rows[0];
    assert.equal(reversed.voided,true);assert.equal(Number(reversed.pko_produced),15);
});
test('Corrections that remove supply needed by later usage roll back completely',async function() {
    const item=(await applicationPool.query("INSERT INTO items(name,item_type) VALUES('Safety test material','raw_material') RETURNING item_id")).rows[0].item_id;
    const request=await manager.post('/api/purchases').send({ordered_quantity:1000,purchase_date:'2026-12-05',supplier_id:ids.supplier,item_id:item,unit_cost:100}).expect(201);
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
    const request=await manager.post('/api/purchases').send({ordered_quantity:1000,purchase_date:'2026-12-08',supplier_id:ids.supplier,item_id:ids.Diesel,unit_cost:100}).expect(201);
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
    const sale=await manager.post('/api/sales').send({ordered_quantity:1000,sales_date:day,customer_id:ids.customer,item_id:ids.PKO}).expect(201);
    await storekeeper.patch('/api/weighing-requests/'+sale.body.request_id+'/complete').send({quantity:3,...driver}).expect(200);
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
    // Finish Day means all material is processed: the 40 kg issued minus 5 kg weighed becomes 35 kg production loss.
    await storekeeper.patch(url+'/finish').expect(200);
    const finishedLoss=(await applicationPool.query('SELECT process_loss FROM production WHERE production_id=(SELECT completed_record_id FROM weighing_requests WHERE request_id=$1)',[request.body.request_id])).rows[0];
    assert.equal(Number(finishedLoss.process_loss),35);
    const closed=(await admin.get('/api/average_cost').expect(200)).body.work_in_progress;
    assert.ok(Math.abs(closed.quantity-(after.quantity-33))<0.001);assert.ok(closed.value<after.value);
    await admin.patch(url+'/reopen').expect(200);
    assert.equal(Number((await applicationPool.query('SELECT process_loss FROM production WHERE production_id=(SELECT completed_record_id FROM weighing_requests WHERE request_id=$1)',[request.body.request_id])).rows[0].process_loss),0);
    await storekeeper.patch(url+'/finish').expect(200);
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

test('New manual movements reject shortages and backdated shortages without changing stock',async function(){
    const item=(await applicationPool.query("INSERT INTO items(name,item_type) VALUES('Stock guard manual','consumable') RETURNING item_id")).rows[0].item_id;
    const save=(day,received,issued)=>admin.post('/api/stock_counts').send({count_date:day,item_id:item,received,issued});
    await save('2060-01-02',100,0).expect(201);
    await save('2060-01-03',0,101).expect(409);
    await save('2060-01-01',0,1).expect(409);
    const rows=(await applicationPool.query('SELECT * FROM stock_counts WHERE item_id=$1',[item])).rows;
    assert.equal(rows.length,1);assert.equal(Number(rows[0].received),100);
    await save('2060-01-03',0,100).expect(201);
});

test('Concurrent dispatches cannot share stock; failed sales remain pending without an invoice',async function(){
    const item=(await applicationPool.query("INSERT INTO items(name,item_type) VALUES('Stock guard product','product') RETURNING item_id")).rows[0].item_id;
    await admin.post('/api/stock_counts').send({count_date:'2060-01-01',item_id:item,received:100,issued:0}).expect(201);
    await admin.post('/api/prices').send({item_id:item,unit_price:100,effective_date:'2060-01-01'}).expect(201);
    const requests=[];
    for(let i=0;i<2;i++)requests.push((await manager.post('/api/sales').send({ordered_quantity:1000,sales_date:'2060-01-02',customer_id:ids.customer,item_id:item,unit_price:100}).expect(201)).body.request_id);
    const results=await Promise.all(requests.map(id=>storekeeper.patch('/api/weighing-requests/'+id+'/complete').send({quantity:60,...driver})));
    assert.deepEqual(results.map(row=>row.status).sort(),[200,409]);
    const failed=requests[results.findIndex(row=>row.status===409)];
    const pending=(await applicationPool.query('SELECT status,completed_record_id FROM weighing_requests WHERE request_id=$1',[failed])).rows[0];
    assert.equal(pending.status,'Awaiting Storekeeper');assert.equal(pending.completed_record_id,null);
    assert.equal((await applicationPool.query('SELECT * FROM sales WHERE item_id=$1',[item])).rowCount,1);
    const balance=(await applicationPool.query('SELECT SUM(received-issued) AS balance FROM stock_counts WHERE item_id=$1',[item])).rows[0];
    assert.equal(Number(balance.balance),40);
});

test('Production can be authorised in advance but a kernel issue cannot exceed stock',async function(){
    const request=(await manager.post('/api/production').send({production_date:'2060-02-01',production_hours:'00:30',down_time:'00:50'}).expect(201)).body;
    const available=Number((await applicationPool.query('SELECT COALESCE(SUM(received-issued),0) AS balance FROM stock_counts WHERE item_id=$1',[ids['P Kernel']])).rows[0].balance);
    await storekeeper.patch('/api/weighing-requests/'+request.request_id+'/complete').send({entry_type:'Issue',submission_key:crypto.randomUUID(),kernel_used:available+1,pko_produced:0,pkc_produced:0,sludge_produced:0}).expect(409);
    assert.equal((await applicationPool.query('SELECT * FROM production_batches WHERE request_id=$1',[request.request_id])).rowCount,0);
    const pending=(await applicationPool.query('SELECT status,completed_record_id FROM weighing_requests WHERE request_id=$1',[request.request_id])).rows[0];
    assert.equal(pending.status,'Awaiting Storekeeper');assert.equal(pending.completed_record_id,null);
    assert.equal((await applicationPool.query("SELECT * FROM production WHERE production_date='2060-02-01'")).rowCount,0);
});

test('Storekeeper daily consumable usage updates daily opening, used and closing balances without purchases or sales',async function(){
    const item=(await applicationPool.query("INSERT INTO items(name,item_type) VALUES('Daily usage test power','consumable') RETURNING item_id")).rows[0].item_id;
    await admin.post('/api/stock_counts').send({count_date:'2070-01-01',item_id:item,received:1000,issued:0}).expect(201);
    const usage={usage_date:'2070-01-02',item_id:item,quantity:75,entry_key:crypto.randomUUID()};
    await request(app).post('/api/consumable-usage').send(usage).expect(401);
    await manager.post('/api/consumable-usage').send(usage).expect(403);
    const saved=(await storekeeper.post('/api/consumable-usage').send(usage).expect(201)).body.record;
    assert.equal(Number(saved.received),0);assert.equal(saved.recorded_by,ids.storekeeperUser);
    await storekeeper.post('/api/consumable-usage').send(usage).expect(200);
    await storekeeper.post('/api/consumable-usage').send({...usage,quantity:76}).expect(409);
    await storekeeper.post('/api/consumable-usage').send({...usage,item_id:ids.PKO,entry_key:crypto.randomUUID()}).expect(400);
    await storekeeper.post('/api/consumable-usage').send({...usage,item_id:ids['P Kernel'],entry_key:crypto.randomUUID()}).expect(400);
    await storekeeper.post('/api/consumable-usage').send({...usage,quantity:1001,entry_key:crypto.randomUUID()}).expect(409);
    await storekeeper.post('/api/consumable-usage').send({...usage,quantity:'1.001',entry_key:crypto.randomUUID()}).expect(400);
    await storekeeper.post('/api/consumable-usage').send({...usage,usage_date:'2070-01-03',quantity:100,entry_key:crypto.randomUUID()}).expect(201);
    const summary=(await storekeeper.get('/api/inventory-summary').expect(200)).body.filter(row=>row.item_id===item);
    const day=summary.find(row=>row.count_date==='2070-01-02');
    assert.deepEqual([day.opening_stock,day.received,day.issued,day.closing_stock].map(Number),[1000,0,75,925]);
    const next=summary.find(row=>row.count_date==='2070-01-03');
    assert.deepEqual([next.opening_stock,next.received,next.issued,next.closing_stock].map(Number),[925,0,100,825]);
    assert.equal((await applicationPool.query('SELECT * FROM purchases WHERE item_id=$1',[item])).rowCount,0);
    assert.equal((await applicationPool.query('SELECT * FROM sales WHERE item_id=$1',[item])).rowCount,0);
    assert.equal((await applicationPool.query('SELECT * FROM stock_counts WHERE item_id=$1',[item])).rowCount,3);
});

test('Repeated daily usage submissions deduct stock once and competing issues cannot overdraw it',async function(){
    const item=(await applicationPool.query("INSERT INTO items(name,item_type) VALUES('Daily usage concurrency','consumable') RETURNING item_id")).rows[0].item_id;
    await admin.post('/api/stock_counts').send({count_date:'2070-02-01',item_id:item,received:1000,issued:0}).expect(201);
    const usage={usage_date:'2070-02-02',item_id:item,quantity:100,entry_key:crypto.randomUUID()};
    const repeated=await Promise.all([storekeeper.post('/api/consumable-usage').send(usage),storekeeper.post('/api/consumable-usage').send(usage)]);
    assert.deepEqual(repeated.map(row=>row.status).sort(),[200,201]);
    const competing=await Promise.all([1,2].map(()=>storekeeper.post('/api/consumable-usage').send({...usage,quantity:600,entry_key:crypto.randomUUID()})));
    assert.deepEqual(competing.map(row=>row.status).sort(),[201,409]);
    const balance=(await applicationPool.query('SELECT SUM(received-issued) AS balance FROM stock_counts WHERE item_id=$1',[item])).rows[0];
    assert.equal(Number(balance.balance),300);
});

test('Daily inventory carries balances over inactive days through today without adding movements',async function(){
    const item=(await applicationPool.query("INSERT INTO items(name,item_type) VALUES('Idle-day sludge','product') RETURNING item_id")).rows[0].item_id;
    const dates=(await applicationPool.query(`SELECT to_char(CURRENT_DATE-5,'YYYY-MM-DD') AS first,
        to_char(CURRENT_DATE-3,'YYYY-MM-DD') AS sold,to_char(CURRENT_DATE-1,'YYYY-MM-DD') AS received,
        to_char(CURRENT_DATE,'YYYY-MM-DD') AS today`)).rows[0];
    await admin.post('/api/stock_counts').send({count_date:dates.first,item_id:item,received:500,issued:0}).expect(201);
    await admin.post('/api/stock_counts').send({count_date:dates.sold,item_id:item,received:0,issued:150}).expect(201);
    await admin.post('/api/stock_counts').send({count_date:dates.received,item_id:item,received:200,issued:0}).expect(201);
    const read=async()=> (await storekeeper.get('/api/inventory-summary').expect(200)).body.filter(row=>row.item_id===item).sort((a,b)=>a.count_date.localeCompare(b.count_date));
    const rows=await read();
    assert.equal(rows.length,6);
    assert.deepEqual(rows.map(row=>[row.opening_stock,row.received,row.issued,row.closing_stock].map(Number)),[
        [0,500,0,500],[500,0,0,500],[500,0,150,350],
        [350,0,0,350],[350,200,0,550],[550,0,0,550]
    ]);
    assert.equal(rows.at(-1).count_date,dates.today);
    assert.equal(rows.at(-1).created_at,null);
    assert.equal((await applicationPool.query('SELECT * FROM stock_counts WHERE item_id=$1',[item])).rowCount,3);
    // Backdated changes must recalculate later idle-day balances, rather than save stale snapshots.
    await applicationPool.query('UPDATE stock_counts SET received=100 WHERE item_id=$1 AND count_date=$2',[item,dates.received]);
    assert.equal(Number((await read()).at(-1).closing_stock),450);
    await applicationPool.query('DELETE FROM stock_counts WHERE item_id=$1 AND count_date=$2',[item,dates.received]);
    assert.equal(Number((await read()).at(-1).closing_stock),350);
});

test('Daily consumable reminders require usage or a no-use confirmation for each item',async function(){
    const item=(await applicationPool.query("INSERT INTO items(name,item_type) VALUES('Reminder test fuel','consumable') RETURNING item_id")).rows[0].item_id;
    const get=async()=> (await storekeeper.get('/api/consumable-checks').expect(200)).body.find(row=>row.item_id===item);
    const pending=await get();assert.equal(pending.status,'Pending');
    await request(app).get('/api/consumable-checks').expect(401);
    await manager.get('/api/consumable-checks').expect(403);
    const payload={item_id:item,check_date:pending.check_date};
    await manager.post('/api/consumable-checks/none').send(payload).expect(403);
    await storekeeper.post('/api/consumable-checks/none').send({...payload,check_date:'2000-01-01'}).expect(409);
    await storekeeper.post('/api/consumable-checks/none').send({...payload,item_id:ids.PKO}).expect(400);
    await storekeeper.post('/api/consumable-checks/none').send(payload).expect(200);
    await storekeeper.post('/api/consumable-checks/none').send(payload).expect(200);
    assert.equal((await get()).status,'None used');
    assert.equal((await applicationPool.query('SELECT * FROM stock_counts WHERE item_id=$1',[item])).rowCount,0);
    const confirmation=(await applicationPool.query('SELECT * FROM daily_consumable_checks WHERE item_id=$1',[item])).rows;
    assert.equal(confirmation.length,1);assert.equal(confirmation[0].recorded_by,ids.storekeeperUser);
    await admin.post('/api/stock_counts').send({count_date:pending.check_date,item_id:item,received:100,issued:0}).expect(201);
    await storekeeper.post('/api/consumable-usage').send({usage_date:pending.check_date,item_id:item,quantity:10,entry_key:crypto.randomUUID()}).expect(201);
    const used=await get();assert.equal(used.status,'Recorded');assert.equal(Number(used.used),10);
    await storekeeper.post('/api/consumable-checks/none').send(payload).expect(409);
    const other=(await applicationPool.query("INSERT INTO items(name,item_type) VALUES('Reminder other fuel','consumable') RETURNING item_id")).rows[0].item_id;
    const checks=(await admin.get('/api/consumable-checks').expect(200)).body;
    assert.equal(checks.find(row=>row.item_id===other).status,'Pending');
    assert.ok(!checks.some(row=>row.item_id===ids.PKO));
    await applicationPool.query('DELETE FROM stock_counts WHERE item_id=$1 AND issued>0',[item]);
    assert.equal((await get()).status,'Pending');
});

test('Overnight production keeps original yield while receipts and corrections use the physical receipt day',async function(){
    const monday='2080-03-04',tuesday='2080-03-05';
    await admin.post('/api/stock_counts').send({count_date:'2080-03-03',item_id:ids['P Kernel'],received:1000,issued:0}).expect(201);
    const request=(await manager.post('/api/production').send({production_date:monday,production_hours:'08:00',down_time:'01:00'}).expect(201)).body;
    const url='/api/weighing-requests/'+request.request_id;
    const save=values=>storekeeper.patch(url+'/complete').send({submission_key:crypto.randomUUID(),kernel_used:0,pko_produced:0,pkc_produced:0,sludge_produced:0,...values});
    await save({movement_date:monday,kernel_used:1000}).expect(200);
    await save({movement_date:monday,pko_produced:300}).expect(200);
    const later={submission_key:crypto.randomUUID(),movement_date:tuesday,kernel_used:0,pko_produced:120,pkc_produced:0,sludge_produced:0};
    await storekeeper.patch(url+'/complete').send(later).expect(200);
    await storekeeper.patch(url+'/complete').send(later).expect(200);
    await storekeeper.patch(url+'/complete').send({...later,movement_date:monday}).expect(409);
    await save({movement_date:'2080-03-03',pko_produced:1}).expect(400);
    const readProduction=async()=> (await storekeeper.get('/api/production').expect(200)).body.find(row=>row.production_date===monday);
    let production=await readProduction();
    assert.equal(Number(production.pko_produced),420);assert.equal(Number(production.pko_yield),42);assert.equal(production.yield_status,'Provisional');
    assert.ok(!(await storekeeper.get('/api/production').expect(200)).body.some(row=>row.production_date===tuesday));
    const getStock=async()=> (await applicationPool.query("SELECT to_char(count_date,'YYYY-MM-DD') AS day,received,issued FROM stock_counts WHERE source_type='Production' AND source_id=$1 AND item_id=$2 ORDER BY count_date",[request.request_id,ids.PKO])).rows;
    let stock=await getStock();assert.deepEqual(stock.map(row=>[row.day,Number(row.received)]),[[monday,300],[tuesday,120]]);
    const batch=production.batches.find(row=>row.submission_key===later.submission_key);
    assert.equal(batch.movement_date.slice(0,10),tuesday);assert.ok(batch.created_at);
    await admin.patch(url+'/batches/'+batch.batch_id).send({version:batch.version,kernel_used:0,pko_produced:100,pkc_produced:0,sludge_produced:0}).expect(200);
    stock=await getStock();assert.deepEqual(stock.map(row=>Number(row.received)),[300,100]);
    production=await readProduction();assert.equal(Number(production.pko_yield),40);
    const checks=(await admin.get('/api/checks').expect(200)).body.filter(row=>row.request_id===request.request_id);assert.deepEqual(checks,[]);
    const costs=(await admin.get('/api/average_cost').expect(200)).body.production_costs;
    assert.equal(costs.find(row=>row.production_date===monday).storekeeper_pko_received,300);
    assert.equal(costs.find(row=>row.production_date===tuesday).storekeeper_pko_received,100);
    await storekeeper.patch(url+'/finish').expect(200);assert.equal((await readProduction()).yield_status,'Final');
    const dashboard=(await admin.get('/api/dashboard_period?date='+monday).expect(200)).body;
    assert.equal(dashboard.day.production.yield_status,'Final');assert.equal(dashboard.day.production.oil_yield,40);
    await save({movement_date:tuesday,pko_produced:1}).expect(409);
    await admin.patch(url+'/reopen').expect(200);assert.equal((await readProduction()).yield_status,'Provisional');
    const fresh=(await readProduction()).batches.find(row=>row.batch_id===batch.batch_id);
    await admin.delete(url+'/batches/'+batch.batch_id).send({version:fresh.version}).expect(200);
    stock=await getStock();assert.deepEqual(stock.map(row=>Number(row.received)),[300,0]);
    assert.deepEqual((await admin.get('/api/checks').expect(200)).body.filter(row=>row.request_id===request.request_id),[]);
});

test('Digital delivery notes separate customer invoice weight from factory stock and allow optional evidence and require signatures and Director approval',async function(){
    const item=(await applicationPool.query("INSERT INTO items(name,item_type) VALUES('Delivery note product','product') RETURNING item_id")).rows[0].item_id;
    await admin.post('/api/stock_counts').send({count_date:'2090-01-01',item_id:item,received:5000,issued:0}).expect(201);
    await admin.post('/api/prices').send({item_id:item,unit_price:100,effective_date:'2090-01-01'}).expect(201);
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=','base64');
    const signature='data:image/png;base64,'+png.toString('base64');
    const authorise=async(basis,representative=ids.managerUser,agent=manager)=> (await agent.post('/api/sales').send({ordered_quantity:1000,sales_date:'2090-01-02',customer_id:ids.customer,item_id:item,billing_basis:basis,representative_id:representative}).expect(201)).body;
    await manager.post('/api/sales').send({ordered_quantity:1000,sales_date:'2090-01-02',customer_id:ids.customer,item_id:item,billing_basis:'Invalid'}).expect(400);
    await manager.post('/api/sales').send({ordered_quantity:1000,sales_date:'2090-01-02',customer_id:ids.customer,item_id:item,billing_basis:'Customer',representative_id:ids.storekeeperUser}).expect(403);
    // The Director is never the accompanying representative, even when authorising the sale themselves.
    await admin.post('/api/sales').send({ordered_quantity:1000,sales_date:'2090-01-02',customer_id:ids.customer,item_id:item,billing_basis:'Factory',representative_id:ids.adminUser}).expect(400);
    await admin.post('/api/sales').send({ordered_quantity:1000,sales_date:'2090-01-02',customer_id:ids.customer,item_id:item,billing_basis:'Factory'}).expect(400);
    assert.ok(!(await admin.get('/api/delivery-representatives').expect(200)).body.some(row=>row.role==='admin'));
    // A factory-weight sale is invoiced at dispatch and leaves Pending Weighing once the driver has signed.
    const dispatchedFactory=await authorise('Factory');
    const factorySale=(await storekeeper.patch('/api/weighing-requests/'+dispatchedFactory.request_id+'/complete').send({quantity:10,vehicle_number:'TEST-F',driver_name:'Driver',driver_signature:signature}).expect(200)).body.record_id;
    for(const agent of [admin,manager,storekeeper])assert.ok(!(await agent.get('/api/delivery-notes/pending').expect(200)).body.some(row=>row.sales_id===factorySale));
    const req=await authorise('Customer');
    const dispatch='/api/weighing-requests/'+req.request_id+'/complete';
    await storekeeper.patch(dispatch).send({quantity:1000,vehicle_number:'TEST-123',scale_ticket:'FACTORY-1'}).expect(400);
    await storekeeper.patch(dispatch).send({quantity:1000,vehicle_number:'TEST-123',driver_name:'Driver',driver_signature:'invalid'}).expect(400);
    await storekeeper.patch(dispatch).send({quantity:1000,vehicle_number:'TEST-123',driver_signature:signature}).expect(400);
    assert.equal((await applicationPool.query('SELECT status FROM weighing_requests WHERE request_id=$1',[req.request_id])).rows[0].status,'Awaiting Storekeeper');
    const id=(await storekeeper.patch(dispatch).send({quantity:1000,vehicle_number:'TEST-123',scale_ticket:'FACTORY-1',driver_name:'Driver',driver_signature:signature}).expect(200)).body.record_id;
    const url='/api/delivery-notes/'+id;
    await request(app).get(url).expect(401);
    await storekeeper.get('/api/sales/'+id+'/invoice').expect(409);
    await manager.post('/api/sales/'+id+'/payments').send({payment_date:'2090-01-02',amount:1,payment_method:'Cash'}).expect(409);
    let note=(await manager.get(url).expect(200)).body;assert.equal(Number(note.note.factory_weight),1000);assert.equal(note.note.billing_basis,'Customer');assert.equal(note.can_confirm,true);
    assert.equal(note.note.driver_name,'Driver');assert.equal(note.note.driver_signature,signature);assert.ok(note.note.driver_signed_at);
    const buyer=(agent,amount=985)=>agent.post(url+'/buyer').field('buyer_name','Buyer witness').field('buyer_weight',String(amount)).field('signature',signature).field('representative_confirmed','true').attach('evidence',png,{filename:'scale-ticket.png',contentType:'image/png'});
    await manager.post(url+'/driver').send({driver_name:'Driver',signature}).expect(403);
    await storekeeper.post(url+'/driver').send({driver_name:'Changed driver',signature}).expect(409);
    await buyer(storekeeper).expect(403);
    await manager.post(url+'/buyer').field('buyer_name','Buyer').field('buyer_weight','985').field('signature',signature).field('representative_confirmed','false').expect(400);
    await manager.post(url+'/buyer').field('buyer_name','Buyer').field('buyer_weight','985').field('signature',signature).field('representative_confirmed','true').attach('evidence',Buffer.from('<html>bad</html>'),{filename:'fake.png',contentType:'image/png'}).expect(400);
    const excessive=buyer(manager);for(let i=0;i<6;i++)excessive.attach('evidence',png,{filename:'extra-'+i+'.png',contentType:'image/png'});await excessive.expect(400);
    await buyer(manager).attach('evidence',Buffer.from('invalid image'),{filename:'bad.png',contentType:'image/png'}).expect(400);
    await buyer(manager).attach('evidence',png,{filename:'second-scale-photo.png',contentType:'image/png'}).expect(200);
    const attachments=(await manager.get(url).expect(200)).body.note.evidence_files;
    assert.equal(attachments.length,2);assert.equal(attachments[0].id,0);assert.equal(attachments[1].name,'second-scale-photo.png');
    const second=await manager.get(url+'/evidence?file='+attachments[1].id).expect(200);assert.ok(second.body.equals(png));
    await manager.get(url+'/evidence?file=-1').expect(400);
    await buyer(manager).expect(409);
    await manager.get('/api/sales/'+id+'/invoice').expect(409);
    await manager.post(url+'/approve').send({}).expect(403);
    const pending=(await admin.get('/api/delivery-notes/pending').expect(200)).body.find(row=>row.sales_id===id);assert.equal(pending.delivery_status,'Awaiting Director approval');
    const proof=await storekeeper.get(url+'/evidence').expect(200);assert.match(proof.headers['content-type'],/image\/png/);assert.ok(proof.body.equals(png));
    await admin.post(url+'/approve').send({}).expect(200);
    const invoice=(await manager.get('/api/sales/'+id+'/invoice').expect(200)).body.sale;
    assert.equal(Number(invoice.quantity),985);assert.equal(Number(invoice.total),98500);assert.match(invoice.invoice_number,/^INV-/);
    await admin.post(url+'/approve').send({}).expect(200);
    assert.equal((await admin.get('/api/sales/'+id+'/invoice').expect(200)).body.sale.invoice_number,invoice.invoice_number);
    const movement=(await applicationPool.query("SELECT * FROM stock_counts WHERE source_type='Sale' AND source_id=$1",[req.request_id])).rows;
    assert.equal(movement.length,1);assert.equal(Number(movement[0].issued),1000);
    assert.equal(Number((await applicationPool.query('SELECT quantity FROM weighing_requests WHERE request_id=$1',[req.request_id])).rows[0].quantity),1000);
    assert.deepEqual((await admin.get('/api/checks').expect(200)).body.filter(row=>row.request_id===req.request_id),[]);
    assert.ok(!(await admin.get('/api/delivery-notes/pending').expect(200)).body.some(row=>row.sales_id===id));
    await admin.patch('/api/correction_edit').send({kind:'sales',record:{sales_id:id,sales_date:'2090-01-02',customer_id:ids.customer,item_id:item,quantity:900,unit_price:100}}).expect(409);
    await admin.delete('/api/correction_delete').send({kind:'sales',record:{sales_id:id}}).expect(409);
    const sale=(await storekeeper.get('/api/sales').expect(200)).body.find(row=>row.sales_id===id);assert.equal(Number(sale.factory_quantity),1000);assert.equal(Number(sale.quantity),985);
    // Equal customer weights finalise once, without a discrepancy approval.
    const equal=await authorise('Customer');const same=(await storekeeper.patch('/api/weighing-requests/'+equal.request_id+'/complete').send({quantity:500,vehicle_number:'EQ-1',...driver}).expect(200)).body.record_id;
    await manager.post('/api/delivery-notes/'+same+'/buyer').field('buyer_name','Buyer').field('buyer_weight','500').field('signature',signature).field('representative_confirmed','true').expect(200);
    assert.equal((await manager.get('/api/delivery-notes/'+same).expect(200)).body.note.has_evidence,false);
    await manager.get('/api/delivery-notes/'+same+'/evidence').expect(404);
    assert.equal(Number((await manager.get('/api/sales/'+same+'/invoice').expect(200)).body.sale.quantity),500);
    // Factory-weight invoices remain based on dispatch even when the buyer weighs differently.
    const factory=await authorise('Factory');const fid=(await storekeeper.patch('/api/weighing-requests/'+factory.request_id+'/complete').send({quantity:500,vehicle_number:'FAC-1',...driver}).expect(200)).body.record_id;
    assert.equal(Number((await manager.get('/api/sales/'+fid+'/invoice').expect(200)).body.sale.quantity),500);
    await manager.post('/api/delivery-notes/'+fid+'/buyer').field('buyer_name','Buyer').field('buyer_weight','490').field('signature',signature).field('representative_confirmed','true').attach('evidence',png,{filename:'scale.png',contentType:'image/png'}).expect(200);
    assert.equal(Number((await manager.get('/api/sales/'+fid+'/invoice').expect(200)).body.sale.quantity),500);
    const delegated=await authorise('Customer',ids.storekeeperUser,admin);assert.equal(delegated.representative_id,ids.storekeeperUser);
    assert.equal((await manager.get('/api/delivery-representatives').expect(200)).body.length,1);
});

test('Receipts and dispatches are dated on the day the goods actually arrive or leave',async function(){
    const purchase=await manager.post('/api/purchases').send({ordered_quantity:1000,purchase_date:'2092-01-01',supplier_id:ids.supplier,item_id:ids['P Kernel'],unit_cost:300}).expect(201);
    const url='/api/weighing-requests/'+purchase.body.request_id+'/complete';
    await storekeeper.patch(url).send({quantity:100,movement_date:'2091-12-31'}).expect(400);
    await storekeeper.patch(url).send({quantity:100,movement_date:'2092-02-30'}).expect(400);
    const saved=(await storekeeper.patch(url).send({quantity:100,movement_date:'2092-01-03'}).expect(200)).body;
    const record=(await applicationPool.query("SELECT to_char(purchase_date,'YYYY-MM-DD') AS day FROM purchases WHERE purchase_id=$1",[saved.record_id])).rows[0];
    assert.equal(record.day,'2092-01-03');
    const stock=(await applicationPool.query("SELECT to_char(count_date,'YYYY-MM-DD') AS day FROM stock_counts WHERE source_type='Purchase' AND source_id=$1",[purchase.body.request_id])).rows[0];
    assert.equal(stock.day,'2092-01-03');
    const sale=await manager.post('/api/sales').send({ordered_quantity:1000,sales_date:'2092-01-03',customer_id:ids.customer,item_id:ids.PKO}).expect(201);
    const sold=(await storekeeper.patch('/api/weighing-requests/'+sale.body.request_id+'/complete').send({quantity:1,vehicle_number:'DATE-1',movement_date:'2092-01-05',...driver}).expect(200)).body;
    const invoice=(await manager.get('/api/sales/'+sold.record_id+'/invoice').expect(200)).body.sale;
    assert.equal(invoice.sales_date,'2092-01-05');assert.equal(invoice.due_date,'2092-01-05');assert.match(invoice.invoice_number,/^INV-2092-/);
    assert.deepEqual((await admin.get('/api/checks').expect(200)).body.filter(row=>[purchase.body.request_id,sale.body.request_id].includes(row.request_id)),[]);
});

test('Director reverses a wrong payment; the receipt stays marked reversed and the amount is owed again',async function(){
    const {record}=await completedSale('2092-02-01');
    const paid=(await manager.post('/api/sales/'+record.sales_id+'/payments').send({payment_date:'2092-02-01',amount:4000,payment_method:'Cash'}).expect(201)).body;
    const reverseUrl='/api/sales/'+record.sales_id+'/payments/'+paid.payment_id+'/reverse';
    await manager.post(reverseUrl).send({reason:'Wrong customer'}).expect(403);
    await admin.post(reverseUrl).send({reason:' '}).expect(400);
    await admin.post(reverseUrl).send({reason:'Paid by another customer'}).expect(200);
    await admin.post(reverseUrl).send({reason:'Again'}).expect(409);
    const invoice=(await manager.get('/api/sales/'+record.sales_id+'/invoice').expect(200)).body;
    assert.equal(Number(invoice.sale.amount_paid),0);
    assert.equal(invoice.payments.length,1);assert.equal(invoice.payments[0].receipt_number,paid.receipt_number);
    assert.ok(invoice.payments[0].reversed_at);assert.equal(invoice.payments[0].reversal_reason,'Paid by another customer');
    const listed=(await admin.get('/api/sales').expect(200)).body.find(row=>row.sales_id===record.sales_id);
    assert.equal(Number(listed.amount_remaining),10000);
    await manager.post('/api/sales/'+record.sales_id+'/payments').send({payment_date:'2092-02-02',amount:10000,payment_method:'Bank Transfer'}).expect(201);
    await admin.delete('/api/correction_delete').send({kind:'sales',record:{sales_id:record.sales_id}}).expect(409);
});

test('Dashboard separates delivery shortfall and stock write-offs from cost of products sold without changing net profit',async function(){
    const day='2093-01-02';
    await completedPurchase('2093-01-01');
    const production=await manager.post('/api/production').send({production_date:'2093-01-01',production_hours:'08:00',down_time:'00:00'}).expect(201);
    const url='/api/weighing-requests/'+production.body.request_id+'/complete';
    await storekeeper.patch(url).send({submission_key:crypto.randomUUID(),kernel_used:100,pko_produced:0,pkc_produced:0,sludge_produced:0}).expect(200);
    await storekeeper.patch(url).send({submission_key:crypto.randomUUID(),kernel_used:0,pko_produced:60,pkc_produced:0,sludge_produced:0}).expect(200);
    await storekeeper.patch(url).send({submission_key:crypto.randomUUID(),kernel_used:0,pko_produced:0,pkc_produced:35,sludge_produced:0}).expect(200);
    await storekeeper.patch('/api/weighing-requests/'+production.body.request_id+'/finish').expect(200);
    assert.equal(Number((await applicationPool.query('SELECT process_loss FROM production WHERE production_date=$1',['2093-01-01'])).rows[0].process_loss),5);
    const productionDay=(await manager.get('/api/dashboard_period?date=2093-01-01').expect(200)).body.day.production;
    assert.equal(productionDay.production_loss,5);assert.equal(productionDay.kernel_used,100);
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=','base64');
    const signature='data:image/png;base64,'+png.toString('base64');
    const sale=(await manager.post('/api/sales').send({ordered_quantity:1000,sales_date:day,customer_id:ids.customer,item_id:ids.PKO,billing_basis:'Customer'}).expect(201)).body;
    const saleId=(await storekeeper.patch('/api/weighing-requests/'+sale.request_id+'/complete').send({quantity:20,vehicle_number:'SHORT-1',...driver}).expect(200)).body.record_id;
    await manager.post('/api/delivery-notes/'+saleId+'/buyer').field('buyer_name','Buyer').field('buyer_weight','18').field('signature',signature).field('representative_confirmed','true').expect(200);
    await admin.post('/api/delivery-notes/'+saleId+'/approve').send({}).expect(200);
    const before=(await admin.get('/api/dashboard_period?date='+day).expect(200)).body.day;
    assert.ok(before.delivery_shortfall_cost>0);
    assert.ok(Math.abs(before.delivery_shortfall_cost*9-before.cost_of_goods_sold.pko)<0.01);
    await admin.post('/api/stock_counts').send({count_date:day,item_id:ids.PKO,received:0,issued:5,adjustment_reason:'Not a reason'}).expect(400);
    await admin.post('/api/stock_counts').send({count_date:day,item_id:ids.PKO,received:0,issued:5,adjustment_reason:'Spill'}).expect(201);
    const after=(await admin.get('/api/dashboard_period?date='+day).expect(200)).body.day;
    assert.ok(after.stock_loss_costs.Spill>0);assert.equal(after.stock_loss_cost,after.stock_loss_costs.Spill);
    assert.ok(Math.abs(after.cost_of_goods_sold.pko-before.cost_of_goods_sold.pko)<0.01);
    assert.ok(Math.abs((before.total_net_profit-after.total_net_profit)-after.stock_loss_cost)<0.01);
    const recorded=(await applicationPool.query("SELECT recorded_by,adjustment_reason FROM stock_counts WHERE source_type='Manual' AND count_date=$1 AND item_id=$2",[day,ids.PKO])).rows[0];
    assert.equal(recorded.recorded_by,ids.adminUser);assert.equal(recorded.adjustment_reason,'Spill');
});

test('Paid salaries are locked, invalid customers and expenses are rejected, and repeated failed sign-ins are paused',async function(){
    const paid=(await applicationPool.query("SELECT payroll_id FROM payroll WHERE payment_status='Paid' LIMIT 1")).rows[0];
    assert.ok(paid,'An earlier test marks a payroll record as paid');
    await admin.patch('/api/payroll/'+paid.payroll_id).send({bonus:100,deduction:0,payment_status:'Pending',payment_date:null}).expect(409);
    const customers=(await admin.get('/api/customers').expect(200)).body.length;
    await manager.post('/api/customers').send({name:'Missing details'}).expect(400);
    assert.equal((await admin.get('/api/customers').expect(200)).body.length,customers);
    await manager.post('/api/expenses').send({expense_date:'2093-03-01',category:'Expenses',description:'Bad amount',amount_spent:'abc'}).expect(400);
    await manager.post('/api/expenses').send({expense_date:'not a date',category:'Expenses',description:'Bad date',amount_spent:10}).expect(400);
    for(let attempt=0;attempt<5;attempt++)await request(app).post('/api/login').send({username:'locked_test_user',password:'wrong'}).expect(400);
    await request(app).post('/api/login').send({username:'locked_test_user',password:'wrong'}).expect(429);
});

test('Other partners: capital jobs become assets, running payments become one expense, and only the Director pays',async function(){
    await storekeeper.get('/api/partners').expect(403);
    await manager.post('/api/partners').send({name:' '}).expect(400);
    const partner=(await manager.post('/api/partners').send({name:'Test Fabricator',phone:'08011111111',work_type:'Welding'}).expect(201)).body;
    await manager.post('/api/partners/'+partner.partner_id+'/jobs').send({job_date:'2094-01-02',job_type:'Fabrication',description:'Settling tank',agreed_amount:500000}).expect(400);
    const tank=(await manager.post('/api/partners/'+partner.partner_id+'/jobs').send({job_date:'2094-01-02',job_type:'Fabrication',description:'Settling tank',agreed_amount:500000,asset_type:'Tank'}).expect(201)).body;
    assert.equal(tank.cost_category,'Capital');
    const assetFor=async jobId=>(await admin.get('/api/capital-assets').expect(200)).body.find(row=>row.job_id===jobId);
    assert.equal(Number((await assetFor(tank.job_id)).cost),500000);
    const expensesBefore=(await admin.get('/api/expenses').expect(200)).body.length;
    await manager.post('/api/partner-jobs/'+tank.job_id+'/payments').send({payment_date:'2094-01-03',amount:200000,payment_method:'Cash'}).expect(403);
    await admin.post('/api/partner-jobs/'+tank.job_id+'/payments').send({payment_date:'2094-01-03',amount:600000,payment_method:'Cash'}).expect(400);
    await admin.post('/api/partner-jobs/'+tank.job_id+'/payments').send({payment_date:'2094-01-03',amount:200000,payment_method:'Cash'}).expect(201);
    assert.equal((await admin.get('/api/expenses').expect(200)).body.length,expensesBefore,'Capital payments are not running expenses');
    assert.equal(Number((await assetFor(tank.job_id)).paid),200000);
    await manager.patch('/api/partner-jobs/'+tank.job_id).send({job_date:'2094-01-02',job_type:'Repair',description:'Settling tank',agreed_amount:500000,cost_category:'Running'}).expect(409);
    await manager.patch('/api/partner-jobs/'+tank.job_id).send({job_date:'2094-01-02',job_type:'Fabrication',description:'Settling tank',agreed_amount:100000,asset_type:'Tank'}).expect(409);
    const repair=(await manager.post('/api/partners/'+partner.partner_id+'/jobs').send({job_date:'2094-02-01',job_type:'Repair',description:'Weld hopper',agreed_amount:80000}).expect(201)).body;
    assert.equal(repair.cost_category,'Running');assert.equal(await assetFor(repair.job_id),undefined);
    const paid=(await admin.post('/api/partner-jobs/'+repair.job_id+'/payments').send({payment_date:'2094-02-02',amount:80000,payment_method:'Bank Transfer',reference_number:'TRF-1'}).expect(201)).body;
    const expense=(await admin.get('/api/expenses').expect(200)).body.find(row=>row.expense_id===paid.expense_id);
    assert.equal(Number(expense.amount_spent),80000);assert.equal(expense.category,'Expenses');assert.match(expense.description,/Test Fabricator: Weld hopper/);
    await admin.patch('/api/correction_edit').send({kind:'expenses',record:{...expense,expense_date:'2094-02-02',amount_spent:1}}).expect(409);
    await admin.delete('/api/correction_delete').send({kind:'expenses',record:expense}).expect(409);
    const jobs=(await manager.get('/api/partners/'+partner.partner_id+'/jobs').expect(200)).body;
    assert.equal(jobs.length,2);assert.equal(Number(jobs.find(row=>row.job_id===tank.job_id).owed),300000);assert.equal(jobs.find(row=>row.job_id===repair.job_id).payments.length,1);
    const listed=(await manager.get('/api/partners').expect(200)).body.find(row=>row.partner_id===partner.partner_id);
    assert.equal(Number(listed.total_agreed),580000);assert.equal(Number(listed.total_paid),280000);assert.equal(Number(listed.balance_owed),300000);
    await admin.delete('/api/partner-jobs/'+repair.job_id).expect(409);
    await admin.delete('/api/partner-payments/'+paid.payment_id).expect(200);
    assert.ok(!(await admin.get('/api/expenses').expect(200)).body.some(row=>row.expense_id===paid.expense_id),'Deleting the payment removes its expense');
    await manager.post('/api/expenses').send({expense_date:'2094-03-01',category:'Asset/Capital Expenditure',description:'Machine',amount_spent:1000}).expect(400);
    await manager.post('/api/capital-assets').send({name:'Scale',asset_type:'Machine',acquired_date:'2094-03-01',cost:650000}).expect(403);
    const scale=(await admin.post('/api/capital-assets').send({name:'Scale',asset_type:'Machine',acquired_date:'2094-03-01',cost:650000,source:'Scale shop'}).expect(201)).body;
    assert.equal(Number((await admin.get('/api/capital-assets').expect(200)).body.find(row=>row.asset_id===scale.asset_id).paid),650000);
    await admin.delete('/api/capital-assets/'+(await assetFor(tank.job_id)).asset_id).expect(409);
    await admin.delete('/api/capital-assets/'+scale.asset_id).expect(200);
    // Testing stage: the Director can delete any partner, removing its jobs, payments, their running expenses and asset entries.
    await manager.delete('/api/partners/'+partner.partner_id).expect(403);
    const unused=(await manager.post('/api/partners').send({name:'Unused Dealer'}).expect(201)).body;
    const quote=(await manager.post('/api/partners/'+unused.partner_id+'/jobs').send({job_date:'2094-04-01',job_type:'Equipment purchase',description:'Quoted crusher',agreed_amount:900000,asset_type:'Machine'}).expect(201)).body;
    const service=(await manager.post('/api/partners/'+unused.partner_id+'/jobs').send({job_date:'2094-04-02',job_type:'Repair',description:'Fix pump',agreed_amount:40000}).expect(201)).body;
    const fee=(await admin.post('/api/partner-jobs/'+service.job_id+'/payments').send({payment_date:'2094-04-03',amount:40000,payment_method:'Cash'}).expect(201)).body;
    await admin.post('/api/partner-jobs/'+quote.job_id+'/payments').send({payment_date:'2094-04-03',amount:100000,payment_method:'Cash'}).expect(201);
    assert.ok(await assetFor(quote.job_id));
    await admin.delete('/api/partners/'+unused.partner_id).expect(200);
    assert.equal(await assetFor(quote.job_id),undefined);
    assert.ok(!(await admin.get('/api/expenses').expect(200)).body.some(row=>row.expense_id===fee.expense_id),'Its running expenses are removed too');
    assert.ok(!(await manager.get('/api/partners').expect(200)).body.some(row=>row.partner_id===unused.partner_id));
});

test('Expenses paid in advance are spread over their months, with start-up months reported separately',async function(){
    await manager.post('/api/expenses').send({expense_date:'2095-01-10',category:'Expenses',description:'Rent',amount_spent:1200000,spread_months:12,startup_months:13}).expect(400);
    await manager.post('/api/expenses').send({expense_date:'2095-01-10',category:'Expenses',description:'Rent',amount_spent:1200000,spread_months:61}).expect(400);
    const before=(await admin.get('/api/dashboard_period?date=2095-07-10').expect(200)).body;
    await manager.post('/api/expenses').send({expense_date:'2095-01-10',category:'Expenses',description:'Rent',amount_spent:1200000,spread_months:12}).expect(403);
    const rent=(await admin.post('/api/expenses').send({expense_date:'2095-01-10',category:'Expenses',description:'Factory rent, 2095',amount_spent:1200000,spread_months:12,startup_months:5}).expect(201)).body;
    assert.equal(rent.spread_months,12);assert.equal(rent.startup_months,5);
    const march=(await admin.get('/api/dashboard_period?date=2095-03-15').expect(200)).body.month.expenses;
    assert.ok(Math.abs(march.startup_costs-100000)<0.01);assert.equal(march.total_expenses,0);
    const july=(await admin.get('/api/dashboard_period?date=2095-07-10').expect(200)).body;
    assert.ok(Math.abs(july.month.expenses.total_expenses-100000)<0.01);assert.equal(july.month.expenses.startup_costs,0);
    assert.ok(Math.abs(july.day.expenses.total_expenses-100000/31)<0.01);
    assert.ok(Math.abs(july.month.expenses.spread_expenses-100000)<0.01,'Rent is reported on its own line');assert.equal(march.spread_expenses,0,'Start-up months are not running rent');
    // Next year's rent, added by the Director with Add Rent or Prepaid Cost after production started, has no start-up months.
    const nextRent=(await admin.post('/api/expenses').send({expense_date:'2096-01-05',category:'Expenses',description:'Factory rent, 2096',amount_spent:1200000,spread_months:12}).expect(201)).body;
    assert.equal(nextRent.spread_months,12);assert.equal(nextRent.startup_months,0);
    const feb=(await admin.get('/api/dashboard_period?date=2096-02-10').expect(200)).body;
    assert.ok(Math.abs(feb.month.expenses.spread_expenses-100000)<0.01);assert.ok(Math.abs(feb.day.expenses.spread_expenses-100000/29)<0.01);assert.equal(feb.month.expenses.startup_costs,0);
    assert.ok(Math.abs((before.month.total_net_profit-july.month.total_net_profit)-100000)<0.01);
    assert.ok(Math.abs((await admin.get('/api/dashboard_period?date=2096-01-10').expect(200)).body.month.expenses.total_expenses-100000)<0.01,'Only the new year\'s rent is counted after the first 12 months');
    const listed=(await admin.get('/api/expenses').expect(200)).body.find(row=>row.expense_id===rent.expense_id);
    assert.equal(listed.spread_months,12);
    await storekeeper.get('/api/startup-costs').expect(403);
    await manager.get('/api/startup-costs').expect(403);
    await manager.post('/api/expenses').send({expense_date:'2095-01-10',category:'Expenses',description:'CAC registration',amount_spent:20000,spread_months:1,startup_months:1}).expect(403);
    const startup=(await admin.get('/api/startup-costs').expect(200)).body.find(row=>row.expense_id===rent.expense_id);
    assert.equal(Number(startup.startup_amount),500000);
    // The Expenses form sends no months, so an edit there keeps the saved spreading and start-up months.
    const {spread_months,startup_months,...plain}=listed;
    await admin.patch('/api/correction_edit').send({kind:'expenses',record:{...plain,description:'Factory rent, 2095 (edited)'}}).expect(200);
    const kept=(await admin.get('/api/expenses').expect(200)).body.find(row=>row.expense_id===rent.expense_id);
    assert.equal(kept.spread_months,12);assert.equal(kept.startup_months,5);
    await admin.patch('/api/correction_edit').send({kind:'expenses',record:{...listed,spread_months:6,startup_months:0}}).expect(200);
    assert.ok(Math.abs((await admin.get('/api/dashboard_period?date=2095-03-15').expect(200)).body.month.expenses.total_expenses-200000)<0.01);
    // The Director edits a start-up cost's months before production and deletes a start-up cost from its card.
    const fee=(await admin.post('/api/expenses').send({expense_date:'2095-02-01',category:'Expenses',description:'Registration fee',amount_spent:20000,spread_months:1,startup_months:1}).expect(201)).body;
    const lease=(await admin.post('/api/expenses').send({expense_date:'2095-01-01',category:'Expenses',description:'Store lease',amount_spent:600000,spread_months:6,startup_months:2}).expect(201)).body;
    await admin.patch('/api/correction_edit').send({kind:'expenses',record:{expense_id:lease.expense_id,expense_date:'2095-01-01',category:'Expenses',description:'Store lease',amount_spent:600000,spread_months:6,startup_months:3}}).expect(200);
    assert.equal(Number((await admin.get('/api/startup-costs').expect(200)).body.find(row=>row.expense_id===lease.expense_id).startup_amount),300000);
    await admin.delete('/api/correction_delete').send({kind:'expenses',record:{expense_id:fee.expense_id}}).expect(200);
    assert.ok(!(await admin.get('/api/startup-costs').expect(200)).body.some(row=>row.expense_id===fee.expense_id));
});

test('Manual stock changes keep a Director-only history of creates, edits and deletes',async function(){
    const item=(await applicationPool.query("INSERT INTO items(name,item_type) VALUES('History trail item','consumable') RETURNING item_id")).rows[0].item_id;
    const created=(await admin.post('/api/stock_counts').send({count_date:'2080-01-01',item_id:item,received:50,issued:0,adjustment_reason:'Count difference'}).expect(201)).body;
    await admin.patch('/api/correction_edit').send({kind:'stock',record:{count_id:created.count_id,count_date:'2080-01-02',item_id:item,received:40,issued:0,adjustment_reason:'Other'}}).expect(200);
    await admin.delete('/api/correction_delete').send({kind:'stock',record:{count_id:created.count_id}}).expect(200);
    await manager.get('/api/stock-change-history').expect(403);
    await storekeeper.get('/api/stock-change-history').expect(403);
    const history=(await admin.get('/api/stock-change-history').expect(200)).body.rows.filter(row=>row.count_id===created.count_id);
    assert.deepEqual(history.map(row=>row.action),['Deleted','Edited','Created'],'Newest first');
    const [deleted,edited,first]=history;
    assert.equal(first.after_values.count_date,'2080-01-01');assert.equal(Number(first.after_values.received),50);assert.equal(first.after_values.adjustment_reason,'Count difference');
    assert.equal(first.after_item,'History trail item');assert.ok(first.changed_by);
    assert.equal(Number(edited.before_values.received),50);assert.equal(Number(edited.after_values.received),40);
    assert.equal(edited.after_values.count_date,'2080-01-02');assert.equal(edited.after_values.adjustment_reason,'Other');
    assert.equal(deleted.after_values,null);assert.equal(Number(deleted.before_values.received),40);
    // A refused change leaves no history row.
    await admin.post('/api/stock_counts').send({count_date:'2080-01-03',item_id:item,received:5,issued:5}).expect(400);
    assert.equal((await applicationPool.query("SELECT count(*)::int AS n FROM stock_change_history WHERE after_values->>'count_date'='2080-01-03'")).rows[0].n,0);
});

test('logout destroys the authenticated session',async function() {
	await manager.post('/api/logout').expect(200);
	await manager.get('/api/current-user').expect(401);
});
