// Carry-over into a new live database: only the real records arrive, with their numbers and links kept,
// new records continue after them, and the import refuses anything but a new, set-up, confirmed database.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {Pool}=require('pg');
const projectRoot=path.join(__dirname,'..');
require('dotenv').config({ path: path.join(projectRoot,'.env'),quiet:true });
const {databaseSsl}=require('../backend/database-ssl');
const {migrate}=require('../backend/migrations');
const {exportCarryOver,importCarryOver}=require('../backend/carry-over');

const baseDatabaseUrl=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
const unpooled=url=>{const parsed=new URL(url);parsed.hostname=parsed.hostname.replace('-pooler','');return parsed.toString();};
const schemas=[];let administration,databaseName;
async function schemaPool() {
    const schema='inventory_test_'+crypto.randomBytes(6).toString('hex');
    await administration.query('CREATE SCHEMA "'+schema+'"');schemas.push(schema);
    const url=new URL(unpooled(baseDatabaseUrl));url.searchParams.set('options','-c search_path='+schema);
    return new Pool({connectionString:url.toString(),ssl:databaseSsl(),max:2});
}
const count=async(pool,sql,params=[])=>Number((await pool.query(sql,params)).rows[0].n);

test.before(async()=>{
    administration=new Pool({connectionString:unpooled(baseDatabaseUrl),ssl:databaseSsl(),max:1});
    databaseName=(await administration.query('SELECT current_database() AS name')).rows[0].name;
});
test.after(async()=>{
    for(const schema of schemas) await administration.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');
    await administration.end();
});

test('only the real records carry over, with numbers and links kept, into a new set-up database only',async()=>{
    // The development database: real partner and asset records alongside test business records.
    const source=await schemaPool(),target=await schemaPool(),unready=await schemaPool();
    try {
        await source.query(fs.readFileSync(path.join(projectRoot,'database','schema.sql'),'utf8'));
        await source.query(`INSERT INTO users(user_id,username,password_hash,role) VALUES (1,'director','hash-1','admin'),(4,'keeper','hash-4','storekeeper'),(5,'boss','hash-5','manager')`);
        await source.query(`INSERT INTO items(name,item_type) VALUES ('P Kernel','raw_material'),('PKO','product'),('Diesel','consumable')`);
        await source.query(`INSERT INTO service_partners(partner_id,name,work_type) VALUES (2,'Welder One','Fabrication'),(7,'Fitter Two','Installation')`);
        await source.query(`INSERT INTO partner_jobs(job_id,partner_id,job_date,job_type,description,agreed_amount,cost_category,created_by)
            VALUES (9,2,'2026-08-01','Fabrication','Filter press',2000000,'Capital',1),(12,7,'2026-09-01','Repair','Pump repair',50000,'Running',5)`);
        await source.query(`INSERT INTO expenses(expense_id,expense_date,category,description,amount_spent,spread_months,startup_months) VALUES
            (174,'2026-01-05','Expenses','Factory rent',1200000,12,5),(176,'2026-06-30','Expenses','CAC registration',20000,1,1),
            (180,'2026-09-02','Expenses','Pump repair payment',50000,1,0),(181,'2026-09-03','Expenses','Test fuel',9000,1,0)`);
        await source.query(`INSERT INTO partner_payments(payment_id,job_id,payment_date,amount,payment_method,recorded_by,expense_id) VALUES
            (3,9,'2026-08-05',1000000,'Bank Transfer',1,NULL),(4,12,'2026-09-02',50000,'Cash',4,180)`);
        await source.query(`INSERT INTO capital_assets(asset_id,name,asset_type,acquired_date,cost,job_id,created_by) VALUES
            (8,'Filter press','Machine','2026-08-20',2000000,9,1),(11,'CCTV Camera','Other','2026-08-17',180000,NULL,1)`);
        await source.query(`INSERT INTO customers(name) VALUES ('Test customer')`);
        await source.query(`INSERT INTO sop_revisions(revision_id,content_html,saved_by,created_at) VALUES
            (1,'<h2>Manual</h2><p>Supplied wording</p>','director','2026-11-16T10:00:00Z'),(2,'<h2>Manual</h2><p>Corrected receiving step</p>','director','2026-11-17T10:00:00Z')`);

        const payload=await exportCarryOver(source);
        assert.deepEqual(payload.tables.expenses.map(row=>row.expense_id),[174,176,180],'start-up, prepaid and partner-payment expenses only');
        assert.equal(payload.tables.users.length,3);assert.equal(payload.tables.capital_assets.length,2);

        // The live database, set up the way the server does on first start.
        await migrate(target);
        await migrate(unready).catch(()=>{});await unready.query('DROP TABLE schema_migrations');

        await assert.rejects(importCarryOver(target,payload,{confirmDatabase:'wrong-name'}),error=>error.code==='NOT_CONFIRMED');
        await assert.rejects(importCarryOver(unready,payload,{confirmDatabase:databaseName}),error=>error.code==='NOT_SET_UP');
        await assert.rejects(importCarryOver(target,{format:'other'},{confirmDatabase:databaseName}),error=>error.code==='BAD_FILE');

        // A dry run checks and counts but keeps nothing.
        const dry=await importCarryOver(target,payload,{confirmDatabase:databaseName,dryRun:true});
        assert.equal(dry.counts.capital_assets,2);
        assert.equal(await count(target,'SELECT count(*) AS n FROM users'),0);

        const result=await importCarryOver(target,payload,{confirmDatabase:databaseName});
        assert.deepEqual(result.counts,{items:3,users:3,sop_revisions:2,service_partners:2,partner_jobs:2,expenses:3,partner_payments:2,capital_assets:2});
        // The corrected manual comes across with who saved it and when, so staff see the same latest wording.
        const sop=(await target.query("SELECT revision_id,content_html,saved_by,created_at FROM sop_revisions ORDER BY revision_id")).rows;
        assert.equal(sop.length,2);assert.match(sop[1].content_html,/Corrected receiving step/);assert.equal(sop[1].saved_by,'director');
        assert.equal(sop[1].created_at.toISOString(),'2026-11-17T10:00:00.000Z');
        // Numbers and links kept; nothing else came across.
        assert.equal(await count(target,"SELECT count(*) AS n FROM capital_assets WHERE asset_id=8 AND job_id=9 AND created_by=1"),1);
        assert.equal(await count(target,"SELECT count(*) AS n FROM partner_payments WHERE payment_id=4 AND job_id=12 AND expense_id=180 AND recorded_by=4"),1);
        assert.equal(await count(target,"SELECT count(*) AS n FROM users WHERE username='keeper' AND password_hash='hash-4' AND role='storekeeper'"),1);
        assert.equal(await count(target,"SELECT count(*) AS n FROM expenses WHERE expense_id=181"),0);
        assert.equal(await count(target,'SELECT count(*) AS n FROM customers'),0);
        // Items: the new database's Sludge kept, the others added once by name.
        assert.deepEqual((await target.query('SELECT name FROM items ORDER BY name')).rows.map(row=>row.name),['Diesel','P Kernel','PKO','Sludge']);
        // New records continue after the copied numbers.
        assert.ok(Number((await target.query("INSERT INTO expenses(expense_date,category,description,amount_spent) VALUES ('2026-12-01','Expenses','New',1) RETURNING expense_id")).rows[0].expense_id)>180);
        assert.ok(Number((await target.query("INSERT INTO service_partners(name) VALUES ('New partner') RETURNING partner_id")).rows[0].partner_id)>7);
        assert.ok(Number((await target.query("INSERT INTO users(username,password_hash,role) VALUES ('new','h','manager') RETURNING user_id")).rows[0].user_id)>5);

        // A second import, or one into a database already in use, is refused.
        await assert.rejects(importCarryOver(target,payload,{confirmDatabase:databaseName}),error=>error.code==='NOT_EMPTY');
    } finally { await source.end();await target.end();await unready.end(); }
});
