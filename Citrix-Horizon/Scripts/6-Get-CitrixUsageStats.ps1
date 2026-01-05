# Get-CitrixUsageStats.ps1
# Extracts usage statistics (concurrent users, unique connections)
# Version: 1.0
# Last Modified: 250127

param(
    [string]$OutputPath = ".\Data\citrix-usage-stats.json",
    [int]$DaysBack = 30,
    [string]$CitrixVersion = "1912"
)

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

try {
    # Note: Citrix modules/snap-ins must be loaded manually before running this script
    $endDate = Get-Date
    $startDate = $endDate.AddDays(-$DaysBack)
    
    $usageStats = @{
        PeriodStart = $startDate.ToString("yyyy-MM-dd HH:mm:ss")
        PeriodEnd = $endDate.ToString("yyyy-MM-dd HH:mm:ss")
        DaysBack = $DaysBack
    }
    
    # Get session data (use AdminAddress if DDC was specified)
    try {
        if ($global:CitrixAdminAddress) {
            $sessions = Get-BrokerSession -AdminAddress $global:CitrixAdminAddress -ErrorAction Stop
        }
        else {
            $sessions = Get-BrokerSession -ErrorAction Stop
        }
        
        # Calculate max concurrent users (approximation based on active sessions)
        $maxConcurrentUsers = 0
        $uniqueUsers = @{}
        $dailyConcurrent = @{}
        
        foreach ($session in $sessions) {
            $userName = $session.UserName
            if ($userName) {
                $uniqueUsers[$userName] = $true
            }
            
            # For historical data, we'd need to query monitoring database
            # This is an approximation based on current sessions
        }
        
        $usageStats.MaxConcurrentUsers_Approx = $sessions.Count
        $usageStats.CurrentActiveSessions = $sessions.Count
        $usageStats.UniqueUserConnections_Period = $uniqueUsers.Count
        
        Write-Host "Note: Max concurrent users and historical unique connections require Monitoring database access" -ForegroundColor Yellow
    }
    catch {
        Write-Warning "Could not retrieve session data: $_"
        $usageStats.MaxConcurrentUsers_Approx = 0
        $usageStats.CurrentActiveSessions = 0
        $usageStats.UniqueUserConnections_Period = 0
    }
    
    # Try to get license information
    try {
        # For 1912/7.x, use Get-BrokerSite (Get-ConfigSite may not exist)
        # Get license info from Broker Site
        if ($false) {
            # Placeholder - Get-ConfigSite is not available in 1912
        }
        else {
            # Fallback to Broker Site (use AdminAddress if DDC was specified)
            if ($global:CitrixAdminAddress) {
                $site = Get-BrokerSite -AdminAddress $global:CitrixAdminAddress -ErrorAction SilentlyContinue
            }
            else {
                $site = Get-BrokerSite -ErrorAction SilentlyContinue
            }
            if ($site) {
                $usageStats.LicenseServer = $site.LicenseServerName
            }
            $usageStats.LicenseType = "User/Device - Check License Server"
            Write-Host "Note: License type may need to be verified manually from License Server" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Warning "Could not retrieve license information: $_"
        # Set default based on Broker Site (use AdminAddress if DDC was specified)
        try {
            if ($global:CitrixAdminAddress) {
                $site = Get-BrokerSite -AdminAddress $global:CitrixAdminAddress -ErrorAction SilentlyContinue
            }
            else {
                $site = Get-BrokerSite -ErrorAction SilentlyContinue
            }
            if ($site) {
                $usageStats.LicenseServer = $site.LicenseServerName
            }
        }
        catch {}
        $usageStats.LicenseType = "Unknown - Verify on License Server"
    }
    
    $usageStats.CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    
    # Convert to JSON and save
    $usageStats | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
    
    Write-Host "Usage statistics collected successfully" -ForegroundColor Green
    return $usageStats
}
catch {
    Write-Warning "Failed to collect usage statistics: $_"
    return @{
        MaxConcurrentUsers_Approx = 0
        CurrentActiveSessions = 0
        UniqueUserConnections_Period = 0
        LicenseType = "Unknown"
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        Error = $_.ToString()
    }
}

