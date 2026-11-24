// Price Guide (Director only): for each product, the full cost per kg of the stock held and the price and profit
// at 15%, 20% and 30% profit margin (profit as a share of the selling price), with the current price for comparison.
// Figures come from /api/price-guide.
// The normal number of production days per month is remembered on this device.
(function(){
    const box=document.getElementById('price-guide-products');
    const idleBox=document.getElementById('price-guide-idle');
    const message=document.getElementById('price-guide-message');
    const daysInput=document.getElementById('price-guide-days');
    if(!box||!daysInput)return;
    const storageKey='priceGuideNormalDays';
    try{const saved=localStorage.getItem(storageKey);if(saved)daysInput.value=saved;}catch(error){}
    const naira=value=>'₦'+Number(value||0).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2});
    const whole=value=>'₦'+Math.round(Number(value)||0).toLocaleString('en-NG');
    const kg=value=>Number(value||0).toLocaleString('en-NG',{maximumFractionDigits:2})+' kg';
    const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
    const monthName=month=>new Date(month+'-01T00:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
    let loading=0;

    function costLine(label,value,className){const row=el('div',undefined,'price-guide-cost-row'+(className?' '+className:''));row.append(el('span',label),el('strong',naira(value)+' /kg'));return row;}

    function productCard(product){
        const card=el('article',undefined,'price-guide-card');
        const head=el('header',undefined,'price-guide-card-head');
        head.append(el('h3',product.name),el('span','In stock: '+kg(product.stock_quantity),'price-guide-stock'));
        if(product.cost_basis==='unknown'){
            card.append(head,el('p','Cost unknown: '+kg(product.uncosted_quantity)+' of this '+product.name+' was added by hand (for example opening stock) with no production cost. '+
                'No break-even or margin is shown until that stock has been sold.','price-guide-note'));
            return card;
        }
        if(product.cost_basis==='none'){
            card.append(head,el('p','No current cost estimate: no '+product.name+' has been produced yet.','price-guide-note'));
            return card;
        }
        const costs=el('div',undefined,'price-guide-costs');
        costs.append(costLine('Production cost (kernel, diesel, electricity)',product.production_cost_per_kg),
            costLine('Production losses ('+product.loss_rate+'% normal loss, last 90 days)',product.loss_cost_per_kg),
            costLine('Running costs (salaries, rent, expenses of its production days)',product.running_cost_per_kg),
            costLine('Full cost = break-even price',product.full_cost_per_kg,'is-total'));
        const table=el('table',undefined,'price-guide-table');
        const headRow=el('tr');for(const label of ['Profit margin','Price /kg','Profit /kg','Profit on stock'])headRow.appendChild(el('th',label));
        const thead=el('thead');thead.appendChild(headRow);
        const body=el('tbody');
        for(const option of product.margins){
            const row=el('tr');
            row.append(el('td',option.margin+'%'),el('td',naira(option.price_per_kg)),el('td',naira(option.profit_per_kg)),el('td',whole(option.profit_on_stock)));
            body.appendChild(row);
        }
        table.append(thead,body,el('caption','Profit margin is profit as a share of the selling price: at 20%, ₦20 of every ₦100 of sales is profit (price = full cost ÷ 0.80).'));
        const tableWrap=el('div',undefined,'price-guide-table-wrap');tableWrap.appendChild(table);
        const current=el('div',undefined,'price-guide-current');
        if(product.current_price==null||!product.current){
            current.classList.add('is-missing');current.textContent='No current price set for '+product.name+'.';
        }else{
            const state=product.current.profit_per_kg<0?'is-loss':product.current.margin<15?'is-low':'is-good';
            current.classList.add(state);
            current.append(el('span','Your current price: '+naira(product.current_price)+' /kg'),
                el('strong',(product.current.profit_per_kg<0?'Loss ':'Profit ')+naira(Math.abs(product.current.profit_per_kg))+' /kg'+
                    (product.current.margin==null?'':' ('+(product.current.profit_per_kg<0?'loss of ':'')+Math.abs(product.current.margin)+'% '+(product.current.profit_per_kg<0?'of the price':'profit margin')+')')),
                el('span','On the stock held: '+(product.current.profit_on_stock<0?'loss ':'profit ')+whole(Math.abs(product.current.profit_on_stock))));
        }
        if(product.cost_basis==='last')card.appendChild(el('p','No '+product.name+' in stock: costs are from the last production on '+
            new Date(product.cost_date+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+'.','price-guide-note'));
        card.append(head,costs,tableWrap,current);
        return card;
    }

    function idleSummary(rows){
        idleBox.replaceChildren(...rows.map(row=>{
            const item=el('div',undefined,'price-guide-idle-row');
            item.append(el('strong',monthName(row.month)+(row.in_progress?' (so far)':'')),
                el('span',row.production_days+' production day'+(row.production_days===1?'':'s')+' of '+row.normal_days+' normal'),
                el('span','Idle-day cost: '+whole(row.idle_day_cost)+(row.salaries_estimated?' (salaries estimated from the last payroll)':'')));
            if(row.idle_day_cost>0)item.classList.add('has-idle');
            return item;
        }));
    }

    async function load(){
        const request=++loading;
        const days=Math.min(Math.max(Math.round(Number(daysInput.value)||26),1),31);
        daysInput.value=days;
        try{localStorage.setItem(storageKey,String(days));}catch(error){}
        message.textContent='Working out costs…';
        try{
            const response=await fetch('/api/price-guide?normal_days='+days);const result=await response.json();
            if(!response.ok)throw Error(result.err||'Could not load the price guide.');
            if(request!==loading)return;
            box.replaceChildren(...result.products.map(productCard));
            idleSummary(result.idle);
            message.textContent='';
        }catch(error){if(request===loading)message.textContent=error.message;}
    }

    window.loadPriceGuide=load;
    daysInput.addEventListener('change',load);
})();
