// Applies new database changes from database/migrations (the server also does this when it starts).
//   npm run migrate                 apply any files this database has not received yet
//   npm run migrate -- --status     list applied and pending files; changes nothing
//   npm run migrate -- --baseline   record every current file as already included, after checking the
//                                   database matches database/schema.sql (once, for an existing up-to-date database)
require('dotenv').config({ quiet:true });
const {Pool}=require('pg');
const {migrate,baseline,migrationStatus}=require('../backend/migrations');

(async()=>{
    const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true}});
    try {
        if(process.argv.includes('--status')) {
            const status=await migrationStatus(pool);
            if(!status.tracked) console.log(status.hasAppTables?'This database has no record of its changes yet. Run: npm run migrate -- --baseline':'This database is empty. Run: npm run migrate');
            for(const file of status.files) console.log((file.state==='applied'?'applied ':file.state==='changed'?'CHANGED ':'pending ')+file.name+
                (file.appliedAt?'  ('+(file.baseline?'recorded as included':'applied')+' '+new Date(file.appliedAt).toLocaleString('en-GB')+')':''));
            const pending=status.files.filter(file=>file.state==='pending').length;
            console.log(status.tracked?pending+' pending':'');
        } else if(process.argv.includes('--baseline')) {
            const recorded=await baseline(pool);
            console.log('The database matches database/schema.sql. Recorded '+recorded.length+' database change files as already included.');
        } else {
            const result=await migrate(pool,{log:message=>console.log(message)});
            console.log(result.created?'Database created from schema.sql.':result.applied.length?'Applied '+result.applied.length+' database change(s).':'The database is up to date.');
        }
    } catch(error) {
        console.error(error.message);process.exitCode=1;
    } finally { await pool.end(); }
})();
