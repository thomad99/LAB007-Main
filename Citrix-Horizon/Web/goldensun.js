// GoldenSun Project - Master Image Management
// Author: LAB007.AI
// Version: 2.0

let loadedMasterImages = null;
let selectedImages = new Set();

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    setupFileInputHandlers();
    showGoldenSunTask('loadMasterImages');
});

// Tab switching functionality
function showGoldenSunTask(taskName) {
    // Hide all task panels
    const panels = document.querySelectorAll('.goldensun-task-panel');
    panels.forEach(panel => panel.classList.remove('active'));

    // Remove active class from all tabs
    const tabs = document.querySelectorAll('#goldensunTasksTabs .task-tab');
    tabs.forEach(tab => tab.classList.remove('active'));

    // Show selected task panel
    const selectedPanel = document.getElementById(taskName + 'Task');
    if (selectedPanel) {
        selectedPanel.classList.add('active');
    }

    // Activate selected tab
    event.target.classList.add('active');

    // Task-specific initialization
    if (taskName === 'cloneVirtualMachines') {
        updateCloneMasterImagesList();
    }
}

// File input handling
function setupFileInputHandlers() {
    const loadBtn = document.getElementById('loadMasterImagesBtn');
    const fileInput = document.getElementById('masterImagesFileInput');

    if (loadBtn && fileInput) {
        loadBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', handleMasterImagesFile);
    }
}

// Handle master images file selection
function handleMasterImagesFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            loadedMasterImages = JSON.parse(e.target.result);
            document.getElementById('loadedFileName').textContent = `Loaded: ${file.name}`;
            displayLoadedMasterImages();
            document.getElementById('loadedMasterImagesSection').style.display = 'block';
        } catch (error) {
            showError(`Error parsing JSON file: ${error.message}`);
        }
    };
    reader.readAsText(file);
}

// Load master images from file button
function loadMasterImagesFile() {
    const fileInput = document.getElementById('masterImagesFileInput');
    fileInput.click();
}

// Clone image selection functions
function toggleImageSelection(imageName) {
    if (selectedImages.has(imageName)) {
        selectedImages.delete(imageName);
    } else {
        selectedImages.add(imageName);
    }
    updateCloneSelectedCount();
}

function selectAllCloneImages() {
    if (!loadedMasterImages || !loadedMasterImages.MasterImages) return;

    loadedMasterImages.MasterImages.forEach(image => {
        selectedImages.add(image.Name);
    });
    updateCloneMasterImagesList();
}

function deselectAllCloneImages() {
    selectedImages.clear();
    updateCloneMasterImagesList();
}

function updateCloneSelectedCount() {
    // Update any selected count display if needed
}

// Generate clone script
function generateCloneScript() {
    const namingConvention = document.getElementById('cloneNamingConvention').value || 'HZ-M-xxxxxxx';
    const selectedImagesArray = Array.from(selectedImages);

    if (selectedImagesArray.length === 0) {
        alert('Please select at least one master image to clone.');
        return;
    }

    // Get selected image details
    const selectedImageDetails = loadedMasterImages.MasterImages.filter(img =>
        selectedImages.has(img.Name)
    );

    // Generate PowerShell script
    const script = generateCloneScriptContent(selectedImageDetails, namingConvention);

    // Display script
    document.getElementById('cloneScriptContent').value = script;
    document.getElementById('cloneScriptOutput').style.display = 'block';
}

// Generate clone script content
function generateCloneScriptContent(selectedImages, namingConvention) {
    let script = `# Clone-MasterImages.ps1
# Clones selected VMware master images with custom naming
# Author : LAB007.AI
# Version: 1.0
# Last Modified: 260106:2200

param(
    [switch]$WhatIf
)

# Selected images to clone
$ImagesToClone = @(
`;

    selectedImages.forEach((image, index) => {
        script += `    @{
        OriginalVMName = "${image.Name}"
        ClusterName = "${image.Cluster || 'Unknown'}"
        HostName = "${image.Host || 'Unknown'}"
        DatastoreName = "${image.Datastore || 'Unknown'}"
    }${index < selectedImages.length - 1 ? ',' : ''}

`;
    });

    script += `)

# Configuration
$NamingConvention = "${namingConvention}"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Master Image Clone Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Number of machines to clone: $($ImagesToClone.Count)" -ForegroundColor Yellow
Write-Host ""

# Clone each selected image
$cloneCount = 0
foreach ($image in $ImagesToClone) {
    $cloneCount++
    $originalVMName = $image.OriginalVMName
    $clusterName = $image.ClusterName

    # Generate new VM name
    $newVMName = $NamingConvention -replace 'xxxxxxx', $originalVMName

    Write-Host "[$cloneCount/$($ImagesToClone.Count)] Cloning: $originalVMName -> $newVMName" -ForegroundColor Yellow

    if ($WhatIf) {
        Write-Host "  WHATIF: Would clone $originalVMName to $newVMName on cluster $clusterName" -ForegroundColor Cyan
    } else {
        try {
            # Find the original VM
            $sourceVM = Get-VM -Name $originalVMName -ErrorAction Stop

            # Get cluster and datastore info
            $cluster = Get-Cluster -Name $clusterName -ErrorAction SilentlyContinue
            $datastore = Get-Datastore -VM $sourceVM -ErrorAction SilentlyContinue | Select-Object -First 1

            # Clone the VM
            $cloneParams = @{
                VM = $sourceVM
                Name = $newVMName
                Datastore = $datastore
            }

            if ($cluster) {
                $cloneParams.Cluster = $cluster
            }

            $newVM = New-VM @cloneParams -ErrorAction Stop

            Write-Host "  SUCCESS: Cloned to $newVMName" -ForegroundColor Green
            Write-Host "    Power State: $($newVM.PowerState)" -ForegroundColor Gray
            Write-Host "    CPUs: $($newVM.NumCpu)" -ForegroundColor Gray
            Write-Host "    Memory: $($newVM.MemoryGB) GB" -ForegroundColor Gray
        }
        catch {
            Write-Host "  ERROR: Failed to clone $originalVMName : $_" -ForegroundColor Red
        }
    }

    Write-Host ""
}

if ($WhatIf) {
    Write-Host "WHATIF MODE: No actual cloning performed" -ForegroundColor Cyan
} else {
    Write-Host "Cloning operation completed!" -ForegroundColor Green
}
`;

    return script;
}

// Copy clone script to clipboard
function copyCloneScript() {
    const scriptContent = document.getElementById('cloneScriptContent');
    scriptContent.select();
    document.execCommand('copy');

    // Show brief feedback
    const originalText = scriptContent.value;
    scriptContent.value = 'Script copied to clipboard!';
    setTimeout(() => {
        scriptContent.value = originalText;
    }, 2000);
}

// Download clone script
function downloadCloneScript() {
    const scriptContent = document.getElementById('cloneScriptContent').value;
    const blob = new Blob([scriptContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Clone-MasterImages.ps1';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
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
$connection = Connect-VIServer -Server $vCenterServer -ErrorAction Stop

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
    a.download = 'Clone-Images.ps1';
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

// Find Master Images Form Functions
function createFindScript() {
    const vCenterServer = document.getElementById('vCenterServerInput').value.trim();
    const masterPrefix = document.getElementById('masterPrefixInput').value.trim();

    if (!vCenterServer) {
        alert('Please enter a vCenter Server name or IP address.');
        return;
    }

    if (!masterPrefix) {
        alert('Please enter a Master Image Prefix.');
        return;
    }

    // Generate the customized script
    const customScript = generateFindScript(vCenterServer, masterPrefix);

    // Display the script
    document.getElementById('findScriptContent').value = customScript;
    document.getElementById('findScriptOutput').style.display = 'block';

    // Scroll to the script output
    document.getElementById('findScriptOutput').scrollIntoView({ behavior: 'smooth' });
}

function generateFindScript(vCenterServer, masterPrefix) {
    // Read the base script template (script 20)
    const baseScript = `# Get-VMwareMasterImages.ps1
# Discovers VMware VMs matching ${masterPrefix} pattern for GoldenSun project
# Connects to vCenter and extracts master image information
# Author : LAB007.AI
# Version: 1.0
# Last Modified: 260106:1948

param(
    [string]$OutputPath = ".\\Data\\goldensun-master-images.json",
    [string]$vCenterServer = "${vCenterServer}"
)

# Ensure output directory exists
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

try {
    # Check if VMware PowerCLI is available
    $vmwareModule = Get-Module -ListAvailable -Name VMware.PowerCLI
    if (-not $vmwareModule) {
        Write-Error "VMware PowerCLI module not found. Please install it first."
        Write-Host "You can install it with: Install-Module -Name VMware.PowerCLI -Scope CurrentUser" -ForegroundColor Yellow
        exit 1
    }

    # Import VMware PowerCLI module
    Import-Module VMware.PowerCLI -ErrorAction Stop

    # Suppress certificate warnings
    Set-PowerCLIConfiguration -InvalidCertificateAction Ignore -Confirm:$false -Scope Session | Out-Null

    # Prompt for vCenter server (default provided)
    $inputServer = Read-Host "Enter vCenter Server name or IP [$vCenterServer]"
    if (-not [string]::IsNullOrWhiteSpace($inputServer)) {
        $vCenterServer = $inputServer
    }
    if ([string]::IsNullOrWhiteSpace($vCenterServer)) {
        Write-Error 'vCenter Server name is required'
        exit 1
    }

    # Prompt for credentials
    $credential = Get-Credential -Message "Enter vCenter credentials for $vCenterServer"

    # Connect to vCenter (will prompt for credentials)
    try {
        $connection = Connect-VIServer -Server $vCenterServer -Credential $credential -ErrorAction Stop
        Write-Host "Successfully connected to $vCenterServer" -ForegroundColor Green
    }
    catch {
        Write-Error "Failed to connect to vCenter: $_"
        exit 1
    }

    # Search for VMs matching the specified pattern
    Write-Host 'Searching for VMs matching pattern ${masterPrefix}...' -ForegroundColor Yellow

    $vms = Get-VM -Name '${masterPrefix}*' -ErrorAction SilentlyContinue

    if (-not $vms -or $vms.Count -eq 0) {
        Write-Warning 'No VMs found matching pattern ${masterPrefix}*'
        $masterImages = @()
    } else {
        Write-Host "Found $($vms.Count) master image(s)" -ForegroundColor Green

        $masterImages = @()

        foreach ($vm in $vms) {
            # Processing output removed for cleaner display

            # Get VM details
            $vmView = $vm | Get-View
            $cluster = Get-Cluster -VM $vm -ErrorAction SilentlyContinue
            $vmHost = Get-VMHost -VM $vm -ErrorAction SilentlyContinue
            $datastore = Get-Datastore -VM $vm -ErrorAction SilentlyContinue | Select-Object -First 1

            # Parse VM name to extract components
            # Expected format: ${masterPrefix}{ImageName}V{Version} or ${masterPrefix}{ImageName}
            $vmName = $vm.Name
            $shortName = $vmName
            $clusterName = if ($cluster) { $cluster.Name } else { 'Unknown' }
            $version = 'V1'

            # Extract version if present (look for V followed by number at the end)
            if ($vmName -match '(.+?)(V\\d+)$') {
                $shortName = $matches[1]
                $version = $matches[2]
            }

            # Get snapshot information
            $snapshots = Get-Snapshot -VM $vm -ErrorAction SilentlyContinue
            $hasSnapshot = ($snapshots -and $snapshots.Count -gt 0)
            $latestSnapshot = if ($hasSnapshot) {
                $snapshots | Sort-Object -Property Created -Descending | Select-Object -First 1
            } else {
                $null
            }

            $imageInfo = @{
                Name = $vmName
                ShortName = $shortName
                Version = $version
                Cluster = $clusterName
                Host = if ($vmHost) { $vmHost.Name } else { 'Unknown' }
                Datastore = if ($datastore) { $datastore.Name } else { 'Unknown' }
                PowerState = $vm.PowerState.ToString()
                NumCPU = $vm.NumCpu
                MemoryGB = $vm.MemoryGB
                ProvisionedSpaceGB = [math]::Round($vm.ProvisionedSpaceGB, 2)
                UsedSpaceGB = [math]::Round($vm.UsedSpaceGB, 2)
                GuestOS = $vm.Guest.OSFullName
                HasSnapshot = $hasSnapshot
                SnapshotCount = if ($snapshots) { $snapshots.Count } else { 0 }
                LatestSnapshot = if ($latestSnapshot) {
                    @{
                        Name = $latestSnapshot.Name
                        Description = $latestSnapshot.Description
                        Created = $latestSnapshot.Created.ToString('yyyy-MM-dd HH:mm:ss')
                        SizeGB = [math]::Round($latestSnapshot.SizeGB, 2)
                    }
                } else {
                    $null
                }
                Notes = $vm.Notes
            }

            $masterImages += $imageInfo
            Write-Host "  SUCCESS: $vmName - Cluster: $clusterName, Version: $version" -ForegroundColor Green
        }
    }

    # Create result object
    $result = @{
        TotalImages = $masterImages.Count
        vCenterServer = $vCenterServer
        CollectedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        MasterImages = $masterImages
    }

    # Convert to JSON and save
    $jsonContent = $result | ConvertTo-Json -Depth 10
    $jsonContent | Out-File -FilePath $OutputPath -Encoding UTF8 -Force

    Write-Host ''
    Write-Host 'Master images information collected successfully!' -ForegroundColor Green
    Write-Host "Total images found: $($masterImages.Count)" -ForegroundColor White
    Write-Host ''
    Write-Host '===========================' -ForegroundColor Green
    Write-Host "Data saved to: $OutputPath" -ForegroundColor Green
    Write-Host '===========================' -ForegroundColor Green

    # Disconnect from vCenter
    Disconnect-VIServer -Server $vCenterServer -Confirm:$false -ErrorAction SilentlyContinue

    return $result
}
catch {
    Write-Error 'Failed to collect master images information: $_'

    # Try to disconnect if connected
    try {
        Disconnect-VIServer -Server '*' -Confirm:$false -ErrorAction SilentlyContinue
    }
    catch {
        # Ignore disconnect errors
    }

    # Save error result
    $errorResult = @{
        TotalImages = 0
        vCenterServer = if ($vCenterServer) { $vCenterServer } else { 'Unknown' }
        CollectedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        MasterImages = @()
        Error = $_.ToString()
    }

    $errorResult | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8 -Force

    exit 1
}`;

    return baseScript;
}

function resetFindForm() {
    document.getElementById('vCenterServerInput').value = 'shcvcsacx01.ccr.cchcs.org';
    document.getElementById('masterPrefixInput').value = 'SHC-M-';
    document.getElementById('findScriptOutput').style.display = 'none';
}

function copyFindScript() {
    const scriptContent = document.getElementById('findScriptContent');
    scriptContent.select();
    document.execCommand('copy');

    // Show brief feedback
    const originalText = scriptContent.value;
    scriptContent.value = 'Script copied to clipboard!';
    setTimeout(() => {
        scriptContent.value = originalText;
    }, 2000);
}

function downloadFindScript() {
    const scriptContent = document.getElementById('findScriptContent').value;
    const vCenterServer = document.getElementById('vCenterServerInput').value.trim();
    const masterPrefix = document.getElementById('masterPrefixInput').value.trim();

    // Create filename with parameters
    const safeVCenter = vCenterServer.replace(/[^a-zA-Z0-9]/g, '_');
    const safePrefix = masterPrefix.replace(/[^a-zA-Z0-9\-]/g, '_');
    const filename = `Get-VMwareMasterImages_${safeVCenter}_${safePrefix}.ps1`;

    // Create and download the file
    const blob = new Blob([scriptContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

