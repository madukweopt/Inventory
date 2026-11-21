// Customers and suppliers: their lists and cards, adding and editing them, and their purchase and supply histories.
// Moved from forms.js unchanged. Loaded on forms.html after forms.js, whose shared page elements and helpers it uses;
// page scripts share their top-level names, so forms.js and the other files call these functions directly.

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

// Handles click events from addCustomer.
addCustomer.addEventListener('click',() => {
	window.location.href='forms.html#customer-addition';
});
// Handles click events from addSupplier.
addSupplier.addEventListener('click',() => {
	window.location.href='forms.html#supplier-addition';
});

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

customerFormBtns();
supplierFormsBtn();

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
