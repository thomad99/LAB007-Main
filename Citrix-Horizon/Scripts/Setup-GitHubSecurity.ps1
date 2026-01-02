# Setup-GitHubSecurity.ps1
# Helper script to set up secure GitHub authentication
# Version: 1.0
# Last Modified: 2025-01-27

param(
    [switch]$UseSSH = $false,
    [switch]$UsePAT = $false,
    [string]$GitHubUsername = "thomad99",
    [string]$Repository = "CitrixtoHZ"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "GitHub Security Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

# Check if git is installed
try {
    $gitVersion = git --version
    Write-Host "Git found: $gitVersion" -ForegroundColor Green
} catch {
    Write-Error "Git is not installed. Please install Git first."
    exit 1
}

# Configure Git user (if not already set)
$gitUserName = git config --global user.name
$gitUserEmail = git config --global user.email

if (-not $gitUserName) {
    Write-Host "Git user name not configured." -ForegroundColor Yellow
    $name = Read-Host "Enter your Git user name"
    git config --global user.name $name
    Write-Host "Git user name configured" -ForegroundColor Green
}

if (-not $gitUserEmail) {
    Write-Host "Git user email not configured." -ForegroundColor Yellow
    $email = Read-Host "Enter your Git email"
    git config --global user.email $email
    Write-Host "Git user email configured" -ForegroundColor Green
}

Write-Host ""
Write-Host "Choose authentication method:" -ForegroundColor Cyan
Write-Host "  1. SSH (Recommended - Most Secure)" -ForegroundColor White
Write-Host "  2. Personal Access Token (PAT)" -ForegroundColor White
Write-Host "  3. Windows Credential Manager (HTTPS)" -ForegroundColor White
Write-Host ""

if (-not $UseSSH -and -not $UsePAT) {
    $choice = Read-Host "Enter choice (1-3)"
} elseif ($UseSSH) {
    $choice = "1"
} elseif ($UsePAT) {
    $choice = "2"
} else {
    $choice = "3"
}

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "Setting up SSH authentication..." -ForegroundColor Yellow
        
        # Check if SSH key exists
        $sshKeyPath = "$env:USERPROFILE\.ssh\id_rsa"
        $sshKeyPathEd25519 = "$env:USERPROFILE\.ssh\id_ed25519"
        
        if (-not (Test-Path $sshKeyPath) -and -not (Test-Path $sshKeyPathEd25519)) {
            Write-Host "No SSH key found. Generating new SSH key..." -ForegroundColor Yellow
            $keyType = Read-Host "Key type (ed25519 recommended, or rsa) [ed25519]"
            if (-not $keyType) { $keyType = "ed25519" }
            
            $email = git config --global user.email
            ssh-keygen -t $keyType -C $email -f "$env:USERPROFILE\.ssh\id_$keyType" -N '""'
            
            Write-Host ""
            Write-Host "SSH key generated!" -ForegroundColor Green
            Write-Host "Add this public key to your GitHub account:" -ForegroundColor Yellow
            Write-Host ""
            Get-Content "$env:USERPROFILE\.ssh\id_$keyType.pub"
            Write-Host ""
            Write-Host "1. Go to: https://github.com/settings/keys" -ForegroundColor Cyan
            Write-Host "2. Click 'New SSH key'" -ForegroundColor Cyan
            Write-Host "3. Paste the key above and save" -ForegroundColor Cyan
            Write-Host ""
            Read-Host "Press Enter after adding the key to GitHub"
        } else {
            Write-Host "SSH key found. Displaying public key:" -ForegroundColor Green
            if (Test-Path $sshKeyPathEd25519) {
                Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub"
            } else {
                Get-Content "$env:USERPROFILE\.ssh\id_rsa.pub"
            }
        }
        
        # Update remote to use SSH
        $sshUrl = "git@github.com:$GitHubUsername/$Repository.git"
        git remote set-url origin $sshUrl
        Write-Host "Remote updated to use SSH: $sshUrl" -ForegroundColor Green
        
        # Test SSH connection
        Write-Host ""
        Write-Host "Testing SSH connection..." -ForegroundColor Yellow
        ssh -T git@github.com 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 1) {
            Write-Host "SSH connection successful!" -ForegroundColor Green
        } else {
            Write-Warning "SSH connection test failed. Please verify your SSH key is added to GitHub."
        }
    }
    
    "2" {
        Write-Host ""
        Write-Host "Setting up Personal Access Token (PAT) authentication..." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "To create a Personal Access Token:" -ForegroundColor Cyan
        Write-Host "  1. Go to: https://github.com/settings/tokens" -ForegroundColor White
        Write-Host "  2. Click 'Generate new token' -> 'Generate new token (classic)'" -ForegroundColor White
        Write-Host "  3. Give it a name (e.g., 'Citrix Audit Tool')" -ForegroundColor White
        Write-Host "  4. Select scopes: 'repo' (full control of private repositories)" -ForegroundColor White
        Write-Host "  5. Click 'Generate token'" -ForegroundColor White
        Write-Host "  6. Copy the token (you won't see it again!)" -ForegroundColor White
        Write-Host ""
        
        $pat = Read-Host "Enter your Personal Access Token" -AsSecureString
        $patPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pat)
        )
        
        # Store PAT in environment variable (session only)
        $env:GITHUB_TOKEN = $patPlain
        Write-Host ""
        Write-Host "PAT stored in environment variable (GITHUB_TOKEN) for this session." -ForegroundColor Green
        Write-Host "To make it permanent, add it to your system environment variables." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Or use it directly: .\Sync-ToGitHub.ps1 -GitHubPAT 'your-token'" -ForegroundColor Cyan
        
        # Update remote URL to include PAT
        $httpsUrl = "https://github.com/$GitHubUsername/$Repository.git"
        $patUrl = "https://$patPlain@github.com/$GitHubUsername/$Repository.git"
        git remote set-url origin $patUrl
        Write-Host "Remote updated to use PAT authentication" -ForegroundColor Green
    }
    
    "3" {
        Write-Host ""
        Write-Host "Using Windows Credential Manager (HTTPS)..." -ForegroundColor Yellow
        Write-Host "Git will prompt for credentials on first push and store them securely." -ForegroundColor Cyan
        Write-Host ""
        
        $httpsUrl = "https://github.com/$GitHubUsername/$Repository.git"
        git remote set-url origin $httpsUrl
        Write-Host "Remote set to: $httpsUrl" -ForegroundColor Green
        Write-Host ""
        Write-Host "Note: For better security, consider using SSH or PAT instead." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Security setup complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "You can now use: .\Sync-ToGitHub.ps1" -ForegroundColor Cyan
Write-Host ""

