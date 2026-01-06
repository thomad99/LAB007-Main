// GoldenSun Project - Master Image Management
// Author: LAB007.AI
// Version: 1.0

let masterImagesData = null;
let selectedImages = new Set();

// Load master images data on page load
document.addEventListener('DOMContentLoaded', function() {
    loadMasterImages({ initial: true });
});

// Load master images from JSON file
async function loadMasterImages(options = {}) {
    const { initial = false } = options;
    showLoading(initial ? 'Loading master images...' : 'Refreshing master images...');
    hideError();
    
    try {
        const response = await fetch('/data/goldensun-master-images.json', { cache: 'no-cache' });
        
        if (!response.ok) {
            throw new Error(`Failed to load data: ${response.statusText}`);
        }
        
        masterImagesData = await response.json();
        
        if (masterImagesData.Error) {
            showError(`Error in data: ${masterImagesData.Error}`);
            hideLoading();
            return;
        }
        
        displayMasterImages();
        hideLoading();
        document.getElementById('content').style.display = 'block';
        document.getElementById('createCloneScriptBtn').style.display = 'inline-block';
        
    } catch (error) {
        console.error('Error loading master images:', error);
        showError(`Failed to load master images data. Please ensure the data file exists and is accessible. Error: ${error.message}`);
        hideLoading();
    }
}

// Trigger server-side collection of master images
async function collectMasterImages() {
    showLoading('Collecting master images (SHC-M-*)...');
    hideError();
    document.getElementById('content').style.display = 'none';
    
    try {
        const response = await fetch('/api/collect-master-images', {
            method: 'POST'
        });
        
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Collect result:', result);
        await loadMasterImages({ initial: false });
    } catch (error) {
        console.error('Collect error:', error);
        showError(`Failed to collect master images. ${error.message || error}`);
        hideLoading();
    }
}

// Display master images
function displayMasterImages() {
    // Update summary cards
    document.getElementById('vCenterServer').textContent = masterImagesData.vCenterServer || 'Unknown';
    document.getElementById('totalImages').textContent = masterImagesData.TotalImages || 0;
    document.getElementById('lastUpdated').textContent = masterImagesData.CollectedAt || 'Unknown';
    
    // Display master images list
    const listContainer = document.getElementById('masterImagesList');
    
    if (!masterImagesData.MasterImages || masterImagesData.MasterImages.length === 0) {
        listContainer.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No master images found. Click "Collect Master Images" to run discovery.</p>';
        return;
    }
    
    listContainer.innerHTML = '';
    
    masterImagesData.MasterImages.forEach((image, index) => {
        const imageCard = document.createElement('div');
        imageCard.className = 'master-image-card';
        imageCard.innerHTML = `
            <div class="image-card-header">
                <label class="checkbox-label">
                    <input type="checkbox" id="image_${index}" onchange="toggleImageSelection('${image.Name}', this.checked)">
                    <span class="image-name">${image.Name}</span>
                </label>
                <span class="image-version">${image.Version}</span>
            </div>
            <div class="image-card-body">
                <div class="image-details">
                    <div class="detail-row">
                        <span class="detail-label">Cluster:</span>
                        <span class="detail-value">${image.Cluster}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Host:</span>
                        <span class="detail-value">${image.Host}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Datastore:</span>
                        <span class="detail-value">${image.Datastore}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Power State:</span>
                        <span class="detail-value status-${image.PowerState.toLowerCase()}">${image.PowerState}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">CPU:</span>
                        <span class="detail-value">${image.NumCPU} vCPU</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Memory:</span>
                        <span class="detail-value">${image.MemoryGB} GB</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Disk Size:</span>
                        <span class="detail-value">${image.ProvisionedSpaceGB} GB</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Guest OS:</span>
                        <span class="detail-value">${image.GuestOS || 'Unknown'}</span>
                    </div>
                    ${image.HasSnapshot ? `
                    <div class="detail-row">
                        <span class="detail-label">Latest Snapshot:</span>
                        <span class="detail-value">${image.LatestSnapshot ? image.LatestSnapshot.Name : 'N/A'}</span>
                    </div>
                    ` : ''}
                </div>
                ${image.Notes ? `<div class="image-notes">${image.Notes}</div>` : ''}
            </div>
        `;
        
        listContainer.appendChild(imageCard);
    });
}

// Toggle image selection
function toggleImageSelection(imageName, isSelected) {
    if (isSelected) {
        selectedImages.add(imageName);
    } else {
        selectedImages.delete(imageName);
    }
    
    updateSelectedCount();
}

// Update selected count and button state
function updateSelectedCount() {
    const count = selectedImages.size;
    document.getElementById('selectedCount').textContent = count;
    document.getElementById('createCloneScriptBtn').disabled = count === 0;
}

// Select all images
function selectAllImages() {
    if (!masterImagesData || !masterImagesData.MasterImages) return;
    
    selectedImages.clear();
    masterImagesData.MasterImages.forEach(image => {
        selectedImages.add(image.Name);
        const checkbox = document.querySelector(`input[onchange*="${image.Name}"]`);
        if (checkbox) checkbox.checked = true;
    });
    
    updateSelectedCount();
}

// Deselect all images
function deselectAllImages() {
    selectedImages.clear();
    
    document.querySelectorAll('#masterImagesList input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    
    updateSelectedCount();
}

// Create clone script
function createCloneScript() {
    if (selectedImages.size === 0) {
        alert('Please select at least one master image to clone.');
        return;
    }
    
    const selectedImageObjects = masterImagesData.MasterImages.filter(img => selectedImages.has(img.Name));
    
    // Generate PowerShell script
    let script = `# Clone Master Images Script
# Generated by LAB007 GoldenSun Project
# Generated: ${new Date().toLocaleString()}
# Total images to clone: ${selectedImages.size}

# Import VMware PowerCLI module
Import-Module VMware.PowerCLI -ErrorAction Stop

# Suppress certificate warnings
Set-PowerCLIConfiguration -InvalidCertificateAction Ignore -Confirm:$false -Scope Session | Out-Null

# Connect to vCenter
$vCenterServer = "${masterImagesData.vCenterServer}"
Write-Host "Connecting to vCenter: $vCenterServer..." -ForegroundColor Yellow
$connection = Connect-VIServer -Server $vCenterServer -ErrorAction Stop
Write-Host "Connected successfully!" -ForegroundColor Green

# Clone results
$results = @()

`;

    selectedImageObjects.forEach(image => {
        // Calculate new VM name with version increment
        let newName = '';
        if (image.Name.match(/(.+?)(V)(\d+)$/)) {
            const match = image.Name.match(/(.+?)(V)(\d+)$/);
            const baseName = match[1];
            const versionNumber = parseInt(match[3]);
            const newVersionNumber = versionNumber + 1;
            newName = `${baseName}V${newVersionNumber}`;
        } else {
            newName = `${image.Name}V2`;
        }
        
        script += `
# Clone: ${image.Name} -> ${newName}
Write-Host ""
Write-Host "Cloning ${image.Name} to ${newName}..." -ForegroundColor Cyan
try {
    $sourceVM = Get-VM -Name "${image.Name}" -ErrorAction Stop
    
    # Check if target VM already exists
    $existingVM = Get-VM -Name "${newName}" -ErrorAction SilentlyContinue
    if ($existingVM) {
        Write-Warning "VM ${newName} already exists. Skipping..."
        $results += @{
            SourceVM = "${image.Name}"
            TargetVM = "${newName}"
            Status = "Skipped - Already Exists"
        }
    }
    else {
        # Get source VM location details
        $vmHost = Get-VMHost -VM $sourceVM
        $datastore = Get-Datastore -VM $sourceVM | Select-Object -First 1
        $resourcePool = Get-ResourcePool -VM $sourceVM -ErrorAction SilentlyContinue
        
        # Clone the VM
        $cloneParams = @{
            VM = $sourceVM
            Name = "${newName}"
            VMHost = $vmHost
            Datastore = $datastore
        }
        
        if ($resourcePool) {
            $cloneParams.ResourcePool = $resourcePool
        }
        
        $newVM = New-VM @cloneParams -ErrorAction Stop
        
        Write-Host "✓ Successfully cloned to ${newName}" -ForegroundColor Green
        $results += @{
            SourceVM = "${image.Name}"
            TargetVM = "${newName}"
            Status = "Success"
            PowerState = $newVM.PowerState
        }
    }
}
catch {
    Write-Error "Failed to clone ${image.Name}: $_"
    $results += @{
        SourceVM = "${image.Name}"
        TargetVM = "${newName}"
        Status = "Failed"
        Error = $_.Exception.Message
    }
}
`;
    });

    script += `
# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Clone Operation Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
$results | ForEach-Object {
    Write-Host "$($_.SourceVM) -> $($_.TargetVM): $($_.Status)" -ForegroundColor $(if ($_.Status -eq "Success") { "Green" } elseif ($_.Status -like "Skipped*") { "Yellow" } else { "Red" })
}

# Disconnect from vCenter
Disconnect-VIServer -Server $vCenterServer -Confirm:$false
Write-Host ""
Write-Host "Disconnected from vCenter" -ForegroundColor Gray
Write-Host "Clone operation completed!" -ForegroundColor Green
`;

    // Display script
    document.getElementById('scriptContent').value = script;
    document.getElementById('scriptOutput').style.display = 'block';
    
    // Scroll to script output
    document.getElementById('scriptOutput').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Copy script to clipboard
function copyScript() {
    const scriptContent = document.getElementById('scriptContent');
    scriptContent.select();
    document.execCommand('copy');
    
    alert('Script copied to clipboard!');
}

// Download script
function downloadScript() {
    const scriptContent = document.getElementById('scriptContent').value;
    const blob = new Blob([scriptContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Clone-MasterImages-${new Date().toISOString().split('T')[0]}.ps1`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Show loading indicator
function showLoading(message) {
    document.getElementById('loadingText').textContent = message;
    document.getElementById('loadingIndicator').style.display = 'flex';
}

// Hide loading indicator
function hideLoading() {
    document.getElementById('loadingIndicator').style.display = 'none';
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

// Hide error message
function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

