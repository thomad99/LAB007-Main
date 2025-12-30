# Get-CitrixDesktops.ps1
# Extracts published desktops information

param(
    [string]$OutputPath = ".\Data\citrix-desktops.json",
    [string]$CitrixVersion = "1912"
)

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

try {
    # Note: Citrix modules/snap-ins must be loaded manually before running this script
    # Get all desktops (published desktops are in desktop groups)
    # Use MaxRecordCount to get more than 250 results
    $maxRecords = 10000
    if ($global:CitrixAdminAddress) {
        $desktopGroups = Get-BrokerDesktopGroup -DesktopKind "Shared" -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction Stop
    }
    else {
        $desktopGroups = Get-BrokerDesktopGroup -DesktopKind "Shared" -MaxRecordCount $maxRecords -ErrorAction Stop
    }
    
    $desktops = @()
    foreach ($group in $desktopGroups) {
        $desktopInfo = @{
            Name = $group.Name
            Uid = $group.Uid
            Enabled = $group.Enabled
            DesktopKind = $group.DesktopKind
            SessionSupport = $group.SessionSupport
            TotalMachines = $group.TotalMachines
            AvailableCount = $group.AvailableCount
            InUseCount = $group.InUseCount
            MaintenanceMode = $group.InMaintenanceMode
        }
        $desktops += $desktopInfo
    }
    
    $result = @{
        TotalPublishedDesktops = $desktops.Count
        Desktops = $desktops
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    }
    
    # Convert to JSON and save
    $result | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
    
    Write-Host "Desktops information collected successfully. Total: $($desktops.Count)" -ForegroundColor Green
    return $result
}
catch {
    Write-Warning "Failed to collect desktops information: $_"
    return @{
        TotalPublishedDesktops = 0
        Desktops = @()
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        Error = $_.ToString()
    }
}

