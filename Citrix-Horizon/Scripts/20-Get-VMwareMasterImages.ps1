# Get-VMwareMasterImages.ps1
# Discovers VMware VMs matching SHC-M-* pattern for GoldenSun project
# Connects to vCenter and extracts master image information
# Author : LAB007.AI
# Version: 1.1
# Last Modified: 260106:1948

param(
    [string]$OutputPath = '.\Data\goldensun-master-images.json',
    [string]$vCenterServer = 'shcvcsacx01.ccr.cchcs.org'
)

# Align output handling with other scripts (e.g., Get-CitrixCatalogs)
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

try {
    # Check if VMware PowerCLI is available
    $vmwareModule = Get-Module -ListAvailable -Name VMware.PowerCLI
    if (-not $vmwareModule) {
        Write-Error 'VMware PowerCLI module not found. Please install it first.'
        Write-Host 'You can install it with: Install-Module -Name VMware.PowerCLI -Scope CurrentUser' -ForegroundColor Yellow
        exit 1
    }

    # Import VMware PowerCLI module
    Import-Module VMware.PowerCLI -ErrorAction Stop

    # Suppress certificate warnings
    Set-PowerCLIConfiguration -InvalidCertificateAction Ignore -Confirm:$false -Scope Session | Out-Null

    # Prompt for vCenter server (default provided)
    $inputServer = Read-Host "Enter vCenter Server name or IP [$vCenterServer]"
    if (-not [string]::IsNullOrWhiteSpace($inputServer)) {
        $vCenterServer = $inputServer
    }
    if ([string]::IsNullOrWhiteSpace($vCenterServer)) {
        Write-Error 'vCenter Server name is required'
        exit 1
    }

    # Prompt for credentials
    $credential = Get-Credential -Message "Enter vCenter credentials for $vCenterServer"

    Write-Host "Connecting to vCenter Server: $vCenterServer..." -ForegroundColor Yellow

    # Connect to vCenter (will prompt for credentials)
    try {
        $connection = Connect-VIServer -Server $vCenterServer -Credential $credential -ErrorAction Stop
        Write-Host "Successfully connected to $vCenterServer" -ForegroundColor Green
    }
    catch {
        Write-Error "Failed to connect to vCenter: $_"
        exit 1
    }

    # Search for VMs matching SHC-M-* pattern
    Write-Host 'Searching for VMs matching pattern SHC-M-*...' -ForegroundColor Yellow

    $vms = Get-VM -Name 'SHC-M-*' -ErrorAction SilentlyContinue

    if (-not $vms -or $vms.Count -eq 0) {
        Write-Warning 'No VMs found matching pattern SHC-M-*'
        $masterImages = @()
    } else {
        Write-Host "Found $($vms.Count) master image(s)" -ForegroundColor Green

        $masterImages = @()

        foreach ($vm in $vms) {
            Write-Host "Processing: $($vm.Name)..." -ForegroundColor Cyan

            # Get VM details
            $vmView = $vm | Get-View
            $cluster = Get-Cluster -VM $vm -ErrorAction SilentlyContinue
            $vmHost = Get-VMHost -VM $vm -ErrorAction SilentlyContinue
            $datastore = Get-Datastore -VM $vm -ErrorAction SilentlyContinue | Select-Object -First 1

            # Parse VM name to extract components
            # Expected format: SHC-M-{ImageName}V{Version} or SHC-M-{ImageName}
            $vmName = $vm.Name
            $shortName = $vmName
            $clusterName = if ($cluster) { $cluster.Name } else { 'Unknown' }
            $version = 'V1'

            # Extract version if present (look for V followed by number at the end)
            if ($vmName -match '(.+?)(V\d+)$') {
                $shortName = $matches[1]
                $version = $matches[2]
            }

            # Get snapshot information
            $snapshots = Get-Snapshot -VM $vm -ErrorAction SilentlyContinue
            $hasSnapshot = ($snapshots -and $snapshots.Count -gt 0)
            $latestSnapshot = if ($hasSnapshot) {
                $snapshots | Sort-Object -Property Created -Descending | Select-Object -First 1
            } else {
                $null
            }

            $imageInfo = @{
                Name = $vmName
                ShortName = $shortName
                Version = $version
                Cluster = $clusterName
                Host = if ($vmHost) { $vmHost.Name } else { 'Unknown' }
                Datastore = if ($datastore) { $datastore.Name } else { 'Unknown' }
                PowerState = $vm.PowerState.ToString()
                NumCPU = $vm.NumCpu
                MemoryGB = $vm.MemoryGB
                ProvisionedSpaceGB = [math]::Round($vm.ProvisionedSpaceGB, 2)
                UsedSpaceGB = [math]::Round($vm.UsedSpaceGB, 2)
                GuestOS = $vm.Guest.OSFullName
                HasSnapshot = $hasSnapshot
                SnapshotCount = if ($snapshots) { $snapshots.Count } else { 0 }
                LatestSnapshot = $latestSnapshot
                Notes = $vm.Notes
            }

            $masterImages += $imageInfo
            Write-Host "  OK: $vmName - Cluster: $clusterName, Version: $version" -ForegroundColor Green
        }
    }

    # Create result object
    $result = @{
        TotalImages = $masterImages.Count
        vCenterServer = $vCenterServer
        CollectedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        MasterImages = $masterImages
    }

    # Convert to JSON and save
    $jsonContent = $result | ConvertTo-Json -Depth 10
    $jsonContent | Out-File -FilePath $OutputPath -Encoding UTF8 -Force

    Write-Host ''
    Write-Host 'Master images information collected successfully!' -ForegroundColor Green
    Write-Host "Total images found: $($masterImages.Count)" -ForegroundColor White
    Write-Host "Data saved to: $OutputPath" -ForegroundColor Gray

    # Disconnect from vCenter
    Disconnect-VIServer -Server $vCenterServer -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host 'Disconnected from vCenter' -ForegroundColor Gray

    return $result
}
catch {
    Write-Error 'Failed to collect master images information: $_'

    # Try to disconnect if connected
    try {
        Disconnect-VIServer -Server '*' -Confirm:$false -ErrorAction SilentlyContinue
    }
    catch {
        # Ignore disconnect errors
    }

    # Save error result
    $errorResult = @{
        TotalImages = 0
        vCenterServer = if ($vCenterServer) { $vCenterServer } else { 'Unknown' }
        CollectedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        MasterImages = @()
        Error = $_.ToString()
    }

    $errorResult | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8 -Force

    exit 1
}
