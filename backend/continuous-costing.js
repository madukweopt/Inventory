// Daily weighted-average process costing. Weighings are independent, not matched batches.
// Unfinished quantity is a material-balance estimate, not a measurement of machine contents.
// Product shares are applied per production authorisation, so oil weighed a day after its cake
// still shares the same production cost instead of each weighing day being costed alone.
function calculateContinuousCosts({purchases,issues,production,productStock,productItems,losses=[]}) {
    const days=new Map();
    const dayFor=date=>{
        if(!days.has(date))days.set(date,{purchases:[],issues:[],production:[],stock:[],loss:0});
        return days.get(date);
    };
    for(const record of purchases)dayFor(record.date).purchases.push(record);
    for(const record of issues)dayFor(record.date).issues.push(record);
    for(const record of production)dayFor(record.date).production.push(record);
    for(const record of productStock)dayFor(record.date).stock.push(record);
    for(const record of losses)dayFor(record.date).loss+=Number(record.quantity)||0;
    const raw={},finished={},output=[],dispatches=[],progress=[],groups={};
    let quantity=0,value=0,unmatched=0,unpriced=false;
    const number=v=>Number(v)||0;
    const productKey=name=>String(name).trim().toLowerCase();
    const groupKey=(entry,date)=>entry.source_type==='Production'&&entry.source_id!=null?'request:'+entry.source_id:'day:'+date;
    function finishedItem(item) {
        return finished[item.item_id]||(finished[item.item_id]={item_id:item.item_id,name:item.name,quantity:0,value:0});
    }
    function average(item){return item.quantity>0?item.value/item.quantity:0;}
    const ordered=[...days].sort(([a],[b])=>a.localeCompare(b));
    // First pass: move mass-based cost out of unfinished material as products are weighed.
    for(const [date,day] of ordered) {
        const openingQuantity=quantity,openingValue=value,materials={};
        for(const purchase of day.purchases.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))) {
            const item=raw[purchase.item_id]||(raw[purchase.item_id]={quantity:0,value:0});
            item.quantity+=number(purchase.quantity);item.value+=number(purchase.value);
        }
        let issued=0,issuedCost=0,rawUnpriced=false;
        for(const issue of day.issues) {
            const item=raw[issue.item_id]||(raw[issue.item_id]={quantity:0,value:0});
            const amount=number(issue.quantity),unitCost=average(item),cost=unitCost*amount;
            if(amount>item.quantity)rawUnpriced=true;
            item.quantity-=amount;item.value-=cost;
            const material=materials[issue.item_id]||(materials[issue.item_id]={item_id:issue.item_id,name:issue.name,item_type:issue.item_type,quantity_issued:0,total_cost:0});
            material.quantity_issued+=amount;material.total_cost+=cost;
            issuedCost+=cost;
            // Only kernel contributes to the physical production mass balance.
            if(productKey(issue.name)==='p kernel')issued+=amount;
        }
        unpriced=unpriced||rawUnpriced;
        quantity+=issued;value+=issuedCost;
        const availableQuantity=quantity,availableValue=value;
        const received={pko:0,pkc:0,sludge:0},receipts=[];
        const isHistorical=day.production.some(row=>!row.batch_id||row.legacy_batch);
        if(day.production.length)for(const entry of day.stock) {
            const key=productKey(entry.name);
            if(key in received&&number(entry.received)>0&&(entry.source_type==='Production'||(isHistorical&&entry.source_type==='Manual'))) {
                received[key]+=number(entry.received);receipts.push({entry,key,group:groupKey(entry,date),quantity:number(entry.received)});
            }
        }
        const produced=received.pko+received.pkc+received.sludge;
        const unitCost=availableQuantity>0?availableValue/availableQuantity:0;
        const coveredOutput=Math.min(produced,availableQuantity);
        const coveredLoss=Math.min(day.loss,Math.max(availableQuantity-coveredOutput,0));
        const completedCost=coveredOutput*unitCost,lossCost=coveredLoss*unitCost;
        // Ignore floating-point remainders below the app's two-decimal precision.
        const excess=produced+day.loss-availableQuantity,discrepancy=excess>0.005?excess:0;
        unmatched+=discrepancy;
        quantity=Math.max(0,availableQuantity-coveredOutput-coveredLoss);
        value=Math.max(0,availableValue-completedCost-lossCost);
        if(quantity===0&&availableQuantity>0)value=0;
        // Each weighed kilogram carries the same share of the day's completed cost into its production group.
        for(const receipt of receipts) {
            const group=groups[receipt.group]||(groups[receipt.group]={cost:0,totals:{pko:0,pkc:0,sludge:0}});
            group.cost+=produced?completedCost*receipt.quantity/produced:0;group.totals[receipt.key]+=receipt.quantity;
        }
        Object.assign(day,{materials,issued,issuedCost,rawUnpriced,received,receipts,completedCost,lossCost,discrepancy,
            openingQuantity,openingValue,closingQuantity:quantity,closingValue:value,isHistorical});
        progress.push({date,opening_quantity:openingQuantity,opening_value:openingValue,kernel_issued:issued,
            production_cost_added:issuedCost,products_received:produced,recorded_loss:day.loss,loss_cost:lossCost,
            completed_production_cost:completedCost,closing_quantity:quantity,closing_value:value,
            unmatched_output_quantity:discrepancy,unpriced_materials:rawUnpriced,
            provisional:true,status:discrepancy||rawUnpriced?'Review required':'Estimated'});
    }
    // Keep the existing allocation shares, applied once to the whole production group's product mix.
    for(const group of Object.values(groups)) {
        const shares={pko:group.totals.sludge>0?0.73:0.75,pkc:0.25,sludge:group.totals.sludge>0?0.02:0};
        const denominator=Object.keys(group.totals).reduce((sum,key)=>sum+(group.totals[key]>0?shares[key]:0),0);
        group.unit={};
        for(const key of Object.keys(group.totals))group.unit[key]=group.totals[key]&&denominator?group.cost*shares[key]/denominator/group.totals[key]:0;
    }
    // Second pass: add weighed products to finished stock in date order, then cost the day's dispatches.
    for(const [date,day] of ordered) {
        const allocated={pko:0,pkc:0,sludge:0},counted=new Set();
        for(const receipt of day.receipts) {
            const item=productItems.find(item=>productKey(item.name)===receipt.key);
            const amount=receipt.quantity*groups[receipt.group].unit[receipt.key];
            allocated[receipt.key]+=amount;counted.add(receipt.entry);
            if(item){const balance=finishedItem(item);balance.quantity+=receipt.quantity;balance.value+=amount;}
        }
        // Manual opening adjustments are stock, not newly produced goods.
        for(const entry of day.stock) {
            if(!counted.has(entry)&&number(entry.received)>0)finishedItem(entry).quantity+=number(entry.received);
        }
        if(day.production.length||day.issues.length||day.loss) {
            const materialList=Object.values(day.materials).map(m=>({...m,average_cost:m.quantity_issued?m.total_cost/m.quantity_issued:0}));
            const kernel=materialList.find(m=>productKey(m.name)==='p kernel');
            const balanceFor=key=>{
                const item=productItems.find(item=>productKey(item.name)===key);
                return item&&finished[item.item_id]?average(finished[item.item_id]):0;
            };
            const received=day.received;
            output.push({production_date:date,created_at:day.production.at(-1)?.created_at||day.issues.at(-1)?.created_at,
                sequence_basis:'daily continuous-production estimate',batch_id:null,
                kernel_issued:day.issued,manager_kernel_used:day.production.reduce((sum,r)=>sum+number(r.kernel_used),0),
                kernel_variance:0,kernel_variance_percentage:0,avg_kernel_cost:kernel?.average_cost||0,total_kernel_cost:kernel?.total_cost||0,
                materials_costed:materialList,total_cost:day.issuedCost,completed_production_cost:day.completedCost,
                opening_work_in_progress:day.openingValue,closing_work_in_progress:day.closingValue,unfinished_quantity:day.closingQuantity,
                recorded_loss:day.loss,loss_cost:day.lossCost,unmatched_output_quantity:day.discrepancy,provisional:true,
                manager_pko_produced:day.production.reduce((sum,r)=>sum+number(r.pko_produced),0),
                manager_pkc_produced:day.production.reduce((sum,r)=>sum+number(r.pkc_produced),0),
                storekeeper_pko_received:received.pko,storekeeper_pkc_received:received.pkc,sludge_received:received.sludge,
                pko_variance:0,pkc_variance:0,pko_production_cost:allocated.pko,pkc_production_cost:allocated.pkc,sludge_production_cost:allocated.sludge,
                pko_daily_cost_per_kg:received.pko?allocated.pko/received.pko:0,pkc_daily_cost_per_kg:received.pkc?allocated.pkc/received.pkc:0,
                sludge_daily_cost_per_kg:received.sludge?allocated.sludge/received.sludge:0,
                pko_tank_average_cost:balanceFor('pko'),pkc_stock_average_cost:balanceFor('pkc'),sludge_stock_average_cost:balanceFor('sludge'),
                receipt_status:day.discrepancy?'review_required':day.closingQuantity>0?'production_in_progress':'received'});
        }
        // Intraday dispatch values are estimates until the day's receipts are reconciled.
        for(const entry of day.stock.filter(row=>number(row.issued)>0).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))) {
            const balance=finishedItem(entry),amount=number(entry.issued),cost=average(balance)*amount;
            const unit=average(balance);balance.quantity-=amount;balance.value-=cost;
            dispatches.push({dispatch_date:date,created_at:entry.created_at,item_id:entry.item_id,name:entry.name,
                quantity_dispatched:amount,weighted_average_cost:unit,cost_of_dispatch:cost,awaiting_invoice:Boolean(entry.awaiting_invoice),
                source_type:entry.source_type||null,adjustment_reason:entry.adjustment_reason||null,
                invoice_quantity:entry.invoice_quantity==null?null:number(entry.invoice_quantity),
                remaining_quantity:balance.quantity,remaining_value:balance.value,provisional:true});
        }
    }
    return {production_costs:output,product_dispatch_costs:dispatches,
        finished_stock:Object.values(finished).map(item=>({...item,weighted_average_cost:average(item)})),
        work_in_progress:{quantity,value,unmatched_output_quantity:unmatched,provisional:true,
            status:unmatched||unpriced?'Review required':'Estimated',unpriced_materials:unpriced,basis:'Kernel issued minus weighed oil, cake, sludge and recorded production losses'},
        production_in_progress:progress};
}
module.exports={calculateContinuousCosts};
