# Get-CitrixDirectorOData.ps1
# Collects OData from Citrix Director monitoring endpoints
# Director exposes monitoring data via OData v3/v4 API (supports multiple versions)
# Author : LAB007.AI
# Version: 1.9
# Last Modified: 260106:2145

param(
    [string]$OutputPath = ".\Data\citrix-director-odata.json",
    [string]$DirectorServer,
    [switch]$UseHTTPS = $true,
    [int]$Port,  # Default will be set based on protocol
    [PSCredential]$Credential,
    [switch]$SkipSSLValidation = $false,
    [int]$MaxRecordsPerEntity = 10000,
    [string[]]$EntityFilter = @(),  # If specified, only collect these entities
    [switch]$UseQueryPresets,  # Use predefined query sets for comprehensive data collection
    [string[]]$QueryPresets = @()  # Specific query presets to run
)

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# Setup debug logging
$debugFile = Join-Path $outputDir "debug12.txt"

# Force delete existing debug file to ensure clean start
if (Test-Path $debugFile) {
    try {
        Remove-Item $debugFile -Force -ErrorAction Stop
    } catch {
        Write-Warning "Could not delete existing debug file $debugFile : $_"
    }
}

$startTime = Get-Date
Write-Host "[DEBUG] Starting Director OData collection at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $debugFile -Append

# Helper function to setup SSL certificate bypass (avoids here-string parsing issues)
function Initialize-SSLBypass {
    if (-not ([System.Management.Automation.PSTypeName]'TrustAllCertsPolicy').Type) {
        $csharpCode = 'using System.Net; using System.Security.Cryptography.X509Certificates; public class TrustAllCertsPolicy : ICertificatePolicy { public bool CheckValidationResult(ServicePoint srvPoint, X509Certificate certificate, WebRequest request, int certificateProblem) { return true; } }'
        Add-Type -TypeDefinition $csharpCode
    }
    [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls11 -bor [System.Net.SecurityProtocolType]::Tls
}

# Function to make OData requests
function Invoke-ODataRequest {
    param(
        [string]$BaseUrl,
        [string]$EntitySet,
        [PSCredential]$Credential,
        [bool]$SkipSSLValidation,
        [int]$MaxRecords = 10000,
        [string]$Select,
        [string]$Filter,
        [string]$OrderBy,
        [string]$Expand,
        [int]$Skip = 0,
        [switch]$Count
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

        # Build query parameters
        $queryParams = @()

        # Add various OData query options
        if ($Select) {
            $queryParams += "`$select=$Select"
        }

        if ($Filter) {
            $queryParams += "`$filter=$Filter"
        }

        if ($OrderBy) {
            $queryParams += "`$orderby=$OrderBy"
        }

        if ($Expand) {
            $queryParams += "`$expand=$Expand"
        }

        if ($MaxRecords -gt 0) {
            $queryParams += "`$top=$MaxRecords"
        }

        if ($Skip -gt 0) {
            $queryParams += "`$skip=$Skip"
        }

        if ($Count) {
            $queryParams += "`$count=true"
        }

        # Add query parameters to URL
        if ($queryParams.Count -gt 0) {
            $url += "?" + ($queryParams -join "&")
        }
        
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
        
        # Handle SSL validation - always try SSL bypass for HTTPS to handle self-signed certificates
        if ($SkipSSLValidation -or $BaseUrl -match "^https://") {
            Initialize-SSLBypass
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
        Write-Host "  SUCCESS: Collected $($result.RecordCount) records" -ForegroundColor Green
    }
    catch {
        $errorMsg = $_.Exception.Message
        $result.Error = $errorMsg
        Write-Host "  ERROR: Failed: $errorMsg" -ForegroundColor Red
    }
    
    return $result
}

# Function to get predefined OData query presets
function Get-ODataQueryPresets {
    param(
        [int]$MaxRecords = 1000
    )

    $presets = @{

        # Session-related queries
        "CurrentSessions" = @{
            EntitySet = "Sessions"
            Filter = "StartDate gt $(Get-Date (Get-Date).AddDays(-1) -Format 'yyyy-MM-ddTHH:mm:ssZ')"
            OrderBy = "StartDate desc"
            Top = $MaxRecords
            Description = "Current sessions from last 24 hours"
        }

        "ActiveSessions" = @{
            EntitySet = "Sessions"
            Filter = "SessionState eq 0"  # Active state
            OrderBy = "StartDate desc"
            Top = $MaxRecords
            Description = "Currently active sessions"
        }

        "DisconnectedSessions" = @{
            EntitySet = "Sessions"
            Filter = "SessionState eq 1"  # Disconnected state
            OrderBy = "StartDate desc"
            Top = $MaxRecords
            Description = "Disconnected sessions"
        }

        # Application usage queries
        "TopApplications" = @{
            EntitySet = "Applications"
            OrderBy = "TotalLaunches desc"
            Top = 100
            Description = "Top 100 most launched applications"
        }

        "RecentApplicationUsage" = @{
            EntitySet = "ApplicationSessions"
            Filter = "StartDate gt $(Get-Date (Get-Date).AddDays(-7) -Format 'yyyy-MM-ddTHH:mm:ssZ')"
            OrderBy = "StartDate desc"
            Top = $MaxRecords
            Description = "Application usage from last 7 days"
        }

        # Machine performance queries
        "MachinePerformance" = @{
            EntitySet = "MachinePerformanceMetrics"
            Filter = "CollectedDate gt $(Get-Date (Get-Date).AddHours(-24) -Format 'yyyy-MM-ddTHH:mm:ssZ')"
            OrderBy = "CollectedDate desc"
            Top = $MaxRecords
            Description = "Machine performance metrics from last 24 hours"
        }

        "HighLoadMachines" = @{
            EntitySet = "LoadIndexes"
            Filter = "LoadIndexPercentage gt 80"
            OrderBy = "LoadIndexPercentage desc"
            Top = 50
            Description = "Machines with high load (>80%)"
        }

        # Failure analysis queries
        "RecentFailures" = @{
            EntitySet = "Failures"
            Filter = "FailureDate gt $(Get-Date (Get-Date).AddDays(-7) -Format 'yyyy-MM-ddTHH:mm:ssZ')"
            OrderBy = "FailureDate desc"
            Top = $MaxRecords
            Description = "Failures from last 7 days"
        }

        "ConnectionFailures" = @{
            EntitySet = "ConnectionFailureLogs"
            Filter = "FailureDate gt $(Get-Date (Get-Date).AddDays(-3) -Format 'yyyy-MM-ddTHH:mm:ssZ')"
            OrderBy = "FailureDate desc"
            Top = $MaxRecords
            Description = "Connection failures from last 3 days"
        }

        # User activity queries
        "TopUsers" = @{
            EntitySet = "Sessions"
            Select = "UserName,UserFullName"
            Filter = "StartDate gt $(Get-Date (Get-Date).AddDays(-30) -Format 'yyyy-MM-ddTHH:mm:ssZ')"
            OrderBy = "StartDate desc"
            Top = 100
            Description = "Top 100 users by recent activity"
        }

        # Desktop usage queries
        "DesktopSessions" = @{
            EntitySet = "DesktopSessions"
            Filter = "StartDate gt $(Get-Date (Get-Date).AddDays(-7) -Format 'yyyy-MM-ddTHH:mm:ssZ')"
            OrderBy = "StartDate desc"
            Top = $MaxRecords
            Description = "Desktop sessions from last 7 days"
        }

        # Performance metrics queries
        "LogonPerformance" = @{
            EntitySet = "LogOnPerformanceMetrics"
            Filter = "LogOnStartDate gt $(Get-Date (Get-Date).AddDays(-7) -Format 'yyyy-MM-ddTHH:mm:ssZ')"
            OrderBy = "LogOnStartDate desc"
            Top = $MaxRecords
            Description = "Logon performance metrics from last 7 days"
        }

        # Capacity and resource queries
        "MachineCapacity" = @{
            EntitySet = "Machines"
            Select = "Name,DnsName,SessionCount,LoadIndex,InMaintenanceMode"
            OrderBy = "LoadIndex desc"
            Top = $MaxRecords
            Description = "Machine capacity and load information"
        }

        # Alert and monitoring queries
        "ActiveAlerts" = @{
            EntitySet = "AlertRuleInstances"
            Filter = "State eq 'Active'"
            OrderBy = "RaisedDate desc"
            Top = 100
            Description = "Currently active alert instances"
        }

        # Historical trend queries
        "SessionTrends" = @{
            EntitySet = "Trends"
            Filter = "TrendType eq 'SessionCount' and CollectedDate gt $(Get-Date (Get-Date).AddDays(-30) -Format 'yyyy-MM-ddTHH:mm:ssZ')"
            OrderBy = "CollectedDate desc"
            Top = $MaxRecords
            Description = "Session count trends for last 30 days"
        }

        # Catalog and delivery group queries
        "DeliveryGroupUsage" = @{
            EntitySet = "DeliveryGroups"
            Select = "Name,TotalMachines,AvailableMachines,SessionCount"
            OrderBy = "SessionCount desc"
            Top = 100
            Description = "Delivery group usage statistics"
        }

        # Hypervisor queries
        "HypervisorStatus" = @{
            EntitySet = "Hypervisors"
            Select = "Name,State,TotalMachines,AvailableMachines"
            OrderBy = "Name"
            Top = $MaxRecords
            Description = "Hypervisor status and capacity"
        }

        # Administrative queries
        "AdminOperations" = @{
            EntitySet = "AdminLogOnOperations"
            Filter = "OperationStartDate gt $(Get-Date (Get-Date).AddDays(-7) -Format 'yyyy-MM-ddTHH:mm:ssZ')"
            OrderBy = "OperationStartDate desc"
            Top = $MaxRecords
            Description = "Administrative operations from last 7 days"
        }
    }

    return $presets
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
            Initialize-SSLBypass
        }
        
        $metadataResponse = Invoke-RestMethod @requestParams
        
        # Parse metadata XML to find entity sets
        # Convert to XML if needed
        $metadata = $null
        if ($metadataResponse -is [xml]) {
            $metadata = $metadataResponse
        }
        elseif ($metadataResponse -is [string]) {
            try {
                $metadata = [xml]$metadataResponse
            }
            catch {
                $xmlError = $_.Exception.Message
                Write-Verbose "Could not parse metadata as XML: $xmlError"
            }
        }
        
        if ($metadata) {
            $namespaces = @{
                edmx = "http://schemas.microsoft.com/ado/2007/06/edmx"
                edm = "http://schemas.microsoft.com/ado/2008/09/edm"
            }
            
            try {
                $entitySets = $metadata.SelectNodes("//edm:EntitySet", $namespaces) | ForEach-Object {
                    $_.Name
                }
            }
            catch {
                # Fallback: try without namespace prefixes
                try {
                    $xpathExpr = '//*[local-name()="EntitySet"]'
                    $entitySets = $metadata.SelectNodes($xpathExpr) | ForEach-Object {
                        $_.Name
                    }
                }
                catch {
                    $errorMsg = $_.Exception.Message
                    Write-Verbose "Could not parse EntitySet nodes: $errorMsg"
                }
            }
        }
    }
    catch {
        Write-Warning "Could not discover entity sets from metadata: $_"
        # Note: debug logging not available in function scope
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
    if (-not $DirectorServer -or $DirectorServer.Trim() -eq "") {
        # Try to get from DDC connection if available
        if ($global:CitrixAdminAddress) {
            $DirectorServer = $global:CitrixAdminAddress
            Write-Host "Using DDC address for Director: $DirectorServer" -ForegroundColor Yellow
        }
        else {
            # Default to localhost if not specified (code is likely running on the server)
            $DirectorServer = "localhost"
            Write-Host "No Director server specified, using localhost" -ForegroundColor Yellow
        }
    }
    
    # Set protocol and default port based on UseHTTPS parameter
    if ($UseHTTPS) {
        $protocols = @("https")  # HTTPS only, no HTTP fallback
        if (-not $Port) { $Port = 443 }
    } else {
        $protocols = @("http")   # HTTP only, no HTTPS fallback
        if (-not $Port) { $Port = 80 }
    }
    
    # List of OData versions/paths to try (most common first)
    $odataPaths = @(
        "/citrix/monitor/odata/v4/Data",
        "/Citrix/Monitor/OData/v4/Data",
        "/citrix/monitor/odata/v3/Data",
        "/Citrix/Monitor/OData/v3/Data",
        "/Citrix/Monitor/OData/v2/Data",
        "/Citrix/Monitor/OData/v1/Data",
        "/Citrix/Monitor/OData/Data",
        "/Director/OData/v3/Data",
        "/Director/OData/v2/Data",
        "/Director/OData/v1/Data",
        "/OData/v3/Data",
        "/OData/v2/Data",
        "/OData/v1/Data"
    )
    
    $baseUrl = $null
    $workingPath = $null
    
    # Try each protocol and OData path combination to find one that works
    Write-Host "Discovering OData endpoint..." -ForegroundColor Yellow
    $endpointFound = $false

    foreach ($protocol in $protocols) {
        if ($endpointFound) { break }  # Stop if we already found a working endpoint

        $protocolName = $protocol.ToUpper()
        Write-Host "Trying protocol: $protocolName (Port: $Port)" -ForegroundColor Cyan | Out-File -FilePath $debugFile -Append

        foreach ($odataPath in $odataPaths) {
            if ($endpointFound) { break }  # Stop if we already found a working endpoint

            # Only add port if it's not the default port for the protocol
            $portString = ""
            if (($protocol -eq "https" -and $Port -ne 443) -or ($protocol -eq "http" -and $Port -ne 80)) {
                $portString = ":$Port"
            }
            $testUrl = "${protocol}://${DirectorServer}${portString}${odataPath}"
            Write-Host "  Trying: $testUrl" -ForegroundColor Gray
            Write-Host "[DEBUG] Testing URL: $testUrl (Protocol: $protocol, Port: $Port, PortString: '$portString', Path: $odataPath)" | Out-File -FilePath $debugFile -Append

            try {
                $testParams = @{
                    Uri = "$testUrl/`$metadata"
                    Method = 'Get'
                    ErrorAction = 'Stop'
                    TimeoutSec = 5
                }

                if ($Credential) {
                    $testParams.Credential = $Credential
                }

                # Always try SSL bypass for both HTTPS and HTTP to handle self-signed certificates
                Initialize-SSLBypass

                $testResponse = Invoke-WebRequest @testParams
                if ($testResponse.StatusCode -eq 200) {
                    $baseUrl = $testUrl
                    $workingPath = $odataPath
                    # Extract version from path for display
                    $version = "Unknown"
                    if ($odataPath -match '/v([0-9]+)/') {
                        $version = "v$($matches[1])"
                    } else {
                        $version = "Unknown"
                    }
                    Write-Host "  OK: Found working endpoint: $odataPath (OData $version)" -ForegroundColor Green
                    Write-Host "[DEBUG] Working OData path: $odataPath (OData $version)" | Out-File -FilePath $debugFile -Append
                    $endpointFound = $true
                }
            }
            catch {
                # Continue to next path - this is expected as we try multiple versions
                $statusCode = $null
                if ($_.Exception.Response) {
                    $statusCode = [int]$_.Exception.Response.StatusCode
                }
                if ($statusCode -eq 404) {
                    # 404 is expected for non-existent paths - don't log as error
                    Write-Host "[DEBUG] Path $odataPath not found (404) - trying next version..." | Out-File -FilePath $debugFile -Append
                }
                else {
                    Write-Host "[DEBUG] Path $odataPath failed (Status: $statusCode): $_" | Out-File -FilePath $debugFile -Append
                }
            }
        }  # End foreach odataPath

        if ($endpointFound) {
            break
        }
    }  # End foreach protocol

    # If no path worked, default to v4 over HTTPS (most common in newer versions)
    if (-not $baseUrl) {
        $workingPath = "/citrix/monitor/odata/v4/Data"
        # Use default HTTPS port (443) unless specified otherwise
        $defaultProtocol = "https"
        $defaultPort = 443
        $portString = ""
        if ($Port -ne $defaultPort) {
            $portString = ":$Port"
        }
        $baseUrl = "${defaultProtocol}://${DirectorServer}${portString}${workingPath}"
        Write-Host "  WARNING: Could not verify endpoint, defaulting to: $workingPath" -ForegroundColor Yellow
        Write-Host "[DEBUG] Using default OData path: $workingPath (URL: $baseUrl)" | Out-File -FilePath $debugFile -Append
    }
    
    Write-Host "Director OData Base URL: $baseUrl" -ForegroundColor Cyan
    Write-Host "[DEBUG] Final Base URL: $baseUrl" | Out-File -FilePath $debugFile -Append
    
    # Get credentials if not provided (only prompt in standalone mode)
    if (-not $Credential) {
        # Only prompt for credentials if we're in interactive mode
        # When called from master script, credentials are usually not needed (uses current context)
        try {
            # Try a test request without credentials first
            $testParams = @{
                Uri = "$baseUrl/`$metadata"
                Method = 'Get'
                ErrorAction = 'Stop'
                TimeoutSec = 5
            }
            
            if ($SkipSSLValidation) {
                Initialize-SSLBypass
            }
            
            $null = Invoke-WebRequest @testParams
            Write-Host "Authentication not required (using current context)" -ForegroundColor Green
        }
        catch {
            # If we get a 401/403, prompt for credentials
            if ($_.Exception.Response.StatusCode.value__ -eq 401 -or $_.Exception.Response.StatusCode.value__ -eq 403) {
                Write-Host ""
                Write-Host "Director OData access requires authentication." -ForegroundColor Yellow
                $useAuth = Read-Host "Do you want to provide credentials? (Y/N)"
                if ($useAuth -eq 'Y' -or $useAuth -eq 'y') {
                    $Credential = Get-Credential -Message "Enter credentials for Director access"
                }
            }
        }
    }
    
    # Determine collection approach
    if ($UseQueryPresets) {
        Write-Host "Using predefined query presets for comprehensive data collection..." -ForegroundColor Cyan

        # Get all available presets
        $allPresets = Get-ODataQueryPresets -MaxRecords $MaxRecordsPerEntity

        # Filter presets if specific ones requested
        if ($QueryPresets.Count -gt 0) {
            $selectedPresets = @{}
            foreach ($presetName in $QueryPresets) {
                if ($allPresets.ContainsKey($presetName)) {
                    $selectedPresets[$presetName] = $allPresets[$presetName]
                } else {
                    Write-Warning "Query preset '$presetName' not found"
                }
            }
            $queryPresets = $selectedPresets
        } else {
            $queryPresets = $allPresets
        }

        Write-Host "Will execute $($queryPresets.Count) query presets" -ForegroundColor Green
        Write-Host ""

        # Collection results for presets
        $collectionResults = @{
            CollectionDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            DirectorServer = $DirectorServer
            BaseUrl = $baseUrl
            QueryPresets = @{}
            Summary = @{
                TotalPresets = $queryPresets.Count
                SuccessfulQueries = 0
                FailedQueries = 0
                TotalRecords = 0
            }
        }

        # Execute each query preset
        $presetIndex = 0
        foreach ($presetName in $queryPresets.Keys) {
            $presetIndex++
            $preset = $queryPresets[$presetName]

            Write-Host "[$presetIndex/$($queryPresets.Count)] Executing preset: $presetName" -ForegroundColor Cyan
            Write-Host "  Description: $($preset.Description)" -ForegroundColor Gray
            Write-Host "  Entity: $($preset.EntitySet)" -ForegroundColor Gray

            $result = Invoke-ODataRequest -BaseUrl $baseUrl -EntitySet $preset.EntitySet `
                -Credential $Credential -SkipSSLValidation $SkipSSLValidation `
                -MaxRecords $preset.Top -Select $preset.Select -Filter $preset.Filter `
                -OrderBy $preset.OrderBy -Expand $preset.Expand

            if ($result.Success) {
                $collectionResults.QueryPresets[$presetName] = @{
                    Success = $true
                    RecordCount = $result.RecordCount
                    Data = $result.Data
                    Query = $preset
                    ExecutedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                }
                $collectionResults.Summary.SuccessfulQueries++
                $collectionResults.Summary.TotalRecords += $result.RecordCount
                Write-Host "  SUCCESS: $($result.RecordCount) records" -ForegroundColor Green
            } else {
                $collectionResults.QueryPresets[$presetName] = @{
                    Success = $false
                    Error = $result.Error
                    Query = $preset
                    ExecutedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                }
                $collectionResults.Summary.FailedQueries++
                Write-Host "  FAILED: $($result.Error)" -ForegroundColor Red
            }

            Write-Host ""
            # Small delay to avoid overwhelming the server
            Start-Sleep -Milliseconds 200
        }
    } else {
        # Original entity set collection approach
        Write-Host "Using entity set discovery approach..." -ForegroundColor Cyan

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

        # Collection results for entity sets
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
            } else {
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

    if ($UseQueryPresets) {
        Write-Host "  Collection Mode: Query Presets" -ForegroundColor White
        Write-Host "  Total Query Presets: $($collectionResults.Summary.TotalPresets)" -ForegroundColor White
        Write-Host "  Successful Queries: $($collectionResults.Summary.SuccessfulQueries)" -ForegroundColor Green
        Write-Host "  Failed Queries: $($collectionResults.Summary.FailedQueries)" -ForegroundColor $(if ($collectionResults.Summary.FailedQueries -gt 0) { "Red" } else { "White" })
    } else {
        Write-Host "  Collection Mode: Entity Sets" -ForegroundColor White
        Write-Host "  Total Entity Sets: $($collectionResults.Summary.TotalEntitySets)" -ForegroundColor White
        Write-Host "  Successful Collections: $($collectionResults.Summary.SuccessfulCollections)" -ForegroundColor Green
        Write-Host "  Failed Collections: $($collectionResults.Summary.FailedCollections)" -ForegroundColor $(if ($collectionResults.Summary.FailedCollections -gt 0) { "Red" } else { "White" })
    }

    Write-Host "  Total Records: $($collectionResults.Summary.TotalRecords)" -ForegroundColor White
    Write-Host "  Output File: $OutputPath" -ForegroundColor White
    Write-Host ""
    
    Write-Host "[DEBUG] Collection completed at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] Total duration: $((Get-Date) - $startTime)" | Out-File -FilePath $debugFile -Append
    
    # Return collection results
    return $collectionResults
}
catch {
    Write-Error "Failed to collect Director OData: $_"
    Write-Host "[DEBUG] Fatal error: $_" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] Stack trace: $($_.ScriptStackTrace)" | Out-File -FilePath $debugFile -Append
    return @{ Error = $_.Exception.Message }
}

