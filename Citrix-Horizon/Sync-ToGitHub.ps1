# Sync-ToGitHub.ps1
# Automates syncing local code to GitHub repository

param(
    [string]$CommitMessage = "",
    [switch]$Force = $false
)

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "GitHub Sync - Citrix to Horizon Tool" -ForegroundColor Cyan
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

Write-Host "Current remote: $remoteUrl" -ForegroundColor Gray
Write-Host ""

# Strict local-over-remote: NO pull, local always wins
# Check git status (no pull)
Write-Host "Checking for changes (no pull)..." -ForegroundColor Yellow
$status = git status --porcelain
if (-not $status -and -not $Force) {
    Write-Host "No changes to commit. Repository is up to date." -ForegroundColor Green
    exit 0
}

# Show what will be committed
Write-Host "Files to be committed:" -ForegroundColor Cyan
git status --short
Write-Host ""

# Get commit message (auto-generate if not provided)
if (-not $CommitMessage) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $CommitMessage = "Auto-sync: $timestamp"
}

# Add all changes
Write-Host "Staging changes..." -ForegroundColor Yellow
git add .
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to stage changes"
    exit 1
}
Write-Host "Changes staged successfully" -ForegroundColor Green
Write-Host ""

# Commit changes
Write-Host "Committing changes..." -ForegroundColor Yellow
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

# Check current branch
$currentBranch = git branch --show-current
if (-not $currentBranch) {
    # If no branch exists, create master branch
    git checkout -b master
    $currentBranch = "master"
}

# Push to GitHub (local is master)
Write-Host "Pushing to GitHub (force-with-lease, local is master)..." -ForegroundColor Yellow
Write-Host "Branch: $currentBranch" -ForegroundColor Gray
git push origin $currentBranch --force-with-lease

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Successfully synced to GitHub!" -ForegroundColor Green
    Write-Host "Repository: https://github.com/thomad99/CitrixtoHZ" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Green
}
else {
    Write-Error "Failed to push to GitHub. Please check your credentials and network connection."
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Ensure you have push access to the repository" -ForegroundColor White
    Write-Host "  2. Check your Git credentials (git config --global user.name and user.email)" -ForegroundColor White
    Write-Host "  3. You may need to authenticate with GitHub (Personal Access Token)" -ForegroundColor White
    Write-Host "  4. If the repository has existing commits, you may need to pull first:" -ForegroundColor White
    Write-Host "     git pull origin $currentBranch --allow-unrelated-histories" -ForegroundColor Gray
    exit 1
}

Write-Host ""

