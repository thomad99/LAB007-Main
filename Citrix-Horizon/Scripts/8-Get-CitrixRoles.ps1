# Get-CitrixRoles.ps1
# Extracts comprehensive Citrix management roles and administrator information
# Author : LAB007.AI
# Version: 2.0
# Last Modified: 260107:1400

param(
    [string]$OutputPath = ".\Data\citrix-roles.json",
    [string]$CitrixVersion = "1912",
    [switch]$IncludeScopes = $true,
    [switch]$IncludePermissions = $true
)

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# Setup debug logging
$debugFile = Join-Path $outputDir "debug8.txt"

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
    # Get all roles (use AdminAddress if DDC was specified)
    # Use MaxRecordCount to get more than 250 results
    $maxRecords = 10000
    
    Write-Host "Attempting to collect Citrix management roles..." -ForegroundColor Yellow
    Write-Host "[DEBUG] Roles collection started at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
    Write-Host "[DEBUG] AdminAddress: $global:CitrixAdminAddress" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
    Write-Host "[DEBUG] CitrixVersion: $CitrixVersion" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
    
    # Check what role commands are available
    Write-Host "[DEBUG] Checking available role commands..." | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
    $availableCommands = @()
    $commandsToCheck = @(
        'Get-AdminRole', 'Get-AdminAdministrator', 'Get-AdminRoleAssignment',
        'Get-AdminScope', 'Get-AdminPermission', 'Get-AdminEffectiveAdministrator',
        'Get-AdminTrustee', 'Get-AdminRight'
    )
    foreach ($cmd in $commandsToCheck) {
        $cmdObj = Get-Command -Name $cmd -ErrorAction SilentlyContinue
        if ($cmdObj) {
            $availableCommands += $cmd
            Write-Host "[DEBUG] Command available: $cmd" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
        }
        else {
            Write-Host "[DEBUG] Command NOT available: $cmd" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
        }
    }
    Write-Host "[DEBUG] Available commands: $($availableCommands -join ', ')" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
    
    # Try Get-AdminRole first (for roles)
    $roles = $null
    try {
        Write-Host "[DEBUG] Attempting Get-AdminRole..." | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
        if ($global:CitrixAdminAddress) {
            Write-Host "[DEBUG] Calling Get-AdminRole with AdminAddress: $global:CitrixAdminAddress" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
            $roles = Get-AdminRole -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction Stop
        }
        else {
            Write-Host "[DEBUG] Calling Get-AdminRole without AdminAddress" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
            $roles = Get-AdminRole -MaxRecordCount $maxRecords -ErrorAction Stop
        }
        Write-Host "Successfully retrieved $($roles.Count) roles using Get-AdminRole" -ForegroundColor Green
        Write-Host "[DEBUG] Get-AdminRole succeeded: Found $($roles.Count) roles" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
    }
    catch {
        $errorMsg = "Get-AdminRole failed: $_"
        Write-Warning $errorMsg
        Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
        Write-Host "[DEBUG] Error details: $($_.Exception.Message)" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
        $roles = @()
    }
    
    # Initialize comprehensive role collection
    $allRoleData = @{
        Roles = @()
        Administrators = @()
        RoleAssignments = @()
        Scopes = @()
        Permissions = @()
        EffectiveAdministrators = @()
        CollectionMethod = ""
        Errors = @()
    }

    # Get administrators (users/groups assigned to roles)
    $administrators = $null
    try {
        Write-Host "[DEBUG] Attempting Get-AdminAdministrator..." | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
        if ($global:CitrixAdminAddress) {
            $administrators = Get-AdminAdministrator -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction Stop
        }
        else {
            $administrators = Get-AdminAdministrator -MaxRecordCount $maxRecords -ErrorAction Stop
        }
        Write-Host "Successfully retrieved $($administrators.Count) administrators using Get-AdminAdministrator" -ForegroundColor Green
        Write-Host "[DEBUG] Get-AdminAdministrator succeeded: Found $($administrators.Count) administrators" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue

        # Process administrators into structured format
        $allRoleData.Administrators = $administrators | ForEach-Object {
            @{
                Name = $_.Name
                Uid = $_.Uid
                Enabled = $_.Enabled
                Rights = $_.Rights
                Scopes = $_.Scopes
                Metadata = @{
                    FullName = $_.FullName
                    AccountType = if ($_.Name -match '^[^\\]+\\') { "Domain" } else { "Local" }
                    Domain = if ($_.Name -match '^([^\\]+)\\') { $matches[1] } else { $null }
                    AccountName = if ($_.Name -match '^[^\\]+\\(.+)$') { $matches[1] } else { $_.Name }
                }
            }
        }
    }
    catch {
        $errorMsg = "Get-AdminAdministrator failed: $_"
        Write-Warning $errorMsg
        Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
        Write-Host "[DEBUG] Error details: $($_.Exception.Message)" | Out-File -FilePath $debugFile -Append -ErrorAction SilentlyContinue
        $administrators = @()
    }
    
    # Also try Get-AdminRoleAssignment (alternative method that might work better for built-in roles)
    $roleAssignments = $null
    try {
        if ($global:CitrixAdminAddress) {
            $roleAssignments = Get-AdminRoleAssignment -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction SilentlyContinue
        }
        else {
            $roleAssignments = Get-AdminRoleAssignment -MaxRecordCount $maxRecords -ErrorAction SilentlyContinue
        }
        if ($roleAssignments) {
            Write-Host "Successfully retrieved $($roleAssignments.Count) role assignments using Get-AdminRoleAssignment" -ForegroundColor Green
        }
    }
    catch {
        Write-Verbose "Get-AdminRoleAssignment not available or failed: $_"
    }
    
    # Get scopes (optional, but useful for understanding role scope)
    $scopes = $null
    try {
        if ($global:CitrixAdminAddress) {
            $scopes = Get-AdminScope -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction SilentlyContinue
        }
        else {
            $scopes = Get-AdminScope -MaxRecordCount $maxRecords -ErrorAction SilentlyContinue
        }
        if ($scopes) {
            Write-Host "Successfully retrieved $($scopes.Count) scopes using Get-AdminScope" -ForegroundColor Green
        }
    }
    catch {
        Write-Warning "Get-AdminScope failed (this is optional): $_"
        $scopes = @()
    }

    # Get permissions if requested
    if ($IncludePermissions) {
        Write-Host "Collecting permissions information..." -ForegroundColor Cyan
        try {
            if ($availableCommands -contains 'Get-AdminPermission') {
                $permissions = if ($global:CitrixAdminAddress) {
                    Get-AdminPermission -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction Stop
                } else {
                    Get-AdminPermission -MaxRecordCount $maxRecords -ErrorAction Stop
                }
                Write-Host "Found $($permissions.Count) permissions" -ForegroundColor Green
                $allRoleData.Permissions = $permissions | ForEach-Object {
                    @{
                        RoleName = $_.RoleName
                        ScopeName = $_.ScopeName
                        TrusteeName = $_.TrusteeName
                        Permission = $_.Permission
                        Allowed = $_.Allowed
                    }
                }
            }
        }
        catch {
            Write-Warning "Failed to collect permissions: $_"
            $allRoleData.Errors += "Permissions: $_"
        }

        # Get effective administrators
        try {
            if ($availableCommands -contains 'Get-AdminEffectiveAdministrator') {
                $effectiveAdmins = if ($global:CitrixAdminAddress) {
                    Get-AdminEffectiveAdministrator -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction Stop
                } else {
                    Get-AdminEffectiveAdministrator -MaxRecordCount $maxRecords -ErrorAction Stop
                }
                Write-Host "Found $($effectiveAdmins.Count) effective administrators" -ForegroundColor Green
                $allRoleData.EffectiveAdministrators = $effectiveAdmins | ForEach-Object {
                    @{
                        Name = $_.Name
                        EffectiveRights = $_.EffectiveRights
                        Scopes = $_.Scopes
                        Metadata = @{
                            AccountType = if ($_.Name -match '^[^\\]+\\') { "Domain" } else { "Local" }
                        }
                    }
                }
            }
        }
        catch {
            Write-Warning "Failed to collect effective administrators: $_"
            $allRoleData.Errors += "Effective Administrators: $_"
        }
    }

    # Process scopes if collected
    if ($scopes -and $IncludeScopes) {
        Write-Host "Processing scope information..." -ForegroundColor Cyan
        $allRoleData.Scopes = $scopes | ForEach-Object {
            @{
                Name = $_.Name
                Uid = $_.Uid
                Description = $_.Description
                IsBuiltIn = $_.IsBuiltIn
                IsAll = $_.IsAll
                Metadata = @{
                    CreatedDate = $_.CreatedDate
                    ModifiedDate = $_.ModifiedDate
                }
            }
        }
    }

    # Process roles
    if ($roles) {
        Write-Host "Processing role information..." -ForegroundColor Cyan
        $allRoleData.Roles = $roles | ForEach-Object {
            @{
                Name = $_.Name
                Uid = $_.Uid
                Description = $_.Description
                IsBuiltIn = $_.IsBuiltIn
                Metadata = @{
                    CreatedDate = $_.CreatedDate
                    ModifiedDate = $_.ModifiedDate
                }
            }
        }
    }
    
    # Build role data with assigned AD groups
    $roleData = @()
    
    if ($roles -and $roles.Count -gt 0) {
        Write-Host "Processing roles and their assigned AD groups..." -ForegroundColor Yellow
        
        # First, group administrators by role for easier lookup
        $adminsByRole = @{}
        if ($administrators) {
            foreach ($admin in $administrators) {
                $roleName = $null
                $roleUid = $null
                
                # Try different properties to find the role
                if ($admin.Role) {
                    $roleName = $admin.Role
                }
                elseif ($admin.RoleName) {
                    $roleName = $admin.RoleName
                }
                elseif ($admin.RoleUid) {
                    $roleUid = $admin.RoleUid
                    $roleObj = $roles | Where-Object { $_.Uid -eq $roleUid }
                    if ($roleObj) {
                        $roleName = $roleObj.Name
                    }
                }
                
                if ($roleName) {
                    if (-not $adminsByRole.ContainsKey($roleName)) {
                        $adminsByRole[$roleName] = @()
                    }
                    $adminsByRole[$roleName] += $admin
                }
            }
        }
        
        # Also process role assignments (alternative method)
        if ($roleAssignments) {
            foreach ($assignment in $roleAssignments) {
                $roleName = $null
                if ($assignment.Role) {
                    $roleName = $assignment.Role
                }
                elseif ($assignment.RoleName) {
                    $roleName = $assignment.RoleName
                }
                elseif ($assignment.RoleUid) {
                    $roleObj = $roles | Where-Object { $_.Uid -eq $assignment.RoleUid }
                    if ($roleObj) {
                        $roleName = $roleObj.Name
                    }
                }
                
                if ($roleName) {
                    if (-not $adminsByRole.ContainsKey($roleName)) {
                        $adminsByRole[$roleName] = @()
                    }
                    # Add assignment as admin entry
                    $adminEntry = @{
                        Name = $assignment.Identity
                        Role = $roleName
                    }
                    $adminsByRole[$roleName] += $adminEntry
                }
            }
        }
        
        # Process each role
        foreach ($role in $roles) {
            try {
                $roleInfo = @{
                    Name = $role.Name
                    Uid = $role.Uid
                    Description = $role.Description
                    IsBuiltIn = $role.IsBuiltIn
                    AssignedADGroups = @()
                    AssignedUsers = @()
                    Scopes = @()
                }
                
                # Get administrators assigned to this role
                if ($adminsByRole.ContainsKey($role.Name)) {
                    foreach ($admin in $adminsByRole[$role.Name]) {
                        $adminName = $admin.Name
                        # Determine if it's a user or AD group
                        # AD groups typically contain backslash (DOMAIN\Group) or @ (email format)
                        if ($adminName -match '\\' -or $adminName -match '@' -or $adminName -match '^CN=') {
                            if ($roleInfo.AssignedADGroups -notcontains $adminName) {
                                $roleInfo.AssignedADGroups += $adminName
                            }
                        }
                        else {
                            if ($roleInfo.AssignedUsers -notcontains $adminName) {
                                $roleInfo.AssignedUsers += $adminName
                            }
                        }
                    }
                }
                
                # Get scopes associated with this role (if available)
                if ($scopes) {
                    $associatedScopes = $scopes | Where-Object { 
                        $_.Role -eq $role.Name -or 
                        (($_.AssociatedRoles) -and ($_.AssociatedRoles -contains $role.Name)) -or
                        (($_.Roles) -and ($_.Roles -contains $role.Name))
                    }
                    foreach ($scope in $associatedScopes) {
                        $roleInfo.Scopes += @{
                            Name = $scope.Name
                            Description = $scope.Description
                        }
                    }
                }
                
                $roleData += $roleInfo
            }
            catch {
                Write-Warning "Error processing role $($role.Name): $_"
            }
        }
        
        # Also include roles that have administrators but weren't in the roles list
        if ($administrators) {
            foreach ($admin in $administrators) {
                $roleName = $admin.Role
                if ($roleName -and -not ($roles | Where-Object { $_.Name -eq $roleName })) {
                    # This role has administrators but wasn't in the roles list
                    if (-not ($roleData | Where-Object { $_.Name -eq $roleName })) {
                        $roleInfo = @{
                            Name = $roleName
                            Description = "Role found from administrator assignments"
                            IsBuiltIn = $false
                            AssignedADGroups = @()
                            AssignedUsers = @()
                            Scopes = @()
                        }
                        
                        $adminName = $admin.Name
                        if ($adminName -match '\\' -or $adminName -match '@' -or $adminName -match '^CN=') {
                            $roleInfo.AssignedADGroups += $adminName
                        }
                        else {
                            $roleInfo.AssignedUsers += $adminName
                        }
                        
                        $roleData += $roleInfo
                    }
                }
            }
        }
    }
    else {
        Write-Warning "No roles found or unable to retrieve roles"
        
        # If no roles but we have administrators, build from administrators
        if ($administrators) {
            Write-Host "Building role data from administrators..." -ForegroundColor Yellow
            $adminsByRole = @{}
            foreach ($admin in $administrators) {
                $roleName = $admin.Role
                if (-not $roleName) {
                    $roleName = $admin.RoleName
                }
                
                if ($roleName) {
                    if (-not $adminsByRole.ContainsKey($roleName)) {
                        $adminsByRole[$roleName] = @()
                    }
                    $adminsByRole[$roleName] += $admin
                }
            }
            
            foreach ($roleName in $adminsByRole.Keys) {
                $roleInfo = @{
                    Name = $roleName
                    Description = "Role found from administrator assignments"
                    IsBuiltIn = $false
                    AssignedADGroups = @()
                    AssignedUsers = @()
                    Scopes = @()
                }
                
                foreach ($admin in $adminsByRole[$roleName]) {
                    $adminName = $admin.Name
                    if ($adminName -match '\\' -or $adminName -match '@' -or $adminName -match '^CN=') {
                        if ($roleInfo.AssignedADGroups -notcontains $adminName) {
                            $roleInfo.AssignedADGroups += $adminName
                        }
                    }
                    else {
                        if ($roleInfo.AssignedUsers -notcontains $adminName) {
                            $roleInfo.AssignedUsers += $adminName
                        }
                    }
                }
                
                $roleData += $roleInfo
            }
        }
    }
    
    # Create comprehensive result with all collected data
    $totalItems = $allRoleData.Roles.Count + $allRoleData.Administrators.Count + $allRoleData.Scopes.Count + $allRoleData.Permissions.Count

    $result = @{
        Summary = @{
            TotalRoles = $allRoleData.Roles.Count
            TotalAdministrators = $allRoleData.Administrators.Count
            TotalScopes = $allRoleData.Scopes.Count
            TotalPermissions = $allRoleData.Permissions.Count
            TotalEffectiveAdministrators = $allRoleData.EffectiveAdministrators.Count
            TotalItems = $totalItems
        }
        Roles = @{
            Count = $allRoleData.Roles.Count
            Items = $allRoleData.Roles
        }
        Administrators = @{
            Count = $allRoleData.Administrators.Count
            Items = $allRoleData.Administrators
        }
        Scopes = @{
            Count = $allRoleData.Scopes.Count
            Items = $allRoleData.Scopes
        }
        Permissions = @{
            Count = $allRoleData.Permissions.Count
            Items = $allRoleData.Permissions
        }
        EffectiveAdministrators = @{
            Count = $allRoleData.EffectiveAdministrators.Count
            Items = $allRoleData.EffectiveAdministrators
        }
        CollectionMethods = @{
            IncludeScopes = $IncludeScopes
            IncludePermissions = $IncludePermissions
        }
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        Errors = $allRoleData.Errors
    }

    Write-Host "[DEBUG] Preparing to save comprehensive role data. Total items: $totalItems" | Out-File -FilePath $debugFile -Append
    $result | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8

    Write-Host "Comprehensive role information collected successfully!" -ForegroundColor Green
    Write-Host "  Roles: $($allRoleData.Roles.Count)" -ForegroundColor Cyan
    Write-Host "  Administrators: $($allRoleData.Administrators.Count)" -ForegroundColor Cyan
    Write-Host "  Scopes: $($allRoleData.Scopes.Count)" -ForegroundColor Cyan
    Write-Host "  Permissions: $($allRoleData.Permissions.Count)" -ForegroundColor Cyan
    Write-Host "  Effective Administrators: $($allRoleData.EffectiveAdministrators.Count)" -ForegroundColor Cyan
    Write-Host "  Total: $totalItems items" -ForegroundColor Green
    Write-Host "[DEBUG] Role data saved successfully to: $OutputPath" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] Script completed at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $debugFile -Append
    return $result
}
catch {
    $errorMsg = "Failed to collect Citrix roles: $_"
    Write-Error $errorMsg
    
    $result = @{
        TotalRoles = 0
        Roles = @()
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        Errors = @($errorMsg)
    }
    
    $result | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
    return $result
}

