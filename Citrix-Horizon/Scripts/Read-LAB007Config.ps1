# Read-LAB007Config.ps1
# PowerShell script to read the LAB007 Tools configuration from JSON file

param(
    [string]$ConfigPath = "$PSScriptRoot\..\LAB007-Config.JSON"
)

function Read-LAB007Config {
    param([string]$Path)

    if (!(Test-Path $Path)) {
        Write-Warning "Configuration file not found at: $Path"
        Write-Warning "Using default configuration..."

        # Return default configuration
        return @{
            citrixVersion = "1912"
            ddcName = "localhost"
            usageDays = 30
            vCenterServer = ""
            masterImagePrefix = "SHC-M-"
            runPreReqCheck = $true
            auditComponents = @{
                SiteInfo = $true
                Applications = $true
                Desktops = $true
                Catalogs = $true
                DeliveryGroups = $true
                UsageStats = $true
                Policies = $true
                Roles = $true
                VMwareSpecs = $false
                Servers = $true
                DirectorOData = $true
            }
        }
    }

    try {
        $configJson = Get-Content -Path $Path -Raw
        $config = ConvertFrom-Json $configJson
        Write-Host "Configuration loaded successfully from: $Path" -ForegroundColor Green
        return $config
    }
    catch {
        Write-Error "Failed to read or parse configuration file: $_"
        return $null
    }
}

# Example usage - uncomment to test:
# $config = Read-LAB007Config -Path $ConfigPath
# if ($config) {
#     Write-Host "Citrix Version: $($config.citrixVersion)"
#     Write-Host "DDC Name: $($config.ddcName)"
#     Write-Host "Usage Days: $($config.usageDays)"
#     Write-Host "Run Pre-req Check: $($config.runPreReqCheck)"
# }

# Export the function so it can be used by other scripts
Export-ModuleMember -Function Read-LAB007Config