require('dotenv').config();
const argon2=require('argon2');
const { Pool }=require('pg');

const username=process.argv[2];

// Reads a password from the terminal without showing it on the screen.
function readHiddenPassword(message) {
	return new Promise(function(resolve,reject) {
		if(!process.stdin.isTTY) {
			return reject(new Error('This command must be run in a terminal.'));
		}

		let password='';
		process.stdout.write(message);
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding('utf8');

		function finish() {
			process.stdin.setRawMode(false);
			process.stdin.pause();
			process.stdin.removeListener('data',handleInput);
			process.stdout.write('\n');
		}

		function handleInput(character) {
			if(character==='\u0003') {
				finish();
				return reject(new Error('Password change cancelled.'));
			}

			if(character==='\r'||character==='\n') {
				finish();
				return resolve(password);
			}

			if(character==='\u007f') {
				password=password.slice(0,-1);
				return;
			}

			password+=character;
		}

		process.stdin.on('data',handleInput);
	});
}

// Replaces the selected user's saved password with a newly encrypted password.
async function changePassword() {
	if(!username) {
		throw new Error('Add the username after the command, for example: node hash-password.js pascal');
	}

	const password=await readHiddenPassword('Enter the new password: ');
	const confirmation=await readHiddenPassword('Enter it again: ');

	if(password.length<12) {
		throw new Error('The new password must contain at least 12 characters.');
	}

	if(password!==confirmation) {
		throw new Error('The two passwords did not match.');
	}

	const passwordHash=await argon2.hash(password);
	const pool=new Pool({
		connectionString: process.env.DATABASE_URL,
		ssl: {
			rejectUnauthorized: true
		}
	});

	try {
		const result=await pool.query(
			'UPDATE users SET password_hash=$1 WHERE username=$2 RETURNING username',
			[passwordHash,username]
		);

		if(result.rowCount===0) {
			throw new Error('No user named "'+username+'" was found.');
		}

		console.log('Password changed for '+result.rows[0].username+'.');
	} finally {
		await pool.end();
	}
}

changePassword().catch(function(error) {
	console.error(error.message);
	process.exitCode=1;
});
