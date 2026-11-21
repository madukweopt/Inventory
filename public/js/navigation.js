const menuBtn=document.querySelector(".menu-btn");
const submenuBtn=document.querySelector(".submenu-button");
const mainMenu=document.querySelector(".main-menu");
const navClose=document.querySelector(".nav-close");
const submenuOne=document.querySelector(".submenu-one");
const submenuTwo=document.querySelector(".submenu-two");
const submenuAndBtn=document.querySelector(".submenuAndBtn");
const firstBtn=document.querySelector(".first");
const secondBtn=document.querySelector(".second");
const logoutBtn=document.querySelector('.nav-logout');
const customersBtn=document.querySelector('#customers-button');
const suppliersBtn=document.querySelector('#suppliers-button');
const partnersBtn=document.querySelector('#partners-button');
const assetsBtn=document.querySelector('#assets-button');
const employeesBtn=document.querySelector('#employees-button');
const companyDetailsBtn=document.querySelector('#company-details-button');
const pricesBtn=document.querySelector('#prices-button');
const weighingTasksBtn=document.querySelector('#weighing-tasks-button');
const pendingWeighingBadge=document.querySelector('.pending-weighing-badge');
const manageUsersBtn=document.querySelector('#manage-users-button');
const sopsBtn=document.querySelector('#sops-button');
if(sopsBtn) sopsBtn.addEventListener('click',()=>{window.location.href='/sops.html';});
const switchAccountBtn=document.createElement('button');
switchAccountBtn.type='button';
switchAccountBtn.classList.add('submenu-button');
switchAccountBtn.id='switch-account-button';
switchAccountBtn.hidden=true;
switchAccountBtn.textContent='Switch Account';
if(manageUsersBtn) {
	manageUsersBtn.insertAdjacentElement('afterend',switchAccountBtn);
}
let currentUser=null;
let pendingBadgeTimer=null;

// Loads the number of activities still waiting for Storekeeper quantities.
async function refreshPendingWeighingBadge() {
	if(!pendingWeighingBadge) return;
	try {
		const response=await fetch('/api/weighing-requests');
		if(!response.ok) throw new Error('Could not load pending weighing count');
		const requests=await response.json();
        const deliveries=await fetch('/api/delivery-notes/pending');
        if(!deliveries.ok)throw new Error('Could not load pending deliveries');
        const jobs=new Set(requests.map(row=>'request:'+row.request_id));
        for(const row of await deliveries.json())jobs.add(row.request_id?'request:'+row.request_id:'delivery:'+row.sales_id);
        const count=jobs.size;
        pendingWeighingBadge.textContent=String(count);
        pendingWeighingBadge.hidden=count===0;
        weighingTasksBtn.setAttribute('aria-label','Pending Weighing, '+count+' waiting');
	} catch(error) {
		console.error(error);
		pendingWeighingBadge.hidden=true;
	}
}

window.refreshPendingWeighingBadge=refreshPendingWeighingBadge;

// Shows only the navigation choices and dashboard sections allowed for the signed-in role.
function applyRoleVisibility(user) {
	const role=user.role;
	document.documentElement.dataset.userRole=role;

	const hide=function(selector,shouldHide) {
		document.querySelectorAll(selector).forEach(function(element) {
			element.hidden=shouldHide;
		});
	};

	hide('a[href$="#inventory-form"]',role!=='admin');
    hide('#consumable-usage-button',!['admin','storekeeper'].includes(role));
	hide('a[href$="#inventory-data"]',role==='manager');
	hide('a[href$="#stock-history"]',role!=='admin');
	hide('a[href$="#purchases-form"], a[href$="#sales-form"], a[href$="#production-form"], a[href$="#expenses-form"]',role==='storekeeper');
	hide('.first',role==='storekeeper');
	hide('#employees-button',role==='storekeeper');
	hide('#partners-button, #assets-button',role==='storekeeper');
	hide('#manage-users-button',role!=='admin');
	hide('#production-panel, #sales-panel',role==='storekeeper');
	hide('#profit-panel',role!=='admin');
	hide('.dashboard-checks-wrap',role!=='admin');
	if(switchAccountBtn) {
		switchAccountBtn.hidden=role!=='admin'&&!user.switched_from_admin;
		switchAccountBtn.textContent=user.switched_from_admin?
			'Return to Admin':'Switch Account';
	}

	window.dispatchEvent(new CustomEvent('userroleloaded',{ detail: user }));
}

// Opens the navigation submenu selected by the user.
function displaySubmenuBtn(event) {
	event.stopPropagation();
	submenuAndBtn.classList.toggle("show");
}

// Closes the navigation when the user clicks outside it.
function removeNav(e) {
	const menuIsOpen=submenuAndBtn.classList.contains('show');
	const clickedPanel=submenuAndBtn.contains(e.target);
	const clickedMenuButton=menuBtn.contains(e.target);
	if(menuIsOpen&&!clickedPanel&&!clickedMenuButton) {
		submenuAndBtn.classList.remove("show");
		firstBtn.classList.remove("show");
		secondBtn.classList.remove("show");
	}
}

if(menuBtn) {
	menuBtn.addEventListener("click",displaySubmenuBtn);
	document.addEventListener("click",removeNav);
	navClose.addEventListener("click",displaySubmenuBtn);
}

// Navigates to the selected data-entry form.
function displayForms(event) {
	submenuOne.classList.toggle("show");
	event.stopPropagation();
}

if(firstBtn) {
	firstBtn.addEventListener("click",displayForms);
}

// Navigates to the selected data listing.
function displayData(e) {
	submenuTwo.classList.toggle("show");
	e.stopPropagation();
}

if(secondBtn) {
	secondBtn.addEventListener("click",displayData);
}

// After a report form is saved and cleared, go back to the top and open the navigation panel with the
// Forms list expanded, so the next form can be chosen straight away.
// Closing a Data page does the same with the Data list expanded.
function openNavSection(section) {
	window.scrollTo({top:0,behavior:'smooth'});
	if(!submenuAndBtn) return;
	submenuAndBtn.classList.add('show');
	const [button,list]=section==='data'?[secondBtn,submenuTwo]:[firstBtn,submenuOne];
	if(button&&!button.hidden&&list) {
		button.classList.add('show');
		list.classList.add('show');
	}
}
function openFormsMenu() { openNavSection('forms'); }
window.openFormsMenu=openFormsMenu;
window.openDataMenu=function() { openNavSection('data'); };
// A cancelled edit reopens the forms page with ?menu=forms so the menu shows on a clean page.
if(new URLSearchParams(location.search).get('menu')==='forms') {
	history.replaceState(null,'',location.pathname);
	openFormsMenu();
}

const submenuLinks=document.querySelectorAll(".submenu-one a, .submenu-two a, #customers-button, #suppliers-button, #partners-button, #assets-button, #employees-button, #company-details-button, #prices-button, #weighing-tasks-button");
// Processes each entry in the collection.
submenuLinks.forEach(function(link) {
	// Handles click events from link.
	link.addEventListener("click",function() {
		submenuAndBtn.classList.remove("show");
		firstBtn.classList.remove("show");
		secondBtn.classList.remove("show");
	});
});

const dashboardBtn=document.querySelector("#dashboard-btn");
if(dashboardBtn) {
	// Handles click events from dashboardBtn.
	dashboardBtn.addEventListener("click",function() {
		window.location.href="/index.html";
	});
}

if(customersBtn) {
	// Handles click events from customersBtn.
	customersBtn.addEventListener("click",function() {
		window.location.href="/forms.html#customers";
	});
}

if(suppliersBtn) {
	// Handles click events from suppliersBtn.
	suppliersBtn.addEventListener('click',() => {
		window.location.href='/forms.html#suppliers';
	});
}

// Opens the partners who fabricate, install, supply equipment or repair for the company.
if(partnersBtn) {
	partnersBtn.addEventListener('click',() => {
		window.location.href='/forms.html#other-partners';
	});
}

// Opens the register of machines, tanks and other things the company owns.
if(assetsBtn) {
	assetsBtn.addEventListener('click',() => {
		window.location.href='/forms.html#capital-assets';
	});

}

if(employeesBtn) {
	// Handles click events from employeesBtn.
	employeesBtn.addEventListener('click',() => {
		window.location.href='/forms.html#employees';
	})

}

if(companyDetailsBtn) {
	// Opens the database-backed company details page.
	companyDetailsBtn.addEventListener('click',() => {
		window.location.href='/forms.html#company-details';
	});
}

if(pricesBtn) {
	// Opens the product price list and price editor.
	pricesBtn.addEventListener('click',() => {
		window.location.href='/forms.html#prices';
	});
}

const consumableUsageBtn=document.querySelector('#consumable-usage-button');
if(consumableUsageBtn)consumableUsageBtn.addEventListener('click',()=>{window.location.href='/forms.html#consumable-usage';});

if(weighingTasksBtn) {
	// Opens the Storekeeper's authorised work waiting for physical quantities.
	weighingTasksBtn.addEventListener('click',() => {
		window.location.href='/forms.html#weighing-tasks';
	});
}

// Loads and displays the currently signed-in user.
async function loadCurrentUser() {
	const response=await fetch("/api/current-user");
	if(!response.ok) {
		return null;
	}
	const result=await response.json();
	currentUser=result;
	const loggedIn=document.querySelector(".login-role");
	if(loggedIn) {
		loggedIn.textContent=result.username;
	}
	applyRoleVisibility(result);
	refreshPendingWeighingBadge();
	if(!pendingBadgeTimer) pendingBadgeTimer=window.setInterval(refreshPendingWeighingBadge,30000);
	return result;
}

window.currentUserPromise=loadCurrentUser();

// Ends the current session and returns to the login page.
async function logout() {
	const response=await fetch('/api/logout',{
		method: 'POST'
	});
	if(response.ok) {
		window.location.href='/'
	}
}
if(logoutBtn) {
	logoutBtn.addEventListener('click',logout)
}

// Creates the account-management pop-up shared by every page with navigation.
function createUserDialog() {
	const dialog=document.createElement('dialog');
	dialog.classList.add('user-account-dialog');
	dialog.innerHTML=`
		<form class="user-account-form">
			<div class="user-account-heading">
				<div>
					<h2>Create User</h2>
					<p>Create, edit or delete a login account.</p>
				</div>
				<button type="button" class="user-dialog-close" aria-label="Close">×</button>
			</div>

			<label for="user-account-select">Existing account</label>
			<select id="user-account-select">
				<option value="">Create a new account</option>
			</select>

			<label for="account-username">Username</label>
			<input id="account-username" autocomplete="off" required />

			<label for="account-role">Role</label>
			<input id="account-role" list="account-role-options" autocomplete="off" required />
			<datalist id="account-role-options">
				<option value="admin"></option>
				<option value="manager"></option>
				<option value="storekeeper"></option>
			</datalist>

			<label for="account-password">Password</label>
			<input id="account-password" type="password" minlength="8" autocomplete="new-password" />
			<small class="user-password-help">A new account requires a password of at least 8 characters.</small>

			<p class="user-account-message" role="status"></p>

			<div class="user-account-actions">
				<button type="button" class="user-create-button">Create User</button>
				<button type="button" class="user-edit-button" disabled>Edit User</button>
				<button type="button" class="user-delete-button" disabled>Delete User</button>
			</div>
		</form>
	`;
	document.body.appendChild(dialog);
	return dialog;
}

const userDialog=manageUsersBtn? createUserDialog():null;
let userAccounts=[];

// Displays a success or error message inside the user form.
function showUserMessage(message,isError=false) {
	const messageElement=userDialog.querySelector('.user-account-message');
	messageElement.textContent=message;
	messageElement.classList.toggle('error',isError);
}

// Clears the account fields so the administrator can create a new user.
function resetUserForm() {
	const accountSelect=userDialog.querySelector('#user-account-select');
	accountSelect.value='';
	userDialog.querySelector('#account-username').value='';
	userDialog.querySelector('#account-role').value='';
	userDialog.querySelector('#account-password').value='';
	userDialog.querySelector('.user-edit-button').disabled=true;
	userDialog.querySelector('.user-delete-button').disabled=true;
	userDialog.querySelector('.user-create-button').disabled=false;
	userDialog.querySelector('.user-password-help').textContent=
		'A new account requires a password of at least 8 characters.';
}

// Loads the saved login accounts into the selection list.
async function loadUserAccounts(selectedUserId='') {
	const response=await fetch('/api/users');
	const result=await response.json();
	if(!response.ok) {
		throw new Error(result.err||result.message||'Could not load user accounts');
	}

	userAccounts=result;
	const accountSelect=userDialog.querySelector('#user-account-select');
	accountSelect.replaceChildren(new Option('Create a new account',''));
	userAccounts.forEach(function(account) {
		accountSelect.appendChild(
			new Option(account.username+' — '+account.role,account.user_id)
		);
	});

	if(selectedUserId) {
		accountSelect.value=String(selectedUserId);
		accountSelect.dispatchEvent(new Event('change'));
	} else {
		resetUserForm();
	}
}

// Returns the username, role and optional replacement password from the form.
function readUserForm() {
	return {
		username: userDialog.querySelector('#account-username').value.trim(),
		role: userDialog.querySelector('#account-role').value.trim(),
		password: userDialog.querySelector('#account-password').value
	};
}

if(manageUsersBtn&&userDialog) {
	const accountSelect=userDialog.querySelector('#user-account-select');
	const createButton=userDialog.querySelector('.user-create-button');
	const editButton=userDialog.querySelector('.user-edit-button');
	const deleteButton=userDialog.querySelector('.user-delete-button');
	userDialog.querySelector('form').addEventListener('submit',function(event) {
		event.preventDefault();
	});

	manageUsersBtn.addEventListener('click',async function() {
		submenuAndBtn.classList.remove('show');
		showUserMessage('');
		try {
			await loadUserAccounts();
			userDialog.showModal();
		} catch(error) {
			appNotify(error.message);
		}
	});

	userDialog.querySelector('.user-dialog-close').addEventListener('click',function() {
		userDialog.close();
	});

	accountSelect.addEventListener('change',function() {
		showUserMessage('');
		const selected=userAccounts.find(function(account) {
			return String(account.user_id)===accountSelect.value;
		});

		if(!selected) {
			resetUserForm();
			return;
		}

		userDialog.querySelector('#account-username').value=selected.username;
		userDialog.querySelector('#account-role').value=selected.role;
		userDialog.querySelector('#account-password').value='';
		userDialog.querySelector('.user-password-help').textContent=
			'Leave the password empty to keep the current password.';
		createButton.disabled=true;
		editButton.disabled=false;
		deleteButton.disabled=false;
	});

	createButton.addEventListener('click',async function() {
		const account=readUserForm();
		try {
			const response=await fetch('/api/users',{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(account)
			});
			const result=await response.json();
			if(!response.ok) throw new Error(result.err||result.message);
			await loadUserAccounts(result.user_id);
			showUserMessage('User account created successfully.');
		} catch(error) {
			showUserMessage(error.message||'Could not create the user account',true);
		}
	});

	editButton.addEventListener('click',async function() {
		const userId=accountSelect.value;
		const account=readUserForm();
		try {
			const response=await fetch('/api/users/'+userId,{
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(account)
			});
			const result=await response.json();
			if(!response.ok) throw new Error(result.err||result.message);
			await loadUserAccounts(result.user_id);
			showUserMessage('User account updated successfully.');
		} catch(error) {
			showUserMessage(error.message||'Could not update the user account',true);
		}
	});

	deleteButton.addEventListener('click',async function() {
		const userId=accountSelect.value;
		const selected=userAccounts.find(function(account) {
			return String(account.user_id)===userId;
		});
		if(!selected||!confirm('Delete the account for '+selected.username+'?')) return;

		try {
			const response=await fetch('/api/users/'+userId,{ method: 'DELETE' });
			const result=await response.json();
			if(!response.ok) throw new Error(result.err||result.message);
			await loadUserAccounts();
			showUserMessage('User account deleted successfully.');
		} catch(error) {
			showUserMessage(error.message||'Could not delete the user account',true);
		}
	});
}

// Creates the small account selector used when an administrator switches roles.
function createSwitchAccountDialog() {
	const dialog=document.createElement('dialog');
	dialog.classList.add('switch-account-dialog');
	dialog.innerHTML=`
		<form class="switch-account-form">
			<div class="user-account-heading">
				<div>
					<h2>Switch Account</h2>
					<p>Use a manager or storekeeper account without entering its password.</p>
				</div>
				<button type="button" class="switch-dialog-close" aria-label="Close">×</button>
			</div>
			<label for="switch-account-select">Account</label>
			<select id="switch-account-select" required>
				<option value="">Choose an account</option>
			</select>
			<p class="switch-account-message" role="status"></p>
			<button type="submit" class="switch-account-submit">Switch Account</button>
		</form>`;
	document.body.appendChild(dialog);
	return dialog;
}

const switchAccountDialog=manageUsersBtn? createSwitchAccountDialog():null;

if(switchAccountBtn&&switchAccountDialog) {
	const switchSelect=switchAccountDialog.querySelector('#switch-account-select');
	const switchMessage=switchAccountDialog.querySelector('.switch-account-message');

	switchAccountBtn.addEventListener('click',async function() {
		if(currentUser&&currentUser.switched_from_admin) {
			const response=await fetch('/api/return-to-admin',{ method: 'POST' });
			const result=await response.json();
			if(!response.ok) {
				appNotify(result.message||'Could not return to the admin account');
				return;
			}
			window.location.replace('/index.html');
			return;
		}

		try {
			const response=await fetch('/api/users');
			const accounts=await response.json();
			if(!response.ok) {
				throw new Error(accounts.message||accounts.err||'Could not load accounts');
			}
			switchSelect.replaceChildren(new Option('Choose an account',''));
			accounts
				.filter(account => ['manager','storekeeper'].includes(account.role))
				.forEach(function(account) {
					switchSelect.appendChild(new Option(
						account.username+' — '+account.role,
						account.user_id
					));
				});
			switchMessage.textContent=switchSelect.options.length===1?
				'Create a manager or storekeeper account first.':'';
			switchAccountDialog.showModal();
		} catch(error) {
			appNotify(error.message);
		}
	});

	switchAccountDialog.querySelector('.switch-dialog-close').addEventListener('click',function() {
		switchAccountDialog.close();
	});

	switchAccountDialog.querySelector('form').addEventListener('submit',async function(event) {
		event.preventDefault();
		if(!switchSelect.value) return;
		const response=await fetch('/api/switch-account',{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ user_id: switchSelect.value })
		});
		const result=await response.json();
		if(!response.ok) {
			switchMessage.textContent=result.message||'Could not switch account';
			return;
		}
		window.location.replace('/index.html');
	});
}
