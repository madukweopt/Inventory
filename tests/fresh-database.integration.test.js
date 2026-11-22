// A database exactly like the live one on day one: every table empty except the login accounts and the basic
// items. Every read must work on it, and every kind of record must be enterable for the first time, so nothing
// assumes a record already exists (as the company details once did).
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const path=require('node:path');
const {Pool}=require('pg');
const request=require('supertest');
const argon2=require('argon2');
const projectRoot=path.join(__dirname,'..');
require('dotenv').config({ path: path.join(projectRoot,'.env'),quiet:true });
const {databaseSsl}=require('../backend/database-ssl');
const {migrate}=require('../backend/migrations');

const baseDatabaseUrl=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
const schema='inventory_test_'+crypto.randomBytes(6).toString('hex');
let administration,pool,app,server;
const agents={};
const today=new Date().toISOString().slice(0,10);

test.before(async()=>{
    const base=new URL(baseDatabaseUrl);base.hostname=base.hostname.replace('-pooler','');
    administration=new Pool({connectionString:base.toString(),ssl:databaseSsl(),max:1});
    await administration.query('CREATE SCHEMA "'+schema+'"');
    const url=new URL(base.toString());url.searchParams.set('options','-c search_path='+schema);
    const setup=new Pool({connectionString:url.toString(),ssl:databaseSsl(),max:1});
    // Built the way the server builds a new live database, then given only what the carry-over brings.
    await migrate(setup);
    for(const [id,username,role] of [[1,'director','admin'],[4,'keeper','storekeeper'],[5,'boss','manager']]) {
        await setup.query('INSERT INTO users(user_id,username,password_hash,role) VALUES($1,$2,$3,$4)',[id,username,await argon2.hash('Fresh-'+username),role]);
    }
    await setup.query("SELECT setval(pg_get_serial_sequence('users','user_id'),5)");
    await setup.query(`INSERT INTO items(name,item_type) VALUES ('P Kernel','raw_material'),('PKO','product'),('PKC','product'),('Diesel','consumable'),('Electricity','consumable')`);
    await setup.end();
    process.env.DATABASE_URL=url.toString();process.env.SESSION_SECRET='fresh-database-test-secret';process.env.NODE_ENV='test';
    server=require('../backend/server.js');app=server.app;pool=server.pool;
    for(const [role,username] of [['admin','director'],['manager','boss'],['storekeeper','keeper']]) {
        agents[role]=request.agent(app);
        await agents[role].post('/api/login').send({username,password:'Fresh-'+username}).expect(200);
    }
});
test.after(async()=>{
    if(pool) await pool.end();
    await administration.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');await administration.end();
});

// Every GET route of the app, from Express's own route table.
function getRoutes() {
    const out=[];
    (function walk(stack){for(const layer of stack){
        if(layer.route&&layer.route.methods.get)for(const p of [].concat(layer.route.path))out.push(p);
        else if(layer.handle&&layer.handle.stack)walk(layer.handle.stack);
    }})(app.router.stack);
    return [...new Set(out)].filter(p=>typeof p==='string');
}

test('every page and data request works on a new database (no server errors)',async()=>{
    const filters='?date='+today+'&period=month&from=2026-01-01&to='+today+'&item_id=1&limit=10&offset=0';
    const failures=[];
    for(const route of getRoutes()) {
        const address=route.replace(/:kind/,'sales').replace(/:[A-Za-z]+/g,'1');
        for(const role of ['admin','manager','storekeeper']) for(const query of ['',filters]) {
            const response=await agents[role].get(address+query);
            if(response.status>=500) failures.push(role+' GET '+address+query+' → '+response.status+' '+String(response.text).slice(0,120));
        }
    }
    assert.deepEqual(failures,[],'server errors on a new database:\n'+failures.join('\n'));
});

test('company details can be read before any are saved, and the first save creates them',async()=>{
    const before=await agents.admin.get('/api/company');
    assert.ok(before.status<500);
    const saved=await agents.admin.patch('/api/company').field('company_name','First Company').field('remove_logo','false').expect(200);
    assert.equal(saved.body.company_name,'First Company');
});

test('each kind of record can be entered for the first time',async()=>{
    const {admin,manager,storekeeper}=agents;
    const items=Object.fromEntries((await admin.get('/api/items').expect(200)).body.map(item=>[item.name,item.item_id]));
    // First price, supplier and customer.
    await admin.post('/api/prices').send({item_id:items.PKO,unit_price:1700,effective_date:today}).expect(201);
    const supplier=(await manager.post('/api/suppliers').send({name:'First Supplier',phone:'08010000000',address:'Supplier Road',email:'s@example.com',note:''}).expect(201)).body;
    const customer=(await manager.post('/api/customers').send({name:'First Customer',phone:'08020000000',address:'Customer Road',email:'c@example.com',note:''}).expect(201)).body;
    // First purchase, received with the first kernel sample test.
    const purchase=(await manager.post('/api/purchases').send({ordered_quantity:1000,purchase_date:today,supplier_id:supplier.supplier_id,item_id:items['P Kernel'],unit_cost:300}).expect(201)).body;
    await storekeeper.patch('/api/weighing-requests/'+purchase.request_id+'/complete').send({quantity:1000,movement_date:today,
        kernel_test:{sample_weight_g:'100',impurity_weight_g:'4',entry_key:crypto.randomUUID()}}).expect(200);
    // First production: kernel and products together, then Finish Day.
    const production=(await manager.post('/api/production').send({production_date:today,production_hours:'08:00',down_time:'00:00'}).expect(201)).body;
    const entry=(type,field,quantity)=>({entry_type:type,submission_key:crypto.randomUUID(),kernel_used:0,pko_produced:0,pkc_produced:0,sludge_produced:0,[field]:quantity,...(type==='Receive'?{received_product:field}:{})});
    await storekeeper.patch('/api/weighing-requests/'+production.request_id+'/complete').send({movement_date:today,
        entries:[entry('Issue','kernel_used',500),entry('Receive','pko_produced',200),entry('Receive','pkc_produced',280)]}).expect(200);
    await storekeeper.patch('/api/weighing-requests/'+production.request_id+'/finish').expect(200);
    // First sale, dispatched with the driver's signature, then the first payment.
    const sale=(await manager.post('/api/sales').send({ordered_quantity:100,sales_date:today,customer_id:customer.customer_id,item_id:items.PKO,billing_basis:'Factory',representative_id:5}).expect(201)).body;
    const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=';
    const saleId=(await storekeeper.patch('/api/weighing-requests/'+sale.request_id+'/complete').send({quantity:100,movement_date:today,vehicle_number:'FIRST-1',driver_name:'First Driver',driver_signature:signature}).expect(200)).body.record_id;
    await manager.get('/api/sales/'+saleId+'/invoice').expect(200);
    await manager.post('/api/sales/'+saleId+'/payments').send({payment_date:today,amount:1000,payment_method:'Cash',submission_key:crypto.randomUUID()}).expect(201);
    await manager.get('/api/delivery-notes/'+saleId).expect(200);
    // First expense, first manual stock change and first daily usage of a consumable.
    await manager.post('/api/expenses').send({expense_date:today,category:'Expenses',description:'First expense',amount_spent:5000,submission_key:crypto.randomUUID()}).expect(201);
    await admin.post('/api/stock_counts').send({count_date:today,item_id:items.Diesel,received:50,issued:0,adjustment_reason:'Count difference',submission_key:crypto.randomUUID()}).expect(201);
    const usage=await storekeeper.post('/api/consumable-usage').send({usage_date:today,item_id:items.Diesel,quantity:5,entry_key:crypto.randomUUID()});
    assert.ok(usage.status<300,'daily usage: '+usage.status+' '+usage.text);
    // First employee and first payroll.
    const employee=await admin.post('/api/employees').field('start_date','2026-01-01').field('name','First Employee').field('phone','08030000000')
        .field('address','Staff Road').field('email','e@example.com').field('role','Machine Operator').field('salary','100000').field('note','');
    assert.equal(employee.status,201,employee.text);
    const payroll=await admin.post('/api/payroll/generate').send({payroll_month:today.slice(0,7)+'-01',month:today.slice(0,7)});
    assert.ok(payroll.status<500,'payroll: '+payroll.status+' '+payroll.text);
    // With records in place, the reports still work.
    for(const address of ['/api/dashboard','/api/average_cost','/api/checks?date='+today,'/api/dashboard_period?period=month&date='+today,'/api/activity-log'])
        assert.ok((await admin.get(address)).status<500,address);
});
