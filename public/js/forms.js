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
const addCustomer=document.querySelector('#add-customer');
const addSupplier=document.querySelector('#add-supplier');
function displaySelectedForm() {
	const forms=document.querySelectorAll(".card");
	const formId=window.location.hash;
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
	selectedFormId.closest(".card").classList.add("show");
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

async function loadSalesDropdown(select=productSold) {
	try {
		const response=await fetch("/api/items");
		const items=await response.json();

		if(!select) {
			return;
		}
		const products=items.filter(function(item) {
			return item.item_type==="product";
		});

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

async function loadPurchasesDropdown(select=materialSupplied) {
	try {
		if(!select) {
			return;
		}
		const response=await fetch("/api/items");
		const items=await response.json();
		const inventories=items.filter(item => {
			return (
				item.item_type==="raw_material"||
				item.item_type==="consumable"
			);
		});
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

async function loadInventoryDropdown(select=stockName) {
	try {
		const response=await fetch("/api/items");
		const items=await response.json();

		if(!select) {
			return;
		}
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

async function loadCustomersDropdown() {

	try {
		const select=document.querySelector('#customer');
		const response=await fetch('/api/customers');
		if(!response.ok) {
			alert('Could not load sales');
		}
		const result=await response.json();
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

async function loadSuppliersDropdown() {
	try {
		const response=await fetch("/api/suppliers");
		if(!response.ok) {
			alert("Could not load suppliers");
			return;
		}
		const result=await response.json();
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

function inventoryUnit(itemName) {
	if(itemName==="Diesel") {
		return "L";
	}
	if(itemName==="Electricity") {
		return "kWh";
	}
	return "kg";
}

function updateEntryUnit(select,unitSelector) {
	const selectedOption=select.options[select.selectedIndex];
	const selectedName=selectedOption? selectedOption.textContent.trim():"";
	const unit=inventoryUnit(selectedName);
	document.querySelectorAll(unitSelector).forEach(function(element) {
		element.textContent=unit;
	});
}

stockName.addEventListener("change",function() {
	updateEntryUnit(stockName,".inventory-entry-unit");
});

materialSupplied.addEventListener("change",function() {
	updateEntryUnit(materialSupplied,".purchase-entry-unit");
});

async function loadForms() {
	await loadInventoryDropdown();
	await loadPurchasesDropdown();
	await loadSalesDropdown();
	await loadCustomersDropdown();
	await loadSuppliersDropdown();
	editForm();
}
loadForms();

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

	item.textContent=itemName;
	idNum.textContent=idPrefix+id;
	submittedAt.textContent=formatSubmitted(createdAt);
	displayDate.textContent=formatDate(date);

	header.append(displayDate,submittedAt,item,idNum);

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

function formatNumber(value) {
	return Number(value).toLocaleString("en-NG");
}

document.addEventListener("click",event => {
	const openCard=document.querySelector(".data-record-card.show-actions");
});

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

function displayCards(list,config,htmlDataList,visibleRecord,loadMoreBtn) {
	htmlDataList.replaceChildren();
	list.slice(0,visibleRecord).forEach(row => {
		const card=createCard(
			config.date(row),
			config.createdAt(row),
			config.item(row),
			config.id(row)
		);

		card.card.classList.add(
			config.item(row).toLowerCase().replaceAll(" ","-")
		);

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

function loadMore(list,config,htmlDataList,visibleRecord,loadMoreBtn) {
	loadMoreBtn.addEventListener("click",() => {
		visibleRecord+=10;
		displayCards(list,config,htmlDataList,visibleRecord,loadMoreBtn);
	});
}

function filterDate(record,config,dateFrom,dateTo) {
	let filtered;
	if(dateFrom.value===""||dateTo.value==="") {
		filtered=record;
	} else {
		filtered=record.filter(row => {
			return (
				config.date(row)>=dateFrom.value&&
				config.date(row)<=dateTo.value
			);
		});
	}
	return filtered;
}

function sortNewest(record,config,htmlSelect) {
	let sorted;
	if(htmlSelect.value==="newest") {
		sorted=[...record].sort((a,b) => {
			return new Date(config.date(b))-new Date(config.date(a));
		});
	} else {
		sorted=[...record].sort((a,b) => {
			return new Date(config.date(a))-new Date(config.date(b));
		});
	}
	return sorted;
}

function filterByItems(record,config,filterElement) {
	const selectedItem=
		filterElement.options[filterElement.selectedIndex].textContent;
	let filteredList;
	if(filterElement.value===""||selectedItem==="All Items") {
		filteredList=record;
	} else {
		filteredList=record.filter(item => {
			return config.item(item)===selectedItem;
		});
	}
	return filteredList;
}

async function renderSalesCard(salesList) {
	const salesConfig={
		kind: "sales",
		formId: "sales-form",
		id: row => row.sales_id,
		date: row => row.sales_date,
		createdAt: row => row.created_at,
		item: row => row.name,
		field: [
			{
				label: "Customer",
				value: row => row.customer
			},
			{
				label: "Quantity",
				value: row => formatNumber(row.quantity),
				unit: () => "kg"
			},
			{
				label: "Unit Price",
				value: row => "₦"+formatNumber(row.unit_price),
				unit: () => "/kg"
			},
			{
				label: "Total",
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

	function renderCurrentSalesList() {
		displayCards(
			currentList,
			salesConfig,
			htmlDataList,
			visibleRecord,
			loadMoreBtn
		);
	}

	function applySalesFilters() {
		visibleRecord=10;
		currentList=filterByItems(salesList,salesConfig,salesFilter);
		currentList=filterDate(currentList,salesConfig,dateFrom,dateTo);
		currentList=sortNewest(currentList,salesConfig,salesSort);
		renderCurrentSalesList();
	}

	renderCurrentSalesList();

	loadMoreBtn.addEventListener("click",() => {
		visibleRecord+=10;
		renderCurrentSalesList();
	});

	salesFilter.addEventListener("change",applySalesFilters);
	dateFrom.addEventListener("change",applySalesFilters);
	dateTo.addEventListener("change",applySalesFilters);

	salesSort.addEventListener("change",() => {
		visibleRecord=10;
		currentList=sortNewest(currentList,salesConfig,salesSort);
		renderCurrentSalesList();
	});
}

function renderExpensesCard(expensesList) {
	const expensesConfig={
		kind: "expenses",
		formId: "expenses-form",
		id: row => row.expense_id,
		date: row => row.expense_date,
		createdAt: row => row.created_at,
		item: row => row.category,
		field: [
			{
				label: "Description",
				value: row => row.description
			},
			{
				label: "Amount Spent",
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

	function renderCurrentExpensesList() {
		displayCards(
			currentList,
			expensesConfig,
			htmlDataList,
			visibleRecord,
			loadMoreBtn
		);
	}

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

	loadMoreBtn.addEventListener("click",() => {
		visibleRecord+=10;
		renderCurrentExpensesList();
	});

	expensesFilter.addEventListener("change",applyExpensesFilters);
	dateFrom.addEventListener("change",applyExpensesFilters);
	dateTo.addEventListener("change",applyExpensesFilters);

	expensesSort.addEventListener("change",() => {
		visibleRecord=10;
		currentList=sortNewest(currentList,expensesConfig,expensesSort);
		renderCurrentExpensesList();
	});
}

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
		date: row => row.count_date,
		createdAt: row => row.created_at,
		id: row => row.count_id,
		item: row => row.name,
		field: [
			{
				label: "Opening Stock",
				value: row => formatNumber(row.opening_stock),
				unit: row => inventoryUnit(row.name)
			},
			{
				label: "Received",
				value: row => formatNumber(row.received),
				unit: row => inventoryUnit(row.name)
			},
			{
				label: "Issued",
				value: row => formatNumber(row.issued),
				unit: row => inventoryUnit(row.name)
			},
			{
				label: "Closing Stock",
				value: row => formatNumber(row.closing_stock),
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
		date: row => row.purchase_date,
		createdAt: row => row.created_at,
		item: row => row.name,
		id: row => row.purchase_id,
		field: [
			{
				label: "Supplier",
				value: row => row.supplier
			},
			{
				label: "Qty Supplied",
				value: row => formatNumber(row.quantity_supplied),
				unit: row => inventoryUnit(row.name)
			},
			{
				label: "Unit Cost",
				value: row => "₦"+formatNumber(row.unit_cost),
				unit: row => "/"+inventoryUnit(row.name)
			},
			{
				label: "Total",
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

	function renderCurrentPurchasesList() {
		displayCards(
			currentList,
			purchasesConfig,
			htmlDataList,
			visibleRecord,
			loadMoreBtn
		);
	}

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

	loadMoreBtn.addEventListener("click",() => {
		visibleRecord+=10;
		renderCurrentPurchasesList();
	});

	purchasesFilter.addEventListener("change",applyPurchasesFilters);
	dateFrom.addEventListener("change",applyPurchasesFilters);
	dateTo.addEventListener("change",applyPurchasesFilters);

	purchasesSelect.addEventListener("change",() => {
		visibleRecord=10;
		currentList=sortNewest(currentList,purchasesConfig,purchasesSelect);
		renderCurrentPurchasesList();
	});
}

function renderPurchasesTable(purchasesList) {
	const purchasesDataBody=document.querySelector("#purchases-data-body");
	purchasesDataBody.innerHTML="";
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

		cells.forEach(value => {
			const td=document.createElement("td");
			td.textContent=value;
			row.appendChild(td);
		});
		purchasesDataBody.appendChild(row);
	});
}

function renderProductionCard(productionList) {
	const productionConfig={
		kind: "production",
		formId: "production-form",
		id: row => row.production_id,
		date: row => row.production_date,
		createdAt: row => row.created_at,
		item: row => "pko produced: "+formatNumber(row.pko_produced)+" kg",
		field: [
			{
				label: "Kernel Used",
				value: row => formatNumber(row.kernel_used),
				unit: () => "kg"
			},
			{
				label: "pkc Produced",
				value: row => formatNumber(row.pkc_produced),
				unit: () => "kg"
			},
			{
				label: "Production hours",
				value: row => row.production_hours,
				unit: () => "hrs"
			},
			{
				label: "Down time",
				value: row => row.down_time,
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

	function renderCurrentProductionList() {
		displayCards(
			currentList,
			productionConfig,
			htmlDataList,
			visibleRecord,
			loadMoreBtn
		);
	}

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

	loadMoreBtn.addEventListener("click",() => {
		visibleRecord+=10;
		renderCurrentProductionList();
	});

	dateFrom.addEventListener("change",applyProductionDateFilter);
	dateTo.addEventListener("change",applyProductionDateFilter);

	productionSort.addEventListener("change",() => {
		visibleRecord=10;
		currentList=sortNewest(currentList,productionConfig,productionSort);
		renderCurrentProductionList();
	});
}

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

function createPartnersCard(partner,businessLabel,latestBusinessDate) {

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

	badge.textContent='🏪';
	name.textContent=partner.name;
	phoneNumber.textContent=partner.phone_number;
	location.textContent=partner.address;
	lastBusiness.textContent=businessLabel;
	lastBusinessDate.textContent=latestBusinessDate? formatDate(latestBusinessDate):'No Transaction';
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

// Displays a list of customers or suppliers as cards, fills each card with the fields defined in the config, adds expandable details to the card footer, and inserts the finished cards into the specified container.
function displayPartners(partnersList,config,allCards) {
	allCards.replaceChildren();
	partnersList.forEach((partner) => {
		const card=createPartnersCard(partner,config.lastBusiness,config.lastBusinessDate(partner));
		config.fields.forEach((field) => {
			const box=createCardValues(field.label,field.value(partner));
			card.body.append(box);

		});

		card.footer.addEventListener('click',async function() {
			const existingDetails=card.card.querySelector(config.detailsClass);
			if(existingDetails) {
				existingDetails.remove();
				return;
			}
			const response=await fetch(config.detailsUrl(partner));
			const history=await response.json();
			config.renderDetails(partner,history,card.card);
		});
		allCards.appendChild(card.card);
	});
}

function renderCustomersCards(customersList) {

	const allCards=document.querySelector('.customer-cards');
	const addCustomer=document.querySelector('#add-customer');
	const customerSearch=document.querySelector('#customer-search');
	const sortCustomers=document.querySelector('#sort-customers');
	const customerConfig=
	{
		kind: 'customers',
		formId: 'customers',
		lastBusiness: 'Last Purchase',
		lastBusinessDate: row => row.last_purchase_date,
		detailsClass: '.customer-details',
		detailsUrl: row => "/api/customers-purchases?customerId="+row.customer_id,
		renderDetails: renderPurchaseHistory,
		fields: [
			{
				label: 'Total Purchases',
				value: row => '₦'+formatNumber(row.total_purchases)
			},
			{
				label: 'No. Of Purchases',
				value: row => row.number_of_purchases
			},
			{
				label: 'Main Item',
				value: row => row.main_item
			},
			{
				label: 'Last Purchase Qty',
				value: row => formatNumber(row.last_purchase_qty)+'kg'
			}
		]
	}

	displayPartners(customersList,customerConfig,allCards);

	function searchCustomer() {
		customerSearch.addEventListener('input',() => {
			const userInput=customerSearch.value.toLowerCase().trim();
			const filteredCustomer=customersList.filter((customer) => {
				return customer.name.toLowerCase().includes(userInput);
			});
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

addCustomer.addEventListener('click',() => {
	window.location.href='forms.html#customer-addition';
});
addSupplier.addEventListener('click',() => {
	window.location.href='forms.html#supplier-addition';
});

function customerFormBtns() {
	const params=new URLSearchParams(window.location.search);
	const customerId=params.get('customerId');
	if(customerForm) {
		customerForm.addEventListener('submit',customerId? saveCustomerEdit:saveCustomer);
	}
	const cancelBtn=document.querySelector('#cancel-button');
	if(cancelBtn) {
		cancelBtn.addEventListener('click',() => {
			customerForm.reset();
			window.history.back();
		});
	}
}

customerFormBtns();

function renderPurchaseHistory(customer,history,customerCard) {
	const editBtn=document.createElement('button');
	const deleteBtn=document.createElement('button');
	const customerDetails=document.createElement('section');
	const header=document.createElement('div');
	const note=document.createElement('h5');
	const noteContent=document.createElement('p');
	const body=document.createElement('div');
	const purchaseHistory=document.createElement('p');
	const purchasecards=document.createElement('div');

	header.classList.add('customer-details-note');
	editBtn.classList.add('customer-details-edit-btn');
	deleteBtn.classList.add('customer-details-delete-btn');
	note.classList.add('customer-details-heading');
	noteContent.classList.add('customer-details-note-text');
	body.classList.add('customer-details-body');
	purchaseHistory.classList.add('customer-history-heading');
	purchasecards.classList.add('customer-history-list');

	note.textContent='Customer Note';
	noteContent.textContent=customer.note;
	purchaseHistory.textContent='Purchase History';
	editBtn.textContent='Edit Customer';
	deleteBtn.textContent='Delete Customer';

	editBtn.addEventListener('click',() => {
		window.location.href=`forms.html?customerId=${customer.customer_id}#customer-form`;

	});


	header.append(editBtn,deleteBtn,note,noteContent);
	history.forEach((row) => {

		const card=document.createElement('div');
		const date=document.createElement('span');
		const item=document.createElement('span');
		const quantity=document.createElement('span');
		const unitPrice=document.createElement('span');
		const total=document.createElement('span');

		card.classList.add('customer-history-card');
		date.classList.add('customer-history-date');
		item.classList.add('customer-history-item');
		quantity.classList.add('customer-history-quantity');
		unitPrice.classList.add('customer-history-unit-price');
		total.classList.add('customer-history-total');

		date.textContent=row.purchase_date;
		item.textContent=row.item;
		quantity.textContent=formatNumber(row.quantity)+'kg';
		unitPrice.textContent='₦'+formatNumber(row.unit_price)+'/kg';
		total.textContent='₦'+formatNumber(row.total);

		card.append(date,item,quantity,unitPrice,total);
		purchasecards.appendChild(card);

	});
	body.append(purchaseHistory,purchasecards);
	customerDetails.append(header,body);
	customerDetails.classList.add('customer-details');
	customerCard.appendChild(customerDetails);
}

function loadCustomerDetailsToEdit() {
	const params=new URLSearchParams(window.location.search);
	const customerId=params.get('customerId');
	if(customerId) {
		editCustomer(customerId);
	}
}


loadCustomerDetailsToEdit();


async function editCustomer(customerId) {
	const response=await fetch('/api/customers/'+customerId);
	const customer=await response.json();

	customerName.value=customer.name;
	customerPhone.value=customer.phone_number;
	customerAddress.value=customer.address;
	customerEmail.value=customer.email;
	customerNote.value=customer.note;
}

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


function renderSupplierCards(suppliersList) {
	const allCards=document.querySelector('.supplier-cards');

	const supplierSearch=document.querySelector('#supplier-search');
	const sortSupplier=document.querySelector('#sort-supplier');
	const supplierConfig={
		lastBusiness: 'Last Supply',
		lastBusinessDate: row => row.last_supply_date,
		detailsClass: '.supplier-details',
		detailsUrl: row => "/api/suppliers-supplies?supplierId="+row.supplier_id,
		renderDetails: renderPurchaseHistory,
		fields: [
			{
				label: 'Total Supplies',
				value: row => '₦'+formatNumber(row.total_supplies)

			},
			{
				label: 'No of Supplies',
				value: row => row.number_of_supplies
			},
			{
				label: 'Main Item',
				value: row => row.main_item
			},
			{
				label: 'Last Supply Qty',
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

	function searchSupplier() {
		supplierSearch.addEventListener('input',() => {
			const userInput=supplierSearch.value.toLowerCase().trim();
			const filteredSupplier=suppliersList.filter((supplier) => {
				return supplier.name.toLowerCase().includes(userInput);
			});
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

