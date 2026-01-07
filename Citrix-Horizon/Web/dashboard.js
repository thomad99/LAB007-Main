// dashboard.js
// JavaScript for Citrix Audit Dashboard

let auditData = null;
let allServers = [];
let allApps = [];
let allDesktops = [];
let allDeliveryGroups = [];
let allCatalogs = [];
let allPolicies = [];
let allRoles = [];

let currentServers = [];
let currentApps = [];
let currentDesktops = [];
let currentDeliveryGroups = [];
let currentCatalogs = [];
let currentPolicies = [];
let currentRoles = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadDefaultData();
    
    document.getElementById('loadFileBtn').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput').addEventListener('change', handleFileLoad);
    
    // Horizon Tasks button
    document.getElementById('horizonTasksBtn').addEventListener('click', () => {
        if (auditData) {
            showHorizonTasksModal();
        }
    });
    
    // Debug ZIP upload functionality
    const uploadDebugBtn = document.getElementById('uploadDebugBtn');
    const debugFileInput = document.getElementById('debugFileInput');
    
    if (uploadDebugBtn && debugFileInput) {
        uploadDebugBtn.addEventListener('click', () => {
            debugFileInput.click();
        });
        
        debugFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                uploadDebugFile(e.target.files[0]);
            }
        });
    }
    
    // Search functionality
    document.getElementById('serverSearch').addEventListener('input', filterServers);
    document.getElementById('appSearch').addEventListener('input', filterApps);
    
    // Global search functionality
    const globalSearchInput = document.getElementById('globalSearch');
    if (globalSearchInput) {
        globalSearchInput.addEventListener('input', performGlobalSearch);
        globalSearchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                clearGlobalSearch();
            }
        });
    }
    
    // Animate loading text letter by letter
    animateLoadingText();
});

// Function to animate loading text letter by letter
function animateLoadingText() {
    const loadingText = document.getElementById('loadingText');
    if (!loadingText) return;
    
    const text = loadingText.textContent;
    const letters = text.split('');
    
    // Wrap each letter in a span
    loadingText.innerHTML = letters.map((letter, index) => {
        if (letter === ' ') {
            return '<span class="letter-space">&nbsp;</span>';
        }
        return `<span class="letter" style="animation-delay: ${index * 0.15}s">${letter}</span>`;
    }).join('');
}

// Load default data from Data folder or uploaded file
async function loadDefaultData() {
    showLoading();
    hideError();
    
    try {
        // Check if there's a file parameter in URL (from upload page)
        const urlParams = new URLSearchParams(window.location.search);
        const fileParam = urlParams.get('file');
        
        let response;
        
        if (fileParam) {
            // Load specific uploaded file
            response = await fetch(`/uploads/${fileParam}`);
        } else {
            // Try to load the standard uploaded file
            response = await fetch('/uploads/citrix-audit-complete.json');
            
            // If not found, try sample data
            if (!response.ok) {
                console.log('Uploaded file not found, trying sample data...');
                response = await fetch('../Data/sample-citrix-audit-complete.json');
            }
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        auditData = await response.json();
        displayDashboard(auditData);
    } catch (error) {
        console.error('Error loading data:', error);
        
        // If fetch fails, prompt user to select file or upload
        showError('You can download our tools or upload an Audit', false);
        
        // Auto-trigger file picker for convenience (if button exists)
        setTimeout(() => {
            const loadBtn = document.getElementById('loadFileBtn');
            if (loadBtn) {
                loadBtn.click();
            }
        }, 500);
        
        hideDashboard();
    }
}

// Handle file upload
function handleFileLoad(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    hideError();
    showLoading();
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            auditData = JSON.parse(e.target.result);
            displayDashboard(auditData);
        } catch (error) {
            showError('Error parsing JSON file: ' + error.message);
            hideDashboard();
        }
    };
    reader.onerror = function() {
        showError('Error reading file. Please try again.');
        hideDashboard();
    };
    reader.readAsText(file);
}

// Function to upload debug ZIP file
function uploadDebugFile(file) {
    if (!file || !file.name.endsWith('.zip')) {
        alert('Please select a ZIP file');
        return;
    }
    
    const formData = new FormData();
    formData.append('debugFile', file);
    
    // Show loading indicator
    const loadingIndicator = document.getElementById('loadingIndicator');
    const loadingText = document.getElementById('loadingText');
    if (loadingIndicator && loadingText) {
        loadingIndicator.style.display = 'block';
        loadingText.textContent = `Uploading debug ZIP: ${file.name}...`;
    }
    
    fetch('/citrix/api/upload-debug', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (loadingText) {
                loadingText.textContent = `Debug ZIP uploaded successfully! File: ${data.file.filename}`;
            }
            setTimeout(() => {
                if (loadingIndicator) {
                    loadingIndicator.style.display = 'none';
                }
                if (loadingText) {
                    loadingText.textContent = 'Awaiting your command';
                }
            }, 2000);
            // Reset file input
            const debugFileInput = document.getElementById('debugFileInput');
            if (debugFileInput) {
                debugFileInput.value = '';
            }
        } else {
            alert('Upload failed: ' + (data.error || 'Unknown error'));
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            if (loadingText) {
                loadingText.textContent = 'Awaiting your command';
            }
        }
    })
    .catch(error => {
        alert('Upload error: ' + error.message);
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
        if (loadingText) {
            loadingText.textContent = 'Awaiting your command';
        }
    });
}

// Display dashboard with data
function displayDashboard(data) {
    auditData = data;
    hideLoading();
    showDashboard();
    hideError();
    
    // Enable Horizon Tasks button
    const horizonTasksBtn = document.getElementById('horizonTasksBtn');
    if (horizonTasksBtn) {
        horizonTasksBtn.disabled = false;
        horizonTasksBtn.style.opacity = '1';
        horizonTasksBtn.style.cursor = 'pointer';
    }
    
    // Populate summary cards
    document.getElementById('siteName').textContent = data.SiteName || data.summary?.SiteName || 'N/A';
    document.getElementById('totalApps').textContent = data.TotalPublishedApplications || data.summary?.TotalPublishedApplications || 0;
    document.getElementById('totalDesktops').textContent = data.TotalPublishedDesktops || data.summary?.TotalPublishedDesktops || 0;
    document.getElementById('maxConcurrent').textContent = data.MaxConcurrentUsers_30Days || data.summary?.MaxConcurrentUsers_30Days || 0;
    document.getElementById('licenseType').textContent = data.LicenseType || data.summary?.LicenseType || 'Unknown';
    document.getElementById('controllerCount').textContent = data.ControllerCount || data.summary?.ControllerCount || 0;
    document.getElementById('numCatalogs').textContent = data.NumberOfCatalogs || data.summary?.NumberOfCatalogs || 0;
    document.getElementById('numDeliveryGroups').textContent = data.NumberOfDeliveryGroups || data.summary?.NumberOfDeliveryGroups || 0;
    document.getElementById('uniqueUsers').textContent = data.UniqueUserConnections_30Days || data.summary?.UniqueUserConnections_30Days || 0;
    document.getElementById('totalServers').textContent = data.TotalNumberOfServers || data.summary?.TotalNumberOfServers || data.Servers?.length || 0;
    document.getElementById('totalMasterImages').textContent = data.TotalUniqueMasterImages || 0;
    document.getElementById('totalStoreFrontStores').textContent = data.TotalStoreFrontStores || data.StoreFront?.TotalStores || 0;
    
    // Populate servers table
    if (data.Servers && data.Servers.length > 0) {
        allServers = data.Servers;
        displayServersTable(allServers);
    } else {
        document.getElementById('serversTableBody').innerHTML = 
            '<tr><td colspan="11" class="empty-state">No server data available</td></tr>';
    }
    
    // Populate applications table
    if (data.Applications && data.Applications.length > 0) {
        allApps = data.Applications;
        displayAppsTable(allApps);
    } else {
        document.getElementById('appsTableBody').innerHTML = 
            '<tr><td colspan="5" class="empty-state">No application data available</td></tr>';
    }

    // Desktops
    if (data.Desktops && data.Desktops.length > 0) {
        allDesktops = data.Desktops;
        currentDesktops = [...allDesktops];
    } else {
        allDesktops = [];
        currentDesktops = [];
    }
    
    // Populate delivery groups table
    if (data.DeliveryGroups && data.DeliveryGroups.length > 0) {
        allDeliveryGroups = data.DeliveryGroups;
        displayDeliveryGroupsTable(allDeliveryGroups);
    } else {
        allDeliveryGroups = [];
        document.getElementById('deliveryGroupsTableBody').innerHTML = 
            '<tr><td colspan="10" class="empty-state">No delivery group data available</td></tr>';
    }
    
    // Populate catalogs table
    if (data.Catalogs && data.Catalogs.length > 0) {
        allCatalogs = data.Catalogs;
        displayCatalogsTable(allCatalogs);
    } else {
        allCatalogs = [];
        document.getElementById('catalogsTableBody').innerHTML = 
            '<tr><td colspan="8" class="empty-state">No catalog data available</td></tr>';
    }
    
    // Populate policies table
    if (data.Policies && data.Policies.length > 0) {
        allPolicies = data.Policies;
        displayPoliciesTable(allPolicies);
    } else {
        allPolicies = [];
        document.getElementById('policiesTableBody').innerHTML = 
            '<tr><td colspan="5" class="empty-state">No policy data available</td></tr>';
    }
    
    // Populate roles table
    if (data.Roles && data.Roles.length > 0) {
        allRoles = data.Roles;
        displayRolesTable(allRoles);
    } else {
        allRoles = [];
        displayRolesTable([]);
    }
    
    // Initialize sorting for all tables
    initializeTableSorting('serversTable');
    initializeTableSorting('appsTable');
    initializeTableSorting('deliveryGroupsTable');
    initializeTableSorting('catalogsTable');
    initializeTableSorting('policiesTable');
    initializeTableSorting('rolesTable');
}

// Show catalog list modal
function showCatalogList() {
    if (!auditData || !auditData.Catalogs || auditData.Catalogs.length === 0) {
        alert('No catalog data available');
        return;
    }
    
    const modal = document.getElementById('catalogModal');
    const content = document.getElementById('catalogListContent');
    
    let html = '<ul>';
    auditData.Catalogs.forEach(catalog => {
        html += `<li><strong>${escapeHtml(catalog.Name || 'Unknown')}</strong></li>`;
    });
    html += '</ul>';
    html += `<p><strong>Total: ${auditData.Catalogs.length} catalogs</strong></p>`;
    
    content.innerHTML = html;
    modal.style.display = 'block';
}

// Close catalog modal
function closeCatalogModal() {
    document.getElementById('catalogModal').style.display = 'none';
}

// Show desktops modal
function showDesktopList() {
    if (!auditData || !allDesktops || allDesktops.length === 0) {
        alert('No desktop data available');
        return;
    }

    const modal = document.getElementById('desktopsModal');
    const tbody = document.getElementById('desktopsTableBody');

    tbody.innerHTML = '';
    allDesktops.forEach(desktop => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(desktop.Name || 'N/A')}</td>
            <td>${escapeHtml(desktop.DesktopKind || 'N/A')}</td>
            <td>${escapeHtml(desktop.SessionSupport || 'N/A')}</td>
            <td>${desktop.TotalMachines || 0}</td>
            <td>${desktop.AvailableCount || 0}</td>
            <td>${desktop.InUseCount || 0}</td>
            <td><span class="status-badge ${desktop.MaintenanceMode ? 'status-maintenance' : 'status-enabled'}">${desktop.MaintenanceMode ? 'Yes' : 'No'}</span></td>
            <td><span class="status-badge ${desktop.Enabled ? 'status-enabled' : 'status-disabled'}">${desktop.Enabled ? 'Enabled' : 'Disabled'}</span></td>
        `;
        tbody.appendChild(row);
    });

    modal.style.display = 'block';
}

function closeDesktopsModal() {
    document.getElementById('desktopsModal').style.display = 'none';
}

// Show delivery groups list (simple names list)
function showDeliveryGroupList() {
    if (!auditData || !allDeliveryGroups || allDeliveryGroups.length === 0) {
        alert('No delivery group data available');
        return;
    }

    const modal = document.getElementById('deliveryGroupsModal');
    const tbody = document.getElementById('deliveryGroupsModalTableBody');
    
    // Clear existing content
    tbody.innerHTML = '';
    
    // Populate table with all delivery group data (same as expanded section)
    allDeliveryGroups.forEach(group => {
        const row = document.createElement('tr');
        const restartSchedule = group.RestartSchedule || (group.RestartScheduleEnabled ? 'Enabled (Details N/A)' : 'Not Configured');
        row.innerHTML = `
            <td>${escapeHtml(group.Name || 'N/A')}</td>
            <td>${escapeHtml(group.DesktopKind || 'N/A')}</td>
            <td>${escapeHtml(group.SessionSupport || 'N/A')}</td>
            <td>${group.TotalMachines || 0}</td>
            <td>${group.AvailableCount || 0}</td>
            <td>${group.InUseCount || 0}</td>
            <td>${group.TotalApplications || 0}</td>
            <td>${escapeHtml(restartSchedule)}</td>
            <td><span class="status-badge ${group.InMaintenanceMode ? 'status-maintenance' : 'status-enabled'}">${group.InMaintenanceMode ? 'Yes' : 'No'}</span></td>
            <td><span class="status-badge ${group.Enabled ? 'status-enabled' : 'status-disabled'}">${group.Enabled ? 'Enabled' : 'Disabled'}</span></td>
        `;
        tbody.appendChild(row);
    });
    
    // Initialize sorting for the modal table
    initializeTableSorting('deliveryGroupsModalTable');
    
    modal.style.display = 'block';
}

function closeDeliveryGroupsModal() {
    document.getElementById('deliveryGroupsModal').style.display = 'none';
}

// Show users list (if present)
function showUserList() {
    const modal = document.getElementById('usersModal');
    const content = document.getElementById('usersListContent');

    if (!auditData) {
        content.innerHTML = '<p>No audit data loaded.</p>';
        modal.style.display = 'block';
        return;
    }

    // Try to find a user list in common properties
    const usersArray =
        auditData.Users ||
        auditData.UserConnections ||
        auditData.UserSessions ||
        auditData.UniqueUsers ||
        null;

    if (!usersArray || !Array.isArray(usersArray) || usersArray.length === 0) {
        const uniqueCount = auditData.UniqueUserConnections_30Days || auditData.summary?.UniqueUserConnections_30Days || 'unknown';
        content.innerHTML = `<p>A detailed user list is not available in this dataset. The summary indicates <strong>${uniqueCount}</strong> unique users in the last 30 days.</p>`;
        modal.style.display = 'block';
        return;
    }

    let html = '<ul>';
    usersArray.forEach(user => {
        if (typeof user === 'string') {
            html += `<li>${escapeHtml(user)}</li>`;
        } else if (typeof user === 'object' && user !== null) {
            const name = user.UserName || user.SamAccountName || user.Name || JSON.stringify(user);
            html += `<li>${escapeHtml(name)}</li>`;
        }
    });
    html += '</ul>';
    html += `<p><strong>Total listed users: ${usersArray.length}</strong></p>`;

    content.innerHTML = html;
    modal.style.display = 'block';
}

function closeUsersModal() {
    document.getElementById('usersModal').style.display = 'none';
}

// Parse Citrix image path to extract components
function parseImagePath(imagePath) {
    if (!imagePath) {
        return {
            fullPath: 'N/A',
            clusterName: 'N/A',
            vmName: 'N/A',
            snapshotName: 'N/A'
        };
    }
    
    // Remove XDHyp:\ prefix if present
    let path = imagePath.replace(/^XDHyp:\\?/i, '');
    
    // Split by backslash
    const parts = path.split('\\').filter(p => p.trim() !== '');
    
    let clusterName = 'N/A';
    let vmName = 'N/A';
    let snapshotName = 'N/A';
    
    // Find HostingUnits index
    const hostingUnitsIndex = parts.findIndex(p => p.toLowerCase() === 'hostingunits');
    
    if (hostingUnitsIndex >= 0 && parts.length > hostingUnitsIndex + 1) {
        // Cluster name is after HostingUnits
        clusterName = parts[hostingUnitsIndex + 1];
        
        // Find .vm file
        const vmIndex = parts.findIndex(p => p.toLowerCase().endsWith('.vm'));
        if (vmIndex >= 0) {
            // VM name is the part before .vm
            vmName = parts[vmIndex].replace(/\.vm$/i, '');
            
            // Snapshot names are after the .vm, ending with .snapshot
            // Get the last snapshot (most recent)
            const snapshotParts = parts.slice(vmIndex + 1).filter(p => p.toLowerCase().endsWith('.snapshot'));
            if (snapshotParts.length > 0) {
                snapshotName = snapshotParts[snapshotParts.length - 1].replace(/\.snapshot$/i, '');
            }
        }
    }
    
    return {
        fullPath: imagePath,
        clusterName: clusterName,
        vmName: vmName,
        snapshotName: snapshotName
    };
}

function showMasterImagesList() {
    const modal = document.getElementById('masterImagesModal');
    const tbody = document.getElementById('masterImagesTableBody');
    
    if (!auditData || !auditData.UniqueMasterImages || auditData.UniqueMasterImages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No master images data available</td></tr>';
        modal.style.display = 'block';
        initializeTableSorting('masterImagesTable');
        return;
    }
    
    tbody.innerHTML = '';
    auditData.UniqueMasterImages.forEach(image => {
        // Get the full path - try Path first, then ImageMachineName, then Name
        const imagePath = image.Path || image.ImageMachineName || image.Name || image.MasterImagePath || '';
        
        // Parse the path
        const parsed = parseImagePath(imagePath);
        
        // Use parsed values, but fall back to existing fields if parsing didn't work
        const clusterName = parsed.clusterName !== 'N/A' ? parsed.clusterName : (image.ClusterName || image.HostingUnitName || 'N/A');
        const vmName = parsed.vmName !== 'N/A' ? parsed.vmName : (image.ImageMachineName || image.Name || 'N/A');
        const snapshotName = parsed.snapshotName !== 'N/A' ? parsed.snapshotName : (image.LatestSnapshotName || 'N/A');
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(clusterName)}</td>
            <td>${escapeHtml(vmName)}</td>
            <td>${escapeHtml(snapshotName)}</td>
            <td>${image.Catalogs && image.Catalogs.length > 0 ? escapeHtml(image.Catalogs.join(', ')) : 'N/A'}</td>
        `;
        tbody.appendChild(row);
    });
    
    modal.style.display = 'block';
    initializeTableSorting('masterImagesTable');
}

function closeMasterImagesModal() {
    document.getElementById('masterImagesModal').style.display = 'none';
}

// Horizon Environment Tasks Functions
function showHorizonTasksModal() {
    const modal = document.getElementById('horizonTasksModal');
    modal.style.display = 'block';
    showHorizonTask('masterImageSearch');
    // No special initialization needed for master image search
}

function closeHorizonTasksModal() {
    document.getElementById('horizonTasksModal').style.display = 'none';
}

function showHorizonTask(taskName) {
    // Hide all task panels
    const panels = document.querySelectorAll('.horizon-task-panel');
    panels.forEach(panel => panel.classList.remove('active'));
    
    // Remove active class from all tabs
    const tabs = document.querySelectorAll('.task-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Show selected task panel
    const selectedPanel = document.getElementById(taskName + 'Task');
    if (selectedPanel) {
        selectedPanel.classList.add('active');
    }
    
    // Activate selected tab
    event.target.classList.add('active');
    
    // Task-specific initialization
    if (taskName === 'masterImageSearch') {
        // No special initialization needed for master image search
    } else if (taskName === 'cloneMasterImage') {
        populateMasterImagesCloneList();
    } else if (taskName === 'addApplications') {
        populateApplicationsHZList();
    }
}

function populateMasterImagesCloneList() {
    const container = document.getElementById('masterImagesCloneList');
    
    if (!auditData || !auditData.UniqueMasterImages || auditData.UniqueMasterImages.length === 0) {
        container.innerHTML = '<p style="color: #666;">No master images data available. Please load audit data first.</p>';
        return;
    }
    
    container.innerHTML = '';
    
    auditData.UniqueMasterImages.forEach((image, index) => {
        const imagePath = image.Path || image.ImageMachineName || image.Name || image.MasterImagePath || '';
        const parsed = parseImagePath(imagePath);
        const clusterName = parsed.clusterName !== 'N/A' ? parsed.clusterName : (image.ClusterName || image.HostingUnitName || 'N/A');
        const vmName = parsed.vmName !== 'N/A' ? parsed.vmName : (image.ImageMachineName || image.Name || 'N/A');
        const snapshotName = parsed.snapshotName !== 'N/A' ? parsed.snapshotName : (image.LatestSnapshotName || 'N/A');
        
        const item = document.createElement('div');
        item.className = 'master-image-clone-item';
        item.innerHTML = `
            <input type="checkbox" id="cloneCheckbox${index}" data-vmname="${escapeHtml(vmName)}" data-path="${escapeHtml(imagePath)}" data-cluster="${escapeHtml(clusterName)}">
            <label for="cloneCheckbox${index}">
                <strong>${escapeHtml(vmName)}</strong>
                <span class="image-info">(Cluster: ${escapeHtml(clusterName)}, Snapshot: ${escapeHtml(snapshotName)})</span>
            </label>
        `;
        container.appendChild(item);
    });
}

function createCloneScript() {
    const namingConvention = document.getElementById('cloneNamingConvention').value || 'HZ-M-xxxxxxx';
    const checkboxes = document.querySelectorAll('#masterImagesCloneList input[type="checkbox"]:checked');
    
    if (checkboxes.length === 0) {
        alert('Please select at least one master image to clone.');
        return;
    }
    
    const selectedImages = Array.from(checkboxes).map(cb => ({
        vmName: cb.getAttribute('data-vmname'),
        path: cb.getAttribute('data-path'),
        cluster: cb.getAttribute('data-cluster')
    }));
    
    // Generate PowerShell script
    const script = generateCloneScript(selectedImages, namingConvention);
    
    // Display script
    document.getElementById('cloneScriptContent').value = script;
    document.getElementById('cloneScriptOutput').style.display = 'block';
    
    // Scroll to script output
    document.getElementById('cloneScriptOutput').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function generateCloneScript(selectedImages, namingConvention) {
    const scriptLines = [
        '# Clone Master Images Script',
        '# Generated by LAB007 Horizon Environment Tasks',
        '# ' + new Date().toISOString(),
        '#',
        '# This script clones selected master images with the specified naming convention',
        '#',
        '',
        '# Requires VMware PowerCLI',
        '# Install-Module -Name VMware.PowerCLI -Scope CurrentUser',
        '',
        '# Connect to vCenter',
        '# Connect-VIServer -Server <vCenterServer> -User <Username> -Password <Password>',
        '',
        '# Configuration',
        '$NamingConvention = "' + namingConvention + '"',
        '',
        '# Selected images to clone',
        '$ImagesToClone = @('
    ];
    
    selectedImages.forEach((img, index) => {
        scriptLines.push('    @{');
        scriptLines.push('        OriginalVMName = "' + img.vmName + '"');
        scriptLines.push('        OriginalPath = "' + img.path + '"');
        scriptLines.push('        ClusterName = "' + img.cluster + '"');
        scriptLines.push('    }' + (index < selectedImages.length - 1 ? ',' : ''));
    });
    
    scriptLines.push(')');
    scriptLines.push('');
    scriptLines.push('Write-Host "========================================" -ForegroundColor Cyan');
    scriptLines.push('Write-Host "Master Image Clone Script" -ForegroundColor Cyan');
    scriptLines.push('Write-Host "========================================" -ForegroundColor Cyan');
    scriptLines.push('Write-Host "Number of machines to clone: $($ImagesToClone.Count)" -ForegroundColor Yellow');
    scriptLines.push('Write-Host ""');
    scriptLines.push('');
    scriptLines.push('# Clone each selected image');
    scriptLines.push('$cloneCount = 0');
    scriptLines.push('foreach ($image in $ImagesToClone) {');
    scriptLines.push('    $cloneCount++');
    scriptLines.push('    $originalVMName = $image.OriginalVMName');
    scriptLines.push('    $clusterName = $image.ClusterName');
    scriptLines.push('    ');
    scriptLines.push('    Write-Host "[$cloneCount/$($ImagesToClone.Count)] Processing: $originalVMName" -ForegroundColor Cyan');
    scriptLines.push('    Write-Host "  Cluster: $clusterName" -ForegroundColor Gray');
    scriptLines.push('    ');
    scriptLines.push('    try {');
    scriptLines.push('        # Get the original VM');
    scriptLines.push('        Write-Host "  [DEBUG] Searching for VM: $originalVMName" -ForegroundColor DarkGray');
    scriptLines.push('        $sourceVM = Get-VM -Name $originalVMName -ErrorAction Stop');
    scriptLines.push('        ');
    scriptLines.push('        if (-not $sourceVM) {');
    scriptLines.push('            Write-Host "  [ERROR] VM not found: $originalVMName" -ForegroundColor Red');
    scriptLines.push('            continue');
    scriptLines.push('        }');
    scriptLines.push('        ');
    scriptLines.push('        # Get VM host and datastore information');
    scriptLines.push('        Write-Host "  [DEBUG] Getting VM host information..." -ForegroundColor DarkGray');
    scriptLines.push('        $vmHost = $sourceVM.VMHost');
    scriptLines.push('        $vmDatastore = $sourceVM.DatastoreIdList | ForEach-Object { Get-Datastore -Id $_ } | Select-Object -First 1');
    scriptLines.push('        $vmResourcePool = $sourceVM.ResourcePool');
    scriptLines.push('        ');
    scriptLines.push('        Write-Host "  [DEBUG] Source VM Details:" -ForegroundColor DarkGray');
    scriptLines.push('        Write-Host "    Host: $($vmHost.Name)" -ForegroundColor DarkGray');
    scriptLines.push('        Write-Host "    Datastore: $($vmDatastore.Name)" -ForegroundColor DarkGray');
    scriptLines.push('        Write-Host "    Resource Pool: $($vmResourcePool.Name)" -ForegroundColor DarkGray');
    scriptLines.push('        ');
    scriptLines.push('        # Generate new VM name based on naming convention');
    scriptLines.push('        $newVMName = $NamingConvention -replace "xxxxxxx", $originalVMName');
    scriptLines.push('        Write-Host "  [DEBUG] New VM name will be: $newVMName" -ForegroundColor DarkGray');
    scriptLines.push('        ');
    scriptLines.push('        # Check if target VM already exists');
    scriptLines.push('        Write-Host "  [DEBUG] Checking if target VM already exists..." -ForegroundColor DarkGray');
    scriptLines.push('        $existingVM = Get-VM -Name $newVMName -ErrorAction SilentlyContinue');
    scriptLines.push('        if ($existingVM) {');
    scriptLines.push('            Write-Host "  [WARNING] Target VM already exists: $newVMName" -ForegroundColor Yellow');
    scriptLines.push('            Write-Host "  [WARNING] Skipping clone operation for this VM" -ForegroundColor Yellow');
    scriptLines.push('            continue');
    scriptLines.push('        }');
    scriptLines.push('        ');
    scriptLines.push('        # Prepare clone specification');
    scriptLines.push('        Write-Host "  [DEBUG] Preparing clone specification..." -ForegroundColor DarkGray');
    scriptLines.push('        ');
    scriptLines.push('        Write-Host "  Preparing to clone machine $originalVMName" -ForegroundColor Yellow');
    scriptLines.push('        Write-Host "    from Host $($vmHost.Name) on Storage $($vmDatastore.Name)" -ForegroundColor Yellow');
    scriptLines.push('        Write-Host "    To Clone machine $newVMName" -ForegroundColor Yellow');
    scriptLines.push('        ');
    scriptLines.push('        # Perform the clone');
    scriptLines.push('        Write-Host "  [DEBUG] Starting clone operation..." -ForegroundColor DarkGray');
    scriptLines.push('        Write-Host "  Clone in progress..." -ForegroundColor Yellow');
    scriptLines.push('        ');
    scriptLines.push('        $newVM = New-VM -VM $sourceVM -Name $newVMName -VMHost $vmHost -Datastore $vmDatastore -ResourcePool $vmResourcePool -ErrorAction Stop');
    scriptLines.push('        ');
    scriptLines.push('        if ($newVM) {');
    scriptLines.push('            Write-Host "  [SUCCESS] Clone complete: $newVMName" -ForegroundColor Green');
    scriptLines.push('            Write-Host "    New VM ID: $($newVM.Id)" -ForegroundColor DarkGray');
    scriptLines.push('            Write-Host "    New VM Power State: $($newVM.PowerState)" -ForegroundColor DarkGray');
    scriptLines.push('        } else {');
    scriptLines.push('            Write-Host "  [ERROR] Clone operation completed but no VM was returned" -ForegroundColor Red');
    scriptLines.push('        }');
    scriptLines.push('        ');
    scriptLines.push('        Write-Host ""');
    scriptLines.push('    }');
    scriptLines.push('    catch {');
    scriptLines.push('        Write-Host "  [ERROR] Failed to clone $originalVMName : $($_.Exception.Message)" -ForegroundColor Red');
    scriptLines.push('        Write-Host "  [ERROR] Error details: $($_.Exception.GetType().FullName)" -ForegroundColor Red');
    scriptLines.push('        if ($_.Exception.InnerException) {');
    scriptLines.push('            Write-Host "  [ERROR] Inner exception: $($_.Exception.InnerException.Message)" -ForegroundColor Red');
    scriptLines.push('        }');
    scriptLines.push('        Write-Host ""');
    scriptLines.push('    }');
    scriptLines.push('}');
    scriptLines.push('');
    scriptLines.push('Write-Host "========================================" -ForegroundColor Cyan');
    scriptLines.push('Write-Host "Clone operation completed" -ForegroundColor Cyan');
    scriptLines.push('Write-Host "========================================" -ForegroundColor Cyan');
    
    return scriptLines.join('\n');
}

function copyCloneScript() {
    const scriptTextArea = document.getElementById('cloneScriptContent');
    scriptTextArea.select();
    document.execCommand('copy');
    
    // Show feedback
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    btn.style.backgroundColor = '#28a745';
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.backgroundColor = '';
    }, 2000);
}

function downloadCloneScript() {
    const scriptContent = document.getElementById('cloneScriptContent').value;
    const blob = new Blob([scriptContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Clone-MasterImages-' + new Date().toISOString().slice(0, 10) + '.ps1';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// Master Image Search Functions
function createMasterImageSearchScript() {
    const vCenterServer = document.getElementById('searchVCenterServer').value.trim();
    const masterPrefix = document.getElementById('searchMasterPrefix').value.trim();

    if (!vCenterServer) {
        alert('Please enter a vCenter Server name.');
        return;
    }

    if (!masterPrefix) {
        alert('Please enter a Master Image Prefix.');
        return;
    }

    // Generate the customized script
    const script = generateMasterImageSearchScript(vCenterServer, masterPrefix);

    // Display script
    document.getElementById('searchScriptContent').value = script;
    document.getElementById('searchScriptOutput').style.display = 'block';
}

function generateMasterImageSearchScript(vCenterServer, masterPrefix) {
    // Read the base script template (script 20)
    const baseScript = `# Get-VMwareMasterImages.ps1
# Discovers VMware VMs matching ${masterPrefix} pattern for GoldenSun project
# Connects to vCenter and extracts master image information
# Author : LAB007.AI
# Version: 1.0
# Last Modified: 260106:2115

param(
    [string]$OutputPath = '.\Data\goldensun-master-images.json',
    [string]$vCenterServer = '${vCenterServer}'
)

# Align output handling with other scripts (e.g., Get-CitrixCatalogs)
$outputDir = Split-Path -Path $OutputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# Setup debug logging
$debugFile = Join-Path $outputDir "debug20.txt"

# Force delete existing debug file to ensure clean start
if (Test-Path $debugFile) {
    try {
        Remove-Item $debugFile -Force -ErrorAction Stop
    } catch {
        Write-Warning "Could not delete existing debug file $debugFile : $_"
    }
}

try {
    Write-Host "[DEBUG] Script started at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] OutputPath: $OutputPath" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] vCenterServer: $vCenterServer" | Out-File -FilePath $debugFile -Append

    # Check if VMware PowerCLI is available
    $vmwareModule = Get-Module -ListAvailable -Name VMware.PowerCLI
    if (-not $vmwareModule) {
        Write-Error 'VMware PowerCLI module not found. Please install it first.'
        Write-Host 'You can install it with: Install-Module -Name VMware.PowerCLI -Scope CurrentUser' -ForegroundColor Yellow
        Write-Host "[DEBUG] VMware PowerCLI module not found" | Out-File -FilePath $debugFile -Append
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

    Write-Host "Connecting to vCenter Server: $vCenterServer..." -ForegroundColor Yellow

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
            Write-Host "Processing: $($vm.Name)..." -ForegroundColor Cyan

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
            Write-Host "  OK: $vmName - Cluster: $clusterName, Version: $version" -ForegroundColor Green
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
    Write-Host "Data saved to: $OutputPath" -ForegroundColor Gray

    Write-Host "[DEBUG] Collection completed successfully at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $debugFile -Append
    Write-Host "[DEBUG] Total images found: $($masterImages.Count)" | Out-File -FilePath $debugFile -Append

    # Disconnect from vCenter
    Disconnect-VIServer -Server $vCenterServer -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host 'Disconnected from vCenter' -ForegroundColor Gray

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

function copySearchScript() {
    const scriptContent = document.getElementById('searchScriptContent');
    scriptContent.select();
    document.execCommand('copy');

    // Show brief feedback
    const originalText = scriptContent.value;
    scriptContent.value = 'Script copied to clipboard!';
    setTimeout(() => {
        scriptContent.value = originalText;
    }, 2000);
}

function downloadSearchScript() {
    const scriptContent = document.getElementById('searchScriptContent').value;
    const vCenterServer = document.getElementById('searchVCenterServer').value.trim();
    const masterPrefix = document.getElementById('searchMasterPrefix').value.trim();

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

// Add Applications to HZ Functions
function populateApplicationsHZList() {
    const container = document.getElementById('applicationsHZList');
    
    if (!auditData || !auditData.Applications || auditData.Applications.length === 0) {
        container.innerHTML = '<p style="color: #666;">No application data available. Please load audit data first.</p>';
        return;
    }
    
    container.innerHTML = '';
    
    auditData.Applications.forEach((app, index) => {
        const appName = app.Name || app.ApplicationName || 'N/A';
        const executablePath = app.CommandLineExecutable || 'N/A';
        const workingDirectory = app.WorkingDirectory || 'N/A';
        const groups = Array.isArray(app.AssignedGroups) ? app.AssignedGroups : (app.AssignedGroups ? [app.AssignedGroups] : []);
        const primaryGroup = groups.length > 0 ? groups[0] : 'N/A';
        
        const item = document.createElement('div');
        item.className = 'master-image-clone-item';
        item.innerHTML = `
            <input type="checkbox" id="appCheckbox${index}" 
                   data-appname="${escapeHtml(appName)}" 
                   data-executable="${escapeHtml(executablePath)}" 
                   data-workdir="${escapeHtml(workingDirectory)}" 
                   data-groups="${escapeHtml(JSON.stringify(groups))}">
            <label for="appCheckbox${index}">
                <strong>${escapeHtml(appName)}</strong>
                <span class="image-info">(Executable: ${escapeHtml(executablePath)}, Path: ${escapeHtml(workingDirectory)}, Group: ${escapeHtml(primaryGroup)})</span>
            </label>
        `;
        container.appendChild(item);
    });
}

function createHorizonAppCommands() {
    const checkboxes = document.querySelectorAll('#applicationsHZList input[type="checkbox"]:checked');
    
    if (checkboxes.length === 0) {
        alert('Please select at least one application to generate commands.');
        return;
    }
    
    const selectedApps = Array.from(checkboxes).map(cb => ({
        appName: cb.getAttribute('data-appname'),
        executable: cb.getAttribute('data-executable'),
        workDir: cb.getAttribute('data-workdir'),
        groups: JSON.parse(cb.getAttribute('data-groups') || '[]')
    }));
    
    // Generate Horizon commands
    const commands = generateHorizonAppCommands(selectedApps);
    
    // Display commands
    document.getElementById('appCommandsContent').value = commands;
    document.getElementById('appCommandsOutput').style.display = 'block';
    
    // Scroll to commands output
    document.getElementById('appCommandsOutput').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function generateHorizonAppCommands(selectedApps) {
    const scriptLines = [
        '# Add Applications to Horizon Script',
        '# Generated by LAB007 HZ Builds',
        '# ' + new Date().toISOString(),
        '#',
        '# This script adds selected applications to VMware/OmniSSA Horizon',
        '#',
        '',
        '# Requires VMware Horizon PowerShell Module',
        '# Install-Module -Name VMware.Hv.Helper -Scope CurrentUser',
        '',
        '# Connect to Horizon Connection Server',
        '# $hvServer = Connect-HVServer -Server <HorizonServer> -User <Username> -Password <Password>',
        '# $services = $hvServer.ExtensionData',
        '',
        '# Configuration - Update these values as needed',
        '$HorizonDesktopPool = "Your-Desktop-Pool-Name"  # Update with your desktop pool name',
        '',
        'Write-Host "========================================" -ForegroundColor Cyan',
        'Write-Host "Add Applications to Horizon" -ForegroundColor Cyan',
        'Write-Host "========================================" -ForegroundColor Cyan',
        'Write-Host "Number of applications to add: $($selectedApps.Count)" -ForegroundColor Yellow',
        'Write-Host ""',
        '',
        '# Selected applications',
        '$selectedApps = @('
    ];
    
    selectedApps.forEach((app, index) => {
        scriptLines.push('    @{');
        scriptLines.push('        ApplicationName = "' + app.appName.replace(/"/g, '`"') + '"');
        scriptLines.push('        ExecutablePath = "' + app.executable.replace(/"/g, '`"') + '"');
        scriptLines.push('        WorkingDirectory = "' + app.workDir.replace(/"/g, '`"') + '"');
        scriptLines.push('        ADGroups = @(' + app.groups.map(g => '"' + g.replace(/"/g, '`"') + '"').join(', ') + ')');
        scriptLines.push('    }' + (index < selectedApps.length - 1 ? ',' : ''));
    });
    
    scriptLines.push(')');
    scriptLines.push('');
    scriptLines.push('# Process each application');
    scriptLines.push('$appCount = 0');
    scriptLines.push('foreach ($app in $selectedApps) {');
    scriptLines.push('    $appCount++');
    scriptLines.push('    $appName = $app.ApplicationName');
    scriptLines.push('    $executablePath = $app.ExecutablePath');
    scriptLines.push('    $workingDirectory = $app.WorkingDirectory');
    scriptLines.push('    $adGroups = $app.ADGroups');
    scriptLines.push('    ');
    scriptLines.push('    Write-Host "[$appCount/$($selectedApps.Count)] Processing: $appName" -ForegroundColor Cyan');
    scriptLines.push('    ');
    scriptLines.push('    try {');
    scriptLines.push('        # Get the desktop pool (update pool name as needed)');
    scriptLines.push('        Write-Host "  [DEBUG] Getting desktop pool: $HorizonDesktopPool" -ForegroundColor DarkGray');
    scriptLines.push('        $desktopPool = Get-HVPool -PoolName $HorizonDesktopPool -ErrorAction Stop');
    scriptLines.push('        ');
    scriptLines.push('        if (-not $desktopPool) {');
    scriptLines.push('            Write-Host "  [ERROR] Desktop pool not found: $HorizonDesktopPool" -ForegroundColor Red');
    scriptLines.push('            Write-Host "  [ERROR] Skipping application: $appName" -ForegroundColor Red');
    scriptLines.push('            continue');
    scriptLines.push('        }');
    scriptLines.push('        ');
    scriptLines.push('        Write-Host "  Application Name: $appName" -ForegroundColor Yellow');
    scriptLines.push('        Write-Host "  Executable Path: $executablePath" -ForegroundColor Yellow');
    scriptLines.push('        Write-Host "  Working Directory: $workingDirectory" -ForegroundColor Yellow');
    scriptLines.push('        Write-Host "  AD Groups: $($adGroups -join \', \')" -ForegroundColor Yellow');
    scriptLines.push('        ');
    scriptLines.push('        # Create application pool');
    scriptLines.push('        Write-Host "  [DEBUG] Creating application pool..." -ForegroundColor DarkGray');
    scriptLines.push('        ');
    scriptLines.push('        # Build New-HVApplication command');
    scriptLines.push('        $appParams = @{');
    scriptLines.push('            PoolId = $desktopPool.Id');
    scriptLines.push('            ExecutablePath = $executablePath');
    scriptLines.push('            DisplayName = $appName');
    scriptLines.push('        }');
    scriptLines.push('        ');
    scriptLines.push('        if ($workingDirectory -and $workingDirectory -ne "N/A") {');
    scriptLines.push('            $appParams.WorkingDirectory = $workingDirectory');
    scriptLines.push('        }');
    scriptLines.push('        ');
    scriptLines.push('        # Add application using New-HVApplication');
    scriptLines.push('        Write-Host "  Adding application to Horizon..." -ForegroundColor Yellow');
    scriptLines.push('        $newApp = New-HVApplication @appParams -ErrorAction Stop');
    scriptLines.push('        ');
    scriptLines.push('        if ($newApp) {');
    scriptLines.push('            Write-Host "  [SUCCESS] Application added: $appName" -ForegroundColor Green');
    scriptLines.push('            Write-Host "    Application ID: $($newApp.Id)" -ForegroundColor DarkGray');
    scriptLines.push('            ');
    scriptLines.push('            # Assign AD groups if provided');
    scriptLines.push('            if ($adGroups -and $adGroups.Count -gt 0) {');
    scriptLines.push('                Write-Host "  [DEBUG] Assigning AD groups..." -ForegroundColor DarkGray');
    scriptLines.push('                foreach ($group in $adGroups) {');
    scriptLines.push('                    if ($group -and $group -ne "N/A") {');
    scriptLines.push('                        try {');
    scriptLines.push('                            # Add entitlement for AD group');
    scriptLines.push('                            # Note: Update this command based on your Horizon version and API');
    scriptLines.push('                            # Get-HVEntitlement -ResourceType ApplicationPool -ResourceName $appName | Add-HVEntitlement -User $group');
    scriptLines.push('                            Write-Host "    [INFO] AD Group assignment: $group (update command as needed)" -ForegroundColor DarkGray');
    scriptLines.push('                        }');
    scriptLines.push('                        catch {');
    scriptLines.push('                            Write-Host "    [WARNING] Failed to assign group $group : $($_.Exception.Message)" -ForegroundColor Yellow');
    scriptLines.push('                        }');
    scriptLines.push('                    }');
    scriptLines.push('                }');
    scriptLines.push('            }');
    scriptLines.push('        } else {');
    scriptLines.push('            Write-Host "  [ERROR] Application creation completed but no application was returned" -ForegroundColor Red');
    scriptLines.push('        }');
    scriptLines.push('        ');
    scriptLines.push('        Write-Host ""');
    scriptLines.push('    }');
    scriptLines.push('    catch {');
    scriptLines.push('        Write-Host "  [ERROR] Failed to add application $appName : $($_.Exception.Message)" -ForegroundColor Red');
    scriptLines.push('        Write-Host "  [ERROR] Error details: $($_.Exception.GetType().FullName)" -ForegroundColor Red');
    scriptLines.push('        if ($_.Exception.InnerException) {');
    scriptLines.push('            Write-Host "  [ERROR] Inner exception: $($_.Exception.InnerException.Message)" -ForegroundColor Red');
    scriptLines.push('        }');
    scriptLines.push('        Write-Host ""');
    scriptLines.push('    }');
    scriptLines.push('}');
    scriptLines.push('');
    scriptLines.push('Write-Host "========================================" -ForegroundColor Cyan');
    scriptLines.push('Write-Host "Application addition completed" -ForegroundColor Cyan');
    scriptLines.push('Write-Host "========================================" -ForegroundColor Cyan');
    scriptLines.push('');
    scriptLines.push('# Disconnect from Horizon');
    scriptLines.push('# Disconnect-HVServer -Server $hvServer -Confirm:$false');
    
    return scriptLines.join('\n');
}

function copyAppCommands() {
    const commandsTextArea = document.getElementById('appCommandsContent');
    commandsTextArea.select();
    document.execCommand('copy');
    
    // Show feedback
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    btn.style.backgroundColor = '#28a745';
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.backgroundColor = '';
    }, 2000);
}

function downloadAppCommands() {
    const commandsContent = document.getElementById('appCommandsContent').value;
    const blob = new Blob([commandsContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Add-HorizonApplications-' + new Date().toISOString().slice(0, 10) + '.ps1';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function showStoreFrontStoresList() {
    const modal = document.getElementById('storeFrontStoresModal');
    const tbody = document.getElementById('storeFrontStoresTableBody');
    
    if (!auditData || !auditData.StoreFront || !auditData.StoreFront.Stores || auditData.StoreFront.Stores.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No StoreFront stores data available</td></tr>';
        modal.style.display = 'block';
        initializeTableSorting('storeFrontStoresTable');
        return;
    }
    
    tbody.innerHTML = '';
    auditData.StoreFront.Stores.forEach(store => {
        const row = document.createElement('tr');
        const details = JSON.stringify({
            AuthenticationService: store.AuthenticationService,
            WebReceiverService: store.WebReceiverService,
            StoreOptions: store.StoreOptions
        }, null, 2);
        
        row.innerHTML = `
            <td>${escapeHtml(store.Name || 'N/A')}</td>
            <td>${escapeHtml(store.BaseUrl || 'N/A')}</td>
            <td>${escapeHtml(store.FarmName || 'N/A')}</td>
            <td>${escapeHtml(store.VirtualPath || 'N/A')}</td>
            <td><pre style="max-width: 400px; overflow: auto; font-size: 0.85rem;">${escapeHtml(details)}</pre></td>
        `;
        tbody.appendChild(row);
    });
    
    modal.style.display = 'block';
    initializeTableSorting('storeFrontStoresTable');
}

function closeStoreFrontStoresModal() {
    document.getElementById('storeFrontStoresModal').style.display = 'none';
}

// Show app details modal
function showAppDetails() {
    if (!auditData || !auditData.Applications || auditData.Applications.length === 0) {
        alert('No application data available');
        return;
    }
    
    const modal = document.getElementById('appModal');
    const tbody = document.getElementById('appDetailsBody');
    
    tbody.innerHTML = '';
    auditData.Applications.forEach(app => {
        const row = document.createElement('tr');
        const runPath = app.CommandLineExecutable || 'N/A';
        const args = app.CommandLineArguments || 'N/A';
        const workDir = app.WorkingDirectory || 'N/A';
        const users = Array.isArray(app.AssignedUsers) ? app.AssignedUsers.join(', ') : (app.AssignedUsers || 'N/A');
        const groups = Array.isArray(app.AssignedGroups) ? app.AssignedGroups.join(', ') : (app.AssignedGroups || 'N/A');
        
        row.innerHTML = `
            <td>${escapeHtml(app.Name || app.ApplicationName || 'N/A')}</td>
            <td>${escapeHtml(app.PublishedName || 'N/A')}</td>
            <td>${escapeHtml(runPath)}</td>
            <td>${escapeHtml(args)}</td>
            <td>${escapeHtml(workDir)}</td>
            <td>${escapeHtml(users)}</td>
            <td>${escapeHtml(groups)}</td>
            <td>${escapeHtml(app.DesktopGroup || 'N/A')}</td>
            <td><span class="status-badge ${app.Enabled ? 'status-enabled' : 'status-disabled'}">${app.Enabled ? 'Enabled' : 'Disabled'}</span></td>
        `;
        tbody.appendChild(row);
    });
    
    modal.style.display = 'block';
}

// Close app modal
function closeAppModal() {
    document.getElementById('appModal').style.display = 'none';
}

// Display policies table
function displayPoliciesTable(policies) {
    const tbody = document.getElementById('policiesTableBody');
    tbody.innerHTML = '';
    currentPolicies = [...policies];
    
    policies.forEach(policy => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(policy.Name || 'N/A')}</td>
            <td><span class="status-badge ${policy.Enabled ? 'status-enabled' : 'status-disabled'}">${policy.Enabled ? 'Enabled' : 'Disabled'}</span></td>
            <td>${policy.Priority || 'N/A'}</td>
            <td><span class="status-badge ${policy.IsAssigned ? 'status-enabled' : 'status-disabled'}">${policy.IsAssigned ? 'Yes' : 'No'}</span></td>
            <td>${escapeHtml(policy.Description || 'N/A')}</td>
        `;
        tbody.appendChild(row);
    });
}

// Close modals when clicking outside
window.onclick = function(event) {
    const catalogModal = document.getElementById('catalogModal');
    const appModal = document.getElementById('appModal');
    const desktopsModal = document.getElementById('desktopsModal');
    const deliveryGroupsModal = document.getElementById('deliveryGroupsModal');
    const usersModal = document.getElementById('usersModal');
    const horizonTasksModal = document.getElementById('horizonTasksModal');
    if (event.target == catalogModal) {
        catalogModal.style.display = 'none';
    }
    if (event.target == appModal) {
        appModal.style.display = 'none';
    }
    if (event.target == desktopsModal) {
        desktopsModal.style.display = 'none';
    }
    if (event.target == deliveryGroupsModal) {
        deliveryGroupsModal.style.display = 'none';
    }
    if (event.target == usersModal) {
        usersModal.style.display = 'none';
    }
    if (event.target == horizonTasksModal) {
        horizonTasksModal.style.display = 'none';
    }
}

// Display servers table
function displayServersTable(servers) {
    const tbody = document.getElementById('serversTableBody');
    tbody.innerHTML = '';
    currentServers = [...servers];
    
    servers.forEach(server => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(server.Name || 'N/A')}</td>
            <td><span class="status-badge ${getStatusClass(server.PowerState)}">${escapeHtml(server.PowerState || 'Unknown')}</span></td>
            <td><span class="status-badge ${getRegistrationStatusClass(server.RegistrationState)}">${escapeHtml(server.RegistrationState || 'Unknown')}</span></td>
            <td>${formatNumber(server.TotalRAM_GB)}</td>
            <td>${server.CPUCores || 'N/A'}</td>
            <td>${server.CPULogicalProcessors || 'N/A'}</td>
            <td>${formatNumber(server.DiskTotalSize_GB)}</td>
            <td>${formatNumber(server.DiskFreeSpace_GB)}</td>
            <td>${escapeHtml(server.OSVersion || 'N/A')}</td>
            <td>${escapeHtml(server.DesktopGroup || 'N/A')}</td>
            <td>${getSpecsSourceBadge(server.SpecsSource)}</td>
        `;
        tbody.appendChild(row);
    });
    
    // Re-initialize sorting after table update
    initializeTableSorting('serversTable');
}

function getSpecsSourceBadge(specsSource) {
    if (specsSource === 'VMware') {
        return '<span class="status-badge status-enabled" title="Server specs collected from VMware vCenter/ESXi">VMware</span>';
    } else if (specsSource === 'CIM') {
        return '<span class="status-badge status-active" title="Server specs collected via CIM/WMI">CIM</span>';
    } else {
        return '<span class="status-badge status-disabled" title="No specs collected">None</span>';
    }
}

// Display applications table
function displayAppsTable(apps) {
    const tbody = document.getElementById('appsTableBody');
    tbody.innerHTML = '';
    currentApps = [...apps];
    
    apps.forEach(app => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(app.Name || app.ApplicationName || 'N/A')}</td>
            <td>${escapeHtml(app.PublishedName || 'N/A')}</td>
            <td>${escapeHtml(app.DesktopGroup || 'N/A')}</td>
            <td><span class="status-badge ${app.Enabled ? 'status-enabled' : 'status-disabled'}">${app.Enabled ? 'Enabled' : 'Disabled'}</span></td>
            <td>${escapeHtml(app.Description || 'N/A')}</td>
        `;
        tbody.appendChild(row);
    });
    
    // Re-initialize sorting after table update
    initializeTableSorting('appsTable');
}

// Display delivery groups table
function displayDeliveryGroupsTable(groups) {
    const tbody = document.getElementById('deliveryGroupsTableBody');
    tbody.innerHTML = '';
    currentDeliveryGroups = [...groups];
    
    groups.forEach(group => {
        const row = document.createElement('tr');
        const restartSchedule = group.RestartSchedule || (group.RestartScheduleEnabled ? 'Enabled (Details N/A)' : 'Not Configured');
        row.innerHTML = `
            <td>${escapeHtml(group.Name || 'N/A')}</td>
            <td>${escapeHtml(group.DesktopKind || 'N/A')}</td>
            <td>${escapeHtml(group.SessionSupport || 'N/A')}</td>
            <td>${group.TotalMachines || 0}</td>
            <td>${group.AvailableCount || 0}</td>
            <td>${group.InUseCount || 0}</td>
            <td>${group.TotalApplications || 0}</td>
            <td>${escapeHtml(restartSchedule)}</td>
            <td><span class="status-badge ${group.InMaintenanceMode ? 'status-maintenance' : 'status-enabled'}">${group.InMaintenanceMode ? 'Yes' : 'No'}</span></td>
            <td><span class="status-badge ${group.Enabled ? 'status-enabled' : 'status-disabled'}">${group.Enabled ? 'Enabled' : 'Disabled'}</span></td>
        `;
        tbody.appendChild(row);
    });
    
    // Initialize sorting for delivery groups table
    initializeTableSorting('deliveryGroupsTable');
}

// Display catalogs table
function displayCatalogsTable(catalogs) {
    const tbody = document.getElementById('catalogsTableBody');
    tbody.innerHTML = '';
    currentCatalogs = [...catalogs];
    
    catalogs.forEach(catalog => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(catalog.Name || 'N/A')}</td>
            <td>${escapeHtml(catalog.AllocationType || 'N/A')}</td>
            <td>${escapeHtml(catalog.ProvisioningType || 'N/A')}</td>
            <td>${escapeHtml(catalog.SessionSupport || 'N/A')}</td>
            <td>${catalog.TotalCount || 0}</td>
            <td>${catalog.AvailableCount || 0}</td>
            <td>${catalog.InUseCount || 0}</td>
            <td><span class="status-badge ${catalog.PersistUserChanges ? 'status-enabled' : 'status-disabled'}">${catalog.PersistUserChanges ? 'Yes' : 'No'}</span></td>
        `;
        tbody.appendChild(row);
    });
    
    // Re-initialize sorting after table update
    initializeTableSorting('catalogsTable');
}

// Filter servers
function filterServers(event) {
    const searchTerm = event.target.value.toLowerCase();
    const filtered = allServers.filter(server => 
        (server.Name && server.Name.toLowerCase().includes(searchTerm)) ||
        (server.DesktopGroup && server.DesktopGroup.toLowerCase().includes(searchTerm))
    );
    displayServersTable(filtered);
}

// Filter apps
function filterApps(event) {
    const searchTerm = event.target.value.toLowerCase();
    const filtered = allApps.filter(app => 
        (app.Name && app.Name.toLowerCase().includes(searchTerm)) ||
        (app.ApplicationName && app.ApplicationName.toLowerCase().includes(searchTerm)) ||
        (app.PublishedName && app.PublishedName.toLowerCase().includes(searchTerm)) ||
        (app.DesktopGroup && app.DesktopGroup.toLowerCase().includes(searchTerm))
    );
    displayAppsTable(filtered);
}

// --- CSV Export Helpers ---
function convertArrayToCSV(items) {
    if (!items || !items.length) return '';

    // Collect all keys across items to handle non-uniform objects
    const keys = Array.from(items.reduce((set, item) => {
        Object.keys(item || {}).forEach(k => set.add(k));
        return set;
    }, new Set()));

    const escapeValue = (value) => {
        if (value === null || value === undefined) return '';
        let str = typeof value === 'string' ? value : JSON.stringify(value);
        str = str.replace(/"/g, '""');
        return `"${str}"`;
    };

    const header = keys.join(',');
    const rows = items.map(item => keys.map(k => escapeValue(item[k])).join(','));

    return [header, ...rows].join('\r\n');
}

function downloadCSV(csvContent, filename) {
    if (!csvContent) {
        alert('No data available to export.');
        return;
    }
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportServersCSV() {
    const source = currentServers.length ? currentServers : allServers;
    const csv = convertArrayToCSV(source);
    downloadCSV(csv, 'citrix-servers.csv');
}

function exportAppsCSV() {
    const source = currentApps.length ? currentApps : allApps;
    const csv = convertArrayToCSV(source);
    downloadCSV(csv, 'citrix-applications.csv');
}

function exportDeliveryGroupsCSV() {
    const source = currentDeliveryGroups.length ? currentDeliveryGroups : allDeliveryGroups;
    const csv = convertArrayToCSV(source);
    downloadCSV(csv, 'citrix-delivery-groups.csv');
}

function exportCatalogsCSV() {
    const source = currentCatalogs.length ? currentCatalogs : allCatalogs;
    const csv = convertArrayToCSV(source);
    downloadCSV(csv, 'citrix-catalogs.csv');
}

function exportPoliciesCSV() {
    const source = currentPolicies.length ? currentPolicies : allPolicies;
    const csv = convertArrayToCSV(source);
    downloadCSV(csv, 'citrix-policies.csv');
}

function displayRolesTable(roles) {
    const tbody = document.getElementById('rolesTableBody');
    tbody.innerHTML = '';
    currentRoles = [...roles];
    
    if (roles.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="6" style="text-align: center; padding: 20px;">No roles data available</td>';
        tbody.appendChild(row);
        return;
    }
    
    roles.forEach(role => {
        const row = document.createElement('tr');
        const adGroups = Array.isArray(role.AssignedADGroups) ? role.AssignedADGroups.join(', ') : (role.AssignedADGroups || 'None');
        const users = Array.isArray(role.AssignedUsers) ? role.AssignedUsers.join(', ') : (role.AssignedUsers || 'None');
        const scopes = Array.isArray(role.Scopes) ? role.Scopes.map(s => s.Name || s).join(', ') : (role.Scopes || 'None');
        
        row.innerHTML = `
            <td>${escapeHtml(role.Name || 'N/A')}</td>
            <td>${escapeHtml(role.Description || 'N/A')}</td>
            <td><span class="status-badge ${role.IsBuiltIn ? 'status-enabled' : 'status-disabled'}">${role.IsBuiltIn ? 'Yes' : 'No'}</span></td>
            <td>${escapeHtml(adGroups)}</td>
            <td>${escapeHtml(users)}</td>
            <td>${escapeHtml(scopes)}</td>
        `;
        tbody.appendChild(row);
    });
    
    // Initialize sorting for roles table
    initializeTableSorting('rolesTable');
}

function exportRolesCSV() {
    const source = currentRoles.length ? currentRoles : allRoles;
    if (source.length === 0) {
        alert('No roles data to export');
        return;
    }
    
    // Flatten the roles data for CSV export
    const flattened = source.map(role => ({
        'Role Name': role.Name || 'N/A',
        'Description': role.Description || 'N/A',
        'Is Built-In': role.IsBuiltIn ? 'Yes' : 'No',
        'AD Groups': Array.isArray(role.AssignedADGroups) ? role.AssignedADGroups.join('; ') : (role.AssignedADGroups || 'None'),
        'Users': Array.isArray(role.AssignedUsers) ? role.AssignedUsers.join('; ') : (role.AssignedUsers || 'None'),
        'Scopes': Array.isArray(role.Scopes) ? role.Scopes.map(s => s.Name || s).join('; ') : (role.Scopes || 'None')
    }));
    
    const csv = convertArrayToCSV(flattened);
    downloadCSV(csv, 'citrix-roles.csv');
}

// Helper functions
function escapeHtml(text) {
    if (text === null || text === undefined) return 'N/A';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatNumber(num) {
    if (num === null || num === undefined || num === 'N/A') return 'N/A';
    return typeof num === 'number' ? num.toFixed(2) : num;
}

function getStatusClass(status) {
    if (!status || typeof status !== 'string') return 'status-disabled';
    try {
        const statusLower = status.toLowerCase();
        if (statusLower.includes('on') || statusLower.includes('active')) return 'status-active';
        if (statusLower.includes('off') || statusLower.includes('inactive')) return 'status-inactive';
    } catch (e) {
        console.warn('Error processing status:', status, e);
    }
    return 'status-disabled';
}

function getRegistrationStatusClass(status) {
    if (!status || typeof status !== 'string') return 'status-disabled';
    try {
        const statusLower = status.toLowerCase();
        if (statusLower.includes('registered')) return 'status-enabled';
        if (statusLower.includes('unregistered')) return 'status-disabled';
    } catch (e) {
        console.warn('Error processing registration status:', status, e);
    }
    return 'status-disabled';
}

function showLoading() {
    document.getElementById('loadingIndicator').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loadingIndicator').style.display = 'none';
}

function showDashboard() {
    document.getElementById('dashboard').style.display = 'block';
}

function hideDashboard() {
    document.getElementById('dashboard').style.display = 'none';
}

function showError(message, isFatal = true) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    
    if (!isFatal) {
        errorDiv.style.backgroundColor = '#17a2b8'; // Info color instead of danger
    }
}

function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

// Table sorting functionality
function initializeTableSorting(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const headers = table.querySelectorAll('thead th.sortable');
    const tbody = table.querySelector('tbody');
    
    headers.forEach((header, index) => {
        // Remove existing event listeners by cloning
        const newHeader = header.cloneNode(true);
        header.parentNode.replaceChild(newHeader, header);
        
        newHeader.style.cursor = 'pointer';
        newHeader.style.userSelect = 'none';
        newHeader.classList.add('sortable-header');
        
        // Add sort indicator
        if (!newHeader.querySelector('.sort-indicator')) {
            const indicator = document.createElement('span');
            indicator.className = 'sort-indicator';
            indicator.textContent = ' ↕';
            indicator.style.opacity = '0.5';
            newHeader.appendChild(indicator);
        }
        
        newHeader.addEventListener('click', () => {
            sortTable(tableId, index, newHeader);
        });
    });
}

function sortTable(tableId, columnIndex, header) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // Determine sort direction
    const isAscending = header.classList.contains('sort-asc');
    
    // Remove sort classes from all headers
    table.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        const indicator = th.querySelector('.sort-indicator');
        if (indicator) {
            indicator.textContent = ' ↕';
            indicator.style.opacity = '0.5';
        }
    });
    
    // Set sort direction
    if (isAscending) {
        header.classList.add('sort-desc');
        const indicator = header.querySelector('.sort-indicator');
        if (indicator) {
            indicator.textContent = ' ↓';
            indicator.style.opacity = '1';
        }
    } else {
        header.classList.add('sort-asc');
        const indicator = header.querySelector('.sort-indicator');
        if (indicator) {
            indicator.textContent = ' ↑';
            indicator.style.opacity = '1';
        }
    }
    
    // Sort rows
    rows.sort((a, b) => {
        const aCell = a.cells[columnIndex];
        const bCell = b.cells[columnIndex];
        
        if (!aCell || !bCell) return 0;
        
        let aValue = aCell.textContent.trim();
        let bValue = bCell.textContent.trim();
        
        // Try to parse as number
        const aNum = parseFloat(aValue.replace(/[^0-9.-]/g, ''));
        const bNum = parseFloat(bValue.replace(/[^0-9.-]/g, ''));
        
        let comparison = 0;
        
        if (!isNaN(aNum) && !isNaN(bNum)) {
            // Numeric comparison
            comparison = aNum - bNum;
        } else {
            // String comparison (case-insensitive)
            comparison = aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: 'base' });
        }
        
        return isAscending ? -comparison : comparison;
    });
    
    // Re-append sorted rows
    rows.forEach(row => tbody.appendChild(row));
}

// Collapsible section toggle
function toggleSection(button) {
    const section = button.closest('section');
    if (!section) return;

    const body = section.querySelector('.section-body');
    if (!body) return;

    const isCollapsed = section.classList.contains('collapsed');
    if (isCollapsed) {
        section.classList.remove('collapsed');
        body.style.display = 'block';
        button.textContent = '▲';
    } else {
        section.classList.add('collapsed');
        body.style.display = 'none';
        button.textContent = '▼';
    }
}

