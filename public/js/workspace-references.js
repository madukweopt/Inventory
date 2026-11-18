// Reference artwork is displayed directly; names, photos and all figures remain live app data.
(function(){
    const ns='http://www.w3.org/2000/svg';
    const sources={customers:[852,1846],employees:[1024,1536],employee_profile:[1024,1536],prices:[1024,1536],pending_weighing:[887,1774],purchase_supply_history:[1024,1536]};
    const artwork={
        historyNote:['purchase_supply_history',486,642,39,42],historyClock:['purchase_supply_history',73,785,54,54],historyEdit:['purchase_supply_history',121,647,34,34],historyCalendar:['purchase_supply_history',92,939,28,30],search:['customers',59,390,33,34],customers:['customers',40,179,93,85],shop:['customers',65,556,95,88],phone:['customers',186,594,22,24],pin:['customers',187,624,22,25],calendar:['customers',604,580,34,36],
        payroll:['employees',647,343,41,41],employees:['employees',46,201,105,102],job:['employees',338,671,28,25],email:['employees',338,746,27,23],call:['employees',338,709,27,27],joined:['employees',358,800,39,39],role:['employees',628,796,38,42],
        profile:['employee_profile',47,148,86,82],person:['employee_profile',88,714,39,41],settings:['employee_profile',87,935,41,44],salary:['employee_profile',88,1200,41,39],edit:['employee_profile',165,1400,40,39],inactive:['employee_profile',636,1398,42,42],
        prices:['prices',51,205,105,103],cake:['prices',88,504,173,208],oil:['prices',87,832,175,176],sludge:['prices',86,1161,178,178],history:['prices',108,710,36,32],quantity:['prices',294,620,32,37],
        weighingDate:['pending_weighing',670,438,26,29],operatingClock:['pending_weighing',63,961,39,40],weighing:['pending_weighing',26,168,107,103],refresh:['pending_weighing',708,199,37,37],stack:['pending_weighing',60,319,43,43],purchase:['pending_weighing',59,429,45,45],factory:['pending_weighing',63,894,42,43],bag:['pending_weighing',60,505,62,60],clock:['pending_weighing',85,698,39,40],cancel:['pending_weighing',517,697,38,40],kernels:['pending_weighing',91,1046,44,39],pko:['pending_weighing',500,1046,31,42],pkc:['pending_weighing',89,1150,45,41],sludgeProduced:['pending_weighing',499,1150,37,42],entries:['pending_weighing',89,1271,41,39],finished:['pending_weighing',60,1556,41,45],boxes:['pending_weighing',59,1660,47,45]
    };
    function art(name){
        if(!artwork[name])return window.RecordReferenceArt.icon(name);
        const [source,x,y,w,h]=artwork[name],[width,height]=sources[source];
        const wrap=document.createElement('span');wrap.className='workspace-art';wrap.setAttribute('aria-hidden','true');
        const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',[x,y,w,h].join(' '));
        const image=document.createElementNS(ns,'image');window.RecordReferenceArt.loadArtwork(wrap,image,'/images/'+source+'.png');image.setAttribute('width',width);image.setAttribute('height',height);svg.append(image);wrap.append(svg);return wrap;
    }
    const text=(tag,cls,value)=>{const node=document.createElement(tag);node.className=cls;node.textContent=value??'';return node;};
    function colourItem(badge,item){
        const key=String(item||'').trim().toLowerCase();
        const colours={
            'p kernel':['#dcf6d6','#145322'],pko:['#ffeb96','#745000'],
            pkc:['#eedbff','#65168a'],sludge:['#f3dfc6','#713e10'],
            diesel:['#dbeafe','#173e8f'],electricity:['#cff6f3','#075a54']
        };
        const hue=[...key].reduce((hash,char)=>(hash*31+char.charCodeAt(0))%360,0);
        const [background,foreground]=colours[key]||['hsl('+hue+' 75% 90%)','hsl('+hue+' 65% 24%)'];
        badge.style.setProperty('--item-badge-bg',background);badge.style.setProperty('--item-badge-ink',foreground);
        badge.dataset.item=key;
    }
    const initials=value=>String(value||'').trim().split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase();
    function addIcon(node,name){if(node&&!node.querySelector(':scope>.workspace-art'))node.prepend(art(name));}
    const pages={suppliers:['Suppliers','Manage suppliers and view their supply summary.','customers'],customers:['Customers','Manage customers and view their purchase summary.','customers'],employees:['Employees','Manage employees and view their summary.','employees'],'employee-details':['Employee Profile','View the employee’s information, system access and salary history.','profile'],prices:['Product Prices','View the current prices and price history for all products.','prices'],'weighing-tasks':['Pending Weighing','Complete the weighing for items already authorised.','weighing']};
    for(const [id,[title,description,name]] of Object.entries(pages)){
        const page=document.getElementById(id);if(!page)continue;page.classList.add('reference-workspace');
        const heading=page.querySelector('h1'),subtitle=heading?.parentElement.querySelector('p');
        if(heading){heading.textContent=title;heading.classList.add('workspace-title');addIcon(heading,name);}
        if(subtitle)subtitle.textContent=description;
    }
    const customerSearch=document.getElementById('customer-search');if(customerSearch)customerSearch.placeholder='Search by name, phone or code';
    const supplierSearch=document.getElementById('supplier-search');if(supplierSearch)supplierSearch.placeholder='Search by name, phone or code';
    const employeeSearch=document.getElementById('employee-search');if(employeeSearch)employeeSearch.placeholder='Search by name, role or phone number…';
    for(const input of [customerSearch,supplierSearch,employeeSearch])if(input){input.parentElement.classList.add('workspace-search');input.parentElement.prepend(art('search'));}
    addIcon(document.getElementById('manage-payroll'),'payroll');addIcon(document.getElementById('refresh-weighing-tasks'),'refresh');
    if(employeeSearch){
        const tools=document.createElement('div');tools.className='workspace-directory-tools';
        const sort=document.createElement('select');sort.id='employee-sort';sort.setAttribute('aria-label','Sort employees');sort.add(new Option('Sort by: Name','name'));sort.add(new Option('Newest joined','joined'));
        const count=text('span','workspace-count','');count.id='employee-visible-count';tools.append(sort,count);employeeSearch.parentElement.after(tools);
    }
    const priceHeading=document.querySelector('#prices .prices-heading');
    if(priceHeading){
        const label=text('label','workspace-price-filter','Price Type: '),select=document.createElement('select');select.setAttribute('aria-label','Price type');
        select.add(new Option('Current','current'));select.add(new Option('History','history'));label.append(select);priceHeading.after(label);
        select.onchange=()=>document.querySelectorAll('#prices .price-card').forEach(card=>{const history=card.querySelector('.price-history'),button=card.querySelector('.price-history-button');history.hidden=select.value!=='history';button.classList.toggle('is-open',!history.hidden);button.replaceChildren(art('history'),document.createTextNode(history.hidden?'View Price History':'Hide Price History'));});
    }
    window.styleReferencePartner=function(card,partner,config,index){
        if(!['customer','supplier'].includes(config.kind)&&config.cardClass!=='employee-card')return;
        const employee=config.cardClass==='employee-card',root=card.card;root.classList.add('workspace-partner',employee?'workspace-employee':'workspace-customer');if(config.kind==='supplier')root.classList.add('workspace-supplier');
        root.style.setProperty('--card-accent',employee?(partner.status==='Inactive'?'#f10d19':'#08ad22'):['#08951c','#9824ff','#f38a00','#1265ff'][index%4]);
        const [top]=root.children,[badge,contact,last]=top.children;
        top.classList.add('workspace-partner-top');badge.classList.add('workspace-avatar');contact.classList.add('workspace-contact');last.classList.add('workspace-last');
        if(!employee){badge.replaceChildren(art('shop'));addIcon(contact.children[1],'phone');addIcon(contact.children[2],'pin');addIcon(last,'calendar');}
        else{
            if(!badge.querySelector('img'))badge.replaceChildren(text('span','workspace-initials',initials(partner.name)));
            const [name,email,phone]=contact.children;const role=text('span','workspace-job',partner.role);role.prepend(art('job'));name.after(role);addIcon(email,'email');addIcon(phone,'call');
            last.classList.add('workspace-status');last.dataset.status=partner.status;last.replaceChildren(text('strong','',partner.status));
            const fields=[...card.body.children];fields.forEach(field=>{const key=field.firstElementChild.textContent;addIcon(field.firstElementChild,key==='Role'?'role':'joined');});if(fields.length===2)card.body.append(fields[1],fields[0]);
        }
        card.body.classList.add('workspace-partner-metrics');
        if(!employee){const main=card.body.children[2]?.querySelector('strong');if(main){main.classList.add('workspace-item-badge');colourItem(main,partner.main_item);}}
        card.footer.classList.add('workspace-details-link');
        if(employee){card.footer.firstChild.textContent='Open employee profile';}
    };
    window.styleReferencePartnerHistory=function(details,card,config,history){
        details.classList.add('workspace-partner-history');
        const [note,body]=details.children;note.classList.add('workspace-history-note');body.classList.add('workspace-history-body');
        const [edit,heading,content]=note.children;
        heading.textContent=config.kind==='supplier'?'Supplier Note':'Customer Note';addIcon(heading,'historyNote');addIcon(edit,'historyEdit');
        if(!content.textContent.trim())content.textContent='No note recorded.';
        const [title,list]=body.children;title.classList.add('workspace-history-title');
        title.textContent=config.kind==='supplier'?'Supply History':'Purchase History';title.prepend(art('historyClock'));
        title.append(text('span','workspace-history-count',history.length+' '+(config.kind==='supplier'?'Supplies':'Purchases')));
        const table=document.createElement('div');table.className='workspace-history-table';table.setAttribute('role','table');list.replaceWith(table);
        const columns=document.createElement('div');columns.className='workspace-history-columns';columns.setAttribute('role','row');
        ['Date','Item','Quantity','Unit Price','Amount'].forEach(label=>{const cell=text('span','',label);cell.setAttribute('role','columnheader');columns.append(cell);});table.append(columns,list);
        list.classList.add('workspace-history-rows');list.setAttribute('role','rowgroup');
        let shown=6;const rows=[...list.children];
        rows.forEach(row=>{row.classList.add('workspace-history-row');row.setAttribute('role','row');[...row.children].forEach(cell=>cell.setAttribute('role','cell'));addIcon(row.children[0],'historyCalendar');row.children[1].classList.add('workspace-history-item');colourItem(row.children[1],row.children[1].textContent);});
        const more=document.createElement('button');more.type='button';more.className='workspace-history-more';more.textContent='Load more';
        function draw(){rows.forEach((row,index)=>row.hidden=index>=shown);more.hidden=shown>=rows.length;}
        more.onclick=()=>{shown+=6;draw();};body.append(more);draw();
        if(!rows.length)table.append(text('p','workspace-history-empty','No transactions recorded.'));
    };
    window.styleReferenceEmployeeProfile=function(page,employee){
        const summary=page.querySelector('.employee-profile-summary');summary.classList.add('workspace-profile-hero');
        if(!employee.photo_path)summary.querySelector('.employee-profile-photo').replaceChildren(text('span','workspace-initials',initials(employee.name)));
        const identity=summary.children[1],[name,role,contact,status]=identity.children;
        role.classList.add('workspace-profile-role');addIcon(role,'job');
        contact.classList.add('workspace-profile-contact');contact.replaceChildren();
        for(const [value,icon] of [[employee.email||'No email','email'],[employee.phone_number,'call']]){const line=text('span','',value);line.prepend(art(icon));contact.append(line);}
        status.classList.add('workspace-status');status.dataset.status=employee.status;
    };
    window.styleReferenceEmployeeDetails=function(details){
        const headings=details.querySelectorAll('h5');['person','settings','salary'].forEach((icon,i)=>addIcon(headings[i],icon));
        const rowIcons=['pin','edit','salary','person','job','settings','check'];
        details.querySelectorAll('.employee-details-list>div').forEach((row,i)=>addIcon(row.firstElementChild,rowIcons[i]));
        const actions=details.querySelector('.employee-details-actions');addIcon(actions?.firstElementChild,'edit');addIcon(actions?.lastElementChild,'inactive');
    };
    window.styleReferencePrice=function(card,product){
        card.classList.add('workspace-price-card');const title=card.querySelector('h2'),copy=text('div','workspace-price-copy','');title.replaceWith(copy);copy.append(title);
        const descriptions={PKO:'Palm Kernel Oil',PKC:'Palm Kernel Cake',Sludge:'Pressed Oil Residue'};
        copy.append(text('p','',descriptions[product.name]||product.name));const unit=text('small','','By weight (kg)');unit.prepend(art('quantity'));copy.append(unit);
        const key={PKO:'oil',PKC:'cake',Sludge:'sludge'}[product.name];if(key)card.querySelector('.price-card-heading').prepend(art(key));
        const button=card.querySelector('.price-history-button');if(document.querySelector('.workspace-price-filter select')?.value==='history'){card.querySelector('.price-history').hidden=false;button.classList.add('is-open');button.textContent='Hide Price History';}addIcon(button,'history');button.addEventListener('click',()=>queueMicrotask(()=>addIcon(button,'history')));
    };
    window.styleReferenceWeighingCard=function(card,request){
        card.classList.add('workspace-weighing-card');
        addIcon(card.querySelector('.task-banner h2'),request.request_type==='Production'?'factory':'purchase');
        addIcon(card.querySelector('.task-date'),'weighingDate');addIcon(card.querySelector('.task-meta'),request.request_type==='Production'?'operatingClock':'bag');
        addIcon(card.querySelector('.weighing-task-waiting'),'clock');addIcon(card.querySelector('.cancel-weighing-request'),'cancel');
        card.querySelectorAll('.weighing-task-totals>span').forEach((metric,i)=>addIcon(metric,['kernels','pko','pkc','sludgeProduced'][i]));
        addIcon(card.querySelector('.activity-history>summary'),'entries');addIcon(card.querySelector('.weighing-task-entry>summary'),'check');
    };
    window.styleReferenceWeighingList=function(list){
        addIcon(list.querySelector('.weighing-task-group>h2'),'stack');addIcon(list.querySelector('.finished-production-history>summary'),'finished');addIcon(list.querySelector(':scope>.weighing-task-entry>summary'),'boxes');
    };

    const amountSelector='.workspace-customer .workspace-partner-metrics>div:not(:nth-child(3)),.workspace-price-card .price-current,.workspace-weighing-card .weighing-task-totals>span';
    const sized=new WeakSet();
    function fitAmount(node){
        const value=node.querySelector(':scope>strong');if(!value)return;
        value.style.removeProperty('font-size');if(innerWidth>600||!node.clientWidth)return;
        const style=getComputedStyle(node),available=node.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
        const maximum=parseFloat(getComputedStyle(value).fontSize),range=document.createRange();range.selectNodeContents(value);
        const width=range.getBoundingClientRect().width;if(width>available)value.style.fontSize=Math.max(8,Math.floor(maximum*available/width))+'px';
    }
    const amounts=new ResizeObserver(entries=>entries.forEach(entry=>fitAmount(entry.target)));
    function registerAmounts(){document.querySelectorAll(amountSelector).forEach(node=>{if(!sized.has(node)){sized.add(node);amounts.observe(node);}fitAmount(node);});}
    document.fonts.ready.then(registerAmounts);
    new MutationObserver(records=>{
        for(const record of records)for(const node of record.removedNodes){if(node.nodeType===1&&!node.isConnected)for(const tile of [node,...node.querySelectorAll(amountSelector)])if(sized.has(tile)){amounts.unobserve(tile);sized.delete(tile);}}
        registerAmounts();
    }).observe(document.querySelector('main'),{childList:true,subtree:true});
})();
