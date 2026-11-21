// Copies the real records from the development database into a new live database (see backend/carry-over.js).
//
//   npm run carry-over -- export
//       Reads the development database (DATABASE_URL) and writes carry-over/carry-over-data.json.
//       The file holds password hashes and business records: keep it private; Git ignores the folder.
//
//   TARGET_DATABASE_URL=... npm run carry-over -- import --confirm-database <name> [--dry-run]
//       Copies the file into the target database. The target must be new: start the server against it once
//       first (it builds the tables), and nothing may have been entered yet. --dry-run checks everything and
//       shows the counts without keeping any change.
require('dotenv').config({ quiet:true });
const fs=require('fs');
const path=require('path');
const {Pool}=require('pg');
const {databaseSsl}=require('../backend/database-ssl');
const {exportCarryOver,importCarryOver}=require('../backend/carry-over');

const args=process.argv.slice(2);
const option=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined;};
const file=path.resolve(option('--file')||path.join(__dirname,'..','carry-over','carry-over-data.json'));
const place=url=>{const parsed=new URL(url);return parsed.hostname.replace('-pooler','')+'/'+parsed.pathname.slice(1);};
const counts=tables=>Object.entries(tables).map(([table,value])=>table.replace('_',' ')+': '+(Array.isArray(value)?value.length:value)).join(', ');

(async()=>{
    const command=args[0];
    if(command==='export') {
        const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:databaseSsl(),max:1});
        try {
            const payload=await exportCarryOver(pool);
            fs.mkdirSync(path.dirname(file),{recursive:true});
            fs.writeFileSync(file,JSON.stringify(payload,null,1),{mode:0o600});
            console.log('Exported from '+payload.source_database+' to '+file);
            console.log(counts(payload.tables));
            console.log('This file holds password hashes and business records. Keep it private; do not upload or share it.');
        } finally { await pool.end(); }
    } else if(command==='import') {
        const target=process.env.TARGET_DATABASE_URL;
        if(!target) throw new Error('Set TARGET_DATABASE_URL to the new live database.');
        // Never into the database the records came from.
        if(process.env.DATABASE_URL&&place(target)===place(process.env.DATABASE_URL)) throw new Error('TARGET_DATABASE_URL is the development database. Point it at the new live database.');
        const payload=JSON.parse(fs.readFileSync(file,'utf8'));
        const pool=new Pool({connectionString:target,ssl:databaseSsl(),max:2});
        try {
            const result=await importCarryOver(pool,payload,{confirmDatabase:option('--confirm-database'),dryRun:args.includes('--dry-run')});
            console.log((result.dryRun?'Dry run (nothing kept) for ':'Imported into ')+result.database+': '+counts(result.counts));
        } finally { await pool.end(); }
    } else {
        console.log('Use: npm run carry-over -- export   or   TARGET_DATABASE_URL=... npm run carry-over -- import --confirm-database <name> [--dry-run]');
        process.exitCode=1;
    }
})().catch(error=>{ console.error(error.message);process.exitCode=1; });
