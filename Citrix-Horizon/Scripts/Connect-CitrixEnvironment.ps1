# Connect-CitrixEnvironment.ps1
# Configures connection to Citrix environment based on version
# Author : LAB007.AI
# Version: 1.0
# Last Modified: 250127

param(
    [string]$CitrixVersion,
    [string]$DDCName,
    [switch]$Interactive
)

function Get-CitrixVersion {
    param(
        [string]$Version
    )
    
    # Normalize version input
    $versionLower = $Version.ToLower().Trim()
    
    # Map common version formats
    $versionMap = @{
        "1912" = "1912"
        "7.15" = "7.15"
        "7.6" = "7.6"
        "7.0" = "7.0"
        "2009" = "2009"
        "2012" = "2012"
        "2112" = "2112"
        "2203" = "2203"
        "2209" = "2209"
        "2305" = "2305"
        "2311" = "2311"
    }
    
    foreach ($key in $versionMap.Keys) {
        if ($versionLower -like "*$key*") {
            return $versionMap[$key]
        }
    }
    
    # Default to 1912 for unknown versions
    Write-Warning "Unknown version format '$Version'. Defaulting to 1912 (snap-ins)."
    return "1912"
}

function Discover-CitrixVersion {
    param(
        [string]$DDCName
    )
    
    Write-Host "Attempting to auto-discover Citrix version from DDC..." -ForegroundColor Yellow
    
    $discoveredVersion = $null
    
    # Try multiple methods to discover version
    try {
        # Method 1: Try Get-BrokerService (works for most versions)
        try {
            $brokerService = Get-BrokerService -AdminAddress $DDCName -ErrorAction Stop | Select-Object -First 1
            if ($brokerService) {
                # Check Version property if available
                if ($brokerService.Version) {
                    $versionString = $brokerService.Version.ToString()
                    Write-Host "Found version from BrokerService: $versionString" -ForegroundColor Gray
                    
                    # Parse version string (format is usually like "7.15.0.0" or "1912.0.0" or "2203.0.0")
                    if ($versionString -match "(\d+)\.(\d+)\.(\d+)\.(\d+)") {
                        $major = [int]$matches[1]
                        $minor = [int]$matches[2]
                        
                        # Map to known versions
                        if ($major -eq 7) {
                            if ($minor -eq 15) { $discoveredVersion = "7.15" }
                            elseif ($minor -eq 6) { $discoveredVersion = "7.6" }
                            elseif ($minor -eq 0) { $discoveredVersion = "7.0" }
                        }
                        elseif ($major -eq 1912) { $discoveredVersion = "1912" }
                        elseif ($major -eq 2009) { $discoveredVersion = "2009" }
                        elseif ($major -eq 2012) { $discoveredVersion = "2012" }
                        elseif ($major -eq 2112) { $discoveredVersion = "2112" }
                        elseif ($major -eq 2203) { $discoveredVersion = "2203" }
                        elseif ($major -eq 2209) { $discoveredVersion = "2209" }
                        elseif ($major -eq 2305) { $discoveredVersion = "2305" }
                        elseif ($major -eq 2311) { $discoveredVersion = "2311" }
                    }
                }
            }
        }
        catch {
            Write-Verbose "Get-BrokerService version discovery failed: $_"
        }
        
        # Method 2: Try Get-ConfigService (alternative method)
        if (-not $discoveredVersion) {
            try {
                $configService = Get-ConfigService -AdminAddress $DDCName -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($configService -and $configService.Version) {
                    $versionString = $configService.Version.ToString()
                    Write-Host "Found version from ConfigService: $versionString" -ForegroundColor Gray
                    # Use same parsing logic as above
                    if ($versionString -match "(\d+)\.(\d+)\.(\d+)\.(\d+)") {
                        $major = [int]$matches[1]
                        $minor = [int]$matches[2]
                        
                        if ($major -eq 7) {
                            if ($minor -eq 15) { $discoveredVersion = "7.15" }
                            elseif ($minor -eq 6) { $discoveredVersion = "7.6" }
                            elseif ($minor -eq 0) { $discoveredVersion = "7.0" }
                        }
                        elseif ($major -eq 1912) { $discoveredVersion = "1912" }
                        elseif ($major -eq 2009) { $discoveredVersion = "2009" }
                        elseif ($major -eq 2012) { $discoveredVersion = "2012" }
                        elseif ($major -eq 2112) { $discoveredVersion = "2112" }
                        elseif ($major -eq 2203) { $discoveredVersion = "2203" }
                        elseif ($major -eq 2209) { $discoveredVersion = "2209" }
                        elseif ($major -eq 2305) { $discoveredVersion = "2305" }
                        elseif ($major -eq 2311) { $discoveredVersion = "2311" }
                    }
                }
            }
            catch {
                Write-Verbose "Get-ConfigService version discovery failed: $_"
            }
        }
        
        # Method 3: Try to determine by checking if modules vs snap-ins work
        if (-not $discoveredVersion) {
            Write-Host "Trying to determine version by testing module/snap-in availability..." -ForegroundColor Gray
            
            # Try modules first (newer versions)
            $moduleTest = Get-Module -ListAvailable -Name "Citrix.Broker.Admin.V2" -ErrorAction SilentlyContinue
            if ($moduleTest) {
                try {
                    Import-Module "Citrix.Broker.Admin.V2" -ErrorAction SilentlyContinue
                    $testSite = Get-BrokerSite -AdminAddress $DDCName -ErrorAction SilentlyContinue
                    if ($testSite) {
                        # If modules work, it's likely 2009 or newer
                        Write-Host "Modules work - assuming version 2009 or newer" -ForegroundColor Gray
                        $discoveredVersion = "2009"  # Default to 2009 for newer versions
                    }
                }
                catch {
                    # Modules didn't work, might be older version
                }
            }
            
            # If modules didn't work, try snap-ins (older versions)
            if (-not $discoveredVersion) {
                $snapinTest = Get-PSSnapin -Registered -Name "Citrix.Broker.Admin.V2" -ErrorAction SilentlyContinue
                if ($snapinTest) {
                    try {
                        Add-PSSnapin "Citrix.Broker.Admin.V2" -ErrorAction SilentlyContinue
                        $testSite = Get-BrokerSite -AdminAddress $DDCName -ErrorAction SilentlyContinue
                        if ($testSite) {
                            # If snap-ins work, it's likely 1912 or 7.x
                            Write-Host "Snap-ins work - assuming version 1912 or 7.x" -ForegroundColor Gray
                            $discoveredVersion = "1912"  # Default to 1912 for older versions
                        }
                    }
                    catch {
                        # Snap-ins didn't work either
                    }
                }
            }
        }
    }
    catch {
        Write-Warning "Version auto-discovery encountered an error: $_"
    }
    
    if ($discoveredVersion) {
        Write-Host "Auto-discovered Citrix version: $discoveredVersion" -ForegroundColor Green
        return $discoveredVersion
    }
    else {
        Write-Warning "Could not auto-discover version. You may need to specify it manually."
        return $null
    }
}

function Connect-ToCitrixDDC {
    param(
        [string]$Version,
        [string]$DDCName
    )
    
    $connected = $false
    $errorMessage = ""
    
    try {
        # Note: Citrix modules/snap-ins must be loaded manually before running this script
        # Connect based on version
        if ($Version -eq "1912" -or $Version -eq "7.15" -or $Version -eq "7.6" -or $Version -eq "7.0") {
            # For Citrix 1912/7.x, test connection using -AdminAddress parameter
            try {
                # Test connection by getting broker service with AdminAddress
                $brokerService = Get-BrokerService -AdminAddress $DDCName -ErrorAction Stop
                if ($brokerService) {
                    $connected = $true
                    Write-Host "Connected to Citrix Delivery Controller: $DDCName" -ForegroundColor Green
                    # Store DDC name for use in subsequent cmdlets
                    $global:CitrixAdminAddress = $DDCName
                }
            }
            catch {
                # Try to get site as alternative test
                try {
                    $site = Get-BrokerSite -AdminAddress $DDCName -ErrorAction Stop
                    if ($site) {
                        $connected = $true
                        Write-Host "Connected to Citrix Delivery Controller: $DDCName" -ForegroundColor Green
                        Write-Host "Site Name: $($site.Name)" -ForegroundColor Cyan
                        $global:CitrixAdminAddress = $DDCName
                    }
                }
                catch {
                    $errorMessage = "Failed to connect to DDC '$DDCName'. Error: $_"
                }
            }
        }
        else {
            # Newer versions (2009+) - connection is automatic, but we can verify
            try {
                # For newer versions, connection is handled automatically
                # Just verify we can reach the site
                $site = Get-BrokerSite -AdminAddress $DDCName -ErrorAction Stop
                if ($site) {
                    $connected = $true
                    Write-Host "Connected to Citrix Delivery Controller: $DDCName" -ForegroundColor Green
                    Write-Host "Site Name: $($site.Name)" -ForegroundColor Cyan
                    $global:CitrixAdminAddress = $DDCName
                }
            }
            catch {
                # For newer versions, try without AdminAddress (auto-discovery)
                try {
                    $site = Get-BrokerSite -ErrorAction Stop
                    if ($site) {
                        $connected = $true
                        Write-Host "Connected to Citrix Delivery Controller (auto-discovered)" -ForegroundColor Green
                        Write-Host "Site Name: $($site.Name)" -ForegroundColor Cyan
                    }
                }
                catch {
                    $errorMessage = "Failed to connect to DDC '$DDCName' for version $Version : $_"
                }
            }
        }
    }
    catch {
        $errorMessage = "Error during connection setup: $_"
    }
    
    # If connected, try to verify/discover the actual version
    $actualVersion = $Version
    if ($connected) {
        try {
            $discoveredVersion = Discover-CitrixVersion -DDCName $DDCName
            if ($discoveredVersion -and $discoveredVersion -ne $Version) {
                Write-Host "Note: Discovered version ($discoveredVersion) differs from specified version ($Version). Using discovered version." -ForegroundColor Yellow
                $actualVersion = $discoveredVersion
            }
        }
        catch {
            # If discovery fails, use the provided version
            Write-Verbose "Version verification failed, using provided version: $_"
        }
    }
    
    return @{
        Connected = $connected
        ErrorMessage = $errorMessage
        Version = $actualVersion
        DDCName = $DDCName
    }
}

# Main execution
if ($Interactive -or (-not $CitrixVersion) -or (-not $DDCName)) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Citrix Environment Configuration" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    if (-not $DDCName) {
        $DDCName = Read-Host "Enter Delivery Controller (DDC) name or FQDN"
    }
    
    # If version not provided, try to auto-discover it
    if (-not $CitrixVersion) {
        Write-Host ""
        Write-Host "Citrix version not specified. Attempting auto-discovery..." -ForegroundColor Yellow
        
        # First, try to load modules/snap-ins to enable discovery
        # Try modules first (newer versions)
        $modulesLoaded = $false
        try {
            $moduleTest = Get-Module -ListAvailable -Name "Citrix.Broker.Admin.V2" -ErrorAction SilentlyContinue
            if ($moduleTest) {
                Import-Module "Citrix.Broker.Admin.V2" -ErrorAction SilentlyContinue | Out-Null
                $modulesLoaded = $true
            }
        }
        catch {
            # Modules not available, try snap-ins
        }
        
        # Try snap-ins if modules didn't work
        if (-not $modulesLoaded) {
            try {
                $snapinTest = Get-PSSnapin -Registered -Name "Citrix.Broker.Admin.V2" -ErrorAction SilentlyContinue
                if ($snapinTest) {
                    Add-PSSnapin "Citrix.Broker.Admin.V2" -ErrorAction SilentlyContinue | Out-Null
                    $modulesLoaded = $true
                }
            }
            catch {
                # Snap-ins not available either
            }
        }
        
        if ($modulesLoaded) {
            $discoveredVersion = Discover-CitrixVersion -DDCName $DDCName
            if ($discoveredVersion) {
                $CitrixVersion = $discoveredVersion
            }
            else {
                Write-Host ""
                Write-Host "Supported Citrix Versions:" -ForegroundColor Yellow
                Write-Host "  - 1912 (or 7.15, 7.6, 7.0) - Uses snap-ins" -ForegroundColor White
                Write-Host "  - 2009, 2012, 2112, 2203, 2209, 2305, 2311 - Uses modules" -ForegroundColor White
                Write-Host ""
                $CitrixVersion = Read-Host "Enter Citrix Version (e.g., 1912)"
            }
        }
        else {
            Write-Warning "Could not load Citrix modules/snap-ins for auto-discovery."
            Write-Host ""
            Write-Host "Supported Citrix Versions:" -ForegroundColor Yellow
            Write-Host "  - 1912 (or 7.15, 7.6, 7.0) - Uses snap-ins" -ForegroundColor White
            Write-Host "  - 2009, 2012, 2112, 2203, 2209, 2305, 2311 - Uses modules" -ForegroundColor White
            Write-Host ""
            $CitrixVersion = Read-Host "Enter Citrix Version (e.g., 1912)"
        }
    }
}

# Normalize version
$normalizedVersion = Get-CitrixVersion -Version $CitrixVersion

# Connect to DDC
$connectionResult = Connect-ToCitrixDDC -Version $normalizedVersion -DDCName $DDCName

if (-not $connectionResult.Connected) {
    Write-Error $connectionResult.ErrorMessage
    Write-Host ""
    Write-Host "Troubleshooting tips:" -ForegroundColor Yellow
    Write-Host "  1. Verify the DDC name/FQDN is correct" -ForegroundColor White
    Write-Host "  2. Ensure you have network connectivity to the DDC" -ForegroundColor White
    Write-Host "  3. Check that you have Citrix administrator permissions" -ForegroundColor White
    Write-Host "  4. Verify the Citrix PowerShell SDK is installed" -ForegroundColor White
    Write-Host ""
    throw "Failed to connect to Citrix environment"
}

return $connectionResult

