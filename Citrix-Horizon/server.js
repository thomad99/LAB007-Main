// server.js
// Express server for Citrix Audit Dashboard on Render

const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const MSPATCH_CACHE_MS = 6 * 60 * 60 * 1000;
let mspatchCache = {
    at: 0,
    key: '',
    payload: null
};

// Boot diagnostics
console.log('BOOT:', __filename);
console.log('DIR :', __dirname);
console.log('CWD :', process.cwd());

// Enable CORS
app.use(cors());

// Middleware
app.use(express.json());

// Serve static files - images first (higher priority), then Web directory and Reports
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use(express.static(path.join(__dirname, 'Web')));
// Reports folder (for Horizon Admin scripts output like FarmData.html / FarmData.json)
app.use('/Reports', express.static(path.join(__dirname, 'Reports')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // Keep original filename
        cb(null, file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
    },
    fileFilter: function (req, file, cb) {
        // Only allow JSON files
        if (file.mimetype === 'application/json' || path.extname(file.originalname).toLowerCase() === '.json') {
            cb(null, true);
        } else {
            cb(new Error('Only JSON files are allowed'));
        }
    }
});

// Routes

// Dashboard as default landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Web', 'index.html'));
});

// Upload page (explicit)
app.get('/upload', (req, res) => {
    res.sendFile(path.join(__dirname, 'Web', 'upload.html'));
});

// Dashboard page (alias)
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'Web', 'index.html'));
});

// To-do page
app.get('/todo', (req, res) => {
    res.sendFile(path.join(__dirname, 'Web', 'todo.html'));
});

// DiagCreator page
app.get('/diagcreator', (req, res) => {
    res.sendFile(path.join(__dirname, 'Web', 'diagcreator.html'));
});

// Upload JSON file
app.post('/api/upload', upload.single('jsonFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileInfo = {
            filename: req.file.filename,
            originalname: req.file.originalname,
            size: req.file.size,
            uploadedAt: new Date().toISOString()
        };

        // Copy to a standard location for the dashboard to access
        const standardPath = path.join(uploadsDir, 'citrix-audit-complete.json');
        fs.copyFileSync(req.file.path, standardPath);

        res.json({
            success: true,
            message: 'File uploaded successfully',
            file: fileInfo,
            redirectUrl: '/dashboard'
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload file: ' + error.message });
    }
});

// List master image JSON files
app.get('/api/master-image-files', (req, res) => {
    try {
        // Scan multiple known locations
        const dirsToScan = [
            __dirname, // Citrix-Horizon root
            path.join(__dirname, 'Web'),
            path.join(__dirname, 'Web', 'Data'),
            path.join(__dirname, 'Data')
        ];

        const candidates = [];

        const addMatches = (dir) => {
            if (!fs.existsSync(dir)) return;
            const files = fs.readdirSync(dir);
            files.forEach(f => {
                const lower = f.toLowerCase();
                if (lower.endsWith('-master-images.json') || f === 'Prod_Images.json' || f === 'Test_Images.json') {
                    candidates.push(f);
                }
            });
        };

        dirsToScan.forEach(addMatches);

        const unique = Array.from(new Set(candidates));
        res.json({ files: unique });
    } catch (err) {
        console.error('Error listing master image files:', err);
        res.status(500).json({ error: 'Unable to list master image files' });
    }
});

// Get list of uploaded files
app.get('/api/files', (req, res) => {
    try {
        const files = fs.readdirSync(uploadsDir)
            .filter(file => file.endsWith('.json'))
            .map(file => {
                const filePath = path.join(uploadsDir, file);
                const stats = fs.statSync(filePath);
                return {
                    filename: file,
                    size: stats.size,
                    uploadedAt: stats.mtime.toISOString()
                };
            })
            .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

        res.json({ files });
    } catch (error) {
        console.error('Error listing files:', error);
        res.status(500).json({ error: 'Failed to list files' });
    }
});

function httpsGetJson(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers }, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    return reject(new Error(`HTTP ${response.statusCode} from ${url}`));
                }
                try {
                    resolve(JSON.parse(body || '{}'));
                } catch (e) {
                    reject(new Error(`Invalid JSON from ${url}: ${e.message}`));
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function monthKeyFromDate(dateObj) {
    const y = dateObj.getUTCFullYear();
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function buildMonthRange(months = 24) {
    const n = Math.max(1, Math.min(36, parseInt(months, 10) || 24));
    const now = new Date();
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        out.push(monthKeyFromDate(d));
    }
    return out;
}

function classifyOsFromProductName(productName) {
    const p = String(productName || '').toLowerCase();
    if (!p) return [];
    const hit = [];
    if (p.includes('windows 10') && !p.includes('server')) hit.push('win10');
    if (p.includes('windows 11') && !p.includes('server')) hit.push('win11');
    if (p.includes('windows server 2016')) hit.push('server2016');
    if (p.includes('windows server 2022')) hit.push('server2022');
    // Microsoft currently labels latest LTSC as Server 2025 in many feeds; bucket under requested "2026".
    if (p.includes('windows server 2026') || p.includes('windows server 2025')) hit.push('server2026');
    return hit;
}

function collectProductNamesById(node, out = {}) {
    if (!node || typeof node !== 'object') return out;

    const addProduct = (entry) => {
        if (!entry || typeof entry !== 'object') return;
        const id = String(entry.ProductID || '').trim();
        const value = String(entry.Value || '').trim();
        if (id && value) out[id] = value;
    };

    if (Array.isArray(node)) {
        node.forEach((child) => collectProductNamesById(child, out));
        return out;
    }

    addProduct(node);

    if (Array.isArray(node.FullProductName)) {
        node.FullProductName.forEach(addProduct);
    } else if (node.FullProductName && typeof node.FullProductName === 'object') {
        addProduct(node.FullProductName);
    }

    if (Array.isArray(node.Branch)) {
        node.Branch.forEach((child) => collectProductNamesById(child, out));
    } else if (node.Branch && typeof node.Branch === 'object') {
        collectProductNamesById(node.Branch, out);
    }

    if (node.ProductTree) {
        collectProductNamesById(node.ProductTree, out);
    }

    return out;
}

function normalizeProductStatusRows(productStatuses) {
    if (Array.isArray(productStatuses)) return productStatuses;
    if (!productStatuses || typeof productStatuses !== 'object') return [];
    if (Array.isArray(productStatuses.ProductStatus)) return productStatuses.ProductStatus;
    if (productStatuses.ProductStatus && typeof productStatuses.ProductStatus === 'object') {
        return [productStatuses.ProductStatus];
    }
    return [];
}

function normalizeProductIds(statusRow) {
    if (!statusRow || typeof statusRow !== 'object') return [];
    if (Array.isArray(statusRow.ProductID)) return statusRow.ProductID;
    if (statusRow.ProductID != null) return [statusRow.ProductID];
    return [];
}

async function buildMsPatchMonthlySummary(months = 24) {
    const monthRange = buildMonthRange(months);
    const monthSet = new Set(monthRange);
    const startMonth = monthRange[0];
    const headers = { Accept: 'application/json' };
    const apiKey = String(process.env.MSRC_API_KEY || '').trim();
    if (apiKey) headers.apiKey = apiKey;

    const updatesUrl = 'https://api.msrc.microsoft.com/cvrf/v2.0/updates';
    const updatesJson = await httpsGetJson(updatesUrl, headers);
    const updates = Array.isArray(updatesJson.value) ? updatesJson.value : [];

    const filteredUpdates = updates.filter((u) => {
        const dt = new Date(u.InitialReleaseDate || u.CurrentReleaseDate || 0);
        if (isNaN(dt.getTime())) return false;
        return monthKeyFromDate(dt) >= startMonth;
    });

    const countsByMonth = {};
    monthRange.forEach((m) => {
        countsByMonth[m] = {
            win10: new Set(),
            win11: new Set(),
            server2016: new Set(),
            server2022: new Set(),
            server2026: new Set()
        };
    });

    for (const update of filteredUpdates) {
        const releaseDate = new Date(update.InitialReleaseDate || update.CurrentReleaseDate || 0);
        if (isNaN(releaseDate.getTime())) continue;
        const releaseMonth = monthKeyFromDate(releaseDate);
        if (!monthSet.has(releaseMonth)) continue;

        const docId = update.ID || update.CvrfUrl || update.Alias;
        if (!docId) continue;
        const docPath = String(docId).split('/').pop();
        const documentUrl = `https://api.msrc.microsoft.com/cvrf/v2.0/document/${encodeURIComponent(docPath)}`;

        let doc;
        try {
            doc = await httpsGetJson(documentUrl, headers);
        } catch (err) {
            console.warn('MSPatch document fetch failed:', docPath, err.message);
            continue;
        }

        const productNamesById = collectProductNamesById(doc?.ProductTree, {});

        const vulnerabilities = Array.isArray(doc?.Vulnerability) ? doc.Vulnerability : [];
        for (const vuln of vulnerabilities) {
            const cve = String(vuln?.CVE || vuln?.ID || '').trim();
            if (!cve) continue;

            const productStatusRows = normalizeProductStatusRows(vuln?.ProductStatuses);
            if (!productStatusRows.length) continue;

            const osHits = new Set();
            for (const statusRow of productStatusRows) {
                const pids = normalizeProductIds(statusRow);
                for (const pid of pids) {
                    const osList = classifyOsFromProductName(productNamesById[String(pid)] || '');
                    osList.forEach((os) => osHits.add(os));
                }
            }

            osHits.forEach((os) => {
                countsByMonth[releaseMonth][os].add(cve);
            });
        }
    }

    const monthly = [...monthRange].reverse().map((m) => ({
        month: m,
        win10: countsByMonth[m].win10.size,
        win11: countsByMonth[m].win11.size,
        server2016: countsByMonth[m].server2016.size,
        server2022: countsByMonth[m].server2022.size,
        server2026: countsByMonth[m].server2026.size
    }));

    return {
        ok: true,
        months: monthRange.length,
        monthly,
        fetchedAt: new Date().toISOString(),
        source: 'MSRC CVRF v2.0'
    };
}

app.get('/api/mspatch/cves/monthly', async (req, res) => {
    try {
        const months = Math.max(1, Math.min(36, parseInt(req.query.months, 10) || 24));
        const cacheKey = `months:${months}`;
        if (
            mspatchCache.payload &&
            mspatchCache.key === cacheKey &&
            Date.now() - mspatchCache.at < MSPATCH_CACHE_MS
        ) {
            return res.json(mspatchCache.payload);
        }

        const payload = await buildMsPatchMonthlySummary(months);
        mspatchCache = {
            at: Date.now(),
            key: cacheKey,
            payload
        };
        return res.json(payload);
    } catch (error) {
        console.error('MSPatch API error:', error);
        return res.status(500).json({
            ok: false,
            error: error.message || 'Failed to build MSPatch summary.'
        });
    }
});

// Download uploaded JSON file
app.get('/api/download/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(uploadsDir, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.download(filePath, filename);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

// Download audit files from GitHub as ZIP
app.get('/api/download-audit-files', async (req, res) => {
    try {
        const githubRepo = 'thomad99/CitrixtoHZ';
        const branch = 'master';
        const githubZipUrl = `https://github.com/${githubRepo}/archive/refs/heads/${branch}.zip`;
        const zipFilename = 'Citrix-Audit-Tools.zip';
        
        // Fetch from GitHub
        const https = require('https');
        const http = require('http');
        
        return new Promise((resolve, reject) => {
            const protocol = githubZipUrl.startsWith('https') ? https : http;
            
            console.log(`Downloading from GitHub (branch: ${branch})...`);
            
            protocol.get(githubZipUrl, (githubRes) => {
                if (githubRes.statusCode === 301 || githubRes.statusCode === 302) {
                    // Follow redirect
                    return protocol.get(githubRes.headers.location, (redirectRes) => {
                        handleResponse(redirectRes);
                    }).on('error', (err) => {
                        console.error('Error following redirect:', err.message);
                        console.log('Falling back to local files...');
                        downloadLocalFiles(req, res);
                    });
                } else if (githubRes.statusCode !== 200) {
                    // If GitHub download fails, fall back to local files
                    console.log(`GitHub download failed (status: ${githubRes.statusCode}), falling back to local files...`);
                    return downloadLocalFiles(req, res);
                } else {
                    handleResponse(githubRes);
                }
                
                function handleResponse(response) {
                    console.log(`Successfully downloading from GitHub (branch: ${branch})`);
                    res.setHeader('Content-Type', 'application/zip');
                    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
                    response.pipe(res);
                    response.on('end', () => {
                        console.log('GitHub download completed');
                        resolve();
                    });
                }
            }).on('error', (err) => {
                console.error('Error downloading from GitHub:', err.message);
                console.log('Falling back to local files...');
                downloadLocalFiles(req, res);
            });
        });
    } catch (error) {
        console.error('ZIP download error:', error);
        // Fall back to local files
        downloadLocalFiles(req, res);
    }
});

// Helper function to download local files as ZIP (fallback)
function downloadLocalFiles(req, res) {
    try {
        const zipFilename = 'Citrix-Audit-Tools.zip';
        res.attachment(zipFilename);

        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        archive.on('error', (err) => {
            console.error('Archive error:', err);
            res.status(500).json({ error: 'Failed to create ZIP file' });
        });

        archive.pipe(res);

        // Add all PowerShell scripts
        const scriptsDir = path.join(__dirname, 'Scripts');
        if (fs.existsSync(scriptsDir)) {
            archive.directory(scriptsDir, 'Scripts');
        }

        // Add Web files (for local dashboard)
        const webDir = path.join(__dirname, 'Web');
        if (fs.existsSync(webDir)) {
            archive.directory(webDir, 'Web');
        }

        // Add root files
        const rootFiles = [
            'package.json',
            'README.md',
            'README.txt',
            'Sync-ToGitHub.ps1',
            'render.yaml',
            '.gitignore'
        ];

        rootFiles.forEach(file => {
            const filePath = path.join(__dirname, file);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: file });
            }
        });

        // Add Dependencies folder (including all prerequisite files and installers)
        const depsDir = path.join(__dirname, 'Dependencies');
        if (fs.existsSync(depsDir)) {
            archive.directory(depsDir, 'Dependencies');
        }

        // Add images folder
        const imagesDir = path.join(__dirname, 'images');
        if (fs.existsSync(imagesDir)) {
            archive.directory(imagesDir, 'images');
        }

        // Add .gitkeep files
        const gitkeepFiles = [
            path.join(__dirname, 'Data', '.gitkeep'),
            path.join(__dirname, 'Dependencies', 'Citrix', '.gitkeep')
        ];

        gitkeepFiles.forEach(file => {
            if (fs.existsSync(file)) {
                archive.file(file, { name: path.relative(__dirname, file) });
            }
        });

        archive.finalize();
    } catch (error) {
        console.error('ZIP creation error:', error);
        res.status(500).json({ error: 'Failed to create ZIP file: ' + error.message });
    }
}

// Serve uploaded JSON files
app.get('/uploads/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(uploadsDir, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.sendFile(filePath);
    } catch (error) {
        console.error('File serve error:', error);
        res.status(500).json({ error: 'Failed to serve file' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'Citrix Audit Dashboard'
    });
});

// Start server only if run directly (not when required as a sub-app)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Citrix Audit Dashboard server running on port ${PORT}`);
        console.log(`Access the dashboard at: http://localhost:${PORT}`);
        console.log(`Upload files at: http://localhost:${PORT}/`);
    });
}

// Export the app so it can be mounted by the root server
module.exports = app;
