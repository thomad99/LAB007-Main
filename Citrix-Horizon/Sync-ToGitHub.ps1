# Sync-ToGitHub.ps1
# Automates syncing local Citrix-Horizon code to GitHub
# Local files are MASTER - they overwrite remote
# Extra files on GitHub will be pulled locally first

param(
    [string]$CommitMessage = "",
    [switch]$ForceLocal = $false
)

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "GitHub Sync - Citrix to Horizon Tool" -ForegroundColor Cyan
Write-Host "Local files are MASTER" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get the script directory (project root)
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

# Check if git is initialized
if (-not (Test-Path ".git")) {
    Write-Host "Git repository not initialized. Initializing..." -ForegroundColor Yellow
    git init
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to initialize git repository"
        exit 1
    }
}

# Check if remote is configured
$remoteUrl = git remote get-url origin 2>$null
if (-not $remoteUrl) {
    Write-Host "GitHub remote not configured. Adding remote..." -ForegroundColor Yellow
    git remote add origin https://github.com/thomad99/CitrixtoHZ.git
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to add remote repository"
        exit 1
    }
    Write-Host "Remote added: https://github.com/thomad99/CitrixtoHZ.git" -ForegroundColor Green
}

Write-Host "Repository: https://github.com/thomad99/CitrixtoHZ" -ForegroundColor Gray
Write-Host ""

# Get current branch
$currentBranch = git branch --show-current
if (-not $currentBranch) {
    $currentBranch = "master"
    Write-Host "No current branch found. Using: $currentBranch" -ForegroundColor Yellow
}

# STEP 1: Pull from remote to get any extra files locally
Write-Host "Step 1: Pulling from remote (to get extra files locally)..." -ForegroundColor Yellow
git fetch origin 2>$null
git pull origin $currentBranch --no-edit 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Pull completed with notes (local changes take precedence)." -ForegroundColor Yellow
    # Reset any conflicts to local state
    git reset --hard HEAD 2>$null
} else {
    Write-Host "Pull completed successfully." -ForegroundColor Green
}
Write-Host ""

# STEP 2: Check for local changes
Write-Host "Step 2: Checking for local changes..." -ForegroundColor Yellow
$status = git status --porcelain

if (-not $status -and -not $ForceLocal) {
    Write-Host "No changes to commit." -ForegroundColor Green

    # Check if we're ahead of remote
    $aheadBehind = git rev-list --count --left-right "origin/$currentBranch...HEAD" 2>$null
    if ($aheadBehind) {
        $aheadCount = ($aheadBehind -split '\s+')[1]
        if ($aheadCount -gt 0) {
            Write-Host "Local is ahead by $aheadCount commits. Force pushing..." -ForegroundColor Yellow
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
Write-Host "Step 3: Staging changes..." -ForegroundColor Yellow
git add .
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to stage changes"
    exit 1
}
Write-Host "Changes staged successfully" -ForegroundColor Green
Write-Host ""

# STEP 4: Get commit message
if (-not $CommitMessage) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $CommitMessage = "Auto-sync: $timestamp"
}

# STEP 5: Commit changes
Write-Host "Step 4: Committing changes..." -ForegroundColor Yellow
Write-Host "Commit message: $CommitMessage" -ForegroundColor Gray
git commit -m $CommitMessage
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Commit failed or nothing to commit"
    # Check if there's actually something to commit
    $status = git status --porcelain
    if (-not $status) {
        Write-Host "No changes to commit. Repository is up to date." -ForegroundColor Green
        exit 0
    }
    else {
        Write-Error "Commit failed. Please check the error above."
        exit 1
    }
}
Write-Host "Changes committed successfully" -ForegroundColor Green
Write-Host ""

# STEP 6: Force push to make local the master
Write-Host "Step 5: Force pushing to GitHub (local is master)..." -ForegroundColor Yellow
Write-Host "Branch: $currentBranch" -ForegroundColor Gray

# Use force-with-lease for safety (prevents overwriting if someone else pushed)
git push origin $currentBranch --force-with-lease

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Successfully synced to GitHub!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Repository: https://github.com/thomad99/CitrixtoHZ" -ForegroundColor Cyan
    Write-Host "Branch: $currentBranch" -ForegroundColor Cyan
    Write-Host "Local files are now the master on GitHub!" -ForegroundColor Green
}
else {
    Write-Error "Failed to push to GitHub."
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Ensure you have push access to the repository" -ForegroundColor White
    Write-Host "  2. Check your Git credentials (git config --global user.name and user.email)" -ForegroundColor White
    Write-Host "  3. You may need to authenticate with GitHub (Personal Access Token)" -ForegroundColor White
    Write-Host "  4. Try manual force push: git push origin $currentBranch --force" -ForegroundColor Gray
    Write-Host "  5. Check network connectivity" -ForegroundColor White
    exit 1
}

Write-Host ""
Write-Host "Note: Any extra files from GitHub have been pulled locally." -ForegroundColor Gray
Write-Host "Your local repository is now the authoritative source." -ForegroundColor Gray

