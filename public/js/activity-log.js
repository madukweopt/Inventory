// Activity Log (Data → Activity Log, Director only): every save, edit and delete made in the app and every
// sign-in, newest first, with who really did it and which account was in use. Nothing here can be changed.
(function(){
    const list=document.getElementById('activity-log-list');
    const more=document.getElementById('activity-log-more');
    const person=document.getElementById('activity-log-person');
    const type=document.getElementById('activity-log-type');
    const from=document.getElementById('activity-log-from');
    const to=document.getElementById('activity-log-to');
    if(!list)return;
    let offset=0,loading=0;
    const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};

    // Keeps the chosen filter while refreshing the list of people or record types.
    function fillSelect(select,firstLabel,options){
        const chosen=select.value;
        select.replaceChildren(new Option(firstLabel,''),...options.map(([value,label])=>new Option(label,value)));
        if([...select.options].some(option=>option.value===chosen))select.value=chosen;
    }

    function entry(row){
        const item=el('article',undefined,'activity-log-item');
        const when=new Date(row.occurred_at);
        const head=el('div',undefined,'activity-log-head');
        head.append(el('strong',row.action,'activity-log-action'),
            el('span',when.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+', '+when.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),'activity-log-when'));
        const who=el('p',undefined,'activity-log-who');
        who.append(el('span',row.username||'Unknown person','activity-log-person'));
        // Done by the Director while using another account through Switch Account.
        if(row.acting_user_id&&row.acting_user_id!==row.user_id)who.append(el('span','using '+(row.acting_username||'another')+'’s account','activity-log-switched'));
        const record=el('p',row.record_type+(row.record_id?' #'+row.record_id:''),'activity-log-record');
        item.append(head,who,record);
        return item;
    }

    async function load(reset){
        const request=++loading;
        if(reset){offset=0;list.textContent='Loading the activity log…';more.hidden=true;}
        const query=new URLSearchParams({offset:String(offset)});
        if(person.value)query.set('user',person.value);
        if(type.value)query.set('type',type.value);
        if(from.value)query.set('from',from.value);
        if(to.value)query.set('to',to.value);
        try{
            const response=await fetch('/api/activity-log?'+query);const result=await response.json();
            if(!response.ok)throw Error(result.err||'Could not load the activity log.');
            if(request!==loading)return;
            if(result.people)fillSelect(person,'Everyone',result.people.map(row=>[String(row.user_id),row.username]));
            if(result.types)fillSelect(type,'All types',result.types.map(name=>[name,name]));
            if(reset)list.replaceChildren();
            list.append(...result.rows.map(entry));
            if(!list.children.length)list.append(el('p','Nothing recorded for these filters.','activity-log-empty'));
            offset+=result.rows.length;more.hidden=!result.more;
        }catch(error){if(request===loading){list.textContent=error.message;more.hidden=true;}}
    }

    window.loadActivityLog=()=>load(true);
    for(const filter of [person,type,from,to])filter.addEventListener('change',()=>{
        if(from.value&&to.value&&from.value>to.value)to.value=from.value;
        load(true);
    });
    more.addEventListener('click',()=>load(false));
})();
