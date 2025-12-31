const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const StlReader = require('node-stl');
const bodyParser = require('body-parser');
const cors = require('cors');
const nodemailer = require('nodemailer');
const yauzl = require('yauzl');
const xml2js = require('xml2js');
const https = require('https');
const http = require('http');

// SendGrid support (for free Render plans that block SMTP)
let sendgrid = null;
if (process.env.SENDGRID_API_KEY) {
  try {
    sendgrid = require('@sendgrid/mail');
    sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('SendGrid initialized (using API instead of SMTP)');
  } catch (err) {
    console.error('Failed to initialize SendGrid:', err.message);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Store uploaded files temporarily (fileId -> filePath)
const uploadedFiles = new Map();

// Email configuration
// Note: External email service URL removed - using direct SMTP instead (service is on paid tier)
// const emailServiceUrl = process.env.EMAIL_SERVICE_URL || null;  // Disabled - using direct SMTP
// const emailServiceApiKey = process.env.EMAIL_SERVICE_API_KEY || null;  // Disabled
const emailServiceUrl = null; // Always use direct SMTP
const emailServiceApiKey = null;

// IONOS: Use port 587 with secure: true (SSL/TLS) or port 465 with secure: true
// Gmail: Use port 587 with secure: false (STARTTLS) or port 465 with secure: true
const smtpPort = parseInt(process.env.SMTP_PORT || '587');
// Allow explicit secure setting via environment variable, otherwise auto-detect based on port
const smtpSecure = process.env.SMTP_SECURE !== undefined 
  ? process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1'
  : smtpPort === 465; // Default: port 465 = secure, port 587 = STARTTLS (but can be overridden)

const smtpConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: smtpPort,
  secure: smtpSecure, // true = SSL/TLS, false = STARTTLS
  // Password authentication - nodemailer automatically uses LOGIN or PLAIN based on server support
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  requireTLS: !smtpSecure, // Require TLS upgrade for STARTTLS (port 587 with secure: false)
  connectionTimeout: 30000, // 30 seconds (increased for cloud platforms)
  greetingTimeout: 30000, // 30 seconds
  socketTimeout: 30000, // 30 seconds
  debug: true, // Enable debug output
  logger: true, // Enable logging
  tls: {
    // Reject unauthorized certificates (set to false only for testing)
    rejectUnauthorized: true,
    // Use TLS 1.2 or higher (required by IONOS)
    minVersion: 'TLSv1.2'
  }
};

// Log email configuration
if (sendgrid) {
  console.log('=== Email Configuration (SendGrid API) ===');
  console.log('  Provider: SendGrid (API-based, works on free Render plans)');
  console.log('  API Key: ***set***');
  console.log(`  Order Notify Email: ${process.env.ORDER_NOTIFY_EMAIL || 'info@lab007.ai'}`);
  console.log(`  Order Email Header: ${process.env.ORDER_EMAIL_HEADER || '(not set)'}`);
  console.log('');
  console.log('NOTE: SendGrid is being used instead of SMTP.');
  console.log('      This works on free Render plans that block SMTP ports.');
  console.log('');
} else {
  console.log('=== SMTP Configuration ===');
  console.log(`  Host: ${smtpConfig.host}`);
  console.log(`  Port: ${smtpConfig.port}`);
  console.log(`  Secure: ${smtpConfig.secure} (${smtpConfig.secure ? 'SSL/TLS' : 'STARTTLS'})`);
  console.log(`  Require TLS: ${smtpConfig.requireTLS} (for STARTTLS connections)`);
  console.log(`  Authentication: Password-based (LOGIN/PLAIN)`);
  console.log(`  User: ${smtpConfig.auth.user || '(not set)'}`);
  console.log(`  Password: ${smtpConfig.auth.pass ? '***set***' : '(not set)'}`);
  console.log(`  TLS Min Version: ${smtpConfig.tls.minVersion}`);
  console.log(`  Connection Timeout: ${smtpConfig.connectionTimeout}ms`);
  console.log(`  Order Notify Email: ${process.env.ORDER_NOTIFY_EMAIL || 'info@lab007.ai'}`);
  console.log(`  Order Email Header: ${process.env.ORDER_EMAIL_HEADER || '(not set)'}`);
  console.log('');
  console.log('WARNING: Free Render plans block SMTP ports (25, 465, 587).');
  console.log('         To use SMTP, upgrade to a paid Render plan ($7/month minimum).');
  console.log('         OR set SENDGRID_API_KEY to use SendGrid API (works on free plans).');
  console.log('');
  console.log('NOTE: To use SSL/TLS on port 587, set SMTP_SECURE=true');
  console.log('      For IONOS with port 587, set SMTP_PORT=587 and SMTP_SECURE=true');
  console.log('      For IONOS with port 465, set SMTP_PORT=465 (secure: true is automatic)');
  console.log('');
}

const emailTransporter = nodemailer.createTransport(smtpConfig);

// Add event listeners for detailed connection logging
emailTransporter.on('token', (token) => {
  console.log('SMTP Token received:', token);
});

// Test SMTP connection on startup (but don't block server startup if it fails)
console.log('=== Testing SMTP Connection ===');
emailTransporter.verify((error, success) => {
  if (error) {
    console.error('=== SMTP Connection Verification FAILED ===');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    console.error('Command:', error.command);
    console.error('Response:', error.response);
    
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.error('');
      console.error('CONNECTION ISSUE DETECTED:');
      console.error('  - Cannot reach SMTP server at ' + smtpConfig.host + ':' + smtpConfig.port);
      console.error('  - This may be due to:');
      console.error('    1. Render blocking outbound SMTP connections (common on free tiers)');
      console.error('    2. IONOS blocking connections from Render IP ranges');
      console.error('    3. Firewall/network restrictions');
      console.error('    4. Incorrect SMTP_HOST or SMTP_PORT');
      console.error('');
      console.error('SOLUTIONS:');
      console.error('  1. Check if Render allows outbound SMTP (may require paid plan)');
      console.error('  2. Use a transactional email service (SendGrid, Mailgun, etc.)');
      console.error('  3. Verify SMTP_HOST and SMTP_PORT are correct');
      console.error('  4. Contact IONOS support to whitelist Render IP ranges');
      console.error('');
    } else if (error.code === 'EAUTH') {
      console.error('AUTHENTICATION ERROR: Check SMTP_USER and SMTP_PASS');
    }
    console.error('Email sending will be attempted but may fail.\n');
  } else {
    console.log('=== SMTP Connection Verification SUCCESS ===');
    console.log('SMTP server is ready to accept messages\n');
  }
});

// Clean up old files every hour
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  for (const [fileId, data] of uploadedFiles.entries()) {
    if (now - data.timestamp > maxAge) {
      if (fs.existsSync(data.path)) {
        fs.unlinkSync(data.path);
      }
      uploadedFiles.delete(fileId);
    }
  }
}, 60 * 60 * 1000);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// Serve images from the dedicated images folder BEFORE the generic public static handler
app.use('/images', express.static('images'));
app.use(express.static('public'));

// Storage configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.stl', '.obj', '.3mf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only STL, OBJ, and 3MF files are allowed.'));
    }
  }
});

// Default pricing settings (will be stored in settings.json)
const defaultSettings = {
  filamentCostPerMeter: 0.02, // $0.02 per meter
  electricityCostPerMinute: 0.001, // $0.001 per minute
  laborCostFixed: 25.00, // Fixed labor cost per order
  postageBaseCost: 5.00, // $5.00 base postage
  layerHeight: 0.2, // mm
  printSpeed: 60, // mm/s
  infillPercentage: 20, // %
  wallThickness: 0.8, // mm
  filamentDiameter: 1.75, // mm
  filamentDensity: 1.24 // g/cm³ (PLA)
};

// Load settings from file or use defaults
function loadSettings() {
  try {
    if (fs.existsSync('settings.json')) {
      const data = fs.readFileSync('settings.json', 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return defaultSettings;
}

// Save settings to file
function saveSettings(settings) {
  try {
    fs.writeFileSync('settings.json', JSON.stringify(settings, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
}

// Parse OBJ file and calculate volume
function parseOBJVolume(fileBuffer) {
  const text = fileBuffer.toString('utf8');
  const lines = text.split('\n');
  
  const vertices = [];
  const faces = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('v ')) {
      // Vertex: v x y z
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 4) {
        vertices.push({
          x: parseFloat(parts[1]),
          y: parseFloat(parts[2]),
          z: parseFloat(parts[3])
        });
      }
    } else if (trimmed.startsWith('f ')) {
      // Face: f v1 v2 v3 ... (can have texture/normal indices, but we only need vertex indices)
      const parts = trimmed.split(/\s+/);
      const faceVertices = [];
      for (let i = 1; i < parts.length; i++) {
        // Handle formats like "f v1/vt1/vn1 v2/vt2/vn2" or "f v1 v2 v3"
        const vertexIndex = parseInt(parts[i].split('/')[0]);
        if (!isNaN(vertexIndex) && vertexIndex > 0) {
          faceVertices.push(vertexIndex - 1); // OBJ uses 1-based indexing
        }
      }
      if (faceVertices.length >= 3) {
        // Triangulate polygons (simple fan triangulation)
        for (let i = 1; i < faceVertices.length - 1; i++) {
          faces.push([faceVertices[0], faceVertices[i], faceVertices[i + 1]]);
        }
      }
    }
  }
  
  console.log(`OBJ parsed: ${vertices.length} vertices, ${faces.length} triangles`);
  
  // Calculate volume using signed volume method
  let totalVolume = 0;
  for (const face of faces) {
    if (face.length === 3) {
      const v0 = vertices[face[0]];
      const v1 = vertices[face[1]];
      const v2 = vertices[face[2]];
      
      if (v0 && v1 && v2) {
        // Signed volume of tetrahedron formed by origin and triangle
        const volume = (v0.x * (v1.y * v2.z - v2.y * v1.z) +
                       v1.x * (v2.y * v0.z - v0.y * v2.z) +
                       v2.x * (v0.y * v1.z - v1.y * v0.z)) / 6.0;
        totalVolume += volume;
      }
    }
  }
  
  // Convert from mm³ to cm³ (assuming OBJ is in mm, adjust if needed)
  const volumeCm3 = Math.abs(totalVolume) / 1000.0;
  console.log(`OBJ volume calculated: ${volumeCm3.toFixed(4)} cm³`);
  
  return volumeCm3;
}

// Parse 3MF file and calculate volume
function parse3MFVolume(filePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        reject(new Error(`Failed to open 3MF file: ${err.message}`));
        return;
      }
      
      let foundModel = false;
      
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        console.log(`3MF entry found: ${entry.fileName}`);
        if (entry.fileName === '3D/3dmodel.model' || entry.fileName.endsWith('.model')) {
          foundModel = true;
          console.log(`Found 3MF model file: ${entry.fileName}`);
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              reject(new Error(`Failed to read 3MF model: ${err.message}`));
              return;
            }
            
            const chunks = [];
            readStream.on('data', (chunk) => chunks.push(chunk));
            readStream.on('end', () => {
              const xmlBuffer = Buffer.concat(chunks);
              const xmlString = xmlBuffer.toString('utf8');
              console.log(`3MF XML size: ${xmlString.length} characters`);
              
              xml2js.parseString(xmlString, (err, result) => {
                if (err) {
                  reject(new Error(`Failed to parse 3MF XML: ${err.message}`));
                  return;
                }
                
                try {
                  // Parse 3MF mesh data
                  const model = result.model || result['3mf:model'] || {};
                  const resources = model.resources || model['3mf:resources'] || {};
                  const objects = resources[0]?.object || resources[0]?.['3mf:object'] || [];
                  
                  console.log(`3MF objects found: ${objects.length}`);
                  
                  let totalVolume = 0;
                  
                  for (const obj of objects) {
                    const mesh = obj.mesh || obj['3mf:mesh'] || {};
                    const vertices = mesh.vertices || mesh['3mf:vertices'] || [];
                    const triangles = mesh.triangles || mesh['3mf:triangles'] || [];
                    
                    if (vertices.length > 0 && triangles.length > 0) {
                      const vertArray = [];
                      const vertData = vertices[0].vertex || vertices[0]['3mf:vertex'] || [];
                      
                      console.log(`Processing ${vertData.length} vertices and ${triangles[0]?.triangle?.length || 0} triangles`);
                      
                      for (const v of vertData) {
                        const attrs = v.$ || {};
                        vertArray.push({
                          x: parseFloat(attrs.x || 0),
                          y: parseFloat(attrs.y || 0),
                          z: parseFloat(attrs.z || 0)
                        });
                      }
                      
                      const triData = triangles[0].triangle || triangles[0]['3mf:triangle'] || [];
                      for (const tri of triData) {
                        const attrs = tri.$ || {};
                        const v1 = parseInt(attrs.v1 || 0);
                        const v2 = parseInt(attrs.v2 || 0);
                        const v3 = parseInt(attrs.v3 || 0);
                        
                        if (v1 < vertArray.length && v2 < vertArray.length && v3 < vertArray.length) {
                          const p1 = vertArray[v1];
                          const p2 = vertArray[v2];
                          const p3 = vertArray[v3];
                          
                          const volume = (p1.x * (p2.y * p3.z - p3.y * p2.z) +
                                         p2.x * (p3.y * p1.z - p1.y * p3.z) +
                                         p3.x * (p1.y * p2.z - p2.y * p1.z)) / 6.0;
                          totalVolume += volume;
                        }
                      }
                    }
                  }
                  
                  // 3MF uses mm, convert to cm³
                  const volumeCm3 = Math.abs(totalVolume) / 1000.0;
                  console.log(`3MF volume calculated: ${volumeCm3.toFixed(4)} cm³`);
                  resolve(volumeCm3);
                } catch (parseErr) {
                  console.error('3MF parsing error:', parseErr);
                  reject(new Error(`Failed to extract volume from 3MF: ${parseErr.message}`));
                }
              });
            });
            readStream.on('error', (err) => {
              reject(new Error(`Error reading 3MF stream: ${err.message}`));
            });
          });
        } else {
          zipfile.readEntry();
        }
      });
      
      zipfile.on('end', () => {
        if (!foundModel) {
          reject(new Error('No model file found in 3MF archive. Expected file: 3D/3dmodel.model'));
        }
      });
      
      zipfile.on('error', (err) => {
        reject(new Error(`3MF zip error: ${err.message}`));
      });
    });
  });
}

// Calculate volume from CAD file (STL, OBJ, or 3MF)
async function calculateSTLVolume(filePath) {
  try {
    console.log(`Reading file: ${filePath}`);
    const fileBuffer = fs.readFileSync(filePath);
    console.log(`File buffer size: ${fileBuffer.length} bytes`);
    
    const ext = path.extname(filePath).toLowerCase();
    console.log(`File extension: ${ext}`);
    
    if (ext === '.stl') {
      // Use node-stl to parse and calculate volume
      console.log('Initializing StlReader...');
      const stlReader = new StlReader(fileBuffer);
      console.log('StlReader initialized');
      
      const volume = stlReader.volume;
      console.log(`Raw volume from StlReader (cm³): ${volume}`);
      
      if (!volume || volume <= 0 || !isFinite(volume)) {
        console.error('Invalid volume:', volume);
        throw new Error('Invalid STL file or unable to calculate volume');
      }
      
      // node-stl returns volume in cm³
      const volumeCm3 = volume;
      console.log(`Volume in cm³: ${volumeCm3.toFixed(4)}`);
      
      return volumeCm3;
    } else if (ext === '.obj') {
      // Parse OBJ file
      console.log('Parsing OBJ file...');
      const volumeCm3 = parseOBJVolume(fileBuffer);
      
      if (!volumeCm3 || volumeCm3 <= 0 || !isFinite(volumeCm3)) {
        throw new Error('Invalid OBJ file or unable to calculate volume');
      }
      
      return volumeCm3;
    } else if (ext === '.3mf') {
      // Parse 3MF file
      console.log('Parsing 3MF file...');
      const volumeCm3 = await parse3MFVolume(filePath);
      
      if (!volumeCm3 || volumeCm3 <= 0 || !isFinite(volumeCm3)) {
        throw new Error('Invalid 3MF file or unable to calculate volume');
      }
      
      return volumeCm3;
    } else {
      throw new Error(`Unsupported file format: ${ext}`);
    }
  } catch (error) {
    console.error('Error calculating volume:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    throw new Error(`Failed to parse CAD file: ${error.message}`);
  }
}

// Estimate print time based on extruded volume
function estimatePrintTime(volumeCm3, settings) {
  // Use the same effective volume heuristic as filament calculation
  const filamentInfo = calculateFilamentRequired(volumeCm3, settings);
  const effectiveVolumeCm3 = filamentInfo.effectiveVolumeCm3;

  // Approximate volumetric extrusion rate (how much plastic per minute)
  // 0.5 cm³/min ≈ 8.3 mm³/s, a conservative default suitable for many printers.
  const baseExtrusionRateCm3PerMin = settings.baseExtrusionRateCm3PerMin || 0.5;

  // Adjust for quality: thinner layers take longer, thicker are faster
  const layerHeight = settings.layerHeight || 0.2; // mm
  const referenceLayer = 0.2; // mm
  const qualityFactor = referenceLayer / layerHeight; // 0.16mm -> 1.25x slower, 0.24mm -> ~0.83x

  // Estimated minutes = (effective volume / rate) * qualityFactor
  const minutes = (effectiveVolumeCm3 / baseExtrusionRateCm3PerMin) * qualityFactor;

  // Clamp to at least 1 minute and round to nearest minute
  return Math.max(1, Math.round(minutes));
}

// Calculate filament required (length in meters and weight in grams)
function calculateFilamentRequired(volumeCm3, settings) {
  const filamentDiameter = parseFloat(settings.filamentDiameter) || defaultSettings.filamentDiameter; // mm
  const filamentDensity = parseFloat(settings.filamentDensity) || defaultSettings.filamentDensity; // g/cm³
  const infill = (parseFloat(settings.infillPercentage) || defaultSettings.infillPercentage) / 100;

  // Heuristic: account for walls + infill (walls ~30%, infill scaled by infill %)
  const effectiveVolumeCm3 = volumeCm3 * (0.3 + 0.7 * infill);

  // Cross-sectional area of filament in cm²
  const radiusCm = (filamentDiameter / 2) / 10; // convert mm to cm
  const filamentAreaCm2 = Math.PI * Math.pow(radiusCm, 2);

  // Length in cm and meters: V = A * L  ->  L = V / A
  const lengthCm = effectiveVolumeCm3 / filamentAreaCm2;
  const lengthM = lengthCm / 100;

  // Weight in grams: mass = density * volume
  const weightGrams = effectiveVolumeCm3 * filamentDensity;

  return { lengthM, weightGrams, effectiveVolumeCm3 };
}

// Calculate shipping cost based on zipcode distance and quantity
// Using a simple distance-based calculation (can be replaced with shipping API)
function calculateShippingCost(fromZip, toZip, isCollection, quantity = 1) {
  if (isCollection) {
    return 0; // No shipping cost for collection
  }
  
  // Default shipping cost if no zipcode provided
  let baseShipping = 15.00; // Default to medium distance shipping
  
  if (toZip && fromZip && typeof toZip === 'string' && typeof fromZip === 'string') {
    try {
      // Simple zipcode-based shipping calculation
      // Extract first 3 digits of zipcode for approximate distance calculation
      const fromZip3 = fromZip.substring(0, 3);
      const toZip3 = toZip.substring(0, 3);
      
      // Calculate approximate distance based on zipcode difference
      const zipDiff = Math.abs(parseInt(fromZip3) - parseInt(toZip3));
      
      // Shipping tiers based on distance
      if (zipDiff === 0) {
        // Same zipcode area - local delivery
        baseShipping = 5.00;
      } else if (zipDiff < 50) {
        // Nearby (within ~50 zipcode units) - regional
        baseShipping = 8.00;
      } else if (zipDiff < 200) {
        // Medium distance - state/regional
        baseShipping = 12.00;
      } else if (zipDiff < 500) {
        // Long distance - cross-region
        baseShipping = 18.00;
      } else {
        // Very long distance - cross-country
        baseShipping = 25.00;
      }
    } catch (error) {
      console.warn('Error calculating shipping from zipcodes, using default:', error);
      // Use default shipping if zipcode parsing fails
      baseShipping = 15.00;
    }
  }
  
  // Double shipping cost for quantities above 5
  if (quantity > 5) {
    baseShipping = baseShipping * 2;
  }
  
  return baseShipping;
}

// Calculate total cost
function calculateCost(volumeCm3, printTimeMinutes, settings, toZip = null, isCollection = false, qualityMode = 'draft', quantity = 1) {
  const filamentInfo = calculateFilamentRequired(volumeCm3, settings);
  const filamentMeters = filamentInfo.lengthM;
  const filamentWeightGrams = filamentInfo.weightGrams;

  // Calculate costs per unit
  const filamentCostPerUnit = filamentMeters * settings.filamentCostPerMeter;
  const electricityCostPerUnit = printTimeMinutes * settings.electricityCostPerMinute;
  // Labor cost: $25 for draft, $30 for high quality (per order, not per unit)
  const laborCost = qualityMode === 'high' ? 30.00 : 25.00;
  
  // Multiply material and electricity costs by quantity
  const filamentCost = filamentCostPerUnit * quantity;
  const electricityCost = electricityCostPerUnit * quantity;
  
  // Calculate shipping cost based on zipcode and quantity
  const fromZip = '34238'; // Your zipcode
  const postageCost = calculateShippingCost(fromZip, toZip, isCollection, quantity);
  
  const subtotal = filamentCost + electricityCost + laborCost;
  const total = subtotal + postageCost;
  
  return {
    filamentMeters: filamentMeters.toFixed(2),
    filamentWeightGrams: filamentWeightGrams.toFixed(1),
    printTimeMinutes: printTimeMinutes,
    filamentCost: filamentCost.toFixed(2),
    electricityCost: electricityCost.toFixed(2),
    laborCost: laborCost.toFixed(2),
    postageCost: postageCost.toFixed(2),
    subtotal: subtotal.toFixed(2),
    total: total.toFixed(2)
  };
}

// Routes
// Handle both with and without trailing slash when mounted
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Get current settings
app.get('/api/settings', (req, res) => {
  const settings = loadSettings();
  res.json(settings);
});

// Update settings
app.post('/api/settings', (req, res) => {
  const newSettings = { ...defaultSettings, ...req.body };
  if (saveSettings(newSettings)) {
    res.json({ success: true, settings: newSettings });
  } else {
    res.status(500).json({ success: false, error: 'Failed to save settings' });
  }
});

// Upload and analyze CAD file
app.post('/api/upload', upload.single('cadFile'), async (req, res) => {
  console.log('=== File Upload Request ===');
  console.log('File received:', req.file ? req.file.originalname : 'NONE');
  
  if (!req.file) {
    console.error('ERROR: No file uploaded');
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const filePath = req.file.path;
    const qualityMode = (req.body.qualityMode || 'draft').toLowerCase();
    const fileSize = fs.statSync(filePath).size;
    console.log(`File saved to: ${filePath}`);
    console.log(`File size: ${(fileSize / 1024).toFixed(2)} KB`);
    
    const settings = loadSettings();
    console.log('Settings loaded:', JSON.stringify(settings, null, 2));

    // Derive job-specific settings based on quality mode (draft / high)
    const jobSettings = { ...settings };
    if (qualityMode === 'high') {
      // High quality: 0.10mm layer height (thinner = longer print time = higher cost)
      jobSettings.layerHeight = settings.highQualityLayerHeight ? parseFloat(settings.highQualityLayerHeight) : 0.10;
    } else {
      // Draft quality: 0.24mm layer height (thicker = faster print time = lower cost)
      jobSettings.layerHeight = settings.draftLayerHeight ? parseFloat(settings.draftLayerHeight) : 0.24;
    }
    console.log(`Quality mode: ${qualityMode}`);
    console.log(`Using layer height: ${jobSettings.layerHeight} mm`);
    
    // Calculate volume
    console.log('Calculating volume...');
    const volumeCm3 = await calculateSTLVolume(filePath);
    console.log(`Volume calculated: ${volumeCm3.toFixed(2)} cm³`);
    
    if (!volumeCm3 || volumeCm3 <= 0) {
      throw new Error('Invalid volume calculated from STL file');
    }
    
    // Estimate print time
    console.log('Estimating print time...');
    const printTimeMinutes = estimatePrintTime(volumeCm3, jobSettings);
    console.log(`Print time estimated: ${printTimeMinutes} minutes`);
    
    // Calculate costs (zipcode and shipping preference optional at upload time)
    const toZip = req.body.toZip || null;
    const isCollection = req.body.isCollection === 'true' || req.body.isCollection === true;
    console.log('Calculating costs...');
    const costBreakdown = calculateCost(volumeCm3, printTimeMinutes, jobSettings, toZip, isCollection);
    console.log('Cost breakdown:', JSON.stringify(costBreakdown, null, 2));
    
    // Store file temporarily for potential order (don't delete yet)
    const fileId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
    uploadedFiles.set(fileId, {
      path: filePath,
      originalName: req.file.originalname,
      timestamp: Date.now()
    });
    console.log(`File stored with ID: ${fileId}`);
    
    const response = {
      success: true,
      fileId: fileId, // Return file ID so client can reference it for orders
      volume: volumeCm3.toFixed(2),
      printTime: printTimeMinutes,
      ...costBreakdown
    };
    
    console.log('Sending response:', JSON.stringify(response, null, 2));
    console.log('=== Upload Complete ===\n');
    
    res.json(response);
  } catch (error) {
    console.error('ERROR processing file:', error);
    console.error('Stack:', error.stack);
    
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
      console.log('Temporary file cleaned up after error');
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Recalculate shipping cost
app.post('/api/recalculate-shipping', (req, res) => {
  console.log('=== Shipping Recalculation ===');
  const { volume, printTime, toZip, isCollection, quantity } = req.body;
  
  if (!volume || !printTime) {
    return res.status(400).json({ error: 'Volume and print time are required' });
  }
  
  try {
    const settings = loadSettings();
    const volumeCm3 = parseFloat(volume);
    const printTimeMinutes = parseInt(printTime);
    const isCollectionBool = isCollection === true || isCollection === 'true';
    const qualityMode = req.body.qualityMode || 'draft';
    const qty = parseInt(quantity) || 1;
    
    // Recalculate costs with new shipping info
    const costBreakdown = calculateCost(volumeCm3, printTimeMinutes, settings, toZip || null, isCollectionBool, qualityMode, qty);
    
    console.log('Recalculated shipping cost:', costBreakdown.postageCost);
    console.log('New total:', costBreakdown.total);
    
    res.json({
      success: true,
      ...costBreakdown
    });
  } catch (error) {
    console.error('ERROR recalculating shipping:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit order
app.post('/api/order', (req, res) => {
  console.log('=== Order Submission ===');
  const { fileId, customerName, customerEmail, qualityMode, quoteData, customerZip, isCollection, colorChoice } = req.body;
  
  console.log('Order details:', {
    fileId: fileId,
    customerName: customerName,
    customerEmail: customerEmail,
    qualityMode: qualityMode,
    customerZip: customerZip,
    isCollection: isCollection,
    colorChoice: colorChoice,
    quantity: quantity
  });
  
  if (!fileId || !customerName || !customerEmail) {
    console.error('ERROR: Missing required fields');
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const fileData = uploadedFiles.get(fileId);
  if (!fileData || !fs.existsSync(fileData.path)) {
    console.error(`ERROR: File not found for ID: ${fileId}`);
    return res.status(404).json({ error: 'File not found. Please upload again.' });
  }
  
  console.log(`File found: ${fileData.originalName} at ${fileData.path}`);
  
  // Email content
  const emailContent = `
New 3D Print Order Request

Customer Information:
- Name: ${customerName}
- Email: ${customerEmail}
- Zipcode: ${customerZip || 'Not provided'}
- Shipping: ${isCollection === true || isCollection === 'true' ? 'Collection' : 'Shipping'}
- Quality Mode: ${qualityMode || 'draft'}
- Color: ${colorChoice || 'Not specified'}

Quote Details:
- Volume: ${quoteData.volume} cm³
- Print Time: ${quoteData.printTime} minutes
- Filament Required: ${quoteData.filamentMeters} meters
- Filament Weight: ${quoteData.filamentWeightGrams} g
- Total Price: $${quoteData.total}

Cost Breakdown:
- Filament Cost: $${quoteData.filamentCost}
- Electricity Cost: $${quoteData.electricityCost}
- Labor Cost: $${quoteData.laborCost}
- Postage: $${quoteData.postageCost}
- Subtotal: $${quoteData.subtotal}
- Total: $${quoteData.total}

Please review the attached STL file and contact the customer to confirm the order and send payment link.
  `;
  
  // Format "From" address properly
  // SMTP_FROM = display name/header (e.g., "LAB007 3D Print Quote")
  // SMTP_USER = actual sender email address (e.g., "david.thomas@thinworld.net")
  const smtpUserEmail = process.env.SMTP_USER || 'noreply@lab007.ai';
  const smtpFromDisplayName = process.env.SMTP_FROM;
  
  // If SMTP_FROM is set, use it as display name with SMTP_USER as email
  // Otherwise, just use SMTP_USER email
  const smtpFrom = smtpFromDisplayName 
    ? `${smtpFromDisplayName} <${smtpUserEmail}>`
    : smtpUserEmail;
  
  const smtpTo = process.env.ORDER_NOTIFY_EMAIL || 'info@lab007.ai';
  const emailSubject = process.env.ORDER_EMAIL_HEADER ? `${process.env.ORDER_EMAIL_HEADER} - ${customerName}` : `New 3D Print Order Request from ${customerName}`;
  
  console.log('=== Email Configuration ===');
  if (emailServiceUrl) {
    console.log(`Email Service: External HTTP Service (${emailServiceUrl})`);
  } else if (sendgrid) {
    console.log(`Email Service: SendGrid API`);
  } else {
    console.log(`Email Service: Direct SMTP`);
    console.log(`SMTP Host: ${smtpConfig.host}`);
    console.log(`SMTP Port: ${smtpConfig.port}`);
    console.log(`SMTP User: ${smtpConfig.auth.user || '(not set)'}`);
    console.log(`SMTP Password: ${smtpConfig.auth.pass ? '***set***' : '***NOT SET***'}`);
  }
  console.log(`Email From: ${smtpFrom}`);
  console.log(`Email To: ${smtpTo}`);
  console.log(`Email Subject: ${emailSubject}`);
  console.log(`Attachment: ${fileData.originalName} (${fileData.path})`);
  
  const mailOptions = {
    from: smtpFrom,
    to: smtpTo,
    subject: emailSubject,
    text: emailContent,
    attachments: [
      {
        filename: fileData.originalName,
        path: fileData.path
      }
    ]
  };
  
  // Respond immediately to prevent UI hanging
  console.log('Sending immediate response to client...');
  res.json({ success: true, message: 'Order submitted successfully. We will review your quote and contact you shortly.' });
  
  // Send email in background (non-blocking)
  // Priority: 1) SendGrid API (if available), 2) Direct SMTP (default)
  if (sendgrid) {
    console.log('Using SendGrid API for email sending...');
    sendEmailViaSendGrid(smtpFrom, smtpTo, emailSubject, emailContent, fileData, fileId);
  } else {
    console.log('Using direct SMTP for email sending...');
    sendEmailViaSMTP(mailOptions, fileData, fileId);
  }
  
  // Send confirmation email to customer
  const confirmationSubject = '3D PRINT ORDER RECEIVED';
  const shippingMethod = isCollection === true || isCollection === 'true' ? 'Collection' : 'Shipping';
  const shippingCost = quoteData.postageCost || '0.00';
  const grandTotal = quoteData.total || quoteData.subtotal;
  
  const confirmationTextBody = `Thanks for your enquiry.  We will review your design and ensure its good to go. 

We typically will turn this around same day.

Order Details:
- Quantity: ${quantity || 1}
- Quality: ${qualityMode === 'high' ? 'High Quality (0.10mm)' : 'Draft (0.24mm)'}
- Color: ${colorChoice || 'Not specified'}

Order Summary:
- Subtotal: $${quoteData.subtotal}
- Shipping (${shippingMethod}): $${shippingCost}
- Grand Total: $${grandTotal}

Thanks

LAB007 3D Printing`;
  
  // Create HTML email with logo and signature
  let confirmationHtmlBody = '';
  try {
    // Read logo and convert to base64
    const logoPath = path.join(__dirname, 'images', 'LAB007-LOGO-T.png');
    let logoBase64 = '';
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      logoBase64 = logoBuffer.toString('base64');
    }
    
    // Create HTML email body
    confirmationHtmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .signature {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
    }
    .signature-text {
      font-weight: bold;
      font-size: 16px;
      color: #333;
      margin-bottom: 10px;
    }
    .logo {
      max-width: 200px;
      height: auto;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <p>Thanks for your enquiry. We will review your design and ensure its good to go.</p>
  
  <p>We typically will turn this around same day.</p>
  
  <div style="background: #f5f5f5; padding: 15px; border-radius: 6px; margin: 20px 0;">
    <h3 style="margin-top: 0;">Order Details</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
      <tr>
        <td style="padding: 8px 0;">Quantity:</td>
        <td style="text-align: right; padding: 8px 0;"><strong>${quantity || 1}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0;">Quality:</td>
        <td style="text-align: right; padding: 8px 0;"><strong>${qualityMode === 'high' ? 'High Quality (0.10mm)' : 'Draft (0.24mm)'}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0;">Color:</td>
        <td style="text-align: right; padding: 8px 0;"><strong>${colorChoice || 'Not specified'}</strong></td>
      </tr>
    </table>
    <h3 style="margin-top: 0;">Order Summary</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0;">Subtotal:</td>
        <td style="text-align: right; padding: 8px 0;">$${quoteData.subtotal}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0;">Shipping (${shippingMethod}):</td>
        <td style="text-align: right; padding: 8px 0;">$${shippingCost}</td>
      </tr>
      <tr style="border-top: 2px solid #ddd; font-weight: bold; font-size: 1.1em;">
        <td style="padding: 12px 0 8px 0;">Grand Total:</td>
        <td style="text-align: right; padding: 12px 0 8px 0; color: #007bff;">$${grandTotal}</td>
      </tr>
    </table>
  </div>
  
  <p>Thanks</p>
  
  <div class="signature">
    <div class="signature-text">LAB007 3D Printing</div>
    ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" alt="LAB007 Logo" class="logo" />` : ''}
  </div>
</body>
</html>
    `.trim();
  } catch (error) {
    console.error('Error creating HTML email body:', error.message);
    // Fallback to plain text if HTML generation fails
    confirmationHtmlBody = confirmationTextBody.replace(/\n/g, '<br>');
  }
  
  console.log('Sending confirmation email to customer...');
  sendSimpleEmail(smtpFrom, customerEmail, confirmationSubject, confirmationTextBody, confirmationHtmlBody);
});

// Send simple email (no attachment) - works with all email methods
function sendSimpleEmail(from, to, subject, text, html) {
  console.log(`=== Sending Simple Email ===`);
  console.log(`From: ${from}`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Has HTML: ${!!html}`);
  
  if (sendgrid) {
    // Use SendGrid API
    sendSimpleEmailViaSendGrid(from, to, subject, text, html);
  } else {
    // Use direct SMTP
    sendSimpleEmailViaSMTP(from, to, subject, text, html);
  }
}

// Send simple email via external HTTP service
function sendSimpleEmailViaExternalService(from, to, subject, text, html) {
  const emailData = {
    from: from,
    to: to,
    subject: subject,
    text: text,
    html: html || null
    // No attachment for confirmation email
  };
  
  let normalizedUrl = emailServiceUrl.trim();
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = 'https://' + normalizedUrl;
  }
  if (!normalizedUrl.includes('/api/send-email')) {
    normalizedUrl = normalizedUrl.replace(/\/$/, '') + '/api/send-email';
  }
  
  let url;
  try {
    url = new URL(normalizedUrl);
  } catch (error) {
    console.error('=== Confirmation Email Send FAILED (Invalid URL) ===');
    console.error(`Error: ${error.message}`);
    return;
  }
  
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;
  const postData = JSON.stringify(emailData);
  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + (url.search || ''),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  if (emailServiceApiKey) {
    options.headers['X-API-Key'] = emailServiceApiKey;
  }
  
  const req = client.request(options, (res) => {
    let responseData = '';
    res.on('data', (chunk) => { responseData += chunk; });
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('=== Confirmation Email Send SUCCESS ===');
      } else {
        console.error('=== Confirmation Email Send FAILED ===');
        console.error('Status Code:', res.statusCode);
        console.error('Response:', responseData);
      }
    });
  });
  
  req.on('error', (error) => {
    console.error('=== Confirmation Email Send FAILED ===');
    console.error('Error:', error.message);
  });
  
  req.write(postData);
  req.end();
}

// Send simple email via SendGrid API
function sendSimpleEmailViaSendGrid(from, to, subject, text, html) {
  const msg = {
    to: to,
    from: from,
    subject: subject,
    text: text,
    html: html || null
  };
  
  sendgrid.send(msg)
    .then(() => {
      console.log('=== Confirmation Email Send SUCCESS (SendGrid) ===');
    })
    .catch((error) => {
      console.error('=== Confirmation Email Send FAILED (SendGrid) ===');
      console.error('Error:', error.message);
    });
}

// Send simple email via SMTP
function sendSimpleEmailViaSMTP(from, to, subject, text, html) {
  const mailOptions = {
    from: from,
    to: to,
    subject: subject,
    text: text,
    html: html || null
  };
  
  emailTransporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('=== Confirmation Email Send FAILED (SMTP) ===');
      console.error('Error:', error.message);
    } else {
      console.log('=== Confirmation Email Send SUCCESS (SMTP) ===');
      console.log('Message ID:', info.messageId);
    }
  });
}

// Send email via external HTTP service (forwards to paid Render service)
function sendEmailViaExternalService(from, to, subject, text, fileData, fileId) {
  console.log('=== Starting Email Send Process (External Service) ===');
  const emailStartTime = Date.now();
  
  // Read file attachment as base64
  const attachment = fs.readFileSync(fileData.path);
  const attachmentBase64 = attachment.toString('base64');
  
  // Prepare email data
  const emailData = {
    from: from,
    to: to,
    subject: subject,
    text: text,
    attachment: {
      filename: fileData.originalName,
      content: attachmentBase64,
      encoding: 'base64'
    }
  };
  
  // Parse and normalize URL
  let normalizedUrl = emailServiceUrl.trim();
  
  // Add protocol if missing (default to https for Render services)
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = 'https://' + normalizedUrl;
    console.log(`URL missing protocol, defaulting to HTTPS: ${normalizedUrl}`);
  }
  
  // Ensure path includes /api/send-email if not already present
  if (!normalizedUrl.includes('/api/send-email')) {
    // Remove trailing slash if present, then add path
    normalizedUrl = normalizedUrl.replace(/\/$/, '') + '/api/send-email';
    console.log(`URL missing path, adding /api/send-email: ${normalizedUrl}`);
  }
  
  let url;
  try {
    url = new URL(normalizedUrl);
  } catch (error) {
    console.error('=== Email Send FAILED (Invalid URL) ===');
    console.error(`Invalid EMAIL_SERVICE_URL: ${emailServiceUrl}`);
    console.error(`Normalized URL: ${normalizedUrl}`);
    console.error(`Error: ${error.message}`);
    console.error('=== Email Send Complete (FAILED) ===\n');
    return;
  }
  
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;
  
  const postData = JSON.stringify(emailData);
  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + (url.search || ''),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  // Add optional API key header if provided
  if (emailServiceApiKey) {
    options.headers['X-API-Key'] = emailServiceApiKey;
  }
  
  console.log(`Sending email request to: ${normalizedUrl}`);
  console.log(`Parsed URL - Hostname: ${url.hostname}, Port: ${options.port}, Path: ${options.path}`);
  
  const req = client.request(options, (res) => {
    let responseData = '';
    
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      const emailDuration = ((Date.now() - emailStartTime) / 1000).toFixed(2);
      
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('=== Email Send SUCCESS (External Service) ===');
        console.log(`Duration: ${emailDuration}s`);
        console.log('Status Code:', res.statusCode);
        console.log('Response:', responseData);
        console.log('=== Email Send Complete (SUCCESS) ===\n');
        
        // Clean up file
        if (fs.existsSync(fileData.path)) {
          fs.unlinkSync(fileData.path);
          console.log(`Temporary file ${fileData.path} cleaned up`);
        }
        uploadedFiles.delete(fileId);
      } else {
        console.error('=== Email Send FAILED (External Service) ===');
        console.error(`Duration: ${emailDuration}s`);
        console.error('Status Code:', res.statusCode);
        console.error('Response:', responseData);
        console.error('=== Email Send Complete (FAILED) ===\n');
        
        // Clean up file after delay
        setTimeout(() => {
          if (fs.existsSync(fileData.path)) {
            fs.unlinkSync(fileData.path);
          }
          uploadedFiles.delete(fileId);
        }, 5000);
      }
    });
  });
  
  req.on('error', (error) => {
    const emailDuration = ((Date.now() - emailStartTime) / 1000).toFixed(2);
    console.error('=== Email Send FAILED (External Service) ===');
    console.error(`Duration: ${emailDuration}s`);
    console.error('Error:', error.message);
    console.error('Error Code:', error.code);
    
    // Provide helpful guidance for common errors
    if (error.code === 'ENOTFOUND') {
      console.error('');
      console.error('⚠️  HOSTNAME NOT FOUND - DNS Resolution Failed');
      console.error(`   The hostname "${url.hostname}" could not be resolved.`);
      console.error('');
      console.error('   For Render services, use the full URL format:');
      console.error('   ✅ Correct: https://your-service-name.onrender.com');
      console.error('   ✅ Or just: your-service-name.onrender.com (auto-adds https://)');
      console.error('   ❌ Wrong: your-service-name:10000 (missing domain)');
      console.error('');
      console.error(`   Your current EMAIL_SERVICE_URL: ${emailServiceUrl}`);
      console.error(`   Normalized to: ${normalizedUrl}`);
      console.error('');
      console.error('   To fix: Update EMAIL_SERVICE_URL in Render environment variables');
      console.error('           to use your full Render service URL (e.g., .onrender.com)');
      console.error('');
    }
    
    console.error('Error Stack:', error.stack);
    console.error('Request URL:', normalizedUrl);
    console.error('Request Options:', JSON.stringify(options, null, 2));
    console.error('=== Email Send Complete (FAILED) ===\n');
    
    // Clean up file after delay
    setTimeout(() => {
      if (fs.existsSync(fileData.path)) {
        fs.unlinkSync(fileData.path);
      }
      uploadedFiles.delete(fileId);
    }, 5000);
  });
  
  req.write(postData);
  req.end();
}

// Send email via SendGrid API (works on free Render plans)
function sendEmailViaSendGrid(from, to, subject, text, fileData, fileId) {
  console.log('=== Starting Email Send Process (SendGrid API) ===');
  const emailStartTime = Date.now();
  
  // Read file attachment
  const attachment = fs.readFileSync(fileData.path);
  const attachmentBase64 = attachment.toString('base64');
  
  const msg = {
    to: to,
    from: from,
    subject: subject,
    text: text,
    attachments: [
      {
        content: attachmentBase64,
        filename: fileData.originalName,
        type: 'application/octet-stream',
        disposition: 'attachment'
      }
    ]
  };
  
  sendgrid.send(msg)
    .then((response) => {
      const emailDuration = ((Date.now() - emailStartTime) / 1000).toFixed(2);
      console.log('=== Email Send SUCCESS (SendGrid) ===');
      console.log(`Duration: ${emailDuration}s`);
      console.log('Status Code:', response[0].statusCode);
      console.log('Response:', response[0].body);
      console.log('=== Email Send Complete (SUCCESS) ===\n');
      
      // Clean up file
      if (fs.existsSync(fileData.path)) {
        fs.unlinkSync(fileData.path);
        console.log(`Temporary file ${fileData.path} cleaned up`);
      }
      uploadedFiles.delete(fileId);
    })
    .catch((error) => {
      const emailDuration = ((Date.now() - emailStartTime) / 1000).toFixed(2);
      console.error('=== Email Send FAILED (SendGrid) ===');
      console.error(`Duration: ${emailDuration}s`);
      console.error('Error:', error.message);
      if (error.response) {
        console.error('Status Code:', error.response.statusCode);
        console.error('Response Body:', JSON.stringify(error.response.body, null, 2));
      }
      console.error('=== Email Send Complete (FAILED) ===\n');
      
      // Clean up file after delay
      setTimeout(() => {
        if (fs.existsSync(fileData.path)) {
          fs.unlinkSync(fileData.path);
        }
        uploadedFiles.delete(fileId);
      }, 5000);
    });
}

// Send email via SMTP (requires paid Render plan)
function sendEmailViaSMTP(mailOptions, fileData, fileId) {
  console.log('=== Starting Email Send Process (SMTP) ===');
  console.log(`Connecting to SMTP server: ${smtpConfig.host}:${smtpConfig.port}...`);
  
  const emailStartTime = Date.now();
  
  emailTransporter.sendMail(mailOptions, (error, info) => {
    const emailDuration = ((Date.now() - emailStartTime) / 1000).toFixed(2);
    
    if (error) {
      console.error('=== Email Send FAILED ===');
      console.error(`Duration: ${emailDuration}s`);
      console.error('Error:', error.message);
      console.error('Error Code:', error.code);
      console.error('Error Command:', error.command);
      console.error('Error Response:', error.response);
      console.error('Error Response Code:', error.responseCode);
      console.error('Full Error Object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        console.error('CONNECTION ERROR: Unable to connect to SMTP server');
        console.error('Possible causes:');
        console.error('  - SMTP_HOST is incorrect');
        console.error('  - SMTP_PORT is incorrect');
        console.error('  - Firewall blocking connection');
        console.error('  - Network connectivity issue');
        console.error('  - FREE RENDER PLANS BLOCK SMTP PORTS (25, 465, 587)');
        console.error('  - Solution: Set SENDGRID_API_KEY to use SendGrid API instead');
      } else if (error.code === 'EAUTH') {
        console.error('AUTHENTICATION ERROR: SMTP credentials are incorrect');
        console.error('  - Check SMTP_USER');
        console.error('  - Check SMTP_PASS (use App Password for Gmail)');
      } else {
        console.error('UNKNOWN ERROR: Check error details above');
      }
      
      console.error('WARNING: Order was submitted but email notification failed');
      console.error('=== Email Send Complete (FAILED) ===\n');
    } else {
      console.log('=== Email Send SUCCESS ===');
      console.log(`Duration: ${emailDuration}s`);
      console.log('Message ID:', info.messageId);
      console.log('Response:', info.response);
      console.log('Accepted:', info.accepted);
      console.log('Rejected:', info.rejected);
      console.log('=== Email Send Complete (SUCCESS) ===\n');
    }
    
    // Clean up file after sending (or after timeout)
    setTimeout(() => {
      if (fs.existsSync(fileData.path)) {
        fs.unlinkSync(fileData.path);
        console.log(`Temporary file ${fileData.path} cleaned up`);
      }
      uploadedFiles.delete(fileId);
    }, 5000); // Wait 5 seconds to allow email to send
  });
  
  // Add timeout warning
  setTimeout(() => {
    console.log('WARNING: Email send is taking longer than 10 seconds...');
  }, 10000);
  
  setTimeout(() => {
    console.log('WARNING: Email send is taking longer than 30 seconds - possible connection issue');
  }, 30000);
}

// Start server (only if running as standalone)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} for the quote page`);
    console.log(`Visit http://localhost:${PORT}/admin for the admin page`);
  });
} else {
  // Being required as a module - export the app
  module.exports = app;
}

