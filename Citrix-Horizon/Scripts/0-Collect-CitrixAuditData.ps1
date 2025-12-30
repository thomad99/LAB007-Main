# Collect-CitrixAuditData.ps1
# Master script that orchestrates collection of all Citrix audit data

param(
    [string]$OutputPath = ".\Data\citrix-audit-complete.json",
    [int]$UsageDaysBack = 30,
    [switch]$SkipServerSpecs = $false,
    [string]$CitrixVersion,
    [string]$DDCName,
    [switch]$NonInteractive,
    [string]$StoreFrontServer,
    [string]$VMwareServer = "",
    [string]$VMwareUsername = "",
    [string]$VMwarePassword = ""
)

# Setup console output capture for debug file
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataPath = Join-Path $scriptPath "..\Data"
$dataPath = [System.IO.Path]::GetFullPath($dataPath)
if (-not (Test-Path -Path $dataPath)) {
    New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
}
$debugFile = Join-Path $dataPath "debug.txt"

# Start transcript to capture all console output
$startTime = Get-Date

# Stop any existing transcript first to avoid file locking issues
Stop-Transcript -ErrorAction SilentlyContinue | Out-Null

# Remove existing debug file if it exists to avoid locking issues
if (Test-Path $debugFile) {
    try {
        # Try to remove it, but don't fail if it's locked
        Remove-Item $debugFile -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 100
    }
    catch {
        # File might be locked, continue anyway
    }
}

# Start new transcript
try {
    Start-Transcript -Path $debugFile -ErrorAction Stop | Out-Null
    Write-Host "[DEBUG] Transcript started at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
}
catch {
    Write-Warning "Could not start transcript to $debugFile : $_"
    # Continue without transcript
}

# Unblock all files in the Scripts folder (removes "blocked" status from downloaded files)
Write-Host "Unblocking PowerShell files..." -ForegroundColor Yellow
try {
    $scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
    $projectRoot = Split-Path -Parent $scriptPath
    Get-ChildItem -Path $projectRoot -Recurse -File | Unblock-File -ErrorAction SilentlyContinue
    Write-Host "Files unblocked successfully." -ForegroundColor Green
}
catch {
    Write-Warning "Could not unblock all files (this is usually safe to ignore): $_"
}
Write-Host ""

# Check and install required modules if needed
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$installScript = Join-Path $scriptPath "Install-RequiredModules.ps1"

if (Test-Path $installScript) {
    Write-Host "Checking for required dependencies..." -ForegroundColor Yellow
    try {
        & $installScript -Force -ErrorAction SilentlyContinue
    }
    catch {
        Write-Warning "Dependency check failed, continuing anyway: $_"
    }
    Write-Host ""
}

Write-Host "NOTE: Ensure Citrix PowerShell modules/snap-ins are loaded before running!" -ForegroundColor Yellow
Write-Host "For Citrix 1912/7.x: Add-PSSnapin Citrix.Broker.Admin.V2 (use snap-ins)" -ForegroundColor Gray
Write-Host "For Citrix 2009+: Import-Module Citrix.Broker.Admin.V2 (use modules)" -ForegroundColor Gray
Write-Host "Run .\Scripts\Install-RequiredModules.ps1 to automatically install missing dependencies" -ForegroundColor Gray
Write-Host ""

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path (Split-Path -Parent $scriptPath) "lab007-config.json"

# Read configuration from file if available
if (-not $CitrixVersion -or -not $DDCName) {
    $config = & "$scriptPath\Read-Configuration.ps1" -ConfigPath $configPath
    
    if (-not $CitrixVersion) {
        $CitrixVersion = $config.CitrixVersion
    }
    if (-not $DDCName) {
        $DDCName = $config.DDCName
    }
    if (-not $PSBoundParameters.ContainsKey('UsageDaysBack')) {
        $UsageDaysBack = $config.UsageDays
    }
    if (-not $PSBoundParameters.ContainsKey('SkipServerSpecs')) {
        # Only use config value if it's explicitly set to $true, otherwise default to $false
        if ($config.SkipServerSpecs -eq $true) {
            $SkipServerSpecs = $true
        }
        else {
            $SkipServerSpecs = $false
        }
    }
}

# Connect to Citrix environment (auto-discovers version if DDC provided but version not specified)
# If DDC is provided but version is not, we'll try to auto-discover it
if (-not $DDCName) {
    if ($NonInteractive) {
        Write-Error "DDC name is required. Please provide -DDCName parameter."
        exit 1
    }
    # Will prompt in interactive mode
}

# If version not provided, try to auto-discover it (even in non-interactive mode)
if (-not $CitrixVersion -and $DDCName) {
    Write-Host "Citrix version not specified. Attempting auto-discovery from DDC..." -ForegroundColor Yellow
}

$connectionResult = & "$scriptPath\Connect-CitrixEnvironment.ps1" -CitrixVersion $CitrixVersion -DDCName $DDCName -Interactive:(!$NonInteractive)

if (-not $connectionResult.Connected) {
    Write-Error "Failed to connect to Citrix environment. Exiting."
    exit 1
}

# Use the version from connection result (may be auto-discovered)
$CitrixVersion = $connectionResult.Version
$DDCName = $connectionResult.DDCName

# Save discovered version to config file for future use
try {
    $configToSave = @{
        CitrixVersion = $CitrixVersion
        DDCName = $DDCName
        UsageDays = $UsageDaysBack
        SkipServerSpecs = $SkipServerSpecs
    }
    $configToSave | ConvertTo-Json | Out-File -FilePath $configPath -Encoding UTF8 -Force
    Write-Host "Configuration saved to: $configPath" -ForegroundColor Gray
}
catch {
    Write-Warning "Could not save configuration: $_"
}

Write-Host ""
Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  Version: $CitrixVersion" -ForegroundColor White
Write-Host "  Delivery Controller: $DDCName" -ForegroundColor White
if ($StoreFrontServer) {
    Write-Host "  StoreFront Server: $StoreFrontServer" -ForegroundColor White
}
Write-Host ""

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

$dataPath = Join-Path $scriptPath "..\Data"
$dataPath = [System.IO.Path]::GetFullPath($dataPath)

if (-not (Test-Path -Path $dataPath)) {
    New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
}

# Initialize audit data object
$auditData = @{
    CollectionTimestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    CollectionDate = (Get-Date -Format "yyyy-MM-dd")
    CitrixVersion = $CitrixVersion
    DDCName = $DDCName
}

# 1. Collect Site Information
Write-Host "[1/11] Collecting Site Information..." -ForegroundColor Yellow
try {
    $siteInfo = & "$scriptPath\1-Get-CitrixSiteInfo.ps1" -OutputPath (Join-Path $dataPath "citrix-site-info.json") -CitrixVersion $CitrixVersion
    if ($siteInfo) {
        $auditData.SiteName = $siteInfo.SiteName
        $auditData.LicenseServer = $siteInfo.LicenseServer
        if ($siteInfo.ControllerCount -ne $null) {
            $auditData.ControllerCount = $siteInfo.ControllerCount
        }
        if ($siteInfo.Controllers) {
            $auditData.Controllers = $siteInfo.Controllers
        }
    }
}
catch {
    Write-Warning "Site information collection failed, continuing: $_"
}

# 2. Collect Applications
Write-Host "[2/11] Collecting Published Applications..." -ForegroundColor Yellow
try {
    $apps = & "$scriptPath\2-Get-CitrixApplications.ps1" -OutputPath (Join-Path $dataPath "citrix-applications.json") -CitrixVersion $CitrixVersion
    if ($apps) {
        $auditData.TotalPublishedApplications = $apps.TotalApplications
        $auditData.Applications = $apps.Applications
    }
}
catch {
    Write-Warning "Applications collection failed, continuing: $_"
}

# 3. Collect Desktops
Write-Host "[3/11] Collecting Published Desktops..." -ForegroundColor Yellow
try {
    $desktops = & "$scriptPath\3-Get-CitrixDesktops.ps1" -OutputPath (Join-Path $dataPath "citrix-desktops.json") -CitrixVersion $CitrixVersion
    if ($desktops) {
        $auditData.TotalPublishedDesktops = $desktops.TotalPublishedDesktops
        $auditData.Desktops = $desktops.Desktops
    }
}
catch {
    Write-Warning "Desktops collection failed, continuing: $_"
}

# 4. Collect Catalogs (with provisioning information)
Write-Host "[4/11] Collecting Machine Catalogs and Provisioning Information..." -ForegroundColor Yellow
try {
    $catalogs = & "$scriptPath\4-Get-CitrixCatalogs.ps1" -OutputPath (Join-Path $dataPath "citrix-catalogs.json") -CitrixVersion $CitrixVersion
    if ($catalogs) {
        $auditData.NumberOfCatalogs = $catalogs.TotalCatalogs
        $auditData.Catalogs = $catalogs.Catalogs
        
        # Process provisioning data to determine unique master images
        $uniqueMasterImages = @{}
        $catalogToImageMap = @{}
        
        foreach ($catalog in $catalogs.Catalogs) {
            # Use MasterImageVM as the primary identifier (xxxx.vm)
            $imageKey = $null
            if ($catalog.MasterImageVM) {
                $imageKey = $catalog.MasterImageVM
            }
            elseif ($catalog.MasterImageName) {
                $imageKey = $catalog.MasterImageName
            }
            elseif ($catalog.MasterImagePath) {
                $imageKey = $catalog.MasterImagePath
            }
            
            if ($imageKey) {
                if (-not $uniqueMasterImages.ContainsKey($imageKey)) {
                    # Use ImageMachineName and LatestSnapshotName from catalog if available (parsed from path)
                    # Otherwise fall back to MasterImageVM and MasterImageLatestSnapshot
                    $vmName = $catalog.ImageMachineName
                    if (-not $vmName) {
                        $vmName = $catalog.MasterImageVM
                    }
                    if (-not $vmName) {
                        $vmName = $catalog.MasterImageName
                    }
                    
                    $snapshotName = $catalog.LatestSnapshotName
                    if (-not $snapshotName) {
                        $snapshotName = $catalog.MasterImageLatestSnapshot
                    }
                    
                    $uniqueMasterImages[$imageKey] = @{
                        ImageMachineName = $vmName
                        LatestSnapshotName = $snapshotName
                        ClusterName = $catalog.ClusterName
                        HostingUnitName = $catalog.HostingUnitName
                        Path = $catalog.MasterImagePath
                        VMX = $catalog.MasterImageVMX
                        AllSnapshots = $catalog.MasterImageSnapshots
                        Catalogs = @()
                    }
                }
                $uniqueMasterImages[$imageKey].Catalogs += $catalog.Name
                $catalogToImageMap[$catalog.Name] = $imageKey
            }
        }
        
        # Store master images information
        $auditData.UniqueMasterImages = @($uniqueMasterImages.Values)
        $auditData.TotalUniqueMasterImages = $uniqueMasterImages.Count
        $auditData.CatalogToMasterImageMap = $catalogToImageMap
        
        Write-Host "Found $($uniqueMasterImages.Count) unique master images" -ForegroundColor Green
    }
}
catch {
    Write-Warning "Catalogs collection failed, continuing: $_"
}

# 5. Collect Delivery Groups (pass applications to count apps per group)
Write-Host "[5/11] Collecting Delivery Groups..." -ForegroundColor Yellow
try {
    # Get applications array - handle both direct array and wrapped in result object
    $appsForDeliveryGroups = @()
    if ($auditData.Applications) {
        $appsForDeliveryGroups = $auditData.Applications
        Write-Host "Passing $($appsForDeliveryGroups.Count) applications to delivery groups script" -ForegroundColor Gray
    }
    else {
        Write-Warning "No applications data available for delivery group app counting"
    }
    $deliveryGroups = & "$scriptPath\5-Get-CitrixDeliveryGroups.ps1" -OutputPath (Join-Path $dataPath "citrix-delivery-groups.json") -CitrixVersion $CitrixVersion -Applications $appsForDeliveryGroups
    if ($deliveryGroups) {
        $auditData.NumberOfDeliveryGroups = $deliveryGroups.TotalDeliveryGroups
        $auditData.DeliveryGroups = $deliveryGroups.DeliveryGroups
    }
}
catch {
    Write-Warning "Delivery Groups collection failed, continuing: $_"
}

# 6. Collect Usage Statistics
Write-Host "[6/11] Collecting Usage Statistics (last $UsageDaysBack days)..." -ForegroundColor Yellow
try {
    $usageStats = & "$scriptPath\6-Get-CitrixUsageStats.ps1" -OutputPath (Join-Path $dataPath "citrix-usage-stats.json") -DaysBack $UsageDaysBack -CitrixVersion $CitrixVersion
    if ($usageStats) {
        $auditData.MaxConcurrentUsers_30Days = $usageStats.MaxConcurrentUsers_Approx
        $auditData.UniqueUserConnections_30Days = $usageStats.UniqueUserConnections_Period
        $auditData.LicenseType = $usageStats.LicenseType
        $auditData.CurrentActiveSessions = $usageStats.CurrentActiveSessions
    }
}
catch {
    Write-Warning "Usage statistics collection failed, continuing: $_"
}

# 7. Collect Policies
Write-Host "[7/11] Collecting Citrix Policies..." -ForegroundColor Yellow
try {
    $policies = & "$scriptPath\7-Get-CitrixPolicies.ps1" -OutputPath (Join-Path $dataPath "citrix-policies.json") -CitrixVersion $CitrixVersion
    if ($policies) {
        $auditData.NumberOfPolicies = $policies.TotalPolicies
        $auditData.Policies = $policies.Policies
    }
}
catch {
    Write-Warning "Policies collection failed, continuing: $_"
}

# 7b. Collect Roles and AD Groups
Write-Host "[8/11] Collecting Citrix Management Roles and AD Groups..." -ForegroundColor Yellow
try {
    $roles = & "$scriptPath\8-Get-CitrixRoles.ps1" -OutputPath (Join-Path $dataPath "citrix-roles.json") -CitrixVersion $CitrixVersion
    if ($roles) {
        $auditData.TotalRoles = $roles.TotalRoles
        $auditData.Roles = $roles.Roles
        Write-Host "Roles information collected: $($roles.TotalRoles) roles found" -ForegroundColor Green
    }
}
catch {
    Write-Warning "Roles collection failed, continuing: $_"
}

# 9. Collect VMware Server Specs (if VMware server specified)
$vmwareSpecs = $null
if (-not $SkipServerSpecs -and $VMwareServer) {
    Write-Host "[9/11] Collecting VMware Server Specs..." -ForegroundColor Yellow
    try {
        $vmwareSpecs = & "$scriptPath\9-Get-VMwareServerSpecs.ps1" -OutputPath (Join-Path $dataPath "vmware-server-specs.json") -VMwareServer $VMwareServer -VMwareUsername $VMwareUsername -VMwarePassword $VMwarePassword
        if ($vmwareSpecs -and $vmwareSpecs.VMSpecs) {
            Write-Host "VMware specs collected: $($vmwareSpecs.TotalVMs) VMs" -ForegroundColor Green
        }
        else {
            Write-Warning "VMware specs collection returned no data"
        }
    }
    catch {
        Write-Warning "VMware specs collection failed: $_"
    }
}

# 10. Collect Server Information (and merge with VMware data if available)
# Always run server collection unless explicitly skipped
Write-Host "[DEBUG] SkipServerSpecs value: $SkipServerSpecs" -ForegroundColor Gray
if (-not $SkipServerSpecs) {
    Write-Host "[10/11] Collecting Server Information and Specs..." -ForegroundColor Yellow
    Write-Host "[DEBUG] Starting server collection at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
    Write-Host "[DEBUG] SkipServerSpecs: $SkipServerSpecs" -ForegroundColor Gray
    Write-Host "[DEBUG] VMwareServer: $VMwareServer" -ForegroundColor Gray
    
    try {
        Write-Host "[DEBUG] Calling 10-Get-CitrixServers.ps1..." -ForegroundColor Gray
        $servers = & "$scriptPath\10-Get-CitrixServers.ps1" -OutputPath (Join-Path $dataPath "citrix-servers.json") -CitrixVersion $CitrixVersion -VMwareServer $VMwareServer -VMwareUsername $VMwareUsername -VMwarePassword $VMwarePassword
        
        Write-Host "[DEBUG] 10-Get-CitrixServers.ps1 returned: $($servers -ne $null)" -ForegroundColor Gray
        if ($servers) {
            Write-Host "[DEBUG] TotalServers: $($servers.TotalServers)" -ForegroundColor Gray
            Write-Host "[DEBUG] Servers array exists: $($servers.Servers -ne $null)" -ForegroundColor Gray
            if ($servers.Servers) {
                Write-Host "[DEBUG] Servers count: $($servers.Servers.Count)" -ForegroundColor Gray
            }
            if ($servers.Error) {
                Write-Host "[DEBUG] Server collection error: $($servers.Error)" -ForegroundColor Yellow
            }
        }
        else {
            Write-Host "[DEBUG] WARNING: 10-Get-CitrixServers.ps1 returned null" -ForegroundColor Yellow
        }
        
        # If we have VMware specs, merge them with Citrix server data
        if ($servers -and $servers.Servers -and $vmwareSpecs -and $vmwareSpecs.VMSpecs) {
            Write-Host "Merging VMware specs with Citrix server data..." -ForegroundColor Yellow
            Write-Host "[DEBUG] Merging VMware specs..." -ForegroundColor Gray
            $servers = Merge-ServerDataWithVMware -CitrixServers $servers -VMwareSpecs $vmwareSpecs
            
            # Save merged data back to citrix-servers.json
            try {
                $servers | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $dataPath "citrix-servers.json") -Encoding UTF8 -Force
                Write-Host "Merged server data saved to citrix-servers.json" -ForegroundColor Gray
                Write-Host "[DEBUG] Merged server data saved successfully" -ForegroundColor Gray
            }
            catch {
                Write-Warning "Could not save merged server data: $_"
                Write-Host "[DEBUG] ERROR saving merged data: $_" -ForegroundColor Yellow
            }
        }
        
        if ($servers -and $servers.Servers) {
            $auditData.TotalNumberOfServers = $servers.TotalServers
            $auditData.Servers = $servers.Servers
            Write-Host "Server information collected: $($servers.TotalServers) servers" -ForegroundColor Green
            Write-Host "[DEBUG] Server data added to auditData: $($servers.TotalServers) servers" -ForegroundColor Gray
        }
        else {
            Write-Warning "Server information collection returned no data or empty result"
            Write-Host "[DEBUG] WARNING: Server collection returned no data" -ForegroundColor Yellow
            Write-Host "[DEBUG] servers object: $($servers | ConvertTo-Json -Compress)" -ForegroundColor Gray
            
            # Initialize empty server data to ensure the field exists
            $auditData.TotalNumberOfServers = 0
            $auditData.Servers = @()
        }
    }
    catch {
        $errorMsg = "Server information collection failed: $_"
        Write-Warning $errorMsg
        Write-Warning "Error details: $($_.Exception.Message)"
        Write-Warning "Stack trace: $($_.ScriptStackTrace)"
        Write-Host "[DEBUG] ERROR in server collection: $errorMsg" -ForegroundColor Red
        Write-Host "[DEBUG] Exception: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "[DEBUG] Stack trace: $($_.ScriptStackTrace)" -ForegroundColor Red
        
        # Initialize empty server data to ensure the field exists
        $auditData.TotalNumberOfServers = 0
        $auditData.Servers = @()
    }
}
else {
    Write-Host "[10/11] Skipping Server Specs collection (as requested)..." -ForegroundColor Yellow
}

# 11. Collect StoreFront Information (moved to end - optional, skip if blank)
if (-not $NonInteractive) {
    Write-Host "[11/11] Collecting StoreFront configuration (optional)..." -ForegroundColor Yellow
    try {
        $storefront = & "$scriptPath\11-Get-CitrixStoreFront.ps1" -OutputPath (Join-Path $dataPath "citrix-storefront.json") -StoreFrontServer $StoreFrontServer
        if ($storefront -and -not $storefront.Error) {
            $auditData.StoreFront = $storefront
            if ($storefront.TotalStores) {
                $auditData.TotalStoreFrontStores = $storefront.TotalStores
            }
            Write-Host "StoreFront information collected: $($storefront.TotalStores) stores" -ForegroundColor Green
        }
        else {
            Write-Host "StoreFront collection skipped (no server specified or error occurred)" -ForegroundColor Gray
        }
    }
    catch {
        Write-Warning "StoreFront collection failed, continuing: $_"
    }
}
elseif ($StoreFrontServer) {
    # Non-interactive mode but server provided
    Write-Host "[11/11] Collecting StoreFront configuration from $StoreFrontServer..." -ForegroundColor Yellow
    try {
        $storefront = & "$scriptPath\11-Get-CitrixStoreFront.ps1" -OutputPath (Join-Path $dataPath "citrix-storefront.json") -StoreFrontServer $StoreFrontServer
        if ($storefront -and -not $storefront.Error) {
            $auditData.StoreFront = $storefront
            if ($storefront.TotalStores) {
                $auditData.TotalStoreFrontStores = $storefront.TotalStores
            }
            Write-Host "StoreFront information collected: $($storefront.TotalStores) stores" -ForegroundColor Green
        }
        else {
            Write-Host "StoreFront collection skipped (no server specified or error occurred)" -ForegroundColor Gray
        }
    }
    catch {
        Write-Warning "StoreFront collection failed, continuing: $_"
    }
}
else {
    Write-Host "[11/11] Skipping StoreFront collection (no server specified)..." -ForegroundColor Gray
}

# Calculate summary metrics
Write-Host ""
Write-Host "Calculating summary metrics..." -ForegroundColor Yellow

$summary = @{
    SiteName = $auditData.SiteName
    TotalPublishedApplications = $auditData.TotalPublishedApplications
    TotalPublishedDesktops = $auditData.TotalPublishedDesktops
    NumberOfCatalogs = $auditData.NumberOfCatalogs
    NumberOfDeliveryGroups = $auditData.NumberOfDeliveryGroups
    MaxConcurrentUsers_30Days = $auditData.MaxConcurrentUsers_30Days
    UniqueUserConnections_30Days = $auditData.UniqueUserConnections_30Days
    LicenseType = $auditData.LicenseType
    TotalNumberOfServers = $auditData.TotalNumberOfServers
    ControllerCount = $auditData.ControllerCount
    CollectionTimestamp = $auditData.CollectionTimestamp
}

$auditData.Summary = $summary

# Save complete audit data
$fullOutputPath = Join-Path $dataPath "citrix-audit-complete.json"
$auditData | ConvertTo-Json -Depth 10 | Out-File -FilePath $fullOutputPath -Encoding UTF8

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Data Collection Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  Site Name: $($summary.SiteName)" -ForegroundColor White
Write-Host "  Published Applications: $($summary.TotalPublishedApplications)" -ForegroundColor White
Write-Host "  Published Desktops: $($summary.TotalPublishedDesktops)" -ForegroundColor White
Write-Host "  Catalogs: $($summary.NumberOfCatalogs)" -ForegroundColor White
Write-Host "  Delivery Groups: $($summary.NumberOfDeliveryGroups)" -ForegroundColor White
Write-Host "  Total Servers: $($summary.TotalNumberOfServers)" -ForegroundColor White
if ($summary.ControllerCount -ne $null) {
    Write-Host "  Controllers: $($summary.ControllerCount)" -ForegroundColor White
}
Write-Host "  License Type: $($summary.LicenseType)" -ForegroundColor White
Write-Host ""
Write-Host "Complete audit data saved to: $fullOutputPath" -ForegroundColor Green
Write-Host "Individual data files saved to: $dataPath" -ForegroundColor Green
Write-Host ""
Write-Host "You can now open the web dashboard to view the data!" -ForegroundColor Cyan

# Stop transcript BEFORE creating ZIP to ensure debug.txt is not locked
Write-Host "Stopping transcript..." -ForegroundColor Gray
try {
    Stop-Transcript -ErrorAction Stop | Out-Null
    Write-Host "Transcript stopped successfully" -ForegroundColor Gray
    # Give it a moment to release the file handle
    Start-Sleep -Milliseconds 200
}
catch {
    Write-Warning "Could not stop transcript: $_"
    # Try to force close the file handle
    Start-Sleep -Milliseconds 500
}

# Create ZIP file with all collected data
Write-Host ""
Write-Host "Creating ZIP file with all audit data..." -ForegroundColor Yellow

# Initialize ZIP path variable
$zipPath = Join-Path $dataPath "AuditData.zip"
$zipCreated = $false

try {
    
    # Remove existing ZIP if it exists
    if (Test-Path $zipPath) {
        try {
            Remove-Item $zipPath -Force -ErrorAction Stop
            Start-Sleep -Milliseconds 100
        }
        catch {
            Write-Warning "Could not remove existing ZIP file: $_"
            # Try to rename it instead
            $oldZipPath = "$zipPath.old"
            if (Test-Path $oldZipPath) {
                Remove-Item $oldZipPath -Force -ErrorAction SilentlyContinue
            }
            try {
                Rename-Item -Path $zipPath -NewName "AuditData.zip.old" -ErrorAction Stop
            }
            catch {
                Write-Warning "Could not rename existing ZIP file: $_"
            }
        }
    }
    
    # Add all JSON files from Data directory
    $jsonFiles = Get-ChildItem -Path $dataPath -Filter "*.json" -ErrorAction SilentlyContinue
    $txtFiles = Get-ChildItem -Path $dataPath -Filter "*.txt" -ErrorAction SilentlyContinue
    
    # Load System.IO.Compression.FileSystem assembly if not already loaded
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
    }
    catch {
        # Assembly might already be loaded, ignore error
    }
    
    # Use .NET compression if available (PowerShell 5.0+)
    $useDotNetZip = $false
    try {
        $null = [System.IO.Compression.ZipFile]
        $useDotNetZip = $true
    }
    catch {
        $useDotNetZip = $false
    }
    
    if ($useDotNetZip) {
        try {
            # Use a unique temp file name to avoid conflicts
            $tempDir = [System.IO.Path]::GetTempPath()
            $maxRetries = 10
            $tempZip = $null
            
            # Try to create a unique temp file
            for ($i = 0; $i -lt $maxRetries; $i++) {
                $tempZipName = "AuditData_" + [System.Guid]::NewGuid().ToString() + ".zip"
                $tempZip = Join-Path $tempDir $tempZipName
                
                # Check if file exists
                if (-not (Test-Path $tempZip)) {
                    break
                }
                
                # If it exists, try again with a new GUID
                if ($i -eq $maxRetries - 1) {
                    throw "Could not create unique temp file after $maxRetries attempts"
                }
                
                Start-Sleep -Milliseconds 100
            }
            
            # Remove temp file if it exists (shouldn't, but just in case)
            if (Test-Path $tempZip) {
                Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 100
            }
            
            Write-Host "[DEBUG] Creating temp ZIP at: $tempZip" | Out-File -FilePath (Join-Path $dataPath "zip-debug.txt") -Append -ErrorAction SilentlyContinue
            
            # Create the ZIP file
            $zip = [System.IO.Compression.ZipFile]::Open($tempZip, [System.IO.Compression.ZipArchiveMode]::Create)
            
            $fileCount = 0
            foreach ($file in $jsonFiles) {
                try {
                    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $file.Name) | Out-Null
                    Write-Host "  Added to ZIP: $($file.Name)" -ForegroundColor Gray
                    $fileCount++
                }
                catch {
                    Write-Warning "  Failed to add $($file.Name): $_"
                }
            }
            
            foreach ($file in $txtFiles) {
                try {
                    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $file.Name) | Out-Null
                    Write-Host "  Added to ZIP: $($file.Name)" -ForegroundColor Gray
                    $fileCount++
                }
                catch {
                    Write-Warning "  Failed to add $($file.Name): $_"
                }
            }
            
            # Close the ZIP archive properly
            $zip.Dispose()
            $zip = $null
            
            # Give it a moment to release file handles
            Start-Sleep -Milliseconds 300
            
            if ($fileCount -gt 0) {
                # Try to move temp file to final location with retry logic
                $retryCount = 0
                $maxRetries = 5
                $moved = $false
                
                while ($retryCount -lt $maxRetries -and -not $moved) {
                    try {
                        Move-Item -Path $tempZip -Destination $zipPath -Force -ErrorAction Stop
                        $moved = $true
                        $zipCreated = $true
                        Write-Host "ZIP file created successfully: $zipPath ($fileCount files)" -ForegroundColor Green
                    }
                    catch {
                        $retryCount++
                        if ($retryCount -lt $maxRetries) {
                            Write-Host "[DEBUG] Retry $retryCount/$maxRetries moving ZIP file..." | Out-File -FilePath (Join-Path $dataPath "zip-debug.txt") -Append -ErrorAction SilentlyContinue
                            Start-Sleep -Milliseconds 500
                        }
                        else {
                            Write-Warning "Failed to move temp ZIP file to final location after $maxRetries retries: $_"
                            # Try to copy instead
                            try {
                                Copy-Item -Path $tempZip -Destination $zipPath -Force -ErrorAction Stop
                                Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
                                $zipCreated = $true
                                Write-Host "ZIP file copied successfully: $zipPath ($fileCount files)" -ForegroundColor Green
                            }
                            catch {
                                Write-Warning "Failed to copy ZIP file: $_"
                                Write-Host "[DEBUG] Temp ZIP location: $tempZip" | Out-File -FilePath (Join-Path $dataPath "zip-debug.txt") -Append -ErrorAction SilentlyContinue
                            }
                        }
                    }
                }
            }
            else {
                Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue
                Write-Warning "No files were added to ZIP"
            }
        }
        catch {
            Write-Warning "Failed to create ZIP using .NET compression: $_"
            $useDotNetZip = $false
        }
    }
    
    # Fallback: Use Compress-Archive (PowerShell 5.0+)
    if (-not $useDotNetZip) {
        $filesToZip = @()
        $jsonFiles | ForEach-Object { $filesToZip += $_.FullName }
        $txtFiles | ForEach-Object { $filesToZip += $_.FullName }
        
        if ($filesToZip.Count -gt 0) {
            try {
                Compress-Archive -Path $filesToZip -DestinationPath $zipPath -Force -ErrorAction Stop
                $zipCreated = $true
                Write-Host "ZIP file created successfully using Compress-Archive: $zipPath ($($filesToZip.Count) files)" -ForegroundColor Green
            }
            catch {
                Write-Warning "Failed to create ZIP using Compress-Archive: $_"
            }
        }
        else {
            Write-Warning "No files to add to ZIP"
        }
    }
}
catch {
    Write-Warning "ZIP file creation failed: $_"
    Write-Warning "Error details: $($_.Exception.Message)"
}

$endTime = Get-Date
$duration = $endTime - $startTime
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Collection completed in $([math]::Round($duration.TotalSeconds, 2)) seconds" -ForegroundColor Cyan

# Verify debug file exists
if (Test-Path $debugFile) {
    $debugSize = (Get-Item $debugFile).Length / 1KB
    Write-Host "Debug log saved to: $debugFile ($([math]::Round($debugSize, 2)) KB)" -ForegroundColor Cyan
}
else {
    Write-Host "Debug log: Not created (check permissions)" -ForegroundColor Yellow
}

# Verify ZIP file exists
if ($zipCreated -and (Test-Path $zipPath)) {
    $zipSize = (Get-Item $zipPath).Length / 1MB
    Write-Host "ZIP file saved to: $zipPath ($([math]::Round($zipSize, 2)) MB)" -ForegroundColor Cyan
}
else {
    Write-Host "ZIP file: Not created (check zip-debug.txt for details)" -ForegroundColor Yellow
    $zipDebugFile = Join-Path $dataPath "zip-debug.txt"
    if (Test-Path $zipDebugFile) {
        Write-Host "  See: $zipDebugFile" -ForegroundColor Gray
    }
}
Write-Host "========================================" -ForegroundColor Cyan

return $auditData
