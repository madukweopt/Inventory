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
function displaySubmenuBtn(event) {
	event.stopPropagation();
	submenuAndBtn.classList.toggle("show");
}

function removeNav(e) {
	const clickedMainMenu=mainMenu.contains(e.target);
	console.log(clickedMainMenu);
	if(clickedMainMenu===false) {
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

function displayForms(event) {
	submenuOne.classList.toggle("show");
	event.stopPropagation();
}

if(firstBtn) {
	firstBtn.addEventListener("click",displayForms);
}

function displayData(e) {
	submenuTwo.classList.toggle("show");
	e.stopPropagation();
}

if(secondBtn) {
	secondBtn.addEventListener("click",displayData);
}

const submenuLinks=document.querySelectorAll(".submenu-one a, .submenu-two a, #customers-button, #suppliers-button");
submenuLinks.forEach(function(link) {
	link.addEventListener("click",function() {
		submenuAndBtn.classList.remove("show");
		firstBtn.classList.remove("show");
		secondBtn.classList.remove("show");
	});
});

const dashboardBtn=document.querySelector("#dashboard-btn");
if(dashboardBtn) {
	dashboardBtn.addEventListener("click",function() {
		window.location.href="/index.html";
	});
}

if(customersBtn) {
	customersBtn.addEventListener("click",function() {
		window.location.href="/forms.html#customers";
	});
}

if(suppliersBtn) {
	suppliersBtn.addEventListener('click',() => {
		window.location.href='/forms.html#suppliers';
	});

}

async function updateLoggedIn() {
	const response=await fetch("/api/current-user");
	if(!response.ok) {
		return;
	}
	const result=await response.json();
	const loggedIn=document.querySelector(".login-role");
	if(loggedIn) {
		loggedIn.textContent=result.username;
	}
}

updateLoggedIn();

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