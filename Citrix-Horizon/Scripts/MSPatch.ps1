<# 
MSPatch.ps1 -ComputerName X

- Patches a remote Windows Server via PSWindowsUpdate over WinRM.
- Waits for reboot using WinRM checks only (poll every 30s by default).
- Posts progress to a Teams channel via a Power Automate / Teams Workflows webhook.
  IMPORTANT: Your workflow expects an Adaptive Card JSON (not { "text": "..." }).
- Default behavior: when fully up-to-date at the end, shuts the target down
  (disable with -NoShutdownAfterPatch).

.EXAMPLE
  .\MSPatch.ps1 -ComputerName shc-m-helpdesk

.EXAMPLE
  .\MSPatch.ps1 -ComputerName shc-m-helpdesk -NoShutdownAfterPatch
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$ComputerName,

    [Parameter(Mandatory=$false)]
    [System.Management.Automation.PSCredential]$Credential,

[Parameter(Mandatory=$false)]
[string]$CredentialPath = "$PSScriptRoot\MSPatch.cred.xml",

[Parameter(Mandatory=$false)]
[switch]$SaveCredential,

[Parameter(Mandatory=$false)]
[switch]$RunLocal,

[Parameter(Mandatory=$false)]
[string[]]$UpdateCategories = @('Security Updates'),

[Parameter(Mandatory=$false)]
[string]$LogPath = 'C:\ctxadmin\MSpatch.log',

# WinRM / transport
[Parameter(Mandatory=$false)]
[ValidateSet('Default','Negotiate','Kerberos','Basic','Credssp')]
[string]$WinRMAuthentication = 'Negotiate',

[switch]$UseSSL,

# Add target to TrustedHosts temporarily (for workgroup/local admin)
[switch]$AddToTrustedHosts,

    # Reboot / readiness timing (WinRM only)
    [int]$TimeoutSeconds = 3600,     # total wait time after each reboot (default 60 min)
    [int]$PollSeconds    = 30,       # poll interval for WinRM checks (default 30s)
    [int]$OfflineWaitSeconds = 300,  # best-effort observe WinRM drop (default 5 min)

    # Safety / behavior
    [int]$MaxReboots = 3,

    # Default = shutdown after patch cycle completes (including "NoUpdates")
    [switch]$NoShutdownAfterPatch
)

# -------------------------------
# TLS/Proxy (must be AFTER param)
# -------------------------------
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
try {
    [System.Net.WebRequest]::DefaultWebProxy = [System.Net.WebRequest]::GetSystemWebProxy()
    [System.Net.WebRequest]::DefaultWebProxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials
} catch { }
$ProgressPreference = 'SilentlyContinue'

# Ensure log directory
try {
    $logDir = Split-Path -Parent $LogPath
    if ($logDir -and -not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
} catch {}

function Write-Log {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    try { Add-Content -LiteralPath $LogPath -Value $line -ErrorAction SilentlyContinue } catch {}
    Write-Host $line
}

# -------------------------------
# Teams Workflow Webhook URL
# -------------------------------
# Treat this URL like a password.
$TeamsWorkflowUrl = "https://default47eb93f93c37419cae4e37c50e7d1d.c0.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/72ca894639d14c8fae484f6db87527b2/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=M38KwWz-oLmqc6joZdCgC54BfzjQCYsghHAEvMmW198"

# -------------------------------
# Helpers
# -------------------------------

function Send-TeamsAdaptiveCard {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string]$WorkflowUrl,
        [Parameter(Mandatory)] [string]$Title,
        [Parameter(Mandatory)] [string]$Text,
        [ValidateSet("info","success","warning","error")]
        [string]$Level = "info",
        [string]$Computer = $env:COMPUTERNAME
    )

    $payload = @{
        type    = "AdaptiveCard"
        version = "1.4"
        body    = @(
            @{
                type   = "TextBlock"
                text   = $Title
                wrap   = $true
                weight = "Bolder"
                size   = "Medium"
            },
            @{
                type   = "TextBlock"
                text   = $Text
                wrap   = $true
            },
            @{
                type     = "TextBlock"
                text     = "From: $Computer at $(Get-Date -Format 'MM/dd/yyyy HH:mm:ss')"
                wrap     = $true
                isSubtle = $true
                spacing  = "Medium"
            }
        )
    } | ConvertTo-Json -Depth 20

    try {
        Invoke-RestMethod -Method Post -Uri $WorkflowUrl -ContentType 'application/json' -Body $payload -ErrorAction Stop | Out-Null
        return $true
    } catch {
        Write-Warning "Teams workflow post failed: $($_.Exception.Message)"
        return $false
    }
}

function Wait-ForWinRMReboot {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string]$ComputerName,
        [Parameter(Mandatory)] [System.Management.Automation.PSCredential]$Credential,
        [int]$TimeoutSeconds = 3600,
        [int]$PollSeconds = 30,
        [int]$OfflineWaitSeconds = 300,
        [string]$Auth = "Negotiate",
        [switch]$UseSSL
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    $testParams = @{
        ComputerName = $ComputerName
        ErrorAction  = 'Stop'
        Authentication = $Auth
    }
    if ($UseSSL) { $testParams.UseSSL = $true }

    $invokeParams = @{
        ComputerName  = $ComputerName
        Credential    = $Credential
        ErrorAction   = 'Stop'
        Authentication = $Auth
    }
    if ($UseSSL) { $invokeParams.UseSSL = $true }

    Write-Host ("[{0}] [{1}] Waiting for WinRM to DROP (reboot start)..." -f (Get-Date), $ComputerName) -ForegroundColor Cyan

    # Phase A: best-effort observe WinRM drop
    $offlineDeadline = (Get-Date).AddSeconds([Math]::Min($OfflineWaitSeconds, $TimeoutSeconds))
    $sawOffline = $false

    while ((Get-Date) -lt $offlineDeadline) {
        try {
            Test-WSMan @testParams | Out-Null
            Start-Sleep -Seconds $PollSeconds
        } catch {
            $sawOffline = $true
            Write-Host ("[{0}] [{1}] WinRM is offline (reboot in progress)." -f (Get-Date), $ComputerName) -ForegroundColor Yellow
            break
        }
    }

    if (-not $sawOffline) {
        Write-Warning "[$ComputerName] Did not observe WinRM drop (reboot may have been quick or WinRM remained reachable). Continuing..."
    }

    Write-Host ("[{0}] [{1}] Waiting for WinRM to RETURN..." -f (Get-Date), $ComputerName) -ForegroundColor Cyan

    # Phase B: wait for WinRM to return
    while ((Get-Date) -lt $deadline) {
        try {
            Test-WSMan @testParams | Out-Null
            break
        } catch {
            Start-Sleep -Seconds $PollSeconds
        }
    }

    if ((Get-Date) -ge $deadline) {
        throw "[$ComputerName] WinRM did not come back within $TimeoutSeconds seconds."
    }

    Write-Host ("[{0}] [{1}] WinRM responds. Waiting for remoting to be STABLE (Invoke-Command)..." -f (Get-Date), $ComputerName) -ForegroundColor Cyan

    # Phase C: wait for a real remote command to succeed (auth + services ready)
    while ((Get-Date) -lt $deadline) {
        try {
            $null = Invoke-Command @invokeParams -ScriptBlock { 1 }
            Write-Host ("[{0}] [{1}] Remoting is stable." -f (Get-Date), $ComputerName) -ForegroundColor Green
            return $true
        } catch {
            Start-Sleep -Seconds $PollSeconds
        }
    }

    throw "[$ComputerName] Remoting did not become stable within $TimeoutSeconds seconds after reboot."
}

if (-not $Credential) {
    if (Test-Path -LiteralPath $CredentialPath) {
        try {
            $Credential = Import-Clixml -LiteralPath $CredentialPath
            Write-Host ("[{0}] Using saved credential from {1} (user: {2})" -f (Get-Date), $CredentialPath, $Credential.UserName) -ForegroundColor Cyan
        } catch {
            Write-Warning "Failed to load saved credential from $CredentialPath : $($_.Exception.Message)"
        }
    }
}

if (-not $Credential) {
    $Credential = Get-Credential
    if ($SaveCredential) {
        try {
            $Credential | Export-Clixml -LiteralPath $CredentialPath -Force
            Write-Host ("[{0}] Credential saved (DPAPI protected) to {1}" -f (Get-Date), $CredentialPath) -ForegroundColor Yellow
        } catch {
            Write-Warning "Failed to save credential to $CredentialPath : $($_.Exception.Message)"
        }
    }
}
Write-Host ("[{0}] Using credential user: {1}" -f (Get-Date), $Credential.UserName) -ForegroundColor Cyan
Write-Host ("[{0}] WinRM auth: {1}  UseSSL: {2}" -f (Get-Date), $WinRMAuthentication, $UseSSL) -ForegroundColor Cyan

# -------------------------------
# TrustedHosts handling (optional, for workgroup/local admin)
# -------------------------------
$initialTrustedHosts = $null
$addedTrustedHost = $false
try {
    $initialTrustedHosts = (Get-Item WSMan:\localhost\Client\TrustedHosts -ErrorAction Stop).Value
    $hostList = @()
    if ($initialTrustedHosts -and $initialTrustedHosts.Trim()) {
        $hostList = $initialTrustedHosts.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    }
    if ($hostList -notcontains $ComputerName -and $hostList -notcontains '*') {
        $hostList += $ComputerName
        $newValue = ($hostList -join ',')
        Set-Item WSMan:\localhost\Client\TrustedHosts -Value $newValue -Force -ErrorAction Stop | Out-Null
        $addedTrustedHost = $true
        Write-Host "TrustedHosts updated to include $ComputerName" -ForegroundColor Yellow
    } else {
        Write-Host "TrustedHosts already includes $ComputerName or wildcard (*)." -ForegroundColor Gray
    }
} catch {
    Write-Warning "Failed to update TrustedHosts: $($_.Exception.Message)"
}

# Common WinRM parameter sets
$invokeCommon = @{
    ComputerName   = $ComputerName
    Credential     = $Credential
    Authentication = $WinRMAuthentication
}
if ($UseSSL) { $invokeCommon.UseSSL = $true }

# Quick connectivity preflight to give a helpful hint for firewall scope issues
$wsCheck = @{
    ComputerName  = $ComputerName
    Authentication = $WinRMAuthentication
    ErrorAction   = 'Stop'
}
if ($UseSSL)    { $wsCheck.UseSSL    = $true }
if ($Credential){ $wsCheck.Credential = $Credential }
try {
    Test-WSMan @wsCheck | Out-Null
}
catch {
    $msg = $_.Exception.Message
    Write-Warning "WinRM pre-check failed for $ComputerName : $msg"
    Write-Host  "If this is a firewall scope issue, on the target run:" -ForegroundColor Yellow
    Write-Host  "  Set-NetFirewallRule -Name \"WINRM-HTTP-In-TCP\" -Enabled True -Profile Any -Action Allow -RemoteAddress Any" -ForegroundColor Yellow
    Write-Host  "Or enable HTTPS/5986 and rerun with -UseSSL." -ForegroundColor Yellow
    throw
}

# -------------------------------
# Remote update logic
# -------------------------------

$UpdateScript = {
    param(
        [bool]$Install = $false,
        [bool]$ReturnStatus = $false
    )

    $ErrorActionPreference = "Stop"

    function Start-WuauservIfNeeded {
        $svc = Get-Service -Name wuauserv -ErrorAction SilentlyContinue
        if (-not $svc) { throw "Windows Update service (wuauserv) not found." }

        # Ensure Automatic start
        if ($svc.StartType -ne 'Automatic') {
            Set-Service -Name wuauserv -StartupType Automatic -ErrorAction Stop
        }

        # If not running, start it and wait until running (or timeout)
        if ($svc.Status -ne 'Running') {
            try {
                Start-Service -Name wuauserv -ErrorAction Stop
                $waited = 0
                while ($waited -lt 30) {
                    $svc = Get-Service -Name wuauserv -ErrorAction SilentlyContinue
                    if ($svc.Status -eq 'Running') { break }
                    Start-Sleep -Seconds 1
                    $waited++
                }
                if ($svc.Status -ne 'Running') {
                    throw "wuauserv did not reach Running state after 30s."
                }
            } catch {
                throw "Failed to start Windows Update service (wuauserv): $($_.Exception.Message)"
            }
        }
    }

    function Get-LatestHotfixInfo {
        $hotfixes = Get-HotFix | Sort-Object InstalledOn -Descending
        $hf = $hotfixes | Select-Object -First 1
        [pscustomobject]@{
            LatestHotfixKB   = $hf.HotFixID
            LatestHotfixDate = $hf.InstalledOn
        }
    }

    function Get-RebootRequired {
        $paths = @(
            'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending',
            'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired',
            'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager'
        )

        $cbs = Test-Path $paths[0]
        $wu  = Test-Path $paths[1]
        $sm  = Get-ItemProperty -Path $paths[2] -Name PendingFileRenameOperations -ErrorAction SilentlyContinue
        $pfr = $null -ne $sm.PendingFileRenameOperations

        return ($cbs -or $wu -or $pfr)
    }

    Write-Log "UpdateScript start: Categories=$($UpdateCategories -join ', '), UseWSUS=$useWsus, MicrosoftUpdate=$(! $useWsus)"
    if (-not (Get-Module -ListAvailable PSWindowsUpdate)) {
        throw "PSWindowsUpdate module not found on this server. Copy it into C:\Program Files\WindowsPowerShell\Modules\PSWindowsUpdate\"
    }
    Import-Module PSWindowsUpdate -Force

    # Detect WSUS usage; if WSUS enforced, stay with it; otherwise enable Microsoft Update
    $useWsus = $false
    try {
        $auKey = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
        $useVal = (Get-ItemProperty -Path $auKey -Name UseWUServer -ErrorAction SilentlyContinue).UseWUServer
        if ($useVal -eq 1) { $useWsus = $true }
    } catch { }

    if ($useWsus) {
        Write-Verbose "WSUS detected (UseWUServer=1). Using WSUS for updates."
        try { Set-WUSettings -DoNotConnectWSUS $false -ErrorAction SilentlyContinue } catch { }
    } else {
        Write-Verbose "WSUS not enforced. Enabling Microsoft Update."
        try { Add-WUServiceManager -MicrosoftUpdate -Confirm:$false -ErrorAction SilentlyContinue } catch { Write-Verbose "Add-WUServiceManager: $($_.Exception.Message)" }
        try { Enable-WURemoting -Confirm:$false -ErrorAction SilentlyContinue } catch { Write-Verbose "Enable-WURemoting: $($_.Exception.Message)" }
    }

    # Ensure Windows Update service is enabled and running
    Start-WuauservIfNeeded

    $before = Get-LatestHotfixInfo

    if ($ReturnStatus) {
        return [pscustomobject]@{
            ComputerName     = $env:COMPUTERNAME
            LatestHotfixKB   = $before.LatestHotfixKB
            LatestHotfixDate = $before.LatestHotfixDate
            RebootRequired   = (Get-RebootRequired)
        }
    }

    Write-Host ("[{0}] Checking available updates..." -f (Get-Date)) -ForegroundColor Cyan
    Write-Log "Scanning for updates..."

    $available = Get-WindowsUpdate -Category $UpdateCategories -IgnoreUserInput -ErrorAction Stop -MicrosoftUpdate:(!$useWsus)
    $count = ($available | Measure-Object).Count

    Write-Host ("[{0}] Available updates: {1}" -f (Get-Date), $count) -ForegroundColor Cyan
    Write-Log "Found $count update(s)"

    if ($count -eq 0) {
        $after = Get-LatestHotfixInfo
        return [pscustomobject]@{
            ComputerName      = $env:COMPUTERNAME
            Action            = "NoUpdates"
            BeforeKB          = $before.LatestHotfixKB
            BeforeDate        = $before.LatestHotfixDate
            AfterKB           = $after.LatestHotfixKB
            AfterDate         = $after.LatestHotfixDate
            RebootRequired    = (Get-RebootRequired)
            AvailableTitles   = @()
        }
    }

    if (-not $Install) {
        $after = Get-LatestHotfixInfo
        return [pscustomobject]@{
            ComputerName      = $env:COMPUTERNAME
            Action            = "ScanOnly"
            BeforeKB          = $before.LatestHotfixKB
            BeforeDate        = $before.LatestHotfixDate
            AfterKB           = $after.LatestHotfixKB
            AfterDate         = $after.LatestHotfixDate
            RebootRequired    = (Get-RebootRequired)
            AvailableTitles   = @($available.Title)
        }
    }

    Write-Host ("[{0}] Installing updates..." -f (Get-Date)) -ForegroundColor Magenta
    Write-Log "Installing updates..."
    # Simplified install to mirror local success
    Install-WindowsUpdate -AcceptAll -IgnoreReboot -Verbose -ErrorAction Stop -MicrosoftUpdate:(!$useWsus) -Category $UpdateCategories | Out-Host

    $after = Get-LatestHotfixInfo
    $pending = Get-RebootRequired

    return [pscustomobject]@{
        ComputerName      = $env:COMPUTERNAME
        Action            = "Installed"
        BeforeKB          = $before.LatestHotfixKB
        BeforeDate        = $before.LatestHotfixDate
        AfterKB           = $after.LatestHotfixKB
        AfterDate         = $after.LatestHotfixDate
        RebootRequired    = $pending
        InstalledAt       = (Get-Date)
    }
}

# -------------------------------
# MAIN
# -------------------------------

function Invoke-LocalRun {
    param(
        [string]$TargetComputer
    )
    $scriptText = Get-Content -Raw -LiteralPath $PSCommandPath
    $argsList = @{
        Target = $TargetComputer
        Auth   = $WinRMAuthentication
        UseSSL = $UseSSL
        Timeout = $TimeoutSeconds
        Poll = $PollSeconds
        Offline = $OfflineWaitSeconds
        MaxReboots = $MaxReboots
        NoShutdown = $NoShutdownAfterPatch
    }
    Write-Host ("[{0}] Deploying MSPatch to {1}\C$\ctxadmin\mspatch.ps1 ..." -f (Get-Date), $TargetComputer) -ForegroundColor Yellow
    Invoke-Command -ComputerName $TargetComputer -Credential $Credential -Authentication $WinRMAuthentication -UseSSL:$UseSSL -ScriptBlock {
        param($content,$target,$auth,$useSSL,$timeout,$poll,$offline,$maxReboots,$noShutdown)
        $dir = 'C:\ctxadmin'
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        $path = Join-Path $dir 'mspatch.ps1'
        Set-Content -LiteralPath $path -Value $content -Encoding UTF8 -Force
        Write-Host ("[{0}] Running local MSPatch from {1}" -f (Get-Date), $path) -ForegroundColor Cyan
        powershell.exe -ExecutionPolicy Bypass -File $path -ComputerName $env:COMPUTERNAME -WinRMAuthentication $auth -UseSSL:$useSSL -TimeoutSeconds $timeout -PollSeconds $poll -OfflineWaitSeconds $offline -MaxReboots $maxReboots -NoShutdownAfterPatch:$noShutdown -RunLocal
    } -ArgumentList $scriptText,$TargetComputer,$WinRMAuthentication,$UseSSL,$TimeoutSeconds,$PollSeconds,$OfflineWaitSeconds,$MaxReboots,$NoShutdownAfterPatch
    Write-Host ("[{0}] Deployment invoked. Exiting wrapper." -f (Get-Date)) -ForegroundColor Green
    exit 0
}

if (-not $RunLocal) {
    Invoke-LocalRun -TargetComputer $ComputerName
}

$scriptStart = Get-Date
Write-Host ("[{0}] Target: {1} (local run)" -f $scriptStart, $ComputerName) -ForegroundColor Cyan
Write-Log "MSPatch start for $ComputerName (local run). Categories=$($UpdateCategories -join ', '). Log=$LogPath"

$null = Send-TeamsAdaptiveCard -WorkflowUrl $TeamsWorkflowUrl `
    -Title "MSPatch started" `
    -Text "$ComputerName - Starting patch run" `
    -Level "info" `
    -Computer $env:COMPUTERNAME

try {
    for ($cycle = 1; $cycle -le 3; $cycle++) {
        Write-Host ("[{0}] Cycle {1} start" -f (Get-Date), $cycle) -ForegroundColor Cyan
        # Phase 1: scan
        $null = Send-TeamsAdaptiveCard -WorkflowUrl $TeamsWorkflowUrl `
            -Title "Checking for updates (cycle $cycle)" `
            -Text "$ComputerName - Checking for updates" `
            -Level "info" `
            -Computer $env:COMPUTERNAME

        $scan = Invoke-Command @invokeCommon -ScriptBlock $UpdateScript -ArgumentList $false,$false
        $scan | Format-List

        if ($scan.Action -eq "NoUpdates") {
            $null = Send-TeamsAdaptiveCard -WorkflowUrl $TeamsWorkflowUrl `
                -Title "No updates found" `
                -Text "$ComputerName - Update checks completed. No updates found." `
                -Level "success" `
                -Computer $env:COMPUTERNAME

            if (-not $NoShutdownAfterPatch) {
                $null = Send-TeamsAdaptiveCard -WorkflowUrl $TeamsWorkflowUrl `
                    -Title "Shutting down" `
                    -Text "$ComputerName - Update checks completed, shutting down" `
                    -Level "warning" `
                    -Computer $env:COMPUTERNAME

                Start-Sleep -Seconds 5
                Stop-Computer -ComputerName $ComputerName -Credential $Credential -Force
            }
            break
        }

        # Phase 2: install + reboot loop
        $rebootCount = 0

        do {
            $installError = $null
            try {
                $result = Invoke-Command @invokeCommon -ScriptBlock $UpdateScript -ArgumentList $true,$false
            } catch {
                $installError = $_.Exception.Message
                $result = $null
            }

            if ($installError) {
                Write-Warning "[$ComputerName] Install attempt failed: $installError"
                $null = Send-TeamsAdaptiveCard -WorkflowUrl $TeamsWorkflowUrl `
                    -Title "Install failed" `
                    -Text "$ComputerName - Install attempt failed: $installError" `
                    -Level "warning" `
                    -Computer $env:COMPUTERNAME
                break
            }

            if (-not $result) {
                Write-Warning "[$ComputerName] Install returned no result; aborting to avoid hang."
                $null = Send-TeamsAdaptiveCard -WorkflowUrl $TeamsWorkflowUrl `
                    -Title "Install inconclusive" `
                    -Text "$ComputerName - Install returned no result; stopping to avoid hang." `
                    -Level "warning" `
                    -Computer $env:COMPUTERNAME
                break
            }

            $result | Format-List

            if ($result.Action -eq "Installed") {
                $null = Send-TeamsAdaptiveCard -WorkflowUrl $TeamsWorkflowUrl `
                    -Title "Updates installed" `
                    -Text "$ComputerName - Updates installed. Reboot required: $($result.RebootRequired)" `
                    -Level "info" `
                    -Computer $env:COMPUTERNAME
            }

            if ($result.RebootRequired -eq $true) {
                if ($rebootCount -ge $MaxReboots) {
                    throw "Reboot required but max reboot count ($MaxReboots) reached. Stop and investigate."
                }

                $rebootCount++
                $null = Send-TeamsAdaptiveCard -WorkflowUrl $TeamsWorkflowUrl `
                    -Title "Restarting" `
                    -Text "$ComputerName - Reboot required, restarting (reboot #$rebootCount)" `
                    -Level "warning" `
                    -Computer $env:COMPUTERNAME

                Restart-Computer -ComputerName $ComputerName -Credential $Credential -Force

                Write-Host ("[{0}] Waiting for reboot to complete (WinRM + stable remoting)..." -f (Get-Date)) -ForegroundColor Cyan
                Wait-ForWinRMReboot -ComputerName $ComputerName -Credential $Credential -TimeoutSeconds $TimeoutSeconds -PollSeconds $PollSeconds -OfflineWaitSeconds $OfflineWaitSeconds -Auth $WinRMAuthentication -UseSSL:$UseSSL

                $null = Send-TeamsAdaptiveCard -WorkflowUrl $TeamsWorkflowUrl `
                    -Title "Back online" `
                    -Text "$ComputerName - Reboot completed, continuing" `
                    -Level "success" `
                    -Computer $env:COMPUTERNAME
            }

        } while ($result.RebootRequired -eq $true)

        Write-Host ("[{0}] Install/reboot loop complete. Reboots performed: {1}" -f (Get-Date), $rebootCount) -ForegroundColor Green
        Write-Log "Install/reboot loop complete. Reboots performed: $rebootCount"

        # Final scan safety check (only shutdown if truly NoUpdates now)
        $finalScan = Invoke-Command @invokeCommon -ScriptBlock $UpdateScript -ArgumentList $false,$false
        $finalScan | Format-List

        if ($finalScan.Action -eq "NoUpdates") {
            $duration = New-TimeSpan -Start $scriptStart -End (Get-Date)

            $null = Send-TeamsAdaptiveCard -WorkflowUrl $TeamsWorkflowUrl `
                -Title "Patching complete" `
                -Text "$ComputerName - Updates completed (reboots: $rebootCount, duration: $([int]$duration.TotalMinutes)m)" `
                -Level "success" `
                -Computer $env:COMPUTERNAME

            if (-not $NoShutdownAfterPatch) {
                $null = Send-TeamsAdaptiveCard -WorkflowUrl $TeamsWorkflowUrl `
                    -Title "Shutting down" `
                    -Text "$ComputerName - Updates completed, shutting down" `
                    -Level "warning" `
                    -Computer $env:COMPUTERNAME

                Start-Sleep -Seconds 5
                Stop-Computer -ComputerName $ComputerName -Credential $Credential -Force
            } else {
                $null = Send-TeamsAdaptiveCard -WorkflowUrl $TeamsWorkflowUrl `
                    -Title "Completed" `
                    -Text "$ComputerName - Completed, leaving powered on (-NoShutdownAfterPatch set)" `
                    -Level "info" `
                    -Computer $env:COMPUTERNAME
            }
            break
        } else {
            # Still updates: force a restart between cycles and rerun
            if ($cycle -lt 3) {
                Write-Host ("[{0}] Pending updates remain; restarting before next cycle." -f (Get-Date)) -ForegroundColor Yellow
                Restart-Computer -ComputerName $ComputerName -Credential $Credential -Force
                Write-Host ("[{0}] Waiting for reboot to complete (WinRM + stable remoting)..." -f (Get-Date)) -ForegroundColor Cyan
                Wait-ForWinRMReboot -ComputerName $ComputerName -Credential $Credential -TimeoutSeconds $TimeoutSeconds -PollSeconds $PollSeconds -OfflineWaitSeconds $OfflineWaitSeconds -Auth $WinRMAuthentication -UseSSL:$UseSSL
                continue
            } else {
                Write-Warning "[$ComputerName] Updates still available after max cycles."
                $null = Send-TeamsAdaptiveCard -WorkflowUrl $TeamsWorkflowUrl `
                    -Title "Updates still pending after max cycles" `
                    -Text "$ComputerName - Updates still available after max cycles." `
                    -Level "warning" `
                    -Computer $env:COMPUTERNAME
            }
        }
    }
}
catch {
    $err = $_.Exception.Message
    Write-Error $err

    $null = Send-TeamsAdaptiveCard -WorkflowUrl $TeamsWorkflowUrl `
        -Title "MSPatch ERROR" `
        -Text "$ComputerName - ERROR: $err" `
        -Level "error" `
        -Computer $env:COMPUTERNAME

            Write-Log "ERROR: $err"
    throw
}
finally {
# We intentionally leave TrustedHosts updated to keep future runs working for this host.
}