# Read-Configuration.ps1
# Reads configuration from JSON file or returns defaults
# Author : LAB007.AI
# Version: 2.0
# Last Modified: 260106:2200

param(
    [string]$ConfigPath = ".\LAB007-Config.JSON"
)

function Get-Configuration {
    $defaultConfig = @{
        CitrixVersion = "1912"
        DDCName = "localhost"
        UsageDays = 30
        SkipServerSpecs = $false
        RunPreReqCheck = $true
        AuditComponents = @{
            SiteInfo = $true
            Applications = $true
            Desktops = $true
            Catalogs = $true
            DeliveryGroups = $true
            UsageStats = $true
            Policies = $true
            Roles = $true
            VMwareSpecs = $false  # Disabled by default since it requires VMware credentials
            VMwareFolders = $false  # Disabled by default since it requires VMware credentials
            Servers = $true
            DirectorOData = $true
        }
    }

    # Try to read from file
    if (Test-Path $ConfigPath) {
        try {
            $config = Get-Content -Path $ConfigPath -Raw | ConvertFrom-Json
            Write-Host "Configuration loaded from: $ConfigPath" -ForegroundColor Green
            
            # Build audit components configuration
            $auditComponents = @{}
            foreach ($component in $defaultConfig.AuditComponents.Keys) {
                $configKey = $component.ToLower()
                if ($config.auditComponents -and $config.auditComponents.$configKey -ne $null) {
                    $auditComponents[$component] = [bool]$config.auditComponents.$configKey
                } elseif ($config.AuditComponents -and $config.AuditComponents.$component -ne $null) {
                    $auditComponents[$component] = [bool]$config.AuditComponents.$component
                } else {
                    $auditComponents[$component] = $defaultConfig.AuditComponents[$component]
                }
            }

            return @{
                CitrixVersion = if ($config.citrixVersion) { $config.citrixVersion } elseif ($config.CitrixVersion) { $config.CitrixVersion } else { $defaultConfig.CitrixVersion }
                DDCName = if ($config.ddcName) { $config.ddcName } elseif ($config.DDCName) { $config.DDCName } else { $defaultConfig.DDCName }
                UsageDays = if ($config.usageDays) { [int]$config.usageDays } elseif ($config.UsageDays) { [int]$config.UsageDays } else { $defaultConfig.UsageDays }
                vCenterServer = if ($config.vCenterServer) { $config.vCenterServer } elseif ($config.VMwareServer) { $config.VMwareServer } else { $null }
                vCenterUsername = if ($config.vCenterUsername) { $config.vCenterUsername } elseif ($config.VMwareUsername) { $config.VMwareUsername } else { $null }
                vCenterPassword = if ($config.vCenterPassword) { $config.vCenterPassword } elseif ($config.VMwarePassword) { $config.VMwarePassword } else { $null }
                cloneDestinationFolder = if ($config.cloneDestinationFolder) { $config.cloneDestinationFolder } else { $null }
                sourceMoveFolder = if ($config.sourceMoveFolder) { $config.sourceMoveFolder } else { $null }
                SkipServerSpecs = if ($null -ne $config.skipServerSpecs) { [bool]$config.skipServerSpecs } elseif ($null -ne $config.SkipServerSpecs) { [bool]$config.SkipServerSpecs } else { $defaultConfig.SkipServerSpecs }
                RunPreReqCheck = if ($null -ne $config.runPreReqCheck) { [bool]$config.runPreReqCheck } elseif ($null -ne $config.RunPreReqCheck) { [bool]$config.RunPreReqCheck } else { $defaultConfig.RunPreReqCheck }
                AuditComponents = $auditComponents
            }
        }
        catch {
            Write-Warning "Error reading config file, using defaults: $_"
            return $defaultConfig
        }
    }
    else {
        Write-Host "No configuration file found, using defaults:" -ForegroundColor Yellow
        Write-Host "  Version: $($defaultConfig.CitrixVersion)" -ForegroundColor Gray
        Write-Host "  DDC: $($defaultConfig.DDCName)" -ForegroundColor Gray
        Write-Host "  Days: $($defaultConfig.UsageDays)" -ForegroundColor Gray
        Write-Host "  Pre-req Check: $($defaultConfig.RunPreReqCheck)" -ForegroundColor Gray
        Write-Host "  Audit Components:" -ForegroundColor Gray
        foreach ($component in $defaultConfig.AuditComponents.Keys) {
            $status = if ($defaultConfig.AuditComponents[$component]) { "Enabled" } else { "Disabled" }
            Write-Host "    $component`: $status" -ForegroundColor Gray
        }
        return $defaultConfig
    }
}

return Get-Configuration

