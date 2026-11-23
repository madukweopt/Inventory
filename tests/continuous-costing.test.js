const test=require('node:test');const assert=require('node:assert/strict');
const {calculateContinuousCosts}=require('../backend/continuous-costing');
const items=[{item_id:2,name:'PKO'},{item_id:3,name:'PKC'},{item_id:4,name:'Sludge'}];
const purchase=(date,quantity,price)=>({date,item_id:1,name:'P Kernel',item_type:'raw_material',quantity,value:quantity*price,created_at:date+'T08:00:00Z'});
const issue=(date,quantity)=>({date,item_id:1,name:'P Kernel',item_type:'raw_material',quantity,created_at:date+'T09:00:00Z'});
function receive(date,pko,pkc,sludge) {return items.map((item,index)=>({...item,date,received:[pko,pkc,sludge][index],issued:0,source_type:'Production',created_at:date+'T12:00:00Z'}));}
function run({purchases=[],issues=[],productStock=[],losses=[]}){
 const dates=[...new Set(productStock.map(row=>row.date))];
 return calculateContinuousCosts({purchases,issues,productStock,losses,productItems:items,production:dates.map(date=>({date,batch_id:1,kernel_used:0,pko_produced:0,pkc_produced:0}))});
}
test('Partial output leaves its remaining material and proportional cost in production',()=>{
 const result=run({purchases:[purchase('2026-01-01',1000,300)],issues:[issue('2026-01-01',1000)],productStock:receive('2026-01-01',300,550,50)});
 assert.equal(result.work_in_progress.quantity,100);assert.equal(result.work_in_progress.value,30000);
 assert.equal(result.production_costs[0].completed_production_cost,270000);
 assert.ok(Math.abs(result.production_costs[0].pko_production_cost-197100)<0.001);
});
test('Unfinished material carries across days and combines with later kernel issues',()=>{
 const result=run({purchases:[purchase('2026-01-01',1000,300),purchase('2026-01-02',500,400)],issues:[issue('2026-01-01',1000),issue('2026-01-02',500)],
 productStock:[...receive('2026-01-01',300,550,50),...receive('2026-01-02',200,380,20)]});
 assert.equal(result.production_in_progress[1].opening_quantity,100);assert.equal(result.production_in_progress[1].opening_value,30000);
 assert.ok(Math.abs(result.production_in_progress[1].completed_production_cost-230000)<0.001);
 assert.equal(result.work_in_progress.quantity,0);assert.equal(result.work_in_progress.value,0);
});
test('Recording loss removes its mass and value separately without inventing finished products',()=>{
 const result=run({purchases:[purchase('2026-01-01',1000,300)],issues:[issue('2026-01-01',1000)],productStock:receive('2026-01-01',300,550,50),losses:[{date:'2026-01-01',quantity:10}]});
 assert.equal(result.work_in_progress.quantity,90);assert.equal(result.work_in_progress.value,27000);
 assert.equal(result.production_in_progress[0].loss_cost,3000);
 assert.equal(result.production_in_progress[0].completed_production_cost,270000);
});
test('Repeated issues do not require previous output to be fully received',()=>{
 const result=run({purchases:[purchase('2026-01-01',2000,300)],issues:[issue('2026-01-01',1000),issue('2026-01-01',1000)],productStock:receive('2026-01-01',350,500,50)});
 assert.equal(result.work_in_progress.quantity,1100);assert.equal(result.work_in_progress.value,330000);
});
test('Output with missing input records is flagged instead of creating negative work in progress',()=>{
 const result=run({purchases:[purchase('2026-01-01',100,300)],issues:[issue('2026-01-01',100)],productStock:receive('2026-01-01',50,100,0)});
 assert.equal(result.work_in_progress.quantity,0);assert.equal(result.work_in_progress.unmatched_output_quantity,50);assert.equal(result.work_in_progress.status,'Review required');
});
test('Products weighed on different days share one production authorisation cost by the product shares',()=>{
 const authorised=(date,pko,pkc,sludge)=>receive(date,pko,pkc,sludge).map(row=>({...row,source_id:7}));
 const result=run({purchases:[purchase('2026-01-01',1000,300)],issues:[issue('2026-01-01',1000)],
 productStock:[...authorised('2026-01-01',0,550,0),...authorised('2026-01-02',380,0,20)]});
 const [monday,tuesday]=result.production_costs;
 const total=monday.completed_production_cost+tuesday.completed_production_cost;
 assert.ok(Math.abs(total-285000)<0.001);
 assert.ok(Math.abs(monday.pkc_production_cost-total*0.25)<0.001);
 assert.ok(Math.abs(tuesday.pko_production_cost-total*0.73)<0.001);
 assert.ok(Math.abs(tuesday.sludge_production_cost-total*0.02)<0.001);
});
test('Kernel disposed of is a stock loss, not material in production',()=>{
 const disposal={...issue('2026-01-01',100),source_type:'Manual',adjustment_reason:'Disposal'};
 const result=calculateContinuousCosts({purchases:[purchase('2026-01-01',100,300)],issues:[disposal],productStock:[],losses:[],productItems:items,production:[]});
 assert.equal(result.work_in_progress.quantity,0);assert.equal(result.work_in_progress.value,0);
 assert.equal(result.raw_material_losses.length,1);assert.equal(result.raw_material_losses[0].cost_of_dispatch,30000);
});
test('Kernel returned to store the next day leaves production at its cost',()=>{
 const back={date:'2026-01-02',item_id:1,name:'P Kernel',quantity:40,adjustment_reason:'Return to store',created_at:'2026-01-02T10:00:00Z'};
 const result=calculateContinuousCosts({purchases:[purchase('2026-01-01',100,300)],issues:[issue('2026-01-01',100)],productStock:[],losses:[],productItems:items,production:[],rawReceipts:[back]});
 assert.equal(result.work_in_progress.quantity,60);assert.equal(result.work_in_progress.value,18000);
});
