'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const yauzl = require('yauzl');

const TEXT_EXTS = new Set([
  '.log',
  '.txt',
  '.csv',
  '.json',
  '.xml',
  '.ini',
  '.cfg',
  '.conf',
  '.out',
  '.err',
  '.trace',
  '.etl.txt'
]);

const INTERESTING_NAME_RE =
  /(horizon|omnissa|vmware|blast|pcoip|vda|agent|rds|broker|view|debug|error|warn|event|hzn|wsnm|ws_)/i;

const FINDING_PATTERNS = [
  { severity: 'critical', re: /\b(FATAL|CRITICAL|SEVERE)\b/i, label: 'Fatal/critical' },
  { severity: 'high', re: /\b(ERROR|Exception|Unhandled|AccessDenied|Access denied)\b/i, label: 'Error/exception' },
  { severity: 'high', re: /\b(failed|failure|crash(ed)?|hang(ed)?|abort(ed)?)\b/i, label: 'Failure/crash' },
  { severity: 'high', re: /\b(certificate|ssl|tls).{0,40}(error|fail|invalid|expired|untrusted)/i, label: 'Cert/TLS issue' },
  { severity: 'medium', re: /\b(timeout|timed out|connection refused|network unreachable|no route)\b/i, label: 'Connectivity' },
  { severity: 'medium', re: /\b(service).{0,30}(stopped|not running|failed to start)/i, label: 'Service state' },
  { severity: 'medium', re: /\b(disk (full|space)|out of memory|low memory|cpu (spike|saturat))/i, label: 'Resource pressure' },
  { severity: 'medium', re: /\b(blast|pcoip|protocol).{0,40}(error|fail|disconnect|drop)/i, label: 'Protocol issue' },
  { severity: 'low', re: /\b(WARN(ING)?)\b/i, label: 'Warning' }
];

function isLikelyTextEntry(fileName) {
  const base = String(fileName || '').replace(/\\/g, '/');
  const ext = path.extname(base).toLowerCase();
  if (TEXT_EXTS.has(ext)) return true;
  if (!ext && INTERESTING_NAME_RE.test(base)) return true;
  return INTERESTING_NAME_RE.test(base) && ['.log', '.txt', ''].includes(ext);
}

function openZip(filePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err) reject(err);
      else resolve(zipfile);
    });
  });
}

function readZipEntry(zipfile, entry, maxBytes) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err) return reject(err);
      const chunks = [];
      let total = 0;
      let truncated = false;
      stream.on('data', (chunk) => {
        if (truncated) return;
        total += chunk.length;
        if (total > maxBytes) {
          truncated = true;
          chunks.push(chunk.slice(0, Math.max(0, maxBytes - (total - chunk.length))));
          stream.destroy();
          return;
        }
        chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => {
        resolve({ buffer: Buffer.concat(chunks), truncated });
      });
      stream.on('close', () => {
        if (truncated) resolve({ buffer: Buffer.concat(chunks), truncated: true });
      });
    });
  });
}

async function extractTextFilesFromZip(zipPath, options = {}) {
  const maxFiles = Math.max(1, Number(options.maxFiles) || 100);
  const maxBytesPerFile = Math.max(16 * 1024, Number(options.maxBytesPerFile) || 2 * 1024 * 1024);
  const zipfile = await openZip(zipPath);
  const files = [];

  await new Promise((resolve, reject) => {
    zipfile.on('error', reject);
    zipfile.on('end', resolve);
    zipfile.readEntry();
    zipfile.on('entry', async (entry) => {
      try {
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }
        if (files.length >= maxFiles) {
          zipfile.readEntry();
          return;
        }
        if (!isLikelyTextEntry(entry.fileName)) {
          zipfile.readEntry();
          return;
        }
        if (Number(entry.uncompressedSize || 0) > maxBytesPerFile * 4) {
          // Skip huge binaries masquerading as logs
          zipfile.readEntry();
          return;
        }
        const { buffer, truncated } = await readZipEntry(zipfile, entry, maxBytesPerFile);
        // Heuristic: reject mostly-binary buffers
        const sample = buffer.slice(0, Math.min(buffer.length, 2048));
        let nul = 0;
        for (let i = 0; i < sample.length; i += 1) if (sample[i] === 0) nul += 1;
        if (nul > sample.length * 0.02) {
          zipfile.readEntry();
          return;
        }
        files.push({
          path: entry.fileName.replace(/\\/g, '/'),
          size: entry.uncompressedSize || buffer.length,
          truncated: !!truncated,
          text: buffer.toString('utf8')
        });
        zipfile.readEntry();
      } catch (err) {
        reject(err);
      }
    });
  });

  return files;
}

function scanFileText(file) {
  const lines = String(file.text || '').split(/\r?\n/);
  const findings = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.length > 4000) continue;
    for (const pattern of FINDING_PATTERNS) {
      if (!pattern.re.test(line)) continue;
      const key = `${pattern.label}|${line.trim().slice(0, 180)}`;
      if (seen.has(key)) break;
      seen.add(key);
      findings.push({
        severity: pattern.severity,
        category: pattern.label,
        file: file.path,
        line: i + 1,
        text: line.trim().slice(0, 500)
      });
      break;
    }
    if (findings.length >= 80) break;
  }
  return findings;
}

function summarizeFindings(findings) {
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const byCategory = {};
  findings.forEach((f) => {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  });
  return { bySeverity, byCategory, total: findings.length };
}

function buildHeuristicReport(files, findings, hostHint) {
  const summary = summarizeFindings(findings);
  const top = findings
    .slice()
    .sort((a, b) => {
      const rank = { critical: 0, high: 1, medium: 2, low: 3 };
      return (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
    })
    .slice(0, 40);

  const issues = [];
  if (summary.bySeverity.critical) issues.push(`${summary.bySeverity.critical} critical/fatal line(s)`);
  if (summary.bySeverity.high) issues.push(`${summary.bySeverity.high} error/exception line(s)`);
  if (summary.byCategory['Cert/TLS issue']) issues.push('certificate/TLS problems appear in the logs');
  if (summary.byCategory.Connectivity) issues.push('timeouts or connection failures appear');
  if (summary.byCategory['Protocol issue']) issues.push('Blast/PCoIP protocol errors appear');
  if (summary.byCategory['Service state']) issues.push('service stop/start failures appear');
  if (summary.byCategory['Resource pressure']) issues.push('possible resource pressure (CPU/memory/disk)');

  let verdict = 'No obvious high-severity issues found in scanned text logs.';
  if (summary.bySeverity.critical || summary.bySeverity.high >= 5) {
    verdict = 'Likely issues found — review high/critical findings first.';
  } else if (summary.bySeverity.high || summary.bySeverity.medium >= 10) {
    verdict = 'Some warnings/errors found — may be noise or intermittent problems.';
  }

  return {
    hostHint: hostHint || null,
    filesScanned: files.length,
    fileNames: files.map((f) => f.path).slice(0, 120),
    summary,
    verdict,
    highlights: issues,
    findings: top
  };
}

async function askOpenAiAboutLogs(report, options = {}) {
  const apiKey = String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
  if (!apiKey) {
    return { used: false, error: 'OPENAI_API_KEY not configured on the server.' };
  }
  const fetchFn = options.fetchFn || fetch;
  const model = process.env.HOST_AGENT_OPENAI_MODEL || process.env.OPENAI_ANALYZE_MODEL || 'gpt-4o-mini';

  const findingBlob = (report.findings || [])
    .slice(0, 35)
    .map((f) => `[${f.severity}] ${f.file}:${f.line} ${f.category} :: ${f.text}`)
    .join('\n')
    .slice(0, 70000);

  const prompt = `You are a senior Omnissa Horizon / VMware Horizon RDS Host Agent support engineer.
A ZIP of debug logs from a single RDS host was scanned. Heuristic findings are below.

Host hint: ${report.hostHint || 'unknown'}
Files scanned: ${report.filesScanned}
Heuristic verdict: ${report.verdict}
Highlights: ${(report.highlights || []).join('; ') || 'none'}

Findings:
${findingBlob || '(no heuristic findings)'}

Tasks:
1) Summarize what looks wrong vs likely benign noise.
2) Rank the top 5 actionable issues.
3) Suggest concrete next checks on the RDS host (services, Blast, certs, event logs, broker connectivity).
4) Call out anything that looks like a known Horizon Agent / Omnissa Host Agent failure pattern.
Keep it concise and practical. Use short bullets.`;

  const body = {
    model,
    temperature: 0.2,
    max_tokens: 900,
    messages: [
      {
        role: 'system',
        content:
          'You troubleshoot Omnissa/VMware Horizon Agent logs on Windows RDS hosts. Be concise, skeptical of noise, and actionable.'
      },
      { role: 'user', content: prompt }
    ]
  };

  const response = await fetchFn('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    return {
      used: false,
      error: `OpenAI request failed: ${errText || response.statusText}`,
      model
    };
  }
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || '';
  return { used: true, model, text };
}

async function analyzeHostAgentZip(zipPath, options = {}) {
  const hostHint = String(options.hostHint || '').trim() || null;
  const useAi = options.useAi !== false;
  const files = await extractTextFilesFromZip(zipPath, {
    maxFiles: options.maxFiles || 100,
    maxBytesPerFile: options.maxBytesPerFile || 2 * 1024 * 1024
  });

  if (!files.length) {
    return {
      ok: false,
      error:
        'No readable text log files found in the ZIP. Expect Omnissa/Horizon Host Agent .log/.txt debug files.'
    };
  }

  const findings = [];
  files.forEach((file) => {
    findings.push(...scanFileText(file));
  });

  const report = buildHeuristicReport(files, findings, hostHint);
  let ai = { used: false, skipped: !useAi };
  if (useAi) {
    try {
      ai = await askOpenAiAboutLogs(report, { fetchFn: options.fetchFn });
    } catch (err) {
      ai = { used: false, error: err.message || String(err) };
    }
  }

  return {
    ok: true,
    analyzedAt: new Date().toISOString(),
    report,
    ai
  };
}

module.exports = {
  analyzeHostAgentZip,
  extractTextFilesFromZip,
  buildHeuristicReport,
  FINDING_PATTERNS
};
