# Install-RequiredModules.ps1
# Automatically installs missing Citrix and VMware PowerShell modules/SDKs
# This script checks for required dependencies and installs them if missing
# Author : LAB007.AI
# Version: 1.1
# Last Modified: 260105:1835

param(
    [switch]$SkipCitrix = $false,
    [switch]$SkipVMware = $false,
    [switch]$Force = $false
)

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "LAB007 - Dependency Installation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Warning "Some installations may require Administrator privileges."
    Write-Warning "If installations fail, try running PowerShell as Administrator."
    Write-Host ""
}

# Function to check if a module is available
function Test-ModuleAvailable {
    param([string]$ModuleName)
    
    $module = Get-Module -ListAvailable -Name $ModuleName -ErrorAction SilentlyContinue
    if ($module) {
        return $true
    }
    
    $snapin = Get-PSSnapin -Registered -Name $ModuleName -ErrorAction SilentlyContinue
    if ($snapin) {
        return $true
    }
    
    return $false
}

# Function to check if a snap-in is registered
function Test-SnapinRegistered {
    param([string]$SnapinName)
    
    $snapin = Get-PSSnapin -Registered -Name $SnapinName -ErrorAction SilentlyContinue
    return ($snapin -ne $null)
}

# Install VMware PowerCLI
if (-not $SkipVMware) {
    Write-Host "[VMware] Checking VMware PowerCLI..." -ForegroundColor Yellow
    
    $vmwareInstalled = Test-ModuleAvailable -ModuleName "VMware.PowerCLI"
    
    if ($vmwareInstalled) {
        Write-Host "[VMware] VMware PowerCLI is already installed. Skipping installation." -ForegroundColor Green
    }
    else {
        Write-Host "[VMware] VMware PowerCLI not found. Checking for local installer files..." -ForegroundColor Yellow
        
        # Check for bundled VMware PowerCLI files
        $dependenciesPath = Join-Path $PSScriptRoot "..\Dependencies\VMware"
        if (Test-Path $dependenciesPath) {
            Write-Host "[VMware] Checking for bundled VMware PowerCLI files..." -ForegroundColor Yellow
            
            # Look for ZIP files (common format for VMware PowerCLI)
            $zipFiles = Get-ChildItem -Path $dependenciesPath -Filter "*.zip" -ErrorAction SilentlyContinue
            # Look for MSI installers
            $msiFiles = Get-ChildItem -Path $dependenciesPath -Filter "*.msi" -ErrorAction SilentlyContinue
            # Look for PowerShell module directories
            $moduleDirs = Get-ChildItem -Path $dependenciesPath -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*PowerCLI*" -or $_.Name -like "*VMware*" }
            
            $foundFiles = @()
            if ($zipFiles) { $foundFiles += $zipFiles }
            if ($msiFiles) { $foundFiles += $msiFiles }
            if ($moduleDirs) { $foundFiles += $moduleDirs }
            
            if ($foundFiles.Count -gt 0) {
                Write-Host "[VMware] Found $($foundFiles.Count) VMware PowerCLI file(s)" -ForegroundColor Green
                
                foreach ($file in $foundFiles) {
                    Write-Host "[VMware] Found: $($file.Name)" -ForegroundColor Gray
                    
                    # Check if already installed before processing
                    $shouldInstall = $false
                    if ($Force) {
                        $shouldInstall = $true
                    }
                    elseif ($file.Extension -eq ".zip") {
                        # Check if module directory already exists
                        $extractPath = Join-Path $env:USERPROFILE "Documents\WindowsPowerShell\Modules"
                        $moduleName = "VMware.PowerCLI"
                        $modulePath = Join-Path $extractPath $moduleName
                        if (-not (Test-Path $modulePath)) {
                            $shouldInstall = $true
                        }
                        else {
                            Write-Host "[VMware] Module already extracted at $modulePath. Skipping $($file.Name)" -ForegroundColor Gray
                        }
                    }
                    elseif ($file.Extension -eq ".msi") {
                        # For MSI, check if module is available
                        if (-not $vmwareInstalled) {
                            $shouldInstall = $true
                        }
                        else {
                            Write-Host "[VMware] VMware PowerCLI already installed. Skipping $($file.Name)" -ForegroundColor Gray
                        }
                    }
                    elseif ($file.PSIsContainer) {
                        # Check if module directory already exists at target
                        $targetPath = Join-Path $env:USERPROFILE "Documents\WindowsPowerShell\Modules\$($file.Name)"
                        if (-not (Test-Path $targetPath)) {
                            $shouldInstall = $true
                        }
                        else {
                            Write-Host "[VMware] Module directory already exists at $targetPath. Skipping $($file.Name)" -ForegroundColor Gray
                        }
                    }
                    
                    if ($shouldInstall) {
                        try {
                            if ($file.Extension -eq ".zip") {
                                Write-Host "[VMware] Extracting $($file.Name)..." -ForegroundColor Yellow
                                $extractPath = Join-Path $env:USERPROFILE "Documents\WindowsPowerShell\Modules"
                                if (-not (Test-Path $extractPath)) {
                                    New-Item -ItemType Directory -Path $extractPath -Force | Out-Null
                                }
                                
                                # Extract ZIP to modules directory
                                Add-Type -AssemblyName System.IO.Compression.FileSystem
                                [System.IO.Compression.ZipFile]::ExtractToDirectory($file.FullName, $extractPath)
                                Write-Host "[VMware] $($file.Name) extracted successfully!" -ForegroundColor Green
                            }
                            elseif ($file.Extension -eq ".msi") {
                                Write-Host "[VMware] Installing $($file.Name)..." -ForegroundColor Yellow
                                
                                if ($isAdmin) {
                                    $process = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$($file.FullName)`" /quiet /norestart" -Wait -PassThru -NoNewWindow
                                    
                                    if ($process.ExitCode -eq 0) {
                                        Write-Host "[VMware] $($file.Name) installed successfully!" -ForegroundColor Green
                                    }
                                    else {
                                        Write-Warning "[VMware] Installation returned exit code: $($process.ExitCode)"
                                    }
                                }
                                else {
                                    Write-Warning "[VMware] Administrator privileges required. Please run as Administrator or install manually."
                                    Write-Host "[VMware] Manual install command: msiexec.exe /i `"$($file.FullName)`" /quiet" -ForegroundColor Gray
                                }
                            }
                            elseif ($file.PSIsContainer) {
                                # It's a directory - copy to PowerShell modules directory
                                Write-Host "[VMware] Copying module directory $($file.Name)..." -ForegroundColor Yellow
                                $targetPath = Join-Path $env:USERPROFILE "Documents\WindowsPowerShell\Modules\$($file.Name)"
                                if (Test-Path $targetPath) {
                                    if ($Force) {
                                        Remove-Item -Path $targetPath -Recurse -Force -ErrorAction SilentlyContinue
                                    }
                                    else {
                                        Write-Host "[VMware] Target directory exists. Skipping (use -Force to overwrite)" -ForegroundColor Gray
                                        continue
                                    }
                                }
                                Copy-Item -Path $file.FullName -Destination $targetPath -Recurse -Force
                                Write-Host "[VMware] Module directory copied successfully!" -ForegroundColor Green
                            }
                        }
                        catch {
                            Write-Warning "[VMware] Failed to process $($file.Name): $_"
                        }
                    }
                }
            }
            else {
                Write-Host "[VMware] No installer files found in Dependencies\VMware folder" -ForegroundColor Gray
                Write-Host "[VMware] Place VMware PowerCLI files (ZIP, MSI, or module directory) in: $dependenciesPath" -ForegroundColor Yellow
            }
        }
        else {
            Write-Host "[VMware] Creating Dependencies\VMware folder..." -ForegroundColor Yellow
            New-Item -ItemType Directory -Path $dependenciesPath -Force | Out-Null
            Write-Host "[VMware] Place VMware PowerCLI files (ZIP, MSI, or module directory) in: $dependenciesPath" -ForegroundColor Gray
        }
    }
    Write-Host ""
}

# Install Citrix Modules/Snap-ins
if (-not $SkipCitrix) {
    Write-Host "[Citrix] Checking Citrix modules/snap-ins..." -ForegroundColor Yellow
    
    $requiredCitrixModules = @(
        "Citrix.Broker.Admin.V2",
        "Citrix.MachineCreation.Admin.V2",
        "Citrix.Monitor.ServiceProvider.V2"
    )
    
    $missingModules = @()
    $availableModules = @()
    
    foreach ($moduleName in $requiredCitrixModules) {
        $available = Test-ModuleAvailable -ModuleName $moduleName
        if ($available) {
            Write-Host "[Citrix] $moduleName is available" -ForegroundColor Green
            $availableModules += $moduleName
        }
        else {
            Write-Host "[Citrix] $moduleName is NOT available" -ForegroundColor Red
            $missingModules += $moduleName
        }
    }
    
    if ($missingModules.Count -gt 0) {
        Write-Host ""
        Write-Host "[Citrix] Missing modules: $($missingModules -join ', ')" -ForegroundColor Yellow
        Write-Host "[Citrix] Citrix PowerShell SDK must be installed manually." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Installation:" -ForegroundColor Cyan
        Write-Host "Place Citrix SDK MSI installer files in:" -ForegroundColor White
        Write-Host "   .\Dependencies\Citrix\" -ForegroundColor Gray
        Write-Host ""
        
        # Check for bundled Citrix installers
        $dependenciesPath = Join-Path $PSScriptRoot "..\Dependencies\Citrix"
        if (Test-Path $dependenciesPath) {
            Write-Host "[Citrix] Checking for bundled Citrix installers..." -ForegroundColor Yellow
            
            $installers = Get-ChildItem -Path $dependenciesPath -Filter "*.msi" -ErrorAction SilentlyContinue
            if ($installers) {
                Write-Host "[Citrix] Found $($installers.Count) installer file(s)" -ForegroundColor Green
                
                foreach ($installer in $installers) {
                    Write-Host "[Citrix] Found installer: $($installer.Name)" -ForegroundColor Gray
                    
                    # Check if modules are already available - only install if missing
                    # If -Force is specified, reinstall even if modules exist
                    $shouldInstall = $false
                    if ($Force) {
                        $shouldInstall = $true
                        Write-Host "[Citrix] Force flag set - will reinstall even if modules exist" -ForegroundColor Yellow
                    }
                    elseif ($missingModules.Count -gt 0) {
                        # Only install if we have missing modules
                        $shouldInstall = $true
                    }
                    else {
                        Write-Host "[Citrix] All required modules are already available. Skipping $($installer.Name)" -ForegroundColor Gray
                    }
                    
                    if ($shouldInstall) {
                        try {
                            Write-Host "[Citrix] Installing $($installer.Name)..." -ForegroundColor Yellow
                            
                            if ($isAdmin) {
                                $process = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$($installer.FullName)`" /quiet /norestart" -Wait -PassThru -NoNewWindow
                                
                                if ($process.ExitCode -eq 0) {
                                    Write-Host "[Citrix] $($installer.Name) installed successfully!" -ForegroundColor Green
                                }
                                else {
                                    Write-Warning "[Citrix] Installation returned exit code: $($process.ExitCode)"
                                }
                            }
                            else {
                                Write-Warning "[Citrix] Administrator privileges required. Please run as Administrator or install manually."
                                Write-Host "[Citrix] Manual install command: msiexec.exe /i `"$($installer.FullName)`" /quiet" -ForegroundColor Gray
                            }
                        }
                        catch {
                            Write-Warning "[Citrix] Failed to install $($installer.Name): $_"
                        }
                    }
                }
            }
            else {
                Write-Host "[Citrix] No installer files found in Dependencies\Citrix folder" -ForegroundColor Gray
            }
        }
        else {
            Write-Host "[Citrix] Creating Dependencies\Citrix folder for bundled installers..." -ForegroundColor Yellow
            New-Item -ItemType Directory -Path $dependenciesPath -Force | Out-Null
            Write-Host "[Citrix] Place Citrix SDK MSI installer files in: $dependenciesPath" -ForegroundColor Gray
        }
    }
    else {
        Write-Host "[Citrix] All required Citrix modules/snap-ins are available!" -ForegroundColor Green
    }
    Write-Host ""
}

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installation Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check VMware
if (-not $SkipVMware) {
    $vmwareInstalled = Test-ModuleAvailable -ModuleName "VMware.PowerCLI"
    if ($vmwareInstalled) {
        Write-Host "[VMware] VMware PowerCLI: Available" -ForegroundColor Green
    }
    else {
        Write-Host "[VMware] VMware PowerCLI: Not Available" -ForegroundColor Red
    }
}

# Check Citrix - list each module individually
if (-not $SkipCitrix) {
    Write-Host "[Citrix] Module Status:" -ForegroundColor Cyan
    $finalMissingModules = @()
    foreach ($moduleName in $requiredCitrixModules) {
        $available = Test-ModuleAvailable -ModuleName $moduleName
        if ($available) {
            Write-Host "  ✓ $moduleName : Available" -ForegroundColor Green
        }
        else {
            Write-Host "  ✗ $moduleName : Missing" -ForegroundColor Red
            $finalMissingModules += $moduleName
        }
    }
    
    Write-Host ""
    if ($finalMissingModules.Count -eq 0) {
        Write-Host "[Citrix] All required modules are available!" -ForegroundColor Green
    }
    else {
        Write-Host "[Citrix] Missing modules: $($finalMissingModules -join ', ')" -ForegroundColor Red
        Write-Host "[Citrix] Please install Citrix PowerShell SDK manually" -ForegroundColor Yellow
        Write-Host "[Citrix] Installation: Place Citrix SDK MSI installer files in .\Dependencies\Citrix\" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Note: After installing Citrix SDK, you may need to restart PowerShell." -ForegroundColor Gray
Write-Host ""

