// Kernel quality checks are separate from stock quantities, costing and payments.
function validateWeights(body) {
    body = body || {};
    const valid = value =>
        (typeof value === 'number' || typeof value === 'string') &&
        /^\d+(?:\.\d{1,3})?$/.test(String(value)) &&
        Number.isFinite(Number(value)) &&
        Number(value) <= 1000000000;
    if (
        !valid(body.sample_weight_g) ||
        !valid(body.impurity_weight_g) ||
        Number(body.sample_weight_g) <= 0 ||
        Number(body.impurity_weight_g) > Number(body.sample_weight_g)
    ) {
        throw Object.assign(
            new Error(
                'Enter a sample weight above zero and an impurity weight from zero to the sample weight, using up to 3 decimal places.'
            ),
            { status: 400 }
        );
    }
    if (
        typeof body.entry_key !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.entry_key)
    )
        throw Object.assign(new Error('Invalid test reference. Refresh and try again.'), { status: 400 });
    return [Number(body.sample_weight_g), Number(body.impurity_weight_g), body.entry_key];
}
// Called within the receipt transaction, so a failed test cannot leave a partial receipt.
async function saveReceiptKernelTest(client, purchaseId, itemId, body, userId) {
    const item = (await client.query('SELECT name FROM items WHERE item_id=$1', [itemId])).rows[0];
    if (
        String(item?.name || '')
            .trim()
            .toLowerCase() !== 'p kernel'
    )
        throw Object.assign(new Error('Impurity tests are available only for kernel purchases.'), { status: 400 });
    const values = validateWeights(body);
    await client.query(
        `INSERT INTO kernel_impurity_tests(purchase_id,sample_weight_g,impurity_weight_g,entry_key,recorded_by)
        VALUES($1,$2,$3,$4,$5)`,
        [purchaseId, ...values, userId]
    );
}
function registerKernelImpurity(app, pool, requireRole) {
    const readRoles = ['admin', 'manager', 'storekeeper'];
    async function purchase(client, id, lock = false) {
        if (!/^\d+$/.test(id) || Number(id) > 2147483647)
            throw Object.assign(new Error('Invalid purchase.'), { status: 400 });
        const result = await client.query(
            `SELECT p.purchase_id,i.name FROM purchases p JOIN items i ON i.item_id=p.item_id WHERE p.purchase_id=$1 ${lock ? 'FOR KEY SHARE OF p' : ''}`,
            [id]
        );
        if (!result.rows.length) throw Object.assign(new Error('Purchase not found.'), { status: 404 });
        if (String(result.rows[0].name).trim().toLowerCase() !== 'p kernel')
            throw Object.assign(new Error('Impurity tests are available only for kernel purchases.'), { status: 400 });
    }
    async function tests(client, id) {
        const result = await client.query(
            `SELECT t.test_id,t.sample_weight_g,t.impurity_weight_g,t.created_at,u.username AS recorded_by_name,
            ROUND(t.impurity_weight_g/t.sample_weight_g*100,2) AS impurity_percentage,
            ROUND((t.sample_weight_g-t.impurity_weight_g)/t.sample_weight_g*100,2) AS clean_percentage
            FROM kernel_impurity_tests t LEFT JOIN users u ON u.user_id=t.recorded_by WHERE t.purchase_id=$1 ORDER BY t.created_at,t.test_id`,
            [id]
        );
        // Sum thousandths of a gram, rather than rounded test percentages.
        const sample = result.rows.reduce((sum, row) => sum + Math.round(Number(row.sample_weight_g) * 1000), 0);
        const impurity = result.rows.reduce((sum, row) => sum + Math.round(Number(row.impurity_weight_g) * 1000), 0);
        const percentage = sample ? Math.round((impurity / sample) * 10000) / 100 : null;
        return {
            tests: result.rows,
            summary: {
                test_count: result.rows.length,
                sample_weight_g: sample / 1000,
                impurity_weight_g: impurity / 1000,
                impurity_percentage: percentage,
                clean_percentage: percentage === null ? null : Math.round((100 - percentage) * 100) / 100
            }
        };
    }
    function fail(res, error) {
        if (!error.status) console.error('Kernel impurity test:', error.message);
        return res
            .status(error.status || 500)
            .json({ err: error.status ? error.message : 'Could not save or load kernel tests. Please try again.' });
    }
    app.get('/api/purchases/:id/kernel-tests', requireRole(readRoles), async (req, res) => {
        try {
            await purchase(pool, req.params.id);
            res.json(await tests(pool, req.params.id));
        } catch (error) {
            fail(res, error);
        }
    });
    app.post('/api/purchases/:id/kernel-tests', requireRole(['admin', 'storekeeper']), async (req, res) => {
        let client;
        try {
            const values = validateWeights(req.body);
            client = await pool.connect();
            await client.query('BEGIN');
            await purchase(client, req.params.id, true);
            const result = await client.query(
                `INSERT INTO kernel_impurity_tests(purchase_id,sample_weight_g,impurity_weight_g,entry_key,recorded_by)
                VALUES($1,$2,$3,$4,$5) ON CONFLICT(purchase_id,entry_key) DO NOTHING RETURNING test_id`,
                [req.params.id, ...values, req.session.user_id]
            );
            if (!result.rows.length) {
                const existing = (
                    await client.query(
                        'SELECT sample_weight_g,impurity_weight_g FROM kernel_impurity_tests WHERE purchase_id=$1 AND entry_key=$2',
                        [req.params.id, values[2]]
                    )
                ).rows[0];
                if (Number(existing.sample_weight_g) !== values[0] || Number(existing.impurity_weight_g) !== values[1])
                    throw Object.assign(
                        new Error(
                            'This test was already saved with different weights. Reload the tests before entering another sample.'
                        ),
                        { status: 409 }
                    );
            }
            const data = await tests(client, req.params.id);
            await client.query('COMMIT');
            res.status(result.rows.length ? 201 : 200).json({ message: 'Kernel sample test saved.', ...data });
        } catch (error) {
            if (client) await client.query('ROLLBACK');
            fail(res, error);
        } finally {
            if (client) client.release();
        }
    });
    app.delete('/api/purchases/:id/kernel-tests/:testId', requireRole(['admin']), async (req, res) => {
        try {
            await purchase(pool, req.params.id);
            if (!/^\d+$/.test(req.params.testId)) throw Object.assign(new Error('Invalid test.'), { status: 400 });
            const result = await pool.query(
                'DELETE FROM kernel_impurity_tests WHERE purchase_id=$1 AND test_id=$2 RETURNING test_id',
                [req.params.id, req.params.testId]
            );
            if (!result.rows.length) throw Object.assign(new Error('Test not found.'), { status: 404 });
            res.json({ message: 'Sample test deleted.', ...(await tests(pool, req.params.id)) });
        } catch (error) {
            fail(res, error);
        }
    });
}
module.exports = { registerKernelImpurity, validateWeights, saveReceiptKernelTest };
