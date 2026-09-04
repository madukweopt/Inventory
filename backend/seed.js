require("dotenv").config();
const {
  Pool
} = require('pg');

const pool = new Pool( {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ---------- small helpers ----------

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(list) {
  return list[randomInt(0, list.length - 1)];
}

function chance(percent) {
  return randomInt(1, 100) <= percent;
}

function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function stampAt(date, hour, minute) {
  const stamp = new Date(date.getTime());
  stamp.setHours(hour, minute, randomInt(0, 59), 0);
  return stamp.toISOString();
}

function formatDuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return String(hours).padStart(2, '0') + ':' +
  String(minutes).padStart(2, '0');
}

// ---------- reference data ----------

const kernelSuppliers = ['Amaonyeze', 'Chuks', 'Mighty Farms', 'Ngozi Traders'];
const dieselSuppliers = ['D.G Energy', 'Rainoil Depot'];
const electricitySuppliers = ['NEPA Prepaid'];
const pkoCustomers = ['Poloud Limited', 'Emeka', 'Chigozirim', 'Poulin Oil Limited'];
const pkcCustomers = ['Benjamin', 'Iheanyi', 'Udo Farms'];

const runningExpenses = [
  'Transportation',
  'Filter repair',
  'Generator servicing',
  'Staff welfare',
  'Bearing replacement',
  'Electrical repair',
  'Loading labour'
];

const capitalExpenses = [
  'Pump purchase',
  'Storage tank fitting',
  'Expeller spare parts'
];

// ---------- the simulation ----------

async function seed() {
  console.log('Adding Electricity to items...');

  await pool.query(`
    INSERT INTO items (name, item_type)
    SELECT 'Electricity', 'consumable'
    WHERE NOT EXISTS (
      SELECT 1
      FROM items
      WHERE LOWER(TRIM(name)) = 'electricity'
    )
  `);

  console.log('Reading items...');

  const itemsResult = await pool.query('SELECT item_id, name FROM items');
  const itemId = {};

  itemsResult.rows.forEach(function (item) {
    itemId[item.name] = item.item_id;
  });

  if (!itemId['PKO'] || !itemId['PKC'] || !itemId['P Kernel'] || !itemId['Diesel'] || !itemId['Electricity']) {
    console.error('Items table must contain PKO, PKC, P Kernel, Diesel and Electricity.');
    await pool.end();
    return;
  }

  console.log('Preparing customers...');

  const customerNames = [...new Set([...pkoCustomers, ...pkcCustomers])];

  for (const customerName of customerNames) {
    await pool.query(
      `INSERT INTO customers (name)
      SELECT $1
      WHERE NOT EXISTS (
        SELECT 1
        FROM customers
        WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
      )`,
      [customerName]
    );
  }

  const customersResult = await pool.query(
    'SELECT customer_id, name FROM customers'
  );
  const customerId = {};

  customersResult.rows.forEach(function(customer) {
    customerId[customer.name] = customer.customer_id;
  });

  const pkoCustomerIds = pkoCustomers.map(name => customerId[name]);
  const pkcCustomerIds = pkcCustomers.map(name => customerId[name]);

  if(pkoCustomerIds.some(id => !id) || pkcCustomerIds.some(id => !id)) {
    console.error('Could not prepare all test customers.');
    await pool.end();
    return;
  }

  console.log('Preparing suppliers...');

  const supplierNames = [
    ...new Set([
      ...kernelSuppliers,
      ...dieselSuppliers,
      ...electricitySuppliers
    ])
  ];

  for (const supplierName of supplierNames) {
    await pool.query(
      `INSERT INTO suppliers (name)
      SELECT $1
      WHERE NOT EXISTS (
        SELECT 1
        FROM suppliers
        WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
      )`,
      [supplierName]
    );
  }

  const suppliersResult = await pool.query(
    'SELECT supplier_id, name FROM suppliers'
  );
  const supplierId = {};

  suppliersResult.rows.forEach(function(supplierRecord) {
    supplierId[supplierRecord.name.trim().toLowerCase()] =
      supplierRecord.supplier_id;
  });

  const kernelSupplierIds = kernelSuppliers.map(
    name => supplierId[name.trim().toLowerCase()]
  );
  const dieselSupplierIds = dieselSuppliers.map(
    name => supplierId[name.trim().toLowerCase()]
  );
  const electricitySupplierIds = electricitySuppliers.map(
    name => supplierId[name.trim().toLowerCase()]
  );

  if(
    kernelSupplierIds.some(id => !id) ||
    dieselSupplierIds.some(id => !id) ||
    electricitySupplierIds.some(id => !id)
  ) {
    console.error('Could not prepare all test suppliers.');
    await pool.end();
    return;
  }

  console.log('Clearing old transaction data...');

  await pool.query('TRUNCATE sales, purchases, production, expenses, stock_counts RESTART IDENTITY');

  // running stock levels
  let kernelStock = 0;
  let pkoStock = 0;
  let pkcStock = 0;
  let dieselStock = 0;
  let electricityStock = 0;

  const startDate = new Date(2026, 3, 1); // 1 April 2026
  const endDate = new Date(2026, 7, 31); // 31 August 2026

  let counts = {
    purchases: 0,
    production: 0,
    sales: 0,
    expenses: 0,
    stock: 0
  };

  for (let dayNumber = 0;; dayNumber++) {
    const day = addDays(startDate, dayNumber);

    if (day > endDate) {
      break;
    }

    if (day.getDay() === 0) {
      continue; // no work on Sundays
    }

    const dateText = formatDate(day);

    // what entered or left the store today, per item
    let kernelIn = 0;
    let kernelOut = 0;
    let pkoIn = 0;
    let pkoOut = 0;
    let pkcIn = 0;
    let pkcOut = 0;
    let dieselIn = 0;
    let dieselOut = 0;
    let electricityIn = 0;
    let electricityOut = 0;

    // --- 1. buy kernel when stock is low ---
    if (kernelStock < 7000) {
      const quantity = randomInt(15, 25) * 1000;
      const unitCost = randomInt(145, 168);

      await pool.query(
        'INSERT INTO purchases (purchase_date, supplier_id, item_id, quantity_supplied, unit_cost, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [dateText, randomChoice(kernelSupplierIds), itemId['P Kernel'], quantity, unitCost, stampAt(day, 7, 30)]
      );

      kernelStock = kernelStock + quantity;
      kernelIn = kernelIn + quantity;
      counts.purchases++;
    }

    // --- 2. buy diesel when low ---
    if (dieselStock < 900) {
      const quantity = randomInt(2, 3) * 1000;
      const unitCost = randomInt(1650, 1780);

      await pool.query(
        'INSERT INTO purchases (purchase_date, supplier_id, item_id, quantity_supplied, unit_cost, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [dateText, randomChoice(dieselSupplierIds), itemId['Diesel'], quantity, unitCost, stampAt(day, 8, 10)]
      );

      dieselStock = dieselStock + quantity;
      dieselIn = dieselIn + quantity;
      counts.purchases++;
    }

    // --- buy prepaid electricity when low ---
    if (electricityStock < 900) {
      const quantity = randomInt(20, 40) * 100;
      const unitCost = randomInt(180, 240);

      await pool.query(
        'INSERT INTO purchases (purchase_date, supplier_id, item_id, quantity_supplied, unit_cost, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [dateText, randomChoice(electricitySupplierIds), itemId['Electricity'], quantity, unitCost, stampAt(day, 8, 20)]
      );

      electricityStock = electricityStock + quantity;
      electricityIn = electricityIn + quantity;
      counts.purchases++;
    }

    // --- 3. production ---
    if (kernelStock >= 2500) {
      const kernelUsed = Math.min(kernelStock, randomInt(25, 40) * 100);
      const pkoProduced = Math.round(kernelUsed * (randomInt(465, 530) / 1000));
      const pkcProduced = Math.round(kernelUsed * (randomInt(430, 470) / 1000));
      const hours = formatDuration(randomInt(360, 570));
      const downTime = chance(30) ?
      formatDuration(randomInt(30, 120)): '00:00';
      const useElectricity = chance(60);
      const electricityUsed = useElectricity ? randomInt(180, 320) : 0;
      const dieselUsed = useElectricity ? 0 : randomInt(80, 130);

      await pool.query(
        'INSERT INTO production (production_date, kernel_used, pko_produced, pkc_produced, production_hours, down_time, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [dateText, kernelUsed, pkoProduced, pkcProduced, hours, downTime, stampAt(day, 16, 30)]
      );

      kernelStock = kernelStock - kernelUsed;
      pkoStock = pkoStock + pkoProduced;
      pkcStock = pkcStock + pkcProduced;
      dieselStock = dieselStock - dieselUsed;
      electricityStock = electricityStock - electricityUsed;

      kernelOut = kernelOut + kernelUsed;
      pkoIn = pkoIn + pkoProduced;
      pkcIn = pkcIn + pkcProduced;
      dieselOut = dieselOut + dieselUsed;
      electricityOut = electricityOut + electricityUsed;

      counts.production++;
    }

    // --- 4. PKO sales ---
    if (pkoStock > 1500 && chance(55)) {
      const salesToday = chance(25) ? 2: 1;

      for (let n = 0; n < salesToday; n++) {
        if (pkoStock < 1000) {
          break;
        }

        const quantity = Math.min(pkoStock, randomInt(10, 40) * 100);
        const unitPrice = randomInt(1450, 1820);

        await pool.query(
          'INSERT INTO sales (sales_date, customer_id, item_id, quantity, unit_price, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [dateText, randomChoice(pkoCustomerIds), itemId['PKO'], quantity, unitPrice, stampAt(day, randomInt(10, 15), randomInt(0, 59))]
        );

        pkoStock = pkoStock - quantity;
        pkoOut = pkoOut + quantity;
        counts.sales++;
      }
    }

    // --- 5. PKC sales ---
    if (pkcStock > 1200 && chance(45)) {
      const quantity = Math.min(pkcStock, randomInt(4, 25) * 100);
      const unitPrice = randomInt(195, 265);

      await pool.query(
        'INSERT INTO sales (sales_date, customer_id, item_id, quantity, unit_price, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [dateText, randomChoice(pkcCustomerIds), itemId['PKC'], quantity, unitPrice, stampAt(day, randomInt(10, 15), randomInt(0, 59))]
      );

      pkcStock = pkcStock - quantity;
      pkcOut = pkcOut + quantity;
      counts.sales++;
    }

    // --- 6. expenses ---
    if (chance(40)) {
      await pool.query(
        'INSERT INTO expenses (expense_date, description, category, amount_spent, created_at) VALUES ($1, $2, $3, $4, $5)',
        [dateText, randomChoice(runningExpenses), 'Expenses', randomInt(3, 60) * 1000, stampAt(day, randomInt(9, 17), randomInt(0, 59))]
      );
      counts.expenses++;
    }

    if (chance(6)) {
      await pool.query(
        'INSERT INTO expenses (expense_date, description, category, amount_spent, created_at) VALUES ($1, $2, $3, $4, $5)',
        [dateText, randomChoice(capitalExpenses), 'Asset/Capital Expenditure', randomInt(80, 400) * 1000, stampAt(day, randomInt(9, 17), randomInt(0, 59))]
      );
      counts.expenses++;
    }

    // --- 7. store keeper's evening count, derived from the day's events ---
    const dailyMovements = [{
      name: 'P Kernel',
      received: kernelIn,
      issued: kernelOut
    },
      {
        name: 'PKO',
        received: pkoIn,
        issued: pkoOut
      },
      {
        name: 'PKC',
        received: pkcIn,
        issued: pkcOut
      },
      {
        name: 'Diesel',
        received: dieselIn,
        issued: dieselOut
      },
      {
        name: 'Electricity',
        received: electricityIn,
        issued: electricityOut
      }];

    for (const movement of dailyMovements) {
      await pool.query(
        'INSERT INTO stock_counts (count_date, item_id, received, issued, created_at) VALUES ($1, $2, $3, $4, $5)',
        [dateText, itemId[movement.name], movement.received, movement.issued, stampAt(day, 18, randomInt(0, 40))]
      );

      counts.stock++;
    }
  }

  console.log('Done.');
  console.log('purchases: ' + counts.purchases);
  console.log('production: ' + counts.production);
  console.log('sales: ' + counts.sales);
  console.log('expenses: ' + counts.expenses);
  console.log('stock_counts: ' + counts.stock);

  await pool.end();
}

seed();