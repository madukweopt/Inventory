const menuBtn = document.querySelector('.menu-btn');
const submenuBtn = document.querySelector('.submenu-button');
const mainMenu = document.querySelector('.main-menu');
const submenuOne = document.querySelector('.submenu-one');
const submenuTwo = document.querySelector('.submenu-two');
const submenuAndBtn = document.querySelector('.submenuAndBtn');
const firstBtn = document.querySelector('.first');
const secondBtn = document.querySelector('.second');

function displaySubmenuBtn(event) {
  event.stopPropagation();
  submenuAndBtn.classList.toggle('show');
}

function removeNav(e) {
  const clickedMainMenu = mainMenu.contains(e.target);
  console.log(clickedMainMenu);
  if (clickedMainMenu === false) {
    submenuAndBtn.classList.remove('show');
  firstBtn.classList.remove('show');
  secondBtn.classList.remove('show');
  }
}

if (menuBtn) {
 menuBtn.addEventListener('click', displaySubmenuBtn);
document.addEventListener('click', removeNav); 
}


function displayForms(event) {
  submenuOne.classList.toggle('show');
  event.stopPropagation();
}

if (firstBtn) {
  firstBtn.addEventListener('click', displayForms);
}

function displayData(e) {
  submenuTwo.classList.toggle('show');
  e.stopPropagation();
}

if (secondBtn) {
  secondBtn.addEventListener('click', displayData);
}

function displaySelectedForm() {
  const forms = document.querySelectorAll('.card');
  const formId = window.location.hash;
  console.log(formId);
  forms.forEach((form) => {
    form.classList.remove('show')
  });
  if (!formId) {
    return;
  }
  const selectedFormId = document.querySelector(formId);
  if (!selectedFormId) {
    return;
  }
  selectedFormId.closest('.card').classList.add('show');
}
displaySelectedForm();

window.addEventListener('hashchange', displaySelectedForm);

async function loadItemsDropdown() {
  try {
    const response = await fetch('/api/items');
    const items = await response.json();

    const dropdown = document.querySelector('#product-sold');

    const products = items.filter(function (item) {
      return item.item_type === 'product';
    });

    products.forEach(function (item) {
      const option = document.createElement('option');
      option.value = item.item_id;
      option.textContent = item.name;
      dropdown.appendChild(option);
    });
  } catch (err) {
    console.error('Could not load items:', err);
  }
}

loadItemsDropdown();