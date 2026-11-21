// Sign-in checks for API requests and pages, including the role checks (the role is re-read from the database
// on every request). Moved from server.js unchanged.
const {pool}=require('./db');

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

module.exports={requireLogin,requireRole,requirePageLogin,requirePageRole};
