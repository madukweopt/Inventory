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
