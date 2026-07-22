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
const productionForm = document.querySelector('#production-form');
const expensesForm = document.querySelector('#expenses-form');

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
  if (formId === '#sales-data') {
    loadSalesData();
  }else if (formId === '#inventory-data'){
    loadInventoryData();
  }else if (formId === '#purchases-data') {
    loadPurchasesData();
  }else if (formId === '#production-data') {
    loadProductionData();
  }else if (formId === '#expenses-data') {
    loadExpensesData();
  }
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

async function saveProduction(event){
  event.preventDefault();
  const production = {
    production_date: document.querySelector('#production-date').value,
    kernel_used: document.querySelector('#kernel-used').value,
    pko_produced: document.querySelector('#oil-produced').value,
    pkc_produced: document.querySelector('#pkc-produced').value,
    production_hours: document.querySelector('#production-hours').value,
    down_time: document.querySelector('#down-time').value
  };
  try {
  const response = await fetch('/api/production', {
    method: 'POST',
    headers: { 'content-type': 'application/json'
    },
    body: JSON.stringify(production)
  });
  if (!response.ok) {
    const problem = await response.json();
    if (response.status === 400) {
      alert('Failed to submit.' + problem.err);
    }else{
      alert('Failed to submit. Internal server problem');
    } return;
    }
    const savedProduction = await response.json();
    console.log('saved:', savedProduction);
    alert('Production submitted successfully');
    productionForm.reset();
  }catch (err){
    console.error(err);
    alert('Network problem. Failed to submit');
  }
}
if (productionForm) {
  productionForm.addEventListener('submit', saveProduction);
}

async function saveExpenses(event) {
  event.preventDefault();
  const expense = {
    expense_date: document.querySelector('#expense-date').value,
    category: document.querySelector('#expense-category').value,
    description: document.querySelector('#expense-description').value,
    amount_spent: document.querySelector('#expense-amount').value
  };
try {
  const response = await fetch('/api/expenses', {
    method: 'POST',
    headers: { 'content-type': 'application/json'
    },
    body: JSON.stringify(expense)
  });
  if (!response.ok) {
    if (response.status === 400) {
      const problem = await response.json();
      alert('Failed to submit ' + problem.err);
      console.log(problem.err);
    }else {
      alert('Failed to submit. Internal server error');
    }
    return;
  }
  const savedExpense = await response.json();
  alert('Expense submitted successfully');
  expensesForm.reset();
  console.log('submitted:', savedExpense);
} catch (err) {
  console.error(err);
  alert('Network problem. Failed to submit');
}
}
if (expensesForm) {
  expensesForm.addEventListener('submit', saveExpenses);
}

async function loadSalesData(){
  try{
    
    const response = await fetch('/api/sales');
    const tableBody = document.querySelector('#sales-data-body');
    if (!tableBody) {
      return;
    }
    if (!response.ok) {
    const problem = await response.json();
    alert(problem.err);
    return;
    }
    const sales = await response.json();
    tableBody.innerHTML = ``;
    sales.forEach(function(sale){
      const row = document.createElement('tr');
      const submitted = new Date(sale.created_at);
      const formatedDate = submitted.toLocaleDateString('en-NG', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      }).replace(/\//g, '-');
      const formatedTime = submitted.toLocaleTimeString('en-NG', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const dateAndTime = formatedDate + ' ' + formatedTime;
      const formatedTotal = Number(sale.total).toLocaleString('en-NG');
        const cells = [
          dateAndTime,
          sale.customer,
          sale.name,
          sale.quantity,
          sale.unit_price,
          formatedTotal];
          cells.forEach((value) => {
            const tableData = document.createElement('td');
            tableData.textContent = value;
            row.appendChild(tableData);
          });
          tableBody.appendChild(row);
    })
  }
  catch (err){
    console.error(err);
    alert('Failed to load Sales. Network problem');
  }
}
loadSalesData();

async function loadInventoryData() {
  try {
    const response = await fetch('/api/stock_counts');
    if (!response.ok) {
      const problem = await response.json();
      console.log(problem.err);
      alert(problem.err);
      return;
    }
    const datalists = await response.json();
    const inventoryDataBody = document.querySelector('#inventory-data-body');
    inventoryDataBody.innerHTML ="";
    datalists.forEach((dataItem) => {
      const row = document.createElement('tr');
      const submittedAt = new Date(dataItem.created_at);
      const formatedDate = submittedAt.toLocaleDateString('en-NG', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      }).replace(/\//g, '-');
      const formatedTime = submittedAt.toLocaleTimeString('en-NG', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const dateAndTime = formatedDate + ' ' + formatedTime;
      
      const cells = [
        dateAndTime,
        dataItem.name,
        dataItem.opening_stock,
        dataItem.received,
        dataItem.issued,
        dataItem.closing_stock
        ]
        cells.forEach((item) => {
          const td = document.createElement('td');
          td.textContent = item;
          row.appendChild(td);
        });
        inventoryDataBody.appendChild(row);
    });
  } catch (error) {
    console.error(error.message);
    alert(error.message);
  }
}

async function loadPurchasesData(){
  try{
    const purchasesDataBody = document.querySelector('#purchases-data-body');
    const response = await fetch('/api/purchases');
    if (response.status === 500) {
      const problem = await response.json();
      alert(problem.err);
      return;
    }
      if (!response.ok) {
        alert('Request failed' + ' ' + response.statusText);
        return;
      }
      const purchasesList = await response.json();
      purchasesDataBody.innerHTML = '';
      purchasesList.forEach(purchase => {
        const row = document.createElement('tr');
        const submittedAt = new Date(purchase.created_at);
        const formatedDate = submittedAt.toLocaleDateString('en-NG', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit'
        }).replace(/\//g, '-');
        const formatedTime = submittedAt.toLocaleTimeString('en-NG', {
          hour: '2-digit',
          minute: '2-digit'
        });
        const dateAndTime = formatedDate + ' ' + formatedTime;
        const cells = [
          dateAndTime,
          purchase.supplier,
          purchase.name,
          purchase.quantity_supplied,
          purchase.unit_cost,
          purchase.total_cost
          ];
          
          cells.forEach((value) => {
            const td = document.createElement('td');
            td.textContent = value;
            row.appendChild(td);
          });
          purchasesDataBody.appendChild(row)
      });
    } catch (error){
      console.error(error.message)
      alert('Something went Wrong' + ' ' + error.message);
    };
  };
  
async function loadProductionData(){
  try{
    const productionDataBody = document.querySelector('#production-data-body');
    const response = await fetch('/api/production');
    if (response.status === 500) {
      const problem = await response.json();
      alert(problem.err);
      return;
    }
      if (!response.ok) {
        alert('Request failed' + ' ' + response.statusText);
        return;
      }
      const productionList = await response.json();
      productionDataBody.innerHTML = '';
      productionList.forEach(production => {
        const row = document.createElement('tr');
        const submittedAt = new Date(production.created_at);
        const formatedDate = submittedAt.toLocaleDateString('en-NG', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit'
        }).replace(/\//g, '-');
        const formatedTime = submittedAt.toLocaleTimeString('en-NG', {
          hour: '2-digit',
          minute: '2-digit'
        });
        const dateAndTime = formatedDate + ' ' + formatedTime;
        const cells = [
          dateAndTime,
          production.kernel_used,
          production.pko_produced,
          production.pkc_produced,
          production.pko_yield,
          production.pkc_yield,
          production.production_hours,
          production.down_time
          ];
          
          cells.forEach((value) => {
            const td = document.createElement('td');
            td.textContent = value;
            row.appendChild(td);
          });
          productionDataBody.appendChild(row)
      });
    } catch (error){
      console.error(error.message)
      alert('Something went Wrong' + ' ' + error.message);
    };
  };
  
  async function loadExpensesData(){
  try{
    const expensesDataBody = document.querySelector('#expenses-data-body');
    const response = await fetch('/api/expenses');
    if (response.status === 500) {
      const problem = await response.json();
      alert(problem.err);
      return;
    }
      if (!response.ok) {
        alert('Request failed' + ' ' + response.statusText);
        return;
      }
      const expensesList = await response.json();
      expensesDataBody.innerHTML = '';
      expensesList.forEach(expense => {
        const row = document.createElement('tr');
        const submittedAt = new Date(expense.created_at);
        const formatedDate = submittedAt.toLocaleDateString('en-NG', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit'
        }).replace(/\//g, '-');
        const formatedTime = submittedAt.toLocaleTimeString('en-NG', {
          hour: '2-digit',
          minute: '2-digit'
        });
        const dateAndTime = formatedDate + ' ' + formatedTime;
        const cells = [
          dateAndTime,
          expense.category,
          expense.description,
          expense.amount_spent,
          ];
          
          cells.forEach((value) => {
            const td = document.createElement('td');
            td.textContent = value;
            row.appendChild(td);
          });
          expensesDataBody.appendChild(row)
      });
    } catch (error){
      console.error(error.message)
      alert('Something went Wrong' + ' ' + error.message);
    };
  };
  
  


