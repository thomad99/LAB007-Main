const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const {
  parseBankStatementLines,
  proposeBankMatches,
  readBankStatementPdf,
  createBankReview,
  resolveBankApprovals,
  depositNameMatches
} = require('../lib/elite-bank-match');

function buildRawPdf(stream) {
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n',
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n`,
    `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n'
  ];
  let out = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj) => {
    offsets.push(Buffer.byteLength(out));
    out += obj;
  });
  const xrefPos = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n`;
  out += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(out);
}

function buildTextPdf(lines) {
  const commands = ['BT', '/F1 11 Tf', '48 760 Td'];
  lines.forEach((line, index) => {
    const safe = String(line).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    commands.push(index === 0 ? `(${safe}) Tj` : `0 -16 Td (${safe}) Tj`);
  });
  commands.push('ET');
  return buildRawPdf(commands.join('\n'));
}

function invoice(partial) {
  return {
    paid: false,
    clientDisplayName: partial.clientId,
    serviceDate: partial.date,
    ...partial
  };
}

async function main() {
  assert.strictEqual(depositNameMatches('ACH Credit SMITH PROPERTIES LLC', 'Smith Properties'), true);
  assert.strictEqual(depositNameMatches('Zelle from JANE DOE', 'Jane Doe'), true);
  assert.strictEqual(depositNameMatches('Card Purchase HOME DEPOT', 'Jane Doe'), false);
  assert.strictEqual(depositNameMatches('ACH CREDIT LLC PAYMENT', 'LLC'), false);

  const sectionText = [
    'Statement Period: January 1, 2026 through January 31, 2026',
    'Beginning Balance 2,000.00',
    'DEPOSITS AND ADDITIONS',
    '01/06 ACH Credit SMITH PROPERTIES LLC 150.00',
    '01/12 Zelle Payment From JANE DOE 200.00',
    'Total Deposits and Additions 350.00',
    'ELECTRONIC WITHDRAWALS',
    '01/08 Card Purchase HOME DEPOT 45.67'
  ];
  const sectionParsed = parseBankStatementLines(sectionText);
  assert.strictEqual(sectionParsed.deposits.length, 2);
  assert.strictEqual(sectionParsed.deposits[0].amount, 150);
  assert.strictEqual(sectionParsed.deposits[0].date, '2026-01-06');
  assert.strictEqual(sectionParsed.deposits[1].description.includes('JANE DOE'), true);
  assert.strictEqual(sectionParsed.skippedDebits, 1);
  assert.deepStrictEqual(sectionParsed.period, { start: '2026-01-01', end: '2026-01-31' });

  const balanceText = [
    'Beginning Balance 1,000.00',
    '01/10 ACME WIDGETS 25.00 975.00',
    '01/11 ONLINE TRANSFER FROM COASTAL MOLD 180.00 1,155.00'
  ];
  const balanceParsed = parseBankStatementLines(balanceText);
  assert.strictEqual(balanceParsed.deposits.length, 1);
  assert.strictEqual(balanceParsed.deposits[0].amount, 180);
  assert.strictEqual(balanceParsed.deposits[0].description.includes('COASTAL MOLD'), true);
  assert.strictEqual(balanceParsed.skippedDebits, 1);

  const clients = [
    { id: 'smith', displayName: 'Smith', depositName: 'SMITH' },
    { id: 'smith-prop', displayName: 'Smith Properties', depositName: 'SMITH PROPERTIES' },
    { id: 'jane', displayName: 'Jane', depositName: 'Jane Doe' },
    { id: 'coastal', displayName: 'Coastal', depositName: 'Coastal Mold' },
    { id: 'blank', displayName: 'No Name', depositName: '' }
  ];
  const invoices = [
    invoice({ id: 'a', invoiceNumber: 'SM-0001', clientId: 'smith-prop', date: '01/02/26', amount: 150 }),
    invoice({ id: 'b', invoiceNumber: 'SM-0002', clientId: 'smith-prop', date: '01/20/26', amount: 150 }),
    invoice({ id: 'c', invoiceNumber: 'JD-0001', clientId: 'jane', date: '01/10/26', amount: 200 }),
    invoice({ id: 'd', invoiceNumber: 'JD-PAID', clientId: 'jane', date: '01/01/26', amount: 200, paid: true }),
    invoice({ id: 'e', invoiceNumber: 'CM-0001', clientId: 'coastal', date: '01/09/26', amount: 180 })
  ];
  const proposal = proposeBankMatches({
    deposits: sectionParsed.deposits.concat(balanceParsed.deposits),
    invoices,
    clients
  });
  const byDesc = Object.fromEntries(proposal.matches.map((match) => [match.deposit.description, match]));
  assert.strictEqual(byDesc['ACH Credit SMITH PROPERTIES LLC'].invoice.id, 'a');
  assert.strictEqual(byDesc['ACH Credit SMITH PROPERTIES LLC'].confidence, 'high');
  assert.strictEqual(byDesc['ACH Credit SMITH PROPERTIES LLC'].checked, true);
  assert.strictEqual(byDesc['Zelle Payment From JANE DOE'].invoice.id, 'c');
  assert.strictEqual(proposal.matches.some((match) => match.invoice.id === 'd'), false);
  assert.strictEqual(proposal.matches.find((match) => match.deposit.amount === 180).invoice.id, 'e');

  const historical = proposeBankMatches({
    deposits: [
      { id: 'old', date: '2026-05-02', displayDate: '05/02/2026', description: 'ACH Credit SMITH PROPERTIES LLC', amount: 150 },
      { id: 'early', date: '2025-12-01', displayDate: '12/01/2025', description: 'Zelle Payment From JANE DOE', amount: 200 }
    ],
    invoices: [
      invoice({ id: 'jan', invoiceNumber: 'SM-0100', clientId: 'smith-prop', clientDisplayName: 'Smith Properties', date: '01/02/26', amount: 150 }),
      invoice({ id: 'feb', invoiceNumber: 'SM-0101', clientId: 'smith-prop', clientDisplayName: 'Smith Properties', date: '02/02/26', amount: 150 }),
      invoice({ id: 'jane-old', invoiceNumber: 'JD-0100', clientId: 'jane', clientDisplayName: 'Jane', date: '01/10/26', amount: 200 })
    ],
    clients
  });
  const smithHistorical = historical.matches.find((match) => match.deposit.date === '2026-05-02');
  assert.ok(smithHistorical, 'older unpaid invoice should still be offered');
  assert.strictEqual(smithHistorical.invoice.id, 'feb');
  assert.strictEqual(smithHistorical.confidence, 'high');
  assert.strictEqual(smithHistorical.checked, true);
  const early = historical.matches.find((match) => match.deposit.date === '2025-12-01');
  assert.strictEqual(early.confidence, 'low');
  assert.strictEqual(early.checked, false);

  const ambiguous = proposeBankMatches({
    deposits: [{ id: 'd1', date: '2026-01-05', displayDate: '01/05/2026', description: 'ACH Credit SMITH PROPERTIES LLC', amount: 150 }],
    invoices: [
      invoice({ id: 'near1', invoiceNumber: 'SM-0003', clientId: 'smith-prop', clientDisplayName: 'Smith Properties', date: '01/02/26', amount: 150 }),
      invoice({ id: 'near2', invoiceNumber: 'SM-0004', clientId: 'smith-prop', clientDisplayName: 'Smith Properties', date: '01/04/26', amount: 150 })
    ],
    clients
  });
  assert.strictEqual(ambiguous.matches.length, 1);
  assert.strictEqual(ambiguous.matches[0].confidence, 'ambiguous');
  assert.strictEqual(ambiguous.matches[0].checked, false);
  assert.strictEqual(ambiguous.matches[0].alternatives.length, 1);

  const accepted = resolveBankApprovals(
    { matches: ambiguous.matches },
    [{ matchId: ambiguous.matches[0].id, invoiceId: 'near1' }]
  );
  assert.strictEqual(accepted.length, 1);
  assert.strictEqual(accepted[0].invoiceId, 'near1');
  const rejected = resolveBankApprovals(
    { matches: ambiguous.matches },
    [{ matchId: ambiguous.matches[0].id, invoiceId: 'someone-else' }]
  );
  assert.strictEqual(rejected.length, 0);

  const pdf = buildTextPdf(sectionText);
  const extracted = await readBankStatementPdf(pdf);
  const fromPdf = parseBankStatementLines(extracted.lines);
  assert.strictEqual(fromPdf.deposits.length, 2, `PDF lines were: ${extracted.lines.join(' | ')}`);
  assert.strictEqual(fromPdf.deposits[0].amount, 150);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-bank-'));
  const review = await createBankReview(dir, {
    fileName: 'january.pdf',
    pdfBuffer: pdf,
    invoices,
    clients
  });
  assert.ok(fs.existsSync(path.join(dir, 'bank-statements', `${review.id}.pdf`)));
  assert.strictEqual(review.matches.length >= 2, true);
  assert.strictEqual(review.status, 'pending');

  const columnStream = [
    'BT',
    '/F1 11 Tf',
    '40 700 Td (Statement Period: January 1, 2026 through January 31, 2026) Tj',
    '0 -24 Td (DEPOSITS AND ADDITIONS) Tj',
    '0 -20 Td (01/06) Tj',
    '80 0 Td (ACH Credit SMITH PROPERTIES LLC) Tj',
    '220 0 Td (150.00) Tj',
    'ET'
  ].join('\n');
  const positioned = await readBankStatementPdf(buildRawPdf(columnStream));
  const positionedParsed = parseBankStatementLines(positioned.lines);
  assert.strictEqual(
    positionedParsed.deposits.length,
    1,
    `Column PDF lines were: ${positioned.lines.join(' | ')}`
  );
  assert.strictEqual(positionedParsed.deposits[0].amount, 150);
  assert.strictEqual(positionedParsed.deposits[0].description.includes('SMITH PROPERTIES'), true);

  console.log('elite bank match tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
