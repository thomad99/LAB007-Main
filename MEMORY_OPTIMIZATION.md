# Memory Optimization Guide

## Problem
The unified service requires over 8GB RAM due to Playwright and Puppeteer browser installations, but Render free tier only provides 512MB.

## Solution Options

### Option 1: Defer Browser Installation (Recommended)
Browsers (Playwright/Puppeteer) are now marked as `optionalDependencies` and won't install during build. They'll be installed on-demand when first used.

**Build Command:**
```bash
npm install --no-optional
```

**Start Command:**
```bash
npm start
```

### Option 2: Use Lighter Alternatives

#### For VINValue (Playwright):
- Consider using a headless browser service API
- Or use a lighter scraping library like `cheerio` + `axios` if the site doesn't require JavaScript

#### For Web-Alert (Puppeteer):
- Consider using `playwright-core` instead of full `playwright` (smaller)
- Or use a headless browser service
- Or switch to `cheerio` for static content

### Option 3: Split Services
Deploy projects separately:
- **Service 1:** 3D Print + Citrix (no browsers needed) - ~200MB
- **Service 2:** VINValue (Playwright) - ~2GB
- **Service 3:** Web-Alert (Puppeteer) - ~2GB

### Option 4: Upgrade Render Plan
Upgrade to a paid Render plan with more RAM (Starter plan: $7/month, 512MB RAM; Standard: $25/month, 2GB RAM)

## Current Configuration

The `package.json` has been updated to:
- Move `playwright` and `puppeteer` to `optionalDependencies`
- Build command uses `--no-optional` to skip browser installation
- Browsers will install on first use (may cause first request delay)

## Notes

- First request to VINValue or Web-Alert will be slower as browsers install
- Consider using a background job to pre-install browsers after deployment
- Monitor memory usage - if still too high, consider splitting services

