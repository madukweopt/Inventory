require("dotenv").config();
const express=require("express");
const path=require("path");
const crypto=require("crypto");
const fs=require("fs");
const multer=require("multer");
const { correctRecord,correctManualStock,recordStockHistory }=require('./record-corrections');
const { snapshotInvoice,preparePayroll,markPayrollReview,authorise,reopenProduction }=require('./dependency-services');
const {lockStock,stockFloor,protectStock}=require('./stock-safety');
const {calculateContinuousCosts}=require('./continuous-costing');
const {dateText,movementPart}=require('./production-movements');
const app=express();
const PORT=process.env.PORT||3000;
const isProduction=process.env.NODE_ENV==='production';
const debugToolsEnabled=process.env.ENABLE_DEBUG_TOOLS==='true';

// Security headers on every response. Pages may only load scripts, styles, fonts and data from this server
// (images may also be drawn signatures and photo previews), other sites may not show the app inside a frame,
// and browsers must not guess file types. The mobile debugging console, when switched on, loads from a CDN and
// needs inline styles and eval, so those are allowed only then.
const contentSecurityPolicy=[
	"default-src 'self'",
	"script-src 'self'"+(debugToolsEnabled?" https://cdn.jsdelivr.net 'unsafe-eval'":''),
	"style-src 'self'"+(debugToolsEnabled?" 'unsafe-inline'":''),
	"img-src 'self' data: blob:",
	"font-src 'self'",
	"connect-src 'self'",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'"
].join('; ');
app.disable('x-powered-by');
app.use(function(req,res,next) {
	res.set({
		'Content-Security-Policy': contentSecurityPolicy,
		'X-Frame-Options': 'DENY',
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'same-origin',
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
	});
	if(isProduction) res.set('Strict-Transport-Security','max-age=15552000');
	next();
});

const { Pool,Client }=require("pg");
const { parse: parseConnectionString }=require("pg-connection-string");
const dns=require("dns");
const net=require("net");

const session=require('express-session');
const pgSession=require('connect-pg-simple')(session);

const argon2=require('argon2');

// The database is remote. Looking up its address on this phone can take about 2.5 seconds, so the
// address is looked up once and reused for new connections. The secure connection still checks the
// certificate against the real host name, which the database also uses to route the login.
// If a connection to the saved address fails, the address is forgotten and looked up again.
const databaseSettings=(() => {
	try { return parseConnectionString(process.env.DATABASE_URL||''); } catch { return {}; }
})();
const databaseHost=databaseSettings.host&&net.isIP(databaseSettings.host)===0&&!databaseSettings.host.startsWith('/')?databaseSettings.host:null;
let databaseAddress=null;
let databaseLookup=null;
function refreshDatabaseAddress() {
	if(!databaseHost) return Promise.resolve();
	databaseLookup??=dns.promises.lookup(databaseHost)
		.then(result => { databaseAddress=result.address; })
		.catch(error => { databaseAddress=null; console.error("Database address lookup failed:",error.message); })
		.finally(() => { databaseLookup=null; });
	return databaseLookup;
}
function forgetDatabaseAddress() {
	databaseAddress=null;
	refreshDatabaseAddress();
}
refreshDatabaseAddress();
// Looks the address up again now and then, in case the database host moves.
setInterval(refreshDatabaseAddress,10*60*1000).unref();

class SavedAddressClient extends Client {
	constructor(options) {
		const address=databaseAddress;
		if(!address||!databaseHost) {
			super(options);
			return;
		}
		const { connectionString,...rest }=options;
		const { sslmode,channel_binding,...settings }=databaseSettings;
		super({ ...settings,...rest,host: address,ssl: { ...rest.ssl,servername: databaseHost } });
		this.savedAddress=address;
	}
	connect(callback) {
		const forget=error => { if(error&&this.savedAddress===databaseAddress) forgetDatabaseAddress(); };
		if(typeof callback==='function') return super.connect(error => { forget(error); callback(error); });
		return super.connect().catch(error => { forget(error); throw error; });
	}
}

// A query takes about 40 ms but opening a connection is slower, so idle connections are kept for
// 4 minutes (pg's default is 10 seconds) and pages opened after a short pause do not wait to reconnect.
// They are closed before Neon pauses the database (after about 5 idle minutes), because a paused
// database or a sleeping phone drops them silently and requests on a dead connection fail.
// No connections are forced to stay open, so after a long pause the next request opens fresh ones.
const pool=new Pool({
	Client: SavedAddressClient,
	connectionString: process.env.DATABASE_URL,
	ssl: {
		rejectUnauthorized: true
	},
	idleTimeoutMillis: 4*60*1000,
	keepAlive: true,
	keepAliveInitialDelayMillis: 10000,
	connectionTimeoutMillis: 30000
});

// Handles unexpected database pool errors.
pool.on("error",function(err) {
	console.error("Database connection error:",err.message);
});

app.use('/api/sops',express.json({limit:'512kb'}));
app.use(express.json());

// Trusts the secure connection supplied by the hosting service in production.
if(isProduction) {
	app.set('trust proxy',1);
}

app.use(session({
	store: new pgSession({
		pool: pool,
		createTableIfMissing: true
	}),
	secret: process.env.SESSION_SECRET,
	resave: false,
	saveUninitialized: false,
	cookie: {
		httpOnly: true,
		secure: isProduction,
		sameSite: 'lax',
		maxAge: 1000*60*60*8
	}
}));


const publicDirectory=path.join(__dirname,"..","public");
const htmlDirectory=path.join(publicDirectory,"html");
const picturesDirectory=
	process.env.RAILWAY_VOLUME_MOUNT_PATH||
	path.join(publicDirectory,"images");
const employeePhotosDirectory=path.join(picturesDirectory,"employees");
const companyLogosDirectory=path.join(picturesDirectory,"company");

fs.mkdirSync(employeePhotosDirectory,{ recursive: true });
fs.mkdirSync(companyLogosDirectory,{ recursive: true });

const employeePhotoExtensions={
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp'
};

const employeePhotoStorage=multer.diskStorage({
	// Stores employee photographs in the publicly served employee image directory.
	destination: function(req,file,done) {
		done(null,employeePhotosDirectory);
	},
	// Gives every uploaded photograph a unique server-generated filename.
	filename: function(req,file,done) {
		const extension=employeePhotoExtensions[file.mimetype];
		done(null,'employee-'+crypto.randomUUID()+extension);
	}
});

const employeePhotoUpload=multer({
	storage: employeePhotoStorage,
	limits: {
		fileSize: 2*1024*1024
	},
	// Accepts only the image formats supported by the employee form.
	fileFilter: function(req,file,done) {
		if(!employeePhotoExtensions[file.mimetype]) {
			return done(new Error('Only JPG, PNG and WebP images are allowed'));
		}
		done(null,true);
	}
});

const companyLogoStorage=multer.diskStorage({
	// Stores company logos in the publicly served company image directory.
	destination: function(req,file,done) {
		done(null,companyLogosDirectory);
	},
	// Gives each replacement logo a unique server-generated filename.
	filename: function(req,file,done) {
		const extension=employeePhotoExtensions[file.mimetype];
		done(null,'company-'+crypto.randomUUID()+extension);
	}
});

const companyLogoUpload=multer({
	storage: companyLogoStorage,
	limits: {
		fileSize: 2*1024*1024
	},
	// Accepts the image formats supported by the company logo control.
	fileFilter: function(req,file,done) {
		if(!employeePhotoExtensions[file.mimetype]) {
			return done(new Error('Only JPG, PNG and WebP images are allowed'));
		}
		done(null,true);
	}
});

// Removes an uploaded photograph when its employee record cannot be saved.
function removeUploadedEmployeePhoto(file) {
	if(!file) return;
	fs.unlink(file.path,function(error) {
		if(error&&error.code!=='ENOENT') {
			console.error('Could not remove unused employee photograph:',error);
		}
	});
}

// Removes a previously stored custom image without touching shared application images.
function removeCustomImage(imagePath,directoryPrefix,storageDirectory) {
	if(!imagePath||!imagePath.startsWith(directoryPrefix)) return;
	const filename=path.basename(imagePath);
	const absolutePath=path.join(storageDirectory,filename);
	fs.unlink(absolutePath,function(error) {
		if(error&&error.code!=='ENOENT') {
			console.error('Could not remove replaced image:',error);
		}
	});
}

app.use("/css",express.static(path.join(publicDirectory,"css")));
app.use("/js",express.static(path.join(publicDirectory,"js")));
app.use("/fonts",express.static(path.join(publicDirectory,"fonts")));
app.use(
	"/images/employees",
	requireRole(['admin','manager']),
	express.static(employeePhotosDirectory),
	function(req,res) {
		return res.sendStatus(404);
	}
);
app.use("/images/company",express.static(companyLogosDirectory));
app.use("/images",express.static(path.join(publicDirectory,"images")));

// Runs the callback required by the surrounding operation.
app.get(["/","/login.html"],function(req,res) {
	res.sendFile(path.join(htmlDirectory,"login.html"));
});

// Handles GET /index.html requests.
app.get("/index.html",requirePageLogin,function(req,res) {
	res.sendFile(path.join(htmlDirectory,"index.html"));
});

// Handles GET /forms.html requests.
app.get("/forms.html",requirePageLogin,function(req,res) {
	res.sendFile(path.join(htmlDirectory,"forms.html"));
});

// The manual is stored as append-only revisions and edited only by Admin.
require('./sops').registerSops(app,pool,requirePageLogin,requireRole);

// Handles GET /checks.html requests.
app.get("/checks.html",requirePageRole(['admin']),function(req,res) {
	res.sendFile(path.join(htmlDirectory,"checks.html"));
});

// Tells the browser whether development-only debugging tools may be loaded.
app.get('/debug-settings',function(req,res) {
	return res.json({
		enabled: debugToolsEnabled
	});
});

// Counts recent failed sign-ins for each username and device so passwords cannot be guessed endlessly.
const failedLogins=new Map();
const loginLockMinutes=15;
const loginAttemptLimit=5;

// Handles POST /api/login requests.
// The login page posts an ordinary form, so the browser closes the keyboard and offers to save the password;
// a form sign-in is answered with a redirect. Scripts and tests may still send JSON and get JSON back.
app.post('/api/login',express.urlencoded({extended:false,limit:'4kb'}),async function(req,res) {
	const isForm=Boolean(req.is('application/x-www-form-urlencoded'));
	const reply=(status,body,errorCode)=>isForm?res.redirect(303,status===200?'/index.html':'/login.html?error='+errorCode):res.status(status).json(body);
	// A form sign-in must come from this site's own login page.
	if(isForm) {
		const origin=req.get('origin');
		try { if(origin&&origin!=='null'&&new URL(origin).host!==req.get('host')) return res.redirect(303,'/login.html?error=failed'); }
		catch(error) { return res.redirect(303,'/login.html?error=failed'); }
	}
	const username=String(req.body.username||'');
	const password=String(req.body.password||'');
	const attemptKey=username.trim().toLowerCase()+'|'+req.ip;
	const attempts=failedLogins.get(attemptKey);
	if(attempts&&attempts.count>=loginAttemptLimit&&Date.now()-attempts.first<loginLockMinutes*60000) {
		return reply(429,{ message: 'Too many failed sign-in attempts. Wait '+loginLockMinutes+' minutes and try again.' },'locked');
	}
	try {
		const result=await pool.query(
			`SELECT * FROM users 
			WHERE username = $1`,
			[username]
		);
		const user=result.rows[0];
		const passwordMatch=user? await argon2.verify(user.password_hash,password):false;
		if(!passwordMatch) {
			const current=attempts&&Date.now()-attempts.first<loginLockMinutes*60000? attempts:{ count: 0,first: Date.now() };
			current.count+=1;
			failedLogins.set(attemptKey,current);
			return reply(400,{ message: 'Invalid username or password' },'invalid');
		}
		failedLogins.delete(attemptKey);
		// A new session identifier is issued at sign-in so an earlier cookie cannot be reused.
		req.session.regenerate(function(error) {
			if(error) {
				console.error(error);
				return reply(500,{ message: 'Could not sign in. Please try again.' },'failed');
			}
			req.session.user_id=user.user_id;
			req.session.user_name=user.username;
			req.session.role=user.role;
			req.session.save(function(saveError) {
				if(saveError) {
					console.error(saveError);
					return reply(500,{ message: 'Could not sign in. Please try again.' },'failed');
				}
				return reply(200,{
					message: 'Login successful',
					user_name: user.username,
					role: user.role
				});
			});
		});
	} catch(error) {
		console.error(error);
		return reply(500,{ message: 'Could not sign in. Please try again.' },'failed');
	}
});

app.use('/api',requireLogin);

// Handles GET /api/items requests.
app.get("/api/items",function(req,res) {
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
app.get('/api/prices',requireRole(['admin','manager','storekeeper']),async function(req,res) {
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
app.get('/api/prices/lookup',requireRole(['admin','manager','storekeeper']),async function(req,res) {
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
app.post('/api/prices',requireRole(['admin']),async function(req,res) {
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

// Handles GET /api/customers requests.
app.get("/api/customers",requireRole(['admin','manager','storekeeper']),function(req,res) {
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
app.get('/api/suppliers',requireRole(['admin','manager','storekeeper']),function(req,res) {
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

// Returns employee records used to build the employee cards.
app.get('/api/employees',requireRole(['admin','manager']),function(req,res) {
	pool.query(
		`SELECT
		employee_id,
		TO_CHAR(start_date,'YYYY-MM-DD') AS start_date,
		name,
		phone_number,
		address,
		email,
		role,
        COALESCE((SELECT h.new_salary FROM salary_history h WHERE h.employee_id=employees.employee_id AND h.effective_date<=CURRENT_DATE ORDER BY h.effective_date DESC,h.salary_history_id DESC LIMIT 1),salary) AS salary,
		note,
		department,
        COALESCE((SELECT c.status FROM employment_period_changes c WHERE c.employee_id=employees.employee_id AND c.effective_date<=CURRENT_DATE ORDER BY c.effective_date DESC,c.change_id DESC LIMIT 1),status) AS status,
		TO_CHAR(inactive_date,'YYYY-MM-DD') AS inactive_date,
		username,
		permissions,
		photo_path,
		created_at
		FROM employees
		ORDER BY start_date DESC, employee_id DESC`,
		// Sends the stored employee records to the employee page.
		function(error,result) {
			if(error) {
				console.error(error);
				return res.status(500).json({
					err: 'Could not load employee details'
				});
			}
			return res.status(200).json(result.rows);
		}
	);
});

// Validates and saves an employee record with an optional passport photograph.
app.post('/api/employees',requireRole(['admin']),function(req,res) {
	employeePhotoUpload.single('photo')(req,res,async function(uploadError) {
		if(uploadError) {
			const message=uploadError.code==='LIMIT_FILE_SIZE'?
				'Employee photograph must not exceed 2 MB':
				uploadError.message;
			return res.status(400).json({ err: message });
		}

		const employee=req.body;
		if(
			!employee.start_date||
			!employee.name||
			!employee.phone||
			!employee.address||
			!employee.role
		) {
			removeUploadedEmployeePhoto(req.file);
			return res.status(400).json({
				err: 'Complete all required employee fields'
			});
		}

		const photoPath=req.file?
			'/images/employees/'+req.file.filename:
			null;

		try {
			const client=await pool.connect();
			try {
				await client.query('BEGIN');
				const result=await client.query(
				`INSERT INTO employees (
				start_date,
				name,
				phone_number,
				address,
				email,
				role,
				salary,
				note,
				photo_path
				)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
				RETURNING employee_id,photo_path`,
				[
					employee.start_date,
					employee.name.trim(),
					employee.phone.trim(),
					employee.address.trim(),
					employee.email? employee.email.trim():null,
					employee.role.trim(),
					employee.salary||null,
					employee.note? employee.note.trim():null,
					photoPath
				]
				);
                await client.query("INSERT INTO employment_period_changes(employee_id,effective_date,status) VALUES ($1,$2,'Active')",[result.rows[0].employee_id,employee.start_date]);
				if(employee.salary) {
					await client.query(
						`INSERT INTO salary_history
						(employee_id,previous_salary,new_salary,effective_date,reason,changed_by)
						VALUES ($1,NULL,$2,$3,'Initial salary',$4)`,
						[result.rows[0].employee_id,employee.salary,employee.start_date,req.session.user_id]
					);
				}
				await client.query('COMMIT');
				return res.status(201).json(result.rows[0]);
			} catch(error) {
				await client.query('ROLLBACK');
				throw error;
			} finally {
				client.release();
			}
		} catch(error) {
			removeUploadedEmployeePhoto(req.file);
			console.error(error);
			return res.status(500).json({
				err: 'Could not save employee details'
			});
		}
	});
});

// Returns the complete agreed-salary history for one employee.
app.get('/api/employees/:id/salary-history',requireRole(['admin','manager']),async function(req,res) {
	try {
		const result=await pool.query(
			`SELECT salary_history_id,previous_salary,new_salary,
			TO_CHAR(effective_date,'YYYY-MM-DD') AS effective_date,reason,created_at
			FROM salary_history WHERE employee_id=$1
			ORDER BY effective_date DESC,salary_history_id DESC`,
			[req.params.id]
		);
		return res.json(result.rows);
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not load salary history' });
	}
});

// Changes an employee's agreed salary while preserving the previous amount.
app.post('/api/employees/:id/salary-history',requireRole(['admin']),async function(req,res) {
	const employeeId=Number(req.params.id);
	const newSalary=Number(req.body.new_salary);
	const effectiveDate=String(req.body.effective_date||'');
	const reason=String(req.body.reason||'').trim();
	if(!Number.isInteger(employeeId)||employeeId<1||!Number.isFinite(newSalary)||newSalary<=0||!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)||!reason) {
		return res.status(400).json({ err: 'Enter the new salary, effective date and reason' });
	}
	const client=await pool.connect();
	try {
		await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(91001)');
		const employee=await client.query(
			'SELECT salary FROM employees WHERE employee_id=$1 FOR UPDATE',
			[employeeId]
		);
		if(employee.rowCount===0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ err: 'Employee not found' });
		}
		await client.query(
			`INSERT INTO salary_history
			(employee_id,previous_salary,new_salary,effective_date,reason,changed_by)
			VALUES ($1,$2,$3,$4,$5,$6)`,
			[employeeId,employee.rows[0].salary,newSalary,effectiveDate,reason,req.session.user_id]
		);
		await client.query(`UPDATE employees SET salary=COALESCE((SELECT h.new_salary FROM salary_history h
            WHERE h.employee_id=$1 AND h.effective_date<=CURRENT_DATE ORDER BY h.effective_date DESC,h.salary_history_id DESC LIMIT 1),salary)
            WHERE employee_id=$1`,[employeeId]);
        await markPayrollReview(client,employeeId,effectiveDate);
		await client.query('COMMIT');
		return res.json({ message: 'Salary changed successfully' });
	} catch(error) {
		await client.query('ROLLBACK');
		console.error(error);
		return res.status(500).json({ err: 'Could not change salary' });
	} finally {
		client.release();
	}
});

// Marks an employee as active or inactive using the administrator's effective date.
app.patch('/api/employees/:id/status',requireRole(['admin']),async function(req,res) {
	const employeeId=Number(req.params.id);
	const status=String(req.body.status||'');
	const effectiveDate=String(req.body.effective_date||'');
	if(
		!Number.isInteger(employeeId)||employeeId<1||
		!['Active','Inactive'].includes(status)||
		((status==='Inactive'||effectiveDate)&&!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate))
	) {
		return res.status(400).json({ err: 'Choose a valid employee status and date' });
	}
    const client=await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(91001)');
        const employee=await client.query('SELECT * FROM employees WHERE employee_id=$1 FOR UPDATE',[employeeId]);
        if(!employee.rowCount) { await client.query('ROLLBACK');return res.status(404).json({err:'Employee not found'}); }
        const date=effectiveDate||new Date().toISOString().slice(0,10);
        await client.query(`INSERT INTO employment_period_changes(employee_id,effective_date,status)
            VALUES($1,CASE WHEN $3::varchar='Inactive' THEN $2::date+1 ELSE $2::date END,$3::varchar)
            ON CONFLICT(employee_id,effective_date) DO UPDATE SET status=EXCLUDED.status`,[employeeId,date,status]);
        const result=await client.query(`UPDATE employees SET status=$1::varchar,
            inactive_date=CASE WHEN $1::varchar='Inactive' THEN $2::date ELSE NULL END WHERE employee_id=$3 RETURNING employee_id,status,inactive_date`,[status,date,employeeId]);
        await markPayrollReview(client,employeeId,date);
        await client.query('COMMIT');
        return res.json(result.rows[0]);
    } catch(error) { await client.query('ROLLBACK');console.error(error);return res.status(500).json({err:'Could not change employee status'}); }
    finally {client.release();}
});

// Loads payroll records for a selected month.
app.get('/api/payroll',requireRole(['admin']),async function(req,res) {
	const month=String(req.query.month||'');
	if(!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ err: 'Choose a payroll month' });
	try {
		const result=await pool.query(
			`SELECT payroll.payroll_id,payroll.employee_id,employees.name,
			payroll.basic_salary,payroll.bonus,payroll.deduction,payroll.total_salary_cost,
			payroll.needs_review,payroll.payment_status,TO_CHAR(payroll.payment_date,'YYYY-MM-DD') AS payment_date
			FROM payroll INNER JOIN employees ON employees.employee_id=payroll.employee_id
			WHERE payroll.payroll_month=$1::date ORDER BY employees.name`,
			[month+'-01']
		);
		return res.json(result.rows);
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not load payroll' });
	}
});

// Creates missing monthly payroll records using each employee's current salary.
app.post('/api/payroll/generate',requireRole(['admin']),async function(req,res) {
	const month=String(req.body.month||'');
	if(!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ err: 'Choose a payroll month' });
    try {return res.status(200).json(await preparePayroll(pool,month));}
    catch(error) {console.error(error);return res.status(500).json({err:'Could not prepare payroll'});}
});

// Saves payroll adjustments and payment information.
app.patch('/api/payroll/:id',requireRole(['admin']),async function(req,res) {
	const payrollId=Number(req.params.id);
	const bonus=Number(req.body.bonus);
	const deduction=Number(req.body.deduction);
	const status=String(req.body.payment_status||'');
	const paymentDate=req.body.payment_date||null;
	if(!Number.isInteger(payrollId)||payrollId<1||!Number.isFinite(bonus)||bonus<0||!Number.isFinite(deduction)||deduction<0||!['Pending','Paid'].includes(status)||(status==='Paid'&&!paymentDate)||
		(paymentDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)||!Number.isFinite(Date.parse(paymentDate+'T00:00:00Z'))||new Date(paymentDate+'T00:00:00Z').toISOString().slice(0,10)!==paymentDate))) {
		return res.status(400).json({ err: 'Check the payroll values and payment date' });
	}
	try {
		// Paid salaries are locked so a saved payment cannot be changed or reopened by mistake.
		const result=await pool.query(
			`UPDATE payroll SET bonus=$1,deduction=$2,
			total_salary_cost=GREATEST(basic_salary+$1-$2,0),payment_status=$3,payment_date=$4
			WHERE payroll_id=$5 AND NOT needs_review AND payment_status<>'Paid' RETURNING *`,
			[bonus,deduction,status,paymentDate,payrollId]
		);
		if(result.rowCount===0) return res.status(409).json({err:'Payroll is missing, already paid, or needs review. Paid salaries are locked; recalculate unpaid payroll before saving.'});
		return res.json(result.rows[0]);
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not save payroll' });
	}
});

// Returns the company profile displayed on the company details page.
app.get('/api/company',requireRole(['admin','manager','storekeeper']),async function(req,res) {
	try {
		const result=await pool.query(
			'SELECT * FROM company_details WHERE company_id=1'
		);
		return res.status(200).json(result.rows[0]);
	} catch(error) {
		console.error(error);
		return res.status(500).json({
			err: 'Could not load company details'
		});
	}
});

// Updates every editable company field and optionally replaces or removes the logo.
app.patch('/api/company',requireRole(['admin']),function(req,res) {
	companyLogoUpload.single('logo')(req,res,async function(uploadError) {
		if(uploadError) {
			const message=uploadError.code==='LIMIT_FILE_SIZE'?
				'Company logo must not exceed 2 MB':
				uploadError.message;
			return res.status(400).json({ err: message });
		}

		const company=req.body;
		if(!company.company_name||!company.company_name.trim()) {
			removeUploadedEmployeePhoto(req.file);
			return res.status(400).json({ err: 'Company name is required' });
		}

		try {
			const currentResult=await pool.query(
				'SELECT logo_path FROM company_details WHERE company_id=1'
			);
			const currentLogo=currentResult.rows[0]? currentResult.rows[0].logo_path:null;
			let logoPath=currentLogo;
			if(company.remove_logo==='true') {
				logoPath=null;
			} else if(req.file) {
				logoPath='/images/company/'+req.file.filename;
			}

			const result=await pool.query(
				`UPDATE company_details SET
				company_name=$1,
				registration_number=$2,
				tax_identification_number=$3,
				phone_number=$4,
				email=$5,
				website=$6,
				business_address=$7,
				bank_name=$8,
				account_number=$9,
				account_name=$10,
				logo_path=$11,
				updated_at=CURRENT_TIMESTAMP
				WHERE company_id=1
				RETURNING *`,
				[
					company.company_name.trim(),
					company.registration_number? company.registration_number.trim():null,
					company.tax_identification_number? company.tax_identification_number.trim():null,
					company.phone_number? company.phone_number.trim():null,
					company.email? company.email.trim():null,
					company.website? company.website.trim():null,
					company.business_address? company.business_address.trim():null,
					company.bank_name? company.bank_name.trim():null,
					company.account_number? company.account_number.trim():null,
					company.account_name? company.account_name.trim():null,
					logoPath
				]
			);

            // Retain old logos: issued invoices may still reference them.

			return res.status(200).json(result.rows[0]);
		} catch(error) {
			removeUploadedEmployeePhoto(req.file);
			console.error(error);
			return res.status(500).json({ err: 'Could not update company details' });
		}
	});
});

// Handles GET /api/customers/:id requests.
app.get('/api/customers/:id',requireRole(['admin','manager','storekeeper']),async function(req,res) {
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
app.patch('/api/customers/:id',requireRole(['admin','manager']),async function(req,res) {
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
app.get('/api/suppliers/:id',requireRole(['admin','manager','storekeeper']),async function(req,res) {
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
app.patch('/api/suppliers/:id',requireRole(['admin','manager']),async function(req,res) {
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


require('./delivery-notes').registerDeliveryNotes(app,pool,requireRole);
// Other partners and the capital asset register; capital spending never reduces profit.
require('./partners').registerPartners(app,pool,requireRole);

// Handles GET /api/sales requests.
app.get("/api/sales",requireRole(['admin','manager','storekeeper']),function(req,res) {
	pool.query(
		`SELECT
		sales.item_id,
		sales.sales_id,
		to_char(sales.sales_date, 'YYYY-MM-DD') AS sales_date,
		sales.created_at,
		sales.customer_id,
		customers.name AS customer,
		items.name,
		sales.quantity,sales.billing_basis,COALESCE(sales.factory_quantity,sales.quantity) AS factory_quantity,
        EXISTS(SELECT 1 FROM delivery_notes d WHERE d.sales_id=sales.sales_id) AS has_delivery_note,
		sales.unit_price,
		sales.quantity * sales.unit_price AS total,
		sales.invoice_number,
		wr.scale_ticket,wr.vehicle_number,wr.completed_by AS weighed_by,wr.status AS dispatch_status,
		to_char(sales.due_date,'YYYY-MM-DD') AS due_date,
		COALESCE(payments.amount_paid,0) AS amount_paid,
		GREATEST(sales.quantity*sales.unit_price-COALESCE(payments.amount_paid,0),0) AS amount_remaining,
		CASE
            WHEN sales.invoice_number IS NULL THEN 'Awaiting customer weight'
			WHEN COALESCE(payments.amount_paid,0)>=sales.quantity*sales.unit_price THEN 'Paid'
			WHEN COALESCE(payments.amount_paid,0)>0 THEN 'Partly Paid'
			WHEN sales.due_date<CURRENT_DATE THEN 'Overdue'
			ELSE 'Pending'
		END AS payment_status
		FROM sales
		INNER JOIN customers
		ON sales.customer_id = customers.customer_id
		INNER JOIN items
		ON sales.item_id = items.item_id
		LEFT JOIN weighing_requests wr
		ON wr.request_type='Sale' AND wr.completed_record_id=sales.sales_id AND wr.status='Completed'
		LEFT JOIN (
			SELECT sales_id,SUM(amount) AS amount_paid
			FROM sale_payments WHERE reversed_at IS NULL GROUP BY sales_id
		) AS payments ON payments.sales_id=sales.sales_id
		ORDER BY sales.created_at DESC`,
		// Runs the callback required by the surrounding operation.
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

// Returns one sale with the company details and every payment recorded against it.
app.get('/api/sales/:id/invoice',requireRole(['admin','manager','storekeeper']),async function(req,res) {
	try {
		const saleResult=await pool.query(`SELECT
			s.sales_id,to_char(s.sales_date,'YYYY-MM-DD') AS sales_date,
			to_char(s.due_date,'YYYY-MM-DD') AS due_date,s.invoice_number,
			s.invoice_snapshot,s.quantity,s.billing_basis,s.unit_price,s.quantity*s.unit_price AS total,
            EXISTS(SELECT 1 FROM delivery_notes d WHERE d.sales_id=s.sales_id) AS has_delivery_note,
			c.customer_id,c.name AS customer,c.phone_number AS customer_phone,
			c.email AS customer_email,c.address AS customer_address,i.name AS item,
			COALESCE((SELECT SUM(amount) FROM sale_payments WHERE sales_id=s.sales_id AND reversed_at IS NULL),0) AS amount_paid
		FROM sales s
		JOIN customers c ON c.customer_id=s.customer_id
		JOIN items i ON i.item_id=s.item_id
		WHERE s.sales_id=$1`,[req.params.id]);
		if(saleResult.rows.length===0) return res.status(404).json({ err: 'Sale not found' });
        if(!saleResult.rows[0].invoice_number)return res.status(409).json({err:'Invoice awaits the buyer’s signed weight and any required Director approval.'});
		const paymentsResult=await pool.query(`SELECT
			payment_id,receipt_number,to_char(payment_date,'YYYY-MM-DD') AS payment_date,
			amount,payment_method,reference_number,note,created_at,reversed_at,reversal_reason,
			(SELECT username FROM users WHERE user_id=sale_payments.recorded_by) AS recorded_by_name,
			(SELECT username FROM users WHERE user_id=sale_payments.reversed_by) AS reversed_by_name
		FROM sale_payments WHERE sales_id=$1 ORDER BY payment_date,created_at,payment_id`,[req.params.id]);
		const companyResult=await pool.query('SELECT * FROM company_details WHERE company_id=1');
		const sale=saleResult.rows[0];
        const snapshot=sale.invoice_snapshot;
        if(snapshot) for(const key of ['customer','customer_phone','customer_email','customer_address','item']) sale[key]=snapshot[key];
        return res.json({sale,payments:paymentsResult.rows,company:snapshot?.company||companyResult.rows[0]||{}});
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not load invoice details' });
	}
});

// Records one customer payment and creates its permanent receipt number.
app.post('/api/sales/:id/payments',requireRole(['admin','manager']),async function(req,res) {
	const payment=req.body;
	const amount=readInventoryQuantity(payment.amount);
	if(!payment.payment_date||!payment.payment_method||amount===null||amount<=0) {
		return res.status(400).json({ err: 'Enter a valid payment date, amount and method' });
	}
	let submissionKey;
	try { submissionKey=readSubmissionKey(payment.submission_key); } catch(error) { return res.status(400).json({ err: error.message }); }
	const client=await pool.connect();
	try {
		await client.query('BEGIN');
		const saleResult=await client.query(`SELECT
			sales_id,invoice_number,quantity*unit_price AS total
		FROM sales WHERE sales_id=$1 FOR UPDATE`,[req.params.id]);
		if(saleResult.rows.length===0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ err: 'Sale not found' });
		}
		const sale=saleResult.rows[0];
		// The same payment sent again (double tap or retry) returns the payment already saved.
		if(submissionKey) {
			const prior=(await client.query('SELECT * FROM sale_payments WHERE submission_key=$1',[submissionKey])).rows[0];
			if(prior) {
				await client.query('ROLLBACK');
				if(String(prior.sales_id)!==String(sale.sales_id)||Number(prior.amount)!==amount) {
					return res.status(409).json({ err: 'This payment was already saved with different details. Refresh before recording another payment.' });
				}
				return res.status(200).json(prior);
			}
		}
        if(!sale.invoice_number){await client.query('ROLLBACK');return res.status(409).json({err:'Finalise the customer weight invoice before recording payment.'});}
        sale.amount_paid=(await client.query('SELECT COALESCE(SUM(amount),0) AS amount_paid FROM sale_payments WHERE sales_id=$1 AND reversed_at IS NULL',[req.params.id])).rows[0].amount_paid;
		if((await client.query('SELECT $1::numeric > $2::numeric-$3::numeric AS excessive',[amount,sale.total,sale.amount_paid])).rows[0].excessive) {
			await client.query('ROLLBACK');
			return res.status(400).json({ err: 'Payment cannot be greater than the remaining amount' });
		}
		const inserted=await client.query(`INSERT INTO sale_payments
			(sales_id,payment_date,amount,payment_method,reference_number,note,recorded_by,submission_key)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING payment_id`,[
			req.params.id,payment.payment_date,amount,payment.payment_method,
			payment.reference_number||null,payment.note||null,req.session.user_id,submissionKey
		]);
		const paymentId=inserted.rows[0].payment_id;
		const receiptNumber='RCT-'+String(payment.payment_date).slice(0,4)+'-'+String(paymentId).padStart(6,'0');
		const saved=await client.query(`UPDATE sale_payments SET receipt_number=$1
			WHERE payment_id=$2 RETURNING *`,[receiptNumber,paymentId]);
		await client.query('COMMIT');
		return res.status(201).json(saved.rows[0]);
	} catch(error) {
		await client.query('ROLLBACK');
		console.error(error);
		return res.status(500).json({ err: 'Could not record payment' });
	} finally {
		client.release();
	}
});

// Reverses a wrongly entered payment; its receipt stays on record marked as reversed.
app.post('/api/sales/:id/payments/:paymentId/reverse',requireRole(['admin']),async function(req,res) {
	const reason=String(req.body.reason||'').trim();
	if(!/^\d+$/.test(req.params.id)||!/^\d+$/.test(req.params.paymentId)||!reason||reason.length>300) {
		return res.status(400).json({ err: 'Enter the reason for reversing this payment' });
	}
	try {
		const result=await pool.query(`UPDATE sale_payments SET reversed_at=CURRENT_TIMESTAMP,reversed_by=$1,reversal_reason=$2
			WHERE payment_id=$3 AND sales_id=$4 AND reversed_at IS NULL RETURNING *`,
			[req.session.user_id,reason,req.params.paymentId,req.params.id]);
		if(result.rowCount===0) return res.status(409).json({ err: 'Payment not found or already reversed. Refresh the sale.' });
		return res.json({ message: 'Payment reversed. Receipt '+result.rows[0].receipt_number+' is kept and marked reversed.',payment: result.rows[0] });
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not reverse the payment' });
	}
});

// Handles GET /api/stock_counts requests.
app.get("/api/stock_counts",requireRole(['admin','storekeeper']),function(req,res) {
	pool.query(
		"SELECT stock_counts.source_type, stock_counts.source_id, stock_counts.adjustment_reason, stock_counts.count_id, stock_counts.item_id, items.name, to_char(stock_counts.count_date, 'YYYY-MM-DD') AS count_date, stock_counts.created_at, stock_counts.received, stock_counts.issued, SUM(stock_counts.received - stock_counts.issued) OVER (PARTITION BY stock_counts.item_id ORDER BY stock_counts.count_date, stock_counts.created_at, stock_counts.count_id) - (stock_counts.received - stock_counts.issued) AS opening_stock, SUM(stock_counts.received - stock_counts.issued) OVER (PARTITION BY stock_counts.item_id ORDER BY stock_counts.count_date, stock_counts.created_at, stock_counts.count_id) AS closing_stock FROM stock_counts INNER JOIN items ON stock_counts.item_id = items.item_id ORDER BY stock_counts.count_date DESC, stock_counts.created_at DESC, stock_counts.count_id DESC",
		// Handles the result of the preceding database query.
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

// Carry each item balance through inactive days without creating stock movements.
app.get('/api/inventory-summary',requireRole(['admin','storekeeper']),async function(req,res) {
	try {
		const result=await pool.query(`WITH daily AS (
			SELECT stock_counts.item_id,items.name,stock_counts.count_date,
			MAX(stock_counts.created_at) AS created_at,SUM(stock_counts.received) AS received,
			SUM(stock_counts.issued) AS issued
			FROM stock_counts INNER JOIN items ON items.item_id=stock_counts.item_id
			GROUP BY stock_counts.item_id,items.name,stock_counts.count_date
		), item_days AS (
			SELECT item_id,name,generate_series(MIN(count_date)::timestamp,
				GREATEST(CURRENT_DATE,MAX(count_date))::timestamp,INTERVAL '1 day')::date AS count_date
			FROM daily GROUP BY item_id,name
		), calendar AS (
			SELECT item_days.item_id,item_days.name,item_days.count_date,daily.created_at,
				COALESCE(daily.received,0) AS received,COALESCE(daily.issued,0) AS issued
			FROM item_days LEFT JOIN daily USING (item_id,name,count_date)
		)
		SELECT ROW_NUMBER() OVER (ORDER BY count_date,item_id) AS summary_id,item_id,name,
		TO_CHAR(count_date,'YYYY-MM-DD') AS count_date,created_at,received,issued,
		SUM(received-issued) OVER (PARTITION BY item_id ORDER BY count_date)-
			(received-issued) AS opening_stock,
		SUM(received-issued) OVER (PARTITION BY item_id ORDER BY count_date) AS closing_stock
		FROM calendar ORDER BY count_date DESC,item_id`);
		return res.json(result.rows);
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not load daily Inventory summary' });
	}
});

require('./kernel-impurity').registerKernelImpurity(app,pool,requireRole);

// Handles GET /api/purchases requests.
app.get("/api/purchases",requireRole(['admin','manager','storekeeper']),function(req,res) {
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
    purchases.unit_cost AS total_cost,
	wr.scale_ticket,wr.vehicle_number,wr.completed_by AS weighed_by
    FROM purchases
    INNER JOIN suppliers ON
    purchases.supplier_id = suppliers.supplier_id
    INNER JOIN items ON
    purchases.item_id = items.item_id
	LEFT JOIN weighing_requests wr
	ON wr.request_type='Purchase' AND wr.completed_record_id=purchases.purchase_id AND wr.status='Completed'
    ORDER BY purchases.purchase_date
    DESC, purchases.created_at DESC`,
		// Runs the callback required by the surrounding operation.
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

// Handles GET /api/production requests.
app.get("/api/production",requireRole(['admin','manager','storekeeper']),function(req,res) {
	pool.query(
		`SELECT production.production_id,to_char(production.production_date,'YYYY-MM-DD') AS production_date,
		production.created_at,production.kernel_used,production.pko_produced,production.pkc_produced,
		production.sludge_produced,production.process_loss,ROUND((production.pko_produced/NULLIF(production.kernel_used,0)*100)::numeric,2) AS pko_yield,
		ROUND((production.pkc_produced/NULLIF(production.kernel_used,0)*100)::numeric,2) AS pkc_yield,
		to_char(production.production_hours,'HH24:MI') AS production_hours,
		to_char(production.down_time,'HH24:MI') AS down_time,wr.request_id,wr.scale_ticket,wr.completed_by AS weighed_by,wr.status,
        CASE WHEN wr.status='Awaiting Storekeeper' THEN 'Provisional' ELSE 'Final' END AS yield_status,
        (SELECT COALESCE(json_agg(pb ORDER BY pb.batch_id),'[]'::json)
         FROM production_batches pb WHERE pb.request_id=wr.request_id) AS batches
		FROM production LEFT JOIN weighing_requests wr
		ON wr.request_type='Production' AND wr.completed_record_id=production.production_id AND wr.status IN ('Completed','Awaiting Storekeeper')
		ORDER BY production.created_at DESC`,
		// Handles the result of the preceding database query.
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

// Handles GET /api/expenses requests.
app.get("/api/expenses",requireRole(['admin','manager','storekeeper']),function(req,res) {
	pool.query(
		`SELECT expenses.expense_id, to_char(expenses.expense_date, 'YYYY-MM-DD') AS expense_date, expenses.created_at, expenses.category, expenses.description,
    expenses.amount_spent,expenses.spread_months,expenses.startup_months
    FROM expenses
    ORDER BY
    expenses.created_at DESC;`,
		// Handles the result of the preceding database query.
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

// Handles POST /api/sales requests.
app.post("/api/sales",requireRole(['admin','manager']),async function(req,res) {
	const sales=req.body;
	if(
		!sales.customer_id||
		!sales.item_id||
		!/^\d{4}-\d{2}-\d{2}$/.test(sales.sales_date)
	) {
		return res.status(400).json({
			error: "could not save sale"
		});
	}
	// The quantity the customer ordered, so the Storekeeper knows how much to load.
	const orderedQuantity=readInventoryQuantity(sales.ordered_quantity);
	if(orderedQuantity===null||orderedQuantity<=0) {
		return res.status(400).json({ err: 'Enter the quantity the customer ordered, with no more than two decimal places.' });
	}
	try {
		const priceResult=await pool.query(`SELECT unit_price FROM product_prices
			WHERE item_id=$1 AND effective_date<=$2::date
			ORDER BY effective_date DESC,price_id DESC LIMIT 1`,
			[sales.item_id,sales.sales_date]);
		if(priceResult.rows.length===0) {
			return res.status(400).json({ err: 'No price has been set for this product on the selected date' });
		}
		const savedUnitPrice=priceResult.rows[0].unit_price;
        const basis=sales.billing_basis||'Factory';
        if(!['Factory','Customer'].includes(basis))return res.status(400).json({err:'Choose factory weight or customer weight.'});
        const representative=Number(sales.representative_id||req.session.user_id);
        if(!Number.isInteger(representative)||(req.session.role!=='admin'&&representative!==req.session.user_id))return res.status(403).json({err:'Only the Director can assign another accompanying representative.'});
        // The Director approves releases and weight differences, so they are never the accompanying representative.
        const representativeRole=(await pool.query('SELECT role FROM users WHERE user_id=$1',[representative])).rows[0]?.role;
        if(!representativeRole||representativeRole==='admin')return res.status(400).json({err:'Choose a staff member other than the Director as the accompanying representative.'});
		const inserted=await authorise(pool,'Sale',sales,req.session.user_id,
			`INSERT INTO weighing_requests
			(request_type,request_date,customer_id,item_id,unit_price,created_by,billing_basis,representative_id,ordered_quantity)
			VALUES ('Sale',$1::date,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[
			sales.sales_date,
			sales.customer_id,
			sales.item_id,
			savedUnitPrice,
			req.session.user_id,basis,representative,orderedQuantity
		]);
		return res.status(201).json(inserted.rows[0]);
	} catch(error) {
		console.error(error);
		return res.status(error.status||500).json({ err: error.status?error.message: 'Could not save sale' });
	}
});

// Handles POST /api/purchases requests.
app.post("/api/purchases",requireRole(['admin','manager']),async function(req,res) {
	const purchase=req.body;
	if(
		!purchase.supplier_id||
		!purchase.item_id||
		!purchase.unit_cost||
		purchase.unit_cost<=0||
		!/^\d{4}-\d{2}-\d{2}$/.test(purchase.purchase_date)
	) {
		return res.status(400).json({
			error: "Could not submit purchase"
		});
	}
	// The quantity agreed with the supplier, so the Storekeeper knows what to expect.
	const orderedQuantity=readInventoryQuantity(purchase.ordered_quantity);
	if(orderedQuantity===null||orderedQuantity<=0) {
		return res.status(400).json({ err: 'Enter the quantity ordered from the supplier, with no more than two decimal places.' });
	}
	try {
		const result=await authorise(pool,'Purchase',purchase,req.session.user_id,
			`INSERT INTO weighing_requests
			(request_type,request_date,supplier_id,item_id,unit_cost,created_by,ordered_quantity)
			VALUES ('Purchase',$1::date,$2,$3,$4,$5,$6) RETURNING *`,[
			purchase.purchase_date,
			purchase.supplier_id,
			purchase.item_id,
			purchase.unit_cost,
			req.session.user_id,
			orderedQuantity
		]);
		return res.status(201).json(result.rows[0]);
	} catch(error) {
		console.error(error);
		return res.status(error.status||500).json({ err: error.status?error.message: 'Could not send purchase to Storekeeper' });
	}
});

// Reasons the Director can give for a manual stock change; losses are reported separately from sales.
const stockAdjustmentReasons=['Spill','Disposal','Count difference','Return to store','Other'];

// Handles POST /api/stock_counts requests.
app.post("/api/stock_counts",requireRole(['admin']),async function(req,res) {
	const stockInventory=req.body;
	const receivedQuantity=readInventoryQuantity(stockInventory.received);
	const issuedQuantity=readInventoryQuantity(stockInventory.issued);
	const reason=stockInventory.adjustment_reason||null;
	if(
		!/^\d{4}-\d{2}-\d{2}$/.test(String(stockInventory.count_date||''))||
		!stockInventory.item_id||
		receivedQuantity===null||
		issuedQuantity===null||
		(receivedQuantity===0&&issuedQuantity===0)||
		// A manual change either adds or removes stock, never both in one entry.
		(receivedQuantity>0&&issuedQuantity>0)||
		(reason!==null&&!stockAdjustmentReasons.includes(reason))
	) {
		return res.status(400).json({
			error: "Could not submit stock"
		});
	}
	let submissionKey;
	try { submissionKey=readSubmissionKey(stockInventory.submission_key); } catch(error) { return res.status(400).json({ err: error.message }); }
    const client=await pool.connect();
    try {
        await client.query('BEGIN');await lockStock(client);
        // The same stock change sent again (double tap or retry) returns the change already saved.
        if(submissionKey) {
            const prior=(await client.query('SELECT * FROM stock_counts WHERE submission_key=$1',[submissionKey])).rows[0];
            if(prior) {
                await client.query('ROLLBACK');
                if(String(prior.item_id)!==String(stockInventory.item_id)||Number(prior.received)!==receivedQuantity||Number(prior.issued)!==issuedQuantity) {
                    return res.status(409).json({ err: 'This stock change was already saved with different details. Refresh before recording another.' });
                }
                return res.status(200).json(prior);
            }
        }
        const before=await stockFloor(client);
        const result=await client.query('INSERT INTO stock_counts(count_date,item_id,received,issued,recorded_by,adjustment_reason,submission_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [stockInventory.count_date,stockInventory.item_id,receivedQuantity,issuedQuantity,req.session.user_id,reason,submissionKey]);
        await protectStock(client,before);
        await recordStockHistory(client,result.rows[0].count_id,'Created',null,result.rows[0],req.session.user_id);
        await client.query('COMMIT');return res.status(201).json(result.rows[0]);
    }catch(error){await client.query('ROLLBACK');return res.status(error.status||500).json({err:error.status?error.message:'Could not save stock adjustment'});}
    finally{client.release();}
});

// History trail of manual stock changes, newest first, for the Director. 100 at a time; pass offset for more.
app.get('/api/stock-change-history',requireRole(['admin']),async function(req,res) {
    const offset=Math.max(Number.parseInt(req.query.offset,10)||0,0);
    try {
        const rows=(await pool.query(`SELECT h.history_id,h.count_id,h.action,h.before_values,h.after_values,h.backfilled,
            to_char(h.changed_at,'YYYY-MM-DD"T"HH24:MI:SS') AS changed_at,u.username AS changed_by,
            bi.name AS before_item,ai.name AS after_item
            FROM stock_change_history h
            LEFT JOIN users u ON u.user_id=h.changed_by
            LEFT JOIN items bi ON bi.item_id=(h.before_values->>'item_id')::integer
            LEFT JOIN items ai ON ai.item_id=(h.after_values->>'item_id')::integer
            ORDER BY h.changed_at DESC,h.history_id DESC LIMIT 101 OFFSET $1`,[offset])).rows;
        return res.json({rows:rows.slice(0,100),more:rows.length>100});
    } catch(error) {
        console.error(error);
        return res.status(500).json({err:'Could not load the stock change history.'});
    }
});

require('./consumable-checks').registerConsumableChecks(app,pool,requireRole);

// Daily electricity, fuel and other consumables are issues, not new purchases.
app.post('/api/consumable-usage',requireRole(['admin','storekeeper']),async function(req,res){
    const usage=req.body,amount=readInventoryQuantity(usage.quantity);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(usage.usage_date||'')||!Number.isInteger(Number(usage.item_id))||Number(usage.item_id)<1||amount===null||amount<=0||
       !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usage.entry_key||'')){
        return res.status(400).json({err:'Enter a date, a consumable and the actual quantity used, with no more than two decimal places.'});
    }
    const client=await pool.connect();
    try{
        await client.query('BEGIN');await lockStock(client);
        const part='Use:'+crypto.createHash('sha256').update(usage.entry_key).digest('hex').slice(0,24);
        const existing=(await client.query("SELECT *,to_char(count_date,'YYYY-MM-DD') AS saved_date FROM stock_counts WHERE source_type='Manual' AND source_part=$1",[part])).rows[0];
        if(existing){
            if(existing.recorded_by!==req.session.user_id||existing.item_id!==Number(usage.item_id)||existing.saved_date!==usage.usage_date||Number(existing.issued)!==amount){
                throw Object.assign(new Error('This usage entry has already been saved with different details. Refresh Inventory Data before recording another entry.'),{status:409});
            }
            await client.query('COMMIT');return res.json({message:'Daily usage already recorded; stock was not deducted again.',record:existing});
        }
        const item=(await client.query('SELECT item_type FROM items WHERE item_id=$1',[usage.item_id])).rows[0];
        if(!item||item.item_type!=='consumable')throw Object.assign(new Error('This form records consumable usage only. Use Pending Weighing for purchases, sales and kernel issues.'),{status:400});
        const before=await stockFloor(client);
        const record=(await client.query(`INSERT INTO stock_counts(count_date,item_id,received,issued,source_type,source_part,recorded_by)
            VALUES($1::date,$2,0,$3,'Manual',$4,$5) RETURNING *`,[usage.usage_date,usage.item_id,amount,part,req.session.user_id])).rows[0];
        await protectStock(client,before);
        await client.query('DELETE FROM daily_consumable_checks WHERE item_id=$1 AND check_date=$2::date',[usage.item_id,usage.usage_date]);
        await client.query('COMMIT');
        return res.status(201).json({message:'Daily usage saved. Inventory and closing balance have been updated.',record});
    }catch(error){
        await client.query('ROLLBACK');return res.status(error.status||(error.code==='22008'||error.code==='22007'?400:500)).json({err:error.status?error.message:error.code==='22008'||error.code==='22007'?'Enter a valid usage date.':'Could not save daily usage.'});
    }finally{client.release();}
});

// Accepts a non-negative inventory quantity with no more than two decimal places.
// Reads the optional one-time key sent with a payment, stock change or expense. Returns null when none is sent;
// an entry sent again with the same key is saved only once. A malformed key is refused.
function readSubmissionKey(value) {
	if(value===undefined||value===null||value==='') return null;
	if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value))) {
		throw Object.assign(new Error('Invalid submission key. Refresh the page and try again.'),{status:400});
	}
	return String(value).toLowerCase();
}

function readInventoryQuantity(value) {
	const quantityText=String(value??'').trim();
	if(!/^\d+(?:\.\d{1,2})?$/.test(quantityText)) {
		return null;
	}
	const quantity=Number(quantityText);
	return Number.isFinite(quantity)? quantity:null;
}

// Handles POST /api/production requests.
app.post("/api/production",requireRole(['admin','manager']),async function(req,res) {
	const production=req.body;
	if(
		!production.production_date||
		!production.production_hours||
		!production.down_time
	) {
		return res.status(400).json({
			err: "Check your inputs and try again"
		});
	}
    if(!/^\d{2}:[0-5]\d$/.test(production.production_hours)||!/^\d{2}:[0-5]\d$/.test(production.down_time)) {
        return res.status(400).json({err:'Enter production hours and downtime as hours:minutes, for example 00:30 or 08:50'});
    }
	try {
		const existing=await pool.query(`SELECT 1 FROM production WHERE production_date=$1::date
			UNION ALL SELECT 1 FROM weighing_requests
			WHERE request_type='Production' AND request_date=$1::date AND status='Awaiting Storekeeper'`,
		[production.production_date]);
		if(existing.rows.length>0) return res.status(409).json({ err: 'A production record already exists for this date' });
		const result=await pool.query(`INSERT INTO weighing_requests
			(request_type,request_date,production_hours,down_time,created_by)
			VALUES ('Production',$1::date,$2::interval,$3::interval,$4) RETURNING *`,
		[production.production_date,production.production_hours,production.down_time,req.session.user_id]);
		return res.status(201).json(result.rows[0]);
	} catch(error) {
		console.error(error);
        if(error.code==='23505') return res.status(409).json({ err:'A production authorisation already exists for this date' });
		return res.status(500).json({ err: 'Could not send production to Storekeeper' });
	}
});

const {weighingRequestDetails,registerFinishedProduction}=require('./weighing-history');
registerFinishedProduction(app,pool,requireRole);

// Lists authorised activities that are waiting for the Storekeeper's physical quantities.
app.get('/api/weighing-requests',requireRole(['admin','manager','storekeeper']),async function(req,res) {
	try {
		const result=await pool.query(`WITH numbered_requests AS (
            SELECT weighing_requests.*,ROW_NUMBER() OVER (
                PARTITION BY request_type,request_date ORDER BY request_id
            ) AS daily_number FROM weighing_requests
        )  ${weighingRequestDetails}
        WHERE (wr.status='Awaiting Storekeeper'
            OR ($3::boolean AND wr.request_id IN (SELECT request_id FROM weighing_requests
                WHERE request_type='Production' AND status='Completed'
                ORDER BY request_date DESC,request_id DESC LIMIT 10)))
            AND (wr.request_type<>'Production' OR wr.completed_record_id IS NULL
                OR EXISTS (SELECT 1 FROM production p WHERE p.production_id=wr.completed_record_id))
		ORDER BY wr.request_date,wr.created_at,wr.request_id`,
        [req.session.user_id,req.session.role,req.session.role==='admin'&&req.query.include_completed==='true']);
		return res.json(result.rows);
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not load pending Storekeeper work' });
	}
});

// Cancels an incorrect authorisation before the Storekeeper has completed it.
app.patch('/api/weighing-requests/:id/cancel',requireRole(['admin','manager']),async function(req,res) {
	const requestId=Number(req.params.id);
	if(!Number.isInteger(requestId)||requestId<1) return res.status(400).json({ err: 'Invalid request' });
	try {
		const result=await pool.query(`UPDATE weighing_requests SET status='Cancelled'
			WHERE request_id=$1 AND status='Awaiting Storekeeper' AND completed_record_id IS NULL AND ($2::text='admin' OR created_by=$3)
            RETURNING request_id`,[requestId,req.session.role,req.session.user_id]);
		if(result.rows.length===0) return res.status(404).json({ err: 'Authorisation not found, already closed, or has saved quantities; production with saved batches must be finished' });
		return res.json({ message: 'Authorisation cancelled' });
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not cancel the authorisation' });
	}
});

// Adds or changes the ordered quantity on a sale or purchase still waiting for the Storekeeper,
// for authorisations made before it was recorded or when the customer or supplier changes the order.
// The Director can change any; a Manager only their own, like cancelling.
app.patch('/api/weighing-requests/:id/ordered-quantity',requireRole(['admin','manager']),async function(req,res) {
	const requestId=Number(req.params.id);
	const quantity=readInventoryQuantity(req.body.ordered_quantity);
	if(!Number.isInteger(requestId)||requestId<1) return res.status(400).json({ err: 'Invalid request' });
	if(quantity===null||quantity<=0) return res.status(400).json({ err: 'Enter the ordered quantity, with no more than two decimal places.' });
	try {
		const result=await pool.query(`UPDATE weighing_requests SET ordered_quantity=$2
			WHERE request_id=$1 AND status='Awaiting Storekeeper' AND request_type IN ('Sale','Purchase') AND ($3::text='admin' OR created_by=$4)
			RETURNING request_id,ordered_quantity`,[requestId,quantity,req.session.role,req.session.user_id]);
		if(result.rows.length===0) return res.status(404).json({ err: 'Authorisation not found, already completed, or not yours to change.' });
		return res.json({ message: 'Ordered quantity saved.',...result.rows[0] });
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not save the ordered quantity' });
	}
});

// Closes a production day without adding quantities a second time.
app.patch('/api/weighing-requests/:id/finish',requireRole(['admin','storekeeper']),async function(req,res) {
    const requestId=Number(req.params.id);
    if(!Number.isInteger(requestId)||requestId<1) return res.status(400).json({ err:'Invalid request' });
    const client=await pool.connect();
    try {
    await client.query('BEGIN');
    const result=await client.query(`UPDATE weighing_requests SET status='Completed',
        completed_by=$1,completed_at=CURRENT_TIMESTAMP
        WHERE request_id=$2 AND request_type='Production' AND status='Awaiting Storekeeper'
        AND completed_record_id IS NOT NULL RETURNING completed_record_id`,[req.session.user_id,requestId]);
    if(!result.rows.length) { await client.query('ROLLBACK');return res.status(409).json({ err:'Save at least one batch before finishing an open production day' }); }
    // Finish Day means every material has been processed, so kernel not recovered as weighed product is production loss.
    const loss=await client.query(`UPDATE production SET process_loss=GREATEST(ROUND(kernel_used-pko_produced-pkc_produced-sludge_produced,2),0)
        WHERE production_id=$1 RETURNING process_loss`,[result.rows[0].completed_record_id]);
    await client.query('COMMIT');
    const lossQuantity=Number(loss.rows[0]?.process_loss)||0;
    return res.json({ message:'Production day finished'+(lossQuantity>0?'. Production loss recorded: '+lossQuantity+' kg':'') });
    } catch(error) {
        await client.query('ROLLBACK');
        console.error(error);
        return res.status(500).json({ err:'Could not finish production day' });
    } finally {client.release();}
});

// Only Admin can reopen the same daily authorisation; quantities and stock stay intact.
app.patch('/api/weighing-requests/:id/reopen',requireRole(['admin']),async function(req,res) {
    const requestId=Number(req.params.id);
    if(!Number.isInteger(requestId)||requestId<1) return res.status(400).json({ err:'Invalid request' });
    try {
        await reopenProduction(pool,requestId,req.session.user_id);
        return res.json({message:'Production reopened; Storekeeper can add more batches'});
    }catch(error){return res.status(error.status||500).json({err:error.status?error.message:'Could not reopen production'});}
});

// Purchases and sales complete once; production submissions add batches to an open day.
app.patch('/api/weighing-requests/:id/complete',requireRole(['admin','storekeeper']),async function(req,res) {
	const requestId=Number(req.params.id);
	if(!Number.isInteger(requestId)||requestId<1) return res.status(400).json({ err: 'Invalid request' });
	const client=await pool.connect();
	try {
		await client.query('BEGIN');
        await lockStock(client);
        const before=await stockFloor(client);
		const requestResult=await client.query(
			`SELECT * FROM weighing_requests WHERE request_id=$1 FOR UPDATE`,[requestId]
		);
		if(requestResult.rows.length===0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ err: 'Request not found' });
		}
		const request=requestResult.rows[0];
		if(request.status!=='Awaiting Storekeeper') {
			await client.query('ROLLBACK');
			return res.status(409).json({ err: 'This request has already been completed' });
		}
        // Stock moves on the day goods are actually received, issued or dispatched, never before the authorisation date.
        const movementDate=req.body.movement_date||dateText(request.request_date);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(movementDate)||Number(movementDate.slice(0,4))<1||!Number.isFinite(Date.parse(movementDate+'T00:00:00Z'))||new Date(movementDate+'T00:00:00Z').toISOString().slice(0,10)!==movementDate||movementDate<dateText(request.request_date)) {
            throw Object.assign(new Error(request.request_type==='Production'?'Enter a valid issue or receipt date on or after the production date.':
                'Enter a valid date actually '+(request.request_type==='Purchase'?'received':'dispatched')+', on or after the authorisation date.'),{status:400});
        }
        if(request.request_type==='Production') {
            if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.body.submission_key||'')) {
                throw Object.assign(new Error('A valid batch submission key is required'),{ status:400 });
            }
            const previous=await client.query('SELECT * FROM production_batches WHERE submission_key=$1',[req.body.submission_key]);
            if(previous.rows.length) {
                if(previous.rows[0].request_id!==requestId) throw Object.assign(new Error('Batch key belongs to another authorisation'),{ status:409 });
                const batch=previous.rows[0];
                if(batch.voided) throw Object.assign(new Error('This batch has been reversed. Start a new batch.'),{status:409});
                if(dateText(batch.movement_date||request.request_date)!==movementDate||['kernel_used','pko_produced','pkc_produced','sludge_produced'].some(key =>
                    readInventoryQuantity(req.body[key])!==Number(batch[key]))||
                    (String(req.body.scale_ticket||'').trim()||null)!==batch.scale_ticket) {
                    throw Object.assign(new Error('This batch was already saved with different quantities or ticket. Refresh before recording another batch.'),{ status:409 });
                }
                await client.query('COMMIT');
                return res.json({ message:'Batch already saved',record_id:request.completed_record_id });
            }
        }
        if(request.request_type==='Production'&&req.body.entry_type) {
            const kernel=readInventoryQuantity(req.body.kernel_used);
            const products=['pko_produced','pkc_produced','sludge_produced'].map(key=>readInventoryQuantity(req.body[key]));
            if(!['Issue','Receive'].includes(req.body.entry_type)||
                (req.body.entry_type==='Issue'&&(!(kernel>0)||products.some(value=>value!==0)))||
                (req.body.entry_type==='Receive'&&(kernel!==0||products.filter(value=>value>0).length!==1||
                    (req.body.received_product&&(!['pko_produced','pkc_produced','sludge_produced'].includes(req.body.received_product)||
                     !(readInventoryQuantity(req.body[req.body.received_product])>0)))))) {
                throw Object.assign(new Error('Record a kernel issue or receive exactly one selected product per entry'),{status:400});
            }
        }
        if(req.body.kernel_test!==undefined&&request.request_type!=='Purchase') {
            throw Object.assign(new Error('Kernel sample tests can only accompany a kernel purchase receipt.'),{status:400});
        }
		const scaleTicket=String(req.body.scale_ticket||'').trim()||null;
		const vehicleNumber=String(req.body.vehicle_number||'').trim()||null;
		let completedRecordId;
		if(request.request_type==='Purchase') {
			const quantity=readInventoryQuantity(req.body.quantity);
			if(quantity===null||quantity<=0) throw Object.assign(new Error('Enter the received quantity using no more than two decimal places'),{ status:400 });
			const purchase=await client.query(`INSERT INTO purchases
				(purchase_date,supplier_id,item_id,quantity_supplied,unit_cost)
				VALUES ($1,$2,$3,$4,$5) RETURNING purchase_id`,
			[movementDate,request.supplier_id,request.item_id,quantity,request.unit_cost]);
			completedRecordId=purchase.rows[0].purchase_id;
            if(req.body.kernel_test!==undefined){
                await require('./kernel-impurity').saveReceiptKernelTest(client,completedRecordId,request.item_id,req.body.kernel_test,req.session.user_id);
            }
			await client.query(`INSERT INTO stock_counts
				(count_date,item_id,received,issued,source_type,source_id,source_part,recorded_by)
				VALUES ($1,$2,$3,0,'Purchase',$4,'Received',$5)`,
			[movementDate,request.item_id,quantity,requestId,req.session.user_id]);
			await client.query(`UPDATE weighing_requests SET quantity=$1 WHERE request_id=$2`,[quantity,requestId]);
		} else if(request.request_type==='Sale') {
			const quantity=readInventoryQuantity(req.body.quantity);
			if(quantity===null||quantity<=0) throw Object.assign(new Error('Enter the issued quantity using no more than two decimal places'),{ status:400 });
            // The driver signs for the weighed load before dispatch is confirmed, so no sale exists without a signature.
            const deliveryRules=require('./delivery-notes');
            const driverName=deliveryRules.name(req.body.driver_name,'the driver’s name');
            const driverSignature=deliveryRules.signature(req.body.driver_signature);
			const sale=await client.query(`WITH next_sale AS
				(SELECT nextval('sales_sales_id_seq') AS sales_id)
				INSERT INTO sales
				(sales_id,sales_date,customer_id,item_id,quantity,unit_price,due_date,invoice_number,billing_basis,factory_quantity)
				SELECT sales_id,$1,$2,$3,CASE WHEN $6='Customer' THEN 0 ELSE $4 END,$5,$1,
                CASE WHEN $6='Customer' THEN NULL ELSE 'INV-'||to_char($1::date,'YYYY')||'-'||lpad(sales_id::text,6,'0') END,$6,$4
				FROM next_sale RETURNING sales_id`,
			[movementDate,request.customer_id,request.item_id,quantity,request.unit_price,request.billing_basis]);
			completedRecordId=sale.rows[0].sales_id;
            await snapshotInvoice(client,completedRecordId);
            await client.query(`INSERT INTO delivery_notes(sales_id,representative_id,driver_name,driver_signature,driver_signed_at,driver_recorded_by)
                VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP,$5)`,[completedRecordId,request.representative_id||request.created_by,driverName,driverSignature,req.session.user_id]);
			await client.query(`INSERT INTO stock_counts
				(count_date,item_id,received,issued,source_type,source_id,source_part,recorded_by)
				VALUES ($1,$2,0,$3,'Sale',$4,'Issued',$5)`,
			[movementDate,request.item_id,quantity,requestId,req.session.user_id]);
			await client.query(`UPDATE weighing_requests SET quantity=$1 WHERE request_id=$2`,[quantity,requestId]);
		} else {
			const quantities={
				kernel_used: readInventoryQuantity(req.body.kernel_used),
				pko_produced: readInventoryQuantity(req.body.pko_produced),
				pkc_produced: readInventoryQuantity(req.body.pkc_produced),
				sludge_produced: readInventoryQuantity(req.body.sludge_produced)
			};
            if(Object.values(quantities).some(value => value===null||value<0)||
                !Object.values(quantities).some(value => value>0)) {
                throw Object.assign(new Error('Enter at least one positive batch quantity, using no more than two decimal places'),{ status:400 });
            }
            await client.query(`INSERT INTO production_batches
                (request_id,submission_key,kernel_used,pko_produced,pkc_produced,sludge_produced,scale_ticket,recorded_by,movement_date)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date)`,[requestId,req.body.submission_key,
                quantities.kernel_used,quantities.pko_produced,quantities.pkc_produced,quantities.sludge_produced,scaleTicket,req.session.user_id,movementDate]);
			const production=await client.query(`INSERT INTO production
				(production_date,kernel_used,pko_produced,pkc_produced,sludge_produced,production_hours,down_time)
				VALUES ($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT (production_date) DO UPDATE SET
                kernel_used=production.kernel_used+EXCLUDED.kernel_used,
                pko_produced=production.pko_produced+EXCLUDED.pko_produced,
                pkc_produced=production.pkc_produced+EXCLUDED.pkc_produced,
                sludge_produced=production.sludge_produced+EXCLUDED.sludge_produced
                RETURNING production_id`,
			[request.request_date,quantities.kernel_used,quantities.pko_produced,
				quantities.pkc_produced,quantities.sludge_produced,request.production_hours,request.down_time]);
			completedRecordId=production.rows[0].production_id;
			const itemRows=await client.query(`SELECT item_id,LOWER(name) AS name FROM items
				WHERE LOWER(name) IN ('p kernel','pko','pkc','sludge')`);
			const ids=Object.fromEntries(itemRows.rows.map(item => [item.name,item.item_id]));
			if(!ids['p kernel']||!ids.pko||!ids.pkc||!ids.sludge) throw new Error('Production inventory items are incomplete');
			const movements=[
				[ids['p kernel'],0,quantities.kernel_used,'Kernel Issued'],
				[ids.pko,quantities.pko_produced,0,'PKO Received'],
				[ids.pkc,quantities.pkc_produced,0,'PKC Received'],
				[ids.sludge,quantities.sludge_produced,0,'Sludge Received']
			];
			for(const movement of movements) {
				await client.query(`INSERT INTO stock_counts
					(count_date,item_id,received,issued,source_type,source_id,source_part,recorded_by)
					VALUES ($1,$2,$3,$4,'Production',$5,$6,$7)
                    ON CONFLICT (source_type,source_id,source_part) WHERE source_id IS NOT NULL
                    DO UPDATE SET received=stock_counts.received+EXCLUDED.received,
                    issued=stock_counts.issued+EXCLUDED.issued,recorded_by=EXCLUDED.recorded_by`,
				[movementDate,movement[0],movement[1],movement[2],requestId,movementPart(movement[3],movementDate,request.request_date),req.session.user_id]);
			}
			await client.query(`UPDATE weighing_requests SET kernel_used=COALESCE(kernel_used,0)+$1,pko_produced=COALESCE(pko_produced,0)+$2,
				pkc_produced=COALESCE(pkc_produced,0)+$3,sludge_produced=COALESCE(sludge_produced,0)+$4 WHERE request_id=$5`,
			[quantities.kernel_used,quantities.pko_produced,quantities.pkc_produced,quantities.sludge_produced,requestId]);
		}
		await client.query(`UPDATE weighing_requests SET status=CASE WHEN request_type='Production' THEN 'Awaiting Storekeeper' ELSE 'Completed' END,completed_by=$1,
			completed_record_id=$2,scale_ticket=$3,vehicle_number=$4,completed_at=CURRENT_TIMESTAMP
			WHERE request_id=$5`,
		[req.session.user_id,completedRecordId,scaleTicket,vehicleNumber,requestId]);
        await protectStock(client,before);
		await client.query('COMMIT');
		return res.json({ message: request.request_type==='Production'?'Production entry saved; daily totals and stock updated':request.request_type+' completed successfully',record_id: completedRecordId });
	} catch(error) {
		await client.query('ROLLBACK');
		console.error(error);
		return res.status(error.status||500).json({ err: error.status?error.message:'Could not complete the Storekeeper work' });
	} finally {
		client.release();
	}
});

// Handles POST /api/expenses requests.
// Accepts a running expense with a real date, short description and positive amount.
// Machines, tanks and other capital items are recorded in Assets and Start-up Costs instead.
function validExpense(expense) {
	const amount=readInventoryQuantity(expense?.amount_spent);
	return Boolean(expense)&&
		/^\d{4}-\d{2}-\d{2}$/.test(String(expense.expense_date||''))&&
		Number.isFinite(Date.parse(expense.expense_date+'T00:00:00Z'))&&
		expense.category==="Expenses"&&
		typeof expense.description==='string'&&
		expense.description.trim().length>0&&
		expense.description.length<=100&&
		amount!==null&&amount>0&&
		expenseSpreading(expense)!==null;
}

// Reads how many months an expense covers and how many of the first are start-up months (before production).
// Months it covers is entered with the Director's Add Rent or Prepaid Cost button or on Assets and Start-up Costs; start-up months only there.
// When a form leaves them out they are null and saved values are kept.
function expenseSpreading(expense) {
	const spread=expense.spread_months===undefined||expense.spread_months===''||expense.spread_months===null?null:Number(expense.spread_months);
	const startup=expense.startup_months===undefined||expense.startup_months===''||expense.startup_months===null?null:Number(expense.startup_months);
	if((spread!==null&&(!Number.isInteger(spread)||spread<1||spread>60))||(startup!==null&&(!Number.isInteger(startup)||startup<0||startup>(spread??60)))) return null;
	return { spread: spread,startup: startup };
}

app.post("/api/expenses",requireRole(['admin','manager']),async function(req,res) {
	const expense=req.body;
	if(!validExpense(expense)) {
		return res.status(400).json({
			err: "Check your inputs and try again"
		});
	}
	// Only the Director adds prepaid costs (rent, insurance spread over several months) and start-up costs.
	const spreading=expenseSpreading(expense);
	if(req.session.role!=='admin'&&((spreading.spread??1)>1||(spreading.startup??0)>0)) {
		return res.status(403).json({ err: "Only the Director can add prepaid or start-up costs" });
	}
	let submissionKey;
	try { submissionKey=readSubmissionKey(expense.submission_key); } catch(error) { return res.status(400).json({ err: error.message }); }
	// The same expense sent again (double tap or retry) returns the expense already saved.
	const returnSaved=async function() {
		const prior=(await pool.query('SELECT * FROM expenses WHERE submission_key=$1',[submissionKey])).rows[0];
		if(!prior) return false;
		if(Number(prior.amount_spent)!==Number(expense.amount_spent)||prior.description!==expense.description) {
			res.status(409).json({ err: 'This expense was already saved with different details. Refresh before recording another.' });
		} else res.status(200).json(prior);
		return true;
	};
	try {
		if(submissionKey&&await returnSaved()) return;
		const result=await pool.query(
			"INSERT INTO expenses(expense_date, category, description, amount_spent, spread_months, startup_months, submission_key) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
			[
				expense.expense_date,
				expense.category,
				expense.description,
				expense.amount_spent,
				spreading.spread??1,
				Math.min(spreading.startup??0,spreading.spread??1),
				submissionKey
			]
		);
		return res.status(201).json(result.rows[0]);
	} catch(err) {
		// Two copies sent at the same moment: the second hits the unique key and returns the first.
		if(err.code==='23505'&&submissionKey&&await returnSaved()) return;
		console.log(err);
		return res.status(500).json({
			err: "Could not submit expense. Internal server error"
		});
	}
});

// Calculates weighted inventory and production costs from transaction history.
async function calculateCosts(existingClient) {
    const costClient=existingClient||await pool.connect();
    try {
    if(!existingClient) await costClient.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
	const RawPurchasesRecords=await costClient.query(`
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
	const rawIssues=await costClient.query(`
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
    AND NOT (stock_counts.source_type='Production' AND EXISTS(SELECT 1 FROM production_batches pb
        WHERE pb.request_id=stock_counts.source_id))
    UNION ALL SELECT i.item_id,i.name,i.item_type,to_char(COALESCE(pb.movement_date,w.request_date),'YYYY-MM-DD'),
        pb.created_at,pb.kernel_used,'out',1 FROM production_batches pb
        JOIN weighing_requests w ON w.request_id=pb.request_id JOIN production p ON p.production_id=w.completed_record_id
        JOIN items i ON LOWER(i.name)='p kernel'
        WHERE NOT pb.voided AND w.status<>'Cancelled' AND pb.kernel_used>0
    `);

	const issues=rawIssues.rows;

	const RawProduction=await costClient.query(`
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
    2 AS event_order,NULL::integer AS batch_id,true AS legacy_batch
    FROM production WHERE NOT EXISTS(SELECT 1 FROM weighing_requests w JOIN production_batches pb ON pb.request_id=w.request_id
        WHERE w.request_type='Production' AND w.completed_record_id=production.production_id AND w.status<>'Cancelled')
    UNION ALL SELECT to_char(COALESCE(pb.movement_date,w.request_date),'YYYY-MM-DD'),pb.created_at,pb.kernel_used,pb.pko_produced,pb.pkc_produced,
        'produce',2,pb.batch_id,pb.legacy_batch FROM production_batches pb JOIN weighing_requests w ON w.request_id=pb.request_id
        JOIN production p ON p.production_id=w.completed_record_id WHERE NOT pb.voided AND w.status<>'Cancelled'
    `);

	const production=RawProduction.rows;
    const productItems=(await costClient.query("SELECT item_id,name FROM items WHERE LOWER(name) IN ('pko','pkc','sludge')")).rows;

	/*
	 * Storekeeper's finished-product records.
	 *
	 * received = quantity put into finished-product stock
	 * issued   = quantity dispatched or sold
	 */
	const RawProductStock=await costClient.query(`
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
    stock_counts.issued,stock_counts.source_type,stock_counts.source_id,stock_counts.adjustment_reason,
    EXISTS(SELECT 1 FROM weighing_requests w JOIN sales s ON s.sales_id=w.completed_record_id WHERE w.request_id=stock_counts.source_id AND stock_counts.source_type='Sale' AND s.invoice_number IS NULL) AS awaiting_invoice,
    (SELECT s.quantity FROM weighing_requests w JOIN sales s ON s.sales_id=w.completed_record_id WHERE w.request_id=stock_counts.source_id AND stock_counts.source_type='Sale'
        AND w.request_type='Sale' AND s.billing_basis='Customer' AND s.invoice_number IS NOT NULL) AS invoice_quantity
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

    // A Finish Day loss is costed on the production's last issue or receipt date, after all its products are weighed.
    const losses=(await costClient.query(`SELECT to_char(COALESCE((SELECT MAX(COALESCE(pb.movement_date,w.request_date)) FROM weighing_requests w
        JOIN production_batches pb ON pb.request_id=w.request_id AND NOT pb.voided
        WHERE w.request_type='Production' AND w.completed_record_id=production.production_id AND w.status<>'Cancelled'),production_date),'YYYY-MM-DD') AS date,
        process_loss AS quantity FROM production WHERE process_loss>0`)).rows;
    const costs=calculateContinuousCosts({purchases,issues,production,productStock,productItems,losses});
    if(!existingClient) await costClient.query('COMMIT');
	return costs;
    } catch(error) {if(!existingClient) await costClient.query('ROLLBACK');throw error;} finally {if(!existingClient)costClient.release();}
}

// Handles GET /api/average_cost requests.
app.get("/api/average_cost",requireRole(['admin']),async function(req,res) {
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

// Handles GET /api/dashboard requests.
app.get("/api/dashboard",requireRole(['admin','manager','storekeeper']),async function(req,res) {
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

		// Transforms collection entries into the required output shape.
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

// Handles GET /api/dashboard_period requests.
app.get("/api/dashboard_period",requireRole(['admin','manager']),async function(req,res) {
	try {
		const selectedDate=req.query.date;
		const datesql=selectedDate? "$1::date":"CURRENT_DATE";
		const param=selectedDate? [selectedDate]:[];

		const yieldStates=(await pool.query(`SELECT
            EXISTS(SELECT 1 FROM weighing_requests WHERE request_type='Production' AND status='Awaiting Storekeeper' AND request_date=${datesql}) AS day,
            EXISTS(SELECT 1 FROM weighing_requests WHERE request_type='Production' AND status='Awaiting Storekeeper' AND request_date>=date_trunc('week',${datesql}) AND request_date<date_trunc('week',${datesql})+INTERVAL '7 days') AS week,
            EXISTS(SELECT 1 FROM weighing_requests WHERE request_type='Production' AND status='Awaiting Storekeeper' AND request_date>=date_trunc('month',${datesql}) AND request_date<date_trunc('month',${datesql})+INTERVAL '1 month') AS month`,param)).rows[0];
		const RawProduction=await pool.query(
			`
        SELECT
        'day' AS period,
        COALESCE(SUM(production.kernel_used), 0) AS kernel_used,
        COALESCE(SUM(production.pko_produced), 0) AS pko_produced,
        COALESCE(SUM(production.pkc_produced), 0) AS pkc_produced,
        COALESCE(SUM(production.process_loss), 0) AS production_loss,
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
        COALESCE(SUM(production.process_loss), 0),
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
        COALESCE(SUM(production.process_loss), 0),
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

		const RawSludgeProduction=await pool.query(
			`SELECT 'day' AS period,COALESCE(SUM(production.sludge_produced),0) AS sludge_produced
			FROM production
			WHERE production.production_date=${datesql}
			UNION ALL
			SELECT 'week',COALESCE(SUM(production.sludge_produced),0)
			FROM production
			WHERE production.production_date>=date_trunc('week',${datesql})
			AND production.production_date<date_trunc('week',${datesql})+INTERVAL '7 days'
			UNION ALL
			SELECT 'month',COALESCE(SUM(production.sludge_produced),0)
			FROM production
			WHERE production.production_date>=date_trunc('month',${datesql})
			AND production.production_date<date_trunc('month',${datesql})+INTERVAL '1 month'`,
			param
		);
		const sludgeProductionByPeriod=Object.fromEntries(
			RawSludgeProduction.rows.map(row => [row.period,Number(row.sludge_produced)])
		);

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

		// One-off expenses count on their date. A spread expense (rent, insurance) counts an equal share in each month it covers,
		// shared across that month's days; its first start-up months are reported as start-up costs.
		const rawExpenses=await pool.query(
			`WITH spread AS (
            SELECT expenses.amount_spent/expenses.spread_months AS share,
                (date_trunc('month',expenses.expense_date)+make_interval(months=>covered.month))::date AS month_start,
                covered.month<expenses.startup_months AS startup
            FROM expenses CROSS JOIN LATERAL generate_series(0,expenses.spread_months-1) AS covered(month)
            WHERE expenses.category IN ('Expense', 'Expenses') AND expenses.spread_months>1
        ), period_days AS (
            SELECT 'day'::text AS period,${datesql}::date AS day
            UNION ALL SELECT 'week',day_value::date FROM generate_series(date_trunc('week',${datesql}),date_trunc('week',${datesql})+INTERVAL '6 days',INTERVAL '1 day') AS day_value
            UNION ALL SELECT 'month',day_value::date FROM generate_series(date_trunc('month',${datesql}),date_trunc('month',${datesql})+INTERVAL '1 month - 1 day',INTERVAL '1 day') AS day_value
        ), daily AS (
            SELECT period_days.period,expenses.amount_spent AS amount,expenses.startup_months>0 AS startup,false AS spread
            FROM period_days JOIN expenses ON expenses.expense_date=period_days.day
            WHERE expenses.category IN ('Expense', 'Expenses') AND expenses.spread_months=1
            UNION ALL
            SELECT period_days.period,spread.share/EXTRACT(day FROM (spread.month_start+INTERVAL '1 month - 1 day')),spread.startup,true
            FROM period_days JOIN spread ON spread.month_start=date_trunc('month',period_days.day)::date
        )
        SELECT periods.period,
            COALESCE((SELECT SUM(amount) FROM daily WHERE daily.period=periods.period AND NOT daily.startup),0) AS total_spent,
            COALESCE((SELECT SUM(amount) FROM daily WHERE daily.period=periods.period AND daily.startup),0) AS startup_spent,
            COALESCE((SELECT SUM(amount) FROM daily WHERE daily.period=periods.period AND daily.spread AND NOT daily.startup),0) AS spread_spent
        FROM (VALUES ('day'),('week'),('month')) AS periods(period)`,
			param
		);
		const expenses=rawExpenses.rows;

		const rawPayroll=await pool.query(
			`SELECT 'day' AS period,
			COALESCE((SELECT SUM(total_salary_cost) FROM payroll
			WHERE payroll_month=date_trunc('month',${datesql})::date),0)
			/EXTRACT(day FROM (date_trunc('month',${datesql})+INTERVAL '1 month - 1 day')) AS payroll_cost
			UNION ALL
			SELECT 'week',COALESCE(SUM(
				(SELECT COALESCE(SUM(total_salary_cost),0) FROM payroll
				 WHERE payroll_month=date_trunc('month',day_value)::date)
				/EXTRACT(day FROM (date_trunc('month',day_value)+INTERVAL '1 month - 1 day'))
			),0)
			FROM generate_series(
				date_trunc('week',${datesql}),
				date_trunc('week',${datesql})+INTERVAL '6 days',
				INTERVAL '1 day'
			) AS day_value
			UNION ALL
			SELECT 'month',COALESCE(SUM(total_salary_cost),0)
			FROM payroll WHERE payroll_month=date_trunc('month',${datesql})::date`,
			param
		);
		const payrollByPeriod=Object.fromEntries(
			rawPayroll.rows.map(row => [row.period,Number(row.payroll_cost)||0])
		);

		const output={};

		// Processes each entry in the collection.
		production.forEach(row => {
			output[row.period]={
				production: {
					kernel_used: Number(row.kernel_used),
					pko_produced: Number(row.pko_produced),
					pkc_produced: Number(row.pkc_produced),
						sludge_produced: sludgeProductionByPeriod[row.period]||0,
                    // Kernel not recovered as weighed product, recorded at Finish Day for each production date.
                    production_loss: Number(row.production_loss),
					oil_yield: Number(row.oil_yield),
                        yield_status: yieldStates[row.period]?'Provisional':'Final'
				},
				sales: {},
				expenses: {},
				payroll_cost: payrollByPeriod[row.period]||0
			};
		});
		// Processes each entry in the collection.
		sales.forEach(row => {
			output[row.period].sales[row.name]={
				quantity_sold: Number(row.quantity_sold),
				average_unit_price: Number(row.average_unit_price),
				total_sales: Number(row.total_sales)
			};
		});

		// Processes each entry in the collection.
		expenses.forEach(row => {
			output[row.period].expenses={
				total_expenses: Number(row.total_spent),
				startup_costs: Number(row.startup_spent),
				// The part of total_expenses that comes from rent and other payments spread over several months.
				spread_expenses: Number(row.spread_spent)
			};
		});

		if(req.session.role!=='admin') {
			Object.values(output).forEach(period => {
				delete period.expenses;
				delete period.payroll_cost;
			});
			return res.status(200).json(output);
		}

		const costs=await calculateCosts();
		// Only invoiced goods are cost of goods sold; customer-weight shortfalls and manual write-offs are shown as losses.
		const invoicedShare=dispatch => dispatch.invoice_quantity===null||!dispatch.quantity_dispatched?1:
			Math.min(Math.max(dispatch.invoice_quantity/dispatch.quantity_dispatched,0),1);
		const businessDispatches=costs.product_dispatch_costs.filter(dispatch => dispatch.source_type!=='Manual');
		const dispatchPeriods=calculateDispatchPeriods(
			businessDispatches.map(dispatch => ({...dispatch,cost_of_dispatch:dispatch.cost_of_dispatch*invoicedShare(dispatch)})),
			selectedDate
		);
		const shortfallPeriods=calculateDispatchPeriods(
			businessDispatches.map(dispatch => ({...dispatch,cost_of_dispatch:dispatch.cost_of_dispatch*(1-invoicedShare(dispatch))})),
			selectedDate
		);
		const stockLossPeriods=Object.fromEntries(stockAdjustmentReasons.map(reason => [reason,calculateDispatchPeriods(
			costs.product_dispatch_costs.filter(dispatch => dispatch.source_type==='Manual'&&(dispatch.adjustment_reason||'Other')===reason),
			selectedDate
		)]));
		output.day.cost_of_goods_sold=dispatchPeriods.day;

		output.week.cost_of_goods_sold=dispatchPeriods.week;

		output.month.cost_of_goods_sold=dispatchPeriods.month;

        const lossPeriods=calculateDispatchPeriods(costs.production_in_progress.map(day=>({
            dispatch_date:day.date,name:'PKO',cost_of_dispatch:day.loss_cost
        })),selectedDate);
		const periodGrossProfit={};
		for(let period in output) {
			const pkcPeriodSales=output[period].sales.PKC?.total_sales||0;
			const pkoPeriodSales=output[period].sales.PKO?.total_sales||0;
			const sludgePeriodSales=output[period].sales.Sludge?.total_sales||0;
			const periodExpenses=output[period].expenses.total_expenses+output[period].expenses.startup_costs;
			const periodPayroll=output[period].payroll_cost;
            const lossCost=lossPeriods[period].pko;
            output[period].production_loss_cost=lossCost;
            const periodTotal=periods => periods[period].pko+periods[period].pkc+periods[period].sludge;
            const shortfallCost=periodTotal(shortfallPeriods);
            output[period].delivery_shortfall_cost=shortfallCost;
            output[period].stock_loss_costs=Object.fromEntries(stockAdjustmentReasons.map(reason => [reason,periodTotal(stockLossPeriods[reason])]));
            const stockLossCost=Object.values(output[period].stock_loss_costs).reduce((total,cost) => total+cost,0);
            output[period].stock_loss_cost=stockLossCost;
            output[period].costing_provisional=true;
			const pkoPeriodCost=output[period].cost_of_goods_sold.pko;
			const pkcPeriodCost=output[period].cost_of_goods_sold.pkc;
			const sludgePeriodCost=output[period].cost_of_goods_sold.sludge;
			const pkoGrossProfit=pkoPeriodSales-pkoPeriodCost;
			const pkcGrossProfit=pkcPeriodSales-pkcPeriodCost;
			const sludgeGrossProfit=sludgePeriodSales-sludgePeriodCost;
			periodGrossProfit[period]={
				pko: pkoGrossProfit,
				pkc: pkcGrossProfit,
				sludge: sludgeGrossProfit
			};
			output[period].period_gross_profit=periodGrossProfit[period];
			const totalNetProfit=
				pkoGrossProfit+pkcGrossProfit+sludgeGrossProfit-
				shortfallCost-stockLossCost-periodExpenses-periodPayroll-lossCost;
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

// Groups product dispatch costs into reporting periods around the selected date.
function calculateDispatchPeriods(productDispatchCosts,selectedDate) {
	const selected=new Date(selectedDate+"T00:00:00");
	const weekStart=new Date(selected);
	weekStart.setDate(selected.getDate()-((selected.getDay()+6)%7));
	const weekEnd=new Date(weekStart);
	weekEnd.setDate(weekStart.getDate()+7);

	const dispatchPeriods={
		day: {
			pko: 0,
			pkc: 0,
			sludge: 0
		},
		week: {
			pko: 0,
			pkc: 0,
			sludge: 0
		},
		month: {
			pko: 0,
			pkc: 0,
			sludge: 0
		}
	};
	// Processes each entry in the collection.
	productDispatchCosts.forEach(dispatch => {
        if(dispatch.awaiting_invoice)return;
		const product=String(dispatch.name).trim().toLowerCase();
		if(!["pko","pkc","sludge"].includes(product)) {
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

// Calculates inventory consistency checks from production, purchase, and sales data.
async function calculateChecks() {
    const result=await pool.query(`WITH expected AS (
        SELECT w.request_id,'Purchase'::text AS source_type,'Received'::text AS source_part,p.purchase_date AS day,
            p.item_id,p.quantity_supplied AS received,0::numeric AS issued,'purchases'::text AS related_source
        FROM purchases p JOIN weighing_requests w ON w.request_type='Purchase' AND w.completed_record_id=p.purchase_id AND w.status<>'Cancelled'
        UNION ALL SELECT w.request_id,'Sale','Issued',s.sales_date,s.item_id,0,COALESCE(s.factory_quantity,s.quantity),'sales'
        FROM sales s JOIN weighing_requests w ON w.request_type='Sale' AND w.completed_record_id=s.sales_id AND w.status<>'Cancelled'
        UNION ALL SELECT w.request_id,'Production',
            v.part||CASE WHEN d.day=w.request_date THEN '' ELSE '@'||to_char(d.day,'YYYY-MM-DD') END,
            d.day,i.item_id,v.received,v.issued,'production'
        FROM production p JOIN weighing_requests w ON w.request_type='Production' AND w.completed_record_id=p.production_id AND w.status<>'Cancelled'
        CROSS JOIN LATERAL (
            SELECT COALESCE(pb.movement_date,w.request_date) AS day,SUM(pb.kernel_used) AS kernel_used,
                SUM(pb.pko_produced) AS pko_produced,SUM(pb.pkc_produced) AS pkc_produced,SUM(pb.sludge_produced) AS sludge_produced
            FROM production_batches pb WHERE pb.request_id=w.request_id AND NOT pb.voided
            GROUP BY COALESCE(pb.movement_date,w.request_date)
            UNION ALL SELECT p.production_date,p.kernel_used,p.pko_produced,p.pkc_produced,p.sludge_produced
            WHERE NOT EXISTS(SELECT 1 FROM production_batches pb WHERE pb.request_id=w.request_id)
        ) d
        CROSS JOIN LATERAL (VALUES ('p kernel','Kernel Issued',0::numeric,d.kernel_used),
            ('pko','PKO Received',d.pko_produced,0),('pkc','PKC Received',d.pkc_produced,0),('sludge','Sludge Received',d.sludge_produced,0)) v(name,part,received,issued)
        JOIN items i ON LOWER(i.name)=v.name
    ) SELECT to_char(COALESCE(e.day,sc.count_date),'YYYY-MM-DD') AS check_date,
        COALESCE(i.name,actual_item.name) AS item,COALESCE(e.related_source,CASE sc.source_type WHEN 'Purchase' THEN 'purchases' WHEN 'Sale' THEN 'sales' ELSE 'production' END) AS related_source,
        CASE WHEN e.source_type='Purchase' THEN LOWER(i.name)||'_received_vs_purchased'
             WHEN e.source_type='Sale' THEN LOWER(i.name)||'_issued_vs_sold'
             WHEN e.source_part LIKE 'Kernel Issued%' THEN 'kernel_issued_vs_used' ELSE LOWER(i.name)||'_received_vs_produced' END AS check_type,
        COALESCE(sc.received,0)+COALESCE(sc.issued,0) AS storekeeper_says,
        COALESCE(e.received,0)+COALESCE(e.issued,0) AS manager_says,
        COALESCE(sc.received,0)+COALESCE(sc.issued,0)-COALESCE(e.received,0)-COALESCE(e.issued,0) AS difference,
        e.request_id,CASE WHEN sc.item_id IS DISTINCT FROM e.item_id THEN 'Item or stock entry does not match'
            WHEN sc.count_date IS DISTINCT FROM e.day THEN 'Inventory date does not match' ELSE 'Quantity does not match' END AS detail
        FROM expected e FULL JOIN (SELECT * FROM stock_counts WHERE source_type<>'Manual') sc
            ON sc.source_id=e.request_id AND sc.source_type=e.source_type AND sc.source_part=e.source_part
        LEFT JOIN items i ON i.item_id=e.item_id LEFT JOIN items actual_item ON actual_item.item_id=sc.item_id
        WHERE ((e.request_id IS NULL AND sc.received+sc.issued<>0) OR COALESCE(sc.received,0)<>e.received OR COALESCE(sc.issued,0)<>e.issued
            OR (e.request_id IS NOT NULL AND sc.count_id IS NOT NULL AND (sc.item_id<>e.item_id OR sc.count_date<>e.day))
            OR (sc.count_id IS NULL AND e.received+e.issued>0))
        ORDER BY check_date,item`);
    return result.rows;
}

// Handles GET /api/checks requests.
app.get("/api/checks",requireRole(['admin']),async function(req,res) {
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

// Handles GET /api/correction requests.
app.get("/api/correction",requireRole(['admin']),async function(req,res) {
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

require('./batch-corrections')(app,pool,requireRole);
require('./legacy-links')(app,pool,requireRole);

// Handles PATCH /api/correction_edit requests.
app.patch("/api/correction_edit",requireRole(['admin']),async function(req,res) {
	try {
		const kind=req.body.kind;
		const record=req.body.record;

        if(kind==='stock') {
            const corrected=await correctManualStock(pool,record,'edit',req.session.user_id);
            return res.json(corrected);
        }
        if(['purchases','sales','production'].includes(kind)) {
            const corrected=await correctRecord(pool,kind,record,'edit',req.session.user_id);
            return res.status(200).json(corrected);
        }

		let updated;

		if(kind==='expenses') {
			if(!validExpense(record)) {
				return res.status(400).json({ err: "Check the expense date, category, description and amount. Record capital items in Assets and Start-up Costs." });
			}
			if(await expenseFromPartnerPayment(record.expense_id)) {
				return res.status(409).json({ err: "This expense comes from a payment to a partner. Correct it under Other Partners." });
			}
			updated=await pool.query(
				`UPDATE expenses
				SET expense_date = $1::date,
			     category = $2,
				 description = $3,
				 amount_spent = $4,
				 spread_months = COALESCE($6::integer,spread_months),
				 startup_months = LEAST(COALESCE($7::integer,startup_months),COALESCE($6::integer,spread_months))
				 WHERE expense_id = $5
				 returning *`,
				[
					record.expense_date,
					record.category,
					record.description,
					record.amount_spent,
					record.expense_id,
					expenseSpreading(record).spread,
					expenseSpreading(record).startup

				]
			)

		}
		else {
			return res.status(400).json({
				err: "Invalid record type"
			});
		}

        if(!updated.rowCount) return res.status(409).json({ err:'Record not found or generated inventory cannot be edited directly; edit its source purchase, sale or production instead' });
		return res.status(200).json(updated.rows[0]);
	} catch(error) {
		console.log(error);

		return res.status(error.status||500).json({
			err: error.status?error.message:"Could not update record"
		});
	}
});

// Expenses created by a partner payment are corrected through that payment, so each cost is entered once.
async function expenseFromPartnerPayment(expenseId) {
	const linked=await pool.query('SELECT 1 FROM partner_payments WHERE expense_id=$1',[Number(expenseId)||0]);
	return linked.rowCount>0;
}

// Handles DELETE /api/correction_delete requests.
app.delete("/api/correction_delete",requireRole(['admin']),async function(req,res) {
	try {
		const kind=req.body.kind;
		const record=req.body.record;
        if(kind==='stock') {
            const corrected=await correctManualStock(pool,record,'delete',req.session.user_id);
            return res.json({message:'Record deleted successfully'});
        }
        if(['purchases','sales','production'].includes(kind)) {
            await correctRecord(pool,kind,record,'delete');
            return res.status(200).json({ message:'Record deleted successfully' });
        }

		let deleted;

		if(kind==='expenses') {
			if(await expenseFromPartnerPayment(record.expense_id)) {
				return res.status(409).json({ err: "This expense comes from a payment to a partner. Delete the payment under Other Partners instead." });
			}
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
				err: "Record not found or generated inventory cannot be deleted directly; delete its source purchase, sale or production instead"
			});
		}

		return res.status(200).json({
			message: "Record deleted successfully"
		});
	} catch(error) {
		console.log(error);
		return res.status(error.status||500).json({
			err: error.status?error.message:"Could not delete record"
		});
	}
});


// Allows authenticated API requests to continue and rejects unauthenticated requests.
function requireLogin(req,res,next) {
	if(!req.session.user_id) {
		return res.status(401).json({
			message: 'login required'
		})
	}
	next();
}

// Allows only users whose saved account role appears in the supplied list.
function requireRole(allowedRoles) {
	return async function(req,res,next) {
		try {
			const result=await pool.query(
				'SELECT username,role FROM users WHERE user_id=$1',
				[req.session.user_id]
			);
			if(result.rowCount===0) {
				return res.status(401).json({ message: 'Login required' });
			}
			req.session.user_name=result.rows[0].username;
			req.session.role=result.rows[0].role;
		} catch(error) {
			console.error(error);
			return res.status(500).json({ message: 'Could not check account access' });
		}

		if(!allowedRoles.includes(req.session.role)) {
			return res.status(403).json({
				message: 'Access denied'
			});
		}
		next();
	};
}

// Serves protected pages only to authenticated users.
function requirePageLogin(req,res,next) {
	if(!req.session.user_id) {
		return res.redirect('/')
	}
	next()
}

// Opens a protected page only for the listed account roles.
function requirePageRole(allowedRoles) {
	return async function(req,res,next) {
		if(!req.session.user_id) {
			return res.redirect('/');
		}
		try {
			const result=await pool.query(
				'SELECT role FROM users WHERE user_id=$1',
				[req.session.user_id]
			);
			if(result.rowCount===0) {
				return res.redirect('/');
			}
			req.session.role=result.rows[0].role;
			if(!allowedRoles.includes(req.session.role)) {
				return res.redirect('/index.html');
			}
			next();
		} catch(error) {
			console.error(error);
			return res.redirect('/');
		}
	};
}

// Handles GET /api/current-user requests.
app.get('/api/current-user',requireLogin,async function(req,res) {
	try {
		const result=await pool.query(
			'SELECT username,role FROM users WHERE user_id=$1',
			[req.session.user_id]
		);
		if(result.rowCount===0) {
			return res.status(401).json({ message: 'Login required' });
		}
		req.session.user_name=result.rows[0].username;
		req.session.role=result.rows[0].role;
		return res.json({
			...result.rows[0],
			switched_from_admin: Boolean(req.session.admin_user_id)
		});
	} catch(error) {
		console.error(error);
		return res.status(500).json({ message: 'Could not load the current user' });
	}
});

// Returns the login accounts that an administrator can manage.
app.get('/api/users',requireRole(['admin']),async function(req,res) {
	try {
		const result=await pool.query(
			`SELECT user_id,username,role,created_at
			FROM users
			ORDER BY username`
		);
		return res.status(200).json(result.rows);
	} catch(error) {
		console.error(error);
		return res.status(500).json({
			err: 'Could not load user accounts'
		});
	}
});

// Creates a login account and stores only a protected copy of its password.
app.post('/api/users',requireRole(['admin']),async function(req,res) {
	const username=String(req.body.username||'').trim().toLowerCase();
	const password=String(req.body.password||'');
	const role=String(req.body.role||'').trim().toLowerCase();

	if(!username||!password||!role) {
		return res.status(400).json({
			err: 'Username, password and role are required'
		});
	}
	if(!/^[a-z0-9._-]+$/.test(username)) {
		return res.status(400).json({
			err: 'Username can contain letters, numbers, dots, underscores and hyphens only'
		});
	}
	if(password.length<8) {
		return res.status(400).json({
			err: 'Password must contain at least 8 characters'
		});
	}

	try {
		const passwordHash=await argon2.hash(password);
		const result=await pool.query(
			`INSERT INTO users (username,password_hash,role)
			VALUES ($1,$2,$3)
			RETURNING user_id,username,role,created_at`,
			[username,passwordHash,role]
		);
		return res.status(201).json(result.rows[0]);
	} catch(error) {
		if(error.code==='23505') {
			return res.status(409).json({
				err: 'That username already exists'
			});
		}
		console.error(error);
		return res.status(500).json({
			err: 'Could not create the user account'
		});
	}
});

// Updates an existing login account and changes its password only when supplied.
app.patch('/api/users/:id',requireRole(['admin']),async function(req,res) {
	const userId=Number(req.params.id);
	const username=String(req.body.username||'').trim().toLowerCase();
	const password=String(req.body.password||'');
	const role=String(req.body.role||'').trim().toLowerCase();

	if(!Number.isInteger(userId)||userId<1||!username||!role) {
		return res.status(400).json({ err: 'Valid user details are required' });
	}
	if(!/^[a-z0-9._-]+$/.test(username)) {
		return res.status(400).json({
			err: 'Username can contain letters, numbers, dots, underscores and hyphens only'
		});
	}
	if(password&&password.length<8) {
		return res.status(400).json({
			err: 'Password must contain at least 8 characters'
		});
	}
	if(userId===req.session.user_id&&role!=='admin') {
		return res.status(400).json({
			err: 'You cannot remove your own administrator access'
		});
	}

	try {
		let result;
		if(password) {
			const passwordHash=await argon2.hash(password);
			result=await pool.query(
				`UPDATE users
				SET username=$1,password_hash=$2,role=$3
				WHERE user_id=$4
				RETURNING user_id,username,role,created_at`,
				[username,passwordHash,role,userId]
			);
		} else {
			result=await pool.query(
				`UPDATE users
				SET username=$1,role=$2
				WHERE user_id=$3
				RETURNING user_id,username,role,created_at`,
				[username,role,userId]
			);
		}

		if(result.rowCount===0) {
			return res.status(404).json({ err: 'User account was not found' });
		}
		if(userId===req.session.user_id) {
			req.session.user_name=result.rows[0].username;
			req.session.role=result.rows[0].role;
		} else {
			await pool.query(
				"DELETE FROM session WHERE sess->>'user_id'=$1",
				[String(userId)]
			);
		}
		return res.status(200).json(result.rows[0]);
	} catch(error) {
		if(error.code==='23505') {
			return res.status(409).json({
				err: 'That username already exists'
			});
		}
		console.error(error);
		return res.status(500).json({ err: 'Could not update the user account' });
	}
});

// Deletes a login account while preventing an administrator from deleting their own account.
app.delete('/api/users/:id',requireRole(['admin']),async function(req,res) {
	const userId=Number(req.params.id);
	if(!Number.isInteger(userId)||userId<1) {
		return res.status(400).json({ err: 'A valid user is required' });
	}
	if(userId===req.session.user_id) {
		return res.status(400).json({
			err: 'You cannot delete the account you are currently using'
		});
	}

	const client=await pool.connect();
	try {
		await client.query('BEGIN');
		const selected=await client.query(
			'SELECT role FROM users WHERE user_id=$1 FOR UPDATE',
			[userId]
		);
		if(selected.rowCount===0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ err: 'User account was not found' });
		}
		if(selected.rows[0].role==='admin') {
			const admins=await client.query(
				"SELECT COUNT(*)::integer AS total FROM users WHERE role='admin'"
			);
			if(admins.rows[0].total<=1) {
				await client.query('ROLLBACK');
				return res.status(400).json({
					err: 'The final administrator account cannot be deleted'
				});
			}
		}

		await client.query(
			"DELETE FROM session WHERE sess->>'user_id'=$1",
			[String(userId)]
		);
		await client.query('DELETE FROM users WHERE user_id=$1',[userId]);
		await client.query('COMMIT');
		return res.status(200).json({ message: 'User account deleted' });
	} catch(error) {
		await client.query('ROLLBACK');
		console.error(error);
		if(error.code==='23503') return res.status(409).json({ err:'This account is referenced by business records and cannot be deleted without losing its audit history' });
		return res.status(500).json({ err: 'Could not delete the user account' });
	} finally {
		client.release();
	}
});

// Lets an administrator temporarily use an existing manager or storekeeper account.
app.post('/api/switch-account',requireRole(['admin']),async function(req,res) {
	const targetUserId=Number(req.body.user_id);
	if(!Number.isInteger(targetUserId)||targetUserId<1) {
		return res.status(400).json({ message: 'Choose an account' });
	}
	try {
		const result=await pool.query(
			`SELECT user_id,username,role
			FROM users
			WHERE user_id=$1 AND role IN ('manager','storekeeper')`,
			[targetUserId]
		);
		if(result.rowCount===0) {
			return res.status(404).json({
				message: 'Manager or storekeeper account not found'
			});
		}

		const target=result.rows[0];
		req.session.admin_user_id=req.session.user_id;
		req.session.user_id=target.user_id;
		req.session.user_name=target.username;
		req.session.role=target.role;
		req.session.save(function(error) {
			if(error) {
				console.error(error);
				return res.status(500).json({ message: 'Could not switch account' });
			}
			return res.json({
				message: 'Account switched successfully',
				username: target.username,
				role: target.role
			});
		});
	} catch(error) {
		console.error(error);
		return res.status(500).json({ message: 'Could not switch account' });
	}
});

// Restores the administrator who started the temporary account switch.
app.post('/api/return-to-admin',async function(req,res) {
	const adminUserId=Number(req.session.admin_user_id);
	if(!Number.isInteger(adminUserId)||adminUserId<1) {
		return res.status(403).json({ message: 'No administrator account to return to' });
	}
	try {
		const result=await pool.query(
			`SELECT user_id,username,role
			FROM users
			WHERE user_id=$1 AND role='admin'`,
			[adminUserId]
		);
		if(result.rowCount===0) {
			return res.status(403).json({ message: 'Administrator account not found' });
		}

		const admin=result.rows[0];
		req.session.user_id=admin.user_id;
		req.session.user_name=admin.username;
		req.session.role=admin.role;
		delete req.session.admin_user_id;
		req.session.save(function(error) {
			if(error) {
				console.error(error);
				return res.status(500).json({ message: 'Could not return to admin' });
			}
			return res.json({ message: 'Returned to administrator account' });
		});
	} catch(error) {
		console.error(error);
		return res.status(500).json({ message: 'Could not return to admin' });
	}
});

// Handles POST /api/logout requests.
app.post('/api/logout',(req,res) => {
	// Completes the response after attempting to destroy the session.
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

// Handles POST /api/customers requests.
app.post('/api/customers',requireRole(['admin','manager']),function(req,res) {
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
app.post('/api/suppliers',requireRole(['admin','manager']),function(req,res) {
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
app.get('/api/customers-purchases',requireRole(['admin','manager','storekeeper']),async function(req,res) {
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

// Handles GET /api/supplier-supplies requests.
app.get('/api/supplier-supplies',requireRole(['admin','manager','storekeeper']),async function(req,res) {
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

if(require.main===module) {
	app.listen(PORT,() => {
		console.log(`Server running at http://localhost:${PORT}`);
		// Opens two connections now, so the first page after a restart does not wait for them.
		refreshDatabaseAddress().then(() => Promise.all([pool.query('SELECT 1'),pool.query('SELECT 1')])).catch(error => console.error("Database warm-up failed:",error.message));
	});
}

module.exports={ app,pool,calculateCosts,calculateChecks };

