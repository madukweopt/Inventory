const menuBtn = document.querySelector('.menu-btn');
const submenuBtn = document.querySelector('.submenu-button');
const mainMenu = document.querySelector('.main-menu');
const submenuOne = document.querySelector('.submenu-one');
const submenuTwo = document.querySelector('.submenu-two');
const submenuAndBtn = document.querySelector('.submenuAndBtn');
const firstBtn = document.querySelector('.first');
const secondBtn = document.querySelector('.second');
const salesForm = document.querySelector('#sales-form');
const purchaseForm = document.querySelector('#purchases-form');
const inventoryForm = document.querySelector('#inventory-form');

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

async function loadSalesDropdown() {
  try {
    const response = await fetch('/api/items');
    const items = await response.json();

    const dropdown = document.querySelector('#product-sold');
    if (!dropdown) {
      return;
    }
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

loadSalesDropdown();

async function loadPurchasesDropdown() {
  try {
  const select = document.querySelector('#material-supplied');
  if (!select) {
    return;
  }
  const response = await fetch('/api/items');
  const items = await response.json();
  const inventories = items.filter((item) => {
   return item.item_type === 'raw_material' || item.item_type === 'consumable';
  });
  inventories.forEach((inventory) => {
    const option = document.createElement('option');
    option.value = inventory.item_id;
    option.textContent = inventory.name;
    select.appendChild(option);
  });
  } catch (err) {
    console.error('could Not load items:', err);
  }
}
loadPurchasesDropdown();

async function loadInventoryDropdown() {
  try {
  const response = await fetch('/api/items');
  const items = await response.json();
  const select = document.querySelector('#stock-name');
  if (!select) {
    return;
  }
  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.item_id;
    option.textContent = item.name;
    select.appendChild(option);
  });
  } catch (err) {
    console.error('Could not load items:', err);
  }
}
loadInventoryDropdown();

async function saveSale(event) {
  event.preventDefault();
  const sale = {
    sales_date: document.querySelector('#sales-date').value,
    customer: document.querySelector('#customer').value,
    item_id: document.querySelector('#product-sold').value,
    quantity: document.querySelector('#sales-quantity').value,
    unit_price: document.querySelector('#unit-price').value
  };
  try {
    const response = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sale)
    });
    if (!response.ok) {
      alert('save failed. Please check the form and try again.');
      return;
    }
    const savedSale = await response.json();
    console.log('saved:', savedSale);
    alert('Sale saved successfully!');
    salesForm.reset();
  } catch (err) {
    console.error('network problem:', err);
    alert('Network problem. Your entry was NOT saved');
  }
}

if (salesForm) {
  salesForm.addEventListener('submit', saveSale);
}

async function savePurchases(event) {
  event.preventDefault();
  const purchase = {
    purchase_date: document.querySelector('#purchase-date').value,
    supplier: document.querySelector('#supplier').value,
    item_id: document.querySelector('#material-supplied').value,
    quantity_supplied: document.querySelector('#quantity-supplied').value,
    unit_cost: document.querySelector('#unit-cost').value
  };
  try {
    const response = await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(purchase)
    });
    if (!response.ok) {
      alert('Save failed. Check entries and try again');
      return;
    }
    const savedPurchase = await response.json();
    console.log('saved:', savedPurchase);
    alert('Purchase submited');
    purchaseForm.reset();
  } catch (err) {
    console.error('Network problem', err);
    alert('Network problem. Failed to submit');
  }
}

if (purchaseForm) {
  purchaseForm.addEventListener('submit', savePurchases);
}

async function saveInventory(event) {
  event.preventDefault();
  const inventoryItems = {
    count_date: document.querySelector('#stock-date').value,
    item_id: document.querySelector('#stock-name').value,
    received: document.querySelector('#received').value,
    issued: document.querySelector('#issued').value
  };
  try {
    const response = await fetch('/api/stock_counts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(inventoryItems)
    });
    if (!response.ok) {
      alert('failed to submit. Check your entries');
      return;
    }
    const savedStock = await response.json();
    console.log('saved:', savedStock);
    alert('Stock submited successfully');
    inventoryForm.reset();
  } catch (err) {
    console.error(err);
    alert('Network problem. Failed to submit');
  }
}
if (inventoryForm) {
  inventoryForm.addEventListener('submit', saveInventory);
}

