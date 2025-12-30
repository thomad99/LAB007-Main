# On-Demand Browser Loading

## Changes Made

Both Playwright (VINValue) and Puppeteer (Web-Alert) are now loaded **on-demand** instead of at server startup. This significantly reduces initial memory usage.

### VINValue/server.js
- Changed from: `const { chromium } = require('playwright');` (loads at startup)
- Changed to: `async function loadPlaywright()` (loads only when needed)
- Playwright is now loaded when `fetchValuation()` is called

### Web-Alert/backend/services/scraper.js
- Changed from: `const puppeteer = require('puppeteer');` (loads at startup)
- Changed to: `async function loadPuppeteer()` (loads only when needed)
- Puppeteer is now loaded when `initBrowser()` is called

## Benefits

1. **Reduced Startup Memory**: Server starts with minimal memory footprint
2. **Faster Startup**: No browser binaries loaded until needed
3. **Better for 512MB RAM**: Only loads browsers when actually used

## How It Works

1. Server starts without loading browsers
2. When a request comes to `/vinvalue/api/value` or `/webalert/api/monitor`:
   - The browser library is loaded on-demand
   - Browser is initialized
   - Request is processed
   - Browser stays in memory for subsequent requests (cached)

## First Request Delay

The first request to VINValue or Web-Alert may take 5-10 seconds longer as:
- Browser library loads into memory
- Browser binary is initialized
- Subsequent requests are fast (browser stays in memory)

## Note on Submodules

Since the project directories are git submodules, you'll need to commit these changes within each submodule:

```bash
# In VINValue directory
cd VINValue
git add server.js
git commit -m "Load Playwright on-demand"
git push

# In Web-Alert directory  
cd Web-Alert
git add backend/services/scraper.js
git commit -m "Load Puppeteer on-demand"
git push
```

Or, if you want to include the files directly (not as submodules), remove the `.git` folders from each subdirectory.

