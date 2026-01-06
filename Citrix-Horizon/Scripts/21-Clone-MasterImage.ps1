# Clone-MasterImage.ps1
# Clones VMware master images with version increment for GoldenSun project
# Author : LAB007.AI
# Version: 1.0
# Last Modified: 260106:1024

param(
    [Parameter(Mandatory=$true)]
    [string]$SourceVMName,
    
    [string]$vCenterServer = "",
    
    [switch]$WhatIf
)

try {
    # Check if VMware PowerCLI is available
    $vmwareModule = Get-Module -ListAvailable -Name VMware.PowerCLI
    if (-not $vmwareModule) {
        Write-Error "VMware PowerCLI module not found. Please install it first."
        exit 1
    }

    # Import VMware PowerCLI module
    Import-Module VMware.PowerCLI -ErrorAction Stop
    
    # Suppress certificate warnings
    Set-PowerCLIConfiguration -InvalidCertificateAction Ignore -Confirm:$false -Scope Session | Out-Null
    
    # Connect to vCenter if not already connected
    $existingConnection = $global:DefaultVIServer
    if (-not $existingConnection) {
        if ([string]::IsNullOrWhiteSpace($vCenterServer)) {
            $vCenterServer = Read-Host "Enter vCenter Server name or IP"
        }
        
        Write-Host "Connecting to vCenter Server: $vCenterServer..." -ForegroundColor Yellow
        $connection = Connect-VIServer -Server $vCenterServer -ErrorAction Stop
        Write-Host "Successfully connected to $vCenterServer" -ForegroundColor Green
    }
    else {
        Write-Host "Using existing connection to $($existingConnection.Name)" -ForegroundColor Gray
    }
    
    # Get source VM
    Write-Host "Looking for source VM: $SourceVMName..." -ForegroundColor Yellow
    $sourceVM = Get-VM -Name $SourceVMName -ErrorAction Stop
    
    if (-not $sourceVM) {
        Write-Error "Source VM '$SourceVMName' not found"
        exit 1
    }
    
    Write-Host "Found source VM: $($sourceVM.Name)" -ForegroundColor Green
    
    # Parse VM name and determine new clone name with version increment
    $vmName = $sourceVM.Name
    $newVMName = ""
    
    # Check if name ends with V followed by number
    if ($vmName -match '(.+?)(V)(\d+)$') {
        $baseName = $matches[1]
        $versionPrefix = $matches[2]
        $versionNumber = [int]$matches[3]
        $newVersionNumber = $versionNumber + 1
        $newVMName = "$baseName$versionPrefix$newVersionNumber"
    }
    else {
        # No version found, add V2
        $newVMName = "${vmName}V2"
    }
    
    Write-Host "New clone name will be: $newVMName" -ForegroundColor Cyan
    
    # Check if VM with new name already exists
    $existingVM = Get-VM -Name $newVMName -ErrorAction SilentlyContinue
    if ($existingVM) {
        Write-Error "A VM with name '$newVMName' already exists. Please remove it first or choose a different source VM."
        exit 1
    }
    
    # Get source VM details for cloning
    $cluster = Get-Cluster -VM $sourceVM -ErrorAction SilentlyContinue
    $vmHost = Get-VMHost -VM $sourceVM -ErrorAction SilentlyContinue
    $datastore = Get-Datastore -VM $sourceVM -ErrorAction SilentlyContinue | Select-Object -First 1
    $resourcePool = Get-ResourcePool -VM $sourceVM -ErrorAction SilentlyContinue
    
    Write-Host ""
    Write-Host "Clone Configuration:" -ForegroundColor Cyan
    Write-Host "  Source VM: $($sourceVM.Name)" -ForegroundColor White
    Write-Host "  New VM Name: $newVMName" -ForegroundColor White
    Write-Host "  Cluster: $(if ($cluster) { $cluster.Name } else { 'N/A' })" -ForegroundColor White
    Write-Host "  Host: $(if ($vmHost) { $vmHost.Name } else { 'N/A' })" -ForegroundColor White
    Write-Host "  Datastore: $(if ($datastore) { $datastore.Name } else { 'N/A' })" -ForegroundColor White
    Write-Host "  Resource Pool: $(if ($resourcePool) { $resourcePool.Name } else { 'N/A' })" -ForegroundColor White
    Write-Host ""
    
    if ($WhatIf) {
        Write-Host "WhatIf: Would clone VM '$($sourceVM.Name)' to '$newVMName'" -ForegroundColor Yellow
        return @{
            Success = $true
            SourceVM = $sourceVM.Name
            NewVMName = $newVMName
            WhatIf = $true
        }
    }
    
    # Perform the clone
    Write-Host "Starting clone operation..." -ForegroundColor Yellow
    Write-Host "This may take several minutes depending on VM size..." -ForegroundColor Gray
    
    $cloneParams = @{
        VM = $sourceVM
        Name = $newVMName
    }
    
    # Add location parameters if available
    if ($vmHost) {
        $cloneParams.VMHost = $vmHost
    }
    elseif ($cluster) {
        $cloneParams.Location = $cluster
    }
    
    if ($datastore) {
        $cloneParams.Datastore = $datastore
    }
    
    if ($resourcePool) {
        $cloneParams.ResourcePool = $resourcePool
    }
    
    $newVM = New-VM @cloneParams -ErrorAction Stop
    
    Write-Host ""
    Write-Host "✓ Clone operation completed successfully!" -ForegroundColor Green
    Write-Host "  New VM: $($newVM.Name)" -ForegroundColor White
    Write-Host "  Power State: $($newVM.PowerState)" -ForegroundColor White
    Write-Host "  CPUs: $($newVM.NumCpu)" -ForegroundColor White
    Write-Host "  Memory: $($newVM.MemoryGB) GB" -ForegroundColor White
    
    return @{
        Success = $true
        SourceVM = $sourceVM.Name
        NewVMName = $newVM.Name
        PowerState = $newVM.PowerState.ToString()
        NumCPU = $newVM.NumCpu
        MemoryGB = $newVM.MemoryGB
        Cluster = if ($cluster) { $cluster.Name } else { $null }
        Host = if ($vmHost) { $vmHost.Name } else { $null }
        Datastore = if ($datastore) { $datastore.Name } else { $null }
    }
}
catch {
    Write-Error "Failed to clone VM: $_"
    Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor Red
    
    return @{
        Success = $false
        SourceVM = $SourceVMName
        Error = $_.ToString()
    }
}

# Clone-MasterImage.ps1
# Clones VMware master images with version increment for GoldenSun project
# Author : LAB007.AI
# Version: 1.0
# Last Modified: 260106:1024

param(
    [Parameter(Mandatory=$true)]
    [string]$SourceVMName,
    
    [string]$vCenterServer = "",
    
    [switch]$WhatIf
)

try {
    # Check if VMware PowerCLI is available
    $vmwareModule = Get-Module -ListAvailable -Name VMware.PowerCLI
    if (-not $vmwareModule) {
        Write-Error "VMware PowerCLI module not found. Please install it first."
        exit 1
    }

    # Import VMware PowerCLI module
    Import-Module VMware.PowerCLI -ErrorAction Stop
    
    # Suppress certificate warnings
    Set-PowerCLIConfiguration -InvalidCertificateAction Ignore -Confirm:$false -Scope Session | Out-Null
    
    # Connect to vCenter if not already connected
    $existingConnection = $global:DefaultVIServer
    if (-not $existingConnection) {
        if ([string]::IsNullOrWhiteSpace($vCenterServer)) {
            $vCenterServer = Read-Host "Enter vCenter Server name or IP"
        }
        
        Write-Host "Connecting to vCenter Server: $vCenterServer..." -ForegroundColor Yellow
        $connection = Connect-VIServer -Server $vCenterServer -ErrorAction Stop
        Write-Host "Successfully connected to $vCenterServer" -ForegroundColor Green
    }
    else {
        Write-Host "Using existing connection to $($existingConnection.Name)" -ForegroundColor Gray
    }
    
    # Get source VM
    Write-Host "Looking for source VM: $SourceVMName..." -ForegroundColor Yellow
    $sourceVM = Get-VM -Name $SourceVMName -ErrorAction Stop
    
    if (-not $sourceVM) {
        Write-Error "Source VM '$SourceVMName' not found"
        exit 1
    }
    
    Write-Host "Found source VM: $($sourceVM.Name)" -ForegroundColor Green
    
    # Parse VM name and determine new clone name with version increment
    $vmName = $sourceVM.Name
    $newVMName = ""
    
    # Check if name ends with V followed by number
    if ($vmName -match '(.+?)(V)(\d+)$') {
        $baseName = $matches[1]
        $versionPrefix = $matches[2]
        $versionNumber = [int]$matches[3]
        $newVersionNumber = $versionNumber + 1
        $newVMName = "$baseName$versionPrefix$newVersionNumber"
    }
    else {
        # No version found, add V2
        $newVMName = "${vmName}V2"
    }
    
    Write-Host "New clone name will be: $newVMName" -ForegroundColor Cyan
    
    # Check if VM with new name already exists
    $existingVM = Get-VM -Name $newVMName -ErrorAction SilentlyContinue
    if ($existingVM) {
        Write-Error "A VM with name '$newVMName' already exists. Please remove it first or choose a different source VM."
        exit 1
    }
    
    # Get source VM details for cloning
    $cluster = Get-Cluster -VM $sourceVM -ErrorAction SilentlyContinue
    $vmHost = Get-VMHost -VM $sourceVM -ErrorAction SilentlyContinue
    $datastore = Get-Datastore -VM $sourceVM -ErrorAction SilentlyContinue | Select-Object -First 1
    $resourcePool = Get-ResourcePool -VM $sourceVM -ErrorAction SilentlyContinue
    
    Write-Host ""
    Write-Host "Clone Configuration:" -ForegroundColor Cyan
    Write-Host "  Source VM: $($sourceVM.Name)" -ForegroundColor White
    Write-Host "  New VM Name: $newVMName" -ForegroundColor White
    Write-Host "  Cluster: $(if ($cluster) { $cluster.Name } else { 'N/A' })" -ForegroundColor White
    Write-Host "  Host: $(if ($vmHost) { $vmHost.Name } else { 'N/A' })" -ForegroundColor White
    Write-Host "  Datastore: $(if ($datastore) { $datastore.Name } else { 'N/A' })" -ForegroundColor White
    Write-Host "  Resource Pool: $(if ($resourcePool) { $resourcePool.Name } else { 'N/A' })" -ForegroundColor White
    Write-Host ""
    
    if ($WhatIf) {
        Write-Host "WhatIf: Would clone VM '$($sourceVM.Name)' to '$newVMName'" -ForegroundColor Yellow
        return @{
            Success = $true
            SourceVM = $sourceVM.Name
            NewVMName = $newVMName
            WhatIf = $true
        }
    }
    
    # Perform the clone
    Write-Host "Starting clone operation..." -ForegroundColor Yellow
    Write-Host "This may take several minutes depending on VM size..." -ForegroundColor Gray
    
    $cloneParams = @{
        VM = $sourceVM
        Name = $newVMName
    }
    
    # Add location parameters if available
    if ($vmHost) {
        $cloneParams.VMHost = $vmHost
    }
    elseif ($cluster) {
        $cloneParams.Location = $cluster
    }
    
    if ($datastore) {
        $cloneParams.Datastore = $datastore
    }
    
    if ($resourcePool) {
        $cloneParams.ResourcePool = $resourcePool
    }
    
    $newVM = New-VM @cloneParams -ErrorAction Stop
    
    Write-Host ""
    Write-Host "✓ Clone operation completed successfully!" -ForegroundColor Green
    Write-Host "  New VM: $($newVM.Name)" -ForegroundColor White
    Write-Host "  Power State: $($newVM.PowerState)" -ForegroundColor White
    Write-Host "  CPUs: $($newVM.NumCpu)" -ForegroundColor White
    Write-Host "  Memory: $($newVM.MemoryGB) GB" -ForegroundColor White
    
    return @{
        Success = $true
        SourceVM = $sourceVM.Name
        NewVMName = $newVM.Name
        PowerState = $newVM.PowerState.ToString()
        NumCPU = $newVM.NumCpu
        MemoryGB = $newVM.MemoryGB
        Cluster = if ($cluster) { $cluster.Name } else { $null }
        Host = if ($vmHost) { $vmHost.Name } else { $null }
        Datastore = if ($datastore) { $datastore.Name } else { $null }
    }
}
catch {
    Write-Error "Failed to clone VM: $_"
    Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor Red
    
    return @{
        Success = $false
        SourceVM = $SourceVMName
        Error = $_.ToString()
    }
}

