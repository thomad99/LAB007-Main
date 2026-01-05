# Get-CitrixApplications.ps1
# Extracts published applications information
# Version: 1.0
# Last Modified: 250127

param(
    [string]$OutputPath = ".\Data\citrix-applications.json",
    [string]$CitrixVersion = "1912"
)

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

try {
    # Note: Citrix modules/snap-ins must be loaded manually before running this script
    # Get all published applications (use AdminAddress if DDC was specified)
    # Use MaxRecordCount to get more than 250 results
    $maxRecords = 10000
    if ($global:CitrixAdminAddress) {
        $apps = Get-BrokerApplication -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction Stop
    }
    else {
        $apps = Get-BrokerApplication -MaxRecordCount $maxRecords -ErrorAction Stop
    }
    
    $applications = @()
    foreach ($app in $apps) {
        try {
            # Get assigned users/groups
            $assignedUsers = @()
            $assignedGroups = @()
            try {
                if ($global:CitrixAdminAddress) {
                    $appUsers = Get-BrokerApplication -Uid $app.Uid -AdminAddress $global:CitrixAdminAddress | Get-BrokerUser -ErrorAction SilentlyContinue
                }
                else {
                    $appUsers = Get-BrokerApplication -Uid $app.Uid | Get-BrokerUser -ErrorAction SilentlyContinue
                }
                if ($appUsers) {
                    foreach ($user in $appUsers) {
                        if ($user.Name) {
                            if ($user.Name.Contains('\') -or $user.Name.Contains('@')) {
                                $assignedGroups += $user.Name
                            }
                            else {
                                $assignedUsers += $user.Name
                            }
                        }
                    }
                }
            }
            catch {
                # If Get-BrokerUser doesn't work, try alternative methods
                if ($app.AssociatedUserNames) {
                    $assignedUsers = $app.AssociatedUserNames
                }
                if ($app.AssociatedUserGroupNames) {
                    $assignedGroups = $app.AssociatedUserGroupNames
                }
            }
            
            $appInfo = @{
                Name = $app.ApplicationName
                Uid = $app.Uid
                Enabled = $app.Enabled
                PublishedName = $app.PublishedName
                DesktopGroup = $app.DesktopGroupName
                IconUid = $app.IconUid
                Description = $app.Description
                CommandLineExecutable = $app.CommandLineExecutable
                CommandLineArguments = $app.CommandLineArguments
                WorkingDirectory = $app.WorkingDirectory
                StartMenuFolder = $app.StartMenuFolder
                AssignedUsers = $assignedUsers
                AssignedGroups = $assignedGroups
            }
            $applications += $appInfo
        }
        catch {
            Write-Warning "Error processing application $($app.ApplicationName): $_"
            # Add basic info even if detailed collection fails
            $appInfo = @{
                Name = $app.ApplicationName
                Uid = $app.Uid
                Enabled = $app.Enabled
                PublishedName = $app.PublishedName
                DesktopGroup = $app.DesktopGroupName
                Error = "Partial data: $_"
            }
            $applications += $appInfo
        }
    }
    
    $result = @{
        TotalApplications = $applications.Count
        Applications = $applications
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    }
    
    # Convert to JSON and save
    $result | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
    
    Write-Host "Applications information collected successfully. Total: $($applications.Count)" -ForegroundColor Green
    return $result
}
catch {
    Write-Warning "Failed to collect applications information: $_"
    # Return empty result instead of null to allow script to continue
    return @{
        TotalApplications = 0
        Applications = @()
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        Error = $_.ToString()
    }
}

