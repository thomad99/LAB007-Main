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
document.addEventListener('DOMContentLoaded', async function() {
    console.log('=== DOMContentLoaded fired ===');

    try {
        console.log('Starting loadDefaultData...');
        await loadDefaultData();
        console.log('loadDefaultData completed');
    } catch (error) {
        console.error('Error loading default data:', error);
        // Continue with initialization even if loadDefaultData fails
    }

    // Load Audit Data button and file input
    const loadFileBtn = document.getElementById('loadFileBtn');
    const fileInput = document.getElementById('fileInput');

    console.log('loadFileBtn element:', loadFileBtn);
    console.log('fileInput element:', fileInput);
    console.log('loadFileBtn exists:', !!loadFileBtn);
    console.log('fileInput exists:', !!fileInput);

    if (loadFileBtn && fileInput) {
        console.log('Attaching Load Audit Data event listeners');

        loadFileBtn.addEventListener('click', (e) => {
            console.log('Load Audit Data button clicked!');
            fileInput.click();
        });
        fileInput.addEventListener('change', handleFileLoad);
        console.log('Load Audit Data event listeners attached successfully');
    } else {
        console.error('Load Audit Data elements not found!');
    }

    // VMware folder toggle (default OFF)
    const vmwareToggle = document.getElementById('enableVMwareFoldersToggle');
    const vmwareSection = document.getElementById('vmwareFoldersSection');
    if (vmwareToggle && vmwareSection) {
        vmwareToggle.checked = false;
        vmwareSection.style.display = 'none';
        vmwareToggle.addEventListener('change', () => {
            vmwareSection.style.display = vmwareToggle.checked ? 'block' : 'none';
        });
    }

    // Config button
    const configBtn = document.getElementById('configBtn');
    if (configBtn) {
        configBtn.addEventListener('click', () => {
            console.log('Config button clicked');
            showConfigModal();
        });
    }

    // Horizon Tasks button - always available
    const horizonTasksBtn = document.getElementById('horizonTasksBtn');
    console.log('horizonTasksBtn element:', horizonTasksBtn);
    if (horizonTasksBtn) {
        // Ensure button is always enabled
        horizonTasksBtn.disabled = false;
        horizonTasksBtn.style.opacity = '1';
        horizonTasksBtn.style.cursor = 'pointer';

        horizonTasksBtn.addEventListener('click', () => {
            console.log('HZ Tasks button clicked - calling showHorizonTasksModal');
            try {
                showHorizonTasksModal();
                console.log('showHorizonTasksModal completed successfully');
            } catch (error) {
                console.error('Error in showHorizonTasksModal:', error);
            }
        });
        console.log('Horizon Tasks event listener attached');
    }

    // Debug ZIP upload functionality
    const uploadDebugBtn = document.getElementById('uploadDebugBtn');
    const debugFileInput = document.getElementById('debugFileInput');

    console.log('uploadDebugBtn element:', uploadDebugBtn);
    console.log('debugFileInput element:', debugFileInput);
    console.log('uploadDebugBtn exists:', !!uploadDebugBtn);
    console.log('debugFileInput exists:', !!debugFileInput);

    if (uploadDebugBtn && debugFileInput) {
        console.log('Attaching Upload Debug ZIP event listeners');

        uploadDebugBtn.addEventListener('click', (e) => {
            console.log('Upload Debug ZIP button clicked!');
            debugFileInput.click();
        });

        debugFileInput.addEventListener('change', (e) => {
            console.log('Debug file input changed, files:', e.target.files.length);
            if (e.target.files.length > 0) {
                uploadDebugFile(e.target.files[0]);
            }
        });
        console.log('Upload Debug ZIP event listeners attached successfully');
    } else {
        console.error('Upload Debug ZIP elements not found!');
    }

    console.log('=== Initialization complete ===');

    // Clone master images file input
    const cloneMasterImagesFileInput = document.getElementById('cloneMasterImagesFileInput');
    if (cloneMasterImagesFileInput) {
        cloneMasterImagesFileInput.addEventListener('change', handleCloneMasterImagesFile);
    }

    // VMware folders file input
    const vmwareFoldersFileInput = document.getElementById('vmwareFoldersFileInput');
    if (vmwareFoldersFileInput) {
        vmwareFoldersFileInput.addEventListener('change', handleVMwareFoldersFile);
    }

    // Load config and populate clone folder fields
    loadConfigForCloneFields();

    // Search functionality
    document.getElementById('serverSearch').addEventListener('input', filterServers);
    document.getElementById('appSearch').addEventListener('input', filterApps);
    
    // Global search functionality (disabled - function not implemented)
    const globalSearchInput = document.getElementById('globalSearch');
    if (globalSearchInput) {
        // globalSearchInput.addEventListener('input', performGlobalSearch);
        globalSearchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                // clearGlobalSearch();
            }
        });
    }
    
    // Animate loading text letter by letter
    animateLoadingText();

    // Handle clone source move checkbox
    const moveSourceCheckbox = document.getElementById('moveSourceAfterClone');
    const sourceMoveFolderInput = document.getElementById('sourceMoveFolder');
    const browseSourceFoldersBtn = document.getElementById('browseSourceFoldersBtn');

    if (moveSourceCheckbox && sourceMoveFolderInput && browseSourceFoldersBtn) {
        moveSourceCheckbox.addEventListener('change', function() {
            const isChecked = this.checked;
            sourceMoveFolderInput.disabled = !isChecked;
            browseSourceFoldersBtn.disabled = !isChecked;
            if (isChecked) {
                sourceMoveFolderInput.style.opacity = '1';
                browseSourceFoldersBtn.style.opacity = '1';
            } else {
                sourceMoveFolderInput.style.opacity = '0.5';
                browseSourceFoldersBtn.style.opacity = '0.5';
            }
        });

        // Initialize state
        moveSourceCheckbox.dispatchEvent(new Event('change'));
    }

    // Config download function
    function handleConfigDownload() {
        console.log('handleConfigDownload called');

        // Safely get form values with validation
        const getElementValue = (id) => {
            const element = document.getElementById(id);
            return element ? element.value : '';
        };

        const getElementChecked = (id) => {
            const element = document.getElementById(id);
            return element ? element.checked : false;
        };

        const parseNumberSafely = (value, defaultValue = 30) => {
            const parsed = parseInt(value);
            return isNaN(parsed) ? defaultValue : Math.max(1, Math.min(365, parsed));
        };

        const config = {
            citrixVersion: getElementValue('configCitrixVersion'),
            ddcName: getElementValue('configDdcName'),
            usageDays: parseNumberSafely(getElementValue('configUsageDays')),
            vCenterServer: getElementValue('configVCenterServer'),
            vCenterUsername: getElementValue('configVCenterUsername'),
            vCenterPassword: getElementValue('configVCenterPassword'),
            masterImagePrefix: getElementValue('configMasterImagePrefix') || 'SHC-M-',
            runPreReqCheck: getElementChecked('configRunPreReqCheck'),
            auditComponents: {
                SiteInfo: document.getElementById('configAuditSiteInfo').checked,
                Applications: document.getElementById('configAuditApplications').checked,
                Desktops: document.getElementById('configAuditDesktops').checked,
                Catalogs: document.getElementById('configAuditCatalogs').checked,
                DeliveryGroups: document.getElementById('configAuditDeliveryGroups').checked,
                UsageStats: document.getElementById('configAuditUsageStats').checked,
                Policies: document.getElementById('configAuditPolicies').checked,
                Roles: document.getElementById('configAuditRoles').checked,
                VMwareSpecs: document.getElementById('configAuditVMwareSpecs').checked,
                VMwareFolders: document.getElementById('configAuditVMwareFolders').checked,
                AppIcons: document.getElementById('configAuditAppIcons').checked,
                Servers: document.getElementById('configAuditServers').checked,
                DirectorOData: document.getElementById('configAuditDirectorOData').checked
            },
            savedAt: new Date().toISOString()
        };

        console.log('Config object created:', config);

        try {
            // Create downloadable JSON file
            const configJson = JSON.stringify(config, null, 2);
            const blob = new Blob([configJson], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            // Create temporary download link
            const a = document.createElement('a');
            a.href = url;
            a.download = 'LAB007-Config.JSON';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // Clean up the URL object
            URL.revokeObjectURL(url);

            // Show success message
            const statusMsg = document.getElementById('configStatusMessage');
            statusMsg.className = 'status-message success';
            statusMsg.style.display = 'block';
            statusMsg.innerHTML = '<strong>Configuration file downloaded!</strong><br><br>' +
                'Save the <strong>LAB007-Config.JSON</strong> file to:<br>' +
                '<code>Citrix-Horizon\\LAB007-Config.JSON</code><br><br>' +
                '<em>(same level as the Scripts folder, not inside it)</em>';
            statusMsg.style.textAlign = 'center';
            statusMsg.style.padding = '15px';
            statusMsg.style.borderRadius = '8px';
            statusMsg.style.marginTop = '20px';

            // Keep success message visible longer so user can read instructions
            setTimeout(() => {
                statusMsg.style.display = 'none';
            }, 10000);

        } catch (error) {
            console.error('Failed to create config file:', error);
            // Show error message
            const statusMsg = document.getElementById('configStatusMessage');
            statusMsg.className = 'status-message error';
            statusMsg.style.display = 'block';
            statusMsg.innerHTML = 'Failed to create configuration file. Please try again.';
            statusMsg.style.textAlign = 'center';
            statusMsg.style.padding = '15px';
            statusMsg.style.borderRadius = '8px';
            statusMsg.style.marginTop = '20px';

            // Hide error message after 5 seconds
            setTimeout(() => {
                statusMsg.style.display = 'none';
            }, 5000);
        }

        console.log('Configuration file created for download');
    }

    // Handle main config form submission
    const mainConfigForm = document.getElementById('mainConfigForm');
    const saveMainConfigBtn = document.getElementById('saveMainConfigBtn');

    console.log('Setting up config form listener, form element:', mainConfigForm);
    console.log('Save button element:', saveMainConfigBtn);

    if (mainConfigForm) {
        console.log('Config form found, attaching submit listener');
        mainConfigForm.addEventListener('submit', function(e) {
            e.preventDefault();
            console.log('Config form submitted - starting download process');
            handleConfigDownload();
        });

        // Also attach direct click handler to button as backup
        if (saveMainConfigBtn) {
            console.log('Attaching direct click handler to save button');
            saveMainConfigBtn.addEventListener('click', function(e) {
                console.log('Save button clicked directly');
                e.preventDefault();
                handleConfigDownload();
            });
        }
    }
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
        console.log('Error in loadDefaultData (non-critical):', error.message);

        // If fetch fails, prompt user to select file or upload
        showError('You can download our tools or upload an Audit', false);

        hideDashboard();
    }

    // Always resolve successfully to not break initialization
    return Promise.resolve();
}

// Handle file upload
function handleFileLoad(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Check if file name matches 0-Citrix-audit*.json pattern (case-insensitive)
    const fileName = file.name || '';
    const fileNameLower = fileName.toLowerCase();
    const isValidFileName = fileNameLower.startsWith('0-citrix-audit') && fileNameLower.endsWith('.json');

    if (!isValidFileName) {
        showError(`Invalid file selected. Please select a file matching the pattern "0-Citrix-audit*.json". Selected: ${fileName}`);
        return;
    }

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
function loadConfigIntoModal() {
    try {
        // Try to load from localStorage first
        let config = localStorage.getItem('lab007Config');
        if (config) {
            const parsed = JSON.parse(config);

            // Populate vCenter server field
            const vCenterField = document.getElementById('searchVCenterServer');
            if (vCenterField) {
                vCenterField.value = parsed.vCenterServer || 'shcvcsacx01v.ccr.cchcs.org';
            }

            // Populate master image prefix field
            const prefixField = document.getElementById('searchMasterPrefix');
            if (prefixField) {
                prefixField.value = parsed.masterImagePrefix || 'SHC-M-';
            }
        } else {
            // Fallback to defaults if no config saved
            const vCenterField = document.getElementById('searchVCenterServer');
            if (vCenterField) {
                vCenterField.value = 'shcvcsacx01v.ccr.cchcs.org';
            }

            const prefixField = document.getElementById('searchMasterPrefix');
            if (prefixField) {
                prefixField.value = 'SHC-M-';
            }
        }
    } catch (error) {
        console.log('Error loading config for modal, using defaults', error);
        // Fallback to defaults
        const vCenterField = document.getElementById('searchVCenterServer');
        if (vCenterField) {
            vCenterField.value = 'shcvcsacx01v.ccr.cchcs.org';
        }

        const prefixField = document.getElementById('searchMasterPrefix');
        if (prefixField) {
            prefixField.value = 'SHC-M-';
        }
    }
}

function showHorizonTasksModal() {
    console.log('showHorizonTasksModal function called');
    const modal = document.getElementById('horizonTasksModal');
    console.log('Modal element:', modal);
    if (modal) {
        modal.style.display = 'block';
        console.log('Modal display set to block');
    } else {
        console.error('Modal element not found!');
        return;
    }

    // Load configuration values into the modal
    try {
        loadConfigIntoModal();
        console.log('loadConfigIntoModal completed');
    } catch (error) {
        console.error('Error in loadConfigIntoModal:', error);
    }

    // Note: Button uses onclick attribute instead of event listener

    // Default to Master Image Search tab
    try {
        showHorizonTask('masterImageSearch');
        console.log('showHorizonTask completed');
    } catch (error) {
        console.error('Error in showHorizonTask:', error);
    }
}

function closeHorizonTasksModal() {
    document.getElementById('horizonTasksModal').style.display = 'none';
}

// Config Modal Functions
function showConfigModal() {
    console.log('showConfigModal function called');
    const modal = document.getElementById('configModal');
    if (modal) {
        modal.style.display = 'block';
        loadConfigIntoMainModal();
        console.log('Config modal displayed');
    } else {
        console.error('Config modal element not found!');
    }
}

function closeConfigModal() {
    document.getElementById('configModal').style.display = 'none';
}

async function testConnection() {
    const testBtn = document.getElementById('testConnectionBtn');
    const originalText = testBtn.innerHTML;

    // Show loading state
    testBtn.innerHTML = '🔄 Testing...';
    testBtn.disabled = true;

    try {
        // Collect form data with safe extraction
        const getElementValue = (id) => {
            const element = document.getElementById(id);
            return element ? element.value : '';
        };

        const getElementChecked = (id) => {
            const element = document.getElementById(id);
            return element ? element.checked : false;
        };

        const parseNumberSafely = (value, defaultValue = 30) => {
            const parsed = parseInt(value);
            return isNaN(parsed) ? defaultValue : Math.max(1, Math.min(365, parsed));
        };

        const config = {
            citrixVersion: getElementValue('configCitrixVersion'),
            ddcName: getElementValue('configDdcName'),
            usageDays: parseNumberSafely(getElementValue('configUsageDays')),
            vCenterServer: getElementValue('configVCenterServer'),
            vCenterUsername: getElementValue('configVCenterUsername'),
            vCenterPassword: getElementValue('configVCenterPassword'),
            masterImagePrefix: getElementValue('configMasterImagePrefix') || 'SHC-M-',
            runPreReqCheck: getElementChecked('configRunPreReqCheck')
        };

        // Call test connection API
        const response = await fetch('/citrix/api/test-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        const result = await response.json();

        if (result.success) {
            // Show success message with results
            let message = '✅ Connection test completed!\n\n';

            if (result.results.citrixConnection.status === 'success') {
                message += `• Citrix: ✅ Connected to ${result.results.citrixConnection.server}\n`;
            } else {
                message += `• Citrix: ❌ ${result.results.citrixConnection.message}\n`;
            }

            if (result.results.vmwareConnection.tested) {
                if (result.results.vmwareConnection.status === 'success') {
                    message += `• VMware: ✅ Connected to ${result.results.vmwareConnection.server}\n`;
                } else {
                    message += `• VMware: ❌ ${result.results.vmwareConnection.message}\n`;
                }
            } else {
                message += `• VMware: ⚠️ Not configured\n`;
            }

            alert(message);
        } else {
            alert(`❌ Connection test failed: ${result.error}`);
        }

    } catch (error) {
        console.error('Test connection error:', error);
        alert(`❌ Connection test error: ${error.message}`);
    } finally {
        // Restore button state
        testBtn.innerHTML = originalText;
        testBtn.disabled = false;
    }
}

// Folder Browser Functions
let vmwareFolders = [];

async function showFolderBrowserModal() {
    const modal = document.getElementById('folderBrowserModal');
    const content = document.getElementById('folderBrowserContent');

    // Show loading state
    content.innerHTML = '<div style="text-align: center; padding: 40px;"><p>Loading VMware folder structure...</p></div>';
    modal.style.display = 'block';

    // Check if VMware folders data has been uploaded
    if (vmwareFoldersData && vmwareFoldersData.Folders && vmwareFoldersData.Folders.length > 0) {
        vmwareFolders = vmwareFoldersData.Folders;
        console.log(`Using uploaded VMware folders data: ${vmwareFolders.length} folders`);
        buildFolderBrowserUI(vmwareFolders);
        return;
    }

    try {
        // Try to load folders from server (for deployed version)
        const response = await fetch('/data/vmware-folders.json', { cache: 'no-cache' });

        if (response.ok) {
            const folderData = await response.json();
            vmwareFolders = folderData.Folders || [];

            // Build the folder browser UI
            buildFolderBrowserUI(vmwareFolders);
        } else {
            // Fallback to common folder suggestions
            console.warn('Could not load VMware folders from server, using default suggestions');
            buildFallbackFolderBrowserUI();
        }
    } catch (error) {
        console.error('Error loading VMware folders:', error);
        buildFallbackFolderBrowserUI();
    }
}

function buildFolderBrowserUI(folders) {
    const content = document.getElementById('folderBrowserContent');

    if (!folders || folders.length === 0) {
        content.innerHTML = `
            <div style="margin-bottom: 20px;">
                <p style="color: #666; margin-bottom: 15px;">No VMware folders found. The folder structure may not have been collected yet.</p>
                <p style="color: #666; font-size: 14px;">Run the VMware folder collection script first to populate this list.</p>
            </div>
            <div style="margin-bottom: 20px;">
                <label for="customFolderPath" style="display: block; margin-bottom: 8px; font-weight: bold;">Or enter custom path:</label>
                <input type="text" id="customFolderPath" placeholder="/vm/custom/path" style="width: 100%; padding: 8px; font-size: 14px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div style="text-align: right; border-top: 1px solid #eee; padding-top: 15px;">
                <button class="btn btn-secondary" onclick="closeFolderBrowserModal()">Cancel</button>
                <button class="btn btn-primary" onclick="confirmCustomFolder()" style="margin-left: 10px;">Use Custom Path</button>
            </div>
        `;
        return;
    }

    // Group folders by depth for better organization
    const rootFolders = folders.filter(f => !f.FullPath.includes('/') || f.FullPath.split('/').length <= 2);
    const subFolders = folders.filter(f => f.FullPath.includes('/') && f.FullPath.split('/').length > 2);

    let html = `
        <div style="margin-bottom: 20px;">
            <p style="color: #666; margin-bottom: 15px;">Select a VMware folder for VM placement. Found ${folders.length} folders:</p>
        </div>

        <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 10px; background-color: #f8f9fa;">
    `;

    // Add root folders first
    if (rootFolders.length > 0) {
        html += '<div style="margin-bottom: 15px;"><strong>Root Folders:</strong></div>';
        rootFolders.forEach(folder => {
            const displayName = folder.FullPath === '/' ? '/ (Root)' : folder.FullPath;
            const childIndicator = folder.HasChildren ? ' 📁' : ' 📄';
            const vmCount = folder.VMCount > 0 ? ` (${folder.VMCount} VMs)` : '';

            html += `
                <div class="folder-option" onclick="selectFolder('${folder.FullPath}')" style="cursor: pointer; padding: 8px; margin: 2px 0; border-radius: 4px; background: white; border: 1px solid #eee;">
                    ${childIndicator} <strong>${displayName}</strong>${vmCount}
                </div>
            `;
        });
    }

    // Add subfolders
    if (subFolders.length > 0) {
        html += '<div style="margin: 15px 0 10px 0; border-top: 1px solid #ddd; padding-top: 10px;"><strong>Sub Folders:</strong></div>';
        subFolders.slice(0, 20).forEach(folder => {  // Limit to first 20 subfolders for performance
            const displayName = folder.FullPath;
            const childIndicator = folder.HasChildren ? ' 📁' : ' 📄';
            const vmCount = folder.VMCount > 0 ? ` (${folder.VMCount} VMs)` : '';

            html += `
                <div class="folder-option" onclick="selectFolder('${folder.FullPath}')" style="cursor: pointer; padding: 8px; margin: 2px 0; border-radius: 4px; background: white; border: 1px solid #eee; font-size: 13px;">
                    ${childIndicator} ${displayName}${vmCount}
                </div>
            `;
        });

        if (subFolders.length > 20) {
            html += `<div style="text-align: center; padding: 10px; color: #666; font-size: 12px;">... and ${subFolders.length - 20} more folders</div>`;
        }
    }

    html += `
        </div>

        <div style="margin-bottom: 20px;">
            <label for="customFolderPath" style="display: block; margin-bottom: 8px; font-weight: bold;">Or enter custom path:</label>
            <input type="text" id="customFolderPath" placeholder="/vm/custom/path" style="width: 100%; padding: 8px; font-size: 14px; border: 1px solid #ddd; border-radius: 4px;">
        </div>

        <div style="text-align: right; border-top: 1px solid #eee; padding-top: 15px;">
            <button class="btn btn-secondary" onclick="closeFolderBrowserModal()">Cancel</button>
            <button class="btn btn-primary" onclick="confirmCustomFolder()" style="margin-left: 10px;">Use Custom Path</button>
        </div>
    `;

    content.innerHTML = html;
}

function buildFallbackFolderBrowserUI() {
    const content = document.getElementById('folderBrowserContent');

    content.innerHTML = `
        <div style="margin-bottom: 20px;">
            <p style="color: #666; margin-bottom: 15px;">Unable to load VMware folder structure. Using common folder suggestions:</p>

            <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 10px; background-color: #f8f9fa;">
                <div class="folder-option" onclick="selectFolder('/vm')" style="cursor: pointer; padding: 8px; margin: 2px 0; border-radius: 4px; background: white; border: 1px solid #eee;">
                    📁 <strong>/vm</strong> - Root VM folder
                </div>
                <div class="folder-option" onclick="selectFolder('/vm/prod')" style="cursor: pointer; padding: 8px; margin: 2px 0; border-radius: 4px; background: white; border: 1px solid #eee;">
                    📁 <strong>/vm/prod</strong> - Production VMs
                </div>
                <div class="folder-option" onclick="selectFolder('/vm/prod/windows')" style="cursor: pointer; padding: 8px; margin: 2px 0; border-radius: 4px; background: white; border: 1px solid #eee;">
                    📁 <strong>/vm/prod/windows</strong> - Windows production VMs
                </div>
                <div class="folder-option" onclick="selectFolder('/vm/test')" style="cursor: pointer; padding: 8px; margin: 2px 0; border-radius: 4px; background: white; border: 1px solid #eee;">
                    📁 <strong>/vm/test</strong> - Test VMs
                </div>
                <div class="folder-option" onclick="selectFolder('/vm/dev')" style="cursor: pointer; padding: 8px; margin: 2px 0; border-radius: 4px; background: white; border: 1px solid #eee;">
                    📁 <strong>/vm/dev</strong> - Development VMs
                </div>
                <div class="folder-option" onclick="selectFolder('/vm/archive')" style="cursor: pointer; padding: 8px; margin: 2px 0; border-radius: 4px; background: white; border: 1px solid #eee;">
                    📁 <strong>/vm/archive</strong> - Archived VMs
                </div>
                <div class="folder-option" onclick="selectFolder('/vm/backup')" style="cursor: pointer; padding: 8px; margin: 2px 0; border-radius: 4px; background: white; border: 1px solid #eee;">
                    📁 <strong>/vm/backup</strong> - Backup VMs
                </div>
            </div>
        </div>

        <div style="margin-bottom: 20px;">
            <label for="customFolderPath" style="display: block; margin-bottom: 8px; font-weight: bold;">Or enter custom path:</label>
            <input type="text" id="customFolderPath" placeholder="/vm/custom/path" style="width: 100%; padding: 8px; font-size: 14px; border: 1px solid #ddd; border-radius: 4px;">
        </div>

        <div style="text-align: right; border-top: 1px solid #eee; padding-top: 15px;">
            <button class="btn btn-secondary" onclick="closeFolderBrowserModal()">Cancel</button>
            <button class="btn btn-primary" onclick="confirmCustomFolder()" style="margin-left: 10px;">Use Custom Path</button>
        </div>
    `;
}

function closeFolderBrowserModal() {
    document.getElementById('folderBrowserModal').style.display = 'none';
}

function selectFolder(folderPath) {
    document.getElementById('cloneDestinationFolder').value = folderPath;
    closeFolderBrowserModal();
}

function confirmCustomFolder() {
    const customPath = document.getElementById('customFolderPath').value.trim();
    if (customPath) {
        document.getElementById('cloneDestinationFolder').value = customPath;
    }
    closeFolderBrowserModal();
}

// Source Folder Browser Functions
async function showSourceFolderBrowserModal() {
    const modal = document.getElementById('sourceFolderBrowserModal');
    const content = document.getElementById('sourceFolderBrowserContent');

    // Show loading state
    content.innerHTML = '<div style="text-align: center; padding: 40px;"><p>Loading VMware folder structure...</p></div>';
    modal.style.display = 'block';

    // Check if VMware folders data has been uploaded
    if (vmwareFoldersData && vmwareFoldersData.Folders && vmwareFoldersData.Folders.length > 0) {
        const folders = vmwareFoldersData.Folders;
        console.log(`Using uploaded VMware folders data for source selection: ${folders.length} folders`);
        buildSourceFolderBrowserUI(folders);
        return;
    }

    try {
        // Try to load folders from server (for deployed version)
        const response = await fetch('/data/vmware-folders.json', { cache: 'no-cache' });

        if (response.ok) {
            const folderData = await response.json();
            const folders = folderData.Folders || [];

            // Build the source folder browser UI (focused on archive/backup folders)
            buildSourceFolderBrowserUI(folders);
        } else {
            // Fallback to common archive folder suggestions
            console.warn('Could not load VMware folders from server, using default archive suggestions');
            buildFallbackSourceFolderBrowserUI();
        }
    } catch (error) {
        console.error('Error loading VMware folders:', error);
        buildFallbackSourceFolderBrowserUI();
    }
}

function buildSourceFolderBrowserUI(folders) {
    const content = document.getElementById('sourceFolderBrowserContent');

    // Filter for archive/backup type folders
    const archiveFolders = folders.filter(f =>
        f.FullPath.toLowerCase().includes('archive') ||
        f.FullPath.toLowerCase().includes('backup') ||
        f.FullPath.toLowerCase().includes('retired') ||
        f.FullPath.toLowerCase().includes('old') ||
        f.FullPath.toLowerCase().includes('decommission')
    );

    let html = `
        <div style="margin-bottom: 20px;">
            <p style="color: #666; margin-bottom: 15px;">Select a folder to move source VMs after cloning:</p>
        </div>

        <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 10px; background-color: #f8f9fa;">
    `;

    if (archiveFolders.length > 0) {
        html += '<div style="margin-bottom: 15px;"><strong>Archive/Backup Folders:</strong></div>';
        archiveFolders.forEach(folder => {
            const displayName = folder.FullPath;
            const childIndicator = folder.HasChildren ? ' 📁' : ' 📄';
            const vmCount = folder.VMCount > 0 ? ` (${folder.VMCount} VMs)` : '';

            html += `
                <div class="folder-option" onclick="selectSourceFolder('${folder.FullPath}')" style="cursor: pointer; padding: 8px; margin: 2px 0; border-radius: 4px; background: white; border: 1px solid #eee;">
                    ${childIndicator} <strong>${displayName}</strong>${vmCount}
                </div>
            `;
        });
    } else {
        html += '<div style="margin-bottom: 15px;"><strong>No archive folders found. Using general suggestions:</strong></div>';
    }

    // Add some common archive folder suggestions
    const commonArchiveFolders = ['/vm/archive', '/vm/backup', '/vm/retired', '/vm/old', '/vm/decommissioned'];

    html += '<div style="margin: 15px 0 10px 0; border-top: 1px solid #ddd; padding-top: 10px;"><strong>Common Archive Paths:</strong></div>';
    commonArchiveFolders.forEach(folderPath => {
        const isAvailable = folders.some(f => f.FullPath === folderPath);
        const statusIndicator = isAvailable ? ' ✅' : ' ❓';
        const statusClass = isAvailable ? '' : ' opacity: 0.6;';

        html += `
            <div class="folder-option" onclick="selectSourceFolder('${folderPath}')" style="cursor: pointer; padding: 8px; margin: 2px 0; border-radius: 4px; background: white; border: 1px solid #eee;${statusClass}">
                📁 <strong>${folderPath}</strong>${statusIndicator}
            </div>
        `;
    });

    html += `
        </div>

        <div style="margin-bottom: 20px;">
            <label for="customSourceFolderPath" style="display: block; margin-bottom: 8px; font-weight: bold;">Or enter custom path:</label>
            <input type="text" id="customSourceFolderPath" placeholder="/vm/custom/archive" style="width: 100%; padding: 8px; font-size: 14px; border: 1px solid #ddd; border-radius: 4px;">
        </div>

        <div style="text-align: right; border-top: 1px solid #eee; padding-top: 15px;">
            <button class="btn btn-secondary" onclick="closeSourceFolderBrowserModal()">Cancel</button>
            <button class="btn btn-primary" onclick="confirmCustomSourceFolder()" style="margin-left: 10px;">Use Custom Path</button>
        </div>
    `;

    content.innerHTML = html;
}

function buildFallbackSourceFolderBrowserUI() {
    const content = document.getElementById('sourceFolderBrowserContent');

    content.innerHTML = `
        <div style="margin-bottom: 20px;">
            <p style="color: #666; margin-bottom: 15px;">Unable to load VMware folder structure. Using common archive folder suggestions:</p>

            <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 10px; background-color: #f8f9fa;">
                <div class="folder-option" onclick="selectSourceFolder('/vm/archive')" style="cursor: pointer; padding: 8px; margin: 2px 0; border-radius: 4px; background: white; border: 1px solid #eee;">
                    📁 <strong>/vm/archive</strong> - Archive folder
                </div>
                <div class="folder-option" onclick="selectSourceFolder('/vm/backup')" style="cursor: pointer; padding: 8px; margin: 2px 0; border-radius: 4px; background: white; border: 1px solid #eee;">
                    📁 <strong>/vm/backup</strong> - Backup folder
                </div>
                <div class="folder-option" onclick="selectSourceFolder('/vm/retired')" style="cursor: pointer; padding: 8px; margin: 2px 0; border-radius: 4px; background: white; border: 1px solid #eee;">
                    📁 <strong>/vm/retired</strong> - Retired VMs
                </div>
                <div class="folder-option" onclick="selectSourceFolder('/vm/old')" style="cursor: pointer; padding: 8px; margin: 2px 0; border-radius: 4px; background: white; border: 1px solid #eee;">
                    📁 <strong>/vm/old</strong> - Old VMs
                </div>
                <div class="folder-option" onclick="selectSourceFolder('/vm/decommissioned')" style="cursor: pointer; padding: 8px; margin: 2px 0; border-radius: 4px; background: white; border: 1px solid #eee;">
                    📁 <strong>/vm/decommissioned</strong> - Decommissioned VMs
                </div>
            </div>
        </div>

        <div style="margin-bottom: 20px;">
            <label for="customSourceFolderPath" style="display: block; margin-bottom: 8px; font-weight: bold;">Or enter custom path:</label>
            <input type="text" id="customSourceFolderPath" placeholder="/vm/custom/archive" style="width: 100%; padding: 8px; font-size: 14px; border: 1px solid #ddd; border-radius: 4px;">
        </div>

        <div style="text-align: right; border-top: 1px solid #eee; padding-top: 15px;">
            <button class="btn btn-secondary" onclick="closeSourceFolderBrowserModal()">Cancel</button>
            <button class="btn btn-primary" onclick="confirmCustomSourceFolder()" style="margin-left: 10px;">Use Custom Path</button>
        </div>
    `;
}

function closeSourceFolderBrowserModal() {
    document.getElementById('sourceFolderBrowserModal').style.display = 'none';
}

function selectSourceFolder(folderPath) {
    document.getElementById('sourceMoveFolder').value = folderPath;
    closeSourceFolderBrowserModal();
}

function confirmCustomSourceFolder() {
    const customPath = document.getElementById('customSourceFolderPath').value.trim();
    if (customPath) {
        document.getElementById('sourceMoveFolder').value = customPath;
    }
    closeSourceFolderBrowserModal();
}

async function loadConfigIntoMainModal() {
    try {
        const response = await fetch('/api/audit-config');
        if (response.ok) {
            const config = await response.json();
            console.log('Config loaded from server into main modal:', config);

            // Load Citrix config
            document.getElementById('configCitrixVersion').value = config.citrixVersion || '1912';
            document.getElementById('configDdcName').value = config.ddcName || 'localhost';
            document.getElementById('configUsageDays').value = config.usageDays || 30;
            document.getElementById('configRunPreReqCheck').checked = config.runPreReqCheck !== false;

            // Load VMware config
            document.getElementById('configVCenterServer').value = config.vCenterServer || 'shcvcsacx01v.ccr.cchcs.org';
            document.getElementById('configVCenterUsername').value = config.vCenterUsername || '';
            document.getElementById('configVCenterPassword').value = config.vCenterPassword || '';
            document.getElementById('configMasterImagePrefix').value = config.masterImagePrefix || 'SHC-M-';

            // Load audit components
            document.getElementById('configAuditSiteInfo').checked = config.auditComponents?.SiteInfo !== false;
            document.getElementById('configAuditApplications').checked = config.auditComponents?.Applications !== false;
            document.getElementById('configAuditDesktops').checked = config.auditComponents?.Desktops !== false;
            document.getElementById('configAuditCatalogs').checked = config.auditComponents?.Catalogs !== false;
            document.getElementById('configAuditDeliveryGroups').checked = config.auditComponents?.DeliveryGroups !== false;
            document.getElementById('configAuditUsageStats').checked = config.auditComponents?.UsageStats !== false;
            document.getElementById('configAuditPolicies').checked = config.auditComponents?.Policies !== false;
            document.getElementById('configAuditRoles').checked = config.auditComponents?.Roles !== false;
            document.getElementById('configAuditVMwareSpecs').checked = config.auditComponents?.VMwareSpecs || false;
            document.getElementById('configAuditVMwareFolders').checked = config.auditComponents?.VMwareFolders || false;
            document.getElementById('configAuditAppIcons').checked = config.auditComponents?.AppIcons !== false;
            document.getElementById('configAuditServers').checked = config.auditComponents?.Servers !== false;
            document.getElementById('configAuditDirectorOData').checked = config.auditComponents?.DirectorOData !== false;
        } else {
            console.log('No config found on server, using defaults');
        }
    } catch (error) {
        console.error('Error loading config from server into main modal:', error);
    }
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
    
    // Activate selected tab (only if event exists)
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // Find and activate the tab by task name
        const tab = document.querySelector(`[onclick*="showHorizonTask('${taskName}')"]`);
        if (tab) {
            tab.classList.add('active');
        }
    }
    
    // Task-specific initialization
    if (taskName === 'cloneMasterImage') {
        // Load master images if available
        loadCloneMasterImages();
    } else if (taskName === 'masterImageSearch') {
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
    if (selectedCloneImages.size === 0) {
        alert('Please select at least one master image to clone.');
        return;
    }

    // Get selected image details
    const selectedImages = cloneMasterImagesData.MasterImages.filter(img =>
        selectedCloneImages.has(img.Name)
    );

    // VMware toggle
    const enableVMwareFolders = document.getElementById('enableVMwareFoldersToggle')?.checked || false;

    // Get folder and move options (only if enabled)
    const destinationFolder = enableVMwareFolders ? document.getElementById('cloneDestinationFolder').value.trim() : '';
    const moveSourceAfterClone = enableVMwareFolders ? document.getElementById('moveSourceAfterClone').checked : false;
    const sourceMoveFolder = enableVMwareFolders ? document.getElementById('sourceMoveFolder').value.trim() : '';

    if (enableVMwareFolders) {
        if (!destinationFolder) {
            alert('Please specify a destination folder for the cloned VMs.');
            return;
        }

        if (moveSourceAfterClone && !sourceMoveFolder) {
            alert('Please specify a folder to move source VMs to.');
            return;
        }
    }

    // Generate PowerShell script
    const script = generateCloneScript(selectedImages, destinationFolder, moveSourceAfterClone, sourceMoveFolder, enableVMwareFolders);

    // Display script
    document.getElementById('cloneScriptContent').value = script;
    document.getElementById('cloneScriptOutput').style.display = 'block';

    // Scroll to script output
    document.getElementById('cloneScriptOutput').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function generateCloneScript(selectedImages, destinationFolder, moveSourceAfterClone, sourceMoveFolder, enableVMwareFolders = false) {
    const scriptLines = [
        '# Clone Master Images Script',
        '# Generated by LAB007 Horizon Environment Tasks',
        '# Generated: ' + (function() {
            const now = new Date();
            // EST is UTC-5
            const estTime = new Date(now.getTime() - (5 * 60 * 60 * 1000));
            const hours = estTime.getUTCHours().toString().padStart(2, '0');
            const minutes = estTime.getUTCMinutes().toString().padStart(2, '0');
            const date = estTime.toISOString().split('T')[0];
            return date + ' ' + hours + ':' + minutes + ' EST';
        })(),
        '#',
        '# This script clones selected master images with version-incremented naming',
        '#',
        '',
        '# Requires VMware PowerCLI',
        '# Install-Module -Name VMware.PowerCLI -Scope CurrentUser',
        '',
        '# Connect to vCenter',
        '# Connect-VIServer -Server <vCenterServer> -User <Username> -Password <Password>',
        '',
        '# Function to generate new VM name with incremented version',
        'function Get-NewVMName {',
        '    param([string]$OriginalName)',
        '    ',
        '    # Check if name ends with v followed by digits',
        '    if ($OriginalName -match \'(.+)v(\\d+)$\') {',
        '        $baseName = $matches[1]',
        '        $version = [int]$matches[2]',
        '        $newVersion = $version + 1',
        '        return "$baseName$newVersion"',
        '    } else {',
        '        # No version found, add v2',
        '        return "$OriginalName" + "v2"',
        '    }',
        '}',
        '',
        '# Function to get VM folder structure',
        'function Get-VMFolders {',
        '    param([string]$RootFolderName = "vm")',
        '    ',
        '    $rootFolder = Get-Folder -Name $RootFolderName -Type VM -ErrorAction SilentlyContinue',
        '    if (-not $rootFolder) {',
        '        $rootFolder = Get-Folder -Type VM | Where-Object { $_.Parent -eq $null } | Select-Object -First 1',
        '    }',
        '    ',
        '    $folders = @()',
        '    function Get-FoldersRecursive {',
        '        param($folder, $depth = 0)',
        '        $indent = "  " * $depth',
        '        $folders += @{',
        '            Name = "$indent$($folder.Name)"',
        '            Path = $folder',
        '            FullPath = $folder.Name',
        '        }',
        '        ',
        '        $folder.ChildEntity | Where-Object { $_ -is [VMware.VimAutomation.ViCore.Types.V1.Inventory.Folder] } | ForEach-Object {',
        '            Get-FoldersRecursive $_ ($depth + 1)',
        '        }',
        '    }',
        '    ',
        '    Get-FoldersRecursive $rootFolder',
        '    return $folders',
        '}',
        '',
        '# Function to display folder selection menu',
        'function Select-VMFolder {',
        '    param([string]$DefaultFolderPath)',
        '    ',
        '    Write-Host "Available VM Folders:" -ForegroundColor Cyan',
        '    Write-Host "==================" -ForegroundColor Cyan',
        '    ',
        '    $folders = Get-VMFolders',
        '    for ($i = 0; $i -lt $folders.Count; $i++) {',
        '        $marker = if ($folders[$i].FullPath -eq $DefaultFolderPath) { " -> " } else { "    " }',
        '        Write-Host "$marker$($i + 1). $($folders[$i].Name)" -ForegroundColor White',
        '    }',
        '    ',
        '    Write-Host ""',
        '    $defaultIndex = ($folders | Where-Object { $_.FullPath -eq $DefaultFolderPath } | Select-Object -First 1)',
        '    $defaultNum = if ($defaultIndex) { [array]::IndexOf($folders, $defaultIndex) + 1 } else { 1 }',
        '    ',
        '    $selection = Read-Host "Select destination folder (default: $defaultNum for \'$DefaultFolderPath\')"',
        '    if ([string]::IsNullOrWhiteSpace($selection)) {',
        '        $selection = $defaultNum',
        '    }',
        '    ',
        '    try {',
        '        $index = [int]$selection - 1',
        '        if ($index -ge 0 -and $index -lt $folders.Count) {',
        '            $selectedFolder = $folders[$index]',
        '            Write-Host "Selected folder: $($selectedFolder.Name)" -ForegroundColor Green',
        '            return $selectedFolder.Path',
        '        } else {',
        '            Write-Host "Invalid selection, using default folder: $DefaultFolderPath" -ForegroundColor Yellow',
        '            return Get-Folder -Name $DefaultFolderPath -Type VM -ErrorAction SilentlyContinue',
        '        }',
        '    }',
        '    catch {',
        '        Write-Host "Invalid input, using default folder: $DefaultFolderPath" -ForegroundColor Yellow',
        '        return Get-Folder -Name $DefaultFolderPath -Type VM -ErrorAction SilentlyContinue',
        '    }',
        '}',
        '',
        '# Function to move VM to different folder',
        'function Move-VMToFolder {',
        '    param([VMware.VimAutomation.ViCore.Types.V1.Inventory.VirtualMachine]$VM, [VMware.VimAutomation.ViCore.Types.V1.Inventory.Folder]$TargetFolder)',
        '    ',
        '    try {',
        '        Write-Host "Moving VM $($VM.Name) to folder $($TargetFolder.Name)..." -ForegroundColor Yellow',
        '        Move-VM -VM $VM -Destination $TargetFolder -ErrorAction Stop',
        '        Write-Host "Successfully moved VM $($VM.Name) to folder $($TargetFolder.Name)" -ForegroundColor Green',
        '        return $true',
        '    }',
        '    catch {',
        '        Write-Host "Failed to move VM $($VM.Name): $($_.Exception.Message)" -ForegroundColor Red',
        '        return $false',
        '    }',
        '}',
        '',
        '# Selected images to clone',
        '$ImagesToClone = @('
    ];
    
    selectedImages.forEach((img, index) => {
        scriptLines.push('    @{');
        scriptLines.push('        OriginalVMName = "' + img.Name + '"');
        scriptLines.push('        ClusterName = "' + (img.Cluster || 'Unknown') + '"');
        scriptLines.push('        HostName = "' + (img.Host || 'Unknown') + '"');
        scriptLines.push('        DatastoreName = "' + (img.Datastore || 'Unknown') + '"');
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
    scriptLines.push('# Configuration from web interface');
    scriptLines.push('$enableVMwareFolders = ' + (enableVMwareFolders ? '$true' : '$false'));
    scriptLines.push('$moveSourceVMs = ' + (enableVMwareFolders && moveSourceAfterClone ? '$true' : '$false'));
    scriptLines.push('$destinationFolderName = "' + (enableVMwareFolders ? destinationFolder.replace(/"/g, '""') : '') + '"');
    if (enableVMwareFolders && moveSourceAfterClone) {
        scriptLines.push('$sourceMoveFolderName = "' + sourceMoveFolder.replace(/"/g, '""') + '"');
    }
    scriptLines.push('');
    scriptLines.push('# Clone each selected image (one at a time)');
    scriptLines.push('$cloneCount = 0');
    scriptLines.push('$totalClones = $ImagesToClone.Count');
    scriptLines.push('foreach ($image in $ImagesToClone) {');
    scriptLines.push('    $cloneCount++');
    scriptLines.push('    $originalVMName = $image.OriginalVMName');
    scriptLines.push('    $clusterName = $image.ClusterName');
    scriptLines.push('    ');
    scriptLines.push('    Write-Host "[$cloneCount/$totalClones] Processing: $originalVMName" -ForegroundColor Cyan');
    scriptLines.push('    Write-Host "  Cluster: $($image.ClusterName)" -ForegroundColor Gray');
    scriptLines.push('    Write-Host "  Host: $($image.HostName)" -ForegroundColor Gray');
    scriptLines.push('    Write-Host "  Datastore: $($image.DatastoreName)" -ForegroundColor Gray');
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
    scriptLines.push('        # Get the primary datastore where VM files are stored (not ISO datastores)');
    scriptLines.push('        Write-Host "  [DEBUG] Finding VM\'s primary datastore..." -ForegroundColor DarkGray');
    scriptLines.push('        $vmDatastore = $null');
    scriptLines.push('        try {');
    scriptLines.push('            # Get datastore from VM\'s configuration');
    scriptLines.push('            $vmDatastoreUrl = $sourceVM.ExtensionData.Config.DatastoreUrl');
    scriptLines.push('            if ($vmDatastoreUrl) {');
    scriptLines.push('                $vmDatastore = Get-Datastore -Url $vmDatastoreUrl.Url -ErrorAction Stop');
    scriptLines.push('                Write-Host "  [DEBUG] Found datastore from VM config: $($vmDatastore.Name)" -ForegroundColor DarkGray');
    scriptLines.push('            }');
    scriptLines.push('        }');
    scriptLines.push('        catch {');
    scriptLines.push('            Write-Host "  [DEBUG] Could not get datastore from VM config, trying alternative method..." -ForegroundColor DarkGray');
    scriptLines.push('        }');
    scriptLines.push('        ');
    scriptLines.push('        # Fallback: Get datastore that contains VM files, excluding ISO datastores');
    scriptLines.push('        if (-not $vmDatastore) {');
    scriptLines.push('            $vmDatastores = $sourceVM.DatastoreIdList | ForEach-Object { Get-Datastore -Id $_ -ErrorAction SilentlyContinue } | Where-Object { $_.Name -notlike "*ISO*" -and $_.Name -notlike "*iso*" }');
    scriptLines.push('            $vmDatastore = $vmDatastores | Select-Object -First 1');
    scriptLines.push('            if ($vmDatastore) {');
    scriptLines.push('                Write-Host "  [DEBUG] Found suitable datastore (excluding ISO): $($vmDatastore.Name)" -ForegroundColor DarkGray');
    scriptLines.push('            } else {');
    scriptLines.push('                # Last resort: use any datastore but warn');
    scriptLines.push('                $vmDatastore = $sourceVM.DatastoreIdList | ForEach-Object { Get-Datastore -Id $_ } | Select-Object -First 1');
    scriptLines.push('                Write-Host "  [WARNING] Using first available datastore (may be ISO): $($vmDatastore.Name)" -ForegroundColor Yellow');
    scriptLines.push('            }');
    scriptLines.push('        }');
    scriptLines.push('        $vmResourcePool = $sourceVM.ResourcePool');
    scriptLines.push('        ');
    scriptLines.push('        # Get datastore cluster instead of specific datastore');
    scriptLines.push('        Write-Host "  [DEBUG] Getting datastore cluster..." -ForegroundColor DarkGray');
    scriptLines.push('        $datastoreCluster = Get-DatastoreCluster -Datastore $vmDatastore -ErrorAction SilentlyContinue');
    scriptLines.push('        if (-not $datastoreCluster) {');
    scriptLines.push('            Write-Host "  [WARNING] No datastore cluster found for datastore $($vmDatastore.Name), using datastore directly" -ForegroundColor Yellow');
    scriptLines.push('            $datastoreCluster = $vmDatastore');
    scriptLines.push('        }');
    scriptLines.push('        ');
    scriptLines.push('        Write-Host "  [DEBUG] Source VM Details:" -ForegroundColor DarkGray');
    scriptLines.push('        Write-Host "    Host: $($vmHost.Name)" -ForegroundColor DarkGray');
    scriptLines.push('        Write-Host "    Datastore: $($vmDatastore.Name)" -ForegroundColor DarkGray');
    scriptLines.push('        Write-Host "    Datastore Cluster: $($datastoreCluster.Name)" -ForegroundColor DarkGray');
    scriptLines.push('        Write-Host "    Resource Pool: $($vmResourcePool.Name)" -ForegroundColor DarkGray');
    scriptLines.push('        ');
    scriptLines.push('        # Generate new VM name with incremented version');
    scriptLines.push('        $newVMName = Get-NewVMName -OriginalName $originalVMName');
    scriptLines.push('        Write-Host "  [DEBUG] New VM name will be: $newVMName" -ForegroundColor DarkGray');

    scriptLines.push('        # Get source VM folder for logging');
    scriptLines.push('        $sourceVMFolder = $sourceVM.Folder');
    scriptLines.push('        Write-Host "  [DEBUG] Source VM folder: $($sourceVMFolder.Name)" -ForegroundColor DarkGray');

    scriptLines.push('        # Get destination folder (respect toggle)');
    scriptLines.push('        if ($enableVMwareFolders -and $destinationFolderName) {');
    scriptLines.push('            Write-Host "  [DEBUG] Using configured destination folder: $destinationFolderName" -ForegroundColor DarkGray');
    scriptLines.push('            try {');
    scriptLines.push('                $destinationFolder = Get-Folder -Name $destinationFolderName.TrimStart(\'/\') -Type VM -ErrorAction Stop');
    scriptLines.push('                Write-Host "  [SUCCESS] Found destination folder: $($destinationFolder.Name)" -ForegroundColor Green');
    scriptLines.push('            }');
    scriptLines.push('            catch {');
    scriptLines.push('                Write-Host "  [ERROR] Could not find destination folder: $destinationFolderName" -ForegroundColor Red');
    scriptLines.push('                Write-Host "  [ERROR] Using VM folder as fallback" -ForegroundColor Yellow');
    scriptLines.push('                $destinationFolder = Get-Folder -Name "vm" -Type VM -ErrorAction SilentlyContinue');
    scriptLines.push('                if (-not $destinationFolder) {');
    scriptLines.push('                    $destinationFolder = $sourceVMFolder');
    scriptLines.push('                }');
    scriptLines.push('            }');
    scriptLines.push('        } else {');
    scriptLines.push('            # VMware operations disabled: keep clone in source folder');
    scriptLines.push('            $destinationFolder = $sourceVMFolder');
    scriptLines.push('            Write-Host "  [INFO] VMware folder operations disabled - using source folder" -ForegroundColor Yellow');
    scriptLines.push('        }');

    scriptLines.push('        # Get backup folder if moving source VMs');
    scriptLines.push('        $backupFolder = $null');
    scriptLines.push('        if ($moveSourceVMs) {');
    scriptLines.push('            Write-Host "  [DEBUG] Using configured source move folder: $sourceMoveFolderName" -ForegroundColor DarkGray');
    scriptLines.push('            try {');
    scriptLines.push('                $backupFolder = Get-Folder -Name $sourceMoveFolderName.TrimStart(\'/\') -Type VM -ErrorAction Stop');
    scriptLines.push('                Write-Host "  [SUCCESS] Found source move folder: $($backupFolder.Name)" -ForegroundColor Green');
    scriptLines.push('            }');
    scriptLines.push('            catch {');
    scriptLines.push('                Write-Host "  [ERROR] Could not find source move folder: $sourceMoveFolderName" -ForegroundColor Red');
    scriptLines.push('                Write-Host "  [WARNING] Source VMs will not be moved after cloning" -ForegroundColor Yellow');
    scriptLines.push('                $backupFolder = $null');
    scriptLines.push('            }');
    scriptLines.push('        }');
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
    scriptLines.push('        Write-Host "    from Host $($vmHost.Name) on Storage $($datastoreCluster.Name)" -ForegroundColor Yellow');
    scriptLines.push('        Write-Host "    To Clone machine $newVMName" -ForegroundColor Yellow');
    scriptLines.push('        ');
    scriptLines.push('        # Perform the clone with task monitoring');
    scriptLines.push('        Write-Host "  [DEBUG] Starting clone operation..." -ForegroundColor DarkGray');
    scriptLines.push('        Write-Host "  Clone in progress..." -ForegroundColor Yellow');
    scriptLines.push('        ');
    scriptLines.push('        # Start clone task');
    scriptLines.push('        $cloneTask = New-VM -VM $sourceVM -Name $newVMName -VMHost $vmHost -Datastore $datastoreCluster -Location $destinationFolder -ResourcePool $vmResourcePool -RunAsync');
    scriptLines.push('        ');
    scriptLines.push('        # Monitor task progress');
    scriptLines.push('        Write-Host "  [MONITOR] Monitoring clone task..." -ForegroundColor Cyan');
    scriptLines.push('        $taskComplete = $false');
    scriptLines.push('        $taskStartTime = Get-Date');
    scriptLines.push('        ');
    scriptLines.push('        while (-not $taskComplete) {');
    scriptLines.push('            try {');
    scriptLines.push('                $currentTask = Get-Task -Id $cloneTask.Id -ErrorAction Stop');
    scriptLines.push('                $progress = $currentTask.PercentComplete');
    scriptLines.push('                $state = $currentTask.State');
    scriptLines.push('                ');
    scriptLines.push('                # Show progress every 10 seconds');
    scriptLines.push('                $elapsed = (Get-Date) - $taskStartTime');
    scriptLines.push('                if ($elapsed.TotalSeconds % 10 -lt 1) {');
    scriptLines.push('                    Write-Host "  [PROGRESS] Clone progress: $progress% (State: $state)" -ForegroundColor Cyan');
    scriptLines.push('                }');
    scriptLines.push('                ');
    scriptLines.push('                if ($state -eq "Success") {');
    scriptLines.push('                    $taskComplete = $true');
    scriptLines.push('                    $newVM = $currentTask.Result');
    scriptLines.push('                    Write-Host "  [SUCCESS] Clone complete: $newVMName" -ForegroundColor Green');
    scriptLines.push('                    Write-Host "    New VM ID: $($newVM.Id)" -ForegroundColor DarkGray');
    scriptLines.push('                    Write-Host "    New VM Power State: $($newVM.PowerState)" -ForegroundColor DarkGray');
    scriptLines.push('                    ');
    scriptLines.push('                    # Move source VM to backup folder if requested');
    scriptLines.push('                    if ($moveSourceVMs -and $backupFolder) {');
    scriptLines.push('                        Write-Host "  [BACKUP] Moving source VM to backup folder..." -ForegroundColor Yellow');
    scriptLines.push('                        $moveResult = Move-VMToFolder -VM $sourceVM -TargetFolder $backupFolder');
    scriptLines.push('                        if ($moveResult) {');
    scriptLines.push('                            Write-Host "  [BACKUP] Source VM successfully moved to backup" -ForegroundColor Green');
    scriptLines.push('                        }');
    scriptLines.push('                    }');
    scriptLines.push('                }');
    scriptLines.push('                elseif ($state -eq "Error") {');
    scriptLines.push('                    $taskComplete = $true');
    scriptLines.push('                    Write-Host "  [ERROR] Clone task failed: $($currentTask.Description)" -ForegroundColor Red');
    scriptLines.push('                    if ($currentTask.ExtensionData.Info.Error) {');
    scriptLines.push('                        Write-Host "  [ERROR] Error details: $($currentTask.ExtensionData.Info.Error.LocalizedMessage)" -ForegroundColor Red');
    scriptLines.push('                    }');
    scriptLines.push('                    continue');
    scriptLines.push('                }');
    scriptLines.push('            }');
    scriptLines.push('            catch {');
    scriptLines.push('                Write-Host "  [ERROR] Failed to monitor task: $($_.Exception.Message)" -ForegroundColor Red');
    scriptLines.push('                $taskComplete = $true');
    scriptLines.push('                continue');
    scriptLines.push('            }');
    scriptLines.push('            ');
    scriptLines.push('            # Wait 2 seconds before checking again');
    scriptLines.push('            Start-Sleep -Seconds 2');
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
    a.download = 'Clone-Images.ps1';
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
    // Generate script name based on prefix
    const scriptName = `Get-MasterImages-${masterPrefix.replace(/-$/, '')}.ps1`;

    // Generate the PowerShell script
    const script = `# ${scriptName}
# Discovers VMware VMs matching ${masterPrefix} pattern for GoldenSun project
# Connects to vCenter and extracts master image information
# Author : LAB007.AI
# Version: 1.0
# Generated: ${(function() {
    const now = new Date();
    // EST is UTC-5
    const estTime = new Date(now.getTime() - (5 * 60 * 60 * 1000));
    const hours = estTime.getUTCHours().toString().padStart(2, '0');
    const minutes = estTime.getUTCMinutes().toString().padStart(2, '0');
    const date = estTime.toISOString().split('T')[0];
    return date + ' ' + hours + ':' + minutes + ' EST';
})()}

param(
    [string]$OutputPath = '.\\Data\\goldensun-master-images.json',
    [string]$vCenterServer = '${vCenterServer}',
    [string]$MasterImagePrefix = '${masterPrefix}'
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
    Write-Host "[DEBUG] MasterImagePrefix: $MasterImagePrefix" | Out-File -FilePath $debugFile -Append
    # DEBUG output removed from screen for cleaner display
    # Check if VMware PowerCLI is available
    $vmwareModule = Get-Module -ListAvailable -Name VMware.PowerCLI
    if (-not $vmwareModule) {
        Write-Error 'VMware PowerCLI module not found. Please install it first.'
        Write-Host 'You can install it with: Install-Module -Name VMware.PowerCLI -Scope CurrentUser' -ForegroundColor Yellow
        exit 1
    }

    # Import VMware PowerCLI module
    Import-Module VMware.PowerCLI -ErrorAction Stop

    # Suppress certificate warnings
    Set-PowerCLIConfiguration -InvalidCertificateAction Ignore -Confirm:$false -Scope Session | Out-Null

    # Validate vCenter server parameter
    if ([string]::IsNullOrWhiteSpace($vCenterServer)) {
        Write-Error 'vCenter Server name is required'
        exit 1
    }

    # Validate master image prefix
    if ([string]::IsNullOrWhiteSpace($MasterImagePrefix)) {
        Write-Warning "MasterImagePrefix not specified, using default: $masterPrefix"
        $MasterImagePrefix = '$masterPrefix'
    }

    # Prompt for credentials
    $credential = Get-Credential -Message "Enter vCenter credentials for $vCenterServer"

    Write-Host "Connecting to vCenter Server: $vCenterServer..." -ForegroundColor Yellow

    # Connect to vCenter
    try {
        $connection = Connect-VIServer -Server $vCenterServer -Credential $credential -ErrorAction Stop
        Write-Host "[DEBUG] Successfully connected to $vCenterServer" | Out-File -FilePath $debugFile -Append
    }
    catch {
        Write-Error "Failed to connect to vCenter: $_"
        Write-Host "[DEBUG] Failed to connect to vCenter: $_" | Out-File -FilePath $debugFile -Append
        exit 1
    }

    # Search for VMs matching the specified prefix pattern
    Write-Host "[DEBUG] Searching for VMs matching pattern $MasterImagePrefix*" | Out-File -FilePath $debugFile -Append

    $vms = Get-VM -Name "$MasterImagePrefix*" -ErrorAction SilentlyContinue

    if (-not $vms -or $vms.Count -eq 0) {
        Write-Warning "No VMs found matching pattern $MasterImagePrefix*"
        Write-Host "[DEBUG] No VMs found matching pattern $MasterImagePrefix*" | Out-File -FilePath $debugFile -Append
        $masterImages = @()
    } else {
        Write-Host "Found $($vms.Count) master image(s)" -ForegroundColor Green

        $masterImages = @()

        foreach ($vm in $vms) {
            # Processing output removed for cleaner display

            # Get VM details
            $cluster = Get-Cluster -VM $vm -ErrorAction SilentlyContinue
            $vmHost = Get-VMHost -VM $vm -ErrorAction SilentlyContinue
            $datastore = Get-Datastore -VM $vm -ErrorAction SilentlyContinue | Select-Object -First 1

            # Parse VM name to extract components
            # Expected format: {Prefix}{ImageName}V{Version} or {Prefix}{ImageName}
            $vmName = $vm.Name
            $shortName = $vmName
            $clusterName = if ($cluster) { $cluster.Name } else { 'Unknown' }
            $version = 'V1'

            # Extract version if present (look for V followed by number at the end)
            if ($vmName -match '(.+?)(V\d+)$') {
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
            Write-Host "[DEBUG] Processed VM: $vmName" | Out-File -FilePath $debugFile -Append
        }
    }

    # Create result object
    $result = @{
        TotalImages = $masterImages.Count
        vCenterServer = $vCenterServer
        MasterImagePrefix = $MasterImagePrefix
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
    Write-Host "[DEBUG] Disconnected from vCenter" | Out-File -FilePath $debugFile -Append

    return $result
}
catch {
    Write-Error 'Failed to collect master images information: $_'
    Write-Host "[DEBUG] Script failed: $_" | Out-File -FilePath $debugFile -Append

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
        MasterImagePrefix = if ($MasterImagePrefix) { $MasterImagePrefix } else { 'Unknown' }
        CollectedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        MasterImages = @()
        Error = $_.ToString()
    }

    $errorResult | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8 -Force

    exit 1
}`;

    return script;
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

    // Create filename based on prefix
    const cleanPrefix = masterPrefix.replace(/-$/, '').replace(/[^a-zA-Z0-9\-]/g, '_');
    const filename = `Get-MasterImages-${cleanPrefix}.ps1`;

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
    a.download = 'Add-HorizonApplications-' + (function() {
        const now = new Date();
        // EST is UTC-5
        const estTime = new Date(now.getTime() - (5 * 60 * 60 * 1000));
        return estTime.toISOString().split('T')[0];
    })() + '.ps1';
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


// VMware Folders Functions
let vmwareFoldersData = [];

// Load config and populate clone folder fields
async function loadConfigForCloneFields() {
    try {
        // Try to load config from server
        const response = await fetch('/api/audit-config');
        if (response.ok) {
            const config = await response.json();
            console.log('Config loaded for clone fields:', config);

            // Populate clone folder fields from config
            const destField = document.getElementById('cloneDestinationFolder');
            const sourceField = document.getElementById('sourceMoveFolder');

            if (destField && config.cloneDestinationFolder) {
                destField.value = config.cloneDestinationFolder;
                console.log('Set destination folder from config:', config.cloneDestinationFolder);
            }

            if (sourceField && config.sourceMoveFolder) {
                sourceField.value = config.sourceMoveFolder;
                console.log('Set source move folder from config:', config.sourceMoveFolder);
            }

            // If both folders are configured, show a note
            if (config.cloneDestinationFolder && config.sourceMoveFolder) {
                const note = document.createElement('div');
                note.style.cssText = 'margin-top: 10px; padding: 10px; background: #e8f5e8; border: 1px solid #4caf50; border-radius: 4px; color: #2e7d32; font-size: 14px;';
                note.innerHTML = '📁 <strong>Folders configured from LAB007-Config.JSON</strong><br>Destination and source move folders are pre-filled from your saved configuration.';
                destField.parentNode.insertBefore(note, destField.nextSibling);
            }
        }
    } catch (error) {
        console.log('Could not load config for clone fields:', error);
        // This is expected when running locally without server
    }
}

function loadVMwareFoldersFile() {
    const fileInput = document.getElementById('vmwareFoldersFileInput');
    fileInput.click();
}

function handleVMwareFoldersFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            vmwareFoldersData = JSON.parse(e.target.result);
            document.getElementById('vmwareFoldersFileName').textContent = `Loaded: ${file.name}`;

            // Update the global vmwareFolders variable used by folder browser
            vmwareFolders = vmwareFoldersData.Folders || [];

            console.log(`Loaded ${vmwareFolders.length} VMware folders from ${file.name}`);
        } catch (error) {
            alert(`Error parsing JSON file: ${error.message}`);
        }
    };
    reader.readAsText(file);
}

// Clone Master Images Functions
let cloneMasterImagesData = [];

async function loadCloneMasterImages() {
    // Try to load from default location
    try {
        let response = await fetch('/citrix/data/goldensun-master-images.json', { cache: 'no-cache' });
        if (!response.ok) {
            response = await fetch('/data/goldensun-master-images.json', { cache: 'no-cache' });
        }

        if (response.ok) {
            cloneMasterImagesData = await response.json();
            document.getElementById('cloneMasterImagesFileName').textContent = 'Loaded: goldensun-master-images.json';
            displayCloneMasterImages();
        } else {
            document.getElementById('masterImagesCloneList').innerHTML = '<p style="color: #666;">No master images loaded. Click "Load Master Images JSON" to select a file.</p>';
        }
    } catch (error) {
        console.error('Error loading clone master images:', error);
        document.getElementById('masterImagesCloneList').innerHTML = '<p style="color: #666;">No master images loaded. Click "Load Master Images JSON" to select a file.</p>';
    }
}

function loadCloneMasterImagesFile() {
    const fileInput = document.getElementById('cloneMasterImagesFileInput');
    fileInput.click();
}

function handleCloneMasterImagesFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            cloneMasterImagesData = JSON.parse(e.target.result);
            document.getElementById('cloneMasterImagesFileName').textContent = `Loaded: ${file.name}`;

            // Show the hidden sections after successful file load
            document.getElementById('cloneImagesSection').style.display = 'block';
            document.getElementById('cloneScriptSection').style.display = 'block';

            displayCloneMasterImages();
        } catch (error) {
            alert(`Error parsing JSON file: ${error.message}`);
        }
    };
    reader.readAsText(file);
}

function displayCloneMasterImages() {
    const container = document.getElementById('masterImagesCloneList');

    if (!cloneMasterImagesData || !cloneMasterImagesData.MasterImages || cloneMasterImagesData.MasterImages.length === 0) {
        container.innerHTML = '<p style="color: #666;">No master images found in the loaded file.</p>';
        return;
    }

    let html = `<p style="margin-bottom: 15px; color: #666;">Found ${cloneMasterImagesData.MasterImages.length} master image(s) from ${cloneMasterImagesData.vCenterServer || 'Unknown Server'}</p>`;

    html += `<button type="button" class="btn btn-sm" onclick="selectAllCloneImages()">Select All</button> `;
    html += `<button type="button" class="btn btn-sm" onclick="deselectAllCloneImages()">Deselect All</button>`;
    html += `<hr style="margin: 10px 0;">`;

    cloneMasterImagesData.MasterImages.forEach((image, index) => {
        const isChecked = selectedCloneImages.has(image.Name) ? 'checked' : '';

        html += `
            <div style="border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 10px;">
                <label style="display: flex; align-items: flex-start; cursor: pointer;">
                    <input type="checkbox" style="margin-right: 10px; margin-top: 2px;" ${isChecked}
                           onchange="toggleCloneImageSelection('${image.Name.replace(/'/g, "\\'")}')">
                    <div style="flex: 1;">
                        <strong>${image.Name}</strong>
                        <div style="font-size: 12px; color: #666; margin-top: 2px;">
                            Version: ${image.Version || 'Unknown'} | Cluster: ${image.Cluster || 'Unknown'} | Host: ${image.Host || 'Unknown'}
                        </div>
                        <div style="font-size: 11px; color: #888; margin-top: 2px;">
                            CPU: ${image.NumCPU || 0} | RAM: ${image.MemoryGB || 0}GB | Disk: ${image.ProvisionedSpaceGB || 0}GB
                        </div>
                    </div>
                </label>
            </div>
        `;
    });

    container.innerHTML = html;
}

let selectedCloneImages = new Set();

function toggleCloneImageSelection(imageName) {
    if (selectedCloneImages.has(imageName)) {
        selectedCloneImages.delete(imageName);
    } else {
        selectedCloneImages.add(imageName);
    }
}

function selectAllCloneImages() {
    if (!cloneMasterImagesData || !cloneMasterImagesData.MasterImages) return;

    cloneMasterImagesData.MasterImages.forEach(image => {
        selectedCloneImages.add(image.Name);
    });
    displayCloneMasterImages();
}

function deselectAllCloneImages() {
    selectedCloneImages.clear();
    displayCloneMasterImages();
}

// Function to save config to JSON file for PowerShell scripts
async function saveConfigToFile(config) {
    try {
        console.log('Saving config to file:', config);
        const response = await fetch('/api/audit-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(config)
        });

        console.log('API response status:', response.status);
        const responseText = await response.text();
        console.log('API response:', responseText);

        if (!response.ok) {
            console.error('Could not save config to file:', response.status, responseText);
            alert('Failed to save config to file: ' + response.status + ' ' + responseText);
        } else {
            console.log('Config saved to file successfully');
        }
    } catch (error) {
        console.error('Error saving config to file:', error);
        alert('Error saving config to file: ' + error.message);
    }
}

