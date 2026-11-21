// Record headings, accessible filters and numbers that fit without wrapping.
(function(){
    const pages={
        inventory:['Inventory Record','Track daily stock movement by item and date','cubes'],

    };
    for(const [key,[title,description,icon]] of Object.entries(pages)){
        const page=document.querySelector('#'+key+'-card-view');if(!page)continue;
        const heading=page.querySelector(':scope > h2');
        if(heading){
            const header=document.createElement('header');header.className='record-page-heading';
            const copy=document.createElement('div');heading.textContent=title;
            const subtitle=document.createElement('p');subtitle.textContent=description;
            heading.replaceWith(header);copy.append(heading,subtitle);header.append(AppUI.icon(icon),copy);
        }
        const select=page.querySelector('.data-item-filter');
        if(select){
            const label=document.createElement('label');label.className='filter-field';label.textContent=key==='expenses'?'Category':'Item';
            select.replaceWith(label);label.appendChild(select);
        }
        const range=page.querySelector('.data-date-filter');
        if(range){
            const group=document.createElement('div');group.className='filter-field';
            const label=document.createElement('span');label.textContent='Date range';
            range.replaceWith(group);group.append(label,range);
        }
        const sort=page.querySelector('.data-sort');if(sort)sort.setAttribute('aria-label','Sort '+title.toLowerCase());
    }
    const observed=new WeakSet();
    function fit(tile){
        if(innerWidth>600){const number=tile.querySelector(':scope > strong');if(number)number.style.removeProperty('font-size');return;}
        if(!tile.clientWidth)return;
        const number=tile.querySelector(':scope > strong'),unit=tile.querySelector(':scope > small');
        if(!number)return;
        const style=getComputedStyle(tile);
        const available=tile.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-(unit?.getBoundingClientRect().width||0)-(unit?.textContent?6:0);
        const maximum=Math.min(18,innerWidth*.045);
        number.style.fontSize=maximum+'px';
        const range=document.createRange();range.selectNodeContents(number);
        const width=range.getBoundingClientRect().width;
        if(width>available)number.style.fontSize=Math.max(9,Math.floor(maximum*available/width))+'px';
    }
    const resize=new ResizeObserver(entries=>{for(const entry of entries)fit(entry.target);});
    function register(){
        document.querySelectorAll('#inventory-card-view .ledger-card .data-record-values>.is-number').forEach(tile=>{
            if(!observed.has(tile)){observed.add(tile);resize.observe(tile);}
            fit(tile);
        });
    }
    new MutationObserver(records=>{
        for(const record of records)for(const node of record.removedNodes){
            if(node.nodeType!==1||node.isConnected)continue;
            for(const tile of [node,...node.querySelectorAll('.is-number')]){
                if(observed.has(tile)){resize.unobserve(tile);observed.delete(tile);}
            }
        }
        register();
    }).observe(document.querySelector('main')||document.body,{childList:true,subtree:true});
    register();
})();
