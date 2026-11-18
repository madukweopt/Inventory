// Build the staff manual from docs/SOPs.md. No runtime Markdown dependency is needed.
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const escape=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const inline=text=>escape(text).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
const lines=fs.readFileSync(path.join(root,'docs/SOPs.md'),'utf8').split(/\r?\n/);
const headings=[];let section='guide';
let article='';
for(let i=0;i<lines.length;){
    const line=lines[i].trim();if(!line){i++;continue;}
    const heading=line.match(/^(#{1,5}) (.+)$/);
    if(heading){
        const level=heading[1].length,text=heading[2];
        if(level===2){const match=text.match(/^SOP (\d+)/);section=match?'sop-'+match[1]:'workflow';}
        const id=level===2?section:level===1?'manual-title':section+'-'+text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
        const unique=headings.some(h=>h.id===id)?id+'-'+headings.length:id;
        headings.push({level,text,id:unique,section});
        article+=`<h${level} id="${unique}">${inline(text)}</h${level}>\n`;i++;continue;
    }
    if(line.includes('|')){
        const rows=[];
        while(i<lines.length){
            if(!lines[i].trim()){if(lines[i+1]?.includes('|')){i++;continue;}break;}
            if(!lines[i].includes('|'))break;
            rows.push(lines[i++].split('|').map(cell=>cell.trim()));
        }
        article+='<div class="sop-table-wrap"><table><thead><tr>'+rows[0].map(cell=>'<th scope="col">'+inline(cell)+'</th>').join('')+'</tr></thead><tbody>';
        article+=rows.slice(1).map(row=>'<tr>'+row.map(cell=>'<td>'+inline(cell)+'</td>').join('')+'</tr>').join('');
        article+='</tbody></table></div>\n';continue;
    }
    const ordered=line.match(/^(\d+)\. (.+)$/),bullet=line.match(/^- (.+)$/);
    if(ordered||bullet){
        const type=ordered?'ol':'ul',pattern=ordered?/^\d+\. (.+)$/:/^- (.+)$/;
        article+=`<${type}${ordered?' start="'+ordered[1]+'"':''}>`;
        while(i<lines.length){
            const match=lines[i].trim().match(pattern);
            if(match){article+='<li>'+inline(match[1])+'</li>';i++;}
            else if(!lines[i].trim()&&lines[i+1]?.trim().match(pattern))i++;
            else break;
        }
        article+=`</${type}>\n`;continue;
    }
    const paragraph=[];
    while(i<lines.length&&lines[i].trim()&&!/^(?:#{1,5} |\d+\. |- )/.test(lines[i].trim())&&!lines[i].includes('|'))paragraph.push(lines[i++].trim());
    article+='<p>'+inline(paragraph.join(' '))+'</p>\n';
}
const groups=headings.filter(h=>h.level===2);
const toc=groups.map(group=>'<div class="sop-toc-group"><a class="sop-toc-main" href="#'+group.id+'">'+escape(group.text)+'</a><details><summary>Sections</summary><ul>'+headings.filter(h=>h.section===group.section&&h.level===3).map(h=>'<li><a href="#'+h.id+'">'+escape(h.text)+'</a></li>').join('')+'</ul></details></div>').join('\n');
let nav=fs.readFileSync(path.join(root,'public/html/index.html'),'utf8').match(/<nav class="main-menu">[\s\S]*?<\/nav>/)[0];
nav=nav.replace('submenu-button active','submenu-button').replace('class="submenu-button" id="sops-button"','class="submenu-button active" id="sops-button" aria-current="page"');
const html=`<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SOPs · SOMAD staff manual</title>
<link rel="stylesheet" href="/css/navigation.css"><link rel="stylesheet" href="/css/app.css"><link rel="stylesheet" href="/css/theme.css"><link rel="stylesheet" href="/css/sops.css"></head>
<body class="sops-body"><a class="sop-skip-link" href="#manual-title">Skip to manual</a><main class="page sops-page">
<header class="sop-page-heading"><div><p class="sop-eyebrow">SOMAD STAFF MANUAL</p><h1>SOPs: daily work instructions</h1><p>Who does each job, how to use the app, and how to work safely.</p></div><div class="sop-actions"><a href="/sops.pdf"><span class="ui-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg></span><span>Download PDF</span></a><button id="print-sops" type="button"><span class="ui-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8V3h12v5M6 17H3V9h18v8h-3M6 14h12v7H6z"/><path d="M17 11h.01"/></svg></span><span>Print manual</span></button><button id="edit-sops" type="button" hidden><span class="ui-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z"/></svg></span><span>Edit SOP</span></button></div></header>
<section id="sop-editor" class="sop-editor" hidden aria-labelledby="sop-editor-title">
<div class="sop-editor-heading"><div><h2 id="sop-editor-title">Edit SOP</h2><p>Choose a section, then click its text to edit. Save changes when finished.</p></div><div class="sop-editor-actions"><button id="cancel-sop-edit" type="button">Cancel</button><button id="save-sop-edit" type="button">Save changes</button></div></div>
<label class="sop-section-label" for="sop-edit-section">Section</label><select id="sop-edit-section"></select><div id="sop-edit-title-field"><label class="sop-section-label" for="sop-edit-title">Section title</label><input id="sop-edit-title" type="text" maxlength="180"></div>
<div class="sop-editor-toolbar" role="toolbar" aria-label="Text formatting"><button type="button" data-command="bold" aria-label="Bold text"><strong>B</strong></button><button type="button" data-command="insertUnorderedList">Bullet list</button><button type="button" data-command="insertOrderedList">Numbered list</button><button type="button" data-block="p">Paragraph</button><button type="button" data-block="h3">Heading</button><button type="button" data-block="h4">Small heading</button><button type="button" data-command="undo">Undo</button><button type="button" id="preview-sop-edit">Preview</button></div>
<p id="sop-edit-message" role="status"></p><h2 id="sop-edit-chapter"></h2><div id="sop-edit-content" class="sop-document" contenteditable="true" role="textbox" aria-label="Section text" aria-multiline="true" spellcheck="true"></div>
</section>
<div class="sop-layout"><aside class="sop-contents" aria-label="Table of contents"><details open id="sop-toc"><summary>Table of contents <span>App guide + 6 SOPs</span></summary><nav aria-label="Manual sections">${toc}</nav></details></aside>
<article class="sop-document" aria-labelledby="manual-title">${article}<p class="sop-end"><a href="#sop-toc">Back to contents</a> · Revised 16 November 2026</p></article></div></main>
${nav}
<script src="/js/ui.js"></script><script src="/js/navigation.js"></script><script src="/js/sops.js"></script></body></html>\n`;
fs.writeFileSync(path.join(root,'public/html/sops.html'),html);
console.log('Built SOP manual with '+groups.length+' contents groups and '+headings.length+' linked headings.');
