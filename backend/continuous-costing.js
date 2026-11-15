// Daily weighted-average process costing. Weighings are independent, not matched batches.
// Unfinished quantity is a material-balance estimate, not a measurement of machine contents.
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
    const raw={},finished={},output=[],dispatches=[],progress=[];
    let quantity=0,value=0,unmatched=0,unpriced=false;
    const number=v=>Number(v)||0;
    const productKey=name=>String(name).trim().toLowerCase();
    function finishedItem(item) {
        return finished[item.item_id]||(finished[item.item_id]={item_id:item.item_id,name:item.name,quantity:0,value:0});
    }
    function average(item){return item.quantity>0?item.value/item.quantity:0;}
    for(const [date,day] of [...days].sort(([a],[b])=>a.localeCompare(b))) {
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
        const received={pko:0,pkc:0,sludge:0};
        const isHistorical=day.production.some(row=>!row.batch_id||row.legacy_batch);
        if(day.production.length)for(const entry of day.stock) {
            const key=productKey(entry.name);
            if(key in received&&(entry.source_type==='Production'||(isHistorical&&entry.source_type==='Manual')))received[key]+=number(entry.received);
        }
        const produced=received.pko+received.pkc+received.sludge;
        const unitCost=availableQuantity>0?availableValue/availableQuantity:0;
        const coveredOutput=Math.min(produced,availableQuantity);
        const coveredLoss=Math.min(day.loss,Math.max(availableQuantity-coveredOutput,0));
        const completedCost=coveredOutput*unitCost,lossCost=coveredLoss*unitCost;
        const discrepancy=Math.max(0,produced+day.loss-availableQuantity);
        unmatched+=discrepancy;
        quantity=Math.max(0,availableQuantity-coveredOutput-coveredLoss);
        value=Math.max(0,availableValue-completedCost-lossCost);
        if(quantity===0&&availableQuantity>0)value=0;
        // Keep the existing allocation shares; missing product weighings make the split provisional.
        const shares={pko:received.sludge>0?0.73:0.75,pkc:0.25,sludge:received.sludge>0?0.02:0};
        const denominator=Object.keys(received).reduce((sum,key)=>sum+(received[key]>0?shares[key]:0),0);
        const allocated={pko:0,pkc:0,sludge:0};
        for(const item of productItems) {
            const key=productKey(item.name);
            if(!(key in received)||!received[key])continue;
            allocated[key]=denominator?completedCost*shares[key]/denominator:0;
            const balance=finishedItem(item);balance.quantity+=received[key];balance.value+=allocated[key];
        }
        // Manual opening adjustments are stock, not newly produced goods.
        for(const entry of day.stock) {
            const key=productKey(entry.name);
            const counted=day.production.length&&(entry.source_type==='Production'||isHistorical&&entry.source_type==='Manual')&&key in received;
            if(!counted&&number(entry.received)>0)finishedItem(entry).quantity+=number(entry.received);
        }
        const progressRow={date,opening_quantity:openingQuantity,opening_value:openingValue,kernel_issued:issued,
            production_cost_added:issuedCost,products_received:produced,recorded_loss:day.loss,loss_cost:lossCost,
            completed_production_cost:completedCost,closing_quantity:quantity,closing_value:value,
            unmatched_output_quantity:discrepancy,unpriced_materials:rawUnpriced,
            provisional:true,status:discrepancy||rawUnpriced?'Review required':'Estimated'};
        progress.push(progressRow);
        if(day.production.length||day.issues.length||day.loss) {
            const materialList=Object.values(materials).map(m=>({...m,average_cost:m.quantity_issued?m.total_cost/m.quantity_issued:0}));
            const kernel=materialList.find(m=>productKey(m.name)==='p kernel');
            const balanceFor=key=>{
                const item=productItems.find(item=>productKey(item.name)===key);
                return item&&finished[item.item_id]?average(finished[item.item_id]):0;
            };
            output.push({production_date:date,created_at:day.production.at(-1)?.created_at||day.issues.at(-1)?.created_at,
                sequence_basis:'daily continuous-production estimate',batch_id:null,
                kernel_issued:issued,manager_kernel_used:day.production.reduce((sum,r)=>sum+number(r.kernel_used),0),
                kernel_variance:0,kernel_variance_percentage:0,avg_kernel_cost:kernel?.average_cost||0,total_kernel_cost:kernel?.total_cost||0,
                materials_costed:materialList,total_cost:issuedCost,completed_production_cost:completedCost,
                opening_work_in_progress:openingValue,closing_work_in_progress:value,unfinished_quantity:quantity,
                recorded_loss:day.loss,loss_cost:lossCost,unmatched_output_quantity:discrepancy,provisional:true,
                manager_pko_produced:day.production.reduce((sum,r)=>sum+number(r.pko_produced),0),
                manager_pkc_produced:day.production.reduce((sum,r)=>sum+number(r.pkc_produced),0),
                storekeeper_pko_received:received.pko,storekeeper_pkc_received:received.pkc,sludge_received:received.sludge,
                pko_variance:0,pkc_variance:0,pko_production_cost:allocated.pko,pkc_production_cost:allocated.pkc,sludge_production_cost:allocated.sludge,
                pko_daily_cost_per_kg:received.pko?allocated.pko/received.pko:0,pkc_daily_cost_per_kg:received.pkc?allocated.pkc/received.pkc:0,
                sludge_daily_cost_per_kg:received.sludge?allocated.sludge/received.sludge:0,
                pko_tank_average_cost:balanceFor('pko'),pkc_stock_average_cost:balanceFor('pkc'),sludge_stock_average_cost:balanceFor('sludge'),
                receipt_status:discrepancy?'review_required':quantity>0?'production_in_progress':'received'});
        }
        // Intraday dispatch values are estimates until the day's receipts are reconciled.
        for(const entry of day.stock.filter(row=>number(row.issued)>0).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))) {
            const balance=finishedItem(entry),amount=number(entry.issued),cost=average(balance)*amount;
            const unit=average(balance);balance.quantity-=amount;balance.value-=cost;
            dispatches.push({dispatch_date:date,created_at:entry.created_at,item_id:entry.item_id,name:entry.name,
                quantity_dispatched:amount,weighted_average_cost:unit,cost_of_dispatch:cost,
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
