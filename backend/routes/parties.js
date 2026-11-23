// Customers and suppliers: lists, details, changes, and their purchase and supply histories.
// Moved from server.js unchanged; server.js mounts this router where the routes used to be.
const {pool}=require('../db');
const {requireRole}=require('../auth');
const router=require('express').Router();

// Handles GET /api/customers requests.
router.get("/api/customers",requireRole(['admin','manager','storekeeper']),function(req,res) {
	pool.query(`SELECT
    customers.customer_id,
    customers.name,
    customers.phone_number,
    customers.address,
    customers.email,
    customers.note,
    customers.created_at,

    COALESCE(
        SUM(invoice_amount(sales.quantity,sales.unit_price)),
        0
    ) AS total_purchases,

    COUNT(sales.sales_id) AS number_of_purchases,

    COALESCE(
        SUM(sales.quantity),
        0
    ) AS total_quantity,

    COALESCE(
        SUM(
            CASE
                WHEN LOWER(items.name) = 'pko'
                THEN sales.quantity
                ELSE 0
            END
        ),
        0
    ) AS pko_bought,

    COALESCE(
        SUM(
            CASE
                WHEN LOWER(items.name) = 'pkc'
                THEN sales.quantity
                ELSE 0
            END
        ),
        0
    ) AS pkc_bought,

    (
        SELECT items2.name
        FROM sales AS sales2

        JOIN items AS items2
        ON items2.item_id = sales2.item_id

        WHERE sales2.customer_id = customers.customer_id

        GROUP BY items2.name

        ORDER BY COUNT(*) DESC

        LIMIT 1
    ) AS main_item,

    TO_CHAR(
        MAX(sales.sales_date),
        'YYYY-MM-DD'
    ) AS last_purchase_date,

    (
        SELECT sales2.quantity
        FROM sales AS sales2
        WHERE sales2.customer_id = customers.customer_id
        ORDER BY
            sales2.sales_date DESC,
            sales2.sales_id DESC
        LIMIT 1
    ) AS last_purchase_qty

FROM customers

LEFT JOIN sales
ON sales.customer_id = customers.customer_id

LEFT JOIN items
ON items.item_id = sales.item_id

GROUP BY
    customers.customer_id,
    customers.name,
    customers.phone_number,
    customers.address,
    customers.email,
    customers.note,
    customers.created_at

ORDER BY customers.name`,
		// Runs the callback required by the surrounding operation.
		function(err,result) {
			if(err) {
				console.error(err);
				return res.status(500).json({
					err: "Could not get customers"
				});
			}
			res.status(200).json(result.rows);
		}
	);
});

// Handles GET /api/suppliers requests.
router.get('/api/suppliers',requireRole(['admin','manager','storekeeper']),function(req,res) {
	pool.query(`SELECT 
    suppliers.supplier_id,
    suppliers.name,
    suppliers.phone_number,
    suppliers.address,
    suppliers.email,
    suppliers.note,
    suppliers.created_at,

    COALESCE(
        SUM(
            purchases.quantity_supplied * purchases.unit_cost
        ),
        0
    ) AS total_supplies,

    COUNT(
        purchases.purchase_id
    ) AS number_of_supplies,

    COALESCE(
        SUM(
            purchases.quantity_supplied
        ),
        0
    ) AS total_quantity,

    (
        SELECT items2.name
        FROM items AS items2

        INNER JOIN purchases AS purchases2
        ON items2.item_id = purchases2.item_id

        WHERE purchases2.supplier_id = suppliers.supplier_id

        GROUP BY items2.name

        ORDER BY COUNT(*) DESC

        LIMIT 1
    ) AS main_item,

    TO_CHAR(
        MAX(purchases.purchase_date),
        'YYYY-MM-DD'
    ) AS last_supply_date,

    (
        SELECT items2.name
        FROM purchases AS purchases2

        INNER JOIN items AS items2
        ON items2.item_id = purchases2.item_id

        WHERE purchases2.supplier_id = suppliers.supplier_id

        ORDER BY
            purchases2.purchase_date DESC,
            purchases2.purchase_id DESC

        LIMIT 1
    ) AS last_supply_item,

    (
        SELECT purchases2.quantity_supplied
        FROM purchases AS purchases2

        WHERE purchases2.supplier_id = suppliers.supplier_id

        ORDER BY
            purchases2.purchase_date DESC,
            purchases2.purchase_id DESC

        LIMIT 1
    ) AS last_supply_qty

FROM suppliers

LEFT JOIN purchases
ON purchases.supplier_id = suppliers.supplier_id

GROUP BY
    suppliers.supplier_id,
    suppliers.name,
    suppliers.phone_number,
    suppliers.address,
    suppliers.email,
    suppliers.note,
    suppliers.created_at

ORDER BY suppliers.name`,
		// Handles the result returned by the supplier query.
		function(error,result) {
			if(error) {
				console.log(error);
				return res.status(500).json({
					err: 'Could not load supplier details'
				});
			}
			return res.status(200).json(result.rows);
		});
});

// Handles GET /api/customers/:id requests.
router.get('/api/customers/:id',requireRole(['admin','manager','storekeeper']),async function(req,res) {
	try {
		const customerId=req.params.id;
		const result=await pool.query(`
		SELECT customer_id,
		name, 
		phone_number, 
		address, 
		email, 
		note
		FROM customers
		WHERE customer_id = $1`,
			[customerId]);

		return res.status(200).json(result.rows[0]);
	} catch(error) {
		console.error(error);
		res.status(500).json({
			err: 'Failed to load customer details'
		});
	}


})

// Handles PATCH /api/customers/:id requests.
router.patch('/api/customers/:id',requireRole(['admin','manager']),async function(req,res) {
	try {
		const customerId=req.params.id;
		const customer=req.body;
		const updated=await pool.query(`UPDATE 
	customers
	SET name = $1,
	phone_number = $2,
	address = $3,
	email = $4,
	note = $5
	WHERE customer_id = $6 RETURNING *`,
			[customer.name,
			customer.phone,
			customer.address,
			customer.email,
			customer.note,
				customerId]);
		return res.json(updated.rows[0])

	} catch(error) {
		console.log(error);
		return res.status(500).json({
			err: 'failed to update customer'
		})
	}
})


// Handles GET /api/suppliers/:id requests.
router.get('/api/suppliers/:id',requireRole(['admin','manager','storekeeper']),async function(req,res) {
	try {
		const supplierId=req.params.id;
		const result=await pool.query(`
		SELECT supplier_id,
		name,
		phone_number,
		address,
		email,
		note
		FROM suppliers
		WHERE supplier_id = $1`,
			[supplierId]);

		return res.status(200).json(result.rows[0]);
	} catch(error) {
		console.error(error);
		res.status(500).json({
			err: 'Failed to load supplier details'
		});
	}


})

// Handles PATCH /api/suppliers/:id requests.
router.patch('/api/suppliers/:id',requireRole(['admin','manager']),async function(req,res) {
	try {
		const supplierId=req.params.id;
		const supplier=req.body;
		const updated=await pool.query(`UPDATE
	suppliers
	SET name = $1,
	phone_number = $2,
	address = $3,
	email = $4,
	note = $5
	WHERE supplier_id = $6 RETURNING *`,
			[supplier.name,
			supplier.phone,
			supplier.address,
			supplier.email,
			supplier.note,
				supplierId]);
		return res.json(updated.rows[0])

	} catch(error) {
		console.log(error);
		return res.status(500).json({
			err: 'failed to update supplier'
		})
	}
})

// Handles POST /api/customers requests.
router.post('/api/customers',requireRole(['admin','manager']),function(req,res) {
	const customer=req.body;
	if(!customer.name||!customer.phone||!customer.address) {
		return res.status(400).json({
			err: 'invalid request'
		})
	}
	pool.query(`INSERT INTO customers
		(name, phone_number, address, email, note)
		VALUES($1, $2, $3, $4, $5) RETURNING*`,
		[customer.name,customer.phone,customer.address,customer.email,customer.note],
		// Handles the result of the preceding database query.
		function(err,result) {
			if(err) {
				console.log(err);
				return res.status(500).json({
					err: 'Could not save customer, server problem'
				});
			}
			return res.status(201).json(result.rows[0])
		})

})

// Handles POST /api/suppliers requests.
router.post('/api/suppliers',requireRole(['admin','manager']),function(req,res) {
	const supplier=req.body;
	if(!supplier.name||!supplier.phone||!supplier.address) {
		return res.status(400).json({
			err: 'invalid request'
		})
	}
	pool.query(`INSERT INTO suppliers
		(name, phone_number, address, email, note)
		VALUES($1, $2, $3, $4, $5) RETURNING*`,
		[supplier.name,supplier.phone,supplier.address,supplier.email,supplier.note],
		// Handles the result of the preceding database query.
		function(err,result) {
			if(err) {
				console.log(err);
				return res.status(500).json({
					err: 'Could not save supplier, server problem'
				});
			}
			return res.status(201).json(result.rows[0])
		})

})


// Handles GET /api/customers-purchases requests.
router.get('/api/customers-purchases',requireRole(['admin','manager','storekeeper']),async function(req,res) {
	const customerId=req.query.customerId;
	const result=await pool.query(`

		SELECT sales_id,
		TO_CHAR(sales_date, 'YYYY-MM-DD') 
		  AS purchase_date,
		items.name AS Item,
		sales.quantity,
		sales.unit_price,
		invoice_amount(sales.quantity,sales.unit_price) AS total
		FROM sales
		INNER JOIN items
		ON sales.item_id = items.item_id
		WHERE
		sales.customer_id = $1
		ORDER BY sales.sales_date DESC,
		sales.sales_id DESC 
		`,[customerId]);
	res.json(result.rows);
})

// Handles GET /api/supplier-supplies requests.
router.get('/api/supplier-supplies',requireRole(['admin','manager','storekeeper']),async function(req,res) {
	try {
		const supplierId=req.query.supplierId;
		const result=await pool.query(`
		SELECT 
	purchases.supplier_id,
	TO_CHAR(purchases.purchase_date, 'YYYY-MM-DD') AS supply_date,
	items.name AS item,
	purchases.quantity_supplied,
	purchases.unit_cost,
	purchases.quantity_supplied * purchases.unit_cost
	AS total
	FROM purchases
	INNER JOIN items
	ON items.item_id = purchases.item_id
	WHERE purchases.supplier_id = $1
	ORDER BY purchases.purchase_date DESC,
	purchases.purchase_id DESC`,[supplierId]);
		res.json(result.rows);
	} catch(error) {
		console.log(error);
		res.status(500).json({
			err: 'Could not load supplier history'
		})
	}
})

module.exports={router};
