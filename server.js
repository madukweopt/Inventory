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
