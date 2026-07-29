const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_QYnhfgZ2k4xN@ep-lively-king-ab2zzg6a-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorised: false}
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

app.get('/api/items', function (req, res) {
  pool.query('SELECT * FROM items ORDER BY name', function (err, result) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database connection failed' });
    }
    res.json(result.rows);
  });
});

app.get('/api/sales', function(req, res){
  pool.query('SELECT sales.created_at, sales.customer, items.name, sales.quantity, sales.unit_price, sales.quantity * sales.unit_price AS Total FROM sales INNER JOIN items ON sales.item_id = items.item_id ORDER BY sales.created_at DESC', function(err, result){
    if (err) {
      return res.status(500).json({ err: 'Could not load sales. Database connection failed' });
    }
    res.status(200).json(result.rows);
  });
});

app.get('/api/stock_counts', function(req, res){
  pool.query('SELECT items.name, stock_counts.count_date,  stock_counts.created_at,  stock_counts.received,    stock_counts.issued,               SUM(stock_counts.received - stock_counts.issued)               OVER (                       PARTITION BY stock_counts.item_id ORDER BY                  stock_counts.created_at) - (stock_counts.received - stock_counts.issued)                            AS opening_stock,                   SUM(                       stock_counts.received - stock_counts.issued)                           OVER ( PARTITION BY stock_counts.item_id ORDER BY stock_counts.created_at) AS closing_stock FROM stock_counts INNER JOIN items ON stock_counts.item_id = items.item_id ORDER BY stock_counts.created_at DESC', function(err, result){
    if (err) {
      console.log(err);
      return res.status(500).json({ 
        err: 'Failed to retrieve stock record.'
      }
      );
    } res.status(200).json(result.rows);
  })
})

app.get('/api/purchases', function(req, res) {
  pool.query(
    'SELECT purchases.created_at, purchases.supplier, purchases.quantity_supplied, items.name, purchases.unit_cost, purchases.quantity_supplied * purchases.unit_cost AS total_cost FROM purchases INNER JOIN items ON purchases.item_id = items.item_id ORDER BY purchases.created_at', function(err, result){
      if (err) {
        console.log(err.message);
        return res.status(500).json({
          err: 'Failed to retrieve purchases record'
        })
      } res.status(200).json(result.rows)
    });
  });
  
  app.get('/api/production', function(req, res){
    pool.query('SELECT production.created_at, production.kernel_used, production.pko_produced, production.pkc_produced, ROUND((production.pko_produced / NULLIF(production.kernel_used, 0) * 100)::numeric, 2) AS pko_yield, ROUND((production.pkc_produced / NULLIF(production.kernel_used, 0) * 100)::numeric, 2) AS pkc_yield, production.production_hours, production.down_time FROM production ORDER BY production.created_at DESC;', function(err, result){
      if (err) {
        console.log(err)
        return res.status(500).json({
          err: 'Failed to load production record from database'
        });
      } res.status(200).json(result.rows);
    })
  })
  
  app.get('/api/expenses', function(req, res){
    pool.query(`SELECT expenses.created_at, expenses.category, expenses.description,
      expenses.amount_spent
      FROM expenses 
      ORDER BY 
      expenses.created_at DESC;`, function(err, result){
      if (err) {
        console.log(err)
        return res.status(500).json({
          err: 'Failed to load expenses record from database'
        });
      } res.status(200).json(result.rows);
    })
  })

app.post('/api/sales', function(req, res){
  const sales = req.body;
  if (!sales.item_id || !sales.quantity || sales.quantity <= 0 || !sales.unit_price || sales.unit_price <= 0){
    return res.status(400).json({error: 'could not save sale'})
  }
  pool.query('INSERT INTO sales (sales_date, customer, item_id, quantity, unit_price) VALUES ($1, $2, $3, $4, $5) RETURNING *', [sales.sales_date, sales.customer, sales.item_id, sales.quantity, sales.unit_price],
  function(err, result){
    if (err) {
      console.log(err);
      return res.status(500).json({err: 'Could not save sale'})
    }
  res.status(201).json(result.rows[0]);
  }
  );
});

app.post('/api/purchases', function(req, res){
  const purchase = req.body;
  if (!purchase.item_id || !purchase.quantity_supplied || purchase.quantity_supplied <= 0 || !purchase.unit_cost || purchase.unit_cost <= 0) {
    return res.status(400).json({ error: 'Could not submit purchase'});
  }
  pool.query('INSERT INTO purchases(purchase_date, supplier, item_id, quantity_supplied, unit_cost) VALUES ($1, $2, $3, $4, $5) RETURNING *', [purchase.purchase_date, purchase.supplier, purchase.item_id, purchase.quantity_supplied, purchase.unit_cost], 
  function(err, result){
    if (err) {
      console.log(err);
      return res.status(500).json({err: 'could not save purchase'})
    }
    res.status(201).json(result.rows[0]);
  });
});

app.post('/api/stock_counts', function(req, res){
  const stockInventory = req.body;
  if (!stockInventory.count_date || !stockInventory.item_id || !stockInventory.received || stockInventory.received <= 0 || !stockInventory.issued || stockInventory.issued <=0)
  {
   return res.status(400).json({error: 'Could not submit stock'})
  }
  pool.query('INSERT INTO stock_counts(count_date, item_id, received, issued) VALUES ($1, $2, $3, $4) RETURNING *', [stockInventory.count_date, stockInventory.item_id, stockInventory.received, stockInventory.issued],
  function(err, result){
    if (err) {
      console.log(err);
      return res.status(500).json({err: 'Server encountered a problem saving purchase'})
    }
    res.status(201).json(result.rows[0]);
  });
});

app.post('/api/production', function(req, res){
  const production = req.body;
  if (!production.production_date || !production.kernel_used || production.kernel_used <= 0 || !production.pko_produced || production.pko_produced <= 0 || !production.pkc_produced || production.pkc_produced <= 0) {
    return res.status(400).json({ err: 'Check your inputs and try again' });
  }
  pool.query('INSERT INTO production ( production_date, kernel_used, pko_produced, pkc_produced, production_hours, down_time ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
  [production.production_date, production.kernel_used, production.pko_produced, production.pkc_produced, production.production_hours, production.down_time], 
  function(err, result){
    if (err) {
      console.log(err)
     return res.status(500).json({ err: 'Failed to submit. Internal server error' })
    }
    res.status(201).json(result.rows[0]);
  });
});

app.post('/api/expenses', function(req, res){
  const expense = req.body;
  if (!expense.expense_date || !expense.category || (expense.category !== 'Expenses' && expense.category !== 'Asset/Capital Expenditure') || !expense.description || expense.description.length > 100 || !expense.amount_spent || expense.amount_spent <=0) {
    return res.status(400).json({ err: 'Check your inputs and try again'})
  }
  pool.query('INSERT INTO expenses(expense_date, category, description, amount_spent) VALUES ($1, $2, $3, $4) RETURNING *',
  [expense.expense_date, expense.category, expense.description, expense.amount_spent],
  function(err, result){
    if (err) {
      console.log(err);
      return res.status(500).json({err: 'Could not submit expense. Internal server error'})
    }
    res.status(201).json(result.rows[0]);
  })
})

app.get('/api/average_cost', async function (req, res) {
  try {
    const RawPurchasesRecords = await pool.query(`
      SELECT
        items.item_id,
        items.name,
        items.item_type,
        to_char(
          purchases.purchase_date,
          'YYYY-MM-DD'
        ) AS date,
        purchases.created_at,
        purchases.quantity_supplied AS quantity,
        purchases.quantity_supplied *
        purchases.unit_cost AS value,
        'in' AS type,
        0 AS event_order
      FROM purchases
      INNER JOIN items
        ON purchases.item_id = items.item_id
    `);

    const purchases = RawPurchasesRecords.rows;

    /*
     * Raw materials and consumables issued for production.
     * Product dispatches are handled separately.
     */
    const rawIssues = await pool.query(`
      SELECT
        items.item_id,
        items.name,
        items.item_type,
        to_char(
          stock_counts.count_date,
          'YYYY-MM-DD'
        ) AS date,
        stock_counts.created_at,
        stock_counts.issued AS quantity,
        'out' AS type,
        1 AS event_order
      FROM stock_counts
      INNER JOIN items
        ON stock_counts.item_id = items.item_id
      WHERE stock_counts.issued > 0
        AND items.item_type IN (
          'raw_material',
          'consumable'
        )
    `);

    const issues = rawIssues.rows;

    const RawProduction = await pool.query(`
      SELECT
        to_char(
          production.production_date,
          'YYYY-MM-DD'
        ) AS date,
        production.created_at,
        production.kernel_used,
        production.pko_produced,
        production.pkc_produced,
        'produce' AS type,
        2 AS event_order
      FROM production
    `);

    const production = RawProduction.rows;

    /*
     * Storekeeper's finished-product records.
     *
     * received = quantity put into finished-product stock
     * issued   = quantity dispatched or sold
     */
    const RawProductStock = await pool.query(`
      SELECT
        items.item_id,
        items.name,
        items.item_type,
        to_char(
          stock_counts.count_date,
          'YYYY-MM-DD'
        ) AS date,
        stock_counts.created_at,
        stock_counts.received,
        stock_counts.issued
      FROM stock_counts
      INNER JOIN items
        ON stock_counts.item_id = items.item_id
      WHERE items.item_type = 'product'
        AND (
          stock_counts.received > 0
          OR stock_counts.issued > 0
        )
    `);

    const productStock = RawProductStock.rows;

    /*
     * Group finished products received by date.
     */
    const productReceiptsByDate = {};

    productStock.forEach((item) => {
      const quantityReceived = Number(item.received) || 0;

      if (quantityReceived <= 0) {
        return;
      }

      if (!productReceiptsByDate[item.date]) {
        productReceiptsByDate[item.date] = {};
      }

      if (!productReceiptsByDate[item.date][item.item_id]) {
        productReceiptsByDate[item.date][item.item_id] = {
          item_id: item.item_id,
          name: item.name,
          quantity: 0,
          created_at: item.created_at
        };
      }

      productReceiptsByDate[item.date][item.item_id]
        .quantity += quantityReceived;
    });

    /*
     * Create dispatch events for finished products.
     */
    const productDispatches = [];

    productStock.forEach((item) => {
      const quantityIssued = Number(item.issued) || 0;

      if (quantityIssued <= 0) {
        return;
      }

      productDispatches.push({
        item_id: item.item_id,
        name: item.name,
        item_type: item.item_type,
        date: item.date,
        created_at: item.created_at,
        quantity: quantityIssued,
        type: 'product_out',
        event_order: 3
      });
    });

    const events = [];

    events.push(...purchases);
    events.push(...issues);
    events.push(...production);
    events.push(...productDispatches);

    /*
     * Same-day order:
     *
     * 0 = purchases
     * 1 = raw-material and consumable issues
     * 2 = production and finished-product receipt
     * 3 = product dispatch
     */
    events.sort((a, b) => {
      return (
        a.date.localeCompare(b.date) ||
        a.event_order - b.event_order ||
        new Date(a.created_at) -
          new Date(b.created_at)
      );
    });

    /*
     * Raw-material and consumable inventory.
     */
    const stock = {};

    /*
     * Finished-product inventory.
     *
     * Each product keeps a running quantity and value.
     */
    const finishedStock = {};

    const output = [];
    const dispatchOutput = [];
    const issueCostByDate = {};

    function avg(itemId) {
      const stockName = stock[itemId];

      if (!stockName) {
        stock[itemId] = {
          quantity: 0,
          value: 0
        };

        return 0;
      }

      if (stockName.quantity === 0) {
        return 0;
      }

      return stockName.value / stockName.quantity;
    }

    function finishedAvg(itemId) {
      const product = finishedStock[itemId];

      if (!product || product.quantity === 0) {
        return 0;
      }

      return product.value / product.quantity;
    }

    function addFinishedProduct(receipt, productCost) {
      if (!receipt || receipt.quantity <= 0) {
        return 0;
      }

      const itemId = receipt.item_id;

      if (!finishedStock[itemId]) {
        finishedStock[itemId] = {
          item_id: itemId,
          name: receipt.name,
          quantity: 0,
          value: 0
        };
      }

      finishedStock[itemId].quantity +=
        receipt.quantity;

      finishedStock[itemId].value +=
        productCost;

      return finishedAvg(itemId);
    }

    events.forEach((event) => {
      if (event.type === 'in') {
        const itemId = event.item_id;

        if (!stock[itemId]) {
          stock[itemId] = {
            quantity: 0,
            value: 0
          };
        }

        const quantity = Number(event.quantity);
        const value = Number(event.value);

        stock[itemId].quantity += quantity;
        stock[itemId].value += value;

      } else if (event.type === 'out') {
        const itemId = event.item_id;

        if (!stock[itemId]) {
          stock[itemId] = {
            quantity: 0,
            value: 0
          };
        }

        const quantity = Number(event.quantity);
        const averageCost = avg(itemId);
        const issueCost = averageCost * quantity;

        stock[itemId].quantity -= quantity;
        stock[itemId].value -= issueCost;

        if (!issueCostByDate[event.date]) {
          issueCostByDate[event.date] = {};
        }

        if (!issueCostByDate[event.date][itemId]) {
          issueCostByDate[event.date][itemId] = {
            item_id: itemId,
            name: event.name,
            item_type: event.item_type,
            quantity: 0,
            cost: 0
          };
        }

        issueCostByDate[event.date][itemId]
          .quantity += quantity;

        issueCostByDate[event.date][itemId]
          .cost += issueCost;

      } else if (event.type === 'produce') {
        const dailyIssueCosts =
          issueCostByDate[event.date] || {};

        const materialsCosted =
          Object.values(dailyIssueCosts);

        /*
         * There is currently one raw material.
         *
         * Its name is not hardcoded.
         */
        const rawMaterial = materialsCosted.find(
          (material) => {
            return (
              material.item_type === 'raw_material'
            );
          }
        );

        /*
         * The storekeeper's issued raw-material
         * quantity controls costing.
         */
        const kernelIssued = rawMaterial
          ? rawMaterial.quantity
          : 0;

        const avgKernelCost =
          rawMaterial && rawMaterial.quantity > 0
            ? rawMaterial.cost /
              rawMaterial.quantity
            : 0;

        const totalKernelCost = rawMaterial
          ? rawMaterial.cost
          : 0;

        /*
         * The manager's kernel figure is retained
         * only for comparison.
         */
        const managerKernelUsed =
          Number(event.kernel_used) || 0;

        const kernelVariance =
          managerKernelUsed - kernelIssued;

        const kernelVariancePercentage =
          kernelIssued > 0
            ? (
                kernelVariance /
                kernelIssued
              ) * 100
            : 0;

        /*
         * Includes every raw material and
         * consumable issued that day.
         */
        const totalCost = materialsCosted.reduce(
          (total, material) => {
            return total + material.cost;
          },
          0
        );

        /*
         * Current cost-allocation rule.
         */
        const pkoProductionCost =
          totalCost * 0.75;

        const pkcProductionCost =
          totalCost * 0.25;

        const managerPkoProduced =
          Number(event.pko_produced) || 0;

        const managerPkcProduced =
          Number(event.pkc_produced) || 0;

        const dailyProductReceipts =
          productReceiptsByDate[event.date] || {};

        const productReceipts =
          Object.values(dailyProductReceipts);

        /*
         * PKO and PKC remain named here because
         * your production table itself has fixed
         * pko_produced and pkc_produced columns.
         */
        const pkoReceipt = productReceipts.find(
          (product) => {
            return (
              product.name.trim().toUpperCase() ===
              'PKO'
            );
          }
        );

        const pkcReceipt = productReceipts.find(
          (product) => {
            return (
              product.name.trim().toUpperCase() ===
              'PKC'
            );
          }
        );

        /*
         * The storekeeper's received quantities
         * increase finished-product inventory.
         */
        const pkoReceived = pkoReceipt
          ? pkoReceipt.quantity
          : 0;

        const pkcReceived = pkcReceipt
          ? pkcReceipt.quantity
          : 0;

        const pkoVariance =
          managerPkoProduced - pkoReceived;

        const pkcVariance =
          managerPkcProduced - pkcReceived;

        /*
         * Add the day's products and allocated
         * production costs to the running stock.
         *
         * This creates the weighted-average tank
         * value.
         */
        const pkoTankAverageCost =
          addFinishedProduct(
            pkoReceipt,
            pkoProductionCost
          );

        const pkcStockAverageCost =
          addFinishedProduct(
            pkcReceipt,
            pkcProductionCost
          );

        const materials =
          materialsCosted.map((material) => {
            return {
              item_id: material.item_id,
              name: material.name,
              item_type: material.item_type,
              quantity_issued:
                material.quantity,
              average_cost:
                material.quantity > 0
                  ? material.cost /
                    material.quantity
                  : 0,
              total_cost: material.cost
            };
          });

        output.push({
          production_date: event.date,
          created_at: event.created_at,

          kernel_issued: kernelIssued,
          manager_kernel_used:
            managerKernelUsed,
          kernel_variance: kernelVariance,
          kernel_variance_percentage:
            kernelVariancePercentage,

          avg_kernel_cost: avgKernelCost,
          total_kernel_cost: totalKernelCost,

          materials_costed: materials,
          total_cost: totalCost,

          manager_pko_produced:
            managerPkoProduced,
          storekeeper_pko_received:
            pkoReceived,
          pko_variance: pkoVariance,

          manager_pkc_produced:
            managerPkcProduced,
          storekeeper_pkc_received:
            pkcReceived,
          pkc_variance: pkcVariance,

          pko_production_cost:
            pkoProductionCost,
          pkc_production_cost:
            pkcProductionCost,

          pko_daily_cost_per_kg:
            pkoReceived > 0
              ? pkoProductionCost /
                pkoReceived
              : 0,

          pkc_daily_cost_per_kg:
            pkcReceived > 0
              ? pkcProductionCost /
                pkcReceived
              : 0,

          /*
           * Weighted average after adding this
           * day's production to existing stock.
           */
          pko_tank_average_cost:
            pkoTankAverageCost,

          pkc_stock_average_cost:
            pkcStockAverageCost,

          receipt_status:
            pkoReceipt && pkcReceipt
              ? 'received'
              : 'pending_receipt'
        });

      } else if (event.type === 'product_out') {
        const itemId = event.item_id;
        const quantity = Number(event.quantity);

        if (!finishedStock[itemId]) {
          finishedStock[itemId] = {
            item_id: itemId,
            name: event.name,
            quantity: 0,
            value: 0
          };
        }

        /*
         * The average is calculated before the
         * dispatch reduces the tank balance.
         */
        const averageCost =
          finishedAvg(itemId);

        const costOfDispatch =
          averageCost * quantity;

        finishedStock[itemId].quantity -=
          quantity;

        finishedStock[itemId].value -=
          costOfDispatch;

        dispatchOutput.push({
          dispatch_date: event.date,
          created_at: event.created_at,
          item_id: itemId,
          name: event.name,
          quantity_dispatched: quantity,
          weighted_average_cost:
            averageCost,
          cost_of_dispatch:
            costOfDispatch,
          remaining_quantity:
            finishedStock[itemId].quantity,
          remaining_value:
            finishedStock[itemId].value
        });
      }
    });

    const finishedStockBalance =
      Object.values(finishedStock).map(
        (product) => {
          return {
            item_id: product.item_id,
            name: product.name,
            quantity: product.quantity,
            value: product.value,
            weighted_average_cost:
              product.quantity > 0
                ? product.value /
                  product.quantity
                : 0
          };
        }
      );

    res.status(200).json({
      production_costs: output,
      product_dispatch_costs:
        dispatchOutput,
      finished_stock:
        finishedStockBalance
    });

  } catch (error) {
    console.log(error);

    res.status(500).json({
      err: 'Could not calculate production cost'
    });
  }
});

app.get('/api/dashboard', async function (req, res) {
  try {
    const selectedDate = req.query.date || null;

    let datesql;

    if (selectedDate) {
      datesql = '$1::date';
    } else {
      datesql = 'CURRENT_DATE';
    }

    let param = [];

    if (selectedDate) {
      param = [selectedDate];
    }

    const RawStockLevels = await pool.query(`
      SELECT
        items.name,
        COALESCE(
          SUM(
            COALESCE(stock_counts.received, 0) -
            COALESCE(stock_counts.issued, 0)
          ),
          0
        ) AS remaining,
        items.item_type
      FROM items
      LEFT JOIN stock_counts
        ON stock_counts.item_id = items.item_id
        AND stock_counts.count_date <= ${datesql}
      GROUP BY items.name, items.item_type
    `, param);

    const stockLevels = RawStockLevels.rows.map((stockLevel) => {
      return {
        item: stockLevel.name,
        remaining: Number(stockLevel.remaining),
        item_type: stockLevel.item_type
      };
    });

    res.status(200).json(stockLevels);

  } catch (error) {
    console.log(error);

    res.status(500).json({
      error: 'Could not retrieve stock levels'
    });
  }
});

app.get('/api/dashboard_period', async function(req, res){
  try{
    const selectedDate = '2026-07-11';
    const datesql = selectedDate ? '$1::date' : 'CURRENT_DATE';
    const param = selectedDate ? [selectedDate] : [];
    
    const RawProduction = await pool.query(`SELECT 'day' AS period,
    COALESCE (SUM(production.kernel_used), 0) AS kernel_used,
    COALESCE (SUM(production.pko_produced), 0) AS pko_produced,
    COALESCE (SUM(production.pkc_produced), 0) AS pkc_produced
    FROM production
    WHERE production.production_date = ${datesql}
    
    UNION ALL 
    
    SELECT 'week',
    COALESCE(SUM(production.kernel_used), 0),
    COALESCE (SUM(production.pko_produced), 0),
    COALESCE (SUM(production.pkc_produced), 0)
    FROM production
    WHERE production.production_date >= date_trunc('week', ${datesql})
    AND production.production_date < date_trunc('week', ${datesql}) + INTERVAL '7 days'
    
    UNION ALL 
    
    SELECT 'month',
    COALESCE(SUM(production.kernel_used), 0),
    COALESCE (SUM(production.pko_produced), 0),
    COALESCE (SUM(production.pkc_produced), 0)
    FROM production
    WHERE production.production_date >= date_trunc('month', ${datesql})
    AND production.production_date < date_trunc('month', ${datesql}) + INTERVAL '1 month'`, param)
    const production = RawProduction.rows
    
    const RawSales = await pool.query(`SELECT 'day' AS period,
    items.name AS name,
    COALESCE (SUM(sales.quantity), 0) AS quantity_sold,
    COALESCE (SUM(sales.quantity * sales.unit_price) / NULLIF(SUM(sales.quantity), 0), 0) AS average_unit_price,
    COALESCE (SUM(sales.quantity * sales.unit_price), 0) AS total_sales
    FROM items
    LEFT JOIN sales
    ON sales.item_id = items.item_id
    AND sales.sales_date = ${datesql}
    WHERE items.item_type = 'product'
    GROUP BY items.name
    
    UNION ALL
    
    SELECT 'week',
    items.name,
   COALESCE (SUM(sales.quantity), 0),
    COALESCE (SUM(sales.quantity * sales.unit_price) / NULLIF(SUM(sales.quantity), 0), 0),
    COALESCE (SUM(sales.quantity * sales.unit_price), 0)
    FROM items
    LEFT JOIN sales ON sales.item_id = items.item_id 
    AND sales.sales_date >= date_trunc('week', ${datesql})
    AND sales.sales_date < date_trunc('week', ${datesql}) + INTERVAL '7 days'
    WHERE items.item_type = 'product'
    GROUP BY items.name
    
    UNION ALL
    
    SELECT 'month',
    items.name,
   COALESCE (SUM(sales.quantity), 0),
    COALESCE (SUM(sales.quantity * sales.unit_price) / NULLIF(SUM(sales.quantity), 0), 0),
    COALESCE (SUM(sales.quantity * sales.unit_price), 0)
    FROM items
    LEFT JOIN sales ON sales.item_id = items.item_id 
    AND sales.sales_date >= date_trunc('month', ${datesql})
    AND sales.sales_date < date_trunc('month', ${datesql}) + '1 month'
    WHERE items.item_type = 'product'
    GROUP BY items.name
    `, param);
    const sales = RawSales.rows;
    
    const rawExpenses = await pool.query(`SELECT 'day' AS period,
    COALESCE (SUM(expenses.amount_spent), 0) AS total_spent
    FROM expenses WHERE
    expenses.category = 'Expense'
    AND expenses.expense_date = ${datesql}
    
    UNION ALL
    
    SELECT 'week',
    COALESCE(SUM(expenses.amount_spent), 0)
    FROM expenses 
    WHERE
    expenses.category = 'Expense'
    AND expenses.expense_date >= date_trunc('week', ${datesql})
    AND expenses.expense_date < date_trunc('week', ${datesql}) + INTERVAL '7 days'
    
    UNION ALL
    
    SELECT 'month',
    COALESCE(SUM(expenses.amount_spent), 0)
    FROM expenses 
    WHERE
    expenses.category = 'Expense'
    AND expenses.expense_date >= date_trunc('month', ${datesql})
    AND expenses.expense_date < date_trunc('month', ${datesql}) + INTERVAL '1 month'`, param);
    const expenses = rawExpenses.rows;
    
    const output = {};
    
    production.forEach((row) => {
      output[row.period] = {
        production: {
        kernel_used: Number(row.kernel_used),
        pko_produced: Number(row.pko_produced),
        pkc_produced: Number(row.pkc_produced)
        },
        sales: {},
        expenses: {}
    }
    });
    sales.forEach((row) => {
      output[row.period].sales[row.name] = {
        quantity_sold: Number(row.quantity_sold),
        average_unit_price: Number(row.average_unit_price),
        total_sales: Number(row.total_sales)
      }
    });
    
    expenses.forEach((row) => {
      output[row.period].expenses = { total_expenses: Number(row.total_spent)
      };
      });
    res.status(200).json(output);
  }catch (error){
    console.log(error)
    res.status(500).json({
      err: 'Failed to load dashboard period data'
    })
  }
  })
  

  


