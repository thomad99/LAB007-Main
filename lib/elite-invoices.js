const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'public', 'elite-cleaning-assets', 'elite-cleaning-logo-dots-glow.png');

function eliteInvoicesDataPath(dataDir) {
  return path.join(dataDir, 'clients.json');
}

function eliteInvoicesHistoryPath(dataDir) {
  return path.join(dataDir, 'invoices.json');
}

function eliteInvoicesPdfsDir(dataDir) {
  return path.join(dataDir, 'pdfs');
}

function eliteInvoicesSeedPath() {
  return path.join(__dirname, '..', 'data', 'elite-invoices-clients.json');
}

function normalizePrefix(value) {
  const cleaned = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned;
}

function normalizeClient(raw) {
  const billToLines = Array.isArray(raw.billToLines)
    ? raw.billToLines.map((line) => String(line || '').trim()).filter(Boolean)
    : [];
  return {
    id: String(raw.id || '').trim(),
    displayName: String(raw.displayName || raw.id || '').trim(),
    billToName: String(raw.billToName || raw.displayName || '').trim(),
    billToLines,
    defaultAmount: Math.max(0, Number(raw.defaultAmount) || 0),
    invoicePrefix: normalizePrefix(raw.invoicePrefix),
    nextSequence: Math.max(0, Math.min(9999, parseInt(raw.nextSequence, 10) || 0))
  };
}

function loadClients(dataPath, seedPath) {
  try {
    if (fs.existsSync(dataPath)) {
      const parsed = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(normalizeClient);
      }
    }
  } catch (err) {
    console.error('[EliteInvoices] Failed to read clients file:', err.message);
  }
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  return seed.map(normalizeClient);
}

function saveClients(dataPath, clients) {
  const dir = path.dirname(dataPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(clients, null, 2), 'utf8');
}

function normalizeInvoice(raw) {
  return {
    id: String(raw.id || '').trim(),
    invoiceNumber: String(raw.invoiceNumber || '').trim(),
    sequence: Math.max(0, Math.min(9999, parseInt(raw.sequence, 10) || 0)),
    clientId: String(raw.clientId || '').trim(),
    clientDisplayName: String(raw.clientDisplayName || '').trim(),
    billToName: String(raw.billToName || '').trim(),
    billToLines: Array.isArray(raw.billToLines)
      ? raw.billToLines.map((line) => String(line || '').trim()).filter(Boolean)
      : [],
    amount: Math.max(0, Number(raw.amount) || 0),
    date: String(raw.date || '').trim(),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    paid: Boolean(raw.paid),
    paidAt: raw.paidAt ? String(raw.paidAt) : null
  };
}

function loadInvoices(historyPath) {
  try {
    if (!fs.existsSync(historyPath)) return [];
    const parsed = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeInvoice).sort((a, b) => {
      const ta = Date.parse(a.createdAt) || 0;
      const tb = Date.parse(b.createdAt) || 0;
      return tb - ta;
    });
  } catch (err) {
    console.error('[EliteInvoices] Failed to read invoices file:', err.message);
    return [];
  }
}

function saveInvoices(historyPath, invoices) {
  const dir = path.dirname(historyPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify(invoices, null, 2), 'utf8');
}

function invoicePdfPath(pdfsDir, invoiceNumber) {
  const safe = String(invoiceNumber || '').replace(/[^A-Za-z0-9_-]/g, '');
  return path.join(pdfsDir, `${safe}.pdf`);
}

function invoiceToPdfPayload(invoice) {
  return {
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.date,
    billToName: invoice.billToName,
    billToLines: invoice.billToLines,
    amount: invoice.amount
  };
}

function filterInvoices(invoices, query) {
  const q = String(query?.q || query?.search || '').trim().toLowerCase();
  const clientId = String(query?.clientId || '').trim();
  const paidFilter = String(query?.paid || 'all').trim().toLowerCase();

  return invoices.filter((invoice) => {
    if (clientId && invoice.clientId !== clientId) return false;
    if (paidFilter === 'paid' && !invoice.paid) return false;
    if (paidFilter === 'unpaid' && invoice.paid) return false;
    if (q) {
      const haystack = [
        invoice.invoiceNumber,
        invoice.clientDisplayName,
        invoice.billToName,
        invoice.date
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function formatInvoiceNumber(prefix, sequence) {
  const code = normalizePrefix(prefix) || 'INV';
  return `${code}-${String(sequence).padStart(4, '0')}`;
}

function formatMoney(amount) {
  return `$${Number(amount || 0).toFixed(0)}`;
}

function formatInvoiceDate(date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function pdfEscape(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildInvoiceHtml(invoice) {
  const logoDataUri = fs.existsSync(LOGO_PATH)
    ? `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`
    : '';
  const billToLines = [
    invoice.billToName,
    ...(invoice.billToLines || [])
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    @page { size: letter; margin: 0.65in; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: #111;
      background: #fff;
      font-size: 13px;
      line-height: 1.45;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      margin-bottom: 28px;
    }
    .logo {
      width: 150px;
      height: 150px;
      object-fit: contain;
    }
    .title-block {
      text-align: right;
      min-width: 220px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 34px;
      letter-spacing: 0.04em;
      font-weight: 700;
    }
    .meta {
      font-size: 14px;
      color: #222;
    }
    .meta div { margin: 4px 0; }
    .meta strong { display: inline-block; min-width: 88px; }
    .columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 28px;
      margin-bottom: 28px;
    }
    .panel h2 {
      margin: 0 0 8px;
      font-size: 15px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #333;
    }
    .panel p {
      margin: 0;
      white-space: pre-line;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 13px;
    }
    thead th {
      text-align: left;
      border-bottom: 2px solid #111;
      padding: 8px 6px;
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    tbody td {
      padding: 12px 6px;
      border-bottom: 1px solid #ddd;
      vertical-align: top;
    }
    .num { text-align: right; white-space: nowrap; }
    .total-row td {
      border-bottom: none;
      padding-top: 16px;
      font-weight: 700;
      font-size: 15px;
    }
    .payment {
      margin-top: 34px;
      padding-top: 18px;
      border-top: 1px solid #ccc;
    }
    .payment h2 {
      margin: 0 0 10px;
      font-size: 15px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .payment p { margin: 4px 0; }
  </style>
</head>
<body>
  <div class="header">
    ${logoDataUri ? `<img class="logo" src="${logoDataUri}" alt="Elite Cleaning Services">` : ''}
    <div class="title-block">
      <h1>INVOICE</h1>
      <div class="meta">
        <div><strong>Invoice #</strong> ${invoice.invoiceNumber}</div>
        <div><strong>Date</strong> ${invoice.date}</div>
      </div>
    </div>
  </div>

  <div class="columns">
    <div class="panel">
      <h2>Bill To</h2>
      <p>${billToLines.map((line) => escapeHtml(line)).join('\n')}</p>
    </div>
    <div class="panel">
      <h2>Bill From</h2>
      <p>Elite Cleaning Services</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Rate</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Cleaning Services</td>
        <td class="num">1</td>
        <td class="num">${formatMoney(invoice.amount)}</td>
        <td class="num">${formatMoney(invoice.amount)}</td>
      </tr>
      <tr class="total-row">
        <td colspan="3" class="num">TOTAL</td>
        <td class="num">${formatMoney(invoice.amount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="payment">
    <h2>Payment Options</h2>
    <p><strong>Send Zelle to</strong> 941 287 7237</p>
    <p><strong>Cheque payable to</strong> My Smart Life LLC</p>
  </div>
</body>
</html>`;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function renderInvoicePdfWithPuppeteer(html) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (err) {
    console.warn('[EliteInvoices] puppeteer not available:', err.message);
    return null;
  }

  let browser;
  try {
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    };
    if (typeof puppeteer.executablePath === 'function') {
      try {
        launchOptions.executablePath = puppeteer.executablePath();
      } catch (pathErr) {
        console.warn('[EliteInvoices] puppeteer executablePath unavailable:', pathErr.message);
      }
    }
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.45in', right: '0.55in', bottom: '0.55in', left: '0.55in' }
    });
    return Buffer.from(pdf);
  } catch (err) {
    console.warn('[EliteInvoices] puppeteer PDF render failed, using fallback:', err.message);
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (_) {
        /* ignore */
      }
    }
  }
}

function buildInvoicePdfFallback(invoice) {
  const billToLines = [invoice.billToName, ...(invoice.billToLines || [])].filter(Boolean);
  const lines = [];
  lines.push('INVOICE');
  lines.push(`Invoice #: ${invoice.invoiceNumber}`);
  lines.push(`Date: ${invoice.date}`);
  lines.push('');
  lines.push('Bill To');
  billToLines.forEach((line) => lines.push(line));
  lines.push('');
  lines.push('Bill From');
  lines.push('Elite Cleaning Services');
  lines.push('');
  lines.push('DESCRIPTION          QTY   RATE     TOTAL');
  lines.push(`Cleaning Services      1   ${formatMoney(invoice.amount).padStart(6)}   ${formatMoney(invoice.amount).padStart(6)}`);
  lines.push('');
  lines.push(`TOTAL ${formatMoney(invoice.amount)}`);
  lines.push('');
  lines.push('Payment Options');
  lines.push('Send Zelle to 941 287 7237');
  lines.push('Cheque payable to My Smart Life LLC');

  const streamRows = ['BT', '/F1 11 Tf', '48 740 Td', '14 TL'];
  lines.forEach((line, idx) => {
    const cmd = `(${pdfEscape(line)}) Tj`;
    if (idx === 0) streamRows.push(cmd);
    else streamRows.push(`T* ${cmd}`);
  });
  streamRows.push('ET');
  const stream = streamRows.join('\n');

  const objects = [];
  const addObj = (body) => objects.push(body);
  addObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  addObj('2 0 obj\n<< /Type /Pages /Count 1 /Kids [4 0 R] >>\nendobj\n');
  addObj('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  addObj('4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>\nendobj\n');
  addObj(`5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`);

  let out = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj) => {
    offsets.push(Buffer.byteLength(out, 'utf8'));
    out += obj;
  });
  const xrefPos = Buffer.byteLength(out, 'utf8');
  out += `xref\n0 ${objects.length + 1}\n`;
  out += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(out, 'utf8');
}

async function buildInvoicePdf(invoice) {
  const html = buildInvoiceHtml(invoice);
  const rendered = await renderInvoicePdfWithPuppeteer(html);
  if (rendered && rendered.length > 0) return rendered;
  return buildInvoicePdfFallback(invoice);
}

module.exports = {
  eliteInvoicesDataPath,
  eliteInvoicesHistoryPath,
  eliteInvoicesPdfsDir,
  eliteInvoicesSeedPath,
  normalizeClient,
  normalizeInvoice,
  normalizePrefix,
  loadClients,
  saveClients,
  loadInvoices,
  saveInvoices,
  invoicePdfPath,
  invoiceToPdfPayload,
  filterInvoices,
  formatInvoiceNumber,
  formatInvoiceDate,
  buildInvoiceHtml,
  buildInvoicePdf
};
