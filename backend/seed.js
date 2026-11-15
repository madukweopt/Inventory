/* Rebuild the application's TEST data as one linked, validated transaction.
 * CLI: node backend/seed.js --reset [--start YYYY-MM-DD --end YYYY-MM-DD]
 * Existing logins are preserved. A verified database dump is mandatory in CLI mode.
 */
require('dotenv').config({quiet:true});
const {Pool}=require('pg');
const argon2=require('argon2');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const {spawn}=require('child_process');
const {calculateContinuousCosts}=require('./continuous-costing');
const TABLES=['sale_payments','production_batches','stock_counts','weighing_requests','sales','production','purchases',
    'product_prices','payroll','salary_history','employment_period_changes','employees','expenses','company_details','customers','suppliers','items','session','users'];
const DEFAULT_START='2026-06-01',DEFAULT_END='2026-11-18';
function datesBetween(start,end){
    const date=new Date(start+'T00:00:00Z'),last=new Date(end+'T00:00:00Z'),days=[];
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||!Number.isFinite(+date)||!Number.isFinite(+last)||date.toISOString().slice(0,10)!==start||last.toISOString().slice(0,10)!==end||date>last)throw new Error('Invalid seed date range');
    while(date<=last){days.push(date.toISOString().slice(0,10));date.setUTCDate(date.getUTCDate()+1);}
    if(days.length>730)throw new Error('Seed range is limited to two years');
    return days;
}
const money=value=>Math.round(value*100)/100;
const stamp=(day,hour,minute=0)=>`${day}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00.000Z`;
const uuid=label=>{const h=crypto.createHash('sha256').update('inventory-test-seed-v2:'+label).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
function buildPlan({start=DEFAULT_START,end=DEFAULT_END,users}){
    const days=datesBetween(start,end),data=Object.fromEntries(TABLES.map(table=>[table,[]])),next={};
    function add(table,row){
        const idField=({users:'user_id',items:'item_id',customers:'customer_id',suppliers:'supplier_id',employees:'employee_id',salary_history:'salary_history_id',employment_period_changes:'change_id',product_prices:'price_id',payroll:'payroll_id',expenses:'expense_id',purchases:'purchase_id',production:'production_id',weighing_requests:'request_id',production_batches:'batch_id',sales:'sales_id',sale_payments:'payment_id',stock_counts:'count_id'})[table];
        if(idField&&row[idField]==null)row[idField]=(next[table]||0)+1;
        if(idField)next[table]=Math.max(next[table]||0,row[idField]);
        data[table].push(row);return row;
    }
    for(const user of users)add('users',{...user,created_at:stamp(start,5)});
    const actor=Object.fromEntries(['admin','manager','storekeeper'].map(role=>[role,users.find(user=>user.role===role)?.user_id]));
    if(Object.values(actor).some(id=>!id))throw new Error('Seed needs admin, manager and storekeeper accounts');
    const items={};
    for(const [name,type] of [['P Kernel','raw_material'],['PKO','product'],['PKC','product'],['Sludge','product'],['Diesel','consumable'],['Electricity','consumable']])items[name]=add('items',{name,item_type:type});
    const company={company_id:1,company_name:'Demo Palm Products Ltd',registration_number:'TEST-RC-2026',tax_identification_number:'TEST-TIN-2026',phone_number:'08000000000',email:'accounts@example.test',website:'https://example.test',business_address:'1 Demonstration Factory Road, Nigeria',bank_name:'Demonstration Bank',account_number:'0000000000',account_name:'Demo Palm Products Ltd',logo_path:null,updated_at:stamp(start,5)};
    add('company_details',company);
    const suppliers=['Demo Kernel Farm A','Demo Kernel Farm B','Demo Fuel Supplier','Demo Power Supplier'].map((name,i)=>add('suppliers',{name,phone_number:'0801000000'+i,address:'Test Supplier Address '+(i+1),email:'supplier'+(i+1)+'@example.test',note:'Generated test supplier',created_at:stamp(start,5)}));
    const customers=['Demo Oil Buyer A','Demo Oil Buyer B','Demo Cake Buyer A','Demo Cake Buyer B','Demo Sludge Buyer'].map((name,i)=>add('customers',{name,phone_number:'0802000000'+i,address:'Test Customer Address '+(i+1),email:'customer'+(i+1)+'@example.test',note:'Generated test customer',created_at:stamp(start,5)}));
    const months=[...new Set(days.map(day=>day.slice(0,7)))];
    const prices={};
    months.forEach((month,index)=>{
        prices[month]={PKO:1600+index*20,PKC:260+index*5,Sludge:650+index*10};
        for(const [name,unit_price] of Object.entries(prices[month]))add('product_prices',{item_id:items[name].item_id,unit_price,effective_date:month+'-01',created_by:actor.admin,created_at:stamp(month+'-01',5,30)});
    });
    const employees=[];
    for(const [index,[name,role,salary]] of [['Demo Production Manager','Production manager',180000],['Demo Store Keeper','Store keeper',150000],['Demo Operator A','Machine operator',120000],['Demo Operator B','Machine operator',120000],['Demo Maintenance Officer','Maintenance officer',160000],['Demo Accounts Officer','Accounts officer',160000]].entries()){
        const join=index===5&&start<='2026-08-01'&&end>='2026-08-01'?'2026-08-01':start;
        const employee=add('employees',{start_date:join,name,phone_number:'0803000000'+index,address:'Test Employee Address '+(index+1),email:'employee'+index+'@example.test',role,salary,note:'Generated test employee',department:role==='Accounts officer'?'Administration':'Factory',status:'Active',inactive_date:null,created_at:stamp(join,5)});
        employees.push(employee);add('employment_period_changes',{employee_id:employee.employee_id,effective_date:join,status:'Active'});
        add('salary_history',{employee_id:employee.employee_id,previous_salary:null,new_salary:salary,effective_date:join,reason:'Initial test salary',changed_by:actor.admin,created_at:stamp(join,5)});
        if(index===2&&start<='2026-08-14'&&end>='2026-09-07'){
            add('employment_period_changes',{employee_id:employee.employee_id,effective_date:'2026-08-15',status:'Inactive'});
            add('employment_period_changes',{employee_id:employee.employee_id,effective_date:'2026-09-07',status:'Active'});
        }
        if(index===3&&start<='2026-10-10'&&end>='2026-10-10'){
            employee.status='Inactive';employee.inactive_date='2026-10-10';
            add('employment_period_changes',{employee_id:employee.employee_id,effective_date:'2026-10-11',status:'Inactive'});
        }
        if([0,1,4].includes(index)&&join<'2026-09-01'&&end>='2026-09-01'){
            employee.salary=money(salary*1.1);add('salary_history',{employee_id:employee.employee_id,previous_salary:salary,new_salary:employee.salary,effective_date:'2026-09-01',reason:'Scheduled test salary increase',changed_by:actor.admin,created_at:stamp('2026-09-01',5)});
        }
    }
    const stock=Object.fromEntries(Object.keys(items).map(name=>[name,0]));
    let inProcess=0;
    function authorisation(type,day,hour,details={},status='Awaiting Storekeeper',by=actor.manager){
        const key=uuid(`${type}:${day}:${data.weighing_requests.length+1}`);
        return add('weighing_requests',{request_type:type,request_date:day,status,created_by:by,created_at:stamp(day,hour),
            completed_by:null,completed_record_id:null,completed_at:null,legacy_linked:false,authorisation_key:type==='Production'?null:key,
            authorisation_payload:type==='Production'?null:Object.fromEntries(Object.entries({[type==='Purchase'?'purchase_date':'sales_date']:day,...details}).filter(([key])=>!['quantity','scale_ticket','vehicle_number'].includes(key)).map(([key,value])=>[key,key==='unit_price'?Number(value).toFixed(2):String(value)])),...details});
    }
    function movement(day,name,received,issued,type,source,part,time,by=actor.storekeeper){
        received=money(received);issued=money(issued);stock[name]=money(stock[name]+received-issued);
        if(stock[name]<0)throw new Error(`Seed attempted negative ${name} stock on ${day}`);
        return add('stock_counts',{count_date:day,item_id:items[name].item_id,received,issued,source_type:type,source_id:source,source_part:part,recorded_by:by,created_at:time});
    }
    function buy(day,name,quantity,unitCost,dayIndex){
        const supplier=name==='P Kernel'?suppliers[dayIndex%2]:suppliers[name==='Diesel'?2:3];
        const request=authorisation('Purchase',day,6,{item_id:items[name].item_id,supplier_id:supplier.supplier_id,unit_cost:unitCost},'Completed',dayIndex%4===0?actor.admin:actor.manager);
        const ticket='PUR-'+day.replaceAll('-','')+'-'+name.replaceAll(' ','');
        const purchase=add('purchases',{purchase_date:day,item_id:items[name].item_id,quantity_supplied:quantity,unit_cost:unitCost,supplier_id:supplier.supplier_id,created_at:stamp(day,6,15)});
        Object.assign(request,{quantity,scale_ticket:ticket,vehicle_number:'TEST-TRUCK-'+String(dayIndex+1).padStart(3,'0'),completed_record_id:purchase.purchase_id,completed_by:actor.storekeeper,completed_at:stamp(day,6,15)});
        movement(day,name,quantity,0,'Purchase',request.request_id,'Received',stamp(day,6,15));
    }
    function sell(day,name,quantity,index,part=0){
        if(quantity<=0)return;
        const customer=name==='PKO'?customers[(index+part)%2]:name==='PKC'?customers[2+index%2]:customers[4];
        const unitPrice=prices[day.slice(0,7)][name];
        const request=authorisation('Sale',day,15,{item_id:items[name].item_id,customer_id:customer.customer_id,unit_price:unitPrice},'Completed',index%5===0?actor.admin:actor.manager);
        const id=(next.sales||0)+1;
        const sale=add('sales',{sales_date:day,item_id:items[name].item_id,quantity,unit_price:unitPrice,customer_id:customer.customer_id,
            invoice_number:'INV-'+day.slice(0,4)+'-'+String(id).padStart(6,'0'),due_date:day,created_at:stamp(day,16,part*5),
            invoice_snapshot:{customer:customer.name,customer_phone:customer.phone_number,customer_email:customer.email,customer_address:customer.address,item:name,company}});
        Object.assign(request,{quantity,scale_ticket:'SALE-'+String(id).padStart(6,'0'),vehicle_number:'TEST-BUYER-'+String(index+1).padStart(3,'0'),completed_record_id:sale.sales_id,completed_by:actor.storekeeper,completed_at:stamp(day,16,part*5)});
        movement(day,name,0,quantity,'Sale',request.request_id,'Issued',stamp(day,16,part*5));
        const total=money(quantity*unitPrice),mode=sale.sales_id%4;
        const payments=mode===0?[]:mode===1?[money(total*0.4)]:mode===2?[total]:[money(total*0.5),money(total-money(total*0.5))];
        payments.forEach((amount,paymentIndex)=>{
            const paid=new Date(day+'T00:00:00Z');paid.setUTCDate(paid.getUTCDate()+paymentIndex+1);const paymentDay=paid.toISOString().slice(0,10)>end?end:paid.toISOString().slice(0,10);
            const paymentId=(next.sale_payments||0)+1;
            add('sale_payments',{sales_id:sale.sales_id,receipt_number:'RCT-'+day.slice(0,4)+'-'+String(paymentId).padStart(6,'0'),payment_date:paymentDay,amount,payment_method:paymentIndex?'Bank transfer':'Cash',reference_number:'TEST-PAY-'+paymentId,note:'Generated test payment',recorded_by:actor.manager,created_at:stamp(paymentDay,17,paymentIndex*10)});
        });
    }
    days.forEach((day,index)=>{
        const kernel=3200+(index%11)*200;
        const monthIndex=months.indexOf(day.slice(0,7));
        if(stock['P Kernel']<kernel+5000)buy(day,'P Kernel',24000,350+monthIndex*8,index);
        if(stock.Diesel<150)buy(day,'Diesel',800,1150+monthIndex*20,index);
        if(stock.Electricity<400)buy(day,'Electricity',4000,80+monthIndex*2,index);
        const diesel=money(kernel*0.015),electricity=money(kernel*0.04);
        movement(day,'Diesel',0,diesel,'Manual',null,null,stamp(day,7,15),actor.admin);
        movement(day,'Electricity',0,electricity,'Manual',null,null,stamp(day,7,20),actor.admin);
        const request=authorisation('Production',day,7,{production_hours:'10:00',down_time:index%9===0?'00:30':'00:00'},day===end?'Awaiting Storekeeper':'Completed',index%4===0?actor.admin:actor.manager);
        const carry=day===end?200:index%13===7?100:0;
        const completed=kernel+inProcess-carry;
        const quantities={pko:money(completed*0.4),pkc:money(completed*0.58),sludge:0};quantities.sludge=money(completed-quantities.pko-quantities.pkc);
        const production=add('production',{production_date:day,kernel_used:kernel,pko_produced:quantities.pko,pkc_produced:quantities.pkc,sludge_produced:quantities.sludge,production_hours:'10:00',down_time:request.down_time,process_loss:0,created_at:stamp(day,8)});
        const entry=(hour,minute,values,label,version=1,voided=false)=>add('production_batches',{request_id:request.request_id,submission_key:uuid('entry:'+day+':'+label),kernel_used:0,pko_produced:0,pkc_produced:0,sludge_produced:0,...values,scale_ticket:'PRO-'+day.replaceAll('-','')+'-'+label,recorded_by:actor.storekeeper,created_at:stamp(day,hour,minute),version,voided,legacy_batch:false});
        entry(8,0,{kernel_used:kernel/2},'K1');
        entry(9,0,{pko_produced:quantities.pko/2},'O1',index===10?2:1);
        entry(10,0,{kernel_used:kernel/2},'K2');
        entry(11,0,{pkc_produced:quantities.pkc/2},'C1');
        entry(13,0,{pko_produced:quantities.pko/2},'O2');
        entry(14,0,{sludge_produced:quantities.sludge},'S1');
        const last=entry(15,0,{pkc_produced:quantities.pkc/2},'C2');
        if(index===10)entry(9,15,{pko_produced:5},'VOID',2,true);
        Object.assign(request,{kernel_used:kernel,pko_produced:quantities.pko,pkc_produced:quantities.pkc,sludge_produced:quantities.sludge,scale_ticket:last.scale_ticket,completed_record_id:production.production_id,completed_by:actor.storekeeper,completed_at:day===end?null:stamp(day,17,30)});
        movement(day,'P Kernel',0,kernel,'Production',request.request_id,'Kernel Issued',stamp(day,8));
        movement(day,'PKO',quantities.pko,0,'Production',request.request_id,'PKO Received',stamp(day,9));
        movement(day,'PKC',quantities.pkc,0,'Production',request.request_id,'PKC Received',stamp(day,11));
        movement(day,'Sludge',quantities.sludge,0,'Production',request.request_id,'Sludge Received',stamp(day,14));
        inProcess=carry;
        for(const name of ['PKO','PKC','Sludge']){
            const reserve=name==='PKO'?500:name==='PKC'?800:20;
            const amount=money(Math.max(0,stock[name]-reserve));
            if(name==='PKO'&&index%3===0){const first=money(amount/2);sell(day,name,first,index,0);sell(day,name,money(amount-first),index,1);}
            else sell(day,name,amount,index);
        }
        add('expenses',{expense_date:day,category:'Expenses',description:['Test factory transport','Test routine maintenance','Test cleaning and supplies'][index%3],amount_spent:5000+(index%7)*1000,created_at:stamp(day,17,40)});
        if(index%30===0){
            authorisation('Purchase',day,19,{item_id:items['P Kernel'].item_id,supplier_id:suppliers[0].supplier_id,unit_cost:350+monthIndex*8},'Cancelled',actor.manager);
            authorisation('Sale',day,19,{item_id:items.PKO.item_id,customer_id:customers[0].customer_id,unit_price:prices[day.slice(0,7)].PKO},'Cancelled',actor.admin);
        }
    });
    // Pending work has no business record or physical movement until it is weighed.
    for(const [i,day] of [...new Set([days[Math.max(0,days.length-4)],end])].entries()){
        authorisation('Purchase',day,18,{item_id:items['P Kernel'].item_id,supplier_id:suppliers[i%2].supplier_id,unit_cost:390},'Awaiting Storekeeper',i?actor.admin:actor.manager);
        authorisation('Sale',day,18,{item_id:items.PKO.item_id,customer_id:customers[i].customer_id,unit_price:prices[day.slice(0,7)].PKO},'Awaiting Storekeeper',i?actor.manager:actor.admin);
    }
    // Backdated pending examples are inserted in their actual authorisation order.
    const ordered=[...data.weighing_requests].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.request_id-b.request_id);
    const requestIds=new Map(ordered.map((row,index)=>[row.request_id,index+1]));
    for(const row of data.production_batches)row.request_id=requestIds.get(row.request_id);
    for(const row of data.stock_counts)if(row.source_id!=null)row.source_id=requestIds.get(row.source_id);
    ordered.forEach((row,index)=>row.request_id=index+1);data.weighing_requests=ordered;
    const costs=calculateContinuousCosts({
        purchases:data.purchases.map(row=>({...items[Object.keys(items).find(name=>items[name].item_id===row.item_id)],date:row.purchase_date,quantity:row.quantity_supplied,value:row.quantity_supplied*row.unit_cost,created_at:row.created_at})),
        issues:data.stock_counts.filter(row=>row.issued>0&&['P Kernel','Diesel','Electricity'].some(name=>items[name].item_id===row.item_id)).map(row=>({...items[Object.keys(items).find(name=>items[name].item_id===row.item_id)],date:row.count_date,quantity:row.issued,created_at:row.created_at})),
        production:data.production_batches.filter(row=>!row.voided).map(row=>({...row,date:data.weighing_requests.find(w=>w.request_id===row.request_id).request_date})),
        productStock:data.stock_counts.filter(row=>['PKO','PKC','Sludge'].some(name=>items[name].item_id===row.item_id)).map(row=>({...row,...items[Object.keys(items).find(name=>items[name].item_id===row.item_id)],date:row.count_date})),
        productItems:[items.PKO,items.PKC,items.Sludge]
    });
    if(Math.abs(costs.work_in_progress.quantity-200)>0.01||costs.work_in_progress.unmatched_output_quantity||costs.work_in_progress.unpriced_materials)throw new Error('Seed production/cost plan does not reconcile');
    return {data,days,months,actors:actor,ending_stock:stock,costs};
}
async function insertRows(client,table,rows){
    if(!rows.length)return;
    const columns=[...new Set(rows.flatMap(row=>Object.keys(row)))];
    const types=(await client.query('SELECT attname,format_type(atttypid,atttypmod) AS type FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped',[table])).rows;
    const typeMap=Object.fromEntries(types.map(row=>[row.attname,row.type]));
    if(columns.some(column=>!typeMap[column]))throw new Error('Seed schema mismatch in '+table);
    const names=columns.map(column=>'"'+column+'"').join(',');
    const definitions=columns.map(column=>'"'+column+'" '+typeMap[column]).join(',');
    await client.query(`INSERT INTO "${table}" (${names}) SELECT ${names} FROM jsonb_to_recordset($1::jsonb) AS fixture(${definitions})`,[JSON.stringify(rows)]);
}
async function validateSeed(client,start,end){
    const failures=[];
    const checks={
        unlinked_business_records:`SELECT COUNT(*)::int AS n FROM (
            SELECT p.purchase_id FROM purchases p WHERE NOT EXISTS(SELECT 1 FROM weighing_requests w WHERE w.request_type='Purchase' AND w.completed_record_id=p.purchase_id)
            UNION ALL SELECT s.sales_id FROM sales s WHERE NOT EXISTS(SELECT 1 FROM weighing_requests w WHERE w.request_type='Sale' AND w.completed_record_id=s.sales_id)
            UNION ALL SELECT p.production_id FROM production p WHERE NOT EXISTS(SELECT 1 FROM weighing_requests w WHERE w.request_type='Production' AND w.completed_record_id=p.production_id)) x`,
        negative_stock:`SELECT COUNT(*)::int AS n FROM(SELECT SUM(received-issued) OVER(PARTITION BY item_id ORDER BY count_date,created_at,count_id ROWS UNBOUNDED PRECEDING) AS balance FROM stock_counts) x WHERE balance<0`,
        production_totals:`SELECT COUNT(*)::int AS n FROM production p JOIN weighing_requests w ON w.request_type='Production' AND w.completed_record_id=p.production_id JOIN
            (SELECT request_id,SUM(kernel_used) AS kernel,SUM(pko_produced) AS pko,SUM(pkc_produced) AS pkc,SUM(sludge_produced) AS sludge FROM production_batches WHERE NOT voided GROUP BY request_id)b ON b.request_id=w.request_id
            WHERE p.kernel_used<>b.kernel OR p.pko_produced<>b.pko OR p.pkc_produced<>b.pkc OR p.sludge_produced<>b.sludge OR w.kernel_used<>b.kernel OR w.pko_produced<>b.pko OR w.pkc_produced<>b.pkc OR w.sludge_produced<>b.sludge`,
        receipt_invoice_errors:`SELECT COUNT(*)::int AS n FROM sales s LEFT JOIN (SELECT sales_id,SUM(amount) AS paid FROM sale_payments GROUP BY sales_id)p ON p.sales_id=s.sales_id WHERE invoice_number IS NULL OR invoice_snapshot IS NULL OR COALESCE(p.paid,0)>quantity*unit_price`,
        payment_receipts:`SELECT COUNT(*)::int AS n FROM sale_payments WHERE receipt_number IS NULL`,
        missing_stock_movements:`SELECT COUNT(*)::int AS n FROM weighing_requests w WHERE w.status='Completed' AND (
            (w.request_type='Purchase' AND NOT EXISTS(SELECT 1 FROM stock_counts sc WHERE sc.source_type='Purchase' AND sc.source_id=w.request_id AND sc.received=w.quantity AND sc.issued=0 AND sc.item_id=w.item_id AND sc.count_date=w.request_date)) OR
            (w.request_type='Sale' AND NOT EXISTS(SELECT 1 FROM stock_counts sc WHERE sc.source_type='Sale' AND sc.source_id=w.request_id AND sc.issued=w.quantity AND sc.received=0 AND sc.item_id=w.item_id AND sc.count_date=w.request_date)))`,
        invalid_production_entries:`SELECT COUNT(*)::int AS n FROM production_batches WHERE NOT voided AND NOT((kernel_used>0 AND pko_produced+pkc_produced+sludge_produced=0) OR (kernel_used=0 AND (CASE WHEN pko_produced>0 THEN 1 ELSE 0 END+CASE WHEN pkc_produced>0 THEN 1 ELSE 0 END+CASE WHEN sludge_produced>0 THEN 1 ELSE 0 END)=1))`,
        missing_prices:`SELECT COUNT(*)::int AS n FROM sales s WHERE s.unit_price IS DISTINCT FROM(SELECT p.unit_price FROM product_prices p WHERE p.item_id=s.item_id AND p.effective_date<=s.sales_date ORDER BY p.effective_date DESC,p.price_id DESC LIMIT 1)`,
        unexpected_manual_receipts:`SELECT COUNT(*)::int AS n FROM stock_counts WHERE source_type='Manual' AND received>0`
    };
    for(const [name,sql] of Object.entries(checks)){const n=(await client.query(sql)).rows[0].n;if(n)failures.push(name+': '+n);}
    const range=(await client.query(`SELECT MIN(day)::text AS first,MAX(day)::text AS last FROM(
        SELECT production_date AS day FROM production UNION ALL SELECT purchase_date FROM purchases UNION ALL SELECT sales_date FROM sales UNION ALL SELECT request_date FROM weighing_requests UNION ALL SELECT count_date FROM stock_counts UNION ALL SELECT payment_date FROM sale_payments UNION ALL SELECT expense_date FROM expenses) d`)).rows[0];
    if(range.first!==start||range.last!==end)failures.push('Date range does not match the requested period');
    if(failures.length)throw new Error('Seed validation failed: '+failures.join('; '));
    return {checks_passed:Object.keys(checks).length,date_range:range};
}
async function seedDatabase(pool,{start=DEFAULT_START,end=DEFAULT_END,reset=false}={}){
    if(!reset)throw new Error('Explicit reset:true or --reset is required; no data was changed');
    datesBetween(start,end);
    const client=await pool.connect(),credentials=[];
    const onError=()=>{};client.on('error',onError);
    try{
        await client.query('BEGIN');await client.query("SET LOCAL idle_in_transaction_session_timeout='60s'");await client.query("SET LOCAL TIME ZONE 'UTC'");
        await client.query('SELECT pg_advisory_xact_lock(91001)');await client.query('SELECT pg_advisory_xact_lock(91002)');
        const users=(await client.query('SELECT user_id,username,password_hash,role FROM users ORDER BY user_id')).rows;
        for(const role of ['admin','manager','storekeeper'])if(!users.some(user=>user.role===role)){
            const username='seed_'+role,password=crypto.randomBytes(15).toString('base64url');
            const user_id=Math.max(0,...users.map(user=>user.user_id))+1;
            users.push({user_id,username,password_hash:await argon2.hash(password),role});credentials.push({username,password,role});
        }
        const plan=buildPlan({start,end,users});
        await client.query('TRUNCATE TABLE '+TABLES.map(table=>'"'+table+'"').join(',')+' RESTART IDENTITY');
        for(const table of ['users','items','company_details','customers','suppliers','employees','employment_period_changes','salary_history','product_prices','weighing_requests','purchases','production','production_batches','sales','sale_payments','stock_counts','expenses'])await insertRows(client,table,plan.data[table]);
        for(const month of plan.months){
            const lastDay=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
            const paid=lastDay<=end;
            await client.query(`INSERT INTO payroll(employee_id,payroll_month,basic_salary,bonus,deduction,total_salary_cost,payment_status,payment_date,needs_review,created_at)
                SELECT employee_id,$1::date,expected_payroll_salary(employee_id,$1::date),0,0,expected_payroll_salary(employee_id,$1::date),$2,$3,false,$4
                FROM employees WHERE start_date<($1::date+INTERVAL '1 month')`,[month+'-01',paid?'Paid':'Pending',paid?lastDay:null,stamp(paid?lastDay:end,18)]);
        }
        // Explicit fixture IDs must not leave sequences behind the inserted rows.
        const sequences=(await client.query(`SELECT table_name,column_name,pg_get_serial_sequence(quote_ident(table_schema)||'.'||quote_ident(table_name),column_name) AS sequence
            FROM information_schema.columns WHERE table_schema=current_schema() AND (column_default LIKE 'nextval%' OR is_identity='YES')`)).rows;
        for(const row of sequences)if(row.sequence&&TABLES.includes(row.table_name))await client.query(`SELECT setval($1,COALESCE(MAX("${row.column_name}"),1),COUNT(*)>0) FROM "${row.table_name}"`,[row.sequence]);
        const validation=await validateSeed(client,start,end);
        // Fire deferred relationship checks before committing, so any error restores old data.
        await client.query('SET CONSTRAINTS ALL IMMEDIATE');
        const counts={};for(const table of TABLES)counts[table]=(await client.query(`SELECT COUNT(*)::int AS n FROM "${table}"`)).rows[0].n;
        await client.query('COMMIT');
        return {start,end,days:plan.days.length,counts,validation,ending_stock:plan.ending_stock,unfinished_quantity:plan.costs.work_in_progress.quantity,credentials,accounts_preserved:users.length-credentials.length};
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.removeListener('error',onError);client.release();}
}
async function backupApplicationData(pool,destination){
    const client=await pool.connect();const onError=()=>{};client.on('error',onError);
    try{
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await client.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
        if(!(await client.query('SELECT current_schema() AS schema')).rows[0].schema)await client.query('SET LOCAL search_path TO public');
        const payload={format:'inventory-app-data-v1',created_at:new Date().toISOString(),tables:{},sequences:[],
            schema_sql:fs.readFileSync(path.join(__dirname,'../database/schema.sql'),'utf8')};
        for(const table of TABLES)payload.tables[table]=(await client.query(`SELECT to_jsonb(record)::text AS row FROM "${table}" record`)).rows.map(row=>row.row);
        const sequences=(await client.query(`SELECT table_name,column_name,pg_get_serial_sequence(quote_ident(table_schema)||'.'||quote_ident(table_name),column_name) AS sequence
            FROM information_schema.columns WHERE table_schema=current_schema() AND (column_default LIKE 'nextval%' OR is_identity='YES')`)).rows;
        for(const entry of sequences)if(entry.sequence&&TABLES.includes(entry.table_name)){
            const state=(await client.query('SELECT last_value::text,is_called FROM '+entry.sequence)).rows[0];
            payload.sequences.push({...entry,...state});
        }
        await client.query('COMMIT');
        const checksum=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
        fs.writeFileSync(destination,JSON.stringify({checksum,payload}),{mode:0o600,flag:'wx'});
        const verified=readApplicationBackup(destination);
        if(TABLES.some(table=>verified.tables[table].length!==payload.tables[table].length))throw new Error('Backup row counts do not match');
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.removeListener('error',onError);client.release();}
}
function readApplicationBackup(filename){
    const {checksum,payload}=JSON.parse(fs.readFileSync(filename,'utf8'));
    if(!payload||payload.format!=='inventory-app-data-v1'||crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')!==checksum||TABLES.some(table=>!Array.isArray(payload.tables?.[table])))throw new Error('Application backup failed integrity verification');
    return payload;
}
async function restoreApplicationData(pool,filename){
    const payload=readApplicationBackup(filename),client=await pool.connect();
    const onError=()=>{};client.on('error',onError);
    try{
        await client.query('BEGIN');await client.query("SET LOCAL idle_in_transaction_session_timeout='60s'");await client.query('SELECT pg_advisory_xact_lock(91001)');await client.query('SELECT pg_advisory_xact_lock(91002)');
        await client.query('TRUNCATE TABLE '+TABLES.map(table=>'"'+table+'"').join(',')+' RESTART IDENTITY');
        for(const table of ['users','items','company_details','customers','suppliers','employees','employment_period_changes','salary_history','payroll','product_prices','weighing_requests','purchases','production','production_batches','sales','sale_payments','stock_counts','expenses','session']){
            const rows=payload.tables[table];
            if(rows.length)await client.query(`INSERT INTO "${table}" SELECT * FROM jsonb_populate_recordset(NULL::"${table}",$1::jsonb)`,['['+rows.join(',')+']']);
        }
        for(const entry of payload.sequences){
            const sequence=(await client.query('SELECT pg_get_serial_sequence($1,$2) AS name',[entry.table_name,entry.column_name])).rows[0].name;
            if(sequence)await client.query('SELECT setval($1,$2,$3)',[sequence,entry.last_value,entry.is_called]);
        }
        await client.query('SET CONSTRAINTS ALL IMMEDIATE');await client.query('COMMIT');
        return Object.fromEntries(TABLES.map(table=>[table,payload.tables[table].length]));
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.removeListener('error',onError);client.release();}
}
async function runDump(databaseUrl,destination){
    const url=new URL(databaseUrl);
    const backupEnv={...process.env,PGHOST:url.hostname.replace('-pooler',''),PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),
        PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:'verify-full',
        PGSSLROOTCERT:url.searchParams.get('sslrootcert')||'/etc/ssl/certs/ca-certificates.crt',PGCONNECT_TIMEOUT:'20'};
    if(url.searchParams.has('options'))backupEnv.PGOPTIONS=url.searchParams.get('options');
    if(url.searchParams.has('channel_binding'))backupEnv.PGCHANNELBINDING=url.searchParams.get('channel_binding');
    await new Promise((resolve,reject)=>{
        const child=spawn('pg_dump',['--format=custom','--no-owner','--no-privileges','--file',destination],{env:backupEnv,stdio:['ignore','ignore','pipe']});
        let error='';child.stderr.on('data',chunk=>error+=chunk);child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Database backup failed: '+error.replaceAll(databaseUrl,'[database]'))));
    });
    fs.chmodSync(destination,0o600);
    await new Promise((resolve,reject)=>{
        const child=spawn('pg_restore',['--list',destination],{stdio:'ignore'});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Database backup verification failed')));
    });
}
async function main(){
    if(!process.argv.includes('--reset')){console.log('No data changed. Use node backend/seed.js --reset to rebuild TEST data for 2026-06-01 through 2026-11-18. Existing login accounts are preserved.');return;}
    const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
    const start=option('--start',DEFAULT_START),end=option('--end',DEFAULT_END);datesBetween(start,end);
    const databaseUrl=process.env.DATABASE_URL;if(!databaseUrl)throw new Error('DATABASE_URL is required');
    const folder=path.resolve(__dirname,'../../inventory-safety-backups','before-test-seed-'+new Date().toISOString().replace(/[:.]/g,'-'));
    fs.mkdirSync(folder,{recursive:true,mode:0o700});
    let backup=path.join(folder,'database.dump');
    const maintenanceUrl=new URL(databaseUrl);maintenanceUrl.hostname=maintenanceUrl.hostname.replace('-pooler','');
    const pool=new Pool({connectionString:maintenanceUrl.toString(),ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:30000,idleTimeoutMillis:0,keepAlive:true,keepAliveInitialDelayMillis:10000});
    pool.on('error',error=>console.error('Database connection interrupted:',error.code||error.message));
    try{
        console.log('Backing up the current database before reset...');
        try{await runDump(databaseUrl,backup);}
        catch(error){
            console.log('Native dump unavailable; creating a checksum-verified application-data backup instead.');
            backup=path.join(folder,'application-data.json');await backupApplicationData(pool,backup);
        }
        console.log('Recovery backup verified.');
        const restore=option('--restore',null);
        if(restore){const counts=await restoreApplicationData(pool,restore);console.log(JSON.stringify({restored:true,counts,previous_data_backup:backup},null,2));return;}
        const result=await seedDatabase(pool,{start,end,reset:true});
        if(result.credentials.length)fs.writeFileSync(path.join(folder,'new-test-logins.json'),JSON.stringify(result.credentials,null,2),{mode:0o600,flag:'wx'});
        const report={...result,credentials:result.credentials.map(({username,role})=>({username,role})),backup};
        fs.writeFileSync(path.join(folder,'seed-report.json'),JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});
        console.log(JSON.stringify(report,null,2));
    }finally{await pool.end();}
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={buildPlan,seedDatabase,validateSeed,datesBetween,backupApplicationData,restoreApplicationData};
