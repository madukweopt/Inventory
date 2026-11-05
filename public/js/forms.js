const salesForm=document.querySelector("#sales-form");
const purchaseForm=document.querySelector("#purchases-form");
const inventoryForm=document.querySelector("#inventory-form");
const productionForm=document.querySelector("#production-form");
const expensesForm=document.querySelector("#expenses-form");
const salesDate=document.querySelector("#sales-date");
const customer=document.querySelector("#customer");
const productSold=document.querySelector("#product-sold");
const salesQuantity=document.querySelector("#sales-quantity");
const unitPrice=document.querySelector("#unit-price");
const purchaseDate=document.querySelector("#purchase-date");
const supplier=document.querySelector("#supplier");
const materialSupplied=document.querySelector("#material-supplied");
const quantitySupplied=document.querySelector("#quantity-supplied");
const unitCost=document.querySelector("#unit-cost");
const stockDate=document.querySelector("#stock-date");
const stockName=document.querySelector("#stock-name");
const received=document.querySelector("#received");
const issued=document.querySelector("#issued");
const productionDate=document.querySelector("#production-date");
const kernelUsed=document.querySelector("#kernel-used");
const oilProduced=document.querySelector("#oil-produced");
const pkcProduced=document.querySelector("#pkc-produced");
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

// Hides forms, pages and action buttons that the signed-in role cannot use.
function applyFormPermissions(user) {
	const role=user.role;
	const hideCard=function(selector,shouldHide) {
		const element=document.querySelector(selector);
		const card=element&&element.closest('.card');
		if(card) card.classList.toggle('permission-hidden',shouldHide);
	};

	hideCard('#inventory-form',role==='manager');
	hideCard('#inventory-data',role==='manager');
	hideCard('#purchases-form',role==='storekeeper');
	hideCard('#sales-form',role==='storekeeper');
	hideCard('#production-form',role==='storekeeper');
	hideCard('#expenses-form',role==='storekeeper');
	hideCard('#employees',role==='storekeeper');
	hideCard('#employee-addition',role!=='admin');
	hideCard('#supplier-addition',role==='storekeeper');

	addEmployee.hidden=role!=='admin';
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
	} else if(formId==="#inventory-data") {
		loadInventoryData();
	} else if(formId==="#purchases-data") {
		loadPurchasesData();
	} else if(formId==="#production-data") {
		loadProductionData();
	} else if(formId==="#expenses-data") {
		loadExpensesData();
	}
}
displaySelectedForm();

window.addEventListener("hashchange",displaySelectedForm);

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
			alert('Could not load sales');
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
			alert("Could not load suppliers");
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
			alert('Could not load employees');
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
async function saveSale(event) {
	event.preventDefault();
	const sale={
		sales_date: salesDate.value,
		customer_id: customer.value,
		item_id: productSold.value,
		quantity: salesQuantity.value,
		unit_price: unitPrice.value
	};
	try {
		const response=await fetch("/api/sales",{
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify(sale)
		});
		if(!response.ok) {
			alert("save failed. Please check the form and try again.");
			return;
		}
		const savedSale=await response.json();
		console.log("saved:",savedSale);
		alert("Sale saved successfully!");
		salesForm.reset();
	} catch(err) {
		console.error("network problem:",err);
		alert("Network problem. Your entry was NOT saved");
	}
}

if(salesForm) {
	salesForm.addEventListener("submit",saveSale);
}

// Validates the submitted purchases data and sends it to the server for saving.
async function savePurchases(event) {
	event.preventDefault();
	const purchase={
		purchase_date: purchaseDate.value,
		supplier_id: supplier.value,
		item_id: materialSupplied.value,
		quantity_supplied: quantitySupplied.value,
		unit_cost: unitCost.value
	};
	try {
		const response=await fetch("/api/purchases",{
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify(purchase)
		});
		if(!response.ok) {
			alert("Save failed. Check entries and try again");
			return;
		}
		const savedPurchase=await response.json();
		console.log("saved:",savedPurchase);
		alert("Purchase submited");
		purchaseForm.reset();
	} catch(err) {
		console.error("Network problem",err);
		alert("Network problem. Failed to submit");
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
		received: received.value,
		issued: issued.value
	};
	try {
		const response=await fetch("/api/stock_counts",{
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify(inventoryItems)
		});
		if(!response.ok) {
			alert("failed to submit. Check your entries");
			return;
		}
		const savedStock=await response.json();
		console.log("saved:",savedStock);
		alert("Stock submited successfully");
		inventoryForm.reset();
	} catch(err) {
		console.error(err);
		alert("Network problem. Failed to submit");
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
		kernel_used: kernelUsed.value,
		pko_produced: oilProduced.value,
		pkc_produced: pkcProduced.value,
		production_hours: productionHours.value,
		down_time: downTime.value
	};
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
				alert("Failed to submit. "+problem.err);
			} else {
				alert("Failed to submit. Internal server problem");
			}
			return;
		}
		const savedProduction=await response.json();
		console.log("saved:",savedProduction);
		alert("Production submitted successfully");
		productionForm.reset();
	} catch(err) {
		console.error(err);
		alert("Network problem. Failed to submit");
	}
}
if(productionForm) {
	productionForm.addEventListener("submit",saveProduction);
}

// Validates the submitted expenses data and sends it to the server for saving.
async function saveExpenses(event) {
	event.preventDefault();
	const expense={
		expense_date: expenseDate.value,
		category: expenseCategory.value,
		description: expenseDescription.value,
		amount_spent: expenseAmount.value
	};
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
				alert("Failed to submit "+problem.err);
				console.log(problem.err);
			} else {
				alert("Failed to submit. Internal server error");
			}
			return;
		}
		const savedExpense=await response.json();
		alert("Expense submitted successfully");
		expensesForm.reset();
		console.log("submitted:",savedExpense);
	} catch(err) {
		console.error(err);
		alert("Network problem. Failed to submit");
	}
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
			alert(problem.err);
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
		alert("Failed to load Sales. Network problem");
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
function createCard(date,createdAt,itemName,id,idPrefix='p') {
	const card=document.createElement("article");
	const header=document.createElement("div");
	const body=document.createElement("div");
	const item=document.createElement("span");
	const displayDate=document.createElement("span");
	const submittedAt=document.createElement("span");
	const idNum=document.createElement("span");
	const actions=document.createElement("div");

	card.classList.add("data-record-card");
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

	item.textContent=itemName;
	idNum.textContent=idPrefix+id;
	submittedAt.textContent=formatSubmitted(createdAt);
	displayDate.textContent=formatDate(date);

	header.append(displayDate,submittedAt,item,idNum);

	// Handles click events from card.
	card.addEventListener("click",() => {
		card.classList.toggle("show-actions");
	});
	card.classList.remove("show-acrions");

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

// Handles click events from document.
document.addEventListener("click",event => {
	const openCard=document.querySelector(".data-record-card.show-actions");
});

// Creates a labelled value block for a data card.
function createCardValues(label,value,unit) {
	const box=document.createElement("div");
	const labelName=document.createElement("span");
	const nameOrValue=document.createElement("strong");
	const unitValue=document.createElement("small");

	nameOrValue.textContent=value;
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
	// Processes each entry in the collection.
	list.slice(0,visibleRecord).forEach(row => {
		const card=createCard(
			config.date(row),
			config.createdAt(row),
			config.item(row),
			config.id(row)
		);
		if(
			document.documentElement.dataset.userRole==='storekeeper'&&
			config.kind==='stock'
		) {
			card.card.querySelector('.edit-btn').hidden=false;
			card.card.querySelector('.delete-btn').hidden=false;
		}

		card.card.classList.add(
			config.item(row).toLowerCase().replaceAll(" ","-")
		);

		// Processes each entry in the collection.
		config.field.forEach(field => {
			const box=createCardValues(
				field.label,
				field.value(row),
				field.unit? field.unit(row):undefined
			);
			card.body.appendChild(box);
		});
		htmlDataList.appendChild(card.card);

		editBtn=card.card.querySelector(".edit-btn");
		// Handles click events from editBtn.
		editBtn.addEventListener("click",() => {
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

		deleteBtn=card.card.querySelector(".delete-btn");
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
				alert(problem.err);
				return;
			}
			alert("Record was deleted successfully");
			card.card.remove();
		});
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
	let filtered;
	if(dateFrom.value===""||dateTo.value==="") {
		filtered=record;
	} else {
		// Keeps collection entries that match the current condition.
		filtered=record.filter(row => {
			return (
				config.date(row)>=dateFrom.value&&
				config.date(row)<=dateTo.value
			);
		});
	}
	return filtered;
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
				// Derives the displayed field value from the current record.
				value: row => formatNumber(row.quantity),
				// Returns the unit displayed beside the current value.
				unit: () => "kg"
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
				value: row => "₦"+formatNumber(row.total)
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
		formId: "inventory-form",
		// Returns the record date used for display and filtering.
		date: row => row.count_date,
		// Returns the record creation timestamp.
		createdAt: row => row.created_at,
		// Returns the record identifier used by the card.
		id: row => row.count_id,
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
		item: row => "pko produced: "+formatNumber(row.pko_produced)+" kg",
		field: [
			{
				label: "Kernel Used",
				// Derives the displayed field value from the current record.
				value: row => formatNumber(row.kernel_used),
				// Returns the unit displayed beside the current value.
				unit: () => "kg"
			},
			{
				label: "pkc Produced",
				// Derives the displayed field value from the current record.
				value: row => formatNumber(row.pkc_produced),
				// Returns the unit displayed beside the current value.
				unit: () => "kg"
			},
			{
				label: "Production hours",
				// Derives the displayed field value from the current record.
				value: row => row.production_hours,
				// Returns the unit displayed beside the current value.
				unit: () => "hrs"
			},
			{
				label: "Down time",
				// Derives the displayed field value from the current record.
				value: row => row.down_time,
				// Returns the unit displayed beside the current value.
				unit: () => "hrs"
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

	renderCurrentProductionList();

	// Handles click events from loadMoreBtn.
	loadMoreBtn.addEventListener("click",() => {
		visibleRecord+=10;
		renderCurrentProductionList();
	});

	dateFrom.addEventListener("change",applyProductionDateFilter);
	dateTo.addEventListener("change",applyProductionDateFilter);

	// Handles change events from productionSort.
	productionSort.addEventListener("change",() => {
		visibleRecord=10;
		currentList=sortNewest(currentList,productionConfig,productionSort);
		renderCurrentProductionList();
	});
}

// Fetches inventory data and displays the results in the relevant interface.
async function loadInventoryData() {
	const response=await fetch("/api/stock_counts");
	if(response.status===500) {
		const problem=await response.json();
		alert(problem.err);
		return;
	}
	if(!response.ok) {
		alert("Request failed"+" "+response.statusText);
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
		alert(problem.err);
		return;
	}
	if(!response.ok) {
		alert("Request failed"+" "+response.statusText);
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
		alert(problem.err);
		return;
	}
	if(!response.ok) {
		alert("Request failed"+" "+response.statusText);
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
		alert(problem.err);
		return;
	}
	if(!response.ok) {
		alert("Request failed"+" "+response.statusText);
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
			alert(problem.err);
			return;
		}
		if(!response.ok) {
			alert("Request failed"+" "+response.statusText);
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
				production.pko_yield,
				production.pkc_yield,
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
		alert("Something went Wrong"+" "+error.message);
	}
}

// Fetches expenses data and displays the results in the relevant interface.
async function loadExpensesData() {
	try {
		const expensesDataBody=document.querySelector("#expenses-data-body");
		const response=await fetch("/api/expenses");
		if(response.status===500) {
			const problem=await response.json();
			alert(problem.err);
			return;
		}
		if(!response.ok) {
			alert("Request failed"+" "+response.statusText);
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
		alert("Something went Wrong"+" "+error.message);
	}
}

// Loads a stored correction record into its matching edit form.
function editForm() {
	const record=JSON.parse(sessionStorage.getItem("editRecord"));
	const kind=sessionStorage.getItem("editKind");

	if(!record||!kind) {
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
		received.value=record.received;
		issued.value=record.issued;

		inventoryForm.removeEventListener("submit",saveInventory);
		inventoryForm.addEventListener("submit",saveEdit);
		inventoryForm.querySelector('button[type="submit"]').textContent=
			"Save Inventory";
	} else if(kind==="production") {
		productionDate.value=record.production_date.slice(0,10);
		kernelUsed.value=record.kernel_used;
		oilProduced.value=record.pko_produced;
		pkcProduced.value=record.pkc_produced;
		productionHours.value=record.production_hours;
		downTime.value=record.down_time;

		productionForm.removeEventListener("submit",saveProduction);
		productionForm.addEventListener("submit",saveEdit);
		productionForm.querySelector('button[type="submit"]').textContent=
			"Save Production";
	} else if(kind==="sales") {
		salesDate.value=record.sales_date.slice(0,10);
		customer.value=record.customer_id;
		productSold.value=record.item_id;
		salesQuantity.value=record.quantity;
		unitPrice.value=record.unit_price;

		salesForm.removeEventListener("submit",saveSale);
		salesForm.addEventListener("submit",saveEdit);
		salesForm.querySelector('button[type="submit"]').textContent=
			"Save Sales";
	} else if(kind==="purchases") {
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
			received: received.value,
			issued: issued.value
		};
	} else if(kind==="production") {
		updatedForm={
			production_id: record.production_id,
			production_date: productionDate.value,
			kernel_used: kernelUsed.value,
			pko_produced: oilProduced.value,
			pkc_produced: pkcProduced.value,
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
			unit_price: unitPrice.value
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
		alert("Edit saved successfully");
		const checksReturnUrl=
			sessionStorage.getItem("checksReturnUrl")||"checks.html";
		sessionStorage.removeItem("editRecord");
		sessionStorage.removeItem("editKind");
		sessionStorage.removeItem("checksReturnUrl");
		window.location.href=checksReturnUrl;
	} else {
		const problem=await response.json();
		alert(problem.err||"Edit could not be saved");
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
	partnersList.forEach((partner) => {
		const card=createPartnersCard(partner,config.lastBusiness,config.lastBusinessDate(partner),config);
		if(config.cardClass) {
			card.card.classList.add(config.cardClass);
		}
		// Processes each entry in the collection.
		config.fields.forEach((field) => {
			const box=createCardValues(field.label,field.value(partner));
			card.body.append(box);

		});

		// Handles click events from card.footer.
		card.footer.addEventListener('click',async function() {
			const existingDetails=card.card.querySelector(config.detailsClass);
			if(existingDetails) {
				existingDetails.remove();
				return;
			}
			if(config.renderDetails) {
				config.renderDetails(partner,card.card);
				return;
			}
			const response=await fetch(config.detailsUrl(partner));
			const history=await response.json();
			renderTransactionHistory(partner,config,history,card.card);
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

	displayPartners(customersList,customerConfig,allCards);

	// Filters the visible list as the user searches customer.
	function searchCustomer() {
		// Handles input events from customerSearch.
		customerSearch.addEventListener('input',() => {
			const userInput=customerSearch.value.toLowerCase().trim();
			// Keeps collection entries that match the current condition.
			const filteredCustomer=customersList.filter((customer) => {
				return customer.name.toLowerCase().includes(userInput);
			});
			// Keeps collection entries that match the current condition.
			filteredCustomer.sort((a,b) => {
				const aStart=a.name.toLowerCase().startsWith(userInput);
				const bStart=b.name.toLowerCase().startsWith(userInput);
				return bStart-aStart;
			});
			displayPartners(filteredCustomer,customerConfig,allCards);
		});
	}
	searchCustomer();
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
			alert(problem.err);
		}
		alert('customer details saved successfully');
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
			alert(problem.err);
			return;
		}
		alert('Supplier saved');
		supplierForm.reset();
		window.location.replace('forms.html#suppliers');

	} catch(error) {
		console.error(error);
		alert('Could not save supplier. Please try again.');
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
			alert(problem.err||'Could not save employee');
			return;
		}
		alert('Employee saved successfully');
		employeeForm.reset();
		window.location.replace('forms.html#employees');
	} catch(error) {
		console.error(error);
		alert('Could not save employee. Please try again.');
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
			alert(problem.err||'Could not update company details');
			return;
		}
		const company=await response.json();
		populateCompanyForm(company);
		setCompanyEditMode(false);
		alert('Company details updated successfully');
	} catch(error) {
		console.error(error);
		alert('Could not update company details. Please try again.');
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
		quantity.textContent=formatNumber(config.quantity(row))+'kg';
		price.textContent='₦'+formatNumber(config.price(row))+'/kg';
		total.textContent='₦'+formatNumber(config.total(row));

		card.append(date,item,quantity,price,total);
		transactionCards.appendChild(card);

	});
	body.append(partnerHistory,transactionCards);
	partnerDetails.append(header,body);
	partnerDetails.classList.add(config.detailsClassStyle);
	partnerCard.appendChild(partnerDetails);
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
		alert(problem.err);
		return;
	}
	const result=await response.json();
	alert('Customer updated successfully');
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
		alert(problem.err);
		return;
	}
	const result=await response.json();
	alert('Supplier updated successfully');
	supplierForm.reset();
	window.location.replace('forms.html#suppliers');
}


// Builds and displays supplier cards using the supplied data.
function renderSupplierCards(suppliersList) {
	const allCards=document.querySelector('.supplier-cards');

	const supplierSearch=document.querySelector('#supplier-search');
	const sortSupplier=document.querySelector('#sort-supplier');
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

	displayPartners(suppliersList,supplierConfig,allCards);

	// Filters the visible list as the user searches supplier.
	function searchSupplier() {
		// Handles input events from supplierSearch.
		supplierSearch.addEventListener('input',() => {
			const userInput=supplierSearch.value.toLowerCase().trim();
			// Keeps collection entries that match the current condition.
			const filteredSupplier=suppliersList.filter((supplier) => {
				return supplier.name.toLowerCase().includes(userInput);
			});
			// Keeps collection entries that match the current condition.
			filteredSupplier.sort((a,b) => {
				const aStart=a.name.toLowerCase().startsWith(userInput);
				const bStart=b.name.toLowerCase().startsWith(userInput);
				return bStart-aStart;
			});
			displayPartners(filteredSupplier,supplierConfig,allCards);
		});
	}
	searchSupplier();
}

// Builds the employee information and system-access sections shown inside an expanded card.
function renderEmployeeDetails(employee,employeeCard) {
	const details=document.createElement('section');
	const employeeHeading=document.createElement('h5');
	const employeeInformation=document.createElement('div');
	const accessHeading=document.createElement('h5');
	const systemAccess=document.createElement('div');
	const actions=document.createElement('div');
	const editBtn=document.createElement('button');
	const disableBtn=document.createElement('button');

	details.classList.add('customer-details','employee-details');
	employeeHeading.classList.add('employee-details-heading');
	employeeInformation.classList.add('employee-details-list');
	accessHeading.classList.add('employee-access-heading');
	systemAccess.classList.add('employee-details-list');
	actions.classList.add('employee-details-actions');
	editBtn.classList.add('customer-details-edit-btn');
	disableBtn.classList.add('customer-details-delete-btn');

	employeeHeading.textContent='Employee Details';
	accessHeading.textContent='System Access';
	editBtn.textContent='Edit Employee';
	disableBtn.textContent='Disable Account';

	const employeeFields=[
		['Address',employee.address],
		['Note',employee.note]
	];
	const accessFields=[
		['Username',employee.username],
		['Role',employee.role],
		['Permissions',employee.permissions],
		['Account Status',employee.status]
	];

	// Adds each label and value using the same DOM-building pattern as the other cards.
	employeeFields.forEach((field) => {
		const row=createCardValues(field[0],field[1]);
		employeeInformation.appendChild(row);
	});
	// Builds the system-access rows from the employee configuration data.
	accessFields.forEach((field) => {
		const row=createCardValues(field[0],field[1]);
		systemAccess.appendChild(row);
	});

	if(document.documentElement.dataset.userRole==='admin') {
		actions.append(editBtn,disableBtn);
	}
	details.append(employeeHeading,employeeInformation,accessHeading,systemAccess,actions);
	employeeCard.appendChild(details);
}

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
		renderDetails: renderEmployeeDetails,
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

	// Filters employees by the name, role, department, or phone number shown on their cards.
	employeeSearch.addEventListener('input',() => {
		const userInput=employeeSearch.value.toLowerCase().trim();
		// Keeps collection entries that match the current condition.
		const filteredEmployees=employeeRecords.filter((employee) => {
			return [employee.name,employee.role,employee.department,employee.phone_number]
				// Keeps collection entries that match the current condition.
				.some(value => value.toLowerCase().includes(userInput));
		});
		displayPartners(filteredEmployees,employeeConfig,allCards);
	});
}

