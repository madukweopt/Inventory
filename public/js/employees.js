// Employees and payroll: adding employees, their cards and profile, salary changes, and the payroll page.
// Moved from forms.js unchanged. Loaded on forms.html after forms.js, whose shared page elements and helpers it uses;
// page scripts share their top-level names, so forms.js and the other files call these functions directly.

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

// Handles click events from addEmployee.
addEmployee.addEventListener('click',() => {
	window.location.href='forms.html#employee-addition';
})

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

employeeFormBtns();

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
