// Sign-in, with the failed sign-in counter that locks a username for 15 minutes after 5 wrong passwords.
// Moved from server.js unchanged; server.js mounts this router where the routes used to be.
const express=require('express');
const argon2=require('argon2');
const {pool}=require('../db');
const router=require('express').Router();

// Counts recent failed sign-ins for each username and device so passwords cannot be guessed endlessly.
const failedLogins=new Map();
const loginLockMinutes=15;
const loginAttemptLimit=5;
const failedLoginLimit=10000;
// Forgets failed sign-ins whose 15-minute window has passed, so made-up usernames cannot fill the server's memory.
// Above the limit, the oldest entries go first (the map keeps them in the order they were added).
function pruneFailedLogins(now=Date.now()) {
	for(const [key,attempts] of failedLogins) {
		if(now-attempts.first>=loginLockMinutes*60000) failedLogins.delete(key);
	}
	for(const key of failedLogins.keys()) {
		if(failedLogins.size<=failedLoginLimit) break;
		failedLogins.delete(key);
	}
}
setInterval(pruneFailedLogins,5*60000).unref();

// Handles POST /api/login requests.
// The login page posts an ordinary form, so the browser closes the keyboard and offers to save the password;
// a form sign-in is answered with a redirect. Scripts and tests may still send JSON and get JSON back.
router.post('/api/login',express.urlencoded({extended:false,limit:'4kb'}),async function(req,res) {
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
			failedLogins.delete(attemptKey);failedLogins.set(attemptKey,current); // moved to the end: newest last
			if(failedLogins.size>failedLoginLimit) pruneFailedLogins();
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

module.exports={router,failedLogins,pruneFailedLogins};
