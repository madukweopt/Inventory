// Sale and Payments: the invoice, account statement and receipts of one sale, recording and reversing payments, and printing.
// Moved from forms.js unchanged. Loaded on forms.html after forms.js, whose shared page elements and helpers it uses;
// page scripts share their top-level names, so forms.js and the other files call these functions directly.

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
	// A late balance shows how late it is, even after a deposit: "Partly Paid · 5 days overdue".
	const today=new Date().toISOString().slice(0,10);
	const daysOverdue=remaining>0&&sale.due_date&&sale.due_date<today?
		Math.round((Date.parse(today)-Date.parse(sale.due_date))/86400000):0;
	const label=daysOverdue?status+' · '+daysOverdue+(daysOverdue===1?' day':' days')+' overdue':status;
	return { total: total,paid: paid,remaining: remaining,status: status,label: label,daysOverdue: daysOverdue };
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
		buildSaleDocumentParty(data,'Customer','Bill To:',summary.status,false,'Status: '+summary.label),
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
		buildSaleDocumentHeading(data,'ACCOUNT STATEMENT',data.sale.invoice_number,[['Invoice No',data.sale.invoice_number],['Invoice Date',formatDate(data.sale.sales_date)],['Status',summary.label]]),
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
	paid.append(createDocumentText('span','','Total Paid'),createDocumentText('strong','','₦'+formatNumber(summary.paid)),documentStatusBadge(summary.status,summary.label));
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
