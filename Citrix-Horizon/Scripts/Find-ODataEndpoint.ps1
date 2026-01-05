# Find-ODataEndpoint.ps1
# Discovers the correct Director OData endpoint URL
# Usage: .\Find-ODataEndpoint.ps1 -DirectorServer localhost -SkipSSLValidation

param(
    [string]$DirectorServer = "localhost",
    [switch]$UseHTTPS = $true,
    [int]$Port = 443,
    [switch]$SkipSSLValidation = $false
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Director OData Endpoint Discovery" -ForegroundColor Cyan
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

$protocol = if ($UseHTTPS) { "https" } else { "http" }

# List of common OData paths to try
$odataPaths = @(
    "/Citrix/Monitor/OData/v3/Data",
    "/Citrix/Monitor/OData/v2/Data",
    "/Citrix/Monitor/OData/v1/Data",
    "/Citrix/Monitor/OData/v4/Data",
    "/Citrix/Monitor/OData/Data",
    "/Director/OData/v3/Data",
    "/Director/OData/v2/Data",
    "/Director/OData/v1/Data",
    "/OData/v3/Data",
    "/OData/v2/Data",
    "/OData/v1/Data",
    "/Citrix/Monitor/OData",
    "/Director/OData",
    "/OData"
)

Write-Host "Testing common OData endpoints on ${protocol}://${DirectorServer}:${Port}..." -ForegroundColor Yellow
Write-Host ""

$foundEndpoints = @()
foreach ($path in $odataPaths) {
    $testUrl = "${protocol}://${DirectorServer}:${Port}${path}"
    
    # Test 1: Try $metadata endpoint
    $metadataUrl = "$testUrl/`$metadata"
    Write-Host "Testing: $metadataUrl" -ForegroundColor Gray -NoNewline
    try {
        $response = Invoke-WebRequest -Uri $metadataUrl -Method Get -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host " ✓ FOUND (Metadata)" -ForegroundColor Green
            $foundEndpoints += @{
                BaseUrl = $testUrl
                MetadataUrl = $metadataUrl
                StatusCode = $response.StatusCode
                Type = "Metadata"
            }
        }
    }
    catch {
        $statusCode = $null
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }
        
        if ($statusCode -eq 401 -or $statusCode -eq 403) {
            Write-Host " ✓ FOUND (Requires Auth: $statusCode)" -ForegroundColor Yellow
            $foundEndpoints += @{
                BaseUrl = $testUrl
                MetadataUrl = $metadataUrl
                StatusCode = $statusCode
                Type = "Requires Authentication"
            }
        }
        elseif ($statusCode -eq 404) {
            Write-Host " ✗ Not found (404)" -ForegroundColor DarkGray
        }
        else {
            Write-Host " ✗ Error: $($_.Exception.Message)" -ForegroundColor DarkGray
        }
    }
}

Write-Host ""

if ($foundEndpoints.Count -eq 0) {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "No OData endpoints found!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Verify Director is installed and running on $DirectorServer" -ForegroundColor White
    Write-Host "2. Check if Director web services are enabled" -ForegroundColor White
    Write-Host "3. Try different port (common ports: 443, 80, 8080)" -ForegroundColor White
    Write-Host "4. Check if you need to use HTTP instead of HTTPS" -ForegroundColor White
    Write-Host "5. Verify the server name/FQDN is correct" -ForegroundColor White
    Write-Host ""
    Write-Host "To test with HTTP:" -ForegroundColor Cyan
    Write-Host "  .\Find-ODataEndpoint.ps1 -DirectorServer $DirectorServer -UseHTTPS:`$false -Port 80 -SkipSSLValidation" -ForegroundColor Gray
}
else {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Found $($foundEndpoints.Count) endpoint(s)!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    
    foreach ($endpoint in $foundEndpoints) {
        Write-Host "Base URL: $($endpoint.BaseUrl)" -ForegroundColor Cyan
        Write-Host "Metadata: $($endpoint.MetadataUrl)" -ForegroundColor Cyan
        Write-Host "Status: $($endpoint.StatusCode) - $($endpoint.Type)" -ForegroundColor $(if ($endpoint.StatusCode -eq 200) { "Green" } else { "Yellow" })
        Write-Host ""
    }
    
    Write-Host "To use this endpoint in the collection script:" -ForegroundColor White
    Write-Host "  .\12-Get-CitrixDirectorOData.ps1 -DirectorServer $DirectorServer" -ForegroundColor Gray
    if ($SkipSSLValidation) {
        Write-Host "  (Script will use -SkipSSLValidation automatically)" -ForegroundColor DarkGray
    }
    Write-Host ""
}

