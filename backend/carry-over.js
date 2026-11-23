// Carry-over: copies the real records kept in the development database into a new live database, once.
// What carries over: login accounts (with their current password hashes), the basic items, other partners with
// their jobs and payments, capital assets, and the start-up and prepaid expenses shown on Assets and Start-up
// Costs (plus any expense created by a partner payment). Everything else (test sales, purchases, production,
// stock, customers, suppliers, employees, prices, company details) is left behind.
//
// Record numbers are kept so the links between them stay correct (job → partner, payment → job, asset → job,
// entries → the account that made them). Items are matched by name, because a new database already has some.
const {migrationStatus}=require('./migrations');

// Copied in this order, so every record's links already exist when it arrives.
const TABLES=[
    ['users','user_id'],
    ['sop_revisions','revision_id'],
    ['service_partners','partner_id'],
    ['partner_jobs','job_id'],
    ['expenses','expense_id'],
    ['partner_payments','payment_id'],
    ['capital_assets','asset_id']
];
const fail=(message,code)=>Object.assign(new Error(message),{code});
const rows=async(client,sql)=>(await client.query(sql)).rows.map(row=>row.record);

async function exportCarryOver(pool) {
    const client=await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const tables={
            sop_revisions:await rows(client,'SELECT to_jsonb(t) AS record FROM sop_revisions t ORDER BY revision_id'),
            users:await rows(client,'SELECT to_jsonb(t) AS record FROM users t ORDER BY user_id'),
            items:await rows(client,'SELECT to_jsonb(t) AS record FROM items t ORDER BY item_id'),
            service_partners:await rows(client,'SELECT to_jsonb(t) AS record FROM service_partners t ORDER BY partner_id'),
            partner_jobs:await rows(client,'SELECT to_jsonb(t) AS record FROM partner_jobs t ORDER BY job_id'),
            expenses:await rows(client,`SELECT to_jsonb(t) AS record FROM expenses t
                WHERE startup_months>0 OR spread_months>1
                   OR expense_id IN (SELECT expense_id FROM partner_payments WHERE expense_id IS NOT NULL)
                ORDER BY expense_id`),
            partner_payments:await rows(client,'SELECT to_jsonb(t) AS record FROM partner_payments t ORDER BY payment_id'),
            capital_assets:await rows(client,'SELECT to_jsonb(t) AS record FROM capital_assets t ORDER BY asset_id')
        };
        const source=(await client.query('SELECT current_database() AS database')).rows[0].database;
        await client.query('COMMIT');
        return {format:'inventory-carry-over-1',exported_at:new Date().toISOString(),source_database:source,tables};
    } catch(error) { await client.query('ROLLBACK').catch(()=>{});throw error; }
    finally { client.release(); }
}

// Copies the exported records into the target database, all or nothing. With dryRun the copy is made and then
// undone, to show what would happen.
async function importCarryOver(pool,payload,{confirmDatabase,dryRun=false,migrationsDir}={}) {
    if(!payload||payload.format!=='inventory-carry-over-1'||!payload.tables) throw fail('This is not a carry-over file.','BAD_FILE');
    const client=await pool.connect();
    try {
        const database=(await client.query('SELECT current_database() AS database')).rows[0].database;
        if(confirmDatabase!==database) throw fail('Name the target database to confirm: --confirm-database '+database,'NOT_CONFIRMED');
        // The live database must be fully set up by the server first, with every database change applied.
        const status=await migrationStatus(pool,migrationsDir?{dir:migrationsDir}:{});
        if(!status.tracked||status.files.some(file=>file.state!=='applied')) {
            throw fail('The target database is not fully set up. Start the server against it once (or run npm run migrate), then import.','NOT_SET_UP');
        }
        // Only into an empty database: the copy keeps record numbers and must not mix with existing records.
        for(const [table] of TABLES) {
            if((await client.query(`SELECT EXISTS (SELECT 1 FROM ${table}) AS used`)).rows[0].used) {
                throw fail('The target database already has '+table.replace('_',' ')+' records. The carry-over only goes into a new, empty database.','NOT_EMPTY');
            }
        }
        await client.query('BEGIN');
        try {
            const counts={};
            // Items already present (a new database has Sludge) are kept; the others are added with new numbers.
            const present=new Set((await client.query('SELECT LOWER(name) AS name FROM items')).rows.map(row=>row.name));
            const columns=(await client.query(`SELECT string_agg(quote_ident(column_name),',' ORDER BY ordinal_position) AS list FROM information_schema.columns
                WHERE table_schema=current_schema() AND table_name='items' AND column_name<>'item_id'`)).rows[0].list;
            counts.items=0;
            for(const item of payload.tables.items||[]) {
                if(present.has(String(item.name).toLowerCase())) continue;
                await client.query(`INSERT INTO items(${columns}) SELECT ${columns} FROM jsonb_populate_record(NULL::items,$1::jsonb)`,[JSON.stringify(item)]);
                counts.items++;
            }
            for(const [table,id] of TABLES) {
                if(table==='sop_revisions'&&!Array.isArray(payload.tables[table])) throw fail('Export the source again to include the saved SOP revisions.','MISSING_SOPS');
                const records=payload.tables[table]||[];
                if(records.length) await client.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table},$1::jsonb)`,[JSON.stringify(records)]);
                // New records continue after the copied numbers.
                await client.query(`SELECT setval(pg_get_serial_sequence($1,$2),GREATEST((SELECT MAX(${id}) FROM ${table}),1),(SELECT MAX(${id}) FROM ${table}) IS NOT NULL)`,[table,id]);
                counts[table]=records.length;
            }
            const saved=await rows(client,'SELECT to_jsonb(t) AS record FROM sop_revisions t ORDER BY revision_id');
            const exported=payload.tables.sop_revisions;
            if(saved.length!==exported.length||saved.at(-1)?.content_html!==exported.at(-1)?.content_html) throw fail('SOP verification failed.','SOP_MISMATCH');
            await client.query(dryRun?'ROLLBACK':'COMMIT');
            return {database,dryRun,counts};
        } catch(error) { await client.query('ROLLBACK');throw error; }
    } finally { client.release(); }
}

module.exports={exportCarryOver,importCarryOver,TABLES};
