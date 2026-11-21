// Items and product prices.
// Moved from server.js unchanged; server.js mounts this router where the routes used to be.
const {pool}=require('../db');
const {requireRole}=require('../auth');
const router=require('express').Router();

// Handles GET /api/items requests.
router.get("/api/items",function(req,res) {
	// Handles the result of the preceding database query.
	pool.query("SELECT * FROM items ORDER BY name",function(err,result) {
		if(err) {
			console.error(err);
			return res.status(500).json({
				error: "Database connection failed"
			});
		}
		res.json(result.rows);
	});
});

// Returns the complete effective-date price history for saleable products.
router.get('/api/prices',requireRole(['admin','manager','storekeeper']),async function(req,res) {
	try {
		const result=await pool.query(`SELECT
			product_prices.price_id,product_prices.item_id,items.name,
			product_prices.unit_price,
			TO_CHAR(product_prices.effective_date,'YYYY-MM-DD') AS effective_date,
			product_prices.created_at
		FROM product_prices
		INNER JOIN items ON items.item_id=product_prices.item_id
		WHERE items.item_type='product'
		ORDER BY items.name,product_prices.effective_date DESC,product_prices.price_id DESC`);
		return res.json(result.rows);
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not load product prices' });
	}
});

// Returns the price in force for a product on a selected sales date.
router.get('/api/prices/lookup',requireRole(['admin','manager','storekeeper']),async function(req,res) {
	const itemId=Number(req.query.item_id);
	const salesDate=String(req.query.date||'');
	if(!Number.isInteger(itemId)||itemId<1||!/^\d{4}-\d{2}-\d{2}$/.test(salesDate)) {
		return res.status(400).json({ err: 'Choose a product and sales date' });
	}
	try {
		const result=await pool.query(`SELECT product_prices.unit_price,
			TO_CHAR(product_prices.effective_date,'YYYY-MM-DD') AS effective_date
		FROM product_prices
		INNER JOIN items ON items.item_id=product_prices.item_id
		WHERE product_prices.item_id=$1 AND product_prices.effective_date<=$2::date
		AND items.item_type='product'
		ORDER BY product_prices.effective_date DESC,product_prices.price_id DESC LIMIT 1`,
		[itemId,salesDate]);
		if(result.rows.length===0) return res.status(404).json({ err: 'No price has been set for this product on the selected date' });
		return res.json(result.rows[0]);
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not load the product price' });
	}
});

// Saves or corrects a product price beginning on its effective date.
router.post('/api/prices',requireRole(['admin']),async function(req,res) {
	const itemId=Number(req.body.item_id);
	const unitPrice=Number(req.body.unit_price);
	const effectiveDate=String(req.body.effective_date||'');
	if(!Number.isInteger(itemId)||itemId<1||!Number.isFinite(unitPrice)||unitPrice<=0||!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
		return res.status(400).json({ err: 'Enter a product, valid price and effective date' });
	}
	try {
		const result=await pool.query(`INSERT INTO product_prices
			(item_id,unit_price,effective_date,created_by)
			SELECT items.item_id,$2,$3::date,$4 FROM items
			WHERE items.item_id=$1 AND items.item_type='product'
			ON CONFLICT (item_id,effective_date) DO UPDATE SET
			unit_price=EXCLUDED.unit_price,created_by=EXCLUDED.created_by,created_at=CURRENT_TIMESTAMP
			RETURNING *`,[itemId,unitPrice,effectiveDate,req.session.user_id]);
		if(result.rows.length===0) return res.status(400).json({ err: 'Prices can only be set for saleable products' });
		return res.status(201).json(result.rows[0]);
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not save the product price' });
	}
});

module.exports={router};
