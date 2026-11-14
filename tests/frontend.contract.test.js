const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const formsHtml=fs.readFileSync(path.join(root,'public','html','forms.html'),'utf8');
const formsJs=fs.readFileSync(path.join(root,'public','js','forms.js'),'utf8');
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
