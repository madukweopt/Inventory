const checksList=document.querySelector('#checks-list');
const openCount=document.querySelector('#open-count');
const query=new URLSearchParams(window.location.search);
const selectedPeriod=query.get('period')||'day';
const selectedDate=query.get('date')||new Date().toISOString().slice(0,10);

function filterChecks(checks) {
	const selected=new Date(selectedDate+'T00:00:00');

	if(selectedPeriod==='week') {
		const weekStart=new Date(selected);
		weekStart.setDate(
			selected.getDate()-
			((selected.getDay()+6)%7)
		);
		const weekEnd=new Date(weekStart);
		weekEnd.setDate(weekStart.getDate()+7);

		return checks.filter((check) => {
			const checkDate=
				new Date(check.check_date+'T00:00:00');
			return checkDate>=weekStart&&
				checkDate<weekEnd;
		});
	}

	if(selectedPeriod==='month') {
		return checks.filter((check) => {
			const checkDate=
				new Date(check.check_date+'T00:00:00');
			return checkDate.getFullYear()===
				selected.getFullYear()&&
				checkDate.getMonth()===selected.getMonth();
		});
	}

	return checks.filter((check) => {
		return check.check_date===selectedDate;
	});
}

function checkLabels(checkType) {
	const labels={
		pko_received_vs_produced: {
			title: 'Received vs Produced',
			store: 'Store keeper received',
			manager: 'Manager produced'
		},
		pkc_received_vs_produced: {
			title: 'Received vs Produced',
			store: 'Store keeper received',
			manager: 'Manager produced'
		},
		kernel_issued_vs_used: {
			title: 'Issued vs Used',
			store: 'Store keeper issued',
			manager: 'Manager used'
		},
		kernel_received_vs_purchased: {
			title: 'Received vs Purchased',
			store: 'Store keeper received',
			manager: 'Purchases recorded'
		},
		pko_issued_vs_sold: {
			title: 'Issued vs Sold',
			store: 'Store keeper issued',
			manager: 'Manager sold'
		},
		pkc_issued_vs_sold: {
			title: 'Issued vs Sold',
			store: 'Store keeper issued',
			manager: 'Manager sold'
		}
	};

	return labels[checkType]||{
		title: String(checkType).replaceAll('_',' '),
		store: 'Store keeper says',
		manager: 'Manager says'
	};
}

function formatDate(value) {
	return new Intl.DateTimeFormat('en-GB',{
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	}).format(new Date(value+'T00:00:00'));
}

function formatQuantity(value,showSign) {
	const number=Number(value)||0;
	const sign=showSign&&number>0? '+':'';
	return sign+number.toLocaleString('en-GB')+' kg';
}

function createCheckCard(check) {
	const labels=checkLabels(check.check_type);
	const difference=Number(check.difference)||0;
	const card=document.createElement('article');
	const heading=document.createElement('div');
	const badge=document.createElement('span');
	const titleWrap=document.createElement('div');
	const title=document.createElement('h2');
	const type=document.createElement('p');
	const values=document.createElement('div');
	const actions=document.createElement('div');

	card.classList.add('check-card');
	if(difference<0) {
		card.classList.add('is-negative');
	}
	heading.classList.add('check-heading');
	badge.classList.add('item-badge');
	titleWrap.classList.add('check-title');
	values.classList.add('check-values');
	actions.classList.add('check-actions');

	const item=String(check.item||'').trim();
	const badgeText=item==='P Kernel'? 'KER':item;
	badge.textContent=badgeText;
	if(item==='PKC') badge.classList.add('pkc');
	if(item==='P Kernel') badge.classList.add('kernel');

	title.textContent=
		formatDate(check.check_date)+' · '+item;
	type.textContent=labels.title;
	titleWrap.append(title,type);
	heading.append(badge,titleWrap);

	const rows=[
		[labels.store,
		formatQuantity(check.storekeeper_says)],
		[labels.manager,
		formatQuantity(check.manager_says)],
		['Difference',
			formatQuantity(difference,true)]
	];

	rows.forEach(([label,value],index) => {
		const row=document.createElement('div');
		const rowLabel=document.createElement('span');
		const rowValue=document.createElement('strong');
		row.classList.add('check-row');
		if(index===rows.length-1) {
			row.classList.add('difference');
		}
		rowLabel.textContent=label;
		rowValue.textContent=value;
		row.append(rowLabel,rowValue);
		values.appendChild(row);
	});

	[
		['Correct','correct'],
		['Explain','explain'],
		['Escalate','escalate']
	].forEach(([label,className]) => {
		const button=document.createElement('button');
		button.type='button';
		button.classList.add('check-action',className);
		button.textContent=label;

		if(className==='correct') {
			button.addEventListener('click',async () => {
				try {
					await openCorrection(check);
				} catch(error) {
					console.error(error);
					alert('Could not open the correction records.');
				}
			});
		}

		actions.appendChild(button);
	});

	card.append(heading,
		values,
		actions);
	return card;
}

async function showChecks() {
	try {
		const response=await fetch('/api/checks');
		if(!response.ok) {
			throw new Error('Could not load checks');
		}

		const checks=filterChecks(await response.json());
		openCount.textContent='Open · '+checks.length;
		checksList.replaceChildren();

		if(checks.length===0) {
			const empty=document.createElement('div');
			const title=document.createElement('strong');
			const message=document.createElement('span');
			empty.classList.add('empty-state');
			title.textContent='Nothing to check';
			message.textContent=
				'All checks agree for this period.';
			empty.append(title,message);
			checksList.appendChild(empty);
			return;
		}

		checks.forEach((check) => {
			checksList.appendChild(createCheckCard(check));
		});
	} catch(error) {
		console.error(error);
		openCount.textContent='Open · —';
		const message=document.createElement('p');
		message.classList.add('error-message');
		message.textContent=
			'Checks are unavailable. Please try again.';
		checksList.replaceChildren(message);
	}
}

showChecks();

async function openCorrection(check) {
	const type=String(check.check_type||'').replaceAll(' ','_');
	const source=check.related_source||
		(type.includes('_sold')? 'sales':
			type.includes('_purchased')? 'purchases':'production');
	const query=new URLSearchParams({
		item: check.item,
		date: check.check_date,
		check_type: check.check_type,
		related_source: source
	});
	const response=await fetch('/api/correction?'+query);
	if(!response.ok) throw new Error('Could not load correction records');

	const data=await response.json();
	const labels=checkLabels(type);
	const make=(tag,className,text) => {
		const element=document.createElement(tag);
		if(className) element.className=className;
		if(text!==undefined) element.textContent=text;
		return element;
	};
	const page=make('section','correction-page');
	const header=make('header','correction-header');
	const back=make('button','correction-back','\u2190');
	const heading=make('h1','','Back');
	const summary=make('article','correction-summary');
	const summaryHead=make('div','correction-summary-heading');
	const badge=make('span','item-badge',
		check.item==='P Kernel'? 'KER':check.item);
	const summaryTitle=make('div','correction-summary-title');
	const title=make('h2','',
		formatDate(check.check_date)+' \u00b7 '+check.item);
	const subtitle=make('p','',labels.title);
	const values=make('div','correction-summary-values');
	const recordsTitle=make('h2','correction-records-heading',
		'Records for this day');
	const recordList=make('div','correction-records');
	const note=make('aside','correction-note');

	if(check.item==='PKC') badge.classList.add('pkc');
	if(check.item==='P Kernel') badge.classList.add('kernel');
	back.type='button';
	back.setAttribute('aria-label','Back to checks');
	back.addEventListener('click',function() {
		window.location.reload();
	});
	heading.addEventListener('click',function() {
		window.location.reload();
	});

	[
		[labels.store,
		check.storekeeper_says],
		[labels.manager,
		check.manager_says],
		['Difference',
			Math.abs(Number(check.difference)||0)]
	].forEach(([label,value],index) => {
		const row=make('div','correction-summary-row');
		if(index===2) row.classList.add('difference');
		row.append(make('span','',label),
			make('strong','',formatQuantity(value)));
		values.appendChild(row);
	});

	function recordValues(record,
		kind) {
		if(kind==='stock') return [
			['Received',
				record.received,
				true],
			['Issued',
				record.issued,
				true]
		];
		if(kind==='production') return [
			['Kernel used',
				record.kernel_used,
				true],
			['PKO produced',
				record.pko_produced,
				true],
			['PKC produced',
				record.pkc_produced,
				true]
		];
		if(kind==='purchases') return [
			['Supplier',
				record.supplier],
			['Quantity',
				record.quantity_supplied,
				true],
			['Unit cost',
				record.unit_cost]
		];
		return [
			['Customer',
				record.customer],
			['Quantity',
				record.quantity,
				true],
			['Unit price',
				record.unit_price]
		];
	}

	function addRecord(record,kind) {
		const names={
			stock: 'Stock count \u2014 '+check.item,
			production: 'Production report',
			purchases: 'Purchase \u2014 '+(record.supplier||check.item),
			sales: 'Sale \u2014 '+(record.customer||check.item)
		};
		const card=make('article','correction-record');
		const icon=make('span','correction-record-icon '+kind,
			kind==='production'? '\u25f0':'\u25a4');
		const content=make('div','correction-record-content');
		const submitted=record.created_at
			? 'Submitted '+new Date(record.created_at).toLocaleTimeString(
				'en-GB',{
				hour: 'numeric',minute: '2-digit'
			}):'Submission time unavailable';
		const details=make('div','correction-record-details');
		const edit=make('button','correction-edit','Edit');
		const deleteButton=make('button','correction-delete','Delete');
		const recordActions=make('div','correction-record-actions');
		const arrow=make('span','correction-record-arrow','\u203a');

		recordValues(record,kind).forEach(([label,value,quantity]) => {
			const detail=make('span');
			detail.append(make('small','',label),make('strong','',
				quantity? formatQuantity(value):(value||'\u2014')));
			details.appendChild(detail);
		});
		edit.type='button';
		edit.addEventListener('click',(e) => {
			editCheck(record,kind);
		});
		deleteButton.type='button';
		deleteButton.addEventListener('click',async function() {
			const confirmed=window.confirm(
				'Are you sure you want to delete this record?'
			);
			if(!confirmed) {
				return;
			}
			const response=await fetch('/api/correction_delete',{
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					kind: kind,
					record: record
				})
			});
			if(!response.ok) {
				const problem=await response.json();
				alert(problem.err);
				return;
			}
			window.location.reload();
		});
		recordActions.append(edit,deleteButton);
		arrow.setAttribute('aria-hidden','true');
		content.append(make('h3','',names[kind]),
			make('p','',submitted),details);
		card.append(icon,content,recordActions,arrow);
		recordList.appendChild(card);
	}

	(data.stock_record||[]).forEach(record => addRecord(record,'stock'));
	(data.related_record||[]).forEach(record => addRecord(record,source));
	if(!recordList.children.length) {
		recordList.appendChild(make('p','correction-empty',
			'No submitted records were found for this day.'));
	}

	note.append(make('span','correction-note-icon','i'),
		make('p','','Choose a record to edit. The selected form will open '+
			'with submitted values prefilled and the submit button changed to Save.'));
	summaryTitle.append(title,subtitle);
	summaryHead.append(badge,summaryTitle);
	summary.append(summaryHead,values);
	header.append(back,heading);
	page.append(header,summary,recordsTitle,recordList,note);
	document.querySelector('.checks-page').replaceChildren(page);
	window.scrollTo(0,0);
}

function editCheck(record,kind) {
	const formFields={
		stock:
			'/forms.html#inventory-form',
		production:
			'/forms.html#production-form',
		sales: '/forms.html#sales-form',
		purchases:
			'/forms.html#purchases-form'
	}

	sessionStorage.setItem('editRecord',
		JSON.stringify(record));
	sessionStorage.setItem('editKind',
		kind);
	sessionStorage.setItem('checksReturnUrl',
		window.location.pathname+window.location.search);

	window.location.href=
		formFields[kind];
}