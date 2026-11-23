// Other Partners and Assets and Start-up Costs pages. Partner cards reuse the supplier card layout;
// jobs, payments and assets are edited in small dialogs. Only the Director records payments.
(function () {
    const role = () => document.documentElement.dataset.userRole;
    const naira = value => '₦' + formatNumber(value);
    const el = (tag, text, cls) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (cls) node.className = cls;
        return node;
    };
    const slug = value =>
        String(value || '')
            .toLowerCase()
            .replace(/[^a-z]+/g, '-');
    const JOB_TYPES = ['Fabrication', 'Installation', 'Equipment purchase', 'Repair', 'Maintenance/Service', 'Other'];
    const CAPITAL_TYPES = ['Fabrication', 'Installation', 'Equipment purchase'];
    const ASSET_TYPES = ['Machine', 'Tank', 'Building', 'Vehicle', 'Electrical', 'Other'];
    async function send(url, method, body) {
        const response = await fetch(url, {
            method,
            headers: { 'content-type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw Error(result.err || result.message || 'Could not save. Please try again.');
        return result;
    }
    // Opens a small form dialog; the fields are built with DOM methods so saved names are never treated as HTML.
    function openDialog(title, fields, submitLabel, action, intro) {
        const dialog = el('dialog', undefined, 'employee-finance-dialog partner-dialog');
        const form = el('form');
        form.appendChild(el('h2', title));
        if (intro) form.appendChild(el('p', intro));
        const inputs = {};
        for (const field of fields) {
            const label = el('label', field.label);
            let input;
            if (field.options) {
                input = el('select');
                if (field.placeholder) input.add(new Option(field.placeholder, ''));
                field.options.forEach(option => input.add(new Option(option, option)));
            } else if (field.type === 'textarea') {
                input = el('textarea');
                input.maxLength = field.max || 300;
            } else {
                input = el('input');
                input.type = field.type || 'text';
                if (input.type === 'number') {
                    input.min = '0.01';
                    input.step = '0.01';
                    input.inputMode = 'decimal';
                }
            }
            input.name = field.name;
            input.required = field.required !== false;
            if (field.value !== undefined && field.value !== null) input.value = field.value;
            if (field.disabled) input.disabled = true;
            label.appendChild(input);
            if (field.help) label.appendChild(el('small', field.help));
            form.appendChild(label);
            inputs[field.name] = input;
        }
        const message = el('p', undefined, 'finance-dialog-message');
        const buttons = el('div');
        const cancel = el('button', 'Cancel', 'finance-cancel');
        cancel.type = 'button';
        const save = el('button', submitLabel);
        save.type = 'submit';
        buttons.append(cancel, save);
        form.append(message, buttons);
        dialog.appendChild(form);
        document.body.appendChild(dialog);
        cancel.onclick = () => {
            dialog.close();
            dialog.remove();
        };
        form.onsubmit = async event => {
            event.preventDefault();
            save.disabled = true;
            message.textContent = '';
            try {
                const values = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value]));
                const result = await action(values);
                dialog.close();
                dialog.remove();
                appNotify(result.message || 'Saved.');
            } catch (error) {
                message.textContent = error.message;
            } finally {
                save.disabled = false;
            }
        };
        dialog.showModal();
        return inputs;
    }

    // ---------- Other Partners ----------
    let partnersList = [],
        openPartnerId = null,
        partnerToOpen = null;
    // Red while money is still owed, green once it is paid in full.
    function markBalance(box, owed) {
        box.classList.add(Number(owed) > 0 ? 'is-balance-owed' : 'is-balance-paid');
    }
    const partnerConfig = {
        kind: 'partner',
        transaction: 'job',
        lastBusiness: 'Last Job',
        badge: '🔧',
        lastBusinessDate: row => row.last_job_date,
        detailsClass: '.partner-details',
        detailsClassStyle: 'partner-details',
        renderDetails: (partner, card) => renderPartnerDetails(partner, card),
        fields: [
            { label: 'Total Agreed', value: row => naira(row.total_agreed) },
            { label: 'No. Of Jobs', value: row => row.number_of_jobs },
            { label: 'Main Work', value: row => row.main_work || 'No jobs yet' },
            { label: 'Balance Owed', value: row => naira(row.balance_owed) }
        ]
    };
    function drawPartners() {
        const allCards = document.querySelector('.partner-cards');
        if (!allCards) return;
        const query = document.getElementById('partner-search').value.toLowerCase().trim(),
            mode = document.getElementById('sort-partners').selectedIndex;
        const rows = partnersList.filter(row =>
            [row.name, row.phone_number, row.work_type, 'p' + row.partner_id].some(value =>
                String(value || '')
                    .toLowerCase()
                    .includes(query)
            )
        );
        rows.sort((a, b) =>
            mode === 3
                ? Number(b.total_agreed) - Number(a.total_agreed)
                : mode === 1
                  ? a.partner_id - b.partner_id
                  : mode === 2
                    ? b.partner_id - a.partner_id
                    : a.name.localeCompare(b.name)
        );
        displayPartners(rows, partnerConfig, allCards);
        [...allCards.children].forEach((card, index) => {
            card.dataset.partnerId = rows[index].partner_id;
            const balance = [...card.querySelectorAll('div')].find(
                box => box.firstElementChild?.textContent === 'Balance Owed'
            );
            if (balance) markBalance(balance, rows[index].balance_owed);
        });
        if (!rows.length)
            allCards.appendChild(
                el(
                    'p',
                    'No partners yet. Add the welders, fabricators, electricians and dealers who work for the company.',
                    'partner-empty'
                )
            );
        const open = allCards.querySelector('[data-partner-id="' + openPartnerId + '"]>button');
        if (open) open.click();
    }
    // Opening the page shows every card closed, unless a link asked for one partner.
    // Reloading after a save passes reopen, so the partner that was open stays in view.
    window.loadOtherPartners = async function (reopen) {
        const allCards = document.querySelector('.partner-cards');
        if (!allCards) return;
        if (reopen !== true) {
            openPartnerId = partnerToOpen;
            partnerToOpen = null;
        }
        try {
            const response = await fetch('/api/partners');
            partnersList = await response.json();
            if (!response.ok) throw Error(partnersList.err);
            drawPartners();
        } catch (error) {
            allCards.replaceChildren(el('p', error.message || 'Could not load partners.', 'partner-empty'));
        }
    };
    async function renderPartnerDetails(partner, card) {
        openPartnerId = partner.partner_id;
        const details = el('section', undefined, 'partner-details');
        card.appendChild(details);
        const footer = card.querySelector(':scope>button');
        if (footer) {
            footer.firstElementChild.textContent = 'Hide Details';
            footer.setAttribute('aria-expanded', 'true');
        }
        const note = el('div', undefined, 'partner-details-note');
        const edit = el('button', 'Edit partner', 'partner-details-edit-btn');
        edit.type = 'button';
        edit.onclick = () => {
            window.location.href = 'forms.html?partnerId=' + partner.partner_id + '#partner-addition';
        };
        note.append(
            edit,
            el('h5', 'Partner Note', 'partner-details-heading'),
            el('p', partner.note || 'No note recorded.', 'partner-details-note-text')
        );
        if (role() === 'admin') {
            const hasJobs = Number(partner.number_of_jobs) > 0;
            const remove = el('button', hasJobs ? 'Archive partner' : 'Delete partner', 'partner-details-delete-btn');
            remove.type = 'button';
            remove.onclick = () =>
                confirmAction(
                    hasJobs ? 'Archive Partner' : 'Delete Partner',
                    hasJobs
                        ? 'Archive ' +
                              partner.name +
                              '? It will no longer show under Other Partners. Its jobs, payments, expenses and assets are kept, so past figures do not change.'
                        : 'Delete ' + partner.name + '? It has no jobs.',
                    hasJobs ? 'Archive Partner' : 'Delete Partner',
                    async () => {
                        const result = await send('/api/partners/' + partner.partner_id, 'DELETE');
                        openPartnerId = null;
                        await window.loadOtherPartners(true);
                        return result;
                    }
                );
            note.appendChild(remove);
        }
        if (partner.work_type) note.appendChild(el('p', 'Work: ' + partner.work_type, 'partner-details-work'));
        const summary = el('div', undefined, 'partner-details-summary');
        summary.append(
            createCardValues('Total Agreed', naira(partner.total_agreed)),
            createCardValues('Total Paid', naira(partner.total_paid)),
            createCardValues('Balance Owed', naira(partner.balance_owed))
        );
        markBalance(summary.lastElementChild, partner.balance_owed);
        const add = el('button', '+ Add Job', 'partner-add-job');
        add.type = 'button';
        add.onclick = () => openJobDialog(partner);
        const heading = el('h5', 'Work and Payments', 'partner-details-heading');
        const list = el('div', 'Loading jobs…', 'partner-job-list');
        details.append(note, summary, add, heading, list);
        try {
            const response = await fetch('/api/partners/' + partner.partner_id + '/jobs');
            const jobs = await response.json();
            if (!response.ok) throw Error(jobs.err);
            heading.appendChild(
                el('span', ' · ' + jobs.length + ' ' + (jobs.length === 1 ? 'job' : 'jobs'), 'partner-job-count')
            );
            list.replaceChildren(
                ...(jobs.length
                    ? jobs.map(job => renderJob(partner, job))
                    : [el('p', 'No jobs recorded yet.', 'partner-empty')])
            );
        } catch (error) {
            list.textContent = error.message || 'Could not load jobs.';
        }
    }
    function renderJob(partner, job) {
        const card = el('article', undefined, 'partner-job');
        const top = el('div', undefined, 'partner-job-top');
        top.append(
            el('span', job.job_type, 'partner-job-type type-' + slug(job.job_type)),
            el('span', formatDate(job.job_day), 'partner-job-date'),
            el(
                'span',
                job.cost_category === 'Capital'
                    ? 'Capital asset' + (job.asset_type ? ' · ' + job.asset_type : '')
                    : 'Running expense',
                'partner-job-cost cost-' + slug(job.cost_category)
            )
        );
        const values = el('div', undefined, 'partner-job-values');
        values.append(
            createCardValues('Agreed', naira(job.agreed_amount)),
            createCardValues('Paid', naira(job.paid)),
            createCardValues('Owed', naira(job.owed))
        );
        markBalance(values.lastElementChild, job.owed);
        const payments = el('div', undefined, 'partner-payments');
        if (!job.payments.length) payments.appendChild(el('p', 'No payments yet.', 'partner-empty'));
        for (const payment of job.payments) {
            const row = el('div', undefined, 'partner-payment' + (payment.reversed_on ? ' is-reversed' : ''));
            row.append(
                el(
                    'span',
                    formatDate(payment.payment_date) +
                        ' · ' +
                        payment.payment_method +
                        (payment.reference_number ? ' · ' + payment.reference_number : '')
                ),
                el('strong', naira(payment.amount))
            );
            if (payment.reversed_on)
                row.appendChild(
                    el('small', 'Reversed ' + formatDate(payment.reversed_on) + ': ' + payment.reversal_reason, 'partner-payment-reversal')
                );
            else if (role() === 'admin') {
                const remove = el('button', 'Reverse');
                remove.type = 'button';
                remove.onclick = () => deletePayment(payment, job);
                row.appendChild(remove);
            }
            payments.appendChild(row);
        }
        const actions = el('div', undefined, 'partner-job-actions');
        if (role() === 'admin' && Number(job.owed) > 0) {
            const pay = el('button', 'Record Payment', 'partner-pay');
            pay.type = 'button';
            pay.onclick = () => openPaymentDialog(partner, job);
            actions.appendChild(pay);
        }
        const edit = el('button', 'Edit Job');
        edit.type = 'button';
        edit.onclick = () => openJobDialog(partner, job);
        actions.appendChild(edit);
        if (role() === 'admin' && !job.payments.length) {
            const remove = el('button', 'Delete Job', 'partner-delete');
            remove.type = 'button';
            remove.onclick = () => deleteJob(job);
            actions.appendChild(remove);
        }
        card.append(
            top,
            el('p', job.description, 'partner-job-description'),
            values,
            el('h6', 'Payments', 'partner-payments-heading'),
            payments,
            actions
        );
        return card;
    }
    function openJobDialog(partner, job) {
        const inputs = openDialog(
            job ? 'Edit Job' : 'Add Job for ' + partner.name,
            [
                {
                    label: 'Job date',
                    name: 'job_date',
                    type: 'date',
                    value: job ? job.job_day : new Date().toISOString().slice(0, 10)
                },
                {
                    label: 'Type of job',
                    name: 'job_type',
                    options: JOB_TYPES,
                    placeholder: 'Select the type of job',
                    value: job?.job_type
                },
                {
                    label: 'What was done',
                    name: 'description',
                    type: 'textarea',
                    value: job?.description,
                    help: 'For example: Fabricate 5,000-litre oil settling tank.'
                },
                { label: 'Agreed price (₦)', name: 'agreed_amount', type: 'number', value: job?.agreed_amount },
                {
                    label: 'Cost type',
                    name: 'cost_category',
                    options: ['Capital', 'Running'],
                    value: job?.cost_category,
                    help: 'Capital: something the company owns (machine, tank). Running: repairs and servicing, counted in profit.'
                },
                {
                    label: 'Asset type',
                    name: 'asset_type',
                    options: ASSET_TYPES,
                    placeholder: 'Select the asset type',
                    value: job?.asset_type || '',
                    required: false,
                    help: 'Needed for capital jobs.'
                }
            ],
            job ? 'Save Job' : 'Add Job',
            async values => {
                const result = await send(
                    job ? '/api/partner-jobs/' + job.job_id : '/api/partners/' + partner.partner_id + '/jobs',
                    job ? 'PATCH' : 'POST',
                    values
                );
                await window.loadOtherPartners(true);
                return {
                    message: job
                        ? 'Job updated.'
                        : 'Job added.' +
                          (values.cost_category === 'Capital' ? ' It is now in Assets and Start-up Costs.' : '')
                };
            }
        );
        // Fabrication, installation and equipment purchases default to capital; others to running cost.
        const sync = () => {
            const capital = inputs.cost_category.value === 'Capital';
            inputs.asset_type.closest('label').hidden = !capital;
            inputs.asset_type.required = capital;
        };
        inputs.job_type.onchange = () => {
            inputs.cost_category.value = CAPITAL_TYPES.includes(inputs.job_type.value) ? 'Capital' : 'Running';
            sync();
        };
        inputs.cost_category.onchange = sync;
        if (!job) inputs.cost_category.value = 'Running';
        sync();
    }
    function openPaymentDialog(partner, job) {
        // One key per opened form: sending it again after a lost connection returns the payment already saved.
        const submissionKey = crypto.randomUUID();
        openDialog(
            'Record Payment to ' + partner.name,
            [
                { label: 'Amount paid (₦) · owed ' + naira(job.owed), name: 'amount', type: 'number', value: job.owed },
                {
                    label: 'Payment date',
                    name: 'payment_date',
                    type: 'date',
                    value: new Date().toISOString().slice(0, 10)
                },
                {
                    label: 'Payment method',
                    name: 'payment_method',
                    options: ['Bank Transfer', 'Cash', 'Cheque', 'POS'],
                    placeholder: 'Select method'
                },
                { label: 'Bank reference (optional)', name: 'reference_number', required: false },
                { label: 'Note (optional)', name: 'note', type: 'textarea', required: false }
            ],
            'Save Payment',
            async values => {
                await send('/api/partner-jobs/' + job.job_id + '/payments', 'POST', { ...values, submission_key: submissionKey });
                await window.loadOtherPartners(true);
                return {
                    message:
                        'Payment recorded.' +
                        (job.cost_category === 'Running'
                            ? ' It is also in Expenses as a running cost.'
                            : ' It is shown against the asset in Assets and Start-up Costs.')
                };
            }
        );
    }
    function confirmAction(title, text, label, action) {
        return openDialog(title, [], label, action, text);
    }
    // A wrong payment is reversed with a reason; it stays listed, marked as reversed, and no longer counts as paid.
    function deletePayment(payment, job) {
        openDialog(
            'Reverse Payment',
            [{ label: 'Reason for reversing', name: 'reason', type: 'textarea', max: 300 }],
            'Reverse Payment',
            async values => {
                const result = await send('/api/partner-payments/' + payment.payment_id, 'DELETE', { reason: values.reason });
                await window.loadOtherPartners(true);
                return result;
            },
            'Reverse the ' +
                naira(payment.amount) +
                ' payment of ' +
                formatDate(payment.payment_date) +
                '? It stays listed as reversed and no longer counts as paid.' +
                (job.cost_category === 'Running' ? ' Its running expense will be removed.' : '')
        );
    }
    function deleteJob(job) {
        confirmAction(
            'Delete Job',
            'Delete “' +
                job.description +
                '”?' +
                (job.cost_category === 'Capital' ? ' Its asset entry will also be removed.' : ''),
            'Delete Job',
            async () => {
                const result = await send('/api/partner-jobs/' + job.job_id, 'DELETE');
                await window.loadOtherPartners(true);
                return result;
            }
        );
    }
    // Add or edit a partner's contact details.
    const partnerForm = document.getElementById('partner-form');
    window.preparePartnerForm = async function () {
        if (!partnerForm) return;
        partnerForm.reset();
        const id = new URLSearchParams(location.search).get('partnerId');
        const section = document.getElementById('partner-addition');
        section.querySelector('h2').textContent = id ? 'Edit Partner' : 'Add Partner';
        if (!id) return;
        try {
            const response = await fetch('/api/partners/' + id);
            const partner = await response.json();
            if (!response.ok) throw Error(partner.err);
            for (const [field, key] of [
                ['name', 'name'],
                ['phone', 'phone_number'],
                ['address', 'address'],
                ['email', 'email'],
                ['work_type', 'work_type'],
                ['note', 'note']
            ])
                partnerForm.elements[field].value = partner[key] || '';
        } catch (error) {
            appNotify(error.message || 'Could not load the partner.');
        }
    };
    if (partnerForm) {
        partnerForm.addEventListener('submit', async event => {
            event.preventDefault();
            const id = new URLSearchParams(location.search).get('partnerId');
            try {
                await send(
                    id ? '/api/partners/' + id : '/api/partners',
                    id ? 'PATCH' : 'POST',
                    Object.fromEntries(new FormData(partnerForm))
                );
                appNotify(id ? 'Partner updated.' : 'Partner added.');
                partnerToOpen = id ? Number(id) : null;
                history.replaceState({}, '', 'forms.html#other-partners');
                await displaySelectedForm();
            } catch (error) {
                appNotify(error.message);
            }
        });
        partnerForm.querySelector('.partner-cancel').addEventListener('click', () => {
            history.replaceState({}, '', 'forms.html#other-partners');
            displaySelectedForm();
        });
    }
    document.getElementById('add-partner')?.addEventListener('click', () => {
        history.pushState({}, '', 'forms.html#partner-addition');
        displaySelectedForm();
    });
    document.getElementById('partner-search')?.addEventListener('input', drawPartners);
    document.getElementById('sort-partners')?.addEventListener('change', drawPartners);

    // ---------- Assets and Start-up Costs ----------
    // One page shows what the company owns (at cost) and what it cost to set up before production.
    const icon = name => (window.AppUI ? AppUI.icon(name) : el('span'));
    const typeIcon = type =>
        ({ Machine: 'gear', Tank: 'tank', Electrical: 'electricity', Building: 'building', Vehicle: 'truck' })[type] ||
        'box';
    // A labelled figure with its icon, used for the totals and each card's values.
    function figure(label, value, iconName, cls) {
        const box = el('div', undefined, cls);
        const text = el('div');
        text.append(el('span', label), el('strong', value));
        box.append(icon(iconName), text);
        return box;
    }
    function button(label, iconName, cls, action) {
        const node = el('button', undefined, cls);
        node.type = 'button';
        node.append(icon(iconName), el('span', label));
        node.onclick = action;
        return node;
    }
    let assetRows = [];
    function drawAssets() {
        const list = document.querySelector('.asset-cards');
        const query = document.querySelector('.asset-search').value.toLowerCase().trim();
        const rows = assetRows.filter(row =>
            [row.name, row.asset_type, row.source, row.job_type].some(value =>
                String(value || '')
                    .toLowerCase()
                    .includes(query)
            )
        );
        list.replaceChildren(
            ...(rows.length
                ? rows.map(renderAsset)
                : [el('p', assetRows.length ? 'No matching assets.' : 'No assets recorded yet.', 'partner-empty')])
        );
    }
    window.loadCapitalAssets = async function () {
        const list = document.querySelector('.asset-cards'),
            summary = document.querySelector('.asset-summary');
        if (!list) return;
        const breakdown = document.querySelector('.asset-breakdown'),
            startupList = document.querySelector('.startup-cards');
        document.getElementById('add-asset').hidden = role() !== 'admin';
        if (document.getElementById('capital-assets')?.dataset.assetTab === 'prepaid') window.loadPrepaidExpenses();
        list.textContent = 'Loading assets…';
        startupList.textContent = 'Loading start-up costs…';
        try {
            // Start-up costs are for the Director only; for other roles the server refuses them (403)
            // and the page shows assets alone, without the start-up and total invested figures.
            const responses = await Promise.all([fetch('/api/capital-assets'), fetch('/api/startup-costs')]);
            const [assets, startupResult] = await Promise.all(responses.map(response => response.json()));
            if (!responses[0].ok) throw Error(assets.err);
            const showStartup = responses[1].status !== 403;
            if (showStartup && !responses[1].ok) throw Error(startupResult.err);
            const startup = showStartup ? startupResult : [];
            const total = assets.reduce((sum, row) => sum + Number(row.cost), 0),
                paid = assets.reduce((sum, row) => sum + Number(row.paid), 0);
            const startupTotal = startup.reduce((sum, row) => sum + Number(row.startup_amount), 0);
            // Assets Owned is one figure split into what is paid and what is still owed, shown as one bar.
            const owedAmount = total - paid,
                paidShare = total > 0 ? Math.round((paid / total) * 100) : 0;
            const owned = el('div', undefined, 'asset-owned');
            const ownedHead = figure('Assets Owned (at cost)', naira(total), 'coins', 'asset-owned-head');
            const bar = el('div', undefined, 'asset-owned-bar');
            bar.setAttribute('role', 'img');
            bar.setAttribute('aria-label', paidShare + '% paid, ' + (100 - paidShare) + '% still owed');
            const paidPart = el('span', undefined, 'is-paid-part');
            paidPart.style.width = paidShare + '%';
            bar.appendChild(paidPart);
            const legend = el('div', undefined, 'asset-owned-legend');
            const legendRow = (cls, label, amount, share) => {
                const row = el('div', undefined, cls);
                row.append(el('i'), el('span', label), el('strong', naira(amount)), el('small', share + '%'));
                return row;
            };
            legend.append(
                legendRow('is-paid-row', 'Paid', paid, paidShare),
                legendRow(
                    'is-owed-row' + (owedAmount > 0 ? ' has-owed' : ''),
                    'Still owed',
                    owedAmount,
                    100 - paidShare
                )
            );
            owned.append(ownedHead, bar, legend);
            const startupTile = figure('Start-up Costs', naira(startupTotal), 'layers', 'asset-total is-startup');
            startupTile.appendChild(el('small', 'Costs from before production', 'asset-startup-note'));
            // Total Invested shows the sum it is made of.
            const invested = el('div', undefined, 'asset-invested');
            const label = el('div');
            label.append(icon('calculator'), el('span', 'Total Invested'));
            const sum = el('div', undefined, 'asset-invested-sum');
            sum.append(
                el('strong', naira(total + startupTotal)),
                el('small', naira(total) + ' assets + ' + naira(startupTotal) + ' start-up')
            );
            invested.append(label, sum);
            summary.replaceChildren(...(showStartup ? [owned, startupTile, invested] : [owned]));
            // Asset value by type, largest first; the largest is shown in dark green.
            const byType = {};
            for (const asset of assets) byType[asset.asset_type] = (byType[asset.asset_type] || 0) + Number(asset.cost);
            breakdown.replaceChildren(
                ...Object.entries(byType)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, cost], index) => {
                        const chip = el('span', undefined, 'asset-type-total' + (index === 0 ? ' is-largest' : ''));
                        chip.append(el('span', type), el('strong', naira(cost)));
                        return chip;
                    })
            );
            assetRows = assets;
            drawAssets();
            startupList.replaceChildren(
                ...(startup.length
                    ? startup.map(renderStartupCost)
                    : [el('p', 'No start-up costs recorded yet.', 'partner-empty')])
            );
        } catch (error) {
            list.textContent = error.message || 'Could not load assets.';
            startupList.textContent = '';
        }
    };
    function renderStartupCost(cost) {
        const card = el('article', undefined, 'startup-card');
        const text = el('div', undefined, 'startup-card-text');
        const months = Number(cost.spread_months);
        text.append(
            el('strong', cost.description, 'asset-name'),
            el(
                'p',
                formatDate(cost.expense_date) +
                    ' · ' +
                    (months > 1
                        ? cost.startup_months +
                          ' of ' +
                          months +
                          ' months of a ' +
                          naira(cost.amount_spent) +
                          ' payment'
                        : 'Whole payment counted as start-up'),
                'asset-source'
            )
        );
        const actions = el('div', undefined, 'startup-card-actions');
        const edit = el('button', 'Edit', 'startup-edit');
        edit.type = 'button';
        edit.onclick = () => openStartupDialog(cost);
        const remove = el('button', 'Delete', 'startup-delete');
        remove.type = 'button';
        remove.onclick = () =>
            confirmAction(
                'Delete ' + cost.description,
                'This removes the whole ' +
                    naira(cost.amount_spent) +
                    ' payment, including any months counted as running expenses.',
                'Delete',
                async () => {
                    await send('/api/correction_delete', 'DELETE', { kind: 'expenses', record: cost });
                    await window.loadCapitalAssets();
                    return { message: 'Start-up cost deleted.' };
                }
            );
        actions.append(edit, remove);
        card.append(icon('building'), text, el('span', naira(cost.startup_amount), 'startup-amount'), actions);
        return card;
    }
    function renderAsset(asset) {
        const card = el('article', undefined, 'asset-card');
        const picture = el('div', undefined, 'asset-picture type-' + slug(asset.asset_type));
        picture.appendChild(icon(typeIcon(asset.asset_type)));
        const main = el('div', undefined, 'asset-main');
        const top = el('div', undefined, 'asset-card-top');
        top.append(
            el('strong', asset.name, 'asset-name'),
            el('span', asset.asset_type, 'asset-type type-' + slug(asset.asset_type))
        );
        const values = el('div', undefined, 'asset-values');
        values.append(
            figure('Acquired', formatDate(asset.acquired_day), 'calendar'),
            figure('Cost', naira(asset.cost), 'coins'),
            figure('Paid', naira(asset.paid), 'confirm')
        );
        const owed = Number(asset.cost) - Number(asset.paid);
        if (owed > 0) values.appendChild(figure('Owed', naira(owed), 'hourglass', 'is-owed'));
        main.append(top, values);
        const source = el('p', undefined, 'asset-source');
        source.append(
            icon(asset.job_id ? 'people' : 'user'),
            el(
                'span',
                (asset.job_id ? 'From partner: ' : 'From: ') +
                    (asset.source || 'Not recorded') +
                    (asset.job_type ? ' · ' + asset.job_type : '')
            )
        );
        card.append(picture, main, source);
        if (asset.note) card.appendChild(el('p', asset.note, 'asset-note'));
        if (role() === 'admin') {
            const actions = el('div', undefined, 'partner-job-actions asset-actions');
            actions.appendChild(button('Edit', 'pen', 'asset-edit', () => openAssetDialog(asset)));
            if (asset.job_id)
                actions.appendChild(
                    button('Open Partner', 'external', 'asset-open', () => {
                        partnerToOpen = asset.partner_id;
                        history.pushState({}, '', 'forms.html#other-partners');
                        displaySelectedForm();
                    })
                );
            else
                actions.appendChild(
                    button('Delete', 'trash', 'partner-delete', () =>
                        confirmAction(
                            'Delete Asset',
                            'Delete “' + asset.name + '” from Assets and Start-up Costs?',
                            'Delete Asset',
                            async () => {
                                const result = await send('/api/capital-assets/' + asset.asset_id, 'DELETE');
                                await window.loadCapitalAssets();
                                return result;
                            }
                        )
                    )
                );
            card.appendChild(actions);
        }
        return card;
    }
    // The search button opens a box that filters the asset cards.
    const searchToggle = document.querySelector('.asset-search-toggle'),
        searchBox = document.querySelector('.asset-search');
    if (searchToggle && searchBox) {
        searchToggle.appendChild(icon('search'));
        searchToggle.onclick = () => {
            searchBox.hidden = !searchBox.hidden;
            searchToggle.setAttribute('aria-expanded', String(!searchBox.hidden));
            if (!searchBox.hidden) searchBox.focus();
            else {
                searchBox.value = '';
                drawAssets();
            }
        };
        searchBox.oninput = drawAssets;
    }
    document.querySelector('.startup-panel-icon')?.appendChild(icon('layers'));
    // The page title uses a cubes icon in a green tile.
    const assetTitle = document.querySelector('#capital-assets h1');
    if (assetTitle) {
        const tile = el('span', undefined, 'asset-title-icon');
        tile.appendChild(icon('cubes'));
        const replace = () => {
            assetTitle.querySelector(':scope>.workspace-art')?.remove();
            if (!assetTitle.querySelector('.asset-title-icon')) assetTitle.prepend(tile);
        };
        replace();
        setTimeout(replace, 0);
    }
    function openAssetDialog(asset) {
        const linked = Boolean(asset?.job_id);
        openDialog(
            asset ? 'Edit Asset' : 'Add Asset',
            [
                {
                    label: 'Asset name',
                    name: 'name',
                    value: asset?.name,
                    disabled: linked,
                    help: linked ? 'Name, date and cost come from the partner job.' : undefined
                },
                {
                    label: 'Asset type',
                    name: 'asset_type',
                    options: ASSET_TYPES,
                    placeholder: 'Select the asset type',
                    value: asset?.asset_type
                },
                {
                    label: 'Date acquired',
                    name: 'acquired_date',
                    type: 'date',
                    value: asset ? asset.acquired_day : new Date().toISOString().slice(0, 10),
                    disabled: linked
                },
                { label: 'Cost (₦)', name: 'cost', type: 'number', value: asset?.cost, disabled: linked },
                { label: 'Bought from', name: 'source', value: asset?.source, required: false, disabled: linked },
                {
                    label: 'Note (optional)',
                    name: 'note',
                    type: 'textarea',
                    value: asset?.note,
                    required: false,
                    max: 500,
                    help: 'Serial number, location or warranty.'
                }
            ],
            asset ? 'Save Asset' : 'Add Asset',
            async values => {
                await send(
                    asset ? '/api/capital-assets/' + asset.asset_id : '/api/capital-assets',
                    asset ? 'PATCH' : 'POST',
                    values
                );
                await window.loadCapitalAssets();
                return { message: asset ? 'Asset updated.' : 'Asset added.' };
            }
        );
    }
    document.getElementById('add-asset')?.addEventListener('click', () => openAssetDialog());
    // A start-up cost is saved as an expense; its first months before production count as start-up costs.
    // Director only. Passing a saved start-up cost opens the same dialog to edit it.
    function openStartupDialog(cost) {
        // One key per opened form, so a retried save cannot add the same start-up cost twice.
        const submissionKey = crypto.randomUUID();
        const inputs = openDialog(
            cost ? 'Edit Start-up Cost' : 'Add Start-up Cost',
            [
                {
                    label: 'Date paid',
                    name: 'expense_date',
                    type: 'date',
                    value: cost?.expense_date || new Date().toISOString().slice(0, 10)
                },
                {
                    label: 'Description',
                    name: 'description',
                    max: 100,
                    value: cost?.description || '',
                    help: 'For example: Factory rent, January to December.'
                },
                { label: 'Amount paid (₦)', name: 'amount_spent', type: 'number', value: cost?.amount_spent },
                {
                    label: 'Months it covers',
                    name: 'spread_months',
                    type: 'number',
                    value: cost?.spread_months || 1,
                    help: 'Starting with the month it was paid. Use 1 for a one-off cost such as registration fees.'
                },
                {
                    label: 'Months before production',
                    name: 'startup_months',
                    type: 'number',
                    value: cost?.startup_months || 1,
                    help: 'These months count as start-up costs; any later months count as normal running expenses.'
                }
            ],
            cost ? 'Save Changes' : 'Add Start-up Cost',
            async values => {
                const months = Number(values.spread_months),
                    startup = Number(values.startup_months);
                if (!Number.isInteger(startup) || startup < 1 || startup > months)
                    throw Error('Months before production must be from 1 to the months it covers.');
                const record = { ...values, category: 'Expenses', submission_key: submissionKey };
                if (cost)
                    await send('/api/correction_edit', 'PATCH', {
                        kind: 'expenses',
                        record: { ...record, expense_id: cost.expense_id }
                    });
                else await send('/api/expenses', 'POST', record);
                await window.loadCapitalAssets();
                if (cost && location.hash === '#expenses-data' && typeof loadExpensesData === 'function')
                    await loadExpensesData();
                return {
                    message: cost ? 'Start-up cost updated.' : 'Start-up cost added. It is also listed in Expenses.'
                };
            }
        );
        for (const name of ['spread_months', 'startup_months']) {
            inputs[name].min = '1';
            inputs[name].max = '60';
            inputs[name].step = '1';
            inputs[name].inputMode = 'numeric';
        }
        inputs.description.maxLength = 100;
    }
    window.openStartupDialog = openStartupDialog;
    document.getElementById('add-startup-cost')?.addEventListener('click', () => openStartupDialog());
    // Rent, insurance or a licence paid in advance after production started: one payment counted evenly over its months.
    // Only the Director sees the add button (partners.css); the server also refuses months from other roles.
    // Passing a saved expense opens the same dialog to edit it, including its months.
    function openPrepaidDialog(expense) {
        // One key per opened form, so a retried save cannot add the same rent or insurance twice.
        const submissionKey = crypto.randomUUID();
        const inputs = openDialog(
            expense ? 'Edit Prepaid Cost' : 'Add Prepaid Cost',
            [
                {
                    label: 'Date paid',
                    name: 'expense_date',
                    type: 'date',
                    value: expense?.expense_date || new Date().toISOString().slice(0, 10)
                },
                {
                    label: 'Description',
                    name: 'description',
                    max: 100,
                    value: expense?.description || '',
                    help: 'For example: Factory rent, January to December 2027.'
                },
                { label: 'Amount paid (₦)', name: 'amount_spent', type: 'number', value: expense?.amount_spent },
                {
                    label: 'Months it covers',
                    name: 'spread_months',
                    type: 'number',
                    value: expense?.spread_months || 12,
                    help: 'Starting with the month it was paid. The dashboard counts an equal share each day, like salaries.'
                }
            ],
            expense ? 'Save Changes' : 'Add Cost',
            async values => {
                const record = { ...values, category: 'Expenses', startup_months: 0, submission_key: submissionKey };
                if (expense)
                    await send('/api/correction_edit', 'PATCH', {
                        kind: 'expenses',
                        record: { ...record, expense_id: expense.expense_id }
                    });
                else await send('/api/expenses', 'POST', record);
                await window.loadPrepaidExpenses();
                if (expense && location.hash === '#expenses-data' && typeof loadExpensesData === 'function')
                    await loadExpensesData();
                return {
                    message:
                        (expense ? 'Changes saved.' : 'Cost added.') +
                        ' It is spread over ' +
                        values.spread_months +
                        ' months.'
                };
            },
            'For costs from before production, use Start-up Costs in Assets and Start-up Costs instead.'
        );
        Object.assign(inputs.spread_months, { min: '1', max: '60', step: '1', inputMode: 'numeric' });
        inputs.description.maxLength = 100;
    }
    window.openPrepaidDialog = openPrepaidDialog;
    // Prepaid costs already added are listed on the Prepaid Costs tab of Assets and Start-up Costs, each with Edit and Delete.
    const monthName = (date, add) => {
        const [year, month] = date.split('-').map(Number);
        return new Date(year, month - 1 + add, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    };
    window.loadPrepaidExpenses = async function () {
        const list = document.getElementById('prepaid-expense-list');
        if (!list) return;
        try {
            const response = await fetch('/api/expenses');
            const rows = await response.json();
            if (!response.ok) throw Error(rows.err);
            const prepaid = rows
                .filter(row => Number(row.spread_months) > 1 && !Number(row.startup_months))
                .sort((a, b) => b.expense_date.localeCompare(a.expense_date));
            list.replaceChildren(
                ...(prepaid.length
                    ? prepaid.map(renderPrepaid)
                    : [el('p', 'No prepaid costs added yet.', 'prepaid-empty')])
            );
        } catch (error) {
            list.replaceChildren(el('p', error.message || 'Could not load rent and prepaid costs.', 'prepaid-empty'));
        }
    };
    function renderPrepaid(expense) {
        const months = Number(expense.spread_months),
            row = el('article', undefined, 'prepaid-item');
        const text = el('div', undefined, 'prepaid-item-text');
        text.append(
            el('strong', expense.description),
            el('p', naira(expense.amount_spent) + ' paid ' + formatDate(expense.expense_date)),
            el(
                'p',
                naira(Number(expense.amount_spent) / months) +
                    ' a month · ' +
                    months +
                    ' months, ' +
                    monthName(expense.expense_date, 0) +
                    ' to ' +
                    monthName(expense.expense_date, months - 1)
            )
        );
        const actions = el('div', undefined, 'prepaid-item-actions');
        const edit = el('button', 'Edit', 'prepaid-edit');
        edit.type = 'button';
        edit.onclick = () => openPrepaidDialog(expense);
        const remove = el('button', 'Delete', 'prepaid-delete');
        remove.type = 'button';
        remove.onclick = () =>
            confirmAction(
                'Delete ' + expense.description,
                'This removes the whole ' + naira(expense.amount_spent) + ' payment from expenses and profit.',
                'Delete',
                async () => {
                    await send('/api/correction_delete', 'DELETE', { kind: 'expenses', record: expense });
                    await window.loadPrepaidExpenses();
                    return { message: 'Deleted.' };
                }
            );
        actions.append(edit, remove);
        row.append(text, actions);
        return row;
    }
    document.getElementById('add-prepaid-expense')?.addEventListener('click', () => openPrepaidDialog());
    // Assets and Start-up Costs shows one part at a time: Summary (the totals), Assets, Start-up Costs or Prepaid Costs.
    function showAssetTab(name) {
        const page = document.getElementById('capital-assets');
        if (!page) return;
        page.querySelectorAll('[data-asset-tab]').forEach(tab =>
            tab.setAttribute('aria-selected', String(tab.dataset.assetTab === name))
        );
        page.querySelectorAll('[data-asset-panel]').forEach(panel => {
            panel.hidden = panel.dataset.assetPanel !== name;
        });
        page.dataset.assetTab = name;
        if (name === 'prepaid') window.loadPrepaidExpenses();
    }
    document
        .querySelectorAll('#capital-assets [data-asset-tab]')
        .forEach(tab => tab.addEventListener('click', () => showAssetTab(tab.dataset.assetTab)));
    showAssetTab('summary');
    // The page may already be open before this script finished loading, so load it now too.
    if (location.hash === '#other-partners') window.loadOtherPartners();
    else if (location.hash === '#capital-assets') window.loadCapitalAssets();
    else if (location.hash === '#partner-addition') window.preparePartnerForm();
})();
