// Other partners (fabricators, installers, equipment dealers, repairers) and the capital asset register.
// Capital jobs are recorded once as an asset; payments on running jobs each create one running expense.
const { readSubmissionKey } = require('./record-rules');
const fail = (status, message) => Object.assign(new Error(message), { status });
const JOB_TYPES = ['Fabrication', 'Installation', 'Equipment purchase', 'Repair', 'Maintenance/Service', 'Other'];
const CAPITAL_TYPES = ['Fabrication', 'Installation', 'Equipment purchase'];
const ASSET_TYPES = ['Machine', 'Tank', 'Building', 'Vehicle', 'Electrical', 'Other'];
const METHODS = ['Bank Transfer', 'Cash', 'Cheque', 'POS'];
const day = value => {
    const text = String(value || '');
    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
        !Number.isFinite(Date.parse(text + 'T00:00:00Z')) ||
        new Date(text + 'T00:00:00Z').toISOString().slice(0, 10) !== text
    )
        throw fail(400, 'Enter a valid date.');
    return text;
};
const money = (value, label) => {
    if (!/^\d+(\.\d{1,2})?$/.test(String(value ?? '').trim()) || !(Number(value) > 0))
        throw fail(400, 'Enter ' + label + ' above zero, with no more than two decimal places.');
    return Number(value);
};
const words = (value, label, limit = 200, required = true) => {
    const text = String(value ?? '').trim();
    if (required && !text) throw fail(400, 'Enter ' + label + '.');
    if (text.length > limit) throw fail(400, label[0].toUpperCase() + label.slice(1) + ' is too long.');
    return text || null;
};
function partnerDetails(body) {
    return [
        words(body.name, 'the partner’s name', 150),
        words(body.phone, 'a phone number', 30, false),
        words(body.address, 'an address', 300, false),
        words(body.email, 'an email address', 254, false),
        words(body.work_type, 'the type of work', 150, false),
        words(body.note, 'a note', 500, false)
    ];
}
function jobDetails(body) {
    const type = String(body.job_type || '');
    if (!JOB_TYPES.includes(type)) throw fail(400, 'Choose the type of job.');
    // Fabrication, installation and equipment purchases are capital by default; the Director can change it.
    const category = body.cost_category
        ? String(body.cost_category)
        : CAPITAL_TYPES.includes(type)
          ? 'Capital'
          : 'Running';
    if (!['Capital', 'Running'].includes(category)) throw fail(400, 'Choose capital or running cost.');
    const assetType = category === 'Capital' ? String(body.asset_type || '') : null;
    if (category === 'Capital' && !ASSET_TYPES.includes(assetType))
        throw fail(400, 'Choose the asset type for this capital job.');
    return {
        date: day(body.job_date),
        type,
        description: words(body.description, 'what the job is', 300),
        amount: money(body.agreed_amount, 'the agreed price'),
        category,
        assetType
    };
}
function registerPartners(app, pool, requireRole) {
    const viewers = ['admin', 'manager'];
    async function transact(res, action, status = 200) {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            const result = await action(client);
            await client.query('COMMIT');
            res.status(status).json(result);
        } catch (e) {
            if (client) await client.query('ROLLBACK');
            if (!e.status) console.error(e);
            res.status(e.status || 500).json({ err: e.status ? e.message : 'Could not save. Please try again.' });
        } finally {
            client?.release();
        }
    }
    const jobTotals = `SELECT j.*,to_char(j.job_date,'YYYY-MM-DD') AS job_day,COALESCE(SUM(p.amount),0) AS paid,j.agreed_amount-COALESCE(SUM(p.amount),0) AS owed
        FROM partner_jobs j LEFT JOIN partner_payments p ON p.job_id=j.job_id AND p.reversed_at IS NULL`;
    app.get('/api/partners', requireRole(viewers), async (req, res) => {
        try {
            res.json(
                (
                    await pool.query(`SELECT s.*,COUNT(j.job_id)::int AS number_of_jobs,COALESCE(SUM(j.agreed_amount),0) AS total_agreed,
            COALESCE(SUM(j.paid),0) AS total_paid,COALESCE(SUM(j.owed),0) AS balance_owed,to_char(MAX(j.job_date),'YYYY-MM-DD') AS last_job_date,
            (SELECT job_type FROM partner_jobs x WHERE x.partner_id=s.partner_id GROUP BY job_type ORDER BY COUNT(*) DESC,job_type LIMIT 1) AS main_work
            FROM service_partners s LEFT JOIN (${jobTotals} GROUP BY j.job_id) j ON j.partner_id=s.partner_id
            GROUP BY s.partner_id HAVING s.archived_at IS NULL OR COALESCE(SUM(j.owed),0)<>0 ORDER BY s.name`)
                ).rows
            );
        } catch (e) {
            console.error(e);
            res.status(500).json({ err: 'Could not load partners.' });
        }
    });
    app.get('/api/partners/:id', requireRole(viewers), async (req, res) => {
        try {
            const row = (await pool.query('SELECT * FROM service_partners WHERE partner_id=$1', [req.params.id]))
                .rows[0];
            if (!row) return res.status(404).json({ err: 'Partner not found.' });
            res.json(row);
        } catch (e) {
            res.status(500).json({ err: 'Could not load the partner.' });
        }
    });
    // Jobs with their payments, newest first, for the partner's card.
    app.get('/api/partners/:id/jobs', requireRole(viewers), async (req, res) => {
        try {
            res.json(
                (
                    await pool.query(
                        `${jobTotals.replace(
                            'SELECT j.*',
                            `SELECT j.*,(SELECT asset_id FROM capital_assets a WHERE a.job_id=j.job_id) AS asset_id,(SELECT asset_type FROM capital_assets a WHERE a.job_id=j.job_id) AS asset_type,
            (SELECT COALESCE(json_agg(json_build_object('payment_id',q.payment_id,'payment_date',to_char(q.payment_date,'YYYY-MM-DD'),'amount',q.amount,'payment_method',q.payment_method,
                'reference_number',q.reference_number,'note',q.note,'recorded_by_name',(SELECT username FROM users WHERE user_id=q.recorded_by),
                'reversed_on',to_char(q.reversed_at,'YYYY-MM-DD'),'reversal_reason',q.reversal_reason) ORDER BY q.payment_date,q.payment_id),'[]'::json)
             FROM partner_payments q WHERE q.job_id=j.job_id) AS payments`
                        )} WHERE j.partner_id=$1 GROUP BY j.job_id ORDER BY j.job_date DESC,j.job_id DESC`,
                        [req.params.id]
                    )
                ).rows
            );
        } catch (e) {
            console.error(e);
            res.status(500).json({ err: 'Could not load the partner’s jobs.' });
        }
    });
    app.post('/api/partners', requireRole(viewers), (req, res) =>
        transact(
            res,
            async client => {
                return (
                    await client.query(
                        'INSERT INTO service_partners(name,phone_number,address,email,work_type,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
                        partnerDetails(req.body)
                    )
                ).rows[0];
            },
            201
        )
    );
    app.patch('/api/partners/:id', requireRole(viewers), (req, res) =>
        transact(res, async client => {
            const row = (
                await client.query(
                    'UPDATE service_partners SET name=$1,phone_number=$2,address=$3,email=$4,work_type=$5,note=$6 WHERE partner_id=$7 RETURNING *',
                    [...partnerDetails(req.body), req.params.id]
                )
            ).rows[0];
            if (!row) throw fail(404, 'Partner not found.');
            await client.query(
                `UPDATE capital_assets a SET source=$1 FROM partner_jobs j WHERE a.job_id=j.job_id AND j.partner_id=$2`,
                [row.name, row.partner_id]
            );
            return row;
        })
    );
    // A partner with jobs is archived, not deleted, so its jobs, payments, expenses and assets stay in the records and
    // past reports do not change. A partner with no jobs at all is removed completely.
    app.delete('/api/partners/:id', requireRole(['admin']), (req, res) =>
        transact(res, async client => {
            const partner = (
                await client.query('SELECT partner_id FROM service_partners WHERE partner_id=$1 AND archived_at IS NULL FOR UPDATE', [
                    req.params.id
                ])
            ).rows[0];
            if (!partner) throw fail(404, 'Partner not found.');
            // A partner still owed money stays in the list until the balance is paid, so the debt is never hidden.
            const owed = (await client.query(`SELECT COALESCE(SUM(owed),0) AS owed FROM (${jobTotals} WHERE j.partner_id=$1 GROUP BY j.job_id) t`, [partner.partner_id])).rows[0].owed;
            if (Number(owed) !== 0) throw fail(409, 'This partner still has an unpaid balance. Pay it, or correct or delete any job that did not go ahead, before archiving the partner.');
            if ((await client.query('SELECT 1 FROM partner_jobs WHERE partner_id=$1 LIMIT 1', [partner.partner_id])).rowCount) {
                await client.query('UPDATE service_partners SET archived_at=CURRENT_TIMESTAMP WHERE partner_id=$1', [partner.partner_id]);
                return {
                    message:
                        'Partner archived. It no longer shows under Other Partners, but its jobs, payments, expenses and assets are kept.'
                };
            }
            await client.query('DELETE FROM service_partners WHERE partner_id=$1', [partner.partner_id]);
            return { message: 'Partner deleted.' };
        })
    );
    app.post('/api/partners/:id/jobs', requireRole(viewers), (req, res) =>
        transact(
            res,
            async client => {
                const job = jobDetails(req.body);
                // Locked so an archive at the same moment cannot slip a job onto an archived partner.
                const partner = (
                    await client.query('SELECT name,archived_at FROM service_partners WHERE partner_id=$1 FOR UPDATE', [req.params.id])
                ).rows[0];
                if (!partner) throw fail(404, 'Partner not found.');
                if (partner.archived_at) throw fail(409, 'This partner is archived. New jobs cannot be added to an archived partner.');
                const row = (
                    await client.query(
                        `INSERT INTO partner_jobs(partner_id,job_date,job_type,description,agreed_amount,cost_category,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
                        [
                            req.params.id,
                            job.date,
                            job.type,
                            job.description,
                            job.amount,
                            job.category,
                            req.session.user_id
                        ]
                    )
                ).rows[0];
                // A capital job becomes one entry in the asset register.
                if (job.category === 'Capital')
                    await client.query(
                        `INSERT INTO capital_assets(name,asset_type,acquired_date,cost,source,job_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)`,
                        [
                            job.description,
                            job.assetType,
                            job.date,
                            job.amount,
                            partner.name,
                            row.job_id,
                            req.session.user_id
                        ]
                    );
                return row;
            },
            201
        )
    );
    app.patch('/api/partner-jobs/:id', requireRole(viewers), (req, res) =>
        transact(res, async client => {
            const job = jobDetails(req.body);
            // Payments lock the same job, so a price change and a payment never both pass against an old balance.
            await client.query('SELECT 1 FROM partner_jobs WHERE job_id=$1 FOR UPDATE', [req.params.id]);
            const current = (await client.query(`${jobTotals} WHERE j.job_id=$1 GROUP BY j.job_id`, [req.params.id]))
                .rows[0];
            if (!current) throw fail(404, 'Job not found.');
            const paid = Number(current.paid);
            if (paid > 0 && job.category !== current.cost_category)
                throw fail(409, 'This job already has payments, so it cannot move between capital and running cost.');
            if (job.amount < paid)
                throw fail(
                    409,
                    'The agreed price cannot be less than the ₦' + paid.toLocaleString('en-NG') + ' already paid.'
                );
            const row = (
                await client.query(
                    'UPDATE partner_jobs SET job_date=$1,job_type=$2,description=$3,agreed_amount=$4,cost_category=$5 WHERE job_id=$6 RETURNING *',
                    [job.date, job.type, job.description, job.amount, job.category, req.params.id]
                )
            ).rows[0];
            const source = (
                await client.query('SELECT name FROM service_partners WHERE partner_id=$1', [row.partner_id])
            ).rows[0].name;
            if (job.category === 'Capital') {
                const updated = await client.query(
                    'UPDATE capital_assets SET name=$1,asset_type=$2,acquired_date=$3,cost=$4,source=$5 WHERE job_id=$6',
                    [job.description, job.assetType, job.date, job.amount, source, row.job_id]
                );
                if (!updated.rowCount)
                    await client.query(
                        'INSERT INTO capital_assets(name,asset_type,acquired_date,cost,source,job_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',
                        [job.description, job.assetType, job.date, job.amount, source, row.job_id, req.session.user_id]
                    );
            } else await client.query('DELETE FROM capital_assets WHERE job_id=$1', [row.job_id]);
            return row;
        })
    );
    app.delete('/api/partner-jobs/:id', requireRole(['admin']), (req, res) =>
        transact(res, async client => {
            if ((await client.query('SELECT 1 FROM partner_payments WHERE job_id=$1', [req.params.id])).rowCount)
                throw fail(409, 'This job has payments. Delete its payments first.');
            await client.query('DELETE FROM capital_assets WHERE job_id=$1', [req.params.id]);
            if (!(await client.query('DELETE FROM partner_jobs WHERE job_id=$1', [req.params.id])).rowCount)
                throw fail(404, 'Job not found.');
            return { message: 'Job deleted.' };
        })
    );
    // Only the Director records money paid to partners.
    app.post('/api/partner-jobs/:id/payments', requireRole(['admin']), (req, res) =>
        transact(
            res,
            async client => {
                const date = day(req.body.payment_date),
                    amount = money(req.body.amount, 'the amount paid');
                const method = String(req.body.payment_method || '');
                if (!METHODS.includes(method)) throw fail(400, 'Choose the payment method.');
                const job = (
                    await client.query(
                        `SELECT j.*,s.name AS partner_name FROM partner_jobs j JOIN service_partners s ON s.partner_id=j.partner_id WHERE j.job_id=$1 FOR UPDATE OF j`,
                        [req.params.id]
                    )
                ).rows[0];
                if (!job) throw fail(404, 'Job not found.');
                // The same payment form sent again (lost connection, double tap) returns the payment already saved.
                const submissionKey = readSubmissionKey(req.body.submission_key);
                if (submissionKey) {
                    const prior = (await client.query('SELECT * FROM partner_payments WHERE submission_key=$1', [submissionKey])).rows[0];
                    if (prior) {
                        const priorDay = prior.payment_date instanceof Date
                            ? prior.payment_date.getFullYear() + '-' + String(prior.payment_date.getMonth() + 1).padStart(2, '0') + '-' + String(prior.payment_date.getDate()).padStart(2, '0')
                            : String(prior.payment_date).slice(0, 10);
                        if (prior.job_id !== job.job_id || Number(prior.amount) !== amount || prior.payment_method !== method || priorDay !== date ||
                            (prior.reference_number || null) !== words(req.body.reference_number, 'a bank reference', 100, false))
                            throw fail(409, 'This payment was already saved with different details. Refresh before recording another.');
                        return { ...prior, already_saved: true };
                    }
                }
                const paid = Number(
                    (
                        await client.query(
                            'SELECT COALESCE(SUM(amount),0) AS paid FROM partner_payments WHERE job_id=$1 AND reversed_at IS NULL',
                            [job.job_id]
                        )
                    ).rows[0].paid
                );
                if (
                    (
                        await client.query('SELECT $1::numeric>$2::numeric-$3::numeric AS too_much', [
                            amount,
                            job.agreed_amount,
                            paid
                        ])
                    ).rows[0].too_much
                )
                    throw fail(
                        400,
                        'This payment is more than the ₦' +
                            (Number(job.agreed_amount) - paid).toLocaleString('en-NG') +
                            ' still owed on the job.'
                    );
                let expenseId = null;
                // Repairs and other running work count as a running expense, entered once here.
                if (job.cost_category === 'Running')
                    expenseId = (
                        await client.query(
                            `INSERT INTO expenses(expense_date,category,description,amount_spent) VALUES($1,'Expenses',$2,$3) RETURNING expense_id`,
                            [date, (job.partner_name + ': ' + job.description).slice(0, 100), amount]
                        )
                    ).rows[0].expense_id;
                return (
                    await client.query(
                        `INSERT INTO partner_payments(job_id,payment_date,amount,payment_method,reference_number,note,expense_id,recorded_by,submission_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
                        [
                            job.job_id,
                            date,
                            amount,
                            method,
                            words(req.body.reference_number, 'a reference', 100, false),
                            words(req.body.note, 'a note', 300, false),
                            expenseId,
                            req.session.user_id,
                            submissionKey
                        ]
                    )
                ).rows[0];
            },
            201
        )
    );
    // A wrong payment is reversed, not deleted: it stays on the job, marked with the date, reason and who reversed it,
    // and no longer counts as paid. Its running expense is kept and cancelled by a linked reversal of the same amount
    // on the same date, so Expenses shows both and the month's total is as if the money had not been spent.
    app.delete('/api/partner-payments/:id', requireRole(['admin']), (req, res) =>
        transact(res, async client => {
            const reason = words(req.body?.reason, 'the reason for reversing this payment', 300, true);
            const payment = (await client.query('SELECT job_id FROM partner_payments WHERE payment_id=$1', [req.params.id])).rows[0];
            if (!payment) throw fail(404, 'Payment not found.');
            await client.query('SELECT 1 FROM partner_jobs WHERE job_id=$1 FOR UPDATE', [payment.job_id]);
            const row = (
                await client.query(`SELECT p.expense_id,e.expense_date,e.description,e.amount_spent FROM partner_payments p
                    LEFT JOIN expenses e ON e.expense_id=p.expense_id WHERE p.payment_id=$1 AND p.reversed_at IS NULL`, [req.params.id])
            ).rows[0];
            if (!row) throw fail(409, 'This payment has already been reversed.');
            let reversalId = null;
            if (row.expense_id)
                reversalId = (
                    await client.query(
                        `INSERT INTO expenses(expense_date,category,description,amount_spent) VALUES($1,'Expenses',$2,$3) RETURNING expense_id`,
                        [row.expense_date, ('Reversal: ' + (row.description || 'partner payment') + ' (' + reason + ')').slice(0, 500), -Number(row.amount_spent)]
                    )
                ).rows[0].expense_id;
            await client.query(
                'UPDATE partner_payments SET reversed_at=CURRENT_TIMESTAMP,reversed_by=$2,reversal_reason=$3,reversal_expense_id=$4 WHERE payment_id=$1',
                [req.params.id, req.session.user_id, reason, reversalId]
            );
            return { message: 'Payment reversed.' + (row.expense_id ? ' A matching reversal was added to Expenses.' : '') };
        })
    );
    // Asset register, with paid and owed figures for assets that came through a partner job.
    app.get('/api/capital-assets', requireRole(viewers), async (req, res) => {
        try {
            res.json(
                (
                    await pool.query(`SELECT a.*,to_char(a.acquired_date,'YYYY-MM-DD') AS acquired_day,j.partner_id,j.job_type,
            CASE WHEN a.job_id IS NULL THEN a.cost ELSE COALESCE((SELECT SUM(amount) FROM partner_payments p WHERE p.job_id=a.job_id AND p.reversed_at IS NULL),0) END AS paid
            FROM capital_assets a LEFT JOIN partner_jobs j ON j.job_id=a.job_id ORDER BY a.acquired_date DESC,a.asset_id DESC`)
                ).rows
            );
        } catch (e) {
            console.error(e);
            res.status(500).json({ err: 'Could not load capital assets.' });
        }
    });
    // Start-up costs: the start-up share of each expense, from expenses recorded with start-up months.
    // Director only, like the Start-up Costs tab.
    app.get('/api/startup-costs', requireRole(['admin']), async (req, res) => {
        try {
            res.json(
                (
                    await pool.query(`SELECT expense_id,to_char(expense_date,'YYYY-MM-DD') AS expense_date,description,amount_spent,spread_months,startup_months,
            ROUND(amount_spent*startup_months/spread_months,2) AS startup_amount
            FROM expenses WHERE category IN ('Expense','Expenses') AND startup_months>0 ORDER BY expense_date,expense_id`)
                ).rows
            );
        } catch (e) {
            console.error(e);
            res.status(500).json({ err: 'Could not load start-up costs.' });
        }
    });
    const assetDetails = body => {
        const type = String(body.asset_type || '');
        if (!ASSET_TYPES.includes(type)) throw fail(400, 'Choose the asset type.');
        return [
            words(body.name, 'the asset name', 200),
            type,
            day(body.acquired_date),
            money(body.cost, 'the cost'),
            words(body.source, 'where it came from', 200, false),
            words(body.note, 'a note', 500, false)
        ];
    };
    // A direct entry is an asset bought outright from a one-off seller; spending is Director-only.
    app.post('/api/capital-assets', requireRole(['admin']), (req, res) =>
        transact(
            res,
            async client =>
                (
                    await client.query(
                        'INSERT INTO capital_assets(name,asset_type,acquired_date,cost,source,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
                        [...assetDetails(req.body), req.session.user_id]
                    )
                ).rows[0],
            201
        )
    );
    app.patch('/api/capital-assets/:id', requireRole(['admin']), (req, res) =>
        transact(res, async client => {
            const current = (await client.query('SELECT job_id FROM capital_assets WHERE asset_id=$1', [req.params.id]))
                .rows[0];
            if (!current) throw fail(404, 'Asset not found.');
            if (current.job_id) {
                // Name, date and cost come from the partner job; only the type and note are edited here.
                const type = String(req.body.asset_type || '');
                if (!ASSET_TYPES.includes(type)) throw fail(400, 'Choose the asset type.');
                return (
                    await client.query(
                        'UPDATE capital_assets SET asset_type=$1,note=$2 WHERE asset_id=$3 RETURNING *',
                        [type, words(req.body.note, 'a note', 500, false), req.params.id]
                    )
                ).rows[0];
            }
            return (
                await client.query(
                    'UPDATE capital_assets SET name=$1,asset_type=$2,acquired_date=$3,cost=$4,source=$5,note=$6 WHERE asset_id=$7 RETURNING *',
                    [...assetDetails(req.body), req.params.id]
                )
            ).rows[0];
        })
    );
    app.delete('/api/capital-assets/:id', requireRole(['admin']), (req, res) =>
        transact(res, async client => {
            const current = (await client.query('SELECT job_id FROM capital_assets WHERE asset_id=$1', [req.params.id]))
                .rows[0];
            if (!current) throw fail(404, 'Asset not found.');
            if (current.job_id)
                throw fail(
                    409,
                    'This asset comes from a partner job. Delete or change the job under Other Partners instead.'
                );
            await client.query('DELETE FROM capital_assets WHERE asset_id=$1', [req.params.id]);
            return { message: 'Asset deleted.' };
        })
    );
}
module.exports = { registerPartners, JOB_TYPES, ASSET_TYPES };
