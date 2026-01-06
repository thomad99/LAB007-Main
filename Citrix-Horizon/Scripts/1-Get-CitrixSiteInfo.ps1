# Get-CitrixSiteInfo.ps1
# Extracts high-level Citrix Site information
# Author : LAB007.AI
# Version: 1.0
# Last Modified: 250127

param(
    [string]$OutputPath = ".\Data\citrix-site-info.json",
    [string]$CitrixVersion = "1912"
)

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

try {
    # Note: Citrix modules/snap-ins must be loaded manually before running this script
    # Get site information (use AdminAddress if DDC was specified)
    if ($global:CitrixAdminAddress) {
        $site = Get-BrokerSite -AdminAddress $global:CitrixAdminAddress -ErrorAction Stop
    }
    else {
        $site = Get-BrokerSite -ErrorAction Stop
    }

    # Get controller information
    $controllerCount = 0
    $controllerNames = @()
    try {
        $maxRecords = 10000
        if ($global:CitrixAdminAddress) {
            $controllers = Get-BrokerController -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction Stop
        }
        else {
            $controllers = Get-BrokerController -MaxRecordCount $maxRecords -ErrorAction Stop
        }

        if ($controllers) {
            $controllerCount = $controllers.Count
            # Prefer DNSName, fall back to MachineName/Name
            $controllerNames = $controllers | ForEach-Object {
                if ($_.DNSName) { $_.DNSName }
                elseif ($_.MachineName) { $_.MachineName }
                else { $_.Name }
            }
        }
    }
    catch {
        Write-Warning "Failed to collect controller information: $_"
    }

    $siteInfo = @{
        SiteName = $site.Name
        LicenseServer = $site.LicenseServerName
        LicenseServerPort = $site.LicenseServerPort
        ControllerCount = $controllerCount
        Controllers = $controllerNames
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    }
    
    # Convert to JSON and save
    $siteInfo | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
    
    Write-Host "Site information collected successfully" -ForegroundColor Green
    return $siteInfo
}
catch {
    Write-Warning "Failed to collect site information: $_"
    return @{
        SiteName = "Unknown"
        LicenseServer = "Unknown"
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        Error = $_.ToString()
    }
}

