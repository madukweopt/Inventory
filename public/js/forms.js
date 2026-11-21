// The forms page: its shared page elements and helpers, the five report forms (Inventory, Purchases, Sales,
// Production, Expenses) and switching between the page's sections. Each other area of the page has its own file,
// loaded after this one on forms.html: prices.js, company.js, sale-document.js, data-lists.js,
// customers-suppliers.js, employees.js and pending-weighing.js.

// Resolves once every script on the page has run. The page's loaders wait for this before calling into the other
// files, because on a slow connection the signed-in user can be known before the later scripts have loaded.
function pageScriptsLoaded() {
	if(document.readyState!=='loading') return Promise.resolve();
	return new Promise(resolve => document.addEventListener('DOMContentLoaded',resolve,{ once:true }));
}

const salesForm=document.querySelector("#sales-form");
const purchaseForm=document.querySelector("#purchases-form");
const inventoryForm=document.querySelector("#inventory-form");
const productionForm=document.querySelector("#production-form");
const expensesForm=document.querySelector("#expenses-form");
const salesDate=document.querySelector("#sales-date");
const customer=document.querySelector("#customer");
const productSold=document.querySelector("#product-sold");
const salesQuantity=document.querySelector("#sales-quantity");
const salesOrderedQuantity=document.querySelector("#sales-ordered-quantity");
const purchaseOrderedQuantity=document.querySelector("#purchase-ordered-quantity");
const unitPrice=document.querySelector("#unit-price");
const purchaseDate=document.querySelector("#purchase-date");
const supplier=document.querySelector("#supplier");
const materialSupplied=document.querySelector("#material-supplied");
const quantitySupplied=document.querySelector("#quantity-supplied");
const unitCost=document.querySelector("#unit-cost");
const stockDate=document.querySelector("#stock-date");
const stockName=document.querySelector("#stock-name");
const stockReason=document.querySelector("#stock-reason");
const stockQuantity=document.querySelector("#stock-quantity");
const stockRemove=document.querySelector("#stock-remove");
const stockAdd=document.querySelector("#stock-add");
// A manual stock change is one quantity with a direction, so received and issued are never both filled.
// Spills and disposals always remove stock and a return to store always adds it; the others can go either way.
const stockReasonDirection={ Spill: "remove",Disposal: "remove","Return to store": "add" };
function syncStockDirection() {
	if(!stockRemove||!stockAdd) return;
	const fixed=stockReasonDirection[stockReason.value];
	if(fixed) {
		stockRemove.checked=fixed==="remove";
		stockAdd.checked=fixed==="add";
	}
	stockRemove.disabled=fixed==="add";
	stockAdd.disabled=fixed==="remove";
}
if(stockReason) stockReason.addEventListener("change",syncStockDirection);
if(inventoryForm) inventoryForm.addEventListener("reset",() => setTimeout(syncStockDirection));
function stockChangeValues() {
	const quantity=stockQuantity.value;
	return stockAdd.checked?{ received: quantity,issued: "0" }:{ received: "0",issued: quantity };
}
const productionDate=document.querySelector("#production-date");
const kernelUsed=document.querySelector("#kernel-used");
const oilProduced=document.querySelector("#oil-produced");
const pkcProduced=document.querySelector("#pkc-produced");
const sludgeProduced=document.querySelector('#sludge-produced');
const productionHours=document.querySelector("#production-hours");
const downTime=document.querySelector("#down-time");
const expenseDate=document.querySelector("#expense-date");
const expenseCategory=document.querySelector("#expense-category");
const expenseDescription=document.querySelector("#expense-description");
const expenseAmount=document.querySelector("#expense-amount");
const customerForm=document.querySelector('#customer-form');
const supplierForm=document.querySelector('#supplier-form');
const employeeForm=document.querySelector('#employee-form');
const companyForm=document.querySelector('#company-form');
const editCompanyBtn=document.querySelector('#edit-company');
const cancelCompanyEditBtn=document.querySelector('#cancel-company-edit');
const removeCompanyLogoBtn=document.querySelector('#remove-company-logo');
const companyLogoInput=document.querySelector('#company-logo');
const companyLogoPreview=document.querySelector('#company-logo-preview');
const companyLogoFallback=document.querySelector('#company-logo-fallback');
const removeCompanyLogoValue=document.querySelector('#remove-company-logo-value');
let currentCompanyDetails=null;
const addCustomer=document.querySelector('#add-customer');
const addSupplier=document.querySelector('#add-supplier');
const addEmployee=document.querySelector('#add-employee');
const managePayrollBtn=document.querySelector('#manage-payroll');
const priceForm=document.querySelector('#price-form');
const priceProduct=document.querySelector('#price-product');
const priceAmount=document.querySelector('#price-amount');
const priceEffectiveDate=document.querySelector('#price-effective-date');
const priceMessage=document.querySelector('.price-message');
const priceCards=document.querySelector('.price-cards');
const openPriceFormBtn=document.querySelector('#open-price-form');
const cancelPriceFormBtn=document.querySelector('#cancel-price-form');
const salesPriceMessage=document.querySelector('#sales-price-message');
const managerSalePrice=document.querySelector('#manager-sale-price');

// Prevents inventory quantities from containing more than two decimal places.
function limitInventoryDecimals(input) {
	input.addEventListener('input',function() {
		const parts=input.value.split('.');
		if(parts[1]&&parts[1].length>2) {
			input.value=parts[0]+'.'+parts[1].slice(0,2);
		}
	});
}

limitInventoryDecimals(stockQuantity);

// Hides forms, pages and action buttons that the signed-in role cannot use.
function applyFormPermissions(user) {
	const role=user.role;
	const hideCard=function(selector,shouldHide) {
		const element=document.querySelector(selector);
		const card=element&&element.closest('.card');
		if(card) card.classList.toggle('permission-hidden',shouldHide);
	};

	hideCard('#inventory-form',role!=='admin');
    hideCard('#consumable-usage-form',!['admin','storekeeper'].includes(role));
	hideCard('#inventory-data',role==='manager');
	hideCard('#stock-history',role!=='admin');
	hideCard('#activity-log',role!=='admin');
	hideCard('#purchases-form',role==='storekeeper');
	hideCard('#sales-form',role==='storekeeper');
	hideCard('#production-form',role==='storekeeper');
	hideCard('#expenses-form',role==='storekeeper');
	hideCard('#employees',role==='storekeeper');
	hideCard('#employee-details',role==='storekeeper');
	hideCard('#payroll',role!=='admin');
	hideCard('#employee-addition',role!=='admin');
	hideCard('#supplier-addition',role==='storekeeper');
	hideCard('#other-partners',role==='storekeeper');
	hideCard('#partner-addition',role==='storekeeper');
	hideCard('#capital-assets',role==='storekeeper');
	if(priceForm&&role!=='admin') priceForm.hidden=true;
	if(openPriceFormBtn) openPriceFormBtn.hidden=role!=='admin';

	addEmployee.hidden=role!=='admin';
	managePayrollBtn.hidden=role!=='admin';
	addSupplier.hidden=role==='storekeeper';
	addCustomer.hidden=role==='storekeeper';
	editCompanyBtn.hidden=role!=='admin';
}

window.addEventListener('userroleloaded',function(event) {
	applyFormPermissions(event.detail);
});

// Shows the page section identified by the current URL hash.
async function displaySelectedForm() {
	const user=await window.currentUserPromise;
	if(!user) return;
	await pageScriptsLoaded();
	applyFormPermissions(user);
	const forms=document.querySelectorAll(".card");
	const formId=window.location.hash;
	const isEditMode=new URLSearchParams(window.location.search).get('mode')==='edit';
	if(formId==='#purchases-form'&&!isEditMode) {
        document.getElementById('purchase-ordered-field').hidden=false;purchaseOrderedQuantity.required=true;
	}
	if(formId==='#sales-form'&&!isEditMode) {
        document.getElementById('sales-billing-basis').disabled=false;
        document.getElementById('sales-representative').closest('.field').hidden=false;
        document.getElementById('sales-representative').disabled=false;
        document.querySelector('label[for="sales-quantity"]').textContent='Quantity Issued (kg)';
        document.getElementById('sales-ordered-field').hidden=false;salesOrderedQuantity.required=true;
		salesForm.reset();
		sessionStorage.removeItem('editRecord');
		sessionStorage.removeItem('editKind');
		sessionStorage.removeItem('checksReturnUrl');
		salesForm.querySelector('button[type="submit"]').textContent='Authorise Sale';
	}
	// Processes each entry in the collection.
	forms.forEach(form => {
		form.classList.remove("show");
	});
	if(!formId) {
		return;
	}
	const selectedFormId=document.querySelector(formId);
	if(!selectedFormId) {
		return;
	}
	const selectedCard=selectedFormId.closest(".card");
	if(selectedCard.classList.contains('permission-hidden')) {
		window.location.replace('/index.html');
		return;
	}
	selectedCard.classList.add("show");
	if(formId==="#sales-data") {
		loadSalesData();
	} else if(formId==="#stock-history") {
		if(window.loadStockHistory) window.loadStockHistory();
	} else if(formId==="#activity-log") {
		if(window.loadActivityLog) window.loadActivityLog();
	} else if(formId==="#inventory-data") {
		loadInventoryData();
	} else if(formId==="#purchases-data") {
		loadPurchasesData();
	} else if(formId==="#production-data") {
		loadProductionData();
	} else if(formId==="#expenses-data") {
		loadExpensesData();
	} else if(formId==="#payroll") {
		openPayrollPage();
	} else if(formId==="#delivery-note") {
        if(window.loadDeliveryNote)window.loadDeliveryNote();
	} else if(formId==="#sale-document") {
		loadSaleDocument();
	} else if(formId==="#prices") {
		loadPrices();
	} else if(formId==="#weighing-tasks") {
		loadWeighingTasks();
	} else if(formId==="#other-partners") {
		if(window.loadOtherPartners) window.loadOtherPartners();
	} else if(formId==="#partner-addition") {
		if(window.preparePartnerForm) window.preparePartnerForm();
	} else if(formId==="#capital-assets") {
		if(window.loadCapitalAssets) window.loadCapitalAssets();
	}
}
displaySelectedForm();

window.addEventListener("hashchange",displaySelectedForm);
window.addEventListener("popstate",displaySelectedForm);

// Fetches sales dropdown and displays the results in the relevant interface.
async function loadSalesDropdown(select=productSold) {
	try {
		const response=await fetch("/api/items");
		const items=await response.json();

		if(!select) {
			return;
		}
		// Keeps collection entries that match the current condition.
		const products=items.filter(function(item) {
			return item.item_type==="product";
		});

		// Processes each entry in the collection.
		products.forEach(function(item) {
			const option=document.createElement("option");
			option.value=item.item_id;
			option.textContent=item.name;
			select.appendChild(option);
		});
	} catch(err) {
		console.error("Could not load items:",err);
	}
}

// Loads the saved price for the chosen product and sales date into the sales form.
async function loadSelectedSalesPrice() {
	const isEditMode=new URLSearchParams(window.location.search).get('mode')==='edit';
	if(isEditMode) return;
	unitPrice.value='';
	if(!salesDate.value||!productSold.value) {
		salesPriceMessage.textContent='Select a sales date and product to load its price.';
		managerSalePrice.querySelector('strong').textContent='—';
		managerSalePrice.querySelector('small').textContent='Select the sales date and product.';
		managerSalePrice.classList.remove('has-price','price-error');
		return;
	}
	salesPriceMessage.textContent='Loading saved price...';
	managerSalePrice.querySelector('strong').textContent='Loading...';
	managerSalePrice.querySelector('small').textContent='Checking the Prices page.';
	managerSalePrice.classList.remove('has-price','price-error');
	try {
		const query=new URLSearchParams({ item_id: productSold.value,date: salesDate.value });
		const response=await fetch('/api/prices/lookup?'+query.toString());
		const result=await response.json();
		if(!response.ok) {
			salesPriceMessage.textContent=result.err||'No price is available for this selection.';
			managerSalePrice.querySelector('strong').textContent='No price set';
			managerSalePrice.querySelector('small').textContent=salesPriceMessage.textContent;
			managerSalePrice.classList.add('price-error');
			return;
		}
		unitPrice.value=Number(result.unit_price).toFixed(2);
		salesPriceMessage.textContent='Saved price effective from '+formatDate(result.effective_date)+'.';
		const selectedProduct=productSold.options[productSold.selectedIndex];
		managerSalePrice.querySelector('strong').textContent='₦'+formatNumber(result.unit_price)+'/'+inventoryUnit(selectedProduct.textContent.trim());
		managerSalePrice.querySelector('small').textContent='Effective from '+formatDate(result.effective_date)+'.';
		managerSalePrice.classList.add('has-price');
	} catch(error) {
		console.error(error);
		salesPriceMessage.textContent='The price could not be loaded.';
		managerSalePrice.querySelector('strong').textContent='Price unavailable';
		managerSalePrice.querySelector('small').textContent='The saved price could not be loaded.';
		managerSalePrice.classList.add('price-error');
	}
}

salesDate.addEventListener('change',loadSelectedSalesPrice);
productSold.addEventListener('change',loadSelectedSalesPrice);

// Fetches purchases dropdown and displays the results in the relevant interface.
async function loadPurchasesDropdown(select=materialSupplied) {
	try {
		if(!select) {
			return;
		}
		const response=await fetch("/api/items");
		const items=await response.json();
		// Keeps collection entries that match the current condition.
		const inventories=items.filter(item => {
			return (
				item.item_type==="raw_material"||
				item.item_type==="consumable"
			);
		});
		// Processes each entry in the collection.
		inventories.forEach(inventory => {
			const option=document.createElement("option");
			option.value=inventory.item_id;
			option.textContent=inventory.name;
			select.appendChild(option);
		});
	} catch(err) {
		console.error("could Not load items:",err);
	}
}

// Fetches inventory dropdown and displays the results in the relevant interface.
async function loadInventoryDropdown(select=stockName) {
	try {
		const response=await fetch("/api/items");
		const items=await response.json();

		if(!select) {
			return;
		}
		// Processes each entry in the collection.
		items.forEach(item => {
			const option=document.createElement("option");
			option.value=item.item_id;
			option.textContent=item.name;
			select.appendChild(option);
		});
	} catch(err) {
		console.error("Could not load items:",err);
	}
}

// Fetches customers dropdown and displays the results in the relevant interface.
async function loadCustomersDropdown() {

	try {
		const select=document.querySelector('#customer');
		const response=await fetch('/api/customers');
		if(!response.ok) {
			appNotify('Could not load sales');
		}
		const result=await response.json();
		// Processes each entry in the collection.
		result.forEach((row) => {
			const option=document.createElement('option');
			option.value=row.customer_id;
			option.textContent=row.name;
			select.appendChild(option);
		});
		renderCustomersCards(result);

	} catch(error) {
		console.error(error);
	}

}

// Fetches suppliers dropdown and displays the results in the relevant interface.
async function loadSuppliersDropdown() {
	try {
		const response=await fetch("/api/suppliers");
		if(!response.ok) {
			appNotify("Could not load suppliers");
			return;
		}
		const result=await response.json();
		// Processes each entry in the collection.
		result.forEach(row => {
			const option=document.createElement("option");
			option.value=row.supplier_id;
			option.textContent=row.name;
			supplier.appendChild(option);
		});
		renderSupplierCards(result);
	} catch(error) {
		console.error(error);
	}
}

// Fetches employee records from the database and displays them as employee cards.
async function loadEmployees() {
	try {
		const response=await fetch('/api/employees');
		if(!response.ok) {
			appNotify('Could not load employees');
			return;
		}
		const employees=await response.json();
		renderEmployeeCards(employees);
	} catch(error) {
		console.error(error);
	}
}

// Returns the display unit associated with an inventory item.
function inventoryUnit(itemName) {
	if(itemName==="Diesel") {
		return "L";
	}
	if(itemName==="Electricity") {
		return "kWh";
	}
	return "kg";
}

// Updates unit labels to match the currently selected inventory item.
function updateEntryUnit(select,unitSelector) {
	const selectedOption=select.options[select.selectedIndex];
	const selectedName=selectedOption? selectedOption.textContent.trim():"";
	const unit=inventoryUnit(selectedName);
	// Processes each entry in the collection.
	document.querySelectorAll(unitSelector).forEach(function(element) {
		element.textContent=unit;
	});
}

// Handles change events from stockName.
stockName.addEventListener("change",function() {
	updateEntryUnit(stockName,".inventory-entry-unit");
});

// Handles change events from materialSupplied.
materialSupplied.addEventListener("change",function() {
	updateEntryUnit(materialSupplied,".purchase-entry-unit");
});

// Loads the dropdown data required by the entry forms.
async function loadForms() {
	const user=await window.currentUserPromise;
	if(!user) return;
	await pageScriptsLoaded();
	applyFormPermissions(user);
	await loadInventoryDropdown();
	await loadPurchasesDropdown();
	await loadSalesDropdown();
	await loadCustomersDropdown();
	await loadSuppliersDropdown();
	if(user.role!=='storekeeper') {
		await loadEmployees();
	}
	await loadCompanyDetails();
	editForm();
}
loadForms();

// Validates the submitted sale data and sends it to the server for saving.
// Blocks a form's submit button while it saves, so a double tap cannot send it twice. Returns false if already saving.
function startSaving(form) {
    if(form.dataset.saving==='true') return false;
    form.dataset.saving='true';
    const button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;
    return true;
}
function finishSaving(form) {
    form.dataset.saving='false';
    const button=form.querySelector('button[type="submit"]');if(button)button.disabled=false;
}

function authorisationKey(type,payload) {
    const slot='authorisation:'+type+':'+JSON.stringify(payload);
    let key=sessionStorage.getItem(slot);
    if(!key) { key=crypto.randomUUID();sessionStorage.setItem(slot,key); }
    return {key,slot};
}
async function saveSale(event) {
	event.preventDefault();
    if(salesForm.dataset.saving==='true') return;
	const sale={
		sales_date: salesDate.value,
		customer_id: customer.value,
		item_id: productSold.value,
		unit_price: unitPrice.value,
        billing_basis:document.getElementById('sales-billing-basis').value,
        representative_id:document.getElementById('sales-representative').value,
        ordered_quantity:salesOrderedQuantity?salesOrderedQuantity.value:''
	};
    const retry=authorisationKey('Sale',sale);
    sale.authorisation_key=retry.key;
    salesForm.dataset.saving='true';
    const submit=salesForm.querySelector('button[type="submit"]');
    submit.disabled=true;
	try {
		const response=await fetch("/api/sales",{
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify(sale)
		});
		if(!response.ok) {
			const problem=await response.json();
			appNotify(problem.err||problem.error||"Sale could not be saved.");
			return;
		}
		const savedSale=await response.json();
		console.log("saved:",savedSale);
		appNotify("Sale authorised and sent to Storekeeper for weighing.");
		if(window.refreshPendingWeighingBadge) window.refreshPendingWeighingBadge();
		sessionStorage.removeItem(retry.slot);
		salesForm.reset();
		salesPriceMessage.textContent='Select a sales date and product to load its price.';
		if(window.openFormsMenu) window.openFormsMenu();
		managerSalePrice.querySelector('strong').textContent='—';
		managerSalePrice.querySelector('small').textContent='Select the sales date and product.';
		managerSalePrice.classList.remove('has-price','price-error');
	} catch(err) {
		console.error("network problem:",err);
		appNotify("Could not confirm the result. Retry the same entry to check it safely.");
    } finally {
        salesForm.dataset.saving='false';
        submit.disabled=false;
    }
}

if(salesForm) {
	salesForm.addEventListener("submit",saveSale);
}

// Validates the submitted purchases data and sends it to the server for saving.
async function savePurchases(event) {
	event.preventDefault();
    if(purchaseForm.dataset.saving==='true') return;
	const purchase={
		purchase_date: purchaseDate.value,
		supplier_id: supplier.value,
		item_id: materialSupplied.value,
		unit_cost: unitCost.value,
		ordered_quantity: purchaseOrderedQuantity?purchaseOrderedQuantity.value:''
	};
    const retry=authorisationKey('Purchase',purchase);
    purchase.authorisation_key=retry.key;
    purchaseForm.dataset.saving='true';
    const submit=purchaseForm.querySelector('button[type="submit"]');
    submit.disabled=true;
	try {
		const response=await fetch("/api/purchases",{
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify(purchase)
		});
		if(!response.ok) {
			appNotify("Save failed. Check entries and try again");
			return;
		}
		const savedPurchase=await response.json();
		console.log("saved:",savedPurchase);
		appNotify("Purchase authorised and sent to Storekeeper for weighing.");
		if(window.refreshPendingWeighingBadge) window.refreshPendingWeighingBadge();
		sessionStorage.removeItem(retry.slot);
		purchaseForm.reset();
		if(window.openFormsMenu) window.openFormsMenu();
	} catch(err) {
		console.error("Network problem",err);
		appNotify("Could not confirm the result. Retry the same entry to check it safely.");
    } finally {
        purchaseForm.dataset.saving='false';
        submit.disabled=false;
    }
}

if(purchaseForm) {
	purchaseForm.addEventListener("submit",savePurchases);
}

// Validates the submitted inventory data and sends it to the server for saving.
async function saveInventory(event) {
	event.preventDefault();
	const inventoryItems={
		count_date: stockDate.value,
		item_id: stockName.value,
		...stockChangeValues(),
		adjustment_reason: stockReason.value
	};
	if(!startSaving(inventoryForm)) return;
	// The same entry retried after a lost connection keeps its key, so it is saved only once.
	const retry=authorisationKey('Stock',inventoryItems);
	inventoryItems.submission_key=retry.key;
	try {
		const response=await fetch("/api/stock_counts",{
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify(inventoryItems)
		});
		if(!response.ok) {
			// Show the server's reason, such as a removal that would make stock negative on its date or later.
			const result=await response.json().catch(()=>({}));
			appNotify(result.err||result.error||"failed to submit. Check your entries");
			return;
		}
		const savedStock=await response.json();
		console.log("saved:",savedStock);
		sessionStorage.removeItem(retry.slot);
		appNotify("Stock submited successfully");
		inventoryForm.reset();
		if(window.openFormsMenu) window.openFormsMenu();
	} catch(err) {
		console.error(err);
		appNotify("Could not confirm the result. Retry the same entry to check it safely.");
	} finally {
		finishSaving(inventoryForm);
	}
}
if(inventoryForm) {
	inventoryForm.addEventListener("submit",saveInventory);
}

// Validates the submitted production data and sends it to the server for saving.
async function saveProduction(event) {
	event.preventDefault();
	const production={
		production_date: productionDate.value,
		production_hours: productionHours.value,
		down_time: downTime.value
	};
	if(!startSaving(productionForm)) return;
	try {
		const response=await fetch("/api/production",{
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify(production)
		});
		if(!response.ok) {
			const problem=await response.json();
			if(response.status===400||response.status===409) {
				appNotify("Failed to submit. "+problem.err);
			} else {
				appNotify("Failed to submit. Internal server problem");
			}
			return;
		}
		const savedProduction=await response.json();
		console.log("saved:",savedProduction);
		appNotify("Production authorised and sent to Storekeeper for weighing.");
		if(window.refreshPendingWeighingBadge) window.refreshPendingWeighingBadge();
		productionForm.reset();
		if(window.openFormsMenu) window.openFormsMenu();
	} catch(err) {
		console.error(err);
		appNotify("Could not confirm the result. Retry the same entry to check it safely.");
	} finally {
		finishSaving(productionForm);
	}
}
if(productionForm) {
	productionForm.addEventListener("submit",saveProduction);
}

// Each report form has a large ✕ at its top right. Cancel discards what was typed (and any saved record being
// edited) and returns to the page that was open before the form, with the Forms list open in the menu.
function cancelReportForm(form) {
    for(const key of ['editRecord','editKind','checksReturnUrl']) sessionStorage.removeItem(key);
    if(new URLSearchParams(location.search).get('mode')!=='edit') form.reset();
    window.closeToPreviousPage('forms');
}
[inventoryForm,purchaseForm,salesForm,productionForm,expensesForm].forEach(form=>{
    const card=form&&form.closest('.card');
    if(!card) return;
    const close=document.createElement('button');
    close.type='button';close.className='form-cancel-x';
    close.setAttribute('aria-label','Cancel and close this form');close.title='Cancel';
    close.replaceChildren(AppUI.icon('close'));
    close.addEventListener('click',event=>{event.stopPropagation();cancelReportForm(form);});
    card.classList.add('has-cancel-x');card.prepend(close);
});
// The Data pages get the same ✕: it returns to the page that was open before, with the Data list open in the menu.
['inventory-data','stock-history','activity-log','purchases-data','sales-data','production-data','expenses-data'].forEach(id=>{
    const card=document.getElementById(id);
    if(!card) return;
    const close=document.createElement('button');
    close.type='button';close.className='form-cancel-x';
    close.setAttribute('aria-label','Close this page');close.title='Close';
    close.replaceChildren(AppUI.icon('close'));
    close.addEventListener('click',event=>{
        event.stopPropagation();
        window.closeToPreviousPage('data');
    });
    card.classList.add('has-cancel-x');card.prepend(close);
});

// Validates the submitted expenses data and sends it to the server for saving.
async function saveExpenses(event) {
	event.preventDefault();
	const expense={
		expense_date: expenseDate.value,
		category: expenseCategory.value,
		description: expenseDescription.value,
		amount_spent: expenseAmount.value
	};
	if(!startSaving(expensesForm)) return;
	const retry=authorisationKey('Expense',expense);
	expense.submission_key=retry.key;
	try {
		const response=await fetch("/api/expenses",{
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify(expense)
		});
		if(!response.ok) {
			if(response.status===400) {
				const problem=await response.json();
				appNotify("Failed to submit "+problem.err);
				console.log(problem.err);
			} else {
				appNotify("Failed to submit. Internal server error");
			}
			return;
		}
		const savedExpense=await response.json();
		sessionStorage.removeItem(retry.slot);
		appNotify("Expense submitted successfully");
		expensesForm.reset();
		if(window.openFormsMenu) window.openFormsMenu();
		console.log("submitted:",savedExpense);
	} catch(err) {
		console.error(err);
		appNotify("Could not confirm the result. Retry the same entry to check it safely.");
	} finally {
		finishSaving(expensesForm);
	}
}
// Diesel and electricity are bought as stock and costed into production, so warn before they are entered as an expense.
// Words like "electrician" or "fuel for the van" do not match, so electrical repairs and vehicle fuel are not flagged.
const energyExpensePattern=/\b(diesel|electricity|kwh|nepa|phcn|light bill|power bill|meter token|prepaid meter|prepaid units)\b/i;
const expenseEnergyWarning=document.querySelector("#expense-energy-warning");
function looksLikeEnergyExpense() {
	return energyExpensePattern.test(expenseDescription?.value||"");
}
if(expensesForm&&expenseDescription&&expenseEnergyWarning) {
	expenseDescription.addEventListener("input",() => { expenseEnergyWarning.hidden=!looksLikeEnergyExpense(); });
	expensesForm.addEventListener("reset",() => { expenseEnergyWarning.hidden=true; });
	// Runs before saving a new expense or an edit, and stops the save unless the user confirms.
	expensesForm.addEventListener("submit",event => {
		if(!looksLikeEnergyExpense()) return;
		if(!window.confirm("This looks like diesel or electricity. Their cost is already in production cost through Purchases and Daily Usage, so saving it here counts it twice. Save it as an expense anyway?")) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	},true);
}
if(expensesForm) {
	expensesForm.addEventListener("submit",saveExpenses);
}

// Formats a date value as YYYY-MM-DD.
function formatDate(dateValue) {
	return new Date(dateValue.slice(0,10)+"T00:00:00").toLocaleDateString(
		"en-NG",
		{
			day: "numeric",
			month: "short",
			year: "numeric"
		}
	);
}

// Formats a submission timestamp for display.
function formatSubmitted(createdAt) {
	return new Date(createdAt).toLocaleString("en-NG",{
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false
	});
}

// Formats number for display.
function formatNumber(value) {
	return Number(value).toLocaleString("en-NG");
}

// Creates a labelled value block for a data card.
function createCardValues(label,value,unit) {
	const box=document.createElement("div");
	const labelName=document.createElement("span");
	const nameOrValue=document.createElement("strong");
	const unitValue=document.createElement("small");

	nameOrValue.textContent=value;
    if(String(value).includes('₦')) box.classList.add('is-money');
    if(/^[₦+−-]?\d[\d,.]*(?:\s?%)?$/.test(String(value).trim())) box.classList.add('is-number');
	labelName.textContent=label;

	box.append(labelName,nameOrValue,unitValue);
	if(unit!==undefined) {
		unitValue.textContent=unit;
		box.appendChild(unitValue);
	}
	return box;
}

