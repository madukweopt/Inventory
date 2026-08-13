const menuBtn = document.querySelector(".menu-btn");
const submenuBtn = document.querySelector(".submenu-button");
const mainMenu = document.querySelector(".main-menu");
const navClose = document.querySelector(".nav-close");
const submenuOne = document.querySelector(".submenu-one");
const submenuTwo = document.querySelector(".submenu-two");
const submenuAndBtn = document.querySelector(".submenuAndBtn");
const firstBtn = document.querySelector(".first");
const secondBtn = document.querySelector(".second");
const salesForm = document.querySelector("#sales-form");
const purchaseForm = document.querySelector("#purchases-form");
const inventoryForm = document.querySelector("#inventory-form");
const productionForm = document.querySelector("#production-form");
const expensesForm = document.querySelector("#expenses-form");
const salesDate = document.querySelector("#sales-date");
const customer = document.querySelector("#customer");
const productSold = document.querySelector("#product-sold");
const salesQuantity = document.querySelector("#sales-quantity");
const unitPrice = document.querySelector("#unit-price");
const purchaseDate = document.querySelector("#purchase-date");
const supplier = document.querySelector("#supplier");
const materialSupplied = document.querySelector("#material-supplied");
const quantitySupplied = document.querySelector("#quantity-supplied");
const unitCost = document.querySelector("#unit-cost");
const stockDate = document.querySelector("#stock-date");
const stockName = document.querySelector("#stock-name");
const received = document.querySelector("#received");
const issued = document.querySelector("#issued");
const productionDate = document.querySelector("#production-date");
const kernelUsed = document.querySelector("#kernel-used");
const oilProduced = document.querySelector("#oil-produced");
const pkcProduced = document.querySelector("#pkc-produced");
const productionHours = document.querySelector("#production-hours");
const downTime = document.querySelector("#down-time");
const expenseDate = document.querySelector("#expense-date");
const expenseCategory = document.querySelector("#expense-category");
const expenseDescription = document.querySelector("#expense-description");
const expenseAmount = document.querySelector("#expense-amount");
const dateInput = document.querySelector("#dashboard-date");
const today = document.querySelector(".today");
const stockPanel = document.querySelector("#stock-panel");

function displaySubmenuBtn(event) {
   event.stopPropagation();
   submenuAndBtn.classList.toggle("show");
}

function removeNav(e) {
   const clickedMainMenu = mainMenu.contains(e.target);
   console.log(clickedMainMenu);
   if (clickedMainMenu === false) {
      submenuAndBtn.classList.remove("show");
      firstBtn.classList.remove("show");
      secondBtn.classList.remove("show");
   }
}

if (menuBtn) {
   menuBtn.addEventListener("click", displaySubmenuBtn);
   document.addEventListener("click", removeNav);
   navClose.addEventListener("click", displaySubmenuBtn);
}

function displayForms(event) {
   submenuOne.classList.toggle("show");
   event.stopPropagation();
}

if (firstBtn) {
   firstBtn.addEventListener("click", displayForms);
}

function displayData(e) {
   submenuTwo.classList.toggle("show");
   e.stopPropagation();
}

if (secondBtn) {
   secondBtn.addEventListener("click", displayData);
}

function displaySelectedForm() {
   const forms = document.querySelectorAll(".card");
   const formId = window.location.hash;
   forms.forEach(form => {
      form.classList.remove("show");
   });
   if (!formId) {
      return;
   }
   const selectedFormId = document.querySelector(formId);
   if (!selectedFormId) {
      return;
   }
   selectedFormId.closest(".card").classList.add("show");
   if (formId === "#sales-data") {
      loadSalesData();
   } else if (formId === "#inventory-data") {
      loadInventoryData();
   } else if (formId === "#purchases-data") {
      loadPurchasesData();
   } else if (formId === "#production-data") {
      loadProductionData();
   } else if (formId === "#expenses-data") {
      loadExpensesData();
   }
}
displaySelectedForm();

window.addEventListener("hashchange", displaySelectedForm);

async function loadSalesDropdown() {
   try {
      const response = await fetch("/api/items");
      const items = await response.json();

      if (!productSold) {
         return;
      }
      const products = items.filter(function (item) {
         return item.item_type === "product";
      });

      products.forEach(function (item) {
         const option = document.createElement("option");
         option.value = item.item_id;
         option.textContent = item.name;
         productSold.appendChild(option);
      });
   } catch (err) {
      console.error("Could not load items:", err);
   }
}

async function loadPurchasesDropdown(select = materialSupplied) {
   try {
      if (!select) {
         return;
      }
      const response = await fetch("/api/items");
      const items = await response.json();
      const inventories = items.filter(item => {
         return (
            item.item_type === "raw_material" ||
            item.item_type === "consumable"
         );
      });
      inventories.forEach(inventory => {
         const option = document.createElement("option");
         option.value = inventory.item_id;
         option.textContent = inventory.name;
         select.appendChild(option);
      });
   } catch (err) {
      console.error("could Not load items:", err);
   }
}

async function loadInventoryDropdown(select = stockName) {
   try {
      const response = await fetch("/api/items");
      const items = await response.json();

      if (!select) {
         return;
      }
      items.forEach(item => {
         const option = document.createElement("option");
         option.value = item.item_id;
         option.textContent = item.name;
         select.appendChild(option);
      });
   } catch (err) {
      console.error("Could not load items:", err);
   }
}

async function loadForms() {
   await loadInventoryDropdown();
   await loadPurchasesDropdown();
   await loadSalesDropdown();
   editForm();
}
loadForms();

async function saveSale(event) {
   event.preventDefault();
   const sale = {
      sales_date: salesDate.value,
      customer: customer.value,
      item_id: productSold.value,
      quantity: salesQuantity.value,
      unit_price: unitPrice.value
   };
   try {
      const response = await fetch("/api/sales", {
         method: "POST",
         headers: {
            "content-type": "application/json"
         },
         body: JSON.stringify(sale)
      });
      if (!response.ok) {
         alert("save failed. Please check the form and try again.");
         return;
      }
      const savedSale = await response.json();
      console.log("saved:", savedSale);
      alert("Sale saved successfully!");
      salesForm.reset();
   } catch (err) {
      console.error("network problem:", err);
      alert("Network problem. Your entry was NOT saved");
   }
}

if (salesForm) {
   salesForm.addEventListener("submit", saveSale);
}

async function savePurchases(event) {
   event.preventDefault();
   const purchase = {
      purchase_date: purchaseDate.value,
      supplier: supplier.value,
      item_id: materialSupplied.value,
      quantity_supplied: quantitySupplied.value,
      unit_cost: unitCost.value
   };
   try {
      const response = await fetch("/api/purchases", {
         method: "POST",
         headers: {
            "content-type": "application/json"
         },
         body: JSON.stringify(purchase)
      });
      if (!response.ok) {
         alert("Save failed. Check entries and try again");
         return;
      }
      const savedPurchase = await response.json();
      console.log("saved:", savedPurchase);
      alert("Purchase submited");
      purchaseForm.reset();
   } catch (err) {
      console.error("Network problem", err);
      alert("Network problem. Failed to submit");
   }
}

if (purchaseForm) {
   purchaseForm.addEventListener("submit", savePurchases);
}

async function saveInventory(event) {
   event.preventDefault();
   const inventoryItems = {
      count_date: stockDate.value,
      item_id: stockName.value,
      received: received.value,
      issued: issued.value
   };
   try {
      const response = await fetch("/api/stock_counts", {
         method: "POST",
         headers: {
            "content-type": "application/json"
         },
         body: JSON.stringify(inventoryItems)
      });
      if (!response.ok) {
         alert("failed to submit. Check your entries");
         return;
      }
      const savedStock = await response.json();
      console.log("saved:", savedStock);
      alert("Stock submited successfully");
      inventoryForm.reset();
   } catch (err) {
      console.error(err);
      alert("Network problem. Failed to submit");
   }
}
if (inventoryForm) {
   inventoryForm.addEventListener("submit", saveInventory);
}

async function saveProduction(event) {
   event.preventDefault();
   const production = {
      production_date: productionDate.value,
      kernel_used: kernelUsed.value,
      pko_produced: oilProduced.value,
      pkc_produced: pkcProduced.value,
      production_hours: productionHours.value,
      down_time: downTime.value
   };
   try {
      const response = await fetch("/api/production", {
         method: "POST",
         headers: {
            "content-type": "application/json"
         },
         body: JSON.stringify(production)
      });
      if (!response.ok) {
         const problem = await response.json();
         if (response.status === 400 || response.status === 409) {
            alert("Failed to submit. " + problem.err);
         } else {
            alert("Failed to submit. Internal server problem");
         }
         return;
      }
      const savedProduction = await response.json();
      console.log("saved:", savedProduction);
      alert("Production submitted successfully");
      productionForm.reset();
   } catch (err) {
      console.error(err);
      alert("Network problem. Failed to submit");
   }
}
if (productionForm) {
   productionForm.addEventListener("submit", saveProduction);
}

async function saveExpenses(event) {
   event.preventDefault();
   const expense = {
      expense_date: expenseDate.value,
      category: expenseCategory.value,
      description: expenseDescription.value,
      amount_spent: expenseAmount.value
   };
   try {
      const response = await fetch("/api/expenses", {
         method: "POST",
         headers: {
            "content-type": "application/json"
         },
         body: JSON.stringify(expense)
      });
      if (!response.ok) {
         if (response.status === 400) {
            const problem = await response.json();
            alert("Failed to submit " + problem.err);
            console.log(problem.err);
         } else {
            alert("Failed to submit. Internal server error");
         }
         return;
      }
      const savedExpense = await response.json();
      alert("Expense submitted successfully");
      expensesForm.reset();
      console.log("submitted:", savedExpense);
   } catch (err) {
      console.error(err);
      alert("Network problem. Failed to submit");
   }
}
if (expensesForm) {
   expensesForm.addEventListener("submit", saveExpenses);
}

async function loadSalesData() {
   try {
      const response = await fetch("/api/sales");
      const tableBody = document.querySelector("#sales-data-body");
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
      sales.forEach(function (sale) {
         const row = document.createElement("tr");
         const submitted = new Date(sale.created_at);
         const formatedDate = submitted
         .toLocaleDateString("en-NG", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit"
         })
         .replace(/\//g, "-");
         const formatedTime = submitted.toLocaleTimeString("en-NG", {
            hour: "2-digit",
            minute: "2-digit"
         });
         const dateAndTime = formatedDate + " " + formatedTime;
         const formatedTotal = Number(sale.total).toLocaleString("en-NG");
         const cells = [
            dateAndTime,
            sale.customer,
            sale.name,
            sale.quantity,
            sale.unit_price,
            formatedTotal
         ];
         cells.forEach(value => {
            const tableData = document.createElement("td");
            tableData.textContent = value;
            row.appendChild(tableData);
         });
         tableBody.appendChild(row);
      });
   } catch (err) {
      console.error(err);
      alert("Failed to load Sales. Network problem");
   }
}
loadSalesData();

function formatDate(dateValue) {
   return new Date(dateValue.slice(0, 10) + "T00:00:00").toLocaleDateString(
      "en-NG",
      {
         day: "numeric",
         month: "short",
         year: "numeric"
      }
   );
}

function formatSubmitted(createdAt) {
   return new Date(createdAt).toLocaleString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
   });
}

function createCard(date, createdAt, itemName, id) {
   const card = document.createElement("article");
   const header = document.createElement("div");
   const body = document.createElement("div");
   const item = document.createElement("span");
   const displayDate = document.createElement("span");
   const submittedAt = document.createElement("span");
   const idNum = document.createElement("span");

   card.classList.add("data-record-card");
   header.classList.add("data-record-header");
   body.classList.add("data-record-values");

   item.textContent = itemName;
   idNum.textContent = "#P" + id;
   submittedAt.textContent = formatSubmitted(createdAt);
   displayDate.textContent = formatDate(date);

   header.append(displayDate, submittedAt, item, idNum);

   card.append(header, body);
   return {
      card: card,
      body: body
   };
}

function formatNumber(value) {
   return Number(value).toLocaleString("en-NG");
}

function createCardValues(label, value, unit) {
   const box = document.createElement("div");
   const labelName = document.createElement("span");
   const nameOrValue = document.createElement("strong");
   const unitValue = document.createElement("small");

   nameOrValue.textContent = value;
   labelName.textContent = label;

   box.append(labelName, nameOrValue, unitValue);
   if (unitValue !== undefined) {
      unitValue.textContent = unit;
      box.appendChild(unitValue);
   }
   return box;
}

function displayCards(list, config, htmlDataList, visibleRecord, loadMoreBtn) {
   htmlDataList.replaceChildren();
   list.slice(0, visibleRecord).forEach(row => {
      const card = createCard(
         config.date(row),
         config.createdAt(row),
         config.item(row),
         config.id(row)
      );

      card.card.classList.add(
         config.item(row).toLowerCase().replaceAll(" ", "-")
      );

      config.field.forEach(field => {
         const box = createCardValues(
            field.label,
            field.value(row),
            field.unit ? field.unit(row): undefined
         );
         card.body.appendChild(box);
      });
      htmlDataList.appendChild(card.card);
   });
   loadMoreBtn.hidden = visibleRecord >= list.length;
}

function loadMore(list, config, htmlDataList, visibleRecord, loadMoreBtn) {
   loadMoreBtn.addEventListener("click", () => {
      visibleRecord += 10;
      displayCards(list, config, htmlDataList, visibleRecord, loadMoreBtn);
   });
}

function filterDate(record, config, dateFrom, dateTo) {
   let filtered;
   if (dateFrom.value === "" || dateTo.value === "") {
      filtered = record;
   } else {
      filtered = record.filter(row => {
         return (
            config.date(row) >= dateFrom.value &&
            config.date(row) <= dateTo.value
         );
      });
   }
   return filtered;
}

function sortNewest(record, config, htmlSelect) {
   let sorted;
   if (htmlSelect.value === "newest") {
      sorted = [...record].sort((a, b) => {
         return new Date(config.date(b)) - new Date(config.date(a));
      });
   } else {
      sorted = [...record].sort((a, b) => {
         return new Date(config.date(a)) - new Date(config.date(b));
      });
   }
   return sorted;
}

function filterByItems(record, config, filterElement) {
   const selectedItem =
   filterElement.options[filterElement.selectedIndex].textContent;
   let filteredList;
   if (selectedItem === "" || selectedItem === "All Items") {
      filteredList = record;
   } else {
      filteredList = record.filter(item => {
         return config.item(item) === selectedItem;
      });
   }
   return filteredList;
}

async function renderInventoryCard(inventoryList) {
   const loadMoreBtn = document.querySelector("#inventory-load-more");
   let visibleRecord = 10;

   let currentList = inventoryList;

   const inventoryFilter = document.querySelector("#inventory-item-filter");

   const htmlDataList = document.querySelector("#inventory-data-list");

   const dateFrom = document.querySelector("#inventory-date-from");

   const dateTo = document.querySelector("#inventory-date-to");

   const inventorySort = document.querySelector("#inventory-sort");

   const inventoryConfig = {
      date: row => row.count_date,
      createdAt: row => row.created_at,
      id: row => row.count_id,
      item: row => row.name,
      field: [{
         label: "Opening Stock",
         value: row => formatNumber(row.opening_stock),
         unit: row => (row.name === "Diesel" ? "L": "kg")
      },
         {
            label: "Received",
            value: row => formatNumber(row.received),
            unit: row => (row.name === "Diesel" ? "L": "kg")
         },
         {
            label: "Issued",
            value: row => formatNumber(row.issued),
            unit: row => (row.name === "Diesel" ? "L": "kg")
         },
         {
            label: "Closing Stock",
            value: row => formatNumber(row.closing_stock),
            unit: row => (row.name === "Diesel" ? "L": "kg")
         }]
   };
   displayCards(
      currentList,
      inventoryConfig,
      htmlDataList,
      visibleRecord,
      loadMoreBtn
   );

   if (inventoryFilter.options.length === 1) {
      await loadInventoryDropdown(inventoryFilter);
   }

   loadMoreBtn.addEventListener("click", () => {
      visibleRecord += 10;

      displayCards(
         currentList,
         inventoryConfig,
         htmlDataList,
         visibleRecord,
         loadMoreBtn
      );
   });

   inventoryFilter.addEventListener("change", () => {
      visibleRecord = 10;
      currentList = filterByItems(
         inventoryList,
         inventoryConfig,
         inventoryFilter
      );
      
      currentList = filterDate(
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

   dateFrom.addEventListener("change", () => {
      visibleRecord = 10;

      currentList = filterByItems(
         inventoryList,
         inventoryConfig,
         inventoryFilter
      );
      
      currentList = filterDate(
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

   dateTo.addEventListener("change", () => {
      visibleRecord =10;

      currentList = filterByItems(
         inventoryList,
         inventoryConfig,
         inventoryFilter
      );

      currentList = filterDate(
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

   inventorySort.addEventListener("change", () => {
      visibleRecord = 10;
      
      currentList = sortNewest(currentList, inventoryConfig, inventorySort);

      displayCards(
         currentList,
         inventoryConfig,
         htmlDataList,
         visibleRecord,
         loadMoreBtn
      );
   });
}

async function renderPurchasesCard(purchasesList) {
   const htmlDataList = document.querySelector("#purchases-data-list");

   const loadMoreBtn = document.querySelector("#purchases-load-more");

   let visibleRecord = 10;
   let currentList = purchasesList;

   const purchasesFilter = document.querySelector("#purchases-item-filter");

   const dateFrom = document.querySelector("#purchases-date-from");
   const dateTo = document.querySelector("#purchases-date-to");

   const purchasesSelect = document.querySelector("#purchases-sort");

   const purchasesConfig = {
      date: row => row.purchase_date,
      createdAt: row => row.created_at,
      item: row => row.name,
      id: row => row.purchase_id,
      field: [{
         label: "Supplier",
         value: row => row.supplier
      },
         {
            label: "Qty Supplied",
            value: row => formatNumber(row.quantity_supplied),
            unit: row => (row.name === "Diesel" ? "L": "kg")
         },
         {
            label: "Unit Cost",
            value: row => "₦" + formatNumber(row.unit_cost),
            unit: row => (row.name === "Diesel" ? "/L": "/kg")
         },
         {
            label: "Total",
            value: row => "₦" + formatNumber(row.total_cost)
         }]
   };

   displayCards(
      purchasesList,
      purchasesConfig,
      htmlDataList,
      visibleRecord,
      loadMoreBtn
   );

   if (purchasesFilter.options.length === 1) {
      await loadPurchasesDropdown(purchasesFilter);
   }

   purchasesFilter.addEventListener("change", () => {
      visibleRecord = 10;
      currentList = filterByItems(
         purchasesList,
         purchasesConfig,
         purchasesFilter
      );
      
      currentList = filterDate(
      currentList,
      inventoryConfig,
      dateFrom,
      dateTo
    );

      displayCards(
         currentList,
         purchasesConfig,
         htmlDataList,
         visibleRecord,
         loadMoreBtn
      );
   });

   dateFrom.addEventListener("change", () => {
      currentList = filterDate(
         purchasesList,
         purchasesConfig,
         dateFrom,
         dateTo
      );

      displayCards(currentList,
         purchasesConfig,
         htmlDataList, visibleRecord,
         loadMoreBtn)
   });

   dateTo.addEventListener("change", () => {
      currentList = filterDate(
         purchasesList,
         purchasesConfig,
         dateFrom,
         dateTo
      );

      displayCards(currentList,
         purchasesConfig,
         htmlDataList, visibleRecord,
         loadMoreBtn)
   });

   purchasesSelect.addEventListener("change", () => {
      sortNewest(
         purchasesList,
         purchasesConfig,
         purchasesSelect,
         htmlDataList
      );
   });
}

function renderPurchasesTable(purchasesList) {
   const purchasesDataBody = document.querySelector("#purchases-data-body");
   purchasesDataBody.innerHTML = "";
   purchasesList.forEach(purchase => {
      const row = document.createElement("tr");
      const submittedAt = formatSubmitted(purchase.created_at);
      const displayDate = formatDate(purchase.purchase_date);

      const cells = [
         displayDate,
         purchase.supplier,
         purchase.name,
         purchase.quantity_supplied,
         purchase.unit_cost,
         purchase.total_cost,
         submittedAt
      ];

      cells.forEach(value => {
         const td = document.createElement("td");
         td.textContent = value;
         row.appendChild(td);
      });
      purchasesDataBody.appendChild(row);
   });
}

async function loadInventoryData() {
   const response = await fetch("/api/stock_counts");
   if (response.status === 500) {
      const problem = await response.json();
      alert(problem.err);
      return;
   }
   if (!response.ok) {
      alert("Request failed" + " " + response.statusText);
      return;
   }
   const inventoryList = await response.json();

   await renderInventoryCard(inventoryList);
}

async function loadPurchasesData() {
   const response = await fetch("/api/purchases");
   if (response.status === 500) {
      const problem = await response.json();
      alert(problem.err);
      return;
   }
   if (!response.ok) {
      alert("Request failed" + " " + response.statusText);
      return;
   }
   const purchasesList = await response.json();
   await renderPurchasesCard(purchasesList);
   renderPurchasesTable(purchasesList);
}

async function loadProductionData() {
   try {
      const productionDataBody = document.querySelector(
         "#production-data-body"
      );
      const response = await fetch("/api/production");
      if (response.status === 500) {
         const problem = await response.json();
         alert(problem.err);
         return;
      }
      if (!response.ok) {
         alert("Request failed" + " " + response.statusText);
         return;
      }
      const productionList = await response.json();
      productionDataBody.innerHTML = "";
      productionList.forEach(production => {
         const row = document.createElement("tr");
         const submittedAt = new Date(production.created_at);
         const formatedDate = submittedAt
         .toLocaleDateString("en-NG", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit"
         })
         .replace(/\//g, "-");
         const formatedTime = submittedAt.toLocaleTimeString("en-NG", {
            hour: "2-digit",
            minute: "2-digit"
         });
         const dateAndTime = formatedDate + " " + formatedTime;
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

         cells.forEach(value => {
            const td = document.createElement("td");
            td.textContent = value;
            row.appendChild(td);
         });
         productionDataBody.appendChild(row);
      });
   } catch (error) {
      console.error(error.message);
      alert("Something went Wrong" + " " + error.message);
   }
}

async function loadExpensesData() {
   try {
      const expensesDataBody = document.querySelector("#expenses-data-body");
      const response = await fetch("/api/expenses");
      if (response.status === 500) {
         const problem = await response.json();
         alert(problem.err);
         return;
      }
      if (!response.ok) {
         alert("Request failed" + " " + response.statusText);
         return;
      }
      const expensesList = await response.json();
      expensesDataBody.innerHTML = "";
      expensesList.forEach(expense => {
         const row = document.createElement("tr");
         const submittedAt = new Date(expense.created_at);
         const formatedDate = submittedAt
         .toLocaleDateString("en-NG", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit"
         })
         .replace(/\//g, "-");
         const formatedTime = submittedAt.toLocaleTimeString("en-NG", {
            hour: "2-digit",
            minute: "2-digit"
         });
         const dateAndTime = formatedDate + " " + formatedTime;
         const cells = [
            dateAndTime,
            expense.category,
            expense.description,
            expense.amount_spent
         ];

         cells.forEach(value => {
            const td = document.createElement("td");
            td.textContent = value;
            row.appendChild(td);
         });
         expensesDataBody.appendChild(row);
      });
   } catch (error) {
      console.error(error.message);
      alert("Something went Wrong" + " " + error.message);
   }
}

const dashboardBtn = document.querySelector("#dashboard-btn");
if (dashboardBtn) {
   dashboardBtn.addEventListener("click", function () {
      window.location.href = "forms.html#dashboard";
   });
}

function sizeDashboardNumber(element, value) {
   const digits = Math.trunc(Math.abs(Number(value))).toString().length;
   if (digits >= 7) {
      element.classList.add("number-small");
   } else if (digits >= 5) {
      element.classList.add("number-medium");
   }
}

async function showStockLevels() {
   try {
      const selectedDate = dateInput.value;
      const response = await fetch("/api/dashboard?date=" + selectedDate);
      const stockLevels = await response.json();
      const stockGrid = document.querySelector(".stock-grid");
      stockGrid.innerHTML = "";

      stockLevels.forEach(row => {
         const stockCard = document.createElement("article");
         const stockBadge = document.createElement("span");
         const stockDetails = document.createElement("div");
         const stockName = document.createElement("span");
         const stockQuantity = document.createElement("strong");
         const stockUnit = document.createElement("small");

         stockCard.classList.add("stock-card");
         stockBadge.classList.add("stock-badge");
         stockDetails.classList.add("stock-details");
         stockName.classList.add("stock-name");
         stockQuantity.classList.add("stock-quantity");
         stockUnit.classList.add("stock-unit");

         stockQuantity.textContent = Number(row.remaining).toLocaleString(
            "en-NG",
            {
               minimumFractionDigits: 2,
               maximumFractionDigits: 2
            }
         );
         sizeDashboardNumber(stockQuantity, row.remaining);
         stockName.textContent = row.item;

         if (stockName.textContent === "PKC") {
            stockBadge.textContent = "PKC";
            stockUnit.textContent = "kg";
         } else if (stockName.textContent === "P Kernel") {
            stockBadge.textContent = "PK";
            stockUnit.textContent = "kg";
         } else if (stockName.textContent === "PKO") {
            stockBadge.textContent = "PKO";
            stockUnit.textContent = "kg";
         } else if (stockName.textContent === "Diesel") {
            stockBadge.textContent = "DL";
            stockUnit.textContent = "L";
         }

         stockQuantity.appendChild(stockUnit);
         stockDetails.appendChild(stockName);
         stockDetails.appendChild(stockQuantity);
         stockCard.appendChild(stockBadge);
         stockCard.appendChild(stockDetails);
         stockGrid.appendChild(stockCard);
      });

      const panelHead = document.querySelector(".panel-head");
      const stockCaption = document.querySelector("#stock-caption");
      stockCaption.textContent = `Closing, ${selectedDate}`;
      panelHead.appendChild(stockCaption);

      const periodTabs = document.querySelector("#period-tabs");
      periodTabs.firstElementChild.classList.add("active");
   } catch (error) {
      console.log("unable to display stock levels");
   }
}

if (dateInput) {
   dateInput.valueAsDate = new Date();
   const showToday = dateInput.value;

   function updateDateLabel() {
      if (dateInput.value === showToday) {
         today.textContent = "Today";
      } else {
         today.textContent = "Showing";
      }
   }
   dateInput.addEventListener("change", updateDateLabel);
   dateInput.addEventListener("change", showStockLevels);
   updateDateLabel();
   showStockLevels();

   async function showPeriodProduction(period) {
      const selectedDate = dateInput.value;
      const RawPeriods = await fetch(
         "/api/dashboard_period?date=" + selectedDate
      );
      const periods = await RawPeriods.json();
      const production = periods[period].production;
      const prodGrid = document.querySelector(".prod-grid");
      prodGrid.innerHTML = "";

      Object.entries(production).forEach(function ([name, value]) {
         if (name === "oil_yield") {
            return;
         }
         const prodCard = document.createElement("article");
         const prodDetails = document.createElement("div");
         const prodName = document.createElement("span");
         const prodQuantity = document.createElement("strong");
         const prodUnit = document.createElement("small");

         prodCard.classList.add("stock-card");
         prodDetails.classList.add("stock-details");
         prodName.classList.add("stock-name");
         prodQuantity.classList.add("stock-quantity");
         prodUnit.classList.add("stock-unit");

         prodQuantity.textContent = Number(value).toLocaleString("en-NG", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
         });
         sizeDashboardNumber(prodQuantity, value);
         prodName.textContent = name.replace("_", " ");
         prodUnit.textContent = "kg";

         prodQuantity.appendChild(prodUnit);
         prodDetails.appendChild(prodName);
         prodDetails.appendChild(prodQuantity);
         prodCard.appendChild(prodDetails);
         prodGrid.appendChild(prodCard);
      });
      const oilYield = document.querySelector("#oil-yield");
      oilYield.textContent =
      Number(production.oil_yield).toLocaleString("en-NG",
         {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
         }) + "%";
   }
   async function showPeriodProfit(period) {
      const profitList = document.querySelector("#profit-list");
      const profitCaption = document.querySelector("#profit-caption");
      if (!profitList) return;

      try {
         const selectedDate = dateInput.value;
         const response = await fetch(
            "/api/dashboard_period?date=" + encodeURIComponent(selectedDate)
         );
         if (!response.ok) throw new Error("Could not load profit figures");

         const periods = await response.json();
         const profit = periods[period];
         if (!profit)
            throw new Error("Profit data is missing for " + period);

         const grossProfit = profit.period_gross_profit || {};
         const currency = new Intl.NumberFormat("en-NG", {
            style: "currency",
            currency: "NGN",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
         });

         profitList.innerHTML = "";
         const cards = document.createElement("div");
         cards.classList.add("profit-cards");

         [{
            name: "PKO",
            value: grossProfit.pko,
            className: "pko"
         },
            {
               name: "PKC",
               value: grossProfit.pkc,
               className: "pkc"
            }].forEach(product => {
               const card = document.createElement("article");
               const badge = document.createElement("span");
               const details = document.createElement("div");
               const name = document.createElement("span");
               const value = document.createElement("strong");

               card.classList.add("profit-card", product.className);
               badge.classList.add("profit-badge");
               details.classList.add("profit-details");
               name.classList.add("profit-label");
               value.classList.add("profit-value");

               badge.textContent = product.name;
               name.textContent = product.name + " gross profit";
               value.textContent = currency.format(Number(product.value) || 0);

               details.append(name, value);
               card.append(badge, details);
               cards.appendChild(card);
            });

         const netProfit = document.createElement("div");
         const netLabel = document.createElement("span");
         const netValue = document.createElement("strong");
         const netAmount = Number(profit.total_net_profit) || 0;

         netProfit.classList.add("net-profit");
         netProfit.classList.toggle("negative", netAmount < 0);
         netLabel.textContent = "Total net profit";
         netValue.textContent = currency.format(netAmount);
         netProfit.append(netLabel, netValue);

         profitList.append(cards, netProfit);
         if (profitCaption) {
            profitCaption.textContent =
            period.charAt(0).toUpperCase() + period.slice(1);
         }
      } catch (error) {
         console.error(error);
         profitList.innerHTML = "";
         const message = document.createElement("p");
         message.classList.add("profit-error");
         message.textContent = "Profit figures are unavailable.";
         profitList.appendChild(message);
      }
   }

   showPeriodProduction("day");
   showPeriodProfit("day");
   dateInput.addEventListener("change", function () {
      showPeriodProduction("day");
      showPeriodSales("day");
      showPeriodProfit("day");
      dashboardChecks("day");
      stockPanel.style.display = "block";
      weekBtn.classList.remove("active");
      monthBtn.classList.remove("active");
      if (dateInput.textContent === "") {
         showStockLevels();
      }
   });

   const dayBtn = document.querySelector(".day-button");
   dayBtn.addEventListener("click",
      function () {
         showPeriodProduction("day");
         showPeriodSales("day");
         showPeriodProfit("day");
         dashboardChecks("day");
         dayBtn.classList.add("active");
         weekBtn.classList.remove("active");
         monthBtn.classList.remove("active");
         stockPanel.style.display = "block";
      });

   const weekBtn = document.querySelector(".week-button");
   weekBtn.addEventListener("click",
      function () {
         showPeriodProduction("week");
         showPeriodSales("week");
         showPeriodProfit("week");
         dashboardChecks("week");
         weekBtn.classList.add("active");
         dayBtn.classList.remove("active");
         monthBtn.classList.remove("active");
         stockPanel.style.display = "none";
      });

   const monthBtn = document.querySelector(".month-button");
   monthBtn.addEventListener("click",
      function () {
         showPeriodProduction("month");
         showPeriodSales("month");
         showPeriodProfit("month");
         dashboardChecks("month");
         monthBtn.classList.add("active");
         dayBtn.classList.remove("active");
         weekBtn.classList.remove("active");
         stockPanel.style.display = "none";
      });

   async function showPeriodSales(period) {
      try {
         const selectedDate = dateInput.value;
         const response = await fetch(
            "/api/dashboard_period?date=" + selectedDate
         );
         const sales = await response.json();
         const periodSales = sales[period].sales;
         const salesArray = Object.entries(periodSales).map(function ([
            product,
            details
         ]) {
            return {
               product: product,
               ...details
            };
         });
         const salesGrid = document.querySelector("#sales-grid");
         salesGrid.innerHTML = "";
         salesArray.forEach(row => {
            const salesCard = document.createElement("article");
            const salesHeader = document.createElement("header");
            const productName = document.createElement("h3");
            const badge = document.createElement("span");
            const cardBody = document.createElement("div");
            const productIcon = document.createElement("span");
            const salesDetails = document.createElement("div");
            const salesRowOne = document.createElement("div");
            const quantitySold = document.createElement("span");
            const quantityValue = document.createElement("strong");
            const salesUnitOne = document.createElement("small");
            const salesRowTwo = document.createElement("div");
            const avgPrice = document.createElement("span");
            const avgPriceValue = document.createElement("strong");
            const salesRowThree = document.createElement("div");
            const total = document.createElement("span");
            const totalValue = document.createElement("strong");

            salesCard.classList.add("sale-card");
            salesHeader.classList.add("sale-head");
            badge.classList.add("swatch");
            cardBody.classList.add("sale-body");
            productIcon.classList.add("sale-icon");
            salesDetails.classList.add("sale-details");
            salesRowOne.classList.add("sale-row");
            salesRowTwo.classList.add("sale-row");
            salesRowThree.classList.add("sale-row", "total");

            productName.textContent = row.product;
            salesUnitOne.textContent = "kg";
            quantitySold.textContent = "Qty sold";
            quantityValue.textContent = Number(
               row.quantity_sold
            ).toLocaleString("en-NG", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
               });
            salesRowOne.append(quantitySold, quantityValue, salesUnitOne);

            avgPrice.textContent = "Avg price";
            avgPriceValue.textContent = Number(
               row.average_unit_price
            ).toLocaleString("en-NG", {
                  style: "currency",
                  currency: "NGN",
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
               });
            salesRowTwo.append(avgPrice, avgPriceValue);

            total.textContent = "total";
            totalValue.textContent = Number(row.total_sales).toLocaleString(
               "en-NG",
               {
                  style: "currency",
                  currency: "NGN",
                  maximumFractionDigits: 0
               }
            );
            salesRowThree.append(total, totalValue);
            if (row.product === "PKO") {
               salesCard.classList.add("pko");
               badge.textContent = "PKO";
               productIcon.textContent = "💧";
            } else {
               salesCard.classList.add("pkc");
               badge.textContent = "PKC";
               productIcon.textContent = "🟤";
            }

            salesDetails.append(salesRowOne, salesRowTwo, salesRowThree);
            cardBody.append(productIcon, salesDetails);

            salesHeader.append(badge, productName);
            salesCard.append(salesHeader, cardBody);
            salesGrid.appendChild(salesCard);
         });
      } catch (error) {
         console.log(error);
      }
   }
   showPeriodSales("day");

   async function dashboardChecks(period) {
      try {
         const dashboardCheck = document.querySelector(".dashboard-checks");
         const selectedDate = dateInput.value;

         const response = await fetch("/api/checks");

         if (!response.ok) {
            const problem = await response.json();

            alert(problem.err);
            console.log(problem.err);
            return;
         }

         const checks = await response.json();

         const selected = new Date(selectedDate + "T00:00:00");

         function displayCheckCount(count) {
            dashboardCheck.textContent =
            count +
            (count === 1
               ? " check needs your attention": " checks need your attention");
            dashboardCheck.classList.toggle("has-checks", count > 0);
            dashboardCheck.classList.toggle("is-clear", count === 0);
            dashboardCheck.dataset.period = period;
            dashboardCheck.dataset.date = selectedDate;
         }

         if (period === "day") {
            const theDay = checks.filter(check => {
               return check.check_date === selectedDate;
            });

            displayCheckCount(theDay.length);
         } else if (period === "week") {
            const weekStart = new Date(selected);

            weekStart.setDate(
               selected.getDate() - ((selected.getDay() + 6) % 7)
            );

            const weekEnd = new Date(weekStart);

            weekEnd.setDate(weekStart.getDate() + 7);

            const thatWeek = checks.filter(check => {
               const checkDate = new Date(check.check_date + "T00:00:00");

               return checkDate >= weekStart && checkDate < weekEnd;
            });

            displayCheckCount(thatWeek.length);
         } else if (period === "month") {
            const thatMonth = checks.filter(check => {
               const checkDate = new Date(check.check_date + "T00:00:00");

               return (
                  checkDate.getFullYear() === selected.getFullYear() &&
                  checkDate.getMonth() === selected.getMonth()
               );
            });

            displayCheckCount(thatMonth.length);
         }
      } catch (error) {
         console.log(error);
      }
   }

   dashboardChecks("day");

   const dashboardChecksLink = document.querySelector(".dashboard-checks");

   dashboardChecksLink.addEventListener("click", function () {
      const period = dashboardChecksLink.dataset.period || "day";
      const selectedDate =
      dashboardChecksLink.dataset.date || dateInput.value;

      window.location.href =
      "checks.html?period=" +
      encodeURIComponent(period) +
      "&date=" +
      encodeURIComponent(selectedDate);
   });
}

function editForm() {
   const record = JSON.parse(sessionStorage.getItem("editRecord"));
   const kind = sessionStorage.getItem("editKind");

   if (!record || !kind) {
      return;
   }
   if (kind === "stock") {
      stockDate.value = record.count_date.slice(0, 10);
      stockName.value = record.item_id;
      received.value = record.received;
      issued.value = record.issued;

      inventoryForm.removeEventListener("submit", saveInventory);
      inventoryForm.addEventListener("submit", saveEdit);
      inventoryForm.querySelector('button[type="submit"]').textContent =
      "Save Inventory";
   } else if (kind === "production") {
      productionDate.value = record.production_date.slice(0, 10);
      kernelUsed.value = record.kernel_used;
      oilProduced.value = record.pko_produced;
      pkcProduced.value = record.pkc_produced;
      productionHours.value = record.production_hours;
      downTime.value = record.down_time;

      productionForm.removeEventListener("submit", saveProduction);
      productionForm.addEventListener("submit", saveEdit);
      productionForm.querySelector('button[type="submit"]').textContent =
      "Save Production";
   } else if (kind === "sales") {
      salesDate.value = record.sales_date.slice(0, 10);
      customer.value = record.customer;
      productSold.value = record.item_id;
      salesQuantity.value = record.quantity;
      unitPrice.value = record.unit_price;

      salesForm.removeEventListener("submit", saveSale);
      salesForm.addEventListener("submit", saveEdit);
      salesForm.querySelector('button[type="submit"]').textContent =
      "Save Sales";
   } else if (kind === "purchases") {
      purchaseDate.value = record.purchase_date.slice(0, 10);
      supplier.value = record.supplier;
      materialSupplied.value = record.item_id;
      quantitySupplied.value = record.quantity_supplied;
      unitCost.value = record.unit_cost;

      purchaseForm.removeEventListener("submit", savePurchases);
      purchaseForm.addEventListener("submit", saveEdit);
      purchaseForm.querySelector('button[type="submit"]').textContent =
      "Save Purchases";
   }
}

async function saveEdit(event) {
   event.preventDefault();
   const record = JSON.parse(sessionStorage.getItem("editRecord"));
   const kind = sessionStorage.getItem("editKind");

   let updatedForm;

   if (kind === "stock") {
      updatedForm = {
         count_id: record.count_id,
         count_date: stockDate.value,
         item_id: stockName.value,
         received: received.value,
         issued: issued.value
      };
   } else if (kind === "production") {
      updatedForm = {
         production_id: record.production_id,
         production_date: productionDate.value,
         kernel_used: kernelUsed.value,
         pko_produced: oilProduced.value,
         pkc_produced: pkcProduced.value,
         production_hours: productionHours.value,
         down_time: downTime.value
      };
   } else if (kind === "sales") {
      updatedForm = {
         sale_id: record.sale_id,
         sales_date: salesDate.value,
         customer: customer.value,
         item_id: productSold.value,
         quantity: salesQuantity.value,
         unit_price: unitPrice.value
      };
   } else if (kind === "purchases") {
      updatedForm = {
         purchase_id: record.purchase_id,
         purchase_date: purchaseDate.value,
         supplier: supplier.value,
         item_id: materialSupplied.value,
         quantity_supplied: quantitySupplied.value,
         unit_cost: unitCost.value
      };
   }

   const response = await fetch("/api/correction_edit", {
      method: "PATCH",
      headers: {
         "Content-Type": "application/json"
      },
      body: JSON.stringify({
         kind: kind,
         record: updatedForm
      })
   });
   if (response.ok) {
      alert("Edit saved successfully");
      const checksReturnUrl =
      sessionStorage.getItem("checksReturnUrl") || "checks.html";
      sessionStorage.removeItem("editRecord");
      sessionStorage.removeItem("editKind");
      sessionStorage.removeItem("checksReturnUrl");
      window.location.href = checksReturnUrl;
   }
}