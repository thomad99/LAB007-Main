// LAB007 Unified Services - Main Server
// Combines all projects: 3dPrint, Citrix-Horizon, VINValue, Web-Alert

const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve main landing page
app.use(express.static(path.join(__dirname, 'public')));

// Serve LAB007 images
app.use('/images', express.static(path.join(__dirname, 'LAB007', 'Images')));

// ========== 3D Print Project ==========
// Serve 3D Print static files
app.use('/3dprint', express.static(path.join(__dirname, '3dPrint', 'public')));
app.use('/3dprint/images', express.static(path.join(__dirname, '3dPrint', 'images')));

// Import 3D Print routes (we'll need to modify 3dPrint/server.js to export routes)
// For now, we'll include the route handlers directly
const print3dRoutes = require('./3dPrint/server-routes');
app.use('/3dprint/api', print3dRoutes);
app.get('/3dprint', (req, res) => {
    res.sendFile(path.join(__dirname, '3dPrint', 'public', 'index.html'));
});
app.get('/3dprint/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '3dPrint', 'public', 'admin.html'));
});

// ========== Citrix-Horizon Project ==========
// Serve Citrix static files
app.use('/citrix', express.static(path.join(__dirname, 'Citrix-Horizon', 'Web')));
app.use('/citrix/images', express.static(path.join(__dirname, 'Citrix-Horizon', 'images')));

// Import Citrix routes
const citrixRoutes = require('./Citrix-Horizon/server-routes');
app.use('/citrix/api', citrixRoutes);
app.get('/citrix', (req, res) => {
    res.sendFile(path.join(__dirname, 'Citrix-Horizon', 'Web', 'upload.html'));
});
app.get('/citrix/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'Citrix-Horizon', 'Web', 'index.html'));
});
app.get('/citrix/todo', (req, res) => {
    res.sendFile(path.join(__dirname, 'Citrix-Horizon', 'Web', 'todo.html'));
});

// ========== VINValue Project ==========
// Serve VINValue static files
app.use('/vinvalue', express.static(path.join(__dirname, 'VINValue', 'public')));

// Import VINValue routes
const vinValueRoutes = require('./VINValue/server-routes');
app.use('/vinvalue/api', vinValueRoutes);
app.get('/vinvalue', (req, res) => {
    res.sendFile(path.join(__dirname, 'VINValue', 'public', 'index.html'));
});

// ========== Web-Alert Project ==========
// Serve Web-Alert static files
app.use('/webalert', express.static(path.join(__dirname, 'Web-Alert', 'frontend', 'public')));
app.use('/webalert/src', express.static(path.join(__dirname, 'Web-Alert', 'frontend', 'src')));

// Import Web-Alert routes
const webAlertRoutes = require('./Web-Alert/backend/server-routes');
app.use('/webalert/api', webAlertRoutes);
app.get('/webalert', (req, res) => {
    res.sendFile(path.join(__dirname, 'Web-Alert', 'frontend', 'public', 'index.html'));
});
app.get('/webalert/status', (req, res) => {
    res.sendFile(path.join(__dirname, 'Web-Alert', 'frontend', 'public', 'status.html'));
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
        }
    });
});

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
});
