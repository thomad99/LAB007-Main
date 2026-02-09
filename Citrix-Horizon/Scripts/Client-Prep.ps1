<#
 Client-Prep.ps1
 Prepares a Windows endpoint for remote management via WinRM (HTTP 5985).
 - Enables/starts WinRM
 - Opens firewall for WinRM HTTP
 - Sets TrustedHosts (optional; default adds all)

 Usage:
   Run as Administrator on the target:
     powershell.exe -ExecutionPolicy Bypass -File .\Client-Prep.ps1

 Switches:
   -TrustedHosts "host1,host2"   # set a specific trusted host list
   -AllHosts                    # trust all hosts (*)

#>

[CmdletBinding()]
param(
    [string]$TrustedHosts = "*",
    [switch]$AllHosts
)

function Write-Info($msg) { Write-Host "[INFO ] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[WARN ] $msg" -ForegroundColor Yellow }
function Write-Err ($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

try {
    if ($AllHosts) { $TrustedHosts = "*" }

    Write-Info "Enabling WinRM quickconfig..."
    winrm quickconfig -q

    Write-Info "Setting WinRM service to Automatic and starting..."
    Set-Service -Name WinRM -StartupType Automatic -ErrorAction Stop
    Start-Service -Name WinRM -ErrorAction Stop

    Write-Info "Enabling PSRemoting (firewall + listeners)..."
    Enable-PSRemoting -Force

    Write-Info "Opening firewall for WinRM HTTP (TCP 5985)..."
    try {
        # Try enabling built-in rule; if absent, add a custom one.
        Enable-NetFirewallRule -DisplayGroup "Windows Remote Management" -ErrorAction SilentlyContinue
    } catch { }
    if (-not (Get-NetFirewallRule -DisplayName "WINRM-HTTP-In-TCP" -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name "WINRM-HTTP-In-TCP" -DisplayName "WINRM HTTP" -Protocol TCP -LocalPort 5985 -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null
    }

    Write-Info "Configuring TrustedHosts to: $TrustedHosts"
    Set-Item WSMan:\localhost\Client\TrustedHosts -Value $TrustedHosts -Force

    Write-Info "Verifying WinRM listeners..."
    winrm enumerate winrm/config/listener

    Write-Host "[DONE ] Client prep complete." -ForegroundColor Green
} catch {
    Write-Err $_.Exception.Message
    throw
}

