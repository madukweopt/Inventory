// Activity Log: records every successful save, edit or delete made through the app, and every sign-in,
// with the person who really did it (the Director, even while using another account through Switch Account)
// and the account that was in use. Only the kind of action and which record are kept: never request contents
// or passwords. The Director reads the log on Data → Activity Log.

// [method, path pattern, record type, what was done, where the record number comes from]
// The record number comes from the address ('path' = first number, 'path2' = second number), the saved
// record returned by the server ('json:<field>'), the request ('body:<field>'), or a corrected record ('record').
const ROUTES=[
    ['POST',/^\/api\/login$/,'Account','Signed in',null],
    ['POST',/^\/api\/logout$/,'Account','Signed out',null],
    ['POST',/^\/api\/switch-account$/,'Account','Switched to another account','body:user_id'],
    ['POST',/^\/api\/return-to-admin$/,'Account','Returned to own account',null],
    ['POST',/^\/api\/users$/,'Login account','Added a login account','json:user_id'],
    ['PATCH',/^\/api\/users\/(\d+)$/,'Login account','Changed a login account','path'],
    ['DELETE',/^\/api\/users\/(\d+)$/,'Login account','Deleted a login account','path'],
    ['POST',/^\/api\/sales$/,'Sale','Authorised a sale','json:request_id'],
    ['POST',/^\/api\/purchases$/,'Purchase','Authorised a purchase','json:request_id'],
    ['POST',/^\/api\/production$/,'Production','Authorised production','json:request_id'],
    ['PATCH',/^\/api\/weighing-requests\/(\d+)\/complete$/,'Pending weighing','Recorded weighed quantities','path'],
    ['PATCH',/^\/api\/weighing-requests\/(\d+)\/cancel$/,'Pending weighing','Cancelled an authorisation','path'],
    ['PATCH',/^\/api\/weighing-requests\/(\d+)\/ordered-quantity$/,'Pending weighing','Changed the ordered quantity','path'],
    ['PATCH',/^\/api\/weighing-requests\/(\d+)\/finish$/,'Production','Finished a production day','path'],
    ['PATCH',/^\/api\/weighing-requests\/(\d+)\/reopen$/,'Production','Reopened a production day','path'],
    ['PATCH',/^\/api\/weighing-requests\/(\d+)\/batches\/(\d+)$/,'Production entry','Corrected a production entry','path2'],
    ['DELETE',/^\/api\/weighing-requests\/(\d+)\/batches\/(\d+)$/,'Production entry','Reversed a production entry','path2'],
    ['POST',/^\/api\/sales\/(\d+)\/payments$/,'Payment','Recorded a payment','json:payment_id'],
    ['POST',/^\/api\/sales\/(\d+)\/payments\/(\d+)\/reverse$/,'Payment','Reversed a payment','path2'],
    ['POST',/^\/api\/delivery-notes\/(\d+)\/driver$/,'Delivery note','Recorded the driver’s signature','path'],
    ['POST',/^\/api\/delivery-notes\/(\d+)\/buyer$/,'Delivery note','Confirmed the buyer’s weighing','path'],
    ['POST',/^\/api\/delivery-notes\/(\d+)\/approve$/,'Delivery note','Approved a weight difference','path'],
    ['POST',/^\/api\/stock_counts$/,'Stock change','Recorded a stock change','json:count_id'],
    ['POST',/^\/api\/consumable-usage$/,'Daily usage','Recorded daily usage','json:count_id'],
    ['POST',/^\/api\/consumable-checks\/none$/,'Daily usage','Confirmed no usage today',null],
    ['POST',/^\/api\/expenses$/,'Expense','Added an expense','json:expense_id'],
    ['PATCH',/^\/api\/correction_edit$/,null,'Corrected a record','record'],
    ['DELETE',/^\/api\/correction_delete$/,null,'Deleted a record','record'],
    ['POST',/^\/api\/customers$/,'Customer','Added a customer','json:customer_id'],
    ['PATCH',/^\/api\/customers\/(\d+)$/,'Customer','Changed a customer','path'],
    ['POST',/^\/api\/suppliers$/,'Supplier','Added a supplier','json:supplier_id'],
    ['PATCH',/^\/api\/suppliers\/(\d+)$/,'Supplier','Changed a supplier','path'],
    ['POST',/^\/api\/employees$/,'Employee','Added an employee','json:employee_id'],
    ['POST',/^\/api\/employees\/(\d+)\/salary-history$/,'Employee','Changed a salary','path'],
    ['PATCH',/^\/api\/employees\/(\d+)\/status$/,'Employee','Changed employment status','path'],
    ['POST',/^\/api\/payroll\/generate$/,'Payroll','Prepared payroll',null],
    ['PATCH',/^\/api\/payroll\/(\d+)$/,'Payroll','Changed a payroll record','path'],
    ['POST',/^\/api\/prices$/,'Price','Set a price','json:price_id'],
    ['PATCH',/^\/api\/company$/,'Company details','Changed company details',null],
    ['POST',/^\/api\/purchases\/(\d+)\/kernel-tests$/,'Kernel sample test','Recorded a kernel sample test','path'],
    ['DELETE',/^\/api\/purchases\/(\d+)\/kernel-tests\/(\d+)$/,'Kernel sample test','Deleted a kernel sample test','path2'],
    ['POST',/^\/api\/legacy-links\/(\w+)\/(\d+)$/,'Older stock record','Linked older stock records','path2'],
    ['POST',/^\/api\/partners$/,'Partner','Added a partner','json:partner_id'],
    ['PATCH',/^\/api\/partners\/(\d+)$/,'Partner','Changed a partner','path'],
    ['DELETE',/^\/api\/partners\/(\d+)$/,'Partner','Archived or deleted a partner','path'],
    ['POST',/^\/api\/partners\/(\d+)\/jobs$/,'Partner job','Added a partner job','json:job_id'],
    ['PATCH',/^\/api\/partner-jobs\/(\d+)$/,'Partner job','Changed a partner job','path'],
    ['DELETE',/^\/api\/partner-jobs\/(\d+)$/,'Partner job','Deleted a partner job','path'],
    ['POST',/^\/api\/partner-jobs\/(\d+)\/payments$/,'Partner payment','Recorded a partner payment','json:payment_id'],
    ['DELETE',/^\/api\/partner-payments\/(\d+)$/,'Partner payment','Reversed a partner payment','path'],
    ['POST',/^\/api\/capital-assets$/,'Asset','Added an asset','json:asset_id'],
    ['PATCH',/^\/api\/capital-assets\/(\d+)$/,'Asset','Changed an asset','path'],
    ['DELETE',/^\/api\/capital-assets\/(\d+)$/,'Asset','Deleted an asset','path'],
    ['PUT',/^\/api\/sops$/,'SOP manual','Saved the SOP manual',null]
];
// Record types and the id field of each kind used by the Data page corrections.
const CORRECTION_KINDS={stock:['Stock change','count_id'],purchases:['Purchase','purchase_id'],sales:['Sale','sales_id'],
    production:['Production','production_id'],expenses:['Expense','expense_id']};
const WRITE_METHODS=new Set(['POST','PUT','PATCH','DELETE']);

// Works out the plain-words description of one request.
function describe(method,path,body,json) {
    const route=ROUTES.find(([routeMethod,pattern])=>routeMethod===method&&pattern.test(path));
    if(!route) {
        // A route added later without a description is still logged, in general words.
        const segment=(path.split('/')[2]||'record').replace(/[-_]/g,' ');
        const verb={POST:'Saved',PUT:'Saved',PATCH:'Changed',DELETE:'Deleted'}[method];
        return {type:segment.charAt(0).toUpperCase()+segment.slice(1),action:verb+' '+segment,id:(path.match(/\/(\d+)(?:\/|$)/)||[])[1]||null};
    }
    let [,pattern,type,action,source]=route;
    const match=path.match(pattern);
    let id=null;
    if(source==='path') id=match[1];
    else if(source==='path2') id=match[2];
    else if(source&&source.startsWith('json:')) id=json&&json[source.slice(5)];
    else if(source&&source.startsWith('body:')) id=body&&body[source.slice(5)];
    else if(source==='record') {
        const kind=CORRECTION_KINDS[body&&body.kind];
        type=kind?kind[0]:'Record';
        id=kind&&body.record?body.record[kind[1]]:null;
        action=(action==='Corrected a record'?'Corrected ':'Deleted ')+(kind?'a '+kind[0].toLowerCase()+' record':'a record');
    }
    return {type,action,id:id===undefined||id===null||id===''?null:String(id).slice(0,40)};
}

function registerActivityLog(app,pool,requireRole) {
    // Each successful write is logged before its reply is sent, so a person who sees "saved" can rely on the log
    // having the entry. A retry that only finds the record already saved is logged as a confirmation, not a new action.
    // A logging failure never affects the user's action.
    app.use('/api',function(req,res,next) {
        if(!WRITE_METHODS.has(req.method)) return next();
        const realUser=req.session&&(req.session.admin_user_id||req.session.user_id);
        const actingUser=req.session&&req.session.user_id;
        const sendJson=res.json.bind(res);
        let logged=false;
        res.json=function(value) {
            if(logged||res.statusCode>=400) return sendJson(value);
            logged=true;
            const path=req.originalUrl.split('?')[0];
            // Sign-in has no user until it succeeds; read it from the new session.
            const userId=realUser||(req.session&&(req.session.admin_user_id||req.session.user_id))||null;
            const actingId=actingUser||(req.session&&req.session.user_id)||userId;
            if(!userId) return sendJson(value);
            const entry=describe(req.method,path,req.body,value);
            if(value&&value.already_saved) entry.action=('Confirmed already recorded: '+entry.action.charAt(0).toLowerCase()+entry.action.slice(1)).slice(0,200);
            pool.query(`INSERT INTO activity_log(user_id,acting_user_id,username,acting_username,action,record_type,record_id,method,path)
                VALUES($1,$2,(SELECT username FROM users WHERE user_id=$1),(SELECT username FROM users WHERE user_id=$2),$3,$4,$5,$6,$7)`,
                [userId,actingId,entry.action,entry.type,entry.id,req.method,path.slice(0,300)])
                .catch(error=>console.error('Could not write the activity log:',error.message))
                .finally(()=>sendJson(value));
            return res;
        };
        next();
    });

    // The Director's view, newest first, 100 at a time, filtered by person, record type and Lagos-time dates.
    app.get('/api/activity-log',requireRole(['admin']),async function(req,res) {
        const offset=Math.max(Number.parseInt(req.query.offset,10)||0,0);
        const person=Number.parseInt(req.query.user,10)||null;
        const type=req.query.type?String(req.query.type).slice(0,60):null;
        const day=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):null;
        try {
            const rows=(await pool.query(`SELECT l.log_id,to_char(l.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS occurred_at,
                    l.user_id,l.acting_user_id,COALESCE(u.username,l.username) AS username,COALESCE(a.username,l.acting_username) AS acting_username,
                    l.action,l.record_type,l.record_id
                FROM activity_log l
                LEFT JOIN users u ON u.user_id=l.user_id
                LEFT JOIN users a ON a.user_id=l.acting_user_id
                WHERE ($1::integer IS NULL OR l.user_id=$1)
                  AND ($2::text IS NULL OR l.record_type=$2)
                  AND ($3::date IS NULL OR (l.occurred_at AT TIME ZONE 'Africa/Lagos')::date>=$3::date)
                  AND ($4::date IS NULL OR (l.occurred_at AT TIME ZONE 'Africa/Lagos')::date<=$4::date)
                ORDER BY l.occurred_at DESC,l.log_id DESC LIMIT 101 OFFSET $5`,
                [person,type,day(req.query.from),day(req.query.to),offset])).rows;
            const result={rows:rows.slice(0,100),more:rows.length>100};
            if(offset===0) {
                result.people=(await pool.query(`SELECT DISTINCT l.user_id,COALESCE(u.username,l.username) AS username
                    FROM activity_log l LEFT JOIN users u ON u.user_id=l.user_id WHERE l.user_id IS NOT NULL ORDER BY 2`)).rows;
                result.types=(await pool.query('SELECT DISTINCT record_type FROM activity_log ORDER BY 1')).rows.map(row=>row.record_type);
            }
            return res.json(result);
        } catch(error) {
            console.error(error);
            return res.status(500).json({err:'Could not load the activity log.'});
        }
    });
}

module.exports={registerActivityLog,describe};
