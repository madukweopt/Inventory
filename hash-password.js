const argon2=require('argon2');

async function createHash() {
	const password='Manchester263@';

	const hash=await argon2.hash(password);

	console.log(hash);
}

createHash();