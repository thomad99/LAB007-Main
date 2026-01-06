# Get-VMwareServerSpecs.ps1
# Collects server specs (RAM, CPU, Disk) from VMware vCenter/ESXi
# This data will be merged with Citrix server data
# Author : LAB007.AI
# Version: 1.0
# Last Modified: 250127

param(
    [string]$OutputPath = ".\Data\vmware-server-specs.json",
    [string]$VMwareServer = "",
    [string]$VMwareUsername = "",
    [string]$VMwarePassword = "",
    [array]$ServerNames = @()  # Optional: specific servers to query, otherwise queries all VMs
)

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

if (-not $VMwareServer) {
    Write-Warning "VMware server not specified. Cannot collect VMware specs."
    $result = @{
        TotalVMs = 0
        VMSpecs = @()
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        Errors = @("VMware server not specified")
    }
    $result | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
    return $result
}

try {
    Write-Host "Collecting VMware server specs from $VMwareServer..." -ForegroundColor Yellow
    
    # Check if VMware PowerCLI is available
    $vmwareModule = Get-Module -ListAvailable -Name VMware.PowerCLI
    if (-not $vmwareModule) {
        $errorMsg = "VMware PowerCLI module not found. Place VMware PowerCLI files in .\Dependencies\VMware\ and run Install-RequiredModules.ps1"
        Write-Warning $errorMsg
        $result = @{
            TotalVMs = 0
            VMSpecs = @()
            CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            Errors = @($errorMsg)
        }
        $result | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
        return $result
    }
    
    # Import VMware module
    Import-Module VMware.PowerCLI -ErrorAction SilentlyContinue | Out-Null
    
    # Connect to VMware
    Write-Host "Connecting to VMware vCenter/ESXi: $VMwareServer..." -ForegroundColor Yellow
    try {
        if ($VMwareUsername -and $VMwarePassword) {
            $securePassword = ConvertTo-SecureString $VMwarePassword -AsPlainText -Force
            $credential = New-Object System.Management.Automation.PSCredential($VMwareUsername, $securePassword)
            $connection = Connect-VIServer -Server $VMwareServer -Credential $credential -ErrorAction Stop
        }
        else {
            $connection = Connect-VIServer -Server $VMwareServer -ErrorAction Stop
        }
        Write-Host "Successfully connected to VMware" -ForegroundColor Green
    }
    catch {
        $errorMsg = "Failed to connect to VMware server '$VMwareServer': $_"
        Write-Error $errorMsg
        $result = @{
            TotalVMs = 0
            VMSpecs = @()
            CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            Errors = @($errorMsg)
        }
        $result | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
        return $result
    }
    
    # Get VMs
    $vms = @()
    if ($ServerNames -and $ServerNames.Count -gt 0) {
        Write-Host "Querying specific servers: $($ServerNames.Count)" -ForegroundColor Gray
        foreach ($serverName in $ServerNames) {
            # Try different name formats
            $searchNames = @($serverName, $serverName.Split('.')[0], "*$($serverName.Split('.')[0])*")
            $vm = $null
            foreach ($searchName in $searchNames) {
                $vm = Get-VM -Name $searchName -ErrorAction SilentlyContinue
                if ($vm) { break }
            }
            if ($vm) {
                $vms += $vm
            }
            else {
                Write-Warning "VM not found in VMware for server: $serverName"
            }
        }
    }
    else {
        Write-Host "Querying all VMs from VMware..." -ForegroundColor Gray
        $vms = Get-VM -ErrorAction Stop
    }
    
    Write-Host "Found $($vms.Count) VMs in VMware" -ForegroundColor Green
    
    $vmSpecs = @()
    $processedCount = 0
    
    foreach ($vm in $vms) {
        try {
            $processedCount++
            Write-Host "[$processedCount/$($vms.Count)] Processing VM: $($vm.Name)..." -ForegroundColor Gray
            
            $vmConfig = $vm | Get-View
            $vmInfo = @{
                VMName = $vm.Name
                HostName = $vm.Name  # Default to VM name, will be matched later
                GuestHostName = $vm.Guest.HostName  # Actual hostname from guest OS
                PowerState = $vm.PowerState.ToString()
            }
            
            # RAM (in MB, convert to GB)
            if ($vmConfig.Config.Hardware.MemoryMB) {
                $vmInfo.TotalRAM_GB = [math]::Round(($vmConfig.Config.Hardware.MemoryMB / 1024), 2)
            }
            
            # CPU
            if ($vmConfig.Config.Hardware.NumCPU) {
                $vmInfo.CPUCount = $vmConfig.Config.Hardware.NumCPU
                $vmInfo.CPUCores = $vmConfig.Config.Hardware.NumCoresPerSocket * $vmConfig.Config.Hardware.NumCPU
                $vmInfo.CPULogicalProcessors = $vmInfo.CPUCores
            }
            
            # Disk (sum all virtual disks)
            $totalDiskGB = 0
            $disks = @()
            foreach ($device in $vmConfig.Config.Hardware.Device) {
                if ($device -is [VMware.Vim.VirtualDisk]) {
                    $diskSizeGB = [math]::Round(($device.CapacityInKB / 1MB / 1024), 2)
                    $totalDiskGB += $diskSizeGB
                    $disks += @{
                        Label = $device.DeviceInfo.Label
                        CapacityGB = $diskSizeGB
                    }
                }
            }
            if ($totalDiskGB -gt 0) {
                $vmInfo.DiskTotalSize_GB = $totalDiskGB
                $vmInfo.Disks = $disks
            }
            
            # OS Version (from guest info if available)
            if ($vm.Guest.OSFullName) {
                $vmInfo.OSVersion = $vm.Guest.OSFullName
            }
            elseif ($vm.Guest.GuestFullName) {
                $vmInfo.OSVersion = $vm.Guest.GuestFullName
            }
            
            # Additional VMware info
            $vmInfo.Cluster = $vm.VMHost.Parent.Name
            $vmInfo.Host = $vm.VMHost.Name
            $vmInfo.Datastore = ($vm.DatastoreIdList | ForEach-Object { Get-Datastore -Id $_ | Select-Object -ExpandProperty Name }) -join ", "
            
            $vmSpecs += $vmInfo
            Write-Host "  ✓ Collected specs for $($vm.Name) (RAM: $($vmInfo.TotalRAM_GB)GB, CPU: $($vmInfo.CPUCount) vCPU, Disk: $($vmInfo.DiskTotalSize_GB)GB)" -ForegroundColor Green
        }
        catch {
            Write-Warning "Error processing VM $($vm.Name): $_"
        }
    }
    
    # Disconnect from VMware
    Disconnect-VIServer -Server $VMwareServer -Confirm:$false -ErrorAction SilentlyContinue
    
    $result = @{
        VMwareServer = $VMwareServer
        TotalVMs = $vmSpecs.Count
        VMSpecs = $vmSpecs
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        Errors = @()
    }
    
    Write-Host "" -ForegroundColor Gray
    Write-Host "VMware Specs Collection Summary:" -ForegroundColor Cyan
    Write-Host "  Total VMs Processed: $($vmSpecs.Count)" -ForegroundColor White
    Write-Host "  VMs with RAM data: $(($vmSpecs | Where-Object { $_.TotalRAM_GB }).Count)" -ForegroundColor Green
    Write-Host "  VMs with CPU data: $(($vmSpecs | Where-Object { $_.CPUCount }).Count)" -ForegroundColor Green
    Write-Host "  VMs with Disk data: $(($vmSpecs | Where-Object { $_.DiskTotalSize_GB }).Count)" -ForegroundColor Green
    
    # Save to JSON
    $result | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
    Write-Host "VMware specs saved to: $OutputPath" -ForegroundColor Green
    
    return $result
}
catch {
    $errorMsg = "Failed to collect VMware server specs: $_"
    Write-Error $errorMsg
    
    # Disconnect if connected
    try {
        Disconnect-VIServer -Server $VMwareServer -Confirm:$false -ErrorAction SilentlyContinue
    }
    catch {
        # Ignore disconnect errors
    }
    
    $result = @{
        TotalVMs = 0
        VMSpecs = @()
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        Errors = @($errorMsg)
    }
    
    $result | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
    return $result
}

