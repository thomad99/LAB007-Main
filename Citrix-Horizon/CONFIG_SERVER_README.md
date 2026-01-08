# LAB007 Citrix Configuration (File Download)

The `config.html` now downloads your configuration as a JSON file that you can save directly to your local filesystem where PowerShell scripts can find it.

## Why This Approach

When you open `config.html` directly in your browser (by double-clicking the file), browsers cannot write to your local filesystem for security reasons. Instead, the page now creates a downloadable JSON file.

## How to Use

### Quick Start

1. **Open the config page:**
   - Double-click `Citrix-Horizon/Web/config.html` in Windows Explorer
   - Or open it in your browser: `file:///path/to/Citrix-Horizon/Web/config.html`

2. **Configure your settings** in the web form

3. **Click "Download Config File"**

4. **Save the file** to the correct location:
   ```
   Citrix-Horizon/LAB007-Tools-Config.json
   ```
   (This is the parent directory of the Scripts folder)

5. **PowerShell scripts can now read** the configuration file

## Features

- ✅ **Direct file download** - No server required
- ✅ **Browser-based configuration** - Works offline
- ✅ **Proper JSON format** - Compatible with PowerShell scripts
- ✅ **Clear save instructions** - Shows exactly where to save the file

## Requirements

- **Modern web browser** (Chrome, Firefox, Edge, etc.)
- **Windows** (to run PowerShell scripts)

## Testing the Download

Use the test file to verify download functionality:
1. Open `test-config-download.html` in your browser
2. Click "Download Test Config"
3. Save the file to test the download process

## Troubleshooting

**Download doesn't start**
- Check that your browser allows downloads
- Try a different browser
- Make sure pop-ups aren't blocked

**Configuration not working**
- Ensure the file is saved as `LAB007-Tools-Config.json`
- Save it to the correct directory: `Citrix-Horizon/LAB007-Tools-Config.json`
- Verify the JSON format is valid (no extra characters)

**Scripts can't find config**
- PowerShell scripts look for `..\LAB007-Tools-Config.json` (parent directory)
- If scripts are in `Scripts/` folder, config must be in main `Citrix-Horizon/` folder

## Alternative: Node.js Server (Advanced)

If you prefer server-based configuration:

1. Install Node.js from https://nodejs.org
2. Run: `npm install && npm start`
3. Open: `http://localhost:3000/config.html`

## Files

- `config.html` - Updated with download functionality
- `test-config-download.html` - Test download functionality