# Sync-ToGitHub.ps1
# Automates syncing local code to GitHub repository with enhanced security
# Author : LAB007.AI
# Version: 1.0
# Last Modified: 250127

param(
    [string]$CommitMessage = "",
    [switch]$Force = $false,
    [switch]$DryRun = $false,
    [switch]$UseSSH = $false,
    [string]$GitHubPAT = "",
    [string]$Branch = ""
)

$ErrorActionPreference = "Continue"

# Security: Sensitive files that should never be committed
$SensitivePatterns = @(
    "*.key",
    "*.pem",
    "*.pfx",
    "*password*.txt",
    "*secret*.json",
    "*credential*.json",
    "*token*.txt",
    "lab007-config.json",
    "Data\*.json",
    "Data\*.zip",
    "Data\debug.txt"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "GitHub Sync - Citrix to Horizon Tool" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get the script directory (project root)
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

# Function to check if file matches sensitive patterns
function Test-SensitiveFile {
    param([string]$FilePath)
    
    $relativePath = $FilePath.Replace($projectRoot, "").TrimStart('\', '/')
    
    foreach ($pattern in $SensitivePatterns) {
        if ($relativePath -like $pattern) {
            return $true
        }
    }
    return $false
}

# Function to validate credentials are secure
function Test-GitCredentials {
    Write-Host "Validating Git credentials..." -ForegroundColor Yellow
    
    # Check if using SSH
    $remoteUrl = git remote get-url origin 2>$null
    if ($remoteUrl -and $remoteUrl -like "git@*") {
        Write-Host "Using SSH authentication (secure)" -ForegroundColor Green
        return $true
    }
    
    # Check for PAT in environment or credential manager
    if ($GitHubPAT) {
        Write-Host "Using Personal Access Token (secure)" -ForegroundColor Green
        return $true
    }
    
    # Check Windows Credential Manager
    try {
        $cred = cmdkey /list 2>$null | Select-String "git:https://github.com"
        if ($cred) {
            Write-Host "Using Windows Credential Manager (secure)" -ForegroundColor Green
            return $true
        }
    } catch {
        # Credential manager check failed, continue
    }
    
    # Check for GIT_ASKPASS or credential helper
    $askpass = $env:GIT_ASKPASS
    $credHelper = git config --global credential.helper 2>$null
    
    if ($askpass -or $credHelper) {
        Write-Host "Using credential helper (secure)" -ForegroundColor Green
        return $true
    }
    
    Write-Warning "No secure credential method detected. Consider using:"
    Write-Host "  1. SSH keys: Set up SSH and use 'git remote set-url origin git@github.com:user/repo.git'" -ForegroundColor Yellow
    Write-Host "  2. Personal Access Token: Use -GitHubPAT parameter or set GITHUB_TOKEN environment variable" -ForegroundColor Yellow
    Write-Host "  3. Windows Credential Manager: Git will prompt and store credentials securely" -ForegroundColor Yellow
    
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        return $false
    }
    
    return $true
}

# Function to set up PAT authentication
function Set-PATAuthentication {
    param([string]$PAT)
    
    if (-not $PAT) {
        $PAT = $env:GITHUB_TOKEN
    }
    
    if (-not $PAT) {
        Write-Host "GitHub Personal Access Token not provided." -ForegroundColor Yellow
        Write-Host "You can:" -ForegroundColor Yellow
        Write-Host "  1. Set GITHUB_TOKEN environment variable" -ForegroundColor White
        Write-Host "  2. Use -GitHubPAT parameter" -ForegroundColor White
        Write-Host "  3. Use SSH authentication (recommended)" -ForegroundColor White
        return $false
    }
    
    $remoteUrl = git remote get-url origin 2>$null
    if ($remoteUrl -and $remoteUrl -like "https://*") {
        # Update remote URL to include PAT
        $newUrl = $remoteUrl -replace "https://", "https://$PAT@"
        git remote set-url origin $newUrl
        Write-Host "PAT authentication configured (URL updated)" -ForegroundColor Green
        return $true
    }
    
    return $false
}

# Check if git is initialized
if (-not (Test-Path ".git")) {
    Write-Host "Git repository not initialized. Initializing..." -ForegroundColor Yellow
    git init
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to initialize git repository"
        exit 1
    }
}

# Configure remote
$remoteUrl = git remote get-url origin 2>$null
if (-not $remoteUrl) {
    Write-Host "GitHub remote not configured. Adding remote..." -ForegroundColor Yellow
    
    if ($UseSSH) {
        $repoUrl = "git@github.com:thomad99/CitrixtoHZ.git"
    } else {
        $repoUrl = "https://github.com/thomad99/CitrixtoHZ.git"
    }
    
    git remote add origin $repoUrl
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to add remote repository"
        exit 1
    }
    Write-Host "Remote added: $repoUrl" -ForegroundColor Green
    $remoteUrl = $repoUrl
}

# Switch to SSH if requested
if ($UseSSH -and $remoteUrl -like "https://*") {
    Write-Host "Switching to SSH authentication..." -ForegroundColor Yellow
    $sshUrl = $remoteUrl -replace "https://github.com/", "git@github.com:" -replace "\.git$", ".git"
    git remote set-url origin $sshUrl
    $remoteUrl = $sshUrl
    Write-Host "Remote updated to: $sshUrl" -ForegroundColor Green
}

Write-Host "Current remote: $remoteUrl" -ForegroundColor Gray
Write-Host ""

# Validate credentials
if (-not (Test-GitCredentials)) {
    Write-Error "Credential validation failed. Aborting for security."
    exit 1
}

# Set up PAT if provided
if ($GitHubPAT -or $env:GITHUB_TOKEN) {
    Set-PATAuthentication -PAT $GitHubPAT | Out-Null
}

# Check git status
Write-Host "Checking for changes..." -ForegroundColor Yellow
$status = git status --porcelain
if (-not $status -and -not $Force) {
    Write-Host "No changes to commit. Repository is up to date." -ForegroundColor Green
    exit 0
}

# Security: Check for sensitive files before staging
Write-Host "Scanning for sensitive files..." -ForegroundColor Yellow
$changedFiles = git status --porcelain | ForEach-Object {
    $_.Trim() -split '\s+' | Select-Object -Last 1
}

$sensitiveFiles = @()
foreach ($file in $changedFiles) {
    if (Test-SensitiveFile -FilePath (Join-Path $projectRoot $file)) {
        $sensitiveFiles += $file
    }
}

if ($sensitiveFiles.Count -gt 0) {
    Write-Warning "SECURITY WARNING: The following sensitive files were detected:"
    foreach ($file in $sensitiveFiles) {
        Write-Host "  - $file" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "These files should NOT be committed to GitHub!" -ForegroundColor Red
    Write-Host "Please ensure they are in .gitignore" -ForegroundColor Yellow
    
    $continue = Read-Host "Continue anyway? (NOT RECOMMENDED) (y/N)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        Write-Host "Aborted for security." -ForegroundColor Yellow
        exit 1
    }
}

# Show what will be committed
Write-Host "Files to be committed:" -ForegroundColor Cyan
git status --short
Write-Host ""

# Get commit message
if (-not $CommitMessage) {
    $CommitMessage = Read-Host "Enter commit message (or press Enter for auto-generated message)"
    if (-not $CommitMessage) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $CommitMessage = "Auto-sync: $timestamp"
    }
}

# Validate commit message (basic security check)
if ($CommitMessage -match "(?i)(password|secret|token|key|credential)") {
    Write-Warning "Commit message contains potentially sensitive words. Please use a generic message."
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        Write-Host "Aborted." -ForegroundColor Yellow
        exit 1
    }
}

# Dry run mode
if ($DryRun) {
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "DRY RUN MODE - No changes will be made" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Would commit with message: $CommitMessage" -ForegroundColor Cyan
    Write-Host "Would push to: $remoteUrl" -ForegroundColor Cyan
    exit 0
}

# Add all changes (respecting .gitignore)
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

# Use specified branch if provided
if ($Branch) {
    if ($currentBranch -ne $Branch) {
        Write-Host "Switching to branch: $Branch" -ForegroundColor Yellow
        git checkout $Branch 2>$null
        if ($LASTEXITCODE -ne 0) {
            git checkout -b $Branch
        }
        $currentBranch = $Branch
    }
}

# Push to GitHub
Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
Write-Host "Branch: $currentBranch" -ForegroundColor Gray

# Check if upstream is set
$upstream = git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null
if (-not $upstream) {
    Write-Host "Setting upstream branch..." -ForegroundColor Gray
    git push -u origin $currentBranch
}
else {
    git push
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Successfully synced to GitHub!" -ForegroundColor Green
    Write-Host "Repository: https://github.com/thomad99/CitrixtoHZ" -ForegroundColor Cyan
    Write-Host "Branch: $currentBranch" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Green
}
else {
    Write-Error "Failed to push to GitHub. Please check your credentials and network connection."
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Ensure you have push access to the repository" -ForegroundColor White
    Write-Host "  2. Check your Git credentials (git config --global user.name and user.email)" -ForegroundColor White
    Write-Host "  3. Use SSH authentication: .\Sync-ToGitHub.ps1 -UseSSH" -ForegroundColor White
    Write-Host "  4. Use Personal Access Token: .\Sync-ToGitHub.ps1 -GitHubPAT 'your-token'" -ForegroundColor White
    Write-Host "  5. Set GITHUB_TOKEN environment variable for automatic PAT usage" -ForegroundColor White
    Write-Host "  6. If the repository has existing commits, you may need to pull first:" -ForegroundColor White
    Write-Host "     git pull origin $currentBranch --allow-unrelated-histories" -ForegroundColor Gray
    exit 1
}

Write-Host ""

