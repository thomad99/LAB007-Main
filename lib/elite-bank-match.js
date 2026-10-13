const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GENERIC_NAME_TOKENS = new Set([
  'llc', 'inc', 'corp', 'co', 'ltd', 'company', 'the', 'and', 'from', 'payment',
  'deposit', 'zelle', 'ach', 'credit', 'debit', 'transfer', 'online'
]);

const DEPOSIT_HINT = /\b(deposit|credit|zelle|venmo|wire|ach\s+credit|transfer\s+from|payment\s+from|incoming|direct\s+dep)\b/i;
const DEBIT_HINT = /\b(withdrawal|debit|purchase|check|fee|payment\s+to|ach\s+debit|pos\b|atm|transfer\s+to|card\s+purchase)\b/i;

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function moneyCents(value) {
  return Math.round(round2(value) * 100);
}

function normalizeMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function significantTokens(name) {
  return normalizeMatchText(name)
    .split(' ')
    .filter((token) => token.length >= 3 && !GENERIC_NAME_TOKENS.has(token));
}

function depositNameMatches(description, depositName) {
  const desc = normalizeMatchText(description);
  const tokens = significantTokens(depositName);
  if (!tokens.length || !desc) return false;
  const significant = tokens.join(' ');
  if (desc.includes(significant)) return true;
  if (tokens.length >= 2 && tokens.every((token) => desc.includes(token))) return true;
  if (tokens.length === 1 && tokens[0].length >= 4 && desc.includes(tokens[0])) return true;
  return false;
}

function preferSpecificClients(clients, description) {
  const hits = (clients || []).filter((client) => depositNameMatches(description, client.depositName));
  return hits.filter((client) => {
    const name = significantTokens(client.depositName).join(' ');
    return !hits.some((other) => {
      if (other === client) return false;
      const otherName = significantTokens(other.depositName).join(' ');
      return otherName.length > name.length && otherName.includes(name);
    });
  });
}

function isoDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function displayDate(iso) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(iso || '');
  return `${match[2]}/${match[3]}/${match[1]}`;
}

function invoiceDateToIso(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  let year = parseInt(match[3], 10);
  if (year < 100) year += 2000;
  return isoDate(year, parseInt(match[1], 10), parseInt(match[2], 10));
}

function earlierInvoiceIso(invoice) {
  const dates = [invoiceDateToIso(invoice?.date), invoiceDateToIso(invoice?.serviceDate)].filter(Boolean);
  if (!dates.length) return null;
  return dates.slice().sort()[0];
}

function daysBetween(fromIso, toIso) {
  const from = Date.parse(`${fromIso}T12:00:00Z`);
  const to = Date.parse(`${toIso}T12:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86400000);
}

function gapScore(gap) {
  if (!Number.isFinite(gap)) return 100000;
  if (gap >= -1) return gap;
  return 1000 + Math.abs(gap);
}

function confidenceFromGap(gap) {
  // Any payment on or after the invoice is a real match, including months later.
  if (gap >= -1) return 'high';
  if (gap >= -3) return 'medium';
  return 'low';
}

function dateRelation(gap) {
  if (!Number.isFinite(gap)) return '';
  if (gap === 0) return 'Same day as the invoice';
  if (gap > 0) return `${gap} day${gap === 1 ? '' : 's'} after the invoice`;
  const days = Math.abs(gap);
  return `${days} day${days === 1 ? '' : 's'} before the invoice`;
}

function matchReason(confidence) {
  if (confidence === 'high') return 'Deposit name and amount match this unpaid invoice, and the payment is on or after the invoice date.';
  if (confidence === 'medium') return 'Deposit name and amount match, but the payment is a few days before the invoice.';
  if (confidence === 'ambiguous') return 'More than one unpaid invoice could fit this deposit. Pick the right one before approving.';
  return 'Deposit name and amount match, but this payment is before the invoice date. Confirm before approving.';
}

function itemsToLines(items) {
  const rows = [];
  (items || []).forEach((item) => {
    const str = String(item?.str || '');
    if (!str) return;
    const tr = Array.isArray(item.transform) ? item.transform : [];
    const x = Number(tr[4]) || 0;
    const y = Number(tr[5]) || 0;
    if (Math.abs(tr[1] || 0) > Math.abs(tr[0] || 1) && Math.abs(tr[1] || 0) > 0.2) return;
    let row = null;
    for (let i = rows.length - 1; i >= 0 && i >= rows.length - 6; i -= 1) {
      if (Math.abs(rows[i].y - y) <= 2.2) {
        row = rows[i];
        break;
      }
    }
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, str, width: Number(item.width) || 0 });
  });
  rows.sort((a, b) => b.y - a.y);
  return rows.map((row) => {
    const parts = row.parts.slice().sort((a, b) => a.x - b.x);
    let line = '';
    let end = null;
    parts.forEach((part) => {
      if (end != null) {
        const gap = part.x - end;
        if (gap > 6) line += '  ';
        else if (gap > 0.8 && !line.endsWith(' ')) line += ' ';
      }
      line += part.str;
      end = part.x + (part.width || Math.max(part.str.length * 3, 1));
    });
    return line.replace(/[ \t]+/g, ' ').trim();
  }).filter(Boolean);
}

function loadPdfjs() {
  if (loadPdfjs.cached) return loadPdfjs.cached;
  if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = function DOMMatrix() {};
  if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = function Path2D() {};
  let pdfjs;
  try {
    pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  } catch (err) {
    const error = new Error('PDF reader is not installed on the server.');
    error.status = 500;
    throw error;
  }
  const worker = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'legacy', 'build', 'pdf.worker.js');
  if (pdfjs.GlobalWorkerOptions && fs.existsSync(worker)) {
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
  }
  loadPdfjs.cached = pdfjs;
  return pdfjs;
}

async function readBankStatementPdf(buffer) {
  const pdfjs = loadPdfjs();
  const data = new Uint8Array(buffer.byteLength);
  data.set(buffer);
  const doc = await pdfjs.getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0
  }).promise;
  const lines = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    lines.push(...itemsToLines(content.items));
  }
  const pageCount = doc.numPages;
  try {
    await doc.destroy();
  } catch (_) {
    /* ignore */
  }
  return { lines, pageCount };
}

function extractAmounts(line) {
  const re = /\$?\(?-?\d{1,3}(?:,\d{3})*\.\d{2}\)?(?:\s*(?:CR|DR))?|-?\d{1,3}(?:,\d{3})*\.\d{2}-/gi;
  const found = [];
  let match;
  while ((match = re.exec(line))) {
    const raw = match[0];
    const creditMark = /CR$/i.test(raw.trim());
    const neg = !creditMark && (raw.includes('(') || raw.includes('-') || /DR$/i.test(raw.trim()));
    const num = Number(raw.replace(/CR|DR/ig, '').replace(/[$,()\s-]/g, ''));
    if (!Number.isFinite(num)) continue;
    found.push({
      raw,
      index: match.index,
      end: match.index + raw.length,
      abs: round2(num),
      signed: neg ? -round2(num) : round2(num)
    });
  }
  return found;
}

function parseLeadingDate(line) {
  const numeric = line.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b\s*(.*)$/);
  if (numeric) {
    return {
      month: parseInt(numeric[1], 10),
      day: parseInt(numeric[2], 10),
      year: numeric[3] ? parseInt(numeric[3], 10) : null,
      rest: numeric[4] || ''
    };
  }
  const named = line.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s+(\d{4}))?\b\s*(.*)$/);
  if (!named) return null;
  const month = MONTHS[named[1].toLowerCase()];
  if (!month) return null;
  return {
    month,
    day: parseInt(named[2], 10),
    year: named[3] ? parseInt(named[3], 10) : null,
    rest: named[4] || ''
  };
}

function isNoiseLine(line) {
  return /page\s+\d+(\s+of\s+\d+)?/i.test(line)
    || /^(continued|member fdic|equal housing|customer service|account number|routing number)\b/i.test(line)
    || (/^date\b/i.test(line) && /\b(description|amount|balance)\b/i.test(line));
}

function isCreditHeader(line) {
  if (parseLeadingDate(line) || extractAmounts(line).length) return false;
  if (line.length > 90) return false;
  if (/\b(withdrawals?|debits?|fees?|checks?)\b/i.test(line)) return false;
  return /\b(deposits?|credits?|additions)\b/i.test(line);
}

function isDebitHeader(line) {
  if (parseLeadingDate(line) || extractAmounts(line).length) return false;
  if (line.length > 90) return false;
  return /\b(withdrawals?|debits?|checks?\s+paid|service fees?|purchases?|electronic withdrawals|payments?\s+and\s+other\s+debits|fees)\b/i.test(line);
}

function parseStatementPeriod(text) {
  const source = String(text || '').replace(/\s+/g, ' ');
  const re = /([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:through|to|–|—|-)\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i;
  const match = source.match(re);
  if (!match) return null;
  const start = parseLooseDate(match[1]);
  const end = parseLooseDate(match[2]);
  if (!start || !end) return null;
  return { start, end };
}

function parseLooseDate(value) {
  const raw = String(value || '').trim();
  const numeric = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (numeric) {
    let year = parseInt(numeric[3], 10);
    if (year < 100) year += 2000;
    return isoDate(year, parseInt(numeric[1], 10), parseInt(numeric[2], 10));
  }
  const named = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!named) return null;
  const month = MONTHS[named[1].toLowerCase()];
  if (!month) return null;
  return isoDate(parseInt(named[3], 10), month, parseInt(named[2], 10));
}

function resolveYear(month, explicitYear, period) {
  if (explicitYear) return explicitYear < 100 ? explicitYear + 2000 : explicitYear;
  if (period?.end) {
    const end = new Date(`${period.end}T12:00:00Z`);
    let year = end.getUTCFullYear();
    const endMonth = end.getUTCMonth() + 1;
    if (month > endMonth + 1) year -= 1;
    return year;
  }
  const now = new Date();
  let year = now.getFullYear();
  const candidate = Date.UTC(year, month - 1, 1);
  if (candidate > Date.now() + 20 * 86400000) year -= 1;
  return year;
}

function logicalLines(rawLines) {
  const out = [];
  (rawLines || []).forEach((original) => {
    const line = String(original || '').replace(/\s+/g, ' ').trim();
    if (!line || isNoiseLine(line)) return;
    const startNew = Boolean(parseLeadingDate(line))
      || isCreditHeader(line)
      || isDebitHeader(line)
      || /beginning balance|previous balance|starting balance|balance forward|ending balance|^total\b/i.test(line);
    if (startNew || !out.length) {
      out.push(line);
      return;
    }
    if (parseLeadingDate(out[out.length - 1]) && !/^total\b/i.test(line)) {
      out[out.length - 1] += ` ${line}`;
    }
  });
  return out;
}

function classifyWithBalance(running, amountAbs, balanceAbs) {
  if (running == null || balanceAbs == null) return null;
  if (Math.abs(round2(running + amountAbs) - balanceAbs) < 0.02) return 'credit';
  if (Math.abs(round2(running - amountAbs) - balanceAbs) < 0.02) return 'debit';
  return null;
}

function parseBankStatementLines(rawLines) {
  const lines = logicalLines(rawLines);
  const period = parseStatementPeriod(lines.slice(0, 40).join(' '));
  const deposits = [];
  let section = 'unknown';
  let running = null;
  let skippedDebits = 0;

  lines.forEach((line) => {
    if (/^total\b/i.test(line)) return;
    if (isCreditHeader(line)) {
      section = 'credit';
      return;
    }
    if (isDebitHeader(line)) {
      section = 'debit';
      return;
    }
    if (/beginning balance|previous balance|starting balance|balance forward/i.test(line)) {
      const amounts = extractAmounts(line);
      if (amounts.length) running = amounts[amounts.length - 1].abs;
      return;
    }
    if (/ending balance/i.test(line)) {
      const amounts = extractAmounts(line);
      if (amounts.length) running = amounts[amounts.length - 1].abs;
      return;
    }

    const leading = parseLeadingDate(line);
    if (!leading) return;
    const amounts = extractAmounts(leading.rest);
    if (!amounts.length) return;
    let amountToken = amounts[0];
    let balanceAbs = null;
    if (amounts.length >= 2) {
      amountToken = amounts[amounts.length - 2];
      balanceAbs = amounts[amounts.length - 1].abs;
    }
    const description = leading.rest
      .replace(/\$?\(?-?\d{1,3}(?:,\d{3})*\.\d{2}\)?(?:\s*(?:CR|DR))?|-?\d{1,3}(?:,\d{3})*\.\d{2}-/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!description || /^total\b/i.test(description)) return;
    const year = resolveYear(leading.month, leading.year, period);
    const date = isoDate(year, leading.month, leading.day);
    if (!date || !description) return;

    let kind = null;
    if (balanceAbs != null && running != null) {
      kind = classifyWithBalance(running, amountToken.abs, balanceAbs);
      running = balanceAbs;
    } else if (balanceAbs != null) {
      running = balanceAbs;
    }

    if (!kind) {
      if (amountToken.signed < 0) kind = 'debit';
      else if (section === 'credit') kind = 'credit';
      else if (section === 'debit') kind = 'debit';
      else if (DEPOSIT_HINT.test(description)) kind = 'credit';
      else if (DEBIT_HINT.test(description)) kind = 'debit';
    }

    if (kind === 'debit') {
      skippedDebits += 1;
      return;
    }
    if (kind !== 'credit') return;
    deposits.push({
      date,
      displayDate: displayDate(date),
      description: description.slice(0, 240),
      amount: amountToken.abs
    });
  });

  const unique = [];
  const seen = new Set();
  deposits.forEach((deposit) => {
    const key = `${deposit.date}|${deposit.amount.toFixed(2)}|${normalizeMatchText(deposit.description).slice(0, 80)}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push({ ...deposit, id: `d${unique.length + 1}` });
  });

  return {
    period,
    deposits: unique,
    skippedDebits,
    previewLines: lines.slice(0, 25)
  };
}

function invoiceSummary(invoice) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    clientId: invoice.clientId,
    clientDisplayName: invoice.clientDisplayName,
    date: invoice.date,
    serviceDate: invoice.serviceDate,
    amount: round2(invoice.amount)
  };
}

function candidateOptions(deposit, invoices, clients) {
  const named = preferSpecificClients(clients, deposit.description);
  if (!named.length) return [];
  const clientIds = new Set(named.map((client) => client.id));
  return (invoices || [])
    .filter((invoice) => !invoice.paid && clientIds.has(invoice.clientId))
    .filter((invoice) => moneyCents(invoice.amount) === moneyCents(deposit.amount))
    .map((invoice) => {
      const anchor = earlierInvoiceIso(invoice);
      const gap = anchor ? daysBetween(anchor, deposit.date) : null;
      return { invoice, gap, score: gapScore(gap) };
    })
    .sort((a, b) => a.score - b.score || String(a.invoice.invoiceNumber).localeCompare(String(b.invoice.invoiceNumber)));
}

function explainUnmatched(deposit, invoices, clients) {
  const named = preferSpecificClients(clients, deposit.description);
  if (!named.length) return 'No customer Deposit Name was found in this description.';
  const names = named.map((client) => client.displayName || client.depositName).join(', ');
  const unpaid = (invoices || []).filter((invoice) => !invoice.paid && named.some((client) => client.id === invoice.clientId));
  if (!unpaid.length) return `Matched ${names}, but there is no unpaid invoice for that customer.`;
  const amountHits = unpaid.filter((invoice) => moneyCents(invoice.amount) === moneyCents(deposit.amount));
  if (!amountHits.length) {
    return `Matched ${names}, but no unpaid invoice is for $${deposit.amount.toFixed(2)}.`;
  }
  return `Matched ${names}, but that unpaid invoice was already paired with another deposit.`;
}

function proposeBankMatches({ deposits, invoices, clients }) {
  const list = (Array.isArray(deposits) ? deposits : []).map((deposit, index) => ({
    ...deposit,
    id: `d${index + 1}`
  }));
  const invoiceList = Array.isArray(invoices) ? invoices : [];
  const clientList = Array.isArray(clients) ? clients : [];
  const proposals = list.map((deposit) => {
    const options = candidateOptions(deposit, invoiceList, clientList);
    return { deposit, options };
  });

  const usedInvoices = new Set();
  const ordered = proposals
    .map((proposal, index) => ({ ...proposal, index }))
    .sort((a, b) => {
      const aScore = a.options[0] ? a.options[0].score : 100000;
      const bScore = b.options[0] ? b.options[0].score : 100000;
      return aScore - bScore || a.index - b.index;
    });

  const chosen = new Map();
  ordered.forEach((proposal) => {
    const available = proposal.options.filter((option) => !usedInvoices.has(option.invoice.id));
    if (!available.length) {
      chosen.set(proposal.deposit.id, { deposit: proposal.deposit, options: proposal.options, picked: null });
      return;
    }
    usedInvoices.add(available[0].invoice.id);
    const near = available.filter((option, index) => {
      if (index === 0) return false;
      return option.score - available[0].score <= 4 && option.score < 100;
    });
    chosen.set(proposal.deposit.id, {
      deposit: proposal.deposit,
      options: available,
      picked: available[0],
      ambiguous: near.length > 0
    });
  });

  const matches = [];
  const unmatchedDeposits = [];
  list.forEach((deposit) => {
    const row = chosen.get(deposit.id);
    if (!row || !row.picked) {
      unmatchedDeposits.push({
        ...deposit,
        reason: explainUnmatched(deposit, invoiceList, clientList)
      });
      return;
    }
    const confidence = row.ambiguous ? 'ambiguous' : confidenceFromGap(row.picked.gap);
    const alternatives = row.options
      .filter((option) => option.invoice.id !== row.picked.invoice.id)
      .slice(0, 8)
      .map((option) => invoiceSummary(option.invoice));
    matches.push({
      id: `m${matches.length + 1}`,
      confidence,
      checked: confidence === 'high' || confidence === 'medium',
      reason: matchReason(confidence),
      dateNote: dateRelation(row.picked.gap),
      deposit: row.deposit,
      invoice: invoiceSummary(row.picked.invoice),
      alternatives
    });
  });

  const notes = [];
  const missingNames = clientList.filter((client) => !String(client.depositName || '').trim()).length;
  if (missingNames) {
    notes.push(`${missingNames} customer${missingNames === 1 ? '' : 's'} have no Deposit Name, so their payments cannot be matched.`);
  }
  if (!list.length) {
    notes.push('No deposits were found in this PDF. If it is a scan or photo, the text cannot be read.');
  }

  return { matches, unmatchedDeposits, notes };
}

function reviewFile(dataDir, id) {
  return path.join(dataDir, 'bank-statements', `${id}.json`);
}

function safeReviewId(id) {
  const clean = String(id || '').trim();
  if (!/^[a-f0-9]{16,32}$/i.test(clean)) return '';
  return clean;
}

function writeJson(filePath, value) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

async function createBankReview(dataDir, { fileName, pdfBuffer, invoices, clients }) {
  const parsedPdf = await readBankStatementPdf(pdfBuffer);
  const parsed = parseBankStatementLines(parsedPdf.lines);
  const proposal = proposeBankMatches({
    deposits: parsed.deposits,
    invoices,
    clients
  });
  const id = crypto.randomBytes(12).toString('hex');
  const review = {
    id,
    fileName: String(fileName || 'statement.pdf').slice(0, 120),
    uploadedAt: new Date().toISOString(),
    status: 'pending',
    pageCount: parsedPdf.pageCount,
    period: parsed.period,
    depositCount: parsed.deposits.length,
    skippedDebits: parsed.skippedDebits,
    previewLines: parsed.previewLines,
    deposits: parsed.deposits,
    matches: proposal.matches,
    unmatchedDeposits: proposal.unmatchedDeposits,
    notes: proposal.notes
  };
  const dir = path.join(dataDir, 'bank-statements');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.pdf`), pdfBuffer);
  writeJson(reviewFile(dataDir, id), review);
  return review;
}

function readBankReview(dataDir, id) {
  const clean = safeReviewId(id);
  if (!clean) return null;
  const filePath = reviewFile(dataDir, clean);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function allowedInvoiceIds(match) {
  return [match.invoice, ...(match.alternatives || [])].map((invoice) => invoice && invoice.id).filter(Boolean);
}

function resolveBankApprovals(review, approvals) {
  const rows = Array.isArray(approvals) ? approvals : [];
  const matches = new Map((review.matches || []).map((match) => [match.id, match]));
  const used = new Set();
  const accepted = [];
  rows.forEach((row) => {
    const match = matches.get(String(row?.matchId || ''));
    if (!match) return;
    const invoiceId = String(row.invoiceId || match.invoice?.id || '').trim();
    if (!allowedInvoiceIds(match).includes(invoiceId)) return;
    if (used.has(invoiceId)) return;
    used.add(invoiceId);
    accepted.push({ match, invoiceId });
  });
  return accepted;
}

function markBankReviewApplied(dataDir, review, applied) {
  const next = {
    ...review,
    status: 'applied',
    appliedAt: new Date().toISOString(),
    applied
  };
  writeJson(reviewFile(dataDir, review.id), next);
  return next;
}

module.exports = {
  depositNameMatches,
  itemsToLines,
  parseBankStatementLines,
  readBankStatementPdf,
  proposeBankMatches,
  createBankReview,
  readBankReview,
  resolveBankApprovals,
  markBankReviewApplied,
  moneyCents,
  invoiceDateToIso
};
