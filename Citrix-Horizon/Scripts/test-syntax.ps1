param(
    [string]$OutputPath = '.\Data\test.json'
)

try {
    Write-Host 'Test script running...' -ForegroundColor Green

    # Simulate VM processing
    $vms = @('VM1', 'VM2')
    $masterImages = @()

    if (-not $vms -or $vms.Count -eq 0) {
        Write-Warning 'No VMs found'
        $masterImages = @()
    } else {
        Write-Host "Found $($vms.Count) VMs" -ForegroundColor Green

        $masterImages = @()

        foreach ($vm in $vms) {
            Write-Host "Processing: $vm" -ForegroundColor Cyan

            $imageInfo = @{
                Name = $vm
                Test = 'data'
            }

            $masterImages += $imageInfo
            Write-Host "  OK: $vm processed" -ForegroundColor Green
        }
    }

    $result = @{
        TotalImages = $masterImages.Count
        MasterImages = $masterImages
    }

    $jsonContent = $result | ConvertTo-Json -Depth 10
    Write-Host 'JSON conversion successful' -ForegroundColor Green

    Write-Host "Data would be saved to: $OutputPath" -ForegroundColor Gray

    return $result
}
catch {
    Write-Error 'Test failed'
    exit 1
}
