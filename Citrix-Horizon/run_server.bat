@echo off
echo Starting LAB007 Citrix Configuration Server...
echo.
echo This server allows you to use config.html locally and save configurations
echo to LAB007-Config.JSON for use with PowerShell scripts.
echo.
echo Server will be available at: http://localhost:8000
echo Open config.html at: http://localhost:8000/config.html
echo.
echo Press Ctrl+C to stop the server
echo.
python simple_server.py
pause