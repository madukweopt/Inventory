// Price Guide calculation with small figures whose answers can be worked out by hand.
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPriceGuide,shares}=require('../backend/price-guide');

const day=(date,pko,pkc,sludge=0)=>({production_date:date,created_at:date+'T15:00:00Z',storekeeper_pko_received:pko,storekeeper_pkc_received:pkc,sludge_received:sludge});
const out=(date,name,quantity)=>({dispatch_date:date,created_at:date+'T16:00:00Z',name,quantity_dispatched:quantity});
const stock=(pko,pkc,sludge,costs=[600,200,300])=>[['PKO',pko,costs[0]],['PKC',pkc,costs[1]],['Sludge',sludge,costs[2]]].map(([name,quantity,cost])=>({name,quantity,weighted_average_cost:cost}));
const product=(guide,name)=>guide.products.find(row=>row.name===name);
const close=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<0.01,label+': expected '+expected+', got '+actual);

test('production cost proportions match the app (73/25/2, or 75/25 without sludge)',()=>{
    assert.deepEqual(shares({pko:1,pkc:1,sludge:1}),{pko:0.73,pkc:0.25,sludge:0.02});
    assert.deepEqual(shares({pko:1,pkc:1,sludge:0}),{pko:0.75,pkc:0.25,sludge:0});
    const onlyPkc=shares({pko:0,pkc:1,sludge:0});assert.equal(onlyPkc.pkc,1);
});

test('each production day carries a normal day of running costs, kept as a moving average of the stock held',()=>{
    // October: running costs of ₦2,600,000 over 26 normal days = ₦100,000 per production day.
    const running={payroll:{'2026-10':2000000},spread:{'2026-10':500000},oneOff:{'2026-10':100000}};
    const costs={
        production_costs:[day('2026-10-01',380,560,20),day('2026-10-02',400,600,0)],
        product_dispatch_costs:[out('2026-10-01','PKO',190)],
        finished_stock:stock(590,1160,20)
    };
    const guide=buildPriceGuide({costs,running,prices:{PKO:900},normalDays:26,today:'2026-11-05'});
    // Day 1: PKO gets 73% of ₦100,000 = ₦73,000 for 380 kg; half is sold (the average per kg does not change),
    // then day 2 adds 75% of ₦100,000 = ₦75,000 for 400 kg. Left: 190 kg at ₦36,500 + 400 kg at ₦75,000.
    close(product(guide,'PKO').running_cost_per_kg,(36500+75000)/590,'PKO running cost per kg');
    // PKC: ₦25,000 for 560 kg and ₦25,000 for 600 kg, none sold.
    close(product(guide,'PKC').running_cost_per_kg,50000/1160,'PKC running cost per kg');
    close(product(guide,'Sludge').running_cost_per_kg,2000/20,'Sludge running cost per kg');
    // Full cost = production cost (the app's moving average) + running cost, per kg. A profit margin is profit
    // as a share of the selling price: price = full cost ÷ (1 − margin).
    const pko=product(guide,'PKO'),full=600+(36500+75000)/590;
    close(pko.full_cost_per_kg,full,'PKO full cost per kg');
    assert.equal(pko.stock_quantity,590);
    assert.deepEqual(pko.margins.map(row=>row.margin),[15,20,30]);
    close(pko.margins[0].price_per_kg,full/0.85,'15% margin price');
    const twenty=pko.margins[1];
    close(twenty.profit_per_kg/twenty.price_per_kg,0.2,'profit is 20% of the price');
    close(pko.margins[2].profit_per_kg,full/0.7-full,'30% margin profit per kg');
    close(twenty.profit_on_stock,(full/0.8-full)*590,'20% profit on the stock held');
    close(pko.current_price,900,'current price per kg');
    close(pko.current.profit_per_kg,900-full,'current profit per kg');
    close(pko.current.margin,Math.round((900-full)/900*1000)/10,'current profit margin');
    assert.equal(product(guide,'PKC').current,null,'no price set for PKC');
    // October had 2 production days of 26 normal: 24 idle days at ₦100,000 are not in the prices.
    const october=guide.idle.find(row=>row.month==='2026-10');
    assert.equal(october.production_days,2);close(october.idle_day_cost,2400000,'October idle-day cost');
    assert.equal(october.in_progress,false);
});

test('a week without production does not raise the cost of the stock made afterwards',()=>{
    const running={payroll:{'2026-10':2600000},spread:{},oneOff:{}};
    const busy={production_costs:[day('2026-10-01',100,100),day('2026-10-02',100,100)],product_dispatch_costs:[],finished_stock:stock(200,200,0)};
    const afterBreak={production_costs:[day('2026-10-01',100,100),day('2026-10-09',100,100)],product_dispatch_costs:[],finished_stock:stock(200,200,0)};
    const a=buildPriceGuide({costs:busy,running,normalDays:26,today:'2026-11-01'}),b=buildPriceGuide({costs:afterBreak,running,normalDays:26,today:'2026-11-01'});
    assert.equal(product(a,'PKO').running_cost_per_kg,product(b,'PKO').running_cost_per_kg);
});

test('more production days than normal never charge more than the month, and idle cost is never negative',()=>{
    const running={payroll:{'2026-10':300000},spread:{},oneOff:{}};
    const days=Array.from({length:30},(_,index)=>day('2026-10-'+String(index+1).padStart(2,'0'),10,10));
    const guide=buildPriceGuide({costs:{production_costs:days,product_dispatch_costs:[],finished_stock:stock(300,300,0)},running,normalDays:26,today:'2026-11-02'});
    const october=guide.idle.find(row=>row.month==='2026-10');
    close(october.charged_to_stock,300000,'charged to stock');assert.equal(october.idle_day_cost,0);
});

test('the month in progress counts only normal days already past as idle, and estimates missing salaries',()=>{
    // 15 November: about half of 26 normal days (13) have passed; 3 production days so far → 10 idle days.
    const running={payroll:{'2026-10':2600000},spread:{},oneOff:{}};
    const costs={production_costs:[day('2026-11-03',10,10),day('2026-11-04',10,10),day('2026-11-05',10,10)],product_dispatch_costs:[],finished_stock:stock(30,30,0)};
    const guide=buildPriceGuide({costs,running,normalDays:26,today:'2026-11-15'});
    const november=guide.idle.find(row=>row.month==='2026-11');
    assert.equal(november.in_progress,true);assert.equal(november.salaries_estimated,true);
    close(november.idle_day_cost,100000*(13-3),'November idle so far');
});

test('break-even includes the normal production loss, so selling every kg at it recovers the kernel spent',()=>{
    // ₦30,000 of kernel: 80 kg of products carry ₦24,000 and 20 kg lost carry ₦6,000 (25% of the product cost).
    const lossDay={...day('2026-11-02',80,0),completed_production_cost:24000,loss_cost:6000,pko_daily_cost_per_kg:300};
    const running={payroll:{},spread:{},oneOff:{}};
    const guide=buildPriceGuide({costs:{production_costs:[lossDay],product_dispatch_costs:[],finished_stock:stock(80,0,0,[300,0,0])},running,normalDays:26,today:'2026-11-05'});
    const pko=product(guide,'PKO');
    assert.equal(pko.loss_rate,25);close(pko.loss_cost_per_kg,75,'loss per kg');close(pko.full_cost_per_kg,375,'break-even');
});

test('empty stock shows the last production cost with its date, and no estimate for a product never made',()=>{
    const running={payroll:{},spread:{},oneOff:{}};
    const made={...day('2026-11-02',50,0),completed_production_cost:15000,loss_cost:0,pko_daily_cost_per_kg:300};
    const guide=buildPriceGuide({costs:{production_costs:[made],product_dispatch_costs:[out('2026-11-03','PKO',50)],finished_stock:stock(0,0,0,[0,0,0])},
        running,prices:{PKO:400},normalDays:26,today:'2026-11-05'});
    const pko=product(guide,'PKO');
    assert.equal(pko.cost_basis,'last');assert.equal(pko.cost_date,'2026-11-02');close(pko.full_cost_per_kg,300,'last cost');
    assert.ok(pko.current.margin<100,'a sold-out product never shows a 100% margin');
    assert.equal(product(guide,'PKC').cost_basis,'none');assert.equal(product(guide,'PKC').margins.length,0);
});
