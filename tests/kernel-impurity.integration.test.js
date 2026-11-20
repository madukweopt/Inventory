const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {Pool}=require('pg');
const argon2=require('argon2');
const request=require('supertest');
require('dotenv').config({quiet:true});
const schema='kernel_quality_test_'+crypto.randomBytes(6).toString('hex');
let adminPool,pool,server,admin,manager,storekeeper,purchaseId,otherId;
const firstKey=crypto.randomUUID();
test.before(async()=>{
    const url=new URL(process.env.TEST_DATABASE_URL||process.env.DATABASE_URL);url.hostname=url.hostname.replace('-pooler','');
    adminPool=new Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true}});
    await adminPool.query('CREATE SCHEMA "'+schema+'"');
    url.searchParams.set('options','-c search_path='+schema);
    pool=new Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true}});
    await pool.query(fs.readFileSync(path.join(__dirname,'../database/schema.sql'),'utf8'));
    const hash=await argon2.hash('kernel-test-password');
    for(const role of ['admin','manager','storekeeper'])await pool.query('INSERT INTO users(username,password_hash,role) VALUES($1,$2,$1)',[role,hash]);
    await pool.query("INSERT INTO items(name,item_type) VALUES('P Kernel','raw_material'),('Diesel','consumable')");
    const supplier=(await pool.query("INSERT INTO suppliers(name) VALUES('Sample supplier') RETURNING supplier_id")).rows[0].supplier_id;
    const purchases=await pool.query("INSERT INTO purchases(purchase_date,item_id,quantity_supplied,unit_cost,supplier_id) SELECT CURRENT_DATE,item_id,5000,300,$1 FROM items WHERE name IN ('P Kernel','Diesel') RETURNING purchase_id,item_id",[supplier]);
    const kernel=(await pool.query("SELECT item_id FROM items WHERE name='P Kernel'")).rows[0].item_id;
    purchaseId=purchases.rows.find(row=>row.item_id===kernel).purchase_id;otherId=purchases.rows.find(row=>row.item_id!==kernel).purchase_id;
    process.env.DATABASE_URL=url.toString();server=require('../backend/server');
    [admin,manager,storekeeper]=['admin','manager','storekeeper'].map(()=>request.agent(server.app));
    for(const [agent,role] of [[admin,'admin'],[manager,'manager'],[storekeeper,'storekeeper']])assert.equal((await agent.post('/api/login').send({username:role,password:'kernel-test-password'})).status,200);
});
test.after(async()=>{
    if(server)await server.pool.end();if(pool)await pool.end();
    if(adminPool){await adminPool.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');await adminPool.end();}
});
const endpoint=()=>'/api/purchases/'+purchaseId+'/kernel-tests';
const sample=(total,impurity,key=crypto.randomUUID())=>({sample_weight_g:total,impurity_weight_g:impurity,entry_key:key});
test('Sample weights produce exact individual results and a weighted combined result without changing stock or costs',async()=>{
    const before=(await pool.query('SELECT * FROM purchases ORDER BY purchase_id')).rows;
    const response=await storekeeper.post(endpoint()).send(sample(1000,40,firstKey));
    assert.equal(response.status,201,response.text);assert.equal(response.body.summary.impurity_percentage,4);assert.equal(response.body.summary.clean_percentage,96);
    const second=await admin.post(endpoint()).send(sample(500,50));assert.equal(second.status,201,second.text);
    assert.equal(second.body.summary.impurity_percentage,6);assert.equal(second.body.summary.clean_percentage,94);
    assert.equal(second.body.summary.test_count,2);assert.equal(second.body.summary.sample_weight_g,1500);assert.equal(second.body.summary.impurity_weight_g,90);
    assert.equal(Number(second.body.tests[0].impurity_percentage),4);assert.equal(Number(second.body.tests[1].impurity_percentage),10);
    assert.deepEqual((await pool.query('SELECT * FROM purchases ORDER BY purchase_id')).rows,before);
    assert.equal(Number((await pool.query('SELECT COUNT(*) FROM stock_counts')).rows[0].count),0);
    assert.equal(Number((await pool.query('SELECT COUNT(*) FROM sale_payments')).rows[0].count),0);
});
test('Retries do not double-count samples and changed retry payloads are rejected',async()=>{
    const retry=await storekeeper.post(endpoint()).send(sample('1000','40',firstKey));assert.equal(retry.status,200,retry.text);assert.equal(retry.body.summary.test_count,2);
    assert.equal((await storekeeper.post(endpoint()).send(sample(1000,41,firstKey))).status,409);
});
test('Managers can read quality tests while write and deletion permissions are enforced',async()=>{
    assert.equal((await request(server.app).get(endpoint())).status,401);
    assert.equal((await manager.get(endpoint())).status,200);
    assert.equal((await manager.post(endpoint()).send(sample(1000,10))).status,403);
    const first=(await admin.get(endpoint())).body.tests[0];
    assert.equal((await storekeeper.delete(endpoint()+'/'+first.test_id)).status,403);
});
test('Invalid weights, excessive precision, non-kernel purchases and missing purchases are rejected',async()=>{
    for(const [total,impurity] of [[0,0],[-1,0],[100,101],[100,-1],['',0],[100,''],['NaN',0],[1.0001,0],[100,null],[true,0],[100,Infinity]]){
        assert.equal((await admin.post(endpoint()).send(sample(total,impurity))).status,400,JSON.stringify([total,impurity]));
    }
    assert.equal((await admin.post('/api/purchases/'+otherId+'/kernel-tests').send(sample(100,1))).status,400);
    assert.equal((await admin.post('/api/purchases/2147483647/kernel-tests').send(sample(100,1))).status,404);
});
test('Admin deletion recalculates the combined result and zero/all impurity samples remain valid',async()=>{
    const second=(await admin.get(endpoint())).body.tests[1];
    const deleted=await admin.delete(endpoint()+'/'+second.test_id);assert.equal(deleted.status,200,deleted.text);assert.equal(deleted.body.summary.impurity_percentage,4);
    const zero=await storekeeper.post(endpoint()).send(sample('0.001','0'));assert.equal(zero.status,201,zero.text);assert.equal(Number(zero.body.tests.at(-1).impurity_percentage),0);
    const all=await storekeeper.post(endpoint()).send(sample('0.001','0.001'));assert.equal(all.status,201,all.text);assert.equal(Number(all.body.tests.at(-1).impurity_percentage),100);
    for(const row of all.body.tests)assert.equal((await admin.delete(endpoint()+'/'+row.test_id)).status,200);
    const empty=await admin.get(endpoint());assert.equal(empty.body.summary.impurity_percentage,null);assert.equal(empty.body.summary.clean_percentage,null);assert.equal(empty.body.summary.test_count,0);
});
test('Purchases with quality tests cannot be changed to another material and backups preserve tests',async()=>{
    const saved=await admin.post(endpoint()).send(sample(1000,40));assert.equal(saved.status,201,saved.text);
    const row=(await pool.query('SELECT * FROM purchases WHERE purchase_id=$1',[purchaseId])).rows[0];
    const other=(await pool.query('SELECT item_id FROM purchases WHERE purchase_id=$1',[otherId])).rows[0];
    const changed=await admin.patch('/api/correction_edit').send({kind:'purchases',record:{...row,purchase_date:'2026-11-15',item_id:other.item_id}});
    assert.equal(changed.status,409,changed.text);assert.match(changed.body.err,/sample tests/);
    const os=require('node:os');const directory=fs.mkdtempSync(path.join(os.tmpdir(),'kernel-quality-backup-'));
    try{
        const {backupApplicationData,restoreApplicationData}=require('../backend/seed');
        const filename=path.join(directory,'backup.json');await backupApplicationData(pool,filename);
        await pool.query('DELETE FROM kernel_impurity_tests');
        const counts=await restoreApplicationData(pool,filename);assert.equal(counts.kernel_impurity_tests,1);
        const restored=await admin.get(endpoint());assert.equal(restored.status,200,restored.text);assert.equal(restored.body.summary.impurity_percentage,4);
    }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('Database constraints reject impossible weights and removing a purchase leaves no orphan quality tests',async()=>{
    const user=(await pool.query("SELECT user_id FROM users WHERE role='admin'")).rows[0].user_id;
    await assert.rejects(pool.query('INSERT INTO kernel_impurity_tests(purchase_id,sample_weight_g,impurity_weight_g,entry_key,recorded_by) VALUES($1,100,101,$2,$3)',[purchaseId,crypto.randomUUID(),user]),/check constraint/);
    await admin.post(endpoint()).send(sample(1000,40));
    await pool.query('DELETE FROM purchases WHERE purchase_id=$1',[purchaseId]);
    assert.equal(Number((await pool.query('SELECT COUNT(*) FROM kernel_impurity_tests')).rows[0].count),0);
});
async function authoriseReceipt(item='P Kernel'){
    const row=(await pool.query('SELECT item_id FROM items WHERE name=$1',[item])).rows[0];
    const supplier=(await pool.query('SELECT supplier_id FROM suppliers LIMIT 1')).rows[0];
    return (await manager.post('/api/purchases').send({ordered_quantity:1000,purchase_date:'2026-11-15',item_id:row.item_id,supplier_id:supplier.supplier_id,unit_cost:300}).expect(201)).body;
}
test('First kernel receipt saves its sample, purchase and full stock quantity together, and retries create no duplicates',async()=>{
    const authorised=await authoriseReceipt();
    const body={quantity:1000,scale_ticket:'FIRST-KERNEL-TEST',kernel_test:sample(1000,40)};
    const receipt=await storekeeper.patch('/api/weighing-requests/'+authorised.request_id+'/complete').send(body);
    assert.equal(receipt.status,200,receipt.text);
    const quality=await manager.get('/api/purchases/'+receipt.body.record_id+'/kernel-tests');
    assert.equal(quality.status,200,quality.text);assert.equal(quality.body.summary.test_count,1);assert.equal(quality.body.summary.impurity_percentage,4);
    const purchased=(await pool.query('SELECT * FROM purchases WHERE purchase_id=$1',[receipt.body.record_id])).rows[0];
    assert.equal(Number(purchased.quantity_supplied),1000);assert.equal(Number(purchased.unit_cost),300);
    const stock=(await pool.query("SELECT received FROM stock_counts WHERE source_type='Purchase' AND source_id=$1",[authorised.request_id])).rows;
    assert.equal(stock.length,1);assert.equal(Number(stock[0].received),1000);
    assert.equal((await storekeeper.patch('/api/weighing-requests/'+authorised.request_id+'/complete').send(body)).status,409);
    assert.equal((await manager.get('/api/purchases/'+receipt.body.record_id+'/kernel-tests')).body.summary.test_count,1);
    const next=await storekeeper.post('/api/purchases/'+receipt.body.record_id+'/kernel-tests').send(sample(500,50));
    assert.equal(next.status,201,next.text);assert.equal(next.body.summary.impurity_percentage,6);
});
test('Invalid first samples roll back the entire receipt and leave authorisations available for correction',async()=>{
    const authorised=await authoriseReceipt();
    const before=Number((await pool.query('SELECT COUNT(*) FROM purchases')).rows[0].count);
    for(const invalid of [sample(0,0),sample(100,101),{sample_weight_g:1000,entry_key:crypto.randomUUID()},null]){
        const result=await storekeeper.patch('/api/weighing-requests/'+authorised.request_id+'/complete').send({quantity:1000,kernel_test:invalid});
        assert.equal(result.status,400,result.text);
    }
    assert.equal(Number((await pool.query('SELECT COUNT(*) FROM purchases')).rows[0].count),before);
    assert.equal((await pool.query('SELECT status FROM weighing_requests WHERE request_id=$1',[authorised.request_id])).rows[0].status,'Awaiting Storekeeper');
    assert.equal(Number((await pool.query("SELECT COUNT(*) FROM stock_counts WHERE source_type='Purchase' AND source_id=$1",[authorised.request_id])).rows[0].count),0);
    const corrected=await storekeeper.patch('/api/weighing-requests/'+authorised.request_id+'/complete').send({quantity:1000,kernel_test:sample(1000,0)});
    assert.equal(corrected.status,200,corrected.text);
    assert.equal((await manager.get('/api/purchases/'+corrected.body.record_id+'/kernel-tests')).body.summary.impurity_percentage,0);
});
test('First sample is optional, and non-kernel receipts cannot carry a kernel sample',async()=>{
    const kernel=await authoriseReceipt();
    const plain=await storekeeper.patch('/api/weighing-requests/'+kernel.request_id+'/complete').send({quantity:1000});assert.equal(plain.status,200,plain.text);
    const quality=await manager.get('/api/purchases/'+plain.body.record_id+'/kernel-tests');assert.equal(quality.body.summary.test_count,0);
    const diesel=await authoriseReceipt('Diesel');
    const rejected=await storekeeper.patch('/api/weighing-requests/'+diesel.request_id+'/complete').send({quantity:100,kernel_test:sample(1000,10)});assert.equal(rejected.status,400,rejected.text);
    assert.equal((await pool.query('SELECT status FROM weighing_requests WHERE request_id=$1',[diesel.request_id])).rows[0].status,'Awaiting Storekeeper');
    assert.equal((await storekeeper.patch('/api/weighing-requests/'+diesel.request_id+'/complete').send({quantity:100})).status,200);
});
