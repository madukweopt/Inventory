// Purchase-linked sample tests. All weights are grams; stock and prices are untouched.
window.decorateKernelPurchase = function (card, purchase) {
    if (String(purchase.name).trim().toLowerCase() !== 'p kernel') return;
    const panel = document.createElement('details');
    panel.className = 'kernel-quality';
    const summary = document.createElement('summary');
    summary.textContent = 'Kernel quality · Sample tests';
    const content = document.createElement('div');
    content.className = 'kernel-quality-content';
    panel.append(summary, content);
    card.body.after(panel);
    panel.addEventListener('click', event => event.stopPropagation());
    const endpoint = '/api/purchases/' + purchase.purchase_id + '/kernel-tests';
    let loaded = false,
        loading = false;
    const percent = value =>
        Number(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    const weight = value => Number(value).toLocaleString('en-NG', { maximumFractionDigits: 3 }) + ' g';
    function notice(text) {
        const message = document.createElement('p');
        message.setAttribute('role', 'status');
        message.textContent = text;
        return message;
    }
    function render(data) {
        content.replaceChildren();
        const description = document.createElement('p');
        description.className = 'kernel-quality-help';
        description.textContent =
            'Sort a small sample and weigh the unwanted material. Enter both weights in grams. These tests do not change stock or supplier payments.';
        content.appendChild(description);
        if (data.summary.test_count) {
            summary.textContent =
                'Kernel quality · ' +
                percent(data.summary.impurity_percentage) +
                ' impurity · ' +
                data.summary.test_count +
                ' test' +
                (data.summary.test_count === 1 ? '' : 's');
            const totals = document.createElement('div');
            totals.className = 'kernel-quality-totals';
            [
                ['Combined impurity', percent(data.summary.impurity_percentage)],
                ['Clean kernels', percent(data.summary.clean_percentage)],
                ['Total sampled', weight(data.summary.sample_weight_g)],
                ['Total impurities', weight(data.summary.impurity_weight_g)]
            ].forEach(([label, value]) => {
                const metric = document.createElement('div');
                const caption = document.createElement('span');
                caption.textContent = label;
                const amount = document.createElement('strong');
                amount.textContent = value;
                metric.append(caption, amount);
                totals.appendChild(metric);
            });
            content.appendChild(totals);
            const explanation = document.createElement('p');
            explanation.className = 'kernel-quality-help';
            explanation.textContent = 'Combined result = total impurity weight ÷ total sample weight × 100.';
            content.appendChild(explanation);
        } else {
            summary.textContent = 'Kernel quality · No tests recorded';
            const empty = document.createElement('p');
            empty.className = 'kernel-quality-help';
            empty.textContent = 'No sample tests recorded for this delivery.';
            content.appendChild(empty);
        }
        if (window.decorateReferenceQualitySummary) window.decorateReferenceQualitySummary(summary);
        const list = document.createElement('div');
        list.className = 'kernel-quality-tests';
        data.tests.forEach((test, index) => {
            const row = document.createElement('article');
            row.className = 'kernel-quality-test';
            const title = document.createElement('strong');
            title.textContent = 'Sample ' + (index + 1) + ' · ' + percent(test.impurity_percentage) + ' impurity';
            const weights = document.createElement('p');
            weights.textContent =
                weight(test.impurity_weight_g) +
                ' impurities / ' +
                weight(test.sample_weight_g) +
                ' sample · ' +
                percent(test.clean_percentage) +
                ' clean';
            const meta = document.createElement('small');
            meta.textContent =
                new Date(test.created_at).toLocaleString() +
                (test.recorded_by_name ? ' · ' + test.recorded_by_name : '');
            row.append(title, weights, meta);
            if (document.documentElement.dataset.userRole === 'admin') {
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'delete-btn';
                remove.textContent = 'Delete test';
                remove.onclick = async () => {
                    if (!window.confirm('Delete this sample test? The combined quality result will be recalculated.'))
                        return;
                    remove.disabled = true;
                    try {
                        const response = await fetch(endpoint + '/' + test.test_id, { method: 'DELETE' });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.err || 'Could not delete test.');
                        render(result);
                        appNotify(result.message);
                    } catch (error) {
                        appNotify(error.message, { type: 'error' });
                        remove.disabled = false;
                    }
                };
                row.appendChild(remove);
            }
            list.appendChild(row);
        });
        content.appendChild(list);
        if (!['admin', 'storekeeper'].includes(document.documentElement.dataset.userRole)) return;
        const form = document.createElement('form');
        form.className = 'kernel-quality-form';
        const heading = document.createElement('h3');
        heading.textContent = 'Record a sample test';
        form.appendChild(heading);
        function input(label, name, min) {
            const field = document.createElement('label');
            field.textContent = label;
            const control = document.createElement('input');
            control.type = 'number';
            control.name = name;
            control.min = min;
            control.max = '1000000000';
            control.step = '0.001';
            control.required = true;
            control.placeholder = 'Weight in grams';
            field.appendChild(control);
            form.appendChild(field);
            return control;
        }
        const sample = input('Total sample weight (g)', 'sample_weight_g', '0.001');
        const impurity = input('Impurity weight (g)', 'impurity_weight_g', '0');
        const preview = document.createElement('p');
        preview.className = 'kernel-quality-preview';
        preview.setAttribute('aria-live', 'polite');
        preview.textContent = 'Enter both weights to calculate the result.';
        form.appendChild(preview);
        function calculate() {
            const total = Number(sample.value),
                unwanted = Number(impurity.value);
            impurity.setCustomValidity(
                impurity.value !== '' && sample.value !== '' && unwanted > total
                    ? 'Impurity weight cannot exceed the sample weight.'
                    : ''
            );
            if (sample.value !== '' && impurity.value !== '' && sample.validity.valid && impurity.validity.valid) {
                const value = (unwanted / total) * 100;
                preview.textContent = percent(value) + ' impurity · ' + percent(100 - value) + ' clean kernels';
            } else
                preview.textContent =
                    'Enter a positive sample weight and impurities between zero and the sample weight.';
        }
        sample.addEventListener('input', calculate);
        impurity.addEventListener('input', calculate);
        const message = notice('');
        form.appendChild(message);
        const save = document.createElement('button');
        save.type = 'submit';
        save.textContent = 'Save sample test';
        form.appendChild(save);
        const entryKey = crypto.randomUUID();
        form.onsubmit = async event => {
            event.preventDefault();
            calculate();
            if (!form.reportValidity()) return;
            save.disabled = true;
            save.textContent = 'Saving…';
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sample_weight_g: sample.value,
                        impurity_weight_g: impurity.value,
                        entry_key: entryKey
                    })
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.err || 'Could not save test.');
                render(result);
                appNotify(result.message);
            } catch (error) {
                message.textContent = error.message + ' Retry with the same weights if the connection was interrupted.';
            } finally {
                save.disabled = false;
                save.textContent = 'Save sample test';
            }
        };
        content.appendChild(form);
    }
    async function load() {
        if (loading) return;
        loading = true;
        content.replaceChildren(notice('Loading sample tests…'));
        try {
            const response = await fetch(endpoint);
            const result = await response.json();
            if (!response.ok) throw new Error(result.err || 'Could not load sample tests.');
            loaded = true;
            render(result);
        } catch (error) {
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.textContent = 'Retry';
            retry.onclick = load;
            content.replaceChildren(notice(error.message), retry);
        } finally {
            loading = false;
        }
    }
    panel.addEventListener('toggle', () => {
        if (panel.open && !loaded) load();
    });
};

// Optional first test entered while receiving an authorised kernel purchase.
window.addReceiptKernelSample = function (form) {
    const section = document.createElement('fieldset');
    section.className = 'kernel-receipt-test';
    const legend = document.createElement('legend');
    legend.textContent = 'Kernel impurity test (optional)';
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'kernel-test-toggle';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.name = 'include_kernel_test';
    toggleLabel.append(toggle, document.createTextNode('Record a sample test with this receipt'));
    const fields = document.createElement('div');
    fields.className = 'kernel-receipt-fields';
    fields.hidden = true;
    function weight(labelText, name, min) {
        const label = document.createElement('label');
        const text = document.createElement('span');
        text.textContent = labelText;
        const input = document.createElement('input');
        input.type = 'number';
        input.name = name;
        input.min = min;
        input.max = '1000000000';
        input.step = '0.001';
        input.placeholder = 'Weight in grams';
        input.disabled = true;
        label.append(text, input);
        fields.appendChild(label);
        return input;
    }
    const sample = weight('Total sample weight (g)', 'sample_weight_g', '0.001');
    const impurity = weight('Impurity weight (g)', 'impurity_weight_g', '0');
    const key = document.createElement('input');
    key.type = 'hidden';
    key.name = 'impurity_entry_key';
    key.value = crypto.randomUUID();
    key.disabled = true;
    fields.appendChild(key);
    const preview = document.createElement('p');
    preview.className = 'kernel-quality-preview';
    preview.setAttribute('aria-live', 'polite');
    preview.textContent = 'Enter both sample weights to calculate the result.';
    fields.appendChild(preview);
    const help = document.createElement('p');
    help.className = 'kernel-quality-help';
    help.textContent =
        'Both weights are grams. This quality test does not reduce the quantity received or change the purchase cost.';
    fields.appendChild(help);
    function calculate() {
        const total = Number(sample.value),
            unwanted = Number(impurity.value);
        impurity.setCustomValidity(
            toggle.checked && impurity.value !== '' && sample.value !== '' && unwanted > total
                ? 'Impurity weight cannot exceed the sample weight.'
                : ''
        );
        if (sample.value !== '' && impurity.value !== '' && sample.validity.valid && impurity.validity.valid) {
            const percent = (unwanted / total) * 100;
            preview.textContent = percent.toFixed(2) + '% impurity · ' + (100 - percent).toFixed(2) + '% clean kernels';
        } else
            preview.textContent = 'Enter a positive sample weight and impurities between zero and the sample weight.';
    }
    toggle.onchange = () => {
        fields.hidden = !toggle.checked;
        [sample, impurity, key].forEach(input => {
            input.disabled = !toggle.checked;
        });
        sample.required = impurity.required = toggle.checked;
        calculate();
    };
    sample.addEventListener('input', calculate);
    impurity.addEventListener('input', calculate);
    section.append(legend, toggleLabel, fields);
    form.appendChild(section);
};
