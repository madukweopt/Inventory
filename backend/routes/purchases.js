// Purchases: the purchases list and purchase authorisation.
// Moved from server.js unchanged; server.js mounts this router where the routes used to be.
const {pool}=require('../db');
const {requireRole}=require('../auth');
const {authorise}=require('../dependency-services');
const {readInventoryQuantity}=require('../record-rules');
const router=require('express').Router();

// Handles GET /api/purchases requests.
router.get("/api/purchases",requireRole(['admin','manager','storekeeper']),function(req,res) {
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

// Handles POST /api/purchases requests.
router.post("/api/purchases",requireRole(['admin','manager']),async function(req,res) {
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
	if(require('../record-rules').futureAuthorisation(purchase.purchase_date)) return res.status(400).json({ err:'Authorise for today or an earlier day. A future date cannot be authorised.' });
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

module.exports={router};
