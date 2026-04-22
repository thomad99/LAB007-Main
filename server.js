// LAB007 Unified Services - Main Server
// Combines all projects: 3dPrint, Citrix-Horizon, VINValue, Web-Alert

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const nodemailer = require('nodemailer');
const multer = require('multer');
const { router: aimailRouter } = require('./aimail');
const fetchFn = global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const ggppiDataDir = path.join(__dirname, 'data');
const ggppiTasksPath = path.join(ggppiDataDir, 'ggppi-tasks.json');
const ggppiUploadDir = path.join(uploadDir, 'ggppi-tracker');
if (!fs.existsSync(ggppiDataDir)) {
  fs.mkdirSync(ggppiDataDir, { recursive: true });
}
if (!fs.existsSync(ggppiUploadDir)) {
  fs.mkdirSync(ggppiUploadDir, { recursive: true });
}
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
app.use('/uploads/ggppi-tracker', express.static(ggppiUploadDir));

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

// Serve GGPPI Tracker page
app.get('/ggppi-tracker', (req, res) => {
  const p = path.join(__dirname, 'public', 'ggppi-tracker.html');
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

function readGgppiTasks() {
  try {
    if (!fs.existsSync(ggppiTasksPath)) {
      return [];
    }
    const raw = fs.readFileSync(ggppiTasksPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to read GGPPI tasks:', error);
    return [];
  }
}

function writeGgppiTasks(tasks) {
  fs.writeFileSync(ggppiTasksPath, JSON.stringify(tasks, null, 2), 'utf8');
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

app.get('/api/ggppi/tasks', (req, res) => {
  const tasks = readGgppiTasks().sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  return res.json({ tasks });
});

app.post('/api/ggppi/tasks', ggppiUpload.array('attachments', 10), (req, res) => {
  const taskName = String(req.body.taskName || '').trim();
  const assignedTo = String(req.body.assignedTo || '').trim();
  const notes = String(req.body.notes || '').trim();
  const progress = parseProgress(req.body.progress, 0);
  const completed = parseBoolean(req.body.completed);

  if (!taskName) {
    return res.status(400).json({ error: 'Task name is required' });
  }
  if (!assignedTo) {
    return res.status(400).json({ error: 'Assigned name is required' });
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

  const tasks = readGgppiTasks();
  tasks.push(task);
  writeGgppiTasks(tasks);

  return res.status(201).json({ task });
});

app.put('/api/ggppi/tasks/:id', withOptionalGgppiUpload, (req, res) => {
  const { id } = req.params;
  const tasks = readGgppiTasks();
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
  const nextAssignedTo = hasAssignedTo ? String(req.body.assignedTo || '').trim() : current.assignedTo;
  const nextNotes = hasNotes ? String(req.body.notes || '').trim() : String(current.notes || '');
  const nextCompleted = hasCompleted ? parseBoolean(req.body.completed) : !!current.completed;
  const nextProgress = hasProgress ? parseProgress(req.body.progress, current.progress) : current.progress;

  if (!nextTaskName) {
    return res.status(400).json({ error: 'Task name cannot be empty' });
  }
  if (!nextAssignedTo) {
    return res.status(400).json({ error: 'Assigned name cannot be empty' });
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
  writeGgppiTasks(tasks);

  return res.json({ task: updatedTask });
});

app.delete('/api/ggppi/tasks/:id', (req, res) => {
  const { id } = req.params;
  const tasks = readGgppiTasks();
  const taskIndex = tasks.findIndex((item) => item.id === id);

  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const [removedTask] = tasks.splice(taskIndex, 1);
  writeGgppiTasks(tasks);

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
}
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

// TomoPI config API (Pi fetches this, admin saves via panel)
// Backing file is tomopi-data/config.json so Pi can simply refer to "config.json"
const tomopiConfigPath = path.join(__dirname, 'tomopi-data', 'config.json');
const tomopiImagesDir = path.join(__dirname, 'tomopi-data', 'images');
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
});