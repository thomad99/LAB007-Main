'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const multer = require('multer');

const DEFAULT_AGENT_IDENTITIES = [
  'LAB007 Owners',
  'Elite Cleaning (Owner)',
  'Tiger Lily Floral (Owner)'
];

function createContractEsign(opts) {
  const dataDir = path.resolve(opts.dataDir);
  const apiPrefix = String(opts.apiPrefix || '/api/elite-invoices').replace(/\/+$/, '');
  const signPagePath = String(opts.signPagePath || '/Elite-Management/sign').replace(/\/+$/, '');
  const brandName = String(opts.brandName || 'Elite Management');
  const signedHeader = String(opts.signedHeader || `${brandName} - Signed Contract Copy`);
  const notifyIntro = String(opts.notifyIntro || `A client has signed a ${brandName} contract.`);
  const logPrefix = String(opts.logPrefix || `[${brandName}]`);
  const libDir = opts.libDir || __dirname;
  const defaultAgentIdentity = String(opts.defaultAgentIdentity || 'Elite Cleaning (Owner)');
  const agentIdentities = Array.isArray(opts.agentIdentities) && opts.agentIdentities.length
    ? opts.agentIdentities
    : DEFAULT_AGENT_IDENTITIES;
  const agentIdentitySet = new Set(agentIdentities);
  const findCustomer = typeof opts.findCustomer === 'function' ? opts.findCustomer : () => null;
  const listCustomers = typeof opts.listCustomers === 'function' ? opts.listCustomers : () => [];
  const getEmailTransporter = typeof opts.getEmailTransporter === 'function' ? opts.getEmailTransporter : () => null;
  const getNotifyEmail = typeof opts.getNotifyEmail === 'function' ? opts.getNotifyEmail : () => '';
  const getFromEmail = typeof opts.getFromEmail === 'function' ? opts.getFromEmail : () => 'noreply@lab007.ai';

  const contractsPath = path.join(dataDir, 'contracts.json');
  const docsDir = path.join(dataDir, 'contracts');
  const signedDir = path.join(docsDir, 'signed');
  const agentSignaturePath = path.join(dataDir, 'agent-signature.json');
  const pyenvDir = path.join(dataDir, 'pyenv');

  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
  if (!fs.existsSync(signedDir)) fs.mkdirSync(signedDir, { recursive: true });

  const allowedExt = new Set(['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg']);
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, docsDir),
      filename: (req, file, cb) => {
        const safeName = String(file.originalname || 'document')
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .slice(0, 180);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`);
      }
    }),
    limits: { fileSize: 1024 * 1024 * 25 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(String(file.originalname || '').toLowerCase());
      if (!allowedExt.has(ext)) {
        cb(new Error('Unsupported file type. Use PDF, DOC, DOCX, TXT, PNG, JPG, or JPEG.'));
        return;
      }
      cb(null, true);
    }
  });

  function newId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function readContracts() {
    try {
      if (!fs.existsSync(contractsPath)) return { contracts: [] };
      const parsed = JSON.parse(fs.readFileSync(contractsPath, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.contracts)) return { contracts: [] };
      return parsed;
    } catch (error) {
      console.error(`${logPrefix} readContracts:`, error.message);
      return { contracts: [] };
    }
  }

  function writeContracts(data) {
    const dir = path.dirname(contractsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(contractsPath, JSON.stringify(data, null, 2), 'utf8');
  }

  function validSignatureDataUrl(value) {
    const s = String(value || '');
    return /^data:image\/(?:png|jpe?g);base64,[a-z0-9+/=\s]+$/i.test(s) && s.length <= 4_000_000;
  }

  function normalizeSignerRole(value) {
    return String(value || '').trim().toLowerCase() === 'employee' ? 'employee' : 'customer';
  }

  function signerRoleLabel(role) {
    return normalizeSignerRole(role) === 'employee' ? 'Employee' : 'Customer';
  }

  function signerBlockLabel(role) {
    return normalizeSignerRole(role) === 'employee' ? 'Employee' : 'Client';
  }

  function contractView(c, customerName) {
    const signedDocPath =
      c.status === 'signed' && (c.signedPdfPath || c.signedTextPath)
        ? `${apiPrefix}/contracts/${c.id}/signed-document`
        : '';
    return {
      id: c.id,
      customerId: c.customerId,
      customerName: customerName || 'Client',
      title: c.title,
      body: c.body || '',
      bodyHtml: c.bodyHtml || '',
      status: c.status || 'pending',
      createdAt: c.createdAt,
      signedAt: c.signedAt || null,
      signerName: c.signerName || '',
      signerRole: normalizeSignerRole(c.signerRole),
      signerRoleLabel: signerRoleLabel(c.signerRole),
      signDate: c.signDate || '',
      signPath: `${signPagePath}/${c.token}`,
      hasDocument: Boolean(c.filePath),
      documentName: c.originalName || '',
      documentPath: c.filePath ? `${apiPrefix}/contracts/${c.id}/document` : '',
      signedDocumentPath: signedDocPath,
      includeAgentSignature: Boolean(c.includeAgentSignature),
      agentSignatureDate: c.agentSignatureDate || '',
      agentName: c.agentName || '',
      agentIdentity: normalizeAgentIdentity(c.agentIdentity)
    };
  }

  function sanitizeAgentName(value) {
    return String(value || '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
  }

  function normalizeAgentIdentity(value, fallback = defaultAgentIdentity) {
    const identity = String(value || '').trim();
    return agentIdentitySet.has(identity) ? identity : fallback;
  }

  function validStoredAgentSignature(value) {
    const signatureDataUrl = String(value?.signatureDataUrl || '').trim();
    if (!signatureDataUrl || !validSignatureDataUrl(signatureDataUrl)) return null;
    return {
      signatureDataUrl,
      agentName: sanitizeAgentName(value?.agentName),
      updatedAt: value?.updatedAt || null
    };
  }

  function readAgentSignatureStore() {
    try {
      if (!fs.existsSync(agentSignaturePath)) return { version: 2, profiles: {} };
      const data = JSON.parse(fs.readFileSync(agentSignaturePath, 'utf8'));
      if (!data || typeof data !== 'object') return { version: 2, profiles: {} };
      const profiles = {};
      if (data.profiles && typeof data.profiles === 'object') {
        agentIdentities.forEach((identity) => {
          const profile = validStoredAgentSignature(data.profiles[identity]);
          if (profile) profiles[identity] = profile;
        });
      } else {
        const legacy = validStoredAgentSignature(data);
        if (legacy) {
          const legacyIdentity = normalizeAgentIdentity(data.agentIdentity);
          profiles[legacyIdentity] = legacy;
        }
      }
      return { version: 2, profiles };
    } catch {
      return { version: 2, profiles: {} };
    }
  }

  function readAgentSignature(agentIdentity) {
    const identity = normalizeAgentIdentity(agentIdentity);
    const profile = readAgentSignatureStore().profiles[identity];
    return profile ? { ...profile, agentIdentity: identity } : null;
  }

  function writeAgentSignature(signatureDataUrl, agentName, agentIdentity) {
    const dir = path.dirname(agentSignaturePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const identity = normalizeAgentIdentity(agentIdentity);
    const store = readAgentSignatureStore();
    const profile = {
      signatureDataUrl: String(signatureDataUrl || '').trim(),
      agentName: sanitizeAgentName(agentName),
      updatedAt: new Date().toISOString()
    };
    store.profiles[identity] = profile;
    fs.writeFileSync(agentSignaturePath, JSON.stringify(store, null, 2), 'utf8');
    return { ...profile, agentIdentity: identity };
  }

  function deleteAgentSignature(agentIdentity) {
    const identity = normalizeAgentIdentity(agentIdentity);
    const store = readAgentSignatureStore();
    delete store.profiles[identity];
    if (Object.keys(store.profiles).length) {
      fs.writeFileSync(agentSignaturePath, JSON.stringify(store, null, 2), 'utf8');
    } else if (fs.existsSync(agentSignaturePath)) {
      fs.unlinkSync(agentSignaturePath);
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function appendAgentSignatureBlocks(bodyText, bodyHtml, signatureDataUrl, dateStr, agentName, agentIdentity) {
    const safeDate = String(dateStr || '').trim();
    const safeName = sanitizeAgentName(agentName);
    const safeIdentity = normalizeAgentIdentity(agentIdentity);
    const namedTextLine = safeName ? `\nName: ${safeName}` : '';
    const textAppend = `\n\n---\nRepresenting: ${safeIdentity}\nDate: ${safeDate}\nAgent Signature:\n${namedTextLine ? `${namedTextLine}\n` : ''}`;
    const escSrc = String(signatureDataUrl || '').replace(/"/g, '&quot;');
    const namedHtmlLine = safeName
      ? `<p style="margin-top:4px;"><strong>Name:</strong> ${escapeHtml(safeName)}</p>`
      : '';
    const htmlAppend = `<hr />
<p><strong>Representing:</strong> ${escapeHtml(safeIdentity)}</p>
<p><strong>Date:</strong> ${escapeHtml(safeDate)}</p>
<p><strong>Agent Signature:</strong></p>
<p><img alt="Agent signature" src="${escSrc}" style="max-height:96px;max-width:320px;border:1px solid rgba(0,0,0,0.12);border-radius:6px;background:#fff;" /></p>
${namedHtmlLine}`;
    return {
      body: String(bodyText || '') + textAppend,
      bodyHtml: String(bodyHtml || '') + htmlAppend
    };
  }

  function ensureSignatureSection(bodyText, signerRole) {
    const source = String(bodyText || '').trim();
    const hasSignature = /\bsignature\b/i.test(source);
    const hasDate = /\bdate\b/i.test(source);
    const hasName = /\bprinted\s+name\b|\bname\s*[:\-]/i.test(source);
    if (hasSignature && hasDate && hasName) return source;
    const blockLabel = signerBlockLabel(signerRole);
    const out = source ? `${source}\n\n` : '';
    return (
      out +
      [
        '---',
        `${blockLabel} Acceptance and Signature`,
        '',
        '',
        'Printed Name:',
        '',
        '',
        `${blockLabel} Signature:`,
        '',
        '',
        'Date:'
      ].join('\n')
    );
  }

  function plainTextToHtml(text) {
    const lines = String(text || '').split(/\r?\n/);
    return lines.map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<p><br /></p>')).join('');
  }

  function htmlToPlainText(html) {
    return String(html || '')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/\s*p\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function ensureSignatureSectionHtml(bodyHtml, signerRole) {
    const source = String(bodyHtml || '').trim();
    const textProbe = htmlToPlainText(source);
    const hasSignature = /\bsignature\b/i.test(textProbe);
    const hasDate = /\bdate\b/i.test(textProbe);
    const hasName = /\bprinted\s+name\b|\bname\s*[:\-]/i.test(textProbe);
    if (hasSignature && hasDate && hasName) return source;
    const blockLabel = signerBlockLabel(signerRole);
    return (
      (source ? `${source}\n` : '') +
      `<hr />
<p><strong>${blockLabel} Acceptance and Signature</strong></p>
<p><br /></p>
<p><strong>Printed Name:</strong></p>
<p><br /></p>
<p><strong>${blockLabel} Signature:</strong></p>
<p><br /></p>
<p><strong>Date:</strong></p>`
    );
  }

  function injectSignatureIntoHtml(templateHtml, contract) {
    const signer = escapeHtml(String(contract.signerName || '').trim());
    const signDate = escapeHtml(String(contract.signDate || '').trim());
    let out = String(templateHtml || '');
    out = out.replace(/\{\{\s*SIGNATURE_NAME\s*\}\}/gi, signer);
    out = out.replace(/\{\{\s*PRINTED_NAME\s*\}\}/gi, signer);
    out = out.replace(/\{\{\s*SIGNATURE\s*\}\}/gi, signer);
    out = out.replace(/\{\{\s*DATE\s*\}\}/gi, signDate);
    out = out.replace(
      /(<strong>\s*Printed\s+Name\s*:\s*<\/strong>\s*)(?:_+|\.{2,}|&nbsp;|\s)*(?:[^<]*)/gi,
      `$1${signer}`
    );
    out = out.replace(
      /(<strong>\s*(?:Client|Employee)\s+Signature\s*:\s*<\/strong>\s*)(?:_+|\.{2,}|&nbsp;|\s)*(?:[^<]*)/gi,
      `$1${signer}`
    );
    out = out.replace(
      /(<strong>\s*Date\s*:\s*<\/strong>\s*)(?:_+|\.{2,}|&nbsp;|\s)*(?:[^<]*)/gi,
      `$1${signDate}`
    );
    return out;
  }

  function injectSignatureIntoText(templateText, contract) {
    const signer = String(contract.signerName || '').trim();
    const signDate = String(contract.signDate || '').trim();
    let out = String(templateText || '');
    out = out.replace(/\{\{\s*SIGNATURE_NAME\s*\}\}/gi, signer);
    out = out.replace(/\{\{\s*PRINTED_NAME\s*\}\}/gi, signer);
    out = out.replace(/\{\{\s*SIGNATURE\s*\}\}/gi, signer);
    out = out.replace(/\{\{\s*DATE\s*\}\}/gi, signDate);
    out = out.replace(/^(\s*(?:client\s+|employee\s+)?signature\s*[:\-]\s*).*$/gim, `$1${signer}`);
    out = out.replace(/^(\s*date\s*[:\-]\s*).*$/gim, `$1${signDate}`);
    out = out.replace(/^(\s*(?:printed\s+)?name\s*[:\-]\s*).*$/gim, `$1${signer}`);
    return out;
  }

  function pdfEscape(text) {
    return String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  function buildSignedContractText(contract, customerName) {
    return [
      signedHeader,
      '========================================',
      `Client: ${customerName || 'Client'}`,
      `Contract: ${contract.title || 'Untitled contract'}`,
      `Status: ${contract.status || 'pending'}`,
      `Signer role: ${signerRoleLabel(contract.signerRole)}`,
      `Signer full name: ${contract.signerName || ''}`,
      `Date entered: ${contract.signDate || ''}`,
      `Signed at: ${contract.signedAt || ''}`,
      '',
      'Contract terms:',
      '----------------------------------------',
      String(contract.body || '').trim() || '(No body text)'
    ].join('\n');
  }

  function buildPdfFromLines(lines, signatureDataUrl, agentName) {
    const wrapped = [];
    lines.forEach((line) => {
      const s = String(line || '');
      if (s.length <= 100) wrapped.push(s);
      else {
        for (let i = 0; i < s.length; i += 100) wrapped.push(s.slice(i, i + 100));
      }
    });
    const maxLines = 220;
    const finalLines = wrapped.slice(0, maxLines);
    if (wrapped.length > maxLines) finalLines.push('... truncated ...');

    let sigLineIndexRaw = -1;
    for (let i = finalLines.length - 1; i >= 0; i -= 1) {
      if (/\bAgent Signature\b/i.test(finalLines[i])) {
        sigLineIndexRaw = i;
        break;
      }
    }
    if (sigLineIndexRaw === -1) {
      sigLineIndexRaw = finalLines.findIndex((ln) => /\bsignature\b/i.test(ln));
    }
    const sigLineIndex = sigLineIndexRaw === -1 ? Math.max(finalLines.length - 2, 0) : sigLineIndexRaw;

    const parsedSig = parseSignatureDataUrl(signatureDataUrl);
    const jpegSig = parsedSig && parsedSig.mime === 'image/jpeg' ? parsedSig : null;
    const jpegDims = jpegSig ? getJpegDimensions(jpegSig.buffer) : null;
    const drawSignature = Boolean(jpegSig && jpegDims);
    const safeAgentName = String(agentName || '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);

    const contentRows = ['BT', '/F1 11 Tf', '50 760 Td', '14 TL'];
    finalLines.forEach((line, idx) => {
      const t = `(${pdfEscape(line)}) Tj`;
      if (idx === 0) contentRows.push(t);
      else contentRows.push(`T* ${t}`);
    });
    contentRows.push('ET');
    if (drawSignature) {
      const sigW = 180;
      const aspect = jpegDims.height / jpegDims.width;
      const sigH = Math.max(40, Math.min(90, Math.round(sigW * aspect)));
      const lineToY = (lineIndex) => 760 - lineIndex * 14;
      const candidateY = lineToY(sigLineIndex) - sigH + 8;
      const sigY = Math.max(72, Math.min(720, candidateY));
      const sigX = 170;
      contentRows.push('q');
      contentRows.push(`${sigW} 0 0 ${sigH} ${sigX} ${sigY} cm`);
      contentRows.push('/Im1 Do');
      contentRows.push('Q');
      if (safeAgentName) {
        const nameY = Math.max(40, sigY - 14);
        contentRows.push('BT');
        contentRows.push('/F1 10 Tf');
        contentRows.push(`${sigX} ${nameY} Td`);
        contentRows.push(`(${pdfEscape(`Name: ${safeAgentName}`)}) Tj`);
        contentRows.push('ET');
      }
    }
    const stream = contentRows.join('\n');
    const objects = [];
    const addObj = (txt) => objects.push(txt);
    addObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    addObj('2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n');
    addObj(
      drawSignature
        ? '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 5 0 R >>\nendobj\n'
        : '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n'
    );
    addObj('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
    addObj(`5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`);
    if (drawSignature) {
      const jpegHex = `${jpegSig.buffer.toString('hex').toUpperCase()}>`;
      addObj(
        `6 0 obj\n<< /Type /XObject /Subtype /Image /Width ${jpegDims.width} /Height ${jpegDims.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${jpegHex.length} >>\nstream\n${jpegHex}\nendstream\nendobj\n`
      );
    }
    let out = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((o) => {
      offsets.push(Buffer.byteLength(out, 'utf8'));
      out += o;
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

  function buildSignedContractPdf(contract, customerName) {
    return buildPdfFromLines(buildSignedContractText(contract, customerName).split('\n'));
  }

  function buildSignedContractPdfFromText(textBody, signatureDataUrl, agentName) {
    return buildPdfFromLines(String(textBody || '').split('\n'), signatureDataUrl, agentName);
  }

  function parseSignatureDataUrl(dataUrl) {
    const s = String(dataUrl || '');
    const m = s.match(/^data:image\/(png|jpe?g);base64,([a-z0-9+/=\s]+)$/i);
    if (!m) return null;
    const fmt = m[1].toLowerCase();
    const mime = fmt === 'jpg' ? 'image/jpeg' : `image/${fmt}`;
    const b64 = m[2].replace(/\s+/g, '');
    return { mime, buffer: Buffer.from(b64, 'base64') };
  }

  function getJpegDimensions(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 4) return null;
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const len = (buf[i + 2] << 8) | buf[i + 3];
      if (len < 2 || i + 2 + len > buf.length) break;
      const isSOF =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSOF) {
        const h = (buf[i + 5] << 8) | buf[i + 6];
        const w = (buf[i + 7] << 8) | buf[i + 8];
        if (w > 0 && h > 0) return { width: w, height: h };
        return null;
      }
      i += 2 + len;
    }
    return null;
  }

  function createOriginalContractPdf(contract) {
    const outputPath = path.join(docsDir, `${contract.id}-original.pdf`);
    const body = String(contract.body || '').trim();
    const title = String(contract.title || 'Contract');
    const text = `${title}\n\n${body}`;
    const agentSig = String(contract._agentSigForPdf || '').trim();
    const agentName = String(contract._agentNameForPdf || contract.agentName || '').trim();
    try {
      fs.writeFileSync(outputPath, buildSignedContractPdfFromText(text, agentSig, agentName));
      if (!fs.existsSync(outputPath)) return null;
      return outputPath;
    } catch (err) {
      console.warn(`${logPrefix} Original PDF build failed:`, err.message);
      return null;
    }
  }

  function validEmail(value) {
    const s = String(value || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function effectivePython() {
    const pyCandidates = [
      process.env.MARKETING_MANAGER_PYTHON_BIN,
      process.env.PYTHON_BIN,
      process.env.PYTHON,
      'python3',
      'python'
    ].filter(Boolean);
    const pyBin =
      pyCandidates.find((bin) => {
        const check = spawnSync(bin, ['-V'], { encoding: 'utf8' });
        return !check.error;
      }) || 'python';
    let effectivePy = pyBin;
    let pyCheck = spawnSync(effectivePy, ['-c', 'import fitz'], { encoding: 'utf8' });
    if (pyCheck.status !== 0) {
      let pyInstall = spawnSync(effectivePy, ['-m', 'pip', 'install', '--user', 'pymupdf'], { encoding: 'utf8' });
      if (pyInstall.status !== 0) {
        spawnSync(effectivePy, ['-m', 'ensurepip', '--upgrade'], { encoding: 'utf8' });
        pyInstall = spawnSync(effectivePy, ['-m', 'pip', 'install', '--user', 'pymupdf'], { encoding: 'utf8' });
      }
      if (pyInstall.status !== 0) {
        const venvPy =
          process.platform === 'win32'
            ? path.join(pyenvDir, 'Scripts', 'python.exe')
            : path.join(pyenvDir, 'bin', 'python');
        if (!fs.existsSync(venvPy)) {
          spawnSync(pyBin, ['-m', 'venv', pyenvDir], { encoding: 'utf8' });
        }
        if (fs.existsSync(venvPy)) {
          spawnSync(venvPy, ['-m', 'ensurepip', '--upgrade'], { encoding: 'utf8' });
          spawnSync(venvPy, ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'], { encoding: 'utf8' });
          const venvPyMuPdf = spawnSync(venvPy, ['-m', 'pip', 'install', 'pymupdf'], { encoding: 'utf8' });
          if (venvPyMuPdf.status === 0) effectivePy = venvPy;
        }
      }
      pyCheck = spawnSync(effectivePy, ['-c', 'import fitz'], { encoding: 'utf8' });
      if (pyCheck.status !== 0) {
        console.warn(`${logPrefix} Python fitz module still unavailable:`, pyCheck.stderr || pyCheck.stdout);
      }
    }
    return effectivePy;
  }

  function stampAgentPageOnPdf(inputPath, outputPath, agentImagePath, dateStr, agentName, agentIdentity) {
    try {
      const stampScript = path.join(libDir, 'pdf_stamp_agent.py');
      const args = [
        stampScript,
        '--input',
        inputPath,
        '--output',
        outputPath,
        '--signature',
        agentImagePath,
        '--date',
        String(dateStr || ''),
        '--identity',
        normalizeAgentIdentity(agentIdentity)
      ];
      const safeName = sanitizeAgentName(agentName);
      if (safeName) args.push('--name', safeName);
      const py = spawnSync(effectivePython(), args, { encoding: 'utf8' });
      if (py.status !== 0 || !fs.existsSync(outputPath)) {
        console.warn(`${logPrefix} Agent PDF stamp failed:`, py.stderr || py.stdout || py.status);
        return false;
      }
      return true;
    } catch (error) {
      console.warn(`${logPrefix} Agent PDF stamp error:`, error.message);
      return false;
    }
  }

  function tryStampOriginalPdf(contract, signedPdfPath) {
    try {
      if (!contract.filePath || !fs.existsSync(contract.filePath)) return false;
      const ext = path.extname(String(contract.originalName || contract.filePath).toLowerCase());
      if (ext !== '.pdf') return false;
      const sig = parseSignatureDataUrl(contract.signatureDataUrl || '');
      if (!sig || !sig.buffer || !sig.buffer.length) return false;
      const sigExt = sig.mime === 'image/jpeg' ? 'jpg' : 'png';
      const tmpSigPath = path.join(signedDir, `${contract.id}-sig.${sigExt}`);
      fs.writeFileSync(tmpSigPath, sig.buffer);
      const signerScript = path.join(libDir, 'pdf_signer.py');
      const py = spawnSync(
        effectivePython(),
        [
          signerScript,
          '--input',
          contract.filePath,
          '--output',
          signedPdfPath,
          '--signature',
          tmpSigPath,
          '--name',
          String(contract.signerName || ''),
          '--date',
          String(contract.signDate || ''),
          '--role',
          signerBlockLabel(contract.signerRole)
        ],
        { encoding: 'utf8' }
      );
      try {
        if (fs.existsSync(tmpSigPath)) fs.unlinkSync(tmpSigPath);
      } catch {}
      if (py.status !== 0 || !fs.existsSync(signedPdfPath)) {
        console.warn(`${logPrefix} PDF signature stamping failed:`, py.stderr || py.stdout || py.status);
        return false;
      }
      return true;
    } catch (error) {
      console.warn(`${logPrefix} PDF signature stamping error:`, error.message);
      return false;
    }
  }

  function createSignedArtifacts(contract, customerName) {
    const signerRole = normalizeSignerRole(contract.signerRole);
    const baseText = (() => {
      const ext = path.extname(String(contract.originalName || '').toLowerCase());
      if (ext === '.txt' && contract.filePath && fs.existsSync(contract.filePath)) {
        try {
          return ensureSignatureSection(fs.readFileSync(contract.filePath, 'utf8'), signerRole);
        } catch {
          return ensureSignatureSection(contract.body || '', signerRole);
        }
      }
      return ensureSignatureSection(contract.body || '', signerRole);
    })();
    const injected = injectSignatureIntoText(baseText, contract);
    const baseHtml = ensureSignatureSectionHtml(contract.bodyHtml || plainTextToHtml(baseText), signerRole);
    const injectedHtml = injectSignatureIntoHtml(baseHtml, contract);
    const signedTxt = [
      injected.trim(),
      '',
      '---',
      `Signed by (${signerRoleLabel(signerRole)}): ${contract.signerName || ''}`,
      `Date: ${contract.signDate || ''}`,
      `Signed at: ${contract.signedAt || ''}`,
      `Client: ${customerName || 'Client'}`
    ].join('\n');
    const signedTextPath = path.join(signedDir, `${contract.id}-signed.txt`);
    fs.writeFileSync(signedTextPath, signedTxt, 'utf8');
    const signedHtmlPath = path.join(signedDir, `${contract.id}-signed.html`);
    fs.writeFileSync(signedHtmlPath, `<div>${injectedHtml}</div>`, 'utf8');
    const signedPdfPath = path.join(signedDir, `${contract.id}-signed.pdf`);
    const hasOriginalPdf =
      Boolean(contract.filePath) &&
      fs.existsSync(contract.filePath) &&
      path.extname(String(contract.originalName || contract.filePath).toLowerCase()) === '.pdf';
    if (hasOriginalPdf) {
      const stamped = tryStampOriginalPdf(contract, signedPdfPath);
      if (!stamped) {
        throw new Error('Could not stamp original PDF with signature. Please verify PDF signer dependencies.');
      }
    } else {
      fs.writeFileSync(signedPdfPath, buildSignedContractPdfFromText(signedTxt, contract.signatureDataUrl));
    }
    contract.signedTextPath = signedTextPath;
    contract.signedHtmlPath = signedHtmlPath;
    contract.signedPdfPath = signedPdfPath;
  }

  async function notifyContractSigned(contract, customerName) {
    const emailTransporter = getEmailTransporter();
    if (!emailTransporter) {
      console.warn(`${logPrefix} Signed contract email skipped: email transporter not configured`);
      return;
    }
    const notifyTo = String(getNotifyEmail() || '').trim();
    if (!notifyTo) {
      console.warn(`${logPrefix} Signed contract email skipped: no recipient configured`);
      return;
    }
    const safeTitle = String(contract.title || 'contract').replace(/[^a-zA-Z0-9_-]+/g, '_');
    const signedPdf =
      contract.signedPdfPath && fs.existsSync(contract.signedPdfPath)
        ? fs.readFileSync(contract.signedPdfPath)
        : buildSignedContractPdf(contract, customerName);
    await emailTransporter.sendMail({
      from: getFromEmail() || 'noreply@lab007.ai',
      to: notifyTo,
      subject: `Contract signed: ${contract.title || 'Untitled contract'}`,
      text: [
        notifyIntro,
        '',
        `Client: ${customerName || 'Client'}`,
        `Contract: ${contract.title || 'Untitled contract'}`,
        `Signed by (${signerRoleLabel(contract.signerRole)}): ${contract.signerName || 'Unknown signer'}`,
        `Date entered: ${contract.signDate || 'N/A'}`,
        `Signed at: ${contract.signedAt || 'N/A'}`
      ]
        .filter(Boolean)
        .join('\n'),
      attachments: [
        {
          filename: `${safeTitle || 'contract'}-signed.pdf`,
          content: signedPdf,
          contentType: 'application/pdf'
        }
      ]
    });
  }

  async function sendSignedCopyByEmail(contract, customerName, toEmail) {
    const emailTransporter = getEmailTransporter();
    if (!emailTransporter) throw new Error('Email service is not configured');
    if (!validEmail(toEmail)) throw new Error('Valid email address is required');
    if ((contract.status || 'pending') !== 'signed') throw new Error('Contract is not signed yet');
    const txt =
      contract.signedTextPath && fs.existsSync(contract.signedTextPath)
        ? fs.readFileSync(contract.signedTextPath, 'utf8')
        : buildSignedContractText(contract, customerName);
    const pdf =
      contract.signedPdfPath && fs.existsSync(contract.signedPdfPath)
        ? fs.readFileSync(contract.signedPdfPath)
        : buildSignedContractPdf(contract, customerName);
    const safeTitle = String(contract.title || 'contract').replace(/[^a-zA-Z0-9_-]+/g, '_');
    await emailTransporter.sendMail({
      from: getFromEmail() || 'noreply@lab007.ai',
      to: toEmail,
      subject: `Signed contract copy: ${contract.title || 'Contract'}`,
      text: `Attached is the signed contract copy for ${customerName || 'Client'}.`,
      attachments: [
        {
          filename: `${safeTitle || 'contract'}-signed.txt`,
          content: txt,
          contentType: 'text/plain; charset=utf-8'
        },
        {
          filename: `${safeTitle || 'contract'}-signed.pdf`,
          content: pdf,
          contentType: 'application/pdf'
        }
      ]
    });
  }

  function customerNameFor(contractOrId) {
    const id = typeof contractOrId === 'string' ? contractOrId : contractOrId?.customerId;
    const customer = findCustomer(id);
    return customer?.name || 'Client';
  }

  function deleteContractFiles(contract) {
    [contract.filePath, contract.signedTextPath, contract.signedHtmlPath, contract.signedPdfPath].forEach((p) => {
      if (!p) return;
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (err) {
        console.warn(`${logPrefix} Failed deleting contract file:`, p, err.message);
      }
    });
  }

  function sendExistingFile(res, filePath, mimeType) {
    if (mimeType) res.type(mimeType);
    return res.sendFile(path.resolve(filePath));
  }

  function register(app) {
    app.get(`${apiPrefix}/agent-signature`, (req, res) => {
      try {
        const store = readAgentSignatureStore();
        const profiles = {};
        agentIdentities.forEach((identity) => {
          const profile = store.profiles[identity];
          profiles[identity] = profile
            ? {
                hasSignature: true,
                updatedAt: profile.updatedAt || null,
                signatureDataUrl: profile.signatureDataUrl,
                agentName: profile.agentName || ''
              }
            : { hasSignature: false, updatedAt: null, signatureDataUrl: '', agentName: '' };
        });
        return res.json({ profiles, defaultIdentity: defaultAgentIdentity, identities: agentIdentities });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    });

    app.post(`${apiPrefix}/agent-signature`, (req, res) => {
      try {
        const incomingSig = String(req.body?.signatureDataUrl || '').trim();
        const incomingName = sanitizeAgentName(req.body?.agentName);
        const incomingIdentity = normalizeAgentIdentity(req.body?.agentIdentity);
        const existing = readAgentSignature(incomingIdentity);
        let effectiveSig = '';
        if (incomingSig) {
          if (!validSignatureDataUrl(incomingSig)) {
            return res.status(400).json({ error: 'Valid signature image (PNG or JPEG data URL) is required' });
          }
          effectiveSig = incomingSig;
        } else if (existing?.signatureDataUrl) {
          effectiveSig = existing.signatureDataUrl;
        } else {
          return res.status(400).json({ error: 'Valid signature image (PNG or JPEG data URL) is required' });
        }
        const saved = writeAgentSignature(effectiveSig, incomingName, incomingIdentity);
        return res.json({
          success: true,
          updatedAt: saved.updatedAt,
          agentName: saved.agentName || '',
          agentIdentity: saved.agentIdentity
        });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    });

    app.delete(`${apiPrefix}/agent-signature`, (req, res) => {
      try {
        const identity = normalizeAgentIdentity(req.query?.agentIdentity);
        deleteAgentSignature(identity);
        return res.json({ success: true, agentIdentity: identity });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    });

    app.get(`${apiPrefix}/clients/:clientId/contracts`, (req, res) => {
      try {
        const customer = findCustomer(req.params.clientId);
        if (!customer) return res.status(404).json({ error: 'Client not found' });
        const data = readContracts();
        const contracts = data.contracts
          .filter((x) => x.customerId === customer.id)
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
          .map((x) => contractView(x, customer.name));
        return res.json({ contracts });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    });

    app.get(`${apiPrefix}/contracts`, (req, res) => {
      try {
        const byCustomer = new Map((listCustomers() || []).map((c) => [c.id, c.name || 'Client']));
        const statusFilter = String(req.query?.status || '').trim().toLowerCase();
        const customerFilter = String(req.query?.customerId || req.query?.clientId || '').trim();
        const contracts = readContracts()
          .contracts.filter((x) => {
            const st = (x.status || 'pending').toLowerCase();
            if (statusFilter && statusFilter !== 'all' && st !== statusFilter) return false;
            if (customerFilter && customerFilter !== 'all' && x.customerId !== customerFilter) return false;
            return true;
          })
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
          .map((x) => contractView(x, byCustomer.get(x.customerId) || 'Client'));
        return res.json({ contracts });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    });

    app.get(`${apiPrefix}/contracts/stats`, (req, res) => {
      try {
        let total = 0;
        let pending = 0;
        let signed = 0;
        readContracts().contracts.forEach((c) => {
          total += 1;
          if ((c.status || 'pending') === 'signed') signed += 1;
          else pending += 1;
        });
        return res.json({ total, pending, signed });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    });

    app.post(`${apiPrefix}/clients/:clientId/contracts`, (req, res) => {
      try {
        const customer = findCustomer(req.params.clientId);
        if (!customer) return res.status(404).json({ error: 'Client not found' });
        const title = String(req.body?.title || '').trim();
        const includeAgentSignature = Boolean(req.body?.includeAgentSignature);
        const requestedAgentIdentity = normalizeAgentIdentity(req.body?.agentIdentity, defaultAgentIdentity);
        const bodyHtmlRaw = String(req.body?.bodyHtml || '').trim();
        let bodyHtml = bodyHtmlRaw ? ensureSignatureSectionHtml(bodyHtmlRaw) : '';
        const bodyRaw = String(req.body?.body || '').trim();
        let body = ensureSignatureSection(bodyRaw || htmlToPlainText(bodyHtml));
        if (!title) return res.status(400).json({ error: 'Contract title is required' });
        if (!body) return res.status(400).json({ error: 'Contract body is required' });

        const createdAt = new Date().toISOString();
        const genDate = createdAt.slice(0, 10);
        let agentSigForPdf = '';
        let agentNameSnapshot = '';
        let agentIdentitySnapshot = defaultAgentIdentity;
        if (includeAgentSignature) {
          const agent = readAgentSignature(requestedAgentIdentity);
          if (!agent?.signatureDataUrl) {
            return res.status(400).json({
              error: `Save a signature for ${requestedAgentIdentity} first, or uncheck “Include owner signature”.`
            });
          }
          agentNameSnapshot = agent.agentName || '';
          agentIdentitySnapshot = normalizeAgentIdentity(agent.agentIdentity);
          const appended = appendAgentSignatureBlocks(
            body,
            bodyHtml,
            agent.signatureDataUrl,
            genDate,
            agentNameSnapshot,
            agentIdentitySnapshot
          );
          body = appended.body;
          bodyHtml = appended.bodyHtml;
          agentSigForPdf = agent.signatureDataUrl;
        }

        const contract = {
          id: newId('contract'),
          customerId: customer.id,
          title,
          body,
          bodyHtml,
          token: crypto.randomBytes(24).toString('hex'),
          status: 'pending',
          createdAt,
          signedAt: null,
          signerName: '',
          signDate: '',
          signatureDataUrl: '',
          sourceType: 'created',
          includeAgentSignature,
          agentSignatureDate: includeAgentSignature ? genDate : '',
          agentName: includeAgentSignature ? agentNameSnapshot : '',
          agentIdentity: includeAgentSignature ? agentIdentitySnapshot : ''
        };
        const originalPdfPath = createOriginalContractPdf({
          ...contract,
          _agentSigForPdf: agentSigForPdf,
          _agentNameForPdf: agentNameSnapshot
        });
        if (originalPdfPath) {
          contract.filePath = originalPdfPath;
          contract.originalName = `${title}.pdf`;
          contract.mimeType = 'application/pdf';
          try {
            contract.fileSize = fs.statSync(originalPdfPath).size || 0;
          } catch {
            contract.fileSize = 0;
          }
        }
        const data = readContracts();
        data.contracts.push(contract);
        writeContracts(data);
        return res.status(201).json({ contract: contractView(contract, customer.name) });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    });

    app.post(`${apiPrefix}/clients/:clientId/contracts/upload`, (req, res) => {
      upload.single('document')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
        try {
          const customer = findCustomer(req.params.clientId);
          if (!customer) return res.status(404).json({ error: 'Client not found' });
          if (!req.file) return res.status(400).json({ error: 'Document file is required' });

          const titleRaw = String(req.body?.title || '').trim();
          const title = titleRaw || req.file.originalname || 'Contract document';
          const signerRole = normalizeSignerRole(req.body?.signerRole);
          const requestedAgentIdentity = normalizeAgentIdentity(req.body?.agentIdentity, defaultAgentIdentity);
          const uploadExt = path.extname(String(req.file.originalname || '').toLowerCase());
          const includeAgentRaw = req.body?.includeAgentSignature;
          const includeAgentSignature =
            includeAgentRaw === true ||
            includeAgentRaw === 1 ||
            ['1', 'true', 'on', 'yes'].includes(String(includeAgentRaw || '').trim().toLowerCase());
          let uploadBody = String(req.body?.body || '').trim();
          if (!uploadBody && uploadExt === '.txt') {
            try {
              uploadBody = fs.readFileSync(req.file.path, 'utf8');
            } catch {
              uploadBody = '';
            }
          }
          const uploadBodyHtmlRaw = String(req.body?.bodyHtml || '').trim();
          const createdAt = new Date().toISOString();
          const genDate = createdAt.slice(0, 10);

          const unlinkUpload = () => {
            try {
              if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            } catch {}
          };

          if (includeAgentSignature && uploadExt !== '.pdf') {
            unlinkUpload();
            return res.status(400).json({
              error:
                'Including the Agent signature adds a page to the PDF. Upload a PDF file, or turn off “Include my Agent signature”.'
            });
          }

          let agentTmpPath = '';
          let agentNameSnapshot = '';
          let agentIdentitySnapshot = defaultAgentIdentity;
          if (includeAgentSignature && uploadExt === '.pdf') {
            const agent = readAgentSignature(requestedAgentIdentity);
            if (!agent?.signatureDataUrl) {
              unlinkUpload();
              return res.status(400).json({
                error: `Save a signature for ${requestedAgentIdentity} first, or do not include it on upload.`
              });
            }
            agentNameSnapshot = agent.agentName || '';
            agentIdentitySnapshot = normalizeAgentIdentity(agent.agentIdentity);
            const parsedAgent = parseSignatureDataUrl(agent.signatureDataUrl);
            if (!parsedAgent?.buffer?.length) {
              unlinkUpload();
              return res.status(400).json({ error: 'Stored Agent signature is invalid. Save it again.' });
            }
            const agentExt = parsedAgent.mime === 'image/jpeg' ? 'jpg' : 'png';
            agentTmpPath = path.join(
              signedDir,
              `upload-agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${agentExt}`
            );
            fs.writeFileSync(agentTmpPath, parsedAgent.buffer);
          }

          const contract = {
            id: newId('contract'),
            customerId: customer.id,
            title,
            body: ensureSignatureSection(uploadBody, signerRole),
            bodyHtml: ensureSignatureSectionHtml(uploadBodyHtmlRaw || plainTextToHtml(uploadBody), signerRole),
            token: crypto.randomBytes(24).toString('hex'),
            status: 'pending',
            createdAt,
            signedAt: null,
            signerName: '',
            signerRole,
            signDate: '',
            signatureDataUrl: '',
            sourceType: 'uploaded',
            filePath: req.file.path,
            originalName: req.file.originalname || title,
            mimeType: req.file.mimetype || 'application/octet-stream',
            fileSize: req.file.size || 0,
            includeAgentSignature: Boolean(includeAgentSignature && uploadExt === '.pdf'),
            agentSignatureDate: includeAgentSignature && uploadExt === '.pdf' ? genDate : '',
            agentName: includeAgentSignature && uploadExt === '.pdf' ? agentNameSnapshot : '',
            agentIdentity: includeAgentSignature && uploadExt === '.pdf' ? agentIdentitySnapshot : ''
          };

          if (includeAgentSignature && uploadExt === '.pdf' && agentTmpPath) {
            const outPdf = path.join(docsDir, `${contract.id}-with-agent.pdf`);
            const ok = stampAgentPageOnPdf(
              req.file.path,
              outPdf,
              agentTmpPath,
              genDate,
              agentNameSnapshot,
              agentIdentitySnapshot
            );
            try {
              if (fs.existsSync(agentTmpPath)) fs.unlinkSync(agentTmpPath);
            } catch {}
            if (!ok) {
              unlinkUpload();
              try {
                if (fs.existsSync(outPdf)) fs.unlinkSync(outPdf);
              } catch {}
              return res.status(500).json({
                error:
                  'Could not append the Agent signature page. Ensure Python and PyMuPDF (pymupdf) are available on the server.'
              });
            }
            unlinkUpload();
            contract.filePath = outPdf;
            contract.mimeType = 'application/pdf';
            try {
              contract.fileSize = fs.statSync(outPdf).size || 0;
            } catch {
              contract.fileSize = 0;
            }
          }

          const data = readContracts();
          data.contracts.push(contract);
          writeContracts(data);
          return res.status(201).json({ contract: contractView(contract, customer.name) });
        } catch (error) {
          return res.status(500).json({ error: error.message });
        }
      });
    });

    app.delete(`${apiPrefix}/clients/:clientId/contracts/:contractId`, (req, res) => {
      try {
        const customer = findCustomer(req.params.clientId);
        if (!customer) return res.status(404).json({ error: 'Client not found' });
        const data = readContracts();
        const idx = data.contracts.findIndex(
          (x) => x.id === req.params.contractId && x.customerId === customer.id
        );
        if (idx === -1) return res.status(404).json({ error: 'Contract not found' });
        deleteContractFiles(data.contracts[idx]);
        data.contracts.splice(idx, 1);
        writeContracts(data);
        return res.json({ success: true });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    });

    app.delete(`${apiPrefix}/clients/:clientId/contracts`, (req, res) => {
      try {
        const customer = findCustomer(req.params.clientId);
        if (!customer) return res.status(404).json({ error: 'Client not found' });
        const data = readContracts();
        const toDelete = data.contracts.filter((x) => x.customerId === customer.id);
        toDelete.forEach(deleteContractFiles);
        data.contracts = data.contracts.filter((x) => x.customerId !== customer.id);
        writeContracts(data);
        return res.json({ success: true, deleted: toDelete.length });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    });

    app.get(`${apiPrefix}/contracts/:contractId/document`, (req, res) => {
      try {
        const contract = readContracts().contracts.find((x) => x.id === req.params.contractId);
        if (!contract) return res.status(404).json({ error: 'Contract not found' });
        if (!contract.filePath || !fs.existsSync(contract.filePath)) {
          return res.status(404).json({ error: 'Document file not found' });
        }
        return sendExistingFile(res, contract.filePath, contract.mimeType);
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    });

    app.get(`${apiPrefix}/contracts/:contractId/signed-document`, (req, res) => {
      try {
        const contract = readContracts().contracts.find((x) => x.id === req.params.contractId);
        if (!contract) return res.status(404).json({ error: 'Contract not found' });
        if ((contract.status || 'pending') !== 'signed') {
          return res.status(404).json({ error: 'Signed document not found' });
        }
        if (contract.signedPdfPath && fs.existsSync(contract.signedPdfPath)) {
          res.type('application/pdf');
          return res.sendFile(path.resolve(contract.signedPdfPath));
        }
        if (contract.signedTextPath && fs.existsSync(contract.signedTextPath)) {
          res.type('text/plain; charset=utf-8');
          return res.sendFile(path.resolve(contract.signedTextPath));
        }
        return res.status(404).json({ error: 'Signed document not found' });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    });

    app.get(`${apiPrefix}/contracts/sign/:token`, (req, res) => {
      try {
        const token = String(req.params.token || '').trim();
        if (!token) return res.status(400).json({ error: 'Invalid token' });
        const contract = readContracts().contracts.find((x) => x.token === token);
        if (!contract) return res.status(404).json({ error: 'Contract not found' });
        return res.json({
          contract: {
            title: contract.title,
            body: contract.body,
            bodyHtml: contract.bodyHtml || '',
            status: contract.status || 'pending',
            customerName: customerNameFor(contract),
            signerName: contract.signerName || '',
            signerRole: normalizeSignerRole(contract.signerRole),
            signerRoleLabel: signerRoleLabel(contract.signerRole),
            signDate: contract.signDate || '',
            signedAt: contract.signedAt || null,
            signatureDataUrl: contract.signatureDataUrl || '',
            hasDocument: Boolean(contract.filePath),
            documentName: contract.originalName || '',
            documentPath: contract.filePath ? `${apiPrefix}/contracts/sign/${token}/document` : '',
            signedDocumentPath:
              contract.status === 'signed' && (contract.signedPdfPath || contract.signedTextPath)
                ? `${apiPrefix}/contracts/sign/${token}/document`
                : ''
          }
        });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    });

    app.get(`${apiPrefix}/contracts/sign/:token/document`, (req, res) => {
      try {
        const token = String(req.params.token || '').trim();
        if (!token) return res.status(400).json({ error: 'Invalid token' });
        const data = readContracts();
        const contract = data.contracts.find((x) => x.token === token);
        if (!contract) return res.status(404).json({ error: 'Contract not found' });
        if ((contract.status || 'pending') === 'signed') {
          try {
            createSignedArtifacts(contract, customerNameFor(contract));
            writeContracts(data);
          } catch (regenError) {
            console.warn(`${logPrefix} Could not refresh signed artifacts for view:`, regenError.message);
          }
          if (contract.signedPdfPath && fs.existsSync(contract.signedPdfPath)) {
            res.type('application/pdf');
            return res.sendFile(path.resolve(contract.signedPdfPath));
          }
          return res.status(500).json({ error: 'Signed PDF missing. Please re-sign the document.' });
        }
        if (!contract.filePath || !fs.existsSync(contract.filePath)) {
          return res.status(404).json({ error: 'Document file not found' });
        }
        return sendExistingFile(res, contract.filePath, contract.mimeType);
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    });

    app.get(`${apiPrefix}/contracts/sign/:token/download`, (req, res) => {
      try {
        const token = String(req.params.token || '').trim();
        if (!token) return res.status(400).json({ error: 'Invalid token' });
        const data = readContracts();
        const contract = data.contracts.find((x) => x.token === token);
        if (!contract) return res.status(404).json({ error: 'Contract not found' });
        if ((contract.status || 'pending') !== 'signed') {
          return res.status(409).json({ error: 'Contract must be signed before download' });
        }
        try {
          createSignedArtifacts(contract, customerNameFor(contract));
          writeContracts(data);
        } catch (regenError) {
          console.warn(`${logPrefix} Could not refresh signed artifacts for download:`, regenError.message);
        }
        const safeTitle = String(contract.title || 'contract').replace(/[^a-zA-Z0-9_-]+/g, '_');
        if (contract.signedPdfPath && fs.existsSync(contract.signedPdfPath)) {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${safeTitle || 'contract'}-signed.pdf"`);
          return res.sendFile(path.resolve(contract.signedPdfPath));
        }
        return res.status(500).json({ error: 'Signed PDF missing. Please re-sign the document.' });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    });

    app.post(`${apiPrefix}/contracts/sign/:token/email-copy`, async (req, res) => {
      try {
        const token = String(req.params.token || '').trim();
        if (!token) return res.status(400).json({ error: 'Invalid token' });
        const toEmail = String(req.body?.email || '').trim();
        if (!validEmail(toEmail)) return res.status(400).json({ error: 'Valid email address is required' });
        const data = readContracts();
        const contract = data.contracts.find((x) => x.token === token);
        if (!contract) return res.status(404).json({ error: 'Contract not found' });
        try {
          createSignedArtifacts(contract, customerNameFor(contract));
          writeContracts(data);
        } catch (regenError) {
          console.warn(`${logPrefix} Could not refresh signed artifacts for email:`, regenError.message);
        }
        await sendSignedCopyByEmail(contract, customerNameFor(contract), toEmail);
        return res.json({ success: true });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    });

    app.post(`${apiPrefix}/contracts/sign/:token`, (req, res) => {
      try {
        const token = String(req.params.token || '').trim();
        if (!token) return res.status(400).json({ error: 'Invalid token' });
        const fullName = String(req.body?.fullName || '').trim();
        const signDate = String(req.body?.date || '').trim();
        const signatureDataUrl = String(req.body?.signatureDataUrl || '').trim();
        if (!fullName) return res.status(400).json({ error: 'Full name is required' });
        if (!signDate) return res.status(400).json({ error: 'Date is required' });
        if (!validSignatureDataUrl(signatureDataUrl)) {
          return res.status(400).json({ error: 'Signature is required' });
        }

        const data = readContracts();
        const contract = data.contracts.find((x) => x.token === token);
        if (!contract) return res.status(404).json({ error: 'Contract not found' });
        if (contract.status === 'signed') return res.status(409).json({ error: 'Contract already signed' });

        contract.signerName = fullName;
        contract.signDate = signDate;
        contract.signatureDataUrl = signatureDataUrl;
        contract.status = 'signed';
        contract.signedAt = new Date().toISOString();
        const customerName = customerNameFor(contract);
        if (!contract.filePath || !fs.existsSync(contract.filePath)) {
          const originalPdfPath = createOriginalContractPdf(contract);
          if (originalPdfPath) {
            contract.filePath = originalPdfPath;
            contract.originalName = contract.originalName || `${contract.title || 'contract'}.pdf`;
            contract.mimeType = contract.mimeType || 'application/pdf';
          }
        }
        createSignedArtifacts(contract, customerName);
        writeContracts(data);
        notifyContractSigned(contract, customerName).catch((notifyErr) => {
          console.warn(`${logPrefix} Signed contract notification failed:`, notifyErr.message);
        });
        return res.json({ success: true, signedAt: contract.signedAt });
      } catch (error) {
        const msg = String(error.message || 'Signing failed');
        return res.status(500).json({ error: msg });
      }
    });
  }

  return { register, dataDir, docsDir };
}

module.exports = { createContractEsign };
