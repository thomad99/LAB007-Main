$scriptPath = "Citrix-Horizon\Scripts\10-Get-CitrixServers.ps1"
$content = Get-Content $scriptPath -Raw

$errors = $null
$tokens = $null
$null = [System.Management.Automation.PSParser]::Tokenize($content, [ref]$tokens, [ref]$errors)

if ($errors) {
    Write-Host "Tokenization Errors:" -ForegroundColor Red
    $errors | ForEach-Object {
        Write-Host "Line $($_.Token.StartLine) Column $($_.Token.StartColumn): $($_.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "No tokenization errors" -ForegroundColor Green
}

$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($content, [ref]$tokens, [ref]$parseErrors)

if ($parseErrors) {
    Write-Host "`nParse Errors:" -ForegroundColor Red
    $parseErrors | ForEach-Object {
        Write-Host "Line $($_.Extent.StartLineNumber) Column $($_.Extent.StartColumnNumber): $($_.Message)" -ForegroundColor Red
        Write-Host "  Error ID: $($_.ErrorId)" -ForegroundColor Yellow
    }
} else {
    Write-Host "`nNo parse errors - syntax is valid!" -ForegroundColor Green
}

