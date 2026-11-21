(function () {
    const el = (tag, text, cls) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (cls) node.className = cls;
        return node;
    };
    const message = text => {
        document.getElementById('delivery-note-message').textContent = text;
    };
    // from='sale' when opened from Sale and Payments, so the note's back link returns there.
    window.openDeliveryNote = (id, from) => {
        const url = new URL(location.href);
        url.search = '';
        url.searchParams.set('saleId', id);
        if (from) url.searchParams.set('from', from);
        url.hash = 'delivery-note';
        history.pushState({}, '', url);
        displaySelectedForm();
    };
    // The large ✕ at the top right closes the note and returns to Sale and Payments or the Sales list.
    function setDeliveryBackLink(id) {
        const link = document.querySelector('#delivery-note .delivery-close-x');
        if (!link) return;
        const fromSale = new URLSearchParams(location.search).get('from') === 'sale';
        if (!link.querySelector('.ui-icon')) link.appendChild(AppUI.icon('close'));
        link.setAttribute(
            'aria-label',
            fromSale ? 'Close and go back to Sale and Payments' : 'Close and go back to Sales'
        );
        link.href = fromSale
            ? '/forms.html?saleId=' + encodeURIComponent(id) + '#sale-document'
            : '/forms.html#sales-data';
        link.onclick = fromSale
            ? event => {
                  event.preventDefault();
                  history.pushState({}, '', link.href);
                  displaySelectedForm();
              }
            : null;
    }
    function signaturePad(form, label) {
        const box = el('div', undefined, 'delivery-signature-pad');
        const title = el('label', label);
        const canvas = el('canvas');
        canvas.width = 660;
        canvas.height = 200;
        canvas.setAttribute('aria-label', label);
        canvas.setAttribute('role', 'img');
        const ctx = canvas.getContext('2d');
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#142b22';
        let drawing = false,
            marked = false;
        const point = event => {
            const r = canvas.getBoundingClientRect();
            return {
                x: ((event.clientX - r.left) * canvas.width) / r.width,
                y: ((event.clientY - r.top) * canvas.height) / r.height
            };
        };
        canvas.onpointerdown = event => {
            event.preventDefault();
            canvas.setPointerCapture(event.pointerId);
            drawing = true;
            marked = true;
            const p = point(event);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + 0.1, p.y + 0.1);
            ctx.stroke();
        };
        canvas.onpointermove = event => {
            if (!drawing) return;
            event.preventDefault();
            const p = point(event);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
        };
        canvas.onpointerup = canvas.onpointercancel = () => {
            drawing = false;
        };
        title.prepend(AppUI.icon('pen'));
        const clear = el('button', 'Clear signature', 'delivery-clear');
        clear.type = 'button';
        clear.prepend(AppUI.icon('trash'));
        clear.onclick = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            marked = false;
        };
        box.append(title, canvas, clear);
        form.appendChild(box);
        return () => {
            if (!marked) throw Error('Please draw the signature.');
            return canvas.toDataURL('image/png');
        };
    }
    // The Pending Weighing dispatch form reuses this pad so the driver signs before Confirm Dispatch.
    window.addDeliverySignaturePad = signaturePad;
    function input(form, label, type, name, iconName) {
        const field = el('label', undefined, 'delivery-field' + (type === 'file' ? ' delivery-field-wide' : ''));
        field.append(AppUI.icon(iconName || 'document'), el('span', label));
        const value = el('input');
        value.type = type;
        value.name = name;
        value.required = true;
        if (type === 'number') {
            value.min = '.01';
            value.step = '.01';
            value.inputMode = 'decimal';
        }
        field.appendChild(value);
        form.appendChild(field);
        return value;
    }
    // Action forms open with a green header bar carrying the form's icon.
    function heading(text, iconName) {
        const title = el('h2', text);
        title.prepend(AppUI.icon(iconName));
        return title;
    }
    function submit(form, label, action) {
        const button = el('button', label, 'delivery-primary');
        button.prepend(AppUI.icon('confirm'));
        button.type = 'submit';
        form.appendChild(button);
        form.onsubmit = async event => {
            event.preventDefault();
            if (!form.reportValidity()) return;
            button.disabled = true;
            try {
                await action();
                await window.loadDeliveryNote();
                if (window.refreshPendingWeighingBadge) window.refreshPendingWeighingBadge();
                appNotify('Delivery note saved.');
            } catch (error) {
                message(error.message);
            } finally {
                button.disabled = false;
            }
        };
    }
    async function post(url, body, multipart = false) {
        const response = await fetch(url, {
            method: 'POST',
            ...(multipart ? { body } : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        });
        const data = await response.json();
        if (!response.ok) throw Error(data.err || 'Could not save delivery note.');
        return data;
    }
    window.loadDeliveryNote = async () => {
        const page = document.getElementById('delivery-note');
        if (!page) return;
        const id = new URLSearchParams(location.search).get('saleId');
        if (!id) {
            message('Select a delivery note from Pending Weighing or Sales.');
            return;
        }
        setDeliveryBackLink(id);
        message('Loading delivery note…');
        const doc = document.getElementById('delivery-note-document'),
            controls = document.getElementById('delivery-note-controls');
        doc.replaceChildren();
        controls.replaceChildren();
        try {
            const response = await fetch('/api/delivery-notes/' + encodeURIComponent(id));
            const data = await response.json();
            if (!response.ok) throw Error(data.err);
            const n = data.note;
            const number = 'DN-' + String(n.sales_date).slice(0, 4) + '-' + String(n.sales_id).padStart(6, '0');
            doc.append(
                el('h2', data.company.company_name || 'Delivery Note'),
                el('h3', 'DELIVERY NOTE · ' + number, 'delivery-number')
            );
            const contact = el('div', undefined, 'delivery-contact');
            for (const [iconName, value] of [
                ['pin', data.company.business_address],
                ['phone', data.company.phone_number],
                ['mail', data.company.email]
            ])
                if (value) {
                    const item = el('span', value);
                    item.prepend(AppUI.icon(iconName));
                    contact.appendChild(item);
                }
            if (contact.children.length) doc.appendChild(contact);
            const grid = el('dl', undefined, 'delivery-note-grid');
            const entries = [
                ['Dispatch date', formatDate(n.sales_date)],
                ['Customer', n.customer],
                ['Product', n.item],
                ['Factory weight', formatNumber(n.factory_weight) + ' kg'],
                ['Vehicle number', n.vehicle_number || 'Not recorded'],
                ['Factory scale ticket', n.scale_ticket || 'Not recorded'],
                ['Payment weight', n.billing_basis === 'Customer' ? 'Customer’s agreed weight' : 'Factory weight'],
                ['Accompanying representative', n.representative || 'Director to assign']
            ];
            // A factory-weight sale is paid on the factory weight, so the buyer's weighing only appears for customer-weight sales
            // (or an older factory-weight note where a buyer weight was already saved).
            const buyerWeighing = n.billing_basis === 'Customer' || Boolean(n.buyer_signature);
            if (buyerWeighing)
                entries.push(
                    ['Buyer’s weight', n.buyer_weight ? formatNumber(n.buyer_weight) + ' kg' : 'Awaiting weighing'],
                    [
                        'Weight difference',
                        n.buyer_weight
                            ? formatNumber(Number(n.factory_weight) - Number(n.buyer_weight)) +
                              ' kg (factory minus buyer)'
                            : 'Awaiting weighing'
                    ]
                );
            const entryIcons = {
                'Dispatch date': 'calendar',
                'Customer': 'user',
                'Product': 'box',
                'Factory weight': 'scale',
                'Vehicle number': 'truck',
                'Factory scale ticket': 'ticket',
                'Payment weight': 'scale',
                'Accompanying representative': 'people',
                'Buyer’s weight': 'people',
                'Weight difference': 'warning'
            };
            for (const [label, value] of entries) {
                const pair = el('div');
                pair.append(AppUI.icon(entryIcons[label] || 'info'), el('dt', label), el('dd', value));
                grid.appendChild(pair);
            }
            doc.appendChild(grid);
            const signatures = el('div', undefined, 'delivery-signatures');
            function signed(title, name, signature, time) {
                const section = el('section', undefined, 'delivery-signed');
                const head = el('h3', title);
                head.prepend(AppUI.icon('pen'));
                section.append(head, el('p', name || 'Not yet signed', name ? undefined : 'delivery-unsigned'));
                if (signature) {
                    const image = el('img');
                    image.src = signature;
                    image.alt = title;
                    section.append(el('small', new Date(time).toLocaleString()), image);
                }
                signatures.appendChild(section);
            }
            signed('Driver’s collection signature', n.driver_name, n.driver_signature, n.driver_signed_at);
            if (buyerWeighing) signed('Buyer’s weighing signature', n.buyer_name, n.buyer_signature, n.confirmed_at);
            doc.appendChild(signatures);
            if (n.confirmed_at)
                doc.appendChild(
                    el(
                        'p',
                        'Weighing witnessed and confirmed by ' +
                            (n.confirmed_by_name || n.representative || 'the approved representative') +
                            ' · ' +
                            new Date(n.confirmed_at).toLocaleString()
                    )
                );
            if (n.approved_at)
                doc.appendChild(
                    el(
                        'p',
                        'Weight difference approved by the Director' +
                            (n.approved_by_name ? ' (' + n.approved_by_name + ')' : '') +
                            ' · ' +
                            new Date(n.approved_at).toLocaleString()
                    )
                );
            // Director corrections after signing are listed so the change from what the driver signed is visible.
            const fieldLabels = {
                sales_date: 'Dispatch date',
                customer_id: 'Customer',
                item_id: 'Product',
                factory_quantity: 'Factory weight',
                unit_price: 'Unit price'
            };
            for (const correction of n.corrections || []) {
                const section = el('section', undefined, 'delivery-correction');
                section.appendChild(el('h3', 'Corrected after signing'));
                section.appendChild(
                    el(
                        'p',
                        new Date(correction.created_at).toLocaleString() +
                            (correction.corrected_by_name ? ' · by ' + correction.corrected_by_name : '') +
                            ' · Reason: ' +
                            correction.reason
                    )
                );
                const changes = Object.keys(fieldLabels).filter(
                    key => String(correction.previous_values[key]) !== String(correction.new_values[key])
                );
                for (const key of changes) {
                    const show = (value, side) =>
                        key === 'factory_quantity'
                            ? formatNumber(value) + ' kg'
                            : key === 'unit_price'
                              ? '₦' + formatNumber(value)
                              : key === 'sales_date'
                                ? formatDate(value)
                                : correction[side + '_' + (key === 'customer_id' ? 'customer' : 'item')] || value;
                    section.appendChild(
                        el(
                            'p',
                            fieldLabels[key] +
                                ': ' +
                                show(correction.previous_values[key], 'previous') +
                                ' → ' +
                                show(correction.new_values[key], 'new')
                        )
                    );
                }
                doc.appendChild(section);
            }
            const files =
                n.evidence_files ||
                (n.has_evidence ? [{ id: 0, type: n.evidence_type, name: 'Weighing evidence' }] : []);
            for (const [index, file] of files.entries()) {
                const section = el('section', undefined, 'delivery-evidence-file');
                const link = el('a', 'View weighing evidence ' + (index + 1) + (file.name ? ' · ' + file.name : ''));
                link.href = '/api/delivery-notes/' + id + '/evidence?file=' + file.id;
                link.target = '_blank';
                link.rel = 'noopener';
                section.appendChild(link);
                if (file.type?.startsWith('image/')) {
                    const picture = el('img');
                    picture.className = 'delivery-evidence';
                    picture.src = link.href;
                    picture.alt = 'Weighing evidence ' + (index + 1);
                    section.appendChild(picture);
                }
                doc.appendChild(section);
            }
            const pendingApproval = n.billing_basis === 'Customer' && n.buyer_signature && !n.invoice_number;
            message(
                n.invoice_number
                    ? 'Invoice ' + n.invoice_number + ' is available.'
                    : pendingApproval
                      ? 'Buyer weighing saved. Awaiting Director approval of the weight difference.'
                      : 'Invoice will be issued after the buyer’s weighing is confirmed.'
            );
            if (n.invoice_number) {
                const invoice = el('button', 'Open Invoice', 'delivery-secondary');
                invoice.prepend(AppUI.icon('document'));
                invoice.type = 'button';
                invoice.onclick = () => openSaleDocument({ sales_id: n.sales_id, invoice_number: n.invoice_number });
                controls.appendChild(invoice);
            }
            if (!n.driver_signature && data.can_sign_driver) {
                const form = el('form', undefined, 'delivery-form');
                form.appendChild(heading('Driver acknowledges collection', 'pen'));
                const driver = input(form, 'Driver’s full name', 'text', 'driver_name', 'user');
                const sign = signaturePad(form, 'Driver signs here');
                submit(form, 'Save Driver Signature', () =>
                    post('/api/delivery-notes/' + id + '/driver', { driver_name: driver.value, signature: sign() })
                );
                controls.appendChild(form);
            }
            if (n.billing_basis === 'Customer' && n.driver_signature && !n.buyer_signature && data.can_confirm) {
                const form = el('form', undefined, 'delivery-form');
                form.append(
                    heading('Buyer’s weighing at destination', 'scale'),
                    el(
                        'p',
                        'Hand the device to the buyer to enter their name and weight, optionally attach a scale ticket or photo, and sign. The accompanying representative then confirms the details.'
                    )
                );
                input(form, 'Buyer’s full name', 'text', 'buyer_name', 'user');
                input(form, 'Buyer’s measured weight (kg)', 'number', 'buyer_weight', 'scale');
                const file = input(
                    form,
                    'Scale tickets or weighing photos (optional, up to 6 files, 6 MB each)',
                    'file',
                    'evidence',
                    'image'
                );
                file.required = false;
                file.multiple = true;
                file.accept = 'image/png,image/jpeg,image/webp,application/pdf';
                const sign = signaturePad(form, 'Buyer signs here');
                const label = el('label', undefined, 'delivery-confirmation');
                const check = el('input');
                check.type = 'checkbox';
                check.name = 'representative_confirmed';
                check.value = 'true';
                check.required = true;
                label.append(
                    check,
                    document.createTextNode(
                        'I accompanied this delivery, witnessed the weighing and checked the buyer’s details and any attached evidence.'
                    )
                );
                form.appendChild(label);
                submit(form, 'Confirm Buyer’s Weighing', () => {
                    if (file.files.length > 6) throw Error('Choose no more than 6 weighing files.');
                    if ([...file.files].some(row => row.size > 6 * 1024 * 1024))
                        throw Error('Each weighing file must be no larger than 6 MB.');
                    const body = new FormData(form);
                    body.set('signature', sign());
                    return post('/api/delivery-notes/' + id + '/buyer', body, true);
                });
                controls.appendChild(form);
            }
            if (pendingApproval && data.can_approve) {
                const form = el('form', undefined, 'delivery-form');
                form.append(
                    heading('Director approval', 'check'),
                    el(
                        'p',
                        'Approve the buyer’s agreed weight for invoicing. The factory stock deduction will stay unchanged.'
                    )
                );
                const confirm = el('label', undefined, 'delivery-confirmation');
                const check = el('input');
                check.type = 'checkbox';
                check.required = true;
                confirm.append(
                    check,
                    document.createTextNode(
                        'I reviewed the weight difference and any attached evidence and approve this invoice weight.'
                    )
                );
                form.appendChild(confirm);
                submit(form, 'Approve Weight and Generate Invoice', () =>
                    post('/api/delivery-notes/' + id + '/approve', {})
                );
                controls.appendChild(form);
            }
        } catch (error) {
            message(error.message || 'Could not load delivery note.');
        }
    };
    (async () => {
        const user = await window.currentUserPromise;
        if (!user) return;
        const select = document.getElementById('sales-representative');
        if (['admin', 'manager'].includes(user.role) && select) {
            try {
                const response = await fetch('/api/delivery-representatives');
                if (!response.ok) throw Error();
                const users = await response.json();
                select.replaceChildren();
                for (const row of users)
                    select.add(
                        new Option(
                            row.username + ' (' + (row.role === 'admin' ? 'Director' : row.role) + ')',
                            row.user_id,
                            row.username === user.username,
                            row.username === user.username
                        )
                    );
                select.value = String(
                    users.find(row => row.username === user.username)?.user_id || users[0]?.user_id || ''
                );
                if (!users.length) select.replaceChildren(new Option('No staff available to accompany', ''));
            } catch (e) {
                select.replaceChildren(new Option('Could not load representatives', ''));
            }
        }
        document.getElementById('print-delivery-note')?.addEventListener('click', () => window.print());
        const closeX = document.querySelector('#delivery-note .delivery-close-x');
        if (closeX && !closeX.querySelector('.ui-icon')) closeX.appendChild(AppUI.icon('close'));
        // Toolbar icons: truck beside the title and a printer.
        const toolbar = document.querySelector('.delivery-note-toolbar');
        if (toolbar && !toolbar.dataset.decorated) {
            toolbar.dataset.decorated = 'true';
            toolbar.querySelector('h1')?.prepend(AppUI.icon('truck'));
            document.getElementById('print-delivery-note')?.prepend(AppUI.icon('printer'));
        }
        if (location.hash === '#delivery-note') window.loadDeliveryNote();
    })();
})();
