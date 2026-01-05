# Get-CitrixPolicies.ps1
# Extracts Citrix policy information
# Version: 1.0
# Last Modified: 250127

param(
    [string]$OutputPath = ".\Data\citrix-policies.json",
    [string]$CitrixVersion = "1912"
)

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

try {
    # Note: Citrix modules/snap-ins must be loaded manually before running this script
    # Get all policies (use AdminAddress if DDC was specified)
    # Use MaxRecordCount to get more than 250 results
    $maxRecords = 10000
    
    Write-Host "Attempting to collect Citrix policies..." -ForegroundColor Yellow
    Write-Host "[DEBUG] Policy collection started at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
    Write-Host "[DEBUG] AdminAddress: $global:CitrixAdminAddress" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
    Write-Host "[DEBUG] CitrixVersion: $CitrixVersion" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
    
    # Check what policy commands are available
    Write-Host "[DEBUG] Checking available policy commands..." | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
    $availableCommands = @()
    $commandsToCheck = @('Get-BrokerPolicy', 'Get-BrokerGpoPolicy', 'Get-ConfigPolicySet', 'Get-ConfigPolicyRule', 'Get-ConfigPolicy', 'Export-BrokerPolicy')
    foreach ($cmd in $commandsToCheck) {
        $cmdObj = Get-Command -Name $cmd -ErrorAction SilentlyContinue
        if ($cmdObj) {
            $availableCommands += $cmd
            Write-Host "[DEBUG] Command available: $cmd" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            # Get command details
            try {
                $cmdDetails = Get-Command -Name $cmd | Select-Object -Property Name, Source, CommandType, Parameters
                Write-Host "[DEBUG] Command details for $cmd : Source=$($cmdDetails.Source), Type=$($cmdDetails.CommandType)" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            }
            catch {
                # Ignore errors getting command details
            }
        }
        else {
            Write-Host "[DEBUG] Command NOT available: $cmd" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
        }
    }
    Write-Host "[DEBUG] Available commands: $($availableCommands -join ', ')" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
    
    # Note about Get-BrokerGpoPolicy
    if ($availableCommands -contains 'Get-BrokerGpoPolicy') {
        Write-Host "[DEBUG] Get-BrokerGpoPolicy is available - will attempt to use it for GPO-based policy collection" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
    }
    else {
        Write-Host "[DEBUG] Get-BrokerGpoPolicy is NOT available - this command may require Citrix.Broker.Admin.V2 module/snap-in" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
        Write-Host "[DEBUG] Note: Get-BrokerGpoPolicy is typically part of Citrix.Broker.Admin.V2 and should be available if that module is loaded" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
    }
    
    # Try multiple methods to get policies
    $policies = $null
    $policyMethod = ""
    
    # Method 0: Citrix Group Policy Provider (GP: drive) - Most comprehensive method
    try {
        Write-Host "[DEBUG] Attempting Method 0: Citrix Group Policy Provider (GP: drive)" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
        
        # Try to load Group Policy Provider module/snap-in if not already loaded
        $gpModuleLoaded = $false
        $gpModules = @("Citrix.GroupPolicy.Commands", "CitrixGroupPolicy")
        foreach ($moduleName in $gpModules) {
            try {
                # Try as module first
                if (-not (Get-Module -Name $moduleName -ErrorAction SilentlyContinue)) {
                    $availableModule = Get-Module -ListAvailable -Name $moduleName -ErrorAction SilentlyContinue
                    if ($availableModule) {
                        Import-Module -Name $moduleName -ErrorAction SilentlyContinue
                        Write-Host "[DEBUG] Loaded module: $moduleName" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                        $gpModuleLoaded = $true
                        break
                    }
                }
                else {
                    $gpModuleLoaded = $true
                    Write-Host "[DEBUG] Module already loaded: $moduleName" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                    break
                }
            }
            catch {
                # Try as snap-in
                try {
                    if (-not (Get-PSSnapin -Name $moduleName -ErrorAction SilentlyContinue)) {
                        $availableSnapin = Get-PSSnapin -Registered -Name $moduleName -ErrorAction SilentlyContinue
                        if ($availableSnapin) {
                            Add-PSSnapin -Name $moduleName -ErrorAction SilentlyContinue
                            Write-Host "[DEBUG] Loaded snap-in: $moduleName" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                            $gpModuleLoaded = $true
                            break
                        }
                    }
                    else {
                        $gpModuleLoaded = $true
                        Write-Host "[DEBUG] Snap-in already loaded: $moduleName" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                        break
                    }
                }
                catch {
                    # Continue to next module
                }
            }
        }
        
        # Check if GP: drive is available
        $gpDrive = Get-PSDrive -Name "GP" -ErrorAction SilentlyContinue
        if (-not $gpDrive -and $gpModuleLoaded) {
            # Drive might need to be created - try to access it
            try {
                $null = Get-Item "GP:\" -ErrorAction Stop
                $gpDrive = Get-PSDrive -Name "GP" -ErrorAction SilentlyContinue
            }
            catch {
                Write-Host "[DEBUG] GP: drive not accessible even after loading module" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            }
        }
        
        if ($gpDrive) {
            Write-Host "[DEBUG] GP: drive is available" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            
            # Navigate to the policy root
            $policyRoot = Get-Item "GP:\" -ErrorAction SilentlyContinue
            if ($policyRoot) {
                Write-Host "[DEBUG] Successfully accessed GP:\ root" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                
                # Get all policies from the tree
                $allPolicyItems = @()
                
                # Try to get policies from different locations in the tree
                $policyPaths = @(
                    "GP:\",
                    "GP:\User",
                    "GP:\Computer",
                    "GP:\User\Citrix",
                    "GP:\Computer\Citrix"
                )
                
                foreach ($path in $policyPaths) {
                    try {
                        Write-Host "[DEBUG] Checking path: $path" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                        $items = Get-Item -Path $path -ErrorAction SilentlyContinue
                        if ($items) {
                            Write-Host "[DEBUG] Found items at $path" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                            
                            # Get child items (policies)
                            $childItems = Get-ChildItem -Path $path -Recurse -ErrorAction SilentlyContinue
                            if ($childItems) {
                                Write-Host "[DEBUG] Found $($childItems.Count) child items at $path" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                                $allPolicyItems += $childItems
                            }
                        }
                    }
                    catch {
                        Write-Host "[DEBUG] Error accessing $path : $_" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                    }
                }
                
                # Also try to get all items recursively from root
                try {
                    $allItems = Get-ChildItem -Path "GP:\" -Recurse -ErrorAction SilentlyContinue
                    if ($allItems) {
                        Write-Host "[DEBUG] Found $($allItems.Count) total items recursively from GP:\" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                        $allPolicyItems += $allItems
                    }
                }
                catch {
                    Write-Host "[DEBUG] Error getting recursive items: $_" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                }
                
                # Remove duplicates
                $uniqueItems = $allPolicyItems | Select-Object -Unique
                
                if ($uniqueItems -and $uniqueItems.Count -gt 0) {
                    Write-Host "[DEBUG] Found $($uniqueItems.Count) unique policy items via GP: drive" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                    
                    # Convert to policy objects
                    $policies = @()
                    foreach ($item in $uniqueItems) {
                        try {
                            $policyObj = [PSCustomObject]@{
                                Name = $item.Name
                                FullName = $item.FullName
                                PSDrive = $item.PSDrive.Name
                                PSProvider = $item.PSProvider.Name
                                ItemType = if ($item.PSIsContainer) { "Container" } else { "Item" }
                            }
                            
                            # Get all properties of the item
                            $properties = $item.PSObject.Properties
                            foreach ($prop in $properties) {
                                if ($prop.Name -notin @("PSDrive", "PSProvider", "PSIsContainer", "PSPath", "PSParentPath", "PSChildName")) {
                                    try {
                                        $policyObj | Add-Member -MemberType NoteProperty -Name $prop.Name -Value $prop.Value -Force -ErrorAction SilentlyContinue
                                    }
                                    catch {
                                        # Skip properties that can't be added
                                    }
                                }
                            }
                            
                            $policies += $policyObj
                        }
                        catch {
                            Write-Host "[DEBUG] Error processing policy item $($item.Name): $_" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                        }
                    }
                    
                    if ($policies -and $policies.Count -gt 0) {
                        $policyMethod = "GroupPolicyProvider"
                        Write-Host "Successfully retrieved policies using Citrix Group Policy Provider" -ForegroundColor Green
                        Write-Host "[DEBUG] GroupPolicyProvider succeeded: Found $($policies.Count) policies" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                    }
                }
                else {
                    Write-Host "[DEBUG] No policy items found in GP: drive" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                }
            }
            else {
                Write-Host "[DEBUG] Could not access GP:\ root" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            }
        }
        else {
            Write-Host "[DEBUG] GP: drive is NOT available - Group Policy Provider may not be installed or loaded" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            Write-Host "[DEBUG] Try loading: Import-Module Citrix.GroupPolicy.Commands or Add-PSSnapin Citrix.GroupPolicy.Commands" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
        }
    }
    catch {
        $errorMsg = "Group Policy Provider method failed: $_"
        Write-Warning $errorMsg
        Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
        Write-Host "[DEBUG] Error details: $($_.Exception.Message)" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
    }
    
    # Method 1: Get-BrokerPolicy (newer versions)
    try {
        Write-Host "[DEBUG] Attempting Method 1: Get-BrokerPolicy" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
        if ($global:CitrixAdminAddress) {
            Write-Host "[DEBUG] Calling Get-BrokerPolicy with AdminAddress: $global:CitrixAdminAddress" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            $policies = Get-BrokerPolicy -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction Stop
        }
        else {
            Write-Host "[DEBUG] Calling Get-BrokerPolicy without AdminAddress" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            $policies = Get-BrokerPolicy -MaxRecordCount $maxRecords -ErrorAction Stop
        }
        if ($policies) {
            $policyMethod = "Get-BrokerPolicy"
            Write-Host "Successfully retrieved policies using Get-BrokerPolicy" -ForegroundColor Green
            Write-Host "[DEBUG] Get-BrokerPolicy succeeded: Found $($policies.Count) policies" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
        }
    }
    catch {
        $errorMsg = "Get-BrokerPolicy failed: $_"
        Write-Warning $errorMsg
        Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
        Write-Host "[DEBUG] Error details: $($_.Exception.Message)" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
    }
    
    # Method 2: Get-BrokerGpoPolicy (GPO-based policies - may require specific module)
    if (-not $policies) {
        try {
            Write-Host "[DEBUG] Attempting Method 2: Get-BrokerGpoPolicy" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            if ($global:CitrixAdminAddress) {
                Write-Host "[DEBUG] Calling Get-BrokerGpoPolicy with AdminAddress: $global:CitrixAdminAddress" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                $policies = Get-BrokerGpoPolicy -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction SilentlyContinue
            }
            else {
                Write-Host "[DEBUG] Calling Get-BrokerGpoPolicy without AdminAddress" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                $policies = Get-BrokerGpoPolicy -MaxRecordCount $maxRecords -ErrorAction SilentlyContinue
            }
            if ($policies) {
                $policyMethod = "Get-BrokerGpoPolicy"
                Write-Host "Successfully retrieved policies using Get-BrokerGpoPolicy" -ForegroundColor Green
                Write-Host "[DEBUG] Get-BrokerGpoPolicy succeeded: Found $($policies.Count) GPO policies" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            }
            else {
                Write-Host "[DEBUG] Get-BrokerGpoPolicy returned no results" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            }
        }
        catch {
            $errorMsg = "Get-BrokerGpoPolicy failed: $_"
            Write-Warning $errorMsg
            Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            Write-Host "[DEBUG] Error details: $($_.Exception.Message)" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
        }
    }
    
    # Method 3: Get-ConfigPolicySet (alternative)
    if (-not $policies) {
        try {
            Write-Host "[DEBUG] Attempting Method 3: Get-ConfigPolicySet" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            if ($global:CitrixAdminAddress) {
                $policies = Get-ConfigPolicySet -AdminAddress $global:CitrixAdminAddress -ErrorAction SilentlyContinue
            }
            else {
                $policies = Get-ConfigPolicySet -ErrorAction SilentlyContinue
            }
            if ($policies) {
                $policyMethod = "Get-ConfigPolicySet"
                Write-Host "Successfully retrieved policies using Get-ConfigPolicySet" -ForegroundColor Green
                Write-Host "[DEBUG] Get-ConfigPolicySet succeeded: Found $($policies.Count) policy sets" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            }
            else {
                Write-Host "[DEBUG] Get-ConfigPolicySet returned no results" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            }
        }
        catch {
            $errorMsg = "Get-ConfigPolicySet failed: $_"
            Write-Warning $errorMsg
            Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
        }
    }
    
    # Method 4: Get-ConfigPolicyRule (another alternative)
    if (-not $policies) {
        try {
            Write-Host "[DEBUG] Attempting Method 4: Get-ConfigPolicyRule" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            if ($global:CitrixAdminAddress) {
                $policies = Get-ConfigPolicyRule -AdminAddress $global:CitrixAdminAddress -ErrorAction SilentlyContinue
            }
            else {
                $policies = Get-ConfigPolicyRule -ErrorAction SilentlyContinue
            }
            if ($policies) {
                $policyMethod = "Get-ConfigPolicyRule"
                Write-Host "Successfully retrieved policies using Get-ConfigPolicyRule" -ForegroundColor Green
                Write-Host "[DEBUG] Get-ConfigPolicyRule succeeded: Found $($policies.Count) policy rules" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            }
            else {
                Write-Host "[DEBUG] Get-ConfigPolicyRule returned no results" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            }
        }
        catch {
            $errorMsg = "Get-ConfigPolicyRule failed: $_"
            Write-Warning $errorMsg
            Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
        }
    }
    
    # Method 5: Get-ConfigPolicy (yet another alternative)
    if (-not $policies) {
        try {
            Write-Host "[DEBUG] Attempting Method 5: Get-ConfigPolicy" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            if ($global:CitrixAdminAddress) {
                $policies = Get-ConfigPolicy -AdminAddress $global:CitrixAdminAddress -ErrorAction SilentlyContinue
            }
            else {
                $policies = Get-ConfigPolicy -ErrorAction SilentlyContinue
            }
            if ($policies) {
                $policyMethod = "Get-ConfigPolicy"
                Write-Host "Successfully retrieved policies using Get-ConfigPolicy" -ForegroundColor Green
                Write-Host "[DEBUG] Get-ConfigPolicy succeeded: Found $($policies.Count) policies" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            }
            else {
                Write-Host "[DEBUG] Get-ConfigPolicy returned no results" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            }
        }
        catch {
            $errorMsg = "Get-ConfigPolicy failed: $_"
            Write-Warning $errorMsg
            Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
        }
    }
    
    # Method 6: Try to export policies to a file (as fallback)
    if (-not $policies) {
        Write-Host "Attempting to export policies to file..." -ForegroundColor Yellow
        Write-Host "[DEBUG] Attempting Method 6: Export-BrokerPolicy" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
        try {
            $exportPath = Join-Path (Split-Path -Path $OutputPath -Parent) "citrix-policies-export.txt"
            Write-Host "[DEBUG] Export path: $exportPath" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            if ($global:CitrixAdminAddress) {
                Write-Host "[DEBUG] Calling Export-BrokerPolicy with AdminAddress: $global:CitrixAdminAddress" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                Export-BrokerPolicy -AdminAddress $global:CitrixAdminAddress -FilePath $exportPath -ErrorAction SilentlyContinue | Out-Null
            }
            else {
                Write-Host "[DEBUG] Calling Export-BrokerPolicy without AdminAddress" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                Export-BrokerPolicy -FilePath $exportPath -ErrorAction SilentlyContinue | Out-Null
            }
            if (Test-Path $exportPath) {
                Write-Host "Policies exported to file: $exportPath" -ForegroundColor Green
                Write-Host "[DEBUG] Export-BrokerPolicy succeeded: File created at $exportPath" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
                $exportContent = Get-Content $exportPath -Raw
                # Create a policy entry from the export
                $policies = @([PSCustomObject]@{
                    Name = "Exported Policies"
                    Description = "Policies exported to file - see citrix-policies-export.txt"
                    Enabled = $true
                    ExportFile = $exportPath
                    ExportContent = $exportContent
                })
                $policyMethod = "Export-BrokerPolicy"
            }
            else {
                Write-Host "[DEBUG] Export-BrokerPolicy did not create file at $exportPath" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            }
        }
        catch {
            $errorMsg = "Export-BrokerPolicy failed: $_"
            Write-Warning $errorMsg
            Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
            Write-Host "[DEBUG] Error details: $($_.Exception.Message)" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append
        }
    }
    
    if (-not $policies) {
        Write-Warning "Could not retrieve policies using any available method. Policy data may not be available."
        $policies = @()
    }
    
    $policyList = @()
    
    # Handle exported policy file case
    if ($policyMethod -eq "Export-BrokerPolicy" -and $policies.Count -eq 1 -and $policies[0].ExportFile) {
        $policyInfo = @{
            Name = "Exported Policies"
            Description = "Policies exported to file - see citrix-policies-export.txt for details"
            Enabled = $true
            Priority = "N/A"
            IsAssigned = "N/A"
            ExportFile = $policies[0].ExportFile
            Note = "Policy data was exported to a text file. Review the export file for complete policy information."
        }
        $policyList += $policyInfo
    }
    else {
        foreach ($policy in $policies) {
            try {
                # Handle Group Policy Provider objects differently
                if ($policyMethod -eq "GroupPolicyProvider") {
                    $policyInfo = @{
                        Name = if ($policy.Name) { $policy.Name } else { "Unknown" }
                        FullName = if ($policy.FullName) { $policy.FullName } else { "N/A" }
                        ItemType = if ($policy.ItemType) { $policy.ItemType } else { "N/A" }
                        PSDrive = if ($policy.PSDrive) { $policy.PSDrive } else { "N/A" }
                    }
                    
                    # Add all other properties from the policy object
                    $properties = $policy.PSObject.Properties
                    foreach ($prop in $properties) {
                        if ($prop.Name -notin @("Name", "FullName", "ItemType", "PSDrive")) {
                            try {
                                # Convert property value to string if it's complex
                                $value = $prop.Value
                                if ($value -is [System.Array] -or $value -is [System.Collections.IDictionary]) {
                                    $value = $value | ConvertTo-Json -Compress -Depth 5
                                }
                                $policyInfo[$prop.Name] = $value
                            }
                            catch {
                                # Skip properties that can't be serialized
                            }
                        }
                    }
                }
                else {
                    # Standard policy object handling
                    $policyInfo = @{
                        Name = $policy.Name
                        Uid = if ($policy.Uid) { $policy.Uid } else { "N/A" }
                        Enabled = if ($null -ne $policy.Enabled) { $policy.Enabled } else { "Unknown" }
                        Description = if ($policy.Description) { $policy.Description } else { "N/A" }
                        Priority = if ($policy.Priority) { $policy.Priority } else { "N/A" }
                        IsAssigned = if ($null -ne $policy.IsAssigned) { $policy.IsAssigned } else { "Unknown" }
                    }
                
                # Try to get policy settings if available
                try {
                    if ($policy.PolicySettings) {
                        $policyInfo.PolicySettings = $policy.PolicySettings
                    }
                }
                catch {
                    # Policy settings may not be available in all versions
                }
                
                # Try to get additional properties
                try {
                    if ($policy.PSObject.Properties.Name -contains "Filter") {
                        $policyInfo.Filter = $policy.Filter
                    }
                    if ($policy.PSObject.Properties.Name -contains "Settings") {
                        $policyInfo.Settings = $policy.Settings
                    }
                }
                catch {
                    # Additional properties may not be available
                }
                
                $policyList += $policyInfo
            }
            catch {
                Write-Warning "Error processing policy: $_"
                $policyInfo = @{
                    Name = if ($policy.Name) { $policy.Name } else { "Unknown Policy" }
                    Uid = if ($policy.Uid) { $policy.Uid } else { "N/A" }
                    Error = "Partial data: $_"
                }
                $policyList += $policyInfo
            }
        }
    }
    
    # Ensure policyList is initialized even if no policies were found
    if (-not $policyList) {
        $policyList = @()
    }
    
    # Add method used to result
    $result = @{
        TotalPolicies = $policyList.Count
        Policies = $policyList
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        CollectionMethod = $policyMethod
    }
    
    # Convert to JSON and save
    Write-Host "[DEBUG] Preparing to save policy data. Total policies: $($policyList.Count), Method: $policyMethod" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
    $result | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
    
    Write-Host "Policies information collected successfully. Total: $($policyList.Count) (Method: $policyMethod)" -ForegroundColor Green
    Write-Host "[DEBUG] Policy data saved successfully to: $OutputPath" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
    Write-Host "[DEBUG] Script completed at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
    return $result
}
catch {
    Write-Warning "Failed to collect policies information: $_"
    return @{
        TotalPolicies = 0
        Policies = @()
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        Error = $_.ToString()
    }
}

