// The database connection pool shared by the whole server. Moved from server.js unchanged.
const { Pool,Client }=require("pg");
const { parse: parseConnectionString }=require("pg-connection-string");
const dns=require("dns");
const net=require("net");

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
	// An IPv4 address is chosen whenever the database has one: some phone networks cannot reach IPv6 addresses
	// (connect ENETUNREACH), even when the lookup returns one first.
	databaseLookup??=dns.promises.lookup(databaseHost,{all:true})
		.then(results => { databaseAddress=(results.find(result => result.family===4)||results[0])?.address||null; })
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
		// With secure connections off (the automatic test runs' temporary database) no SSL settings are added.
		super({ ...settings,...rest,host: address,ssl: rest.ssl?{ ...rest.ssl,servername: databaseHost }:false });
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
	ssl: require('./database-ssl').databaseSsl(),
	idleTimeoutMillis: 4*60*1000,
	keepAlive: true,
	keepAliveInitialDelayMillis: 10000,
	connectionTimeoutMillis: 30000
});

// Handles unexpected database pool errors.
pool.on("error",function(err) {
	console.error("Database connection error:",err.message);
});

// Runs fn(client) in one transaction. Saves made this way write their Activity Log entry in the same transaction.
async function transaction(fn) {
	const client=await pool.connect();
	try {
		await client.query('BEGIN');
		const result=await fn(client);
		await client.query('COMMIT');
		return result;
	} catch(error) {
		await client.query('ROLLBACK').catch(()=>{});
		throw error;
	} finally { client.release(); }
}

module.exports={pool,refreshDatabaseAddress,transaction};
