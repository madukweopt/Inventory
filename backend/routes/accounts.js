// The signed-in user, login accounts, Switch Account and sign-out.
// Moved from server.js unchanged; server.js mounts this router where the routes used to be.
const argon2=require('argon2');
const {pool}=require('../db');
const {requireRole,requireLogin}=require('../auth');
const router=require('express').Router();

// Handles GET /api/current-user requests.
router.get('/api/current-user',requireLogin,async function(req,res) {
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
router.get('/api/users',requireRole(['admin']),async function(req,res) {
	try {
		const result=await pool.query(
			`SELECT user_id,username,role,enabled,created_at
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
router.post('/api/users',requireRole(['admin']),async function(req,res) {
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
router.patch('/api/users/:id',requireRole(['admin']),async function(req,res) {
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
	if(userId===req.session.user_id&&(role!=='admin'||req.body.enabled===false)) {
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
				SET username=$1,password_hash=$2,role=$3,enabled=COALESCE($5,enabled)
				WHERE user_id=$4
				RETURNING user_id,username,role,created_at`,
				[username,passwordHash,role,userId,req.body.enabled??null]
			);
		} else {
			result=await pool.query(
				`UPDATE users
				SET username=$1,role=$2,enabled=COALESCE($4,enabled)
				WHERE user_id=$3
				RETURNING user_id,username,role,created_at`,
				[username,role,userId,req.body.enabled??null]
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
router.delete('/api/users/:id',requireRole(['admin']),async function(req,res) {
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
				"SELECT COUNT(*)::integer AS total FROM users WHERE role='admin' AND enabled"
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
router.post('/api/switch-account',requireRole(['admin']),async function(req,res) {
	const targetUserId=Number(req.body.user_id);
	if(!Number.isInteger(targetUserId)||targetUserId<1) {
		return res.status(400).json({ message: 'Choose an account' });
	}
	try {
		const result=await pool.query(
			`SELECT user_id,username,role,session_version
			FROM users
			WHERE user_id=$1 AND enabled AND role IN ('manager','storekeeper')`,
			[targetUserId]
		);
		if(result.rowCount===0) {
			return res.status(404).json({
				message: 'Manager or storekeeper account not found'
			});
		}

		const target=result.rows[0];
		req.session.admin_user_id=req.session.user_id;
		req.session.admin_session_version=req.session.session_version??0;
		req.session.session_version=target.session_version;
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
router.post('/api/return-to-admin',async function(req,res) {
	const adminUserId=Number(req.session.admin_user_id);
	if(!Number.isInteger(adminUserId)||adminUserId<1) {
		return res.status(403).json({ message: 'No administrator account to return to' });
	}
	try {
		const result=await pool.query(
			`SELECT user_id,username,role,session_version
			FROM users
			WHERE user_id=$1 AND enabled AND role='admin'`,
			[adminUserId]
		);
		if(result.rowCount===0) {
			return res.status(403).json({ message: 'Administrator account not found' });
		}

		const admin=result.rows[0];
		req.session.user_id=admin.user_id;
		req.session.user_name=admin.username;
		req.session.role=admin.role;
		req.session.session_version=admin.session_version;
		delete req.session.admin_session_version;
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
router.post('/api/logout',(req,res) => {
	// Completes the response after attempting to destroy the session.
	return req.session.destroy(err => {
		// Answer once: a failed logout returns here, so the success reply below is never sent as well
		// (a second reply throws an error that would stop the server).
		if(err) {
			console.error(err);
			return res.status(500).json({
				message: 'logout failed'
			});
		}
		return res.json({
			message: 'Logged out'
		});
	});
})

module.exports={router};
