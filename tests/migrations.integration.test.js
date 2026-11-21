// Database changes (migrations): each file runs once, failures leave nothing behind, an empty database is built
// from schema.sql, and an unrecorded database is only recorded as up to date after it is checked.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Pool}=require('pg');
const projectRoot=path.join(__dirname,'..');
require('dotenv').config({ path: path.join(projectRoot,'.env'),quiet:true });
const {migrate,baseline,migrationStatus}=require('../backend/migrations');

const baseDatabaseUrl=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
const unpooled=url=>{const parsed=new URL(url);parsed.hostname=parsed.hostname.replace('-pooler','');return parsed.toString();};
const schemas=[];let administration;

// A pool whose tables live in a new, empty schema that is dropped after the tests.
async function emptySchemaPool() {
    const schema='inventory_test_'+crypto.randomBytes(6).toString('hex');
    await administration.query('CREATE SCHEMA "'+schema+'"');schemas.push(schema);
    const url=new URL(unpooled(baseDatabaseUrl));url.searchParams.set('options','-c search_path='+schema);
    return new Pool({connectionString:url.toString(),ssl:require('../backend/database-ssl').databaseSsl(),max:2});
}
// A copy of the real migration files plus any extra test files.
function migrationDir(extra={}) {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inventory-migrations-'));
    for(const name of fs.readdirSync(path.join(projectRoot,'database','migrations'))) fs.copyFileSync(path.join(projectRoot,'database','migrations',name),path.join(dir,name));
    for(const [name,text] of Object.entries(extra)) fs.writeFileSync(path.join(dir,name),text);
    return dir;
}
const exists=async(pool,table)=>(await pool.query("SELECT to_regclass(current_schema()||'.'||$1) IS NOT NULL AS found",[table])).rows[0].found;

test.before(async()=>{
    assert.ok(baseDatabaseUrl,'Set TEST_DATABASE_URL or DATABASE_URL before running tests');
    administration=new Pool({connectionString:unpooled(baseDatabaseUrl),ssl:require('../backend/database-ssl').databaseSsl(),max:1});
});
test.after(async()=>{
    for(const schema of schemas) await administration.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');
    await administration.end();
});

test('an empty database is built from schema.sql with every current file recorded, and new files run exactly once',async()=>{
    const pool=await emptySchemaPool();
    try {
        const first=await migrate(pool,{dir:migrationDir()});
        assert.equal(first.created,true);
        assert.ok(await exists(pool,'users'));assert.ok(await exists(pool,'activity_log'));
        let status=await migrationStatus(pool,{dir:migrationDir()});
        assert.ok(status.files.length>=18&&status.files.every(file=>file.state==='applied'&&file.baseline));
        assert.deepEqual((await migrate(pool,{dir:migrationDir()})).applied,[]);

        // A new change file: applied once. It would fail if run again (CREATE TABLE has no IF NOT EXISTS).
        const dir=migrationDir({'20991231_test_change.sql':'CREATE TABLE migration_test_table(id integer);'});
        assert.deepEqual((await migrate(pool,{dir})).applied,['20991231_test_change.sql']);
        assert.ok(await exists(pool,'migration_test_table'));
        assert.deepEqual((await migrate(pool,{dir})).applied,[]);
        status=await migrationStatus(pool,{dir});
        assert.equal(status.files.find(file=>file.name==='20991231_test_change.sql').state,'applied');

        // A file edited after it was applied is reported, not run again.
        const messages=[];
        const edited=migrationDir({'20991231_test_change.sql':'CREATE TABLE migration_test_table(id integer); -- edited'});
        assert.deepEqual((await migrate(pool,{dir:edited,log:message=>messages.push(message)})).changed,['20991231_test_change.sql']);
        assert.ok(messages.some(message=>/edited after they were applied/.test(message)));
        assert.equal((await migrationStatus(pool,{dir:edited})).files.find(file=>file.name==='20991231_test_change.sql').state,'changed');
    } finally { await pool.end(); }
});

test('a change that fails leaves nothing behind and is not recorded, and later files wait for it',async()=>{
    const pool=await emptySchemaPool();
    try {
        await migrate(pool,{dir:migrationDir()});
        const dir=migrationDir({'20991230_broken.sql':'CREATE TABLE half_done(id integer);\nSELECT 1/0;','20991231_after.sql':'CREATE TABLE after_broken(id integer);'});
        await assert.rejects(migrate(pool,{dir}),error=>error.code==='MIGRATION_FAILED'&&/20991230_broken\.sql/.test(error.message));
        assert.equal(await exists(pool,'half_done'),false);
        assert.equal(await exists(pool,'after_broken'),false);
        const status=await migrationStatus(pool,{dir});
        assert.equal(status.files.find(file=>file.name==='20991230_broken.sql').state,'pending');
    } finally { await pool.end(); }
});

test('a database with tables but no record is refused until a checked baseline, which fails if anything is missing',async()=>{
    const pool=await emptySchemaPool();
    try {
        // Tables exist but no record: as for a database set up by hand.
        const schemaSql=fs.readFileSync(path.join(projectRoot,'database','schema.sql'),'utf8');
        await pool.query(schemaSql);
        await assert.rejects(migrate(pool,{dir:migrationDir()}),error=>error.code==='UNTRACKED');

        // Missing a column: baseline refuses and names it, and records nothing.
        await pool.query('ALTER TABLE sale_payments DROP COLUMN submission_key');
        await assert.rejects(baseline(pool,{dir:migrationDir()}),error=>error.code==='NOT_UP_TO_DATE'&&/sale_payments\.submission_key/.test(error.message));
        assert.equal(await exists(pool,'schema_migrations'),false);
        assert.equal((await administration.query("SELECT count(*)::int AS n FROM pg_namespace WHERE nspname LIKE 'migration_check_%'")).rows[0].n,0);

        // Once complete, baseline records every file, and migrate then has nothing to do.
        await pool.query('ALTER TABLE sale_payments ADD COLUMN submission_key uuid');
        await assert.rejects(baseline(pool,{dir:migrationDir()}),error=>/index sale_payments_submission_key/.test(error.message));
        await pool.query('CREATE UNIQUE INDEX sale_payments_submission_key ON sale_payments(submission_key) WHERE submission_key IS NOT NULL');
        const recorded=await baseline(pool,{dir:migrationDir()});
        assert.ok(recorded.length>=18);
        assert.deepEqual((await migrate(pool,{dir:migrationDir()})).applied,[]);
    } finally { await pool.end(); }
});
