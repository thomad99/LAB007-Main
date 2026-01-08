# LAB007 Citrix Configuration Server
Write-Host "Starting LAB007 Citrix Configuration Server..." -ForegroundColor Green
Write-Host ""
Write-Host "This server allows you to use config.html locally and save configurations" -ForegroundColor Yellow
Write-Host "to LAB007-Config.JSON for use with PowerShell scripts." -ForegroundColor Yellow
Write-Host ""
Write-Host "Server will be available at: http://localhost:8000" -ForegroundColor Cyan
Write-Host "Open config.html at: http://localhost:8000/config.html" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Red
Write-Host ""

try {
    python simple_server.py
} catch {
    Write-Host "Error running server: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
}