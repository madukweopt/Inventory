// The web server: security headers, sessions, pages and static files, and where each group of API routes is mounted.
// The API routes themselves live in backend/routes, one file per area; shared helpers are in backend/db.js
// (database connection), backend/auth.js (sign-in and role checks), backend/uploads.js (photos and logos)
// and backend/record-rules.js (reading entered values).
require("dotenv").config();
const express=require("express");
const path=require("path");
const {pool,refreshDatabaseAddress}=require('./db');
const {requireLogin,requireRole,requirePageLogin,requirePageRole}=require('./auth');
const {publicDirectory,htmlDirectory,employeePhotosDirectory,companyLogosDirectory}=require('./uploads');
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

const session=require('express-session');
const pgSession=require('connect-pg-simple')(session);

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

// Every successful save, edit or delete is written to the Activity Log (Data → Activity Log, Director only).
require('./activity-log').registerActivityLog(app,pool,requireRole);

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

// Installable app: its details (name, icon, colour), the background helper and the "You're offline" page.
// The helper is served from the site root so it covers every page, and is always re-checked so updates arrive.
app.get('/manifest.webmanifest',function(req,res) {
	res.type('application/manifest+json').sendFile(path.join(publicDirectory,'manifest.webmanifest'));
});
app.get('/service-worker.js',function(req,res) {
	res.set('Cache-Control','no-cache').sendFile(path.join(publicDirectory,'service-worker.js'));
});
app.get('/offline.html',function(req,res) {
	res.sendFile(path.join(htmlDirectory,'offline.html'));
});

// Tells the browser whether development-only debugging tools may be loaded.
app.get('/debug-settings',function(req,res) {
	return res.json({
		enabled: debugToolsEnabled
	});
});

// Sign-in comes before the check below that every other /api request is signed in.
const loginRoutes=require('./routes/login');
app.use(loginRoutes.router);
const {failedLogins,pruneFailedLogins}=loginRoutes;

app.use('/api',requireLogin);

// The rest of the API, one file per area in backend/routes. None of these routes can answer the same request as another.
app.use(require('./routes/prices').router);
app.use(require('./routes/parties').router);
app.use(require('./routes/staff').router);
app.use(require('./routes/company').router);
app.use(require('./routes/sales').router);
app.use(require('./routes/purchases').router);
app.use(require('./routes/stock').router);
app.use(require('./routes/weighing').router);
app.use(require('./routes/expenses').router);
app.use(require('./routes/corrections').router);
app.use(require('./routes/accounts').router);
const reportRoutes=require('./routes/reports');
app.use(reportRoutes.router);
const {calculateCosts,calculateChecks}=reportRoutes;

// Routes kept in their own files from before.
require('./delivery-notes').registerDeliveryNotes(app,pool,requireRole);
// Other partners and the capital asset register; capital spending never reduces profit.
require('./partners').registerPartners(app,pool,requireRole);

require('./kernel-impurity').registerKernelImpurity(app,pool,requireRole);

require('./consumable-checks').registerConsumableChecks(app,pool,requireRole);

if(require.main===module) {
	// New database changes in database/migrations are applied before the server takes any request. If one fails
	// the server does not start, so it never runs against a half-updated database.
	require('./migrations').migrate(pool,{ log: message => console.log(message) }).then(result => {
		if(result.created) console.log('Database created from database/schema.sql.');
		else if(result.applied.length) console.log('Applied '+result.applied.length+' database change(s).');
		app.listen(PORT,() => {
			console.log(`Server running at http://localhost:${PORT}`);
			// Opens two connections now, so the first page after a restart does not wait for them.
			refreshDatabaseAddress().then(() => Promise.all([pool.query('SELECT 1'),pool.query('SELECT 1')])).catch(error => console.error("Database warm-up failed:",error.message));
		});
	}).catch(error => {
		console.error('The server did not start: '+error.message);
		process.exit(1);
	});
}

module.exports={ app,pool,calculateCosts,calculateChecks,failedLogins,pruneFailedLogins };

