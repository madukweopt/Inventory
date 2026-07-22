const express = require('express');
const app = express();
const PORT = 3000;

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_QYnhfgZ2k4xN@ep-lively-king-ab2zzg6a-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorised: false}
});

app.use(express.json());
app.use(express.static('public'));

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
  pool.query('SELECT items.name, stock_counts.count_date,  stock_counts.created_at,  stock_counts.received,    stock_counts.issued,               SUM(stock_counts.received - stock_counts.issued)               OVER (                       PARTITION BY stock_counts.item_id ORDER BY                  stock_counts.created_at) - (stock_counts.received - stock_counts.issued)                            AS opening_stock,                   SUM(                       stock_counts.received - stock_counts.issued)                           OVER ( PARTITION BY stock_counts.item_id ORDER BY stock_counts.created_at) AS closing_stock FROM stock_counts INNER JOIN items ON stock_counts.item_id = items.item_id ORDER BY stock_counts.created_at', function(err, result){
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
