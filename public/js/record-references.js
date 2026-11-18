// Original artwork from the supplied reference images, viewed as an icon sprite.
(function(){
    const sprites={
        cart:['sales',33,132,66,66],purchaseCart:['purchases',28,126,72,73],factory:['production',27,126,83,83],wallet:['expenses',27,126,81,80],
        kernel:['purchases',62,419,80,73],oil:['sales',57,1133,74,62],cake:['sales',57,779,74,60],sludge:['sales',57,417,74,62],
        calendar:['purchases',163,457,27,27],clock:['expenses',332,423,29,30],buyer:['sales',76,494,31,31],supplier:['purchases',78,512,32,31],
        quantity:['sales',84,549,26,30],coins:['purchases',560,569,30,32],money:['sales',694,549,34,23],truck:['sales',78,643,32,29],ticket:['purchases',87,737,32,28],
        check:['sales',825,647,24,20],edit:['sales',529,702,31,28],delete:['sales',677,702,29,28],document:['sales',857,702,24,27],
        flask:['purchases',90,799,30,30],chevron:['purchases',936,805,26,19],kernels:['production',75,466,31,28],pko:['production',315,466,30,30],pkc:['production',551,467,34,26],sludgeProduced:['production',786,467,27,30],
        tools:['production',562,562,25,27],entries:['production',75,614,26,26],notes:['production',74,660,26,26],wrench:['expenses',76,496,29,29],expenseCoins:['expenses',663,495,40,41],summaryCoins:['expenses',323,336,42,42],records:['expenses',44,339,33,36]
    };
    const artworkObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
        for(const entry of entries)if(entry.isIntersecting){const image=entry.target.querySelector('image');if(image?.dataset.artworkSource){image.setAttribute('href',image.dataset.artworkSource);delete image.dataset.artworkSource;}artworkObserver.unobserve(entry.target);}
    },{rootMargin:'100px'}):null;
    function loadArtwork(node,image,source){if(artworkObserver){image.dataset.artworkSource=source;artworkObserver.observe(node);}else image.setAttribute('href',source);}
    function icon(name){
        const [source,x,y,width,height]=sprites[name]||sprites.document;
        const node=document.createElement('span');node.className='ref-art ref-art-'+name;node.setAttribute('aria-hidden','true');
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',[x,y,width,height].join(' '));
        const artwork=document.createElementNS('http://www.w3.org/2000/svg','image');loadArtwork(node,artwork,'/images/'+source+'.png');artwork.setAttribute('width','1024');artwork.setAttribute('height','1536');
        svg.appendChild(artwork);node.appendChild(svg);return node;
    }
    window.RecordReferenceArt={icon,loadArtwork};
    const definitions={
        sales:['Sales Record','Record of product sales and dispatches','cart'],
        purchases:['Purchases Record','Record of raw materials and other items purchased','purchaseCart'],
        production:['Production Record','Daily processing and output summary','factory'],
        expenses:['Expenses Record','Record of operational and other expenses','wallet']
    };
    const titles={'P Kernel':'Palm Kernel','PKO':'Palm Kernel Oil (PKO)','PKC':'Palm Kernel Cake (PKC)'};
    const text=(tag,className,value)=>{const node=document.createElement(tag);node.className=className;node.textContent=value??'';return node;};
    const number=value=>Number(value||0).toLocaleString('en-NG',{maximumFractionDigits:2});
    const date=value=>new Date(String(value).slice(0,10)+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
    const time=value=>new Date(value).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    for(const [kind,[title,subtitle,art]] of Object.entries(definitions)){
        const page=document.querySelector('#'+kind+'-card-view');if(!page)continue;
        page.classList.add('reference-record-page','reference-'+kind+'-page');
        const heading=page.querySelector(':scope>h2');
        if(heading){
            const header=document.createElement('header');header.className='ref-page-heading';
            const copy=document.createElement('div');heading.textContent=title;heading.replaceWith(header);
            copy.append(heading,text('p','',subtitle));header.append(icon(art),copy);
        }
        const filters=page.querySelector('.data-filters');
        const select=filters?.querySelector('.data-item-filter');
        if(select){const label=text('label','ref-filter',kind==='expenses'?'Category':'Item');select.replaceWith(label);label.appendChild(select);}
        const range=filters?.querySelector('.data-date-filter');
        if(range){const label=text('div','ref-filter','Date Range');range.replaceWith(label);label.appendChild(range);range.prepend(icon('calendar'));}
        const sort=page.querySelector('.data-sort');if(sort)sort.setAttribute('aria-label','Sort '+title.toLowerCase());
        const count=page.querySelector('[id$="-record-count"]');
        if(count){count.classList.add('ref-record-count');}
    }
    window.decorateReferenceQualitySummary=function(summary){if(!summary.querySelector('.ref-art'))summary.prepend(icon('flask'));};
    window.updateReferenceRecordSummary=function(kind,list){
        const page=document.querySelector('#'+kind+'-card-view');if(!definitions[kind]||!page)return;
        const count=page.querySelector('[id$="-record-count"]');
        if(count)count.replaceChildren(icon('records'),document.createTextNode(number(list.length)+' Records'));
        if(!['sales','expenses'].includes(kind))return;
        let total=page.querySelector('.ref-summary-total');
        if(!total){total=document.createElement('span');total.className='ref-summary-total';count.after(total);}
        const value=list.reduce((sum,row)=>sum+Number(kind==='sales'?row.total:row.amount_spent),0);
        total.replaceChildren(icon('summaryCoins'),text('span','',kind==='sales'?'Total Sales:':'Total Expenses:'),text('strong','ref-number','₦'+number(value)));
    };
    window.styleReferenceRecordCard=function(card,row,kind,index){
        if(!definitions[kind])return;
        const root=card.card;root.classList.add('reference-card','reference-'+kind);
        root.style.setProperty('--ref-accent',kind==='sales'?({'PKO':'#e69513','PKC':'#8d36d9','Sludge':'#087627'})[row.name]||'#087627':['#0a9d27','#a535df','#f09b10','#2367ff'][index%4]);
        const header=card.header;header.classList.add('ref-card-heading');header.replaceChildren();
        const copy=document.createElement('div');copy.className='ref-heading-copy';
        const ref=kind==='sales'?'#S-'+String(row.sales_id).padStart(4,'0'):kind==='purchases'?'#p'+row.purchase_id:kind==='production'?'#PR-'+String(row.production_id).padStart(4,'0'):'#EXP-'+String(row.expense_id).padStart(4,'0');
        const badge=text('span','ref-reference',ref);
        if(['sales','purchases'].includes(kind)){
            const product=({'P Kernel':'kernel',PKO:'oil',PKC:'cake',Sludge:'sludge'})[row.name];
            header.appendChild(product?icon(product):AppUI.icon('cubes'));
            copy.appendChild(text('strong','ref-product-name',titles[row.name]||row.name));
            const stamp=text('span','ref-date',date(row[kind==='sales'?'sales_date':'purchase_date'])+', '+time(row.created_at));stamp.title='Recorded '+new Date(row.created_at).toLocaleString('en-GB');stamp.prepend(icon('calendar'));copy.appendChild(stamp);
        }else{
            const dateBlock=text('span','ref-date ref-primary-date',date(row[kind==='expenses'?'expense_date':'production_date']));dateBlock.prepend(icon('calendar'));
            copy.appendChild(dateBlock);
            if(kind==='expenses'){
                dateBlock.appendChild(text('small','','(Expense Date)'));
                const submitted=text('span','ref-submission-date',new Date(row.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+', '+time(row.created_at));submitted.prepend(icon('clock'));submitted.appendChild(text('small','','(Submission Date)'));copy.appendChild(submitted);
            }
        }
        header.append(copy,badge);
        const boxes=[...card.body.children];
        boxes.forEach(box=>box.classList.add('ref-field'));
        function label(box,value,art){box.firstElementChild.replaceChildren(icon(art),document.createTextNode(value));}
        if(kind==='sales'||kind==='purchases'){
            const [party,quantity,cost,total,ticket]=boxes;
            party.classList.add('ref-party');label(party,kind==='sales'?'Buyer':'Supplier',kind==='sales'?'buyer':'supplier');
            quantity.classList.add('ref-quantity');label(quantity,kind==='sales'?'Quantity':'Quantity Supplied','quantity');
            cost.classList.add('ref-cost');label(cost,kind==='sales'?'Unit Price':'Unit Cost','coins');
            total.classList.add('ref-total');label(total,kind==='sales'?'Total Amount':'Total Purchase','money');
            ticket.classList.add('ref-ticket');label(ticket,kind==='sales'?'Sales Ticket':'Scale Ticket',kind==='sales'?'truck':'ticket');
            if(kind==='sales'&&row.dispatch_status==='Completed'){
                const status=text('span','ref-dispatch-status','Dispatched');status.prepend(icon('check'));card.body.appendChild(status);
            }
            const quality=root.querySelector('.kernel-quality summary');if(quality){quality.classList.add('ref-quality-summary');quality.prepend(icon('flask'));}
        }else if(kind==='production'){
            boxes.forEach((box,i)=>label(box,['Kernels Used','PKO Produced','PKC Produced','Sludge Produced'][i],['kernels','pko','pkc','sludgeProduced'][i]));
            const operating=root.querySelector('.production-operating');
            if(operating){operating.classList.add('ref-operating');operating.replaceChildren();
                for(const [label,value,art] of [['Production Hours:',row.production_hours,'clock'],['Downtime:',row.down_time,'tools']]){
                    const metric=document.createElement('span');metric.append(icon(art),text('span','',label),text('strong','ref-number',value||'00:00'));operating.appendChild(metric);
                }
            }
            const history=root.querySelector('.activity-history');
            if(history){history.classList.add('ref-entries');const summary=history.querySelector('summary');summary.replaceChildren(icon('entries'),document.createTextNode('Production Entries ('+(row.batches?.length||0)+')'));}
            if(row.notes){const notes=text('p','ref-production-notes',row.notes);notes.prepend(icon('notes'),text('strong','','Production Notes: '));root.querySelector('.card-actions').before(notes);}
        }else{
            const [description,amount]=boxes;description.classList.add('ref-expense-description');label(description,row.category,'wrench');
            amount.classList.add('ref-expense-amount');label(amount,'Amount Spent','expenseCoins');
        }
        root.querySelectorAll(':scope>.card-actions button').forEach(button=>button.prepend(icon(button.classList.contains('edit-btn')?'edit':button.classList.contains('delete-btn')?'delete':'document')));
    };
    // Size numbers to the available tile width, without wrapping or clipping them.
    const observed=new WeakSet();
    function fit(tile){
        const value=tile.querySelector(':scope>strong');if(!value)return;
        if(!tile.clientWidth)return;
        const style=getComputedStyle(tile),unit=tile.querySelector(':scope>small');
        let available=tile.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-(unit?.textContent?(unit.getBoundingClientRect().width+4):0);
        if(tile.classList.contains('ref-total')&&tile.closest('.reference-purchases'))available*=.68;
        value.style.removeProperty('font-size');
        const maximum=parseFloat(getComputedStyle(value).fontSize);
        const range=document.createRange();range.selectNodeContents(value);const width=range.getBoundingClientRect().width;
        if(width>available)value.style.fontSize=Math.max(1,Math.floor(maximum*available/width*10)/10)+'px';
    }
    document.fonts.ready.then(()=>register());
    const resize=new ResizeObserver(entries=>entries.forEach(entry=>fit(entry.target)));
    function register(){document.querySelectorAll('.reference-card .ref-field.is-number,.reference-card .ref-total').forEach(tile=>{if(!observed.has(tile)){observed.add(tile);resize.observe(tile);}fit(tile);});}
    new MutationObserver(records=>{
        for(const record of records)for(const node of record.removedNodes){if(node.nodeType===1&&!node.isConnected)for(const tile of [node,...node.querySelectorAll('.ref-field')])if(observed.has(tile)){resize.unobserve(tile);observed.delete(tile);}}
        register();
    }).observe(document.querySelector('main'),{childList:true,subtree:true});
})();
