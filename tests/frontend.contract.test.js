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
	assert.doesNotMatch(formsHtml,/Factory Weight|Accepted Weight|Confirm Buyer Weight/);
	assert.doesNotMatch(formsJs,/buyer_quantity|accepted_quantity|openSaleWeightDialog/);
});

test('normal Sales navigation clears stale edit state',function() {
	assert.match(formsJs,/formId==='#sales-form'&&!isEditMode/);
	assert.match(formsJs,/sessionStorage\.removeItem\('editRecord'\)/);
});

test('Prices page supplies a locked saved price to the Sales form',function() {
	for(const id of ['prices-button','prices','price-form','price-product','price-amount','price-effective-date']) {
		assert.match(formsHtml,new RegExp('id="'+id+'"'));
	}
	assert.match(formsHtml,/id="unit-price"[\s\S]*?readonly[\s\S]*?required/);
	assert.match(formsJs,/function loadSelectedSalesPrice\(/);
	assert.match(formsJs,/function loadPrices\(/);
	assert.match(navigationJs,/\/forms\.html#prices/);
});

test('mobile navigation uses seventy percent width and closes from its shadow',function() {
	assert.match(navigationCss,/width:min\(70vw,410px\)/);
	assert.match(navigationJs,/!clickedPanel&&!clickedMenuButton/);
});
