# Check-CitrixModules.ps1
# Quick script to check what Citrix modules/snap-ins are loaded

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Citrix Module/Snap-in Status" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Loaded PowerShell Modules:" -ForegroundColor Yellow
$loadedModules = Get-Module | Where-Object { $_.Name -like "Citrix*" }
if ($loadedModules) {
    $loadedModules | Format-Table Name, Version, ModuleType -AutoSize
}
else {
    Write-Host "  No Citrix modules are currently loaded" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Loaded PowerShell Snap-ins:" -ForegroundColor Yellow
$loadedSnapins = Get-PSSnapin | Where-Object { $_.Name -like "Citrix*" }
if ($loadedSnapins) {
    $loadedSnapins | Format-Table Name, Version -AutoSize
}
else {
    Write-Host "  No Citrix snap-ins are currently loaded" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Available Citrix Modules (not necessarily loaded):" -ForegroundColor Yellow
$availableModules = Get-Module -ListAvailable | Where-Object { $_.Name -like "Citrix*" }
if ($availableModules) {
    $availableModules | Format-Table Name, Version, ModuleBase -AutoSize
}
else {
    Write-Host "  No Citrix modules are available" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Registered Citrix Snap-ins (not necessarily loaded):" -ForegroundColor Yellow
$registeredSnapins = Get-PSSnapin -Registered | Where-Object { $_.Name -like "Citrix*" }
if ($registeredSnapins) {
    $registeredSnapins | Format-Table Name, Version -AutoSize
}
else {
    Write-Host "  No Citrix snap-ins are registered" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Required for this audit:" -ForegroundColor Cyan
Write-Host "  - Citrix.Broker.Admin.V2" -ForegroundColor White
Write-Host "  - Citrix.MachineCreation.Admin.V2" -ForegroundColor White
Write-Host "  - Citrix.Monitor.ServiceProvider.V2" -ForegroundColor White

