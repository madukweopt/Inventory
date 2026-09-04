require("dotenv").config();
const express=require("express");
const path=require("path");
const app=express();
const PORT=process.env.PORT||3000;

const { Pool }=require("pg");

const session=require('express-session');
const pgSession=require('connect-pg-simple')(session);

const argon2=require('argon2');

const pool=new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: {
		rejectUnauthorized: false
	}
});

pool.on("error",function(err) {
	console.error("Database connection error:",err.message);
});

app.use(express.json());

app.use(session({
	store: new pgSession({
		pool: pool,
		createTableIfMissing: true
	}),
	secret: process.env.SESSION_SECRET,
	resave: false,
	saveUninitialized: false,
	cookie: {
		maxAge: 1000*60*60*8
	}
}));


const publicDirectory=path.join(__dirname,"..","public");
const htmlDirectory=path.join(publicDirectory,"html");

app.use("/css",express.static(path.join(publicDirectory,"css")));
app.use("/js",express.static(path.join(publicDirectory,"js")));
app.use("/images",express.static(path.join(publicDirectory,"images")));

app.get(["/","/login.html"],function(req,res) {
	res.sendFile(path.join(htmlDirectory,"login.html"));
});

app.get("/index.html",requirePageLogin,function(req,res) {
	res.sendFile(path.join(htmlDirectory,"index.html"));
});

app.get("/forms.html",requirePageLogin,function(req,res) {
	res.sendFile(path.join(htmlDirectory,"forms.html"));
});

app.get("/checks.html",requirePageLogin,function(req,res) {
	res.sendFile(path.join(htmlDirectory,"checks.html"));
});

app.listen(PORT,() => {
	console.log(`Server running at http://localhost:${PORT}`);
});

app.post('/api/login',async function(req,res) {
	const username=req.body.username;
	const password=req.body.password;
	const result=await pool.query(
		`SELECT * FROM users 
		WHERE username = $1`,
		[username]
	);
	if(result.rows.length===0) {
		return res.status(400).json({ message: 'invalide username or password' });
	}
	const user=result.rows[0];
	const passwordMatch=await argon2.verify(user.password_hash,password);
	if(!passwordMatch) {
		return res.status(400).json({ message: 'Invalid username or password' });
	}
	req.session.user_id=user.user_id;
	req.session.user_name=user.username;
	return res.json({
		message: 'Login successful',
		user_name: user.username
	})
});

app.use('/api',requireLogin);

app.get("/api/items",function(req,res) {
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

app.get("/api/customers",function(req,res) {
	pool.query(`SELECT
    customers.customer_id,
    customers.name,
    customers.phone_number,
    customers.address,
    customers.email,
    customers.note,
    customers.created_at,

    COALESCE(
        SUM(sales.quantity * sales.unit_price),
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

app.get('/api/suppliers',function(req,res) {
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

ORDER BY suppliers.name`,function(error,result) {
		if(error) {
			console.log(error);
			return res.status(500).json({
				err: 'Could not load supplier details'
			});
		}
		return res.status(200).json(result.rows);
	});
});

app.get('/api/customers/:id',async function(req,res) {
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

app.patch('/api/customers/:id',async function(req,res) {
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


app.get("/api/sales",function(req,res) {
	pool.query(
		`SELECT
		sales.item_id,
		sales.sales_id,
		to_char(sales.sales_date, 'YYYY-MM-DD') AS sales_date,
		sales.created_at,
		sales.customer_id,
		customers.name AS customer,
		items.name,
		sales.quantity,
		sales.unit_price,
		sales.quantity * sales.unit_price AS total
		FROM sales
		INNER JOIN customers
		ON sales.customer_id = customers.customer_id
		INNER JOIN items
		ON sales.item_id = items.item_id
		ORDER BY sales.created_at DESC`,
		function(err,result) {
			if(err) {
				return res.status(500).json({
					err: "Could not load sales. Database connection failed"
				});
			}
			res.status(200).json(result.rows);
		}
	);
});

app.get("/api/stock_counts",function(req,res) {
	pool.query(
		"SELECT stock_counts.count_id, stock_counts.item_id, items.name, to_char(stock_counts.count_date, 'YYYY-MM-DD') AS count_date, stock_counts.created_at, stock_counts.received, stock_counts.issued, SUM(stock_counts.received - stock_counts.issued) OVER (PARTITION BY stock_counts.item_id ORDER BY stock_counts.created_at) - (stock_counts.received - stock_counts.issued) AS opening_stock, SUM(stock_counts.received - stock_counts.issued) OVER (PARTITION BY stock_counts.item_id ORDER BY stock_counts.created_at) AS closing_stock FROM stock_counts INNER JOIN items ON stock_counts.item_id = items.item_id ORDER BY stock_counts.created_at DESC",
		function(err,result) {
			if(err) {
				console.log(err);
				return res.status(500).json({
					err: "Failed to retrieve stock record."
				});
			}
			res.status(200).json(result.rows);
		}
	);
});

app.get("/api/purchases",function(req,res) {
	pool.query(
		`SELECT
    purchases.purchase_id,
	purchases.item_id,
    to_char(purchases.purchase_date, 'YYYY-MM-DD') AS purchase_date,
    purchases.created_at,
    purchases.supplier_id,
    suppliers.name AS supplier,
    purchases.quantity_supplied,
    items.name, purchases.unit_cost,
    purchases.quantity_supplied *
    purchases.unit_cost AS total_cost
    FROM purchases
    INNER JOIN suppliers ON
    purchases.supplier_id = suppliers.supplier_id
    INNER JOIN items ON
    purchases.item_id = items.item_id
    ORDER BY purchases.purchase_date
    DESC, purchases.created_at DESC`,
		function(err,result) {
			if(err) {
				console.log(err.message);
				return res.status(500).json({
					err: "Failed to retrieve purchases record"
				});
			}
			res.status(200).json(result.rows);
		}
	);
});

app.get("/api/production",function(req,res) {
	pool.query(
		"SELECT production.production_id, to_char(production.production_date, 'YYYY-MM-DD') AS production_date, production.created_at, production.kernel_used, production.pko_produced, production.pkc_produced, ROUND((production.pko_produced / NULLIF(production.kernel_used, 0) * 100)::numeric, 2) AS pko_yield, ROUND((production.pkc_produced / NULLIF(production.kernel_used, 0) * 100)::numeric, 2) AS pkc_yield, to_char(production.production_hours, 'HH24:MI') AS production_hours, to_char(production.down_time, 'HH24:MI') AS down_time FROM production ORDER BY production.created_at DESC;",
		function(err,result) {
			if(err) {
				console.log(err);
				return res.status(500).json({
					err: "Failed to load production record from database"
				});
			}
			res.status(200).json(result.rows);
		}
	);
});

app.get("/api/expenses",function(req,res) {
	pool.query(
		`SELECT expenses.expense_id, to_char(expenses.expense_date, 'YYYY-MM-DD') AS expense_date, expenses.created_at, expenses.category, expenses.description,
    expenses.amount_spent
    FROM expenses
    ORDER BY
    expenses.created_at DESC;`,
		function(err,result) {
			if(err) {
				console.log(err);
				return res.status(500).json({
					err: "Failed to load expenses record from database"
				});
			}
			res.status(200).json(result.rows);
		}
	);
});

app.post("/api/sales",function(req,res) {
	const sales=req.body;
	if(
		!sales.customer_id||
		!sales.item_id||
		!sales.quantity||
		sales.quantity<=0||
		!sales.unit_price||
		sales.unit_price<=0
	) {
		return res.status(400).json({
			error: "could not save sale"
		});
	}
	pool.query(
		"INSERT INTO sales (sales_date, customer_id, item_id, quantity, unit_price) VALUES ($1, $2, $3, $4, $5) RETURNING *",
		[
			sales.sales_date,
			sales.customer_id,
			sales.item_id,
			sales.quantity,
			sales.unit_price
		],
		function(err,result) {
			if(err) {
				console.log(err);
				return res.status(500).json({
					err: "Could not save sale"
				});
			}
			res.status(201).json(result.rows[0]);
		}
	);
});

app.post("/api/purchases",function(req,res) {
	const purchase=req.body;
	if(
		!purchase.supplier_id||
		!purchase.item_id||
		!purchase.quantity_supplied||
		purchase.quantity_supplied<=0||
		!purchase.unit_cost||
		purchase.unit_cost<=0
	) {
		return res.status(400).json({
			error: "Could not submit purchase"
		});
	}
	pool.query(
		"INSERT INTO purchases(purchase_date, supplier_id, item_id, quantity_supplied, unit_cost) VALUES ($1, $2, $3, $4, $5) RETURNING *",
		[
			purchase.purchase_date,
			purchase.supplier_id,
			purchase.item_id,
			purchase.quantity_supplied,
			purchase.unit_cost
		],
		function(err,result) {
			if(err) {
				console.log(err);
				return res.status(500).json({
					err: "could not save purchase"
				});
			}
			res.status(201).json(result.rows[0]);
		}
	);
});

app.post("/api/stock_counts",function(req,res) {
	const stockInventory=req.body;
	if(
		!stockInventory.count_date||
		!stockInventory.item_id||
		!stockInventory.received||
		stockInventory.received<=0||
		!stockInventory.issued||
		stockInventory.issued<=0
	) {
		return res.status(400).json({
			error: "Could not submit stock"
		});
	}
	pool.query(
		"INSERT INTO stock_counts(count_date, item_id, received, issued) VALUES ($1, $2, $3, $4) RETURNING *",
		[
			stockInventory.count_date,
			stockInventory.item_id,
			stockInventory.received,
			stockInventory.issued
		],
		function(err,result) {
			if(err) {
				console.log(err);
				return res.status(500).json({
					err: "Server encountered a problem saving purchase"
				});
			}
			res.status(201).json(result.rows[0]);
		}
	);
});

app.post("/api/production",function(req,res) {
	const production=req.body;
	if(
		!production.production_date||
		!production.kernel_used||
		production.kernel_used<=0||
		!production.pko_produced||
		production.pko_produced<=0||
		!production.pkc_produced||
		production.pkc_produced<=0
	) {
		return res.status(400).json({
			err: "Check your inputs and try again"
		});
	}
	pool.query(
		"SELECT production_id FROM production WHERE production_date = $1::date",
		[production.production_date],
		function(err,existing) {
			if(err) {
				console.log(err);
				return res.status(500).json({
					err: "Failed to submit. Internal server error"
				});
			}
			if(existing.rows.length>0) {
				return res.status(409).json({
					err: "A production report already exists for this date"
				});
			}
			pool.query(
				"INSERT INTO production ( production_date, kernel_used, pko_produced, pkc_produced, production_hours, down_time ) VALUES ($1, $2, $3, $4, $5::interval, $6::interval) RETURNING *",
				[
					production.production_date,
					production.kernel_used,
					production.pko_produced,
					production.pkc_produced,
					production.production_hours,
					production.down_time
				],
				function(err,result) {
					if(err) {
						console.log(err);
						if(err.code==="23505") {
							return res.status(409).json({
								err: "A production report already exists for this date"
							});
						}
						return res.status(500).json({
							err: "Failed to submit. Internal server error"
						});
					}
					res.status(201).json(result.rows[0]);
				}
			);
		}
	);
});

app.post("/api/expenses",function(req,res) {
	const expense=req.body;
	if(
		!expense.expense_date||
		!expense.category||
		(expense.category!=="Expenses"&&
			expense.category!=="Asset/Capital Expenditure")||
		!expense.description||
		expense.description.length>100||
		!expense.amount_spent||
		expense.amount_spent<=0
	) {
		return res.status(400).json({
			err: "Check your inputs and try again"
		});
	}
	pool.query(
		"INSERT INTO expenses(expense_date, category, description, amount_spent) VALUES ($1, $2, $3, $4) RETURNING *",
		[
			expense.expense_date,
			expense.category,
			expense.description,
			expense.amount_spent
		],
		function(err,result) {
			if(err) {
				console.log(err);
				return res.status(500).json({
					err: "Could not submit expense. Internal server error"
				});
			}
			res.status(201).json(result.rows[0]);
		}
	);
});

async function calculateCosts() {
	const RawPurchasesRecords=await pool.query(`
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

	const purchases=RawPurchasesRecords.rows;

	/*
	 * Raw materials and consumables issued for production.
	 * Product dispatches are handled separately.
	 */
	const rawIssues=await pool.query(`
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

	const issues=rawIssues.rows;

	const RawProduction=await pool.query(`
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

	const production=RawProduction.rows;

	/*
	 * Storekeeper's finished-product records.
	 *
	 * received = quantity put into finished-product stock
	 * issued   = quantity dispatched or sold
	 */
	const RawProductStock=await pool.query(`
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

	const productStock=RawProductStock.rows;

	/*
	 * Group finished products received by date.
	 */
	const productReceiptsByDate={};

	productStock.forEach(item => {
		const quantityReceived=Number(item.received)||0;

		if(quantityReceived<=0) {
			return;
		}

		if(!productReceiptsByDate[item.date]) {
			productReceiptsByDate[item.date]={};
		}

		if(!productReceiptsByDate[item.date][item.item_id]) {
			productReceiptsByDate[item.date][item.item_id]={
				item_id: item.item_id,
				name: item.name,
				quantity: 0,
				created_at: item.created_at
			};
		}

		productReceiptsByDate[item.date][item.item_id].quantity+=
			quantityReceived;
	});

	/*
	 * Create dispatch events for finished products.
	 */
	const productDispatches=[];

	productStock.forEach(item => {
		const quantityIssued=Number(item.issued)||0;

		if(quantityIssued<=0) {
			return;
		}

		productDispatches.push({
			item_id: item.item_id,
			name: item.name,
			item_type: item.item_type,
			date: item.date,
			created_at: item.created_at,
			quantity: quantityIssued,
			type: "product_out",
			event_order: 3
		});
	});

	const events=[];

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
	events.sort((a,b) => {
		return (
			a.date.localeCompare(b.date)||
			a.event_order-b.event_order||
			new Date(a.created_at)-new Date(b.created_at)
		);
	});

	/*
	 * Raw-material and consumable inventory.
	 */
	const stock={};

	/*
	 * Finished-product inventory.
	 *
	 * Each product keeps a running quantity and value.
	 */
	const finishedStock={};

	const output=[];
	const dispatchOutput=[];
	const issueCostByDate={};

	function avg(itemId) {
		const stockName=stock[itemId];

		if(!stockName) {
			stock[itemId]={
				quantity: 0,
				value: 0
			};

			return 0;
		}

		if(stockName.quantity===0) {
			return 0;
		}

		return stockName.value/stockName.quantity;
	}

	function finishedAvg(itemId) {
		const product=finishedStock[itemId];

		if(!product||product.quantity===0) {
			return 0;
		}

		return product.value/product.quantity;
	}

	function addFinishedProduct(receipt,productCost) {
		if(!receipt||receipt.quantity<=0) {
			return 0;
		}

		const itemId=receipt.item_id;

		if(!finishedStock[itemId]) {
			finishedStock[itemId]={
				item_id: itemId,
				name: receipt.name,
				quantity: 0,
				value: 0
			};
		}

		finishedStock[itemId].quantity+=receipt.quantity;

		finishedStock[itemId].value+=productCost;

		return finishedAvg(itemId);
	}

	events.forEach(event => {
		if(event.type==="in") {
			const itemId=event.item_id;

			if(!stock[itemId]) {
				stock[itemId]={
					quantity: 0,
					value: 0
				};
			}

			const quantity=Number(event.quantity);
			const value=Number(event.value);

			stock[itemId].quantity+=quantity;
			stock[itemId].value+=value;
		} else if(event.type==="out") {
			const itemId=event.item_id;

			if(!stock[itemId]) {
				stock[itemId]={
					quantity: 0,
					value: 0
				};
			}

			const quantity=Number(event.quantity);
			const averageCost=avg(itemId);
			const issueCost=averageCost*quantity;

			stock[itemId].quantity-=quantity;
			stock[itemId].value-=issueCost;

			if(!issueCostByDate[event.date]) {
				issueCostByDate[event.date]={};
			}

			if(!issueCostByDate[event.date][itemId]) {
				issueCostByDate[event.date][itemId]={
					item_id: itemId,
					name: event.name,
					item_type: event.item_type,
					quantity: 0,
					cost: 0
				};
			}

			issueCostByDate[event.date][itemId].quantity+=quantity;

			issueCostByDate[event.date][itemId].cost+=issueCost;
		} else if(event.type==="produce") {
			const dailyIssueCosts=issueCostByDate[event.date]||{};

			const materialsCosted=Object.values(dailyIssueCosts);

			/*
			 * There is currently one raw material.
			 *
			 * Its name is not hardcoded.
			 */
			const rawMaterial=materialsCosted.find(material => {
				return material.item_type==="raw_material";
			});

			/*
			 * The storekeeper's issued raw-material
			 * quantity controls costing.
			 */
			const kernelIssued=rawMaterial? rawMaterial.quantity:0;

			const avgKernelCost=
				rawMaterial&&rawMaterial.quantity>0
					? rawMaterial.cost/rawMaterial.quantity
					:0;

			const totalKernelCost=rawMaterial? rawMaterial.cost:0;

			/*
			 * The manager's kernel figure is retained
			 * only for comparison.
			 */
			const managerKernelUsed=Number(event.kernel_used)||0;

			const kernelVariance=managerKernelUsed-kernelIssued;

			const kernelVariancePercentage=
				kernelIssued>0? (kernelVariance/kernelIssued)*100:0;

			/*
			 * Includes every raw material and
			 * consumable issued that day.
			 */
			const totalCost=materialsCosted.reduce((total,material) => {
				return total+material.cost;
			},0);

			/*
			 * Current cost-allocation rule.
			 */
			const pkoProductionCost=totalCost*0.75;

			const pkcProductionCost=totalCost*0.25;

			const managerPkoProduced=Number(event.pko_produced)||0;

			const managerPkcProduced=Number(event.pkc_produced)||0;

			const dailyProductReceipts=
				productReceiptsByDate[event.date]||{};

			const productReceipts=Object.values(dailyProductReceipts);

			/*
			 * PKO and PKC remain named here because
			 * your production table itself has fixed
			 * pko_produced and pkc_produced columns.
			 */
			const pkoReceipt=productReceipts.find(product => {
				return product.name.trim().toUpperCase()==="PKO";
			});

			const pkcReceipt=productReceipts.find(product => {
				return product.name.trim().toUpperCase()==="PKC";
			});

			/*
			 * The storekeeper's received quantities
			 * increase finished-product inventory.
			 */
			const pkoReceived=pkoReceipt? pkoReceipt.quantity:0;

			const pkcReceived=pkcReceipt? pkcReceipt.quantity:0;

			const pkoVariance=managerPkoProduced-pkoReceived;

			const pkcVariance=managerPkcProduced-pkcReceived;

			/*
			 * Add the day's products and allocated
			 * production costs to the running stock.
			 *
			 * This creates the weighted-average tank
			 * value.
			 */
			const pkoTankAverageCost=addFinishedProduct(
				pkoReceipt,
				pkoProductionCost
			);

			const pkcStockAverageCost=addFinishedProduct(
				pkcReceipt,
				pkcProductionCost
			);

			const materials=materialsCosted.map(material => {
				return {
					item_id: material.item_id,
					name: material.name,
					item_type: material.item_type,
					quantity_issued: material.quantity,
					average_cost:
						material.quantity>0
							? material.cost/material.quantity
							:0,
					total_cost: material.cost
				};
			});

			output.push({
				production_date: event.date,
				created_at: event.created_at,

				kernel_issued: kernelIssued,
				manager_kernel_used: managerKernelUsed,
				kernel_variance: kernelVariance,
				kernel_variance_percentage: kernelVariancePercentage,

				avg_kernel_cost: avgKernelCost,
				total_kernel_cost: totalKernelCost,

				materials_costed: materials,
				total_cost: totalCost,

				manager_pko_produced: managerPkoProduced,
				storekeeper_pko_received: pkoReceived,
				pko_variance: pkoVariance,

				manager_pkc_produced: managerPkcProduced,
				storekeeper_pkc_received: pkcReceived,
				pkc_variance: pkcVariance,

				pko_production_cost: pkoProductionCost,
				pkc_production_cost: pkcProductionCost,

				pko_daily_cost_per_kg:
					pkoReceived>0? pkoProductionCost/pkoReceived:0,

				pkc_daily_cost_per_kg:
					pkcReceived>0? pkcProductionCost/pkcReceived:0,

				/*
				 * Weighted average after adding this
				 * day's production to existing stock.
				 */
				pko_tank_average_cost: pkoTankAverageCost,

				pkc_stock_average_cost: pkcStockAverageCost,

				receipt_status:
					pkoReceipt&&pkcReceipt? "received":"pending_receipt"
			});
		} else if(event.type==="product_out") {
			const itemId=event.item_id;
			const quantity=Number(event.quantity);

			if(!finishedStock[itemId]) {
				finishedStock[itemId]={
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
			const averageCost=finishedAvg(itemId);

			const costOfDispatch=averageCost*quantity;

			finishedStock[itemId].quantity-=quantity;

			finishedStock[itemId].value-=costOfDispatch;

			dispatchOutput.push({
				dispatch_date: event.date,
				created_at: event.created_at,
				item_id: itemId,
				name: event.name,
				quantity_dispatched: quantity,
				weighted_average_cost: averageCost,
				cost_of_dispatch: costOfDispatch,
				remaining_quantity: finishedStock[itemId].quantity,
				remaining_value: finishedStock[itemId].value
			});
		}
	});

	const finishedStockBalance=Object.values(finishedStock).map(product => {
		return {
			item_id: product.item_id,
			name: product.name,
			quantity: product.quantity,
			value: product.value,
			weighted_average_cost:
				product.quantity>0? product.value/product.quantity:0
		};
	});

	const costs={
		production_costs: output,
		product_dispatch_costs: dispatchOutput,
		finished_stock: finishedStockBalance
	};
	return costs;
}

app.get("/api/average_cost",async function(req,res) {
	try {
		const costs=await calculateCosts();
		res.status(200).json(costs);
	} catch(error) {
		console.log(error);
		res.status(500).json({
			err: "Could not load production costs"
		});
	}
});

app.get("/api/dashboard",async function(req,res) {
	try {
		const selectedDate=req.query.date||null;

		let datesql;

		if(selectedDate) {
			datesql="$1::date";
		} else {
			datesql="CURRENT_DATE";
		}

		let param=[];

		if(selectedDate) {
			param=[selectedDate];
		}

		const RawStockLevels=await pool.query(
			`
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
      `,
			param
		);

		const stockLevels=RawStockLevels.rows.map(stockLevel => {
			return {
				item: stockLevel.name,
				remaining: Number(stockLevel.remaining),
				item_type: stockLevel.item_type
			};
		});

		res.status(200).json(stockLevels);
	} catch(error) {
		console.log(error);

		res.status(500).json({
			error: "Could not retrieve stock levels"
		});
	}
});

app.get("/api/dashboard_period",async function(req,res) {
	try {
		const selectedDate=req.query.date;
		const datesql=selectedDate? "$1::date":"CURRENT_DATE";
		const param=selectedDate? [selectedDate]:[];

		const RawProduction=await pool.query(
			`
        SELECT
        'day' AS period,
        COALESCE(SUM(production.kernel_used), 0) AS kernel_used,
        COALESCE(SUM(production.pko_produced), 0) AS pko_produced,
        COALESCE(SUM(production.pkc_produced), 0) AS pkc_produced,
        COALESCE(
        ROUND(
        SUM(production.pko_produced) * 100.0 /
        NULLIF(SUM(production.kernel_used), 0),
        2
        ),
        0
        ) AS oil_yield
        FROM production
        WHERE production.production_date = ${datesql}

        UNION ALL

        SELECT
        'week',
        COALESCE(SUM(production.kernel_used), 0),
        COALESCE(SUM(production.pko_produced), 0),
        COALESCE(SUM(production.pkc_produced), 0),
        COALESCE(
        ROUND(
        SUM(production.pko_produced) * 100.0 /
        NULLIF(SUM(production.kernel_used), 0),
        2
        ),
        0
        )
        FROM production
        WHERE production.production_date >= date_trunc('week', ${datesql})
        AND production.production_date <
        date_trunc('week', ${datesql}) + INTERVAL '7 days'

        UNION ALL

        SELECT
        'month',
        COALESCE(SUM(production.kernel_used), 0),
        COALESCE(SUM(production.pko_produced), 0),
        COALESCE(SUM(production.pkc_produced), 0),
        COALESCE(
        ROUND(
        SUM(production.pko_produced) * 100.0 /
        NULLIF(SUM(production.kernel_used), 0),
        2
        ),
        0
        )
        FROM production
        WHERE production.production_date >= date_trunc('month', ${datesql})
        AND production.production_date <
        date_trunc('month', ${datesql}) + INTERVAL '1 month'
        `,
			param
		);

		const production=RawProduction.rows;

		const RawSales=await pool.query(
			`SELECT 'day' AS period,
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
        `,
			param
		);
		const sales=RawSales.rows;

		const rawExpenses=await pool.query(
			`SELECT 'day' AS period,
        COALESCE (SUM(expenses.amount_spent), 0) AS total_spent
        FROM expenses WHERE
        expenses.category IN ('Expense', 'Expenses')
        AND expenses.expense_date = ${datesql}

        UNION ALL

        SELECT 'week',
        COALESCE(SUM(expenses.amount_spent), 0)
        FROM expenses
        WHERE
        expenses.category IN ('Expense', 'Expenses')
        AND expenses.expense_date >= date_trunc('week', ${datesql})
        AND expenses.expense_date < date_trunc('week', ${datesql}) + INTERVAL '7 days'

        UNION ALL

        SELECT 'month',
        COALESCE(SUM(expenses.amount_spent), 0)
        FROM expenses
        WHERE
        expenses.category IN ('Expense', 'Expenses')
        AND expenses.expense_date >= date_trunc('month', ${datesql})
        AND expenses.expense_date < date_trunc('month', ${datesql}) + INTERVAL '1 month'`,
			param
		);
		const expenses=rawExpenses.rows;

		const output={};

		production.forEach(row => {
			output[row.period]={
				production: {
					kernel_used: Number(row.kernel_used),
					pko_produced: Number(row.pko_produced),
					pkc_produced: Number(row.pkc_produced),
					oil_yield: Number(row.oil_yield)
				},
				sales: {},
				expenses: {}
			};
		});
		sales.forEach(row => {
			output[row.period].sales[row.name]={
				quantity_sold: Number(row.quantity_sold),
				average_unit_price: Number(row.average_unit_price),
				total_sales: Number(row.total_sales)
			};
		});

		expenses.forEach(row => {
			output[row.period].expenses={
				total_expenses: Number(row.total_spent)
			};
		});

		const costs=await calculateCosts();
		const dispatchPeriods=calculateDispatchPeriods(
			costs.product_dispatch_costs,
			selectedDate
		);
		output.day.cost_of_goods_sold=dispatchPeriods.day;

		output.week.cost_of_goods_sold=dispatchPeriods.week;

		output.month.cost_of_goods_sold=dispatchPeriods.month;

		const periodGrossProfit={};
		for(let period in output) {
			const pkcPeriodSales=output[period].sales.PKC.total_sales;
			const pkoPeriodSales=output[period].sales.PKO.total_sales;
			const periodExpenses=output[period].expenses.total_expenses;
			const pkoPeriodCost=output[period].cost_of_goods_sold.pko;
			const pkcPeriodCost=output[period].cost_of_goods_sold.pkc;
			const pkoGrossProfit=pkoPeriodSales-pkoPeriodCost;
			const pkcGrossProfit=pkcPeriodSales-pkcPeriodCost;
			periodGrossProfit[period]={
				pko: pkoGrossProfit,
				pkc: pkcGrossProfit
			};
			output[period].period_gross_profit=periodGrossProfit[period];
			const totalNetProfit=
				pkoGrossProfit+pkcGrossProfit-periodExpenses;
			output[period].total_net_profit=totalNetProfit;
		}
		res.status(200).json(output);
	} catch(error) {
		console.log(error);
		res.status(500).json({
			err: "Failed to load dashboard period data"
		});
	}
});

function calculateDispatchPeriods(productDispatchCosts,selectedDate) {
	const selected=new Date(selectedDate+"T00:00:00");
	const weekStart=new Date(selected);
	weekStart.setDate(selected.getDate()-((selected.getDay()+6)%7));
	const weekEnd=new Date(weekStart);
	weekEnd.setDate(weekStart.getDate()+7);

	const dispatchPeriods={
		day: {
			pko: 0,
			pkc: 0
		},
		week: {
			pko: 0,
			pkc: 0
		},
		month: {
			pko: 0,
			pkc: 0
		}
	};
	productDispatchCosts.forEach(dispatch => {
		const product=String(dispatch.name).trim().toLowerCase();
		if(product!=="pko"&&product!=="pkc") {
			return;
		}
		const dispatchDate=new Date(dispatch.dispatch_date+"T00:00:00");
		const dispatchCost=Number(dispatch.cost_of_dispatch)||0;

		if(dispatch.dispatch_date===selectedDate) {
			dispatchPeriods.day[product]+=dispatchCost;
		}
		if(dispatchDate>=weekStart&&dispatchDate<weekEnd) {
			dispatchPeriods.week[product]+=dispatchCost;
		}
		if(
			dispatchDate.getFullYear()===selected.getFullYear()&&
			dispatchDate.getMonth()===selected.getMonth()
		) {
			dispatchPeriods.month[product]+=dispatchCost;
		}
	});
	return dispatchPeriods;
}

async function calculateChecks() {
	const checks=[];
	const pkoProduction=await pool.query(`SELECT 'PKO' AS item,
    to_char(COALESCE(sc.count_date,
    production.production_date), 'YYYY-MM-DD') AS check_date,
    'pko_received vs produced' AS check_type,
    COALESCE (sc.received, 0) AS
    storekeeper_says,
    COALESCE (production.pko_produced, 0)
    AS manager_says,
    COALESCE (sc.received, 0) -
    COALESCE (production.pko_produced, 0) AS
    difference,
    'production' AS related_source

    FROM
    (SELECT
    stock_counts.count_date,
    SUM(stock_counts.received) AS received
    FROM stock_counts
    INNER JOIN items
    ON
    stock_counts.item_id = items.item_id
    WHERE items.name = 'PKO'
    GROUP BY
    stock_counts.count_date) AS sc
    FULL OUTER JOIN production
    ON production.production_date =
    sc.count_date
    WHERE COALESCE (sc.received, 0) <>
    COALESCE (production.pko_produced, 0)`);
	pkoProduction.rows.forEach(row => {
		checks.push({
			check_date: row.check_date,
			item: row.item,
			check_type: row.check_type,
			storekeeper_says: row.storekeeper_says,
			manager_says: row.manager_says,
			difference: row.difference
		});
	});

	const pkcProduction=
		await pool.query(`SELECT 'PKC' AS item, to_char(COALESCE
    (sc.count_date, pr.production_date),
    'YYYY-MM-DD') AS check_date,
    'pkc_received vs produced' AS check_type,
    COALESCE (sc.received, 0)
    AS storekeeper_says,
    COALESCE(pr.pkc_produced, 0) AS manager_says,
    COALESCE(sc.received, 0) -
    COALESCE(pr.pkc_produced, 0) AS
    difference,
    'production' AS related_source
    FROM
    (SELECT stock_counts.count_date,
    SUM(stock_counts.received) AS received
    FROM items
    INNER JOIN stock_counts ON
    stock_counts.item_id = items.item_id
    WHERE
    items.name = 'PKC'
    GROUP BY stock_counts.count_date) AS sc
    FULL OUTER JOIN production pr
    ON pr.production_date = sc.count_date
    WHERE COALESCE(sc.received, 0)
    <> COALESCE(pr.pkc_produced, 0)`);
	pkcProduction.rows.forEach(row => {
		checks.push({
			check_date: row.check_date,
			item: row.item,
			check_type: row.check_type,
			storekeeper_says: row.storekeeper_says,
			manager_says: row.manager_says,
			difference: row.difference
		});
	});

	const kernelUsage=
		await pool.query(`SELECT 'P Kernel' AS item, to_char(COALESCE
    (sc.count_date, pr.production_date),
    'YYYY-MM-DD') AS check_date,
    'kernel_issued vs used' AS check_type,
    COALESCE (sc.issued, 0)
    AS storekeeper_says,
    COALESCE(pr.kernel_used, 0) AS manager_says,
    COALESCE(sc.issued, 0) -
    COALESCE(pr.kernel_used, 0) AS
    difference,
    'production' AS related_source
    FROM
    (SELECT stock_counts.count_date,
    SUM(stock_counts.issued) AS
    issued
    FROM items
    INNER JOIN stock_counts ON
    stock_counts.item_id = items.item_id
    WHERE
    items.name = 'P Kernel'
    GROUP BY stock_counts.count_date) AS sc
    FULL OUTER JOIN production pr
    ON pr.production_date = sc.count_date
    WHERE COALESCE(sc.issued, 0)
    <> COALESCE(pr.kernel_used, 0)`);
	kernelUsage.rows.forEach(row => {
		checks.push({
			check_date: row.check_date,
			item: row.item,
			check_type: row.check_type,
			storekeeper_says: row.storekeeper_says,
			manager_says: row.manager_says,
			difference: row.difference
		});
	});

	const kernelPurchased=await pool.query(`SELECT
    'P Kernel' AS item,
    to_char(
    COALESCE(sc.count_date, pu.purchase_date),
    'YYYY-MM-DD'
    ) AS check_date,
    'kernel_received vs purchased' AS check_type,
    COALESCE(sc.received, 0)
    AS storekeeper_says,
    COALESCE(pu.purchased, 0)
    AS manager_says,
    COALESCE(sc.received, 0) -
    COALESCE(pu.purchased, 0)
    AS difference,
    'purchases' AS related_source
    FROM (
    SELECT
    stock_counts.count_date,
    SUM(stock_counts.received) AS received
    FROM stock_counts
    INNER JOIN items
    ON stock_counts.item_id = items.item_id
    WHERE items.name = 'P Kernel'
    GROUP BY stock_counts.count_date
    ) AS sc
    FULL OUTER JOIN (
    SELECT
    purchases.purchase_date,
    SUM(purchases.quantity_supplied) AS purchased
    FROM purchases
    INNER JOIN items
    ON purchases.item_id = items.item_id
    WHERE items.name = 'P Kernel'
    GROUP BY purchases.purchase_date
    ) AS pu
    ON pu.purchase_date = sc.count_date
    WHERE
    COALESCE(sc.received, 0) <>
    COALESCE(pu.purchased, 0)`);

	kernelPurchased.rows.forEach(row => {
		checks.push({
			check_date: row.check_date,
			item: row.item,
			check_type: row.check_type,
			storekeeper_says: row.storekeeper_says,
			manager_says: row.manager_says,
			difference: row.difference
		});
	});

	const pkoSold=await pool.query(`SELECT
    'PKO' AS item,
    to_char(
    COALESCE(sc.count_date, sa.sales_date),
    'YYYY-MM-DD'
    ) AS check_date,
    'pko_issued vs sold' AS check_type,
    COALESCE(sc.issued, 0)
    AS storekeeper_says,
    COALESCE(sa.sold, 0)
    AS manager_says,
    COALESCE(sc.issued, 0) -
    COALESCE(sa.sold, 0)
    AS difference,
    'sales' AS related_source
    FROM (
    SELECT
    stock_counts.count_date,
    SUM(stock_counts.issued) AS issued
    FROM stock_counts
    INNER JOIN items
    ON stock_counts.item_id = items.item_id
    WHERE items.name = 'PKO'
    GROUP BY stock_counts.count_date
    ) AS sc
    FULL OUTER JOIN (
    SELECT
    sales.sales_date,
    SUM(sales.quantity) AS sold
    FROM sales
    INNER JOIN items
    ON sales.item_id = items.item_id
    WHERE items.name = 'PKO'
    GROUP BY sales.sales_date
    ) AS sa
    ON sa.sales_date = sc.count_date
    WHERE
    COALESCE(sc.issued, 0) <>
    COALESCE(sa.sold, 0)`);
	pkoSold.rows.forEach(row => {
		checks.push({
			check_date: row.check_date,
			item: row.item,
			check_type: row.check_type,
			storekeeper_says: row.storekeeper_says,
			manager_says: row.manager_says,
			difference: row.difference
		});
	});

	const pkcSold=await pool.query(`SELECT
    'PKC' AS item,
    to_char(
    COALESCE(sc.count_date, sa.sales_date),
    'YYYY-MM-DD'
    ) AS check_date,
    'pkc_issued vs sold' AS check_type,
    COALESCE(sc.issued, 0)
    AS storekeeper_says,
    COALESCE(sa.sold, 0)
    AS manager_says,
    COALESCE(sc.issued, 0) -
    COALESCE(sa.sold, 0)
    AS difference,
    'sales' AS related_source
    FROM (
    SELECT
    stock_counts.count_date,
    SUM(stock_counts.issued) AS issued
    FROM stock_counts
    INNER JOIN items
    ON stock_counts.item_id = items.item_id
    WHERE items.name = 'PKC'
    GROUP BY stock_counts.count_date
    ) AS sc
    FULL OUTER JOIN (
    SELECT
    sales.sales_date,
    SUM(sales.quantity) AS sold
    FROM sales
    INNER JOIN items
    ON sales.item_id = items.item_id
    WHERE items.name = 'PKC'
    GROUP BY sales.sales_date
    ) AS sa
    ON sa.sales_date = sc.count_date
    WHERE
    COALESCE(sc.issued, 0) <>
    COALESCE(sa.sold, 0)`);
	pkcSold.rows.forEach(row => {
		checks.push({
			check_date: row.check_date,
			item: row.item,
			check_type: row.check_type,
			storekeeper_says: row.storekeeper_says,
			manager_says: row.manager_says,
			difference: row.difference
		});
	});
	checks.sort((first,second) => {
		const dateOrder=first.check_date.localeCompare(second.check_date);
		return dateOrder||first.item.localeCompare(second.item);
	});
	return checks;
}

app.get("/api/checks",async function(req,res) {
	try {
		const checks=await calculateChecks();
		res.status(200).json(checks);
	} catch(error) {
		console.log(error);
		res.status(500).json({
			err: "Could not load checks"
		});
	}
});

app.get("/api/correction",async function(req,res) {
	try {
		const correctionFor=req.query;
		const stockAndRelated={};
		const stockData=await pool.query(
			`SELECT stock_counts.*,
      items.name,
      to_char(stock_counts.count_date, 'YYYY-MM-DD') AS count_date
      FROM stock_counts
      INNER JOIN items
      ON
      stock_counts.item_id = items.item_id
      WHERE items.name = $1 AND
      stock_counts.count_date = $2::date
      ORDER BY stock_counts.created_at`,
			[correctionFor.item,correctionFor.date]
		);

		stockAndRelated["stock_record"]=stockData.rows;

		let related;
		if(correctionFor.related_source==="production") {
			related=await pool.query(
				`SELECT *,
        to_char(production_date, 'YYYY-MM-DD') AS production_date,
        to_char(production_hours, 'HH24:MI') AS production_hours,
        to_char(down_time, 'HH24:MI') AS down_time
        FROM production
        WHERE
        production.production_date
        = $1::date`,
				[correctionFor.date]
			);

			stockAndRelated["related_record"]=related.rows;
		} else if(correctionFor.related_source==="purchases") {
			related=await pool.query(
				`SELECT
		purchases.purchase_id,
		purchases.item_id,
		purchases.supplier_id,
		suppliers.name AS supplier,
		items.name,
		purchases.quantity_supplied,
		purchases.unit_cost,
		purchases.created_at,
		to_char(purchases.purchase_date, 'YYYY-MM-DD') AS purchase_date
		FROM purchases
		INNER JOIN suppliers
		ON purchases.supplier_id = suppliers.supplier_id
		INNER JOIN items
		ON purchases.item_id = items.item_id
        WHERE items.name = $1
        AND
        purchases.purchase_date =
        $2::date ORDER BY
        purchases.created_at`,
				[correctionFor.item,correctionFor.date]
			);

			stockAndRelated["related_record"]=related.rows;
		} else if(correctionFor.related_source==="sales") {
			related=await pool.query(
				`SELECT
		sales.sales_id,
		sales.item_id,
		sales.customer_id,
		customers.name AS customer,
		items.name,
		sales.quantity,
		sales.unit_price,
		sales.created_at,
		to_char(sales.sales_date, 'YYYY-MM-DD') AS sales_date
		FROM sales
		INNER JOIN customers
		ON sales.customer_id = customers.customer_id
		INNER JOIN items
		ON sales.item_id = items.item_id
        WHERE items.name = $1
        AND
        sales.sales_date =
        $2::date ORDER BY
        sales.created_at`,
				[correctionFor.item,correctionFor.date]
			);

			stockAndRelated["related_record"]=related.rows;
		} else {
			return res.status(400).json({
				err: "Invalid related source"
			});
		}

		return res.status(200).json(stockAndRelated);
	} catch(error) {
		console.log(error);
		res.status(500).json({
			err: "Could not load correction data"
		});
	}
});

app.patch("/api/correction_edit",async function(req,res) {
	try {
		const kind=req.body.kind;
		const record=req.body.record;

		let updated;

		if(kind==="stock") {
			updated=await pool.query(
				`UPDATE stock_counts
        SET count_date = $1::date,
        item_id = $2,
        received = $3,
        issued = $4
        WHERE count_id = $5
        RETURNING *`,
				[
					record.count_date,
					record.item_id,
					record.received,
					record.issued,
					record.count_id
				]
			);
		} else if(kind==="production") {
			updated=await pool.query(
				`UPDATE production
        SET production_date = $1::date,
        kernel_used = $2,
        pko_produced = $3,
        pkc_produced = $4,
        production_hours = $5::interval,
        down_time = $6::interval
        WHERE production_id = $7
        RETURNING *`,
				[
					record.production_date,
					record.kernel_used,
					record.pko_produced,
					record.pkc_produced,
					record.production_hours,
					record.down_time,
					record.production_id
				]
			);
		} else if(kind==="sales") {
			updated=await pool.query(
				`UPDATE sales
        SET sales_date = $1::date,
        customer_id = $2,
        item_id = $3,
        quantity = $4,
        unit_price = $5
        WHERE sales_id = $6
        RETURNING *`,
				[
					record.sales_date,
					record.customer_id,
					record.item_id,
					record.quantity,
					record.unit_price,
					record.sales_id
				]
			);
		} else if(kind==="purchases") {
			updated=await pool.query(
				`UPDATE purchases
        SET purchase_date = $1::date,
        supplier_id = $2,
        item_id = $3,
        quantity_supplied = $4,
        unit_cost = $5
        WHERE purchase_id = $6
        RETURNING *`,
				[
					record.purchase_date,
					record.supplier_id,
					record.item_id,
					record.quantity_supplied,
					record.unit_cost,
					record.purchase_id
				]
			);
		} else if(kind==='expenses') {
			updated=await pool.query(
				`UPDATE expenses
				SET expense_date = $1::date,
			     category = $2,
				 description = $3,
				 amount_spent = $4
				 WHERE expense_id = $5
				 returning *`,
				[
					record.expense_date,
					record.category,
					record.description,
					record.amount_spent,
					record.expense_id

				]
			)

		}
		else {
			return res.status(400).json({
				err: "Invalid record type"
			});
		}

		return res.status(200).json(updated.rows[0]);
	} catch(error) {
		console.log(error);

		return res.status(500).json({
			err: "Could not update record"
		});
	}
});

app.delete("/api/correction_delete",async function(req,res) {
	try {
		const kind=req.body.kind;
		const record=req.body.record;
		let deleted;

		if(kind==="stock") {
			deleted=await pool.query(
				"DELETE FROM stock_counts WHERE count_id = $1 RETURNING *",
				[record.count_id]
			);
		} else if(kind==="production") {
			deleted=await pool.query(
				"DELETE FROM production WHERE production_id = $1 RETURNING *",
				[record.production_id]
			);
		} else if(kind==="sales") {
			deleted=await pool.query(
				"DELETE FROM sales WHERE sales_id = $1 RETURNING *",
				[record.sales_id]
			);
		} else if(kind==="purchases") {
			deleted=await pool.query(
				"DELETE FROM purchases WHERE purchase_id = $1 RETURNING *",
				[record.purchase_id]
			);
		} else if(kind==='expenses') {
			deleted=await pool.query(
				`DELETE FROM expenses WHERE expense_id = $1 RETURNING *`,
				[record.expense_id]
			);

		} else {
			return res.status(400).json({
				err: "Invalid record type"
			});
		}

		if(deleted.rowCount===0) {
			return res.status(404).json({
				err: "Record was not found"
			});
		}

		return res.status(200).json({
			message: "Record deleted successfully"
		});
	} catch(error) {
		console.log(error);
		return res.status(500).json({
			err: "Could not delete record"
		});
	}
});


function requireLogin(req,res,next) {
	if(!req.session.user_id) {
		return res.status(401).json({
			message: 'login required'
		})
	}
	next();
}

function requirePageLogin(req,res,next) {
	if(!req.session.user_id) {
		return res.redirect('/')
	}
	next()
}

app.get('/api/current-user',requireLogin,function(req,res) {
	return res.json({
		username: req.session.user_name
	});
});

app.post('/api/logout',(req,res) => {
	return req.session.destroy(err => {
		if(err) {
			res.status(500).json({
				message: 'logout failed'
			})
		}
		res.json({
			message: 'Logged out'
		});
	});
})

app.post('/api/customers',function(req,res) {
	const customer=req.body;
	if(!customer.name||!customer.phone||!customer.address) {
		res.status(400).json({
			err: 'invalid request'
		})
	}
	pool.query(`INSERT INTO customers
		(name, phone_number, address, email, note)
		VALUES($1, $2, $3, $4, $5) RETURNING*`,
		[customer.name,customer.phone,customer.address,customer.email,customer.note],
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

app.get('/api/customers-purchases',async function(req,res) {
	const customerId=req.query.customerId;
	const result=await pool.query(`

		SELECT sales_id,
		TO_CHAR(sales_date, 'YYYY-MM-DD') 
		  AS purchase_date,
		items.name AS Item,
		sales.quantity,
		sales.unit_price,
		sales.quantity * sales.unit_price AS total
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

