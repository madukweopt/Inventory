// Shared presentation: consistent notifications, status banners and the portal header.
(function(){
    const icons={
        check:'<path d="m5 12 4 4L19 6"/>',alert:'<path d="M12 8v5m0 4h.01"/><circle cx="12" cy="12" r="9"/>',
        info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
        bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-11 12a2 2 0 0 0 4 0"/>',
        calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18"/>',
        truck:'<path d="M3 5h11v12H3zM14 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
        production:'<path d="M3 21V9l6 3V8l6 4V3h4v18zM7 16v2m4-2v2m4-2v2"/>',
        tag:'<path d="M20 13 13 20a2 2 0 0 1-3 0l-7-7V3h10l7 7a2 2 0 0 1 0 3Z"/><circle cx="7" cy="7" r="1"/>',
        up:'<path d="M12 20V4m-6 6 6-6 6 6"/>',down:'<path d="M12 4v16m-6-6 6 6 6-6"/>',
        refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>'
    };
    function icon(name){
        const holder=document.createElement('span');holder.className='ui-icon';holder.setAttribute('aria-hidden','true');
        holder.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(icons[name]||icons.info)+'</svg>';
        return holder;
    }
    function decorateNavigation(root=document){
        root.querySelectorAll('.submenu-button, .submenu-one a, .submenu-two a').forEach(button=>{
            if(button.querySelector('.ui-icon'))return;
            const label=button.textContent.trim().toLowerCase();
            const name=/production/.test(label)?'production':/purchase|supplier/.test(label)?'truck':
                /price|sale/.test(label)?'tag':/notification/.test(label)?'bell':
                /weighing|inventory|usage/.test(label)?'down':/data/.test(label)?'calendar':
                /switch/.test(label)?'refresh':/dashboard/.test(label)?'dashboard':
                /customer|employee|user/.test(label)?'people':/setting/.test(label)?'settings':'document';
            button.prepend(icon(name));
        });
    }
    Object.assign(icons,{
        electricity:'<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
        oil:'<path d="M12 2S4 11 4 15a8 8 0 0 0 16 0c0-4-8-13-8-13Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
        sack:'<path d="m7 3 2 4h6l2-4zM9 7c-4 4-6 8-6 12 0 2 18 2 18 0 0-4-2-8-6-12M7 11h10"/><path d="M12 12v6m-3-4 3 3 3-3"/>',
        flask:'<path d="M9 3h6m-5 0v6L3 20h18L14 9V3"/><path d="M7 15h10"/><circle cx="11" cy="18" r="1"/>',
        fuel:'<rect x="3" y="3" width="11" height="18" rx="2"/><path d="M6 6h5v6H6zM14 10h2v7a2 2 0 0 0 4 0V8l-3-3M2 21h13"/>',
        seed:'<ellipse cx="8" cy="14" rx="5" ry="8" transform="rotate(35 8 14)"/><path d="m4 20 8-12M13 5c10-4 13 9 3 12M15 6l3 8"/>',
        cubes:'<path d="m12 2 5 3v6l-5 3-5-3V5zM7 11l5 3v6l-5 3-5-3v-6zM17 11l5 3v6l-5 3-5-3v-6M7 5l5 3 5-3M2 14l5 3 5-3m0 0 5 3 5-3M12 8v6M7 17v6m10-6v6"/>',
        cart:'<path d="M2 3h3l3 12h11l3-9H6M8 15l-1 3h13"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/>',
        chart:'<path d="M3 21h4v-5H3zM10 21h4V11h-4zM17 21h4V6h-4zM3 11l7-5 4 1 7-5m-5 0h5v5"/>',
        dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
        people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-2-4"/>',
        settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
        document:'<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8m-8 4h8"/>'
    });
    decorateNavigation();
    const navigation=document.querySelector('.main-menu');
    if(navigation)new MutationObserver(()=>decorateNavigation(navigation)).observe(navigation,{childList:true,subtree:true});
    function messageType(text){
        if(/could not|cannot|failed|failure|invalid|error|problem|denied|insufficient|shortage|unauthori[sz]ed|not authori[sz]ed|not saved|not found|not allowed|must |required|check your|enter a|exceeds|greater than|less than/i.test(text))return 'error';
        if(/success|saved|authorised|completed|cancelled|created|updated|deleted|reopened|recorded|finished|returned|linked/i.test(text))return 'success';
        return 'info';
    }
    const stack=document.createElement('div');stack.className='notice-stack';stack.setAttribute('aria-live','polite');document.body.appendChild(stack);
    let latest=null;
    function notify(message,options={}){
        const text=String(message??'').trim();if(!text)return;
        const type=options.type||messageType(text);
        const notice=document.createElement('div');notice.className='app-notice notice-'+type;notice.setAttribute('role',type==='error'?'alert':'status');
        const content=document.createElement('div');const heading=document.createElement('strong');heading.textContent=type==='success'?'Success':type==='error'?'Please check':'Information';
        const body=document.createElement('p');body.textContent=text;content.append(heading,body);
        const close=document.createElement('button');close.type='button';close.className='notice-close';close.setAttribute('aria-label','Dismiss message');close.textContent='×';
        const entry={text,type,time:Date.now()};latest=entry;
        function dismiss(){notice.remove();if(latest===entry)latest=null;}
        close.onclick=dismiss;notice.append(icon(type==='success'?'check':type==='error'?'alert':'info'),content,close);
        stack.appendChild(notice);while(stack.children.length>3)stack.firstElementChild.remove();setTimeout(dismiss,type==='error'?10000:6500);
    }
    window.AppUI={icon,messageType};window.appNotify=notify;
    window.addEventListener('beforeunload',()=>{if(latest)try{sessionStorage.setItem('portal-flash',JSON.stringify(latest));}catch(error){}});
    try{const flash=JSON.parse(sessionStorage.getItem('portal-flash')||'null');sessionStorage.removeItem('portal-flash');if(flash&&Date.now()-flash.time<15000)notify(flash.text,{type:flash.type});}catch(error){}
    const statuses='[role="status"], .price-message, #sales-price-message, .user-account-message, .switch-account-message, .finance-dialog-message, .payroll-message';
    function styleStatus(element){
        if(element.closest('.notice-stack'))return;
        const text=element.textContent.trim();element.classList.add('status-message');element.classList.toggle('status-empty',!text);
        element.dataset.messageType=element.classList.contains('error')?'error':messageType(text);
        element.setAttribute('aria-atomic','true');
    }
    document.querySelectorAll(statuses).forEach(styleStatus);
    new MutationObserver(records=>{
        const elements=new Set();
        for(const record of records){
            const target=record.target.nodeType===1?record.target:record.target.parentElement;
            const parent=target?.closest(statuses);if(parent)elements.add(parent);
            for(const node of record.addedNodes)if(node.nodeType===1){if(node.matches(statuses))elements.add(node);node.querySelectorAll(statuses).forEach(e=>elements.add(e));}
        }
        elements.forEach(styleStatus);
    }).observe(document.body,{childList:true,subtree:true,characterData:true});
    if(document.querySelector('.main-menu')){
        const header=document.createElement('header');header.className='portal-masthead';
        const wordmark=document.createElement('a');wordmark.href='/index.html';wordmark.className='portal-wordmark';wordmark.setAttribute('aria-label','Somad dashboard');
        const logo=document.createElement('img');logo.src='/images/logo.png';logo.alt='';
        const name=document.createElement('span');const title=document.createElement('strong');title.textContent='SOMAD';const subtitle=document.createElement('small');subtitle.textContent='Agro-oil processing';name.append(title,subtitle);wordmark.append(logo,name);
        const tools=document.createElement('div');tools.className='masthead-tools';
        const role=document.createElement('span');role.className='masthead-role';
        const tasks=document.createElement('a');tasks.href='/forms.html#weighing-tasks';tasks.className='masthead-tasks';tasks.setAttribute('aria-label','Pending weighing');tasks.appendChild(icon('bell'));
        const count=document.createElement('span');count.className='masthead-count';count.hidden=true;tasks.appendChild(count);tools.append(role,tasks);
        header.append(document.createElement('span'),wordmark,tools);document.body.prepend(header);
        window.addEventListener('userroleloaded',event=>{role.textContent=event.detail.role;});
        const badge=document.querySelector('.pending-weighing-badge');
        if(badge)new MutationObserver(()=>{count.textContent=badge.textContent;count.hidden=badge.hidden;tasks.setAttribute('aria-label','Pending weighing, '+badge.textContent+' waiting');}).observe(badge,{childList:true,attributes:true,subtree:true});
    }
})();
