# Read-Configuration.ps1
# Reads configuration from JSON file or returns defaults
# Version: 1.0
# Last Modified: 250127

param(
    [string]$ConfigPath = ".\lab007-config.json"
)

function Get-Configuration {
    $defaultConfig = @{
        CitrixVersion = "1912"
        DDCName = "localhost"
        UsageDays = 30
        SkipServerSpecs = $false
    }

    # Try to read from file
    if (Test-Path $ConfigPath) {
        try {
            $config = Get-Content -Path $ConfigPath -Raw | ConvertFrom-Json
            Write-Host "Configuration loaded from: $ConfigPath" -ForegroundColor Green
            
            return @{
                CitrixVersion = if ($config.citrixVersion) { $config.citrixVersion } elseif ($config.CitrixVersion) { $config.CitrixVersion } else { $defaultConfig.CitrixVersion }
                DDCName = if ($config.ddcName) { $config.ddcName } elseif ($config.DDCName) { $config.DDCName } else { $defaultConfig.DDCName }
                UsageDays = if ($config.usageDays) { [int]$config.usageDays } elseif ($config.UsageDays) { [int]$config.UsageDays } else { $defaultConfig.UsageDays }
                SkipServerSpecs = if ($null -ne $config.skipServerSpecs) { [bool]$config.skipServerSpecs } elseif ($null -ne $config.SkipServerSpecs) { [bool]$config.SkipServerSpecs } else { $defaultConfig.SkipServerSpecs }
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
        return $defaultConfig
    }
}

return Get-Configuration

