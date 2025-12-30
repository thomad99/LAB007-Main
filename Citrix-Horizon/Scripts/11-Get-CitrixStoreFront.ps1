# Get-CitrixStoreFront.ps1
# Collects basic StoreFront store configuration from a StoreFront server
#
# NOTE:
# - This script is best run from a machine that can reach the StoreFront server with PowerShell remoting enabled.
# - It assumes the StoreFront PowerShell snap-ins/modules are installed on the StoreFront server.
#

param(
    [string]$OutputPath = ".\Data\citrix-storefront.json",
    [string]$StoreFrontServer
)

# Prompt for StoreFront server if not provided
if (-not $StoreFrontServer) {
    Write-Host ""
    Write-Host "StoreFront Server Information" -ForegroundColor Cyan
    Write-Host "Enter the StoreFront server name (or press Enter to skip):" -ForegroundColor Yellow
    $StoreFrontServer = Read-Host "StoreFront Server"
    
    if ([string]::IsNullOrWhiteSpace($StoreFrontServer)) {
        Write-Host "StoreFront collection skipped." -ForegroundColor Gray
        return $null
    }
}

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

Write-Host "Collecting StoreFront configuration from server: $StoreFrontServer" -ForegroundColor Yellow

try {
    $session = New-PSSession -ComputerName $StoreFrontServer -ErrorAction Stop
}
catch {
    Write-Warning "Failed to create remote PowerShell session to StoreFront server '$StoreFrontServer': $_"
    return @{
        StoreFrontServer = $StoreFrontServer
        Error = $_.ToString()
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    }
}

try {
    $scriptBlock = {
        $result = @{
            ServerName = $env:COMPUTERNAME
            Stores = @()
            Farm = $null
            Errors = @()
        }

        try {
            # Try to load common StoreFront snap-ins/modules
            $possibleSnapins = @(
                "Citrix.StoreFront.Admin.V1",
                "Citrix.DeliveryServices.Framework.Commands"
            )

            foreach ($snap in $possibleSnapins) {
                try {
                    if (-not (Get-PSSnapin -Name $snap -ErrorAction SilentlyContinue)) {
                        Add-PSSnapin -Name $snap -ErrorAction SilentlyContinue
                    }
                }
                catch {
                    # Ignore individual snap-in failures
                }
            }

            # If Get-STFStoreService is available, use it
            $getStoreCmd = Get-Command -Name Get-STFStoreService -ErrorAction SilentlyContinue
            if ($getStoreCmd) {
                $stores = Get-STFStoreService -ErrorAction SilentlyContinue
                if ($stores) {
                    # Process each store to get detailed information
                    $storeList = @()
                    foreach ($store in $stores) {
                        $storeInfo = @{
                            Name = $store.Name
                            BaseUrl = $store.BaseUrl
                            FarmName = $store.FarmName
                            VirtualPath = $store.VirtualPath
                            AuthenticationService = $null
                            WebReceiverService = $null
                            StoreOptions = $null
                        }
                        
                        # Try to get additional store details
                        try {
                            $storeDetail = Get-STFStoreService -Name $store.Name -ErrorAction SilentlyContinue
                            if ($storeDetail) {
                                $storeInfo.AuthenticationService = $storeDetail.AuthenticationService
                                $storeInfo.WebReceiverService = $storeDetail.WebReceiverService
                                $storeInfo.StoreOptions = $storeDetail.StoreOptions
                            }
                        }
                        catch {
                            # Ignore errors getting detailed info
                        }
                        
                        $storeList += $storeInfo
                    }
                    $result.Stores = $storeList
                    $result.TotalStores = $storeList.Count
                }
            }
            else {
                $result.Errors += "Get-STFStoreService is not available. StoreFront PowerShell snap-in may be missing."
            }

            # Try to collect farm info if available
            $getFarmCmd = Get-Command -Name Get-DSFarm -ErrorAction SilentlyContinue
            if ($getFarmCmd) {
                try {
                    $farm = Get-DSFarm -ErrorAction SilentlyContinue
                    if ($farm) {
                        $result.Farm = $farm
                    }
                }
                catch {
                    $result.Errors += "Failed to get DS Farm information: $($_.ToString())"
                }
            }
        }
        catch {
            $result.Errors += $_.ToString()
        }

        $result.CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        return $result
    }

    $storefrontData = Invoke-Command -Session $session -ScriptBlock $scriptBlock

    # Save to JSON
    $storefrontData | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
    Write-Host "StoreFront information collected successfully from $StoreFrontServer" -ForegroundColor Green

    return $storefrontData
}
catch {
    Write-Warning "Failed to collect StoreFront information from '$StoreFrontServer': $_"
    return @{
        StoreFrontServer = $StoreFrontServer
        Error = $_.ToString()
        CollectedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    }
}
finally {
    if ($session) {
        Remove-PSSession -Session $session
    }
}


