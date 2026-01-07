# Get-CitrixServers.ps1
# Extracts server information including specs (RAM, CPU, Disk)
# Uses VMware SDK as fallback if Citrix data unavailable
# Author : LAB007.AI
# Version: 1.4
# Last Modified: 260106:1948

param(
    [string]$OutputPath = ".\Data\citrix-servers.json",
    [string]$CitrixVersion = "1912",
    [string]$VMwareServer = "",
    [string]$VMwareUsername = "",
    [string]$VMwarePassword = ""
)

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not $outputDir) {
    $outputDir = ".\Data"
    $OutputPath = Join-Path $outputDir "citrix-servers.json"
}

# Resolve full path
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDir = [System.IO.Path]::GetFullPath($outputDir)

if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    Write-Host "[DEBUG] Created output directory: $outputDir" | Out-File -FilePath (Join-Path $outputDir "debug.txt") -Append
}

$debugFile = Join-Path $outputDir "debug.txt"

try {
    # Note: Citrix modules/snap-ins must be loaded manually before running this script
    Write-Host "Collecting server information from Citrix..." -ForegroundColor Yellow
    Write-Host "[DEBUG] Script started at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
    Write-Host "[DEBUG] OutputPath: $OutputPath" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
    Write-Host "[DEBUG] OutputDir: $outputDir" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
    Write-Host "[DEBUG] AdminAddress: $global:CitrixAdminAddress" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
    Write-Host "[DEBUG] CitrixVersion: $CitrixVersion" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
    
    # Check if VMware will be used as fallback
    if ($VMwareServer) {
        $vmwareModule = Get-Module -ListAvailable -Name VMware.PowerCLI
        if ($vmwareModule) {
            Write-Host "VMware fallback enabled: Will attempt to collect server specs from VMware vCenter/ESXi ($VMwareServer) if CIM fails" -ForegroundColor Cyan
        }
        else {
            Write-Warning "VMware server specified ($VMwareServer) but VMware PowerCLI module not found. Place VMware PowerCLI files in .\Dependencies\VMware\ and run Install-RequiredModules.ps1"
        }
    }
    else {
        Write-Host "VMware fallback not configured. Only CIM/WMI will be used for server specs." -ForegroundColor Gray
    }
    
    # Get all machines/servers (use AdminAddress if DDC was specified)
    # Use MaxRecordCount to get more than 250 results
    $maxRecords = 10000
    Write-Host "[DEBUG] Attempting to get machines with MaxRecordCount: $maxRecords" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
    
    try {
        if ($global:CitrixAdminAddress) {
            Write-Host "Using AdminAddress: $global:CitrixAdminAddress" -ForegroundColor Gray
            Write-Host "[DEBUG] Calling Get-BrokerMachine with AdminAddress: $global:CitrixAdminAddress" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
            $machines = Get-BrokerMachine -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction Stop
        }
        else {
            Write-Host "[DEBUG] Calling Get-BrokerMachine without AdminAddress" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
            $machines = Get-BrokerMachine -MaxRecordCount $maxRecords -ErrorAction Stop
        }
        Write-Host "Found $($machines.Count) machines/servers" -ForegroundColor Green
        Write-Host "[DEBUG] Successfully retrieved $($machines.Count) machines" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
    }
    catch {
        $errorMsg = "Failed to retrieve machines from Citrix: $_"
        Write-Error $errorMsg
        Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
        Write-Host "[DEBUG] Error details: $($_.Exception.Message)" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
        Write-Host "[DEBUG] Stack trace: $($_.ScriptStackTrace)" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
        throw
    }
    
    $servers = @()
    $uniqueServers = @{}
    
    if (-not $machines -or $machines.Count -eq 0) {
        Write-Warning "No machines returned from Get-BrokerMachine. This might indicate a connection or permission issue."
        Write-Host "[DEBUG] WARNING: No machines returned from Get-BrokerMachine" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
    }
    else {
        Write-Host "[DEBUG] Processing $($machines.Count) machines..." | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
    }
    
    foreach ($machine in $machines) {
        if (-not $machine) {
            Write-Host "[DEBUG] Skipping null machine object" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
            continue
        }
        
        $hostName = $machine.DNSName
        if (-not $hostName) {
            Write-Host "[DEBUG] Skipping machine with no DNSName: $($machine | ConvertTo-Json -Compress)" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
            continue
        }
        
        if (-not $uniqueServers.ContainsKey($hostName)) {
            # Get server specs via WMI/CIM (if accessible)
            $serverInfo = @{
                Name = $machine.DNSName
                Uid = $machine.Uid
                PowerState = $machine.PowerState
                RegistrationState = $machine.RegistrationState
                InMaintenanceMode = $machine.InMaintenanceMode
                DesktopGroup = $machine.DesktopGroupName
                Catalog = $machine.CatalogName
            }
            
            # Try to get server specs via CIM (requires proper permissions/access)
            $specsCollected = $false
            try {
                $cimSession = New-CimSession -ComputerName $hostName -ErrorAction SilentlyContinue
                if ($cimSession) {
                    $os = Get-CimInstance -CimSession $cimSession -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
                    $processor = Get-CimInstance -CimSession $cimSession -ClassName Win32_Processor -ErrorAction SilentlyContinue
                    $disk = Get-CimInstance -CimSession $cimSession -ClassName Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction SilentlyContinue
                    $totalMemory = Get-CimInstance -CimSession $cimSession -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue
                    
                    if ($os) {
                        $serverInfo.TotalRAM_GB = [math]::Round(($totalMemory.TotalPhysicalMemory / 1GB), 2)
                        $serverInfo.AvailableRAM_GB = [math]::Round(($os.FreePhysicalMemory * 1KB / 1GB), 2)
                        $serverInfo.OSVersion = $os.Caption
                        $specsCollected = $true
                    }
                    
                    if ($processor) {
                        $serverInfo.CPUCount = ($processor | Measure-Object).Count
                        $serverInfo.CPUCores = ($processor | Measure-Object -Property NumberOfCores -Sum).Sum
                        $serverInfo.CPULogicalProcessors = ($processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum
                        $serverInfo.CPUName = ($processor | Select-Object -First 1).Name
                        $specsCollected = $true
                    }
                    
                    if ($disk) {
                        $serverInfo.DiskTotalSize_GB = [math]::Round(($disk.Size / 1GB), 2)
                        $serverInfo.DiskFreeSpace_GB = [math]::Round(($disk.FreeSpace / 1GB), 2)
                        $serverInfo.DiskUsedSpace_GB = [math]::Round((($disk.Size - $disk.FreeSpace) / 1GB), 2)
                        $specsCollected = $true
                    }
                    
                    if ($specsCollected) {
                        $serverInfo.SpecsSource = "CIM"
                        Write-Host "  SUCCESS: Collected specs via CIM for $hostName" -ForegroundColor Green
                    }
                    
                    Remove-CimSession -CimSession $cimSession
                }
                else {
                    Write-Host "  - CIM session failed for $hostName, will try VMware if configured" -ForegroundColor Gray
                }
            }
            catch {
                Write-Warning "Could not retrieve detailed specs via CIM for $hostName : $_"
            }
            
            # If CIM failed and VMware SDK is available, try VMware
            if (-not $specsCollected -and $VMwareServer) {
                # Check if VMware PowerCLI is available
                $vmwareModule = Get-Module -ListAvailable -Name VMware.PowerCLI
                if (-not $vmwareModule) {
                    Write-Warning "  ERROR: VMware PowerCLI module not available for $hostName. Place VMware PowerCLI files in .\Dependencies\VMware\ and run Install-RequiredModules.ps1"
                }
                else {
                    try {
                        Write-Host "Attempting to get server specs from VMware for $hostName..." -ForegroundColor Yellow
                        
                        # Connect to VMware if not already connected
                        if (-not $global:VMwareConnection) {
                            if ($VMwareUsername -and $VMwarePassword) {
                                $securePassword = ConvertTo-SecureString $VMwarePassword -AsPlainText -Force
                                $credential = New-Object System.Management.Automation.PSCredential($VMwareUsername, $securePassword)
                                Connect-VIServer -Server $VMwareServer -Credential $credential -ErrorAction SilentlyContinue | Out-Null
                            }
                            else {
                                Connect-VIServer -Server $VMwareServer -ErrorAction SilentlyContinue | Out-Null
                            }
                            $global:VMwareConnection = $true
                        }
                        
                        # Find VM by hostname (try different name formats)
                        $vm = $null
                        $searchNames = @($hostName, $hostName.Split('.')[0], "*$($hostName.Split('.')[0])*")
                        
                        foreach ($searchName in $searchNames) {
                            $vm = Get-VM -Name $searchName -ErrorAction SilentlyContinue
                            if ($vm) { break }
                        }
                        
                        if ($vm) {
                            # Get VM specs from VMware
                            $vmConfig = $vm | Get-View
                            
                            # RAM (in MB, convert to GB)
                            if ($vmConfig.Config.Hardware.MemoryMB) {
                                $serverInfo.TotalRAM_GB = [math]::Round(($vmConfig.Config.Hardware.MemoryMB / 1024), 2)
                                $serverInfo.AvailableRAM_GB = $serverInfo.TotalRAM_GB  # VMware doesn't provide available RAM
                            }
                            
                            # CPU
                            if ($vmConfig.Config.Hardware.NumCPU) {
                                $serverInfo.CPUCount = $vmConfig.Config.Hardware.NumCPU
                                $serverInfo.CPUCores = $vmConfig.Config.Hardware.NumCoresPerSocket * $vmConfig.Config.Hardware.NumCPU
                                $serverInfo.CPULogicalProcessors = $serverInfo.CPUCores
                            }
                            
                            # Disk (sum all virtual disks)
                            $totalDiskGB = 0
                            foreach ($disk in $vmConfig.Config.Hardware.Device) {
                                if ($disk.GetType().Name -eq 'VirtualDisk') {
                                    $totalDiskGB += [math]::Round(($disk.CapacityInKB / 1MB), 2)
                                }
                            }
                            if ($totalDiskGB -gt 0) {
                                $serverInfo.DiskTotalSize_GB = [math]::Round(($totalDiskGB / 1024), 2)
                                $serverInfo.DiskFreeSpace_GB = "N/A"  # VMware doesn't provide free space
                                $serverInfo.DiskUsedSpace_GB = "N/A"
                            }
                            
                            # OS Version (from guest info if available)
                            if ($vm.Guest.OSFullName) {
                                $serverInfo.OSVersion = $vm.Guest.OSFullName
                            }
                            
                            $serverInfo.SpecsSource = "VMware"
                            Write-Host "  SUCCESS: Successfully retrieved specs from VMware for $hostName (RAM: $($serverInfo.TotalRAM_GB)GB, CPU: $($serverInfo.CPUCount) vCPU, Disk: $($serverInfo.DiskTotalSize_GB)GB)" -ForegroundColor Green
                        }
                        else {
                            Write-Warning "  ERROR: VM not found in VMware for server $hostName (searched: $($searchNames -join ', '))"
                        }
                    }
                    catch {
                        Write-Warning "  ERROR: Could not retrieve specs from VMware for $hostName : $_"
                    }
                }
            }
            
            $uniqueServers[$hostName] = $serverInfo
        }
    
    if ($uniqueServers.Count -gt 0) {
        $servers = $uniqueServers.Values | ForEach-Object { $_ }
    }
    else {
        $servers = @()
    }
    
    Write-Host "[DEBUG] Processed $($uniqueServers.Count) unique servers" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] Final servers array count: $($servers.Count)" | Out-File -FilePath $debugFile -Append
    
    if ($servers.Count -eq 0) {
        Write-Warning "No unique servers found. This might indicate an issue with the data collection."
        Write-Host "[DEBUG] WARNING: No servers found after processing" | Out-File -FilePath $debugFile -Append
        Write-Host "[DEBUG] Machines count from Get-BrokerMachine: $($machines.Count)" | Out-File -FilePath $debugFile -Append
    }
    
    # Count servers by specs source
    $cimCount = ($servers | Where-Object { $_.SpecsSource -eq "CIM" -or (-not $_.SpecsSource -and ($_.TotalRAM_GB -or $_.CPUCount)) }).Count
    $vmwareCount = ($servers | Where-Object { $_.SpecsSource -eq "VMware" }).Count
    $noSpecsCount = ($servers | Where-Object { -not $_.TotalRAM_GB -and -not $_.CPUCount }).Count
    
    Write-Host "" -ForegroundColor Gray
    Write-Host "Server Specs Collection Summary:" -ForegroundColor Cyan
    Write-Host "  Total Servers: $($servers.Count)" -ForegroundColor White
    Write-Host "  Specs from CIM/WMI: $cimCount" -ForegroundColor $(if ($cimCount -gt 0) { "Green" } else { "Gray" })
    Write-Host "  Specs from VMware: $vmwareCount" -ForegroundColor $(if ($vmwareCount -gt 0) { "Green" } else { "Gray" })
    Write-Host "  No Specs Collected: $noSpecsCount" -ForegroundColor $(if ($noSpecsCount -gt 0) { "Yellow" } else { "Gray" })
    
    $result = @{
        TotalServers = $servers.Count
        Servers = $servers
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        SpecsCollectionSummary = @{
            FromCIM = $cimCount
            FromVMware = $vmwareCount
            NoSpecs = $noSpecsCount
        }
    }

    # Stop transcript before saving
    Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
}
catch {
    Write-Error "Failed to collect Citrix server information: $_"
    Write-Host "[DEBUG] Fatal error in server collection: $_" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] Stack trace: $($_.ScriptStackTrace)" | Out-File -FilePath $debugFile -Append

    # Stop transcript on error
    Stop-Transcript -ErrorAction SilentlyContinue | Out-Null

    # Return error result
    return @{
        Servers = @()
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        Error = $_.Exception.Message
        SpecsCollectionSummary = @{
            FromCIM = 0
            FromVMware = 0
            NoSpecs = 0
        }
    }
}

# Convert to JSON and save (outside main try/catch)
try {
        Write-Host "[DEBUG] Preparing to save server data. Total servers: $($servers.Count)" | Out-File -FilePath $debugFile -Append
        Write-Host "[DEBUG] Output file path: $OutputPath" | Out-File -FilePath $debugFile -Append
        Write-Host "[DEBUG] Output directory exists: $(Test-Path -Path $outputDir)" | Out-File -FilePath $debugFile -Append
        
        # Ensure directory still exists
        if (-not (Test-Path -Path $outputDir)) {
            New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
            Write-Host "[DEBUG] Recreated output directory: $outputDir" | Out-File -FilePath $debugFile -Append
        }
        
        # Convert to JSON
        $jsonContent = $result | ConvertTo-Json -Depth 10
        Write-Host "[DEBUG] JSON content length: $($jsonContent.Length) characters" | Out-File -FilePath $debugFile -Append
        
        # Save to file
        $jsonContent | Out-File -FilePath $OutputPath -Encoding UTF8 -Force
        Write-Host "[DEBUG] File written to: $OutputPath" | Out-File -FilePath $debugFile -Append
        
        # Verify file was created
        if (Test-Path -Path $OutputPath) {
            $fileInfo = Get-Item -Path $OutputPath
            Write-Host "[DEBUG] File verified: Size = $($fileInfo.Length) bytes" | Out-File -FilePath $debugFile -Append
            Write-Host "Servers information collected successfully. Total: $($servers.Count)" -ForegroundColor Green
            Write-Host "Data saved to: $OutputPath" -ForegroundColor Gray
        }
        else {
            Write-Warning "File was not created at: $OutputPath"
            Write-Host "[DEBUG] ERROR: File was not created after write operation" | Out-File -FilePath $debugFile -Append
        }
        
        Write-Host "[DEBUG] Server data saved successfully to: $OutputPath" | Out-File -FilePath $debugFile -Append
        Write-Host "[DEBUG] Script completed at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $debugFile -Append

        return $result
    }
    catch {
        $errorMsg = "Failed to save server data to file: $_"
        Write-Error $errorMsg
        Write-Host "[DEBUG] ERROR saving file: $errorMsg" | Out-File -FilePath $debugFile -Append

        # Return the result anyway since data collection succeeded
        return $result
    }

    return $result
}
catch {
    # Ensure we have the debug file path
    if (-not $debugFile) {
        $debugFile = Join-Path $outputDir "debug.txt"
    }
    
    $errorMsg = "Failed to collect servers information: $_"
    Write-Warning $errorMsg
    Write-Host "[DEBUG] CATCH BLOCK: $errorMsg" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] Exception type: $($_.Exception.GetType().FullName)" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] Exception message: $($_.Exception.Message)" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] Stack trace: $($_.ScriptStackTrace)" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] OutputPath: $OutputPath" | Out-File -FilePath $debugFile -Append
    
    # Always return a valid result object, even on error
    $errorResult = @{
        TotalServers = 0
        Servers = @()
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        Error = $_.ToString()
        ErrorDetails = @{
            ExceptionType = $_.Exception.GetType().FullName
            ExceptionMessage = $_.Exception.Message
            StackTrace = $_.ScriptStackTrace
        }
    }
    
    # Try to save the error result to file
    try {
        Write-Host "[DEBUG] Attempting to save error result to: $OutputPath" | Out-File -FilePath $debugFile -Append
        
        # Ensure directory exists
        if (-not (Test-Path -Path $outputDir)) {
            New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
            Write-Host "[DEBUG] Created output directory for error result: $outputDir" | Out-File -FilePath $debugFile -Append
        }
        
        $jsonContent = $errorResult | ConvertTo-Json -Depth 10
        $jsonContent | Out-File -FilePath $OutputPath -Encoding UTF8 -Force
        
        if (Test-Path -Path $OutputPath) {
            Write-Host "[DEBUG] Error result saved successfully to $OutputPath" | Out-File -FilePath $debugFile -Append
            Write-Host "Error result saved to: $OutputPath" -ForegroundColor Yellow
        }
        else {
            Write-Host "[DEBUG] ERROR: File was not created after write: $OutputPath" | Out-File -FilePath $debugFile -Append
        }
    }
    catch {
        $saveError = "Could not save error result to file: $_"
        Write-Warning $saveError
        Write-Host "[DEBUG] $saveError" | Out-File -FilePath $debugFile -Append
        Write-Host "[DEBUG] Save error exception: $($_.Exception.Message)" | Out-File -FilePath $debugFile -Append
    }
    
    Write-Error "Failed to collect Citrix server information: $_"
    Write-Host "[DEBUG] Fatal error in server collection: $_" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] Stack trace: $($_.ScriptStackTrace)" | Out-File -FilePath $debugFile -Append

    # Return error result
    return @{
        Servers = @()
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        Error = $_.Exception.Message
        SpecsCollectionSummary = @{
            FromCIM = 0
            FromVMware = 0
            NoSpecs = 0
        }
    }
}

