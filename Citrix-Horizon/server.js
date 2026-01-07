// server.js
// Express server for Citrix Audit Dashboard on Render

const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Middleware
app.use(express.json());

// Serve static files - Web directory first (includes images subdirectory)
app.use(express.static(path.join(__dirname, 'Web')));
// Also serve images from Web/images for compatibility
app.use('/images', express.static(path.join(__dirname, 'Web', 'images')));
// Serve data directory (read-only) for JSON outputs like goldensun-master-images.json
app.use('/data', express.static(path.join(__dirname, 'Data')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Ensure debug directory exists for debug ZIP files
const debugDir = path.join(__dirname, 'uploads', 'debug');
if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
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

// Configure multer for debug ZIP uploads
const debugStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, debugDir);
    },
    filename: function (req, file, cb) {
        // Add timestamp to filename to avoid overwrites
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const originalName = path.parse(file.originalname).name;
        const ext = path.parse(file.originalname).ext;
        cb(null, `${originalName}_${timestamp}${ext}`);
    }
});

const uploadDebug = multer({ 
    storage: debugStorage,
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB limit for debug ZIPs
    },
    fileFilter: function (req, file, cb) {
        // Only allow ZIP files
        if (file.mimetype === 'application/zip' || 
            file.mimetype === 'application/x-zip-compressed' ||
            path.extname(file.originalname).toLowerCase() === '.zip') {
            cb(null, true);
        } else {
            cb(new Error('Only ZIP files are allowed for debug uploads'));
        }
    }
});

// Routes

// Landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Web', 'upload.html'));
});

// Dashboard page
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'Web', 'index.html'));
});

// GoldenSun page
app.get('/goldensun', (req, res) => {
    res.sendFile(path.join(__dirname, 'Web', 'goldensun.html'));
});

// Compatibility route if proxy keeps /citrix prefix
app.get('/citrix/goldensun', (req, res) => {
    res.sendFile(path.join(__dirname, 'Web', 'goldensun.html'));
});

// Trigger master image collection (runs PowerShell discovery script)
app.post('/api/collect-master-images', (req, res) => {
    try {
        const scriptPath = path.join(__dirname, 'Scripts', '20-Get-VMwareMasterImages.ps1');
        const outputPath = path.join(__dirname, 'Data', 'goldensun-master-images.json');

        if (!fs.existsSync(scriptPath)) {
            return res.status(404).json({ error: 'Discovery script not found on server.' });
        }

        // Prefer pwsh if available, fallback to powershell
        const pwshExecutable = process.env.PWSH_PATH || 'pwsh';
        const fallbackExecutable = 'powershell';
        let psExe = pwshExecutable;

        // Quick availability check for pwsh
        try {
            spawn(psExe, ['-v']);
        } catch {
            psExe = fallbackExecutable;
        }

        const args = [
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-File', scriptPath,
            '-OutputPath', outputPath
        ];

        const ps = spawn(psExe, args, { cwd: __dirname });

        let stdout = '';
        let stderr = '';

        ps.stdout.on('data', (data) => { stdout += data.toString(); });
        ps.stderr.on('data', (data) => { stderr += data.toString(); });

        ps.on('close', (code) => {
            if (code === 0) {
                return res.json({
                    success: true,
                    message: 'Master image collection completed.',
                    outputPath: '/data/goldensun-master-images.json',
                    logs: stdout.trim()
                });
            } else {
                return res.status(500).json({
                    error: 'Master image collection failed.',
                    exitCode: code,
                    stderr: stderr.trim(),
                    stdout: stdout.trim()
                });
            }
        });
    } catch (error) {
        console.error('collect-master-images error:', error);
        return res.status(500).json({ error: 'Unexpected server error during collection.' });
    }
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

        // Add Scripts directory
        const scriptsDir = path.join(__dirname, 'Scripts');
        if (fs.existsSync(scriptsDir)) {
            archive.directory(scriptsDir, 'Scripts');
        } else {
            res.status(404).json({ error: 'Scripts directory not found' });
            return;
        }

        // Add Web directory
        const webDir = path.join(__dirname, 'Web');
        if (fs.existsSync(webDir)) {
            archive.directory(webDir, 'Web');
        } else {
            console.warn('Web directory not found, continuing without it');
        }

        archive.finalize();
    } catch (error) {
        console.error('ZIP creation error:', error);
        res.status(500).json({ error: 'Failed to create ZIP file: ' + error.message });
    }
}

// GitHub API helper function to upload file to GitHub
function uploadFileToGitHub(filePath, fileName, fileContent) {
    return new Promise((resolve) => {
        const githubToken = process.env.GITHUB_TOKEN;
        const githubRepo = process.env.GITHUB_REPO || 'thomad99/LAB007-Main';
        const githubBranch = process.env.GITHUB_BRANCH || 'master';
        
        if (!githubToken) {
            console.warn('GITHUB_TOKEN not set. Skipping GitHub sync.');
            resolve({ success: false, error: 'GITHUB_TOKEN not configured' });
            return;
        }
        
        // GitHub API endpoint for creating/updating a file
        const apiPath = `/repos/${githubRepo}/contents/Citrix-Horizon/Debug/${fileName}`;
        
        // Read file content and encode to base64
        let content;
        if (fileContent) {
            content = Buffer.from(fileContent).toString('base64');
        } else {
            content = fs.readFileSync(filePath).toString('base64');
        }
        
        // First, check if file exists to get SHA (required for updates)
        const checkOptions = {
            hostname: 'api.github.com',
            path: `${apiPath}?ref=${githubBranch}`,
            method: 'GET',
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'LAB007-Citrix-Dashboard'
            }
        };
        
        https.get(checkOptions, (checkRes) => {
            let checkData = '';
            
            checkRes.on('data', (chunk) => {
                checkData += chunk;
            });
            
            checkRes.on('end', () => {
                let sha = null;
                
                if (checkRes.statusCode === 200) {
                    try {
                        const existingFile = JSON.parse(checkData);
                        sha = existingFile.sha;
                        console.log(`File exists on GitHub, will update (SHA: ${sha.substring(0, 7)}...)`);
                    } catch (e) {
                        console.warn('Failed to parse existing file info:', e.message);
                    }
                } else if (checkRes.statusCode !== 404) {
                    console.warn(`GitHub API check returned status ${checkRes.statusCode}: ${checkData}`);
                }
                
                // Prepare request body
                const body = {
                    message: `Upload debug file: ${fileName}`,
                    content: content,
                    branch: githubBranch
                };
                
                if (sha) {
                    body.sha = sha; // Required for updates
                }
                
                const bodyString = JSON.stringify(body);
                
                // Upload/update file
                const uploadOptions = {
                    hostname: 'api.github.com',
                    path: apiPath,
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${githubToken}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(bodyString),
                        'User-Agent': 'LAB007-Citrix-Dashboard'
                    }
                };
                
                const uploadReq = https.request(uploadOptions, (uploadRes) => {
                    let uploadData = '';
                    
                    uploadRes.on('data', (chunk) => {
                        uploadData += chunk;
                    });
                    
                    uploadRes.on('end', () => {
                        if (uploadRes.statusCode === 200 || uploadRes.statusCode === 201) {
                            try {
                                const result = JSON.parse(uploadData);
                                console.log(`Successfully synced ${fileName} to GitHub`);
                                resolve({
                                    success: true,
                                    url: result.content.html_url,
                                    sha: result.content.sha
                                });
                            } catch (e) {
                                console.error('Failed to parse GitHub response:', e.message);
                                resolve({
                                    success: false,
                                    error: 'Failed to parse GitHub response'
                                });
                            }
                        } else {
                            console.error(`GitHub API upload failed: ${uploadRes.statusCode} - ${uploadData}`);
                            resolve({
                                success: false,
                                error: `GitHub API returned status ${uploadRes.statusCode}`
                            });
                        }
                    });
                });
                
                uploadReq.on('error', (error) => {
                    console.error('GitHub upload request error:', error);
                    resolve({
                        success: false,
                        error: error.message
                    });
                });
                
                uploadReq.write(bodyString);
                uploadReq.end();
            });
        }).on('error', (error) => {
            console.error('GitHub check request error:', error);
            resolve({
                success: false,
                error: error.message
            });
        });
    });
}

// Upload Debug ZIP file
app.post('/api/upload-debug', uploadDebug.single('debugFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileInfo = {
            filename: req.file.filename,
            originalname: req.file.originalname,
            size: req.file.size,
            uploadedAt: new Date().toISOString(),
            path: req.file.path
        };

        console.log(`Debug ZIP uploaded: ${fileInfo.filename} (${fileInfo.size} bytes)`);

        // Sync to GitHub asynchronously
        uploadFileToGitHub(req.file.path, req.file.filename, null)
            .then((githubResult) => {
                if (githubResult.success) {
                    console.log(`Debug file synced to GitHub: ${githubResult.url}`);
                } else {
                    console.warn(`Failed to sync to GitHub: ${githubResult.error}`);
                }
            })
            .catch((error) => {
                console.error('GitHub sync error:', error);
            });

        res.json({
            success: true,
            message: 'Debug ZIP file uploaded successfully. Syncing to GitHub...',
            file: fileInfo,
            githubSync: 'In progress'
        });
    } catch (error) {
        console.error('Debug upload error:', error);
        res.status(500).json({ error: 'Failed to upload debug file: ' + error.message });
    }
});

// Get list of debug files (from local uploads directory)
app.get('/api/debug-files', (req, res) => {
    try {
        const files = [];
        
        // Check local directory
        if (fs.existsSync(debugDir)) {
            const localFiles = fs.readdirSync(debugDir)
                .filter(file => file.endsWith('.zip'))
                .map(file => {
                    const filePath = path.join(debugDir, file);
                    const stats = fs.statSync(filePath);
                    return {
                        filename: file,
                        size: stats.size,
                        uploadedAt: stats.mtime.toISOString(),
                        source: 'local'
                    };
                });
            files.push(...localFiles);
        }
        
        files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

        res.json({ 
            files,
            note: 'Files are automatically synced to GitHub at: https://github.com/thomad99/CitrixtoHZ/tree/master/Citrix-Horizon/Debug'
        });
    } catch (error) {
        console.error('Error listing debug files:', error);
        res.status(500).json({ error: 'Failed to list debug files' });
    }
});

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

// Serve debug ZIP files
app.get('/uploads/debug/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(debugDir, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Debug file not found' });
        }

        res.download(filePath, filename);
    } catch (error) {
        console.error('Debug file serve error:', error);
        res.status(500).json({ error: 'Failed to serve debug file' });
    }
});

// Health check endpoint
// Audit Configuration API
app.get('/api/audit-config', (req, res) => {
    const configPath = path.join(__dirname, 'lab007-config.json');

    try {
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);
            res.json(config);
        } else {
            // Return default configuration
            const defaultConfig = {
                runPreReqCheck: true,
                auditComponents: {
                    SiteInfo: true,
                    Applications: true,
                    Desktops: true,
                    Catalogs: true,
                    DeliveryGroups: true,
                    UsageStats: true,
                    Policies: true,
                    Roles: true,
                    VMwareSpecs: false,
                    Servers: true,
                    DirectorOData: true
                }
            };
            res.json(defaultConfig);
        }
    } catch (error) {
        console.error('Error reading audit config:', error);
        res.status(500).json({ error: 'Failed to read audit configuration' });
    }
});

app.get('/citrix/api/audit-config', (req, res) => {
    const configPath = path.join(__dirname, 'lab007-config.json');

    try {
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);
            res.json(config);
        } else {
            // Return default configuration
            const defaultConfig = {
                runPreReqCheck: true,
                auditComponents: {
                    SiteInfo: true,
                    Applications: true,
                    Desktops: true,
                    Catalogs: true,
                    DeliveryGroups: true,
                    UsageStats: true,
                    Policies: true,
                    Roles: true,
                    VMwareSpecs: false,
                    Servers: true,
                    DirectorOData: true
                }
            };
            res.json(defaultConfig);
        }
    } catch (error) {
        console.error('Error reading audit config:', error);
        res.status(500).json({ error: 'Failed to read audit configuration' });
    }
});

app.post('/api/audit-config', (req, res) => {
    const configPath = path.join(__dirname, 'lab007-config.json');

    try {
        const newConfig = req.body;

        // Validate the configuration structure
        if (!newConfig || typeof newConfig.runPreReqCheck !== 'boolean' || !newConfig.auditComponents) {
            return res.status(400).json({ error: 'Invalid configuration format' });
        }

        // Write the configuration to file
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');

        console.log('Audit configuration saved:', newConfig);
        res.json({ success: true, message: 'Configuration saved successfully' });

    } catch (error) {
        console.error('Error saving audit config:', error);
        res.status(500).json({ error: 'Failed to save audit configuration' });
    }
});

app.post('/citrix/api/audit-config', (req, res) => {
    const configPath = path.join(__dirname, 'lab007-config.json');

    try {
        const newConfig = req.body;

        // Validate the configuration structure
        if (!newConfig || typeof newConfig.runPreReqCheck !== 'boolean' || !newConfig.auditComponents) {
            return res.status(400).json({ error: 'Invalid configuration format' });
        }

        // Write the configuration to file
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');

        console.log('Audit configuration saved:', newConfig);
        res.json({ success: true, message: 'Configuration saved successfully' });

    } catch (error) {
        console.error('Error saving audit config:', error);
        res.status(500).json({ error: 'Failed to save audit configuration' });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'Citrix Audit Dashboard'
    });
});

// Start server (only if running as standalone)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Citrix Audit Dashboard server running on port ${PORT}`);
    console.log(`Access the dashboard at: http://localhost:${PORT}`);
    console.log(`Upload files at: http://localhost:${PORT}/`);
  });
} else {
  // Being required as a module - export the app
  module.exports = app;
}

