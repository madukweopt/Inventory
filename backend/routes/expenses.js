// Expenses: the expenses list and new expenses.
// Moved from server.js unchanged; server.js mounts this router where the routes used to be.
const {pool}=require('../db');
const {requireRole}=require('../auth');
const {readInventoryQuantity,readSubmissionKey,validExpense,expenseSpreading}=require('../record-rules');
const router=require('express').Router();

// Handles GET /api/expenses requests.
router.get("/api/expenses",requireRole(['admin','manager','storekeeper']),function(req,res) {
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

router.post("/api/expenses",requireRole(['admin','manager']),async function(req,res) {
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

module.exports={router};
