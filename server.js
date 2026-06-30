// LAB007 Unified Services - Main Server
// Combines all projects: 3dPrint, Citrix-Horizon, VINValue, Web-Alert

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const nodemailer = require('nodemailer');
const multer = require('multer');
const { parseStringPromise } = require('xml2js');
const { router: aimailRouter } = require('./aimail');
const { registerSpamblokRoutes } = require('./lib/spamblok');
const { registerVideoCreatorRoutes } = require('./lib/videoCreatorRoutes');
const { sendTelegramTest } = require('./lib/notifySafe');
const { registerTelegramInboundHandler, handleTelegramWebhookExpress } = require('./lib/telegramInbound');
const { registerCursorAiTelegramHandlers } = require('./lib/telegramHandlersCursorAi');
const { registerCronTelegramHandlers } = require('./lib/telegramHandlersCron');
const { startScheduledJobsRunner } = require('./lib/scheduledJobsRunner');
const { registerTrade007Routes } = require('./lib/trade007');
const {
  eliteInvoicesDataPath,
  eliteInvoicesHistoryPath,
  eliteInvoicesPdfsDir,
  eliteInvoicesSeedPath,
  normalizeClient,
  normalizeInvoice,
  normalizePrefix,
  loadClients: loadEliteInvoiceClients,
  saveClients: saveEliteInvoiceClients,
  loadInvoices: loadEliteInvoiceHistory,
  saveInvoices: saveEliteInvoiceHistory,
  invoicePdfPath,
  invoiceToPdfPayload,
  filterInvoices,
  formatInvoiceNumber,
  formatInvoiceDate,
  buildInvoicePdf,
  isValidClientEmail
} = require('./lib/elite-invoices');
registerCursorAiTelegramHandlers(registerTelegramInboundHandler);
registerCronTelegramHandlers(registerTelegramInboundHandler);
const fetchFn = global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
// GGPPI Tracker: JSON + uploads (production: e.g. GGPPI_DATA_DIR=/var/data/lab007/GGPPI, GGPPI_UPLOAD_DIR=.../uploads)
const ggppiDataDir = process.env.GGPPI_DATA_DIR
  ? path.resolve(process.env.GGPPI_DATA_DIR)
  : path.join(__dirname, 'data');
const ggppiTasksPath = path.join(ggppiDataDir, 'ggppi-tasks.json');
const ggppiUploadDir = process.env.GGPPI_UPLOAD_DIR
  ? path.resolve(process.env.GGPPI_UPLOAD_DIR)
  : path.join(uploadDir, 'ggppi-tracker');
if (!fs.existsSync(ggppiDataDir)) {
  fs.mkdirSync(ggppiDataDir, { recursive: true });
}
if (!fs.existsSync(ggppiUploadDir)) {
  fs.mkdirSync(ggppiUploadDir, { recursive: true });
}
console.log('GGPPI data dir:', ggppiDataDir);
console.log('GGPPI tasks file:', ggppiTasksPath);
console.log('GGPPI uploads dir:', ggppiUploadDir);

const marketingReportsDir = process.env.MARKETING_REPORTS_DIR
  ? path.resolve(process.env.MARKETING_REPORTS_DIR)
  : path.join(__dirname, 'data', 'marketing-analyzer');
const marketingReportsIndexPath = path.join(marketingReportsDir, 'reports-index.json');
if (!fs.existsSync(marketingReportsDir)) {
  fs.mkdirSync(marketingReportsDir, { recursive: true });
}
console.log('Marketing reports dir:', marketingReportsDir);
console.log('Marketing reports index:', marketingReportsIndexPath);

const {
  cursorAiProjectsRoot,
  cursorAiValidateFolderSegment,
  cursorAiResolvePreviewEntry,
  cursorAiDirBytes,
  cursorAiListProjects,
  cursorAiCreateProject,
  cursorAiUpdateProject
} = require('./lib/cursorAiCore');
if (!fs.existsSync(cursorAiProjectsRoot)) {
  fs.mkdirSync(cursorAiProjectsRoot, { recursive: true });
}
console.log('CursorAI projects dir:', cursorAiProjectsRoot);

const cleanAiDataDir = (() => {
  const explicit = String(process.env.CLEANAI_DATA_DIR || '').trim();
  if (explicit) return path.resolve(explicit);
  const diskRoot = String(process.env.LAB007_DATA_DIR || process.env.LAB007_DISK_ROOT || '').trim();
  if (diskRoot) return path.join(path.resolve(diskRoot), 'CleanAI');
  return path.join(__dirname, 'data', 'CleanAI');
})();
const cleanAiSessionsDir = path.join(cleanAiDataDir, 'sessions');
const cleanAiConfigPath = path.join(cleanAiDataDir, 'cleanai-config.json');
if (!fs.existsSync(cleanAiDataDir)) {
  fs.mkdirSync(cleanAiDataDir, { recursive: true });
}
if (!fs.existsSync(cleanAiSessionsDir)) {
  fs.mkdirSync(cleanAiSessionsDir, { recursive: true });
}
const cleanAiVideoTempDir = path.join(cleanAiDataDir, 'video-temp');
if (!fs.existsSync(cleanAiVideoTempDir)) {
  fs.mkdirSync(cleanAiVideoTempDir, { recursive: true });
}
console.log('CLEANAI data dir:', cleanAiDataDir);

const gscDataDir = (() => {
  const diskRoot = String(process.env.LAB007_DATA_DIR || process.env.LAB007_DISK_ROOT || '').trim();
  if (diskRoot) return path.join(path.resolve(diskRoot), 'gsc');
  return path.join(__dirname, 'data', 'gsc');
})();
if (!fs.existsSync(gscDataDir)) fs.mkdirSync(gscDataDir, { recursive: true });
const gscTokenPath = path.join(gscDataDir, 'oauth-token.json');
const gscStatePath = path.join(gscDataDir, 'oauth-state.json');

// Marketing Manager state file lives in MarketMG/Clients (matches persistent disk layout on Render).
// Set LAB007_DATA_DIR=/var/data/lab007 so data is stored at /var/data/lab007/MarketMG/Clients/marketing-manager.json
// Or set MARKETING_MANAGER_DATA_DIR to the full Clients folder path.
const legacyMarketingManagerPath = path.join(__dirname, 'data', 'marketing-manager.json');
const marketingManagerDataDir = (() => {
  const explicit = String(process.env.MARKETING_MANAGER_DATA_DIR || '').trim();
  if (explicit) return path.resolve(explicit);
  const diskRoot = String(process.env.LAB007_DATA_DIR || process.env.LAB007_DISK_ROOT || '').trim();
  if (diskRoot) return path.join(path.resolve(diskRoot), 'MarketMG', 'Clients');
  return path.join(__dirname, 'data', 'MarketMG', 'Clients');
})();
const marketingManagerPath = path.join(marketingManagerDataDir, 'marketing-manager.json');
if (!fs.existsSync(marketingManagerDataDir)) {
  fs.mkdirSync(marketingManagerDataDir, { recursive: true });
}
const marketingManagerLogosDir = path.join(marketingManagerDataDir, 'logos');
if (!fs.existsSync(marketingManagerLogosDir)) {
  fs.mkdirSync(marketingManagerLogosDir, { recursive: true });
}
if (!fs.existsSync(marketingManagerPath) && fs.existsSync(legacyMarketingManagerPath)) {
  try {
    fs.copyFileSync(legacyMarketingManagerPath, marketingManagerPath);
    console.log('[Marketing Manager] Migrated:', legacyMarketingManagerPath, '→', marketingManagerPath);
  } catch (err) {
    console.warn('[Marketing Manager] Legacy migrate failed:', err.message);
  }
}
console.log('Marketing manager dir:', marketingManagerDataDir);
console.log('Marketing manager file:', marketingManagerPath);

const MARKETING_MANAGER_COOKIE = 'mm_auth';
const MARKETING_MANAGER_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function marketingManagerPassword() {
  return String(process.env.MARKETING_MANAGER_PASSWORD || '').trim();
}

function marketingManagerSessionSecret() {
  const explicit = String(process.env.MARKETING_MANAGER_SESSION_SECRET || '').trim();
  if (explicit) return explicit;
  const pwd = marketingManagerPassword();
  if (pwd) return crypto.createHash('sha256').update(`mm:${pwd}`).digest('hex');
  return '';
}

function parseReqCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    try {
      return decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      return part.slice(idx + 1).trim();
    }
  }
  return '';
}

function signMarketingManagerToken() {
  const secret = marketingManagerSessionSecret();
  if (!secret) return '';
  const exp = String(Date.now() + MARKETING_MANAGER_SESSION_MS);
  const sig = crypto.createHmac('sha256', secret).update(exp).digest('hex');
  return `${exp}.${sig}`;
}

function verifyMarketingManagerToken(token) {
  const secret = marketingManagerSessionSecret();
  if (!secret || !token) return false;
  const parts = String(token).split('.');
  if (parts.length !== 2) return false;
  const [expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = crypto.createHmac('sha256', secret).update(expStr).digest('hex');
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function isMarketingManagerAuthed(req) {
  if (!marketingManagerPassword()) return false;
  return verifyMarketingManagerToken(parseReqCookie(req, MARKETING_MANAGER_COOKIE));
}

function isPublicMarketingManagerApi(req) {
  const p = req.path || '';
  const m = req.method;
  if (p === '/api/marketing-manager/auth/login' && m === 'POST') return true;
  if (p === '/api/marketing-manager/auth/status' && m === 'GET') return true;
  if (/^\/api\/marketing-manager\/contracts\/sign\/[^/]+$/.test(p) && (m === 'GET' || m === 'POST')) {
    return true;
  }
  if (
    /^\/api\/marketing-manager\/contracts\/sign\/[^/]+\/(document|download)$/.test(p) &&
    m === 'GET'
  ) {
    return true;
  }
  if (
    /^\/api\/marketing-manager\/contracts\/sign\/[^/]+\/email-copy$/.test(p) &&
    m === 'POST'
  ) {
    return true;
  }
  return false;
}

function setMarketingManagerAuthCookie(res, token) {
  const secure =
    process.env.NODE_ENV === 'production' ||
    String(process.env.MARKETING_MANAGER_COOKIE_SECURE || '').trim() === '1';
  const maxAgeSec = Math.floor(MARKETING_MANAGER_SESSION_MS / 1000);
  const parts = [
    `${MARKETING_MANAGER_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearMarketingManagerAuthCookie(res) {
  const secure =
    process.env.NODE_ENV === 'production' ||
    String(process.env.MARKETING_MANAGER_COOKIE_SECURE || '').trim() === '1';
  const parts = [
    `${MARKETING_MANAGER_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

/** When set, task JSON always uses this volume path (GitHub task sync stays off — avoids empty GitHub wiping the UI). */
const ggppiDataDirExplicit = String(process.env.GGPPI_DATA_DIR || '').trim().length > 0;

const ggppiGithubRepo = (process.env.GGPPI_GITHUB_REPO || 'thomad99/LAB007-Main').trim();
const ggppiGithubBranch = (process.env.GGPPI_GITHUB_BRANCH || 'main').trim();
const ggppiGithubPath = (process.env.GGPPI_GITHUB_PATH || 'data/ggppi-tasks.json').trim();
const ggppiGithubToken = (process.env.GITHUB_TOKEN || process.env.GGPPI_GITHUB_TOKEN || '').trim();
const ggppiGithubEnabled =
  !ggppiDataDirExplicit &&
  ['1', 'true', 'yes'].includes(String(process.env.GGPPI_GITHUB_ENABLED || '').trim().toLowerCase()) &&
  ggppiGithubToken.length > 0;
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safeName}`);
    }
  }),
  limits: { fileSize: 1024 * 1024 * 300 } // 300MB max
});
const ggppiUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ggppiUploadDir),
    filename: (req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safeName}`);
    }
  }),
  limits: {
    fileSize: 1024 * 1024 * 25, // 25MB max per file
    files: 10
  }
});

const CLEANAI_VIDEO_MAX_UPLOAD_MB = Math.min(500, Math.max(10, parseInt(process.env.CLEANAI_VIDEO_MAX_UPLOAD_MB || '80', 10)));
const cleanAiVideoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, cleanAiVideoTempDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const safe = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext || '.mp4'}`;
      cb(null, safe);
    }
  }),
  limits: { fileSize: CLEANAI_VIDEO_MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mt = String(file.mimetype || '').toLowerCase();
    const name = String(file.originalname || '').toLowerCase();
    const ok = mt.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v|avi)$/i.test(name);
    cb(ok ? null : new Error('Upload a video file (MP4, MOV, WebM, etc.).'), ok);
  }
});

// Boot diagnostics
console.log('BOOT:', __filename);
console.log('DIR :', __dirname);
console.log('CWD :', process.cwd());

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

registerSpamblokRoutes(app);
registerTrade007Routes(app);

// Add request logging middleware at the very top to catch ALL requests
app.use((req, res, next) => {
// Skip logging for static assets to reduce noise
const staticExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.css', '.js', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot'];
const isStaticFile = staticExtensions.some(ext => req.path.toLowerCase().endsWith(ext));

if (!isStaticFile) {
console.log(`[Main Server] ===== INCOMING REQUEST =====`);
console.log(`[Main Server] Method: ${req.method}`);
console.log(`[Main Server] Path: ${req.path}`);
console.log(`[Main Server] Original URL: ${req.originalUrl}`);
console.log(`[Main Server] Base URL: ${req.baseUrl}`);
console.log(`[Main Server] URL: ${req.url}`);
console.log(`[Main Server] ===========================`);
}
next();
});

// Email configuration for contact form
const smtpPort = parseInt(process.env.SMTP_PORT || '587');
const smtpSecure = process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1' || smtpPort === 465;

const smtpConfig = {
host: process.env.SMTP_HOST || 'smtp.gmail.com',
port: smtpPort,
secure: smtpSecure,
auth: {
user: process.env.SMTP_USER || '',
pass: process.env.SMTP_PASS || ''
},
requireTLS: !smtpSecure,
connectionTimeout: 30000,
greetingTimeout: 30000,
socketTimeout: 30000,
tls: {
rejectUnauthorized: true,
minVersion: 'TLSv1.2'
}
};

// Create email transporter (only if SMTP_USER is configured)
let emailTransporter = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
try {
emailTransporter = nodemailer.createTransport(smtpConfig);
console.log('Email transporter configured for contact form');
} catch (error) {
console.warn('Failed to configure email transporter:', error.message);
}
} else {
console.warn('SMTP_USER or SMTP_PASS not configured - contact form emails will not be sent');
}

// Serve LAB007 images (before project apps to avoid conflicts)
app.use('/images', express.static(path.join(__dirname, 'LAB007', 'Images')));
app.use('/uploads/ggppi-tracker', express.static(ggppiUploadDir));
app.use('/marketmg/logos', express.static(marketingManagerLogosDir));
app.use('/cursorai/projects', express.static(cursorAiProjectsRoot));

// Serve webdesign static page
app.get('/webdesign', (req, res) => {
  const p = path.join(__dirname, 'public', 'webdesign.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.status(404).send('Not found');
});

// Serve digital marketing page
app.get('/digitalmarketing', (req, res) => {
  const p = path.join(__dirname, 'public', 'DigitalMarketing.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.status(404).send('Not found');
});

// Serve marketing manager page (client gate + API auth; contract signing stays public)
app.get('/marketing-manager', (req, res) => {
  const p = path.join(__dirname, 'public', 'marketing-manager.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.status(404).send('Not found');
});

app.get('/marketing-manager/sign/:token', (req, res) => {
  const p = path.join(__dirname, 'public', 'marketing-sign.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.status(404).send('Not found');
});

app.get('/cursorai', (req, res) => {
  const p = path.join(__dirname, 'public', 'cursorai.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.status(404).send('Not found');
});

app.get('/cursorai/dashboard', (req, res) => {
  const p = path.join(__dirname, 'public', 'cursorai-dashboard.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.status(404).send('Not found');
});

// Serve social dashboard page
app.get('/social-dashboard', (req, res) => {
  const p = path.join(__dirname, 'public', 'social-dashboard.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.status(404).send('Not found');
});

// Serve marketing analyzer page
app.get('/marketing-analyzer', (req, res) => {
  const p = path.join(__dirname, 'public', 'marketing-analyzer.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.status(404).send('Not found');
});

// Serve GGPPI Tracker page
app.get('/ggppi-tracker', (req, res) => {
  const p = path.join(__dirname, 'public', 'ggppi-tracker.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.status(404).send('Not found');
});

registerVideoCreatorRoutes(app);

// ========== Mount Project Apps FIRST ==========
// Mount each project's Express app BEFORE main static middleware to ensure routes are matched correctly

// 3D Print Project
// Set up explicit routes FIRST (these take precedence over mounted apps)
setup3dPrintFallback();

const print3dServerPath = path.join(__dirname, '3dPrint', 'server.js');
if (fs.existsSync(print3dServerPath)) {
try {
const print3dApp = require('./3dPrint/server');
// Mount the app at /3dprint for API routes (static files are handled by fallback above)
app.use('/3dprint', print3dApp);
console.log('✓ 3D Print app mounted at /3dprint for API routes');
} catch (error) {
console.error('Failed to mount 3D Print app:', error.message);
console.error('Stack:', error.stack);
console.warn('Using fallback static serving only (API routes will not work)');
}
} else {
console.warn('3D Print server.js not found, using fallback static serving only');
}

function setup3dPrintFallback() {
// Serve static files from public directory (CSS, JS, etc.) - these will be at /3dprint/styles.css, /3dprint/script.js, etc.
app.use('/3dprint', express.static(path.join(__dirname, '3dPrint', 'public'), {
index: false // Don't serve index.html automatically, let explicit routes handle it
}));

// Serve images from the images directory - these will be at /3dprint/images/...
app.use('/3dprint/images', express.static(path.join(__dirname, '3dPrint', 'images')));

// Explicit routes for HTML pages (after static middleware so they take precedence)
app.get('/3dprint', (req, res) => {
const indexPath = path.join(__dirname, '3dPrint', 'public', 'index.html');
if (fs.existsSync(indexPath)) {
res.sendFile(indexPath);
} else {
res.status(404).send('3D Print service not available');
}
});
app.get('/3dprint/', (req, res) => {
const indexPath = path.join(__dirname, '3dPrint', 'public', 'index.html');
if (fs.existsSync(indexPath)) {
res.sendFile(indexPath);
} else {
res.status(404).send('3D Print service not available');
}
});
app.get('/3dprint/admin', (req, res) => {
const adminPath = path.join(__dirname, '3dPrint', 'public', 'admin.html');
if (fs.existsSync(adminPath)) {
res.sendFile(adminPath);
} else {
res.status(404).send('Admin page not found');
}
});
}

// Citrix-Horizon Project
const citrixServerPath = path.join(__dirname, 'Citrix-Horizon', 'server.js');
if (fs.existsSync(citrixServerPath)) {
try {
const citrixApp = require('./Citrix-Horizon/server');
app.use('/citrix', citrixApp);
console.log('✓ Citrix app mounted at /citrix');
} catch (error) {
console.error('Failed to mount Citrix app:', error.message);
console.error('Stack:', error.stack);
setupCitrixFallback();
}
} else {
console.warn('Citrix server.js not found, using fallback static serving');
setupCitrixFallback();
}

function setupCitrixFallback() {
// Serve static files from Web directory (CSS, JS, etc.)
app.use('/citrix', express.static(path.join(__dirname, 'Citrix-Horizon', 'Web')));
// Images are in Web/images, so they'll be served by the above static middleware

// Explicit route for /citrix to serve index.html
app.get('/citrix', (req, res) => {
const indexPath = path.join(__dirname, 'Citrix-Horizon', 'Web', 'index.html');
if (fs.existsSync(indexPath)) {
res.sendFile(indexPath);
} else {
res.status(404).send('Citrix service not available');
}
});

// Handle subdirectories - serve index.html for any /citrix/* path
app.get('/citrix/*', (req, res) => {
const requestedPath = req.path.replace('/citrix', '');
const filePath = path.join(__dirname, 'Citrix-Horizon', 'Web', requestedPath);

// If it's a directory or root, serve index.html
if (requestedPath === '/' || requestedPath === '' || !path.extname(requestedPath)) {
const indexPath = path.join(__dirname, 'Citrix-Horizon', 'Web', 'index.html');
if (fs.existsSync(indexPath)) {
return res.sendFile(indexPath);
}
}

// Otherwise try to serve the requested file
if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
res.sendFile(filePath);
} else {
// Fallback to index.html if file doesn't exist
const indexPath = path.join(__dirname, 'Citrix-Horizon', 'Web', 'index.html');
if (fs.existsSync(indexPath)) {
res.sendFile(indexPath);
} else {
res.status(404).send('File not found');
}
}
});

app.get('/citrix/dashboard', (req, res) => {
const indexPath = path.join(__dirname, 'Citrix-Horizon', 'Web', 'index.html');
if (fs.existsSync(indexPath)) {
res.sendFile(indexPath);
} else {
res.status(404).send('Dashboard not found');
}
});
app.get('/citrix/todo', (req, res) => {
const todoPath = path.join(__dirname, 'Citrix-Horizon', 'Web', 'todo.html');
if (fs.existsSync(todoPath)) {
res.sendFile(todoPath);
} else {
res.status(404).send('Todo page not found');
}
});
app.get('/citrix/diagcreator', (req, res) => {
const diagPath = path.join(__dirname, 'Citrix-Horizon', 'Web', 'diagcreator.html');
if (fs.existsSync(diagPath)) {
res.sendFile(diagPath);
} else {
res.status(404).send('DiagCreator not found');
}
});
}

// VINValue Project
const vinValueServerPath = path.join(__dirname, 'VINValue', 'server.js');
if (fs.existsSync(vinValueServerPath)) {
try {
const vinValueApp = require('./VINValue/server');
app.use('/vinvalue', vinValueApp);
console.log('✓ VINValue app mounted at /vinvalue');
} catch (error) {
console.error('Failed to mount VINValue app:', error.message);
console.error('Stack:', error.stack);
setupVINValueFallback();
}
} else {
console.warn('VINValue server.js not found, using fallback static serving');
setupVINValueFallback();
}

function setupVINValueFallback() {
app.use('/vinvalue', express.static(path.join(__dirname, 'VINValue', 'public')));
app.get('/vinvalue', (req, res) => {
const indexPath = path.join(__dirname, 'VINValue', 'public', 'index.html');
if (fs.existsSync(indexPath)) {
res.sendFile(indexPath);
} else {
res.status(404).send('VINValue service not available');
}
});
}

// Web-Alert Project
const webAlertServerPath = path.join(__dirname, 'Web-Alert', 'backend', 'server.js');
if (fs.existsSync(webAlertServerPath)) {
try {
console.log('Loading Web-Alert backend server...');
const webAlertApp = require('./Web-Alert/backend/server');
console.log('Web-Alert app loaded successfully');

// Add debug middleware to log all requests to Web-Alert BEFORE mounting
app.use('/webalert', (req, res, next) => {
console.log(`[Main Server] ===== Web-Alert Request =====`);
console.log(`[Main Server] Method: ${req.method}`);
console.log(`[Main Server] Path: ${req.path}`);
console.log(`[Main Server] Original URL: ${req.originalUrl}`);
console.log(`[Main Server] Base URL: ${req.baseUrl}`);
console.log(`[Main Server] =============================`);
next();
});

app.use('/webalert', webAlertApp);
console.log('  Web-Alert app mounted - routes should be accessible at /webalert/*');
console.log('✓ Web-Alert app mounted at /webalert');
console.log('  Available routes should include: /webalert/api/monitor, /webalert/api/status, etc.');
} catch (error) {
console.error('Failed to mount Web-Alert app:', error.message);
console.error('Stack:', error.stack);
setupWebAlertFallback();
}
} else {
console.warn('Web-Alert server.js not found, using fallback static serving');
setupWebAlertFallback();
}

function setupWebAlertFallback() {
app.use('/webalert', express.static(path.join(__dirname, 'Web-Alert', 'frontend', 'public')));
app.use('/webalert/src', express.static(path.join(__dirname, 'Web-Alert', 'frontend', 'src')));
app.get('/webalert', (req, res) => {
const indexPath = path.join(__dirname, 'Web-Alert', 'frontend', 'public', 'index.html');
if (fs.existsSync(indexPath)) {
res.sendFile(indexPath);
} else {
res.status(404).send('Web-Alert service not available');
}
});
app.get('/webalert/status', (req, res) => {
const statusPath = path.join(__dirname, 'Web-Alert', 'frontend', 'public', 'status.html');
if (fs.existsSync(statusPath)) {
res.sendFile(statusPath);
} else {
res.status(404).send('Status page not found');
}
});

// Also serve status.html at root level for convenience
app.get('/status.html', (req, res) => {
const statusPath = path.join(__dirname, 'Web-Alert', 'frontend', 'public', 'status.html');
if (fs.existsSync(statusPath)) {
res.sendFile(statusPath);
} else {
res.status(404).send('Status page not found');
}
});
}

// Redirect /status.html to /webalert/status.html (so API calls work correctly)
app.get('/status.html', (req, res) => {
    res.redirect('/webalert/status.html');
});

// Contact form route
app.get('/contact', (req, res) => {
res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

// Contact form submission endpoint
app.post('/api/contact', async (req, res) => {
const { email, message } = req.body;

// Validate input
if (!email || !message) {
return res.status(400).json({ error: 'Email and message are required' });
}

// Validate email format
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
return res.status(400).json({ error: 'Invalid email address' });
}

// Check if email transporter is configured
if (!emailTransporter) {
console.error('Contact form submission failed: Email transporter not configured');
return res.status(500).json({ error: 'Email service not configured. Please contact support directly.' });
}

// Prepare email
// Use SMTP_USER as the from address (required by most SMTP servers)
// Set replyTo to the user's email so replies go to them
const mailOptions = {
from: process.env.SMTP_USER || 'noreply@lab007.ai',
replyTo: email, // Replies will go to the user who submitted the form
to: 'info@lab007.ai',
subject: 'LAB007 CONTACT FORM',
text: `Contact Form Submission\n\nFrom: ${email}\n\nMessage:\n${message}`,
html: `
           <h2>LAB007 Contact Form Submission</h2>
           <p><strong>From:</strong> ${email}</p>
           <p><strong>Message:</strong></p>
           <p>${message.replace(/\n/g, '<br>')}</p>
       `
};

try {
const info = await emailTransporter.sendMail(mailOptions);
console.log('Contact form email sent successfully:', info.messageId);
res.json({ success: true, message: 'Message sent successfully' });
} catch (error) {
console.error('Failed to send contact form email:', error);
res.status(500).json({ 
error: 'Failed to send message. Please try again later or contact us directly at info@lab007.ai' 
});
}
});

function readGgppiTasksFromDisk() {
  try {
    if (!fs.existsSync(ggppiTasksPath)) {
      return [];
    }
    const raw = fs.readFileSync(ggppiTasksPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to read GGPPI tasks from disk:', error);
    return [];
  }
}

function writeGgppiTasksToDisk(tasks) {
  fs.writeFileSync(ggppiTasksPath, JSON.stringify(tasks, null, 2), 'utf8');
  console.log(`[GGPPI] Wrote ${tasks.length} task(s) to ${ggppiTasksPath}`);
}

function ggppiEncodeGithubPath(filePath) {
  return String(filePath)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function githubGgppiGetContentsMeta() {
  const url =
    `https://api.github.com/repos/${ggppiGithubRepo}/contents/${ggppiEncodeGithubPath(ggppiGithubPath)}` +
    `?ref=${encodeURIComponent(ggppiGithubBranch)}`;
  const response = await fetchFn(url, {
    headers: {
      Authorization: `Bearer ${ggppiGithubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'LAB007-GGPPI-Tracker'
    }
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub GET ${response.status}: ${body.slice(0, 500)}`);
  }
  const data = await response.json();
  if (!data || data.type !== 'file' || typeof data.content !== 'string') {
    throw new Error('GitHub API returned unexpected payload for tasks file');
  }
  const jsonText = Buffer.from(data.content.replace(/\s/g, ''), 'base64').toString('utf8');
  return { sha: data.sha, jsonText };
}

async function readGgppiTasksFromGithub() {
  const meta = await githubGgppiGetContentsMeta();
  if (!meta) {
    return [];
  }
  try {
    const parsed = JSON.parse(meta.jsonText);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[GGPPI] Invalid JSON in GitHub tasks file:', error.message);
    return readGgppiTasksFromDisk();
  }
}

async function writeGgppiTasksToGithub(tasks) {
  const url = `https://api.github.com/repos/${ggppiGithubRepo}/contents/${ggppiEncodeGithubPath(ggppiGithubPath)}`;
  const bodyJson = JSON.stringify(tasks, null, 2);
  const content = Buffer.from(bodyJson, 'utf8').toString('base64');
  for (let attempt = 0; attempt < 3; attempt++) {
    const meta = await githubGgppiGetContentsMeta();
    const putBody = {
      message: `GGPPI: update tasks (${tasks.length})`,
      content,
      branch: ggppiGithubBranch
    };
    if (meta && meta.sha) {
      putBody.sha = meta.sha;
    }
    const response = await fetchFn(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${ggppiGithubToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'LAB007-GGPPI-Tracker',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putBody)
    });
    if (response.ok) {
      console.log(`[GGPPI] GitHub: saved ${tasks.length} task(s) to ${ggppiGithubRepo}@${ggppiGithubBranch}:${ggppiGithubPath}`);
      return;
    }
    const text = await response.text();
    if (response.status === 409 && attempt < 2) {
      console.warn('[GGPPI] GitHub 409 conflict; retrying with fresh file SHA');
      continue;
    }
    throw new Error(`GitHub PUT ${response.status}: ${text.slice(0, 500)}`);
  }
}

async function readGgppiTasks() {
  if (ggppiGithubEnabled) {
    try {
      return await readGgppiTasksFromGithub();
    } catch (error) {
      console.error('[GGPPI] GitHub read failed; using disk cache if present:', error.message);
      return readGgppiTasksFromDisk();
    }
  }
  return readGgppiTasksFromDisk();
}

async function writeGgppiTasks(tasks) {
  if (ggppiGithubEnabled) {
    await writeGgppiTasksToGithub(tasks);
    return;
  }
  writeGgppiTasksToDisk(tasks);
}

if (ggppiGithubEnabled) {
  console.log('[GGPPI] GitHub storage enabled:', ggppiGithubRepo, ggppiGithubBranch, ggppiGithubPath);
} else {
  try {
    const bootCount = readGgppiTasksFromDisk().length;
    console.log(
      `[GGPPI] Task JSON on disk: ${bootCount} task(s) → ${ggppiTasksPath}` +
        (ggppiDataDirExplicit ? ' (GGPPI_DATA_DIR set)' : ' (default ./data — not persistent on Render)')
    );
  } catch (e) {
    console.warn('[GGPPI] Startup: could not read tasks file yet:', e.message);
  }
}

if (ggppiDataDirExplicit && ['1', 'true', 'yes'].includes(String(process.env.GGPPI_GITHUB_ENABLED || '').trim().toLowerCase()) && ggppiGithubToken.length > 0) {
  console.log('[GGPPI] GGPPI_DATA_DIR is set; using volume for task JSON (GGPPI_GITHUB_ENABLED ignored for tasks).');
}
if (String(process.env.RENDER || '').toLowerCase() === 'true' && !ggppiDataDirExplicit && !ggppiGithubEnabled) {
  console.warn(
    '[GGPPI] Render: GGPPI_DATA_DIR is unset — ggppi-tasks.json lives under the app and is lost on restart. Set GGPPI_DATA_DIR (and GGPPI_UPLOAD_DIR) to paths under your disk mount.'
  );
}

const GGPPI_OWNERS = ['David T', 'John G', 'Tom', 'Dave 3D', 'TBC'];

function normalizeGgppiOwner(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'david t' || lower === 'david t.') return 'David T';
  if (lower === 'david thomas') return 'David T';
  if (lower === 'jon') return 'John G';
  const exact = GGPPI_OWNERS.find((owner) => owner.toLowerCase() === lower);
  return exact || '';
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
  }
  return false;
}

function parseProgress(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function formatTaskFiles(files) {
  return (files || []).map((file) => ({
    filename: file.filename,
    originalName: file.originalname,
    size: file.size,
    mimeType: file.mimetype,
    url: `/uploads/ggppi-tracker/${file.filename}`,
    uploadedAt: new Date().toISOString()
  }));
}

function withOptionalGgppiUpload(req, res, next) {
  if (req.is('multipart/form-data')) {
    return ggppiUpload.array('attachments', 10)(req, res, (error) => {
      if (error) {
        return res.status(400).json({ error: error.message || 'File upload failed' });
      }
      return next();
    });
  }
  return next();
}

app.get('/api/ggppi/tasks', async (req, res) => {
  const tasks = (await readGgppiTasks()).map((task) => {
    const normalized = normalizeGgppiOwner(task.assignedTo);
    return {
      ...task,
      assignedTo: normalized || 'TBC'
    };
  }).sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  return res.json({ tasks, owners: GGPPI_OWNERS });
});

app.post('/api/ggppi/tasks', ggppiUpload.array('attachments', 10), async (req, res) => {
  const taskName = String(req.body.taskName || '').trim();
  const assignedTo = normalizeGgppiOwner(req.body.assignedTo);
  const notes = String(req.body.notes || '').trim();
  const progress = parseProgress(req.body.progress, 0);
  const completed = parseBoolean(req.body.completed);

  if (!taskName) {
    return res.status(400).json({ error: 'Task name is required' });
  }
  if (!assignedTo) {
    return res.status(400).json({ error: 'Assigned name must be one of: ' + GGPPI_OWNERS.join(', ') });
  }

  const now = new Date().toISOString();
  const files = formatTaskFiles(req.files);
  const task = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    taskName,
    assignedTo,
    notes,
    progress: completed ? 100 : progress,
    completed,
    attachments: files,
    createdAt: now,
    updatedAt: now
  };

  const tasks = await readGgppiTasks();
  tasks.push(task);
  try {
    await writeGgppiTasks(tasks);
  } catch (error) {
    console.error('[GGPPI] Failed to save new task:', error);
    return res.status(502).json({ error: 'Could not save tasks. Check server logs or try again.' });
  }

  return res.status(201).json({ task });
});

app.put('/api/ggppi/tasks/:id', withOptionalGgppiUpload, async (req, res) => {
  const { id } = req.params;
  const tasks = await readGgppiTasks();
  const taskIndex = tasks.findIndex((item) => item.id === id);

  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const current = tasks[taskIndex];
  const hasTaskName = Object.prototype.hasOwnProperty.call(req.body || {}, 'taskName');
  const hasAssignedTo = Object.prototype.hasOwnProperty.call(req.body || {}, 'assignedTo');
  const hasNotes = Object.prototype.hasOwnProperty.call(req.body || {}, 'notes');
  const hasProgress = Object.prototype.hasOwnProperty.call(req.body || {}, 'progress');
  const hasCompleted = Object.prototype.hasOwnProperty.call(req.body || {}, 'completed');
  const hasRemoved = Object.prototype.hasOwnProperty.call(req.body || {}, 'removeAttachmentFilenames');

  const nextTaskName = hasTaskName ? String(req.body.taskName || '').trim() : current.taskName;
  const nextAssignedTo = hasAssignedTo
    ? normalizeGgppiOwner(req.body.assignedTo)
    : (normalizeGgppiOwner(current.assignedTo) || 'TBC');
  const nextNotes = hasNotes ? String(req.body.notes || '').trim() : String(current.notes || '');
  const nextCompleted = hasCompleted ? parseBoolean(req.body.completed) : !!current.completed;
  const nextProgress = hasProgress ? parseProgress(req.body.progress, current.progress) : current.progress;

  if (!nextTaskName) {
    return res.status(400).json({ error: 'Task name cannot be empty' });
  }
  if (!nextAssignedTo) {
    return res.status(400).json({ error: 'Assigned name must be one of: ' + GGPPI_OWNERS.join(', ') });
  }

  let removeAttachmentFilenames = [];
  if (hasRemoved) {
    try {
      if (Array.isArray(req.body.removeAttachmentFilenames)) {
        removeAttachmentFilenames = req.body.removeAttachmentFilenames.map((name) => String(name));
      } else {
        const parsed = JSON.parse(String(req.body.removeAttachmentFilenames || '[]'));
        if (Array.isArray(parsed)) {
          removeAttachmentFilenames = parsed.map((name) => String(name));
        }
      }
    } catch (error) {
      return res.status(400).json({ error: 'Invalid removeAttachmentFilenames payload' });
    }
  }

  const removedSet = new Set(removeAttachmentFilenames);
  const keptAttachments = (current.attachments || []).filter((file) => !removedSet.has(file.filename));
  const addedAttachments = formatTaskFiles(req.files);
  const mergedAttachments = keptAttachments.concat(addedAttachments);

  removeAttachmentFilenames.forEach((filename) => {
    const filePath = path.join(ggppiUploadDir, filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        console.warn('Failed to remove attachment:', filePath);
      }
    }
  });

  const updatedTask = {
    ...current,
    taskName: nextTaskName,
    assignedTo: nextAssignedTo,
    notes: nextNotes,
    completed: nextCompleted,
    progress: nextCompleted ? 100 : nextProgress,
    attachments: mergedAttachments,
    updatedAt: new Date().toISOString()
  };

  tasks[taskIndex] = updatedTask;
  try {
    await writeGgppiTasks(tasks);
  } catch (error) {
    console.error('[GGPPI] Failed to save task update:', error);
    return res.status(502).json({ error: 'Could not save tasks. Check server logs or try again.' });
  }

  return res.json({ task: updatedTask });
});

app.delete('/api/ggppi/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const tasks = await readGgppiTasks();
  const taskIndex = tasks.findIndex((item) => item.id === id);

  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const [removedTask] = tasks.splice(taskIndex, 1);
  try {
    await writeGgppiTasks(tasks);
  } catch (error) {
    console.error('[GGPPI] Failed to save after delete:', error);
    return res.status(502).json({ error: 'Could not save tasks. Check server logs or try again.' });
  }

  (removedTask.attachments || []).forEach((file) => {
    const filePath = path.join(ggppiUploadDir, file.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        console.warn('Failed to remove attachment:', filePath);
      }
    }
  });

  return res.json({ success: true });
});

// SRQ Cleaning contact form - sends to info@lab007.ai
app.post('/api/srq-contact', async (req, res) => {
  const { name, email, phone, message } = req.body || {};
  if (!email || !message) {
    return res.status(400).json({ error: 'Email and message are required' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (!emailTransporter) {
    return res.status(500).json({ error: 'Email service not configured. Please email us directly at info@lab007.ai' });
  }
  const fromAddr = process.env.SMTP_USER || 'noreply@lab007.ai';
  const text = `SRQ Cleaning Contact Form\n\nName: ${name || '—'}\nEmail: ${email}\nPhone: ${phone || '—'}\n\nMessage:\n${message}`;
  const html = `<h2>SRQ Cleaning Contact Form</h2><p><strong>Name:</strong> ${name || '—'}</p><p><strong>Email:</strong> ${email}</p><p><strong>Phone:</strong> ${phone || '—'}</p><p><strong>Message:</strong></p><p>${(message || '').replace(/\n/g, '<br>')}</p>`;
  try {
    await emailTransporter.sendMail({
      from: fromAddr,
      replyTo: email,
      to: 'info@lab007.ai',
      subject: 'SRQ Cleaning – Contact form',
      text,
      html
    });
    res.json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    console.error('SRQ contact form error:', error);
    res.status(500).json({ error: 'Failed to send message. Please try again or email info@lab007.ai directly.' });
  }
});

function normalizeSocialUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProtocol);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return u;
  } catch (error) {
    return null;
  }
}

function isPrivateHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  return false;
}

function toDateOnly(isoLike) {
  const d = new Date(isoLike);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function dedupePostsByDate(posts) {
  const seen = new Set();
  const out = [];
  for (const post of posts) {
    if (!post || !post.date) continue;
    if (seen.has(post.date)) continue;
    seen.add(post.date);
    out.push(post);
  }
  out.sort((a, b) => (a.date < b.date ? 1 : -1));
  return out;
}

function extractPostsFromJsonLdObject(node, posts) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((n) => extractPostsFromJsonLdObject(n, posts));
    return;
  }

  const dateRaw = node.datePublished || node.uploadDate || node.dateCreated || null;
  const date = toDateOnly(dateRaw);
  if (date) {
    const stats = { likes: null, comments: null, shares: null };
    const directLikes = Number(node.likeCount);
    const directComments = Number(node.commentCount);
    const directShares = Number(node.shareCount);
    if (Number.isFinite(directLikes)) stats.likes = directLikes;
    if (Number.isFinite(directComments)) stats.comments = directComments;
    if (Number.isFinite(directShares)) stats.shares = directShares;

    const interaction = node.interactionStatistic;
    const statsList = Array.isArray(interaction) ? interaction : interaction ? [interaction] : [];
    statsList.forEach((it) => {
      const type = String(
        (it?.interactionType && (it.interactionType['@type'] || it.interactionType.name || it.interactionType)) || ''
      ).toLowerCase();
      const count = Number(it?.userInteractionCount);
      if (!Number.isFinite(count)) return;
      if (type.includes('like')) stats.likes = count;
      if (type.includes('comment')) stats.comments = count;
      if (type.includes('share')) stats.shares = count;
    });

    posts.push({ date, ...stats });
  }

  Object.keys(node).forEach((key) => {
    const val = node[key];
    if (val && typeof val === 'object') {
      extractPostsFromJsonLdObject(val, posts);
    }
  });
}

function extractPostsFromHtml(htmlText) {
  const posts = [];
  const diagnostics = [];

  // JSON-LD blocks (most structured source when available).
  const jsonLdMatches = htmlText.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const block of jsonLdMatches) {
    const content = block
      .replace(/^<script[^>]*>/i, '')
      .replace(/<\/script>$/i, '')
      .trim();
    if (!content) continue;
    try {
      const parsed = JSON.parse(content);
      extractPostsFromJsonLdObject(parsed, posts);
    } catch (error) {
      diagnostics.push('Some JSON-LD blocks were not parseable.');
    }
  }

  // Instagram-like timestamps.
  const unixMatches = htmlText.match(/"taken_at_timestamp"\s*:\s*(\d{10})/g) || [];
  unixMatches.forEach((chunk) => {
    const raw = chunk.match(/(\d{10})/);
    if (!raw) return;
    const seconds = Number(raw[1]);
    if (!Number.isFinite(seconds)) return;
    const date = toDateOnly(new Date(seconds * 1000).toISOString());
    if (date) posts.push({ date, likes: null, comments: null, shares: null });
  });

  // Fallback ISO dates.
  const isoMatches = htmlText.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g) || [];
  isoMatches.slice(0, 500).forEach((iso) => {
    const date = toDateOnly(iso);
    if (date) posts.push({ date, likes: null, comments: null, shares: null });
  });

  // Aggregate engagement hints across page text.
  const likesHints = [];
  const commentsHints = [];
  const sharesHints = [];
  const likeRx = /(\d[\d,]*)\s+(?:likes?|reactions?)/gi;
  const commentRx = /(\d[\d,]*)\s+comments?/gi;
  const shareRx = /(\d[\d,]*)\s+shares?/gi;
  let m;
  while ((m = likeRx.exec(htmlText)) !== null) likesHints.push(Number(String(m[1]).replace(/,/g, '')));
  while ((m = commentRx.exec(htmlText)) !== null) commentsHints.push(Number(String(m[1]).replace(/,/g, '')));
  while ((m = shareRx.exec(htmlText)) !== null) sharesHints.push(Number(String(m[1]).replace(/,/g, '')));

  const cleanLikes = likesHints.filter(Number.isFinite);
  const cleanComments = commentsHints.filter(Number.isFinite);
  const cleanShares = sharesHints.filter(Number.isFinite);
  if (cleanLikes.length || cleanComments.length || cleanShares.length) {
    diagnostics.push('Engagement totals estimated from publicly visible text snippets.');
  }

  const deduped = dedupePostsByDate(posts).slice(0, 2000);
  return {
    posts: deduped,
    engagementHints: {
      likes: cleanLikes.reduce((a, b) => a + b, 0),
      comments: cleanComments.reduce((a, b) => a + b, 0),
      shares: cleanShares.reduce((a, b) => a + b, 0)
    },
    diagnostics
  };
}

app.post('/api/social-dashboard/analyze', async (req, res) => {
  try {
    const url = normalizeSocialUrl(req.body?.url);
    if (!url) {
      return res.status(400).json({ error: 'Please provide a valid Instagram or Facebook URL.' });
    }
    if (isPrivateHostname(url.hostname)) {
      return res.status(400).json({ error: 'Private or local hosts are not allowed.' });
    }

    const response = await fetchFn(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    if (!response.ok) {
      return res.status(502).json({ error: `Could not fetch profile feed (${response.status}).` });
    }

    const html = await response.text();
    const result = extractPostsFromHtml(html);
    if (!result.posts.length) {
      return res.status(200).json({
        sourceUrl: url.toString(),
        posts: [],
        engagementHints: result.engagementHints,
        diagnostics: [
          'No post timestamps found from public page HTML.',
          'Some social pages hide feed data unless authenticated.'
        ]
      });
    }

    return res.json({
      sourceUrl: url.toString(),
      posts: result.posts,
      engagementHints: result.engagementHints,
      diagnostics: result.diagnostics
    });
  } catch (error) {
    console.error('Social dashboard analyze error:', error);
    return res.status(500).json({ error: 'Failed to analyze social feed' });
  }
});

function normalizeMarketingUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProtocol);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return u;
  } catch (error) {
    return null;
  }
}

function safeGetMatch(text, rx, groupIndex = 1) {
  const m = String(text || '').match(rx);
  if (!m || !m[groupIndex]) return '';
  return String(m[groupIndex]).trim();
}

function getAllMatches(text, rx, groupIndex = 1) {
  const out = [];
  const source = String(text || '');
  let m;
  while ((m = rx.exec(source)) !== null) {
    if (m[groupIndex]) out.push(String(m[groupIndex]).trim());
  }
  return out;
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function makeAbsoluteUrl(baseUrl, maybeRelative) {
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch (error) {
    return '';
  }
}

function buildRecommendation(id, status, title, detail, action) {
  return { id, status, title, detail, action };
}

function scoreRecommendations(recs) {
  return recs.reduce((sum, r) => sum + (r.status === 'good' ? 1 : 0), 0);
}

function computeMarketingHealthFromHtml(html, pageUrl, fetchMs) {
  const source = String(html || '');
  const lower = source.toLowerCase();
  const title = safeGetMatch(source, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription = safeGetMatch(
    source,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i
  ) || safeGetMatch(
    source,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i
  );
  const canonical = safeGetMatch(
    source,
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["'][^>]*>/i
  ) || safeGetMatch(
    source,
    /<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["'][^>]*>/i
  );
  const robotsMeta = safeGetMatch(source, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["'][^>]*>/i);
  const viewport = safeGetMatch(source, /<meta[^>]+name=["']viewport["'][^>]+content=["']([^"']*)["'][^>]*>/i);

  const h1Count = (source.match(/<h1\b/gi) || []).length;
  const h2Count = (source.match(/<h2\b/gi) || []).length;
  const imgTags = source.match(/<img\b[^>]*>/gi) || [];
  const imageCount = imgTags.length;
  const imagesMissingAlt = imgTags.filter((tag) => !/\balt\s*=\s*["'][^"']*["']/i.test(tag)).length;

  const linkMatches = source.match(/<a\b[^>]*href=["'][^"']+["'][^>]*>/gi) || [];
  let internalLinks = 0;
  let externalLinks = 0;
  let mapLinks = 0;
  let yelpLinks = 0;
  let appleMapsLinks = 0;
  const linkTargets = [];

  linkMatches.forEach((tag) => {
    const href = safeGetMatch(tag, /href=["']([^"']+)["']/i);
    if (!href) return;
    const full = makeAbsoluteUrl(pageUrl, href);
    if (!full) return;
    linkTargets.push(full);
    try {
      const u = new URL(full);
      if (u.hostname === pageUrl.hostname) internalLinks += 1;
      else externalLinks += 1;
      const h = u.hostname.toLowerCase();
      if (h.includes('maps.google.') || h.includes('google.com') && u.pathname.toLowerCase().includes('/maps')) mapLinks += 1;
      if (h.includes('maps.apple.com')) appleMapsLinks += 1;
      if (h.includes('yelp.')) yelpLinks += 1;
    } catch (error) {
      // ignore malformed links
    }
  });

  const scriptLdJsonCount = (source.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>/gi) || []).length;
  const hasSchemaLocalBusiness = /"@type"\s*:\s*"LocalBusiness"/i.test(source);
  const hasAggregateRating = /"aggregateRating"\s*:/i.test(source);
  const hasOrganizationSchema = /"@type"\s*:\s*"Organization"/i.test(source);

  const ogTitle = safeGetMatch(source, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["'][^>]*>/i);
  const ogDescription = safeGetMatch(source, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["'][^>]*>/i);
  const ogImage = safeGetMatch(source, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["'][^>]*>/i);
  const twitterCard = safeGetMatch(source, /<meta[^>]+name=["']twitter:card["'][^>]+content=["']([^"']*)["'][^>]*>/i);

  const bodyText = source.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

  const socialLinks = uniq(linkTargets.filter((url) =>
    /facebook\.com|instagram\.com|linkedin\.com|x\.com|twitter\.com|youtube\.com|tiktok\.com/i.test(url)
  ));

  const recommendations = [];
  recommendations.push(
    buildRecommendation(
      'title',
      title.length >= 20 && title.length <= 60 ? 'good' : 'needs-work',
      'Page title length',
      title ? `"${title}" (${title.length} chars)` : 'No title found.',
      'Aim for 20-60 characters with primary keyword near the start.'
    )
  );
  recommendations.push(
    buildRecommendation(
      'meta-description',
      metaDescription.length >= 80 && metaDescription.length <= 165 ? 'good' : 'needs-work',
      'Meta description',
      metaDescription ? `${metaDescription.length} chars` : 'No meta description found.',
      'Add a compelling 80-165 character summary with a clear value proposition.'
    )
  );
  recommendations.push(
    buildRecommendation(
      'viewport',
      viewport ? 'good' : 'needs-work',
      'Mobile viewport tag',
      viewport || 'Viewport meta tag missing.',
      'Add `<meta name="viewport" content="width=device-width, initial-scale=1">` for mobile friendliness.'
    )
  );
  recommendations.push(
    buildRecommendation(
      'h1',
      h1Count === 1 ? 'good' : 'needs-work',
      'Primary heading structure',
      `H1 tags found: ${h1Count}`,
      'Use exactly one clear H1 to reinforce the page topic.'
    )
  );
  recommendations.push(
    buildRecommendation(
      'image-alt',
      imageCount === 0 || imagesMissingAlt === 0 ? 'good' : 'needs-work',
      'Image alt text',
      `${imagesMissingAlt} of ${imageCount} images appear to be missing alt text.`,
      'Add descriptive alt text to improve accessibility and image SEO.'
    )
  );
  recommendations.push(
    buildRecommendation(
      'schema',
      scriptLdJsonCount > 0 ? 'good' : 'needs-work',
      'Structured data',
      scriptLdJsonCount > 0 ? `${scriptLdJsonCount} JSON-LD blocks detected.` : 'No JSON-LD structured data detected.',
      'Add schema (Organization, LocalBusiness, Service, FAQ, Review) to improve SERP visibility.'
    )
  );
  recommendations.push(
    buildRecommendation(
      'social-cards',
      ogTitle && ogDescription && ogImage && twitterCard ? 'good' : 'needs-work',
      'Social sharing metadata',
      `OG title: ${ogTitle ? 'yes' : 'no'}, OG description: ${ogDescription ? 'yes' : 'no'}, OG image: ${ogImage ? 'yes' : 'no'}, Twitter card: ${twitterCard ? 'yes' : 'no'}.`,
      'Ensure Open Graph and Twitter card tags are complete for better link previews.'
    )
  );

  const backlinkIdeas = [
    'Run Ahrefs/SEMrush/Majestic to get referring domains and toxicity score.',
    'Build local citations (Google Business Profile, Apple Maps, Yelp, Bing Places, industry directories).',
    'Pursue 5-10 local partner backlinks (associations, chambers, suppliers, sponsorship pages).',
    'Create linkable assets (guides, tools, before/after case studies) and outreach monthly.'
  ];

  const googleMapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pageUrl.hostname)}`;
  const appleMapsSearchUrl = `https://maps.apple.com/?q=${encodeURIComponent(pageUrl.hostname)}`;
  const yelpSearchUrl = `https://www.yelp.com/search?find_desc=${encodeURIComponent(pageUrl.hostname)}`;
  const googleReviewSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(pageUrl.hostname + ' reviews')}`;

  const scoreMax = recommendations.length;
  const score = scoreRecommendations(recommendations);

  return {
    analyzedAt: new Date().toISOString(),
    sourceUrl: pageUrl.toString(),
    healthScore: {
      value: score,
      max: scoreMax,
      percent: Math.round((score / scoreMax) * 100)
    },
    technical: {
      fetchMs,
      htmlBytes: Buffer.byteLength(source, 'utf8'),
      https: pageUrl.protocol === 'https:',
      canonical: canonical || null,
      robotsMeta: robotsMeta || null,
      viewport: viewport || null
    },
    seo: {
      title: title || null,
      titleLength: title.length,
      metaDescription: metaDescription || null,
      metaDescriptionLength: metaDescription.length,
      h1Count,
      h2Count,
      wordCount,
      internalLinks,
      externalLinks,
      imageCount,
      imagesMissingAlt
    },
    localPresence: {
      googleMapsLinks: mapLinks,
      appleMapsLinks,
      yelpLinks,
      hasLocalBusinessSchema: hasSchemaLocalBusiness,
      hasAggregateRatingSchema: hasAggregateRating,
      hasOrganizationSchema,
      socialProfiles: socialLinks,
      quickCheckLinks: {
        googleMaps: googleMapsSearchUrl,
        appleMaps: appleMapsSearchUrl,
        yelp: yelpSearchUrl,
        googleReviews: googleReviewSearchUrl
      }
    },
    socialPreview: {
      ogTitle: ogTitle || null,
      ogDescription: ogDescription || null,
      ogImage: ogImage || null,
      twitterCard: twitterCard || null
    },
    offPage: {
      backlinkDataAvailable: false,
      note: 'Backlink/referring-domain data requires dedicated SEO APIs or tools.',
      recommendedBacklinkActions: backlinkIdeas
    },
    recommendations
  };
}

app.post('/api/marketing-analyzer/analyze', async (req, res) => {
  try {
    const pageUrl = normalizeMarketingUrl(req.body?.url);
    if (!pageUrl) {
      return res.status(400).json({ error: 'Please provide a valid website URL.' });
    }
    if (isPrivateHostname(pageUrl.hostname)) {
      return res.status(400).json({ error: 'Private or local hosts are not allowed.' });
    }

    const started = Date.now();
    const response = await fetchFn(pageUrl.toString(), {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const fetchMs = Date.now() - started;

    if (!response.ok) {
      return res.status(502).json({ error: `Could not fetch website (${response.status}).` });
    }

    const html = await response.text();
    const result = computeMarketingHealthFromHtml(html, pageUrl, fetchMs);

    const robotsUrl = makeAbsoluteUrl(pageUrl, '/robots.txt');
    const sitemapUrl = makeAbsoluteUrl(pageUrl, '/sitemap.xml');
    const robotsFound = lowerBooleanCheck(await fetchFn(robotsUrl).then((r) => r.ok).catch(() => false));
    const sitemapFound = lowerBooleanCheck(await fetchFn(sitemapUrl).then((r) => r.ok).catch(() => false));

    result.technical.robotsTxtFound = robotsFound;
    result.technical.sitemapFound = sitemapFound;

    return res.json(result);
  } catch (error) {
    console.error('Marketing analyzer error:', error);
    return res.status(500).json({ error: 'Failed to analyze website health' });
  }
});

function lowerBooleanCheck(v) {
  return !!v;
}

function readMarketingReportsIndex() {
  try {
    if (!fs.existsSync(marketingReportsIndexPath)) return [];
    const raw = fs.readFileSync(marketingReportsIndexPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to read marketing reports index:', error);
    return [];
  }
}

function writeMarketingReportsIndex(indexItems) {
  fs.writeFileSync(marketingReportsIndexPath, JSON.stringify(indexItems, null, 2), 'utf8');
}

function sanitizeReportLabel(label, fallbackUrl) {
  const raw = String(label || '').trim();
  if (raw) return raw.slice(0, 140);
  const domain = String(fallbackUrl || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (domain) return `Scan for ${domain}`;
  return 'Website scan';
}

function buildReportSummary(analysis) {
  return {
    sourceUrl: String(analysis?.sourceUrl || ''),
    healthPercent: Number(analysis?.healthScore?.percent) || 0,
    healthValue: Number(analysis?.healthScore?.value) || 0,
    healthMax: Number(analysis?.healthScore?.max) || 0,
    fetchMs: Number(analysis?.technical?.fetchMs) || 0,
    wordCount: Number(analysis?.seo?.wordCount) || 0,
    missingAlt: Number(analysis?.seo?.imagesMissingAlt) || 0
  };
}

function summarizeRecommendationDiff(prevRecs, nextRecs) {
  const prev = new Map((prevRecs || []).map((r) => [r.id, r.status]));
  const next = new Map((nextRecs || []).map((r) => [r.id, r.status]));
  let improved = 0;
  let regressed = 0;
  let unchanged = 0;
  next.forEach((status, id) => {
    const before = prev.get(id);
    if (!before) return;
    if (before === status) {
      unchanged += 1;
    } else if (before !== 'good' && status === 'good') {
      improved += 1;
    } else if (before === 'good' && status !== 'good') {
      regressed += 1;
    } else {
      unchanged += 1;
    }
  });
  return { improved, regressed, unchanged };
}

app.get('/api/marketing-analyzer/reports', (req, res) => {
  const index = readMarketingReportsIndex().sort((a, b) => {
    return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
  });
  return res.json({ reports: index });
});

app.get('/api/marketing-analyzer/reports/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Report id is required.' });
  const filePath = path.join(marketingReportsDir, `${id}.json`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Report not found.' });
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return res.json(parsed);
  } catch (error) {
    console.error('Failed to read marketing report:', error);
    return res.status(500).json({ error: 'Failed to read report.' });
  }
});

app.delete('/api/marketing-analyzer/reports/:id', (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Report id is required.' });
    const filePath = path.join(marketingReportsDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        console.error('Failed deleting marketing report file:', error);
      }
    }
    const index = readMarketingReportsIndex();
    const next = index.filter((r) => String(r.id || '') !== id);
    writeMarketingReportsIndex(next);
    return res.json({ success: true, deleted: id });
  } catch (error) {
    console.error('Failed to delete marketing report:', error);
    return res.status(500).json({ error: 'Failed to delete report.' });
  }
});

app.post('/api/marketing-analyzer/reports', (req, res) => {
  try {
    const analysis = req.body?.analysis;
    const sourceUrl = String(analysis?.sourceUrl || '').trim();
    if (!analysis || !sourceUrl) {
      return res.status(400).json({ error: 'Analysis payload with sourceUrl is required.' });
    }
    const now = new Date().toISOString();
    const id = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const label = sanitizeReportLabel(req.body?.label, sourceUrl);
    const summary = buildReportSummary(analysis);
    const record = {
      id,
      label,
      savedAt: now,
      sourceUrl,
      summary,
      analysis
    };

    const reportPath = path.join(marketingReportsDir, `${id}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(record, null, 2), 'utf8');

    const index = readMarketingReportsIndex();
    index.push({
      id,
      label,
      savedAt: now,
      sourceUrl,
      summary
    });
    writeMarketingReportsIndex(index);

    return res.status(201).json({
      success: true,
      report: {
        id,
        label,
        savedAt: now,
        sourceUrl,
        summary
      }
    });
  } catch (error) {
    console.error('Failed to save marketing report:', error);
    return res.status(500).json({ error: 'Failed to save report.' });
  }
});

app.post('/api/marketing-analyzer/compare', (req, res) => {
  try {
    const baseId = String(req.body?.baseId || '').trim();
    const targetId = String(req.body?.targetId || '').trim();
    if (!baseId || !targetId) {
      return res.status(400).json({ error: 'Both baseId and targetId are required.' });
    }
    const basePath = path.join(marketingReportsDir, `${baseId}.json`);
    const targetPath = path.join(marketingReportsDir, `${targetId}.json`);
    if (!fs.existsSync(basePath) || !fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'One or both reports were not found.' });
    }
    const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
    const target = JSON.parse(fs.readFileSync(targetPath, 'utf8'));

    const baseSummary = buildReportSummary(base.analysis);
    const targetSummary = buildReportSummary(target.analysis);
    const delta = {
      healthPercent: targetSummary.healthPercent - baseSummary.healthPercent,
      fetchMs: targetSummary.fetchMs - baseSummary.fetchMs,
      wordCount: targetSummary.wordCount - baseSummary.wordCount,
      missingAlt: targetSummary.missingAlt - baseSummary.missingAlt
    };
    const recommendationDelta = summarizeRecommendationDiff(
      base.analysis?.recommendations || [],
      target.analysis?.recommendations || []
    );

    return res.json({
      base: {
        id: base.id,
        label: base.label,
        savedAt: base.savedAt,
        sourceUrl: base.sourceUrl,
        summary: baseSummary
      },
      target: {
        id: target.id,
        label: target.label,
        savedAt: target.savedAt,
        sourceUrl: target.sourceUrl,
        summary: targetSummary
      },
      delta,
      recommendationDelta
    });
  } catch (error) {
    console.error('Failed to compare marketing reports:', error);
    return res.status(500).json({ error: 'Failed to compare reports.' });
  }
});

// ── Digital Marketing: SEO analyzer LLM (Anthropic primary, OpenAI/Codex failover) ──
const ANTHROPIC_ANALYZE_MODEL = process.env.ANTHROPIC_ANALYZE_MODEL || 'claude-sonnet-4-5';
const OPENAI_ANALYZE_MODEL =
  process.env.OPENAI_ANALYZE_MODEL ||
  process.env.OPENAI_CODEX_MODEL ||
  'gpt-4o';

function anthropicAnalyzerErrorMessage(data) {
  if (!data || typeof data !== 'object') return '';
  const err = data.error;
  if (err && typeof err === 'object') return String(err.message || err.type || '');
  return String(data.message || '');
}

function shouldFailoverAnthropicToOpenAi(status, data, errMsg) {
  const msg = String(anthropicAnalyzerErrorMessage(data) || errMsg || '').toLowerCase();
  if ([402, 429, 500, 502, 503, 529].includes(Number(status))) return true;
  return /credit|billing|balance|quota|rate.?limit|overloaded|capacity|insufficient|exceeded|spend|payment|subscription|out of|too many requests/.test(
    msg
  );
}

async function callAnthropicAnalyzer(prompt, apiKey) {
  const payload = {
    model: ANTHROPIC_ANALYZE_MODEL,
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }]
  };
  const response = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.type === 'error' || data.error) {
    const msg =
      anthropicAnalyzerErrorMessage(data) || `Anthropic request failed (${response.status})`;
    const err = new Error(String(msg));
    err.status = response.status;
    err.data = data;
    throw err;
  }
  const text = (data.content || []).map((c) => c.text || '').join('');
  if (!text) throw new Error('Empty response from Anthropic');
  return text;
}

async function callOpenAiAnalyzer(prompt, apiKey) {
  const body = {
    model: OPENAI_ANALYZE_MODEL,
    max_tokens: 6000,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are an expert SEO analyst. Follow the user instructions and return only valid JSON (no markdown fences).'
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
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data?.error?.message || `OpenAI request failed (${response.status})`;
    const err = new Error(String(msg));
    err.status = response.status;
    err.data = data;
    throw err;
  }
  const text = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('Empty response from OpenAI');
  return text;
}

async function runMarketingAnalyzerLlm(prompt) {
  const anthropicKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
  const openAiKey = String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
  const pref = String(process.env.ANALYZE_LLM_PROVIDER || 'auto').trim().toLowerCase();

  if (pref === 'openai') {
    if (!openAiKey) throw new Error('OPENAI_API_KEY not set in environment variables');
    const text = await callOpenAiAnalyzer(prompt, openAiKey);
    return { text, provider: 'openai', failover: false, model: OPENAI_ANALYZE_MODEL };
  }

  if (pref === 'anthropic') {
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not set in environment variables');
    const text = await callAnthropicAnalyzer(prompt, anthropicKey);
    return { text, provider: 'anthropic', failover: false, model: ANTHROPIC_ANALYZE_MODEL };
  }

  // auto: try Anthropic first, failover to OpenAI on credit/rate-limit style errors
  if (anthropicKey) {
    try {
      const text = await callAnthropicAnalyzer(prompt, anthropicKey);
      return { text, provider: 'anthropic', failover: false, model: ANTHROPIC_ANALYZE_MODEL };
    } catch (anthropicErr) {
      if (openAiKey && shouldFailoverAnthropicToOpenAi(anthropicErr.status, anthropicErr.data, anthropicErr.message)) {
        console.warn(
          '[analyze] Anthropic unavailable (%s), failing over to OpenAI model %s',
          anthropicErr.message,
          OPENAI_ANALYZE_MODEL
        );
        const text = await callOpenAiAnalyzer(prompt, openAiKey);
        return { text, provider: 'openai', failover: true, model: OPENAI_ANALYZE_MODEL };
      }
      throw anthropicErr;
    }
  }

  if (openAiKey) {
    const text = await callOpenAiAnalyzer(prompt, openAiKey);
    return { text, provider: 'openai', failover: false, model: OPENAI_ANALYZE_MODEL };
  }

  throw new Error('Configure ANTHROPIC_API_KEY or OPENAI_API_KEY for the SEO analyzer');
}

function extractImageAltAuditFromHtml(html, pageUrl) {
  const out = [];
  const seen = new Set();
  const base = pageUrl instanceof URL ? pageUrl : null;
  const tagRx = /<img\b[^>]*>/gi;
  const srcRx = /\bsrc\s*=\s*["']([^"']+)["']/i;
  const altRx = /\balt\s*=\s*["']([^"']*)["']/i;
  let m;
  while ((m = tagRx.exec(String(html || '')))) {
    const tag = m[0] || '';
    const srcM = tag.match(srcRx);
    if (!srcM || !srcM[1]) continue;
    const rawSrc = srcM[1].trim();
    let src = rawSrc;
    try {
      if (base) src = new URL(rawSrc, base).toString();
    } catch {}
    if (seen.has(src)) continue;
    seen.add(src);
    const altM = tag.match(altRx);
    const alt = altM ? String(altM[1] || '').trim() : '';
    const fileName = (() => {
      try {
        const u = new URL(src);
        const p = u.pathname || '';
        return p.split('/').filter(Boolean).pop() || src;
      } catch {
        return src.split('/').filter(Boolean).pop() || src;
      }
    })();
    out.push({ src, fileName, alt, missingAlt: !alt });
    if (out.length >= 300) break;
  }
  return out;
}

function extractPageMetaFromHtml(html, pageUrl) {
  const src = String(html || '');
  const titleMatch = src.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaMatch = src.match(
    /<meta[^>]+name\s*=\s*["']description["'][^>]*content\s*=\s*["']([\s\S]*?)["'][^>]*>/i
  );
  const ogMatch = src.match(
    /<meta[^>]+property\s*=\s*["']og:description["'][^>]*content\s*=\s*["']([\s\S]*?)["'][^>]*>/i
  );
  const title = titleMatch ? String(titleMatch[1] || '').replace(/\s+/g, ' ').trim() : '';
  const metaDescription = metaMatch
    ? String(metaMatch[1] || '').replace(/\s+/g, ' ').trim()
    : ogMatch
    ? String(ogMatch[1] || '').replace(/\s+/g, ' ').trim()
    : '';
  return {
    url: pageUrl instanceof URL ? pageUrl.toString() : String(pageUrl || ''),
    title,
    metaDescription
  };
}

function extractKeywordsFromHtml(html) {
  const cleaned = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  const stop = new Set([
    'the',
    'and',
    'for',
    'that',
    'with',
    'you',
    'your',
    'from',
    'this',
    'are',
    'was',
    'were',
    'have',
    'has',
    'had',
    'but',
    'not',
    'can',
    'all',
    'our',
    'out',
    'about',
    'into',
    'more',
    'than',
    'they',
    'them',
    'their',
    'will',
    'what',
    'when',
    'where',
    'who',
    'why',
    'how',
    'www',
    'http',
    'https',
    'com',
    'org',
    'net',
    'home',
    'page'
  ]);
  const counts = new Map();
  const rx = /\b[a-z][a-z0-9-]{2,}\b/g;
  let m;
  while ((m = rx.exec(cleaned))) {
    const w = m[0];
    if (!w || stop.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return counts;
}

function extractInternalLinks(html, pageUrl, rootHost) {
  const out = [];
  const seen = new Set();
  const hrefRx = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = hrefRx.exec(String(html || '')))) {
    const raw = String(m[1] || '').trim();
    if (!raw) continue;
    if (/^(mailto:|tel:|javascript:|#)/i.test(raw)) continue;
    let u;
    try {
      u = new URL(raw, pageUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/i.test(u.protocol)) continue;
    if (String(u.hostname || '').toLowerCase() !== rootHost) continue;
    if (/\.(pdf|png|jpe?g|gif|webp|svg|zip|mp4|mp3|docx?|xlsx?|pptx?)$/i.test(u.pathname)) continue;
    u.hash = '';
    const norm = u.toString();
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
    if (out.length >= 80) break;
  }
  return out;
}

async function collectAnalyzerSiteData(startUrl) {
  const maxPages = 16;
  const maxImages = 600;
  const rootHost = String(startUrl.hostname || '').toLowerCase();
  const queue = [startUrl.toString()];
  const visited = new Set();
  const pageMetaAudit = [];
  const imageAltAudit = [];
  const imgSeen = new Set();
  const keywordCounts = new Map();
  while (queue.length && visited.size < maxPages) {
    const next = queue.shift();
    if (!next || visited.has(next)) continue;
    visited.add(next);
    let pageRes;
    try {
      pageRes = await fetchFn(next, {
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
    } catch {
      continue;
    }
    if (!pageRes || !pageRes.ok) continue;
    const ctype = String(pageRes.headers.get('content-type') || '').toLowerCase();
    if (!ctype.includes('text/html')) continue;
    let html = '';
    try {
      html = await pageRes.text();
    } catch {
      continue;
    }
    const finalUrl = (() => {
      try {
        return new URL(pageRes.url || next);
      } catch {
        return new URL(next);
      }
    })();
    pageMetaAudit.push(extractPageMetaFromHtml(html, finalUrl));
    const imgs = extractImageAltAuditFromHtml(html, finalUrl);
    for (const img of imgs) {
      const key = String(img.src || '').trim();
      if (!key || imgSeen.has(key)) continue;
      imgSeen.add(key);
      imageAltAudit.push({ ...img, page: finalUrl.toString() });
      if (imageAltAudit.length >= maxImages) break;
    }
    const kws = extractKeywordsFromHtml(html);
    kws.forEach((v, k) => keywordCounts.set(k, (keywordCounts.get(k) || 0) + v));
    const links = extractInternalLinks(html, finalUrl, rootHost);
    for (const link of links) {
      if (!visited.has(link) && !queue.includes(link)) queue.push(link);
      if (queue.length >= maxPages * 4) break;
    }
  }
  const siteKeywords = [...keywordCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 220)
    .map(([keyword, count]) => ({ keyword, count }));
  return { imageAltAudit, pageMetaAudit, siteKeywords, pagesScanned: visited.size };
}

function readGscToken() {
  try {
    if (!fs.existsSync(gscTokenPath)) return null;
    const raw = fs.readFileSync(gscTokenPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeGscToken(token) {
  fs.writeFileSync(gscTokenPath, JSON.stringify(token || {}, null, 2), 'utf8');
}

function getGscRootDomain(hostname) {
  const parts = String(hostname || '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  return parts.slice(-2).join('.');
}

function buildGscPropertyCandidates(pageUrl) {
  const u = pageUrl instanceof URL ? pageUrl : new URL(String(pageUrl || ''));
  const host = String(u.hostname || '').toLowerCase();
  const noWww = host.replace(/^www\./i, '');
  const root = getGscRootDomain(noWww);
  const set = new Set([
    `${u.protocol}//${host}/`,
    `${u.protocol}//${noWww}/`,
    `https://${host}/`,
    `https://${noWww}/`,
    `http://${host}/`,
    `http://${noWww}/`,
    `sc-domain:${host}`,
    `sc-domain:${noWww}`,
    `sc-domain:${root}`
  ]);
  return [...set];
}

async function ensureGscAccessToken() {
  const token = readGscToken();
  if (!token || !token.refresh_token) return null;
  const now = Date.now();
  if (token.access_token && token.expires_at && token.expires_at - now > 30_000) {
    return token.access_token;
  }
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return null;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token'
  });
  const res = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) return null;
  const next = {
    ...token,
    access_token: data.access_token,
    expires_at: Date.now() + (Number(data.expires_in || 3600) * 1000)
  };
  writeGscToken(next);
  return next.access_token;
}

async function gscApi(pathname, opt = {}) {
  const accessToken = await ensureGscAccessToken();
  if (!accessToken) throw new Error('GSC_NOT_CONNECTED');
  const res = await fetchFn(`https://www.googleapis.com/webmasters/v3${pathname}`, {
    ...opt,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(opt.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Google API error (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

async function getGscSiteReport(rawUrl) {
  const pageUrl = /^https?:\/\//i.test(String(rawUrl || ''))
    ? new URL(String(rawUrl))
    : new URL(`https://${String(rawUrl || '')}`);
  const candidates = buildGscPropertyCandidates(pageUrl);
  let siteEntry = null;
  let sites = [];
  try {
    const sitesData = await gscApi('/sites');
    sites = (sitesData.siteEntry || []).map((s) => ({
      siteUrl: String(s.siteUrl || ''),
      permissionLevel: String(s.permissionLevel || '')
    }));
  } catch (error) {
    if (String(error.message) === 'GSC_NOT_CONNECTED') {
      return { status: 'not_connected', canUseGsc: false, reason: 'Google Search Console is not connected yet.' };
    }
    return { status: 'error', canUseGsc: false, reason: error.message || 'Failed to query Google Search Console.' };
  }
  siteEntry = sites.find((s) => candidates.includes(s.siteUrl));
  if (!siteEntry) {
    return {
      status: 'unavailable',
      canUseGsc: false,
      reason: 'This site is not verified/accessible in your connected Google Search Console account.',
      checkedCandidates: candidates
    };
  }
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 90);
  const payload = {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    dimensions: ['query', 'page'],
    rowLimit: 250
  };
  const path = `/sites/${encodeURIComponent(siteEntry.siteUrl)}/searchAnalytics/query`;
  const data = await gscApi(path, { method: 'POST', body: JSON.stringify(payload) });
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const queries = rows.map((r) => ({
    query: String((r.keys || [])[0] || ''),
    page: String((r.keys || [])[1] || ''),
    clicks: Number(r.clicks || 0),
    impressions: Number(r.impressions || 0),
    ctr: Number(r.ctr || 0),
    position: Number(r.position || 0)
  }));
  return {
    status: 'available',
    canUseGsc: true,
    property: siteEntry.siteUrl,
    permissionLevel: siteEntry.permissionLevel,
    dateRange: payload.startDate + ' to ' + payload.endDate,
    summary: {
      totalQueries: queries.length,
      totalClicks: queries.reduce((a, x) => a + x.clicks, 0),
      totalImpressions: queries.reduce((a, x) => a + x.impressions, 0)
    },
    queries
  };
}

app.get('/api/gsc/connect', (req, res) => {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || '').trim();
  if (!clientId || !redirectUri) {
    return res.status(500).send('Missing GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI');
  }
  const state = crypto.randomBytes(18).toString('hex');
  fs.writeFileSync(gscStatePath, JSON.stringify({ state, createdAt: Date.now() }), 'utf8');
  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state
    }).toString();
  return res.redirect(authUrl);
});

app.get('/api/gsc/oauth/callback', async (req, res) => {
  try {
    const code = String(req.query?.code || '');
    const state = String(req.query?.state || '');
    if (!code) return res.status(400).send('Missing code');
    if (!fs.existsSync(gscStatePath)) return res.status(400).send('Missing auth state');
    const stateData = JSON.parse(fs.readFileSync(gscStatePath, 'utf8'));
    if (!stateData?.state || stateData.state !== state) return res.status(400).send('Invalid auth state');
    const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
    const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || '').trim();
    if (!clientId || !clientSecret || !redirectUri) {
      return res.status(500).send('Missing Google OAuth environment configuration');
    }
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });
    const tokenRes = await fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token) {
      return res.status(500).send(`OAuth token exchange failed: ${tokenData?.error || tokenRes.status}`);
    }
    const existing = readGscToken() || {};
    const refreshToken = tokenData.refresh_token || existing.refresh_token || '';
    writeGscToken({
      access_token: tokenData.access_token,
      refresh_token: refreshToken,
      scope: tokenData.scope || existing.scope || '',
      token_type: tokenData.token_type || 'Bearer',
      expires_at: Date.now() + (Number(tokenData.expires_in || 3600) * 1000)
    });
    try { fs.unlinkSync(gscStatePath); } catch {}
    return res.send('Google Search Console connected successfully. You can close this tab.');
  } catch (error) {
    return res.status(500).send(`OAuth callback failed: ${error.message}`);
  }
});

app.get('/api/gsc/report', async (req, res) => {
  try {
    const rawUrl = String(req.query?.url || '').trim();
    if (!rawUrl) return res.status(400).json({ error: 'url query parameter is required' });
    const report = await getGscSiteReport(rawUrl);
    return res.json(report);
  } catch (error) {
    return res.status(500).json({ status: 'error', canUseGsc: false, reason: error.message || 'Failed to load GSC report' });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const prompt = req.body?.prompt;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ success: false, error: 'No prompt provided' });
    }
    let llm;
    try {
      llm = await runMarketingAnalyzerLlm(prompt);
    } catch (llmErr) {
      return res.status(500).json({ success: false, error: llmErr.message || 'Analyze failed' });
    }
    const text = llm.text;
    let imageAltAudit = [];
    let pageMetaAudit = [];
    let siteKeywords = [];
    let pagesScanned = 0;
    const scanUrlRaw = String(req.body?.url || '').trim();
    if (scanUrlRaw) {
      try {
        const scanUrl = /^https?:\/\//i.test(scanUrlRaw) ? new URL(scanUrlRaw) : new URL(`https://${scanUrlRaw}`);
        if (!isPrivateHostname(scanUrl.hostname)) {
          const crawl = await collectAnalyzerSiteData(scanUrl);
          imageAltAudit = crawl.imageAltAudit || [];
          pageMetaAudit = crawl.pageMetaAudit || [];
          siteKeywords = crawl.siteKeywords || [];
          pagesScanned = Number(crawl.pagesScanned || 0);
        }
      } catch {
        imageAltAudit = [];
        pageMetaAudit = [];
        siteKeywords = [];
        pagesScanned = 0;
      }
    }
    return res.json({
      success: true,
      text,
      provider: llm.provider,
      failover: !!llm.failover,
      model: llm.model,
      imageAltAudit,
      pageMetaAudit,
      siteKeywords,
      pagesScanned
    });
  } catch (error) {
    console.error('/api/analyze error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Analyze failed' });
  }
});

app.get('/api/cursorai/projects', (req, res) => {
  try {
    return res.json({ ok: true, projects: cursorAiListProjects() });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to list projects' });
  }
});

app.get('/api/cursorai/projects/:folderName', (req, res) => {
  try {
    const seg = cursorAiValidateFolderSegment(req.params.folderName);
    if (!seg) return res.status(400).json({ error: 'Invalid folder name' });
    const rootResolved = path.resolve(cursorAiProjectsRoot);
    const projectDir = path.resolve(path.join(cursorAiProjectsRoot, seg));
    const relToRoot = path.relative(rootResolved, projectDir);
    if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    if (!fs.existsSync(projectDir)) return res.status(404).json({ error: 'Project not found' });
    const st = fs.statSync(projectDir);
    if (!st.isDirectory()) return res.status(400).json({ error: 'Not a project folder' });
    const metaPath = path.join(projectDir, 'cursorai-meta.json');
    let meta = {};
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {
        meta = {};
      }
    }
    const entry = cursorAiResolvePreviewEntry(projectDir, meta);
    const previewUrl = `/cursorai/projects/${encodeURIComponent(seg)}/${encodeURIComponent(entry)}`;
    return res.json({
      ok: true,
      folderName: seg,
      projectName: meta.projectName || seg,
      prompt: typeof meta.prompt === 'string' ? meta.prompt : '',
      provider: meta.provider || 'auto',
      createdAt: meta.createdAt || null,
      updatedAt: meta.updatedAt || null,
      summary: typeof meta.summary === 'string' ? meta.summary : '',
      files: Array.isArray(meta.files) ? meta.files : [],
      previewUrl,
      bytes: cursorAiDirBytes(projectDir)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load project' });
  }
});

app.delete('/api/cursorai/projects/:folderName', (req, res) => {
  try {
    const seg = cursorAiValidateFolderSegment(req.params.folderName);
    if (!seg) return res.status(400).json({ error: 'Invalid folder name' });
    const rootResolved = path.resolve(cursorAiProjectsRoot);
    const target = path.resolve(path.join(cursorAiProjectsRoot, seg));
    const rel = path.relative(rootResolved, target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    if (!fs.existsSync(target)) return res.status(404).json({ error: 'Project not found' });
    const st = fs.statSync(target);
    if (!st.isDirectory()) return res.status(400).json({ error: 'Not a project folder' });
    fs.rmSync(target, { recursive: true, force: true });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Delete failed' });
  }
});

app.post('/api/cursorai/test-telegram', async (req, res) => {
  try {
    const out = await sendTelegramTest();
    return res.json(out);
  } catch (error) {
    console.error('/api/cursorai/test-telegram error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Test failed' });
  }
});

app.post('/api/telegram/webhook', handleTelegramWebhookExpress);

app.post('/api/cursorai/create-project', async (req, res) => {
  try {
    const projectName = String(req.body?.projectName || '').trim();
    const prompt = String(req.body?.prompt || '').trim();
    const provider = String(req.body?.provider || 'auto').trim().toLowerCase();
    if (!projectName) return res.status(400).json({ error: 'projectName is required' });
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    const out = await cursorAiCreateProject({ projectName, prompt, provider });
    return res.json(out);
  } catch (error) {
    console.error('/api/cursorai/create-project error:', error);
    const msg = error.message || '';
    if (/required/.test(msg)) return res.status(400).json({ error: msg });
    return res.status(500).json({ error: msg || 'Failed to create project' });
  }
});

app.post('/api/cursorai/update-project', async (req, res) => {
  try {
    const folderName = String(req.body?.folderName || '').trim();
    const projectNameIn = String(req.body?.projectName || '').trim();
    const prompt = String(req.body?.prompt || '').trim();
    const provider = String(req.body?.provider || 'auto').trim().toLowerCase();
    const out = await cursorAiUpdateProject({
      folderName,
      projectName: projectNameIn,
      prompt,
      provider
    });
    return res.json(out);
  } catch (error) {
    console.error('/api/cursorai/update-project error:', error);
    const msg = error.message || '';
    if (msg === 'Project not found') return res.status(404).json({ error: msg });
    if (/required|must be safe|Invalid path|Not a project folder|Could not clear/.test(msg)) {
      return res.status(400).json({ error: msg });
    }
    return res.status(500).json({ error: msg || 'Failed to update project' });
  }
});

const CLEAN_AI_TYPES = new Set([
  'coffee_stain',
  'floor_mark',
  'fridge_smudge',
  'sink_clutter',
  'dirty_tap',
  'water_floor',
  'counter_crumbs',
  'other'
]);

const CLEANAI_DEFAULT_LOOKFOR = [
  'Coffee stains on countertops',
  'Marks or scuffs on the floor',
  'Fingerprints or smudges on the fridge or stainless appliances',
  'Objects or dishes left inside the sink',
  'Dirty or limescaled tap / faucet',
  'Water patches or wet spots on the floor',
  'Crumbs or food debris on countertops'
];

function cleanAiNormalizeLookForList(rawList) {
  const seen = new Set();
  const out = [];
  const arr = Array.isArray(rawList) ? rawList : [];
  for (const line of arr) {
    const s = String(line || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length >= 50) break;
  }
  return out;
}

function readCleanAiConfig() {
  try {
    if (!fs.existsSync(cleanAiConfigPath)) {
      const seed = { lookFor: [...CLEANAI_DEFAULT_LOOKFOR], updatedAt: new Date().toISOString() };
      fs.writeFileSync(cleanAiConfigPath, JSON.stringify(seed, null, 2), 'utf8');
      return seed;
    }
    const j = JSON.parse(fs.readFileSync(cleanAiConfigPath, 'utf8'));
    const lookFor = cleanAiNormalizeLookForList(j.lookFor);
    if (!lookFor.length) {
      return { lookFor: [...CLEANAI_DEFAULT_LOOKFOR], updatedAt: new Date().toISOString() };
    }
    return { lookFor, updatedAt: j.updatedAt || null };
  } catch {
    return { lookFor: [...CLEANAI_DEFAULT_LOOKFOR], updatedAt: null };
  }
}

function writeCleanAiConfig(lookFor) {
  const next = {
    lookFor: cleanAiNormalizeLookForList(lookFor),
    updatedAt: new Date().toISOString()
  };
  if (!next.lookFor.length) next.lookFor = [...CLEANAI_DEFAULT_LOOKFOR];
  fs.writeFileSync(cleanAiConfigPath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function buildCleanAiSystemPrompt(lookForItems) {
  const items = Array.isArray(lookForItems) ? lookForItems : [];
  const bulletBlock = items.length
    ? items.map((s) => `- ${s}`).join('\n')
    : CLEANAI_DEFAULT_LOOKFOR.map((s) => `- ${s}`).join('\n');
  return `You analyze photos of indoor spaces for cleaning and housekeeping quality. Be conservative: only flag issues you can reasonably justify from the pixels.

Spot these checklist priorities when visibly present:
${bulletBlock}

Also generally note similar cleanliness problems (dusty surfaces, spilled liquids, cluttered surfaces) when obvious.

Respond with JSON ONLY (no markdown, no commentary):
{"issues":[{"label":"short label","type":"coffee_stain|floor_mark|fridge_smudge|sink_clutter|dirty_tap|water_floor|counter_crumbs|other","x":0,"y":0,"w":0,"h":0}]}

Requirements:
- x,y,w,h are normalized 0-1 vs full image width/height; x,y is top-left of the region enclosing the visible problem.
- w,h at least ~0.02 when possible.
- At most 12 issues per frame; use empty issues array when nothing is clearly visible.
- Prefer type "other" if the checklist does not contain a fitting category.`;
}

function cleanAiSessionPath(id) {
  const sid = String(id || '').trim();
  if (!/^[a-f0-9-]{36}$/i.test(sid)) return null;
  return path.join(cleanAiSessionsDir, `${sid}.json`);
}

function readCleanAiSession(sessionId) {
  const fp = cleanAiSessionPath(sessionId);
  if (!fp || !fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return null;
  }
}

function writeCleanAiSession(session) {
  const fp = cleanAiSessionPath(session.id);
  if (!fp) throw new Error('Invalid session');
  fs.writeFileSync(fp, JSON.stringify(session, null, 2), 'utf8');
}

function cleanAiParseDataUrl(imageDataUrl) {
  const raw = String(imageDataUrl || '').trim();
  const m = raw.match(/^data:image\/(png|jpe?g|webp);base64,([a-z0-9+/=\s]+)$/i);
  if (!m) return null;
  const ext = String(m[1] || '').toLowerCase();
  const mime =
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const base64 = String(m[2] || '').replace(/\s+/g, '');
  if (!base64.length || base64.length > 12_000_000) return null;
  return { mime, base64, dataUrl: raw.length > 512_000 ? `data:${mime};base64,${base64}` : raw };
}

function cleanAiResolveFfmpegBin() {
  try {
    const p = require('ffmpeg-static');
    if (p && typeof p === 'string' && fs.existsSync(p)) return p;
  } catch (_) {
    /* optional package or wrong platform */
  }
  return 'ffmpeg';
}

function cleanAiExtractVideoFrames(videoPath, outDir) {
  const ffmpegBin = cleanAiResolveFfmpegBin();
  fs.mkdirSync(outDir, { recursive: true });
  const maxSec = Math.min(600, Math.max(5, parseInt(process.env.CLEANAI_VIDEO_MAX_SECONDS || '120', 10)));
  const maxFrames = Math.min(300, Math.max(10, parseInt(process.env.CLEANAI_VIDEO_MAX_FRAMES || '120', 10)));
  const vf = 'fps=1,scale=960:-1';
  const outPattern = path.join(outDir, 'frame-%04d.jpg');
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    videoPath,
    '-t',
    String(maxSec),
    '-vf',
    vf,
    '-frames:v',
    String(maxFrames),
    outPattern
  ];
  const r = spawnSync(ffmpegBin, args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true
  });
  if (r.status !== 0) {
    const errMsg = (r.stderr || r.stdout || '').trim().slice(-800) || `exit ${r.status}`;
    throw new Error(
      `Could not extract frames (${errMsg}). Install ffmpeg on the server or run \`npm install\` for ffmpeg-static.`
    );
  }
}

function cleanAiNormalizeIssues(rawIssues) {
  if (!Array.isArray(rawIssues)) return [];
  const out = [];
  for (const item of rawIssues.slice(0, 16)) {
    const label = String(item.label || item.issue || '').trim().slice(0, 120);
    if (!label) continue;
    let type = String(item.type || 'other').toLowerCase().replace(/\s+/g, '_');
    if (!CLEAN_AI_TYPES.has(type)) type = 'other';
    const nx = Number(item.x);
    const ny = Number(item.y);
    const nw = Number(item.w);
    const nh = Number(item.h);
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nw) || !Number.isFinite(nh)) continue;
    const x = Math.max(0, Math.min(1, nx));
    const y = Math.max(0, Math.min(1, ny));
    const w = Math.max(0.02, Math.min(1 - x, nw));
    const h = Math.max(0.02, Math.min(1 - y, nh));
    out.push({ label, type, x, y, w, h });
  }
  return out;
}

async function cleanAiVisionOpenAi(apiKey, imageDataUrlForApi, systemPrompt) {
  const model = process.env.CLEANAI_OPENAI_MODEL || 'gpt-4o-mini';
  const sys = systemPrompt || buildCleanAiSystemPrompt(readCleanAiConfig().lookFor);

  const r = await fetchFn('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: sys },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this camera frame for visible cleaning issues. Return JSON only.' },
            { type: 'image_url', image_url: { url: imageDataUrlForApi, detail: 'low' } }
          ]
        }
      ]
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `OpenAI request failed (${r.status})`);
  return String(j?.choices?.[0]?.message?.content || '').trim();
}

async function cleanAiVisionAnthropic(apiKey, mime, base64, systemPrompt) {
  const model =
    process.env.CLEANAI_ANTHROPIC_MODEL ||
    process.env.CURSORAI_ANTHROPIC_MODEL ||
    process.env.ANTHROPIC_ANALYZE_MODEL ||
    'claude-sonnet-4-5';
  const sys = systemPrompt || buildCleanAiSystemPrompt(readCleanAiConfig().lookFor);

  const r = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system: sys,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mime, data: base64 }
            },
            { type: 'text', text: 'Analyze this camera frame for visible cleaning issues. Return JSON only.' }
          ]
        }
      ]
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Anthropic request failed (${r.status})`);
  return (j.content || []).map((c) => c.text || '').join('').trim();
}

function cleanAiParseIssuesFromText(text) {
  const clean = String(text || '').replace(/```json|```/gi, '').trim();
  let parsed = null;
  try {
    parsed = JSON.parse(clean);
  } catch {
    const i = clean.indexOf('{');
    const k = clean.lastIndexOf('}');
    if (i >= 0 && k > i) {
      try {
        parsed = JSON.parse(clean.slice(i, k + 1));
      } catch {}
    }
  }
  const issues = cleanAiNormalizeIssues(parsed?.issues || parsed?.detections);
  return { issues };
}

async function cleanAiAnalyzeImage(provider, parsed, systemPrompt) {
  const openAiKey = String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
  const anthropicKey = String(process.env.ANTHROPIC_API_KEY || '').trim();

  async function parseOpenAi() {
    const text = await cleanAiVisionOpenAi(openAiKey, parsed.dataUrl, systemPrompt);
    return cleanAiParseIssuesFromText(text).issues || [];
  }
  async function parseAnthropic() {
    const text = await cleanAiVisionAnthropic(anthropicKey, parsed.mime, parsed.base64, systemPrompt);
    return cleanAiParseIssuesFromText(text).issues || [];
  }

  if (provider === 'openai') {
    if (!openAiKey) throw new Error('OPENAI_API_KEY not configured.');
    return parseOpenAi();
  }
  if (provider === 'claude') {
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured.');
    return parseAnthropic();
  }

  // Auto: OpenAI first; if it errors or finds zero issues, try Claude when a key exists (≤2 passes per frame).
  if (!openAiKey && !anthropicKey) {
    throw new Error('Configure OPENAI_API_KEY or ANTHROPIC_API_KEY.');
  }

  let fromOpenAi = [];

  if (openAiKey) {
    try {
      fromOpenAi = await parseOpenAi();
      if (fromOpenAi.length > 0 || !anthropicKey) return fromOpenAi;
    } catch (eOpen) {
      if (!anthropicKey) throw eOpen;
      // First pass failed → second pass with Claude
      return parseAnthropic();
    }
  }

  try {
    return await parseAnthropic();
  } catch (eAnth) {
    return fromOpenAi;
  }
}

function cleanAiAppendCapture(sessionId, issues, parsedProvider, meta) {
  const sess = readCleanAiSession(sessionId);
  if (!sess) throw new Error('Session not found');
  if (sess.stoppedAt) throw new Error('Session already ended');

  const at = new Date().toISOString();
  const sanitized = Array.isArray(issues) ? issues.map((it) => ({ ...it })) : [];

  sess.captures = Array.isArray(sess.captures) ? sess.captures : [];
  const cap = {
    at,
    provider: parsedProvider || sess.provider || 'auto',
    issueCount: sanitized.length,
    issues: sanitized
  };
  if (meta && typeof meta === 'object' && meta.videoSecond != null && Number.isFinite(Number(meta.videoSecond))) {
    cap.videoSecond = Math.max(0, Math.floor(Number(meta.videoSecond)));
  }
  sess.captures.push(cap);
  if (parsedProvider === 'openai' || parsedProvider === 'claude') {
    sess.provider = parsedProvider;
  }
  sess.updatedAt = at;
  writeCleanAiSession(sess);
  return sess;
}

/** Count issues in captures; by default excludes items marked dismissed on the report. */
function cleanAiCountIssuesInCaptures(captures, excludeDismissed = true) {
  let issueTouches = 0;
  const byType = {};
  for (const c of captures || []) {
    for (const issue of Array.isArray(c.issues) ? c.issues : []) {
      if (excludeDismissed && issue.dismissed) continue;
      issueTouches++;
      const t = String(issue.type || 'other').toLowerCase();
      byType[t] = (byType[t] || 0) + 1;
    }
  }
  return { issueTouches, byType };
}

function cleanAiListSessionsBrief() {
  let files = [];
  try {
    files = fs.readdirSync(cleanAiSessionsDir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const sessions = [];
  for (const f of files) {
    const fp = path.join(cleanAiSessionsDir, f);
    try {
      const s = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (!s || !s.id) continue;
      const caps = Array.isArray(s.captures) ? s.captures : [];
      const agg = cleanAiCountIssuesInCaptures(caps, true);
      const issueTouches = agg.issueTouches;
      const types = agg.byType;
      sessions.push({
        id: s.id,
        startedAt: s.startedAt || null,
        stoppedAt: s.stoppedAt || null,
        provider: s.provider || 'auto',
        captureCount: caps.length,
        issueOccurrencesTotal: issueTouches,
        issueTypesSeen: Object.keys(types).length
      });
    } catch {
      /* skip */
    }
  }
  sessions.sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
  return sessions;
}

function cleanAiGlobalStatsFromDisk() {
  const brief = cleanAiListSessionsBrief();
  const byType = {};
  let captures = 0;
  let issuesTotal = 0;
  let completed = 0;
  for (const row of brief) {
    const sess = readCleanAiSession(row.id);
    if (!sess || !Array.isArray(sess.captures)) continue;
    if (sess.stoppedAt) completed++;
    captures += sess.captures.length;
    const agg = cleanAiCountIssuesInCaptures(sess.captures, true);
    issuesTotal += agg.issueTouches;
    for (const [t, n] of Object.entries(agg.byType)) {
      byType[t] = (byType[t] || 0) + n;
    }
  }
  return {
    sessionCount: brief.length,
    completedSessionCount: completed,
    totalCaptures: captures,
    totalIssueOccurrences: issuesTotal,
    byType,
    checklistSize: readCleanAiConfig().lookFor.length
  };
}

app.get('/api/cleanai/config', (req, res) => {
  try {
    const c = readCleanAiConfig();
    return res.json({ lookFor: c.lookFor, updatedAt: c.updatedAt });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load config' });
  }
});

app.put('/api/cleanai/config', (req, res) => {
  try {
    const next = writeCleanAiConfig(req.body?.lookFor);
    return res.json({ ok: true, lookFor: next.lookFor, updatedAt: next.updatedAt });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to save config' });
  }
});

app.post('/api/cleanai/sessions/start', (req, res) => {
  try {
    const provider = String(req.body?.provider || 'auto').trim().toLowerCase();
    const id = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const sessProvider =
      provider === 'openai' ? 'openai' : provider === 'claude' ? 'claude' : provider === 'auto' ? 'auto' : 'auto';
    const session = {
      id,
      startedAt,
      stoppedAt: null,
      provider: sessProvider,
      captures: [],
      updatedAt: startedAt
    };
    writeCleanAiSession(session);
    return res.json({ ok: true, sessionId: id, startedAt });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to start session' });
  }
});

app.post('/api/cleanai/sessions/:sessionId/stop', (req, res) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim();
    const sess = readCleanAiSession(sessionId);
    if (!sess) return res.status(404).json({ error: 'Session not found' });
    const at = new Date().toISOString();
    sess.stoppedAt = sess.stoppedAt || at;
    sess.updatedAt = at;
    if (!sess.provider) sess.provider = 'auto';
    writeCleanAiSession(sess);

    const aggStop = cleanAiCountIssuesInCaptures(sess.captures, true);
    const issueTouches = aggStop.issueTouches;
    const byType = aggStop.byType;
    const timeline = [];
    for (const c of sess.captures || []) {
      if (Array.isArray(c.issues)) {
        for (const issue of c.issues) {
          if (issue.dismissed) continue;
          timeline.push({
            at: c.at,
            label: issue.label,
            type: issue.type || 'other'
          });
        }
      }
    }
    return res.json({
      ok: true,
      session: {
        id: sess.id,
        startedAt: sess.startedAt,
        stoppedAt: sess.stoppedAt,
        captureCount: (sess.captures || []).length,
        provider: sess.provider
      },
      summary: {
        issueOccurrences: issueTouches,
        byType
      },
      timeline,
      reportUrl: `/cleanai/report/${encodeURIComponent(sess.id)}`
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to stop session' });
  }
});

app.get('/api/cleanai/sessions', (req, res) => {
  try {
    return res.json({ ok: true, sessions: cleanAiListSessionsBrief() });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to list sessions' });
  }
});

app.get('/api/cleanai/sessions/:sessionId', (req, res) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim();
    const sess = readCleanAiSession(sessionId);
    if (!sess) return res.status(404).json({ error: 'Session not found' });

    const agg = cleanAiCountIssuesInCaptures(sess.captures, true);
    return res.json({
      ok: true,
      session: sess,
      summary: {
        captureCount: (sess.captures || []).length,
        issueOccurrences: agg.issueTouches,
        byType: agg.byType
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load session' });
  }
});

app.post('/api/cleanai/sessions/:sessionId/dismiss-issue', (req, res) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim();
    const captureAt = String(req.body?.captureAt || '').trim();
    const issueIndex = Number(req.body?.issueIndex);
    if (!captureAt) return res.status(400).json({ error: 'captureAt is required' });
    if (!Number.isInteger(issueIndex) || issueIndex < 0) {
      return res.status(400).json({ error: 'issueIndex must be a non-negative integer' });
    }
    const sess = readCleanAiSession(sessionId);
    if (!sess) return res.status(404).json({ error: 'Session not found' });
    const cap = (sess.captures || []).find((c) => c.at === captureAt);
    if (!cap || !Array.isArray(cap.issues) || issueIndex >= cap.issues.length) {
      return res.status(404).json({ error: 'Capture or issue not found' });
    }
    cap.issues[issueIndex] = { ...cap.issues[issueIndex], dismissed: true };
    cap.issueCount = cap.issues.filter((x) => !x.dismissed).length;
    sess.updatedAt = new Date().toISOString();
    writeCleanAiSession(sess);
    const agg = cleanAiCountIssuesInCaptures(sess.captures, true);
    return res.json({
      ok: true,
      summary: {
        captureCount: (sess.captures || []).length,
        issueOccurrences: agg.issueTouches,
        byType: agg.byType
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Dismiss failed' });
  }
});

app.get('/api/cleanai/stats', (req, res) => {
  try {
    return res.json({ ok: true, stats: cleanAiGlobalStatsFromDisk() });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load stats' });
  }
});

app.post('/api/cleanai/analyze', async (req, res) => {
  try {
    const imageDataUrl =
      typeof req.body?.image === 'string' ? req.body.image.trim() : typeof req.body?.imageDataUrl === 'string'
        ? req.body.imageDataUrl.trim()
        : '';
    const provider = String(req.body?.provider || 'auto').trim().toLowerCase();
    const sessionIdRaw = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    if (!imageDataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'image must be a data URL (JPEG/PNG/WebP base64).' });
    }
    const parsed = cleanAiParseDataUrl(imageDataUrl);
    if (!parsed) return res.status(400).json({ error: 'Invalid or oversized image payload.' });

    const cfg = readCleanAiConfig();
    const systemPrompt = buildCleanAiSystemPrompt(cfg.lookFor);
    let issues = await cleanAiAnalyzeImage(provider, parsed, systemPrompt);

    let loggedToSession = false;
    if (sessionIdRaw) {
      const sessBefore = readCleanAiSession(sessionIdRaw);
      if (!sessBefore) {
        return res.status(404).json({ error: 'Invalid or unknown session id' });
      }
      if (sessBefore.stoppedAt) {
        return res.status(410).json({ error: 'Session already ended — start a new scan.' });
      }
      cleanAiAppendCapture(sessionIdRaw, issues, provider);
      loggedToSession = true;
    }

    return res.json({ ok: true, issues, sessionId: sessionIdRaw || null, logged: loggedToSession });
  } catch (error) {
    console.error('/api/cleanai/analyze error:', error);
    return res.status(500).json({ error: error.message || 'Analysis failed' });
  }
});

app.post(
  '/api/cleanai/analyze-video',
  (req, res, next) => {
    cleanAiVideoUpload.single('video')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: `Video too large (max ${CLEANAI_VIDEO_MAX_UPLOAD_MB} MB).` });
        }
        return res.status(400).json({ error: err.message || 'Upload failed' });
      }
      next();
    });
  },
  async (req, res) => {
    const videoPath = req.file?.path;
    if (!videoPath || !fs.existsSync(videoPath)) {
      return res.status(400).json({ error: 'Missing video file (field name: video).' });
    }

    const providerRaw = String(req.body?.provider || 'auto').trim().toLowerCase();
    const sessProvider =
      providerRaw === 'openai' ? 'openai' : providerRaw === 'claude' ? 'claude' : 'auto';

    const framesDir = path.join(cleanAiVideoTempDir, `frames-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`);
    let sessionId = null;

    try {
      cleanAiExtractVideoFrames(videoPath, framesDir);
      const files = fs
        .readdirSync(framesDir)
        .filter((f) => /\.jpe?g$/i.test(f))
        .sort();

      if (!files.length) {
        throw new Error('No frames extracted — unsupported or empty video.');
      }

      sessionId = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      const session = {
        id: sessionId,
        startedAt,
        stoppedAt: null,
        provider: sessProvider,
        source: 'video',
        videoOriginalName: String(req.file.originalname || '').slice(0, 240) || null,
        captures: [],
        updatedAt: startedAt
      };
      writeCleanAiSession(session);

      const cfg = readCleanAiConfig();
      const systemPrompt = buildCleanAiSystemPrompt(cfg.lookFor);

      let sec = 0;
      for (const f of files) {
        const fp = path.join(framesDir, f);
        const buf = fs.readFileSync(fp);
        const dataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
        const parsed = cleanAiParseDataUrl(dataUrl);
        if (!parsed) {
          sec += 1;
          continue;
        }
        const issues = await cleanAiAnalyzeImage(sessProvider, parsed, systemPrompt);
        cleanAiAppendCapture(sessionId, issues, sessProvider === 'auto' ? undefined : sessProvider, {
          videoSecond: sec
        });
        sec += 1;
      }

      const sess = readCleanAiSession(sessionId);
      if (sess) {
        const at = new Date().toISOString();
        sess.stoppedAt = at;
        sess.updatedAt = at;
        writeCleanAiSession(sess);
      }

      const done = readCleanAiSession(sessionId);
      const agg = cleanAiCountIssuesInCaptures(done?.captures || [], true);

      return res.json({
        ok: true,
        sessionId,
        frameCount: files.length,
        analyzedFrames: (done?.captures || []).length,
        summary: {
          issueOccurrences: agg.issueTouches,
          byType: agg.byType
        },
        reportUrl: `/cleanai/report/${encodeURIComponent(sessionId)}`
      });
    } catch (error) {
      if (sessionId) {
        try {
          const s = readCleanAiSession(sessionId);
          if (s && !s.stoppedAt) {
            const at = new Date().toISOString();
            s.stoppedAt = at;
            s.updatedAt = at;
            writeCleanAiSession(s);
          }
        } catch (_) {
          /* ignore */
        }
      }
      console.error('/api/cleanai/analyze-video error:', error);
      return res.status(500).json({ error: error.message || 'Video analysis failed' });
    } finally {
      try {
        fs.rmSync(framesDir, { recursive: true, force: true });
      } catch (_) {
        /* ignore */
      }
      try {
        fs.unlinkSync(videoPath);
      } catch (_) {
        /* ignore */
      }
    }
  }
);

// ── Marketing Manager API (customers + tasks); file path: marketingManagerPath (see boot logs) ──

const MM_DIRECTORY_USA = [
  ['Apple Business Connect', 'https://businessconnect.apple.com/'],
  ['Yelp', 'https://www.yelp.com/'],
  ['Yellow Pages', 'https://www.yellowpages.com/'],
  ['Manta', 'https://www.manta.com/'],
  ['Hotfrog', 'https://www.hotfrog.com/'],
  ['Superpages', 'https://www.superpages.com/'],
  ['Citysearch', 'https://www.citysearch.com/'],
  ['Foursquare', 'https://foursquare.com/'],
  ['Bing Places for Business', 'https://www.bingplaces.com/'],
  ['Chamber of Commerce', 'https://www.chamberofcommerce.com/'],
  ['Better Business Bureau (BBB)', 'https://www.bbb.org/'],
  ['MerchantCircle', 'https://www.merchantcircle.com/'],
  ['Alignable', 'https://www.alignable.com/'],
  ['Local.com', 'https://www.local.com/'],
  ['EZLocal', 'https://www.ezlocal.com/'],
  ['MapQuest', 'https://www.mapquest.com/'],
  ['USCity.net', 'https://www.uscity.net/'],
  ['Factual', 'https://www.factual.com/'],
  ['Brownbook', 'https://www.brownbook.net/'],
  ['AOL Local', 'https://local.aol.com/'],
  ['Nextdoor', 'https://nextdoor.com/'],
  ['LocalStack', 'https://www.localstack.com/'],
  ['CitySquares', 'https://www.citysquares.com/'],
  ['ShowMeLocal', 'https://www.showmelocal.com/'],
  ['Business Directory USA', 'https://www.businessdirectoryusa.com/'],
  ['IndieBiz', 'https://www.indiebiz.com/'],
  ['LocalDatabase', 'https://www.localdatabase.com/'],
  ['Facebook Marketplace', 'https://www.facebook.com/help/1889067784738765/']
];
const MM_DIRECTORY_PAID = [
  ['Bark', 'https://www.bark.com/en/us/'],
  ['Thumbtack', 'https://www.thumbtack.com/'],
  ['Kompass', 'https://us.kompass.com/'],
  ['JustLuxe', 'https://www.justluxe.com/'],
  ['Spoke', 'https://www.spoke.com/']
];

const MM_CAMPAIGN_PRESETS = [
  {
    key: 'brand_positioning',
    title: 'Brand Positioning & Messaging',
    description: ''
  },
  {
    key: 'target_audience',
    title: 'Target Audience Identification',
    description:
      'Clearly define your ideal customer—age, location, income, interests, buying habits, and pain points.'
  },
  {
    key: 'website_landing',
    title: 'Website & Landing Page Optimization',
    description:
      'Make sure your website loads fast, looks professional, works on mobile, and converts visitors into leads or sales.'
  },
  {
    key: 'local_seo_gbp',
    title: 'Local SEO & Google Business Profile',
    description:
      'Optimize for local searches so people can find you on Google, Maps, and nearby searches like “best patio store near me.”'
  },
  {
    key: 'content_strategy',
    title: 'Content Creation Strategy',
    description:
      'Plan blogs, videos, reels, before/after photos, FAQs, and educational content that builds trust and authority.'
  },
  {
    key: 'social_media',
    title: 'Social Media Presence',
    description:
      'Choose the right platforms (like Facebook, Instagram, TikTok, LinkedIn) and stay consistent instead of trying to be famous everywhere.'
  },
  {
    key: 'paid_ads',
    title: 'Paid Advertising Strategy',
    description:
      'Plan ad campaigns using Google Ads, Meta Ads, YouTube, etc., with clear budgets and measurable goals.'
  },
  {
    key: 'lead_capture',
    title: 'Lead Capture & Follow-Up System',
    description:
      'Build forms, calls-to-action, email capture, SMS follow-up, and CRM processes so leads don’t vanish into the marketing Bermuda Triangle.'
  },
  {
    key: 'reputation',
    title: 'Reputation Management & Reviews',
    description:
      'Generate and manage reviews on Google, Yelp, and other directories to build trust and improve rankings.'
  },
  {
    key: 'reporting',
    title: 'Reporting, Analytics & Optimization',
    description:
      'Track what works using Google Analytics, ad reporting, call tracking, and conversion data—because guessing is not a growth strategy.'
  }
];

const MM_TASK_TEMPLATES = [
  {
    key: 'directory_rollout_usa',
    title: 'Directory rollout (USA) — one task per site',
    description:
      'Creates one task per directory site with rollout guidance (spread submissions over months, every few days).'
  }
];

function mmBuildDirectorySiteTask(siteName, siteUrl, nowIso) {
  const cadence =
    'Rollout plan: submit this listing gradually as part of a multi-month cadence (create/refresh a few listings each week, not all at once).';
  const checklistGuide = [
    '- Confirm business name/address/phone consistency',
    '- Submit listing profile',
    '- Save account/login details',
    '- Add proof URL or screenshot note',
    '- Mark task status to Completed when live'
  ].join('\n');
  return {
    id: mmNewId('task'),
    kind: 'campaign',
    campaignKey: 'directory_site_rollout',
    title: `Directory listing: ${siteName}`,
    description: `${cadence}\n\nDirectory: ${siteName}\nURL: ${siteUrl}\n\nExecution checklist:\n${checklistGuide}\n\nComments:\n- Not started`,
    status: 'not_started',
    notes: '',
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

function readMarketingManagerState() {
  try {
    if (!fs.existsSync(marketingManagerPath)) return { customers: [] };
    const raw = fs.readFileSync(marketingManagerPath, 'utf8');
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || !Array.isArray(p.customers)) return { customers: [] };
    return p;
  } catch (error) {
    console.error('readMarketingManagerState:', error.message);
    return { customers: [] };
  }
}

function writeMarketingManagerState(state) {
  const dir = path.dirname(marketingManagerPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(marketingManagerPath, JSON.stringify(state, null, 2), 'utf8');
}

const marketingManagerContractsPath = path.join(marketingManagerDataDir, 'marketing-contracts.json');
const marketingManagerContractDocsDir = path.join(marketingManagerDataDir, 'contracts');
if (!fs.existsSync(marketingManagerContractDocsDir)) {
  fs.mkdirSync(marketingManagerContractDocsDir, { recursive: true });
}
const marketingManagerSignedDocsDir = path.join(marketingManagerContractDocsDir, 'signed');
if (!fs.existsSync(marketingManagerSignedDocsDir)) {
  fs.mkdirSync(marketingManagerSignedDocsDir, { recursive: true });
}

const marketingManagerAgentSignaturePath = path.join(marketingManagerDataDir, 'agent-signature.json');

const mmAllowedContractExt = new Set(['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg']);
const marketingContractsUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, marketingManagerContractDocsDir),
    filename: (req, file, cb) => {
      const safeName = String(file.originalname || 'document')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 180);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`);
    }
  }),
  limits: { fileSize: 1024 * 1024 * 25 }, // 25MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(String(file.originalname || '').toLowerCase());
    if (!mmAllowedContractExt.has(ext)) {
      cb(new Error('Unsupported file type. Use PDF, DOC, DOCX, TXT, PNG, JPG, or JPEG.'));
      return;
    }
    cb(null, true);
  }
});

const marketingCustomerLogoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, marketingManagerLogosDir),
    filename: (req, file, cb) => {
      const ext = path.extname(String(file.originalname || '').toLowerCase()) || '.png';
      const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext) ? ext : '.png';
      cb(null, `cust-logo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
    }
  }),
  limits: { fileSize: 1024 * 1024 * 8 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\//i.test(String(file.mimetype || ''));
    if (!ok) return cb(new Error('Logo must be an image file'));
    cb(null, true);
  }
});

function readMarketingContracts() {
  try {
    if (!fs.existsSync(marketingManagerContractsPath)) return { contracts: [] };
    const raw = fs.readFileSync(marketingManagerContractsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.contracts)) return { contracts: [] };
    return parsed;
  } catch (error) {
    console.error('readMarketingContracts:', error.message);
    return { contracts: [] };
  }
}

function writeMarketingContracts(data) {
  const dir = path.dirname(marketingManagerContractsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(marketingManagerContractsPath, JSON.stringify(data, null, 2), 'utf8');
}

function mmValidSignatureDataUrl(value) {
  const s = String(value || '');
  return /^data:image\/(?:png|jpe?g);base64,[a-z0-9+/=\s]+$/i.test(s) && s.length <= 4_000_000;
}

function mmContractView(c, customerName) {
  const signedDocPath =
    c.status === 'signed' && (c.signedPdfPath || c.signedTextPath)
      ? `/api/marketing-manager/contracts/${c.id}/signed-document`
      : '';
  return {
    id: c.id,
    customerId: c.customerId,
    customerName: customerName || 'Customer',
    title: c.title,
    body: c.body || '',
    bodyHtml: c.bodyHtml || '',
    status: c.status || 'pending',
    createdAt: c.createdAt,
    signedAt: c.signedAt || null,
    signerName: c.signerName || '',
    signDate: c.signDate || '',
    signPath: `/marketing-manager/sign/${c.token}`,
    hasDocument: Boolean(c.filePath),
    documentName: c.originalName || '',
    documentPath: c.filePath ? `/api/marketing-manager/contracts/${c.id}/document` : '',
    signedDocumentPath: signedDocPath,
    includeAgentSignature: Boolean(c.includeAgentSignature),
    agentSignatureDate: c.agentSignatureDate || '',
    agentName: c.agentName || ''
  };
}

function mmSanitizeAgentName(value) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function readMarketingAgentSignature() {
  try {
    if (!fs.existsSync(marketingManagerAgentSignaturePath)) return null;
    const raw = fs.readFileSync(marketingManagerAgentSignaturePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    const signatureDataUrl = String(data.signatureDataUrl || '').trim();
    if (!signatureDataUrl || !mmValidSignatureDataUrl(signatureDataUrl)) return null;
    return {
      signatureDataUrl,
      agentName: mmSanitizeAgentName(data.agentName),
      updatedAt: data.updatedAt || null
    };
  } catch {
    return null;
  }
}

function writeMarketingAgentSignature(signatureDataUrl, agentName) {
  const dir = path.dirname(marketingManagerAgentSignaturePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const payload = {
    signatureDataUrl: String(signatureDataUrl || '').trim(),
    agentName: mmSanitizeAgentName(agentName),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(marketingManagerAgentSignaturePath, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

/** Appends Agency block after client section; dateStr is YYYY-MM-DD (document generation date). */
function mmAppendAgentSignatureBlocks(bodyText, bodyHtml, signatureDataUrl, dateStr, agentName) {
  const safeDate = String(dateStr || '').trim();
  const safeName = mmSanitizeAgentName(agentName);
  const namedTextLine = safeName ? `\nName: ${safeName}` : '';
  const textAppend = `\n\n---\nAgency representative (LAB007)\nDate: ${safeDate}\nAgent Signature:\n${namedTextLine ? `${namedTextLine}\n` : ''}`;
  const escSrc = String(signatureDataUrl || '').replace(/"/g, '&quot;');
  const namedHtmlLine = safeName
    ? `<p style="margin-top:4px;"><strong>Name:</strong> ${mmEscapeHtml(safeName)}</p>`
    : '';
  const htmlAppend = `<hr />
<p><strong>Agency representative (LAB007)</strong></p>
<p><strong>Date:</strong> ${mmEscapeHtml(safeDate)}</p>
<p><strong>Agent Signature:</strong></p>
<p><img alt="Agent signature" src="${escSrc}" style="max-height:96px;max-width:320px;border:1px solid rgba(0,0,0,0.12);border-radius:6px;background:#fff;" /></p>
${namedHtmlLine}`;
  return {
    body: String(bodyText || '') + textAppend,
    bodyHtml: String(bodyHtml || '') + htmlAppend
  };
}

function mmCreateOriginalContractPdf(contract) {
  const outputPath = path.join(marketingManagerContractDocsDir, `${contract.id}-original.pdf`);
  const body = String(contract.body || '').trim();
  const title = String(contract.title || 'Contract');
  const text = `${title}\n\n${body}`;
  const agentSig = String(contract._agentSigForPdf || '').trim();
  const agentName = String(contract._agentNameForPdf || contract.agentName || '').trim();
  try {
    // Node-native fallback so created-doc workflow always has an original PDF.
    fs.writeFileSync(outputPath, mmBuildSignedContractPdfFromText(text, agentSig, agentName));
    if (!fs.existsSync(outputPath)) return null;
    return outputPath;
  } catch (err) {
    console.warn('[Marketing Manager] Original PDF build failed:', err.message);
    return null;
  }
}

async function mmNotifyContractSigned(contract, customerName) {
  if (!emailTransporter) {
    console.warn('[Marketing Manager] Signed contract email skipped: email transporter not configured');
    return;
  }
  const notifyTo = String(
    process.env.MARKETING_MANAGER_SIGN_NOTIFY_EMAIL ||
      process.env.MY_EMAIL_ADDRESS ||
      process.env.SMTP_USER ||
      ''
  ).trim();
  if (!notifyTo) {
    console.warn('[Marketing Manager] Signed contract email skipped: no recipient configured');
    return;
  }
  const safeTitle = String(contract.title || 'contract').replace(/[^a-zA-Z0-9_-]+/g, '_');
  const signedPdf =
    contract.signedPdfPath && fs.existsSync(contract.signedPdfPath)
      ? fs.readFileSync(contract.signedPdfPath)
      : mmBuildSignedContractPdf(contract, customerName);

  const fromAddr = process.env.SMTP_USER || 'noreply@lab007.ai';
  await emailTransporter.sendMail({
    from: fromAddr,
    to: notifyTo,
    subject: `Contract signed: ${contract.title || 'Untitled contract'}`,
    text: [
      'A customer has signed a Marketing Manager contract.',
      '',
      `Customer: ${customerName || 'Customer'}`,
      `Contract: ${contract.title || 'Untitled contract'}`,
      `Signed by: ${contract.signerName || 'Unknown signer'}`,
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

function mmValidEmail(value) {
  const s = String(value || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function mmBuildSignedContractText(contract, customerName) {
  const lines = [
    'LAB007 - Signed Contract Copy',
    '========================================',
    `Customer: ${customerName || 'Customer'}`,
    `Contract: ${contract.title || 'Untitled contract'}`,
    `Status: ${contract.status || 'pending'}`,
    `Signer full name: ${contract.signerName || ''}`,
    `Date entered: ${contract.signDate || ''}`,
    `Signed at: ${contract.signedAt || ''}`,
    '',
    'Contract terms:',
    '----------------------------------------',
    String(contract.body || '').trim() || '(No body text)'
  ];
  return lines.join('\n');
}

function mmEscapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mmEnsureSignatureSection(bodyText) {
  const source = String(bodyText || '').trim();
  const hasSignature = /\bsignature\b/i.test(source);
  const hasDate = /\bdate\b/i.test(source);
  const hasName = /\bprinted\s+name\b|\bname\s*[:\-]/i.test(source);
  if (hasSignature && hasDate && hasName) return source;
  const out = source ? `${source}\n\n` : '';
  return (
    out +
    [
      '---',
      'Client Acceptance and Signature',
      '',
      '',
      'Printed Name:',
      '',
      '',
      'Client Signature:',
      '',
      '',
      'Date:'
    ].join('\n')
  );
}

function mmPlainTextToHtml(text) {
  const lines = String(text || '').split(/\r?\n/);
  return lines.map((line) => (line.trim() ? `<p>${mmEscapeHtml(line)}</p>` : '<p><br /></p>')).join('');
}

function mmHtmlToPlainText(html) {
  return String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mmEnsureSignatureSectionHtml(bodyHtml) {
  const source = String(bodyHtml || '').trim();
  const textProbe = mmHtmlToPlainText(source);
  const hasSignature = /\bsignature\b/i.test(textProbe);
  const hasDate = /\bdate\b/i.test(textProbe);
  const hasName = /\bprinted\s+name\b|\bname\s*[:\-]/i.test(textProbe);
  if (hasSignature && hasDate && hasName) return source;
  return (
    (source ? `${source}\n` : '') +
    `<hr />
<p><strong>Client Acceptance and Signature</strong></p>
<p><br /></p>
<p><strong>Printed Name:</strong></p>
<p><br /></p>
<p><strong>Client Signature:</strong></p>
<p><br /></p>
<p><strong>Date:</strong></p>`
  );
}

function mmInjectSignatureIntoHtml(templateHtml, contract) {
  const signer = mmEscapeHtml(String(contract.signerName || '').trim());
  const signDate = mmEscapeHtml(String(contract.signDate || '').trim());
  let out = String(templateHtml || '');
  out = out.replace(/\{\{\s*SIGNATURE_NAME\s*\}\}/gi, signer);
  out = out.replace(/\{\{\s*PRINTED_NAME\s*\}\}/gi, signer);
  out = out.replace(/\{\{\s*SIGNATURE\s*\}\}/gi, signer);
  out = out.replace(/\{\{\s*DATE\s*\}\}/gi, signDate);
  // If lines contain placeholders/underscores, replace the full value cleanly.
  out = out.replace(
    /(<strong>\s*Printed\s+Name\s*:\s*<\/strong>\s*)(?:_+|\.{2,}|&nbsp;|\s)*(?:[^<]*)/gi,
    `$1${signer}`
  );
  out = out.replace(
    /(<strong>\s*Client\s+Signature\s*:\s*<\/strong>\s*)(?:_+|\.{2,}|&nbsp;|\s)*(?:[^<]*)/gi,
    `$1${signer}`
  );
  out = out.replace(
    /(<strong>\s*Date\s*:\s*<\/strong>\s*)(?:_+|\.{2,}|&nbsp;|\s)*(?:[^<]*)/gi,
    `$1${signDate}`
  );
  return out;
}

function mmInjectSignatureIntoText(templateText, contract) {
  const signer = String(contract.signerName || '').trim();
  const signDate = String(contract.signDate || '').trim();
  let out = String(templateText || '');
  out = out.replace(/\{\{\s*SIGNATURE_NAME\s*\}\}/gi, signer);
  out = out.replace(/\{\{\s*PRINTED_NAME\s*\}\}/gi, signer);
  out = out.replace(/\{\{\s*SIGNATURE\s*\}\}/gi, signer);
  out = out.replace(/\{\{\s*DATE\s*\}\}/gi, signDate);
  // Replace full line values to remove underscores/placeholders completely.
  out = out.replace(/^(\s*(?:client\s+)?signature\s*[:\-]\s*).*$/gim, `$1${signer}`);
  out = out.replace(/^(\s*date\s*[:\-]\s*).*$/gim, `$1${signDate}`);
  out = out.replace(/^(\s*(?:printed\s+)?name\s*[:\-]\s*).*$/gim, `$1${signer}`);
  return out;
}

function mmPdfEscape(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function mmBuildSignedContractPdf(contract, customerName) {
  const rawLines = mmBuildSignedContractText(contract, customerName).split('\n');
  const lines = [];
  rawLines.forEach((line) => {
    const s = String(line || '');
    if (s.length <= 100) lines.push(s);
    else {
      for (let i = 0; i < s.length; i += 100) lines.push(s.slice(i, i + 100));
    }
  });
  const maxLines = 60;
  const finalLines = lines.slice(0, maxLines);
  if (lines.length > maxLines) finalLines.push('... truncated ...');

  const contentRows = ['BT', '/F1 11 Tf', '50 760 Td', '14 TL'];
  finalLines.forEach((line, idx) => {
    const t = `(${mmPdfEscape(line)}) Tj`;
    if (idx === 0) contentRows.push(t);
    else contentRows.push(`T* ${t}`);
  });
  contentRows.push('ET');
  const stream = contentRows.join('\n');

  const objects = [];
  const addObj = (txt) => objects.push(txt);
  addObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  addObj('2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n');
  addObj(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n'
  );
  addObj('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  addObj(`5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`);

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

function mmParseSignatureDataUrl(dataUrl) {
  const s = String(dataUrl || '');
  const m = s.match(/^data:image\/(png|jpe?g);base64,([a-z0-9+/=\s]+)$/i);
  if (!m) return null;
  const fmt = m[1].toLowerCase();
  const mime = fmt === 'jpg' ? 'image/jpeg' : `image/${fmt}`;
  const b64 = m[2].replace(/\s+/g, '');
  return { mime, buffer: Buffer.from(b64, 'base64') };
}

function mmGetJpegDimensions(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return null;
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xda || marker === 0xd9) break; // SOS/EOI
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

function mmBuildSignedContractPdfFromText(textBody, signatureDataUrl, agentName) {
  const rawLines = String(textBody || '').split('\n');
  const lines = [];
  rawLines.forEach((line) => {
    const s = String(line || '');
    if (s.length <= 100) lines.push(s);
    else {
      for (let i = 0; i < s.length; i += 100) lines.push(s.slice(i, i + 100));
    }
  });
  // Keep much more content in fallback PDFs to avoid apparent truncation.
  const maxLines = 220;
  const finalLines = lines.slice(0, maxLines);
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

  const parsedSig = mmParseSignatureDataUrl(signatureDataUrl);
  const jpegSig = parsedSig && parsedSig.mime === 'image/jpeg' ? parsedSig : null;
  const jpegDims = jpegSig ? mmGetJpegDimensions(jpegSig.buffer) : null;
  const drawSignature = Boolean(jpegSig && jpegDims);
  const safeAgentName = String(agentName || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

  const contentRows = ['BT', '/F1 11 Tf', '50 760 Td', '14 TL'];
  finalLines.forEach((line, idx) => {
    const t = `(${mmPdfEscape(line)}) Tj`;
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
      contentRows.push(`(${mmPdfEscape(`Name: ${safeAgentName}`)}) Tj`);
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

/** Resolves a Python interpreter that can import PyMuPDF (fitz), with install/venv fallback. */
function mmEffectivePythonForMarketingPdf() {
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
      console.warn(
        '[Marketing Manager] Could not auto-install PyMuPDF:',
        pyInstall.stderr || pyInstall.stdout || pyInstall.status
      );
      const venvDir = path.join(marketingManagerDataDir, 'pyenv');
      const venvPy =
        process.platform === 'win32'
          ? path.join(venvDir, 'Scripts', 'python.exe')
          : path.join(venvDir, 'bin', 'python');
      if (!fs.existsSync(venvPy)) {
        const mkVenv = spawnSync(pyBin, ['-m', 'venv', venvDir], { encoding: 'utf8' });
        if (mkVenv.status !== 0) {
          console.warn('[Marketing Manager] Could not create Python venv:', mkVenv.stderr || mkVenv.stdout || mkVenv.status);
        }
      }
      if (fs.existsSync(venvPy)) {
        spawnSync(venvPy, ['-m', 'ensurepip', '--upgrade'], { encoding: 'utf8' });
        const venvInstall = spawnSync(venvPy, ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'], {
          encoding: 'utf8'
        });
        if (venvInstall.status !== 0) {
          console.warn('[Marketing Manager] venv bootstrap warning:', venvInstall.stderr || venvInstall.stdout || venvInstall.status);
        }
        const venvPyMuPdf = spawnSync(venvPy, ['-m', 'pip', 'install', 'pymupdf'], { encoding: 'utf8' });
        if (venvPyMuPdf.status !== 0) {
          console.warn('[Marketing Manager] venv PyMuPDF install failed:', venvPyMuPdf.stderr || venvPyMuPdf.stdout || venvPyMuPdf.status);
        } else {
          effectivePy = venvPy;
        }
      }
    }
    pyCheck = spawnSync(effectivePy, ['-c', 'import fitz'], { encoding: 'utf8' });
    if (pyCheck.status !== 0) {
      console.warn('[Marketing Manager] Python fitz module still unavailable:', pyCheck.stderr || pyCheck.stdout);
    }
  }
  return effectivePy;
}

/** Appends a new page with Agency (LAB007) signature at end of PDF; leaves existing pages unchanged. */
function mmStampAgentPageOnPdf(inputPath, outputPath, agentImagePath, dateStr, agentName) {
  try {
    const stampScript = path.join(__dirname, 'lib', 'pdf_stamp_agent.py');
    const effectivePy = mmEffectivePythonForMarketingPdf();
    const args = [
      stampScript,
      '--input',
      inputPath,
      '--output',
      outputPath,
      '--signature',
      agentImagePath,
      '--date',
      String(dateStr || '')
    ];
    const safeName = String(agentName || '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
    if (safeName) {
      args.push('--name', safeName);
    }
    const py = spawnSync(effectivePy, args, { encoding: 'utf8' });
    if (py.status !== 0 || !fs.existsSync(outputPath)) {
      console.warn('[Marketing Manager] Agent PDF stamp failed:', py.stderr || py.stdout || py.status);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[Marketing Manager] Agent PDF stamp error:', error.message);
    return false;
  }
}

function mmTryStampOriginalPdf(contract, signedPdfPath) {
  try {
    if (!contract.filePath || !fs.existsSync(contract.filePath)) return false;
    const ext = path.extname(String(contract.originalName || contract.filePath).toLowerCase());
    if (ext !== '.pdf') return false;
    const sig = mmParseSignatureDataUrl(contract.signatureDataUrl || '');
    if (!sig || !sig.buffer || !sig.buffer.length) return false;
    const sigExt = sig.mime === 'image/jpeg' ? 'jpg' : 'png';
    const tmpSigPath = path.join(marketingManagerSignedDocsDir, `${contract.id}-sig.${sigExt}`);
    fs.writeFileSync(tmpSigPath, sig.buffer);
    const signerScript = path.join(__dirname, 'lib', 'pdf_signer.py');
    const effectivePy = mmEffectivePythonForMarketingPdf();
    const py = spawnSync(
      effectivePy,
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
        String(contract.signDate || '')
      ],
      { encoding: 'utf8' }
    );
    try {
      if (fs.existsSync(tmpSigPath)) fs.unlinkSync(tmpSigPath);
    } catch {}
    if (py.status !== 0 || !fs.existsSync(signedPdfPath)) {
      console.warn('[Marketing Manager] PDF signature stamping failed:', py.stderr || py.stdout || py.status);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[Marketing Manager] PDF signature stamping error:', error.message);
    return false;
  }
}

function mmCreateSignedArtifacts(contract, customerName) {
  const baseText = (() => {
    const ext = path.extname(String(contract.originalName || '').toLowerCase());
    if (ext === '.txt' && contract.filePath && fs.existsSync(contract.filePath)) {
      try {
        return mmEnsureSignatureSection(fs.readFileSync(contract.filePath, 'utf8'));
      } catch {
        return mmEnsureSignatureSection(contract.body || '');
      }
    }
    return mmEnsureSignatureSection(contract.body || '');
  })();
  const injected = mmInjectSignatureIntoText(baseText, contract);
  const baseHtml = mmEnsureSignatureSectionHtml(contract.bodyHtml || mmPlainTextToHtml(baseText));
  const injectedHtml = mmInjectSignatureIntoHtml(baseHtml, contract);
  const signedTxt = [
    injected.trim(),
    '',
    '---',
    `Signed by: ${contract.signerName || ''}`,
    `Date: ${contract.signDate || ''}`,
    `Signed at: ${contract.signedAt || ''}`,
    `Customer: ${customerName || 'Customer'}`
  ].join('\n');
  const signedTextPath = path.join(marketingManagerSignedDocsDir, `${contract.id}-signed.txt`);
  fs.writeFileSync(signedTextPath, signedTxt, 'utf8');
  // keep html body for fallback view compatibility only
  const signedHtmlPath = path.join(marketingManagerSignedDocsDir, `${contract.id}-signed.html`);
  fs.writeFileSync(signedHtmlPath, `<div>${injectedHtml}</div>`, 'utf8');
  const signedPdfPath = path.join(marketingManagerSignedDocsDir, `${contract.id}-signed.pdf`);
  const hasOriginalPdf =
    Boolean(contract.filePath) &&
    fs.existsSync(contract.filePath) &&
    path.extname(String(contract.originalName || contract.filePath).toLowerCase()) === '.pdf';
  if (hasOriginalPdf) {
    const stamped = mmTryStampOriginalPdf(contract, signedPdfPath);
    if (!stamped) {
      throw new Error('Could not stamp original PDF with signature. Please verify PDF signer dependencies.');
    }
  } else {
    fs.writeFileSync(
      signedPdfPath,
      mmBuildSignedContractPdfFromText(signedTxt, contract.signatureDataUrl)
    );
  }
  contract.signedTextPath = signedTextPath;
  contract.signedHtmlPath = signedHtmlPath;
  contract.signedPdfPath = signedPdfPath;
}

async function mmSendSignedCopyByEmail(contract, customerName, toEmail) {
  if (!emailTransporter) throw new Error('Email service is not configured');
  if (!mmValidEmail(toEmail)) throw new Error('Valid email address is required');
  if ((contract.status || 'pending') !== 'signed') throw new Error('Contract is not signed yet');
  const fromAddr = process.env.SMTP_USER || 'noreply@lab007.ai';
  const txt =
    contract.signedTextPath && fs.existsSync(contract.signedTextPath)
      ? fs.readFileSync(contract.signedTextPath, 'utf8')
      : mmBuildSignedContractText(contract, customerName);
  const pdf =
    contract.signedPdfPath && fs.existsSync(contract.signedPdfPath)
      ? fs.readFileSync(contract.signedPdfPath)
      : mmBuildSignedContractPdf(contract, customerName);
  const safeTitle = String(contract.title || 'contract').replace(/[^a-zA-Z0-9_-]+/g, '_');
  await emailTransporter.sendMail({
    from: fromAddr,
    to: toEmail,
    subject: `Signed contract copy: ${contract.title || 'Contract'}`,
    text: `Attached is the signed contract copy for ${customerName || 'Customer'}.`,
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

function mmNewId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Client onboarding checklist — titles + instructional copy for CRM + PDF. */
function mmOnboardingChecklistDefs() {
  return [
    {
      id: 'onb_site',
      title: 'Website logon',
      instructions: [
        'Goal: LAB007 can update your live site (or staging), fix issues, add pages, or connect tracking without waiting on passwords every time.',
        'What to share:',
        '- Admin URL for your CMS (e.g. WordPress /wp-admin, Squarespace Settings, Shopify admin, Webflow Designer, etc.).',
        '- A dedicated user for LAB007 (recommended) OR your existing admin — with Administrator / Owner role where applicable.',
        'How to create a user (typical CMS): Log in → Users / Team → Add user → enter the email address your LAB007 contact gives you → set role to Administrator → send invite or set a temporary password and share securely (password manager or one-time link — not plain email).',
        'Security: Prefer not using your personal only account; revoke the LAB007 user when the project ends if you wish. Enable two-factor authentication on your own admin account.'
      ].join('\n')
    },
    {
      id: 'onb_domain',
      title: 'Domain logon',
      instructions: [
        'Goal: LAB007 can point DNS, verify domain for email, analytics, SSL, or add subdomains.',
        'What to share:',
        '- Which registrar hosts the domain (GoDaddy, Namecheap, Google Domains/Squarespace Domains, Cloudflare, etc.).',
        '- Access via invited user OR read-only collaborator if your registrar supports it.',
        'How to delegate safely:',
        '- Many registrars allow you to invite someone by email with “Technical” / “DNS only” permission — prefer that when available.',
        '- If sharing the main account login is unavoidable, enable 2FA on your registrar and change credentials after onboarding.',
        'What we may edit: Nameservers or DNS records only (e.g. A, CNAME, TXT for verification — we will confirm before publishing).'
      ].join('\n')
    },
    {
      id: 'onb_gbp',
      title: 'Google Business Profile access',
      instructions: [
        'Goal: We can optimise your GBP, respond to edits, categories, attributes, posts, photos, and fix duplicate listings.',
        'Steps for you:',
        '1. Open Google Business Profile (business.google.com) while logged into the Google account that owns or manages the profile.',
        '2. Go to Users / Managers (or Linked accounts, depending on the UI version).',
        '3. Add the email address LAB007 provides as Manager (not Communication manager only unless we agree otherwise). Manager allows profile edits and moderation.',
        '4. Confirm the invitation in email if Google sends one.',
        'If the listing is duplicated or suspended: note that in onboarding — we’ll request access first, then escalate with screenshots if needed.'
      ].join('\n')
    },
    {
      id: 'onb_ads',
      title: 'Ad account access',
      instructions: [
        'Goal: LAB007 can build or audit campaigns, install conversion tags (with your approval), link analytics, or export clean reporting.',
        'Google Ads:',
        '- Sign in to ads.google.com with the owning Google account → Tools → Access and security → Add user → paste LAB007 email → Role: Standard (or Administrative if setting up conversions/billing linkage from our side). Send invitation.',
        'Meta (Facebook / Instagram) Business:',
        '- business.facebook.com → Business settings → Users → People → Invite → LAB007 email. Assign Assets: assign your Ad Account and Page with appropriate roles (typically Advertiser minimum; Admin if we agree to rebuild structure).',
        'Other platforms (LinkedIn Ads, TikTok Ads, Bing): Same pattern — invite LAB007 email with campaign management access.',
        'Never share personal passwords; only use platform-invite workflows. Remove access when engagements end if you wish.'
      ].join('\n')
    },
    {
      id: 'onb_media',
      title: 'Access to high-resolution images & videos',
      instructions: [
        'Goal: Your site and ads use sharp, licence-safe media — not blurry social re-posts.',
        'Please provide ONE of:',
        '- Google Drive / Dropbox / OneDrive folder link (view/edit as agreed) labelled by photo/video purpose (team, storefront, products, testimonials).',
        '- Attach original camera or phone uploads (JPEG/PNG/raw), not screenshots from Instagram.',
        '- File transfers (WeTransfer / similar) if large video masters.',
        'Naming: Prefer descriptive filenames or a short spreadsheet mapping files to placements (hero / product lineup / homepage video).',
        'Rights: Confirm you own the rights or supplier licence for imagery we publish. Logo: vector (SVG/EPS/PDF) or largest PNG available.'
      ].join('\n')
    },
    {
      id: 'onb_social',
      title: 'Access to social accounts',
      instructions: [
        'Goal: Publishing, boosted posts coordination, bios/links, pinned posts, analytics reads — without sharing your login.',
        'Meta (Facebook Page + Instagram):',
        '- Meta Business Suite / business.facebook.com → assign LAB007 as a role on the Page (Content / Advertiser / Admin as agreed) and connect Instagram to the same Business if running both.',
        'LinkedIn: Company page → Admin tools → Page admins → Invite admin or content admin.',
        'YouTube: Studio → Settings → Permissions → Invite manager as needed.',
        'TikTok: Business Center or direct account roles if available; otherwise schedule content via agreed tool.',
        'Share the @handles and links to each profile in this Marketing Manager customer record so we match the right accounts.'
      ].join('\n')
    }
  ];
}

function mmBuildOnboardingChecklist() {
  return mmOnboardingChecklistDefs().map((def) => ({
    id: def.id,
    title: def.title,
    instructions: def.instructions,
    done: false
  }));
}

function mmWrapPdfTextLine(text, maxLen) {
  const limit = maxLen || 92;
  const words = String(text || '').split(/\s+/).filter((w) => w.length);
  const lines = [];
  let cur = '';
  words.forEach((w) => {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= limit) cur = next;
    else {
      if (cur) lines.push(cur);
      if (w.length > limit) {
        for (let i = 0; i < w.length; i += limit) lines.push(w.slice(i, i + limit));
        cur = '';
      } else cur = w;
    }
  });
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function mmBuildOnboardingPdfBuffer(customerName, checklist) {
  const nameLine = String(customerName || 'Client').trim() || 'Client';
  const dateStr = new Date().toISOString().slice(0, 10);
  const lines = [];
  lines.push('LAB007 — Client onboarding checklist');
  lines.push(`Prepared for: ${nameLine}`);
  lines.push(`Generated: ${dateStr}`);
  lines.push('');
  lines.push(
    'Use this document as a shared checklist. Each section explains what to provide and how. Mark items complete in your Marketing Manager task, or print and sign off with your team.'
  );
  lines.push('');

  const defs = mmOnboardingChecklistDefs();
  const byId = new Map((checklist || []).map((row) => [row.id, row]));
  defs.forEach((def, idx) => {
    const row = byId.get(def.id) || {};
    const done = Boolean(row.done);
    lines.push('');
    lines.push(`${idx + 1}. ${def.title}`);
    lines.push(`${done ? '[X]' : '[ ]'} Completed`);
    String(def.instructions || '')
      .split('\n')
      .forEach((para) => {
        const t = String(para || '').trim();
        if (!t) return;
        mmWrapPdfTextLine(t, 90).forEach((l) => lines.push(`   ${l}`));
      });
  });
  lines.push('');
  lines.push('—');
  lines.push('Questions? Reply to your LAB007 contact or info@lab007.ai');
  lines.push('');

  const flat = [];
  lines.forEach((ln) => {
    mmWrapPdfTextLine(ln, 94).forEach((l) => flat.push(l));
  });

  const linesPerPage = 46;
  const pages = [];
  for (let i = 0; i < flat.length; i += linesPerPage) {
    pages.push(flat.slice(i, i + linesPerPage));
  }
  if (!pages.length) pages.push(['']);

  const n = pages.length;
  const fontId = 2 * n + 4;
  const objects = [];
  const addObj = (body) => objects.push(body);

  addObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  const kidRefs = [];
  for (let p = 0; p < n; p += 1) {
    kidRefs.push(`${4 + p * 2} 0 R`);
  }
  addObj(`2 0 obj\n<< /Type /Pages /Count ${n} /Kids [ ${kidRefs.join(' ')} ] >>\nendobj\n`);

  for (let p = 0; p < n; p += 1) {
    const pageId = 4 + p * 2;
    const contentId = 5 + p * 2;
    const pageLines = pages[p];
    const contentRows = ['BT', '/F1 10 Tf', '48 762 Td', '11.5 TL'];
    pageLines.forEach((line, idx) => {
      const t = `(${mmPdfEscape(line)}) Tj`;
      if (idx === 0) contentRows.push(t);
      else contentRows.push(`T* ${t}`);
    });
    contentRows.push('ET');
    const stream = contentRows.join('\n');
    addObj(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`
    );
    addObj(
      `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`
    );
  }

  addObj(`${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

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

function mmBuildDirectoryChecklist() {
  const items = [];
  MM_DIRECTORY_USA.forEach(([name, url], i) => {
    items.push({
      id: `usa_${i}`,
      section: 'usa',
      name,
      url,
      done: false
    });
  });
  MM_DIRECTORY_PAID.forEach(([name, url], i) => {
    items.push({
      id: `paid_${i}`,
      section: 'paid',
      name,
      url,
      done: false
    });
  });
  return items;
}

function mmFindCustomer(state, customerId) {
  return state.customers.find((c) => c.id === customerId) || null;
}

function mmNormalizeWebsite(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withProto);
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    return u.toString();
  } catch {
    return '';
  }
}

function mmNormalizeOptionalLink(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  return mmNormalizeWebsite(t);
}

async function mmTryFetchLogo(websiteUrl) {
  const base = mmNormalizeWebsite(websiteUrl);
  if (!base) return null;
  try {
    const res = await fetchFn(base, {
      headers: {
        'User-Agent': 'LAB007-MarketingManager/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const pick = (rx) => {
      const m = html.match(rx);
      return m && m[1] ? m[1].trim() : '';
    };
    const candidates = [
      pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i),
      pick(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i),
      pick(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i),
      pick(/<img[^>]+src=["']([^"']*logo[^"']*)["']/i)
    ].filter(Boolean);
    if (!candidates.length) return null;
    const abs = new URL(candidates[0], base).toString();
    return abs;
  } catch {
    return null;
  }
}

app.post('/api/marketing-manager/auth/login', (req, res) => {
  const expected = marketingManagerPassword();
  if (!expected) {
    return res.status(503).json({
      ok: false,
      error: 'Marketing Manager password is not configured on the server (MARKETING_MANAGER_PASSWORD).'
    });
  }
  const given = String(req.body?.password || '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  let match = false;
  if (a.length === b.length) {
    try {
      match = crypto.timingSafeEqual(a, b);
    } catch {
      match = false;
    }
  }
  if (!match) {
    return res.status(401).json({ ok: false, error: 'Incorrect password.' });
  }
  const token = signMarketingManagerToken();
  if (!token) {
    return res.status(503).json({ ok: false, error: 'Could not create session token.' });
  }
  setMarketingManagerAuthCookie(res, token);
  return res.json({ ok: true });
});

app.get('/api/marketing-manager/auth/status', (req, res) => {
  if (!marketingManagerPassword()) {
    return res.json({ ok: false, configured: false });
  }
  return res.json({ ok: isMarketingManagerAuthed(req), configured: true });
});

app.post('/api/marketing-manager/auth/logout', (req, res) => {
  clearMarketingManagerAuthCookie(res);
  return res.json({ ok: true });
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/marketing-manager')) return next();
  if (isPublicMarketingManagerApi(req)) return next();
  if (!marketingManagerPassword()) {
    return res.status(503).json({
      error: 'Marketing Manager password is not configured on the server (MARKETING_MANAGER_PASSWORD).'
    });
  }
  if (!isMarketingManagerAuthed(req)) {
    return res.status(401).json({ error: 'Authentication required.', code: 'MM_AUTH_REQUIRED' });
  }
  return next();
});

app.get('/api/marketing-manager/catalog', (req, res) => {
  return res.json({
    directory: {
      usa: MM_DIRECTORY_USA.map(([name, url]) => ({ name, url })),
      paid: MM_DIRECTORY_PAID.map(([name, url]) => ({ name, url }))
    },
    campaigns: MM_CAMPAIGN_PRESETS,
    taskTemplates: MM_TASK_TEMPLATES
  });
});

app.get('/api/marketing-manager/agent-signature', (req, res) => {
  try {
    const agent = readMarketingAgentSignature();
    if (!agent) {
      return res.json({ hasSignature: false, updatedAt: null, signatureDataUrl: '', agentName: '' });
    }
    return res.json({
      hasSignature: true,
      updatedAt: agent.updatedAt || null,
      signatureDataUrl: agent.signatureDataUrl,
      agentName: agent.agentName || ''
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/marketing-manager/agent-signature', (req, res) => {
  try {
    const incomingSig = String(req.body?.signatureDataUrl || '').trim();
    const incomingName = mmSanitizeAgentName(req.body?.agentName);
    const existing = readMarketingAgentSignature();

    let effectiveSig = '';
    if (incomingSig) {
      if (!mmValidSignatureDataUrl(incomingSig)) {
        return res.status(400).json({ error: 'Valid signature image (PNG or JPEG data URL) is required' });
      }
      effectiveSig = incomingSig;
    } else if (existing?.signatureDataUrl) {
      effectiveSig = existing.signatureDataUrl;
    } else {
      return res.status(400).json({ error: 'Valid signature image (PNG or JPEG data URL) is required' });
    }

    const saved = writeMarketingAgentSignature(effectiveSig, incomingName);
    return res.json({
      success: true,
      updatedAt: saved.updatedAt,
      agentName: saved.agentName || ''
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/marketing-manager/agent-signature', (req, res) => {
  try {
    if (fs.existsSync(marketingManagerAgentSignaturePath)) {
      fs.unlinkSync(marketingManagerAgentSignaturePath);
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/marketing-manager/state', (req, res) => {
  return res.json(readMarketingManagerState());
});

app.post('/api/marketing-manager/customers', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Customer name is required' });
    const notes = String(req.body?.notes || '').trim();
    const website = mmNormalizeWebsite(req.body?.website);
    const instagram = mmNormalizeOptionalLink(req.body?.instagram);
    const facebook = mmNormalizeOptionalLink(req.body?.facebook);
    const linkedin = mmNormalizeOptionalLink(req.body?.linkedin);
    const youtube = mmNormalizeOptionalLink(req.body?.youtube);
    const tiktok = mmNormalizeOptionalLink(req.body?.tiktok);
    const logoUrl = website ? await mmTryFetchLogo(website) : null;
    const state = readMarketingManagerState();
    const customer = {
      id: mmNewId('cust'),
      name,
      notes,
      website,
      instagram,
      facebook,
      linkedin,
      youtube,
      tiktok,
      logoUrl,
      createdAt: new Date().toISOString(),
      tasks: []
    };
    state.customers.push(customer);
    writeMarketingManagerState(state);
    return res.status(201).json({ customer });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/api/marketing-manager/customers/:customerId', (req, res) => {
  try {
    const state = readMarketingManagerState();
    const c = mmFindCustomer(state, req.params.customerId);
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    if (req.body.name !== undefined) c.name = String(req.body.name || '').trim() || c.name;
    if (req.body.notes !== undefined) c.notes = String(req.body.notes || '').trim();
    if (req.body.website !== undefined) {
      const nextWebsite = mmNormalizeWebsite(req.body.website);
      if (nextWebsite) c.website = nextWebsite;
      else if (!String(req.body.website || '').trim()) c.website = '';
    }
    if (req.body.instagram !== undefined) c.instagram = mmNormalizeOptionalLink(req.body.instagram);
    if (req.body.facebook !== undefined) c.facebook = mmNormalizeOptionalLink(req.body.facebook);
    if (req.body.linkedin !== undefined) c.linkedin = mmNormalizeOptionalLink(req.body.linkedin);
    if (req.body.youtube !== undefined) c.youtube = mmNormalizeOptionalLink(req.body.youtube);
    if (req.body.tiktok !== undefined) c.tiktok = mmNormalizeOptionalLink(req.body.tiktok);
    if (req.body.logoUrl !== undefined) c.logoUrl = String(req.body.logoUrl || '').trim();
    c.updatedAt = new Date().toISOString();
    writeMarketingManagerState(state);
    return res.json({ customer: c });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/marketing-manager/customers/:customerId/logo', (req, res) => {
  marketingCustomerLogoUpload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Logo upload failed' });
    try {
      const state = readMarketingManagerState();
      const c = mmFindCustomer(state, req.params.customerId);
      if (!c) return res.status(404).json({ error: 'Customer not found' });
      if (!req.file) return res.status(400).json({ error: 'Logo file is required' });
      const logoUrl = `/marketmg/logos/${req.file.filename}`;
      c.logoUrl = logoUrl;
      c.updatedAt = new Date().toISOString();
      writeMarketingManagerState(state);
      return res.json({ customer: c, logoUrl });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
});

app.delete('/api/marketing-manager/customers/:customerId', (req, res) => {
  try {
    const state = readMarketingManagerState();
    const idx = state.customers.findIndex((c) => c.id === req.params.customerId);
    if (idx === -1) return res.status(404).json({ error: 'Customer not found' });
    state.customers.splice(idx, 1);
    writeMarketingManagerState(state);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/marketing-manager/customers/:customerId/tasks', (req, res) => {
  try {
    const kind = String(req.body?.kind || '').trim();
    const state = readMarketingManagerState();
    const c = mmFindCustomer(state, req.params.customerId);
    if (!c) return res.status(404).json({ error: 'Customer not found' });

    const now = new Date().toISOString();
    let task;

    if (kind === 'template_batch') {
      const templateKey = String(req.body?.templateKey || '').trim();
      if (templateKey === 'directory_rollout_usa') {
        const createdTasks = MM_DIRECTORY_USA.map(([name, url]) => mmBuildDirectorySiteTask(name, url, now));
        c.tasks.push(...createdTasks);
        writeMarketingManagerState(state);
        return res.status(201).json({ tasks: createdTasks, createdCount: createdTasks.length });
      }
      return res.status(400).json({ error: 'Invalid templateKey' });
    } else if (kind === 'directory') {
      task = {
        id: mmNewId('task'),
        kind: 'directory',
        title: 'Directory listings — USA & paid platforms',
        status: 'not_started',
        checklist: mmBuildDirectoryChecklist(),
        createdAt: now,
        updatedAt: now
      };
    } else if (kind === 'keywords') {
      task = {
        id: mmNewId('task'),
        kind: 'keywords',
        title: 'Keywords — research & LIKE list',
        status: 'not_started',
        likedKeywords: [],
        notes: '',
        createdAt: now,
        updatedAt: now
      };
    } else if (kind === 'campaign') {
      const key = String(req.body?.campaignKey || '').trim();
      const preset = MM_CAMPAIGN_PRESETS.find((p) => p.key === key);
      if (!preset) return res.status(400).json({ error: 'Invalid campaignKey' });
      task = {
        id: mmNewId('task'),
        kind: 'campaign',
        campaignKey: preset.key,
        title: preset.title,
        description: preset.description,
        status: 'not_started',
        notes: '',
        createdAt: now,
        updatedAt: now
      };
    } else if (kind === 'onboarding') {
      task = {
        id: mmNewId('task'),
        kind: 'onboarding',
        title: 'Client onboarding — access & assets',
        status: 'not_started',
        notes: '',
        checklist: mmBuildOnboardingChecklist(),
        createdAt: now,
        updatedAt: now
      };
    } else if (kind === 'manual') {
      const title = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      if (!title) return res.status(400).json({ error: 'Manual task title is required' });
      task = {
        id: mmNewId('task'),
        kind: 'campaign',
        campaignKey: 'manual',
        title,
        description,
        status: 'not_started',
        notes: '',
        createdAt: now,
        updatedAt: now
      };
    } else {
      return res
        .status(400)
        .json({ error: 'kind must be template_batch, directory, onboarding, keywords, campaign, or manual' });
    }

    c.tasks.push(task);
    writeMarketingManagerState(state);
    return res.status(201).json({ task });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/api/marketing-manager/customers/:customerId/tasks/:taskId', (req, res) => {
  try {
    const state = readMarketingManagerState();
    const c = mmFindCustomer(state, req.params.customerId);
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    const task = c.tasks.find((t) => t.id === req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (req.body.status !== undefined) {
      let s = String(req.body.status || '').trim();
      if (s === 'started') s = 'in_progress';
      if (!['not_started', 'in_progress', 'parked', 'completed'].includes(s)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      task.status = s;
    }
    if (req.body.title !== undefined) {
      const title = String(req.body.title || '').trim();
      if (!title) return res.status(400).json({ error: 'Task title is required' });
      task.title = title;
    }
    if (req.body.description !== undefined) task.description = String(req.body.description || '');
    if (req.body.descriptionHtml !== undefined) task.descriptionHtml = String(req.body.descriptionHtml || '');
    if ((task.kind === 'directory' || task.kind === 'onboarding') && req.body.checklist !== undefined) {
      if (!Array.isArray(req.body.checklist)) return res.status(400).json({ error: 'checklist must be an array' });
      const byId = new Map(task.checklist.map((row) => [row.id, row]));
      req.body.checklist.forEach((patch) => {
        if (!patch || !patch.id) return;
        const row = byId.get(patch.id);
        if (row && typeof patch.done === 'boolean') row.done = patch.done;
      });
    }
    if (task.kind === 'onboarding' && req.body.notes !== undefined) {
      task.notes = String(req.body.notes || '');
    }
    if (task.kind === 'keywords') {
      if (req.body.likedKeywords !== undefined) {
        if (!Array.isArray(req.body.likedKeywords)) {
          return res.status(400).json({ error: 'likedKeywords must be an array of strings' });
        }
        task.likedKeywords = req.body.likedKeywords.map((k) => String(k || '').trim()).filter(Boolean);
      }
      if (req.body.notes !== undefined) task.notes = String(req.body.notes || '');
    }
    if (task.kind === 'campaign' && req.body.notes !== undefined) {
      task.notes = String(req.body.notes || '');
    }

    task.updatedAt = new Date().toISOString();
    writeMarketingManagerState(state);
    return res.json({ task });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/marketing-manager/customers/:customerId/tasks/:taskId', (req, res) => {
  try {
    const state = readMarketingManagerState();
    const c = mmFindCustomer(state, req.params.customerId);
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    const idx = c.tasks.findIndex((t) => t.id === req.params.taskId);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });
    c.tasks.splice(idx, 1);
    writeMarketingManagerState(state);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/marketing-manager/customers/:customerId/tasks/:taskId/onboarding.pdf', (req, res) => {
  try {
    const state = readMarketingManagerState();
    const c = mmFindCustomer(state, req.params.customerId);
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    const task = c.tasks.find((t) => t.id === req.params.taskId);
    if (!task || task.kind !== 'onboarding') {
      return res.status(404).json({ error: 'Onboarding task not found' });
    }
    const pdfBuffer = mmBuildOnboardingPdfBuffer(c.name, task.checklist || []);
    const slug = String(c.name || 'client')
      .trim()
      .replace(/[^\w\s-]+/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 52);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="LAB007-onboarding-${slug}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/marketing-manager/customers/:customerId/contracts', (req, res) => {
  try {
    const state = readMarketingManagerState();
    const c = mmFindCustomer(state, req.params.customerId);
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    const data = readMarketingContracts();
    const contracts = data.contracts
      .filter((x) => x.customerId === c.id)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .map((x) => mmContractView(x, c.name));
    return res.json({ contracts });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/marketing-manager/contracts', (req, res) => {
  try {
    const state = readMarketingManagerState();
    const data = readMarketingContracts();
    const byCustomer = new Map((state.customers || []).map((c) => [c.id, c.name || 'Customer']));
    const statusFilter = String(req.query?.status || '').trim().toLowerCase();
    const customerFilter = String(req.query?.customerId || '').trim();
    const contracts = data.contracts
      .filter((x) => {
        const st = (x.status || 'pending').toLowerCase();
        if (statusFilter && statusFilter !== 'all' && st !== statusFilter) return false;
        if (customerFilter && customerFilter !== 'all' && x.customerId !== customerFilter) return false;
        return true;
      })
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .map((x) => mmContractView(x, byCustomer.get(x.customerId) || 'Customer'));
    return res.json({ contracts });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/marketing-manager/customers/:customerId/contracts', (req, res) => {
  try {
    const state = readMarketingManagerState();
    const c = mmFindCustomer(state, req.params.customerId);
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    const title = String(req.body?.title || '').trim();
    const includeAgentSignature = Boolean(req.body?.includeAgentSignature);
    const bodyHtmlRaw = String(req.body?.bodyHtml || '').trim();
    let bodyHtml = bodyHtmlRaw ? mmEnsureSignatureSectionHtml(bodyHtmlRaw) : '';
    const bodyRaw = String(req.body?.body || '').trim();
    let body = mmEnsureSignatureSection(bodyRaw || mmHtmlToPlainText(bodyHtml));
    if (!title) return res.status(400).json({ error: 'Contract title is required' });
    if (!body) return res.status(400).json({ error: 'Contract body is required' });

    const createdAt = new Date().toISOString();
    const genDate = createdAt.slice(0, 10);
    let agentSigForPdf = '';
    let agentNameSnapshot = '';
    if (includeAgentSignature) {
      const agent = readMarketingAgentSignature();
      if (!agent?.signatureDataUrl) {
        return res.status(400).json({
          error: 'Save your Agent signature first (Electronic contracts → Agent signature), or uncheck “Include Agent signature”.'
        });
      }
      agentNameSnapshot = agent.agentName || '';
      const appended = mmAppendAgentSignatureBlocks(body, bodyHtml, agent.signatureDataUrl, genDate, agentNameSnapshot);
      body = appended.body;
      bodyHtml = appended.bodyHtml;
      agentSigForPdf = agent.signatureDataUrl;
    }

    const token = crypto.randomBytes(24).toString('hex');
    const contract = {
      id: mmNewId('contract'),
      customerId: c.id,
      title,
      body,
      bodyHtml,
      token,
      status: 'pending',
      createdAt,
      signedAt: null,
      signerName: '',
      signDate: '',
      signatureDataUrl: '',
      sourceType: 'created',
      includeAgentSignature,
      agentSignatureDate: includeAgentSignature ? genDate : '',
      agentName: includeAgentSignature ? agentNameSnapshot : ''
    };
    const originalPdfPath = mmCreateOriginalContractPdf({
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
    const data = readMarketingContracts();
    data.contracts.push(contract);
    writeMarketingContracts(data);
    return res.status(201).json({
      contract: mmContractView(contract, c.name)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/marketing-manager/customers/:customerId/contracts/upload', (req, res) => {
  marketingContractsUpload.single('document')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    try {
      const state = readMarketingManagerState();
      const c = mmFindCustomer(state, req.params.customerId);
      if (!c) return res.status(404).json({ error: 'Customer not found' });
      if (!req.file) return res.status(400).json({ error: 'Document file is required' });

      const titleRaw = String(req.body?.title || '').trim();
      const title = titleRaw || req.file.originalname || 'Contract document';
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

      if (includeAgentSignature && uploadExt !== '.pdf') {
        try {
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        } catch {}
        return res.status(400).json({
          error:
            'Including the Agent signature adds a page to the PDF. Upload a PDF file, or turn off “Include my Agent signature”.'
        });
      }

      let agentTmpPath = '';
      let agentNameSnapshot = '';
      if (includeAgentSignature && uploadExt === '.pdf') {
        const agent = readMarketingAgentSignature();
        if (!agent?.signatureDataUrl) {
          try {
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          } catch {}
          return res.status(400).json({
            error:
              'Save your Agent signature first (Electronic contracts → Agent signature), or do not include it on upload.'
          });
        }
        agentNameSnapshot = agent.agentName || '';
        const parsedAgent = mmParseSignatureDataUrl(agent.signatureDataUrl);
        if (!parsedAgent?.buffer?.length) {
          try {
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          } catch {}
          return res.status(400).json({ error: 'Stored Agent signature is invalid. Save it again.' });
        }
        const agentExt = parsedAgent.mime === 'image/jpeg' ? 'jpg' : 'png';
        agentTmpPath = path.join(marketingManagerSignedDocsDir, `upload-agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${agentExt}`);
        fs.writeFileSync(agentTmpPath, parsedAgent.buffer);
      }

      const contract = {
        id: mmNewId('contract'),
        customerId: c.id,
        title,
        body: mmEnsureSignatureSection(uploadBody),
        bodyHtml: mmEnsureSignatureSectionHtml(uploadBodyHtmlRaw || mmPlainTextToHtml(uploadBody)),
        token: crypto.randomBytes(24).toString('hex'),
        status: 'pending',
        createdAt,
        signedAt: null,
        signerName: '',
        signDate: '',
        signatureDataUrl: '',
        sourceType: 'uploaded',
        filePath: req.file.path,
        originalName: req.file.originalname || title,
        mimeType: req.file.mimetype || 'application/octet-stream',
        fileSize: req.file.size || 0,
        includeAgentSignature: Boolean(includeAgentSignature && uploadExt === '.pdf'),
        agentSignatureDate: includeAgentSignature && uploadExt === '.pdf' ? genDate : '',
        agentName: includeAgentSignature && uploadExt === '.pdf' ? agentNameSnapshot : ''
      };

      if (includeAgentSignature && uploadExt === '.pdf' && agentTmpPath) {
        const outPdf = path.join(marketingManagerContractDocsDir, `${contract.id}-with-agent.pdf`);
        const ok = mmStampAgentPageOnPdf(req.file.path, outPdf, agentTmpPath, genDate, agentNameSnapshot);
        try {
          if (fs.existsSync(agentTmpPath)) fs.unlinkSync(agentTmpPath);
        } catch {}
        if (!ok) {
          try {
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          } catch {}
          try {
            if (fs.existsSync(outPdf)) fs.unlinkSync(outPdf);
          } catch {}
          return res.status(500).json({
            error: 'Could not append the Agent signature page. Ensure Python and PyMuPDF (pymupdf) are available on the server.'
          });
        }
        try {
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        } catch {}
        contract.filePath = outPdf;
        contract.mimeType = 'application/pdf';
        try {
          contract.fileSize = fs.statSync(outPdf).size || 0;
        } catch {
          contract.fileSize = 0;
        }
      }

      const data = readMarketingContracts();
      data.contracts.push(contract);
      writeMarketingContracts(data);
      return res.status(201).json({ contract: mmContractView(contract, c.name) });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
});

app.delete('/api/marketing-manager/customers/:customerId/contracts/:contractId', (req, res) => {
  try {
    const state = readMarketingManagerState();
    const c = mmFindCustomer(state, req.params.customerId);
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    const data = readMarketingContracts();
    const idx = data.contracts.findIndex(
      (x) => x.id === req.params.contractId && x.customerId === c.id
    );
    if (idx === -1) return res.status(404).json({ error: 'Contract not found' });
    const contract = data.contracts[idx];
    [contract.filePath, contract.signedTextPath, contract.signedHtmlPath, contract.signedPdfPath].forEach((p) => {
      if (!p) return;
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (err) {
        console.warn('[Marketing Manager] Failed deleting contract file:', p, err.message);
      }
    });
    data.contracts.splice(idx, 1);
    writeMarketingContracts(data);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/marketing-manager/customers/:customerId/contracts', (req, res) => {
  try {
    const state = readMarketingManagerState();
    const c = mmFindCustomer(state, req.params.customerId);
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    const data = readMarketingContracts();
    const toDelete = data.contracts.filter((x) => x.customerId === c.id);
    toDelete.forEach((contract) => {
      [contract.filePath, contract.signedTextPath, contract.signedHtmlPath, contract.signedPdfPath].forEach((p) => {
        if (!p) return;
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch (err) {
          console.warn('[Marketing Manager] Failed deleting contract file:', p, err.message);
        }
      });
    });
    data.contracts = data.contracts.filter((x) => x.customerId !== c.id);
    writeMarketingContracts(data);
    return res.json({ success: true, deleted: toDelete.length });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/marketing-manager/contracts/stats', (req, res) => {
  try {
    const data = readMarketingContracts();
    let total = 0;
    let pending = 0;
    let signed = 0;
    data.contracts.forEach((c) => {
      total += 1;
      if ((c.status || 'pending') === 'signed') signed += 1;
      else pending += 1;
    });
    return res.json({ total, pending, signed });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/marketing-manager/contracts/:contractId/document', (req, res) => {
  try {
    const data = readMarketingContracts();
    const contract = data.contracts.find((x) => x.id === req.params.contractId);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    if (!contract.filePath || !fs.existsSync(contract.filePath)) {
      return res.status(404).json({ error: 'Document file not found' });
    }
    if (contract.mimeType) res.type(contract.mimeType);
    return res.sendFile(path.resolve(contract.filePath));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/marketing-manager/contracts/:contractId/signed-document', (req, res) => {
  try {
    const data = readMarketingContracts();
    const contract = data.contracts.find((x) => x.id === req.params.contractId);
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

app.get('/api/marketing-manager/contracts/sign/:token', (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Invalid token' });
    const data = readMarketingContracts();
    const contract = data.contracts.find((x) => x.token === token);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    const state = readMarketingManagerState();
    const customer = mmFindCustomer(state, contract.customerId);
    return res.json({
      contract: {
        title: contract.title,
        body: contract.body,
        bodyHtml: contract.bodyHtml || '',
        status: contract.status || 'pending',
        customerName: customer?.name || 'Customer',
        signerName: contract.signerName || '',
        signDate: contract.signDate || '',
        signedAt: contract.signedAt || null,
        signatureDataUrl: contract.signatureDataUrl || '',
        hasDocument: Boolean(contract.filePath),
        documentName: contract.originalName || '',
        documentPath: contract.filePath ? `/api/marketing-manager/contracts/sign/${token}/document` : '',
        signedDocumentPath:
          contract.status === 'signed' && (contract.signedPdfPath || contract.signedTextPath)
            ? `/api/marketing-manager/contracts/sign/${token}/document`
            : ''
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/marketing-manager/contracts/sign/:token/document', (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Invalid token' });
    const data = readMarketingContracts();
    const contract = data.contracts.find((x) => x.token === token);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    if ((contract.status || 'pending') === 'signed') {
      // Refresh signed artifacts on view so layout fixes apply immediately.
      try {
        const state = readMarketingManagerState();
        const customer = mmFindCustomer(state, contract.customerId);
        mmCreateSignedArtifacts(contract, customer?.name || 'Customer');
        writeMarketingContracts(data);
      } catch (regenError) {
        console.warn('[Marketing Manager] Could not refresh signed artifacts for view:', regenError.message);
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
    if (contract.mimeType) res.type(contract.mimeType);
    return res.sendFile(path.resolve(contract.filePath));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/marketing-manager/contracts/sign/:token/download', (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Invalid token' });
    const data = readMarketingContracts();
    const contract = data.contracts.find((x) => x.token === token);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    if ((contract.status || 'pending') !== 'signed') {
      return res.status(409).json({ error: 'Contract must be signed before download' });
    }
    // Regenerate signed artifacts on demand so rendering fixes apply to existing signed contracts.
    const state = readMarketingManagerState();
    const customer = mmFindCustomer(state, contract.customerId);
    try {
      mmCreateSignedArtifacts(contract, customer?.name || 'Customer');
      writeMarketingContracts(data);
    } catch (regenError) {
      console.warn('[Marketing Manager] Could not refresh signed artifacts for download:', regenError.message);
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

app.post('/api/marketing-manager/contracts/sign/:token/email-copy', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Invalid token' });
    const toEmail = String(req.body?.email || '').trim();
    if (!mmValidEmail(toEmail)) return res.status(400).json({ error: 'Valid email address is required' });
    const data = readMarketingContracts();
    const contract = data.contracts.find((x) => x.token === token);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    const state = readMarketingManagerState();
    const customer = mmFindCustomer(state, contract.customerId);
    try {
      mmCreateSignedArtifacts(contract, customer?.name || 'Customer');
      writeMarketingContracts(data);
    } catch (regenError) {
      console.warn('[Marketing Manager] Could not refresh signed artifacts for email:', regenError.message);
    }
    await mmSendSignedCopyByEmail(contract, customer?.name || 'Customer', toEmail);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/marketing-manager/contracts/sign/:token', (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Invalid token' });
    const fullName = String(req.body?.fullName || '').trim();
    const signDate = String(req.body?.date || '').trim();
    const signatureDataUrl = String(req.body?.signatureDataUrl || '').trim();
    if (!fullName) return res.status(400).json({ error: 'Full name is required' });
    if (!signDate) return res.status(400).json({ error: 'Date is required' });
    if (!mmValidSignatureDataUrl(signatureDataUrl)) {
      return res.status(400).json({ error: 'Signature is required' });
    }

    const data = readMarketingContracts();
    const contract = data.contracts.find((x) => x.token === token);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    if (contract.status === 'signed') return res.status(409).json({ error: 'Contract already signed' });

    contract.signerName = fullName;
    contract.signDate = signDate;
    contract.signatureDataUrl = signatureDataUrl;
    contract.status = 'signed';
    contract.signedAt = new Date().toISOString();
    const state = readMarketingManagerState();
    const customer = mmFindCustomer(state, contract.customerId);
    if (!contract.filePath || !fs.existsSync(contract.filePath)) {
      const originalPdfPath = mmCreateOriginalContractPdf(contract);
      if (originalPdfPath) {
        contract.filePath = originalPdfPath;
        contract.originalName = contract.originalName || `${contract.title || 'contract'}.pdf`;
        contract.mimeType = contract.mimeType || 'application/pdf';
      }
    }
    mmCreateSignedArtifacts(contract, customer?.name || 'Customer');
    writeMarketingContracts(data);
    mmNotifyContractSigned(contract, customer?.name || 'Customer').catch((notifyErr) => {
      console.warn('[Marketing Manager] Signed contract notification failed:', notifyErr.message);
    });

    return res.json({ success: true, signedAt: contract.signedAt });
  } catch (error) {
    const msg = String(error.message || 'Signing failed');
    if (/Could not stamp original PDF/i.test(msg)) {
      return res.status(500).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
});

function mmHeuristicKeywordSuggestions(seeds) {
  const modifiers = [
    'near me',
    'best',
    'services',
    'company',
    'cost',
    'reviews',
    'local',
    'hire',
    'quote'
  ];
  const out = new Set();
  for (const raw of seeds) {
    const s = String(raw || '')
      .trim()
      .toLowerCase();
    if (!s || s.length > 80) continue;
    modifiers.forEach((m) => out.add(`${s} ${m}`));
    out.add(`${s} sarasota`);
    out.add(`${s} florida`);
  }
  return [...out].slice(0, 40);
}

app.post('/api/marketing-manager/keyword-suggest', async (req, res) => {
  try {
    const seeds = Array.isArray(req.body?.seeds) ? req.body.seeds : [];
    const clean = seeds.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 12);
    if (!clean.length) return res.status(400).json({ error: 'Provide seeds as a non-empty array' });

    const prompt = `The user is building a local SEO keyword list for a business. Seed keywords:
${clean.map((k, i) => `${i + 1}. ${k}`).join('\n')}

Return ONLY a JSON object (no markdown): {"suggestions":["phrase one","phrase two",...]} with 20-35 short keyword strings. Include local and commercial intent variations, long-tail phrases, and related services.`;

    let text = '';
    let source = 'heuristic';
    try {
      const llm = await runMarketingAnalyzerLlm(prompt);
      text = String(llm.text || '').trim();
      source = llm.failover ? 'openai-failover' : llm.provider;
    } catch {
      return res.json({ suggestions: mmHeuristicKeywordSuggestions(clean), source: 'heuristic' });
    }
    if (!text) {
      return res.json({ suggestions: mmHeuristicKeywordSuggestions(clean), source: 'heuristic' });
    }
    const jsonText = text.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return res.json({ suggestions: mmHeuristicKeywordSuggestions(clean), source: 'heuristic' });
    }
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.suggestions)
      ? parsed.suggestions
      : [];
    const suggestions = (Array.isArray(arr) ? arr : [])
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean)
      .slice(0, 40);
    if (!suggestions.length) {
      return res.json({ suggestions: mmHeuristicKeywordSuggestions(clean), source: 'heuristic' });
    }
    return res.json({ suggestions, source });
  } catch (error) {
    console.error('keyword-suggest:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
res.json({
status: 'ok',
timestamp: new Date().toISOString(),
service: 'LAB007 Unified Services',
projects: {
'3dPrint': '/3dprint',
'Citrix-Horizon': '/citrix',
'VINValue': '/vinvalue',
'Web-Alert': '/webalert'
},
note: 'API routes need to be integrated. See INTEGRATION_NOTES.md'
});
});

// Dummy test page for Web-Alert testing
app.get('/dummypage', (req, res) => {
res.sendFile(path.join(__dirname, 'public', 'dummypage.html'));
});

// AIMAIL API
app.use('/api/aimail', aimailRouter);
app.use('/aimail-logos', express.static(path.join(__dirname, 'aimail-data', 'logos')));

// AIMAIL landing
app.get('/aimail', (req, res) => {
res.sendFile(path.join(__dirname, 'public', 'aimail.html'));
});

// Upload debug bundle (stores file only)
app.post('/citrix/api/upload-debug', upload.single('debugFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    return res.json({
      success: true,
      file: {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        path: req.file.path
      }
    });
  } catch (err) {
    console.error('upload-debug error', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

// UAG AI analysis endpoint
app.post('/api/uag/ai-analyze', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text is required' });
    }
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
    }
    const prompt = `
You are helping analyze exported logs/errors from an Omnissa Universal Access Gateway (UAG).
You are being sent info from an IT engineer doing support on this device with the aim of helping to troubleshoot.
User provided this snippet (may contain errors): 
"""
${text}
"""
Tasks:
- Briefly explain in plain English what this looks like.
- State if it is expected/benign or likely an issue.
- Suggest practical next steps to fix/verify.
- Provide top 3 relevant links (public docs/forums) that match the error text.
Keep it concise and actionable.`;

    const body = {
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 450,
      messages: [
        { role: 'system', content: 'You are a senior support engineer for Omnissa/VMware UAG. Be concise and helpful.' },
        { role: 'user', content: prompt }
      ]
    };
    const response = await fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const errText = await response.text().catch(()=> '');
      return res.status(response.status).json({ error: `OpenAI request failed: ${errText || response.statusText}` });
    }
    const data = await response.json();
    const result = data?.choices?.[0]?.message?.content || '';
    return res.json({ result });
  } catch (err) {

    console.error('AI analyze error:', err);
    return res.status(500).json({ error: 'Failed to analyze with AI' });
  }
});

// UAG AI diagram endpoint (returns SVG)
app.post('/api/uag/diagram-ai', async (req, res) => {
  try {
    const {
      externalDns = [],
      dmzLoadBalancers = [],
      uagNames = [],
      uagIps = [],
      internalLb = [],
      connServers = [],
      connIps = []
    } = req.body || {};
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
    }
    const formData = {
      external_dns_name: Array.isArray(externalDns) ? externalDns.map(s => (s || '').trim()).filter(Boolean).join(', ') : '',
      dmz_load_balancer_address: Array.isArray(dmzLoadBalancers) ? dmzLoadBalancers.map(s => (s || '').trim()).filter(Boolean).join(', ') : '',
      internal_load_balancer: Array.isArray(internalLb) ? internalLb.map(s => (s || '').trim()).filter(Boolean).join(', ') : (internalLb || ''),
      uag: (Array.isArray(uagNames) ? uagNames : []).map((name, i) => ({
        name: (name || '').trim(),
        ip: (Array.isArray(uagIps) ? uagIps[i] : '')?.trim()
      })).filter(u => u.name || u.ip),
      connection_servers: (Array.isArray(connServers) ? connServers : []).map((name, i) => ({
        name: (name || '').trim(),
        ip: (Array.isArray(connIps) ? connIps[i] : '')?.trim()
      })).filter(c => c.name || c.ip)
    };

    const systemPrompt = `
You are a diagram-rendering engine. Output ONLY valid SVG markup (no markdown, no explanations, no code fences).

Goal: render a clean IT infrastructure diagram with 3 vertical columns labeled:
1) External
2) DMZ
3) Internal Network

Canvas:
- Use width="1100" height="520" and viewBox="0 0 1100 520"
- Use three background bands for the columns: left/right light gray (#f4f6f8), center light purple (#eef0ff)

Style:
- White cards with subtle borders, rounded corners, consistent spacing.
- Purple (#4b2bd6) for flow lines and DMZ accents.
- Teal (#0d7a6b) for the DMZ load balancer vertical pill.
- Font: Arial, sans-serif. Use readable font sizes and never overflow text outside shapes.
- Generous padding around all text and shapes. No clipping.

Layout rules (match this structure and spacing):
- Top titles centered over columns: External, DMZ, Internal Network.
- External column: one box with external_dns_name on line 1 and dmz_load_balancer_address on line 2; place a small firewall icon near the boundary.
- DMZ column: a vertical “Load Balancer” pill; stack UAG circular nodes (name line 1, IP line 2).
- Internal column: box for internal_load_balancer (if provided), then a vertical list of connection servers (one rounded rectangle per server) showing name and IP.
- Draw arrows: External -> DMZ LB, LB -> each UAG, each UAG -> Internal (toward the connection servers).

Constraints:
- Output must be a single <svg>…</svg>.
- No embedded images. Use simple SVG shapes for icons.
- All text must fit within its container; reduce font-size slightly if needed to avoid clipping.
- Keep everything centered and evenly spaced within the 1100x520 viewBox.`;

    const prompt = JSON.stringify(formData, null, 2);

    const body = {
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 1800,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ]
    };
    console.log('[diagram-ai] system prompt preview:', systemPrompt.slice(0, 200), '...');
    console.log('[diagram-ai] user JSON:', prompt);
    const response = await fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const errText = await response.text().catch(()=> '');
      return res.status(response.status).json({ error: `OpenAI request failed: ${errText || response.statusText}` });
    }
    const data = await response.json();
    let svg = (data?.choices?.[0]?.message?.content || '').trim();
    console.log('[diagram-ai] response preview:', svg.slice(0, 400), '...');
    // Strip code fences if the model returned them
    if (svg.startsWith('```')) {
      svg = svg.replace(/^```[a-zA-Z]*\s*/, '').replace(/```$/, '').trim();
    }
    if (!svg.startsWith('<?xml')) {
      // Accept bare <svg ...> and prepend xml header
      if (svg.trim().startsWith('<svg')) {
        svg = `<?xml version="1.0" encoding="UTF-8"?>\n${svg.trim()}`;
      } else {
        return res.status(500).json({ error: 'AI response was not SVG', preview: svg.slice(0,200) });
      }
    }
    return res.json({ svg, prompt, preview: svg.slice(0,200) });
  } catch (err) {
    console.error('AI diagram error:', err);
    return res.status(500).json({ error: 'Failed to generate diagram' });
  }
});

// Catch-all route for main landing page (must be last, only matches exact /)
app.get('/', (req, res) => {
res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Sports+ page
app.get('/sportsplus', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sportsplus.html'));
});

// Elite Cleaning Services
app.get('/elite-cleaning', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'elite-cleaning.html'));
});
app.get('/elite-cleaning.html', (req, res) => {
  res.redirect(301, '/elite-cleaning');
});

// Elite Invoices — cleaning client invoice generator
const eliteInvoicesDataDir = process.env.ELITE_INVOICES_DATA_DIR
  ? path.resolve(process.env.ELITE_INVOICES_DATA_DIR)
  : path.join(__dirname, 'data', 'elite-invoices');
const eliteInvoicesClientsPath = eliteInvoicesDataPath(eliteInvoicesDataDir);
const eliteInvoicesHistoryFile = eliteInvoicesHistoryPath(eliteInvoicesDataDir);
const eliteInvoicesPdfDir = eliteInvoicesPdfsDir(eliteInvoicesDataDir);
if (!fs.existsSync(eliteInvoicesDataDir)) {
  fs.mkdirSync(eliteInvoicesDataDir, { recursive: true });
}
if (!fs.existsSync(eliteInvoicesPdfDir)) {
  fs.mkdirSync(eliteInvoicesPdfDir, { recursive: true });
}
if (!fs.existsSync(eliteInvoicesClientsPath)) {
  fs.copyFileSync(eliteInvoicesSeedPath(), eliteInvoicesClientsPath);
}
if (!fs.existsSync(eliteInvoicesHistoryFile)) {
  fs.writeFileSync(eliteInvoicesHistoryFile, '[]', 'utf8');
}

console.log('[EliteInvoices] data dir:', eliteInvoicesDataDir);

function readEliteInvoiceClients() {
  return loadEliteInvoiceClients(eliteInvoicesClientsPath, eliteInvoicesSeedPath());
}

function writeEliteInvoiceClients(clients) {
  saveEliteInvoiceClients(eliteInvoicesClientsPath, clients);
}

function readEliteInvoiceHistory() {
  return loadEliteInvoiceHistory(eliteInvoicesHistoryFile);
}

function writeEliteInvoiceHistory(invoices) {
  saveEliteInvoiceHistory(eliteInvoicesHistoryFile, invoices);
}

async function getEliteInvoicePdfBuffer(invoice) {
  const pdfPath = invoicePdfPath(eliteInvoicesPdfDir, invoice.invoiceNumber);
  const pdfBuffer = await buildInvoicePdf(invoiceToPdfPayload(invoice));
  fs.writeFileSync(pdfPath, pdfBuffer);
  return pdfBuffer;
}

function validateEliteInvoiceClients(clients) {
  const prefixes = new Set();
  for (const raw of clients) {
    const client = normalizeClient(raw);
    if (!client.id) return 'Each client must have an id.';
    if (!client.displayName) return 'Each client must have a display name.';
    if (!client.billToName) return `Client "${client.displayName}" needs a bill-to name.`;
    if (client.email && !isValidClientEmail(client.email)) {
      return `Client "${client.displayName}" has an invalid email address.`;
    }
    const prefix = normalizePrefix(client.invoicePrefix);
    if (!prefix) return `Client "${client.displayName}" needs an invoice prefix.`;
    if (prefixes.has(prefix)) return `Duplicate invoice prefix "${prefix}". Each client needs a unique prefix.`;
    prefixes.add(prefix);
  }
  return null;
}

async function createEliteInvoiceForClient(clientId, inlineClient) {
  const clients = readEliteInvoiceClients();
  const index = clients.findIndex((c) => c.id === clientId);
  if (index < 0) {
    const err = new Error('Client not found.');
    err.status = 404;
    throw err;
  }

  const merged = normalizeClient({ ...clients[index], ...(inlineClient || {}) });
  const validationError = validateEliteInvoiceClients(
    clients.map((c, i) => (i === index ? merged : c))
  );
  if (validationError) {
    const err = new Error(validationError);
    err.status = 400;
    throw err;
  }

  const sequence = Math.max(0, Math.min(9999, merged.nextSequence || 0));
  const invoiceNumber = formatInvoiceNumber(merged.invoicePrefix, sequence);
  const amount = Math.max(0, Number(merged.defaultAmount) || 0);

  const invoice = {
    invoiceNumber,
    date: formatInvoiceDate(new Date()),
    billToName: merged.billToName,
    billToLines: merged.billToLines,
    amount
  };

  const pdfBuffer = await buildInvoicePdf(invoice);
  const record = normalizeInvoice({
    id: crypto.randomUUID(),
    invoiceNumber,
    sequence,
    clientId: merged.id,
    clientDisplayName: merged.displayName,
    billToName: merged.billToName,
    billToLines: merged.billToLines,
    amount,
    date: invoice.date,
    createdAt: new Date().toISOString(),
    paid: false,
    paidAt: null
  });

  fs.writeFileSync(invoicePdfPath(eliteInvoicesPdfDir, invoiceNumber), pdfBuffer);
  const history = readEliteInvoiceHistory();
  history.unshift(record);
  writeEliteInvoiceHistory(history);

  merged.nextSequence = Math.min(9999, sequence + 1);
  clients[index] = merged;
  writeEliteInvoiceClients(clients);

  return { pdfBuffer, record, merged, invoiceNumber };
}

async function sendEliteInvoiceEmail(client, invoiceNumber, amount, pdfBuffer) {
  if (!emailTransporter) {
    throw new Error('Email service is not configured on the server (SMTP_USER / SMTP_PASS).');
  }
  if (!isValidClientEmail(client.email)) {
    throw new Error('Add a valid email address for this client before sending.');
  }

  const from = process.env.ELITE_INVOICES_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@lab007.ai';
  const replyTo = process.env.ELITE_INVOICES_REPLY_TO || 'petra@EliteCleaningServices.us';
  const formattedAmount = `$${Number(amount || 0).toFixed(0)}`;
  const greetingName = client.billToName || client.displayName || 'there';

  await emailTransporter.sendMail({
    from,
    replyTo,
    to: client.email,
    subject: `Invoice ${invoiceNumber} — Elite Cleaning Services`,
    text: [
      `Hello ${greetingName},`,
      '',
      `Please find attached invoice ${invoiceNumber} for ${formattedAmount} for cleaning services.`,
      '',
      'Payment options:',
      'Send Zelle to 941 287 7237',
      'Cheque payable to My Smart Life LLC',
      '',
      'Thank you,',
      'Elite Cleaning Services'
    ].join('\n'),
    html: `
      <p>Hello ${greetingName},</p>
      <p>Please find attached invoice <strong>${invoiceNumber}</strong> for <strong>${formattedAmount}</strong> for cleaning services.</p>
      <p><strong>Payment options</strong></p>
      <ul>
        <li>Send Zelle to 941 287 7237</li>
        <li>Cheque payable to My Smart Life LLC</li>
      </ul>
      <p>Thank you,<br>Elite Cleaning Services</p>
    `,
    attachments: [
      {
        filename: `${invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  });
}

function eliteInvoicesNoIndexHeaders(res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.setHeader('Cache-Control', 'private, no-store');
}

function eliteInvoicesAuthRequired() {
  const v = String(process.env.ELITE_INVOICES_AUTH_REQUIRED || 'true').toLowerCase();
  return !(v === '0' || v === 'false' || v === 'off' || v === 'no');
}

function requireEliteInvoicesAuth(req, res, next) {
  eliteInvoicesNoIndexHeaders(res);
  if (!eliteInvoicesAuthRequired()) return next();

  const expectedPass = String(process.env.ELITE_INVOICES_AUTH_PASS || 'danger').trim();
  const header = String(req.get('authorization') || '');
  if (!header.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Elite Invoices"');
    return res.status(401).send('Authentication required');
  }

  let decoded = '';
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    res.setHeader('WWW-Authenticate', 'Basic realm="Elite Invoices"');
    return res.status(401).send('Authentication required');
  }

  const idx = decoded.indexOf(':');
  const gotUser = idx >= 0 ? decoded.slice(0, idx) : decoded;
  const gotPass = idx >= 0 ? decoded.slice(idx + 1) : '';
  const passwordOk =
    gotPass === expectedPass ||
    gotUser === expectedPass ||
    decoded === expectedPass;
  if (!passwordOk) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Elite Invoices"');
    return res.status(401).send('Authentication required');
  }

  next();
}

app.use('/api/elite-invoices', requireEliteInvoicesAuth);

app.get('/Elite-Invoices', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'elite-invoices.html'));
});
app.get('/elite-invoices', (req, res) => {
  res.redirect(301, '/Elite-Invoices');
});

app.get('/api/elite-invoices/clients', (req, res) => {
  try {
    res.json(readEliteInvoiceClients());
  } catch (err) {
    console.error('[EliteInvoices] GET clients error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/elite-invoices/clients', (req, res) => {
  try {
    const body = req.body;
    if (!Array.isArray(body)) return res.status(400).json({ error: 'Expected an array of clients.' });
    const clients = body.map(normalizeClient);
    const validationError = validateEliteInvoiceClients(clients);
    if (validationError) return res.status(400).json({ error: validationError });
    writeEliteInvoiceClients(clients);
    res.json({ ok: true, clients });
  } catch (err) {
    console.error('[EliteInvoices] PUT clients error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/elite-invoices/create', async (req, res) => {
  try {
    const clientId = String(req.body?.clientId || '').trim();
    const inlineClient = req.body?.client && typeof req.body.client === 'object' ? req.body.client : null;
    if (!clientId) return res.status(400).json({ error: 'clientId is required.' });

    const { pdfBuffer, record, merged, invoiceNumber } = await createEliteInvoiceForClient(clientId, inlineClient);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoiceNumber}.pdf"`);
    res.setHeader('X-Invoice-Number', invoiceNumber);
    res.setHeader('X-Invoice-Id', record.id);
    res.setHeader('X-Next-Sequence', String(merged.nextSequence));
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[EliteInvoices] create error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/elite-invoices/create-and-email', async (req, res) => {
  try {
    const clientId = String(req.body?.clientId || '').trim();
    const inlineClient = req.body?.client && typeof req.body.client === 'object' ? req.body.client : null;
    if (!clientId) return res.status(400).json({ error: 'clientId is required.' });

    const { pdfBuffer, record, merged, invoiceNumber } = await createEliteInvoiceForClient(clientId, inlineClient);
    await sendEliteInvoiceEmail(merged, invoiceNumber, merged.defaultAmount, pdfBuffer);

    res.json({
      ok: true,
      invoiceNumber,
      invoiceId: record.id,
      emailedTo: merged.email,
      nextSequence: merged.nextSequence
    });
  } catch (err) {
    console.error('[EliteInvoices] create-and-email error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/elite-invoices/invoices', (req, res) => {
  try {
    const invoices = filterInvoices(readEliteInvoiceHistory(), req.query);
    res.json(invoices);
  } catch (err) {
    console.error('[EliteInvoices] GET invoices error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/elite-invoices/invoices/:id/pdf', async (req, res) => {
  try {
    const invoice = readEliteInvoiceHistory().find((row) => row.id === req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    const pdfBuffer = await getEliteInvoicePdfBuffer(invoice);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[EliteInvoices] GET invoice pdf error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/elite-invoices/invoices/:id', (req, res) => {
  try {
    const invoices = readEliteInvoiceHistory();
    const index = invoices.findIndex((row) => row.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Invoice not found.' });

    const paid = Boolean(req.body?.paid);
    invoices[index] = normalizeInvoice({
      ...invoices[index],
      paid,
      paidAt: paid ? new Date().toISOString() : null
    });
    writeEliteInvoiceHistory(invoices);
    res.json({ ok: true, invoice: invoices[index] });
  } catch (err) {
    console.error('[EliteInvoices] PATCH invoice error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/elite-invoices/invoices/:id', (req, res) => {
  try {
    const invoices = readEliteInvoiceHistory();
    const index = invoices.findIndex((row) => row.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Invoice not found.' });

    const [removed] = invoices.splice(index, 1);
    writeEliteInvoiceHistory(invoices);

    const pdfPath = invoicePdfPath(eliteInvoicesPdfDir, removed.invoiceNumber);
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }

    res.json({ ok: true, invoiceNumber: removed.invoiceNumber });
  } catch (err) {
    console.error('[EliteInvoices] DELETE invoice error:', err);
    res.status(500).json({ error: err.message });
  }
});

// SRQ Cleaning - Sarasota cleaning services
app.get('/SRQCleaning', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'SRQCleaning', 'index.html'));
});
app.get('/SRQCleaning/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'SRQCleaning', 'contact.html'));
});

// AEROCOAST bike rentals demo page
app.get('/BIKE', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'BIKE.html'));
});

// TomoPI page
app.get('/tomopi', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tomopi.html'));
});
app.get('/tomodash', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tomopi.html'));
});

// TomoPI config API (Pi fetches this, admin saves via panel)
// Backing file is tomopi-data/config.json so Pi can simply refer to "config.json"
const tomopiConfigPath = path.join(__dirname, 'tomopi-data', 'config.json');
const tomopiImagesDir = path.join(__dirname, 'tomopi-data', 'images');
const tomopiStockCachePath = path.join(__dirname, 'tomopi-data', 'stock-cache.json');
if (!fs.existsSync(tomopiImagesDir)) {
  fs.mkdirSync(tomopiImagesDir, { recursive: true });
}
const tomopiUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, tomopiImagesDir),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      const safeBase = path.basename(file.originalname, path.extname(file.originalname)).replace(/[^a-zA-Z0-9_-]/g, '_') || 'photo';
      cb(null, `${safeBase}-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 1024 * 1024 * 20 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.mimetype);
    cb(ok ? null : new Error('Only images (jpeg, png, gif, webp) allowed'), ok);
  }
});
function serveTomoPIConfig(req, res) {
  try {
    const raw = fs.readFileSync(tomopiConfigPath, 'utf8');
    const json = JSON.parse(raw);
    res.setHeader('Content-Type', 'application/json');
    res.json(json);
  } catch (err) {
    console.error('TomoPI config read error:', err);
    res.status(500).json({ error: 'Config file not found or invalid' });
  }
}
// Pi fetches from https://lab007.ai/tomopi/config.json
app.get('/tomopi/config.json', serveTomoPIConfig);
app.get('/api/tomopi/config', serveTomoPIConfig);
function saveTomoPIConfig(req, res) {
  try {
    const dir = path.dirname(tomopiConfigPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    fs.writeFileSync(tomopiConfigPath, JSON.stringify(body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    console.error('TomoPI config write error:', err);
    res.status(500).json({ error: err.message });
  }
}
app.post('/tomopi/config.json', saveTomoPIConfig);
app.post('/api/tomopi/config', saveTomoPIConfig);

function uniqueStrings(list) {
  return Array.from(new Set((list || []).map((s) => String(s || '').trim()).filter(Boolean)));
}

function readTomopiStockCache() {
  try {
    if (!fs.existsSync(tomopiStockCachePath)) return { quotes: {} };
    const raw = fs.readFileSync(tomopiStockCachePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.quotes !== 'object') return { quotes: {} };
    return parsed;
  } catch {
    return { quotes: {} };
  }
}

function writeTomopiStockCache(cacheData) {
  try {
    const dir = path.dirname(tomopiStockCachePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tomopiStockCachePath, JSON.stringify(cacheData, null, 2), 'utf8');
  } catch (error) {
    console.warn('[TomoPI] Could not write stock cache:', error.message);
  }
}

function cacheTomopiQuotes(quotes) {
  const cache = readTomopiStockCache();
  if (!cache.quotes || typeof cache.quotes !== 'object') cache.quotes = {};
  const nowIso = new Date().toISOString();
  (quotes || []).forEach((q) => {
    const sym = String(q?.symbol || '').toUpperCase().trim();
    if (!sym) return;
    if (!Number.isFinite(Number(q?.price))) return;
    cache.quotes[sym] = {
      symbol: sym,
      price: Number(q.price),
      changePct: Number.isFinite(Number(q?.changePct)) ? Number(q.changePct) : null,
      fetchedAt: nowIso
    };
  });
  writeTomopiStockCache(cache);
}

function getTomopiCachedQuotes(symbols) {
  const cache = readTomopiStockCache();
  const quotes = cache && cache.quotes && typeof cache.quotes === 'object' ? cache.quotes : {};
  return (symbols || [])
    .map((sym) => {
      const key = String(sym || '').toUpperCase().trim();
      const q = quotes[key];
      if (!q || !Number.isFinite(Number(q.price))) return null;
      return {
        symbol: key,
        price: Number(q.price),
        changePct: Number.isFinite(Number(q.changePct)) ? Number(q.changePct) : null,
        fromCache: true,
        fetchedAt: q.fetchedAt || null
      };
    })
    .filter(Boolean);
}

async function fetchTomopiRssHeadlines(url) {
  try {
    const res = await fetchFn(url, {
      headers: { 'User-Agent': 'LAB007-TomoPI-Simulator/1.0', Accept: 'application/rss+xml, application/xml, text/xml;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const parsed = await parseStringPromise(xml, { explicitArray: false, trim: true, mergeAttrs: true });
    const headlines = [];

    const rssItems = parsed?.rss?.channel?.item;
    if (rssItems) {
      const arr = Array.isArray(rssItems) ? rssItems : [rssItems];
      arr.forEach((it) => {
        const title = String(it?.title || '').trim();
        if (title) headlines.push(title);
      });
    }

    const atomEntries = parsed?.feed?.entry;
    if (atomEntries) {
      const arr = Array.isArray(atomEntries) ? atomEntries : [atomEntries];
      arr.forEach((it) => {
        const t = it?.title;
        const title = String(typeof t === 'object' ? t?._ || '' : t || '').trim();
        if (title) headlines.push(title);
      });
    }

    return uniqueStrings(headlines);
  } catch {
    return [];
  }
}

async function fetchTomopiStockQuoteFromChart(symbol) {
  try {
    const safeSymbol = String(symbol || '').toUpperCase().trim();
    if (!safeSymbol) return null;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(safeSymbol)}?interval=1d&range=5d`;
    const res = await fetchFn(url, {
      headers: { 'User-Agent': 'LAB007-TomoPI-Simulator/1.0' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const chart = data?.chart?.result?.[0];
    const meta = chart?.meta || {};
    const closeSeries = chart?.indicators?.quote?.[0]?.close || [];
    const lastClose = Array.isArray(closeSeries)
      ? [...closeSeries].reverse().find((v) => Number.isFinite(Number(v)))
      : null;
    const price = Number.isFinite(Number(meta?.regularMarketPrice))
      ? Number(meta.regularMarketPrice)
      : Number.isFinite(Number(lastClose))
        ? Number(lastClose)
        : null;
    const previousClose = Number.isFinite(Number(meta?.chartPreviousClose))
      ? Number(meta.chartPreviousClose)
      : Number.isFinite(Number(meta?.previousClose))
        ? Number(meta.previousClose)
        : null;
    const changePct =
      Number.isFinite(price) && Number.isFinite(previousClose) && previousClose !== 0
        ? ((price - previousClose) / previousClose) * 100
        : null;
    if (!Number.isFinite(price)) return null;
    return { symbol: safeSymbol, price, changePct };
  } catch {
    return null;
  }
}

async function fetchTomopiFinnhubQuote(symbol) {
  const apiKey = String(process.env.FINNHUB_API_KEY || '').trim();
  if (!apiKey) return null;
  try {
    const safeSymbol = String(symbol || '').toUpperCase().trim();
    if (!safeSymbol) return null;
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(safeSymbol)}&token=${encodeURIComponent(apiKey)}`;
    const res = await fetchFn(url, {
      headers: { 'User-Agent': 'LAB007-TomoPI-Simulator/1.0' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const price = Number.isFinite(Number(data?.c)) && Number(data.c) > 0 ? Number(data.c) : null;
    const changePct = Number.isFinite(Number(data?.dp)) ? Number(data.dp) : null;
    if (!Number.isFinite(price)) return null;
    return { symbol: safeSymbol, price, changePct };
  } catch {
    return null;
  }
}

async function fetchTomopiCoinGeckoBtc() {
  try {
    const res = await fetchFn(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      {
        headers: { 'User-Agent': 'LAB007-TomoPI-Simulator/1.0' },
        signal: AbortSignal.timeout(10000)
      }
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const price = Number.isFinite(Number(data?.bitcoin?.usd)) ? Number(data.bitcoin.usd) : null;
    if (!Number.isFinite(price)) return null;
    return { symbol: 'BTC-USD', price, changePct: null };
  } catch {
    return null;
  }
}

async function fetchTomopiStockQuotes(tickers) {
  const symbols = uniqueStrings(tickers).map((t) => t.toUpperCase()).slice(0, 20);
  if (!symbols.length) return [];

  // Match Pi behavior for BTC via CoinGecko (works without Yahoo/Finnhub).
  const wantsBtc = symbols.some((s) => s === 'BTC' || s === 'BTCUSD' || s === 'BTC-USD');
  let btcQuote = null;
  if (wantsBtc) {
    btcQuote = await fetchTomopiCoinGeckoBtc();
  }
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}`;
    const res = await fetchFn(url, {
      headers: { 'User-Agent': 'LAB007-TomoPI-Simulator/1.0' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return [];
    const data = await res.json();
    const out = (data?.quoteResponse?.result || []).map((q) => ({
      symbol: String(q?.symbol || '').toUpperCase(),
      price: Number.isFinite(Number(q?.regularMarketPrice)) ? Number(q.regularMarketPrice) : null,
      changePct: Number.isFinite(Number(q?.regularMarketChangePercent)) ? Number(q.regularMarketChangePercent) : null
    })).filter((x) => x.symbol);
    const bySymbol = new Map(out.map((x) => [x.symbol, x]));
    const missingSymbols = symbols.filter((sym) => {
      const q = bySymbol.get(sym);
      return !q || !Number.isFinite(Number(q.price));
    });
    if (missingSymbols.length) {
      const fallbackQuotes = await Promise.all(
        missingSymbols.map(async (sym) => {
          if ((sym === 'BTC' || sym === 'BTCUSD' || sym === 'BTC-USD') && btcQuote) {
            return { ...btcQuote, symbol: sym };
          }
          const fh = await fetchTomopiFinnhubQuote(sym);
          if (fh) return fh;
          return fetchTomopiStockQuoteFromChart(sym);
        })
      );
      fallbackQuotes.filter(Boolean).forEach((q) => bySymbol.set(q.symbol, q));
    }
    const finalQuotes = symbols.map((sym) => bySymbol.get(sym)).filter(Boolean);
    if (finalQuotes.length) cacheTomopiQuotes(finalQuotes);
    const stillMissing = symbols.filter((sym) => !finalQuotes.find((q) => q.symbol === sym));
    if (!stillMissing.length) return finalQuotes;
    const cached = getTomopiCachedQuotes(stillMissing);
    const merged = [...finalQuotes];
    cached.forEach((q) => merged.push(q));
    return merged;
  } catch {
    const fallbackQuotes = await Promise.all(
      symbols.map(async (sym) => {
        if ((sym === 'BTC' || sym === 'BTCUSD' || sym === 'BTC-USD') && btcQuote) {
          return { ...btcQuote, symbol: sym };
        }
        const fh = await fetchTomopiFinnhubQuote(sym);
        if (fh) return fh;
        return fetchTomopiStockQuoteFromChart(sym);
      })
    );
    const finalQuotes = fallbackQuotes.filter(Boolean);
    if (finalQuotes.length) cacheTomopiQuotes(finalQuotes);
    const stillMissing = symbols.filter((sym) => !finalQuotes.find((q) => q.symbol === sym));
    if (!stillMissing.length) return finalQuotes;
    const cached = getTomopiCachedQuotes(stillMissing);
    const merged = [...finalQuotes];
    cached.forEach((q) => merged.push(q));
    return merged;
  }
}

// TomoPI simulator live data (RSS + stock quotes) for browser preview.
app.post('/api/tomopi/sim-data', async (req, res) => {
  try {
    const rssFeeds = uniqueStrings(Array.isArray(req.body?.rssFeeds) ? req.body.rssFeeds : []).slice(0, 8);
    const tickers = uniqueStrings(Array.isArray(req.body?.tickers) ? req.body.tickers : []).slice(0, 20);
    const maxHeadlines = Math.max(1, Math.min(30, parseInt(req.body?.maxHeadlines || '8', 10)));

    const feedResults = await Promise.all(rssFeeds.map((u) => fetchTomopiRssHeadlines(u)));
    const headlines = uniqueStrings(feedResults.flat()).slice(0, maxHeadlines);
    const stocks = await fetchTomopiStockQuotes(tickers);

    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      headlines,
      stocks
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Failed to build simulator data' });
  }
});

app.get('/api/tomopi/stocks/cache', (req, res) => {
  try {
    const cache = readTomopiStockCache();
    return res.json({ ok: true, quotes: cache.quotes || {} });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Failed to read stock cache' });
  }
});

// TomoPI images: serve at /tomopi/images/* (slideshow folder)
app.use('/tomopi/images', express.static(tomopiImagesDir));
function handleTomoPIImageUpload(req, res) {
  const files = (req.files || []).map(f => ({ name: f.filename, path: `/tomopi/images/${f.filename}` }));
  res.json({ ok: true, uploaded: files });
}
app.post('/tomopi/images/upload', (req, res, next) => {
  tomopiUpload.array('photos', 20)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    handleTomoPIImageUpload(req, res);
  });
});

// BIKE rentals order request - sends basket details to info@lab007.ai
app.post('/api/bike-order', async (req, res) => {
  const { name, email, phone, startDate, endDate, zone, notes, basket, weeks, weeklySubtotal, totalAmount } = req.body || {};

  if (!name || !email || !startDate || !endDate || !Array.isArray(basket) || basket.length === 0) {
    return res.status(400).json({ error: 'Name, email, dates and at least one bike are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  if (!emailTransporter) {
    console.error('Bike order submission failed: Email transporter not configured');
    return res.status(500).json({ error: 'Email service not configured. Please email info@lab007.ai directly.' });
  }

  const fromAddr = process.env.SMTP_USER || 'noreply@lab007.ai';
  const itemsText = basket.map(item => `${item.quantity} x ${item.type}`).join('\n');
  const itemsHtml = basket.map(item => `<li>${item.quantity} × ${item.type}</li>`).join('');

  const safeWeeks = weeks && Number.isFinite(weeks) ? weeks : 1;
  const safeWeeklySubtotal = typeof weeklySubtotal === 'number' ? weeklySubtotal : 0;
  const safeTotalAmount = typeof totalAmount === 'number' ? totalAmount : safeWeeklySubtotal * safeWeeks;

  const text = `BIKE Rental Request

Name: ${name}
Email: ${email}
Phone: ${phone || '—'}
Zone: ${zone || '—'}
Start date: ${startDate}
End date: ${endDate}
Chargeable weeks: ${safeWeeks}
Weekly bikes subtotal: $${safeWeeklySubtotal.toFixed(2)}
Total charge (weeks rounded up): $${safeTotalAmount.toFixed(2)}

Requested bikes:
${itemsText}

Notes:
${notes || '—'}
`;

  const html = `
    <h2>BIKE Rental Request</h2>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Phone:</strong> ${phone || '—'}</p>
    <p><strong>Zone:</strong> ${zone || '—'}</p>
    <p><strong>Start date:</strong> ${startDate}</p>
    <p><strong>End date:</strong> ${endDate}</p>
    <p><strong>Chargeable weeks:</strong> ${safeWeeks}</p>
    <p><strong>Weekly bikes subtotal:</strong> $${safeWeeklySubtotal.toFixed(2)}</p>
    <p><strong>Total charge (weeks rounded up):</strong> $${safeTotalAmount.toFixed(2)}</p>
    <h3>Requested bikes</h3>
    <ul>${itemsHtml}</ul>
    <h3>Notes</h3>
    <p>${(notes || '—').replace(/\n/g, '<br>')}</p>
  `;

  try {
    await emailTransporter.sendMail({
      from: fromAddr,
      replyTo: email,
      to: 'info@lab007.ai',
      subject: 'BIKE – Rental request',
      text,
      html
    });
    res.json({ success: true, message: 'Request sent successfully' });
  } catch (error) {
    console.error('BIKE order email error:', error);
    res.status(500).json({ error: 'Failed to send request. Please try again or email info@lab007.ai directly.' });
  }
});
app.post('/api/tomopi/images/upload', (req, res, next) => {
  tomopiUpload.array('photos', 20)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    handleTomoPIImageUpload(req, res);
  });
});

// Serve main public directory static files (for CSS, JS, images used by landing page)
// This must come AFTER the catch-all route and AFTER all project apps
app.use(express.static(path.join(__dirname, 'public')));

// Start server
app.listen(PORT, () => {
console.log(`========================================`);
console.log(`LAB007 Unified Services`);
console.log(`========================================`);
console.log(`Server running on port ${PORT}`);
console.log(`Main landing page: http://localhost:${PORT}/`);
console.log(`TomoPI: http://localhost:${PORT}/tomopi`);
console.log(`3D Print: http://localhost:${PORT}/3dprint`);
console.log(`Citrix: http://localhost:${PORT}/citrix`);
console.log(`VIN Value: http://localhost:${PORT}/vinvalue`);
console.log(`Web Alert: http://localhost:${PORT}/webalert`);
console.log(`========================================`);
console.log(`Note: Browsers (Playwright/Puppeteer) are optional dependencies.`);
console.log(`They will install on first use if needed.`);
console.log(`========================================`);
  startScheduledJobsRunner();
});