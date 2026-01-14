# Get-CitrixCatalogs.ps1
# Extracts machine catalogs information

param(
    [string]$OutputPath = ".\Data\citrix-catalogs.json",
    [string]$CitrixVersion = "1912"
)

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

try {
    # Note: Citrix modules/snap-ins must be loaded manually before running this script
    # Get all machine catalogs (use AdminAddress if DDC was specified)
    # Use MaxRecordCount to get more than 250 results
    $maxRecords = 10000
    if ($global:CitrixAdminAddress) {
        $catalogs = Get-BrokerCatalog -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction Stop
    }
    else {
        $catalogs = Get-BrokerCatalog -MaxRecordCount $maxRecords -ErrorAction Stop
    }
    
    $catalogList = @()
    foreach ($catalog in $catalogs) {
        $catalogInfo = @{
            Name = $catalog.Name
            Uid = $catalog.Uid
            AllocationType = $catalog.AllocationType
            ProvisioningType = $catalog.ProvisioningType
            SessionSupport = $catalog.SessionSupport
            TotalCount = $catalog.TotalCount
            AvailableCount = $catalog.AvailableCount
            InUseCount = $catalog.InUseCount
            PersistUserChanges = $catalog.PersistUserChanges
            ProvisioningSchemeName = $null
            MasterImageName = $null
            MasterImagePath = $null
            ProvisioningSchemeUid = $null
        }
        
        # Try to get provisioning scheme information for MCS/PVS catalogs
        if ($catalog.ProvisioningType -in @('MCS', 'PVS')) {
            try {
                # Get provisioning scheme for this catalog
                if ($global:CitrixAdminAddress) {
                    $provScheme = Get-ProvScheme -ProvisioningSchemeName $catalog.Name -AdminAddress $global:CitrixAdminAddress -ErrorAction SilentlyContinue
                }
                else {
                    $provScheme = Get-ProvScheme -ProvisioningSchemeName $catalog.Name -ErrorAction SilentlyContinue
                }
                
                if ($provScheme) {
                    $catalogInfo.ProvisioningSchemeName = $provScheme.ProvisioningSchemeName
                    $catalogInfo.ProvisioningSchemeUid = $provScheme.ProvisioningSchemeUid
                    
                    # Get master image VM name (xxxx.vm) and snapshot from path
                    # Path format: datastore\folder\folder\VMName.vm\snapshot1.snapshot\snapshot2.snapshot
                    # 4th part from left (index 3) = VM name
                    # Last part = latest snapshot name
                    $imageMachineName = $null
                    $latestSnapshotName = $null
                    
                    if ($provScheme.MasterImagePath) {
                        $catalogInfo.MasterImagePath = $provScheme.MasterImagePath
                        # Split by backslash
                        $pathParts = $provScheme.MasterImagePath -split '\\'
                        Write-Host "[DEBUG] Catalog $($catalog.Name): MasterImagePath split into $($pathParts.Count) parts: $($pathParts -join ' | ')" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                        
                        if ($pathParts.Count -ge 4) {
                            # 4th part from left (index 3) is the VM name
                            $imageMachineName = $pathParts[3]
                            $catalogInfo.MasterImageName = $imageMachineName
                            $catalogInfo.MasterImageVM = $imageMachineName
                            Write-Host "[DEBUG] Catalog $($catalog.Name): Extracted VM name (4th part): $imageMachineName" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                        }
                        else {
                            Write-Host "[DEBUG] Catalog $($catalog.Name): Path has less than 4 parts, cannot extract VM name" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                        }
                        
                        if ($pathParts.Count -gt 4) {
                            # Last part is the latest snapshot name
                            $latestSnapshotName = $pathParts[-1]
                            Write-Host "[DEBUG] Catalog $($catalog.Name): Extracted snapshot name (last part): $latestSnapshotName" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                        }
                        else {
                            Write-Host "[DEBUG] Catalog $($catalog.Name): Path has 4 or fewer parts, no snapshot in path" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                        }
                    }
                    elseif ($provScheme.MasterImageVM) {
                        # If MasterImageVM is provided directly, use it
                        $imageMachineName = $provScheme.MasterImageVM
                        $catalogInfo.MasterImageVM = $provScheme.MasterImageVM
                        $catalogInfo.MasterImageName = $provScheme.MasterImageVM
                    }
                    
                    # Store the parsed values
                    $catalogInfo.ImageMachineName = $imageMachineName
                    $catalogInfo.LatestSnapshotName = $latestSnapshotName
                    
                    # Get VMX path
                    if ($provScheme.MasterImageVMX) {
                        $catalogInfo.MasterImageVMX = $provScheme.MasterImageVMX
                    }
                    
                    # Get all snapshots (may be an array or single value)
                    $snapshots = @()
                    if ($provScheme.MasterImageSnapshot) {
                        if ($provScheme.MasterImageSnapshot -is [array]) {
                            $snapshots = $provScheme.MasterImageSnapshot
                        }
                        else {
                            $snapshots = @($provScheme.MasterImageSnapshot)
                        }
                    }
                    $catalogInfo.MasterImageSnapshots = $snapshots
                    
                    # Get the latest snapshot - prefer the one parsed from path, otherwise use last in array
                    if ($latestSnapshotName) {
                        $catalogInfo.MasterImageLatestSnapshot = $latestSnapshotName
                    }
                    elseif ($snapshots.Count -gt 0) {
                        $catalogInfo.MasterImageLatestSnapshot = $snapshots[-1]
                    }
                    else {
                        $catalogInfo.MasterImageLatestSnapshot = $null
                    }
                    
                    # Update LatestSnapshotName if we got it from the snapshot array
                    if (-not $latestSnapshotName -and $snapshots.Count -gt 0) {
                        $latestSnapshotName = $snapshots[-1]
                        $catalogInfo.LatestSnapshotName = $latestSnapshotName
                    }
                    
                    # Get HostingUnits (contains cluster information)
                    if ($provScheme.HostingUnitName) {
                        $catalogInfo.HostingUnitName = $provScheme.HostingUnitName
                        # Extract cluster name from HostingUnit (format may vary)
                        # Common formats: "ClusterName" or "HostingUnitName (ClusterName)"
                        if ($provScheme.HostingUnitName -match 'Cluster(\w+)' -or $provScheme.HostingUnitName -match '(\w+Cluster\w*)') {
                            $catalogInfo.ClusterName = $matches[1]
                        }
                        else {
                            # Try to extract from the HostingUnitName directly
                            $catalogInfo.ClusterName = $provScheme.HostingUnitName
                        }
                    }
                    
                    # Try to get HostingUnit object for more details
                    try {
                        if ($global:CitrixAdminAddress) {
                            $hostingUnit = Get-ProvHostingUnit -HostingUnitName $provScheme.HostingUnitName -AdminAddress $global:CitrixAdminAddress -ErrorAction SilentlyContinue
                        }
                        else {
                            $hostingUnit = Get-ProvHostingUnit -HostingUnitName $provScheme.HostingUnitName -ErrorAction SilentlyContinue
                        }
                        if ($hostingUnit) {
                            # Extract cluster from connection or resource pool
                            if ($hostingUnit.ResourcePoolName) {
                                # Resource pool name often contains cluster info
                                $catalogInfo.ClusterName = $hostingUnit.ResourcePoolName
                            }
                            elseif ($hostingUnit.ConnectionName) {
                                $catalogInfo.ClusterName = $hostingUnit.ConnectionName
                            }
                        }
                    }
                    catch {
                        # Ignore errors getting hosting unit details
                    }
                }
            }
            catch {
                Write-Warning "Could not get provisioning scheme for catalog $($catalog.Name): $_"
            }
        }
        
        $catalogList += $catalogInfo
    }
    
    $result = @{
        TotalCatalogs = $catalogList.Count
        Catalogs = $catalogList
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    }
    
    # Convert to JSON and save
    $result | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
    
    Write-Host "Catalogs information collected successfully. Total: $($catalogList.Count)" -ForegroundColor Green
    return $result
}
catch {
    Write-Warning "Failed to collect catalogs information: $_"
    return @{
        TotalCatalogs = 0
        Catalogs = @()
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        Error = $_.ToString()
    }
}

