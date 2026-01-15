// server.js
// Express server for Citrix Audit Dashboard on Render

const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Boot diagnostics
console.log('BOOT:', __filename);
console.log('DIR :', __dirname);
console.log('CWD :', process.cwd());

// Enable CORS
app.use(cors());

// Middleware
app.use(express.json());

// Serve static files - images first (higher priority), then Web directory
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use(express.static(path.join(__dirname, 'Web')));

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
