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

// Loads every product and its dated price history onto the Prices page.
async function loadPrices() {
	if(!priceCards) return;
	priceCards.textContent='Loading product prices...';
	try {
		const [itemsResponse,pricesResponse]=await Promise.all([
			fetch('/api/items'),fetch('/api/prices')
		]);
		if(!itemsResponse.ok||!pricesResponse.ok) throw new Error('Price records could not be loaded');
		const items=await itemsResponse.json();
		const prices=await pricesResponse.json();
		const products=items.filter(item => item.item_type==='product');
		const selectedProduct=priceProduct?priceProduct.value:'';
		if(priceProduct) {
			priceProduct.replaceChildren(new Option('Select a product',''));
			priceProduct.firstElementChild.disabled=true;
			products.forEach(item => priceProduct.add(new Option(item.name,item.item_id)));
			priceProduct.value=selectedProduct;
		}
		priceCards.replaceChildren();
		const today=new Date().toISOString().slice(0,10);
		products.forEach(product => {
			const history=prices.filter(record => String(record.item_id)===String(product.item_id));
			const current=history.find(record => record.effective_date<=today);
			const priceUnit=inventoryUnit(product.name);
			const card=document.createElement('article');
			card.className='price-card';
			const heading=document.createElement('div');
			heading.className='price-card-heading';
			const title=document.createElement('h2');
			title.textContent=product.name;
			const currentDisplay=document.createElement('div');
			currentDisplay.className='price-current';
			const currentPrice=document.createElement('strong');
			currentPrice.textContent=current?'₦'+formatNumber(current.unit_price)+'/'+priceUnit:'No current price';
			const currentStatus=document.createElement('span');
			currentStatus.className='price-status '+(current?'current':'not-set');
			currentStatus.textContent=current?'Current':'Not set';
			currentDisplay.append(currentPrice,currentStatus);
			heading.append(title,currentDisplay);
			const list=document.createElement('div');
			list.className='price-history';
			list.hidden=true;
			if(history.length===0) {
				const empty=document.createElement('p');
				empty.textContent='No price has been saved for this product.';
				list.appendChild(empty);
			} else {
				history.forEach((record,index) => {
					const row=document.createElement('p');
					const date=document.createElement('span');
					const details=document.createElement('span');
					const amount=document.createElement('b');
					const status=document.createElement('small');
					const recordStatus=record.effective_date>today?'Upcoming':
						(history.slice(0,index).some(entry => entry.effective_date<=today)?'Previous':'Current');
					date.textContent=(record.effective_date>today?'Starts ':'From ')+formatDate(record.effective_date);
					amount.textContent='₦'+formatNumber(record.unit_price)+'/'+priceUnit;
					status.className='price-status '+recordStatus.toLowerCase();
					status.textContent=recordStatus;
					details.append(amount,status);
					row.append(date,details);
					list.appendChild(row);
				});
			}
			const historyButton=document.createElement('button');
			historyButton.type='button';
			historyButton.className='price-history-button';
			historyButton.textContent='View Price History';
			historyButton.disabled=history.length===0;
			historyButton.addEventListener('click',function() {
				list.hidden=!list.hidden;
				historyButton.classList.toggle('is-open',!list.hidden);
				historyButton.textContent=list.hidden?'View Price History':'Hide Price History';
			});
			card.append(heading,historyButton,list);
            if(window.styleReferencePrice)window.styleReferencePrice(card,product);
			priceCards.appendChild(card);
		});
		if(products.length===0) priceCards.textContent='No saleable products were found.';
	} catch(error) {
		console.error(error);
		priceCards.textContent='Product prices could not be loaded.';
	}
}

// Saves a new dated product price and refreshes the visible price history.
async function saveProductPrice(event) {
	event.preventDefault();
	priceMessage.textContent='Saving price...';
	try {
		const response=await fetch('/api/prices',{
			method: 'POST',
			headers: { 'content-type':'application/json' },
			body: JSON.stringify({
				item_id: priceProduct.value,
				unit_price: priceAmount.value,
				effective_date: priceEffectiveDate.value
			})
		});
		const result=await response.json();
		if(!response.ok) {
			priceMessage.textContent=result.err||'The price could not be saved.';
			return;
		}
		priceMessage.textContent='Price saved successfully.';
		priceAmount.value='';
		priceForm.hidden=true;
		await loadPrices();
	} catch(error) {
		console.error(error);
		priceMessage.textContent='The price could not be saved.';
	}
}

if(priceForm) {
	priceEffectiveDate.value=new Date().toISOString().slice(0,10);
	priceForm.addEventListener('submit',saveProductPrice);
}

if(openPriceFormBtn) {
	// Reveals the price form only when the administrator chooses to add a price.
	openPriceFormBtn.addEventListener('click',function() {
		priceForm.hidden=false;
		priceProduct.focus();
	});
}

if(cancelPriceFormBtn) {
	// Closes the price form without changing any saved price.
	cancelPriceFormBtn.addEventListener('click',function() {
		priceForm.hidden=true;
		priceMessage.textContent='';
	});
}

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

// Displays a company logo path or the building fallback when no logo is stored.
function displayCompanyLogo(logoPath) {
	if(!companyLogoPreview||!companyLogoFallback) return;
	if(logoPath) {
		companyLogoPreview.src=logoPath;
		companyLogoPreview.hidden=false;
		companyLogoFallback.hidden=true;
	} else {
		companyLogoPreview.removeAttribute('src');
		companyLogoPreview.hidden=true;
		companyLogoFallback.hidden=false;
	}
}

// Fills every company field with the values returned by the company API.
function populateCompanyForm(company) {
	currentCompanyDetails=company;
	const fieldNames=[
		'company_name',
		'registration_number',
		'tax_identification_number',
		'phone_number',
		'email',
		'website',
		'business_address',
		'bank_name',
		'account_number',
		'account_name'
	];
	// Copies each stored value into its matching company form control.
	fieldNames.forEach((fieldName) => {
		companyForm.elements[fieldName].value=company[fieldName]||'';
	});
	removeCompanyLogoValue.value='false';
	companyLogoInput.value='';
	displayCompanyLogo(company.logo_path);
}

// Enables or disables all company controls when entering or leaving edit mode.
function setCompanyEditMode(isEditing) {
	const editableFields=companyForm.querySelectorAll(
		'input:not([type="hidden"]), textarea'
	);
	// Applies the selected edit state to every editable company field.
	editableFields.forEach((field) => {
		field.disabled=!isEditing;
	});
	removeCompanyLogoBtn.disabled=!isEditing;
	editCompanyBtn.hidden=
		isEditing||document.documentElement.dataset.userRole!=='admin';
	companyForm.querySelector('.company-form-actions').hidden=!isEditing;
	companyForm.classList.toggle('is-editing',isEditing);
}

// Fetches the singleton company profile and displays it in read-only mode.
async function loadCompanyDetails() {
	if(!companyForm) return;
	try {
		const response=await fetch('/api/company');
		if(!response.ok) {
			throw new Error('Could not load company details');
		}
		const company=await response.json();
		populateCompanyForm(company);
		setCompanyEditMode(false);
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


// Fetches sales data and displays the results in the relevant interface.
async function loadSalesData() {
	try {
		const response=await fetch("/api/sales");
		const tableBody=document.querySelector("#sales-data-body");
		if(!tableBody) {
			return;
		}
		if(!response.ok) {
			const problem=await response.json();
			appNotify(problem.err);
			return;
		}
		const sales=await response.json();
		await renderSalesCard(sales);
		tableBody.innerHTML=``;
		// Processes each entry in the collection.
		sales.forEach(function(sale) {
			const row=document.createElement("tr");
			const submitted=new Date(sale.created_at);
			const formatedDate=submitted
				.toLocaleDateString("en-NG",{
					day: "2-digit",
					month: "2-digit",
					year: "2-digit"
				})
				.replace(/\//g,"-");
			const formatedTime=submitted.toLocaleTimeString("en-NG",{
				hour: "2-digit",
				minute: "2-digit"
			});
			const dateAndTime=formatedDate+" "+formatedTime;
			const formatedTotal=Number(sale.total).toLocaleString("en-NG");
			const cells=[
				dateAndTime,
				sale.customer,
				sale.name,
				sale.quantity,
				sale.unit_price,
				formatedTotal
			];
			// Processes each entry in the collection.
			cells.forEach(value => {
				const tableData=document.createElement("td");
				tableData.textContent=value;
				row.appendChild(tableData);
			});
			tableBody.appendChild(row);
		});
	} catch(err) {
		console.error(err);
		appNotify("Failed to load Sales. Network problem");
	}
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

// Creates the shared shell used by transaction data cards.
function createCard(date,createdAt,itemName,id,idPrefix='p',inventoryStyle=false) {
	const card=document.createElement("article");
	const header=document.createElement("div");
	const body=document.createElement("div");
	const item=document.createElement("span");
	const displayDate=document.createElement("span");
	const submittedAt=document.createElement("span");
	const idNum=document.createElement("span");
	const actions=document.createElement("div");

	card.classList.add("data-record-card");
    if(inventoryStyle)card.classList.add("ledger-card");
	header.classList.add("data-record-header");
	body.classList.add("data-record-values");
	actions.classList.add("card-actions");

	actions.innerHTML=`<button class="edit-btn">Edit</button>
  <button class="delete-btn">Delete</button>
  <button class="details-btn">Details</button>`;
	if(document.documentElement.dataset.userRole!=='admin') {
		actions.querySelector('.edit-btn').hidden=true;
		actions.querySelector('.delete-btn').hidden=true;
	}

    if(inventoryStyle){
	item.textContent=({'P Kernel':'Palm Kernel (P Kernel)','PKO':'Palm Kernel Oil (PKO)','PKC':'Palm Kernel Cake (PKC)'})[itemName]||itemName;
    item.className='record-name';displayDate.className='record-date';submittedAt.className='record-submitted';idNum.className='record-reference';
    const visual=document.createElement('span');visual.className='record-product-icon';
    const itemKey=String(itemName).toLowerCase();
    visual.appendChild(AppUI.icon(itemKey==='p kernel'?'seed':itemKey==='pko'?'oil':itemKey==='pkc'?'sack':itemKey==='sludge'?'flask':itemKey==='diesel'?'fuel':itemKey==='electricity'?'electricity':'cubes'));

	idNum.textContent=idPrefix+id;
	submittedAt.textContent=createdAt?'Recorded '+formatSubmitted(createdAt):'No movement · balance carried forward';
	displayDate.textContent=formatDate(date)+(createdAt?', '+new Date(createdAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'');
    displayDate.prepend(AppUI.icon('calendar'));

	header.append(visual,item,displayDate,submittedAt,idNum);

    } else {
        item.textContent=itemName;
        idNum.textContent=idPrefix+id;
        submittedAt.textContent=formatSubmitted(createdAt);
        displayDate.textContent=formatDate(date);
        header.append(displayDate,submittedAt,item,idNum);
    }

	card.append(header,body,actions);

	return {
		card: card,
		header: header,
		body: body
	};
}

// Formats number for display.
function formatNumber(value) {
	return Number(value).toLocaleString("en-NG");
}

let currentSaleDocumentData=null;

// Opens the invoice and payment page for the selected sale.
function openSaleDocument(sale) {
    if(!sale.invoice_number&&sale.has_delivery_note){window.openDeliveryNote(sale.sales_id);return;}
	const address=new URL(window.location.href);
	address.search='';
	address.searchParams.set('saleId',sale.sales_id);
	address.hash='sale-document';
	window.history.pushState({},'',address);
	displaySelectedForm();
}

// Creates a text element used by the printable sales documents.
function createDocumentText(tag,className,text) {
	const element=document.createElement(tag);
	if(className) element.className=className;
	element.textContent=text||'';
	return element;
}

// Calculates and displays the current payment position for a sale.
function salePaymentSummary(sale) {
	const total=Number(sale.total);
	const paid=Number(sale.amount_paid);
	const remaining=Math.max(total-paid,0);
	let status='Pending';
	if(remaining===0) status='Paid';
	else if(paid>0) status='Partly Paid';
	else if(sale.due_date&&sale.due_date<new Date().toISOString().slice(0,10)) status='Overdue';
	return { total: total,paid: paid,remaining: remaining,status: status };
}

// Adds a small line icon in front of a document element.
function withDocumentIcon(element,name) {
	if(window.AppUI) element.prepend(AppUI.icon(name));
	return element;
}

// Builds address, phone and email lines, skipping any detail that is not saved.
function documentContactLines(lines) {
	const box=createDocumentText('div','sale-doc-contact');
	lines.forEach(function(line) {
		if(line[1]) box.append(withDocumentIcon(createDocumentText('span','',line[1]),line[0]));
	});
	return box;
}

// Shows a payment status as a coloured badge, optionally with its own wording.
function documentStatusBadge(status,text) {
	const icons={ 'Paid':'confirm','Payment Received':'confirm','Reversed':'alert' };
	const badge=createDocumentText('span','sale-doc-status status-'+status.toLowerCase().replace(/[^a-z]+/g,'-'),text||status);
	return withDocumentIcon(badge,icons[status]||'clock');
}

// Builds the shared letterhead and document title, with the reference details used on the printed copy.
function buildSaleDocumentHeading(data,title,number,metaRows) {
	const fragment=document.createDocumentFragment();
	const company=createDocumentText('div','sale-print-company');
	const logo=document.createElement('img');
	logo.className='sale-doc-logo';
	logo.alt=(data.company.company_name||'Company')+' logo';
	logo.src=data.company.logo_path||'/images/logo.png';
	const details=createDocumentText('div','sale-doc-company');
	details.append(
		createDocumentText('h2','',data.company.company_name||'Company'),
		documentContactLines([['pin',data.company.business_address],['phone',data.company.phone_number],['mail',data.company.email]])
	);
	company.append(logo,details);
	const titleBox=createDocumentText('div','sale-print-title');
	const meta=createDocumentText('dl','sale-doc-meta doc-print-only');
	(metaRows||[]).forEach(function(row) {
		const line=document.createElement('div');
		line.append(createDocumentText('dt','',row[0]+':'),createDocumentText('dd','',row[1]));
		meta.append(line);
	});
	titleBox.append(createDocumentText('h1','',title),createDocumentText('strong','sale-doc-number doc-screen-only',number),meta);
	fragment.append(company,titleBox);
	return fragment;
}

// Builds the customer block: who the invoice is for or who paid.
function buildSaleDocumentParty(data,screenLabel,printLabel,status,statusOnScreen,statusText) {
	const customer=createDocumentText('div','sale-print-customer');
	const party=createDocumentText('div','sale-doc-party');
	party.append(
		withDocumentIcon(createDocumentText('span','doc-screen-only',screenLabel),'user'),
		createDocumentText('span','doc-print-only sale-doc-party-label',printLabel),
		createDocumentText('strong','',data.sale.customer),
		documentContactLines([['pin',data.sale.customer_address],['phone',data.sale.customer_phone],['mail',data.sale.customer_email]])
	);
	customer.append(party);
	if(status) {
		const badge=documentStatusBadge(status,statusText);
		if(!statusOnScreen) badge.classList.add('doc-print-only');
		customer.append(badge);
	}
	return customer;
}

// Builds a document table from header labels and rows; the first column can be printed only.
function buildSaleDocumentTable(headers,rows,printOnlyFirst) {
	const wrap=createDocumentText('div','sale-doc-table-wrap');
	const table=document.createElement('table');
	table.className='sale-doc-table';
	const head=document.createElement('tr');
	headers.forEach(function(label,index) {
		const cell=createDocumentText('th','',label);
		if(printOnlyFirst&&index===0) cell.classList.add('doc-print-only');
		head.append(cell);
	});
	const body=document.createElement('tbody');
	rows.forEach(function(values) {
		const row=document.createElement('tr');
		values.forEach(function(value,index) {
			const cell=createDocumentText('td','',value);
			if(printOnlyFirst&&index===0) cell.classList.add('doc-print-only');
			row.append(cell);
		});
		body.append(row);
	});
	const thead=document.createElement('thead');
	thead.append(head);
	table.append(thead,body);
	wrap.append(table);
	return wrap;
}

// Builds the printed sign-off area with lines for a name and signature.
function buildSaleDocumentSignoff(people,screenToo) {
	const signoff=createDocumentText('div','sale-doc-signoff'+(screenToo?'':' doc-print-only'));
	people.forEach(function(person) {
		const block=document.createElement('div');
		block.append(
			createDocumentText('span','',person[0]),
			createDocumentText('i','sale-doc-sign-line',''),
			createDocumentText('strong','',person[1]||'Name and signature')
		);
		signoff.append(block);
	});
	return signoff;
}

// Marks the Invoice or Receipt tab as the document being shown.
function setSaleDocumentTab(name) {
	document.querySelectorAll('#sale-document .sale-doc-tabs button').forEach(function(button) {
		button.classList.toggle('active',button.dataset.document===name);
	});
}

// Displays the invoice for the current sale.
function showSaleInvoice() {
	if(!currentSaleDocumentData) return;
	const data=currentSaleDocumentData;
	const sale=data.sale;
	const summary=salePaymentSummary(sale);
	const printArea=document.querySelector('.sale-print-area');
	const dueDate=formatDate(sale.due_date||sale.sales_date);
	const dates=createDocumentText('div','sale-print-meta doc-screen-only');
	dates.append(
		withDocumentIcon(createCardValues('Invoice Date',formatDate(sale.sales_date)),'calendar'),
		withDocumentIcon(createCardValues('Payment Due',dueDate),'calendar')
	);
	const basis=sale.billing_basis==='Customer'?'Customer’s agreed weight':'Factory weight';
	const item=buildSaleDocumentTable(
		['#','Product','Quantity','Payment Weight','Unit Price','Amount'],
		[['1',sale.item,formatNumber(sale.quantity)+' kg',basis,'₦'+formatNumber(sale.unit_price),'₦'+formatNumber(summary.total)]],
		true
	);
	item.classList.add('doc-print-only');
	// On screen the item is a card: product and amount, quantity and unit price, then payment weight.
	const itemCard=createDocumentText('div','sale-item-card doc-screen-only');
	const itemTop=createDocumentText('div','sale-item-row sale-item-top');
	const amount=createCardValues('Amount','₦'+formatNumber(summary.total));amount.classList.add('sale-item-amount');
	itemTop.append(createCardValues('Product',sale.item),amount);
	const itemPair=createDocumentText('div','sale-item-row sale-item-pair');
	itemPair.append(createCardValues('Quantity',formatNumber(sale.quantity)+' kg'),createCardValues('Unit Price','₦'+formatNumber(sale.unit_price)));
	const itemBasis=createDocumentText('div','sale-item-row');
	itemBasis.append(createCardValues('Payment Weight',basis));
	itemCard.append(itemTop,itemPair,itemBasis);
	const terms=createDocumentText('div','sale-doc-terms doc-print-only');
	const termList=document.createElement('ul');
	['Payment due on or before '+dueDate+'.',
		sale.billing_basis==='Customer'?'Invoiced on the buyer’s agreed weight.':'Invoiced on the factory dispatch weight.',
		'Quote the invoice number with every payment.'].forEach(function(text) { termList.append(createDocumentText('li','',text)); });
	terms.append(createDocumentText('h3','','Terms:'),termList);
	const totals=createDocumentText('div','sale-document-totals');
	const invoiceAmount=createCardValues('Invoice Amount','₦'+formatNumber(summary.total));
	invoiceAmount.classList.add('doc-print-only');
	const remaining=createCardValues('Amount Remaining','₦'+formatNumber(summary.remaining));
	remaining.classList.add('is-balance');
	totals.append(invoiceAmount,createCardValues('Total Paid','₦'+formatNumber(summary.paid)),remaining);
	const summaryRow=createDocumentText('div','sale-doc-summary');
	summaryRow.append(terms,totals);
	printArea.replaceChildren(
		buildSaleDocumentHeading(data,'INVOICE',sale.invoice_number,[['Invoice No',sale.invoice_number],['Invoice Date',formatDate(sale.sales_date)],['Payment Due',dueDate]]),
		buildSaleDocumentParty(data,'Customer','Bill To:',summary.status,false,'Status: '+summary.status),
		dates,itemCard,item,summaryRow,
		buildSaleDocumentSignoff([['Issued By'],['Authorised By']],false),
		createDocumentText('p','sale-doc-thanks doc-print-only','Thank you for your business.')
	);
	setSaleDocumentTab('invoice');
}

// Displays one statement containing the invoice and every payment made against it.
function showSaleStatement() {
	if(!currentSaleDocumentData) return;
	const data=currentSaleDocumentData;
	const summary=salePaymentSummary(data.sale);
	const printArea=document.querySelector('.sale-print-area');
	const list=createDocumentText('div','sale-statement-list');
	list.append(createDocumentText('h3','','Payments'));
	if(data.payments.length===0) list.append(createDocumentText('p','sale-doc-empty','No payments have been recorded.'));
	else list.append(buildSaleDocumentTable(['Date','Receipt','Method','Amount'],data.payments.map(function(payment) {
		return [formatDate(payment.payment_date),payment.receipt_number+(payment.reversed_at?' · Reversed':''),payment.payment_method,
			(payment.reversed_at?'₦0 (was ₦':'₦')+formatNumber(payment.amount)+(payment.reversed_at?')':'')];
	}),false));
	const totals=createDocumentText('div','sale-document-totals');
	const remaining=createCardValues('Amount Remaining','₦'+formatNumber(summary.remaining));
	remaining.classList.add('is-balance');
	totals.append(
		createCardValues('Invoice Amount','₦'+formatNumber(summary.total)),
		createCardValues('Total Paid','₦'+formatNumber(summary.paid)),
		remaining
	);
	printArea.replaceChildren(
		buildSaleDocumentHeading(data,'ACCOUNT STATEMENT',data.sale.invoice_number,[['Invoice No',data.sale.invoice_number],['Invoice Date',formatDate(data.sale.sales_date)],['Status',summary.status]]),
		buildSaleDocumentParty(data,'Customer','Statement For:',summary.status,true),
		list,totals
	);
	setSaleDocumentTab('');
}

// Displays the receipt belonging to one saved payment.
function showSaleReceipt(payment,paymentIndex) {
	const data=currentSaleDocumentData;
	const paidBefore=data.payments.slice(0,paymentIndex+1).reduce(function(total,row) {
		return total+(row.reversed_at?0:Number(row.amount));
	},0);
	const remaining=Math.max(Number(data.sale.total)-paidBefore,0);
	const printArea=document.querySelector('.sale-print-area');
	const amount=createDocumentText('div','sale-receipt-amount');
	amount.append(createCardValues('Amount Received','₦'+formatNumber(payment.amount)),createCardValues('Payment Method',payment.payment_method));
	const details=createDocumentText('div','sale-receipt-details');
	[
		['Invoice Amount','₦'+formatNumber(data.sale.total)],
		['Total Paid (to date)','₦'+formatNumber(paidBefore)],
		['Balance Remaining','₦'+formatNumber(remaining)],
		['Bank Reference',payment.reference_number||'Not provided'],
		...(payment.reversed_at?[['Reversed',payment.reversal_reason||'']]:[])
	].forEach(function(field) {
		const value=createCardValues(field[0],field[1]);
		if(field[0]==='Balance Remaining') value.classList.add('is-balance');
		details.append(value);
	});
	printArea.replaceChildren(
		buildSaleDocumentHeading(data,'RECEIPT',payment.receipt_number,[['Receipt No',payment.receipt_number],['Payment Date',formatDate(payment.payment_date)],['Related Invoice',data.sale.invoice_number]]),
		buildSaleDocumentParty(data,'Received From','Received From:',payment.reversed_at?'Reversed':'Payment Received',true),
		amount,
		createDocumentText('h3','sale-doc-section-title','Payment Details:'),
		details,
		createDocumentText('p','sale-doc-thanks','Thank you for your payment.'),
		buildSaleDocumentSignoff([['Received By',payment.recorded_by_name]],true)
	);
	setSaleDocumentTab('receipt');
	printArea.scrollIntoView({ behavior: 'smooth',block: 'start' });
}

// Opens the small form used to record a new payment against the sale.
function openSalePaymentDialog() {
	if(!currentSaleDocumentData) return;
	const summary=salePaymentSummary(currentSaleDocumentData.sale);
	if(summary.remaining<=0) {
		document.querySelector('.sale-document-message').textContent='This invoice has already been paid in full.';
		return;
	}
	const dialog=document.createElement('dialog');
	dialog.className='employee-finance-dialog sale-payment-dialog';
	dialog.innerHTML=`<form>
		<h2>Record Payment</h2>
		<p>Amount remaining: <strong>₦${formatNumber(summary.remaining)}</strong></p>
		<label>Amount received<input name="amount" type="number" min="0.01" max="${summary.remaining}" step="0.01" required></label>
		<label>Payment date<input name="payment_date" type="date" required></label>
		<label>Payment method<select name="payment_method" required><option value="">Select method</option><option>Bank Transfer</option><option>Cash</option><option>Cheque</option><option>POS</option></select></label>
		<label>Bank reference (optional)<input name="reference_number" type="text"></label>
		<label>Note (optional)<textarea name="note"></textarea></label>
		<p class="finance-dialog-message"></p>
		<div><button type="button" class="finance-cancel">Cancel</button><button type="submit">Save Payment</button></div>
	</form>`;
	document.body.appendChild(dialog);
	dialog.querySelector('[name="payment_date"]').value=new Date().toISOString().slice(0,10);
	dialog.querySelector('.finance-cancel').addEventListener('click',function() { dialog.close();dialog.remove(); });
	dialog.querySelector('form').addEventListener('submit',async function(event) {
		event.preventDefault();
		const form=event.currentTarget;
		if(!startSaving(form)) return;
		const saleId=currentSaleDocumentData.sale.sales_id;
		const payment=Object.fromEntries(new FormData(form));
		// A double tap or a retry of the same payment keeps its key, so the payment is recorded only once.
		const retry=authorisationKey('Payment:'+saleId,payment);
		payment.submission_key=retry.key;
		try {
			const response=await fetch('/api/sales/'+saleId+'/payments',{
				method: 'POST',headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payment)
			});
			const result=await response.json();
			if(!response.ok) {
				dialog.querySelector('.finance-dialog-message').textContent=result.err;
				return;
			}
			sessionStorage.removeItem(retry.slot);
			dialog.close();dialog.remove();
			await loadSaleDocument();
			document.querySelector('.sale-document-message').textContent='Payment saved. Receipt '+result.receipt_number+' is now available.';
		} catch(error) {
			dialog.querySelector('.finance-dialog-message').textContent='Could not confirm the payment. Select Save Payment again to check it safely.';
		} finally {
			finishSaving(form);
		}
	});
	dialog.showModal();
}

// Lets the Director reverse a wrongly entered payment while keeping its receipt on record.
function openPaymentReversalDialog(payment) {
	if(!currentSaleDocumentData) return;
	const dialog=document.createElement('dialog');
	dialog.className='employee-finance-dialog sale-payment-dialog';
	dialog.innerHTML=`<form>
		<h2>Reverse Payment</h2>
		<p>Receipt <strong class="reversal-receipt"></strong> for <strong class="reversal-amount"></strong> will be kept and marked reversed. The amount will be owed again.</p>
		<label>Reason<textarea name="reason" maxlength="300" required></textarea></label>
		<p class="finance-dialog-message"></p>
		<div><button type="button" class="finance-cancel">Cancel</button><button type="submit">Reverse Payment</button></div>
	</form>`;
	dialog.querySelector('.reversal-receipt').textContent=payment.receipt_number;
	dialog.querySelector('.reversal-amount').textContent='₦'+formatNumber(payment.amount);
	document.body.appendChild(dialog);
	dialog.querySelector('.finance-cancel').addEventListener('click',function() { dialog.close();dialog.remove(); });
	dialog.querySelector('form').addEventListener('submit',async function(event) {
		event.preventDefault();
		const response=await fetch('/api/sales/'+currentSaleDocumentData.sale.sales_id+'/payments/'+payment.payment_id+'/reverse',{
			method: 'POST',headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))
		});
		const result=await response.json();
		if(!response.ok) {
			dialog.querySelector('.finance-dialog-message').textContent=result.err;
			return;
		}
		dialog.close();dialog.remove();
		await loadSaleDocument();
		document.querySelector('.sale-document-message').textContent=result.message;
	});
	dialog.showModal();
}

// The box under the page title: amount remaining, total paid and the payment status.
function renderSaleSummaryCard(sale) {
	const box=document.querySelector('#sale-document .sale-summary-card');
	if(!box) return;
	const summary=salePaymentSummary(sale);
	const remaining=createDocumentText('div','sale-summary-remaining');
	remaining.append(createDocumentText('span','','Amount Remaining'),createDocumentText('strong','','₦'+formatNumber(summary.remaining)));
	const paid=createDocumentText('div','sale-summary-paid');
	paid.append(createDocumentText('span','','Total Paid'),createDocumentText('strong','','₦'+formatNumber(summary.paid)),documentStatusBadge(summary.status));
	box.replaceChildren(remaining,paid);
}

// Fetches and displays the selected sale, its invoice and payment history.
async function loadSaleDocument() {
	const saleId=new URLSearchParams(window.location.search).get('saleId');
	if(!saleId) return;
	const page=document.querySelector('#sale-document');
    currentSaleDocumentData=null;page.querySelector('.sale-print-area').replaceChildren();page.querySelector('.sale-summary-card').replaceChildren();
	const response=await fetch('/api/sales/'+saleId+'/invoice');
    if(response.status===409){window.openDeliveryNote(saleId);return;}
	const data=await response.json();
	if(!response.ok) {
		page.querySelector('.sale-document-message').textContent=data.err;
		return;
	}
	currentSaleDocumentData=data;
	renderSaleSummaryCard(data.sale);
	const role=document.documentElement.dataset.userRole;
	page.querySelector('#record-sale-payment').hidden=role==='storekeeper';
	const paymentList=page.querySelector('.sale-payment-list');
	paymentList.replaceChildren();
	if(data.payments.length===0) paymentList.append(withDocumentIcon(createDocumentText('p','sale-doc-empty','No payments have been recorded.'),'card'));
	// The number of payments sits beside the Payment History title.
	const historyTitle=page.querySelector('.sale-payment-history h2');
	let paymentCount=historyTitle.querySelector('.sale-payment-count');
	if(!paymentCount) { paymentCount=createDocumentText('span','sale-payment-count','');historyTitle.append(paymentCount); }
	paymentCount.textContent=String(data.payments.length);
	data.payments.forEach(function(payment,index) {
		const row=createDocumentText('div','sale-payment-row'+(payment.reversed_at?' is-reversed':''));
		row.append(
			createDocumentText('span','',formatDate(payment.payment_date)+' · '+payment.receipt_number),
			createDocumentText('strong','','₦'+formatNumber(payment.amount)),
			createDocumentText('span','',payment.reversed_at?'Reversed · '+(payment.reversal_reason||''):payment.payment_method)
		);
		const receipt=document.createElement('button');
		receipt.type='button';receipt.textContent='View Receipt';
		receipt.addEventListener('click',function() { showSaleReceipt(payment,index); });
		row.append(receipt);
		if(role==='admin'&&!payment.reversed_at) {
			const reverse=document.createElement('button');
			reverse.type='button';reverse.textContent='Reverse Payment';
			reverse.addEventListener('click',function() { openPaymentReversalDialog(payment); });
			row.append(reverse);
		}
		paymentList.append(row);
	});
	// The Receipt tab opens the newest payment that still counts; it is unavailable until a payment exists.
	const receiptTab=page.querySelector('#sale-tab-receipt');
	const latestIndex=data.payments.map(function(payment) { return !payment.reversed_at; }).lastIndexOf(true);
	const receiptIndex=latestIndex>=0?latestIndex:data.payments.length-1;
	receiptTab.disabled=receiptIndex<0;
	receiptTab.onclick=function() { if(receiptIndex>=0) showSaleReceipt(data.payments[receiptIndex],receiptIndex); };
	if(page.dataset.ready!=='true') {
		page.dataset.ready='true';
		[['#show-sale-invoice','document'],['#record-sale-payment','card'],['#show-sale-statement','chart'],['#print-sale-document','printer'],
			['#sale-tab-invoice','document'],['#sale-tab-receipt','receipt'],['.sale-document-heading h1','coins'],['.sale-document-heading a','back'],['.sale-payment-history h2','coins']].forEach(function(entry) {
			const element=page.querySelector(entry[0]);
			if(element) withDocumentIcon(element,entry[1]);
		});
		page.querySelector('#sale-tab-invoice').addEventListener('click',showSaleInvoice);
		page.querySelector('#show-sale-invoice').addEventListener('click',showSaleInvoice);
		page.querySelector('#show-sale-statement').addEventListener('click',showSaleStatement);
		page.querySelector('#record-sale-payment').addEventListener('click',openSalePaymentDialog);
		page.querySelector('#print-sale-document').addEventListener('click',function() { window.print(); });
	}
	showSaleInvoice();
    const existingNoteButton=page.querySelector('.open-delivery-note');if(existingNoteButton)existingNoteButton.hidden=!data.sale.has_delivery_note;
    if(data.sale.has_delivery_note){
        let noteButton=page.querySelector('.open-delivery-note');
        if(!noteButton){noteButton=document.createElement('button');noteButton.type='button';noteButton.className='open-delivery-note';noteButton.textContent='Delivery Note';withDocumentIcon(noteButton,'truck');page.querySelector('.sale-document-actions').insertBefore(noteButton,page.querySelector('#print-sale-document'));}
        noteButton.onclick=()=>window.openDeliveryNote(data.sale.sales_id,'sale');
    }
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

// Builds and displays transaction cards from a record list and configuration.
function displayCards(list,config,htmlDataList,visibleRecord,loadMoreBtn) {
	htmlDataList.replaceChildren();
	const countSelectors={
		sales: '#sales-record-count',
		stock: '#inventory-record-count',
		purchases: '#purchases-record-count',
		production: '#production-record-count',
		expenses: '#expenses-record-count'
	};
	const countElement=document.querySelector(countSelectors[config.kind]);
	if(countElement){
        if(config.kind==='stock')countElement.replaceChildren(AppUI.icon('document'),document.createTextNode(list.length.toLocaleString('en-NG')+' record'+(list.length===1?'':'s')));
        else countElement.textContent=list.length+' record'+(list.length===1?'':'s');
    }
    if(window.updateReferenceRecordSummary)window.updateReferenceRecordSummary(config.kind,list);
	if(config.kind==='stock'&&countElement){
        let warning=countElement.parentElement.querySelector('.negative-stock-count');
        if(!warning){warning=document.createElement('span');warning.className='negative-stock-count';countElement.after(warning);}
        const negative=list.filter(row=>Number(row.closing_stock)<0).length;
        warning.hidden=!negative;warning.replaceChildren(AppUI.icon('alert'),document.createTextNode(negative+' negative '+(negative===1?'balance':'balances')));
    }
    if(list.length===0) {
		const empty=document.createElement('p');
		empty.className='data-record-empty';
		empty.textContent='No records found.';
		htmlDataList.appendChild(empty);
	}
	// Processes each entry in the collection.
	list.slice(0,visibleRecord).forEach((row,index) => {
		const card=createCard(
			config.date(row),
			config.createdAt(row),
			config.item(row),
			config.id(row),'p',config.kind==='stock'
		);
		if(!config.openDetails) {
			card.card.querySelector('.details-btn').hidden=true;
		}
		if(config.readonly) {
			card.card.querySelector('.edit-btn').hidden=true;
			card.card.querySelector('.delete-btn').hidden=true;
		}
		const cardActions=card.card.querySelector('.card-actions');
		const hasVisibleAction=Array.from(cardActions.querySelectorAll('button'))
			.some(button => !button.hidden);
		if(hasVisibleAction) {
			card.card.classList.add('has-actions');
			card.card.addEventListener('click',function() {
				card.card.classList.toggle('show-actions');
			});
			cardActions.addEventListener('click',event => event.stopPropagation());
		} else {
			card.card.classList.add('no-actions');
			cardActions.hidden=true;
		}

		card.card.classList.add(
			config.item(row).toLowerCase().replaceAll(" ","-")
		);

		card.card.classList.add('ledger-'+config.kind);
        // Processes each entry in the collection.
		config.field.forEach(field => {
			const box=createCardValues(
				field.label,
				field.value(row),
				field.unit? field.unit(row):undefined
			);
			if(field.className) box.classList.add(field.className);
            const style=field.label==='Opening Stock'?'opening':field.label==='Received'?'received':field.label==='Issued'?'issued':field.label==='Closing Stock'?'closing':field.label==='Total'?'total':null;
            if(style&&config.kind==='stock'){box.classList.add('metric-'+style);box.firstChild.prepend(AppUI.icon(style==='received'?'down':style==='issued'?'up':style==='opening'?'cubes':style==='closing'?'cubes':'tag'));}
            if(field.label==='Closing Stock'&&Number(row.closing_stock)<0)box.classList.add('metric-negative');
			card.body.appendChild(box);
		});
        if(config.kind==='stock'&&Number(row.closing_stock)<0){
            card.card.classList.add('negative-balance');
            const warning=document.createElement('p');warning.className='stock-balance-warning';
            warning.append(AppUI.icon('alert'),document.createTextNode('Negative closing balance — review stock records.'));
            card.body.after(warning);
        }
        if(config.decorate) config.decorate(card,row);
        if(config.kind==='production')card.card.querySelector('.edit-btn').textContent='Edit hours';
        if(window.styleReferenceRecordCard)window.styleReferenceRecordCard(card,row,config.kind,index);
		htmlDataList.appendChild(card.card);

		const editBtn=card.card.querySelector(".edit-btn");
        if(config.kind==='stock'&&(row.source_type!=='Manual'||row.source_id!=null)) {
            editBtn.hidden=true;
            card.card.querySelector('.delete-btn').hidden=true;
        }
		// Handles click events from editBtn.
		editBtn.addEventListener("click",() => {
			// Some records are edited in their own dialog, such as rent paid for several months.
			if(config.openEdit&&config.openEdit(row)) return;
			sessionStorage.setItem("editRecord",JSON.stringify(row));
			sessionStorage.setItem("editKind",config.kind);
			sessionStorage.setItem(
				"checksReturnUrl",
				window.location.pathname+
				window.location.search+
				window.location.hash
			);
			window.location.href="/forms.html?mode=edit#"+config.formId;
		});

		const deleteBtn=card.card.querySelector(".delete-btn");
		// Handles click events from deleteBtn.
		deleteBtn.addEventListener("click",async function() {
			const confirmed=window.confirm(
				"Are you sure you want to delete this record"
			);
			if(!confirmed) {
				return;
			}
			const response=await fetch("/api/correction_delete",{
				method: "DELETE",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					kind: config.kind,
					record: row
				})
			});
			if(!response.ok) {
				const problem=await response.json();
				appNotify(problem.err);
				return;
			}
			appNotify("Record was deleted successfully");
			card.card.remove();
		});
			const detailsBtn=card.card.querySelector('.details-btn');
			if(config.openDetails) {
				detailsBtn.addEventListener('click',function(event) {
					event.stopPropagation();
					config.openDetails(row);
				});
			}
	});
	loadMoreBtn.hidden=visibleRecord>=list.length;
}

// Connects a load-more button to reveal additional records.
function loadMore(list,config,htmlDataList,visibleRecord,loadMoreBtn) {
	// Handles click events from loadMoreBtn.
	loadMoreBtn.addEventListener("click",() => {
		visibleRecord+=10;
		displayCards(list,config,htmlDataList,visibleRecord,loadMoreBtn);
	});
}

// Filters records to the selected date range.
function filterDate(record,config,dateFrom,dateTo) {
    const from=dateFrom.value,to=dateTo.value;
    return record.filter(row=>(!from||config.date(row)>=from)&&(!to||config.date(row)<=to));
}

// Sorts records according to the selected date order.
function sortNewest(record,config,htmlSelect) {
	let sorted;
	if(htmlSelect.value==="newest") {
		// Orders collection entries using the comparison callback.
		sorted=[...record].sort((a,b) => {
			return new Date(config.date(b))-new Date(config.date(a));
		});
	} else {
		// Orders collection entries using the comparison callback.
		sorted=[...record].sort((a,b) => {
			return new Date(config.date(a))-new Date(config.date(b));
		});
	}
	return sorted;
}

// Filters records by the selected item.
function filterByItems(record,config,filterElement) {
	const selectedItem=
		filterElement.options[filterElement.selectedIndex].textContent;
	let filteredList;
	if(filterElement.value===""||selectedItem==="All Items") {
		filteredList=record;
	} else {
		// Keeps collection entries that match the current condition.
		filteredList=record.filter(item => {
			return config.item(item)===selectedItem;
		});
	}
	return filteredList;
}

// Builds and displays sales card using the supplied data.
async function renderSalesCard(salesList) {
	const salesConfig={
		kind: "sales",
		formId: "sales-form",
		openDetails: openSaleDocument,
        decorate:(card,row)=>{
            if(!row.has_delivery_note)return;
            const button=document.createElement('button');button.type='button';button.textContent='Delivery Note';
            button.onclick=event=>{event.stopPropagation();window.openDeliveryNote(row.sales_id);};card.card.querySelector('.card-actions').appendChild(button);
            const status=document.createElement('p');status.textContent='Payment by '+(row.billing_basis==='Customer'?'customer’s agreed weight':'factory weight')+(row.invoice_number?'':' · Invoice pending');card.body.after(status);
            // Customer-weight sales also show what left the factory, inside the same quantity box.
            if(row.billing_basis==='Customer'){
                const factory=document.createElement('p');factory.className='ref-factory-weight';
                factory.textContent='Factory weight: '+formatNumber(row.factory_quantity??row.quantity)+' kg';
                card.body.children[1].appendChild(factory);
            }
        },
		// Returns the record identifier used by the card.
		id: row => row.sales_id,
		// Returns the record date used for display and filtering.
		date: row => row.sales_date,
		// Returns the record creation timestamp.
		createdAt: row => row.created_at,
		// Returns the record item name.
		item: row => row.name,
		field: [
			{
				label: "Customer",
				// Derives the displayed field value from the current record.
				value: row => row.customer
			},
			{
					label: "Quantity",
				// Shows the weight the customer is charged for, so quantity × unit price = total.
				value: row => row.billing_basis==='Customer'&&!row.invoice_number?"Pending":formatNumber(row.billing_basis==='Customer'?row.quantity:row.factory_quantity??row.quantity),
				// Returns the unit displayed beside the current value.
				unit: row => row.billing_basis==='Customer'&&!row.invoice_number?"":"kg"
			},
			{
				label: "Unit Price",
				// Derives the displayed field value from the current record.
				value: row => "₦"+formatNumber(row.unit_price),
				// Returns the unit displayed beside the current value.
				unit: () => "/kg"
			},
			{
				label: "Total",
				// Derives the displayed field value from the current record.
				value: row => row.invoice_number?"₦"+formatNumber(row.total):"Awaiting weight"
			},
			{
				label: "Scale Ticket",
				value: row => row.scale_ticket||"Not provided",
				className: "transaction-ticket"
			}
		]
	};

	const htmlDataList=document.querySelector("#sales-data-list");
	const salesFilter=document.querySelector("#sales-item-filter");
	const dateFrom=document.querySelector("#sales-date-from");
	const dateTo=document.querySelector("#sales-date-to");
	const salesSort=document.querySelector("#sales-sort");
	const loadMoreBtn=document.querySelector("#sales-load-more");
	let visibleRecord=10;

	if(salesFilter.options.length===1) {
		await loadSalesDropdown(salesFilter);
	}

	let currentList=sortNewest(salesList,salesConfig,salesSort);

	// Builds and displays current sales list using the supplied data.
	function renderCurrentSalesList() {
		displayCards(
			currentList,
			salesConfig,
			htmlDataList,
			visibleRecord,
			loadMoreBtn
		);
	}

	// Handles the apply sales filters operation.
	function applySalesFilters() {
		visibleRecord=10;
		currentList=filterByItems(salesList,salesConfig,salesFilter);
		currentList=filterDate(currentList,salesConfig,dateFrom,dateTo);
		currentList=sortNewest(currentList,salesConfig,salesSort);
		renderCurrentSalesList();
	}

	renderCurrentSalesList();

	// Handles click events from loadMoreBtn.
	loadMoreBtn.addEventListener("click",() => {
		visibleRecord+=10;
		renderCurrentSalesList();
	});

	salesFilter.addEventListener("change",applySalesFilters);
	dateFrom.addEventListener("change",applySalesFilters);
	dateTo.addEventListener("change",applySalesFilters);

	// Handles change events from salesSort.
	salesSort.addEventListener("change",() => {
		visibleRecord=10;
		currentList=sortNewest(currentList,salesConfig,salesSort);
		renderCurrentSalesList();
	});
}

// Builds and displays expenses card using the supplied data.
function renderExpensesCard(expensesList) {
	const expensesConfig={
		kind: "expenses",
		formId: "expenses-form",
        // A payment spread over several months says so under the card, with its start-up months.
        decorate:(card,row)=>{
            const months=Number(row.spread_months)||1,startup=Number(row.startup_months)||0;
            if(months===1&&!startup)return;
            const note=document.createElement('p');note.className='expense-spread-note';
            note.textContent=months>1?'Spread over '+months+' months: ₦'+formatNumber(Number(row.amount_spent)/months)+' a month'+(startup?', first '+startup+' as start-up costs':''):'Start-up cost (before production)';
            card.body.after(note);
        },
        // Rent paid for several months and start-up costs are edited in their own dialogs, so their months can be changed too.
        openEdit:row=>{
            if(Number(row.spread_months)>1&&!Number(row.startup_months)&&window.openPrepaidDialog){window.openPrepaidDialog(row);return true;}
            // Start-up costs open the start-up dialog, so their months before production can be changed too.
            if(Number(row.startup_months)>0&&window.openStartupDialog){window.openStartupDialog(row);return true;}
            return false;
        },
		// Returns the record identifier used by the card.
		id: row => row.expense_id,
		// Returns the record date used for display and filtering.
		date: row => row.expense_date,
		// Returns the record creation timestamp.
		createdAt: row => row.created_at,
		// Returns the record item name.
		item: row => row.category,
		field: [
			{
				label: "Description",
				// Derives the displayed field value from the current record.
				value: row => row.description
			},
			{
				label: "Amount Spent",
				// Derives the displayed field value from the current record.
				value: row => "₦"+formatNumber(row.amount_spent)
			}
		]
	};

	const htmlDataList=document.querySelector("#expenses-data-list");
	const expensesFilter=document.querySelector("#expenses-category-filter");
	const dateFrom=document.querySelector("#expenses-date-from");
	const dateTo=document.querySelector("#expenses-date-to");
	const expensesSort=document.querySelector("#expenses-sort");
	const loadMoreBtn=document.querySelector("#expenses-load-more");
	let visibleRecord=10;
	let currentList=sortNewest(expensesList,expensesConfig,expensesSort);

	// Builds and displays current expenses list using the supplied data.
	function renderCurrentExpensesList() {
		displayCards(
			currentList,
			expensesConfig,
			htmlDataList,
			visibleRecord,
			loadMoreBtn
		);
	}

	// Handles the apply expenses filters operation.
	function applyExpensesFilters() {
		visibleRecord=10;
		currentList=filterByItems(
			expensesList,
			expensesConfig,
			expensesFilter
		);
		currentList=filterDate(currentList,expensesConfig,dateFrom,dateTo);
		currentList=sortNewest(currentList,expensesConfig,expensesSort);
		renderCurrentExpensesList();
	}

	renderCurrentExpensesList();

	// Handles click events from loadMoreBtn.
	loadMoreBtn.addEventListener("click",() => {
		visibleRecord+=10;
		renderCurrentExpensesList();
	});

	expensesFilter.addEventListener("change",applyExpensesFilters);
	dateFrom.addEventListener("change",applyExpensesFilters);
	dateTo.addEventListener("change",applyExpensesFilters);

	// Handles change events from expensesSort.
	expensesSort.addEventListener("change",() => {
		visibleRecord=10;
		currentList=sortNewest(currentList,expensesConfig,expensesSort);
		renderCurrentExpensesList();
	});
}

// Builds and displays inventory card using the supplied data.
async function renderInventoryCard(inventoryList) {
    const table=document.querySelector('#inventory-data-body');
    if(table){
        table.replaceChildren();
        inventoryList.forEach(row=>{
            const tr=document.createElement('tr');
            [formatDate(row.count_date),row.name,...['opening_stock','received','issued','closing_stock'].map(key=>formatNumber(row[key]))].forEach(value=>{
                const td=document.createElement('td');td.textContent=value;tr.appendChild(td);
            });table.appendChild(tr);
        });
    }

	const loadMoreBtn=document.querySelector("#inventory-load-more");
	let visibleRecord=10;

	let currentList=inventoryList;

	const inventoryFilter=document.querySelector("#inventory-item-filter");

	const htmlDataList=document.querySelector("#inventory-data-list");

	const dateFrom=document.querySelector("#inventory-date-from");

	const dateTo=document.querySelector("#inventory-date-to");

	const inventorySort=document.querySelector("#inventory-sort");

	const inventoryConfig={
		kind: "stock",
		readonly: true,
		formId: "inventory-form",
		// Returns the record date used for display and filtering.
		date: row => row.count_date,
		// Returns the record creation timestamp.
		createdAt: row => row.created_at,
		// Returns the record identifier used by the card.
		id: row => row.summary_id,
		// Returns the record item name.
		item: row => row.name,
		field: [
			{
				label: "Opening Stock",
				// Derives the displayed field value from the current record.
				value: row => formatNumber(row.opening_stock),
				// Returns the unit displayed beside the current value.
				unit: row => inventoryUnit(row.name)
			},
			{
				label: "Received",
				// Derives the displayed field value from the current record.
				value: row => formatNumber(row.received),
				// Returns the unit displayed beside the current value.
				unit: row => inventoryUnit(row.name)
			},
			{
				label: "Issued",
				// Derives the displayed field value from the current record.
				value: row => formatNumber(row.issued),
				// Returns the unit displayed beside the current value.
				unit: row => inventoryUnit(row.name)
			},
			{
				label: "Closing Stock",
				// Derives the displayed field value from the current record.
				value: row => formatNumber(row.closing_stock),
				// Returns the unit displayed beside the current value.
				unit: row => inventoryUnit(row.name)
			}
		]
	};
	displayCards(
		currentList,
		inventoryConfig,
		htmlDataList,
		visibleRecord,
		loadMoreBtn
	);

	if(inventoryFilter.options.length===1) {
		await loadInventoryDropdown(inventoryFilter);
	}

	// Handles click events from loadMoreBtn.
	loadMoreBtn.addEventListener("click",() => {
		visibleRecord+=10;

		displayCards(
			currentList,
			inventoryConfig,
			htmlDataList,
			visibleRecord,
			loadMoreBtn
		);
	});

	// Handles change events from inventoryFilter.
	inventoryFilter.addEventListener("change",() => {
		visibleRecord=10;
		currentList=filterByItems(
			inventoryList,
			inventoryConfig,
			inventoryFilter
		);

		currentList=filterDate(
			currentList,
			inventoryConfig,
			dateFrom,
			dateTo
		);

		displayCards(
			currentList,
			inventoryConfig,
			htmlDataList,
			visibleRecord,
			loadMoreBtn
		);
	});

	// Handles change events from dateFrom.
	dateFrom.addEventListener("change",() => {
		visibleRecord=10;

		currentList=filterByItems(
			inventoryList,
			inventoryConfig,
			inventoryFilter
		);

		currentList=filterDate(
			currentList,
			inventoryConfig,
			dateFrom,
			dateTo
		);

		displayCards(
			currentList,
			inventoryConfig,
			htmlDataList,
			visibleRecord,
			loadMoreBtn
		);
	});

	// Handles change events from dateTo.
	dateTo.addEventListener("change",() => {
		visibleRecord=10;

		currentList=filterByItems(
			inventoryList,
			inventoryConfig,
			inventoryFilter
		);

		currentList=filterDate(
			currentList,
			inventoryConfig,
			dateFrom,
			dateTo
		);

		displayCards(
			currentList,
			inventoryConfig,
			htmlDataList,
			visibleRecord,
			loadMoreBtn
		);
	});

	// Handles change events from inventorySort.
	inventorySort.addEventListener("change",() => {
		visibleRecord=10;

		currentList=sortNewest(currentList,inventoryConfig,inventorySort);

		displayCards(
			currentList,
			inventoryConfig,
			htmlDataList,
			visibleRecord,
			loadMoreBtn
		);
	});
}

// Builds and displays purchases card using the supplied data.
async function renderPurchasesCard(purchasesList) {
	const htmlDataList=document.querySelector("#purchases-data-list");
	const loadMoreBtn=document.querySelector("#purchases-load-more");
	const purchasesFilter=document.querySelector("#purchases-item-filter");
	const dateFrom=document.querySelector("#purchases-date-from");
	const dateTo=document.querySelector("#purchases-date-to");
	const purchasesSelect=document.querySelector("#purchases-sort");
	let visibleRecord=10;

	const purchasesConfig={
        decorate: window.decorateKernelPurchase,
		kind: "purchases",
		formId: "purchases-form",
		// Returns the record date used for display and filtering.
		date: row => row.purchase_date,
		// Returns the record creation timestamp.
		createdAt: row => row.created_at,
		// Returns the record item name.
		item: row => row.name,
		// Returns the record identifier used by the card.
		id: row => row.purchase_id,
		field: [
			{
				label: "Supplier",
				// Derives the displayed field value from the current record.
				value: row => row.supplier
			},
			{
				label: "Qty Supplied",
				// Derives the displayed field value from the current record.
				value: row => formatNumber(row.quantity_supplied),
				// Returns the unit displayed beside the current value.
				unit: row => inventoryUnit(row.name)
			},
			{
				label: "Unit Cost",
				// Derives the displayed field value from the current record.
				value: row => "₦"+formatNumber(row.unit_cost),
				// Returns the unit displayed beside the current value.
				unit: row => "/"+inventoryUnit(row.name)
			},
			{
				label: "Total",
				// Derives the displayed field value from the current record.
				value: row => "₦"+formatNumber(row.total_cost)
			},
			{
				label: "Scale Ticket",
				value: row => row.scale_ticket||"Not provided",
				className: "transaction-ticket"
			}
		]
	};

	if(purchasesFilter.options.length===1) {
		await loadPurchasesDropdown(purchasesFilter);
	}

	let currentList=sortNewest(
		purchasesList,
		purchasesConfig,
		purchasesSelect
	);

	// Builds and displays current purchases list using the supplied data.
	function renderCurrentPurchasesList() {
		displayCards(
			currentList,
			purchasesConfig,
			htmlDataList,
			visibleRecord,
			loadMoreBtn
		);
	}

	// Handles the apply purchases filters operation.
	function applyPurchasesFilters() {
		visibleRecord=10;
		currentList=filterByItems(
			purchasesList,
			purchasesConfig,
			purchasesFilter
		);
		currentList=filterDate(
			currentList,
			purchasesConfig,
			dateFrom,
			dateTo
		);
		currentList=sortNewest(
			currentList,
			purchasesConfig,
			purchasesSelect
		);
		renderCurrentPurchasesList();
	}

	renderCurrentPurchasesList();

	// Handles click events from loadMoreBtn.
	loadMoreBtn.addEventListener("click",() => {
		visibleRecord+=10;
		renderCurrentPurchasesList();
	});

	purchasesFilter.addEventListener("change",applyPurchasesFilters);
	dateFrom.addEventListener("change",applyPurchasesFilters);
	dateTo.addEventListener("change",applyPurchasesFilters);

	// Handles change events from purchasesSelect.
	purchasesSelect.addEventListener("change",() => {
		visibleRecord=10;
		currentList=sortNewest(currentList,purchasesConfig,purchasesSelect);
		renderCurrentPurchasesList();
	});
}

// Builds and displays purchases table using the supplied data.
function renderPurchasesTable(purchasesList) {
	const purchasesDataBody=document.querySelector("#purchases-data-body");
	purchasesDataBody.innerHTML="";
	// Processes each entry in the collection.
	purchasesList.forEach(purchase => {
		const row=document.createElement("tr");
		const submittedAt=formatSubmitted(purchase.created_at);
		const displayDate=formatDate(purchase.purchase_date);

		const cells=[
			displayDate,
			purchase.supplier,
			purchase.name,
			purchase.quantity_supplied,
			purchase.unit_cost,
			purchase.total_cost,
			submittedAt
		];

		// Processes each entry in the collection.
		cells.forEach(value => {
			const td=document.createElement("td");
			td.textContent=value;
			row.appendChild(td);
		});
		purchasesDataBody.appendChild(row);
	});
}

// Builds and displays production card using the supplied data.
function renderProductionCard(productionList) {
	const productionConfig={
		kind: "production",
		formId: "production-form",
		// Returns the record identifier used by the card.
		id: row => row.production_id,
		// Returns the record date used for display and filtering.
		date: row => row.production_date,
		// Returns the record creation timestamp.
		createdAt: row => row.created_at,
		// Returns the record item name.
		item: () => "Production output",
        decorate: (card,row)=>{
            card.card.classList.add('production-day-card','production-record');
            card.header.classList.add('production-day-header');
            const title=document.createElement('div');title.className='production-day-title';
            const text=document.createElement('span');const label=document.createElement('small');label.textContent='Daily production';
            const date=document.createElement('strong');date.textContent=formatDate(row.production_date);text.append(label,date);
            title.append(AppUI.icon('production'),text);card.header.replaceChildren(title);
            const meta=document.createElement('div');meta.className='production-operating';
            meta.textContent=(row.production_hours||0)+' operating hours · '+(row.down_time||0)+' hours downtime';
            const yieldNote=document.createElement('p');yieldNote.className='production-yield-status';
            yieldNote.textContent='Oil yield: '+(row.pko_yield===null?'—':formatNumber(row.pko_yield)+'%')+' · '+row.yield_status;meta.appendChild(yieldNote);
            const history=createProductionHistory(row.batches||[],row.request_id?row:null,loadProductionData);
            if(document.documentElement.dataset.userRole==='admin') {
                const note=document.createElement('p');
                note.textContent=row.request_id?'Daily quantities are calculated from the entries below. Choose an exact entry to correct a quantity.':'This older record has no linked authorisation. Its original stock entries must be linked before quantities can be corrected.';
                history.appendChild(note);
                if(row.request_id&&row.status==='Completed') {
                    const reopen=document.createElement('button');reopen.type='button';reopen.textContent='Reopen day to correct entries';
                    reopen.onclick=async()=>{
                        if(!confirm('Reopen this production day to correct its entries?'))return;
                        reopen.disabled=true;
                        try {
                            const response=await fetch('/api/weighing-requests/'+row.request_id+'/reopen',{method:'PATCH'});
                            const result=await response.json();
                            if(response.ok)await loadProductionData();
                            appNotify(result.message||result.err);
                        } catch(error){appNotify('Could not reopen production.');}
                        finally{reopen.disabled=false;}
                    };history.appendChild(reopen);
                }
            }
            card.body.after(createProductionLossNote(row,row.yield_status==='Final'),meta,history);
        },
		field: [
			{
				label: "Kernel Used",
				// Derives the displayed field value from the current record.
				value: row => formatNumber(row.kernel_used),
				// Returns the unit displayed beside the current value.
				unit: () => "kg",
				className: "production-quantity"
			},
			{
				label: "PKO Produced",
				value: row => formatNumber(row.pko_produced),
				unit: () => "kg",
				className: "production-quantity"
			},
			{
				label: "PKC Produced",
				// Derives the displayed field value from the current record.
				value: row => formatNumber(row.pkc_produced),
				// Returns the unit displayed beside the current value.
				unit: () => "kg",
				className: "production-quantity"
			},
			{
				label: "Sludge Produced",
				value: row => formatNumber(row.sludge_produced),
				unit: () => "kg",
				className: "production-quantity"
			}
		]
	};

	const htmlDataList=document.querySelector("#production-data-list");
	const dateFrom=document.querySelector("#production-date-from");
	const dateTo=document.querySelector("#production-date-to");
	const productionSort=document.querySelector("#production-sort");
	const loadMoreBtn=document.querySelector("#production-load-more");
	let visibleRecord=10;
	let currentList=sortNewest(
		productionList,
		productionConfig,
		productionSort
	);

	// Builds and displays current production list using the supplied data.
	function renderCurrentProductionList() {
		displayCards(
			currentList,
			productionConfig,
			htmlDataList,
			visibleRecord,
			loadMoreBtn
		);
	}

	// Handles the apply production date filter operation.
	function applyProductionDateFilter() {
		visibleRecord=10;
		currentList=filterDate(
			productionList,
			productionConfig,
			dateFrom,
			dateTo
		);
		currentList=sortNewest(currentList,productionConfig,productionSort);
		renderCurrentProductionList();
	}

	applyProductionDateFilter();

	// Handles click events from loadMoreBtn.
	loadMoreBtn.onclick=() => {
		visibleRecord+=10;
		renderCurrentProductionList();
	};

	dateFrom.onchange=applyProductionDateFilter;
	dateTo.onchange=applyProductionDateFilter;

	// Handles change events from productionSort.
	productionSort.onchange=() => {
		visibleRecord=10;
		currentList=sortNewest(currentList,productionConfig,productionSort);
		renderCurrentProductionList();
	};
}

// Fetches inventory data and displays the results in the relevant interface.
async function loadInventoryData() {
	const response=await fetch("/api/inventory-summary");
	if(response.status===500) {
		const problem=await response.json();
		appNotify(problem.err);
		return;
	}
	if(!response.ok) {
		appNotify("Request failed"+" "+response.statusText);
		return;
	}
	const inventoryList=await response.json();

	await renderInventoryCard(inventoryList);
}

// Fetches purchases data and displays the results in the relevant interface.
async function loadPurchasesData() {
	const response=await fetch("/api/purchases");
	if(response.status===500) {
		const problem=await response.json();
		appNotify(problem.err);
		return;
	}
	if(!response.ok) {
		appNotify("Request failed"+" "+response.statusText);
		return;
	}
	const purchasesList=await response.json();
	await renderPurchasesCard(purchasesList);
	renderPurchasesTable(purchasesList);
}

// Fetches production data and displays the results in the relevant interface.
async function loadProductionData() {
	const response=await fetch("/api/production");
	if(response.status===500) {
		const problem=await response.json();
		appNotify(problem.err);
		return;
	}
	if(!response.ok) {
		appNotify("Request failed"+" "+response.statusText);
		return;
	}
	const productionList=await response.json();

	await renderProductionCard(productionList);
	renderProductionTable(productionList);
}

// Fetches purchases data and displays the results in the relevant interface.
async function loadPurchasesData() {
	const response=await fetch("/api/purchases");
	if(response.status===500) {
		const problem=await response.json();
		appNotify(problem.err);
		return;
	}
	if(!response.ok) {
		appNotify("Request failed"+" "+response.statusText);
		return;
	}
	const purchasesList=await response.json();
	await renderPurchasesCard(purchasesList);
	renderPurchasesTable(purchasesList);
}

// Builds and displays production table using the supplied data.
async function renderProductionTable() {
	try {
		const productionDataBody=document.querySelector(
			"#production-data-body"
		);
		const response=await fetch("/api/production");
		if(response.status===500) {
			const problem=await response.json();
			appNotify(problem.err);
			return;
		}
		if(!response.ok) {
			appNotify("Request failed"+" "+response.statusText);
			return;
		}
		const productionList=await response.json();
		productionDataBody.innerHTML="";
		// Processes each entry in the collection.
		productionList.forEach(production => {
			const row=document.createElement("tr");
			const submittedAt=new Date(production.created_at);
			const formatedDate=submittedAt
				.toLocaleDateString("en-NG",{
					day: "2-digit",
					month: "2-digit",
					year: "2-digit"
				})
				.replace(/\//g,"-");
			const formatedTime=submittedAt.toLocaleTimeString("en-NG",{
				hour: "2-digit",
				minute: "2-digit"
			});
			const dateAndTime=formatedDate+" "+formatedTime;
			const cells=[
				dateAndTime,
				production.kernel_used,
				production.pko_produced,
				production.pkc_produced,
				production.sludge_produced,
				(production.pko_yield??'—')+' · '+production.yield_status,
				(production.pkc_yield??'—')+' · '+production.yield_status,
				production.production_hours,
				production.down_time
			];

			// Processes each entry in the collection.
			cells.forEach(value => {
				const td=document.createElement("td");
				td.textContent=value;
				row.appendChild(td);
			});
			productionDataBody.appendChild(row);
		});
	} catch(error) {
		console.error(error.message);
		appNotify("Something went Wrong"+" "+error.message);
	}
}

// Fetches expenses data and displays the results in the relevant interface.
async function loadExpensesData() {
	try {
		const expensesDataBody=document.querySelector("#expenses-data-body");
		const response=await fetch("/api/expenses");
		if(response.status===500) {
			const problem=await response.json();
			appNotify(problem.err);
			return;
		}
		if(!response.ok) {
			appNotify("Request failed"+" "+response.statusText);
			return;
		}
		const expensesList=await response.json();
		renderExpensesCard(expensesList);
		expensesDataBody.innerHTML="";
		// Processes each entry in the collection.
		expensesList.forEach(expense => {
			const row=document.createElement("tr");
			const submittedAt=new Date(expense.created_at);
			const formatedDate=submittedAt
				.toLocaleDateString("en-NG",{
					day: "2-digit",
					month: "2-digit",
					year: "2-digit"
				})
				.replace(/\//g,"-");
			const formatedTime=submittedAt.toLocaleTimeString("en-NG",{
				hour: "2-digit",
				minute: "2-digit"
			});
			const dateAndTime=formatedDate+" "+formatedTime;
			const cells=[
				dateAndTime,
				expense.category,
				expense.description,
				expense.amount_spent
			];

			// Processes each entry in the collection.
			cells.forEach(value => {
				const td=document.createElement("td");
				td.textContent=value;
				row.appendChild(td);
			});
			expensesDataBody.appendChild(row);
		});
	} catch(error) {
		console.error(error.message);
		appNotify("Something went Wrong"+" "+error.message);
	}
}

// Loads a stored correction record into its matching edit form.
function editForm() {
	const record=JSON.parse(sessionStorage.getItem("editRecord"));
	const kind=sessionStorage.getItem("editKind");
	const isEditMode=new URLSearchParams(window.location.search).get('mode')==='edit';

	if(!isEditMode||!record||!kind) {
		return;
	}

	const formHashes={
		stock: "#inventory-form",
		production: "#production-form",
		sales: "#sales-form",
		purchases: "#purchases-form",
		expenses: "#expenses-form"
	};

	if(window.location.hash!==formHashes[kind]) {
		return;
	}

	if(kind==="stock") {
		stockDate.value=record.count_date.slice(0,10);
		stockName.value=record.item_id;
		updateEntryUnit(stockName,".inventory-entry-unit");
		stockReason.value=record.adjustment_reason||'Other';
		// Older entries may have both boxes filled; they open as their net change.
		const netChange=Math.round((Number(record.received||0)-Number(record.issued||0))*100)/100;
		stockAdd.checked=netChange>0;stockRemove.checked=netChange<=0;
		stockQuantity.value=Math.abs(netChange)||'';
		syncStockDirection();

		inventoryForm.removeEventListener("submit",saveInventory);
		inventoryForm.addEventListener("submit",saveEdit);
		inventoryForm.querySelector('button[type="submit"]').textContent=
			"Save Inventory";
	} else if(kind==="production") {
		kernelUsed.readOnly=true;
        productionDate.readOnly=true;
		oilProduced.readOnly=true;
		pkcProduced.readOnly=true;
		sludgeProduced.readOnly=true;
		productionDate.value=record.production_date.slice(0,10);
		kernelUsed.value=record.kernel_used;
		oilProduced.value=record.pko_produced;
		pkcProduced.value=record.pkc_produced;
		sludgeProduced.value=record.sludge_produced||0;
		productionHours.value=record.production_hours;
		downTime.value=record.down_time;

		productionForm.removeEventListener("submit",saveProduction);
		productionForm.addEventListener("submit",saveEdit);
		productionForm.querySelector('button[type="submit"]').textContent=
			"Save hours";
        const explanation=document.createElement('p');
        explanation.textContent='Daily quantities are read-only. Open Production Data and choose the exact entry to correct its quantity.';
        productionForm.prepend(explanation);
	} else if(kind==="sales") {
		salesQuantity.readOnly=false;
        document.getElementById('sales-ordered-field').hidden=true;salesOrderedQuantity.required=false;
		salesDate.value=record.sales_date.slice(0,10);
		customer.value=record.customer_id;
		productSold.value=record.item_id;
		salesQuantity.value=record.factory_quantity??record.quantity;
        document.querySelector('label[for="sales-quantity"]').textContent='Factory quantity issued (kg)';
        const basis=document.getElementById('sales-billing-basis');basis.value=record.billing_basis||'Factory';basis.disabled=true;
        document.getElementById('sales-representative').closest('.field').hidden=true;
        document.getElementById('sales-representative').disabled=true;
		unitPrice.value=record.unit_price;
        // A sale the driver signed for can still be corrected by the Director, but the reason is recorded on its delivery note.
        const correctionField=document.getElementById('sales-correction-field');
        correctionField.hidden=false;document.getElementById('sales-correction-reason').required=Boolean(record.has_delivery_note);
        const correctionPrice=document.getElementById('sales-correction-price');correctionPrice.value=record.unit_price;correctionPrice.required=true;

		salesForm.removeEventListener("submit",saveSale);
		salesForm.addEventListener("submit",saveEdit);
		salesForm.querySelector('button[type="submit"]').textContent=
			"Save Sales";
	} else if(kind==="purchases") {
		quantitySupplied.readOnly=false;
        document.getElementById('purchase-ordered-field').hidden=true;purchaseOrderedQuantity.required=false;
		purchaseDate.value=record.purchase_date.slice(0,10);
		supplier.value=record.supplier_id;
		materialSupplied.value=record.item_id;
		updateEntryUnit(materialSupplied,".purchase-entry-unit");
		quantitySupplied.value=record.quantity_supplied;
		unitCost.value=record.unit_cost;

		purchaseForm.removeEventListener("submit",savePurchases);
		purchaseForm.addEventListener("submit",saveEdit);
		purchaseForm.querySelector('button[type="submit"]').textContent=
			"Save Purchases";
	} else if(kind==="expenses") {
		expenseDate.value=record.expense_date.slice(0,10);
		expenseCategory.value=record.category;
		expenseDescription.value=record.description;
		expenseAmount.value=record.amount_spent;
		if(expenseEnergyWarning) expenseEnergyWarning.hidden=!looksLikeEnergyExpense();

		expensesForm.removeEventListener("submit",saveExpenses);
		expensesForm.addEventListener("submit",saveEdit);
		expensesForm.querySelector('button[type="submit"]').textContent=
			"Save Expense";
	}
}

// Validates the submitted edit data and sends it to the server for saving.
async function saveEdit(event) {
	event.preventDefault();
	const record=JSON.parse(sessionStorage.getItem("editRecord"));
	const kind=sessionStorage.getItem("editKind");

	let updatedForm;

	if(kind==="stock") {
		updatedForm={
			count_id: record.count_id,
			count_date: stockDate.value,
			item_id: stockName.value,
			...stockChangeValues(),
			adjustment_reason: stockReason.value
		};
	} else if(kind==="production") {
		updatedForm={
			production_id: record.production_id,
			production_hours: productionHours.value,
			down_time: downTime.value
		};
	} else if(kind==="sales") {
		updatedForm={
			sales_id: record.sales_id,
			sales_date: salesDate.value,
			customer_id: customer.value,
			item_id: productSold.value,
			quantity: salesQuantity.value,
			unit_price: document.getElementById('sales-correction-price').value||unitPrice.value,
			correction_reason: document.getElementById('sales-correction-reason').value
		};
	} else if(kind==="purchases") {
		updatedForm={
			purchase_id: record.purchase_id,
			purchase_date: purchaseDate.value,
			supplier_id: supplier.value,
			item_id: materialSupplied.value,
			quantity_supplied: quantitySupplied.value,
			unit_cost: unitCost.value
		};
	} else if(kind==="expenses") {
		updatedForm={
			expense_id: record.expense_id,
			expense_date: expenseDate.value,
			category: expenseCategory.value,
			description: expenseDescription.value,
			amount_spent: expenseAmount.value
		};
	}

	const response=await fetch("/api/correction_edit",{
		method: "PATCH",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			kind: kind,
			record: updatedForm
		})
	});
	if(response.ok) {
		appNotify("Edit saved successfully");
		const checksReturnUrl=
			sessionStorage.getItem("checksReturnUrl")||"checks.html";
		sessionStorage.removeItem("editRecord");
		sessionStorage.removeItem("editKind");
		sessionStorage.removeItem("checksReturnUrl");
		window.location.href=checksReturnUrl;
	} else {
		const problem=await response.json();
		appNotify(problem.err||"Edit could not be saved");
	}
}

// Creates the shared customer, supplier, or employee card structure.
function createPartnersCard(partner,businessLabel,latestBusinessDate,config={}) {

	const card=document.createElement('article');
	const top=document.createElement('div');
	const badge=document.createElement('div');
	const contact=document.createElement('div');
	const name=document.createElement('span');
	const phoneNumber=document.createElement('span');
	const location=document.createElement('span');
	const lastBusinessList=document.createElement('div');
	const lastBusiness=document.createElement('span');
	const lastBusinessDate=document.createElement('strong');
	const body=document.createElement('div');
	const footer=document.createElement('button');
	const details=document.createElement('span');
	const arrow=document.createElement('span');

	const photoUrl=config.photoUrl? config.photoUrl(partner):null;
	if(photoUrl) {
		const photo=document.createElement('img');
		photo.src=photoUrl;
		photo.alt=partner.name+' passport photograph';
		// Restores the avatar when a stored photograph cannot be loaded.
		photo.addEventListener('error',function() {
			badge.replaceChildren(config.badge||'🏪');
		});
		badge.appendChild(photo);
	} else {
		badge.textContent=config.badge||'🏪';
	}
	name.textContent=partner.name;
	phoneNumber.textContent=config.secondary? config.secondary(partner):partner.phone_number;
	location.textContent=config.tertiary? config.tertiary(partner):partner.address;
	lastBusiness.textContent=businessLabel;
	lastBusinessDate.textContent=config.formatLastBusiness===false?
		latestBusinessDate:
		(latestBusinessDate? formatDate(latestBusinessDate):'No Transaction');
	details.textContent='View Details';
	arrow.textContent='>';

	footer.append(details,arrow);
	lastBusinessList.append(lastBusiness,lastBusinessDate);
	contact.append(name,phoneNumber,location);

	top.append(badge,contact,lastBusinessList);


	card.append(top,body,footer);


	return {
		card: card,
		body: body,
		footer: footer
	}
}

// Displays customer, supplier, or employee records using the fields and detail behavior supplied by the card configuration.
function displayPartners(partnersList,config,allCards) {
	allCards.replaceChildren();
	// Processes each entry in the collection.
	partnersList.forEach((partner,index) => {
		const card=createPartnersCard(partner,config.lastBusiness,config.lastBusinessDate(partner),config);
		if(config.cardClass) {
			card.card.classList.add(config.cardClass);
		}
		// Processes each entry in the collection.
		config.fields.forEach((field) => {
			const box=createCardValues(field.label,field.value(partner));
			card.body.append(box);

		});

		if(window.styleReferencePartner)window.styleReferencePartner(card,partner,config,index);
		// Handles click events from card.footer.
		card.footer.addEventListener('click',async function() {
				if(config.openDetailsPage) {
					config.openDetailsPage(partner);
					return;
				}
			const existingDetails=card.card.querySelector(config.detailsClass);
			if(existingDetails) {
				existingDetails.remove();
                card.footer.firstElementChild.textContent='View Details';card.footer.setAttribute('aria-expanded','false');
				return;
			}
			if(config.renderDetails) {
				config.renderDetails(partner,card.card);
				return;
			}
			const response=await fetch(config.detailsUrl(partner));
			const history=await response.json();
			renderTransactionHistory(partner,config,history,card.card);
            card.footer.firstElementChild.textContent='Hide Details';card.footer.setAttribute('aria-expanded','true');
		});
		allCards.appendChild(card.card);
	});
}

// Builds and displays customers cards using the supplied data.
function renderCustomersCards(customersList) {

	const allCards=document.querySelector('.customer-cards');
	const addCustomer=document.querySelector('#add-customer');
	const customerSearch=document.querySelector('#customer-search');
	const sortCustomers=document.querySelector('#sort-customers');
	const customerConfig=
	{
		kind: 'customer',
		transaction: 'purchase',
		lastBusiness: 'Last Purchase',
		// Returns the partner’s most recent transaction date.
		lastBusinessDate: row => row.last_purchase_date,
		detailsClass: '.customer-details',
		detailsClassStyle: 'customer-details',
		historyClass: 'customer-history',
		// Builds the API URL used to load this partner’s history.
		detailsUrl: row => "/api/customers-purchases?customerId="+row.customer_id,
		// Builds the form URL used to edit this partner.
		windowUrl: row => `forms.html?customerId=${row.customer_id}#customer-form`,
		// Returns the record item name.
		item: row => row.item,
		// Returns the transaction quantity.
		quantity: row => row.quantity,
		// Returns the record date used for display and filtering.
		date: row => row.purchase_date,
		// Returns the transaction total.
		total: row => row.total,
		// Returns the transaction unit price.
		price: row => row.unit_price,

		fields: [
			{
				label: 'Total Purchases',
				// Derives the displayed field value from the current record.
				value: row => '₦'+formatNumber(row.total_purchases)
			},
			{
				label: 'No. Of Purchases',
				// Derives the displayed field value from the current record.
				value: row => row.number_of_purchases
			},
			{
				label: 'Main Item',
				// Derives the displayed field value from the current record.
				value: row => row.main_item
			},
			{
				label: 'Last Purchase Qty',
				// Derives the displayed field value from the current record.
				value: row => formatNumber(row.last_purchase_qty)+'kg'
			}
		]
	}


    function drawCustomers(){
        const query=customerSearch.value.toLowerCase().trim();
        let rows=customersList.filter(row=>[row.name,row.phone_number,'c'+row.customer_id,String(row.customer_id)].some(value=>String(value||'').toLowerCase().includes(query)));
        const mode=sortCustomers.selectedIndex;
        rows.sort((a,b)=>mode===3?Number(b.total_purchases)-Number(a.total_purchases):mode===1?Number(a.customer_id)-Number(b.customer_id):mode===2?Number(b.customer_id)-Number(a.customer_id):a.name.localeCompare(b.name));
        displayPartners(rows,customerConfig,allCards);
    }
    customerSearch.oninput=drawCustomers;sortCustomers.onchange=drawCustomers;drawCustomers();

}

const customerName=customerForm.querySelector('#customer-name');
const customerPhone=customerForm.querySelector('#customer-phone');
const customerAddress=customerForm.querySelector('#customer-address');
const customerEmail=customerForm.querySelector('#customer-email');
const customerNote=customerForm.querySelector('#customer-note');

const supplierName=supplierForm.querySelector('#supplier-name');
const supplierPhone=supplierForm.querySelector('#supplier-phone');
const supplierAddress=supplierForm.querySelector('#supplier-address');
const supplierEmail=supplierForm.querySelector('#supplier-email');
const supplierNote=supplierForm.querySelector('#supplier-note');


// Validates the submitted customer data and sends it to the server for saving.
async function saveCustomer(event) {
	event.preventDefault();

	try {


		const customerDetails={
			name: customerName.value,
			phone: customerPhone.value,
			address: customerAddress.value,
			email: customerEmail.value,
			note: customerNote.value
		}

		const response=await fetch('api/customers',{
			method: 'POST',
			headers: {
				'content-type': 'application/json'
			},
			body: JSON.stringify(customerDetails)
		});

		if(!response.ok) {
			const problem=await response.json();
			appNotify(problem.err);
		}
		appNotify('customer details saved successfully');
		history.back();
		customerForm.reset();
	} catch(error) {
		console.log(error);
	}
}

// Validates the submitted supplier data and sends it to the server for saving.
async function saveSupplier(event) {
	event.preventDefault();
	try {
		const supplier={
			name: supplierName.value,
			phone: supplierPhone.value,
			address: supplierAddress.value,
			email: supplierEmail.value,
			note: supplierNote.value
		}
		const response=await fetch('/api/suppliers',{
			method: 'POST',
			headers: {
				'content-type': 'application/json'
			},
			body: JSON.stringify(supplier)
		});
		if(!response.ok) {
			const problem=await response.json();
			appNotify(problem.err);
			return;
		}
		appNotify('Supplier saved');
		supplierForm.reset();
		window.location.replace('forms.html#suppliers');

	} catch(error) {
		console.error(error);
		appNotify('Could not save supplier. Please try again.');
	}
}

// Uploads the employee form fields and optional passport photograph to the server.
async function saveEmployee(event) {
	event.preventDefault();
	try {
		const employeeDetails=new FormData(employeeForm);
		const response=await fetch('/api/employees',{
			method: 'POST',
			body: employeeDetails
		});
		if(!response.ok) {
			const problem=await response.json();
			appNotify(problem.err||'Could not save employee');
			return;
		}
		appNotify('Employee saved successfully');
		employeeForm.reset();
		window.location.replace('forms.html#employees');
	} catch(error) {
		console.error(error);
		appNotify('Could not save employee. Please try again.');
	}
}

// Handles click events from addCustomer.
addCustomer.addEventListener('click',() => {
	window.location.href='forms.html#customer-addition';
});
// Handles click events from addSupplier.
addSupplier.addEventListener('click',() => {
	window.location.href='forms.html#supplier-addition';
});
// Handles click events from addEmployee.
addEmployee.addEventListener('click',() => {
	window.location.href='forms.html#employee-addition';
})

// Handles the customer form btns operation.
function customerFormBtns() {
	const params=new URLSearchParams(window.location.search);
	const customerId=params.get('customerId');
	if(customerForm) {
		customerForm.addEventListener('submit',customerId? saveCustomerEdit:saveCustomer);
	}
	const cancelBtn=document.querySelector('#cancel-button');
	if(cancelBtn) {
		// Handles click events from cancelBtn.
		cancelBtn.addEventListener('click',() => {
			customerForm.reset();
			window.history.back();
			window.location.reset();
		});
	}
}

// Handles the supplier forms btn operation.
function supplierFormsBtn() {
	const params=new URLSearchParams(window.location.search);
	const supplierId=params.get('supplierId');
	if(!supplierForm) return;
	supplierForm.addEventListener('submit',supplierId? saveSupplierEdit:saveSupplier);
	const cancelBtn=supplierForm.querySelector('#cancel-button');
	if(cancelBtn) {
		// Handles click events from cancelBtn.
		cancelBtn.addEventListener('click',() => {
			supplierForm.reset();
			window.history.back();
		});
	}
}

// Connects the employee form submit and cancel buttons to their handlers.
function employeeFormBtns() {
	if(!employeeForm) return;
	employeeForm.addEventListener('submit',saveEmployee);
	const cancelBtn=employeeForm.querySelector('#cancel-button');
	if(cancelBtn) {
		// Clears the employee form and returns to the previous page.
		cancelBtn.addEventListener('click',() => {
			employeeForm.reset();
			window.history.back();
		});
	}
}

// Saves edited company information and an optional replacement logo.
async function saveCompanyDetails(event) {
	event.preventDefault();
	try {
		const companyDetails=new FormData(companyForm);
		const response=await fetch('/api/company',{
			method: 'PATCH',
			body: companyDetails
		});
		if(!response.ok) {
			const problem=await response.json();
			appNotify(problem.err||'Could not update company details');
			return;
		}
		const company=await response.json();
		populateCompanyForm(company);
		setCompanyEditMode(false);
		appNotify('Company details updated successfully');
	} catch(error) {
		console.error(error);
		appNotify('Could not update company details. Please try again.');
	}
}

// Connects the company edit, cancel, logo preview, removal, and save controls.
function companyFormBtns() {
	if(!companyForm) return;
	companyForm.addEventListener('submit',saveCompanyDetails);
	editCompanyBtn.addEventListener('click',() => {
		setCompanyEditMode(true);
	});
	cancelCompanyEditBtn.addEventListener('click',() => {
		populateCompanyForm(currentCompanyDetails);
		setCompanyEditMode(false);
	});
	companyLogoInput.addEventListener('change',() => {
		const selectedLogo=companyLogoInput.files[0];
		if(!selectedLogo) {
			displayCompanyLogo(currentCompanyDetails.logo_path);
			return;
		}
		removeCompanyLogoValue.value='false';
		displayCompanyLogo(URL.createObjectURL(selectedLogo));
	});
	removeCompanyLogoBtn.addEventListener('click',() => {
		companyLogoInput.value='';
		removeCompanyLogoValue.value='true';
		displayCompanyLogo(null);
	});
	companyLogoPreview.addEventListener('error',() => {
		companyLogoPreview.hidden=true;
		companyLogoFallback.hidden=false;
	});
}

customerFormBtns();
supplierFormsBtn();
employeeFormBtns();
companyFormBtns();

// Builds the expandable note and transaction-history section for a partner.
function renderTransactionHistory(partner,config,history,partnerCard) {
	const editBtn=document.createElement('button');
	const partnerDetails=document.createElement('section');
	const header=document.createElement('div');
	const note=document.createElement('h5');
	const noteContent=document.createElement('p');
	const body=document.createElement('div');
	const partnerHistory=document.createElement('p');
	const transactionCards=document.createElement('div');

	header.classList.add(config.detailsClassStyle+'-note');
	editBtn.classList.add(config.detailsClassStyle+'-edit-btn');
	note.classList.add(config.detailsClassStyle+'-heading');
	noteContent.classList.add(config.detailsClassStyle+'-note-text');
	body.classList.add(config.detailsClassStyle+'-body');
	partnerHistory.classList.add(config.historyClass+'-heading');
	transactionCards.classList.add(config.historyClass+'-list');

	note.textContent=config.kind+' Note';
	noteContent.textContent=partner.note;
	partnerHistory.textContent=config.transaction+' History';
	editBtn.textContent='Edit '+config.kind;
	const canEdit=
		(config.kind==='customer'&&
			document.documentElement.dataset.userRole!=='storekeeper')||
		(config.kind==='supplier'&&
			document.documentElement.dataset.userRole!=='storekeeper');
	editBtn.hidden=!canEdit;

	// Handles click events from editBtn.
	editBtn.addEventListener('click',() => {
		window.location.href=config.windowUrl(partner);

	});


	header.append(editBtn,note,noteContent);
	// Processes each entry in the collection.
	history.forEach((row) => {

		const card=document.createElement('div');
		const date=document.createElement('span');
		const item=document.createElement('span');
		const quantity=document.createElement('span');
		const price=document.createElement('span');
		const total=document.createElement('span');

		card.classList.add(config.historyClass+'-card');
		date.classList.add(config.historyClass+'-date');
		item.classList.add(config.historyClass+'-item');
		quantity.classList.add(config.historyClass+'-quantity');
		price.classList.add(config.historyClass+'-unit-price');
		total.classList.add(config.historyClass+'-total');

		date.textContent=config.date(row);
		item.textContent=config.item(row);
		quantity.textContent=formatNumber(config.quantity(row))+' '+inventoryUnit(config.item(row));
		price.textContent='₦'+formatNumber(config.price(row))+'/'+inventoryUnit(config.item(row));
		total.textContent='₦'+formatNumber(config.total(row));

		card.append(date,item,quantity,price,total);
		transactionCards.appendChild(card);

	});
	body.append(partnerHistory,transactionCards);
	partnerDetails.append(header,body);
	partnerDetails.classList.add(config.detailsClassStyle);
	partnerCard.appendChild(partnerDetails);
    if(window.styleReferencePartnerHistory)window.styleReferencePartnerHistory(partnerDetails,partnerCard,config,history);
}

// Fetches customer details to edit and displays the results in the relevant interface.
function loadCustomerDetailsToEdit() {
	const params=new URLSearchParams(window.location.search);
	const customerId=params.get('customerId');
	if(customerId) {
		editCustomer(customerId);
	}
}


loadCustomerDetailsToEdit();


// Prepares customer for editing.
async function editCustomer(customerId) {
	const response=await fetch('/api/customers/'+customerId);
	const customer=await response.json();

	customerName.value=customer.name;
	customerPhone.value=customer.phone_number;
	customerAddress.value=customer.address;
	customerEmail.value=customer.email;
	customerNote.value=customer.note;
}

// Validates the submitted customer edit data and sends it to the server for saving.
async function saveCustomerEdit(e) {
	e.preventDefault();
	const params=new URLSearchParams(window.location.search);
	const customerId=params.get('customerId');
	const customer={
		name: customerName.value,
		phone: customerPhone.value,
		address: customerAddress.value,
		email: customerEmail.value,
		note: customerNote.value
	}

	const response=await fetch(`/api/customers/${customerId}`,{
		method: 'PATCH',
		headers: {
			'content-type': 'application/json'
		},
		body: JSON.stringify(customer)
	});
	if(!response.ok) {
		const problem=await response.json();
		appNotify(problem.err);
		return;
	}
	const result=await response.json();
	appNotify('Customer updated successfully');
	customerForm.reset();
	window.location.replace('forms.html#customers');
}


// Fetches supplier details to edit and displays the results in the relevant interface.
function loadSupplierDetailsToEdit() {
	const params=new URLSearchParams(window.location.search);
	const supplierId=params.get('supplierId');
	if(supplierId) {
		editSupplier(supplierId);
	}
}


loadSupplierDetailsToEdit();


// Prepares supplier for editing.
async function editSupplier(supplierId) {
	const response=await fetch('/api/suppliers/'+supplierId);
	const supplier=await response.json();

	supplierName.value=supplier.name;
	supplierPhone.value=supplier.phone_number;
	supplierAddress.value=supplier.address;
	supplierEmail.value=supplier.email;
	supplierNote.value=supplier.note;
}

// Validates the submitted supplier edit data and sends it to the server for saving.
async function saveSupplierEdit(e) {
	e.preventDefault();
	const params=new URLSearchParams(window.location.search);
	const supplierId=params.get('supplierId');
	const supplier={
		name: supplierName.value,
		phone: supplierPhone.value,
		address: supplierAddress.value,
		email: supplierEmail.value,
		note: supplierNote.value
	}

	const response=await fetch(`/api/suppliers/${supplierId}`,{
		method: 'PATCH',
		headers: {
			'content-type': 'application/json'
		},
		body: JSON.stringify(supplier)
	});
	if(!response.ok) {
		const problem=await response.json();
		appNotify(problem.err);
		return;
	}
	const result=await response.json();
	appNotify('Supplier updated successfully');
	supplierForm.reset();
	window.location.replace('forms.html#suppliers');
}


// Builds and displays supplier cards using the supplied data.
function renderSupplierCards(suppliersList) {
	const allCards=document.querySelector('.supplier-cards');

	const supplierSearch=document.querySelector('#supplier-search');
	const sortSupplier=document.querySelector('#sort-suppliers');
	const supplierConfig={
		kind: 'supplier',
		transaction: 'supply',
		detailsClassStyle: 'supplier-details',
		historyClass: 'supply-history',
		// Builds the API URL used to load this partner’s history.
		detailsUrl: row => "/api/supplier-supplies?supplierId="+row.supplier_id,
		// Builds the form URL used to edit this partner.
		windowUrl: row => `forms.html?supplierId=${row.supplier_id}#supplier-form`,
		// Returns the record item name.
		item: row => row.item,
		// Returns the transaction quantity.
		quantity: row => row.quantity_supplied,
		// Returns the record date used for display and filtering.
		date: row => row.supply_date,
		// Returns the transaction total.
		total: row => row.total,
		// Returns the transaction unit price.
		price: row => row.unit_cost,
		lastBusiness: 'Last Supply',
		// Returns the partner’s most recent transaction date.
		lastBusinessDate: row => row.last_supply_date,
		detailsClass: '.supplier-details',
		fields: [
			{
				label: 'Total Supplies',
				// Derives the displayed field value from the current record.
				value: row => '₦'+formatNumber(row.total_supplies)

			},
			{
				label: 'No of Supplies',
				// Derives the displayed field value from the current record.
				value: row => row.number_of_supplies
			},
			{
				label: 'Main Item',
				// Derives the displayed field value from the current record.
				value: row => row.main_item
			},
			{
				label: 'Last Supply Qty',
				// Runs the callback required by the surrounding operation.
				value: function(row) {
					if(row.last_supply_item==='Diesel') {
						return formatNumber(row.last_supply_qty)+'L'
					} else if(row.last_supply_item==='Electricity') {
						return formatNumber(row.last_supply_qty)+'kwh'
					} else {
						return formatNumber(row.last_supply_qty)+'kg'
					}
				}
			}
		]
	}


    function drawSuppliers(){
        const query=supplierSearch.value.toLowerCase().trim();
        const rows=suppliersList.filter(row=>[row.name,row.phone_number,'s'+row.supplier_id,String(row.supplier_id)].some(value=>String(value||'').toLowerCase().includes(query)));
        const mode=sortSupplier.selectedIndex;
        rows.sort((a,b)=>mode===3?Number(b.total_supplies)-Number(a.total_supplies):mode===1?Number(a.supplier_id)-Number(b.supplier_id):mode===2?Number(b.supplier_id)-Number(a.supplier_id):a.name.localeCompare(b.name));
        displayPartners(rows,supplierConfig,allCards);
    }
    supplierSearch.oninput=drawSuppliers;sortSupplier.onchange=drawSuppliers;drawSuppliers();

}

// Builds the employee information and system-access sections shown inside an expanded card.
async function renderEmployeeDetails(employee,employeeCard) {
	const details=document.createElement('section');
	const employeeHeading=document.createElement('h5');
	const employeeInformation=document.createElement('div');
	const accessHeading=document.createElement('h5');
	const systemAccess=document.createElement('div');
	const actions=document.createElement('div');
	const editBtn=document.createElement('button');
	const disableBtn=document.createElement('button');
	const salaryHeading=document.createElement('h5');
	const salaryHistory=document.createElement('div');

	details.classList.add('customer-details','employee-details');
	employeeHeading.classList.add('employee-details-heading');
	employeeInformation.classList.add('employee-details-list');
	accessHeading.classList.add('employee-access-heading');
	systemAccess.classList.add('employee-details-list');
	actions.classList.add('employee-details-actions');
	editBtn.classList.add('customer-details-edit-btn');
	disableBtn.classList.add('customer-details-delete-btn');
	salaryHeading.classList.add('employee-access-heading');
	salaryHistory.classList.add('salary-history-list');

	employeeHeading.textContent='Employee Details';
	accessHeading.textContent='System Access';
	editBtn.textContent='Change Salary';
	disableBtn.textContent=employee.status==='Inactive'?'Reactivate Employee':'Mark Inactive';
	salaryHeading.textContent='Salary History';

	const employeeFields=[
		['Address',employee.address],
		['Note',employee.note],
		['Current Salary','₦'+formatNumber(employee.salary||0)]
	];
	const accessFields=[
		['Username',employee.username],
		['Role',employee.role],
		['Permissions',employee.permissions],
		['Account Status',employee.status]
	];

	// Adds each label and value using the same DOM-building pattern as the other cards.
	employeeFields.forEach((field) => {
		const row=createCardValues(field[0],field[1]??'—');
		employeeInformation.appendChild(row);
	});
	// Builds the system-access rows from the employee configuration data.
	accessFields.forEach((field) => {
		const row=createCardValues(field[0],field[1]??'—');
		systemAccess.appendChild(row);
	});

	if(document.documentElement.dataset.userRole==='admin') {
		actions.append(editBtn,disableBtn);
		editBtn.addEventListener('click',function() {
			openSalaryChangeDialog(employee);
		});
		disableBtn.addEventListener('click',async function() {
			const makingInactive=employee.status!=='Inactive';
			let effectiveDate='';
			if(makingInactive) {
				effectiveDate=prompt(
					'Enter the final employment date (YYYY-MM-DD):',
					new Date().toISOString().slice(0,10)
				);
				if(!effectiveDate) return;
			} else {
                effectiveDate=prompt('Enter the return-to-work date (YYYY-MM-DD):',new Date().toISOString().slice(0,10));
                if(!effectiveDate)return;
            }
			const response=await fetch('/api/employees/'+employee.employee_id+'/status',{
				method: 'PATCH',headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					status: makingInactive?'Inactive':'Active',
					effective_date: effectiveDate
				})
			});
			const result=await response.json();
			if(!response.ok) {
				appNotify(result.err);
				return;
			}
			window.location.reload();
		});
	}
	details.append(
		employeeHeading,employeeInformation,accessHeading,systemAccess,
		salaryHeading,salaryHistory,actions
	);
	employeeCard.appendChild(details);
    if(window.styleReferenceEmployeeDetails)window.styleReferenceEmployeeDetails(details);

	try {
		const response=await fetch('/api/employees/'+employee.employee_id+'/salary-history');
		const history=await response.json();
		if(!response.ok) throw new Error(history.err||'Could not load salary history');
		if(history.length===0) {
			salaryHistory.textContent='No salary changes recorded.';
			return;
		}
		history.forEach(function(entry) {
			const row=document.createElement('div');
			const amount=document.createElement('strong');
			const information=document.createElement('span');
			amount.textContent='₦'+formatNumber(entry.new_salary);
			information.textContent=formatDate(entry.effective_date)+' · '+entry.reason;
			row.append(amount,information);
			salaryHistory.appendChild(row);
		});
	} catch(error) {
		salaryHistory.textContent=error.message;
	}
}

// Opens a form that records a salary increase without erasing the previous salary.
function openSalaryChangeDialog(employee) {
	const dialog=document.createElement('dialog');
	dialog.classList.add('employee-finance-dialog');
	dialog.innerHTML=`<form>
		<h2 class="salary-dialog-title"></h2>
		<label>New monthly salary<input name="new_salary" type="number" min="0.01" step="0.01" required></label>
		<label>Effective date<input name="effective_date" type="date" required></label>
		<label>Reason<textarea name="reason" required></textarea></label>
		<p class="finance-dialog-message"></p>
		<div><button type="button" class="finance-cancel">Cancel</button><button type="submit">Save Salary</button></div>
	</form>`;
	// The name is set as text, so characters such as < or & in a name show as typed and never run as page code.
	dialog.querySelector('.salary-dialog-title').textContent='Change '+employee.name+'’s Salary';
	document.body.appendChild(dialog);
	dialog.querySelector('[name="new_salary"]').value=employee.salary||'';
	dialog.querySelector('[name="effective_date"]').value=new Date().toISOString().slice(0,10);
	dialog.querySelector('.finance-cancel').addEventListener('click',function() {
		dialog.close();
		dialog.remove();
	});
	dialog.querySelector('form').addEventListener('submit',async function(event) {
		event.preventDefault();
		const form=new FormData(event.currentTarget);
		const response=await fetch('/api/employees/'+employee.employee_id+'/salary-history',{
			method: 'POST',headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(Object.fromEntries(form))
		});
		const result=await response.json();
		if(!response.ok) {
			dialog.querySelector('.finance-dialog-message').textContent=result.err;
			return;
		}
		window.location.reload();
	});
	dialog.showModal();
}

// Opens the monthly payroll workspace for the administrator.
function openPayrollPage() {
	const payrollPage=document.querySelector('#payroll');
	const monthInput=payrollPage.querySelector('.payroll-month');
	const records=payrollPage.querySelector('.payroll-records');
	const message=payrollPage.querySelector('.finance-dialog-message');
	const summary=payrollPage.querySelector('.payroll-summary');
	const periodTitle=payrollPage.querySelector('.payroll-period-title');
	if(!monthInput.value) monthInput.value=new Date().toISOString().slice(0,7);

	// Formats the selected payroll month as a readable heading.
	function payrollMonthLabel() {
		return new Intl.DateTimeFormat('en-NG',{
			month: 'long',year: 'numeric',timeZone: 'UTC'
		}).format(new Date(monthInput.value+'-01T00:00:00Z'));
	}

	async function loadPayroll() {
		const response=await fetch('/api/payroll?month='+monthInput.value);
		const payroll=await response.json();
		if(!response.ok) {
			message.textContent=payroll.err;
			return;
		}
		records.replaceChildren();
		periodTitle.textContent=payrollMonthLabel()+' Payroll';
		if(payroll.length===0) {
			summary.hidden=true;
			records.textContent='No payroll has been prepared for this month.';
			return;
		}
		const totals=payroll.reduce(function(output,record) {
			output.basic+=Number(record.basic_salary)||0;
			output.bonus+=Number(record.bonus)||0;
			output.deduction+=Number(record.deduction)||0;
			output.gross+=(Number(record.basic_salary)||0)+(Number(record.bonus)||0);
			output.net+=Number(record.total_salary_cost)||0;
			output[record.payment_status==='Paid'?'paid':'pending']++;
			return output;
		},{ basic: 0,bonus: 0,deduction: 0,gross: 0,net: 0,paid: 0,pending: 0 });
		const summaryValues=[
			['Employees',payroll.length],
			['Monthly salaries','₦'+formatNumber(totals.basic)],
			['Bonuses','₦'+formatNumber(totals.bonus)],
			['Deductions','₦'+formatNumber(totals.deduction)],
			['Gross payroll','₦'+formatNumber(totals.gross)],
			['Net payroll','₦'+formatNumber(totals.net)],
			['Paid',totals.paid],
			['Pending',totals.pending]
		];
		summary.replaceChildren();
		summaryValues.forEach(function(item) {
			const box=document.createElement('div');
			const label=document.createElement('span');
			const value=document.createElement('strong');
			label.textContent=item[0];
			value.textContent=item[1];
			box.append(label,value);
			summary.appendChild(box);
		});
		summary.hidden=false;
		payroll.forEach(function(record) {
			const card=document.createElement('section');
			card.classList.add('payroll-record');
			card.innerHTML=`<button type="button" class="payroll-employee-button" aria-expanded="false"></button>
			<div class="payroll-record-content" hidden>
				<div class="payroll-record-heading">
					<span class="payroll-status-badge"></span>
					<p class="payroll-basic"></p>
					<p class="payroll-gross-row"><span>Gross salary</span><strong class="payroll-gross"></strong></p>
					<p class="payroll-total-row"><span>Net salary</span><strong class="payroll-total"></strong></p>
				</div>
				<div class="payroll-record-fields">
				<label>Bonus<input class="payroll-bonus" type="number" min="0" step="0.01"></label>
				<label>Deduction<input class="payroll-deduction" type="number" min="0" step="0.01"></label>
				<label>Status<select class="payroll-status"><option>Pending</option><option>Paid</option></select></label>
				<label>Payment date<input class="payroll-date" type="date"></label>
				<button type="button" class="payroll-save">Save Payroll</button>
				</div>
			</div>`;
			const employeeButton=card.querySelector('.payroll-employee-button');
			const recordContent=card.querySelector('.payroll-record-content');
			employeeButton.textContent=record.name;
			employeeButton.addEventListener('click',function() {
				const willOpen=recordContent.hidden;
				recordContent.hidden=!willOpen;
				employeeButton.setAttribute('aria-expanded',String(willOpen));
			});
			const statusBadge=card.querySelector('.payroll-status-badge');
			statusBadge.textContent=record.payment_status+(record.needs_review?' · Review required':'');
			statusBadge.classList.toggle('paid',record.payment_status==='Paid');
			card.querySelector('.payroll-basic').textContent='Monthly salary: ₦'+formatNumber(record.basic_salary);
			card.querySelector('.payroll-gross').textContent='₦'+formatNumber(
				Number(record.basic_salary)+Number(record.bonus)
			);
			card.querySelector('.payroll-bonus').value=record.bonus;
			card.querySelector('.payroll-deduction').value=record.deduction;
			card.querySelector('.payroll-status').value=record.payment_status;
			card.querySelector('.payroll-date').value=record.payment_date||'';
			card.querySelector('.payroll-total').textContent='₦'+formatNumber(record.total_salary_cost);
            // Paid salaries are locked on the server; show them read-only.
            if(record.payment_status==='Paid') {
                card.querySelectorAll('.payroll-record-fields input,.payroll-record-fields select,.payroll-save').forEach(field=>{field.disabled=true;});
                card.querySelector('.payroll-save').textContent='Paid · Locked';
            }
			card.querySelector('.payroll-save').addEventListener('click',async function() {
				const payload={
					bonus: card.querySelector('.payroll-bonus').value||0,
					deduction: card.querySelector('.payroll-deduction').value||0,
					payment_status: card.querySelector('.payroll-status').value,
					payment_date: card.querySelector('.payroll-date').value||null
				};
				const response=await fetch('/api/payroll/'+record.payroll_id,{
					method: 'PATCH',headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				});
				const result=await response.json();
				if(!response.ok) {
					message.textContent=result.err;
					return;
				}
				message.textContent=record.name+' payroll was saved successfully.';
				await loadPayroll();
			});
			records.appendChild(card);
		});
	}

	if(payrollPage.dataset.ready==='true') {
		loadPayroll();
		return;
	}
	payrollPage.dataset.ready='true';
	payrollPage.querySelector('.payroll-generate').addEventListener('click',async function() {
		const response=await fetch('/api/payroll/generate',{
			method: 'POST',headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ month: monthInput.value })
		});
		const result=await response.json();
		message.textContent=response.ok? result.message:result.err;
		if(response.ok) await loadPayroll();
	});
	monthInput.addEventListener('change',function() {
		message.textContent='';
		loadPayroll();
	});
	loadPayroll();
}

managePayrollBtn.addEventListener('click',function() {
	window.location.hash='payroll';
});

// Displays employee cards through the shared partner-card configuration and filtering pattern.
function renderEmployeeCards(employeeRecords) {
	const allCards=document.querySelector('.employee-cards');
	const employeeSearch=document.querySelector('#employee-search');
	const employeeConfig={
		cardClass: 'employee-card',
		badge: '👤',
		// Returns the stored photograph path or null when the employee has no photograph.
		photoUrl: employee => employee.photo_path,
		// Returns the secondary value for the current record.
		secondary: employee => employee.email,
		// Returns the tertiary value for the current record.
		tertiary: employee => employee.phone_number,
		lastBusiness: 'Status',
		// Returns the employee status displayed in the card header.
		lastBusinessDate: employee => employee.status,
		formatLastBusiness: false,
		detailsClass: '.employee-details',
		openDetailsPage: openEmployeePage,
		fields: [
			{
				label: 'Role',
				// Derives the displayed field value from the current record.
				value: employee => employee.role
			},
			{
				label: 'Date Joined',
				// Derives the displayed field value from the current record.
				value: employee => formatDate(employee.start_date)
			}
		]
	};

	displayPartners(employeeRecords,employeeConfig,allCards);
	if(window.location.hash==='#employee-details') {
		const employeeId=new URLSearchParams(window.location.search).get('employeeId');
		const selectedEmployee=employeeRecords.find(employee => String(employee.employee_id)===employeeId);
		if(selectedEmployee) openEmployeePage(selectedEmployee,false);
	}


    const employeeSort=document.querySelector('#employee-sort');
    function drawEmployees(){
        const query=employeeSearch.value.toLowerCase().trim();
        const rows=employeeRecords.filter(row=>[row.name,row.role,row.department,row.phone_number,row.email].some(value=>String(value||'').toLowerCase().includes(query)));
        rows.sort((a,b)=>employeeSort?.value==='joined'?String(b.start_date).localeCompare(String(a.start_date)):a.name.localeCompare(b.name));
        displayPartners(rows,employeeConfig,allCards);
        const count=document.querySelector('#employee-visible-count');if(count)count.textContent=rows.length+' Employees';
    }
    employeeSearch.oninput=drawEmployees;if(employeeSort)employeeSort.onchange=drawEmployees;drawEmployees();

}

// Displays one employee's complete record on the dedicated employee profile page.
function openEmployeePage(employee,updateAddress=true) {
	const page=document.querySelector('#employee-details');
	const summary=page.querySelector('.employee-profile-summary');
	const content=page.querySelector('.employee-profile-content');
	const photo=document.createElement('div');
	const identity=document.createElement('div');
	const name=document.createElement('h2');
	const role=document.createElement('p');
	const contact=document.createElement('p');
	const status=document.createElement('strong');

	photo.classList.add('employee-profile-photo');
	if(employee.photo_path) {
		const image=document.createElement('img');
		image.src=employee.photo_path;
		image.alt=employee.name+' passport photograph';
		image.addEventListener('error',function() {
			photo.replaceChildren('👤');
		});
		photo.appendChild(image);
	} else {
		photo.textContent='👤';
	}
	name.textContent=employee.name;
	role.textContent=employee.role;
	contact.textContent=(employee.email||'No email')+' · '+employee.phone_number;
	status.textContent=employee.status;
	identity.append(name,role,contact,status);
	summary.replaceChildren(photo,identity);
    if(window.styleReferenceEmployeeProfile)window.styleReferenceEmployeeProfile(page,employee);
	content.replaceChildren();
	renderEmployeeDetails(employee,content);

	if(updateAddress) {
		const address=new URL(window.location.href);
		address.search='';
		address.searchParams.set('employeeId',employee.employee_id);
		address.hash='employee-details';
		window.history.pushState({},'',address);
		displaySelectedForm();
	}
}

