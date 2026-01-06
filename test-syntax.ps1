$scriptPath = 'Citrix-Horizon\Scripts\10-Get-CitrixServers.ps1'
$content = Get-Content $scriptPath -Raw
$errors = $null
$null = [System.Management.Automation.PSParser]::Tokenize($content, [ref]$errors)
if ($errors) {
    $errors | ForEach-Object {
        Write-Host "Line $($_.Token.StartLine) Column $($_.Token.StartColumn): $($_.Message)"
    }
} else {
    Write-Host 'No syntax errors found'
}

