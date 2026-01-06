# Test-ODataConnection.ps1
# Quick test script to verify Director OData connectivity
# Usage: .\Test-ODataConnection.ps1 -DirectorServer localhost
# Author : LAB007.AI

param(
    [string]$DirectorServer = "localhost",
    [switch]$UseHTTPS = $true,
    [int]$Port = 443,
    [switch]$SkipSSLValidation = $false
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Director OData Connection Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Handle SSL certificate validation
if ($SkipSSLValidation) {
    Write-Host "SSL certificate validation is DISABLED" -ForegroundColor Yellow
    if (-not ([System.Management.Automation.PSTypeName]'TrustAllCertsPolicy').Type) {
        Add-Type @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class TrustAllCertsPolicy : ICertificatePolicy {
    public bool CheckValidationResult(
        ServicePoint srvPoint, X509Certificate certificate,
        WebRequest request, int certificateProblem) {
        return true;
    }
}
"@
    }
    [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls11 -bor [System.Net.SecurityProtocolType]::Tls
    Write-Host ""
}

# Test 1: Check if server is reachable
Write-Host "[1/4] Testing basic connectivity to $DirectorServer`:$Port..." -ForegroundColor Yellow
try {
    $protocol = if ($UseHTTPS) { "https" } else { "http" }
    $testUrl = "${protocol}://${DirectorServer}:${Port}"
    $response = Invoke-WebRequest -Uri $testUrl -Method Get -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "  ✓ Server is reachable (Status: $($response.StatusCode))" -ForegroundColor Green
}
catch {
    Write-Host "  ✗ Server connection failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Note: This might be normal if the server requires authentication" -ForegroundColor Gray
}

Write-Host ""

# Test 2: Try to access OData metadata endpoint
Write-Host "[2/4] Testing OData metadata endpoint..." -ForegroundColor Yellow

$odataPaths = @(
    "/Citrix/Monitor/OData/v3/Data",
    "/Citrix/Monitor/OData/v2/Data",
    "/Director/OData/v3/Data"
)

$workingPath = $null
foreach ($path in $odataPaths) {
    $metadataUrl = "${protocol}://${DirectorServer}:${Port}${path}/`$metadata"
    Write-Host "  Trying: $metadataUrl" -ForegroundColor Gray
    try {
        $metadataResponse = Invoke-WebRequest -Uri $metadataUrl -Method Get -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        if ($metadataResponse.StatusCode -eq 200) {
            Write-Host "  ✓ Found working endpoint: $path" -ForegroundColor Green
            $workingPath = $path
            break
        }
    }
    catch {
        Write-Host "    ✗ Failed: $($_.Exception.Message)" -ForegroundColor DarkGray
    }
}

if (-not $workingPath) {
    Write-Host "  ✗ No working OData endpoint found" -ForegroundColor Red
    Write-Host ""
    exit 1
}

Write-Host ""

# Test 3: Try to get entity sets list
Write-Host "[3/4] Testing entity sets discovery..." -ForegroundColor Yellow
try {
    $serviceUrl = "${protocol}://${DirectorServer}:${Port}${workingPath}"
    $entitySetsUrl = "$serviceUrl"
    $response = Invoke-RestMethod -Uri $entitySetsUrl -Method Get -TimeoutSec 10 -ErrorAction Stop
    Write-Host "  ✓ Successfully connected to OData service" -ForegroundColor Green
    Write-Host "  Service root: $serviceUrl" -ForegroundColor Cyan
}
catch {
    Write-Host "  ✗ Failed to retrieve service document: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "  Note: Authentication required (this is expected)" -ForegroundColor Yellow
    }
    elseif ($_.Exception.Response.StatusCode -eq 403) {
        Write-Host "  Note: Access forbidden (authentication/permissions required)" -ForegroundColor Yellow
    }
}

Write-Host ""

# Test 4: Try to query a simple entity (if no auth required)
Write-Host "[4/4] Testing entity query (Sessions)..." -ForegroundColor Yellow
try {
    $sessionsUrl = "$serviceUrl/Sessions?`$top=1"
    $response = Invoke-RestMethod -Uri $sessionsUrl -Method Get -TimeoutSec 10 -ErrorAction Stop
    if ($response.value) {
        Write-Host "  ✓ Successfully queried Sessions entity" -ForegroundColor Green
        Write-Host "  Records returned: $($response.value.Count)" -ForegroundColor Cyan
    }
    elseif ($response) {
        Write-Host "  ✓ Query successful (different response format)" -ForegroundColor Green
    }
}
catch {
    if ($_.Exception.Response.StatusCode -eq 401 -or $_.Exception.Response.StatusCode -eq 403) {
        Write-Host "  ⚠ Authentication required (expected for Director)" -ForegroundColor Yellow
        Write-Host "  This is normal - Director requires authentication" -ForegroundColor Gray
    }
    else {
        Write-Host "  ✗ Query failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To run the full collection script:" -ForegroundColor White
if ($SkipSSLValidation) {
    Write-Host "  .\12-Get-CitrixDirectorOData.ps1 -DirectorServer $DirectorServer -SkipSSLValidation" -ForegroundColor Gray
}
else {
    Write-Host "  .\12-Get-CitrixDirectorOData.ps1 -DirectorServer $DirectorServer" -ForegroundColor Gray
    Write-Host "  (Add -SkipSSLValidation if you get SSL certificate errors)" -ForegroundColor DarkGray
}
Write-Host ""

