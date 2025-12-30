# Integration Notes

## Current Status

The unified server (`server.js`) is set up to serve static files from all projects. However, to fully integrate all API routes, you have two options:

### Option 1: Modify Each Project's server.js (Recommended)

Modify each project's `server.js` to check if it's being used as a module:

```javascript
// At the end of each server.js file, replace:
app.listen(PORT, () => { ... });

// With:
if (require.main === module) {
    // Running as standalone
    app.listen(PORT, () => { ... });
} else {
    // Being required as a module
    module.exports = app;
}
```

Then in the main `server.js`, you can mount them:

```javascript
const print3dApp = require('./3dPrint/server');
app.use('/3dprint', print3dApp);
```

### Option 2: Extract Routes to Separate Files

Create route files for each project that export Express routers, then import them in the unified server.

## Current Implementation

The current `server.js` serves:
- Static files from each project
- Main landing page at `/`
- Health check at `/api/health`

API routes need to be integrated using one of the methods above.

## Next Steps

1. Choose integration method (Option 1 is simpler)
2. Modify each project's server.js
3. Update main server.js to mount the apps
4. Test all routes
5. Deploy to Render

