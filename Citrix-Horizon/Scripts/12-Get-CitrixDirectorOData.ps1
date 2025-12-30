# Get-CitrixDirectorOData.ps1
# Collects OData from Citrix Director monitoring endpoints
# Director exposes monitoring data via OData v3 API

param(
    [string]$OutputPath = ".\Data\citrix-director-odata.json",
    [string]$DirectorServer,
    [switch]$UseHTTPS = $true,
    [int]$Port = 443,
    [PSCredential]$Credential,
    [switch]$SkipSSLValidation = $false,
    [int]$MaxRecordsPerEntity = 10000,
    [string[]]$EntityFilter = @()  # If specified, only collect these entities
)

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# Setup debug logging
$debugFile = Join-Path $outputDir "debug-director-odata.txt"
$startTime = Get-Date
Write-Host "[DEBUG] Starting Director OData collection at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $debugFile -Append

# Function to make OData requests
function Invoke-ODataRequest {
    param(
        [string]$BaseUrl,
        [string]$EntitySet,
        [PSCredential]$Credential,
        [bool]$SkipSSLValidation,
        [int]$MaxRecords = 10000
    )
    
    $result = @{
        Success = $false
        Data = $null
        Error = $null
        RecordCount = 0
    }
    
    try {
        # Build OData URL
        $url = "$BaseUrl/$EntitySet"
        
        # Add $top to limit records if MaxRecords is specified
        if ($MaxRecords -gt 0) {
            $url += "?`$top=$MaxRecords"
        }
        
        Write-Host "[DEBUG] Requesting: $url" | Out-File -FilePath $debugFile -Append
        Write-Host "Querying $EntitySet..." -ForegroundColor Cyan
        
        # Prepare request parameters
        $requestParams = @{
            Uri = $url
            Method = 'Get'
            ContentType = 'application/json'
            ErrorAction = 'Stop'
        }
        
        # Add credentials if provided
        if ($Credential) {
            $requestParams.Credential = $Credential
        }
        
        # Handle SSL validation
        if ($SkipSSLValidation) {
            # Disable SSL certificate validation
            if (-not ([System.Management.Automation.PSTypeName]'TrustAllCertsPolicy').Type) {
                $certPolicy = @"
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
                Add-Type $certPolicy
            }
            [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
            [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls11 -bor [System.Net.SecurityProtocolType]::Tls
        }
        
        # Make the request
        $response = Invoke-RestMethod @requestParams
        
        # OData responses can be in different formats
        if ($response.value) {
            # Standard OData format with value array
            $result.Data = $response.value
            $result.RecordCount = $response.value.Count
        }
        elseif ($response -is [Array]) {
            # Direct array response
            $result.Data = $response
            $result.RecordCount = $response.Count
        }
        else {
            # Single object or other format
            $result.Data = $response
            $result.RecordCount = 1
        }
        
        $result.Success = $true
        Write-Host "  ✓ Collected $($result.RecordCount) records" -ForegroundColor Green
        Write-Host "[DEBUG] Successfully collected $($result.RecordCount) records from $EntitySet" | Out-File -FilePath $debugFile -Append
    }
    catch {
        $result.Error = $_.Exception.Message
        Write-Host "  ✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "[DEBUG] Error collecting $EntitySet : $($_.Exception.Message)" | Out-File -FilePath $debugFile -Append
    }
    
    return $result
}

# Function to discover available entity sets
function Get-ODataEntitySets {
    param(
        [string]$BaseUrl,
        [PSCredential]$Credential,
        [bool]$SkipSSLValidation
    )
    
    $entitySets = @()
    
    try {
        Write-Host "Discovering available OData entity sets..." -ForegroundColor Yellow
        
        # Try to get service metadata/document
        $metadataUrl = "$BaseUrl/`$metadata"
        $requestParams = @{
            Uri = $metadataUrl
            Method = 'Get'
            ErrorAction = 'Stop'
        }
        
        if ($Credential) {
            $requestParams.Credential = $Credential
        }
        
        if ($SkipSSLValidation) {
            if (-not ([System.Management.Automation.PSTypeName]'TrustAllCertsPolicy').Type) {
                $certPolicy = @"
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
                Add-Type $certPolicy
            }
            [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
            [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls11 -bor [System.Net.SecurityProtocolType]::Tls
        }
        
        $metadata = Invoke-RestMethod @requestParams
        
        # Parse metadata XML to find entity sets
        if ($metadata -is [xml]) {
            $namespaces = @{
                edmx = "http://schemas.microsoft.com/ado/2007/06/edmx"
                edm = "http://schemas.microsoft.com/ado/2008/09/edm"
            }
            
            $entitySets = $metadata.SelectNodes("//edm:EntitySet", $namespaces) | ForEach-Object {
                $_.Name
            }
        }
    }
    catch {
        Write-Warning "Could not discover entity sets from metadata: $_"
        Write-Host "[DEBUG] Metadata discovery failed: $_" | Out-File -FilePath $debugFile -Append
    }
    
    # If discovery failed, use common Director entity sets
    if ($entitySets.Count -eq 0) {
        Write-Host "Using default Director entity sets..." -ForegroundColor Yellow
        # Common Director OData entity sets
        $entitySets = @(
            'Sessions',
            'Machines',
            'Applications',
            'Failures',
            'LogOnPerformanceMetrics',
            'ConnectionFailureLogs',
            'LoadIndexes',
            'MachineCatalogs',
            'DeliveryGroups',
            'Hypervisors',
            'HypervisorConnections',
            'AdminLogOnOperations',
            'ConfigurationLogEntries',
            'SessionsWithSummary',
            'MachineFailures',
            'ApplicationFailures',
            'ConnectionFailureDetails',
            'HistoricalTrends',
            'Trends',
            'AlertRuleDefinitions',
            'AlertRuleInstances',
            'AlertRuleInstanceDetails',
            'AlertRuleInstanceDetailsEx',
            'AlertRuleInstanceDetailsEx2',
            'AlertRuleInstanceDetailsEx3',
            'AlertRuleInstanceDetailsEx4',
            'AlertRuleInstanceDetailsEx5',
            'MachinesWithSummary',
            'ApplicationsWithSummary',
            'SessionFailures',
            'MachinePerformanceMetrics',
            'ApplicationPerformanceMetrics',
            'UserSessions',
            'DesktopSessions',
            'ApplicationSessions',
            'ConnectionMetrics',
            'LogOnMetrics',
            'FailureDetails',
            'PerformanceMetrics',
            'TrendData',
            'HistoricalData',
            'CurrentSessions',
            'ActiveSessions',
            'DisconnectedSessions',
            'BrokerSessions',
            'BrokerMachines',
            'BrokerApplications',
            'BrokerFailures'
        )
        
        # Remove duplicates and sort
        $entitySets = $entitySets | Select-Object -Unique | Sort-Object
    }
    
    return $entitySets
}

# Main collection logic
try {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Citrix Director OData Collection" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Determine Director server
    if (-not $DirectorServer) {
        # Try to get from DDC connection if available
        if ($global:CitrixAdminAddress) {
            $DirectorServer = $global:CitrixAdminAddress
            Write-Host "Using DDC address for Director: $DirectorServer" -ForegroundColor Yellow
        }
        else {
            $DirectorServer = Read-Host "Enter Director Server name or FQDN"
        }
    }
    
    # Build base URL
    $protocol = if ($UseHTTPS) { "https" } else { "http" }
    $baseUrl = "$protocol://$DirectorServer`:$Port/Citrix/Monitor/OData/v3/Data"
    
    Write-Host "Director OData Base URL: $baseUrl" -ForegroundColor Cyan
    Write-Host "[DEBUG] Base URL: $baseUrl" | Out-File -FilePath $debugFile -Append
    
    # Get credentials if not provided
    if (-not $Credential) {
        Write-Host ""
        Write-Host "Director OData access may require authentication." -ForegroundColor Yellow
        $useAuth = Read-Host "Do you want to provide credentials? (Y/N)"
        if ($useAuth -eq 'Y' -or $useAuth -eq 'y') {
            $Credential = Get-Credential -Message "Enter credentials for Director access"
        }
    }
    
    # Discover entity sets
    $entitySets = Get-ODataEntitySets -BaseUrl $baseUrl -Credential $Credential -SkipSSLValidation $SkipSSLValidation
    
    # Filter entity sets if specified
    if ($EntityFilter.Count -gt 0) {
        $entitySets = $entitySets | Where-Object { $EntityFilter -contains $_ }
        Write-Host "Filtered to $($entitySets.Count) entity sets based on filter" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Found $($entitySets.Count) entity sets to collect" -ForegroundColor Green
    Write-Host ""
    
    # Collection results
    $collectionResults = @{
        CollectionDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        DirectorServer = $DirectorServer
        BaseUrl = $baseUrl
        EntitySets = @{}
        Summary = @{
            TotalEntitySets = $entitySets.Count
            SuccessfulCollections = 0
            FailedCollections = 0
            TotalRecords = 0
        }
    }
    
    # Collect data from each entity set
    $entityIndex = 0
    foreach ($entitySet in $entitySets) {
        $entityIndex++
        Write-Host "[$entityIndex/$($entitySets.Count)] Collecting $entitySet..." -ForegroundColor Cyan
        
        $result = Invoke-ODataRequest -BaseUrl $baseUrl -EntitySet $entitySet -Credential $Credential -SkipSSLValidation $SkipSSLValidation -MaxRecords $MaxRecordsPerEntity
        
        if ($result.Success) {
            $collectionResults.EntitySets[$entitySet] = @{
                Success = $true
                RecordCount = $result.RecordCount
                Data = $result.Data
                CollectedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            }
            $collectionResults.Summary.SuccessfulCollections++
            $collectionResults.Summary.TotalRecords += $result.RecordCount
        }
        else {
            $collectionResults.EntitySets[$entitySet] = @{
                Success = $false
                Error = $result.Error
                CollectedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            }
            $collectionResults.Summary.FailedCollections++
        }
        
        # Small delay to avoid overwhelming the server
        Start-Sleep -Milliseconds 100
    }
    
    # Save results to JSON
    Write-Host ""
    Write-Host "Saving results to: $OutputPath" -ForegroundColor Yellow
    
    # Convert to JSON with depth to handle nested objects
    $jsonContent = $collectionResults | ConvertTo-Json -Depth 20
    
    # Save to file
    $jsonContent | Out-File -FilePath $OutputPath -Encoding UTF8 -Force
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Collection Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Summary:" -ForegroundColor Cyan
    Write-Host "  Total Entity Sets: $($collectionResults.Summary.TotalEntitySets)" -ForegroundColor White
    Write-Host "  Successful: $($collectionResults.Summary.SuccessfulCollections)" -ForegroundColor Green
    Write-Host "  Failed: $($collectionResults.Summary.FailedCollections)" -ForegroundColor $(if ($collectionResults.Summary.FailedCollections -gt 0) { "Red" } else { "White" })
    Write-Host "  Total Records: $($collectionResults.Summary.TotalRecords)" -ForegroundColor White
    Write-Host "  Output File: $OutputPath" -ForegroundColor White
    Write-Host ""
    
    Write-Host "[DEBUG] Collection completed at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] Total duration: $((Get-Date) - $startTime)" | Out-File -FilePath $debugFile -Append
}
catch {
    Write-Error "Failed to collect Director OData: $_"
    Write-Host "[DEBUG] Fatal error: $_" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] Stack trace: $($_.ScriptStackTrace)" | Out-File -FilePath $debugFile -Append
    exit 1
}

