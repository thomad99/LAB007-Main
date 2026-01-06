# GoldenSun Project - Master Image Management

## Overview
The GoldenSun project provides tools for managing VMware master images, specifically designed for cloning and versioning VM templates.

## Components

### 1. Discovery Script: `20-Get-VMwareMasterImages.ps1`
**Purpose:** Discovers all VMware VMs matching the pattern `SHC-M-*` and extracts their details.

**Usage:**
```powershell
.\20-Get-VMwareMasterImages.ps1
```

**What it does:**
- Prompts for vCenter server name
- Prompts for credentials to connect to vCenter
- Searches for all VMs matching `SHC-M-*` pattern
- Extracts VM details including:
  - Name, version, cluster, host, datastore
  - CPU, memory, disk specifications
  - Power state, guest OS
  - Snapshot information
- Saves data to `Data/goldensun-master-images.json`

**Output Format:**
```json
{
  "TotalImages": 5,
  "vCenterServer": "vcenter.domain.com",
  "CollectedAt": "2025-01-06 10:24:00",
  "MasterImages": [
    {
      "Name": "SHC-M-MAINV2",
      "ShortName": "SHC-M-MAIN",
      "Version": "V2",
      "Cluster": "Production",
      "Host": "esxi01.domain.com",
      ...
    }
  ]
}
```

### 2. Clone Script: `21-Clone-MasterImage.ps1`
**Purpose:** Clones a master image with automatic version increment.

**Usage:**
```powershell
# Clone a specific VM
.\21-Clone-MasterImage.ps1 -SourceVMName "SHC-M-MAINV2"

# Specify vCenter server
.\21-Clone-MasterImage.ps1 -SourceVMName "SHC-M-MAINV2" -vCenterServer "vcenter.domain.com"

# Test mode (WhatIf)
.\21-Clone-MasterImage.ps1 -SourceVMName "SHC-M-MAINV2" -WhatIf
```

**Version Increment Logic:**
- If VM name ends with `V{number}`: increments the number
  - Example: `SHC-M-MAINV2` → `SHC-M-MAINV3`
- If VM name has no version: adds `V2`
  - Example: `SHC-M-MAIN` → `SHC-M-MAINV2`

**Clone Behavior:**
- Clones to the same cluster as source
- Clones to the same host as source
- Clones to the same datastore as source
- Preserves resource pool assignment
- Checks if target VM name already exists

### 3. Web Interface: `goldensun.html`
**Purpose:** Web-based UI for managing master image cloning operations.

**Features:**
- Displays all discovered master images
- Shows detailed VM information (cluster, host, datastore, specs)
- Allows selection of multiple images for cloning
- Generates PowerShell clone script
- Copy to clipboard or download script

**Access:**
Navigate to: `http://your-server/citrix/goldensun`

**Workflow:**
1. Run discovery script to populate data
2. Open GoldenSun web page
3. Review master images
4. Select images to clone
5. Click "Create Clone Script"
6. Copy or download generated script
7. Run script in PowerShell

## Setup Instructions

### Prerequisites
1. VMware PowerCLI module installed:
   ```powershell
   Install-Module -Name VMware.PowerCLI -Scope CurrentUser
   ```

2. Network access to vCenter server

3. Appropriate permissions in vCenter to:
   - View VMs
   - Clone VMs
   - Access datastore information

### Initial Setup
1. Run the discovery script:
   ```powershell
   cd "Citrix-Horizon\Scripts"
   .\20-Get-VMwareMasterImages.ps1
   ```

2. Enter vCenter server name when prompted

3. Provide credentials when prompted

4. Verify JSON file created: `Data/goldensun-master-images.json`

5. Access web interface at `/citrix/goldensun`

## Naming Convention

### Master Image Naming
Master images should follow the pattern: `SHC-M-{ImageName}V{Version}`

Examples:
- `SHC-M-MAINV1` - Main image, version 1
- `SHC-M-MAINV2` - Main image, version 2
- `SHC-M-APPSERVERV3` - App server image, version 3

### Version Detection
The script looks for the last occurrence of `V` followed by digits:
- `SHC-M-MAINV2` → Base: `SHC-M-MAIN`, Version: `V2`
- `SHC-M-WINDOWS10V5` → Base: `SHC-M-WINDOWS10`, Version: `V5`

## Troubleshooting

### Discovery Script Issues

**Problem:** "VMware PowerCLI module not found"
**Solution:** Install PowerCLI:
```powershell
Install-Module -Name VMware.PowerCLI -Scope CurrentUser
```

**Problem:** "Failed to connect to vCenter"
**Solution:** 
- Verify vCenter server name/IP is correct
- Check network connectivity
- Verify credentials have appropriate permissions

**Problem:** "No VMs found matching pattern 'SHC-M-*'"
**Solution:**
- Verify VMs exist in vCenter
- Check VM naming convention
- Ensure you have permissions to view VMs

### Clone Script Issues

**Problem:** "A VM with name 'XXX' already exists"
**Solution:** 
- Remove existing VM or rename it
- The script won't overwrite existing VMs

**Problem:** "Insufficient permissions"
**Solution:**
- Verify account has VM clone permissions
- Check datastore access permissions

### Web Interface Issues

**Problem:** "Failed to load master images data"
**Solution:**
- Run discovery script first
- Verify JSON file exists: `Data/goldensun-master-images.json`
- Check file permissions

**Problem:** "No master images found"
**Solution:**
- Run discovery script
- Verify VMs matching `SHC-M-*` exist in vCenter

## Best Practices

1. **Regular Discovery Updates**
   - Run discovery script regularly to keep data current
   - Recommended: Run before each cloning session

2. **Version Management**
   - Always use version numbers in master image names
   - Keep version numbers sequential
   - Document changes between versions

3. **Testing**
   - Use `-WhatIf` parameter to test clone operations
   - Verify target VM name before cloning
   - Check available datastore space

4. **Backup**
   - Take snapshots of master images before major changes
   - Document snapshot purposes
   - Clean up old snapshots regularly

5. **Naming Consistency**
   - Follow the `SHC-M-{Name}V{Number}` convention
   - Use descriptive names for master images
   - Avoid special characters

## Support

For issues or questions:
- Check this README
- Review script comments
- Contact LAB007.AI support

## Version History

- **1.0** (2025-01-06)
  - Initial release
  - Discovery script
  - Clone script
  - Web interface
  - Automatic version increment

