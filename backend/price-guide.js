// Price Guide (Director only): what each product really costs per tonne, and the price and profit at chosen profit
// margins. A margin is profit as a share of the selling price: price = full cost ÷ (1 − margin), so a 20% margin
// means 20% of the price is profit. Figures are worked out per kg (as costs are kept) and shown per tonne.
// A planning tool only: it changes no costing, stock values or dashboard figures.
//
// Full cost per kg of the stock held =
//   production cost per kg (the app's own moving weighted average: kernel, diesel, electricity, losses)
// + running cost per kg (salaries, rent and insurance, running expenses) of the days that stock was produced.
//
// Running costs are shared over a normal month of production: each production day carries the month's running
// costs divided by the normal number of production days (26 unless the Director sets another number), split
// between that day's PKO, PKC and sludge in the same proportions as the kernel cost. Days lost to breakdowns or
// shortages are not loaded onto the stock that follows; their share is shown separately as idle-day cost.
// The running cost per kg is kept as a moving weighted average like the production cost: it rises as stock is
// produced and shrinks as stock is sold, written off or corrected, so it always matches the stock still held.

const PRODUCTS=[['PKO','pko','storekeeper_pko_received'],['PKC','pkc','storekeeper_pkc_received'],['Sludge','sludge','sludge_received']];
const MARGINS=[15,20,30];
const round=(value,places=2)=>Math.round((Number(value)||0)*10**places)/10**places;
const monthOf=day=>String(day).slice(0,7);
const dayOf=value=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);

// The same product cost proportions the app uses for production cost (see continuous-costing.js).
function shares(quantities) {
    const base={pko:quantities.sludge>0?0.73:0.75,pkc:0.25,sludge:quantities.sludge>0?0.02:0};
    const used=Object.keys(base).filter(key=>quantities[key]>0);
    const total=used.reduce((sum,key)=>sum+base[key],0);
    return Object.fromEntries(Object.keys(base).map(key=>[key,used.includes(key)&&total?base[key]/total:0]));
}

// Running costs of each month: salaries, the monthly share of rent and insurance (not start-up months),
// and running expenses. A month without prepared payroll uses the latest earlier payroll as an estimate.
async function monthlyRunningCosts(pool) {
    const rows=async sql=>(await pool.query(sql)).rows;
    const payroll=Object.fromEntries((await rows(`SELECT to_char(payroll_month,'YYYY-MM') AS month,SUM(total_salary_cost) AS amount
        FROM payroll GROUP BY 1`)).map(row=>[row.month,Number(row.amount)]));
    const oneOff=Object.fromEntries((await rows(`SELECT to_char(expense_date,'YYYY-MM') AS month,SUM(amount_spent) AS amount FROM expenses
        WHERE category IN ('Expense','Expenses') AND spread_months=1 AND startup_months=0 GROUP BY 1`)).map(row=>[row.month,Number(row.amount)]));
    const spread=Object.fromEntries((await rows(`SELECT to_char(date_trunc('month',expense_date)+make_interval(months=>covered.month),'YYYY-MM') AS month,
            SUM(amount_spent/spread_months) AS amount
        FROM expenses CROSS JOIN LATERAL generate_series(0,spread_months-1) AS covered(month)
        WHERE category IN ('Expense','Expenses') AND spread_months>1 AND covered.month>=startup_months GROUP BY 1`)).map(row=>[row.month,Number(row.amount)]));
    return {payroll,oneOff,spread};
}

function runningCostForMonth(costs,month) {
    let salaries=costs.payroll[month],estimated=false;
    if(salaries===undefined) {
        const earlier=Object.keys(costs.payroll).filter(key=>key<month).sort().pop();
        salaries=earlier?costs.payroll[earlier]:0;estimated=Boolean(earlier);
    }
    const rent=costs.spread[month]||0,expenses=costs.oneOff[month]||0;
    return {month,salaries,salaries_estimated:estimated,rent_and_insurance:rent,running_expenses:expenses,total:salaries+rent+expenses};
}

// costs: the result of calculateCosts(); running: monthlyRunningCosts(); manualReceipts: stock added by hand;
// prices: current price per product name. Pure, so it can be tested on its own.
function buildPriceGuide({costs,running,manualReceipts=[],prices={},normalDays=26,today}) {
    normalDays=Math.min(Math.max(Math.round(Number(normalDays)||26),1),31);
    // Production days and output per month.
    const days=costs.production_costs.map(row=>({date:dayOf(row.production_date),created:String(row.created_at||''),
        quantities:{pko:Number(row.storekeeper_pko_received)||0,pkc:Number(row.storekeeper_pkc_received)||0,sludge:Number(row.sludge_received)||0}}))
        .filter(day=>day.quantities.pko+day.quantities.pkc+day.quantities.sludge>0);
    const productionDays={};
    for(const day of days)(productionDays[monthOf(day.date)]??=new Set()).add(day.date);
    const months={};
    const monthInfo=month=>months[month]??=(()=>{
        const cost=runningCostForMonth(running,month),count=productionDays[month]?.size||0;
        // Each production day carries a normal day's share; more production days than normal never charge more than the month.
        const perDay=cost.total/Math.max(normalDays,count);
        return {...cost,production_days:count,per_production_day:perDay,charged_to_stock:perDay*count,idle_day_cost:Math.max(cost.total-perDay*count,0)};
    })();
    // Moving weighted average of the running cost carried by each product's stock.
    const events=[];
    for(const day of days) {
        const split=shares(day.quantities),share=monthInfo(monthOf(day.date)).per_production_day;
        for(const [name,key] of PRODUCTS) if(day.quantities[key]>0)
            events.push({date:day.date,created:day.created,order:0,name,quantity:day.quantities[key],running:share*split[key]});
    }
    for(const receipt of manualReceipts) events.push({date:dayOf(receipt.date),created:String(receipt.created_at||''),order:0,name:receipt.name,quantity:Number(receipt.quantity),running:0});
    for(const out of costs.product_dispatch_costs) events.push({date:dayOf(out.dispatch_date),created:String(out.created_at||''),order:1,name:out.name,quantity:-Number(out.quantity_dispatched)});
    // Same order as the app's own costing: each day's production and added stock first, then what left, by time.
    events.sort((a,b)=>a.date.localeCompare(b.date)||a.order-b.order||a.created.localeCompare(b.created));
    const held=Object.fromEntries(PRODUCTS.map(([name])=>[name,{quantity:0,running:0}]));
    for(const event of events) {
        const stock=held[event.name];if(!stock)continue;
        if(event.quantity>=0) { stock.quantity+=event.quantity;stock.running+=event.running; }
        else {
            const leaving=Math.min(-event.quantity,stock.quantity);
            if(stock.quantity>0) stock.running-=stock.running*leaving/stock.quantity;
            stock.quantity-=leaving;
            if(stock.quantity<=0.000001) { stock.quantity=0;stock.running=0; }
        }
    }
    const products=PRODUCTS.map(([name])=>{
        const finished=costs.finished_stock.find(row=>row.name===name)||{quantity:0,weighted_average_cost:0};
        const quantity=Number(finished.quantity)||0;
        const production=Number(finished.weighted_average_cost)||0;
        const runningPerKg=held[name].quantity>0?held[name].running/held[name].quantity:0;
        const full=production+runningPerKg;
        const current=prices[name]==null?null:Number(prices[name]);
        const tonne=value=>round(value*1000);
        return {
            name,stock_quantity:round(quantity),stock_tonnes:round(quantity/1000,3),
            production_cost_per_tonne:tonne(production),running_cost_per_tonne:tonne(runningPerKg),full_cost_per_tonne:tonne(full),
            margins:MARGINS.map(margin=>{
                const price=full/(1-margin/100);
                return {margin,price_per_tonne:tonne(price),profit_per_tonne:tonne(price-full),profit_on_stock:round((price-full)*quantity)};
            }),
            current_price_per_tonne:current==null?null:tonne(current),
            current:current==null?null:{profit_per_tonne:tonne(current-full),margin:current>0?round((current-full)/current*100,1):null,profit_on_stock:round((current-full)*quantity)}
        };
    });
    const thisMonth=monthOf(today),lastMonth=monthOf(new Date(Date.UTC(Number(thisMonth.slice(0,4)),Number(thisMonth.slice(5,7))-2,1)).toISOString());
    // For the month still in progress, only normal production days that have already passed count as lost.
    const summary=month=>{
        const info=monthInfo(month);let idle=info.idle_day_cost,inProgress=false;
        if(month===thisMonth) {
            const year=Number(month.slice(0,4)),monthNumber=Number(month.slice(5,7));
            const daysInMonth=new Date(Date.UTC(year,monthNumber,0)).getUTCDate(),dayNumber=Number(String(today).slice(8,10));
            const expectedSoFar=Math.round(normalDays*dayNumber/daysInMonth);
            idle=info.per_production_day*Math.max(expectedSoFar-info.production_days,0);inProgress=true;
        }
        return {month,in_progress:inProgress,production_days:info.production_days,normal_days:normalDays,running_costs:round(info.total),
            charged_to_stock:round(info.charged_to_stock),idle_day_cost:round(idle),salaries_estimated:info.salaries_estimated};
    };
    return {normal_days:normalDays,margins:MARGINS,products,idle:[summary(lastMonth),summary(thisMonth)]};
}

function registerPriceGuide(router,{pool,requireRole,calculateCosts}) {
    router.get('/api/price-guide',requireRole(['admin']),async function(req,res) {
        try {
            const today=new Date().toISOString().slice(0,10);
            const [costs,running,manual,prices]=await Promise.all([
                calculateCosts(),
                monthlyRunningCosts(pool),
                // Product stock added by hand (for example returned to store) carries no production days.
                pool.query(`SELECT i.name,s.received AS quantity,to_char(s.count_date,'YYYY-MM-DD') AS date,s.created_at
                    FROM stock_counts s JOIN items i USING(item_id)
                    WHERE i.name IN ('PKO','PKC','Sludge') AND s.received>0 AND s.source_type='Manual'`),
                pool.query(`SELECT DISTINCT ON (p.item_id) i.name,p.unit_price FROM product_prices p JOIN items i USING(item_id)
                    WHERE p.effective_date<=CURRENT_DATE ORDER BY p.item_id,p.effective_date DESC,p.price_id DESC`)
            ]);
            return res.json(buildPriceGuide({costs,running,manualReceipts:manual.rows,
                prices:Object.fromEntries(prices.rows.map(row=>[row.name,row.unit_price])),normalDays:req.query.normal_days,today}));
        } catch(error) {
            console.error(error);
            return res.status(500).json({err:'Could not work out the price guide.'});
        }
    });
}

module.exports={buildPriceGuide,shares,registerPriceGuide};
