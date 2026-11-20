// Stock Change History: every manual stock change (Inventory Report, and corrections to Daily Usage),
// with the values before and after each edit, who made it and when. Director only; nothing here can be changed.
(function(){
    const list=document.getElementById('stock-history-list');
    const more=document.getElementById('stock-history-more');
    const filter=document.getElementById('stock-history-filter');
    if(!list)return;
    let rows=[],offset=0;
    const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
    const amount=(value,item)=>formatNumber(Number(value)||0)+' '+(typeof inventoryUnit==='function'?inventoryUnit(item):'kg');
    // Says what one saved version of the change did, in the same words as the form.
    function describe(values,item){
        const received=Number(values.received)||0,issued=Number(values.issued)||0;
        let change;
        if(received>0&&issued>0){const net=received-issued;change='Received '+amount(received,item)+' and issued '+amount(issued,item)+' (net '+(net>=0?'+':'−')+amount(Math.abs(net),item)+')';}
        else change=(received>0?'Add ':'Remove ')+amount(received||issued,item);
        const parts=[change,item||'Unknown item'];
        if(values.daily_usage)parts.push('Daily usage');else parts.push(values.adjustment_reason||'No reason');
        parts.push('dated '+formatDate(values.count_date));
        return parts.join(' · ');
    }
    function render(){
        const shown=rows.filter(row=>!filter.value||row.action===filter.value);
        list.replaceChildren(...(shown.length?shown.map(card):[el('p','No stock changes to show.','stock-history-empty')]));
    }
    function card(row){
        const item=el('article',undefined,'stock-history-item action-'+row.action.toLowerCase());
        const head=el('div',undefined,'stock-history-head');
        const when=new Date(row.changed_at);
        head.append(el('span',row.action,'stock-history-action'),
            el('span',when.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+', '+when.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})+' · by '+(row.changed_by||'unknown'),'stock-history-when'));
        item.appendChild(head);
        if(row.before_values&&row.after_values){
            item.append(el('p','Before: '+describe(row.before_values,row.before_item),'stock-history-before'),el('p','After: '+describe(row.after_values,row.after_item),'stock-history-after'));
        }else if(row.after_values)item.appendChild(el('p',describe(row.after_values,row.after_item),'stock-history-after'));
        else if(row.before_values)item.appendChild(el('p','Removed: '+describe(row.before_values,row.before_item),'stock-history-before'));
        if(row.backfilled)item.appendChild(el('small','Entered before this history started. It shows the entry as it is saved now; earlier edits were not recorded.','stock-history-note'));
        return item;
    }
    async function load(reset){
        if(reset){rows=[];offset=0;list.textContent='Loading history…';}
        try{
            const response=await fetch('/api/stock-change-history?offset='+offset);const result=await response.json();
            if(!response.ok)throw Error(result.err||'Could not load the stock change history.');
            rows=rows.concat(result.rows);offset+=result.rows.length;more.hidden=!result.more;render();
        }catch(error){list.textContent=error.message;more.hidden=true;}
    }
    window.loadStockHistory=()=>load(true);
    filter?.addEventListener('change',render);
    more?.addEventListener('click',()=>load(false));
})();
