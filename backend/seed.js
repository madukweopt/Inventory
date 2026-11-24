/* Rebuild the application's TEST data as one linked, validated transaction.
 * CLI: node backend/seed.js --reset --confirm-database <name> [--start YYYY-MM-DD --end YYYY-MM-DD]
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
const TABLES=['activity_log','stock_change_history','partner_payments','capital_assets','partner_jobs','service_partners','sale_corrections','delivery_note_evidence','delivery_notes','daily_consumable_checks','sop_revisions','kernel_impurity_tests','sale_payments','production_batches','stock_counts','weighing_requests','sales','production','purchases',
    'product_prices','payroll','salary_history','employment_period_changes','employees','expenses','company_details','customers','suppliers','items','session','users'];
const DEFAULT_START='2026-06-01',DEFAULT_END='2026-11-17';
// A tiny valid PNG used for test signatures and weighing evidence.
const SAMPLE_PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=','base64');
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
        const idField=({service_partners:'partner_id',partner_jobs:'job_id',capital_assets:'asset_id',partner_payments:'payment_id',sale_corrections:'correction_id',kernel_impurity_tests:'test_id',delivery_note_evidence:'evidence_id',users:'user_id',items:'item_id',customers:'customer_id',suppliers:'supplier_id',employees:'employee_id',salary_history:'salary_history_id',employment_period_changes:'change_id',product_prices:'price_id',payroll:'payroll_id',expenses:'expense_id',purchases:'purchase_id',production:'production_id',weighing_requests:'request_id',production_batches:'batch_id',sales:'sales_id',sale_payments:'payment_id',stock_counts:'count_id'})[table];
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
    const signature='data:image/png;base64,'+SAMPLE_PNG.toString('base64'),evidence='\\x'+SAMPLE_PNG.toString('hex');
    const finalDay=days[days.length-1],dayBefore=days[days.length-2],losses=[];
    let inProcess=0,overnight=null,heldExample=false;
    function authorisation(type,day,hour,details={},status='Awaiting Storekeeper',by=actor.manager){
        const key=uuid(`${type}:${day}:${data.weighing_requests.length+1}`);
        return add('weighing_requests',{request_type:type,request_date:day,status,created_by:by,created_at:stamp(day,hour),
            completed_by:null,completed_record_id:null,completed_at:null,legacy_linked:false,billing_basis:'Factory',authorisation_key:type==='Production'?null:key,
            authorisation_payload:type==='Production'?null:Object.fromEntries(Object.entries({[type==='Purchase'?'purchase_date':'sales_date']:day,...details}).filter(([key])=>!['quantity','scale_ticket','vehicle_number'].includes(key)).map(([key,value])=>[key,key==='unit_price'?Number(value).toFixed(2):String(value)])),...details});
    }
    function movement(day,name,received,issued,type,source,part,time,by=actor.storekeeper){
        received=money(received);issued=money(issued);stock[name]=money(stock[name]+received-issued);
        if(stock[name]<0)throw new Error(`Seed attempted negative ${name} stock on ${day}`);
        return add('stock_counts',{count_date:day,item_id:items[name].item_id,received,issued,source_type:type,source_id:source,source_part:part,recorded_by:by,created_at:time});
    }
    // Daily Usage entries use the same idempotent reference as the Storekeeper screen.
    function usage(day,name,quantity,time){
        movement(day,name,0,quantity,'Manual',null,'Use:'+crypto.createHash('sha256').update(uuid('use:'+day+':'+name)).digest('hex').slice(0,24),time);
    }
    // Director stock changes always carry a reason; spills and disposals are losses, not sales.
    function adjust(day,name,quantity,reason,time){
        movement(day,name,0,quantity,'Manual',null,null,time,actor.admin).adjustment_reason=reason;
    }
    function buy(day,name,quantity,unitCost,dayIndex){
        const supplier=name==='P Kernel'?suppliers[dayIndex%2]:suppliers[name==='Diesel'?2:3];
        const kernel=name==='P Kernel';
        // Some trucks are authorised the evening before they arrive; stock is dated on the day they are accepted.
        const early=kernel&&dayIndex>0&&dayIndex%3===1;
        // One delivery is held for high impurities, re-authorised at the Director's lower price and accepted two days later.
        const held=kernel&&!heldExample&&dayIndex>=2&&day>='2026-08-01';
        if(held){
            heldExample=true;
            authorisation('Purchase',days[dayIndex-2],6,{item_id:items[name].item_id,supplier_id:supplier.supplier_id,unit_cost:unitCost+20,ordered_quantity:5000},'Cancelled',actor.manager);
        }
        const price=held?unitCost-15:unitCost;
        const request=authorisation('Purchase',early?days[dayIndex-1]:day,early?18:6,{item_id:items[name].item_id,supplier_id:supplier.supplier_id,unit_cost:price,ordered_quantity:Math.ceil(quantity/100)*100},'Completed',dayIndex%4===0?actor.admin:actor.manager);
        const ticket='PUR-'+day.replaceAll('-','')+'-'+name.replaceAll(' ','');
        const purchase=add('purchases',{purchase_date:day,item_id:items[name].item_id,quantity_supplied:quantity,unit_cost:price,supplier_id:supplier.supplier_id,created_at:stamp(day,6,15)});
        Object.assign(request,{quantity,scale_ticket:ticket,vehicle_number:'TEST-TRUCK-'+String(dayIndex+1).padStart(3,'0'),completed_record_id:purchase.purchase_id,completed_by:actor.storekeeper,completed_at:stamp(day,6,15)});
        if(kernel){
            add('kernel_impurity_tests',{purchase_id:purchase.purchase_id,sample_weight_g:2000,impurity_weight_g:held?236:100+(dayIndex%7)*15,recorded_by:actor.storekeeper,created_at:stamp(day,6,10),entry_key:uuid('kernel-test:'+purchase.purchase_id+':1')});
            if(dayIndex%2===0)add('kernel_impurity_tests',{purchase_id:purchase.purchase_id,sample_weight_g:1000,impurity_weight_g:40+(dayIndex%5)*10,recorded_by:actor.storekeeper,created_at:stamp(day,6,12),entry_key:uuid('kernel-test:'+purchase.purchase_id+':2')});
        }
        movement(day,name,quantity,0,'Purchase',request.request_id,'Received',stamp(day,6,15));
    }
    function pay(sale,amount,paymentDay,paymentIndex,reversal){
        const paymentId=(next.sale_payments||0)+1;
        add('sale_payments',{sales_id:sale.sales_id,receipt_number:'RCT-'+paymentDay.slice(0,4)+'-'+String(paymentId).padStart(6,'0'),payment_date:paymentDay,amount,payment_method:paymentIndex?'Bank transfer':'Cash',reference_number:'TEST-PAY-'+paymentId,note:'Generated test payment',recorded_by:actor.manager,created_at:stamp(paymentDay,17,paymentIndex*10),
            ...(reversal?{reversed_at:stamp(paymentDay,18),reversed_by:actor.admin,reversal_reason:'Entered against the wrong invoice; this customer had not paid'}:{})});
    }
    function sell(day,name,quantity,index,part=0){
        if(quantity<=0)return;
        const customer=name==='PKO'?customers[(index+part)%2]:name==='PKC'?customers[2+index%2]:customers[4];
        // Some collections are authorised the evening before; the sale and invoice use the dispatch date.
        const early=index>0&&index%4===1&&day.slice(8)!=='01';
        const authorisedDay=early?days[index-1]:day;
        const unitPrice=prices[authorisedDay.slice(0,7)][name];
        // Cake Buyer B pays on its own weighbridge; the day before the last day adds a difference awaiting approval.
        const basis=customer===customers[3]||(name==='PKC'&&day===dayBefore)?'Customer':'Factory';
        const request=authorisation('Sale',authorisedDay,early?18:15,{item_id:items[name].item_id,customer_id:customer.customer_id,unit_price:unitPrice,billing_basis:basis,representative_id:actor.manager,ordered_quantity:Math.ceil(quantity/100)*100},'Completed',index%5===0?actor.admin:actor.manager);
        const id=(next.sales||0)+1,dispatched=stamp(day,16,part*5);
        // Customer-weight buyers usually weigh slightly less; differences wait for the Director's approval.
        const buyerWeight=money(quantity*(1-(day===dayBefore&&basis==='Customer'?0.01:basis==='Customer'?[0,0.005,0.01,0.015][id%4]:[0,0,0.004][id%3])));
        const buyerSigned=day!==finalDay,needsApproval=basis==='Customer'&&buyerWeight!==quantity;
        const approved=buyerSigned&&needsApproval&&day!==dayBefore;
        const invoiced=basis==='Factory'||(buyerSigned&&(!needsApproval||approved));
        const sale=add('sales',{sales_date:day,item_id:items[name].item_id,quantity:basis==='Customer'?(invoiced?buyerWeight:0):quantity,unit_price:unitPrice,customer_id:customer.customer_id,
            invoice_number:invoiced?'INV-'+day.slice(0,4)+'-'+String(id).padStart(6,'0'):null,due_date:day,created_at:dispatched,billing_basis:basis,factory_quantity:quantity,
            invoice_snapshot:{customer:customer.name,customer_phone:customer.phone_number,customer_email:customer.email,customer_address:customer.address,item:name,company}});
        Object.assign(request,{quantity,scale_ticket:'SALE-'+String(id).padStart(6,'0'),vehicle_number:'TEST-BUYER-'+String(index+1).padStart(3,'0'),completed_record_id:sale.sales_id,completed_by:actor.storekeeper,completed_at:dispatched});
        add('delivery_notes',{sales_id:sale.sales_id,representative_id:actor.manager,driver_name:'Test Driver '+(id%6+1),driver_signature:signature,driver_signed_at:dispatched,driver_recorded_by:actor.storekeeper,
            buyer_name:buyerSigned?customer.name+' weighbridge':null,buyer_weight:buyerSigned?buyerWeight:null,buyer_signature:buyerSigned?signature:null,
            evidence:buyerSigned&&basis==='Customer'?evidence:null,evidence_type:buyerSigned&&basis==='Customer'?'image/png':null,evidence_name:buyerSigned&&basis==='Customer'?'buyer-scale-ticket-'+id+'.png':null,
            confirmed_by:buyerSigned?actor.manager:null,confirmed_at:buyerSigned?stamp(day,20):null,
            approved_by:approved?actor.admin:null,approved_at:approved?stamp(days[index+1],8):null,created_at:dispatched});
        // The Director occasionally corrects a signed factory-weight sale's price, with the reason kept on its delivery note.
        if(basis==='Factory'&&id%97===13&&day<dayBefore){
            const corrected=unitPrice-10,values=price=>({sales_date:day,customer_id:customer.customer_id,item_id:items[name].item_id,factory_quantity:quantity,unit_price:price});
            sale.unit_price=corrected;
            add('sale_corrections',{sales_id:sale.sales_id,reason:'Director agreed a ₦10 per kg discount for a delayed collection',previous_values:values(unitPrice),new_values:values(corrected),corrected_by:actor.admin,created_at:stamp(day,18,30)});
        }
        if(buyerSigned&&basis==='Customer'&&id%3===0)add('delivery_note_evidence',{sales_id:sale.sales_id,content:evidence,content_type:'image/png',filename:'buyer-weighing-photo-'+id+'.png'});
        movement(day,name,0,quantity,'Sale',request.request_id,'Issued',dispatched);
        if(!invoiced)return;
        const total=money(sale.quantity*sale.unit_price),mode=sale.sales_id%4;
        const payments=mode===0?[]:mode===1?[money(total*0.4)]:mode===2?[total]:[money(total*0.5),money(total-money(total*0.5))];
        payments.forEach((amount,paymentIndex)=>{
            const paid=new Date(day+'T00:00:00Z');paid.setUTCDate(paid.getUTCDate()+paymentIndex+1);const paymentDay=paid.toISOString().slice(0,10)>end?end:paid.toISOString().slice(0,10);
            // A wrongly entered payment is reversed by the Director before the real payment is recorded.
            if(paymentIndex===0&&sale.sales_id%37===5)pay(sale,total,paymentDay,0,true);
            pay(sale,amount,paymentDay,paymentIndex,false);
        });
    }
    // Production entries are dated when kernels are issued or products are received.
    function entry(request,requestDay,movementDay,hour,minute,values,label,version=1,voided=false){
        return add('production_batches',{request_id:request.request_id,submission_key:uuid('entry:'+requestDay+':'+label),kernel_used:0,pko_produced:0,pkc_produced:0,sludge_produced:0,...values,
            scale_ticket:'PRO-'+requestDay.replaceAll('-','')+'-'+label,recorded_by:actor.storekeeper,created_at:stamp(movementDay,hour,minute),movement_date:movementDay,version,voided,legacy_batch:false});
    }
    days.forEach((day,index)=>{
        const kernel=3200+(index%11)*200;
        const monthIndex=months.indexOf(day.slice(0,7));
        if(stock['P Kernel']<kernel+5000)buy(day,'P Kernel',24000,350+monthIndex*8,index);
        if(stock.Diesel<150)buy(day,'Diesel',800,1150+monthIndex*20,index);
        if(stock.Electricity<400)buy(day,'Electricity',4000,80+monthIndex*2,index);
        // Yesterday's production that stayed open overnight is weighed this morning and then finished.
        if(overnight){
            const o=overnight;
            entry(o.request,o.day,day,7,30,{pko_produced:o.pko},'O2');
            entry(o.request,o.day,day,7,40,{sludge_produced:o.sludge},'S1');
            const last=entry(o.request,o.day,day,7,50,{pkc_produced:o.pkc},'C2');
            movement(day,'PKO',o.pko,0,'Production',o.request.request_id,'PKO Received@'+day,stamp(day,7,30));
            movement(day,'Sludge',o.sludge,0,'Production',o.request.request_id,'Sludge Received@'+day,stamp(day,7,40));
            movement(day,'PKC',o.pkc,0,'Production',o.request.request_id,'PKC Received@'+day,stamp(day,7,50));
            Object.assign(o.request,{scale_ticket:last.scale_ticket,completed_at:stamp(day,8,30)});
            losses.push({date:day,quantity:o.loss});inProcess=money(inProcess-o.pko-o.sludge-o.pkc-o.loss);overnight=null;
        }
        // Finish Day is selected only when all material is processed, so the remaining kernel is production loss.
        const open=day===finalDay,holdsOver=!open&&index%13===7&&index<days.length-2;
        const request=authorisation('Production',day,7,{production_hours:'10:00',down_time:index%9===0?'00:30':'00:00'},open?'Awaiting Storekeeper':'Completed',index%4===0?actor.admin:actor.manager);
        const recovered=open?kernel-200:money(kernel*(1-[0.01,0.015,0.02][index%3]));
        const pko=money(recovered*0.4),sludge=money(recovered*0.02),pkc=money(recovered-pko-sludge),loss=open?0:money(kernel-pko-pkc-sludge);
        const production=add('production',{production_date:day,kernel_used:kernel,pko_produced:pko,pkc_produced:pkc,sludge_produced:sludge,production_hours:'10:00',down_time:request.down_time,process_loss:loss,created_at:stamp(day,8)});
        const firstPko=money(pko/2),firstPkc=money(pkc/2);
        entry(request,day,day,8,0,{kernel_used:kernel/2},'K1');
        entry(request,day,day,9,0,{pko_produced:firstPko},'O1',index===10?2:1);
        entry(request,day,day,10,0,{kernel_used:kernel/2},'K2');
        let last=entry(request,day,day,11,0,{pkc_produced:firstPkc},'C1');
        if(index===10)entry(request,day,day,9,15,{pko_produced:5},'VOID',2,true);
        movement(day,'P Kernel',0,kernel,'Production',request.request_id,'Kernel Issued',stamp(day,8));
        inProcess=money(inProcess+kernel);
        if(holdsOver) {
            // Oil still settling and filtering at closing time is weighed tomorrow under today's production.
            movement(day,'PKO',firstPko,0,'Production',request.request_id,'PKO Received',stamp(day,9));
            movement(day,'PKC',firstPkc,0,'Production',request.request_id,'PKC Received',stamp(day,11));
            inProcess=money(inProcess-firstPko-firstPkc);
            overnight={request,day,pko:money(pko-firstPko),pkc:money(pkc-firstPkc),sludge,loss};
        } else {
            entry(request,day,day,13,0,{pko_produced:money(pko-firstPko)},'O2');
            entry(request,day,day,14,0,{sludge_produced:sludge},'S1');
            last=entry(request,day,day,15,0,{pkc_produced:money(pkc-firstPkc)},'C2');
            movement(day,'PKO',pko,0,'Production',request.request_id,'PKO Received',stamp(day,9));
            movement(day,'PKC',pkc,0,'Production',request.request_id,'PKC Received',stamp(day,11));
            movement(day,'Sludge',sludge,0,'Production',request.request_id,'Sludge Received',stamp(day,14));
            inProcess=money(inProcess-pko-pkc-sludge-loss);
            if(!open)losses.push({date:day,quantity:loss});
        }
        Object.assign(request,{kernel_used:kernel,pko_produced:pko,pkc_produced:pkc,sludge_produced:sludge,scale_ticket:last.scale_ticket,completed_record_id:production.production_id,completed_by:actor.storekeeper,completed_at:open||holdsOver?null:stamp(day,17,30)});
        // Daily Usage: electricity is used every day; diesel is used except on days confirmed as none used.
        usage(day,'Electricity',money(kernel*0.04),stamp(day,18,0));
        if(index%5===0)add('daily_consumable_checks',{check_date:day,item_id:items.Diesel.item_id,recorded_by:actor.storekeeper,created_at:stamp(day,18,5)});
        else usage(day,'Diesel',money(kernel*0.015),stamp(day,18,5));
        for(const name of ['PKO','PKC','Sludge']){
            const reserve=name==='PKO'?500:name==='PKC'?800:20;
            const amount=money(Math.max(0,stock[name]-reserve));
            if(name==='PKO'&&index%3===0){const first=money(amount/2);sell(day,name,first,index,0);sell(day,name,money(amount-first),index,1);}
            else sell(day,name,amount,index);
        }
        if(index%20===12)adjust(day,'PKO',12,'Spill',stamp(day,17,10));
        if(index%30===17)adjust(day,'Sludge',5,'Disposal',stamp(day,17,15));
        if(index%28===21)adjust(day,'PKC',8,'Count difference',stamp(day,17,20));
        add('expenses',{expense_date:day,category:'Expenses',description:['Test factory transport','Test routine maintenance','Test cleaning and supplies'][index%3],amount_spent:5000+(index%7)*1000,spread_months:1,startup_months:0,created_at:stamp(day,17,40)});
        if(index%30===0){
            authorisation('Purchase',day,19,{item_id:items['P Kernel'].item_id,supplier_id:suppliers[0].supplier_id,unit_cost:350+monthIndex*8,ordered_quantity:5000},'Cancelled',actor.manager);
            authorisation('Sale',day,19,{item_id:items.PKO.item_id,customer_id:customers[0].customer_id,unit_price:prices[day.slice(0,7)].PKO,billing_basis:'Factory',representative_id:actor.manager,ordered_quantity:3000},'Cancelled',actor.admin);
        }
    });
    // Other partners: set-up machines and tanks are capital assets bought before trading; repairs during the period are running expenses.
    const before=offset=>{const date=new Date(start+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-offset);return date.toISOString().slice(0,10);};
    const during=fraction=>days[Math.min(days.length-1,Math.max(0,Math.floor(days.length*fraction)))];
    const partners=[['Demo Welding & Fabrication Works','Welding and fabrication'],['Demo Power & Electrical Services','Electrical installation and motor repairs'],['Demo Agro-Machinery Dealers','Oil mill machinery supply']]
        .map(([name,work],i)=>add('service_partners',{name,phone_number:'0804000000'+i,address:'Test Partner Address '+(i+1),email:'partner'+(i+1)+'@example.test',work_type:work,note:'Generated test partner',created_at:stamp(before(45),9)}));
    function partnerJob(partner,date,type,description,amount,category,assetType,payments){
        const job=add('partner_jobs',{partner_id:partner.partner_id,job_date:date,job_type:type,description,agreed_amount:amount,cost_category:category,created_by:actor.admin,created_at:stamp(date,9)});
        if(category==='Capital')add('capital_assets',{name:description,asset_type:assetType,acquired_date:date,cost:amount,source:partner.name,note:null,job_id:job.job_id,created_by:actor.admin,created_at:stamp(date,9,5)});
        payments.forEach(([paymentDay,paid,method],index)=>{
            // A running job's payment is also its running expense, entered once.
            const expense=category==='Running'?add('expenses',{expense_date:paymentDay,category:'Expenses',description:(partner.name+': '+description).slice(0,100),amount_spent:paid,spread_months:1,startup_months:0,created_at:stamp(paymentDay,12,index)}):null;
            add('partner_payments',{job_id:job.job_id,payment_date:paymentDay,amount:paid,payment_method:method,reference_number:method==='Bank Transfer'?'TEST-PARTNER-'+job.job_id+'-'+(index+1):null,note:null,expense_id:expense?.expense_id??null,recorded_by:actor.admin,created_at:stamp(paymentDay,12,index)});
        });
    }
    const [welder,electrician,dealer]=partners;
    partnerJob(dealer,before(40),'Equipment purchase','Expeller, 10 tonnes per day',4000000,'Capital','Machine',[[before(40),2500000,'Bank Transfer'],[before(25),1500000,'Bank Transfer']]);
    partnerJob(dealer,before(38),'Equipment purchase','Kernel crusher',1200000,'Capital','Machine',[[before(38),1200000,'Bank Transfer']]);
    partnerJob(welder,before(35),'Fabrication','Roaster and feed hopper',3500000,'Capital','Machine',[[before(34),2000000,'Bank Transfer'],[before(20),1500000,'Bank Transfer']]);
    partnerJob(welder,before(30),'Fabrication','Oil settling tank, 5,000 litres',1800000,'Capital','Tank',[[before(28),1000000,'Bank Transfer']]);
    partnerJob(electrician,before(22),'Installation','Main panel and motor wiring',950000,'Capital','Electrical',[[before(21),950000,'Bank Transfer']]);
    partnerJob(welder,during(0.47),'Repair','Weld cracked crusher hopper',85000,'Running',null,[[during(0.48),85000,'Cash']]);
    partnerJob(electrician,during(0.74),'Maintenance/Service','Expeller motor service',45000,'Running',null,[[during(0.75),45000,'Bank Transfer']]);
    partnerJob(electrician,during(0.95),'Repair','Replace burnt roaster motor starter',60000,'Running',null,[[during(0.96),30000,'Cash']]);
    // Paid in advance and spread over the months covered: a year's rent from January, with the 5 installation months before production as start-up costs.
    const rentDay=start.slice(0,4)+'-01-05';
    if(rentDay<start)add('expenses',{expense_date:rentDay,category:'Expenses',description:'Factory rent, January to December '+start.slice(0,4),amount_spent:1200000,spread_months:12,startup_months:Math.min(12,Number(start.slice(5,7))-1),created_at:stamp(rentDay,10)});
    add('expenses',{expense_date:start,category:'Expenses',description:'Factory insurance, 12 months',amount_spent:360000,spread_months:12,startup_months:0,created_at:stamp(start,10,30)});
    // Bought outright from one-off sellers, so entered directly in Assets and Start-up Costs.
    add('capital_assets',{name:'Platform weighing scale, 1,000 kg',asset_type:'Machine',acquired_date:before(18),cost:650000,source:'Demo Scale Shop',note:'Calibrated on delivery',job_id:null,created_by:actor.admin,created_at:stamp(before(18),10)});
    add('capital_assets',{name:'Filter press',asset_type:'Machine',acquired_date:before(15),cost:1100000,source:'Demo Filtration Ltd',note:null,job_id:null,created_by:actor.admin,created_at:stamp(before(15),10)});
    // Pending work has no business record or physical movement until it is weighed.
    for(const [i,day] of [...new Set([days[Math.max(0,days.length-4)],end])].entries()){
        authorisation('Purchase',day,18,{item_id:items['P Kernel'].item_id,supplier_id:suppliers[i%2].supplier_id,unit_cost:390,ordered_quantity:10000},'Awaiting Storekeeper',i?actor.admin:actor.manager);
        authorisation('Sale',day,18,{item_id:items.PKO.item_id,customer_id:customers[i].customer_id,unit_price:prices[day.slice(0,7)].PKO,billing_basis:'Factory',representative_id:actor.manager,ordered_quantity:5000},'Awaiting Storekeeper',i?actor.manager:actor.admin);
    }
    // Backdated pending examples are inserted in their actual authorisation order.
    const ordered=[...data.weighing_requests].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.request_id-b.request_id);
    const requestIds=new Map(ordered.map((row,index)=>[row.request_id,index+1]));
    for(const row of data.production_batches)row.request_id=requestIds.get(row.request_id);
    for(const row of data.stock_counts)if(row.source_id!=null)row.source_id=requestIds.get(row.source_id);
    ordered.forEach((row,index)=>row.request_id=index+1);data.weighing_requests=ordered;
    const itemFor=id=>items[Object.keys(items).find(name=>items[name].item_id===id)];
    const costs=calculateContinuousCosts({
        purchases:data.purchases.map(row=>({...itemFor(row.item_id),date:row.purchase_date,quantity:row.quantity_supplied,value:row.quantity_supplied*row.unit_cost,created_at:row.created_at})),
        issues:data.stock_counts.filter(row=>row.issued>0&&['P Kernel','Diesel','Electricity'].some(name=>items[name].item_id===row.item_id)).map(row=>({...itemFor(row.item_id),date:row.count_date,quantity:row.issued,created_at:row.created_at})),
        production:data.production_batches.filter(row=>!row.voided).map(row=>({...row,date:row.movement_date})),
        productStock:data.stock_counts.filter(row=>['PKO','PKC','Sludge'].some(name=>items[name].item_id===row.item_id)).map(row=>({...row,...itemFor(row.item_id),date:row.count_date})),
        productItems:[items.PKO,items.PKC,items.Sludge],losses
    });
    if(Math.abs(costs.work_in_progress.quantity-200)>0.01||Math.abs(inProcess-200)>0.01||costs.work_in_progress.unmatched_output_quantity||costs.work_in_progress.unpriced_materials)throw new Error('Seed production/cost plan does not reconcile');
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
        receipt_invoice_errors:`SELECT COUNT(*)::int AS n FROM sales s LEFT JOIN (SELECT sales_id,SUM(amount) FILTER (WHERE reversed_at IS NULL) AS paid,COUNT(*) AS receipts FROM sale_payments GROUP BY sales_id)p ON p.sales_id=s.sales_id
            WHERE (invoice_number IS NULL AND (billing_basis<>'Customer' OR COALESCE(p.receipts,0)>0)) OR invoice_snapshot IS NULL OR COALESCE(p.paid,0)>invoice_amount(quantity,unit_price)`,
        delivery_notes:`SELECT COUNT(*)::int AS n FROM sales s LEFT JOIN delivery_notes d ON d.sales_id=s.sales_id WHERE d.sales_id IS NULL OR d.driver_signature IS NULL
            OR (s.billing_basis='Customer' AND s.invoice_number IS NOT NULL AND s.quantity<>d.buyer_weight) OR COALESCE(s.factory_quantity,-1)<0`,
        production_loss:`SELECT COUNT(*)::int AS n FROM production p JOIN weighing_requests w ON w.request_type='Production' AND w.completed_record_id=p.production_id
            WHERE p.process_loss<>CASE WHEN w.status='Completed' THEN GREATEST(ROUND(p.kernel_used-p.kernel_returned-p.pko_produced-p.pkc_produced-p.sludge_produced,2),0) ELSE 0 END`,
        unlabelled_stock_changes:`SELECT COUNT(*)::int AS n FROM stock_counts WHERE source_type='Manual' AND COALESCE(source_part,'') NOT LIKE 'Use:%' AND adjustment_reason IS NULL`,
        capital_in_expenses:`SELECT COUNT(*)::int AS n FROM expenses WHERE category<>'Expenses'`,
        partner_payment_expenses:`SELECT COUNT(*)::int AS n FROM partner_payments p JOIN partner_jobs j ON j.job_id=p.job_id LEFT JOIN expenses e ON e.expense_id=p.expense_id
            WHERE (j.cost_category='Running' AND (e.expense_id IS NULL OR e.amount_spent<>p.amount OR e.expense_date<>p.payment_date)) OR (j.cost_category='Capital' AND p.expense_id IS NOT NULL)`,
        capital_jobs_without_asset:`SELECT COUNT(*)::int AS n FROM partner_jobs j LEFT JOIN capital_assets a ON a.job_id=j.job_id
            WHERE (j.cost_category='Capital')<>(a.asset_id IS NOT NULL) OR (a.asset_id IS NOT NULL AND (a.cost<>j.agreed_amount OR a.acquired_date<>j.job_date))`,
        overpaid_partner_jobs:`SELECT COUNT(*)::int AS n FROM partner_jobs j WHERE j.agreed_amount<(SELECT COALESCE(SUM(amount),0) FROM partner_payments p WHERE p.job_id=j.job_id AND p.reversed_at IS NULL)`,
        misplaced_kernel_tests:`SELECT COUNT(*)::int AS n FROM kernel_impurity_tests t JOIN purchases p ON p.purchase_id=t.purchase_id JOIN items i ON i.item_id=p.item_id WHERE LOWER(i.name)<>'p kernel'`,
        payment_receipts:`SELECT COUNT(*)::int AS n FROM sale_payments WHERE receipt_number IS NULL`,
        missing_stock_movements:`SELECT COUNT(*)::int AS n FROM weighing_requests w WHERE w.status='Completed' AND (
            (w.request_type='Purchase' AND NOT EXISTS(SELECT 1 FROM stock_counts sc JOIN purchases p ON p.purchase_id=w.completed_record_id WHERE sc.source_type='Purchase' AND sc.source_id=w.request_id
                AND sc.received=w.quantity AND sc.issued=0 AND sc.item_id=w.item_id AND sc.count_date=p.purchase_date AND p.purchase_date>=w.request_date)) OR
            (w.request_type='Sale' AND NOT EXISTS(SELECT 1 FROM stock_counts sc JOIN sales s ON s.sales_id=w.completed_record_id WHERE sc.source_type='Sale' AND sc.source_id=w.request_id
                AND sc.issued=w.quantity AND sc.received=0 AND sc.item_id=w.item_id AND sc.count_date=s.sales_date AND s.sales_date>=w.request_date)))`,
        invalid_production_entries:`SELECT COUNT(*)::int AS n FROM production_batches WHERE NOT voided AND NOT((kernel_used>0 AND pko_produced+pkc_produced+sludge_produced=0) OR (kernel_used=0 AND (CASE WHEN pko_produced>0 THEN 1 ELSE 0 END+CASE WHEN pkc_produced>0 THEN 1 ELSE 0 END+CASE WHEN sludge_produced>0 THEN 1 ELSE 0 END)=1))`,
        missing_prices:`SELECT COUNT(*)::int AS n FROM sales s JOIN weighing_requests w ON w.request_type='Sale' AND w.completed_record_id=s.sales_id
            WHERE s.unit_price IS DISTINCT FROM(SELECT p.unit_price FROM product_prices p WHERE p.item_id=s.item_id AND p.effective_date<=w.request_date ORDER BY p.effective_date DESC,p.price_id DESC LIMIT 1)
            AND NOT EXISTS(SELECT 1 FROM sale_corrections c WHERE c.sales_id=s.sales_id)`,
        unexpected_manual_receipts:`SELECT COUNT(*)::int AS n FROM stock_counts WHERE source_type='Manual' AND received>0`
    };
    for(const [name,sql] of Object.entries(checks)){const n=(await client.query(sql)).rows[0].n;if(n)failures.push(name+': '+n);}
    const range=(await client.query(`SELECT MIN(day)::text AS first,MAX(day)::text AS last FROM(
        SELECT production_date AS day FROM production UNION ALL SELECT purchase_date FROM purchases UNION ALL SELECT sales_date FROM sales UNION ALL SELECT request_date FROM weighing_requests UNION ALL SELECT count_date FROM stock_counts UNION ALL SELECT payment_date FROM sale_payments UNION ALL SELECT expense_date FROM expenses WHERE spread_months=1) d`)).rows[0];
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
        await client.query('TRUNCATE TABLE '+TABLES.filter(table=>table!=='sop_revisions').map(table=>'"'+table+'"').join(',')+' RESTART IDENTITY');
        for(const table of ['users','items','company_details','customers','suppliers','employees','employment_period_changes','salary_history','product_prices','weighing_requests','purchases','kernel_impurity_tests','production','production_batches','sales','delivery_notes','delivery_note_evidence','sale_corrections','sale_payments','stock_counts','daily_consumable_checks','expenses','service_partners','partner_jobs','capital_assets','partner_payments'])await insertRows(client,table,plan.data[table]);
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
    if(!payload||payload.format!=='inventory-app-data-v1'||crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')!==checksum||TABLES.some(table=>!(['kernel_impurity_tests','sop_revisions','daily_consumable_checks','delivery_notes','delivery_note_evidence','sale_corrections','service_partners','partner_jobs','capital_assets','partner_payments','stock_change_history'].includes(table)&&payload.tables?.[table]===undefined)&&!Array.isArray(payload.tables?.[table])))throw new Error('Application backup failed integrity verification');
    // Backups made before sample tests existed contain no quality tests.
    payload.tables.kernel_impurity_tests??=[];
    payload.tables.sop_revisions??=[];
    payload.tables.stock_change_history??=[];
    payload.tables.daily_consumable_checks??=[];
    payload.tables.delivery_notes??=[];
    payload.tables.delivery_note_evidence??=[];
    payload.tables.sale_corrections??=[];
    for(const table of ['service_partners','partner_jobs','capital_assets','partner_payments'])payload.tables[table]??=[];
    return payload;
}
async function restoreApplicationData(pool,filename){
    const payload=readApplicationBackup(filename),client=await pool.connect();
    const onError=()=>{};client.on('error',onError);
    try{
        await client.query('BEGIN');await client.query("SET LOCAL idle_in_transaction_session_timeout='60s'");await client.query('SELECT pg_advisory_xact_lock(91001)');await client.query('SELECT pg_advisory_xact_lock(91002)');
        await client.query('TRUNCATE TABLE '+TABLES.map(table=>'"'+table+'"').join(',')+' RESTART IDENTITY');
        for(const table of ['users','activity_log','items','company_details','customers','suppliers','employees','employment_period_changes','salary_history','payroll','product_prices','weighing_requests','purchases','production','production_batches','sales','sale_payments','stock_counts','expenses','kernel_impurity_tests','sop_revisions','daily_consumable_checks','delivery_notes','delivery_note_evidence','sale_corrections','service_partners','partner_jobs','capital_assets','partner_payments','stock_change_history','session']){
            const rows=payload.tables[table];
            if(!rows.length) continue;
            // Only the columns the backup holds are inserted; a column added since then (for example account disabling
            // or kernel returned per production day) takes its normal default instead of failing as blank.
            const present=new Set(rows.flatMap(row=>Object.keys(JSON.parse(row))));
            const columns=(await client.query(`SELECT column_name FROM information_schema.columns
                WHERE table_schema=current_schema() AND table_name=$1 AND is_generated='NEVER' ORDER BY ordinal_position`,[table])).rows
                .map(row=>row.column_name).filter(name=>present.has(name)).map(name=>'"'+name.replaceAll('"','""')+'"');
            await client.query(`INSERT INTO "${table}"(${columns.join(',')}) SELECT ${columns.join(',')} FROM jsonb_populate_recordset(NULL::"${table}",$1::jsonb)`,['['+rows.join(',')+']']);
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
    if(!process.argv.includes('--reset')){console.log('No data changed. Use node backend/seed.js --reset --confirm-database <database name> to rebuild TEST data for 2026-06-01 through 2026-11-17. Existing login accounts are preserved.');return;}
    const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
    const start=option('--start',DEFAULT_START),end=option('--end',DEFAULT_END);datesBetween(start,end);
    const databaseUrl=process.env.DATABASE_URL;if(!databaseUrl)throw new Error('DATABASE_URL is required');
    // The reset erases business records, so the operator must name the target database and it must not be marked production.
    const databaseName=decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
    if(process.env.NODE_ENV==='production')throw new Error('No data changed. The reset cannot run when NODE_ENV is production.');
    if(option('--confirm-database',null)!==databaseName)throw new Error('No data changed. This reset erases all business records in database "'+databaseName+'". Repeat the command with --confirm-database '+databaseName+' only if it holds test data.');
    const folder=path.resolve(__dirname,'../../inventory-safety-backups','before-test-seed-'+new Date().toISOString().replace(/[:.]/g,'-'));
    fs.mkdirSync(folder,{recursive:true,mode:0o700});
    let backup=path.join(folder,'database.dump');
    const maintenanceUrl=new URL(databaseUrl);maintenanceUrl.hostname=maintenanceUrl.hostname.replace('-pooler','');
    const pool=new Pool({connectionString:maintenanceUrl.toString(),ssl:require('./database-ssl').databaseSsl(),max:1,connectionTimeoutMillis:30000,idleTimeoutMillis:0,keepAlive:true,keepAliveInitialDelayMillis:10000});
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
