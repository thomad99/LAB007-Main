# PowerShell script to sync LAB007-Main (single repository) to GitHub
# Usage: .\sync-to-github.ps1

$ErrorActionPreference = "Stop"

# Get the script directory (should be the repo root)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = $scriptDir

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Syncing LAB007-Main to GitHub" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Change to repo root
Set-Location $repoRoot

# Check if this is a git repository
if (-not (Test-Path ".git")) {
    Write-Host "ERROR: Not a git repository. Please initialize git first." -ForegroundColor Red
    exit 1
}

Write-Host "Checking git status..." -ForegroundColor Yellow
$status = git status --porcelain

if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "No changes to commit." -ForegroundColor Green
    Write-Host ""
    
    # Check if we're ahead of remote
    $branchStatus = git status -sb
    if ($branchStatus -match "ahead") {
        Write-Host "Local branch is ahead of remote. Pushing changes..." -ForegroundColor Yellow
        git push
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Successfully pushed to remote!" -ForegroundColor Green
        } else {
            Write-Host "ERROR: Failed to push to remote" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "Everything is up to date!" -ForegroundColor Green
    }
    exit 0
}

# Show what will be committed
Write-Host "Changes detected:" -ForegroundColor Yellow
git status -s
Write-Host ""

# Stage all changes
Write-Host "Staging all changes..." -ForegroundColor Yellow
git add -A

# Create commit with timestamp
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$commitMessage = "Auto-sync: $timestamp"

Write-Host "Creating commit..." -ForegroundColor Yellow
git commit -m $commitMessage

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to create commit" -ForegroundColor Red
    exit 1
}

Write-Host "Commit created successfully!" -ForegroundColor Green
Write-Host ""

# Push to remote
Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
git push

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "  Successfully synced to GitHub!" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "Repository: https://github.com/thomad99/LAB007-Main" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "ERROR: Failed to push to GitHub" -ForegroundColor Red
    Write-Host "You may need to pull changes first or check your git credentials" -ForegroundColor Yellow
    exit 1
}
