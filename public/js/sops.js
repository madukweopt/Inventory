document.querySelector('#print-sops').addEventListener('click',()=>window.print());
// Keep contents easy to reach in a long manual, without hiding the document itself.
const contents=document.querySelector('#sop-toc');
if(matchMedia('(max-width: 760px)').matches)contents.open=false;
const headingLinks=new Map(Array.from(document.querySelectorAll('.sop-toc-main')).map(link=>[link.hash.slice(1),link]));
const observer=new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){
        headingLinks.forEach(link=>link.removeAttribute('aria-current'));
        headingLinks.get(entry.target.id)?.setAttribute('aria-current','location');
    }
},{rootMargin:'-100px 0px -65% 0px'});
document.querySelectorAll('.sop-document>h2').forEach(heading=>observer.observe(heading));
let contentsBeforePrint;
window.addEventListener('beforeprint',()=>{contentsBeforePrint=contents.open;contents.open=true;});
window.addEventListener('afterprint',()=>{if(contentsBeforePrint!==undefined)contents.open=contentsBeforePrint;});

// Locate a paragraph within its chapter so reading and editing can share a position.
const sopBlockSelector='h1,h2,h3,h4,h5,p,li,td,th,div';
function sopBlocks(root){
    return Array.from(root.querySelectorAll(sopBlockSelector)).filter(node=>
        !node.closest('.sop-end')&&(node.tagName!=='DIV'||!node.querySelector(sopBlockSelector+',table,ul,ol')));
}
function sopText(node){return node.textContent.replace(/\s+/g,' ').trim();}
function sopChapterBlocks(root,id){
    const nodes=[];let inside=!id;
    for(const child of root.children){
        if(child.tagName==='H2'){
            if(inside)break;
            inside=child.id===id;
        }
        if(inside){if(child.matches(sopBlockSelector))nodes.push(child);nodes.push(...sopBlocks(child));}
    }
    return nodes.filter(node=>!node.closest('.sop-end'));
}
function captureSopPosition(root,chapterId){
    const blocks=sopBlocks(root),line=(document.querySelector('.portal-masthead')?.getBoundingClientRect().bottom||88)+16;
    const selection=getSelection();
    const selected=selection?.anchorNode&&(selection.anchorNode.nodeType===1?selection.anchorNode:selection.anchorNode.parentElement)?.closest(sopBlockSelector);
    const target=selected&&root.contains(selected)&&selected!==root?selected:
        blocks.find(node=>node.getBoundingClientRect().bottom>line)||blocks.at(-1);
    if(!target)return {chapterId:chapterId||null,scrollY:window.scrollY};
    if(chapterId===undefined){
        chapterId=null;
        for(const child of root.children){if(child.tagName==='H2')chapterId=child.id;if(child===target||child.contains(target))break;}
    }
    const candidates=chapterId===undefined?blocks:root.id==='sop-edit-content'?blocks:sopChapterBlocks(root,chapterId);
    const same=candidates.filter(node=>node.tagName===target.tagName&&sopText(node)===sopText(target));
    return {chapterId:chapterId||null,id:target.id||null,tag:target.tagName,text:sopText(target),occurrence:Math.max(0,same.indexOf(target)),top:target.getBoundingClientRect().top,scrollY:window.scrollY};
}
function restoreSopPosition(root,position,focus=false){
    const nodes=root.id==='sop-edit-content'?sopBlocks(root):sopChapterBlocks(root,position.chapterId);
    const matches=nodes.filter(node=>node.tagName===position.tag&&sopText(node)===position.text);
    const target=matches[position.occurrence||0]||nodes.find(node=>position.id&&node.id===position.id)||
        (root.id==='sop-edit-content'?root:document.getElementById(position.chapterId||'manual-title'));
    if(!target)return;
    const line=(document.querySelector('.portal-masthead')?.getBoundingClientRect().bottom||88)+16;
    const top=Number.isFinite(position.top)?Math.max(line,Math.min(position.top,innerHeight-180)):line;
    window.scrollTo({top:Math.max(0,window.scrollY+target.getBoundingClientRect().top-top),behavior:'instant'});
    if(focus){
        root.focus({preventScroll:true});const range=document.createRange();range.selectNodeContents(target);range.collapse(true);
        const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    }
}
try{
    const saved=JSON.parse(sessionStorage.getItem('sop-reading-position')||'null');
    if(saved){
        // Restore after the browser's own fragment/history scrolling has finished.
        const restore=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
            restoreSopPosition(document.querySelector('.sop-layout .sop-document'),saved);
            sessionStorage.removeItem('sop-reading-position');
        }));
        if(document.readyState==='complete')restore();else window.addEventListener('load',restore,{once:true});
    }
}catch(error){}

// The server checks account permissions again on every edit request.
(function(){
    const open=document.querySelector('#edit-sops'),panel=document.querySelector('#sop-editor');
    const select=document.querySelector('#sop-edit-section'),editor=document.querySelector('#sop-edit-content');
    const title=document.querySelector('#sop-edit-title'),titleField=document.querySelector('#sop-edit-title-field');
    const message=document.querySelector('#sop-edit-message'),save=document.querySelector('#save-sop-edit');
    const preview=document.querySelector('#preview-sop-edit'),chapter=document.querySelector('#sop-edit-chapter');
    let sections=[],active=0,version=null,dirty=false,editing=false,previewing=false,busy=false,readingPosition=null;
    Promise.resolve(window.currentUserPromise).then(user=>{open.hidden=user?.role!=='admin';}).catch(()=>{});
    function changed(){dirty=true;save.disabled=false;message.classList.remove('error');message.textContent='You have changes to save.';}
    function stash(){if(sections[active])sections[active].html=editor.innerHTML;}
    function showSection(){
        const section=sections[active];editor.innerHTML=section.html;
        titleField.hidden=!section.heading;title.value=section.title;
        chapter.textContent=section.heading?section.prefix+section.title:'Introduction';
        previewing=false;editor.contentEditable='true';preview.textContent='Preview';
    }
    function serialize(node){const holder=document.createElement('div');holder.appendChild(node.cloneNode(true));return holder.innerHTML;}
    open.onclick=async()=>{
        readingPosition=captureSopPosition(document.querySelector('.sop-layout .sop-document'));
        open.disabled=true;message.classList.remove('error');message.textContent='';
        try{
            const response=await fetch('/api/sops/editor',{cache:'no-store'});const data=await response.json();
            if(!response.ok)throw new Error(data.err||'You cannot edit this manual.');
            version=data.version;const holder=document.createElement('div');holder.innerHTML=data.html;
            sections=[{heading:false,id:null,prefix:'',title:'Introduction',html:''}];
            for(const node of holder.childNodes){
                if(node.nodeType===1&&node.tagName==='H2'){
                    const text=node.textContent.trim(),prefix=text.match(/^SOP\s+\d+\s*[·-]?\s*/i)?.[0]||'';
                    sections.push({heading:true,id:node.id,prefix,title:text.slice(prefix.length),html:''});
                }else sections.at(-1).html+=serialize(node);
            }
            select.replaceChildren(...sections.map((section,index)=>{const option=document.createElement('option');option.value=index;option.textContent=section.prefix+section.title;return option;}));
            active=Math.max(0,sections.findIndex(section=>section.id===readingPosition.chapterId));select.value=String(active);
            dirty=false;save.disabled=true;editing=true;showSection();panel.hidden=false;
            document.querySelector('.sops-page').classList.add('is-editing');
            requestAnimationFrame(()=>{
                if(readingPosition.tag==='H2'){title.focus({preventScroll:true});title.scrollIntoView({block:'center',behavior:'instant'});}
                else restoreSopPosition(editor,readingPosition,true);
            });
        }catch(error){appNotify(error.message,{type:'error'});}finally{open.disabled=false;}
    };
    select.onchange=()=>{stash();active=Number(select.value);showSection();};
    title.oninput=()=>{
        const section=sections[active];section.title=title.value;
        chapter.textContent=section.prefix+section.title;select.options[active].textContent=chapter.textContent;changed();
    };
    editor.addEventListener('input',changed);
    editor.addEventListener('paste',event=>{event.preventDefault();document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));changed();});
    document.querySelectorAll('.sop-editor-toolbar [data-command],.sop-editor-toolbar [data-block]').forEach(button=>{
        button.onmousedown=event=>event.preventDefault();
        button.onclick=()=>{
            if(previewing||busy)return;
            editor.focus();if(button.dataset.block)document.execCommand('formatBlock',false,button.dataset.block);
            else document.execCommand(button.dataset.command,false,null);
            changed();
        };
    });
    preview.onclick=()=>{previewing=!previewing;editor.contentEditable=String(!previewing);preview.textContent=previewing?'Continue editing':'Preview';};
    document.querySelector('#cancel-sop-edit').onclick=()=>{
        if(busy)return;
        if(dirty&&!window.confirm('Discard your unsaved SOP changes?'))return;
        dirty=false;editing=false;panel.hidden=true;document.querySelector('.sops-page').classList.remove('is-editing');
        getSelection()?.removeAllRanges();
        window.scrollTo({top:readingPosition?.scrollY||0,behavior:'instant'});open.focus({preventScroll:true});
    };
    save.onclick=async()=>{
        if(busy||!dirty)return;const returnPosition=captureSopPosition(editor,sections[active].id);stash();busy=true;
        panel.querySelectorAll('button,input,select').forEach(control=>control.disabled=true);editor.contentEditable='false';
        message.classList.remove('error');message.textContent='Saving changes…';
        try{
            const html=sections.map(section=>{
                if(!section.heading)return section.html;
                const heading=document.createElement('h2');heading.textContent=section.prefix+section.title;return heading.outerHTML+section.html;
            }).join('');
            const response=await fetch('/api/sops',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({html,version})});
            const result=await response.json();if(!response.ok)throw new Error(result.err||'Could not save the manual.');
            dirty=false;editing=false;
            try{sessionStorage.setItem('sop-reading-position',JSON.stringify(returnPosition));}catch(error){}
            appNotify(result.message);window.location.reload();
        }catch(error){message.classList.add('error');message.textContent=error.message;}
        finally{busy=false;panel.querySelectorAll('button,input,select').forEach(control=>control.disabled=false);editor.contentEditable=String(!previewing);save.disabled=!dirty;}
    };
    window.addEventListener('beforeunload',event=>{if(editing&&dirty){event.preventDefault();event.returnValue='';}});
})();
