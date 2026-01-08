# 21-Get-VMwareFolders.ps1
# Retrieves VMware VM folder structure for LAB007 Horizon Environment Tasks
# Author : LAB007.AI
# Version: 1.0
# Generated: 2025-01-07 14:42 EST

param(
    [string]$OutputPath = '.\Data\vmware-folders.json',
    [string]$VMwareServer = '',
    [string]$VMwareUsername = '',
    [string]$VMwarePassword = ''
)

# Setup debug logging
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataPath = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $dataPath)) {
    New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
}
$debugFile = Join-Path $dataPath "debug21.txt"

# Force delete existing debug file to ensure clean start
if (Test-Path $debugFile) {
    try {
        Remove-Item $debugFile -Force -ErrorAction Stop
    } catch {
        Write-Warning "Could not delete existing debug file $debugFile : $_"
    }
}

try {
    Write-Host "[DEBUG] Script started at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] OutputPath: $OutputPath" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] VMwareServer: $VMwareServer" | Out-File -FilePath $debugFile -Append

    # Check if VMware PowerCLI is available
    $vmwareModule = Get-Module -ListAvailable -Name VMware.PowerCLI
    if (-not $vmwareModule) {
        Write-Error 'VMware PowerCLI module not found. Please install it first.'
        Write-Host 'You can install it with: Install-Module -Name VMware.PowerCLI -Scope CurrentUser' -ForegroundColor Yellow
        Write-Host "[DEBUG] VMware PowerCLI module not found" | Out-File -FilePath $debugFile -Append
        exit 1
    }

    # Import VMware PowerCLI module
    Import-Module VMware.PowerCLI -ErrorAction Stop

    # Suppress certificate warnings
    Set-PowerCLIConfiguration -InvalidCertificateAction Ignore -Confirm:$false -Scope Session | Out-Null

    # Check if already connected to vCenter
    $connectedServers = $global:DefaultVIServers
    if (-not $connectedServers -or $connectedServers.Count -eq 0) {
        Write-Host "No active vCenter connection found. Attempting to connect..." -ForegroundColor Yellow
        Write-Host "[DEBUG] No active vCenter connection found" | Out-File -FilePath $debugFile -Append

        # If no parameters provided, try to read from config file
        if ([string]::IsNullOrWhiteSpace($VMwareServer) -or [string]::IsNullOrWhiteSpace($VMwareUsername)) {
            Write-Host "Reading VMware configuration from config file..." -ForegroundColor Gray
            $configPath = Join-Path (Split-Path -Parent $scriptPath) "..\LAB007-Config.JSON"
            Write-Host "[DEBUG] Looking for config file: $configPath" | Out-File -FilePath $debugFile -Append

            if (Test-Path $configPath) {
                try {
                    $config = Get-Content -Path $configPath -Raw | ConvertFrom-Json
                    Write-Host "Configuration loaded from: $configPath" -ForegroundColor Green
                    Write-Host "[DEBUG] Config file loaded successfully" | Out-File -FilePath $debugFile -Append

                    # Use config values if parameters not provided
                    if ([string]::IsNullOrWhiteSpace($VMwareServer) -and $config.vCenterServer) {
                        $VMwareServer = $config.vCenterServer
                        Write-Host "Using vCenter server from config: $VMwareServer" -ForegroundColor Cyan
                        Write-Host "[DEBUG] VMwareServer set from config: $VMwareServer" | Out-File -FilePath $debugFile -Append
                    }

                    if ([string]::IsNullOrWhiteSpace($VMwareUsername) -and $config.vCenterUsername) {
                        $VMwareUsername = $config.vCenterUsername
                        Write-Host "Using vCenter username from config: $VMwareUsername" -ForegroundColor Cyan
                        Write-Host "[DEBUG] VMwareUsername set from config: $VMwareUsername" | Out-File -FilePath $debugFile -Append
                    }

                    if ([string]::IsNullOrWhiteSpace($VMwarePassword) -and $config.vCenterPassword) {
                        $VMwarePassword = $config.vCenterPassword
                        Write-Host "Using vCenter password from config" -ForegroundColor Cyan
                        Write-Host "[DEBUG] VMwarePassword set from config" | Out-File -FilePath $debugFile -Append
                    }
                }
                catch {
                    Write-Warning "Could not read config file: $_"
                    Write-Host "[DEBUG] Config file read error: $_" | Out-File -FilePath $debugFile -Append
                }
            }
            else {
                Write-Host "No config file found at: $configPath" -ForegroundColor Yellow
                Write-Host "[DEBUG] Config file not found: $configPath" | Out-File -FilePath $debugFile -Append
            }
        }

        # Validate parameters - VMware server is required
        if ([string]::IsNullOrWhiteSpace($VMwareServer)) {
            Write-Error 'VMware server not specified and no active connection found. Please specify -VMwareServer parameter or configure it in LAB007-Config.JSON'
            Write-Host "[DEBUG] VMware server not specified after config check" | Out-File -FilePath $debugFile -Append
            exit 1
        }

        # Prompt for credentials if not provided
        if ([string]::IsNullOrWhiteSpace($VMwareUsername)) {
            $VMwareUsername = Read-Host "Enter vCenter username for $VMwareServer"
            Write-Host "[DEBUG] VMwareUsername prompted from user" | Out-File -FilePath $debugFile -Append
        }

        if ([string]::IsNullOrWhiteSpace($VMwarePassword)) {
            $VMwarePassword = Read-Host "Enter vCenter password for $VMwareServer" -AsSecureString
            $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($VMwarePassword)
            $VMwarePassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
            Write-Host "[DEBUG] VMwarePassword prompted from user" | Out-File -FilePath $debugFile -Append
        }

        # Connect to vCenter
        try {
            $connection = Connect-VIServer -Server $VMwareServer -User $VMwareUsername -Password $VMwarePassword -ErrorAction Stop
            Write-Host "Successfully connected to $VMwareServer" -ForegroundColor Green
            Write-Host "[DEBUG] Successfully connected to $VMwareServer" | Out-File -FilePath $debugFile -Append
        }
        catch {
            Write-Error "Failed to connect to vCenter: $_"
            Write-Host "[DEBUG] Failed to connect to vCenter: $_" | Out-File -FilePath $debugFile -Append
            exit 1
        }
    } else {
        Write-Host "Using existing vCenter connection: $($connectedServers[0].Name)" -ForegroundColor Green
        Write-Host "[DEBUG] Using existing vCenter connection" | Out-File -FilePath $debugFile -Append
    }

    # Get VM folders
    Write-Host "Retrieving VMware VM folder structure..." -ForegroundColor Yellow
    Write-Host "[DEBUG] Retrieving VM folders" | Out-File -FilePath $debugFile -Append

    try {
        # Get all VM folders
        $vmFolders = Get-Folder -Type VM -ErrorAction Stop | Where-Object { $_.Name -ne "vm" -or $_.Parent -eq $null }

        Write-Host "[DEBUG] Found $($vmFolders.Count) VM folders" | Out-File -FilePath $debugFile -Append

        $folderStructure = @()

        foreach ($folder in $vmFolders) {
            Write-Host "[DEBUG] Processing folder: $($folder.Name)" | Out-File -FilePath $debugFile -Append

            # Build full path for this folder
            $fullPath = Get-FolderPath -Folder $folder

            # Get child folders (but not recursively for display purposes)
            $childFolders = $folder.ChildEntity | Where-Object { $_ -is [VMware.VimAutomation.ViCore.Types.V1.Inventory.Folder] }

            $folderInfo = @{
                Name = $folder.Name
                FullPath = $fullPath
                Id = $folder.Id
                ParentId = if ($folder.Parent) { $folder.Parent.Id } else { $null }
                HasChildren = ($childFolders.Count -gt 0)
                ChildCount = $childFolders.Count
                VMCount = ($folder.ChildEntity | Where-Object { $_ -is [VMware.VimAutomation.ViCore.Types.V1.Inventory.VirtualMachine] }).Count
            }

            $folderStructure += $folderInfo
        }

        # Sort by full path for better organization
        $folderStructure = $folderStructure | Sort-Object -Property FullPath

        # Create result object
        $result = @{
            TotalFolders = $folderStructure.Count
            VMwareServer = if ($connectedServers) { $connectedServers[0].Name } else { $VMwareServer }
            CollectedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
            Folders = $folderStructure
        }

        # Convert to JSON and save
        $jsonContent = $result | ConvertTo-Json -Depth 10
        $jsonContent | Out-File -FilePath $OutputPath -Encoding UTF8 -Force

        Write-Host ''
        Write-Host 'VMware folder structure collected successfully!' -ForegroundColor Green
        Write-Host "Total folders found: $($folderStructure.Count)" -ForegroundColor White
        Write-Host "Data saved to: $OutputPath" -ForegroundColor Gray
        Write-Host "[DEBUG] Collection completed successfully at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $debugFile -Append
        Write-Host "[DEBUG] Total folders found: $($folderStructure.Count)" | Out-File -FilePath $debugFile -Append

        return $result
    }
    catch {
        Write-Error "Failed to retrieve VM folders: $_"
        Write-Host "[DEBUG] Failed to retrieve VM folders: $_" | Out-File -FilePath $debugFile -Append
        exit 1
    }
}
catch {
    Write-Error 'Failed to collect VMware folder structure: $_'
    Write-Host "[DEBUG] Script failed: $_" | Out-File -FilePath $debugFile -Append

    # Try to disconnect if connected
    try {
        Disconnect-VIServer -Server '*' -Confirm:$false -ErrorAction SilentlyContinue
    }
    catch {
        # Ignore disconnect errors
    }

    # Save error result
    $errorResult = @{
        TotalFolders = 0
        VMwareServer = if ($VMwareServer) { $VMwareServer } else { 'Unknown' }
        CollectedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        Folders = @()
        Error = $_.ToString()
    }

    $errorResult | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8 -Force

    exit 1
}
finally {
    # Don't disconnect here as this script may be called as part of a sequence
    # Let the calling script handle disconnection
}

# Helper function to build full folder path
function Get-FolderPath {
    param([VMware.VimAutomation.ViCore.Types.V1.Inventory.Folder]$Folder)

    $pathParts = @()
    $current = $Folder

    while ($current -and $current.Parent) {
        $pathParts = @($current.Name) + $pathParts
        $current = $current.Parent
    }

    if ($pathParts.Count -eq 0) {
        return "/"
    }

    return "/" + ($pathParts -join "/")
}
