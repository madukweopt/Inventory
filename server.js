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
  })
})
