# PowerShell script to sync LAB007-Main to GitHub
# Local files are MASTER - they overwrite remote
# Extra files on GitHub will be pulled locally first
# Usage: .\sync-to-github.ps1 [-ForceLocal]

param(
    [switch]$ForceLocal = $false,
    [string]$CommitMessage = ""
)

$ErrorActionPreference = "Continue"

# Get the script directory (should be the repo root)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = $scriptDir

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  GitHub Sync - Local is MASTER" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Change to repo root
Set-Location $repoRoot

# Check if this is a git repository
if (-not (Test-Path ".git")) {
    Write-Host "ERROR: Not a git repository. Please initialize git first." -ForegroundColor Red
    exit 1
}

# Get current branch
$currentBranch = git branch --show-current
if (-not $currentBranch) {
    $currentBranch = "master"
    Write-Host "No current branch found. Using: $currentBranch" -ForegroundColor Yellow
}

Write-Host "Repository: https://github.com/thomad99/LAB007-Main" -ForegroundColor Gray
Write-Host "Branch: $currentBranch" -ForegroundColor Gray
Write-Host ""

# Check if remote exists
$remoteExists = git remote get-url origin 2>$null
if (-not $remoteExists) {
    Write-Host "Setting up remote repository..." -ForegroundColor Yellow
    git remote add origin https://github.com/thomad99/LAB007-Main.git
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to add remote repository"
        exit 1
    }
}

# STEP 1: Pull from remote to get any extra files locally
Write-Host "Step 1: Pulling from remote (to get extra files locally)..." -ForegroundColor Yellow
git fetch origin
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to fetch from remote. Continuing..."
}

# Try to pull, but don't fail if there are conflicts
git pull origin $currentBranch --no-edit 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Pull had conflicts or issues. Local changes will take precedence." -ForegroundColor Yellow

    # If pull failed, reset to local state and continue
    git reset --hard HEAD
    Write-Host "Reset to local state." -ForegroundColor Gray
}

Write-Host "Pull completed." -ForegroundColor Green
Write-Host ""

# STEP 2: Check for local changes
Write-Host "Step 2: Checking for local changes..." -ForegroundColor Yellow
$status = git status --porcelain

if ([string]::IsNullOrWhiteSpace($status) -and -not $ForceLocal) {
    Write-Host "No changes to commit." -ForegroundColor Green

    # Check if we're ahead of remote
    $aheadBehind = git rev-list --count --left-right "origin/$currentBranch...HEAD" 2>$null
    if ($aheadBehind) {
        $aheadCount = ($aheadBehind -split '\s+')[1]
        if ($aheadCount -gt 0) {
            Write-Host "Local is ahead by $aheadCount commits. Pushing..." -ForegroundColor Yellow
            git push origin $currentBranch --force-with-lease
            if ($LASTEXITCODE -eq 0) {
                Write-Host "Successfully pushed local commits!" -ForegroundColor Green
            } else {
                Write-Host "ERROR: Failed to push commits" -ForegroundColor Red
                exit 1
            }
        } else {
            Write-Host "Everything is synchronized!" -ForegroundColor Green
        }
    } else {
        Write-Host "Everything is synchronized!" -ForegroundColor Green
    }
    exit 0
}

# Show what will be committed
Write-Host "Local changes detected:" -ForegroundColor Yellow
git status -s
Write-Host ""

# STEP 3: Stage all changes
Write-Host "Step 3: Staging all changes..." -ForegroundColor Yellow
git add -A
Write-Host "All changes staged." -ForegroundColor Green
Write-Host ""

# STEP 4: Create commit
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
if (-not $CommitMessage) {
    $CommitMessage = "Auto-sync: $timestamp"
}

Write-Host "Step 4: Creating commit..." -ForegroundColor Yellow
Write-Host "Commit message: $CommitMessage" -ForegroundColor Gray
git commit -m $CommitMessage

if ($LASTEXITCODE -ne 0) {
    # If commit failed, check if there are actually changes to commit
    $statusAfterAdd = git status --porcelain
    if ([string]::IsNullOrWhiteSpace($statusAfterAdd)) {
        Write-Host "No changes to commit after staging. Repository is up to date." -ForegroundColor Green
        exit 0
    } else {
        Write-Host "ERROR: Failed to create commit" -ForegroundColor Red
        git status
        exit 1
    }
}

Write-Host "Commit created successfully!" -ForegroundColor Green
Write-Host ""

# STEP 5: Force push to make local the master
Write-Host "Step 5: Force pushing local changes (local is master)..." -ForegroundColor Yellow
Write-Host "This will overwrite remote with local changes." -ForegroundColor Cyan

# Use force-with-lease for safety (won't overwrite if someone else pushed)
git push origin $currentBranch --force-with-lease

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "  SUCCESSFULLY SYNCED TO GITHUB!" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "Repository: https://github.com/thomad99/LAB007-Main" -ForegroundColor Cyan
    Write-Host "Branch: $currentBranch" -ForegroundColor Cyan
    Write-Host "Local files are now the master on GitHub!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "ERROR: Failed to push to GitHub" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Check your GitHub credentials" -ForegroundColor White
    Write-Host "  2. Ensure you have push access to the repository" -ForegroundColor White
    Write-Host "  3. Try running: git push origin $currentBranch --force" -ForegroundColor Gray
    Write-Host "  4. Check network connectivity" -ForegroundColor White
    exit 1
}

Write-Host ""
Write-Host "Note: Any extra files that were on GitHub have been pulled locally." -ForegroundColor Gray
Write-Host "Local repository is now the authoritative source." -ForegroundColor Gray
