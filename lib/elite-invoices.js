const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LOGO_PATH = path.join(__dirname, '..', 'public', 'elite-cleaning-assets', 'elite-invoice-logo-rectangle.png');
const LOGO_FALLBACK_PATH = path.join(__dirname, '..', 'public', 'elite-cleaning-assets', 'elite-cleaning-logo-dots-glow.png');
const INVOICE_THANK_YOU_MESSAGE =
  'Thank you for choosing Elite Cleaning Services. We truly appreciate your business and the trust you place in us to care for your home. We look forward to providing you with a higher standard of clean every visit.';

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

function isValidClientEmail(value) {
  const email = String(value || '').trim();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
    email: String(raw.email || '').trim().toLowerCase(),
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

function invoiceLogoDataUri() {
  const logoPath = fs.existsSync(LOGO_PATH) ? LOGO_PATH : LOGO_FALLBACK_PATH;
  if (!fs.existsSync(logoPath)) return '';
  return `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
}

function buildInvoiceHtml(invoice) {
  const logoDataUri = invoiceLogoDataUri();
  const billToLines = [
    invoice.billToName,
    ...(invoice.billToLines || [])
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    @page { size: letter; margin: 0.55in 0.6in; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, "Liberation Sans", sans-serif;
      color: #232323;
      background: #fff;
      font-size: 9.8pt;
      line-height: 1.35;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      margin-bottom: 22px;
    }
    .logo {
      width: 230px;
      max-width: 52%;
      height: auto;
      display: block;
    }
    .title-block {
      text-align: right;
      min-width: 180px;
      padding-top: 2px;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 25.5pt;
      letter-spacing: 0.02em;
      font-weight: 700;
      color: #232323;
    }
    .meta {
      font-size: 9.8pt;
      color: #232323;
    }
    .meta-row {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin: 3px 0;
    }
    .meta-row .label {
      font-weight: 700;
      color: #333;
      min-width: 62px;
      text-align: right;
    }
    .meta-row .value {
      min-width: 72px;
      text-align: right;
    }
    .columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 24px;
    }
    .panel h2 {
      margin: 0 0 6px;
      font-size: 10.5pt;
      font-weight: 700;
      color: #232323;
    }
    .panel .rule {
      border: 0;
      border-top: 1px solid #bdbdbd;
      margin: 0 0 10px;
      width: 100%;
    }
    .panel p {
      margin: 0;
      line-height: 1.45;
    }
    table.items {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
      font-size: 9.8pt;
    }
    table.items thead th {
      background: #000;
      color: #fff;
      text-align: left;
      padding: 7px 8px;
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      border: 0;
    }
    table.items thead th.num {
      text-align: right;
    }
    table.items tbody td {
      padding: 10px 8px;
      border-bottom: 1px solid #d8d8d8;
      vertical-align: top;
    }
    table.items tbody tr:last-child td {
      border-bottom: 0;
    }
    .num { text-align: right; white-space: nowrap; }
    .totals {
      margin-top: 18px;
      border-top: 1px solid #bdbdbd;
      padding-top: 10px;
      display: flex;
      justify-content: flex-end;
      align-items: baseline;
      gap: 18px;
      font-size: 13.5pt;
      font-weight: 700;
      color: #232323;
    }
    .payment {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid #bdbdbd;
    }
    .thank-you {
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid #bdbdbd;
      font-size: 9.8pt;
      line-height: 1.55;
      color: #333;
    }
    .thank-you p {
      margin: 0;
    }
    .payment h2 {
      margin: 0 0 12px;
      font-size: 12pt;
      font-weight: 700;
      color: #232323;
    }
    .payment-row {
      display: grid;
      grid-template-columns: 126px 1fr;
      gap: 8px;
      margin: 6px 0;
      font-size: 9.8pt;
    }
    .payment-row .label {
      font-weight: 700;
      color: #333;
    }
  </style>
</head>
<body>
  <div class="header">
    ${logoDataUri ? `<img class="logo" src="${logoDataUri}" alt="Elite Cleaning Services">` : ''}
    <div class="title-block">
      <h1>INVOICE</h1>
      <div class="meta">
        <div class="meta-row">
          <span class="label">Invoice #</span>
          <span class="value">${escapeHtml(invoice.invoiceNumber)}</span>
        </div>
        <div class="meta-row">
          <span class="label">Date</span>
          <span class="value">${escapeHtml(invoice.date)}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="columns">
    <div class="panel">
      <h2>Bill To</h2>
      <hr class="rule">
      <p>${billToLines.map((line) => escapeHtml(line)).join('<br>')}</p>
    </div>
    <div class="panel">
      <h2>Bill From</h2>
      <hr class="rule">
      <p>Elite Cleaning Services</p>
    </div>
  </div>

  <table class="items">
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
    </tbody>
  </table>

  <div class="totals">
    <span>TOTAL</span>
    <span>${formatMoney(invoice.amount)}</span>
  </div>

  <div class="thank-you">
    <p>${escapeHtml(INVOICE_THANK_YOU_MESSAGE)}</p>
  </div>

  <div class="payment">
    <h2>Payment Options</h2>
    <div class="payment-row">
      <span class="label">Send Zelle to</span>
      <span>941 287 7237</span>
    </div>
    <div class="payment-row">
      <span class="label">Cheque payable to</span>
      <span>My Smart Life LLC</span>
    </div>
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

const PDF_MARGINS = { top: '0.55in', right: '0.6in', bottom: '0.55in', left: '0.6in' };
const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu'
];

function isLikelyPlainFallbackPdf(buffer) {
  return !buffer || buffer.length < 8000;
}

function resolveExistingPath(paths) {
  for (const candidate of paths) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolvePuppeteerExecutablePath(puppeteer) {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (typeof puppeteer.executablePath !== 'function') return null;

  try {
    const reportedPath = puppeteer.executablePath();
    return resolveExistingPath([
      reportedPath,
      reportedPath + '/chrome',
      reportedPath.replace('/chrome-linux64/chrome', '/chrome-linux64/chrome-linux64/chrome'),
      reportedPath.replace('/chrome', '/chrome-linux64/chrome'),
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ]);
  } catch (err) {
    console.warn('[EliteInvoices] puppeteer executablePath unavailable:', err.message);
    return null;
  }
}

function installPuppeteerChrome() {
  execSync('npx puppeteer browsers install chrome', {
    stdio: 'inherit',
    timeout: 300000,
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer'
    }
  });
}

function installPlaywrightChromium() {
  execSync('npx playwright install chromium', {
    stdio: 'inherit',
    timeout: 300000,
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/render/.cache/ms-playwright'
    }
  });
}

async function renderInvoicePdfFromHtml(html) {
  const sparticuzPdf = await renderInvoicePdfWithSparticuz(html);
  if (sparticuzPdf && !isLikelyPlainFallbackPdf(sparticuzPdf)) {
    return sparticuzPdf;
  }

  const playwrightPdf = await renderInvoicePdfWithPlaywright(html);
  if (playwrightPdf && !isLikelyPlainFallbackPdf(playwrightPdf)) {
    return playwrightPdf;
  }

  const puppeteerPdf = await renderInvoicePdfWithPuppeteer(html);
  if (puppeteerPdf && !isLikelyPlainFallbackPdf(puppeteerPdf)) {
    return puppeteerPdf;
  }

  return null;
}

async function renderInvoicePdfWithSparticuz(html) {
  let browser;
  try {
    const chromium = require('@sparticuz/chromium');
    const puppeteer = require('puppeteer-core');
    chromium.setGraphicsMode = false;

    browser = await puppeteer.launch({
      args: [...chromium.args, ...BROWSER_ARGS],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless ?? true
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: false,
      margin: PDF_MARGINS
    });
    return Buffer.from(pdf);
  } catch (err) {
    console.warn('[EliteInvoices] sparticuz PDF render failed:', err.message);
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

async function renderInvoicePdfWithPlaywright(html) {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (err) {
    console.warn('[EliteInvoices] playwright not available:', err.message);
    return null;
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: BROWSER_ARGS
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: PDF_MARGINS
    });
    return Buffer.from(pdf);
  } catch (err) {
    const missingBrowser = /Executable doesn't exist|browserType\.launch|chromium/i.test(err.message);
    if (missingBrowser) {
      try {
        console.warn('[EliteInvoices] Playwright Chromium missing, installing...');
        installPlaywrightChromium();
        browser = await chromium.launch({ headless: true, args: BROWSER_ARGS });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle' });
        const pdf = await page.pdf({
          format: 'Letter',
          printBackground: true,
          margin: PDF_MARGINS
        });
        return Buffer.from(pdf);
      } catch (retryErr) {
        console.warn('[EliteInvoices] playwright PDF render failed:', retryErr.message);
        return null;
      }
    }
    console.warn('[EliteInvoices] playwright PDF render failed:', err.message);
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
      args: BROWSER_ARGS
    };
    const executablePath = resolvePuppeteerExecutablePath(puppeteer);
    if (executablePath) launchOptions.executablePath = executablePath;

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: false,
      margin: PDF_MARGINS
    });
    return Buffer.from(pdf);
  } catch (err) {
    const missingBrowser = /Could not find Chrome|Browser was not found/i.test(err.message);
    if (missingBrowser) {
      try {
        console.warn('[EliteInvoices] Puppeteer Chrome missing, installing...');
        installPuppeteerChrome();
        const launchOptions = {
          headless: true,
          args: BROWSER_ARGS
        };
        const executablePath = resolvePuppeteerExecutablePath(puppeteer);
        if (executablePath) launchOptions.executablePath = executablePath;
        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({
          format: 'Letter',
          printBackground: true,
          displayHeaderFooter: false,
          margin: PDF_MARGINS
        });
        return Buffer.from(pdf);
      } catch (retryErr) {
        console.warn('[EliteInvoices] puppeteer PDF render failed:', retryErr.message);
        return null;
      }
    }
    console.warn('[EliteInvoices] puppeteer PDF render failed:', err.message);
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

function buildInvoicePdfWithPdfKit(invoice) {
  const PDFDocument = require('pdfkit');
  const billToLines = [invoice.billToName, ...(invoice.billToLines || [])].filter(Boolean);
  const logoPath = fs.existsSync(LOGO_PATH) ? LOGO_PATH : LOGO_FALLBACK_PATH;

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'LETTER', margin: 42 });
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const left = 42;
    const right = pageWidth - 42;
    const contentWidth = right - left;
    const colGap = 40;
    const colWidth = (contentWidth - colGap) / 2;
    const rightCol = left + colWidth + colGap;

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, left, 42, { width: 230 });
    }

    doc.font('Helvetica-Bold').fontSize(25).fillColor('#232323')
      .text('INVOICE', 300, 42, { width: right - 300, align: 'right' });

    let metaY = 82;
    doc.font('Helvetica-Bold').fontSize(9.8).fillColor('#333333')
      .text('Invoice #', 390, metaY, { width: 70, align: 'right' });
    doc.font('Helvetica').fillColor('#232323')
      .text(invoice.invoiceNumber, 468, metaY, { width: right - 468, align: 'right' });

    metaY += 14;
    doc.font('Helvetica-Bold').fillColor('#333333')
      .text('Date', 390, metaY, { width: 70, align: 'right' });
    doc.font('Helvetica').fillColor('#232323')
      .text(invoice.date, 468, metaY, { width: right - 468, align: 'right' });

    let y = 130;
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#232323')
      .text('Bill To', left, y)
      .text('Bill From', rightCol, y);
    y += 14;
    doc.moveTo(left, y).lineTo(left + colWidth, y).strokeColor('#bdbdbd').lineWidth(0.75).stroke();
    doc.moveTo(rightCol, y).lineTo(rightCol + colWidth, y).stroke();
    y += 10;

    doc.font('Helvetica').fontSize(9.8).fillColor('#232323');
    billToLines.forEach((line, index) => {
      doc.text(line, left, y + index * 13, { width: colWidth, lineBreak: false });
    });
    doc.text('Elite Cleaning Services', rightCol, y, { width: colWidth, lineBreak: false });

    y += Math.max(billToLines.length, 1) * 13 + 24;

    const colDesc = contentWidth * 0.52;
    const colQty = contentWidth * 0.12;
    const colRate = contentWidth * 0.18;
    const colTotal = contentWidth * 0.18;
    const headerH = 22;

    doc.rect(left, y, contentWidth, headerH).fill('#000000');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
    doc.text('DESCRIPTION', left + 8, y + 7, { width: colDesc - 8, lineBreak: false });
    doc.text('QTY', left + colDesc, y + 7, { width: colQty, align: 'center', lineBreak: false });
    doc.text('RATE', left + colDesc + colQty, y + 7, { width: colRate, align: 'center', lineBreak: false });
    doc.text('TOTAL', left + colDesc + colQty + colRate, y + 7, { width: colTotal - 8, align: 'right', lineBreak: false });

    y += headerH;
    doc.fillColor('#232323').font('Helvetica').fontSize(9.8);
    doc.text('Cleaning Services', left + 8, y + 8, { width: colDesc - 8, lineBreak: false });
    doc.text('1', left + colDesc, y + 8, { width: colQty, align: 'center', lineBreak: false });
    doc.text(formatMoney(invoice.amount), left + colDesc + colQty, y + 8, { width: colRate, align: 'center', lineBreak: false });
    doc.text(formatMoney(invoice.amount), left + colDesc + colQty + colRate, y + 8, { width: colTotal - 8, align: 'right', lineBreak: false });

    y += 34;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#d8d8d8').lineWidth(0.75).stroke();
    y += 14;
    doc.moveTo(left + colDesc + colQty, y).lineTo(right, y).strokeColor('#bdbdbd').stroke();
    y += 8;
    doc.font('Helvetica-Bold').fontSize(13.5).fillColor('#232323');
    doc.text('TOTAL', left + colDesc + colQty, y, { width: colRate, align: 'right', lineBreak: false });
    doc.text(formatMoney(invoice.amount), left + colDesc + colQty + colRate, y, { width: colTotal - 8, align: 'right', lineBreak: false });

    y += 42;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#bdbdbd').stroke();
    y += 16;
    doc.font('Helvetica').fontSize(9.8).fillColor('#333333');
    const thankYouHeight = doc.heightOfString(INVOICE_THANK_YOU_MESSAGE, {
      width: contentWidth,
      lineGap: 2
    });
    doc.text(INVOICE_THANK_YOU_MESSAGE, left, y, { width: contentWidth, lineGap: 2 });
    y += thankYouHeight + 20;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#bdbdbd').stroke();
    y += 16;
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#232323')
      .text('Payment Options', left, y, { lineBreak: false });
    y += 20;
    doc.font('Helvetica-Bold').fontSize(9.8).fillColor('#333333')
      .text('Send Zelle to', left, y, { width: 126, lineBreak: false });
    doc.font('Helvetica').fillColor('#232323')
      .text('941 287 7237', left + 134, y, { lineBreak: false });
    y += 16;
    doc.font('Helvetica-Bold').fillColor('#333333')
      .text('Cheque payable to', left, y, { width: 126, lineBreak: false });
    doc.font('Helvetica').fillColor('#232323')
      .text('My Smart Life LLC', left + 134, y, { lineBreak: false });

    doc.end();
  });
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
  lines.push(INVOICE_THANK_YOU_MESSAGE);
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
  const rendered = await renderInvoicePdfFromHtml(html);
  if (rendered && !isLikelyPlainFallbackPdf(rendered)) return rendered;

  console.warn('[EliteInvoices] Browser PDF render unavailable, using PDFKit branded fallback.');
  const branded = await buildInvoicePdfWithPdfKit(invoice);
  if (branded && branded.length > 0) return branded;

  if (process.env.NODE_ENV !== 'production') {
    return buildInvoicePdfFallback(invoice);
  }

  throw new Error('Invoice PDF generation failed.');
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
  buildInvoicePdf,
  isValidClientEmail
};
