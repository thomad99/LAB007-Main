/**
 * CursorAI project filesystem + LLM generation (shared by HTTP API and Telegram inbound).
 *
 * Optional env:
 *   CURSORAI_STYLE_BRIEF — if set, replaces the built-in default style block entirely.
 *   CURSORAI_EXTRA_STYLE — appended after the built-in style block (ignored when CURSORAI_STYLE_BRIEF is set).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { notifyCursorAiJobComplete } = require('./notify');

const fetchFn =
  global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

function getCursorAiProjectsRoot() {
  const explicit = String(process.env.CURSORAI_PROJECTS_DIR || '').trim();
  if (explicit) return path.resolve(explicit);
  const diskRoot = String(process.env.LAB007_DATA_DIR || process.env.LAB007_DISK_ROOT || '').trim();
  if (diskRoot) return path.join(path.resolve(diskRoot), 'CursorAgent');
  return path.join(path.dirname(__dirname), 'data', 'CursorAgent');
}

const cursorAiProjectsRoot = getCursorAiProjectsRoot();

function cursorAiSlug(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function cursorAiSafeRelPath(filePath) {
  const raw = String(filePath || '').trim().replace(/\\/g, '/');
  if (!raw) return null;
  if (raw.startsWith('/') || raw.includes('..')) return null;
  return raw;
}

/** Prepended into every CursorAI generation request (HTTP + Telegram). Override/extend via CURSORAI_EXTRA_STYLE. */
const CURSOR_AI_DEFAULT_STYLE_BRIEF = `
LAB007 default design rules (always apply alongside the user's request):

Role: You mostly create websites — keep output clean, modern, and polished.

Layout & UX:
- Mobile-first: responsive CSS, readable type on phones, comfortable tap targets.
- Use tile-style dashboards (card/tile grids) when presenting high-level stats or KPI-style data.
- For long lists or dense navigation, use collapsible sections or accordion menus; default them to collapsed unless the user explicitly asks otherwise.

Visual quality:
- Prefer large, legible fonts and clear hierarchy (headings vs body).
- Use sharp, professional visuals: SVG icons where possible; any raster images should be appropriate resolution (avoid tiny/blurry assets). Link to reputable CDNs or embed SVG; no broken image placeholders.

Stack: plain HTML/CSS/JS only (no build tools required); lightweight vanilla JS for collapsibles is fine.
`.trim();

function getCursorAiStyleBrief() {
  const override = String(process.env.CURSORAI_STYLE_BRIEF || '').trim();
  if (override) return override;
  const extra = String(process.env.CURSORAI_EXTRA_STYLE || '').trim();
  return extra ? `${CURSOR_AI_DEFAULT_STYLE_BRIEF}\n\nAdditional instructions:\n${extra}` : CURSOR_AI_DEFAULT_STYLE_BRIEF;
}

async function cursorAiGenerateFiles(provider, prompt, projectName) {
  const openAiKey = String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
  const anthropicKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
  const picked =
    provider === 'auto'
      ? anthropicKey
        ? 'claude'
        : openAiKey
        ? 'openai'
        : ''
      : provider;
  if (!picked) throw new Error('No API key configured (OPENAI_API_KEY/OPENAI_KEY or ANTHROPIC_API_KEY).');

  const styleBrief = getCursorAiStyleBrief();

  const buildPrompt = `Create a small web project for "${projectName}" from this request:
${prompt}

${styleBrief}

Return ONLY valid JSON with this exact shape:
{
  "summary": "short summary",
  "files": [
    { "path": "index.html", "content": "<!doctype html>..." }
  ]
}

Rules:
- 1 to 8 files only
- include index.html
- plain web stack only (html/css/js)
- do not include markdown fences
`;

  let text = '';
  if (picked === 'openai') {
    if (!openAiKey) throw new Error('OPENAI_API_KEY/OPENAI_KEY is missing.');
    const r = await fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.CURSORAI_OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You are a careful web code generator for LAB007. Follow the user request and every LAB007 default design rule in the prompt.'
          },
          { role: 'user', content: buildPrompt }
        ]
      })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `OpenAI request failed (${r.status})`);
    text = String(j?.choices?.[0]?.message?.content || '').trim();
  } else if (picked === 'claude') {
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY is missing.');
    const r = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.CURSORAI_ANTHROPIC_MODEL || 'claude-sonnet-4-5',
        max_tokens: 7000,
        messages: [{ role: 'user', content: buildPrompt }]
      })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `Anthropic request failed (${r.status})`);
    text = (j.content || []).map((c) => c.text || '').join('').trim();
  } else {
    throw new Error('provider must be auto, openai, or claude');
  }

  const clean = text.replace(/```json|```/gi, '').trim();
  let parsed = null;
  try {
    parsed = JSON.parse(clean);
  } catch {
    const i = clean.indexOf('{');
    const k = clean.lastIndexOf('}');
    if (i >= 0 && k > i) parsed = JSON.parse(clean.slice(i, k + 1));
  }
  if (!parsed || !Array.isArray(parsed.files) || !parsed.files.length) {
    return {
      summary: 'Generated single file fallback',
      files: [{ path: 'index.html', content: clean || '<!doctype html><title>CursorAI</title><h1>No output</h1>' }]
    };
  }
  return parsed;
}

function cursorAiValidateFolderSegment(name) {
  const s = String(name || '').trim();
  if (!s || s.includes('..') || s.includes('/') || s.includes('\\')) return null;
  return s;
}

function cursorAiDirBytes(dirPath) {
  let total = 0;
  function walk(p) {
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      return;
    }
    if (st.isFile()) {
      total += st.size;
      return;
    }
    if (!st.isDirectory()) return;
    let names = [];
    try {
      names = fs.readdirSync(p);
    } catch {
      return;
    }
    for (const n of names) walk(path.join(p, n));
  }
  walk(dirPath);
  return total;
}

function cursorAiResolvePreviewEntry(projectDir, meta) {
  const written = Array.isArray(meta.files) ? meta.files : [];
  const ordered = [];
  if (written.includes('index.html')) ordered.push('index.html');
  for (const f of written) {
    if (f && !ordered.includes(f)) ordered.push(f);
  }
  if (!ordered.includes('index.html')) ordered.push('index.html');
  for (const rel of ordered) {
    if (!cursorAiSafeRelPath(rel)) continue;
    if (fs.existsSync(path.join(projectDir, rel))) return rel;
  }
  try {
    const files = fs.readdirSync(projectDir);
    const htmlFirst = files.find((x) => /\.html?$/i.test(x));
    if (htmlFirst) return htmlFirst;
  } catch {
    /* ignore */
  }
  return 'index.html';
}

function writeGeneratedToProjectDir(projectDir, generated) {
  const files = Array.isArray(generated.files) ? generated.files.slice(0, 20) : [];
  const written = [];
  const resolvedProj = path.resolve(projectDir);
  for (const f of files) {
    const rel = cursorAiSafeRelPath(f?.path);
    if (!rel) continue;
    const outPath = path.join(projectDir, rel);
    const outDir = path.dirname(outPath);
    const resolvedOut = path.resolve(outDir);
    if (!resolvedOut.startsWith(resolvedProj)) continue;
    fs.mkdirSync(outDir, { recursive: true });
    const content = String(f?.content || '');
    fs.writeFileSync(outPath, content, 'utf8');
    written.push(rel);
  }
  if (!written.length) {
    fs.writeFileSync(
      path.join(projectDir, 'index.html'),
      '<!doctype html><html><body><h1>CursorAI</h1><p>No valid files were generated.</p></body></html>',
      'utf8'
    );
    written.push('index.html');
  }
  return written;
}

/**
 * @returns {Promise<object>} Same shape as legacy HTTP JSON success body
 */
async function cursorAiCreateProject({ projectName, prompt, provider }) {
  const pn = String(projectName || '').trim();
  const pr = String(prompt || '').trim();
  const pv = String(provider || 'auto').trim().toLowerCase();
  if (!pn) throw new Error('projectName is required');
  if (!pr) throw new Error('prompt is required');

  const projectSlug = cursorAiSlug(pn) || 'project';
  const folderName = `${projectSlug}-${Date.now()}`;
  const projectDir = path.join(cursorAiProjectsRoot, folderName);
  fs.mkdirSync(projectDir, { recursive: true });

  const generated = await cursorAiGenerateFiles(pv, pr, pn);
  const written = writeGeneratedToProjectDir(projectDir, generated);

  const meta = {
    projectName: pn,
    folderName,
    prompt: pr,
    provider: pv,
    summary: String(generated.summary || ''),
    files: written,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(projectDir, 'cursorai-meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  const primary = written.includes('index.html') ? 'index.html' : written[0];
  const previewUrl = `/cursorai/projects/${encodeURIComponent(folderName)}/${primary}`;
  void notifyCursorAiJobComplete({
    kind: 'created',
    projectName: pn,
    folderName,
    previewUrl
  }).catch((err) => console.error('[notify] CursorAI create:', err.message));

  return { ok: true, ...meta, previewUrl };
}

async function cursorAiUpdateProject({ folderName: folderNameArg, projectName, prompt, provider }) {
  const folderName = String(folderNameArg || '').trim();
  const promptStr = String(prompt || '').trim();
  const providerStr = String(provider || 'auto').trim().toLowerCase();
  const projectNameIn = String(projectName || '').trim();

  const seg = cursorAiValidateFolderSegment(folderName);
  if (!seg) throw new Error('folderName is required and must be safe');
  if (!promptStr) throw new Error('prompt is required');

  const rootResolved = path.resolve(cursorAiProjectsRoot);
  const projectDir = path.resolve(path.join(cursorAiProjectsRoot, seg));
  const relToRoot = path.relative(rootResolved, projectDir);
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    throw new Error('Invalid path');
  }
  if (!fs.existsSync(projectDir)) throw new Error('Project not found');
  const st = fs.statSync(projectDir);
  if (!st.isDirectory()) throw new Error('Not a project folder');

  let oldMeta = {};
  const metaPath = path.join(projectDir, 'cursorai-meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      oldMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      oldMeta = {};
    }
  }
  const displayName = projectNameIn || oldMeta.projectName || seg;

  const generated = await cursorAiGenerateFiles(providerStr, promptStr, displayName);

  try {
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === 'cursorai-meta.json') continue;
      fs.rmSync(path.join(projectDir, e.name), { recursive: true, force: true });
    }
  } catch {
    throw new Error('Could not clear project directory');
  }

  const written = writeGeneratedToProjectDir(projectDir, generated);

  const meta = {
    projectName: displayName,
    folderName: seg,
    prompt: promptStr,
    provider: providerStr,
    summary: String(generated.summary || ''),
    files: written,
    createdAt: oldMeta.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  const primary = written.includes('index.html') ? 'index.html' : written[0];
  const previewUrl = `/cursorai/projects/${encodeURIComponent(seg)}/${primary}`;
  void notifyCursorAiJobComplete({
    kind: 'updated',
    projectName: displayName,
    folderName: seg,
    previewUrl
  }).catch((err) => console.error('[notify] CursorAI update:', err.message));

  return { ok: true, ...meta, previewUrl };
}

function cursorAiListProjects() {
  const root = cursorAiProjectsRoot;
  if (!fs.existsSync(root)) return [];
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const projects = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const folderName = ent.name;
    if (!cursorAiValidateFolderSegment(folderName)) continue;
    const dir = path.join(root, folderName);
    const metaPath = path.join(dir, 'cursorai-meta.json');
    let meta = {};
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {
        meta = {};
      }
    }
    const entry = cursorAiResolvePreviewEntry(dir, meta);
    const previewUrl = `/cursorai/projects/${encodeURIComponent(folderName)}/${encodeURIComponent(entry)}`;
    projects.push({
      folderName,
      projectName: meta.projectName || folderName,
      prompt: typeof meta.prompt === 'string' ? meta.prompt.slice(0, 280) : '',
      createdAt: meta.createdAt || null,
      provider: meta.provider || '',
      summary: typeof meta.summary === 'string' ? meta.summary.slice(0, 200) : '',
      files: Array.isArray(meta.files) ? meta.files : [],
      bytes: cursorAiDirBytes(dir),
      previewUrl
    });
  }
  projects.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return projects;
}

module.exports = {
  getCursorAiProjectsRoot,
  cursorAiProjectsRoot,
  cursorAiSlug,
  cursorAiSafeRelPath,
  cursorAiGenerateFiles,
  cursorAiValidateFolderSegment,
  cursorAiDirBytes,
  cursorAiResolvePreviewEntry,
  cursorAiCreateProject,
  cursorAiUpdateProject,
  cursorAiListProjects
};
