const multer = require('multer');
const { snapshotInvoice } = require('./dependency-services');
const fail = (status, message) => Object.assign(new Error(message), { status });
const roles = ['admin', 'manager', 'storekeeper'];
function signature(value) {
    if (typeof value !== 'string' || value.length > 300000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value))
        throw fail(400, 'Draw the signature before saving.');
    const bytes = Buffer.from(value.split(',')[1], 'base64');
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.length < 24)
        throw fail(400, 'Use a valid signature image.');
    return value;
}
function name(value, label) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 150)
        throw fail(400, 'Enter ' + label + '.');
    return value.trim();
}
function weight(value) {
    if (!/^\d+(\.\d{1,2})?$/.test(String(value)) || !Number.isFinite(Number(value)) || Number(value) <= 0)
        throw fail(400, 'Enter the buyer’s measured weight with no more than two decimal places.');
    return Number(value);
}
function evidenceType(file) {
    const b = file?.buffer;
    if (!b) return null;
    if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
    if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
    if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
    if (b.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
    throw fail(400, 'Upload a PNG, JPEG, WebP photo or PDF scale ticket.');
}
async function finalise(client, sale) {
    if (sale.invoice_number) return;
    const quantity = sale.billing_basis === 'Customer' ? sale.buyer_weight : sale.factory_quantity;
    await client.query(
        `UPDATE sales SET quantity=$1,invoice_number='INV-'||to_char(sales_date,'YYYY')||'-'||lpad(sales_id::text,6,'0') WHERE sales_id=$2 AND invoice_number IS NULL`,
        [quantity, sale.sales_id]
    );
    await snapshotInvoice(client, sale.sales_id);
}
function registerDeliveryNotes(app, pool, requireRole) {
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 6 * 1024 * 1024, files: 6, fields: 8, fieldSize: 300000 }
    }).array('evidence', 6);
    const load = async (client, id) => {
        const row = (
            await client.query(
                `SELECT s.*,d.representative_id,d.driver_signature,d.buyer_weight,d.buyer_signature,d.confirmed_at
            FROM sales s JOIN delivery_notes d USING(sales_id) WHERE s.sales_id=$1 FOR UPDATE OF s,d`,
                [id]
            )
        ).rows[0];
        if (!row) throw fail(404, 'Delivery note not found');
        return row;
    };
    const assigned = (req, row) => {
        if (req.session.role !== 'admin' && row.representative_id !== req.session.user_id)
            throw fail(403, 'Only the assigned representative or Director can confirm this delivery.');
    };
    app.get('/api/delivery-representatives', requireRole(['admin', 'manager']), async (req, res) => {
        try {
            const rows = (
                await pool.query(
                    "SELECT user_id,username,role FROM users WHERE role<>'admin' AND ($1::text='admin' OR user_id=$2) ORDER BY username",
                    [req.session.role, req.session.user_id]
                )
            ).rows;
            res.json(rows);
        } catch (e) {
            res.status(500).json({ err: 'Could not load delivery representatives.' });
        }
    });
    app.get('/api/delivery-notes/pending', requireRole(roles), async (req, res) => {
        try {
            res.json(
                (
                    await pool.query(
                        `SELECT s.sales_id,s.billing_basis,s.invoice_number,c.name AS customer,i.name AS item,
            to_char(s.sales_date,'YYYY-MM-DD') AS sales_date,
            (SELECT request_id FROM weighing_requests WHERE request_type='Sale' AND completed_record_id=s.sales_id LIMIT 1) AS request_id,
            CASE WHEN d.driver_signature IS NULL THEN 'Awaiting driver signature'
                WHEN d.buyer_signature IS NULL THEN 'Awaiting buyer weight and signature'
                ELSE 'Awaiting Director approval' END AS delivery_status
            FROM delivery_notes d JOIN sales s USING(sales_id) JOIN customers c USING(customer_id) JOIN items i USING(item_id)
            -- A factory-weight sale is invoiced at dispatch, so once the driver has signed it is no longer pending.
            WHERE (d.driver_signature IS NULL OR (s.billing_basis='Customer' AND (d.buyer_signature IS NULL OR s.invoice_number IS NULL)))
            AND ($1::text='admin' OR d.representative_id=$2 OR ($1='storekeeper' AND d.driver_signature IS NULL))
            ORDER BY s.sales_date,s.sales_id`,
                        [req.session.role, req.session.user_id]
                    )
                ).rows
            );
        } catch (e) {
            res.status(500).json({ err: 'Could not load pending deliveries.' });
        }
    });
    app.get('/api/delivery-notes/:id', requireRole(roles), async (req, res) => {
        try {
            const row = (
                await pool.query(
                    `SELECT s.sales_id,to_char(s.sales_date,'YYYY-MM-DD') AS sales_date,s.billing_basis,
                COALESCE(s.factory_quantity,s.quantity) AS factory_weight,s.quantity AS invoice_quantity,s.unit_price,s.invoice_number,
                s.invoice_snapshot,c.name AS customer,i.name AS item,w.vehicle_number,w.scale_ticket,
                d.representative_id,u.username AS representative,d.driver_name,d.driver_signature,d.driver_signed_at,
                d.buyer_name,d.buyer_weight,d.buyer_signature,d.confirmed_at,d.approved_at,
                (SELECT username FROM users WHERE user_id=d.confirmed_by) AS confirmed_by_name,
                (SELECT username FROM users WHERE user_id=d.approved_by) AS approved_by_name,
                d.evidence IS NOT NULL AS has_evidence,d.evidence_type,
                (SELECT COALESCE(json_agg(f ORDER BY f.id),'[]'::json) FROM (
                    SELECT 0 AS id,d.evidence_type AS type,d.evidence_name AS name WHERE d.evidence IS NOT NULL
                    UNION ALL SELECT e.evidence_id,e.content_type,e.filename FROM delivery_note_evidence e WHERE e.sales_id=d.sales_id
                ) f) AS evidence_files,
                (SELECT COALESCE(json_agg(json_build_object('reason',c.reason,'previous_values',c.previous_values,'new_values',c.new_values,'created_at',c.created_at,
                    'corrected_by_name',(SELECT username FROM users WHERE user_id=c.corrected_by),
                    'previous_customer',(SELECT name FROM customers WHERE customer_id=(c.previous_values->>'customer_id')::integer),
                    'new_customer',(SELECT name FROM customers WHERE customer_id=(c.new_values->>'customer_id')::integer),
                    'previous_item',(SELECT name FROM items WHERE item_id=(c.previous_values->>'item_id')::integer),
                    'new_item',(SELECT name FROM items WHERE item_id=(c.new_values->>'item_id')::integer)) ORDER BY c.correction_id),'[]'::json)
                    FROM sale_corrections c WHERE c.sales_id=d.sales_id) AS corrections
                FROM delivery_notes d JOIN sales s USING(sales_id) JOIN customers c USING(customer_id) JOIN items i USING(item_id)
                LEFT JOIN users u ON u.user_id=d.representative_id
                LEFT JOIN weighing_requests w ON w.request_type='Sale' AND w.completed_record_id=s.sales_id
                WHERE s.sales_id=$1`,
                    [req.params.id]
                )
            ).rows[0];
            if (!row) return res.status(404).json({ err: 'Delivery note not found' });
            const company = (await pool.query('SELECT * FROM company_details WHERE company_id=1')).rows[0] || {};
            if (row.invoice_snapshot) {
                row.customer = row.invoice_snapshot.customer;
                row.item = row.invoice_snapshot.item;
            }
            res.json({
                note: row,
                company: row.invoice_snapshot?.company || company,
                can_confirm:
                    row.billing_basis === 'Customer' &&
                    (req.session.role === 'admin' || row.representative_id === req.session.user_id),
                can_sign_driver: ['admin', 'storekeeper'].includes(req.session.role),
                can_approve: req.session.role === 'admin'
            });
        } catch (e) {
            res.status(500).json({ err: 'Could not load delivery note.' });
        }
    });
    app.get('/api/delivery-notes/:id/evidence', requireRole(roles), async (req, res) => {
        try {
            const file = Number(req.query.file || 0);
            if (!Number.isInteger(file) || file < 0) return res.status(400).json({ err: 'Invalid attachment.' });
            const row = (
                await pool.query(
                    file === 0
                        ? 'SELECT evidence,evidence_type FROM delivery_notes WHERE sales_id=$1'
                        : 'SELECT content AS evidence,content_type AS evidence_type FROM delivery_note_evidence WHERE sales_id=$1 AND evidence_id=$2',
                    file === 0 ? [req.params.id] : [req.params.id, file]
                )
            ).rows[0];
            if (!row?.evidence) return res.status(404).json({ err: 'Evidence not found' });
            res.set({
                'Content-Type': row.evidence_type,
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'private, no-store',
                'Content-Disposition':
                    'inline; filename="weighing-evidence.' +
                    ({ 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[
                        row.evidence_type
                    ] || 'bin') +
                    '"'
            }).send(row.evidence);
        } catch (e) {
            res.status(500).json({ err: 'Could not load weighing evidence.' });
        }
    });
    async function transact(req, res, action) {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            const row = await load(client, req.params.id);
            await action(client, row);
            await client.query('COMMIT');
            res.json({ message: 'Delivery note saved.', sales_id: row.sales_id });
        } catch (e) {
            if (client) await client.query('ROLLBACK');
            res.status(e.status || 500).json({ err: e.status ? e.message : 'Could not save the delivery note.' });
        } finally {
            client?.release();
        }
    }
    app.post('/api/delivery-notes/:id/driver', requireRole(['admin', 'storekeeper']), async (req, res) =>
        transact(req, res, async (client, row) => {
            if (row.driver_signature) throw fail(409, 'The driver has already signed. Refresh the delivery note.');
            await client.query(
                `UPDATE delivery_notes SET driver_name=$1,driver_signature=$2,driver_signed_at=CURRENT_TIMESTAMP,driver_recorded_by=$3 WHERE sales_id=$4`,
                [
                    name(req.body.driver_name, 'the driver’s name'),
                    signature(req.body.signature),
                    req.session.user_id,
                    row.sales_id
                ]
            );
        })
    );
    app.post('/api/delivery-notes/:id/buyer', requireRole(roles), (req, res) => {
        upload(req, res, error => {
            if (error)
                return res
                    .status(400)
                    .json({ err: 'Attach up to six weighing photos or PDF tickets, no larger than 6 MB each.' });
            return transact(req, res, async (client, row) => {
                assigned(req, row);
                // Factory-weight sales are invoiced on the factory weight at dispatch; there is no buyer weighing.
                if (row.billing_basis !== 'Customer')
                    throw fail(409, 'This sale is paid by factory weight, so no buyer weighing is needed.');
                if (!row.driver_signature)
                    throw fail(409, 'The driver must sign collection before the buyer confirms delivery.');
                if (row.buyer_signature)
                    throw fail(409, 'The buyer’s signed weighing is already saved. Refresh the delivery note.');
                if (req.body.representative_confirmed !== 'true')
                    throw fail(400, 'The accompanying representative must confirm the witnessed weighing.');
                const amount = weight(req.body.buyer_weight),
                    files = req.files || [];
                const types = files.map(evidenceType),
                    first = files[0],
                    type = types[0] || null;
                await client.query(
                    `UPDATE delivery_notes SET buyer_name=$1,buyer_weight=$2,buyer_signature=$3,evidence=$4,evidence_type=$5,evidence_name=$6,confirmed_by=$7,confirmed_at=CURRENT_TIMESTAMP WHERE sales_id=$8`,
                    [
                        name(req.body.buyer_name, 'the buyer’s name'),
                        amount,
                        signature(req.body.signature),
                        first?.buffer || null,
                        type,
                        first?.originalname.slice(0, 150) || null,
                        req.session.user_id,
                        row.sales_id
                    ]
                );
                for (let index = 1; index < files.length; index++)
                    await client.query(
                        'INSERT INTO delivery_note_evidence(sales_id,content,content_type,filename) VALUES($1,$2,$3,$4)',
                        [row.sales_id, files[index].buffer, types[index], files[index].originalname.slice(0, 150)]
                    );
                row.buyer_weight = amount;
                if (row.billing_basis === 'Customer' && amount === Number(row.factory_quantity))
                    await finalise(client, row);
            });
        });
    });
    app.post('/api/delivery-notes/:id/approve', requireRole(['admin']), async (req, res) =>
        transact(req, res, async (client, row) => {
            if (!row.buyer_signature) throw fail(409, 'Save the buyer’s signed weight first.');
            if (row.billing_basis !== 'Customer') throw fail(409, 'This sale is invoiced using factory weight.');
            await finalise(client, row);
            await client.query(
                'UPDATE delivery_notes SET approved_by=COALESCE(approved_by,$1),approved_at=COALESCE(approved_at,CURRENT_TIMESTAMP) WHERE sales_id=$2',
                [req.session.user_id, row.sales_id]
            );
        })
    );
}
module.exports = { registerDeliveryNotes, signature, name };
