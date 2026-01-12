# LAB007 Discovery Tools - Citrix Environment Audit Dashboard

A comprehensive PowerShell and web-based solution for auditing and visualizing Citrix Virtual Apps and Desktops environments.

## Features

This solution extracts and displays:

- **Citrix Site Name**
- **Total Published Applications**
- **Total Published Desktops**
- **Max Concurrent Users** (past 30 days)
- **License Type**
- **Number of Catalogs**
- **Number of Delivery Groups**
- **Unique User Connections** (past 30 days)
- **Total Number of Servers**
- **Server Specifications** (RAM, CPU, Disk)

## Prerequisites

### PowerShell Requirements

1. **PowerShell Execution Policy** - Ensure scripts can run:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

2. **Automatic Dependency Installation** (Recommended)
   
   The audit scripts can automatically check and install missing dependencies:
   ```powershell
   .\Scripts\Install-RequiredModules.ps1
   ```
   
   This script will:
   - **VMware PowerCLI**: Automatically install from PowerShell Gallery
   - **Citrix PowerShell SDK**: Check for availability and provide installation options
     - If you bundle Citrix MSI installers in `.\Dependencies\Citrix\`, they will be automatically installed
     - Otherwise, provides download links and instructions

3. **Manual Installation** (Alternative)
   
   **Citrix PowerShell SDK** - Install the Citrix Virtual Apps and Desktops PowerShell SDK
   - Download from: https://www.citrix.com/downloads/citrix-virtual-apps-and-desktops/
   - Install the "Citrix Broker PowerShell SDK" component
   - Or place MSI installer files in `.\Dependencies\Citrix\` for automatic installation
   
   **VMware PowerCLI** (optional, for server specs via VMware):
   ```powershell
   Install-Module -Name VMware.PowerCLI -Scope CurrentUser
   ```

4. **Required Citrix Modules/Snap-ins** (must be loaded before running):
   - `Citrix.Broker.Admin.V2`
   - `Citrix.MachineCreation.Admin.V2`
   - `Citrix.Monitor.ServiceProvider.V2`
   
   **Loading modules/snap-ins:**
   
   For **Citrix 1912 / 7.15 / 7.6 / 7.0** (snap-ins):
   ```powershell
   Add-PSSnapin Citrix.Broker.Admin.V2
   Add-PSSnapin Citrix.MachineCreation.Admin.V2
   Add-PSSnapin Citrix.Monitor.ServiceProvider.V2
   ```
   
   For **Citrix 2009+** (modules):
   ```powershell
   Import-Module Citrix.Broker.Admin.V2
   Import-Module Citrix.MachineCreation.Admin.V2
   Import-Module Citrix.Monitor.ServiceProvider.V2
   ```
   
   **Note:** The main collection script (`Collect-CitrixAuditData.ps1`) will automatically check for dependencies when run.

4. **Permissions** - The PowerShell session must be run with:
   - Admin rights on Citrix Delivery Controllers
   - Appropriate Citrix administrator permissions
   - Network access to Citrix servers (for server specs collection)

## Project Structure

```
├── Scripts/
│   ├── Collect-CitrixAuditData.ps1    # Master script (run this)
│   ├── Connect-CitrixEnvironment.ps1  # Connection handler (version/DDC)
│   ├── Load-CitrixModules.ps1         # Module/snap-in loader (multi-version)
│   ├── Get-CitrixSiteInfo.ps1         # Site information
│   ├── Get-CitrixApplications.ps1     # Published applications
│   ├── Get-CitrixDesktops.ps1         # Published desktops
│   ├── Get-CitrixCatalogs.ps1         # Machine catalogs
│   ├── Get-CitrixDeliveryGroups.ps1   # Delivery groups
│   ├── Get-CitrixServers.ps1          # Server information & specs
│   └── Get-CitrixUsageStats.ps1       # Usage statistics
├── Web/
│   ├── index.html                     # Dashboard HTML
│   ├── styles.css                     # Dashboard styling
│   └── dashboard.js                   # Dashboard functionality
├── Data/
│   └── (JSON files will be generated here)
└── README.md
```

## Usage

### Step 1: Load Citrix Modules/Snap-ins

**IMPORTANT:** You must load the Citrix PowerShell modules/snap-ins before running the collection script!

**For Citrix 1912 / 7.x (snap-ins):**
```powershell
Add-PSSnapin Citrix.Broker.Admin.V2
Add-PSSnapin Citrix.MachineCreation.Admin.V2
Add-PSSnapin Citrix.Monitor.ServiceProvider.V2
```

**For Citrix 2009+ (modules):**
```powershell
Import-Module Citrix.Broker.Admin.V2
Import-Module Citrix.MachineCreation.Admin.V2
Import-Module Citrix.Monitor.ServiceProvider.V2
```

### Step 2: Run Data Collection

Open PowerShell as Administrator and navigate to the project directory:

```powershell
cd "C:\Users\tomo\OneDrive\My Pet Projects\AI\8.0-Citrix-Horizon"
```

Run the master collection script:

```powershell
.\Scripts\Collect-CitrixAuditData.ps1
```

The script will **prompt you** for:
1. **Citrix Version** (e.g., 1912, 2009, 2203, etc.)
2. **Delivery Controller (DDC) Name** (FQDN or hostname)

**Optional Parameters (Non-Interactive Mode):**

```powershell
# Specify version and DDC directly (skips prompts)
.\Scripts\Collect-CitrixAuditData.ps1 -CitrixVersion "1912" -DDCName "ddc01.domain.com" -NonInteractive

# Specify custom output path
.\Scripts\Collect-CitrixAuditData.ps1 -CitrixVersion "1912" -DDCName "ddc01.domain.com" -OutputPath ".\Data\my-audit.json"

# Change usage statistics period (default is 30 days)
.\Scripts\Collect-CitrixAuditData.ps1 -CitrixVersion "1912" -DDCName "ddc01.domain.com" -UsageDaysBack 60

# Skip server specs collection (faster, but less detailed)
.\Scripts\Collect-CitrixAuditData.ps1 -CitrixVersion "1912" -DDCName "ddc01.domain.com" -SkipServerSpecs
```

**Supported Citrix Versions:**
- **1912, 7.15, 7.6, 7.0** - Uses PowerShell snap-ins (on-premise)
- **2009, 2012, 2112, 2203, 2209, 2305, 2311** - Uses PowerShell modules

### Step 3: View the Dashboard

**Option A: Deploy to Render (Recommended for Remote Access)**

Deploy the dashboard to Render web services for remote access from any device:

1. Push your code to GitHub (see [Syncing to GitHub](#syncing-to-github) section)
2. Follow the deployment guide in `README-RENDER.md`
3. Once deployed, you can:
   - Upload JSON files via the web interface
   - Download audit scripts as a ZIP file
   - Access the dashboard from anywhere

**Option B: Local Web Server**

**Option 1: Open HTML File Directly (Simplest)**

1. Navigate to the `Web` folder
2. Double-click `index.html` to open it in your default browser
3. When prompted, click **"Load Audit Data"** button
4. Navigate to the `Data` folder and select `0-Citrix-audit-complete.json`
5. The dashboard will display your data!

**Note:** A sample data file (`Data\sample-citrix-audit-complete.json`) is included so you can test the dashboard immediately without running the collection scripts.

## Syncing to GitHub

This project is configured to sync with GitHub. The sync script includes enhanced security features to protect sensitive data.

### Security Setup (First Time)

Before your first sync, set up secure authentication:

```powershell
.\Scripts\Setup-GitHubSecurity.ps1
```

This script will help you configure:
- **SSH Authentication** (Recommended) - Most secure, uses SSH keys
- **Personal Access Token (PAT)** - Secure token-based authentication
- **Windows Credential Manager** - Stores HTTPS credentials securely

### Quick Sync

Run the automated sync script:

```powershell
.\Sync-ToGitHub.ps1
```

The script will:
- Validate credentials are secure
- Scan for sensitive files before committing
- Check for changes
- Stage all modified files (respecting .gitignore)
- Prompt for a commit message (or use auto-generated)
- Push to GitHub repository: https://github.com/thomad99/CitrixtoHZ

### Security Features

The sync script includes several security enhancements:

1. **Sensitive File Detection** - Automatically detects and warns about sensitive files (passwords, tokens, keys, config files)
2. **Credential Validation** - Verifies you're using secure authentication methods
3. **Commit Message Validation** - Warns if commit messages contain sensitive words
4. **Dry Run Mode** - Test what would be committed without making changes:
   ```powershell
   .\Sync-ToGitHub.ps1 -DryRun
   ```

### Authentication Options

**SSH (Recommended):**
```powershell
.\Sync-ToGitHub.ps1 -UseSSH
```

**Personal Access Token:**
```powershell
# Option 1: Use environment variable
$env:GITHUB_TOKEN = "your-token-here"
.\Sync-ToGitHub.ps1

# Option 2: Use parameter (less secure - token visible in process list)
.\Sync-ToGitHub.ps1 -GitHubPAT "your-token-here"
```

**Windows Credential Manager:**
```powershell
# Git will prompt and store credentials securely
.\Sync-ToGitHub.ps1
```

### Sync with Custom Commit Message

```powershell
.\Sync-ToGitHub.ps1 -CommitMessage "Added new feature: VMware integration"
```

### Sync to Specific Branch

```powershell
.\Sync-ToGitHub.ps1 -Branch "develop"
```

### Manual Git Commands

If you prefer manual control:

```powershell
# Check status
git status

# Add all changes
git add .

# Commit
git commit -m "Your commit message"

# Push to GitHub
git push
```

**Note:** The `.gitignore` file is configured to exclude generated data files (JSON, ZIP, debug logs) and sensitive configuration files from version control, keeping only source code in the repository.

## Output Files

All data is saved to the `Data\` directory:

- `0-Citrix-audit-complete.json` - Complete audit data (used by dashboard)
- `citrix-site-info.json` - Site information
- `citrix-applications.json` - Applications data
- `citrix-desktops.json` - Desktops data
- `citrix-catalogs.json` - Catalogs data
- `citrix-delivery-groups.json` - Delivery groups data
- `citrix-servers.json` - Servers data
- `citrix-usage-stats.json` - Usage statistics

## Dashboard Features

- **Interactive Summary Cards** - High-level metrics at a glance
- **Searchable Tables** - Filter servers and applications
- **Detailed Server Information** - RAM, CPU, Disk specifications
- **Responsive Design** - Works on desktop and mobile devices
- **Real-time Data Loading** - Refresh or load new JSON files

## Troubleshooting

### "Module not found" Errors

Ensure Citrix SDK is installed and modules are available:

```powershell
Get-Module -ListAvailable | Where-Object { $_.Name -like "Citrix*" }
```

If modules aren't found, install the Citrix Virtual Apps and Desktops PowerShell SDK.

### "Access Denied" Errors

- Run PowerShell as Administrator
- Verify Citrix administrator permissions
- Check network connectivity to Citrix controllers

### Server Specs Not Collected

Server specification collection requires:
- WinRM enabled on target servers
- Network access to servers
- Appropriate firewall rules
- Proper credentials for remote access

If server specs can't be collected, the dashboard will still show server names and basic information.

### "Cannot connect to Citrix" Errors

- Verify the DDC name/FQDN is correct
- Check network connectivity to the DDC
- Ensure you're using the correct Citrix version
- Verify Citrix administrator permissions
- For older versions (1912/7.x), ensure snap-ins are installed
- For newer versions (2009+), ensure modules are installed

The script now handles connection automatically based on version, but you can manually specify the DDC if needed.

### Dashboard Shows "Could not load audit data"

1. Ensure data collection script has been run successfully
2. Check that `Data\0-Citrix-audit-complete.json` exists
3. Use the "Load Audit Data" button to manually select the file
4. If using a web server, verify the path is correct

## Customization

### Modify Collection Period

Edit the `UsageDaysBack` parameter in `Collect-CitrixAuditData.ps1`:

```powershell
.\Scripts\Collect-CitrixAuditData.ps1 -UsageDaysBack 90
```

### Add Custom Metrics

1. Create a new PowerShell script in `Scripts\`
2. Add it to `Collect-CitrixAuditData.ps1`
3. Update the dashboard JavaScript to display the new data

### Styling

Modify `Web\styles.css` to customize the dashboard appearance.

## Security Notes

- This solution collects configuration and usage data only
- No user credentials or sensitive data is stored
- JSON files contain infrastructure information - handle appropriately
- Ensure proper access controls on the `Data\` directory

## License

This project is provided as-is for internal auditing and monitoring purposes.

## Support

For issues related to:
- **Citrix SDK**: Consult Citrix documentation
- **PowerShell**: Check script error messages and Citrix logs
- **Dashboard**: Check browser console for JavaScript errors

## Future Enhancements

Potential improvements:
- Historical trend analysis
- Export to PDF/Excel
- Email reporting
- Scheduled data collection
- Integration with monitoring databases for more accurate usage stats
- Real-time dashboard updates
- Multi-site support

