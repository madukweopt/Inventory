const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const formsHtml=fs.readFileSync(path.join(root,'public','html','forms.html'),'utf8');
// The forms page script is split by area; the checks below read all of its parts together.
const formsJs=['forms.js','prices.js','company.js','sale-document.js','data-lists.js','customers-suppliers.js','employees.js','pending-weighing.js'].map(file=>fs.readFileSync(path.join(root,'public','js',file),'utf8')).join('\n');
const navigationCss=fs.readFileSync(path.join(root,'public','css','navigation.css'),'utf8');
const navigationJs=fs.readFileSync(path.join(root,'public','js','navigation.js'),'utf8');

test('Sales form keeps its original required business fields',function() {
	for(const id of ['sales-date','customer','product-sold','sales-quantity','unit-price']) {
		assert.match(formsHtml,new RegExp('id="'+id+'"'));
	}
	assert.doesNotMatch(formsHtml,/id="sales-due-date"/);
});

test('invoice, statement, payment and print controls exist',function() {
	for(const id of ['show-sale-invoice','show-sale-statement','record-sale-payment','print-sale-document']) {
		assert.match(formsHtml,new RegExp('id="'+id+'"'));
	}
	assert.match(formsJs,/function showSaleInvoice\(/);
	assert.match(formsJs,/function showSaleReceipt\(/);
	assert.match(formsJs,/function showSaleStatement\(/);
});

test('Sales terminology remains Quantity and does not reintroduce duplicate weight fields',function() {
	assert.match(formsHtml,/Quantity \(kg\)/);
	assert.match(formsHtml,/Quantity Issued \(kg\)/);
	assert.match(formsHtml,/placeholder="To be entered by Storekeeper"/);
	assert.doesNotMatch(formsHtml,/Factory Weight|Accepted Weight|Confirm Buyer Weight/);
	assert.doesNotMatch(formsJs,/buyer_quantity|accepted_quantity|openSaleWeightDialog/);
});

test('normal Sales navigation clears stale edit state',function() {
	assert.match(formsJs,/formId==='#sales-form'&&!isEditMode/);
	assert.match(formsJs,/sessionStorage\.removeItem\('editRecord'\)/);
});

test('Prices page supplies one visible saved price to the Sales form',function() {
	for(const id of ['prices-button','prices','price-form','price-product','price-amount','price-effective-date']) {
		assert.match(formsHtml,new RegExp('id="'+id+'"'));
	}
	assert.match(formsHtml,/type="hidden" id="unit-price"/);
	assert.equal((formsHtml.match(/id="manager-sale-price"/g)||[]).length,1);
	assert.match(formsJs,/function loadSelectedSalesPrice\(/);
	assert.match(formsJs,/function loadPrices\(/);
	assert.match(navigationJs,/\/forms\.html#prices/);
});

test('Manager authorises work while Storekeeper owns every physical quantity',function() {
	assert.match(formsHtml,/id="weighing-tasks"/);
	assert.match(formsHtml,/id="weighing-tasks-button"/);
	for(const id of ['sales-quantity','quantity-supplied','kernel-used','oil-produced','pkc-produced','sludge-produced']) {
		assert.match(formsHtml,new RegExp('id="'+id+'"[\\s\\S]*?readonly'));
	}
	assert.match(formsJs,/function loadWeighingTasks\(/);
	assert.match(formsJs,/function completeWeighingTask\(/);
	assert.match(formsHtml,/id="manager-sale-price"/);
	assert.match(formsJs,/managerSalePrice\.querySelector\('strong'\)\.textContent='₦'/);
	for(const label of ['Authorise Sale','Authorise Purchase','Authorise Production']) {
		assert.match(formsHtml,new RegExp('>'+label+'<'));
	}
	assert.equal((formsHtml.match(/manager-authorisation-card/g)||[]).length,3);
	assert.doesNotMatch(formsJs,/textContent='Submit Sale'/);
	assert.match(formsHtml,/type="text"\s+id="production-hours"/);
	assert.match(formsHtml,/type="text"\s+id="down-time"/);
});

test('mobile navigation uses seventy percent width and closes from its shadow',function() {
	assert.match(navigationCss,/width:min\(70vw,410px\)/);
	assert.match(navigationJs,/!clickedPanel&&!clickedMenuButton/);
});

test('Storekeeper has no empty Forms menu and report cards hide unused Details actions',function() {
	assert.match(navigationJs,/hide\('\.first',role==='storekeeper'\)/);
	assert.match(formsJs,/if\(!config\.openDetails\)[\s\S]*?details-btn/);
	assert.match(formsJs,/hasVisibleAction[\s\S]*?classList\.add\('no-actions'\)/);
	assert.match(formsJs,/No records found\./);
});

test('Pending Weighing navigation displays a live numbered badge',function() {
	assert.match(formsHtml,/class="pending-weighing-badge" hidden>0/);
	assert.match(navigationJs,/function refreshPendingWeighingBadge\(/);
	assert.match(navigationJs,/pendingWeighingBadge\.textContent=String\(count\)/);
});


test('Unfinished production stays internal to costing and adds no operational panel or loss controls',function() {
    assert.doesNotMatch(formsJs,/showProductionInProgress|productionLossControl|Material still in production|production-in-progress/);
    // The production loss is shown read-only on production cards; it has no inputs or buttons.
    const lossStart=formsJs.indexOf('function createProductionLossNote');
    const lossNote=formsJs.slice(lossStart,formsJs.indexOf('\nfunction ',lossStart+1));
    assert.ok(lossNote.includes('Production loss'));
    assert.doesNotMatch(lossNote,/createElement\('(input|button|select|textarea)'\)|addEventListener|onclick/);
});

// Loads every page script in a stand-in browser where any element or method exists, so only real
// programming errors fail, such as a name used after it was removed. One such error stops every page.
test('Page scripts load without reference errors',function() {
    const vm=require('vm');
    const fake=name=>{const f=function(){};return new Proxy(f,{
        get(target,key){
            if(key===Symbol.toPrimitive)return ()=>'';
            if(key==='then')return undefined;
            if(key===Symbol.iterator)return function*(){};
            if(key==='length')return 0;
            if(key==='ready')return Promise.resolve();
            return fake(name+'.'+String(key));
        },
        set(){return true;},apply(){return fake(name+'()');},construct(){return fake('new '+name);}
    });};
    const newBrowser=()=>{
    const browser={console:{log(){},warn(){},error(){}},setTimeout:()=>0,setInterval:()=>0,clearTimeout(){},clearInterval(){},
        URLSearchParams,URL,Intl,Date,Math,JSON,Number,String,Object,Array,Promise,Map,Set,WeakMap,RegExp,Error,Symbol,
        parseFloat,parseInt,isNaN,encodeURIComponent,decodeURIComponent,structuredClone,fetch:()=>new Promise(()=>{}),
        crypto:{randomUUID:()=>'00000000-0000-4000-8000-000000000000'}};
    for(const name of ['document','localStorage','sessionStorage','navigator','history','location','IntersectionObserver','MutationObserver',
        'ResizeObserver','FormData','Option','HTMLElement','CustomEvent','Event','matchMedia','requestAnimationFrame','alert','confirm',
        'getComputedStyle','addEventListener','removeEventListener','AppUI','appNotify'])browser[name]=fake(name);
    browser.window=browser;browser.globalThis=browser;browser.self=browser;
    return vm.createContext(browser);
    };
    const pages={'forms.html':read('public/html/forms.html'),'index.html':read('public/html/index.html')};
    for(const [page,html] of Object.entries(pages)) {
        const browser=newBrowser();
        for(const [,src] of html.matchAll(/<script src="\/js\/([a-z-]+\.js)"/g)) {
            const file='public/js/'+src;
            assert.doesNotThrow(()=>vm.runInContext(read(file),browser,{filename:file}),undefined,page+' could not load '+src);
        }
    }
});

// Installable app: valid details with real icons, linked from every page, and a helper that only covers being offline.
test('the app can be installed: details, icons, page links and an offline-only helper',function() {
    const manifest=JSON.parse(read('public/manifest.webmanifest'));
    assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/index.html');assert.ok(manifest.name&&manifest.short_name);
    for(const icon of manifest.icons) {
        const png=fs.readFileSync(path.join(root,'public',icon.src));
        const [width,height]=[png.readUInt32BE(16),png.readUInt32BE(20)];
        assert.equal(width+'x'+height,icon.sizes,icon.src+' is the size it claims');
    }
    assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='maskable'));
    for(const page of ['login','index','forms','checks','sops']) {
        const html=read('public/html/'+page+'.html');
        assert.match(html,/<link rel="manifest" href="\/manifest\.webmanifest"/,page);
        assert.match(html,/<link rel="apple-touch-icon"/,page);
    }
    assert.match(read('public/js/ui.js'),/serviceWorker\.register\('\/service-worker\.js'\)/);
    const helper=read('public/service-worker.js');
    // It answers only page openings (falling back to the offline page) and the offline page's own files.
    assert.match(helper,/request\.mode==='navigate'/);assert.match(helper,/caches\.match\('\/offline\.html'\)/);
    assert.doesNotMatch(helper,/\/api\//,'the helper never touches data requests');
    assert.doesNotMatch(helper,/cache\.put|caches\.open\([^)]*\)\.then\([^)]*put/,'the helper never stores pages or records');
});
