# Load-CitrixModules.ps1
# Helper function to load Citrix PowerShell snap-ins/modules
# Supports multiple Citrix versions: 1912/7.x (snap-ins) and 2009+ (modules)
# Author : LAB007.AI
# Version: 1.0
# Last Modified: 250127

function Load-CitrixModules {
    param(
        [string[]]$RequiredModules = @("Citrix.Broker.Admin.V2"),
        [string]$CitrixVersion = "1912"
    )
    
    # Determine if we should use snap-ins (old) or modules (new)
    $useSnapIns = $false
    if ($CitrixVersion -eq "1912" -or $CitrixVersion -eq "7.15" -or $CitrixVersion -eq "7.6" -or $CitrixVersion -eq "7.0") {
        $useSnapIns = $true
    }
    
    $loadedModules = @()
    $errors = @()
    
    foreach ($moduleName in $RequiredModules) {
        $loaded = $false
        
        # Map module names to snap-in names (they're usually the same)
        $snapinMap = @{
            "Citrix.Broker.Admin.V2" = "Citrix.Broker.Admin.V2"
            "Citrix.MachineCreation.Admin.V2" = "Citrix.MachineCreation.Admin.V2"
            "Citrix.Monitor.ServiceProvider.V2" = "Citrix.Monitor.ServiceProvider.V2"
            "Citrix.Configuration.Admin.V2" = "Citrix.Configuration.Admin.V2"
        }
        
        $snapinName = $snapinMap[$moduleName]
        if (-not $snapinName) {
            $snapinName = $moduleName
        }
        
        if ($useSnapIns) {
            # For older versions (1912, 7.x), try snap-ins first
            try {
                if (-not (Get-PSSnapin -Name $snapinName -ErrorAction SilentlyContinue)) {
                    Add-PSSnapin -Name $snapinName -ErrorAction Stop
                    Write-Verbose "Loaded $moduleName as snap-in (Version: $CitrixVersion)"
                    $loaded = $true
                    $loadedModules += $snapinName
                }
                else {
                    Write-Verbose "$moduleName snap-in already loaded"
                    $loaded = $true
                    $loadedModules += $snapinName
                }
            }
            catch {
                # Snap-in failed, try as module as fallback
                try {
                    if (-not (Get-Module -Name $moduleName -ErrorAction SilentlyContinue)) {
                        Import-Module -Name $moduleName -ErrorAction Stop
                        Write-Verbose "Loaded $moduleName as module (fallback)"
                        $loaded = $true
                        $loadedModules += $moduleName
                    }
                    else {
                        Write-Verbose "$moduleName module already loaded"
                        $loaded = $true
                        $loadedModules += $moduleName
                    }
                }
                catch {
                    $errorMsg = "Failed to load $moduleName as snap-in and module: $_"
                    Write-Warning $errorMsg
                    $errors += $errorMsg
                }
            }
        }
        else {
            # For newer versions (2009+), use modules
            try {
                if (-not (Get-Module -Name $moduleName -ErrorAction SilentlyContinue)) {
                    Import-Module -Name $moduleName -ErrorAction Stop
                    Write-Verbose "Loaded $moduleName as module (Version: $CitrixVersion)"
                    $loaded = $true
                    $loadedModules += $moduleName
                }
                else {
                    Write-Verbose "$moduleName module already loaded"
                    $loaded = $true
                    $loadedModules += $moduleName
                }
            }
            catch {
                # Module failed, try snap-in as fallback (for mixed environments)
                try {
                    if (-not (Get-PSSnapin -Name $snapinName -ErrorAction SilentlyContinue)) {
                        Add-PSSnapin -Name $snapinName -ErrorAction Stop
                        Write-Verbose "Loaded $moduleName as snap-in (fallback)"
                        $loaded = $true
                        $loadedModules += $snapinName
                    }
                    else {
                        Write-Verbose "$moduleName snap-in already loaded"
                        $loaded = $true
                        $loadedModules += $snapinName
                    }
                }
                catch {
                    $errorMsg = "Failed to load $moduleName as module and snap-in: $_"
                    Write-Warning $errorMsg
                    $errors += $errorMsg
                }
            }
        }
    }
    
    # Return object with status
    return @{
        Loaded = $loadedModules
        Errors = $errors
        Success = ($errors.Count -eq 0)
    }
}

# Export the function
Export-ModuleMember -Function Load-CitrixModules

