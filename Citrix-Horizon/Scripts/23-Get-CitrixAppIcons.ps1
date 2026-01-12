# 23-Get-CitrixAppIcons.ps1
# Extracts and exports application icons from Citrix
# Author : LAB007.AI
# Version: 1.0
# Last Modified: 250127

param(
    [string]$OutputPath = ".\Data\citrix-app-icons.json",
    [string]$IconsZipPath = ".\Data\citrix-app-icons.zip",
    [string]$CitrixVersion = "1912"
)

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# Create temporary directory for icons
$tempIconsDir = Join-Path $outputDir "TempIcons"
if (-not (Test-Path -Path $tempIconsDir)) {
    New-Item -ItemType Directory -Path $tempIconsDir -Force | Out-Null
}

# Setup debug logging
$debugFile = Join-Path $outputDir "debug23.txt"

# Force delete existing debug file to ensure clean start
if (Test-Path $debugFile) {
    try {
        Remove-Item $debugFile -Force -ErrorAction Stop
    } catch {
        Write-Warning "Could not delete existing debug file $debugFile : $_"
    }
}

try {
    Write-Host "[DEBUG] Script started at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $debugFile -Append

    # Get all published applications
    $maxRecords = 10000
    if ($global:CitrixAdminAddress) {
        $apps = Get-BrokerApplication -AdminAddress $global:CitrixAdminAddress -MaxRecordCount $maxRecords -ErrorAction Stop
    }
    else {
        $apps = Get-BrokerApplication -MaxRecordCount $maxRecords -ErrorAction Stop
    }

    Write-Host "Found $($apps.Count) published applications" -ForegroundColor Green
    Write-Host "[DEBUG] Found $($apps.Count) applications" | Out-File -FilePath $debugFile -Append

    $iconIndex = @()
    $totalIcons = 0
    $exportedIcons = 0

    foreach ($app in $apps) {
        Write-Host "Processing: $($app.Name)..." -ForegroundColor Cyan
        Write-Host "[DEBUG] Processing application: $($app.Name)" | Out-File -FilePath $debugFile -Append

        try {
            # Get application icon
            if ($global:CitrixAdminAddress) {
                $icon = Get-BrokerIcon -AdminAddress $global:CitrixAdminAddress -ApplicationUid $app.Uid -ErrorAction SilentlyContinue
            }
            else {
                $icon = Get-BrokerIcon -ApplicationUid $app.Uid -ErrorAction SilentlyContinue
            }

            if ($icon) {
                $totalIcons++

                # Create a safe filename from the application name
                $safeName = $app.Name -replace '[^\w\.-]', '_'
                $iconFileName = "$safeName.ico"
                $iconPath = Join-Path $tempIconsDir $iconFileName

                # Export the icon data to temporary file
                try {
                    $icon.RawData | Set-Content -Path $iconPath -Encoding Byte -ErrorAction Stop
                    $exportedIcons++

                    Write-Host "  ✓ Exported icon: $iconFileName" -ForegroundColor Green

                    # Add to index
                    $iconInfo = @{
                        ApplicationName = $app.Name
                        ApplicationUid = $app.Uid
                        IconFileName = $iconFileName
                        IconSize = $icon.RawData.Length
                        ExportedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
                    }
                    $iconIndex += $iconInfo

                }
                catch {
                    Write-Warning "Failed to export icon for $($app.Name): $_"
                    Write-Host "[DEBUG] Failed to export icon for $($app.Name): $_" | Out-File -FilePath $debugFile -Append
                }
            }
            else {
                Write-Host "  ⚠ No icon found for: $($app.Name)" -ForegroundColor Yellow
                Write-Host "[DEBUG] No icon found for application: $($app.Name)" | Out-File -FilePath $debugFile -Append
            }
        }
        catch {
            Write-Warning "Error processing icon for $($app.Name): $_"
            Write-Host "[DEBUG] Error processing icon for $($app.Name): $_" | Out-File -FilePath $debugFile -Append
        }
    }

    # Create ZIP file with all icons
    $zipCreated = $false
    if ($exportedIcons -gt 0) {
        Write-Host "Creating ZIP file with exported icons..." -ForegroundColor Yellow

        try {
            # Remove existing ZIP if it exists
            if (Test-Path $IconsZipPath) {
                Remove-Item $IconsZipPath -Force -ErrorAction SilentlyContinue
            }

            # Get all icon files
            $iconFiles = Get-ChildItem -Path $tempIconsDir -Filter "*.ico" -ErrorAction SilentlyContinue

            if ($iconFiles -and $iconFiles.Count -gt 0) {
                # Create ZIP using .NET compression
                $zip = [System.IO.Compression.ZipFile]::Open($IconsZipPath, [System.IO.Compression.ZipArchiveMode]::Create)

                foreach ($iconFile in $iconFiles) {
                    try {
                        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $iconFile.FullName, $iconFile.Name) | Out-Null
                        Write-Host "  Added to ZIP: $($iconFile.Name)" -ForegroundColor Gray
                    }
                    catch {
                        Write-Warning "Failed to add $($iconFile.Name) to ZIP: $_"
                    }
                }

                $zip.Dispose()
                $zipCreated = $true
                Write-Host "ZIP file created successfully: $IconsZipPath ($($iconFiles.Count) icons)" -ForegroundColor Green
            }
            else {
                Write-Warning "No icon files found to add to ZIP"
            }
        }
        catch {
            Write-Warning "Failed to create ZIP file: $_"

            # Fallback: Use Compress-Archive (PowerShell 5.0+)
            try {
                $iconFiles = Get-ChildItem -Path $tempIconsDir -Filter "*.ico" -ErrorAction SilentlyContinue
                if ($iconFiles) {
                    Compress-Archive -Path $iconFiles.FullName -DestinationPath $IconsZipPath -Force -ErrorAction Stop
                    $zipCreated = $true
                    Write-Host "ZIP file created using Compress-Archive: $IconsZipPath ($($iconFiles.Count) icons)" -ForegroundColor Green
                }
            }
            catch {
                Write-Warning "Failed to create ZIP using Compress-Archive: $_"
            }
        }

        # Clean up temporary directory
        try {
            if (Test-Path $tempIconsDir) {
                Remove-Item $tempIconsDir -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
        catch {
            Write-Warning "Failed to clean up temporary directory: $_"
        }
    }

    # Create result object
    $result = @{
        TotalApplications = $apps.Count
        TotalIconsFound = $totalIcons
        IconsExported = $exportedIcons
        IconsZipPath = $IconsZipPath
        ZipCreated = $zipCreated
        ExportedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        CitrixVersion = $CitrixVersion
        IconIndex = $iconIndex
    }

    # Convert to JSON and save
    $jsonContent = $result | ConvertTo-Json -Depth 10
    $jsonContent | Out-File -FilePath $OutputPath -Encoding UTF8 -Force

    Write-Host ''
    Write-Host 'Citrix application icons export completed successfully!' -ForegroundColor Green
    Write-Host "Total applications processed: $($apps.Count)" -ForegroundColor White
    Write-Host "Icons found: $totalIcons" -ForegroundColor White
    Write-Host "Icons exported: $exportedIcons" -ForegroundColor Green
    if ($zipCreated) {
        Write-Host "Icons ZIP saved to: $IconsZipPath" -ForegroundColor Green
    } else {
        Write-Host "Warning: ZIP file creation failed" -ForegroundColor Yellow
    }
    Write-Host "Index saved to: $OutputPath" -ForegroundColor Gray

    Write-Host "[DEBUG] Export completed successfully at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] Total icons found: $totalIcons, exported: $exportedIcons" | Out-File -FilePath $debugFile -Append

    # Return result for calling script
    return $result

}
catch {
    Write-Error "Failed to export Citrix application icons: $_"
    Write-Host "[DEBUG] Script failed: $_" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] Stack trace: $($_.ScriptStackTrace)" | Out-File -FilePath $debugFile -Append
    throw
}