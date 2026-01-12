# Get-CitrixPolicies.ps1
# Extracts comprehensive Citrix policy information
# Author : LAB007.AI
# Version: 2.0
# Last Modified: 260107:1400

param(
    [string]$OutputPath = ".\Data\citrix-policies.json",
    [string]$CitrixVersion = "1912",
    [switch]$IncludeGPO = $true,
    [switch]$IncludeStudioPolicies = $true,
    [switch]$IncludeConfigPolicies = $true,
    [switch]$ExportPolicyTemplates = $true,
    [string]$TemplatesPath = ".\Data\PolicyTemplates"
)

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# Setup debug logging
$debugFile = Join-Path $outputDir "debug7.txt"

# Force delete existing debug file to ensure clean start
if (Test-Path $debugFile) {
    try {
        Remove-Item $debugFile -Force -ErrorAction Stop
    } catch {
        Write-Warning "Could not delete existing debug file $debugFile : $_"
    }
}

try {
    # Note: Citrix modules/snap-ins must be loaded manually before running this script
    # Get all policies (use AdminAddress if DDC was specified)
    # Use MaxRecordCount to get more than 250 results
    $maxRecords = 10000
    
    Write-Host "Attempting to collect Citrix policies..." -ForegroundColor Yellow
    Write-Host "[DEBUG] Policy collection started at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] AdminAddress: $global:CitrixAdminAddress" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] CitrixVersion: $CitrixVersion" | Out-File -FilePath $debugFile -Append
    
    # Check what policy commands are available
    Write-Host "[DEBUG] Checking available policy commands..." | Out-File -FilePath $debugFile -Append
    $availableCommands = @()
    $commandsToCheck = @(
        'Get-BrokerPolicy', 'Get-BrokerGpoPolicy', 'Get-ConfigPolicySet',
        'Get-ConfigPolicyRule', 'Get-ConfigPolicy', 'Export-BrokerPolicy',
        'Get-BrokerDesktopPolicy', 'Get-BrokerSessionPreLaunch', 'Get-BrokerSessionLinger',
        'Get-BrokerReconnectOnLogon', 'Get-BrokerDesktopGroupPolicy', 'Get-BrokerMachinePolicy'
    )
    foreach ($cmd in $commandsToCheck) {
        $cmdObj = Get-Command -Name $cmd -ErrorAction SilentlyContinue
        if ($cmdObj) {
            $availableCommands += $cmd
            Write-Host "[DEBUG] Command available: $cmd" | Out-File -FilePath $debugFile -Append
            # Get command details
            try {
                $cmdDetails = Get-Command -Name $cmd | Select-Object -Property Name, Source, CommandType
                Write-Host "[DEBUG] Command details for $cmd : Source=$($cmdDetails.Source), Type=$($cmdDetails.CommandType)" | Out-File -FilePath $debugFile -Append
            }
            catch {
                # Ignore errors getting command details
            }
        }
        else {
            Write-Host "[DEBUG] Command NOT available: $cmd" | Out-File -FilePath $debugFile -Append
        }
    }
    Write-Host "[DEBUG] Available commands: $($availableCommands -join ', ')" | Out-File -FilePath $debugFile -Append
    
    # Note about Get-BrokerGpoPolicy
    if ($availableCommands -contains 'Get-BrokerGpoPolicy') {
        Write-Host "[DEBUG] Get-BrokerGpoPolicy is available - will attempt to use it for GPO-based policy collection" | Out-File -FilePath $debugFile -Append
    }
    else {
        Write-Host "[DEBUG] Get-BrokerGpoPolicy is NOT available - this command may require Citrix.Broker.Admin.V2 module/snap-in" | Out-File -FilePath $debugFile -Append
        Write-Host "[DEBUG] Note: Get-BrokerGpoPolicy is typically part of Citrix.Broker.Admin.V2 and should be available if that module is loaded" | Out-File -FilePath $debugFile -Append
    }
    
    # Initialize comprehensive policy collection
    $allPolicies = @{
        StudioPolicies = @()
        GPOPolicies = @()
        ConfigPolicies = @()
        DesktopGroupPolicies = @()
        MachinePolicies = @()
        SessionPolicies = @()
        CollectionMethod = ""
        Errors = @()
    }

    # Method 1: Collect Studio Policies (Broker Policies)
    if ($IncludeStudioPolicies) {
        Write-Host "Collecting Studio/Broker Policies..." -ForegroundColor Cyan
        try {
            if ($availableCommands -contains 'Get-BrokerPolicy') {
                $studioPolicies = Get-BrokerPolicy -MaxRecordCount $maxRecords -ErrorAction Stop
                Write-Host "Found $($studioPolicies.Count) Studio policies" -ForegroundColor Green
                $allPolicies.StudioPolicies = $studioPolicies | ForEach-Object {
                    @{
                        Name = $_.Name
                        Uid = $_.Uid
                        Description = $_.Description
                        Enabled = $_.Enabled
                        Priority = $_.Priority
                        PolicyType = "Studio"
                        Settings = $_.Settings
                        Metadata = @{
                            CreatedDate = $_.CreatedDate
                            ModifiedDate = $_.ModifiedDate
                            PolicySource = "Broker"
                        }
                    }
                }
            }
        }
        catch {
            Write-Warning "Failed to collect Studio policies: $_"
            $allPolicies.Errors += "Studio Policies: $_"
        }

        # Collect Desktop Group Policies
        try {
            if ($availableCommands -contains 'Get-BrokerDesktopGroupPolicy') {
                $dgPolicies = Get-BrokerDesktopGroupPolicy -MaxRecordCount $maxRecords -ErrorAction Stop
                Write-Host "Found $($dgPolicies.Count) Desktop Group policies" -ForegroundColor Green
                $allPolicies.DesktopGroupPolicies = $dgPolicies | ForEach-Object {
                    @{
                        DesktopGroupName = $_.DesktopGroupName
                        DesktopGroupUid = $_.DesktopGroupUid
                        PolicyName = $_.PolicyName
                        PolicyUid = $_.PolicyUid
                        Settings = $_.Settings
                        PolicyType = "DesktopGroup"
                    }
                }
            }
        }
        catch {
            Write-Warning "Failed to collect Desktop Group policies: $_"
            $allPolicies.Errors += "Desktop Group Policies: $_"
        }

        # Collect Machine Policies
        try {
            if ($availableCommands -contains 'Get-BrokerMachinePolicy') {
                $machinePolicies = Get-BrokerMachinePolicy -MaxRecordCount $maxRecords -ErrorAction Stop
                Write-Host "Found $($machinePolicies.Count) Machine policies" -ForegroundColor Green
                $allPolicies.MachinePolicies = $machinePolicies | ForEach-Object {
                    @{
                        MachineName = $_.MachineName
                        MachineUid = $_.MachineUid
                        PolicyName = $_.PolicyName
                        PolicyUid = $_.PolicyUid
                        Settings = $_.Settings
                        PolicyType = "Machine"
                    }
                }
            }
        }
        catch {
            Write-Warning "Failed to collect Machine policies: $_"
            $allPolicies.Errors += "Machine Policies: $_"
        }
    }

    # Method 2: Collect GPO-based Policies
    if ($IncludeGPO) {
        Write-Host "Collecting GPO-based Policies..." -ForegroundColor Cyan
        try {
            if ($availableCommands -contains 'Get-BrokerGpoPolicy') {
                $gpoPolicies = Get-BrokerGpoPolicy -MaxRecordCount $maxRecords -ErrorAction Stop
                Write-Host "Found $($gpoPolicies.Count) GPO policies" -ForegroundColor Green
                $allPolicies.GPOPolicies = $gpoPolicies | ForEach-Object {
                    @{
                        Name = $_.Name
                        Path = $_.Path
                        PolicyType = "GPO"
                        Settings = $_.Settings
                        Metadata = @{
                            GpoGuid = $_.GpoGuid
                            DomainName = $_.DomainName
                            LastModified = $_.LastModified
                        }
                    }
                }
            }
        }
        catch {
            Write-Warning "Failed to collect GPO policies: $_"
            $allPolicies.Errors += "GPO Policies: $_"
        }
    }

    # Method 3: Collect Configuration Policies
    if ($IncludeConfigPolicies) {
        Write-Host "Collecting Configuration Policies..." -ForegroundColor Cyan
        try {
            if ($availableCommands -contains 'Get-ConfigPolicy') {
                $configPolicies = Get-ConfigPolicy -MaxRecordCount $maxRecords -ErrorAction Stop
                Write-Host "Found $($configPolicies.Count) Configuration policies" -ForegroundColor Green
                $allPolicies.ConfigPolicies = $configPolicies | ForEach-Object {
                    @{
                        Name = $_.Name
                        Uid = $_.Uid
                        PolicyType = "Configuration"
                        Settings = $_.Settings
                        Metadata = @{
                            CreatedDate = $_.CreatedDate
                            ModifiedDate = $_.ModifiedDate
                        }
                    }
                }
            }
        }
        catch {
            Write-Warning "Failed to collect Configuration policies: $_"
            $allPolicies.Errors += "Config Policies: $_"
        }
    }

    # Method 0: Legacy GP Drive method (original approach)
    try {
        Write-Host "[DEBUG] Attempting Method 0: Citrix Group Policy Provider (GP: drive)" | Out-File -FilePath $debugFile -Append
        
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
                        Write-Host "[DEBUG] Loaded module: $moduleName" | Out-File -FilePath $debugFile -Append
                        $gpModuleLoaded = $true
                        break
                    }
                }
                else {
                    $gpModuleLoaded = $true
                    Write-Host "[DEBUG] Module already loaded: $moduleName" | Out-File -FilePath $debugFile -Append
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
                            Write-Host "[DEBUG] Loaded snap-in: $moduleName" | Out-File -FilePath $debugFile -Append
                            $gpModuleLoaded = $true
                            break
                        }
                    }
                    else {
                        $gpModuleLoaded = $true
                        Write-Host "[DEBUG] Snap-in already loaded: $moduleName" | Out-File -FilePath $debugFile -Append
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
                Write-Host "[DEBUG] GP: drive not accessible even after loading module" | Out-File -FilePath $debugFile -Append
            }
        }
        
        if ($gpDrive) {
            Write-Host "[DEBUG] GP: drive is available" | Out-File -FilePath $debugFile -Append
            
            # Navigate to the policy root
            $policyRoot = Get-Item "GP:\" -ErrorAction SilentlyContinue
            if ($policyRoot) {
                Write-Host "[DEBUG] Successfully accessed GP:\ root" | Out-File -FilePath $debugFile -Append
                
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
                        Write-Host "[DEBUG] Checking path: $path" | Out-File -FilePath $debugFile -Append
                        $items = Get-Item -Path $path -ErrorAction SilentlyContinue
                        if ($items) {
                            Write-Host "[DEBUG] Found items at $path" | Out-File -FilePath $debugFile -Append
                            
                            # Get child items (policies)
                            $childItems = Get-ChildItem -Path $path -Recurse -ErrorAction SilentlyContinue
                            if ($childItems) {
                                Write-Host "[DEBUG] Found $($childItems.Count) child items at $path" | Out-File -FilePath $debugFile -Append
                                $allPolicyItems += $childItems
                            }
                        }
                    }
                    catch {
                        Write-Host "[DEBUG] Error accessing $path : $_" | Out-File -FilePath $debugFile -Append
                    }
                }
                
                # Also try to get all items recursively from root
                try {
                    $allItems = Get-ChildItem -Path "GP:\" -Recurse -ErrorAction SilentlyContinue
                    if ($allItems) {
                        Write-Host "[DEBUG] Found $($allItems.Count) total items recursively from GP:\" | Out-File -FilePath $debugFile -Append
                        $allPolicyItems += $allItems
                    }
                }
                catch {
                    Write-Host "[DEBUG] Error getting recursive items: $_" | Out-File -FilePath $debugFile -Append
                }
                
                # Remove duplicates
                $uniqueItems = $allPolicyItems | Select-Object -Unique
                
                if ($uniqueItems -and $uniqueItems.Count -gt 0) {
                    Write-Host "[DEBUG] Found $($uniqueItems.Count) unique policy items via GP: drive" | Out-File -FilePath $debugFile -Append
                    
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
                            Write-Host "[DEBUG] Error processing policy item $($item.Name): $_" | Out-File -FilePath $debugFile -Append
                        }
                    }
                    
                    if ($policies -and $policies.Count -gt 0) {
                        $policyMethod = "GroupPolicyProvider"
                        Write-Host "Successfully retrieved policies using Citrix Group Policy Provider" -ForegroundColor Green
                        Write-Host "[DEBUG] GroupPolicyProvider succeeded: Found $($policies.Count) policies" | Out-File -FilePath $debugFile -Append
                    }
                }
                else {
                    Write-Host "[DEBUG] No policy items found in GP: drive" | Out-File -FilePath $debugFile -Append
                }
            }
            else {
                Write-Host "[DEBUG] Could not access GP:\ root" | Out-File -FilePath $debugFile -Append
            }
        }
        else {
            Write-Host "[DEBUG] GP: drive is NOT available - Group Policy Provider may not be installed or loaded" | Out-File -FilePath $debugFile -Append
            Write-Host "[DEBUG] Try loading: Import-Module Citrix.GroupPolicy.Commands or Add-PSSnapin Citrix.GroupPolicy.Commands" | Out-File -FilePath $debugFile -Append
        }
    }
    catch {
        $errorMsg = "Group Policy Provider method failed: $_"
        Write-Warning $errorMsg
        Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath $debugFile -Append
        Write-Host "[DEBUG] Error details: $($_.Exception.Message)" | Out-File -FilePath $debugFile -Append
    }
    
    # Method 1: Get-BrokerPolicy (newer versions)
    try {
        Write-Host "[DEBUG] Attempting Method 1: Get-BrokerPolicy" | Out-File -FilePath $debugFile -Append
        if ($global:CitrixAdminAddress) {
            Write-Host "[DEBUG] Calling Get-BrokerPolicy with AdminAddress: $global:CitrixAdminAddress" | Out-File -FilePath $debugFile -Append
            $policies = Get-BrokerPolicy -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction Stop
        }
        else {
            Write-Host "[DEBUG] Calling Get-BrokerPolicy without AdminAddress" | Out-File -FilePath $debugFile -Append
            $policies = Get-BrokerPolicy -MaxRecordCount $maxRecords -ErrorAction Stop
        }
        if ($policies) {
            $policyMethod = "Get-BrokerPolicy"
            Write-Host "Successfully retrieved policies using Get-BrokerPolicy" -ForegroundColor Green
            Write-Host "[DEBUG] Get-BrokerPolicy succeeded: Found $($policies.Count) policies" | Out-File -FilePath $debugFile -Append
        }
    }
    catch {
        $errorMsg = "Get-BrokerPolicy failed: $_"
        Write-Warning $errorMsg
        Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath $debugFile -Append
        Write-Host "[DEBUG] Error details: $($_.Exception.Message)" | Out-File -FilePath $debugFile -Append
    }
    
    # Method 2: Get-BrokerGpoPolicy (GPO-based policies - may require specific module)
    if (-not $policies) {
        try {
            Write-Host "[DEBUG] Attempting Method 2: Get-BrokerGpoPolicy" | Out-File -FilePath $debugFile -Append
            if ($global:CitrixAdminAddress) {
                Write-Host "[DEBUG] Calling Get-BrokerGpoPolicy with AdminAddress: $global:CitrixAdminAddress" | Out-File -FilePath $debugFile -Append
                $policies = Get-BrokerGpoPolicy -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction SilentlyContinue
            }
            else {
                Write-Host "[DEBUG] Calling Get-BrokerGpoPolicy without AdminAddress" | Out-File -FilePath $debugFile -Append
                $policies = Get-BrokerGpoPolicy -MaxRecordCount $maxRecords -ErrorAction SilentlyContinue
            }
            if ($policies) {
                $policyMethod = "Get-BrokerGpoPolicy"
                Write-Host "Successfully retrieved policies using Get-BrokerGpoPolicy" -ForegroundColor Green
                Write-Host "[DEBUG] Get-BrokerGpoPolicy succeeded: Found $($policies.Count) GPO policies" | Out-File -FilePath $debugFile -Append
            }
            else {
                Write-Host "[DEBUG] Get-BrokerGpoPolicy returned no results" | Out-File -FilePath $debugFile -Append
            }
        }
        catch {
            $errorMsg = "Get-BrokerGpoPolicy failed: $_"
            Write-Warning $errorMsg
            Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath $debugFile -Append
            Write-Host "[DEBUG] Error details: $($_.Exception.Message)" | Out-File -FilePath $debugFile -Append
        }
    }
    
    # Method 3: Get-ConfigPolicySet (alternative)
    if (-not $policies) {
        try {
            Write-Host "[DEBUG] Attempting Method 3: Get-ConfigPolicySet" | Out-File -FilePath $debugFile -Append
            if ($global:CitrixAdminAddress) {
                $policies = Get-ConfigPolicySet -AdminAddress $global:CitrixAdminAddress -ErrorAction SilentlyContinue
            }
            else {
                $policies = Get-ConfigPolicySet -ErrorAction SilentlyContinue
            }
            if ($policies) {
                $policyMethod = "Get-ConfigPolicySet"
                Write-Host "Successfully retrieved policies using Get-ConfigPolicySet" -ForegroundColor Green
                Write-Host "[DEBUG] Get-ConfigPolicySet succeeded: Found $($policies.Count) policy sets" | Out-File -FilePath $debugFile -Append
            }
            else {
                Write-Host "[DEBUG] Get-ConfigPolicySet returned no results" | Out-File -FilePath $debugFile -Append
            }
        }
        catch {
            $errorMsg = "Get-ConfigPolicySet failed: $_"
            Write-Warning $errorMsg
            Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath $debugFile -Append
        }
    }
    
    # Method 4: Get-ConfigPolicyRule (another alternative)
    if (-not $policies) {
        try {
            Write-Host "[DEBUG] Attempting Method 4: Get-ConfigPolicyRule" | Out-File -FilePath $debugFile -Append
            if ($global:CitrixAdminAddress) {
                $policies = Get-ConfigPolicyRule -AdminAddress $global:CitrixAdminAddress -ErrorAction SilentlyContinue
            }
            else {
                $policies = Get-ConfigPolicyRule -ErrorAction SilentlyContinue
            }
            if ($policies) {
                $policyMethod = "Get-ConfigPolicyRule"
                Write-Host "Successfully retrieved policies using Get-ConfigPolicyRule" -ForegroundColor Green
                Write-Host "[DEBUG] Get-ConfigPolicyRule succeeded: Found $($policies.Count) policy rules" | Out-File -FilePath $debugFile -Append
            }
            else {
                Write-Host "[DEBUG] Get-ConfigPolicyRule returned no results" | Out-File -FilePath $debugFile -Append
            }
        }
        catch {
            $errorMsg = "Get-ConfigPolicyRule failed: $_"
            Write-Warning $errorMsg
            Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath $debugFile -Append
        }
    }
    
    # Method 5: Get-ConfigPolicy (yet another alternative)
    if (-not $policies) {
        try {
            Write-Host "[DEBUG] Attempting Method 5: Get-ConfigPolicy" | Out-File -FilePath $debugFile -Append
            if ($global:CitrixAdminAddress) {
                $policies = Get-ConfigPolicy -AdminAddress $global:CitrixAdminAddress -ErrorAction SilentlyContinue
            }
            else {
                $policies = Get-ConfigPolicy -ErrorAction SilentlyContinue
            }
            if ($policies) {
                $policyMethod = "Get-ConfigPolicy"
                Write-Host "Successfully retrieved policies using Get-ConfigPolicy" -ForegroundColor Green
                Write-Host "[DEBUG] Get-ConfigPolicy succeeded: Found $($policies.Count) policies" | Out-File -FilePath $debugFile -Append
            }
            else {
                Write-Host "[DEBUG] Get-ConfigPolicy returned no results" | Out-File -FilePath $debugFile -Append
            }
        }
        catch {
            $errorMsg = "Get-ConfigPolicy failed: $_"
            Write-Warning $errorMsg
            Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath $debugFile -Append
        }
    }
    
    # Method 3: Try to get policy information from Citrix configuration
    if (-not $policies) {
        try {
            Write-Host "[DEBUG] Attempting Method 3: Citrix Configuration Query" | Out-File -FilePath $debugFile -Append

            # Try to get policy summary information
            $policySummary = @()
            if ($global:CitrixAdminAddress) {
                Write-Host "[DEBUG] Trying to get policy summary with AdminAddress" | Out-File -FilePath $debugFile -Append

                # Try to get policy counts and basic info
                try {
                    $desktopPolicies = Get-BrokerDesktopPolicy -AdminAddress $global:CitrixAdminAddress -MaxRecordCount 10 -ErrorAction SilentlyContinue
                    if ($desktopPolicies) {
                        $policySummary += @{
                            Type = "Desktop Policies"
                            Count = $desktopPolicies.Count
                            Method = "Get-BrokerDesktopPolicy"
                        }
                        Write-Host "[DEBUG] Found $($desktopPolicies.Count) desktop policies" | Out-File -FilePath $debugFile -Append
                    }
                } catch {
                    Write-Host "[DEBUG] Get-BrokerDesktopPolicy failed: $_" | Out-File -FilePath $debugFile -Append
                }

                try {
                    $sessionPolicies = Get-BrokerSessionPolicy -AdminAddress $global:CitrixAdminAddress -MaxRecordCount 10 -ErrorAction SilentlyContinue
                    if ($sessionPolicies) {
                        $policySummary += @{
                            Type = "Session Policies"
                            Count = $sessionPolicies.Count
                            Method = "Get-BrokerSessionPolicy"
                        }
                        Write-Host "[DEBUG] Found $($sessionPolicies.Count) session policies" | Out-File -FilePath $debugFile -Append
                    }
                } catch {
                    Write-Host "[DEBUG] Get-BrokerSessionPolicy failed: $_" | Out-File -FilePath $debugFile -Append
                }
            }
            else {
                Write-Host "[DEBUG] Trying to get policy summary without AdminAddress" | Out-File -FilePath $debugFile -Append

                try {
                    $desktopPolicies = Get-BrokerDesktopPolicy -MaxRecordCount 10 -ErrorAction SilentlyContinue
                    if ($desktopPolicies) {
                        $policySummary += @{
                            Type = "Desktop Policies"
                            Count = $desktopPolicies.Count
                            Method = "Get-BrokerDesktopPolicy"
                        }
                        Write-Host "[DEBUG] Found $($desktopPolicies.Count) desktop policies" | Out-File -FilePath $debugFile -Append
                    }
                } catch {
                    Write-Host "[DEBUG] Get-BrokerDesktopPolicy failed: $_" | Out-File -FilePath $debugFile -Append
                }

                try {
                    $sessionPolicies = Get-BrokerSessionPolicy -MaxRecordCount 10 -ErrorAction SilentlyContinue
                    if ($sessionPolicies) {
                        $policySummary += @{
                            Type = "Session Policies"
                            Count = $sessionPolicies.Count
                            Method = "Get-BrokerSessionPolicy"
                        }
                        Write-Host "[DEBUG] Found $($sessionPolicies.Count) session policies" | Out-File -FilePath $debugFile -Append
                    }
                } catch {
                    Write-Host "[DEBUG] Get-BrokerSessionPolicy failed: $_" | Out-File -FilePath $debugFile -Append
                }
            }

            if ($policySummary -and $policySummary.Count -gt 0) {
                # Create a summary policy object
                $policies = @([PSCustomObject]@{
                    Name = "Policy Summary"
                    Description = "Summary of Citrix policies found via configuration queries"
                    Enabled = $true
                    PolicySummary = $policySummary
                    TotalPolicyTypes = $policySummary.Count
                    TotalPolicies = ($policySummary | Measure-Object -Property Count -Sum).Sum
                })
                $policyMethod = "CitrixConfiguration"
                Write-Host "Successfully retrieved policy summary from Citrix configuration" -ForegroundColor Green
                Write-Host "[DEBUG] Citrix configuration query succeeded: Found $($policies[0].TotalPolicies) total policies across $($policies[0].TotalPolicyTypes) types" | Out-File -FilePath $debugFile -Append
            }
        }
        catch {
            $errorMsg = "Citrix configuration query failed: $_"
            Write-Warning $errorMsg
            Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath $debugFile -Append
        }
    }

    # Method 4: Try to export policies to a file (as final fallback)
    if (-not $policies) {
        Write-Host "Attempting to export policies to file as final fallback..." -ForegroundColor Yellow
        Write-Host "[DEBUG] Attempting Method 4: Export-BrokerPolicy" | Out-File -FilePath $debugFile -Append
        try {
            $exportPath = Join-Path (Split-Path -Path $OutputPath -Parent) "citrix-policies-export.txt"
            Write-Host "[DEBUG] Export path: $exportPath" | Out-File -FilePath $debugFile -Append
            if ($global:CitrixAdminAddress) {
                Write-Host "[DEBUG] Calling Export-BrokerPolicy with AdminAddress: $global:CitrixAdminAddress" | Out-File -FilePath $debugFile -Append
                Export-BrokerPolicy -AdminAddress $global:CitrixAdminAddress -FilePath $exportPath -ErrorAction SilentlyContinue | Out-Null
            }
            else {
                Write-Host "[DEBUG] Calling Export-BrokerPolicy without AdminAddress" | Out-File -FilePath $debugFile -Append
                Export-BrokerPolicy -FilePath $exportPath -ErrorAction SilentlyContinue | Out-Null
            }
            if (Test-Path $exportPath) {
                Write-Host "Policies exported to file: $exportPath" -ForegroundColor Green
                Write-Host "[DEBUG] Export-BrokerPolicy succeeded: File created at $exportPath" | Out-File -FilePath $debugFile -Append
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
                Write-Host "[DEBUG] Export-BrokerPolicy did not create file at $exportPath" | Out-File -FilePath $debugFile -Append
            }
        }
        catch {
            $errorMsg = "Export-BrokerPolicy failed: $_"
            Write-Warning $errorMsg
            Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath $debugFile -Append
            Write-Host "[DEBUG] Error details: $($_.Exception.Message)" | Out-File -FilePath $debugFile -Append
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

    # Export policy templates if requested
    $exportedTemplates = @()
    if ($ExportPolicyTemplates -and ($allPolicies.StudioPolicies.Count -gt 0 -or $allPolicies.GPOPolicies.Count -gt 0)) {
        Write-Host "Exporting policy templates..." -ForegroundColor Yellow
        Write-Host "[DEBUG] Starting policy template export" | Out-File -FilePath $debugFile -Append

        # Ensure templates directory exists
        if (-not (Test-Path -Path $TemplatesPath)) {
            New-Item -ItemType Directory -Path $TemplatesPath -Force | Out-Null
            Write-Host "Created templates directory: $TemplatesPath" -ForegroundColor Gray
        }

        # Check for required export cmdlets
        $exportCommandsAvailable = @{}
        $exportCmdlets = @('Export-BrokerPolicy', 'Export-BrokerGpoPolicy')
        foreach ($cmdlet in $exportCmdlets) {
            $cmdObj = Get-Command -Name $cmdlet -ErrorAction SilentlyContinue
            $exportCommandsAvailable[$cmdlet] = $cmdObj -ne $null
            Write-Host "[DEBUG] Export cmdlet '$cmdlet' available: $($exportCommandsAvailable[$cmdlet])" | Out-File -FilePath $debugFile -Append
        }

        # Report snap-in status
        $gpoModule = Get-Module -Name "Citrix.GroupPolicy.Commands" -ErrorAction SilentlyContinue
        $gpoSnapin = Get-PSSnapin -Name "Citrix.GroupPolicy.Commands" -ErrorAction SilentlyContinue

        if ($gpoModule -or $gpoSnapin) {
            Write-Host "✓ Citrix Group Policy module/snap-in is available" -ForegroundColor Green
        } else {
            Write-Host "⚠ Citrix Group Policy module/snap-in is NOT available" -ForegroundColor Yellow
            Write-Host "  Note: GPO export functionality will be limited" -ForegroundColor Gray
        }

        # Export Studio policies
        if ($allPolicies.StudioPolicies.Count -gt 0 -and $exportCommandsAvailable['Export-BrokerPolicy']) {
            Write-Host "Exporting Studio policy templates..." -ForegroundColor Cyan
            foreach ($policy in $allPolicies.StudioPolicies) {
                try {
                    $templateName = "$($policy.Name)-ExportX"
                    $templatePath = Join-Path $TemplatesPath "$templateName.xml"

                    Write-Host "  Exporting: $($policy.Name) → $templateName" -ForegroundColor Gray

                    if ($global:CitrixAdminAddress) {
                        Export-BrokerPolicy -AdminAddress $global:CitrixAdminAddress -Name $policy.Name -FilePath $templatePath -ErrorAction Stop
                    } else {
                        Export-BrokerPolicy -Name $policy.Name -FilePath $templatePath -ErrorAction Stop
                    }

                    # Try to export as GPT if GPO functionality is available
                    if ($exportCommandsAvailable['Export-BrokerGpoPolicy']) {
                        try {
                            $gptPath = Join-Path $TemplatesPath "$templateName"
                            if ($global:CitrixAdminAddress) {
                                Export-BrokerGpoPolicy -AdminAddress $global:CitrixAdminAddress -Name $policy.Name -Path $gptPath -ErrorAction Stop
                            } else {
                                Export-BrokerGpoPolicy -Name $policy.Name -Path $gptPath -ErrorAction Stop
                            }

                            $exportedTemplates += @{
                                PolicyName = $policy.Name
                                TemplateName = $templateName
                                TemplatePath = $templatePath
                                GPTPath = $gptPath
                                PolicyType = "Studio"
                                ExportedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
                                GPTExported = $true
                            }
                            Write-Host "  ✓ GPT exported: $gptPath" -ForegroundColor Green
                        }
                        catch {
                            Write-Warning "Failed to export GPT for $($policy.Name): $_"
                            $exportedTemplates += @{
                                PolicyName = $policy.Name
                                TemplateName = $templateName
                                TemplatePath = $templatePath
                                PolicyType = "Studio"
                                ExportedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
                                GPTExported = $false
                                GPTError = $_.Exception.Message
                            }
                        }
                    } else {
                        $exportedTemplates += @{
                            PolicyName = $policy.Name
                            TemplateName = $templateName
                            TemplatePath = $templatePath
                            PolicyType = "Studio"
                            ExportedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
                            GPTExported = $false
                            GPTError = "Export-BrokerGpoPolicy not available"
                        }
                    }

                    Write-Host "  ✓ Template exported: $templateName" -ForegroundColor Green
                }
                catch {
                    Write-Warning "Failed to export template for $($policy.Name): $_"
                    $exportedTemplates += @{
                        PolicyName = $policy.Name
                        PolicyType = "Studio"
                        ExportedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
                        ExportError = $_.Exception.Message
                        GPTExported = $false
                    }
                }
            }
        }

        # Export GPO policies if available
        if ($allPolicies.GPOPolicies.Count -gt 0 -and $exportCommandsAvailable['Export-BrokerGpoPolicy']) {
            Write-Host "Exporting GPO policy templates..." -ForegroundColor Cyan
            foreach ($policy in $allPolicies.GPOPolicies) {
                try {
                    $templateName = "$($policy.Name)-ExportX"
                    $gptPath = Join-Path $TemplatesPath $templateName

                    Write-Host "  Exporting GPO: $($policy.Name) → $templateName" -ForegroundColor Gray

                    if ($global:CitrixAdminAddress) {
                        Export-BrokerGpoPolicy -AdminAddress $global:CitrixAdminAddress -Name $policy.Name -Path $gptPath -ErrorAction Stop
                    } else {
                        Export-BrokerGpoPolicy -Name $policy.Name -Path $gptPath -ErrorAction Stop
                    }

                    $exportedTemplates += @{
                        PolicyName = $policy.Name
                        TemplateName = $templateName
                        GPTPath = $gptPath
                        PolicyType = "GPO"
                        ExportedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
                        GPTExported = $true
                    }

                    Write-Host "  ✓ GPO exported: $gptPath" -ForegroundColor Green
                }
                catch {
                    Write-Warning "Failed to export GPO template for $($policy.Name): $_"
                    $exportedTemplates += @{
                        PolicyName = $policy.Name
                        PolicyType = "GPO"
                        ExportedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
                        ExportError = $_.Exception.Message
                        GPTExported = $false
                    }
                }
            }
        }

        Write-Host "Policy template export completed: $($exportedTemplates.Count) templates processed" -ForegroundColor Green
        Write-Host "[DEBUG] Policy template export completed" | Out-File -FilePath $debugFile -Append
    }

    # Create comprehensive result
    $totalPolicies = $allPolicies.StudioPolicies.Count + $allPolicies.GPOPolicies.Count + $allPolicies.ConfigPolicies.Count + $allPolicies.DesktopGroupPolicies.Count + $allPolicies.MachinePolicies.Count

    $result = @{
        TotalPolicies = $totalPolicies
        StudioPolicies = @{
            Count = $allPolicies.StudioPolicies.Count
            Policies = $allPolicies.StudioPolicies
        }
        GPOPolicies = @{
            Count = $allPolicies.GPOPolicies.Count
            Policies = $allPolicies.GPOPolicies
        }
        ConfigPolicies = @{
            Count = $allPolicies.ConfigPolicies.Count
            Policies = $allPolicies.ConfigPolicies
        }
        DesktopGroupPolicies = @{
            Count = $allPolicies.DesktopGroupPolicies.Count
            Policies = $allPolicies.DesktopGroupPolicies
        }
        MachinePolicies = @{
            Count = $allPolicies.MachinePolicies.Count
            Policies = $allPolicies.MachinePolicies
        }
        SessionPolicies = @{
            Count = $allPolicies.SessionPolicies.Count
            Policies = $allPolicies.SessionPolicies
        }
        ExportedTemplates = @{
            Count = $exportedTemplates.Count
            Templates = $exportedTemplates
            TemplatesPath = $TemplatesPath
        }
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        CollectionMethods = @{
            IncludeStudioPolicies = $IncludeStudioPolicies
            IncludeGPO = $IncludeGPO
            IncludeConfigPolicies = $IncludeConfigPolicies
            ExportPolicyTemplates = $ExportPolicyTemplates
        }
        Errors = $allPolicies.Errors
    }

    # Convert to JSON and save
    Write-Host "[DEBUG] Preparing to save comprehensive policy data. Total policies: $totalPolicies" | Out-File -FilePath $debugFile -Append
    $result | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8

    Write-Host "Comprehensive policy information collected successfully!" -ForegroundColor Green
    Write-Host "  Studio Policies: $($allPolicies.StudioPolicies.Count)" -ForegroundColor Cyan
    Write-Host "  GPO Policies: $($allPolicies.GPOPolicies.Count)" -ForegroundColor Cyan
    Write-Host "  Config Policies: $($allPolicies.ConfigPolicies.Count)" -ForegroundColor Cyan
    Write-Host "  Desktop Group Policies: $($allPolicies.DesktopGroupPolicies.Count)" -ForegroundColor Cyan
    Write-Host "  Machine Policies: $($allPolicies.MachinePolicies.Count)" -ForegroundColor Cyan
    Write-Host "  Total: $totalPolicies policies" -ForegroundColor Green
    if ($ExportPolicyTemplates) {
        Write-Host "  Exported Templates: $($exportedTemplates.Count)" -ForegroundColor Magenta
    }
    Write-Host "[DEBUG] Policy data saved successfully to: $OutputPath" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] Script completed at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $debugFile -Append
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

