# Write-Configuration.ps1
# Writes audit configuration to JSON file
# Author : LAB007.AI
# Version: 1.0
# Last Modified: 260106:2200

param(
    [string]$ConfigPath = ".\..\LAB007-Config.JSON",
    [bool]$RunPreReqCheck = $true,
    [bool]$SiteInfo = $true,
    [bool]$Applications = $true,
    [bool]$Desktops = $true,
    [bool]$Catalogs = $true,
    [bool]$DeliveryGroups = $true,
    [bool]$UsageStats = $true,
    [bool]$Policies = $true,
    [bool]$Roles = $true,
    [bool]$VMwareSpecs = $false,
    [bool]$Servers = $true,
    [bool]$DirectorOData = $true
)

$config = @{
    runPreReqCheck = $RunPreReqCheck
    auditComponents = @{
        SiteInfo = $SiteInfo
        Applications = $Applications
        Desktops = $Desktops
        Catalogs = $Catalogs
        DeliveryGroups = $DeliveryGroups
        UsageStats = $UsageStats
        Policies = $Policies
        Roles = $Roles
        VMwareSpecs = $VMwareSpecs
        Servers = $Servers
        DirectorOData = $DirectorOData
    }
}

# Convert to JSON and save
$config | ConvertTo-Json -Depth 10 | Set-Content -Path $ConfigPath -Encoding UTF8

Write-Host "Configuration saved to: $ConfigPath" -ForegroundColor Green
Write-Host "RunPreReqCheck: $RunPreReqCheck" -ForegroundColor Gray

Write-Host "Audit Components:" -ForegroundColor Gray
foreach ($component in $config.auditComponents.Keys) {
    $status = if ($config.auditComponents[$component]) { "Enabled" } else { "Disabled" }
    Write-Host "  $component`: $status" -ForegroundColor Gray
}
