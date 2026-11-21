// Database changes (migrations). Each file in database/migrations changes the database once: a new table, a new
// column, or a one-time correction of records. The database keeps a list of the files it has received
// (schema_migrations), so each file runs exactly once, in date order, fully or not at all.
//
// When the server starts it applies any new files before taking requests:
// - an empty database is built from database/schema.sql, and every current file is recorded as included;
// - a database that has its list gets only the files not on it;
// - a database with tables but no list has never been recorded. The server stops and asks for
//   `npm run migrate -- --baseline`, which first checks the database really matches schema.sql.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const root=path.join(__dirname,'..');
const DEFAULTS={dir:path.join(root,'database','migrations'),schemaFile:path.join(root,'database','schema.sql')};
const LOCK=91003; // held per transaction only, so it is safe through Neon's connection pooler

const fail=(message,code)=>Object.assign(new Error(message),{code});
const checksum=text=>crypto.createHash('sha256').update(text).digest('hex');
// schema.sql opens and closes its own transaction; the runner supplies one around the whole file instead.
const withoutTransaction=text=>text.replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gim,'');

function migrationFiles(dir) {
    return fs.readdirSync(dir).filter(name=>/^\d{8}_[\w-]+\.sql$/.test(name)).sort()
        .map(name=>{const text=fs.readFileSync(path.join(dir,name),'utf8');return {name,text,checksum:checksum(text)};});
}

async function ensureListTable(client) {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now(),
        baseline boolean NOT NULL DEFAULT false
    )`);
}
async function tableExists(client,name) {
    return (await client.query("SELECT to_regclass(current_schema()||'.'||$1) IS NOT NULL AS found",[name])).rows[0].found;
}

// Which files are applied, pending, or were edited after they were applied.
async function migrationStatus(pool,options={}) {
    const {dir}={...DEFAULTS,...options};
    const files=migrationFiles(dir);
    const client=await pool.connect();
    try {
        const tracked=await tableExists(client,'schema_migrations');
        const rows=tracked?(await client.query('SELECT filename,checksum,applied_at,baseline FROM schema_migrations')).rows:[];
        const applied=new Map(rows.map(row=>[row.filename,row]));
        return {
            tracked,
            hasAppTables:await tableExists(client,'users'),
            files:files.map(file=>({name:file.name,state:!applied.has(file.name)?'pending':applied.get(file.name).checksum!==file.checksum?'changed':'applied',
                appliedAt:applied.get(file.name)?.applied_at||null,baseline:applied.get(file.name)?.baseline||false}))
        };
    } finally { client.release(); }
}

// Compares this database with a fresh copy built from schema.sql: every table, column and index the schema
// defines must be present. Used before recording a database as up to date.
async function missingFromSchema(client,schemaFile) {
    const check='migration_check_'+crypto.randomBytes(5).toString('hex');
    const current=(await client.query('SELECT current_schema() AS name')).rows[0].name;
    await client.query('SAVEPOINT schema_check');
    try {
        await client.query(`CREATE SCHEMA "${check}"`);
        await client.query(`SET LOCAL search_path TO "${check}"`);
        await client.query(withoutTransaction(fs.readFileSync(schemaFile,'utf8')));
        const columns=(await client.query(`SELECT c.table_name||'.'||c.column_name AS name FROM information_schema.columns c
            JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
            WHERE c.table_schema=$1 AND NOT EXISTS (SELECT 1 FROM information_schema.columns d
                WHERE d.table_schema=$2 AND d.table_name=c.table_name AND d.column_name=c.column_name)`,[check,current])).rows.map(row=>'column '+row.name);
        const indexes=(await client.query(`SELECT indexname AS name FROM pg_indexes i WHERE schemaname=$1
            AND NOT EXISTS (SELECT 1 FROM pg_indexes j WHERE j.schemaname=$2 AND j.indexname=i.indexname)`,[check,current])).rows.map(row=>'index '+row.name);
        return [...columns,...indexes];
    } finally {
        // Throws away the copy and puts the search path back.
        await client.query('ROLLBACK TO SAVEPOINT schema_check');
    }
}

// Records every current file as already included, without running it: for a database that is known to be up to date.
async function baseline(pool,options={}) {
    const {dir,schemaFile}={...DEFAULTS,...options};
    const files=migrationFiles(dir);
    const client=await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)',[LOCK]);
        const missing=await missingFromSchema(client,schemaFile);
        if(missing.length) throw fail('This database is missing parts of database/schema.sql, so it cannot be recorded as up to date: '+
            missing.slice(0,12).join(', ')+(missing.length>12?' and '+(missing.length-12)+' more':'')+'. Apply the missing migrations by hand first.','NOT_UP_TO_DATE');
        await ensureListTable(client);
        for(const file of files) await client.query(`INSERT INTO schema_migrations(filename,checksum,baseline) VALUES($1,$2,true)
            ON CONFLICT (filename) DO NOTHING`,[file.name,file.checksum]);
        await client.query('COMMIT');
        return files.map(file=>file.name);
    } catch(error) { await client.query('ROLLBACK');throw error; }
    finally { client.release(); }
}

// Brings the database up to date. Returns the files applied, and what was done.
// Each step holds a lock only for its own transaction (safe through a connection pooler), and checks the list again
// inside it, so two servers starting together never apply the same file twice.
async function migrate(pool,options={}) {
    const {dir,schemaFile,log}={log:()=>{},...DEFAULTS,...options};
    const files=migrationFiles(dir);
    const client=await pool.connect();
    const step=async work=>{
        await client.query('BEGIN');
        try { await client.query('SELECT pg_advisory_xact_lock($1)',[LOCK]);const result=await work();await client.query('COMMIT');return result; }
        catch(error) { await client.query('ROLLBACK');throw error; }
    };
    try {
        const created=await step(async()=>{
            if(await tableExists(client,'schema_migrations')) return false;
            if(await tableExists(client,'users')) {
                throw fail('This database has tables but no record of which database changes it has received. If it is up to date, run '+
                    '"npm run migrate -- --baseline" once (it checks first); otherwise apply the missing files in database/migrations by hand, then baseline.','UNTRACKED');
            }
            // An empty database: build everything from schema.sql, which already includes every current file.
            log('Empty database: creating all tables from database/schema.sql');
            try { await client.query(withoutTransaction(fs.readFileSync(schemaFile,'utf8'))); }
            catch(error) { throw fail('Could not create the database from schema.sql: '+error.message,'SCHEMA_FAILED'); }
            await ensureListTable(client);
            for(const file of files) await client.query('INSERT INTO schema_migrations(filename,checksum,baseline) VALUES($1,$2,true)',[file.name,file.checksum]);
            return true;
        });
        if(created) return {created:true,applied:[],changed:[]};
        const applied=new Map((await client.query('SELECT filename,checksum FROM schema_migrations')).rows.map(row=>[row.filename,row.checksum]));
        const changed=files.filter(file=>applied.has(file.name)&&applied.get(file.name)!==file.checksum).map(file=>file.name);
        if(changed.length) log('Warning: these database change files were edited after they were applied, and are not run again: '+changed.join(', ')+
            '. Put the new change in a new file instead.');
        const done=[];
        for(const file of files.filter(file=>!applied.has(file.name))) {
            const ran=await step(async()=>{
                if((await client.query('SELECT 1 FROM schema_migrations WHERE filename=$1',[file.name])).rowCount) return false;
                log('Applying database change '+file.name);
                try { await client.query(file.text); }
                catch(error) { throw fail('Database change '+file.name+' failed and was not applied (nothing from it was saved): '+error.message,'MIGRATION_FAILED'); }
                await client.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[file.name,file.checksum]);
                return true;
            });
            if(ran) done.push(file.name);
        }
        return {created:false,applied:done,changed};
    } finally { client.release(); }
}

module.exports={migrate,baseline,migrationStatus,migrationFiles};
