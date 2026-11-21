// Shared rules for reading entered values: quantities, one-time submission keys, stock change reasons and expenses.
// Moved from server.js unchanged (one comment moved back above the function it describes).

// Reasons the Director can give for a manual stock change; losses are reported separately from sales.
const stockAdjustmentReasons=['Spill','Disposal','Count difference','Return to store','Other'];

// Reads the optional one-time key sent with a payment, stock change or expense. Returns null when none is sent;
// an entry sent again with the same key is saved only once. A malformed key is refused.
function readSubmissionKey(value) {
	if(value===undefined||value===null||value==='') return null;
	if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value))) {
		throw Object.assign(new Error('Invalid submission key. Refresh the page and try again.'),{status:400});
	}
	return String(value).toLowerCase();
}

// Accepts a non-negative inventory quantity with no more than two decimal places.
function readInventoryQuantity(value) {
	const quantityText=String(value??'').trim();
	if(!/^\d+(?:\.\d{1,2})?$/.test(quantityText)) {
		return null;
	}
	const quantity=Number(quantityText);
	return Number.isFinite(quantity)? quantity:null;
}

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

module.exports={readInventoryQuantity,readSubmissionKey,stockAdjustmentReasons,validExpense,expenseSpreading};
