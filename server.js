// LAB007 Unified Services - Main Server
// Combines all projects: 3dPrint, Citrix-Horizon, VINValue, Web-Alert

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { router: aimailRouter } = require('./aimail');
const fetchFn = global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

const app = express();
const PORT = process.env.PORT || 3000;

// Boot diagnostics
console.log('BOOT:', __filename);
console.log('DIR :', __dirname);
console.log('CWD :', process.cwd());

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

// Serve webdesign static page
app.get('/webdesign', (req, res) => {
  const p = path.join(__dirname, 'public', 'webdesign.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.status(404).send('Not found');
});

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
    const { externalUrls = [], externalVips = [], uagNames = [], connServers = [] } = req.body || {};
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
    }
    const toCsv = (arr) => (Array.isArray(arr) ? arr.map(s => (s || '').trim()).filter(Boolean).join(', ') : '');
    const dataVars = {
      urls: toCsv(externalUrls),
      vips: toCsv(externalVips),
      uags: toCsv(uagNames),
      cons: toCsv(connServers)
    };
    const prompt = `
You are an expert technical diagram designer. Generate a SINGLE, self-contained SVG file (no external images, no scripts, no CSS imports) that renders a clean network topology diagram for Omnissa Horizon Unified Access Gateway (UAG).

OUTPUT REQUIREMENTS
- Output ONLY valid SVG markup starting with: <?xml version="1.0" encoding="UTF-8"?>
- Use width="1400" height="1500" and viewBox="0 0 1400 1500"
- White background, navy line-art icons, purple accent for DMZ border and vSphere bar (LAB007 style).
- Consistent strokes (3px primary, 2.25px secondary), rounded corners, modern typography (Inter/Segoe UI/Arial fallback).
- Everything must fit within the canvas (no clipping).
- DO NOT include markdown fences. DO NOT explain anything. Just the SVG.

DATA (from web form)
External URLs: ${dataVars.urls || '(none)'}
External LB IPs/VIPs: ${dataVars.vips || '(none)'}
UAG Names: ${dataVars.uags || '(none)'}
Connection Servers: ${dataVars.cons || '(none)'}

LAYOUT (match this structure exactly)
1) Top: Title "LAB007 • Horizon UAG Topology"
   Subtitle: "Based on provided inputs: ${dataVars.urls || 'n/a'} • VIP ${dataVars.vips || 'n/a'} • UAGs ${dataVars.uags || 'n/a'} • Connection Servers ${dataVars.cons || 'n/a'}"
2) "Horizon Clients" icon group (phone, monitor, laptop) centered.
3) Line to "Internet" cloud labeled "Internet" and below cloud list the External URLs (comma separated).
4) Line to "Load Balancer" inside a DMZ boundary.
   - DMZ boundary: rounded rectangle with PURPLE stroke, label "DMZ" at top-right.
   - Load Balancer icon (simple shield) centered, label "Load Balancer"
   - Under label list VIPs: "VIP: ${dataVars.vips || ''}" (if multiple, show first as VIP and the rest on the next line as "Also: ...")
5) From Load Balancer, branch lines to UAG nodes (one per UAG name).
   - Each UAG node is a circle line-art with 3 purple dots connected (like a simple gateway symbol).
   - Under each: "<UAGNAME> (UAG)"
6) From UAG layer, connect down to a "Horizon Connection Servers" row:
   - Four rounded rectangles minimum; if more than 4 servers, wrap to a second row with equal spacing.
   - Each box label is the server name exactly as provided.
7) From connection servers, connect down to "Horizon Desktops and RDS Hosts":
   - Draw a dashed purple rounded rectangle.
   - Inside, draw 8 small VM tiles (2 rows x 4) labeled "vm".
   - Add a purple rounded rectangle labeled "vSphere" on the right side inside this dashed box.

RULES / EDGE CASES
- If any list has only 1 item, still draw the same structure (single UAG, single VIP, etc.).
- CSV inputs may include spaces; trim whitespace.
- Use consistent spacing and center alignment.
- Ensure no text overlaps; reduce font size slightly if needed for long lists.
- Keep the diagram visually similar to a simple Horizon architecture template (clean, minimal line art).

Now generate the SVG.`;

    const body = {
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 1800,
      messages: [
        { role: 'system', content: 'You only output SVG per the user instructions.' },
        { role: 'user', content: prompt }
      ]
    };
    console.log('[diagram-ai] prompt preview:', (prompt || '').slice(0, 400), '...');
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
    const svg = (data?.choices?.[0]?.message?.content || '').trim();
    if (!svg.startsWith('<?xml')) {
      return res.status(500).json({ error: 'AI response was not SVG', preview: svg.slice(0,200) });
    }
    return res.json({ svg, prompt });
  } catch (err) {
    console.error('AI diagram error:', err);
    return res.status(500).json({ error: 'Failed to generate diagram' });
  }
});

// Catch-all route for main landing page (must be last, only matches exact /)
app.get('/', (req, res) => {
res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
console.log(`3D Print: http://localhost:${PORT}/3dprint`);
console.log(`Citrix: http://localhost:${PORT}/citrix`);
console.log(`VIN Value: http://localhost:${PORT}/vinvalue`);
console.log(`Web Alert: http://localhost:${PORT}/webalert`);
console.log(`========================================`);
console.log(`Note: Browsers (Playwright/Puppeteer) are optional dependencies.`);
console.log(`They will install on first use if needed.`);
console.log(`========================================`);
});