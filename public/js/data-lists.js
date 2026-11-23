// Data pages: the inventory, purchases, sales, production and expenses lists (cards and tables, filters, sorting and Load more) and Edit, which opens a saved record in its form.
// Moved from forms.js unchanged. Loaded on forms.html after forms.js, whose shared page elements and helpers it uses;
// page scripts share their top-level names, so forms.js and the other files call these functions directly.

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
        document.getElementById('sales-due-field').hidden=true;
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
