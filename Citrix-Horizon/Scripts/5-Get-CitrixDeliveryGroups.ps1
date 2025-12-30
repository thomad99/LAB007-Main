# Get-CitrixDeliveryGroups.ps1
# Extracts delivery groups information

param(
    [string]$OutputPath = ".\Data\citrix-delivery-groups.json",
    [string]$CitrixVersion = "1912",
    [array]$Applications = @()
)

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

try {
    # Note: Citrix modules/snap-ins must be loaded manually before running this script
    # Get all delivery groups (use AdminAddress if DDC was specified)
    # Use MaxRecordCount to get more than 250 results
    $maxRecords = 10000
    if ($global:CitrixAdminAddress) {
        $deliveryGroups = Get-BrokerDesktopGroup -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction Stop
    }
    else {
        $deliveryGroups = Get-BrokerDesktopGroup -MaxRecordCount $maxRecords -ErrorAction Stop
    }
    
    $groups = @()
    Write-Host "Processing $($deliveryGroups.Count) delivery groups..." -ForegroundColor Gray
    Write-Host "Applications available for matching: $($Applications.Count)" -ForegroundColor Gray
    
    foreach ($group in $deliveryGroups) {
        # Count applications in this delivery group
        $appCount = 0
        if ($Applications -and $Applications.Count -gt 0) {
            # Try multiple matching strategies - DesktopGroup property, case-insensitive, handle nulls
            $matchingApps = $Applications | Where-Object { 
                $appDG = $_.DesktopGroup
                $groupName = $group.Name
                if ($appDG -and $groupName) {
                    # Case-insensitive comparison with trimmed strings
                    $appDGStr = $appDG.ToString().Trim()
                    $groupNameStr = $groupName.ToString().Trim()
                    $appDGStr -eq $groupNameStr
                }
                else {
                    $false
                }
            }
            $appCount = if ($matchingApps) { $matchingApps.Count } else { 0 }
            
            # Debug output for first few groups
            if ($groups.Count -lt 3) {
                Write-Host "  Delivery Group '$($group.Name)': $appCount applications" -ForegroundColor Gray
            }
        }
        else {
            Write-Warning "No applications data provided for counting apps in delivery groups"
        }
        
        # Get restart schedule information
        $restartSchedule = "Not Configured"
        $restartScheduleEnabled = $false
        $restartScheduleFrequency = ""
        $restartScheduleStartTime = ""
        $restartScheduleDaysOfWeek = ""
        
        try {
            # Check if restart schedule is enabled (try different property names for different versions)
            $scheduleEnabled = $false
            if ($group.PSObject.Properties.Name -contains "RestartScheduleEnabled") {
                $scheduleEnabled = $group.RestartScheduleEnabled
            }
            elseif ($group.PSObject.Properties.Name -contains "RestartSchedule") {
                $scheduleEnabled = $group.RestartSchedule -ne $null
            }
            
            if ($scheduleEnabled) {
                $restartScheduleEnabled = $true
                
                # Get frequency
                if ($group.PSObject.Properties.Name -contains "RestartScheduleFrequency") {
                    $restartScheduleFrequency = $group.RestartScheduleFrequency.ToString()
                }
                elseif ($group.PSObject.Properties.Name -contains "RestartFrequency") {
                    $restartScheduleFrequency = $group.RestartFrequency.ToString()
                }
                
                # Get start time
                if ($group.PSObject.Properties.Name -contains "RestartScheduleStartTime") {
                    $restartScheduleStartTime = $group.RestartScheduleStartTime.ToString()
                }
                elseif ($group.PSObject.Properties.Name -contains "RestartStartTime") {
                    $restartScheduleStartTime = $group.RestartStartTime.ToString()
                }
                
                # Build restart schedule description
                if ($restartScheduleFrequency -eq "Daily" -or $restartScheduleFrequency -eq "OncePerDay") {
                    $restartSchedule = "Daily at $restartScheduleStartTime"
                }
                elseif ($restartScheduleFrequency -eq "Weekly" -or $restartScheduleFrequency -eq "OncePerWeek") {
                    $daysOfWeek = ""
                    if ($group.PSObject.Properties.Name -contains "RestartScheduleDaysOfWeek" -and $group.RestartScheduleDaysOfWeek) {
                        $daysOfWeek = ($group.RestartScheduleDaysOfWeek -join ", ")
                        $restartScheduleDaysOfWeek = $daysOfWeek
                    }
                    elseif ($group.PSObject.Properties.Name -contains "RestartDaysOfWeek" -and $group.RestartDaysOfWeek) {
                        $daysOfWeek = ($group.RestartDaysOfWeek -join ", ")
                        $restartScheduleDaysOfWeek = $daysOfWeek
                    }
                    $restartSchedule = if ($daysOfWeek) { "Weekly on $daysOfWeek at $restartScheduleStartTime" } else { "Weekly at $restartScheduleStartTime" }
                }
                elseif ($restartScheduleFrequency -eq "Monthly" -or $restartScheduleFrequency -eq "OncePerMonth") {
                    $restartSchedule = "Monthly at $restartScheduleStartTime"
                }
                else {
                    $restartSchedule = if ($restartScheduleFrequency) { "$restartScheduleFrequency at $restartScheduleStartTime" } else { "Enabled" }
                }
                
                # Add natural reboot info if available
                if ($group.PSObject.Properties.Name -contains "RestartScheduleUseNaturalReboot" -and $group.RestartScheduleUseNaturalReboot) {
                    $restartSchedule += " (Natural Reboot)"
                }
                elseif ($group.PSObject.Properties.Name -contains "UseNaturalReboot" -and $group.UseNaturalReboot) {
                    $restartSchedule += " (Natural Reboot)"
                }
            }
        }
        catch {
            Write-Warning "Could not retrieve restart schedule for delivery group $($group.Name): $_"
        }
        
        $groupInfo = @{
            Name = $group.Name
            Uid = $group.Uid
            Enabled = $group.Enabled
            DesktopKind = $group.DesktopKind
            SessionSupport = $group.SessionSupport
            TotalMachines = $group.TotalMachines
            AvailableCount = $group.AvailableCount
            InUseCount = $group.InUseCount
            InMaintenanceMode = $group.InMaintenanceMode
            TotalApplications = $appCount
            RestartScheduleEnabled = $restartScheduleEnabled
            RestartSchedule = $restartSchedule
            RestartScheduleFrequency = $restartScheduleFrequency
            RestartScheduleStartTime = $restartScheduleStartTime
            RestartScheduleDaysOfWeek = $restartScheduleDaysOfWeek
        }
        $groups += $groupInfo
    }
    
    $result = @{
        TotalDeliveryGroups = $groups.Count
        DeliveryGroups = $groups
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    }
    
    # Convert to JSON and save
    $result | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
    
    Write-Host "Delivery groups information collected successfully. Total: $($groups.Count)" -ForegroundColor Green
    return $result
}
catch {
    Write-Warning "Failed to collect delivery groups information: $_"
    return @{
        TotalDeliveryGroups = 0
        DeliveryGroups = @()
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        Error = $_.ToString()
    }
}

