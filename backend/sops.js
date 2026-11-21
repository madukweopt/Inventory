const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sanitize = require('sanitize-html');
const { parseDocument } = require('htmlparser2');
const PDFDocument = require('pdfkit');
const root = path.join(__dirname, '..');
const escape = value =>
    String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const text = node =>
    node.type === 'text'
        ? node.data
        : node.name === 'br'
          ? '\n'
          : (node.children || []).map(text).join('') + (['p', 'div', 'li', 'tr'].includes(node.name) ? '\n' : '');
const error = (status, message) => Object.assign(new Error(message), { status });
const allowed = [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'ul',
    'ol',
    'li',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'div'
];
function prepareHtml(input) {
    if (typeof input !== 'string' || Buffer.byteLength(input) > 400000)
        throw error(400, 'The manual is too large. Save a smaller change.');
    const clean = sanitize(input, {
        allowedTags: allowed,
        allowedAttributes: { ol: ['start'] },
        transformTags: { b: 'strong', i: 'em' }
    });
    const tree = parseDocument(clean),
        headings = [],
        used = new Set();
    let section = 'guide';
    function visit(nodes) {
        for (const node of nodes) {
            if (/^h[1-5]$/.test(node.name)) {
                const label = text(node).trim(),
                    level = Number(node.name[1]);
                if (level === 2) {
                    const match = label.match(/^SOP\s+(\d+)/i);
                    section = match ? 'sop-' + match[1].padStart(2, '0') : 'workflow';
                }
                let id =
                    level === 2
                        ? section
                        : level === 1
                          ? 'manual-title'
                          : section +
                            '-' +
                            label
                                .toLowerCase()
                                .normalize('NFKD')
                                .replace(/[^a-z0-9]+/g, '-')
                                .replace(/^-|-$/g, '');
                if (used.has(id)) id += '-' + headings.length;
                used.add(id);
                node.attribs = { id };
                headings.push({ id, level, label, section });
            }
            if (node.name === 'div' && (node.children || []).some(child => child.name === 'table'))
                node.attribs = { class: 'sop-table-wrap' };
            visit(node.children || []);
        }
    }
    visit(tree.children);
    if (!text(tree).trim() || !headings.some(h => h.level === 1 && h.label))
        throw error(400, 'Keep the manual title and its text.');
    if (
        !headings.some(h => h.id === 'workflow') ||
        !Array.from({ length: 6 }, (_, i) => 'sop-' + String(i + 1).padStart(2, '0')).every(id =>
            headings.some(h => h.id === id)
        )
    )
        throw error(400, 'Keep the app guide and all six SOP section headings.');
    function serialize(nodes) {
        return nodes
            .map(node => {
                if (node.type === 'text') return escape(node.data);
                if (!allowed.includes(node.name)) return '';
                const attrs = Object.entries(node.attribs || {})
                    .map(([key, value]) => ' ' + key + '="' + escape(value) + '"')
                    .join('');
                return (
                    '<' +
                    node.name +
                    attrs +
                    '>' +
                    serialize(node.children || []) +
                    (node.name === 'br' ? '' : '</' + node.name + '>')
                );
            })
            .join('');
    }
    const html = serialize(tree.children);
    const toc = headings
        .filter(h => h.level === 2)
        .map(
            group =>
                '<div class="sop-toc-group"><a class="sop-toc-main" href="#' +
                group.id +
                '">' +
                escape(group.label) +
                '</a><details><summary>Sections</summary><ul>' +
                headings
                    .filter(h => h.level === 3 && h.section === group.section)
                    .map(h => '<li><a href="#' + h.id + '">' + escape(h.label) + '</a></li>')
                    .join('') +
                '</ul></details></div>'
        )
        .join('');
    return { html, toc, headings, tree };
}
function baseline() {
    const template = fs.readFileSync(path.join(root, 'public/html/sops.html'), 'utf8');
    const html = template
        .match(/<article class="sop-document"[^>]*>([\s\S]*?)<\/article>/)[1]
        .replace(/<p class="sop-end">[\s\S]*?<\/p>/, '');
    return { html, version: 'base:' + crypto.createHash('sha256').update(html).digest('hex'), updated_at: null };
}
async function current(pool) {
    const row = (
        await pool.query(
            'SELECT revision_id,content_html,created_at FROM sop_revisions ORDER BY revision_id DESC LIMIT 1'
        )
    ).rows[0];
    return row
        ? {
              html: row.content_html,
              version:
                  String(row.revision_id) + ':' + crypto.createHash('sha256').update(row.content_html).digest('hex'),
              updated_at: row.created_at
          }
        : baseline();
}
function pageFor(record) {
    const prepared = prepareHtml(record.html);
    const stamp = record.updated_at
        ? 'Updated ' + new Date(record.updated_at).toLocaleDateString('en-GB')
        : 'Plain-English edition';
    return fs
        .readFileSync(path.join(root, 'public/html/sops.html'), 'utf8')
        .replace(
            /(<nav aria-label="Manual sections">)[\s\S]*?(<\/nav>)/,
            (_, open, close) => open + prepared.toc + close
        )
        .replace(
            /(<article class="sop-document"[^>]*>)[\s\S]*?(<\/article>)/,
            (_, open, close) =>
                open +
                prepared.html +
                '<p class="sop-end"><a href="#sop-toc">Back to contents</a> · ' +
                stamp +
                '</p>' +
                close
        );
}
function pdfBuffer(record) {
    const prepared = prepareHtml(record.html);
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 45, info: { Title: 'SOMAD staff work instructions' } }),
            chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.registerFont('regular', path.join(__dirname, 'fonts/OpenSans-Regular.ttf'));
        doc.registerFont('bold', path.join(__dirname, 'fonts/OpenSans-Bold.ttf'));
        const width = doc.page.width - 90;
        function room(height) {
            if (doc.y + height > doc.page.height - 50) doc.addPage();
        }
        function write(value, size = 10, bold = false, options = {}) {
            doc.font(bold ? 'bold' : 'regular')
                .fontSize(size)
                .fillColor(bold ? '#20583a' : '#34473c');
            doc.text(value, 45, doc.y, { width, lineGap: 3, ...options });
            doc.moveDown(0.35);
        }
        write('SOMAD staff work instructions', 23, true);
        write('Table of contents', 17, true);
        for (const h of prepared.headings.filter(h => h.level === 2)) write(h.label, 11, false, { goTo: h.id });
        doc.addPage();
        function render(node, indent = 0) {
            if (node.type === 'text') {
                if (node.data.trim()) write(node.data.trim());
                return;
            }
            const value = text(node).trim();
            if (!value && node.name !== 'br') return;
            if (/^h[1-5]$/.test(node.name)) {
                const level = Number(node.name[1]);
                if (level === 2 && doc.y > 60) doc.addPage();
                else room(80);
                doc.addNamedDestination(node.attribs.id, 'XYZ', 45, doc.y, null);
                write(value, { 1: 23, 2: 19, 3: 14, 4: 12, 5: 10 }[level], true);
                return;
            }
            if (node.name === 'p') {
                write(value);
                return;
            }
            if (node.name === 'ul' || node.name === 'ol') {
                let index = Number(node.attribs.start) || 1;
                for (const child of node.children || [])
                    if (child.name === 'li') {
                        // A nested list (such as the organisation chart) is written below its item, indented one step.
                        const nested = (child.children || []).filter(c => c.name === 'ul' || c.name === 'ol');
                        const own = (child.children || [])
                            .filter(c => !nested.includes(c))
                            .map(text)
                            .join('')
                            .trim();
                        room(35);
                        doc.font('regular').fontSize(10).fillColor('#34473c');
                        doc.text((node.name === 'ol' ? index++ + '. ' : '• ') + own, 45 + indent + 8, doc.y, {
                            width: width - indent - 8,
                            lineGap: 3
                        });
                        doc.moveDown(0.45);
                        for (const list of nested) render(list, indent + 16);
                    }
                return;
            }
            if (node.name === 'table') {
                const rows = [];
                function collect(n) {
                    if (n.name === 'tr') rows.push(n);
                    else (n.children || []).forEach(collect);
                }
                collect(node);
                const columns = Math.max(
                    ...rows.map(row => row.children.filter(c => ['td', 'th'].includes(c.name)).length)
                );
                if (!columns) return;
                const cellWidth = width / columns;
                for (const row of rows) {
                    const cells = row.children.filter(c => ['td', 'th'].includes(c.name));
                    doc.font('regular').fontSize(9);
                    const height = Math.max(
                        24,
                        ...cells.map(c => {
                            doc.font(c.name === 'th' ? 'bold' : 'regular').fontSize(9);
                            return doc.heightOfString(text(c), { width: cellWidth - 16, lineGap: 2 }) + 14;
                        })
                    );
                    room(height);
                    const y = doc.y;
                    cells.forEach((cell, i) => {
                        doc.rect(45 + i * cellWidth, y, cellWidth, height).fillAndStroke(
                            cell.name === 'th' ? '#edf4ef' : '#ffffff',
                            '#dfe7e2'
                        );
                        doc.font(cell.name === 'th' ? 'bold' : 'regular')
                            .fontSize(9)
                            .fillColor('#34473c')
                            .text(text(cell), 45 + i * cellWidth + 8, y + 6, { width: cellWidth - 16, lineGap: 2 });
                    });
                    doc.y = y + height;
                }
                doc.moveDown(0.6);
                return;
            }
            for (const child of node.children || []) render(child, indent);
        }
        for (const node of prepared.tree.children) render(node);
        doc.end();
    });
}
function registerSops(app, pool, requirePageLogin, requireRole) {
    app.get('/sops.html', requirePageLogin, async (req, res, next) => {
        try {
            res.set('Cache-Control', 'no-store').send(pageFor(await current(pool)));
        } catch (err) {
            next(err);
        }
    });
    app.get('/sops.pdf', requirePageLogin, async (req, res, next) => {
        try {
            const record = await current(pool);
            res.set('Cache-Control', 'no-store');
            if (record.version.startsWith('base:'))
                return res
                    .type('application/pdf')
                    .download(path.join(root, 'docs/SOPs'), 'SOMAD-Standard-Operating-Procedures.pdf');
            res.type('application/pdf')
                .attachment('SOMAD-Standard-Operating-Procedures.pdf')
                .send(await pdfBuffer(record));
        } catch (err) {
            next(err);
        }
    });
    app.get('/api/sops/editor', requireRole(['admin']), async (req, res) => {
        try {
            res.set('Cache-Control', 'no-store').json(await current(pool));
        } catch (err) {
            res.status(500).json({ err: 'Could not load the manual for editing.' });
        }
    });
    app.put('/api/sops', requireRole(['admin']), async (req, res) => {
        let client;
        try {
            const prepared = prepareHtml(req.body?.html);
            if (typeof req.body.version !== 'string') throw error(400, 'Reload the manual before saving.');
            client = await pool.connect();
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(91003)');
            const existing = await current(client);
            if (existing.version !== req.body.version)
                throw error(
                    409,
                    'Another edit was saved first. Your changes are still in the editor. Copy them before reloading the latest manual.'
                );
            if (existing.version.startsWith('base:'))
                await client.query('INSERT INTO sop_revisions(content_html) VALUES($1)', [
                    prepareHtml(existing.html).html
                ]);
            const row = (
                await client.query(
                    'INSERT INTO sop_revisions(content_html,saved_by) VALUES($1,$2) RETURNING revision_id,created_at',
                    [prepared.html, req.session.user_name]
                )
            ).rows[0];
            await client.query('COMMIT');
            res.json({
                message: 'SOP changes saved.',
                version:
                    String(row.revision_id) + ':' + crypto.createHash('sha256').update(prepared.html).digest('hex'),
                updated_at: row.created_at
            });
        } catch (err) {
            if (client) await client.query('ROLLBACK');
            res.status(err.status || 500).json({
                err: err.status ? err.message : 'Could not save the manual. Your changes are still in the editor.'
            });
        } finally {
            client?.release();
        }
    });
}
module.exports = { registerSops, prepareHtml, current, pageFor, pdfBuffer };
