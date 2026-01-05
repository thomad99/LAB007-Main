# Get-CitrixRoles.ps1
# Extracts Citrix management roles and their assigned AD groups
# Version: 1.1
# Last Modified: 260105:1827

param(
    [string]$OutputPath = ".\Data\citrix-roles.json",
    [string]$CitrixVersion = "1912"
)

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

try {
    # Note: Citrix modules/snap-ins must be loaded manually before running this script
    # Get all roles (use AdminAddress if DDC was specified)
    # Use MaxRecordCount to get more than 250 results
    $maxRecords = 10000
    
    Write-Host "Attempting to collect Citrix management roles..." -ForegroundColor Yellow
    Write-Host "[DEBUG] Roles collection started at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
    Write-Host "[DEBUG] AdminAddress: $global:CitrixAdminAddress" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
    Write-Host "[DEBUG] CitrixVersion: $CitrixVersion" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
    
    # Check what role commands are available
    Write-Host "[DEBUG] Checking available role commands..." | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
    $availableCommands = @()
    $commandsToCheck = @('Get-AdminRole', 'Get-AdminAdministrator', 'Get-AdminRoleAssignment', 'Get-AdminScope')
    foreach ($cmd in $commandsToCheck) {
        $cmdObj = Get-Command -Name $cmd -ErrorAction SilentlyContinue
        if ($cmdObj) {
            $availableCommands += $cmd
            Write-Host "[DEBUG] Command available: $cmd" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
        }
        else {
            Write-Host "[DEBUG] Command NOT available: $cmd" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
        }
    }
    Write-Host "[DEBUG] Available commands: $($availableCommands -join ', ')" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
    
    # Try Get-AdminRole first (for roles)
    $roles = $null
    try {
        Write-Host "[DEBUG] Attempting Get-AdminRole..." | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
        if ($global:CitrixAdminAddress) {
            Write-Host "[DEBUG] Calling Get-AdminRole with AdminAddress: $global:CitrixAdminAddress" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
            $roles = Get-AdminRole -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction Stop
        }
        else {
            Write-Host "[DEBUG] Calling Get-AdminRole without AdminAddress" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
            $roles = Get-AdminRole -MaxRecordCount $maxRecords -ErrorAction Stop
        }
        Write-Host "Successfully retrieved $($roles.Count) roles using Get-AdminRole" -ForegroundColor Green
        Write-Host "[DEBUG] Get-AdminRole succeeded: Found $($roles.Count) roles" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
    }
    catch {
        $errorMsg = "Get-AdminRole failed: $_"
        Write-Warning $errorMsg
        Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
        Write-Host "[DEBUG] Error details: $($_.Exception.Message)" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
        $roles = @()
    }
    
    # Get administrators (users/groups assigned to roles)
    $administrators = $null
    try {
        Write-Host "[DEBUG] Attempting Get-AdminAdministrator..." | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
        if ($global:CitrixAdminAddress) {
            $administrators = Get-AdminAdministrator -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction Stop
        }
        else {
            $administrators = Get-AdminAdministrator -MaxRecordCount $maxRecords -ErrorAction Stop
        }
        Write-Host "Successfully retrieved $($administrators.Count) administrators using Get-AdminAdministrator" -ForegroundColor Green
        Write-Host "[DEBUG] Get-AdminAdministrator succeeded: Found $($administrators.Count) administrators" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
    }
    catch {
        $errorMsg = "Get-AdminAdministrator failed: $_"
        Write-Warning $errorMsg
        Write-Host "[DEBUG] ERROR: $errorMsg" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
        Write-Host "[DEBUG] Error details: $($_.Exception.Message)" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
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
    
    $result = @{
        TotalRoles = $roleData.Count
        Roles = $roleData
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        Errors = @()
    }
    
    if ($roleData.Count -eq 0) {
        $errorMsg = "No roles were collected. This may indicate insufficient permissions or the Citrix Admin SDK may not be available."
        Write-Warning $errorMsg
        $result.Errors += $errorMsg
    }
    
    Write-Host "[DEBUG] Preparing to save role data. Total roles: $($roleData.Count)" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
    $result | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8

    Write-Host "Roles collection complete: $($roleData.Count) roles found" -ForegroundColor Green
    Write-Host "[DEBUG] Role data saved successfully to: $OutputPath" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
    Write-Host "[DEBUG] Script completed at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath (Join-Path (Split-Path -Path $OutputPath -Parent) "debug.txt") -Append -ErrorAction SilentlyContinue
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

