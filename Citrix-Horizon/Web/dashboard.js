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

// GoldenSun (Prod/Test clone helper)
let goldenSunImages = [];
let goldenSunReportSort = 'name';
let goldenSunSelectedImages = new Set();
let goldenSunActiveTab = 'search';
let goldenSunFileOptions = [];
// Farm report (Horizon + VMware master images)
let farmReportRows = [];
let farmSelectedMasters = new Set();
const GOLDEN_SUN_DEFAULT_VCENTER = 'shcvcsacx01v.ccr.cchcs.org';
const HZ_ADMIN_DEFAULT_BASE = 'https://shchrznconap04v.ccr.cchcs.org';

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

    // Push Windows Update toggle (default ON)
    const pushWindowsToggle = document.getElementById('pushWindowsUpdateToggle');
    if (pushWindowsToggle) {
        pushWindowsToggle.checked = true;
    }

    // Config button
    const configBtn = document.getElementById('configBtn');
    if (configBtn) {
        configBtn.addEventListener('click', () => {
            console.log('Config button clicked');
                closeAllModals('configModal');
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

    // GoldenSun button
    const goldenSunBtn = document.getElementById('goldenSunBtn');
    if (goldenSunBtn) {
        goldenSunBtn.addEventListener('click', () => {
            showGoldenSunModal();
        });
    }

    // GoldenSun environment selector
    const goldenSunEnvSelect = document.getElementById('goldenSunEnvSelect');
    if (goldenSunEnvSelect) {
        goldenSunEnvSelect.addEventListener('change', () => {
            goldenSunCurrentEnv = goldenSunEnvSelect.value || 'Prod';
            reloadGoldenSunImages();
        });
    }

    // GoldenSun file select refresh
    window.fetchGoldenSunFileList = fetchGoldenSunFileList;
    window.openGoldenSunFileDialog = openGoldenSunFileDialog;

    // GoldenSun tabs
    window.showGoldenSunTab = function(tab) {
        goldenSunActiveTab = tab;
        const clonePanel = document.getElementById('goldenSunClonePanel');
        const reportPanel = document.getElementById('goldenSunReportPanel');
        const farmPanel = document.getElementById('goldenSunFarmPanel');
        const tabClone = document.getElementById('goldenSunTabClone');
        const tabReport = document.getElementById('goldenSunTabReport');
        const tabFarm = document.getElementById('goldenSunTabFarm');
        if (clonePanel) clonePanel.style.display = tab === 'clone' ? 'block' : 'none';
        if (reportPanel) reportPanel.style.display = tab === 'report' ? 'block' : 'none';
        if (farmPanel) farmPanel.style.display = tab === 'farm' ? 'block' : 'none';
        if (tabClone) tabClone.classList.toggle('active', tab === 'clone');
        if (tabReport) tabReport.classList.toggle('active', tab === 'report');
        if (tabFarm) tabFarm.classList.toggle('active', tab === 'farm');
        if (tab === 'report') renderGoldenSunReport();
        if (tab === 'farm') renderGoldenSunFarmReport();
    };

    // GoldenSun search generate
    window.generateGoldenSunSearchScript = generateGoldenSunSearchScript;
    window.copyGoldenSunSearchScript = copyGoldenSunSearchScript;
    window.downloadGoldenSunSearchScript = downloadGoldenSunSearchScript;
    window.generateGoldenSunReportScript = generateGoldenSunReportScript;
    window.copyGoldenSunReportScript = copyGoldenSunReportScript;
    window.downloadGoldenSunReportScript = downloadGoldenSunReportScript;

    // GoldenSun file picker
    const gsPicker = document.getElementById('goldenSunFilePicker');
    if (gsPicker) {
        gsPicker.addEventListener('change', handleGoldenSunFilePick);
    }

    // Farm report JSON file picker (local file to avoid CORS)
    const farmPicker = document.getElementById('goldenSunFarmFilePicker');
    if (farmPicker) {
        farmPicker.addEventListener('change', handleGoldenSunFarmFilePick);
    }
    window.openFarmFileDialog = function() {
        const picker = document.getElementById('goldenSunFarmFilePicker');
        if (picker) picker.click();
    };

    // Pre-fill GoldenSun vCenter if empty
    const gsVcInput = document.getElementById('goldenSunSearchVCenter');
    if (gsVcInput && !gsVcInput.value) {
        gsVcInput.value = GOLDEN_SUN_DEFAULT_VCENTER;
    }

    // Prefill Admin Horizon base if empty
    const adminBaseInput = document.getElementById('adminHorizonBase');
    if (adminBaseInput && !adminBaseInput.value) {
        adminBaseInput.value = HZ_ADMIN_DEFAULT_BASE;
    }

    // GoldenSun VMware toggle
    const goldenSunVmwareToggle = document.getElementById('goldenSunVmwareToggle');
    if (goldenSunVmwareToggle) {
        goldenSunVmwareToggle.addEventListener('change', handleGoldenSunVmToggle);
    }

    // GoldenSun Push Windows Update toggle (default ON)
    const goldenSunPushToggle = document.getElementById('goldenSunPushWindowsUpdateToggle');
    if (goldenSunPushToggle) {
        goldenSunPushToggle.checked = true;
    }

    // GoldenSun move-source toggle
    const goldenSunMoveSource = document.getElementById('goldenSunMoveSource');
    if (goldenSunMoveSource) {
        goldenSunMoveSource.addEventListener('change', handleGoldenSunMoveSourceToggle);
    }

    // Close GoldenSun modal when clicking outside
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('goldenSunModal');
        if (modal && event.target === modal) {
            closeGoldenSunModal();
        }
    });

    // Debug Tools modal
    const uploadDebugBtn = document.getElementById('uploadDebugBtn');
    if (uploadDebugBtn) {
        uploadDebugBtn.addEventListener('click', () => {
            openDebugToolsModal();
        });
    }
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('debugToolsModal');
        if (modal && event.target === modal) {
            closeDebugToolsModal();
        }
    });

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

    const fileName = file.name || '';
    const fileNameLower = fileName.toLowerCase();
    const isJson = fileNameLower.endsWith('.json');
    const isZip = fileNameLower.endsWith('.zip');
    const isValidJsonName = fileNameLower.startsWith('0-citrix-audit') && isJson;

    hideError();
    showLoading();

    if (isZip) {
        // Try JSON bundle first, then YAML bundle
        parseCitrixJsonBundleZip(file)
            .then(data => {
                if (data) {
                    auditData = data;
                    displayDashboard(auditData);
                    return;
                }
                return parseCitrixExportZip(file).then(data => {
                    auditData = data;
                    displayDashboard(auditData);
                });
            })
            .catch(err => {
                console.error('ZIP parse error:', err);
                showError('Error parsing ZIP file: ' + err.message);
                hideDashboard();
            });
        return;
    }

    if (!isValidJsonName) {
        showError(`Invalid file selected. Please select "0-Citrix-audit*.json" or a Citrix export ZIP. Selected: ${fileName}`);
        hideDashboard();
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            auditData = JSON.parse(e.target.result);
            try {
                displayDashboard(auditData);
            } catch (err) {
                console.error('Display error:', err);
                showError('Error rendering audit data: ' + (err.message || err));
                hideDashboard();
            }
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
            // Also render the bundle client-side if the helper exists
            if (window.renderCsBundleFromFile) {
                window.renderCsBundleFromFile(file);
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

// -------------------------------
// Debug Tools Modal (inline)
// -------------------------------
let debugToolsInitialized = false;

function openDebugToolsModal() {
    closeAllModals('debugToolsModal');
    const modal = document.getElementById('debugToolsModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        showDebugToolsTab('upload');
        if (!debugToolsInitialized) {
            initDebugTools();
            debugToolsInitialized = true;
        }
    }
}

function closeDebugToolsModal() {
    const modal = document.getElementById('debugToolsModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

function showDebugToolsTab(tab) {
    const uploadPanel = document.getElementById('debugToolsUploadPanel');
    const anonPanel = document.getElementById('debugToolsAnonPanel');
    const uploadBtn = document.getElementById('debugTabUploadBtn');
    const anonBtn = document.getElementById('debugTabAnonBtn');

    if (uploadPanel) uploadPanel.style.display = tab === 'upload' ? 'block' : 'none';
    if (anonPanel) anonPanel.style.display = tab === 'anon' ? 'block' : 'none';
    if (uploadBtn) uploadBtn.classList.toggle('active', tab === 'upload');
    if (anonBtn) anonBtn.classList.toggle('active', tab === 'anon');
}

function initDebugTools() {
    // Upload & Store
    const pickBtn = document.getElementById('debugStorePickBtn');
    const fileInput = document.getElementById('debugStoreFileModal');
    if (pickBtn && fileInput) {
        pickBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) {
                uploadDebugStoreFile(file);
            }
            e.target.value = '';
        });
    }

    // Anonymise
    const anonPickBtn = document.getElementById('anonPickBtn');
    const anonFile = document.getElementById('anonFileModal');
    if (anonPickBtn && anonFile) {
        anonPickBtn.addEventListener('click', () => anonFile.click());
        anonFile.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (file) {
                await anonymiseModalFile(file);
            }
            e.target.value = '';
        });
    }
}

function uploadDebugStoreFile(file) {
    const status = document.getElementById('debugStoreStatus');
    if (!file) {
        if (status) status.textContent = 'No file chosen.';
        return;
    }
    if (status) status.innerHTML = `<span class="spinner-eye"></span> Uploading ${file.name}...`;

    const formData = new FormData();
    formData.append('debugFile', file);

    fetch('/citrix/api/upload-debug', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            if (status) status.textContent = `Uploaded: ${data.file?.filename || file.name}`;
            if (window.renderCsBundleFromFile) {
                try {
                    window.renderCsBundleFromFile(file);
                } catch (err) {
                    console.warn('Bundle render failed:', err);
                }
            }
        } else {
            if (status) status.textContent = `Upload failed: ${data.error || 'Unknown error'}`;
        }
    })
    .catch(err => {
        console.error('Upload error', err);
        if (status) status.textContent = `Upload error: ${err.message || err}`;
    });
}

async function anonymiseModalFile(file) {
    const status = document.getElementById('anonStatusModal');
    if (status) status.innerHTML = `<span class="spinner-eye"></span> Processing ${file.name}...`;
    try {
        const text = await file.text();
        const domainsRaw = document.getElementById('anonDomainsModal')?.value || '';
        const domainList = domainsRaw.split(',').map(s => s.trim()).filter(Boolean);
        const doIp = document.getElementById('anonIpModal')?.checked;
        const doUser = document.getElementById('anonUserModal')?.checked;
        const serverPrefix = (document.getElementById('anonServerPrefixModal')?.value || '').trim();
        const doOuHide = document.getElementById('anonOuHideModal')?.checked;

        let out = text;
        domainList.forEach(d => {
            const esc = d.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
            const re = new RegExp(esc,'gi');
            out = out.replace(re,'DUMMYDOMAIN');
        });
        if (doIp) {
            out = out.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'1.2.3.4');
        }
        if (doUser) {
            out = out.replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,'USERID');
            out = out.replace(/\b[a-zA-Z]{2,3}\d+\b/g,'USERID');
        }
        if (serverPrefix) {
            const esc = serverPrefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
            const re = new RegExp(`${esc}[A-Za-z0-9._-]*`, 'gi');
            out = out.replace(re, 'SERVERNAME');
        }
        if (doOuHide) {
            out = out.replace(/OU=[^;]*;/g, 'OU=HIDDEN;');
        }

        const extMatch = file.name.match(/(\.[^.]+)$/);
        const ext = extMatch ? extMatch[1] : '.txt';
        const base = file.name.replace(/(\.[^.]+)$/,'');
        const fname = `${base}_anon${ext}`;
        const blob = new Blob([out], { type:'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fname;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (status) status.textContent = `Anonymised and downloaded: ${fname}`;
    } catch (err) {
        console.error('Anonymise error', err);
        if (status) status.textContent = `Error: ${err.message || err}`;
    }
}

// Parse Citrix export ZIP (YAML bundle) into dashboard-friendly JSON
async function parseCitrixExportZip(file) {
    if (typeof JSZip === 'undefined' || typeof jsyaml === 'undefined') {
        throw new Error('Missing JSZip or js-yaml libraries');
    }

    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const entries = Object.keys(zip.files || {});

    const readYaml = async (candidateName) => {
        const match = entries.find(e => e.toLowerCase().endsWith(candidateName.toLowerCase()));
        if (!match) return null;
        const text = await zip.file(match).async('string');
        try {
            return jsyaml.load(text) || null;
        } catch (err) {
            console.warn(`YAML parse failed for ${match}:`, err);
            return null;
        }
    };

    const mc = await readYaml('MachineCatalog.yml');
    const dg = await readYaml('DeliveryGroup.yml');
    const app = await readYaml('Application.yml');
    const host = await readYaml('HostConnection.yml');
    const site = await readYaml('SiteSettings.yml');
    const gp = await readYaml('GroupPolicy.yml');
    const adminAdmins = await readYaml('AdminAdministrator.yml');
    const adminRoles = await readYaml('AdminRole.yml');
    const adminScopes = await readYaml('AdminScope.yml');
    const metaSource = mc?.MetaData || dg?.MetaData || app?.MetaData || host?.MetaData;

    const machineCatalogs = mc?.MachineCatalogData || [];
    const deliveryGroups = dg?.DeliveryGroupData || [];
    const applications = app?.ApplicationData || [];

    // Catalogs
    const catalogs = machineCatalogs.map(cat => {
        const machines = cat.Machines || [];
        return {
            Name: cat.Name || 'Unknown Catalog',
            AllocationType: cat.AllocationType || '',
            ProvisioningType: cat.ProvisioningType || '',
            SessionSupport: cat.SessionSupport || '',
            TotalCount: machines.length,
            AvailableCount: machines.length,
            InUseCount: 0,
            PersistUserChanges: (cat.PersistUserChanges || '').toLowerCase().includes('on'),
        };
    });

    // Servers (flatten machines from catalogs)
    const servers = [];
    machineCatalogs.forEach(cat => {
        (cat.Machines || []).forEach(machine => {
            servers.push({
                Name: machine.Name || machine.DnsName || 'Unknown',
                PowerState: 'Unknown',
                RegistrationState: 'Unknown',
                TotalRAM_GB: undefined,
                CPUCores: undefined,
                CPULogicalProcessors: undefined,
                DiskTotalSize_GB: undefined,
                DiskFreeSpace_GB: undefined,
                OSVersion: '',
                DesktopGroup: cat.Name || '',
                SpecsSource: 'None'
            });
        });
    });

    // Delivery groups
    const deliveryGroupList = deliveryGroups.map(g => ({
        Name: g.Name || 'Unknown',
        DesktopKind: g.DesktopKind || '',
        SessionSupport: g.SessionSupport || '',
        TotalMachines: g.Machines?.length || 0,
        AvailableCount: g.Machines?.length || 0,
        InUseCount: 0,
        TotalApplications: g.Applications?.length || 0,
        RestartSchedule: g.RestartSchedule || '',
        RestartScheduleEnabled: !!g.RestartSchedule,
        InMaintenanceMode: !!g.MaintenanceMode,
        Enabled: g.Enabled !== false
    }));

    // Applications
    const apps = applications.map(a => ({
        Name: a.Name || 'Unknown',
        ApplicationName: a.ApplicationName || a.Name || '',
        PublishedName: a.PublishedName || a.ApplicationName || a.Name || '',
        DesktopGroup: a.DeliveryGroups?.[0]?.Name || '',
        CommandLineExecutable: a.CommandLineExecutable || '',
        CommandLineArguments: a.CommandLineArguments || '',
        Enabled: a.Enabled !== false,
        Description: a.Description || ''
    }));

    // Policies
    const policies = (gp?.GroupPolicyData || []).map((p, idx) => ({
        Name: p.Name || `Policy ${idx + 1}`,
        Enabled: p.Enabled !== false,
        Filters: p.Filter || p.Filters || [],
        SettingsCount: Array.isArray(p.Settings) ? p.Settings.length : (p.Settings ? Object.keys(p.Settings).length : 0)
    }));

    // Admin roles and assignments
    const rolesRaw = adminRoles?.AdminRoleData || [];
    const adminsRaw = adminAdmins?.AdminAdministratorData || [];
    const scopesRaw = adminScopes?.AdminScopeData || [];

    const roleAssignmentsMap = new Map(); // role -> {users:Set, scopes:Set}
    adminsRaw.forEach(admin => {
        const user = admin.User || 'Unknown';
        (admin.Rights || []).forEach(r => {
            const roleName = r.Role || 'Unknown';
            const scopeName = r.Scope || 'All';
            if (!roleAssignmentsMap.has(roleName)) {
                roleAssignmentsMap.set(roleName, { users: new Set(), scopes: new Set() });
            }
            const entry = roleAssignmentsMap.get(roleName);
            entry.users.add(user);
            entry.scopes.add(scopeName);
        });
    });

    const scopeMap = new Map();
    scopesRaw.forEach(s => {
        scopeMap.set(s.Name || 'Scope', s.ScopedObjects || []);
    });

    const roles = rolesRaw.map(r => {
        const assignment = roleAssignmentsMap.get(r.Name) || { users: new Set(), scopes: new Set() };
        const scopeObjs = Array.from(assignment.scopes).map(s => ({ Name: s }));
        const scopedFromMap = scopeMap.get(r.Name);
        if (scopedFromMap) {
            scopedFromMap.forEach(obj => scopeObjs.push({ Name: obj.Name || obj }));
        }
        return {
            Name: r.Name || 'Unknown Role',
            Description: r.Description || '',
            IsBuiltIn: false,
            AssignedUsers: Array.from(assignment.users),
            AssignedADGroups: [], // not distinguished in export
            Scopes: scopeObjs,
            Permissions: r.Permissions || []
        };
    });

    // Summary counts
    const summary = {
        SiteName: metaSource?.SiteName || 'Unknown',
        TotalPublishedApplications: apps.length,
        TotalPublishedDesktops: 0,
        MaxConcurrentUsers_30Days: 0,
        LicenseType: metaSource?.LicenseType || 'Unknown',
        ControllerCount: metaSource?.ControllerVersion ? 1 : 0,
        NumberOfCatalogs: catalogs.length,
        NumberOfDeliveryGroups: deliveryGroupList.length,
        UniqueUserConnections_30Days: 0,
        TotalNumberOfServers: servers.length,
        TotalUniqueMasterImages: 0,
        TotalStoreFrontStores: 0
    };

    return {
        summary,
        SiteName: summary.SiteName,
        TotalPublishedApplications: summary.TotalPublishedApplications,
        TotalPublishedDesktops: summary.TotalPublishedDesktops,
        MaxConcurrentUsers_30Days: summary.MaxConcurrentUsers_30Days,
        LicenseType: summary.LicenseType,
        ControllerCount: summary.ControllerCount,
        NumberOfCatalogs: summary.NumberOfCatalogs,
        NumberOfDeliveryGroups: summary.NumberOfDeliveryGroups,
        UniqueUserConnections_30Days: summary.UniqueUserConnections_30Days,
        TotalNumberOfServers: summary.TotalNumberOfServers,
        TotalUniqueMasterImages: summary.TotalUniqueMasterImages,
        TotalStoreFrontStores: summary.TotalStoreFrontStores,
        Servers: servers,
        Applications: apps,
        DeliveryGroups: deliveryGroupList,
        Catalogs: catalogs,
        Policies: policies,
        Roles: roles,
        Desktops: [],
        StoreFront: site?.SiteData ? site.SiteData : {}
    };
}

// Parse JSON bundle ZIP (multiple citrix-*.json files)
async function parseCitrixJsonBundleZip(file) {
    if (typeof JSZip === 'undefined') {
        throw new Error('Missing JSZip library');
    }
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const entries = Object.keys(zip.files || {});
    const hasJsonBundle = entries.some(e => e.toLowerCase().includes('citrix-servers.json'));
    if (!hasJsonBundle) return null; // not this format

    const readJson = async (name) => {
        const match = entries.find(e => e.toLowerCase() === name.toLowerCase());
        if (!match) return null;
        try {
            let text = await zip.file(match).async('string');
            // strip UTF-8 BOM if present
            if (text.charCodeAt(0) === 0xFEFF) {
                text = text.slice(1);
            }
            return JSON.parse(text);
        } catch (e) {
            console.warn(`JSON parse failed for ${name}:`, e);
            return null;
        }
    };

    const serversData = await readJson('citrix-servers.json') || {};
    const appsData = await readJson('citrix-applications.json') || {};
    const dgData = await readJson('citrix-delivery-groups.json') || {};
    const catData = await readJson('citrix-catalogs.json') || {};
    const policiesData = await readJson('citrix-policies.json') || {};
    const rolesData = await readJson('citrix-roles.json') || {};
    const siteInfoData = await readJson('citrix-site-info.json') || {};
    const storefrontData = await readJson('citrix-storefront.json') || {};
    const masterImagesData = await readJson('goldensun-master-images-FULL.json') || await readJson('goldensun-master-images-SMALL.json') || {};

    const servers = (serversData.Servers || []).map(s => ({
        Name: s.Name || s.DnsName || 'Unknown',
        PowerState: (s.PowerState !== undefined && s.PowerState !== null) ? String(s.PowerState) : 'Unknown',
        RegistrationState: (s.RegistrationState !== undefined && s.RegistrationState !== null) ? String(s.RegistrationState) : 'Unknown',
        TotalRAM_GB: s.TotalRAM_GB ?? s.TotalRAMGB ?? undefined,
        CPUCores: s.CPUCores ?? s.CPUs ?? undefined,
        CPULogicalProcessors: s.CPULogicalProcessors ?? undefined,
        DiskTotalSize_GB: s.DiskTotalSize_GB ?? s.DiskTotalSizeGB ?? undefined,
        DiskFreeSpace_GB: s.DiskFreeSpace_GB ?? s.DiskFreeSpaceGB ?? undefined,
        OSVersion: s.OSVersion || '',
        DesktopGroup: s.DesktopGroup || '',
        SpecsSource: s.SpecsSource || 'None'
    }));

    const applications = (appsData.Applications || []).map(a => ({
        Name: a.Name || 'Unknown',
        ApplicationName: a.ApplicationName || a.Name || '',
        PublishedName: a.PublishedName || a.ApplicationName || a.Name || '',
        DesktopGroup: a.DesktopGroup || '',
        Enabled: a.Enabled !== false,
        Description: a.Description || '',
        CommandLineExecutable: a.CommandLineExecutable || '',
        CommandLineArguments: a.CommandLineArguments || '',
        WorkingDirectory: a.WorkingDirectory || '',
        AssignedUsers: a.AssignedUsers || [],
        AssignedGroups: a.AssignedGroups || []
    }));

    const deliveryGroups = (dgData.DeliveryGroups || []).map(g => ({
        Name: g.Name || 'Unknown',
        DesktopKind: g.DesktopKind ?? '',
        SessionSupport: g.SessionSupport ?? '',
        TotalMachines: g.TotalMachines ?? 0,
        AvailableCount: g.AvailableCount ?? 0,
        InUseCount: g.InUseCount ?? 0,
        TotalApplications: g.TotalApplications ?? 0,
        RestartSchedule: g.RestartSchedule || '',
        RestartScheduleEnabled: !!g.RestartScheduleEnabled,
        InMaintenanceMode: !!g.InMaintenanceMode,
        Enabled: g.Enabled !== false
    }));

    const catalogs = (catData.Catalogs || []).map(cat => ({
        Name: cat.Name || 'Unknown Catalog',
        AllocationType: cat.AllocationType ?? '',
        ProvisioningType: cat.ProvisioningType ?? '',
        SessionSupport: cat.SessionSupport ?? '',
        TotalCount: cat.TotalCount ?? 0,
        AvailableCount: cat.AvailableCount ?? 0,
        InUseCount: cat.InUseCount ?? 0,
        PersistUserChanges: !!cat.PersistUserChanges
    }));

    const policies = []; // keeping empty to avoid render issues; raw data still available if needed
    const roles = rolesData.Roles || [];

    const summary = {
        SiteName: siteInfoData.SiteName || 'Unknown',
        TotalPublishedApplications: applications.length || 0,
        TotalPublishedDesktops: 0,
        MaxConcurrentUsers_30Days: 0,
        LicenseType: siteInfoData.LicenseType || 'Unknown',
        ControllerCount: siteInfoData.ControllerCount || (siteInfoData.Controllers ? siteInfoData.Controllers.length : 0) || 0,
        NumberOfCatalogs: catalogs.length || 0,
        NumberOfDeliveryGroups: deliveryGroups.length || 0,
        UniqueUserConnections_30Days: 0,
        TotalNumberOfServers: servers.length || 0,
        TotalUniqueMasterImages: (masterImagesData.MasterImages || []).length || 0,
        TotalStoreFrontStores: storefrontData.TotalStores || 0
    };

    return {
        summary,
        SiteName: summary.SiteName,
        TotalPublishedApplications: summary.TotalPublishedApplications,
        TotalPublishedDesktops: summary.TotalPublishedDesktops,
        MaxConcurrentUsers_30Days: summary.MaxConcurrentUsers_30Days,
        LicenseType: summary.LicenseType,
        ControllerCount: summary.ControllerCount,
        NumberOfCatalogs: summary.NumberOfCatalogs,
        NumberOfDeliveryGroups: summary.NumberOfDeliveryGroups,
        UniqueUserConnections_30Days: summary.UniqueUserConnections_30Days,
        TotalNumberOfServers: summary.TotalNumberOfServers,
        TotalUniqueMasterImages: summary.TotalUniqueMasterImages,
        TotalStoreFrontStores: summary.TotalStoreFrontStores,
        Servers: servers,
        Applications: applications,
        DeliveryGroups: deliveryGroups,
        Catalogs: catalogs,
        Policies: policies,
        Roles: roles,
        StoreFront: storefrontData || {},
        UniqueMasterImages: masterImagesData.MasterImages || [],
        MasterImages: masterImagesData.MasterImages || []
    };
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

    if (typeof imagePath !== 'string') {
        try {
            imagePath = String(imagePath);
        } catch (e) {
            return {
                fullPath: 'N/A',
                clusterName: 'N/A',
                vmName: 'N/A',
                snapshotName: 'N/A'
            };
        }
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
        if (location.protocol === 'file:') {
            console.warn('Skipping config load (file://)');
            return;
        }
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
    closeAllModals('horizonTasksModal');
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
    closeAllModals('configModal');
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

// Close all known modals except the one provided
function closeAllModals(exceptId) {
    const ids = [
        'horizonTasksModal',
        'configModal',
        'debugToolsModal',
        'goldenSunModal',
        'uagModal',
        'usersModal',
        'desktopsModal',
        'deliveryGroupsModal',
        'catalogModal',
        'masterImagesModal',
        'storeFrontStoresModal',
        'appModal'
    ];
    ids.forEach(id => {
        if (id !== exceptId) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        }
    });
}

function closeAllVisibleModalsOnEscape() {
    const modals = document.querySelectorAll('.modal');
    let closedAny = false;
    modals.forEach((modal) => {
        const isOpen = modal && getComputedStyle(modal).display !== 'none';
        if (isOpen) {
            modal.style.display = 'none';
            closedAny = true;
        }
    });
    if (closedAny) {
        document.body.style.overflow = '';
    }
    return closedAny;
}

document.addEventListener('keydown', function(event) {
    if (event.key !== 'Escape') return;
    const closed = closeAllVisibleModalsOnEscape();
    if (closed) {
        event.preventDefault();
    }
});

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
        if (location.protocol === 'file:') {
            console.warn('Skipping config load (file://)');
            return;
        }
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
        loadCloneMasterImages();
    } else if (taskName === 'masterImageSearch') {
        // no-op
    } else if (taskName === 'cloneMasterImage') {
        populateMasterImagesCloneList();
    } else if (taskName === 'addApplications') {
        populateApplicationsHZList();
    } else if (taskName === 'adminTasks') {
        // no-op for now
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
    const pushWindowsUpdate = document.getElementById('pushWindowsUpdateToggle')?.checked !== false;

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
    const script = generateCloneScript(selectedImages, destinationFolder, moveSourceAfterClone, sourceMoveFolder, enableVMwareFolders, pushWindowsUpdate);

    // Display script
    document.getElementById('cloneScriptContent').value = script;
    document.getElementById('cloneScriptOutput').style.display = 'block';

    // Scroll to script output
    document.getElementById('cloneScriptOutput').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function generateCloneScript(selectedImages, destinationFolder, moveSourceAfterClone, sourceMoveFolder, enableVMwareFolders = false, pushWindowsUpdate = true) {
    const firstImage = selectedImages[0] || {};
    const vcenterFromData = firstImage.vCenterServer || firstImage.VCenterServer || firstImage.vcenter || firstImage.vcenterServer || firstImage.vCenter || '';

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
    '# Teams webhook for status (from MSPatch)',
    '$TeamsWorkflowUrl = "https://default47eb93f93c37419cae4e37c50e7d1d.c0.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/72ca894639d14c8fae484f6db87527b2/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=M38KwWz-oLmqc6joZdCgC54BfzjQCYsghHAEvMmW198"',
        'function Send-TeamsAdaptiveCard {',
        '    [CmdletBinding()]',
        '    param(',
        '        [Parameter(Mandatory)] [string]$WorkflowUrl,',
        '        [Parameter(Mandatory)] [string]$Title,',
        '        [Parameter(Mandatory)] [string]$Text,',
        '        [ValidateSet("info","success","warning","error")]',
        '        [string]$Level = "info",',
        '        [string]$Computer = $env:COMPUTERNAME',
        '    )',
        '',
        '    $payload = @{',
        '        type    = "AdaptiveCard"',
        '        version = "1.4"',
        '        body    = @(',
        '            @{ type="TextBlock"; text=$Title; wrap=$true; weight="Bolder"; size="Medium" },',
        '            @{ type="TextBlock"; text=$Text; wrap=$true },',
        '            @{ type="TextBlock"; text="From: $Computer at $(Get-Date -Format \'MM/dd/yyyy HH:mm:ss\')"; wrap=$true; isSubtle=$true; spacing="Medium" }',
        '        )',
        '    } | ConvertTo-Json -Depth 20',
        '',
        '    try {',
        '        Invoke-RestMethod -Method Post -Uri $WorkflowUrl -ContentType "application/json" -Body $payload -ErrorAction Stop | Out-Null',
        '        return $true',
        '    } catch {',
        '        Write-Warning "Teams workflow post failed: $($_.Exception.Message)"',
        '        return $false',
        '    }',
        '}',
        '',
        '# Connect to vCenter',
        '$vc = "' + (vcenterFromData ? vcenterFromData.replace(/"/g, '""') : '') + '"',
        '$vcDefault = "' + (GOLDEN_SUN_DEFAULT_VCENTER ? GOLDEN_SUN_DEFAULT_VCENTER.replace(/"/g, '""') : '') + '"',
        'if ([string]::IsNullOrWhiteSpace($vc) -and -not [string]::IsNullOrWhiteSpace($vcDefault)) { $vc = $vcDefault }',
        '$existingConnection = $global:DefaultVIServer',
        '$viserver = $null',
        'if (-not [string]::IsNullOrWhiteSpace($vc)) {',
        '    try {',
        '        $viserver = Get-VIServer -Server $vc -ErrorAction SilentlyContinue',
        '    } catch { $viserver = $null }',
        '}',
        'if (-not $viserver) {',
        '    if (-not $existingConnection) {',
        '        if ([string]::IsNullOrWhiteSpace($vc)) { $vc = Read-Host "Enter vCenter Server FQDN" }',
        '        if ([string]::IsNullOrWhiteSpace($vc)) { throw "vCenter Server name is required." }',
        '        $cred = Get-Credential -Message "Enter credentials for $vc"',
        '        Connect-VIServer -Server $vc -Credential $cred -ErrorAction Stop | Out-Null',
        '    } else {',
        '        Write-Host "Using existing vCenter connection: $($existingConnection.Name)" -ForegroundColor Cyan',
        '        $viserver = $existingConnection',
        '    }',
        '}',
        'if (-not $viserver) { throw "Failed to establish vCenter connection." }',
        '',
        '# Function to generate new VM name with incremented version (uses uppercase V)',
        'function Get-NewVMName {',
        '    param([string]$OriginalName)',
        '    ',
        '    # Check if name ends with V (or v) followed by digits, case-insensitive',
        '    if ($OriginalName -match \'(.+)[Vv](\\d+)$\') {',
        '        $baseName = $matches[1]',
        '        $version = [int]$matches[2]',
        '        $newVersion = $version + 1',
        '        return "$baseName" + "V$newVersion"',
        '    } else {',
        '        # No version found, add V2',
        '        return "$OriginalName" + "V2"',
        '    }',
        '}',
        '',
        '# Function to get base computer name (strip trailing V#)',
        'function Get-BaseComputerName {',
        '    param([string]$Name)',
        '    if ($Name -match \'(.+)[Vv](\\d+)$\') {',
        '        return $matches[1]',
        '    }',
        '    return $Name',
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
    scriptLines.push('$pushWindowsUpdate = ' + (pushWindowsUpdate ? '$true' : '$false'));
    scriptLines.push('$destinationFolderName = "' + (enableVMwareFolders ? destinationFolder.replace(/"/g, '""') : '') + '"');
    if (enableVMwareFolders && moveSourceAfterClone) {
        scriptLines.push('$sourceMoveFolderName = "' + sourceMoveFolder.replace(/"/g, '""') + '"');
    }
    scriptLines.push('');
    scriptLines.push('# Clone each selected image (one at a time)');
    scriptLines.push('$cloneCount = 0');
    scriptLines.push('$totalClones = $ImagesToClone.Count');
    scriptLines.push('$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path');
    scriptLines.push('$cloneLogDir = Join-Path $scriptDir "Reports"');
    scriptLines.push('if (-not (Test-Path -Path $cloneLogDir)) { New-Item -ItemType Directory -Path $cloneLogDir -Force | Out-Null }');
    scriptLines.push('$cloneLogPath = Join-Path $cloneLogDir "FarmClonesLog.json"');
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
    scriptLines.push('        if ($sourceVM.PowerState -ne "PoweredOff") {');
    scriptLines.push('            Write-Warning "  VM $originalVMName is $($sourceVM.PowerState). Skipping clone until it is powered off."');
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
        scriptLines.push('        if ($TeamsWorkflowUrl) { Send-TeamsAdaptiveCard -WorkflowUrl $TeamsWorkflowUrl -Title "Clone Started" -Text "Clone of Image $originalVMName Started" -Level "info" -Computer $env:COMPUTERNAME }');
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
    scriptLines.push('                    # Give vCenter a moment to finalize the new VM object');
    scriptLines.push('                    try { Start-Sleep -Seconds 10 } catch {}');
    scriptLines.push('                    try {');
    scriptLines.push('                        # Resolve the new VM as a proper VirtualMachine object (some tasks return other types)');
    scriptLines.push('                        $newVM = Get-VM -Name $newVMName -ErrorAction Stop');
    scriptLines.push('                        Write-Host "    New VM ID: $($newVM.Id)" -ForegroundColor DarkGray');
    scriptLines.push('                        Write-Host "    New VM Power State: $($newVM.PowerState)" -ForegroundColor DarkGray');
    scriptLines.push('                    } catch {');
    scriptLines.push('                        Write-Warning "  [WARN] Unable to resolve new VM $newVMName via Get-VM : $($_.Exception.Message)"');
    scriptLines.push('                        $newVM = $null');
    scriptLines.push('                    }');
        scriptLines.push('                    # Append clone metadata to FarmClonesLog.json for Farm Report');
        scriptLines.push('                    try {');
        scriptLines.push('                        $entry = [PSCustomObject]@{');
        scriptLines.push('                            Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss";');
        scriptLines.push('                            SourceVM  = $originalVMName;');
        scriptLines.push('                            NewVMName = $newVMName;');
        scriptLines.push('                            State     = "Created"');
        scriptLines.push('                        };');
        scriptLines.push('                        $log = @()');
        scriptLines.push('                        if (Test-Path $cloneLogPath) {');
        scriptLines.push('                            $existing = Get-Content -Path $cloneLogPath -Raw | ConvertFrom-Json');
        scriptLines.push('                            if ($existing) {');
        scriptLines.push('                                if ($existing -is [array]) { $log = $existing } else { $log = @($existing) }');
        scriptLines.push('                            }');
        scriptLines.push('                        }');
        scriptLines.push('                        $log += $entry');
        scriptLines.push('                        $log | ConvertTo-Json -Depth 5 | Out-File -FilePath $cloneLogPath -Encoding UTF8');
        scriptLines.push('                    } catch {');
        scriptLines.push('                        Write-Warning "  [LOG] Failed to update FarmClonesLog.json : $($_.Exception.Message)"');
        scriptLines.push('                    }');
    scriptLines.push('                    ');
    scriptLines.push('                    # Move source VM to backup folder if requested');
    scriptLines.push('                    if ($moveSourceVMs -and $backupFolder) {');
    scriptLines.push('                        Write-Host "  [BACKUP] Moving source VM to backup folder..." -ForegroundColor Yellow');
    scriptLines.push('                        $moveResult = Move-VMToFolder -VM $sourceVM -TargetFolder $backupFolder');
    scriptLines.push('                        if ($moveResult) {');
    scriptLines.push('                            Write-Host "  [BACKUP] Source VM successfully moved to backup" -ForegroundColor Green');
    scriptLines.push('                        }');
    scriptLines.push('                    }');
    scriptLines.push('                    ');
                    scriptLines.push('                    if ($TeamsWorkflowUrl) { Send-TeamsAdaptiveCard -WorkflowUrl $TeamsWorkflowUrl -Title "Clone Completed" -Text "Clone of Image $originalVMName Completed" -Level "success" -Computer $env:COMPUTERNAME }');
                    scriptLines.push('                    ');
    scriptLines.push('                    if ($pushWindowsUpdate) {');
    scriptLines.push('                        if ($newVM) {');
    scriptLines.push('                            Write-Host "  [PATCH] Powering on cloned VM $newVMName..." -ForegroundColor Yellow');
    scriptLines.push('                            try {');
    scriptLines.push('                                Start-VM -VM $newVM -Confirm:$false -ErrorAction Stop | Out-Null');
    scriptLines.push('                            }');
    scriptLines.push('                            catch {');
    scriptLines.push('                                Write-Warning "  [PATCH] Failed to power on $newVMName using initial VM object: $($_.Exception.Message)"');
    scriptLines.push('                                # Fallback: resolve VM by name and try again');
    scriptLines.push('                                try {');
    scriptLines.push('                                    $vmRef = Get-VM -Name $newVMName -ErrorAction Stop');
    scriptLines.push('                                    Start-VM -VM $vmRef -Confirm:$false -ErrorAction Stop | Out-Null');
    scriptLines.push('                                    $newVM = $vmRef');
    scriptLines.push('                                } catch {');
    scriptLines.push('                                    Write-Warning "  [PATCH] Power-on fallback also failed for $newVMName : $($_.Exception.Message)"');
    scriptLines.push('                                }');
    scriptLines.push('                            }');
    scriptLines.push('');
    scriptLines.push('                            try {');
    scriptLines.push('                                $waitStart = Get-Date');
    scriptLines.push('                                while ($true) {');
    scriptLines.push('                                    $vmState = (Get-VM -Name $newVMName -ErrorAction SilentlyContinue).PowerState');
    scriptLines.push('                                    if ($vmState -eq "PoweredOn") { break }');
    scriptLines.push('                                    if (((Get-Date) - $waitStart).TotalMinutes -ge 5) { throw "Timed out waiting for power on" }');
    scriptLines.push('                                    Start-Sleep -Seconds 5');
    scriptLines.push('                                }');
    scriptLines.push('                                Write-Host "  [PATCH] VM is powered on." -ForegroundColor Green');
    scriptLines.push('                            }');
    scriptLines.push('                            catch {');
    scriptLines.push('                                Write-Warning "  [PATCH] Power-on wait failed: $($_.Exception.Message)"');
    scriptLines.push('                            }');
    scriptLines.push('');
    scriptLines.push('                            try { if ($newVM) { Wait-Tools -VM $newVM -TimeoutSeconds 300 -ErrorAction SilentlyContinue } } catch {}');
    scriptLines.push('                        } else {');
    scriptLines.push('                            Write-Warning "  [PATCH] Skipping power on and patching for $newVMName because new VM object is not available."');
    scriptLines.push('                        }');
    scriptLines.push('');
    scriptLines.push('                        $baseComputerName = Get-BaseComputerName -Name $newVMName');
    scriptLines.push('                        $patchScriptPath = ".\\mspatch.ps1"');
    scriptLines.push('                        if (Test-Path $patchScriptPath) {');
    scriptLines.push('                            Write-Host "  [PATCH] Running mspatch.ps1 against $baseComputerName" -ForegroundColor Cyan');
    scriptLines.push('                            try {');
    scriptLines.push('                                & $patchScriptPath -ComputerName $baseComputerName');
    scriptLines.push('                                Write-Host "  [PATCH] mspatch.ps1 completed for $baseComputerName" -ForegroundColor Green');
    scriptLines.push('                            }');
    scriptLines.push('                            catch {');
    scriptLines.push('                                Write-Warning "  [PATCH] mspatch.ps1 failed for ${baseComputerName}: $($_.Exception.Message)"');
    scriptLines.push('                            }');
    scriptLines.push('                        } else {');
    scriptLines.push('                            Write-Warning "  [PATCH] mspatch.ps1 not found in current directory. Skipping patch step."');
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

// -------------------------------
// GoldenSun Clone Tool (Prod/Test)
// -------------------------------

function showGoldenSunModal() {
    const modal = document.getElementById('goldenSunModal');
    if (modal) {
        modal.style.display = 'block';
    }

    // Reset toggles/sections
    const vmToggle = document.getElementById('goldenSunVmwareToggle');
    const vmSection = document.getElementById('goldenSunVmwareSection');
    const moveSource = document.getElementById('goldenSunMoveSource');
    const sourceFolder = document.getElementById('goldenSunSourceFolder');

    if (vmToggle && vmSection) {
        vmToggle.checked = false;
        vmSection.style.display = 'none';
    }
    if (moveSource && sourceFolder) {
        moveSource.checked = false;
        sourceFolder.disabled = true;
        sourceFolder.style.opacity = '0.6';
    }

    // Load current environment images
    const envSelect = document.getElementById('goldenSunEnvSelect');
    goldenSunCurrentEnv = envSelect?.value || 'Prod';
    // Ensure vCenter prefilled
    const gsVcInput = document.getElementById('goldenSunSearchVCenter');
    if (gsVcInput && !gsVcInput.value) {
        gsVcInput.value = GOLDEN_SUN_DEFAULT_VCENTER;
    }

    goldenSunActiveTab = 'search';
    showGoldenSunTab(goldenSunActiveTab);
    fetchGoldenSunFileList().then(() => reloadGoldenSunImages());
}

function closeGoldenSunModal() {
    const modal = document.getElementById('goldenSunModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function handleGoldenSunVmToggle() {
    const vmToggle = document.getElementById('goldenSunVmwareToggle');
    const vmSection = document.getElementById('goldenSunVmwareSection');
    const moveSource = document.getElementById('goldenSunMoveSource');
    const sourceFolder = document.getElementById('goldenSunSourceFolder');

    const enabled = vmToggle?.checked;
    if (vmSection) vmSection.style.display = enabled ? 'block' : 'none';

    if (!enabled && moveSource && sourceFolder) {
        moveSource.checked = false;
        sourceFolder.disabled = true;
        sourceFolder.style.opacity = '0.6';
    }
}

function handleGoldenSunMoveSourceToggle() {
    const moveSource = document.getElementById('goldenSunMoveSource');
    const sourceFolder = document.getElementById('goldenSunSourceFolder');
    const enabled = moveSource?.checked;
    if (sourceFolder) {
        sourceFolder.disabled = !enabled;
        sourceFolder.style.opacity = enabled ? '1' : '0.6';
    }
}

function reloadGoldenSunImages() {
    loadGoldenSunImages();
}

function openGoldenSunFileDialog() {
    const picker = document.getElementById('goldenSunFilePicker');
    if (picker) {
        picker.value = '';
        picker.click();
    }
}

function handleGoldenSunFilePick(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.includes('master-images') || !lower.endsWith('.json')) {
        alert('Please select a file matching *-Master-Images.json');
        return;
    }

    const statusEl = document.getElementById('goldenSunStatus');
    if (statusEl) statusEl.textContent = `Loading ${file.name}...`;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const obj = JSON.parse(e.target.result);
            ingestGoldenSunJson(obj, file.name);
        } catch (err) {
            alert('Error parsing JSON: ' + err.message);
        }
    };
    reader.readAsText(file);
}

function ingestGoldenSunJson(obj, fileName) {
    const statusEl = document.getElementById('goldenSunStatus');
    const imagesSection = document.getElementById('goldenSunImagesSection');
    const cloneSection = document.getElementById('goldenSunCloneSection');
    const scriptOutput = document.getElementById('goldenSunScriptOutput');

    let images = [];
    if (Array.isArray(obj)) images = obj;
    else if (Array.isArray(obj.MasterImages)) images = obj.MasterImages;
    else if (Array.isArray(obj.masterImages)) images = obj.masterImages;
    else if (Array.isArray(obj.Images)) images = obj.Images;
    else if (Array.isArray(obj.images)) images = obj.images;

    goldenSunImages = images.map(normalizeGoldenSunImage).filter(img => !!img.Name);
    goldenSunSelectedImages.clear();

    if (statusEl) statusEl.textContent = goldenSunImages.length
        ? `Loaded ${goldenSunImages.length} image(s) from ${fileName}`
        : `No master images found in ${fileName}`;

    if (goldenSunImages.length) {
        if (imagesSection) imagesSection.style.display = 'block';
        if (cloneSection) cloneSection.style.display = 'block';
    } else {
        if (imagesSection) imagesSection.style.display = 'none';
        if (cloneSection) cloneSection.style.display = 'none';
    }
    if (scriptOutput) scriptOutput.style.display = 'none';

    renderGoldenSunImages();
    renderGoldenSunReport();
}

async function fetchGoldenSunFileList() {
    const sel = document.getElementById('goldenSunFileSelect');
    const statusEl = document.getElementById('goldenSunStatus');
    const defaults = ['Prod_Images.json', 'Test_Images.json'];

    if (!sel) return defaults;

    try {
        const res = await fetch('/citrix/api/master-image-files');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const files = Array.isArray(data.files) ? data.files : [];
        const all = Array.from(new Set([...defaults, ...files]));
        goldenSunFileOptions = all;
        sel.innerHTML = '';
        all.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            sel.appendChild(opt);
        });
        if (statusEl) statusEl.textContent = `Found ${all.length} file(s).`;
        if (all.length > 0) {
            sel.value = all[0];
        }
        return all;
    } catch (err) {
        console.warn('Could not fetch master image files:', err);
        goldenSunFileOptions = defaults;
        sel.innerHTML = '';
        defaults.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            sel.appendChild(opt);
        });
        if (defaults.length > 0) {
            sel.value = defaults[0];
        }
        if (statusEl) statusEl.textContent = defaults.length ? 'Using default file list.' : 'No master image files found.';
        return defaults;
    }
}

async function loadGoldenSunImages() {
    const statusEl = document.getElementById('goldenSunStatus');
    const imagesSection = document.getElementById('goldenSunImagesSection');
    const cloneSection = document.getElementById('goldenSunCloneSection');

    if (statusEl) statusEl.textContent = `Loading master list...`;
    if (imagesSection) imagesSection.style.display = 'none';
    if (cloneSection) cloneSection.style.display = 'none';

    const fileSelect = document.getElementById('goldenSunFileSelect');
    const selectedFile = (fileSelect?.value || '').trim();
    if (!selectedFile) {
        if (statusEl) statusEl.textContent = 'No master image files found.';
        return;
    }
    const fileName = selectedFile;
    const pathsToTry = [
        `/citrix/${fileName}`,
        `/${fileName}`,
        fileName,
        `./${fileName}`
    ];

    let data = null;
    for (const p of pathsToTry) {
        try {
            const res = await fetch(p, { cache: 'no-cache' });
            if (res.ok) {
                data = await res.json();
                break;
            }
        } catch (err) {
            console.warn('GoldenSun fetch failed for', p, err.message || err);
        }
    }

    if (!data) {
        if (statusEl) statusEl.textContent = `Could not load ${fileName}. Place it next to index.html.`;
        return;
    }

    let images = [];
    if (Array.isArray(data)) {
        images = data;
    } else if (Array.isArray(data.MasterImages)) {
        images = data.MasterImages;
    } else if (Array.isArray(data.Images)) {
        images = data.Images;
    } else if (Array.isArray(data.images)) {
        images = data.images;
    } else if (Array.isArray(data.masterImages)) {
        images = data.masterImages;
    }

    goldenSunImages = images.map(normalizeGoldenSunImage).filter(img => !!img.Name);
    goldenSunSelectedImages.clear();

    if (statusEl) {
        statusEl.textContent = `Loaded ${goldenSunImages.length} image(s) from ${fileName}`;
    }

    renderGoldenSunImages();

    if (imagesSection) imagesSection.style.display = goldenSunImages.length ? 'block' : 'none';
    if (cloneSection) cloneSection.style.display = goldenSunImages.length ? 'block' : 'none';
    const scriptOutput = document.getElementById('goldenSunScriptOutput');
    if (scriptOutput) scriptOutput.style.display = 'none';
}

function normalizeGoldenSunImage(image) {
    if (!image) return { Name: 'Unknown', Cluster: 'Unknown', Host: 'Unknown', Datastore: 'Unknown' };
    if (typeof image === 'string') {
        return { Name: image, Cluster: 'Unknown', Host: 'Unknown', Datastore: 'Unknown' };
    }
    return {
        Name: image.Name || image.VMName || image.vmName || image.Image || image.Master || image.ImageMachineName || 'Unknown',
        Cluster: image.Cluster || image.ClusterName || image.HostingUnitName || 'Unknown',
        Host: image.Host || image.HostName || 'Unknown',
        Datastore: image.Datastore || image.DatastoreName || 'Unknown',
        LatestSnapshotName: image.LatestSnapshotName || image.Snapshot || image.SnapshotName || '',
        LatestSnapshotTimestamp: image.LatestSnapshotTimestamp || image.SnapshotTimestamp || image.SnapshotCreated || image.SnapshotDate || ''
    };
}

function renderGoldenSunImages() {
    const container = document.getElementById('goldenSunImagesList');
    if (!container) return;

    if (!goldenSunImages.length) {
        container.innerHTML = '<p style="color: #666;">No images found. Ensure the JSON file exists.</p>';
        return;
    }

    let html = `<p style="margin-bottom: 10px; color: #666;">Found ${goldenSunImages.length} master image(s) for ${goldenSunCurrentEnv}.</p>`;

    goldenSunImages.forEach((img, index) => {
        const isChecked = goldenSunSelectedImages.has(img.Name) ? 'checked' : '';
        const safeName = img.Name ? img.Name.replace(/'/g, "\\'") : `img-${index}`;

        html += `
            <div style="border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 8px; background: #fff;">
                <label style="display: flex; align-items: flex-start; cursor: pointer;">
                    <input type="checkbox" style="margin-right: 10px; margin-top: 2px;" ${isChecked}
                           onchange="toggleGoldenSunImage('${safeName}')">
                    <div style="flex: 1;">
                        <strong>${escapeHtml(img.Name || 'Unknown')}</strong>
                        <div style="font-size: 12px; color: #666; margin-top: 2px;">
                            Cluster: ${escapeHtml(img.Cluster || 'Unknown')} | Host: ${escapeHtml(img.Host || 'Unknown')} | Datastore: ${escapeHtml(img.Datastore || 'Unknown')}
                        </div>
                        <div style="font-size: 12px; color: #555; margin-top: 2px;">
                            Snapshot: ${escapeHtml(img.LatestSnapshotName || 'N/A')}${img.LatestSnapshotTimestamp ? ' @ ' + escapeHtml(img.LatestSnapshotTimestamp) : ''}
                        </div>
                    </div>
                </label>
            </div>
        `;
    });

    container.innerHTML = html;
}

function setGoldenSunReportSort(mode) {
    goldenSunReportSort = mode;
    renderGoldenSunReport();
}

function renderGoldenSunReport() {
    const container = document.getElementById('goldenSunReportList');
    const status = document.getElementById('goldenSunReportStatus');
    if (!container) return;
    if (!goldenSunImages.length) {
        container.innerHTML = '<p style="color:#666;">Load a Master Images JSON first.</p>';
        if (status) status.textContent = '';
        return;
    }

    const map = new Map();
    goldenSunImages.forEach(img => {
        const key = img.Name || 'Unknown';
        if (!map.has(key)) {
            map.set(key, img);
        } else {
            const existing = map.get(key);
            const tNew = new Date(img.LatestSnapshotTimestamp || 0).getTime();
            const tOld = new Date(existing.LatestSnapshotTimestamp || 0).getTime();
            if (tNew > tOld) map.set(key, img);
        }
    });

    let rows = Array.from(map.values());
    if (goldenSunReportSort === 'date') {
        rows.sort((a, b) => new Date(b.LatestSnapshotTimestamp || 0) - new Date(a.LatestSnapshotTimestamp || 0));
    } else {
        rows.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
    }

    if (status) status.textContent = `${rows.length} image(s) loaded. Sorted by ${goldenSunReportSort === 'date' ? 'Snapshot Date' : 'Name'}.`;

    let html = `
    <div style="display:grid;grid-template-columns:2fr 1.5fr 1fr;font-weight:700;border-bottom:1px solid #ddd;padding:6px 4px;margin-bottom:6px;">
        <div>Image Name</div>
        <div>Snapshot Name</div>
        <div>Snapshot Timestamp</div>
    </div>
    `;
    rows.forEach(img => {
        const ts = img.LatestSnapshotTimestamp ? new Date(img.LatestSnapshotTimestamp) : null;
        let isFresh = false;
        if (ts && !isNaN(ts.getTime())) {
            const now = new Date();
            const nowMonth = now.getMonth(); // 0-11
            const nowYear = now.getFullYear();
            const tsMonth = ts.getMonth();
            const tsYear = ts.getFullYear();
            // fresh if same month/year, or previous month (account for year rollover)
            const sameMonth = (tsMonth === nowMonth && tsYear === nowYear);
            const prevMonth = (tsMonth === (nowMonth + 11) % 12) && (tsYear === (nowMonth === 0 ? nowYear - 1 : nowYear));
            isFresh = sameMonth || prevMonth;
        }
        const snapStyle = isFresh ? 'color:#0f9d58;font-weight:700;' : 'color:#555;';
        const timeStyle = isFresh ? 'color:#0f9d58;font-weight:700;' : 'color:#333;';
        html += `
        <div style="display:grid;grid-template-columns:2fr 1.5fr 1fr;gap:6px;border:1px solid #ddd;border-radius:4px;padding:8px;margin-bottom:6px;background:#fff;align-items:center;">
            <div style="font-weight:600;overflow-wrap:anywhere;">${escapeHtml(img.Name || 'Unknown')}</div>
            <div style="${snapStyle}overflow-wrap:anywhere;">${escapeHtml(img.LatestSnapshotName || 'N/A')}</div>
            <div style="${timeStyle}">${img.LatestSnapshotTimestamp ? escapeHtml(img.LatestSnapshotTimestamp) : 'N/A'}</div>
        </div>
        `;
    });
    container.innerHTML = html || '<p style="color:#666;">No images to display.</p>';
}

function generateGoldenSunReportScript() {
    if (!goldenSunImages.length) {
        alert('Load a Master Images JSON first.');
        return;
    }
    const unique = Array.from(new Set(goldenSunImages.map(i => (i.Name || '').trim()).filter(Boolean)));
    if (!unique.length) {
        alert('No VM names found in the loaded JSON.');
        return;
    }
    let vcenter = (document.getElementById('goldenSunSearchVCenter')?.value || '').trim();
    if (!vcenter) vcenter = GOLDEN_SUN_DEFAULT_VCENTER;
    const lines = [];
    lines.push('# GoldenSun snapshot re-check');
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('Import-Module VMware.PowerCLI -ErrorAction SilentlyContinue');
    lines.push('$ErrorActionPreference = "Stop"');
    lines.push('$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path');
    lines.push('$ReportsDir = Join-Path $scriptDir "Reports"');
    lines.push('if (-not (Test-Path $ReportsDir)) { New-Item -ItemType Directory -Path $ReportsDir -Force | Out-Null }');
    lines.push('');
    lines.push(`$vc = "${vcenter || GOLDEN_SUN_DEFAULT_VCENTER}"`);
    lines.push('if ([string]::IsNullOrWhiteSpace($vc)) { $vc = Read-Host "Enter vCenter server" }');
    lines.push('$cred = Get-Credential -Message "Enter vCenter credentials"');
    lines.push('Connect-VIServer -Server $vc -Credential $cred -ErrorAction Stop | Out-Null');
    lines.push('');
    lines.push('# VM list from loaded JSON');
    lines.push(`$vmNames = @(${unique.map(n=>`"${n}"`).join(', ')})`);
    lines.push('');
    lines.push('$results = @()');
    lines.push('foreach ($name in $vmNames) {');
    lines.push('    Write-Host "Checking snapshots for $name" -ForegroundColor Cyan');
    lines.push('    $vm = Get-VM -Name $name -ErrorAction SilentlyContinue');
    lines.push('    if (-not $vm) { Write-Warning "VM not found: $name"; continue }');
    lines.push('    $snap = Get-Snapshot -VM $vm -ErrorAction SilentlyContinue | Sort-Object Created -Descending | Select-Object -First 1');
    lines.push('    $latestName = $snap?.Name');
    lines.push('    $latestTime = $snap?.Created');
    lines.push('    $results += [pscustomobject]@{');
    lines.push('        Name = $vm.Name');
    lines.push('        Cluster = ($vm | Get-Cluster | Select-Object -First 1).Name');
    lines.push('        Host = ($vm | Get-VMHost | Select-Object -First 1).Name');
    lines.push('        Datastore = ($vm | Get-Datastore | Select-Object -First 1).Name');
    lines.push('        LatestSnapshot = $latestName');
    lines.push('        LatestSnapshotTime = if ($latestTime) { $latestTime.ToString("yyyy-MM-dd HH:mm") } else { $null }');
    lines.push('    }');
    lines.push('}');
    lines.push('');
    lines.push('$results | Format-Table -AutoSize');
    lines.push('');
    lines.push('# Export JSON for report into Reports folder');
    lines.push('$snapJson = Join-Path $ReportsDir "Snapshot-Recheck.json"');
    lines.push('$results | ConvertTo-Json -Depth 4 | Set-Content -Path $snapJson -Encoding UTF8');
    const script = lines.join('\n');
    const out = document.getElementById('goldenSunReportScriptContent');
    const wrap = document.getElementById('goldenSunReportScriptOutput');
    if (out) out.value = script;
    if (wrap) { wrap.style.display = 'block'; wrap.scrollIntoView({behavior:'smooth', block:'nearest'}); }
}
function copyGoldenSunReportScript(){
    const ta = document.getElementById('goldenSunReportScriptContent');
    if (!ta) return;
    ta.select(); document.execCommand('copy');
}
function downloadGoldenSunReportScript(){
    const scriptContent = document.getElementById('goldenSunReportScriptContent')?.value || '';
    const blob = new Blob([scriptContent], { type:'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'GoldenSun-Snapshot-Recheck.ps1';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function toggleGoldenSunImage(name) {
    if (goldenSunSelectedImages.has(name)) {
        goldenSunSelectedImages.delete(name);
    } else {
        goldenSunSelectedImages.add(name);
    }
}

function goldenSunSelectAll() {
    goldenSunImages.forEach(img => {
        if (img.Name) goldenSunSelectedImages.add(img.Name);
    });
    renderGoldenSunImages();
}

function goldenSunDeselectAll() {
    goldenSunSelectedImages.clear();
    renderGoldenSunImages();
}

function generateGoldenSunCloneScript() {
    if (goldenSunSelectedImages.size === 0) {
        alert('Please select at least one master image to clone.');
        return;
    }

    const selectedImages = goldenSunImages.filter(img => goldenSunSelectedImages.has(img.Name));

    const enableVMwareFolders = document.getElementById('goldenSunVmwareToggle')?.checked || false;
    const destinationFolder = enableVMwareFolders ? document.getElementById('goldenSunDestinationFolder').value.trim() : '';
    const moveSourceAfterClone = enableVMwareFolders ? document.getElementById('goldenSunMoveSource').checked : false;
    const sourceMoveFolder = enableVMwareFolders ? document.getElementById('goldenSunSourceFolder').value.trim() : '';
    const pushWindowsUpdate = document.getElementById('goldenSunPushWindowsUpdateToggle')?.checked !== false;

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

    const script = generateCloneScript(selectedImages, destinationFolder, moveSourceAfterClone, sourceMoveFolder, enableVMwareFolders, pushWindowsUpdate);

    const output = document.getElementById('goldenSunScriptContent');
    if (output) {
        output.value = script;
    }
    const wrapper = document.getElementById('goldenSunScriptOutput');
    if (wrapper) {
        wrapper.style.display = 'block';
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function copyGoldenSunScript() {
    const scriptTextArea = document.getElementById('goldenSunScriptContent');
    if (!scriptTextArea) return;
    scriptTextArea.select();
    document.execCommand('copy');
}

function downloadGoldenSunScript() {
    const scriptContent = document.getElementById('goldenSunScriptContent')?.value || '';
    const blob = new Blob([scriptContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'GoldenSun-Clone.ps1';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function generateGoldenSunSearchScript() {
    const group = (document.getElementById('goldenSunSearchGroup')?.value || '').trim();
    let vcenter = (document.getElementById('goldenSunSearchVCenter')?.value || '').trim();
    if (!vcenter) vcenter = GOLDEN_SUN_DEFAULT_VCENTER;
    const vmText = (document.getElementById('goldenSunSearchVMs')?.value || '').trim();

    if (!group) {
        alert('Please enter a group name.');
        return;
    }

    const vmNames = vmText
        ? vmText.split(';').map(v => v.trim()).filter(Boolean)
        : [];

    const outputFile = `${group}-Master-Images.json`;
    const scriptLines = [];
    scriptLines.push(`# GoldenSun Master Image Discovery`);
    scriptLines.push(`# Group: ${group}`);
    scriptLines.push(`# Output: ${outputFile}`);
    scriptLines.push(`# Generated: ${new Date().toISOString()}`);
    scriptLines.push('');
    scriptLines.push('Import-Module VMware.PowerCLI -ErrorAction SilentlyContinue');
    scriptLines.push('$ErrorActionPreference = "Stop"');
    scriptLines.push('');
    scriptLines.push(`# Ensure connection to vCenter (${vcenter || GOLDEN_SUN_DEFAULT_VCENTER})`);
    scriptLines.push(`$vc = "${(vcenter || GOLDEN_SUN_DEFAULT_VCENTER || '').toString().replace(/"/g, '""')}"`);
    scriptLines.push('if ([string]::IsNullOrWhiteSpace($vc)) { throw "vCenter server is required. Enter it in the vCenter Server field." }');
    scriptLines.push('$viserver = $global:DefaultVIServers | Where-Object { $_.Name -eq $vc -and $_.IsConnected } | Select-Object -First 1');
    scriptLines.push('if (-not $viserver) {');
    scriptLines.push('    $cred = Get-Credential -Message "Enter vCenter credentials for $vc"');
    scriptLines.push('    Connect-VIServer -Server $vc -Credential $cred -ErrorAction Stop | Out-Null');
    scriptLines.push('} else { Write-Host "Using existing connection to $vc" -ForegroundColor Green }');
    scriptLines.push('');
    scriptLines.push('# Build VM name list');
    if (vmNames.length) {
        const joined = vmNames.map(n => `"${n}"`).join(', ');
        scriptLines.push(`$vmNames = @(${joined})`);
    } else {
        scriptLines.push('$vmNames = Read-Host "Enter master VM names separated by semicolons"');
        scriptLines.push('$vmNames = $vmNames -split ";" | ForEach-Object { $_.Trim() } | Where-Object { $_ }');
    }
    scriptLines.push('');
    scriptLines.push('$results = @()');
    scriptLines.push('foreach ($name in $vmNames) {');
    scriptLines.push('    Write-Host "Collecting VM (latest version only): $name" -ForegroundColor Cyan');
    scriptLines.push('    $candidates = @(Get-VM -Name "$name*" -ErrorAction SilentlyContinue)');
    scriptLines.push('    if (-not $candidates) { $candidates = @(Get-VM -Name $name -ErrorAction SilentlyContinue) }');
    scriptLines.push('    if (-not $candidates) { Write-Warning "VM not found: $name"; continue }');
    scriptLines.push('    # Parse version from end of name (-V4, V4, V10) and keep only latest');
    scriptLines.push('    $withVersion = $candidates | ForEach-Object {');
    scriptLines.push('        $n = $_.Name; $base = $n; $ver = 0');
    scriptLines.push('        if ($n -match \'^(.+?)(-?[Vv](\\d+))$\') { $base = $matches[1].TrimEnd(\'-\'); $ver = [int]$matches[3] }');
    scriptLines.push('        [PSCustomObject]@{ VM = $_; BaseName = $base; VersionNum = $ver }');
    scriptLines.push('    } | Group-Object BaseName | ForEach-Object {');
    scriptLines.push('        $_.Group | Sort-Object VersionNum -Descending | Select-Object -First 1');
    scriptLines.push('    }');
    scriptLines.push('    $vm = ($withVersion | Sort-Object VersionNum -Descending | Select-Object -First 1).VM');
    scriptLines.push('    if (-not $vm) { Write-Warning "No VM selected for: $name"; continue }');
    scriptLines.push('    $view = $vm | Get-View');
    scriptLines.push('    $cluster = ($vm | Get-Cluster | Select-Object -First 1).Name');
    scriptLines.push('    $vmHostName = ($vm | Get-VMHost | Select-Object -First 1).Name');
    scriptLines.push('    $ds = ($vm | Get-Datastore | Select-Object -First 1).Name');
    scriptLines.push('    $snapObj = ($vm | Get-Snapshot | Sort-Object -Property Created -Descending | Select-Object -First 1)');
    scriptLines.push('    $snap = $snapObj.Name');
    scriptLines.push('    $snapCreated = if ($snapObj) { $snapObj.Created.ToString("yyyy-MM-dd HH:mm") } else { "" }');
    scriptLines.push('    $item = [PSCustomObject]@{');
    scriptLines.push('        Name = $vm.Name');
    scriptLines.push('        Cluster = $cluster');
    scriptLines.push('        Host = $vmHostName');
    scriptLines.push('        Datastore = $ds');
    scriptLines.push('        NumCPU = $vm.NumCpu');
    scriptLines.push('        MemoryGB = [math]::Round($vm.MemoryGB,2)');
    scriptLines.push('        ProvisionedSpaceGB = [math]::Round($vm.ProvisionedSpaceGB,2)');
    scriptLines.push('        LatestSnapshotName = $snap');
    scriptLines.push('        LatestSnapshotTimestamp = $snapCreated');
    scriptLines.push('    }');
    scriptLines.push('    $results += $item');
    scriptLines.push('}');
    scriptLines.push('');
    scriptLines.push('$output = [PSCustomObject]@{');
    scriptLines.push(`    vCenterServer = "${vcenter || ''}"`);
    scriptLines.push(`    GroupName = "${group}"`);
    scriptLines.push('    MasterImages = $results');
    scriptLines.push('}');
    scriptLines.push('$output | ConvertTo-Json -Depth 8 | Out-File -FilePath "' + outputFile.replace(/"/g,'\\"') + '" -Encoding UTF8');
    scriptLines.push('Write-Host "Saved master images to ' + outputFile + '" -ForegroundColor Green');

    const script = scriptLines.join('\n');
    const out = document.getElementById('goldenSunSearchScriptContent');
    if (out) out.value = script;
    const wrap = document.getElementById('goldenSunSearchScriptOutput');
    if (wrap) {
        wrap.style.display = 'block';
        wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// -------------------------------
// Horizon Admin REST Scripts
// -------------------------------
function generateHorizonAdminScript(action) {
    const baseInput = document.getElementById('adminHorizonBase');
    let baseUrl = baseInput ? (baseInput.value || '').trim() : '';
    if (!baseUrl) baseUrl = HZ_ADMIN_DEFAULT_BASE;
    if (!/^https?:\/\//i.test(baseUrl)) {
        baseUrl = 'https://' + baseUrl;
    }
    // Normalize any stray leading slashes after protocol (avoids https:///host)
    const protoMatch = baseUrl.match(/^(https?:\/\/)(.*)$/i);
    if (protoMatch) {
        const proto = protoMatch[1];
        const rest = protoMatch[2].replace(/^\/+/, '');
        baseUrl = proto + rest;
    }
    // Horizon REST base is /rest; enforce it once
    if (!baseUrl.toLowerCase().includes('/rest')) {
        baseUrl = baseUrl.replace(/\/+$/,'') + '/rest';
    }
    baseUrl = baseUrl.replace(/\/+$/,''); // drop trailing slash for clean joins
    const scripts = {
        farms: {
            name: 'FARM Data',
            endpoint: '/monitor/v1/farms',
            outfile: 'horizon-farms.json',
            desc: 'List all farms'
        },
        desktops: {
            name: 'Desktops',
            endpoint: '/monitor/v1/desktop-pools',
            outfile: 'horizon-desktop-pools.json',
            desc: 'List all desktop pools'
        },
        restarts: {
            name: 'Restarts',
            endpoint: '/config/v1/farms/scheduled-updates',
            outfile: 'horizon-farm-restarts.json',
            desc: 'Scheduled image updates per farm'
        },
        clones: {
            name: 'Clones',
            endpoint: '/monitor/v1/tasks',
            outfile: 'horizon-clone-status.json',
            desc: 'Clone progress for pools/farms'
        },
        imageDates: {
            name: 'Image Dates',
            endpoint: '/monitor/v1/farms',
            outfile: 'horizon-image-dates.json',
            desc: 'Farm -> master image and snapshot'
        },
        discovery: {
            name: 'Discovery',
            endpoint: '__discovery__',
            outfile: 'horizon-discovery.json',
            desc: 'Probe common Horizon REST endpoints'
        }
    };

    const cfg = scripts[action];
    if (!cfg) {
        alert('Unknown admin action');
        return;
    }

    const scriptLines = [];
    scriptLines.push(`# Horizon Admin - ${cfg.name} (PowerShell, REST)`);
    scriptLines.push(`# ${cfg.desc}`);
    if (action !== 'discovery') {
        scriptLines.push(`# Endpoint: ${cfg.endpoint} (Horizon Server API 2506)`);
    } else {
        scriptLines.push(`# Probes a list of common endpoints and records which respond`);
    }
    scriptLines.push('');
    scriptLines.push('$ErrorActionPreference = "Stop"');
    // Use current working directory for Reports so all scripts drop output next to where they are run
    scriptLines.push('$cwd = Get-Location');
    scriptLines.push('$ReportsDir = Join-Path $cwd.Path "Reports"');
    scriptLines.push('if (-not (Test-Path $ReportsDir)) { New-Item -ItemType Directory -Path $ReportsDir -Force | Out-Null }');
    scriptLines.push(`$BaseUrl = "${baseUrl}"`);
    scriptLines.push(`$Endpoint = "${cfg.endpoint}"`);
    scriptLines.push(`$OutJson = Join-Path $ReportsDir "${cfg.outfile}"`);
    scriptLines.push(`$OutHtml = [System.IO.Path]::ChangeExtension($OutJson, ".html")`);
    // For Image Dates, standardize HTML/JSON report names in Reports so GoldenSun can load them easily
    if (action === 'imageDates') {
        scriptLines.push('$OutHtml = Join-Path $ReportsDir "FarmData.html"');
    }
    if (action === 'imageDates') {
        scriptLines.push('Write-Host "[DEBUG] Image Dates - Will prompt for Domain, Horizon credentials, then vCenter." -ForegroundColor Magenta');
    }
    scriptLines.push('$Domain = Read-Host "Domain (optional, leave blank if not needed)"');
    scriptLines.push('$cred = Get-Credential -Message "Enter Horizon credentials (REST)"');
    scriptLines.push('$user = $cred.UserName');
    scriptLines.push('$pass = $cred.GetNetworkCredential().Password');
    scriptLines.push('');
    scriptLines.push('# --- Login to get bearer token ---');
    if (action === 'imageDates') {
        scriptLines.push('Write-Host "[DEBUG] Image Dates - Calling Horizon login API..." -ForegroundColor Magenta');
    }
    scriptLines.push('$loginBody = @{ username = $user; password = $pass }');
    scriptLines.push('if ($Domain) { $loginBody.domain = $Domain }');
    scriptLines.push('$tokenResp = Invoke-RestMethod -Method Post -Uri "$BaseUrl/login" -ContentType "application/json" -Body ($loginBody | ConvertTo-Json)');
    scriptLines.push('$token = $tokenResp.access_token');
    scriptLines.push('if (-not $token) { throw "Login did not return access_token" }');
    scriptLines.push('$headers = @{ Authorization = "Bearer $token"; Accept = "application/json" }');
    if (action === 'imageDates') {
        scriptLines.push('Write-Host "[DEBUG] Horizon login OK. Image Dates Step 1: Starting vCenter/VMware block..." -ForegroundColor Magenta');
    }
    scriptLines.push('');
    if (action === 'imageDates') {
        scriptLines.push('# --- Image Dates: ensure vCenter connection for VMware master image data ---');
        scriptLines.push('Write-Host "[DEBUG] Step 2: Importing VMware PowerCLI..." -ForegroundColor Magenta');
        scriptLines.push('Import-Module VMware.PowerCLI -ErrorAction SilentlyContinue');
        scriptLines.push('Set-PowerCLIConfiguration -InvalidCertificateAction Ignore -Confirm:$false -Scope Session -ErrorAction SilentlyContinue | Out-Null');
        scriptLines.push('$vcDefault = "' + (GOLDEN_SUN_DEFAULT_VCENTER ? GOLDEN_SUN_DEFAULT_VCENTER.replace(/"/g, '""') : '') + '"');
        scriptLines.push('$existingConnection = $global:DefaultVIServers | Where-Object { $_.IsConnected } | Select-Object -First 1');
        scriptLines.push('$viserver = $null');
        scriptLines.push('if ($existingConnection) {');
        scriptLines.push('    $viserver = $existingConnection');
        scriptLines.push('    Write-Host "Using existing vCenter connection: $($viserver.Name)" -ForegroundColor Cyan');
        scriptLines.push('} else {');
        scriptLines.push('    $vc = Read-Host "Enter vCenter Server name (or press Enter for default: $vcDefault)"');
        scriptLines.push('    if ([string]::IsNullOrWhiteSpace($vc) -and -not [string]::IsNullOrWhiteSpace($vcDefault)) { $vc = $vcDefault }');
        scriptLines.push('    if ([string]::IsNullOrWhiteSpace($vc)) { throw "vCenter Server name is required for Image Dates." }');
        scriptLines.push('    $vcCred = Get-Credential -Message "Enter vCenter credentials for $vc"');
        scriptLines.push('    Write-Host "Connecting to vCenter: $vc ..." -ForegroundColor Yellow');
        scriptLines.push('    Connect-VIServer -Server $vc -Credential $vcCred -ErrorAction Stop | Out-Null');
        scriptLines.push('    $viserver = Get-VIServer -Server $vc -ErrorAction SilentlyContinue');
        scriptLines.push('    Write-Host "Connected to $vc" -ForegroundColor Green');
        scriptLines.push('}');
        scriptLines.push('if (-not $viserver) { throw "Failed to establish vCenter connection." }');
        scriptLines.push('Write-Host "[DEBUG] Step 3: vCenter ready. Fetching farms and desktop pools from Horizon REST..." -ForegroundColor Magenta');
        scriptLines.push('');
        scriptLines.push('# --- Image Dates: fetch RDS farms + VDI desktop pools (VMware Horizon REST API) ---');
        scriptLines.push('# Ref: https://developer.broadcom.com/xapis/vmware-horizon-server-api');
        scriptLines.push('$invFarms = $null; $monFarms = $null;');
        scriptLines.push('foreach ($ep in @("/inventory/v7/farms", "/inventory/v4/farms", "/monitor/farms", "/monitor/v1/farms")) {');
        scriptLines.push('    $uri = "$BaseUrl$ep"');
        scriptLines.push('    Write-Host "Trying $uri ..." -ForegroundColor Cyan');
        scriptLines.push('    try {');
        scriptLines.push('        $r = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers');
        scriptLines.push('        if ($r -is [hashtable] -and $r.ContainsKey("items")) { $invFarms = $r.items }');
        scriptLines.push('        elseif ($r -is [pscustomobject] -and $r.PSObject.Properties.Name -contains "items") { $invFarms = $r.items }');
        scriptLines.push('        elseif ($r -is [array]) { $invFarms = $r }');
        scriptLines.push('        else { $invFarms = @($r) }');
        scriptLines.push('        Write-Host "  Got $($invFarms.Count) farm(s) from $ep" -ForegroundColor Green');
        scriptLines.push('        break');
        scriptLines.push('    } catch {');
        scriptLines.push('        if ($_.Exception.Response) { $code = $_.Exception.Response.StatusCode.value__ }');
        scriptLines.push('        Write-Warning "  $ep failed: $($_.Exception.Message)"');
        scriptLines.push('    }');
        scriptLines.push('}');
        scriptLines.push('if (-not $invFarms) { $invFarms = @(); Write-Warning "No farms found from any endpoint - continuing with desktop pools only." }');
        scriptLines.push('Write-Host "[DEBUG] Step 3b: Got $($invFarms.Count) farm(s). Now fetching desktop pools..." -ForegroundColor Magenta');
        scriptLines.push('');
        scriptLines.push('# Fetch VDI desktop pools');
        scriptLines.push('$invDesktops = $null');
        scriptLines.push('foreach ($ep in @("/inventory/v7/desktop-pools", "/inventory/v4/desktop-pools", "/inventory/v1/desktop-pools")) {');
        scriptLines.push('    $uri = "$BaseUrl$ep"');
        scriptLines.push('    Write-Host "Trying $uri ..." -ForegroundColor Cyan');
        scriptLines.push('    try {');
        scriptLines.push('        $r = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers');
        scriptLines.push('        if ($r -is [hashtable] -and $r.ContainsKey("items")) { $invDesktops = $r.items }');
        scriptLines.push('        elseif ($r -is [pscustomobject] -and $r.PSObject.Properties.Name -contains "items") { $invDesktops = $r.items }');
        scriptLines.push('        elseif ($r -is [array]) { $invDesktops = $r }');
        scriptLines.push('        else { $invDesktops = @($r) }');
        scriptLines.push('        Write-Host "  Got $($invDesktops.Count) desktop pool(s) from $ep" -ForegroundColor Green');
        scriptLines.push('        break');
        scriptLines.push('    } catch {');
        scriptLines.push('        Write-Warning "  $ep failed: $($_.Exception.Message)"');
        scriptLines.push('    }');
        scriptLines.push('}');
        scriptLines.push('if (-not $invDesktops) { $invDesktops = @(); Write-Warning "No desktop pools found from any endpoint." }');
        scriptLines.push('Write-Host "[DEBUG] Step 4: Got $($invDesktops.Count) desktop pool(s). Fetching per-item details..." -ForegroundColor Magenta');
        scriptLines.push('');
        scriptLines.push('# Per-farm detail from inventory/v7/farms/{id} for base image and snapshot');
        scriptLines.push('$details = @()');
        scriptLines.push('$farmIdx = 0');
        scriptLines.push('foreach ($farm in $invFarms) {');
        scriptLines.push('    $fid = $farm.id; if (-not $fid) { $fid = $farm.farmId }');
        scriptLines.push('    if (-not $fid) { continue }');
        scriptLines.push('    $farmIdx++; Write-Host "[DEBUG]   Farm $farmIdx/$($invFarms.Count): $fid" -ForegroundColor DarkGray');
        scriptLines.push('    foreach ($detailEp in @("/inventory/v7/farms/$fid", "/inventory/v4/farms/$fid")) {');
        scriptLines.push('        $detailUri = "$BaseUrl$detailEp"');
        scriptLines.push('        try {');
        scriptLines.push('            $d = Invoke-RestMethod -Method Get -Uri $detailUri -Headers $headers');
        scriptLines.push('            $details += @{ id = $fid; detail = $d }');
        scriptLines.push('            break');
        scriptLines.push('        } catch { }');
        scriptLines.push('    }');
        scriptLines.push('}');
        scriptLines.push('');
        scriptLines.push('# Per-desktop-pool detail from inventory/v7/desktop-pools/{id}');
        scriptLines.push('$desktopDetails = @()');
        scriptLines.push('$dpIdx = 0');
        scriptLines.push('foreach ($dp in $invDesktops) {');
        scriptLines.push('    $dpid = $dp.id');
        scriptLines.push('    if (-not $dpid) { continue }');
        scriptLines.push('    $dpIdx++; Write-Host "[DEBUG]   Desktop Pool $dpIdx/$($invDesktops.Count): $dpid" -ForegroundColor DarkGray');
        scriptLines.push('    foreach ($detailEp in @("/inventory/v7/desktop-pools/$dpid", "/inventory/v4/desktop-pools/$dpid")) {');
        scriptLines.push('        $detailUri = "$BaseUrl$detailEp"');
        scriptLines.push('        try {');
        scriptLines.push('            $d = Invoke-RestMethod -Method Get -Uri $detailUri -Headers $headers');
        scriptLines.push('            $desktopDetails += @{ id = $dpid; detail = $d }');
        scriptLines.push('            break');
        scriptLines.push('        } catch { }');
        scriptLines.push('    }');
        scriptLines.push('}');
        scriptLines.push('Write-Host "[DEBUG] Step 5: Per-item details done ($($details.Count) farm details, $($desktopDetails.Count) desktop details). Transforming..." -ForegroundColor Magenta');
        scriptLines.push('$response = $invFarms');
    } else if (action === 'clones') {
        scriptLines.push('# --- Clones: use monitor/v1/tasks + inventory/v7/farms for provisioning status (VMware Horizon REST API) ---');
        scriptLines.push('# Ref: https://developer.broadcom.com/xapis/vmware-horizon-server-api (List Farm Monitors, Tasks)');
        scriptLines.push('$tasks = $null; $farmData = $null;');
        scriptLines.push('foreach ($ep in @("/monitor/v1/tasks", "/monitor/tasks")) {');
        scriptLines.push('    $uri = "$BaseUrl$ep"');
        scriptLines.push('    Write-Host "Trying $uri ..." -ForegroundColor Cyan');
        scriptLines.push('    try {');
        scriptLines.push('        $tasks = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers');
        scriptLines.push('        if ($tasks -is [hashtable] -and $tasks.ContainsKey("items")) { $tasks = $tasks.items }');
        scriptLines.push('        elseif ($tasks -is [pscustomobject] -and $tasks.PSObject.Properties.Name -contains "items") { $tasks = $tasks.items }');
        scriptLines.push('        elseif ($tasks -isnot [array]) { $tasks = @($tasks) }');
        scriptLines.push('        Write-Host "  Got $($tasks.Count) task(s)" -ForegroundColor Green');
        scriptLines.push('        break');
        scriptLines.push('    } catch { Write-Warning "  $ep failed: $($_.Exception.Message)" }');
        scriptLines.push('}');
        scriptLines.push('foreach ($ep in @("/inventory/v7/farms", "/inventory/v4/farms", "/monitor/farms", "/monitor/v1/farms")) {');
        scriptLines.push('    $uri = "$BaseUrl$ep"');
        scriptLines.push('    try {');
        scriptLines.push('        $r = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers');
        scriptLines.push('        if ($r -is [hashtable] -and $r.ContainsKey("value")) { $farmData = $r.value }');
        scriptLines.push('        elseif ($r -is [pscustomobject] -and $r.PSObject.Properties.Name -contains "value") { $farmData = $r.value }');
        scriptLines.push('        elseif ($r -is [hashtable] -and $r.ContainsKey("items")) { $farmData = $r.items }');
        scriptLines.push('        elseif ($r -is [pscustomobject] -and $r.PSObject.Properties.Name -contains "items") { $farmData = $r.items }');
        scriptLines.push('        elseif ($r -is [array]) { $farmData = $r }');
        scriptLines.push('        else { $farmData = @($r) }');
        scriptLines.push('        Write-Host "  Got $($farmData.Count) farm(s) from $ep" -ForegroundColor Green');
        scriptLines.push('        break');
        scriptLines.push('    } catch { }');
        scriptLines.push('}');
        scriptLines.push('$response = @{ tasks = $tasks; farms = $farmData }');
    } else if (action === 'restarts') {
        scriptLines.push('# --- Restarts: per-farm instant clone scheduled maintenance using inventory farms + details ---');
        scriptLines.push('# This does NOT rely on /config/v1/farms/scheduled-updates (often 404);');
        scriptLines.push('# instead it uses inventory/v7 or v4 farms and per-farm provisioning_status_data.');
        scriptLines.push('$invFarms = $null;');
        scriptLines.push('foreach ($ep in @("/inventory/v7/farms", "/inventory/v4/farms", "/monitor/farms", "/monitor/v1/farms")) {');
        scriptLines.push('    $uri = "$BaseUrl$ep"');
        scriptLines.push('    Write-Host "Trying $uri ..." -ForegroundColor Cyan');
        scriptLines.push('    try {');
        scriptLines.push('        $r = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers');
        scriptLines.push('        if ($r -is [hashtable] -and $r.ContainsKey("items")) { $invFarms = $r.items }');
        scriptLines.push('        elseif ($r -is [pscustomobject] -and $r.PSObject.Properties.Name -contains "items") { $invFarms = $r.items }');
        scriptLines.push('        elseif ($r -is [array]) { $invFarms = $r }');
        scriptLines.push('        else { $invFarms = @($r) }');
        scriptLines.push('        Write-Host "  Got $($invFarms.Count) farm(s) from $ep" -ForegroundColor Green');
        scriptLines.push('        break');
        scriptLines.push('    } catch {');
        scriptLines.push('        if ($_.Exception.Response) { $code = $_.Exception.Response.StatusCode.value__ }');
        scriptLines.push('        Write-Warning "  $ep failed: $($_.Exception.Message)"');
        scriptLines.push('    }');
        scriptLines.push('}');
        scriptLines.push('if (-not $invFarms) { throw "Could not fetch farms from any endpoint" }');
        scriptLines.push('');
        scriptLines.push('# Per-farm detail from inventory/v7/farms/{id} for scheduled maintenance data');
        scriptLines.push('$details = @()');
        scriptLines.push('foreach ($farm in $invFarms) {');
        scriptLines.push('    $fid = $farm.id; if (-not $fid) { $fid = $farm.farmId }');
        scriptLines.push('    if (-not $fid) { continue }');
        scriptLines.push('    foreach ($detailEp in @("/inventory/v7/farms/$fid", "/inventory/v4/farms/$fid")) {');
        scriptLines.push('        $detailUri = "$BaseUrl$detailEp"');
        scriptLines.push('        try {');
        scriptLines.push('            $d = Invoke-RestMethod -Method Get -Uri $detailUri -Headers $headers');
        scriptLines.push('            $details += @{ id = $fid; detail = $d }');
        scriptLines.push('            Write-Host "  Fetched $detailEp" -ForegroundColor DarkGray');
        scriptLines.push('            break');
        scriptLines.push('        } catch { }');
        scriptLines.push('    }');
        scriptLines.push('}');
        scriptLines.push('$response = @{ farms = $invFarms; details = $details }');
    } else if (action !== 'discovery') {
        scriptLines.push('# --- Call API ---');
        scriptLines.push('$uri = "$BaseUrl$Endpoint"');
        scriptLines.push('Write-Host "Calling $uri ..." -ForegroundColor Cyan');
        scriptLines.push('try {');
        scriptLines.push('    $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers');
        scriptLines.push('}');
        scriptLines.push('catch {');
        scriptLines.push('    $status = $_.Exception.Response.StatusCode.value__');
        scriptLines.push('    if ($status -eq 404 -and $Endpoint -match "/v1/") {');
        scriptLines.push('        # Fallback: try without /v1 if environment exposes unversioned endpoints');
        scriptLines.push('        $altEndpoint = $Endpoint -replace "/v1","";');
        scriptLines.push('        $altUri = "$BaseUrl$altEndpoint"');
        scriptLines.push('        Write-Warning "Got 404 on $uri, retrying $altUri"');
        scriptLines.push('        $response = Invoke-RestMethod -Method Get -Uri $altUri -Headers $headers');
        scriptLines.push('    } else { throw }');
        scriptLines.push('}');
    } else {
        scriptLines.push('# --- Discovery: probe endpoints and dump ALL response data for inspection ---');
        scriptLines.push('# Use horizon-discovery-dump.json to find field names (VM names, snapshot names, dates)');
        scriptLines.push('$endpoints = @(');
        scriptLines.push("  '/inventory/v7/farms',");
        scriptLines.push("  '/inventory/v4/farms',");
        scriptLines.push("  '/inventory/v4/virtual-machines',");
        scriptLines.push("  '/inventory/v4/snapshots',");
        scriptLines.push("  '/monitor/farms',");
        scriptLines.push("  '/monitor/v1/farms',");
        scriptLines.push("  '/monitor/v1/desktop-pools',");
        scriptLines.push("  '/monitor/v1/tasks',");
        scriptLines.push("  '/monitor/v1/connection-servers',");
        scriptLines.push("  '/config/v1/farms/scheduled-updates',");
        scriptLines.push("  '/config/v1/admin-users-or-groups/permissions',");
        scriptLines.push("  '/config/v1/admin-users-or-groups/preferences',");
        scriptLines.push("  '/config/v1/compute-profiles',");
        scriptLines.push("  '/config/v1/connection-servers'");
        scriptLines.push(')');
        scriptLines.push('Write-Host "Probing endpoints (full dump to horizon-discovery-dump.json):" -ForegroundColor Cyan');
        scriptLines.push('$endpoints | ForEach-Object { Write-Host " - $_" }');
        scriptLines.push('');
        scriptLines.push('$results = @(); $dump = @{}');
        scriptLines.push('foreach ($ep in $endpoints) {');
        scriptLines.push('    $uri = "$BaseUrl$ep"');
        scriptLines.push('    $statusCode = $null; $err = $null; $items = $null; $usedAlt = $false; $body = $null;');
        scriptLines.push('    try {');
        scriptLines.push('        $resp = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers');
        scriptLines.push('        $body = $resp;');
        scriptLines.push('        $statusCode = 200;');
        scriptLines.push('    } catch {');
        scriptLines.push('        if ($_.Exception.Response) { $statusCode = $_.Exception.Response.StatusCode.value__ }');
        scriptLines.push('        $err = $_.Exception.Message');
        scriptLines.push('        if ($statusCode -eq 404 -and $ep -match "/v1/") {');
        scriptLines.push('            $altEp = $ep -replace "/v1","";');
        scriptLines.push('            $altUri = "$BaseUrl$altEp"');
        scriptLines.push('            Write-Warning "404 on $uri, retrying $altUri"');
        scriptLines.push('            try {');
        scriptLines.push('                $resp = Invoke-RestMethod -Method Get -Uri $altUri -Headers $headers');
        scriptLines.push('                $body = $resp; $statusCode = 200; $err = $null; $usedAlt = $true; $ep = $altEp;');
        scriptLines.push('            } catch {');
        scriptLines.push('                if ($_.Exception.Response) { $statusCode = $_.Exception.Response.StatusCode.value__ }');
        scriptLines.push('                $err = $_.Exception.Message');
        scriptLines.push('            }');
        scriptLines.push('        }');
        scriptLines.push('    }');
        scriptLines.push('    if ($body -is [hashtable] -and $body.ContainsKey("items")) { $items = $body.items.Count }');
        scriptLines.push('    elseif ($body -is [array]) { $items = $body.Count }');
        scriptLines.push('    elseif ($body) { $items = 1 }');
        scriptLines.push('    $results += [pscustomobject]@{');
        scriptLines.push('        Endpoint   = $ep');
        scriptLines.push('        StatusCode = $statusCode');
        scriptLines.push('        Items      = $items');
        scriptLines.push('        UsedAlt    = $usedAlt');
        scriptLines.push('        Error      = $err');
        scriptLines.push('    }');
        scriptLines.push('    # Store full response for dump (key = endpoint, value = { statusCode, items, data })');
        scriptLines.push('    $dump[$ep] = @{ statusCode = $statusCode; items = $items; error = $err; data = $body }');
        scriptLines.push('}');
        scriptLines.push('# Per-farm detail: fetch inventory/v7/farms/{id} for each farm from inventory');
        scriptLines.push('$farmList = $null');
        scriptLines.push('if ($dump["/inventory/v7/farms"] -and $dump["/inventory/v7/farms"].data) {');
        scriptLines.push('    $r = $dump["/inventory/v7/farms"].data');
        scriptLines.push('    if ($r -is [hashtable] -and $r.ContainsKey("items")) { $farmList = $r.items }');
        scriptLines.push('    elseif ($r -is [pscustomobject] -and $r.PSObject.Properties.Name -contains "items") { $farmList = $r.items }');
        scriptLines.push('    elseif ($r -is [array]) { $farmList = $r }');
        scriptLines.push('    else { $farmList = @($r) }');
        scriptLines.push('}');
        scriptLines.push('if (-not $farmList -and $dump["/inventory/v4/farms"] -and $dump["/inventory/v4/farms"].data) {');
        scriptLines.push('    $r = $dump["/inventory/v4/farms"].data');
        scriptLines.push('    if ($r -is [hashtable] -and $r.ContainsKey("items")) { $farmList = $r.items }');
        scriptLines.push('    elseif ($r -is [pscustomobject] -and $r.PSObject.Properties.Name -contains "items") { $farmList = $r.items }');
        scriptLines.push('    elseif ($r -is [array]) { $farmList = $r }');
        scriptLines.push('    else { $farmList = @($r) }');
        scriptLines.push('}');
        scriptLines.push('if (-not $farmList -and $dump["/monitor/farms"] -and $dump["/monitor/farms"].data) {');
        scriptLines.push('    $r = $dump["/monitor/farms"].data');
        scriptLines.push('    if ($r -is [hashtable] -and $r.ContainsKey("items")) { $farmList = $r.items }');
        scriptLines.push('    elseif ($r -is [pscustomobject] -and $r.PSObject.Properties.Name -contains "items") { $farmList = $r.items }');
        scriptLines.push('    elseif ($r -is [array]) { $farmList = $r }');
        scriptLines.push('    else { $farmList = @($r) }');
        scriptLines.push('}');
        scriptLines.push('if ($farmList) {');
        scriptLines.push('    $farmDetails = @{}');
        scriptLines.push('    foreach ($f in $farmList) {');
        scriptLines.push('        $fid = $f.id; if (-not $fid) { $fid = $f.farmId }');
        scriptLines.push('        if (-not $fid) { continue }');
        scriptLines.push('        foreach ($detailEp in @("/inventory/v7/farms/$fid", "/inventory/v4/farms/$fid")) {');
        scriptLines.push('            try {');
        scriptLines.push('                $d = Invoke-RestMethod -Method Get -Uri "$BaseUrl$detailEp" -Headers $headers');
        scriptLines.push('                $farmDetails["farm_$fid"] = @{ endpoint = $detailEp; data = $d }');
        scriptLines.push('                Write-Host "  Fetched $detailEp" -ForegroundColor DarkGray');
        scriptLines.push('                break');
        scriptLines.push('            } catch { }');
        scriptLines.push('        }');
        scriptLines.push('    }');
        scriptLines.push('    $dump["_per_farm_details"] = @{ note = "inventory/v7 or v4 farms/{id}"; data = $farmDetails }');
        scriptLines.push('}');
        scriptLines.push('$dumpPath = [System.IO.Path]::ChangeExtension($OutJson, "-dump.json")');
        scriptLines.push('$dump | ConvertTo-Json -Depth 25 | Out-File -FilePath $dumpPath -Encoding UTF8');
        scriptLines.push('Write-Host "Saved full data dump to $dumpPath - use this to find VM/snapshot name fields" -ForegroundColor Green');
        scriptLines.push('$response = $results');
    }
    scriptLines.push('');
    if (action === 'imageDates') {
        scriptLines.push('Write-Host "[DEBUG] Step 6: Transform - normalizing source..." -ForegroundColor Magenta');
        scriptLines.push('# Transform for farm + image dates view (source: inventory/v7 or v4 farms + per-farm detail)');
        scriptLines.push('$source = $response');
        scriptLines.push('if ($response -is [hashtable] -and $response.ContainsKey("items")) { $source = $response.items }');
        scriptLines.push('if ($response -is [pscustomobject] -and $response.PSObject.Properties.Name -contains "items") { $source = $response.items }');
        scriptLines.push('if ($source -isnot [array]) { $source = @($source) }');
        scriptLines.push('');
        scriptLines.push('# Save raw response for debugging mappings');
        scriptLines.push('Write-Host "[DEBUG] Step 7: Saving raw JSON (may take a moment for large responses)..." -ForegroundColor Magenta');
        scriptLines.push('$RawOutJson = [System.IO.Path]::ChangeExtension($OutJson, ".raw.json")');
        scriptLines.push('$response | ConvertTo-Json -Depth 12 | Out-File -FilePath $RawOutJson -Encoding UTF8');
        scriptLines.push('Write-Host "Saved raw response to $RawOutJson" -ForegroundColor DarkGray');
        scriptLines.push('');
        scriptLines.push('Write-Host "[DEBUG] Step 8: Loading VMware master JSON files..." -ForegroundColor Magenta');
        scriptLines.push('# Load VMware master image lists for Prod/Test (if available)');
        scriptLines.push('$vmMasters = @()');
        scriptLines.push('$masterFiles = @(');
        scriptLines.push("  '.\\Data\\Prod-master-images.json',");
        scriptLines.push("  '.\\Data\\Test-master-images.json',");
        scriptLines.push("  '.\\Prod-master-images.json',");
        scriptLines.push("  '.\\Test-master-images.json',");
        scriptLines.push("  '.\\Data\\Prod_Images.json',");
        scriptLines.push("  '.\\Data\\Test_Images.json'");
        scriptLines.push(')');
        scriptLines.push('foreach ($mf in $masterFiles) {');
        scriptLines.push('    if (Test-Path $mf) {');
        scriptLines.push('        try {');
        scriptLines.push('            Write-Host "Loading master images from $mf" -ForegroundColor DarkCyan');
        scriptLines.push('            $raw = Get-Content -Path $mf -Raw | ConvertFrom-Json');
        scriptLines.push('            $items = $null');
        scriptLines.push('            if ($raw -and $raw.MasterImages) { $items = $raw.MasterImages }');
        scriptLines.push('            elseif ($raw -is [array]) { $items = $raw }');
        scriptLines.push('            else { $items = @($raw) }');
        scriptLines.push('            if ($items) { $vmMasters += $items }');
        scriptLines.push('        } catch {');
        scriptLines.push('            Write-Warning "Failed to parse $mf : $($_.Exception.Message)"');
        scriptLines.push('        }');
        scriptLines.push('    }');
        scriptLines.push('}');
        scriptLines.push('Write-Host "[DEBUG] Step 9: Building vmMasterIndex ($($vmMasters.Count) masters)..." -ForegroundColor Magenta');
        scriptLines.push('');
        scriptLines.push('# Normalize VMware masters into lookup by VM name');
        scriptLines.push('$vmMasterIndex = @{}');
        scriptLines.push('foreach ($m in $vmMasters) {');
        scriptLines.push('    if (-not $m) { continue }');
        scriptLines.push('    $name = $m.Name');
        scriptLines.push('    if (-not $name -and $m.VMName) { $name = $m.VMName }');
        scriptLines.push('    if (-not $name -and $m.vmName) { $name = $m.vmName }');
        scriptLines.push('    if (-not $name -and $m.Image) { $name = $m.Image }');
        scriptLines.push('    if (-not $name -and $m.Master) { $name = $m.Master }');
        scriptLines.push('    if (-not $name -and $m.ImageMachineName) { $name = $m.ImageMachineName }');
        scriptLines.push('    if (-not $name) { continue }');
        scriptLines.push('    $snapName = $null; $snapTime = $null');
        scriptLines.push('    if ($m.LatestSnapshot) {');
        scriptLines.push('        $snapName = $m.LatestSnapshot.Name');
        scriptLines.push('        $snapTime = $m.LatestSnapshot.Created');
        scriptLines.push('    }');
        scriptLines.push('    # Some JSONs flatten snapshot fields to top-level LatestSnapshotName/LatestSnapshotTimestamp');
        scriptLines.push('    if (-not $snapName -and $m.LatestSnapshotName) { $snapName = $m.LatestSnapshotName }');
        scriptLines.push('    if (-not $snapTime -and $m.LatestSnapshotTimestamp) { $snapTime = $m.LatestSnapshotTimestamp }');
        scriptLines.push('    if (-not $snapName -and $m.Snapshot) { $snapName = $m.Snapshot }');
        scriptLines.push('    if (-not $snapName -and $m.SnapshotName) { $snapName = $m.SnapshotName }');
        scriptLines.push('    if (-not $snapTime -and $m.SnapshotTimestamp) { $snapTime = $m.SnapshotTimestamp }');
        scriptLines.push('    if (-not $snapTime -and $m.SnapshotCreated) { $snapTime = $m.SnapshotCreated }');
        scriptLines.push('    if (-not $snapTime -and $m.SnapshotDate) { $snapTime = $m.SnapshotDate }');
        scriptLines.push('    $vmMasterIndex[$name] = @{');
        scriptLines.push('        Name = $name;');
        scriptLines.push('        Snapshot = $snapName;');
        scriptLines.push('        SnapshotTimestamp = $snapTime');
        scriptLines.push('    }');
        scriptLines.push('}');
        scriptLines.push('Write-Host "[DEBUG] Step 10: Loading clone log (optional)..." -ForegroundColor Magenta');
        scriptLines.push('');
        scriptLines.push('# Load clone log (optional) to mark cloned masters)');
        scriptLines.push('$cloneLogPath = Join-Path $ReportsDir "FarmClonesLog.json"');
        scriptLines.push('$cloneIndex = @{}');
        scriptLines.push('if (Test-Path $cloneLogPath) {');
        scriptLines.push('    try {');
        scriptLines.push('        $clones = Get-Content -Path $cloneLogPath -Raw | ConvertFrom-Json');
        scriptLines.push('        if ($clones -isnot [array]) { $clones = @($clones) }');
        scriptLines.push('        foreach ($c in $clones) {');
        scriptLines.push('            $src = $c.SourceVM');
        scriptLines.push('            if (-not $src) { continue }');
        scriptLines.push('            $state = $c.State; if (-not $state) { $state = "Created" }');
        scriptLines.push('            $cloneIndex[$src] = $state');
        scriptLines.push('        }');
        scriptLines.push('    } catch {');
        scriptLines.push('        Write-Warning "Failed to read clone log $cloneLogPath : $($_.Exception.Message)"');
        scriptLines.push('    }');
        scriptLines.push('}');
        scriptLines.push('');
        scriptLines.push('Write-Host "[DEBUG] Step 11: Building rows ($($source.Count) farms)..." -ForegroundColor Magenta');
        scriptLines.push('$rows = @()');
        scriptLines.push('$rowIdx = 0');
        scriptLines.push('foreach ($farm in $source) {');
        scriptLines.push('    $rowIdx++; if ($rowIdx % 5 -eq 0 -or $rowIdx -eq $source.Count) { Write-Host "[DEBUG]     Row $rowIdx/$($source.Count)" -ForegroundColor DarkGray }');
        scriptLines.push('    $imgName = $null; $snapName = $null; $snapTime = $null');
        scriptLines.push('    $fid = $farm.id; if (-not $fid) { $fid = $farm.farmId }');
        scriptLines.push('');
        scriptLines.push('    # VMware Horizon inventory: parent_vm_path and snapshot_path (human-readable names)');
        scriptLines.push('    $ps = $farm.automated_farm_settings.provisioning_settings');
        scriptLines.push('    if (-not $ps) { $ps = $farm.provisioning_settings }');
        scriptLines.push('    if ($ps) {');
        scriptLines.push('        if (-not $imgName -and $ps.parent_vm_path) { $imgName = $ps.parent_vm_path }');
        scriptLines.push('        if (-not $imgName -and $ps.parent_vm_id) { $imgName = $ps.parent_vm_id }');
        scriptLines.push('        if (-not $snapName -and $ps.snapshot_path) { $snapName = $ps.snapshot_path }');
        scriptLines.push('        if (-not $snapName -and $ps.base_snapshot_id) { $snapName = $ps.base_snapshot_id }');
        scriptLines.push('    }');
        scriptLines.push('    # provisioning_status_data (instant clone fields)');
        scriptLines.push('    $pst = $farm.provisioning_status_data');
        scriptLines.push('    if ($pst) {');
        scriptLines.push('        if (-not $imgName -and $pst.instant_clone_pending_image_parent_vm_id) { $imgName = $pst.instant_clone_pending_image_parent_vm_id }');
        scriptLines.push('        if (-not $imgName -and $pst.parent_vm_id) { $imgName = $pst.parent_vm_id }');
        scriptLines.push('        if (-not $snapName -and $pst.instant_clone_pending_image_snapshot_id) { $snapName = $pst.instant_clone_pending_image_snapshot_id }');
        scriptLines.push('        if (-not $snapName -and $pst.base_snapshot_id) { $snapName = $pst.base_snapshot_id }');
        scriptLines.push('    }');
        scriptLines.push('');
        scriptLines.push('    # legacy / alternate field names');
        scriptLines.push('    if (-not $imgName) { $imgName = $farm.baseImageName }');
        scriptLines.push('    if (-not $imgName -and $farm.baseImage) { $imgName = $farm.baseImage.name }');
        scriptLines.push('    if (-not $imgName -and $farm.baseImage) { $imgName = $farm.baseImage.goldenImageName }');
        scriptLines.push('    if (-not $imgName -and $farm.baseImage -and $farm.baseImage.goldenImage) { $imgName = $farm.baseImage.goldenImage.name }');
        scriptLines.push('    if (-not $imgName -and $farm.baseImage) { $imgName = $farm.baseImage.imageName }');
        scriptLines.push('    if (-not $imgName -and $farm.baseImage) { $imgName = $farm.baseImage.baseImageName }');
        scriptLines.push('    if (-not $imgName -and $farm.baseImage -and $farm.baseImage.baseImage) { $imgName = $farm.baseImage.baseImage.name }');
        scriptLines.push('    if (-not $snapName) { $snapName = $farm.baseImageSnapshotName }');
        scriptLines.push('    if (-not $snapName -and $farm.baseImage) { $snapName = $farm.baseImage.snapshotName }');
        scriptLines.push('    if (-not $snapName -and $farm.baseImage -and $farm.baseImage.snapshot) { $snapName = $farm.baseImage.snapshot.name }');
        scriptLines.push('    if (-not $snapName -and $farm.baseImage) { $snapName = $farm.baseImage.baseImageSnapshotName }');
        scriptLines.push('    if (-not $snapName -and $farm.baseImage -and $farm.baseImage.snapshot) { $snapName = $farm.baseImage.snapshot.displayName }');
        scriptLines.push('    if (-not $snapTime) { $snapTime = $farm.baseImageSnapshotCreationTime }');
        scriptLines.push('    if (-not $snapTime -and $farm.baseImage) { $snapTime = $farm.baseImage.snapshotCreationTime }');
        scriptLines.push('    if (-not $snapTime -and $farm.baseImage -and $farm.baseImage.snapshot) { $snapTime = $farm.baseImage.snapshot.creationTime }');
        scriptLines.push('    if (-not $snapTime -and $farm.baseImage -and $farm.baseImage.snapshot) { $snapTime = $farm.baseImage.snapshot.created }');
        scriptLines.push('    if (-not $snapTime -and $farm.baseImage -and $farm.baseImage.snapshot) { $snapTime = $farm.baseImage.snapshot.timestamp }');
        scriptLines.push('');
        scriptLines.push('    # per-farm detail (inventory/v7/farms/{id}) - already fetched in API block');
        scriptLines.push('    if ($fid -and $details) {');
        scriptLines.push('        $dMatch = $details | Where-Object { $_.id -eq $fid } | Select-Object -First 1');
        scriptLines.push('        if ($dMatch -and $dMatch.detail) {');
        scriptLines.push('            $d = $dMatch.detail');
        scriptLines.push('            $aps = $d.automated_farm_settings.provisioning_settings');
        scriptLines.push('            if (-not $imgName) {');
        scriptLines.push('                if ($d.baseImage) { $imgName = $d.baseImage }');
        scriptLines.push('                elseif ($d.image) { $imgName = $d.image }');
        scriptLines.push('                elseif ($d.goldenImage) { $imgName = $d.goldenImage }');
        scriptLines.push('                if (-not $imgName -and $aps -and $aps.parent_vm_path) { $imgName = $aps.parent_vm_path }');
        scriptLines.push('                if (-not $imgName -and $aps -and $aps.parent_vm_id) { $imgName = $aps.parent_vm_id }');
        scriptLines.push('            }');
        scriptLines.push('            if (-not $snapName) {');
        scriptLines.push('                if ($d.snapshot) { $snapName = $d.snapshot }');
        scriptLines.push('                elseif ($d.snapshotName) { $snapName = $d.snapshotName }');
        scriptLines.push('                if (-not $snapName -and $aps -and $aps.snapshot_path) { $snapName = $aps.snapshot_path }');
        scriptLines.push('                if (-not $snapName -and $aps -and $aps.base_snapshot_id) { $snapName = $aps.base_snapshot_id }');
        scriptLines.push('            }');
        scriptLines.push('            if (-not $snapTime) {');
        scriptLines.push('                if ($d.snapshotTimestamp) { $snapTime = $d.snapshotTimestamp }');
        scriptLines.push('                elseif ($d.snapshotCreationTime) { $snapTime = $d.snapshotCreationTime }');
        scriptLines.push('            }');
        scriptLines.push('        }');
        scriptLines.push('    }');
        scriptLines.push('');
        scriptLines.push('    # Match to VMware master image list');
        scriptLines.push('    $vmNameMatch = $null');
        scriptLines.push('    if ($imgName -and $vmMasterIndex.ContainsKey($imgName)) {');
        scriptLines.push('        $vmNameMatch = $imgName');
        scriptLines.push('    } elseif ($imgName) {');
        scriptLines.push('        foreach ($k in $vmMasterIndex.Keys) {');
        scriptLines.push('            if ($imgName -like "*$k*") { $vmNameMatch = $k; break }');
        scriptLines.push('            if ($k -like "*$imgName*") { $vmNameMatch = $k; break }');
        scriptLines.push('        }');
        scriptLines.push('    }');
        scriptLines.push('    $vmImageName = $null; $vmSnapName = $null; $vmSnapTime = $null; $cloneState = $null');
        scriptLines.push('    if ($vmNameMatch -and $vmMasterIndex.ContainsKey($vmNameMatch)) {');
        scriptLines.push('        $entry = $vmMasterIndex[$vmNameMatch];');
        scriptLines.push('        $vmImageName = $entry.Name;');
        scriptLines.push('        $vmSnapName = $entry.Snapshot;');
        scriptLines.push('        $vmSnapTime = $entry.SnapshotTimestamp;');
        scriptLines.push('        if ($cloneIndex.ContainsKey($vmImageName)) { $cloneState = $cloneIndex[$vmImageName] }');
        scriptLines.push('    }');
        scriptLines.push('');
        scriptLines.push('    $rows += [PSCustomObject]@{');
        scriptLines.push('        HzFarm             = $farm.name');
        scriptLines.push('        HzFarmType         = $farm.type');
        scriptLines.push('        HzSourceType       = "Farm"');
        scriptLines.push('        HzBaseImage        = $imgName');
        scriptLines.push('        HzSnapshot         = $snapName');
        scriptLines.push('        VmMasterImage      = $vmImageName');
        scriptLines.push('        VmMasterSnapshot   = $vmSnapName');
        scriptLines.push('        VmSnapshotTimestamp = $vmSnapTime');
        scriptLines.push('        CloneState         = $cloneState');
        scriptLines.push('    }');
        scriptLines.push('}');
        scriptLines.push('');
        scriptLines.push('# --- Process VDI desktop pools ---');
        scriptLines.push('Write-Host "[DEBUG] Step 11b: Building rows for $($invDesktops.Count) desktop pool(s)..." -ForegroundColor Magenta');
        scriptLines.push('foreach ($dp in $invDesktops) {');
        scriptLines.push('    $imgName = $null; $snapName = $null; $snapTime = $null');
        scriptLines.push('    $dpid = $dp.id');
        scriptLines.push('    $dpName = $dp.display_name; if (-not $dpName) { $dpName = $dp.name }');
        scriptLines.push('    $dpType = $dp.type');
        scriptLines.push('');
        scriptLines.push('    # automated_desktop_settings.vmware_desktop_settings.vmware_desktop_vcenter_settings');
        scriptLines.push('    $ads = $dp.automated_desktop_settings');
        scriptLines.push('    if ($ads) {');
        scriptLines.push('        $vcs = $null');
        scriptLines.push('        if ($ads.vmware_desktop_settings) { $vcs = $ads.vmware_desktop_settings.vmware_desktop_vcenter_settings }');
        scriptLines.push('        if ($vcs) {');
        scriptLines.push('            if (-not $imgName -and $vcs.parent_vm_path) { $imgName = $vcs.parent_vm_path }');
        scriptLines.push('            if (-not $imgName -and $vcs.parent_vm_id)   { $imgName = $vcs.parent_vm_id }');
        scriptLines.push('            if (-not $snapName -and $vcs.snapshot_path) { $snapName = $vcs.snapshot_path }');
        scriptLines.push('            if (-not $snapName -and $vcs.base_snapshot_id) { $snapName = $vcs.base_snapshot_id }');
        scriptLines.push('        }');
        scriptLines.push('        # provisioning_settings fallback (older API versions)');
        scriptLines.push('        if ($ads.provisioning_settings) {');
        scriptLines.push('            $ps = $ads.provisioning_settings');
        scriptLines.push('            if (-not $imgName -and $ps.parent_vm_path) { $imgName = $ps.parent_vm_path }');
        scriptLines.push('            if (-not $imgName -and $ps.parent_vm_id)   { $imgName = $ps.parent_vm_id }');
        scriptLines.push('            if (-not $snapName -and $ps.snapshot_path) { $snapName = $ps.snapshot_path }');
        scriptLines.push('            if (-not $snapName -and $ps.base_snapshot_id) { $snapName = $ps.base_snapshot_id }');
        scriptLines.push('        }');
        scriptLines.push('    }');
        scriptLines.push('');
        scriptLines.push('    # Per-pool detail lookup');
        scriptLines.push('    if ($dpid -and $desktopDetails) {');
        scriptLines.push('        $dMatch = $desktopDetails | Where-Object { $_.id -eq $dpid } | Select-Object -First 1');
        scriptLines.push('        if ($dMatch -and $dMatch.detail) {');
        scriptLines.push('            $d = $dMatch.detail');
        scriptLines.push('            $ads2 = $d.automated_desktop_settings');
        scriptLines.push('            if ($ads2) {');
        scriptLines.push('                $vcs2 = $null');
        scriptLines.push('                if ($ads2.vmware_desktop_settings) { $vcs2 = $ads2.vmware_desktop_settings.vmware_desktop_vcenter_settings }');
        scriptLines.push('                if ($vcs2) {');
        scriptLines.push('                    if (-not $imgName -and $vcs2.parent_vm_path) { $imgName = $vcs2.parent_vm_path }');
        scriptLines.push('                    if (-not $imgName -and $vcs2.parent_vm_id)   { $imgName = $vcs2.parent_vm_id }');
        scriptLines.push('                    if (-not $snapName -and $vcs2.snapshot_path) { $snapName = $vcs2.snapshot_path }');
        scriptLines.push('                    if (-not $snapName -and $vcs2.base_snapshot_id) { $snapName = $vcs2.base_snapshot_id }');
        scriptLines.push('                }');
        scriptLines.push('            }');
        scriptLines.push('            # top-level detail fallbacks');
        scriptLines.push('            if (-not $imgName -and $d.baseImage) { $imgName = $d.baseImage }');
        scriptLines.push('            if (-not $imgName -and $d.image) { $imgName = $d.image }');
        scriptLines.push('            if (-not $snapName -and $d.snapshot) { $snapName = $d.snapshot }');
        scriptLines.push('            if (-not $snapName -and $d.snapshotName) { $snapName = $d.snapshotName }');
        scriptLines.push('            if (-not $snapTime -and $d.snapshotTimestamp) { $snapTime = $d.snapshotTimestamp }');
        scriptLines.push('            if (-not $snapTime -and $d.snapshotCreationTime) { $snapTime = $d.snapshotCreationTime }');
        scriptLines.push('        }');
        scriptLines.push('    }');
        scriptLines.push('');
        scriptLines.push('    # legacy / alternate field names');
        scriptLines.push('    if (-not $imgName) { $imgName = $dp.baseImageName }');
        scriptLines.push('    if (-not $imgName -and $dp.baseImage) { $imgName = $dp.baseImage.name }');
        scriptLines.push('    if (-not $snapName) { $snapName = $dp.baseImageSnapshotName }');
        scriptLines.push('    if (-not $snapName -and $dp.baseImage) { $snapName = $dp.baseImage.snapshotName }');
        scriptLines.push('    if (-not $snapTime) { $snapTime = $dp.baseImageSnapshotCreationTime }');
        scriptLines.push('');
        scriptLines.push('    # Match to VMware master image list (same logic as farms)');
        scriptLines.push('    $vmNameMatch = $null');
        scriptLines.push('    if ($imgName -and $vmMasterIndex.ContainsKey($imgName)) {');
        scriptLines.push('        $vmNameMatch = $imgName');
        scriptLines.push('    } elseif ($imgName) {');
        scriptLines.push('        foreach ($k in $vmMasterIndex.Keys) {');
        scriptLines.push('            if ($imgName -like "*$k*") { $vmNameMatch = $k; break }');
        scriptLines.push('            if ($k -like "*$imgName*") { $vmNameMatch = $k; break }');
        scriptLines.push('        }');
        scriptLines.push('    }');
        scriptLines.push('    $vmImageName = $null; $vmSnapName = $null; $vmSnapTime = $null; $cloneState = $null');
        scriptLines.push('    if ($vmNameMatch -and $vmMasterIndex.ContainsKey($vmNameMatch)) {');
        scriptLines.push('        $entry = $vmMasterIndex[$vmNameMatch]');
        scriptLines.push('        $vmImageName = $entry.Name');
        scriptLines.push('        $vmSnapName = $entry.Snapshot');
        scriptLines.push('        $vmSnapTime = $entry.SnapshotTimestamp');
        scriptLines.push('        if ($cloneIndex.ContainsKey($vmImageName)) { $cloneState = $cloneIndex[$vmImageName] }');
        scriptLines.push('    }');
        scriptLines.push('');
        scriptLines.push('    $rows += [PSCustomObject]@{');
        scriptLines.push('        HzFarm             = $dpName');
        scriptLines.push('        HzFarmType         = $dpType');
        scriptLines.push('        HzSourceType       = "Desktop"');
        scriptLines.push('        HzBaseImage        = $imgName');
        scriptLines.push('        HzSnapshot         = $snapName');
        scriptLines.push('        VmMasterImage      = $vmImageName');
        scriptLines.push('        VmMasterSnapshot   = $vmSnapName');
        scriptLines.push('        VmSnapshotTimestamp = $vmSnapTime');
        scriptLines.push('        CloneState         = $cloneState');
        scriptLines.push('    }');
        scriptLines.push('}');
        scriptLines.push('');
        scriptLines.push('# Debug: show first item keys to assist mapping');
        scriptLines.push('if ($source -and $source[0]) {');
        scriptLines.push('    Write-Host "First item properties:" -ForegroundColor Yellow');
        scriptLines.push('    $source[0].PSObject.Properties.Name | ForEach-Object { Write-Host " - $_" }');
        scriptLines.push('}');
        scriptLines.push('Write-Host "[DEBUG] Step 12: Total rows: $($rows.Count) ($($invFarms.Count) farm(s) + $($invDesktops.Count) desktop pool(s))" -ForegroundColor Green');
        scriptLines.push('$response = $rows');
        scriptLines.push('Write-Host "[DEBUG] Step 12b: Saving FarmData.json..." -ForegroundColor Magenta');
        scriptLines.push('');
        scriptLines.push('# Also save farm data as JSON in Reports so GoldenSun UI can load it');
        scriptLines.push('$farmJsonPath = Join-Path $ReportsDir "FarmData.json"');
        scriptLines.push('$rows | ConvertTo-Json -Depth 8 | Out-File -FilePath $farmJsonPath -Encoding UTF8');
    } else if (action === 'clones') {
        scriptLines.push('# Transform clones: Farm Name, Golden Image (parent_vm_path), Snapshot (snapshot_path) from inventory');
        scriptLines.push('$tasks = $response.tasks; $farms = $response.farms');
        scriptLines.push('if (-not $tasks) { $tasks = @() }');
        scriptLines.push('if (-not $farms) { $farms = @() }');
        scriptLines.push('if ($farms -is [hashtable] -and $farms.ContainsKey("value")) { $farms = $farms.value }');
        scriptLines.push('elseif ($farms -is [pscustomobject] -and $farms.PSObject.Properties.Name -contains "value") { $farms = $farms.value }');
        scriptLines.push('elseif ($farms -is [hashtable] -and $farms.ContainsKey("items")) { $farms = $farms.items }');
        scriptLines.push('elseif ($farms -is [pscustomobject] -and $farms.PSObject.Properties.Name -contains "items") { $farms = $farms.items }');
        scriptLines.push('if ($farms -isnot [array]) { $farms = @($farms) }');
        scriptLines.push('');
        scriptLines.push('$rows = @()');
        scriptLines.push('# Task rows (if any)');
        scriptLines.push('foreach ($t in $tasks) {');
        scriptLines.push('    $rows += [PSCustomObject]@{');
        scriptLines.push('        FarmName       = ""');
        scriptLines.push('        GoldenImage    = ""');
        scriptLines.push('        Snapshot       = ""');
        scriptLines.push('        CloneStatus    = $t.status');
        scriptLines.push('        Progress       = $t.progress');
        scriptLines.push('        Error          = $t.error_message');
        scriptLines.push('    }');
        scriptLines.push('}');
        scriptLines.push('# Farm rows: display_name, parent_vm_path, snapshot_path from provisioning_settings');
        scriptLines.push('foreach ($f in $farms) {');
        scriptLines.push('    $farmName = $f.display_name; if (-not $farmName) { $farmName = $f.name }');
        scriptLines.push('    $goldenImage = ""; $snapshot = ""; $cloneStatus = ""; $err = ""');
        scriptLines.push('    $ps = $f.automated_farm_settings.provisioning_settings');
        scriptLines.push('    if (-not $ps) { $ps = $f.provisioning_settings }');
        scriptLines.push('    if ($ps) {');
        scriptLines.push('        $goldenImage = $ps.parent_vm_path');
        scriptLines.push('        if (-not $goldenImage -and $ps.parent_vm_id) { $goldenImage = $ps.parent_vm_id }');
        scriptLines.push('        if ($goldenImage -and $goldenImage -match \'/([^/]+)$\') { $goldenImage = $Matches[1] }');
        scriptLines.push('        $snapshot = $ps.snapshot_path');
        scriptLines.push('        if (-not $snapshot -and $ps.base_snapshot_id) { $snapshot = $ps.base_snapshot_id }');
        scriptLines.push('    }');
        scriptLines.push('    $pst = $f.automated_farm_settings.provisioning_status_data');
        scriptLines.push('    if (-not $pst) { $pst = $f.provisioning_status_data }');
        scriptLines.push('    if ($pst) {');
        scriptLines.push('        $cloneStatus = $pst.instant_clone_operation');
        scriptLines.push('        $err = $pst.last_provisioning_error');
        scriptLines.push('    }');
        scriptLines.push('    if (-not $goldenImage -and $f.type -eq "MANUAL") { $goldenImage = "(Manual farm)" }');
        scriptLines.push('    $rows += [PSCustomObject]@{');
        scriptLines.push('        FarmName       = $farmName');
        scriptLines.push('        GoldenImage    = $goldenImage');
        scriptLines.push('        Snapshot       = $snapshot');
        scriptLines.push('        CloneStatus    = $cloneStatus');
        scriptLines.push('        Progress       = ""');
        scriptLines.push('        Error          = $err');
        scriptLines.push('    }');
        scriptLines.push('}');
        scriptLines.push('$response = $rows');
    } else if (action === 'restarts') {
        scriptLines.push('# Transform restarts: scheduled maintenance / restart info per farm');
        scriptLines.push('$farms = $response.farms; $details = $response.details;');
        scriptLines.push('if (-not $farms) { $farms = @() }');
        scriptLines.push('if ($farms -is [hashtable] -and $farms.ContainsKey("items")) { $farms = $farms.items }');
        scriptLines.push('elseif ($farms -is [pscustomobject] -and $farms.PSObject.Properties.Name -contains "items") { $farms = $farms.items }');
        scriptLines.push('if ($farms -isnot [array]) { $farms = @($farms) }');
        scriptLines.push('');
        scriptLines.push('$rows = @()');
        scriptLines.push('foreach ($farm in $farms) {');
        scriptLines.push('    $fid = $farm.id; if (-not $fid) { $fid = $farm.farmId }');
        scriptLines.push('    $farmName = $farm.display_name; if (-not $farmName) { $farmName = $farm.name }');
        scriptLines.push('    $type = $farm.type');
        scriptLines.push('    $source = $farm.automated_farm_settings.image_source; if (-not $source) { $source = $farm.source }');
        scriptLines.push('    $schedEnabled = $false; $nextTime = $null; $period = $null; $freq = $null; $startTime = $null; $dayIndex = $null;');
        scriptLines.push('    $logoffPolicy = $null; $stopOnFirstError = $null; $immediate = $null;');
        scriptLines.push('');
        scriptLines.push('    $detail = $null;');
        scriptLines.push('    if ($fid -and $details) {');
        scriptLines.push('        $match = $details | Where-Object { $_.id -eq $fid } | Select-Object -First 1');
        scriptLines.push('        if ($match -and $match.detail) { $detail = $match.detail }');
        scriptLines.push('    }');
        scriptLines.push('');
        scriptLines.push('    if ($detail -and $detail.automated_farm_settings -and $detail.automated_farm_settings.provisioning_status_data) {');
        scriptLines.push('        $pst = $detail.automated_farm_settings.provisioning_status_data');
        scriptLines.push('        $maint = $pst.instant_clone_scheduled_maintenance_data');
        scriptLines.push('        if ($maint) {');
        scriptLines.push('            $schedEnabled = $true');
        scriptLines.push('            $nextTime = $maint.next_scheduled_time');
        scriptLines.push('            $immediate = $maint.immediate_maintenance_scheduled');
        scriptLines.push('            $logoffPolicy = $maint.logoff_policy');
        scriptLines.push('            $stopOnFirstError = $maint.stop_on_first_error');
        scriptLines.push('            $rec = $maint.recurring_maintenance_settings');
        scriptLines.push('            if ($rec) {');
        scriptLines.push('                $startTime = $rec.start_time');
        scriptLines.push('                $period = $rec.maintenance_period');
        scriptLines.push('                $dayIndex = $rec.start_index');
        scriptLines.push('                $freq = $rec.maintenance_period_frequency');
        scriptLines.push('            }');
        scriptLines.push('        }');
        scriptLines.push('    }');
        scriptLines.push('');
        scriptLines.push('    $nextLocal = $null;');
        scriptLines.push('    if ($nextTime) {');
        scriptLines.push('        try { $nextLocal = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$nextTime).LocalDateTime } catch { $nextLocal = $nextTime }');
        scriptLines.push('    }');
        scriptLines.push('');
        scriptLines.push('    $dayName = $null;');
        scriptLines.push('    if ($period -eq "WEEKLY" -and $dayIndex -ne $null) {');
        scriptLines.push('        $days = @("Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday")');
        scriptLines.push('        if ($dayIndex -ge 0 -and $dayIndex -lt $days.Count) { $dayName = $days[$dayIndex] }');
        scriptLines.push('    }');
        scriptLines.push('');
        scriptLines.push('    $rows += [PSCustomObject]@{');
        scriptLines.push('        FarmName           = $farmName');
        scriptLines.push('        Type               = $type');
        scriptLines.push('        Source             = $source');
        scriptLines.push('        RestartEnabled     = $schedEnabled');
        scriptLines.push('        NextScheduledLocal = $nextLocal');
        scriptLines.push('        Period             = $period');
        scriptLines.push('        Frequency          = $freq');
        scriptLines.push('        DayOfWeek          = $dayName');
        scriptLines.push('        StartTime          = $startTime');
        scriptLines.push('        LogoffPolicy       = $logoffPolicy');
        scriptLines.push('        StopOnFirstError   = $stopOnFirstError');
        scriptLines.push('        Immediate          = $immediate');
        scriptLines.push('    }');
        scriptLines.push('}');
        scriptLines.push('$response = $rows');
    }
    scriptLines.push('');
    if (action === 'imageDates') {
        scriptLines.push('Write-Host "[DEBUG] Step 13: Saving main JSON and building HTML..." -ForegroundColor Magenta');
    }
    scriptLines.push('# --- Save JSON ---');
    scriptLines.push('$response | ConvertTo-Json -Depth 8 | Out-File -FilePath $OutJson -Encoding UTF8');
    scriptLines.push('Write-Host "Saved JSON to $OutJson" -ForegroundColor Green');
    scriptLines.push('');
    if (action === 'imageDates') {
        scriptLines.push('Write-Host "[DEBUG] Step 14: Building HTML report..." -ForegroundColor Magenta');
    }
    scriptLines.push('# --- Build simple HTML report ---');
    scriptLines.push('$style = @\'');
    scriptLines.push('body{font-family:Segoe UI,Arial,sans-serif;margin:20px;}');
    scriptLines.push('h1{color:#1a365d;font-size:24px;margin-bottom:8px;}');
    scriptLines.push('table{border-collapse:collapse;width:100%;font-size:12px;}');
    scriptLines.push('th,td{border:1px solid #ddd;padding:8px;}');
    scriptLines.push('th{background:#f4f6f8;text-align:left;}');
    scriptLines.push('tr:nth-child(even){background:#fafafa;}');
    scriptLines.push('.ok{color:#0a7f2e;font-weight:700;}');
    scriptLines.push('.fail{color:#b00020;font-weight:700;}');
    scriptLines.push('input[type=text]{padding:4px;font-size:11px;}');
    scriptLines.push('\'@');
    if (action === 'discovery') {
        scriptLines.push('$rowsForHtml = $response | ForEach-Object {');
        scriptLines.push('    $statusClass = "fail";');
        scriptLines.push('    if ($_.StatusCode -eq 200 -or $_.StatusCode -eq 204) { $statusClass = "ok" }');
        scriptLines.push('    $statusVal = $_.StatusCode; if (-not $statusVal) { $statusVal = "n/a" }');
        scriptLines.push('    [pscustomobject]@{');
        scriptLines.push('        Endpoint   = $_.Endpoint');
        scriptLines.push('        StatusCode = "<span class=\"" + $statusClass + "\">" + $statusVal + "</span>"');
        scriptLines.push('        Items      = $_.Items');
        scriptLines.push('        UsedAlt    = $_.UsedAlt');
        scriptLines.push('        Error      = $_.Error');
        scriptLines.push('    }');
        scriptLines.push('}');
        scriptLines.push('$html = $rowsForHtml | ConvertTo-Html -PreContent "<h2>${cfg.name}</h2><p>${cfg.desc}</p>" -Head "<style>$style</style>" -As Table');
    } else if (action === 'clones') {
        scriptLines.push('$cols = @("FarmName","GoldenImage","Snapshot","CloneStatus","Progress","Error")');
        scriptLines.push('$tab = $response | ConvertTo-Html -Property $cols -Fragment');
        scriptLines.push('$pre = "<h1>HZ Farm Master Image Report</h1><p>Filter by typing in the boxes below each column header.</p>"');
        scriptLines.push('$filterScript = @\'');
        scriptLines.push('<script>');
        scriptLines.push('(function(){');
        scriptLines.push('  var t=document.querySelector("table");if(!t)return;');
        scriptLines.push('  var h=t.querySelector("tr");if(!h)return;');
        scriptLines.push('  var fr=document.createElement("tr");');
        scriptLines.push('  for(var i=0;i<h.cells.length;i++){');
        scriptLines.push('    var td=document.createElement("td");');
        scriptLines.push('    td.style.padding="4px";td.style.background="#e8eef4";');
        scriptLines.push('    var inp=document.createElement("input");');
        scriptLines.push('    inp.type="text";inp.placeholder="Filter...";inp.style.width="100%";');
        scriptLines.push('    inp.dataset.col=i;');
        scriptLines.push('    inp.oninput=function filterRows(){');
        scriptLines.push('      var fs=document.querySelectorAll("input[data-col]");');
        scriptLines.push('      var rows=t.querySelectorAll("tr");');
        scriptLines.push('      for(var i=2;i<rows.length;i++){');
        scriptLines.push('        var r=rows[i],show=true;');
        scriptLines.push('        for(var c=0;c<fs.length;c++){');
        scriptLines.push('          var v=(fs[c].value||"").toLowerCase();');
        scriptLines.push('          if(v&&r.cells[c]&&r.cells[c].textContent.toLowerCase().indexOf(v)===-1){show=false;break;}');
        scriptLines.push('        }');
        scriptLines.push('        r.style.display=show?"":"none";');
        scriptLines.push('      }');
        scriptLines.push('    };');
        scriptLines.push('    td.appendChild(inp);fr.appendChild(td);');
        scriptLines.push('  }');
        scriptLines.push('  t.insertBefore(fr,h.nextSibling);');
        scriptLines.push('})();');
        scriptLines.push('</script>');
        scriptLines.push('\'@');
        scriptLines.push('$html = "<!DOCTYPE html><html><head><meta charset=`"utf-8`"/><style>$style</style></head><body>"+$pre+$tab+$filterScript+"</body></html>"');
    } else if (action === 'imageDates') {
        scriptLines.push('$cols = @("HzFarm","HzBaseImage","HzSnapshot","VmMasterImage","VmMasterSnapshot","VmSnapshotTimestamp","CloneState")');
        scriptLines.push('$tab = $response | ConvertTo-Html -Property $cols -Fragment');
        scriptLines.push('$pre = "<h1>Farm Report</h1><p>HZ Farm + VMware image and snapshot data. Click a column header to sort. Click again to toggle ascending/descending.</p>"');
        scriptLines.push('$sortScript = @\'');
        scriptLines.push('<script>');
        scriptLines.push('(function(){');
        scriptLines.push('  var t=document.querySelector("table");if(!t)return;');
        scriptLines.push('  var h=t.querySelector("tr");if(!h)return;');
        scriptLines.push('  var dir=1;var lastCol=-1;');
        scriptLines.push('  for(var i=0;i<h.cells.length;i++){');
        scriptLines.push('    var th=h.cells[i];');
        scriptLines.push('    th.style.cursor="pointer";th.style.userSelect="none";');
        scriptLines.push('    th.title="Click to sort";');
        scriptLines.push('    (function(col){');
        scriptLines.push('      th.onclick=function(){');
        scriptLines.push('        if(lastCol===col){dir=-dir;}else{dir=1;lastCol=col;}');
        scriptLines.push('        var rows=Array.prototype.slice.call(t.querySelectorAll("tr"),1);');
        scriptLines.push('        rows.sort(function(a,b){');
        scriptLines.push('          var va=(a.cells[col]&&a.cells[col].textContent)||"";');
        scriptLines.push('          var vb=(b.cells[col]&&b.cells[col].textContent)||"";');
        scriptLines.push('          var na=!isNaN(parseFloat(va))&&isFinite(va);');
        scriptLines.push('          var nb=!isNaN(parseFloat(vb))&&isFinite(vb);');
        scriptLines.push('          if(na&&nb){return dir*(parseFloat(va)-parseFloat(vb));}');
        scriptLines.push('          return dir*(String(va).localeCompare(vb));');
        scriptLines.push('        });');
        scriptLines.push('        var container=rows[0]?rows[0].parentNode:t;');
        scriptLines.push('        rows.forEach(function(r){container.appendChild(r);});');
        scriptLines.push('      };');
        scriptLines.push('    })(i);');
        scriptLines.push('  }');
        scriptLines.push('})();');
        scriptLines.push('</script>');
        scriptLines.push('\'@');
        scriptLines.push('$html = "<!DOCTYPE html><html><head><meta charset=`"utf-8`"/><style>$style</style></head><body>"+$pre+$tab+$sortScript+"</body></html>"');
    } else if (action === 'restarts') {
        scriptLines.push('$cols = @("FarmName","RestartEnabled","NextScheduledLocal","Period","DayOfWeek","StartTime","Frequency","LogoffPolicy","Immediate","Type","Source")');
        scriptLines.push('$tab = $response | ConvertTo-Html -Property $cols -Fragment');
        scriptLines.push('$pre = "<h1>HZ Farm Restart Schedule</h1><p>Per-farm instant clone maintenance / restart schedule (local time).</p>"');
        scriptLines.push('$html = "<!DOCTYPE html><html><head><meta charset=`"utf-8`"/><style>$style</style></head><body>"+$pre+$tab+"</body></html>"');
    } else {
        scriptLines.push('$html = $response | ConvertTo-Html -PreContent "<h2>${cfg.name}</h2><p>${cfg.desc}</p>" -Head "<style>$style</style>"');
    }
    scriptLines.push('$html | Out-File -FilePath $OutHtml -Encoding UTF8');
    scriptLines.push('Write-Host "Saved HTML to $OutHtml" -ForegroundColor Green');
    scriptLines.push('');
    if (action === 'imageDates') {
        scriptLines.push('Write-Host "[DEBUG] Step 15: Opening HTML in browser..." -ForegroundColor Magenta');
    }
    scriptLines.push('# Auto-launch HTML report');
    scriptLines.push('try { Start-Process $OutHtml } catch { Write-Warning "Could not open HTML automatically: $($_.Exception.Message)" }');
    scriptLines.push('');
    if (action === 'imageDates') {
        scriptLines.push('Write-Host "[DEBUG] Step 16: Image Dates complete." -ForegroundColor Green');
    }
    scriptLines.push('Write-Host "Done." -ForegroundColor Cyan');

    const script = scriptLines.join('\n');
    const out = document.getElementById('adminScriptContent');
    if (out) out.value = script;
}

function copyAdminScript() {
    const area = document.getElementById('adminScriptContent');
    if (!area) return;
    area.select();
    document.execCommand('copy');
}

function downloadAdminScript() {
    const scriptContent = document.getElementById('adminScriptContent')?.value || '';
    const blob = new Blob([scriptContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Horizon-Admin.ps1';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// VM MGMT TAB
// ─────────────────────────────────────────────────────────────────────────────

let vmMgmtVmNames = [];  // All VM names parsed from the loaded file
let vmMgmtSelected = new Set();

// Toggle between Delete VMs / FSLogix sub-sections
function showVmMgmtSection(section) {
    document.getElementById('vmMgmtDeleteVms').style.display = section === 'deleteVms' ? 'block' : 'none';
    document.getElementById('vmMgmtFslogix').style.display   = section === 'fslogix'    ? 'block' : 'none';
    document.getElementById('vmMgmtBtnDelete').className  = section === 'deleteVms' ? 'btn btn-primary'   : 'btn btn-secondary';
    document.getElementById('vmMgmtBtnFslogix').className = section === 'fslogix'    ? 'btn btn-primary'   : 'btn btn-secondary';
}

// ── Delete VMs ────────────────────────────────────────────────────────────────

function vmMgmtLoadVmFile() {
    document.getElementById('vmMgmtFileInput').click();
}

function vmMgmtHandleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    document.getElementById('vmMgmtFileLabel').textContent = `Loaded: ${file.name}`;

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result || '';
        let names = [];

        const lower = file.name.toLowerCase();
        if (lower.endsWith('.json')) {
            try {
                const obj = JSON.parse(text);
                // Accept an array of strings or an array of objects with a Name/VMName field
                const arr = Array.isArray(obj) ? obj : (obj.VMs || obj.vms || obj.names || []);
                names = arr.map(i => (typeof i === 'string' ? i : (i.Name || i.VMName || i.name || '')))
                           .filter(Boolean);
            } catch (err) {
                alert('Could not parse JSON file: ' + err.message);
                return;
            }
        } else {
            // txt / csv: one name per line; strip BOM, blank lines, comments
            names = text.split(/\r?\n/)
                        .map(l => l.replace(/^\uFEFF/, '').split(/[,\t]/)[0].trim())
                        .filter(l => l && !l.startsWith('#'));
        }

        if (!names.length) {
            alert('No VM names found in the file.');
            return;
        }

        vmMgmtVmNames = names;
        vmMgmtSelected = new Set(names);  // all selected by default
        vmMgmtRenderList();
        document.getElementById('vmMgmtVmListSection').style.display = 'block';
        document.getElementById('vmMgmtDeleteScriptSection').style.display = 'none';
    };
    reader.readAsText(file, 'utf-8');
}

function vmMgmtRenderList() {
    const container = document.getElementById('vmMgmtVmList');
    const countEl   = document.getElementById('vmMgmtVmCount');
    if (!container) return;

    countEl.textContent = `${vmMgmtVmNames.length} VM(s) — ${vmMgmtSelected.size} selected`;

    container.innerHTML = vmMgmtVmNames.map(name => {
        const checked = vmMgmtSelected.has(name) ? 'checked' : '';
        const safe    = name.replace(/'/g, "\\'");
        return `<div style="padding:4px 0;border-bottom:1px solid #eee;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                <input type="checkbox" ${checked} onchange="vmMgmtToggle('${safe}', this.checked)">
                <span style="font-family:'Courier New',monospace;">${escapeHtml(name)}</span>
            </label>
        </div>`;
    }).join('');
}

function vmMgmtToggle(name, checked) {
    if (checked) vmMgmtSelected.add(name);
    else vmMgmtSelected.delete(name);
    document.getElementById('vmMgmtVmCount').textContent =
        `${vmMgmtVmNames.length} VM(s) — ${vmMgmtSelected.size} selected`;
}

function vmMgmtSelectAll() {
    vmMgmtVmNames.forEach(n => vmMgmtSelected.add(n));
    vmMgmtRenderList();
}

function vmMgmtDeselectAll() {
    vmMgmtSelected.clear();
    vmMgmtRenderList();
}

function vmMgmtGenerateDeleteScript() {
    const selected = vmMgmtVmNames.filter(n => vmMgmtSelected.has(n));
    if (!selected.length) {
        alert('Please select at least one VM.');
        return;
    }

    const vmList = selected.map(n => `    "${n}"`).join(',\n');
    const script = `# Delete-VMs.ps1
# Deletes selected VMware VMs from vCenter
# Generated by LAB007 VM Mgmt - ${new Date().toLocaleString()}
# Total VMs to delete: ${selected.length}
#
# CAUTION: This script permanently removes VMs. Run with -WhatIf first.

param(
    [switch]$WhatIf
)

# List of VMs to delete
$VMsToDelete = @(
${vmList}
)

# ── Import VMware PowerCLI ──────────────────────────────────────────────────
Import-Module VMware.PowerCLI -ErrorAction Stop
Set-PowerCLIConfiguration -InvalidCertificateAction Ignore -Confirm:$false -Scope Session | Out-Null

# ── Connect to vCenter ──────────────────────────────────────────────────────
$vCenter = Read-Host "Enter vCenter Server name or IP"
$cred    = Get-Credential -Message "Enter vCenter credentials"
Connect-VIServer -Server $vCenter -Credential $cred -ErrorAction Stop | Out-Null
Write-Host "Connected to $vCenter" -ForegroundColor Green

# ── Process deletions ───────────────────────────────────────────────────────
$results = @()
$total   = $VMsToDelete.Count
$idx     = 0

foreach ($vmName in $VMsToDelete) {
    $idx++
    Write-Host ""
    Write-Host "[$idx/$total] Processing: $vmName" -ForegroundColor Cyan

    $vm = Get-VM -Name $vmName -ErrorAction SilentlyContinue
    if (-not $vm) {
        Write-Warning "  VM not found: $vmName"
        $results += [PSCustomObject]@{ VM = $vmName; Status = "Not Found"; Error = "" }
        continue
    }

    if ($WhatIf) {
        Write-Host "  WHATIF: Would power off and delete $vmName (State: $($vm.PowerState))" -ForegroundColor Yellow
        $results += [PSCustomObject]@{ VM = $vmName; Status = "WhatIf"; Error = "" }
        continue
    }

    try {
        # Power off if running
        if ($vm.PowerState -ne "PoweredOff") {
            Write-Host "  Powering off $vmName ..." -ForegroundColor Yellow
            Stop-VM -VM $vm -Confirm:$false -ErrorAction Stop | Out-Null
            Write-Host "  Powered off." -ForegroundColor DarkGreen
        }

        # Remove VM (delete from disk)
        Write-Host "  Deleting $vmName from datastore..." -ForegroundColor Yellow
        Remove-VM -VM $vm -DeletePermanently -Confirm:$false -ErrorAction Stop
        Write-Host "  DELETED: $vmName" -ForegroundColor Green
        $results += [PSCustomObject]@{ VM = $vmName; Status = "Deleted"; Error = "" }
    }
    catch {
        Write-Error "  FAILED: $vmName - $($_.Exception.Message)"
        $results += [PSCustomObject]@{ VM = $vmName; Status = "Failed"; Error = $_.Exception.Message }
    }
}

# ── Summary ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Delete Summary" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
$results | ForEach-Object {
    $colour = switch ($_.Status) {
        "Deleted"   { "Green" }
        "Not Found" { "Yellow" }
        "Failed"    { "Red" }
        default     { "Gray" }
    }
    Write-Host "  $($_.VM) -> $($_.Status)" -ForegroundColor $colour
}

Disconnect-VIServer -Server $vCenter -Confirm:$false -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "Done." -ForegroundColor Green
`;

    document.getElementById('vmMgmtDeleteScript').value = script;
    document.getElementById('vmMgmtDeleteScriptSection').style.display = 'block';
    document.getElementById('vmMgmtDeleteScriptSection')
            .scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── FSLogix Profiles ──────────────────────────────────────────────────────────

function fslogixGenerateScript() {
    const path = (document.getElementById('fslogixPath')?.value || '').trim();
    const days = parseInt(document.getElementById('fslogixDays')?.value || '90', 10) || 90;
    const mode = document.querySelector('input[name="fslogixMode"]:checked')?.value || 'report';

    if (!path) {
        alert('Please enter the FSLogix profile share path.');
        return;
    }

    const isDelete   = mode === 'delete';
    const scriptName = isDelete ? 'Delete-FSLogix-Profiles.ps1' : 'Report-FSLogix-Profiles.ps1';
    const modeLabel  = isDelete ? 'DELETE' : 'REPORT';
    const logName    = isDelete ? 'FSLogix-Delete-Log' : 'FSLogix-Report';

    const script = `# ${scriptName}
# FSLogix profile folder cleanup utility
# Mode: ${modeLabel}
# Path: ${path}
# Threshold: ${days} days old
# Generated by LAB007 VM Mgmt - ${new Date().toLocaleString()}

param(
    [string]$ProfileRoot = "${path.replace(/"/g, '""')}",
    [int]$AgeDays        = ${days}
)

$ErrorActionPreference = "Stop"

# ── Logging setup ─────────────────────────────────────────────────────────────
$timestamp  = Get-Date -Format "yyyyMMdd_HHmmss"
$logDir     = Split-Path $ProfileRoot -Parent
$logFile    = Join-Path $logDir "${logName}_$timestamp.txt"

function Write-Log {
    param([string]$Message, [string]$Colour = "White")
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Add-Content -Path $logFile -Value $line -Encoding UTF8
    Write-Host $line -ForegroundColor $Colour
}

# ── Validate path ─────────────────────────────────────────────────────────────
if (-not (Test-Path $ProfileRoot)) {
    Write-Error "Profile root not found: $ProfileRoot"
    exit 1
}

Write-Log "========================================"
Write-Log "FSLogix Profile Scan — Mode: ${modeLabel}"
Write-Log "Profile Root : $ProfileRoot"
Write-Log "Age Threshold: $AgeDays day(s)"
Write-Log "Log File     : $logFile"
Write-Log "========================================"

# ── Find folders older than threshold ─────────────────────────────────────────
$cutoff = (Get-Date).AddDays(-$AgeDays)

Write-Log "Scanning $ProfileRoot for folders last modified before $($cutoff.ToString('yyyy-MM-dd'))..."

$oldFolders = Get-ChildItem -Path $ProfileRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $cutoff }

if (-not $oldFolders -or $oldFolders.Count -eq 0) {
    Write-Log "No folders found older than $AgeDays days." "Green"
    Write-Log "Scan complete — nothing to ${isDelete ? 'delete' : 'report'}."
    exit 0
}

Write-Log "" "White"
Write-Log "Folders older than $AgeDays days ($($oldFolders.Count) found):" "Yellow"
foreach ($f in $oldFolders | Sort-Object LastWriteTime) {
    Write-Log ("  {0,-60} Last Modified: {1}" -f $f.FullName, $f.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")) "Yellow"
}
Write-Log ""
${isDelete ? `
# ── DELETE mode ──────────────────────────────────────────────────────────────
Write-Log "Report saved. Prompting for confirmation..."

$answer = Read-Host "Are you sure you want to delete $($oldFolders.Count) folder(s) and all their contents? (Y/N)"
if ($answer -notmatch "^[Yy]$") {
    Write-Log "Deletion cancelled by user." "Cyan"
    exit 0
}

Write-Log "Proceeding with deletion of $($oldFolders.Count) folder(s)..." "Cyan"
$deleted = 0
$errors  = 0

foreach ($f in $oldFolders) {
    try {
        Remove-Item -Path $f.FullName -Recurse -Force -ErrorAction Stop
        Write-Log "  DELETED: $($f.FullName)" "Green"
        $deleted++
    }
    catch {
        Write-Log "  ERROR deleting $($f.FullName): $($_.Exception.Message)" "Red"
        $errors++
    }
}

Write-Log ""
Write-Log "========================================"
Write-Log "Deletion complete. Deleted: $deleted  Errors: $errors" $(if ($errors -gt 0) { "Yellow" } else { "Green" })
Write-Log "Log saved to: $logFile"
Write-Log "========================================"
` : `
# ── REPORT mode — no deletions performed ─────────────────────────────────────
Write-Log "========================================"
Write-Log "REPORT ONLY — no folders were deleted."
Write-Log "Total folders eligible for deletion: $($oldFolders.Count)"
Write-Log "To delete, re-run in Delete mode."
Write-Log "Log saved to: $logFile"
Write-Log "========================================"
`}
`;

    document.getElementById('fslogixScript').value = script;
    document.getElementById('fslogixScriptSection').style.display = 'block';

    // Update download button filename
    const dlBtn = document.getElementById('fslogixDownloadBtn');
    if (dlBtn) dlBtn.setAttribute('onclick', `vmMgmtDownloadScript('fslogixScript','${scriptName}')`);

    document.getElementById('fslogixScriptSection')
            .scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function vmMgmtCopyScript(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.select();
    document.execCommand('copy');
    const orig = el.value;
    el.value = '// Copied to clipboard!';
    setTimeout(() => { el.value = orig; }, 1500);
}

function vmMgmtDownloadScript(elementId, filename) {
    const content = document.getElementById(elementId)?.value || '';
    const blob = new Blob([content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────

function copyGoldenSunSearchScript() {
    const area = document.getElementById('goldenSunSearchScriptContent');
    if (!area) return;
    area.select();
    document.execCommand('copy');
}

function downloadGoldenSunSearchScript() {
    const scriptContent = document.getElementById('goldenSunSearchScriptContent')?.value || '';
    const blob = new Blob([scriptContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'GoldenSun-Master-Search.ps1';
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

            # Parse VM name to extract base name and version (e.g. SHC-M-MAIN-T-V4, SHC-M-MAIN-TV3)
            $vmName = $vm.Name
            $baseName = $vmName
            $clusterName = if ($cluster) { $cluster.Name } else { 'Unknown' }
            $version = ''
            $versionNum = 0

            # Extract version if present: -V4, V4, V10 at end of name
            if ($vmName -match '^(.+?)(-?[Vv](\d+))$') {
                $baseName = $matches[1].TrimEnd('-')
                $version = $matches[2]
                $versionNum = [int]$matches[3]
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
                ShortName = $baseName
                BaseName = $baseName
                Version = $version
                VersionNum = $versionNum
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

        # Keep only the latest version per base name (e.g. SHC-M-MAIN-T, SHC-M-MAIN-TV3, SHC-M-MAIN-T-V4 -> only SHC-M-MAIN-T-V4)
        $grouped = $masterImages | Group-Object -Property BaseName
        $masterImages = @()
        foreach ($grp in $grouped) {
            $latest = $grp.Group | Sort-Object -Property VersionNum -Descending | Select-Object -First 1
            $masterImages += $latest
            if ($grp.Count -gt 1) {
                Write-Host "  Kept latest: $($latest.Name) (from $($grp.Count) version(s) of $($latest.BaseName))" -ForegroundColor Cyan
            }
        }
        Write-Host "Output: $($masterImages.Count) latest-version image(s)" -ForegroundColor Green
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
        let str;
        try {
            str = typeof value === 'string' ? value : JSON.stringify(value);
        } catch (e) {
            str = String(value ?? '');
        }
        if (typeof str !== 'string') {
            str = String(value ?? '');
        }
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
    try {
        if (text === null || text === undefined) return 'N/A';
        const str = '' + text; // force string
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    } catch (e) {
        console.warn('escapeHtml fallback', text, e);
        return 'N/A';
    }
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
        if (location.protocol === 'file:') {
            console.warn('Skipping config load for clone fields (file://)');
            return;
        }
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

async function renderGoldenSunFarmReport() {
    const status = document.getElementById('goldenSunFarmStatus');
    const list = document.getElementById('goldenSunFarmList');
    const framePlaceholder = document.getElementById('goldenSunFarmFramePlaceholder');
    const masterPanel = document.getElementById('goldenSunFarmMasterPanel');
    if (!list) return;

    if (!farmReportRows.length) {
        // Try loading FarmData.json from possible base paths (server mode)
        const candidates = ['/citrix/Reports/FarmData.json', '/Reports/FarmData.json', '/citrix/FarmData.json', '/FarmData.json'];
        let data = null;
        let basePath = null;
        for (const url of candidates) {
            try {
                const res = await fetch(url, { cache: 'no-cache' });
                if (res.ok) {
                    data = await res.json();
                    basePath = url.replace(/FarmData\.json$/i, '');
                    break;
                }
            } catch (e) {
                console.warn('Farm report fetch failed for', url, e);
            }
        }
        if (!data) {
            list.innerHTML = '<p style="color:#666;">FarmData.json not found via HTTP. You can either run the Horizon Admin Image Dates script on this server, or load a local JSON file with the \"Load FarmData.json (file)\" button.</p>';
            if (status) status.textContent = '';
            if (framePlaceholder) framePlaceholder.style.display = 'block';
            if (masterPanel) masterPanel.style.display = 'none';
            return;
        }
        // Normalize to array
        farmReportRows = Array.isArray(data) ? data : (data.rows || data.Farms || []);
        if (!Array.isArray(farmReportRows)) {
            farmReportRows = [];
        }
        // When loading via HTTP, just hide the placeholder once data exists
        if (framePlaceholder) framePlaceholder.style.display = 'none';
    }

    if (!farmReportRows.length) {
        list.innerHTML = '<p style="color:#666;">No farm rows found in FarmData.json.</p>';
        if (status) status.textContent = '';
        if (framePlaceholder) framePlaceholder.style.display = 'block';
        if (masterPanel) masterPanel.style.display = 'none';
        return;
    }

    // Filter to automated farms only; exclude MANUAL type and "(Manual farm)" placeholder images
    const visibleRows = farmReportRows.filter(r => {
        if (r.HzFarmType && r.HzFarmType.toUpperCase() !== 'AUTOMATED') return false;
        if ((r.HzBaseImage || '').trim() === '(Manual farm)') return false;
        return r.VmMasterImage || r.HzBaseImage || r.HzFarm;
    });

    let html = '';
    if (visibleRows.length) {
        html = `
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
                <tr style="background:#f0f0f0;border-bottom:2px solid #ccc;">
                    <th style="width:28px;padding:6px 4px;"></th>
                    <th style="padding:6px 10px;text-align:left;font-weight:600;white-space:nowrap;">Farm / Pool</th>
                    <th style="padding:6px 10px;text-align:left;font-weight:600;white-space:nowrap;">Type</th>
                    <th style="padding:6px 10px;text-align:left;font-weight:600;white-space:nowrap;">Image</th>
                    <th style="padding:6px 10px;text-align:left;font-weight:600;white-space:nowrap;">Snapshot</th>
                    <th style="padding:6px 10px;text-align:left;font-weight:600;white-space:nowrap;">State</th>
                </tr>
            </thead>
            <tbody>`;

        visibleRows.forEach((row) => {
            const key = row.VmMasterImage || row.HzBaseImage || row.HzFarm || '';
            if (!key) return;
            const checked = farmSelectedMasters.has(key) ? 'checked' : '';
            const safeKey = String(key).replace(/'/g, "\\'");

            const farmName = escapeHtml(row.HzFarm || '');
            const isDesktop = (row.HzSourceType || '').toLowerCase() === 'desktop';
            const typeBadge = isDesktop
                ? '<span style="font-size:10px;background:#e3f0ff;color:#1a5fa8;border-radius:3px;padding:1px 5px;font-weight:600;">VDI</span>'
                : '<span style="font-size:10px;background:#e8f5e9;color:#2e7d32;border-radius:3px;padding:1px 5px;font-weight:600;">RDS</span>';
            // Strip folder path — keep only the segment after the last /
            const rawImage = row.VmMasterImage || row.HzBaseImage || '';
            const imageName = escapeHtml(rawImage.replace(/^.*\//, ''));
            const rawSnap = row.HzSnapshot || row.VmMasterSnapshot || '';
            const snapName = escapeHtml(rawSnap.replace(/^.*\//, '') + (row.VmSnapshotTimestamp ? ' @ ' + row.VmSnapshotTimestamp : ''));
            const cloneState = escapeHtml(row.CloneState || 'Not cloned');
            const stateStyle = row.CloneState ? 'color:#0a7f2e;font-weight:600;' : 'color:#999;';

            html += `
                <tr style="border-bottom:1px solid #eee;cursor:pointer;"
                    onmouseover="this.style.background='#f0f6ff'" onmouseout="this.style.background=''">
                    <td style="padding:8px 4px;text-align:center;">
                        <input type="checkbox" ${checked} onchange="toggleFarmMasterSelection('${safeKey}')">
                    </td>
                    <td style="padding:8px 10px;font-weight:600;">${farmName}</td>
                    <td style="padding:8px 10px;">${typeBadge}</td>
                    <td style="padding:8px 10px;">${imageName}</td>
                    <td style="padding:8px 10px;color:#555;">${snapName}</td>
                    <td style="padding:8px 10px;${stateStyle}">${cloneState}</td>
                </tr>`;
        });

        html += '</tbody></table>';
    } else {
        html = '<p style="color:#666;">No automated farm rows found in FarmData.json.</p>';
    }

    list.innerHTML = html;
    if (status) {
        const farmCount = visibleRows.filter(r => (r.HzSourceType || '').toLowerCase() !== 'desktop').length;
        const desktopCount = visibleRows.filter(r => (r.HzSourceType || '').toLowerCase() === 'desktop').length;
        status.textContent = `${visibleRows.length} automated pool(s): ${farmCount} RDS farm(s), ${desktopCount} VDI desktop pool(s). Selected: ${farmSelectedMasters.size}.`;
    }
    if (masterPanel) {
        masterPanel.style.display = visibleRows.length ? 'block' : 'none';
    }
}

function handleGoldenSunFarmFilePick(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = String(e.target?.result || '');
            const obj = JSON.parse(text || '{}');
            let rows = Array.isArray(obj) ? obj : (obj.rows || obj.Farms || []);
            if (!Array.isArray(rows)) {
                rows = [];
            }
            farmReportRows = rows;
            farmSelectedMasters.clear();

            const status = document.getElementById('goldenSunFarmStatus');
            if (status) {
                status.textContent = `Loaded ${farmReportRows.length} rows from ${file.name} (local file).`;
            }

            // When loading from file we don't have HTML; show placeholder instead of iframe
            const frame = document.getElementById('goldenSunFarmFrame');
            const framePlaceholder = document.getElementById('goldenSunFarmFramePlaceholder');
            const masterPanel = document.getElementById('goldenSunFarmMasterPanel');
            if (frame) frame.style.display = 'none';
            if (framePlaceholder) framePlaceholder.style.display = 'block';
            if (masterPanel) masterPanel.style.display = farmReportRows.length ? 'block' : 'none';

            renderGoldenSunFarmReport();
        } catch (err) {
            console.error('Failed to parse FarmData.json from file:', err);
            const list = document.getElementById('goldenSunFarmList');
            if (list) {
                list.innerHTML = '<p style="color:#b00020;">Failed to parse JSON file. Ensure it is a valid FarmData.json.</p>';
            }
        }
    };
    reader.readAsText(file, 'utf-8');
}

function toggleFarmMasterSelection(name) {
    if (!name) return;
    if (farmSelectedMasters.has(name)) {
        farmSelectedMasters.delete(name);
    } else {
        farmSelectedMasters.add(name);
    }
    renderGoldenSunFarmReport();
}

function goldenSunFarmSelectAll() {
    farmSelectedMasters.clear();
    farmReportRows.forEach(row => {
        if (row.HzFarmType && row.HzFarmType.toUpperCase() !== 'AUTOMATED') return;
        if ((row.HzBaseImage || '').trim() === '(Manual farm)') return;
        const key = row.VmMasterImage || row.HzBaseImage || row.HzFarm || '';
        if (key) farmSelectedMasters.add(key);
    });
    renderGoldenSunFarmReport();
}

function goldenSunFarmDeselectAll() {
    farmSelectedMasters.clear();
    renderGoldenSunFarmReport();
}

function generateFarmCloneScriptFromReport() {
    if (farmSelectedMasters.size === 0) {
        alert('Please select at least one VMware master image in the Farm Report.');
        return;
    }
    const selectedImages = [];
    const seenKeys = new Set();
    farmReportRows.forEach(row => {
        const key = row.VmMasterImage || row.HzBaseImage || row.HzFarm || '';
        if (key && farmSelectedMasters.has(key) && !seenKeys.has(key)) {
            seenKeys.add(key);
            selectedImages.push({
                Name: key,
                Cluster: row.Cluster || 'Unknown',
                Host: row.Host || 'Unknown',
                Datastore: row.Datastore || 'Unknown'
            });
        }
    });
    if (!selectedImages.length) {
        alert('No valid VMware master images found for selection.');
        return;
    }

    // Reuse GoldenSun clone configuration inputs
    const enableVMwareFolders = document.getElementById('goldenSunVmwareToggle')?.checked || false;
    const destinationFolder = enableVMwareFolders ? (document.getElementById('goldenSunDestinationFolder')?.value || '').trim() : '';
    const moveSourceAfterClone = enableVMwareFolders ? !!document.getElementById('goldenSunMoveSource')?.checked : false;
    const sourceMoveFolder = enableVMwareFolders ? (document.getElementById('goldenSunSourceFolder')?.value || '').trim() : '';
    const pushWindowsUpdate = document.getElementById('goldenSunPushWindowsUpdateToggle')?.checked !== false;

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

    const script = generateCloneScript(selectedImages, destinationFolder, moveSourceAfterClone, sourceMoveFolder, enableVMwareFolders, pushWindowsUpdate);
    const output = document.getElementById('goldenSunScriptContent');
    if (output) {
        output.value = script;
    }
    const wrapper = document.getElementById('goldenSunScriptOutput');
    if (wrapper) {
        wrapper.style.display = 'block';
    }
    // Switch to Clone tab so the user sees the script and can copy/download it
    showGoldenSunTab('clone');
    if (wrapper) {
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
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

// UAG Config Comparison Functions
let uagCompareConfigs = [];
let uagCompareFileNames = [];

document.addEventListener('DOMContentLoaded', function() {
    // Initialize UAG compare functionality
    const uagCompareFiles = document.getElementById('uagCompareFiles');
    const uagCompareBtn = document.getElementById('uagCompareBtn');

    if (uagCompareFiles) {
        uagCompareFiles.addEventListener('change', handleUagCompareFiles);
    }

    if (uagCompareBtn) {
        uagCompareBtn.addEventListener('click', performUagConfigComparison);
    }
});

function handleUagCompareFiles(event) {
    const files = event.target.files;
    if (files.length < 2) {
        setUagCompareStatus('Please select at least 2 config files to compare.', 'error');
        return;
    }

    uagCompareConfigs = [];
    uagCompareFileNames = [];

    Array.from(files).forEach(file => {
        uagCompareFileNames.push(file.name);
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const content = e.target.result;
                // Use a dedicated parser for compare to avoid clashing with the inline UAG modal parser
                const parsed = parseUagConfigForCompare(content);
                uagCompareConfigs.push(parsed);

                // Check if all files are loaded
                if (uagCompareConfigs.length === files.length) {
                    setUagCompareStatus(`Loaded ${files.length} config files successfully. Click "Compare Configs" to analyze differences.`, 'success');
                }
            } catch (error) {
                console.error('Error parsing config file:', error);
                setUagCompareStatus(`Error parsing ${file.name}: ${error.message}`, 'error');
            }
        };
        reader.readAsText(file);
    });
}

function tryParseJsonLoose(text) {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (_) {}
    const trimmed = String(text).trim();
    if (trimmed) {
        try { return JSON.parse(trimmed); } catch (_) {}
    }
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
        try { return JSON.parse(text.slice(first, last + 1)); } catch (_) {}
    }
    return null;
}

// Dedicated parser for the UAG Config Compare tab (does not touch the inline UAG modal parser in index.html)
function parseUagConfigForCompare(content) {
    const config = {};
    if (!content) return config;

    // Attach debug info so we can surface what we saw in the UI
    config._debug = {
        mode: 'unknown',
        topKeys: [],
        notes: []
    };

    // First, try to parse as JSON (raw UAG export)
    const jsonObj = tryParseJsonLoose(content);

    if (jsonObj && typeof jsonObj === 'object') {
        config._debug.mode = 'json';
        try {
            config._debug.topKeys = Object.keys(jsonObj || {});
        } catch (e) {
            config._debug.notes.push('Error reading top-level keys: ' + e.message);
        }

        const sys = jsonObj.systemSettings || {};
        const general = jsonObj.generalSettings || {};
        const edges = (jsonObj.edgeServiceSettingsList && jsonObj.edgeServiceSettingsList.edgeServiceSettingsList) || [];

        config._debug.notes.push(
            `hasSystem=${!!jsonObj.systemSettings}, hasGeneral=${!!jsonObj.generalSettings}, edgeCount=${Array.isArray(edges) ? edges.length : 0}`
        );

        // Basic identity
        if (general.uagName) config.uagName = general.uagName;
        else if (sys.uagName) config.uagName = sys.uagName;

        if (general.ip0) config.uagIp = general.ip0;
        else if (sys.ip0) config.uagIp = sys.ip0;

        // Core system / security knobs
        if (sys.cipherSuites) config.cipherSuites = sys.cipherSuites;
        if (sys.sslProvider) config.sslProvider = sys.sslProvider;
        if (sys.ipMode) config.ipMode = sys.ipMode;

        // DNS / AD
        if (sys.dns) {
            config.dnsServers = typeof sys.dns === 'string'
                ? sys.dns.split(/\s+/).filter(Boolean)
                : sys.dns;
        }
        const adServers = new Set();
        if (sys.dnsSearch) {
            config.dnsSearch = sys.dnsSearch;
            sys.dnsSearch.split(/\s+/).filter(Boolean).forEach(v => adServers.add(v));
        }
        const idpList = jsonObj.idPExternalMetadataSettingsList && jsonObj.idPExternalMetadataSettingsList.idPExternalMetadataSettingsList;
        if (Array.isArray(idpList)) {
            idpList.forEach(i => {
                if (i.entityID) adServers.add(i.entityID);
            });
        }
        if (adServers.size) config.adServers = Array.from(adServers);

        // Edge service (Horizon) details
        if (edges.length) {
            const e0 = edges[0];
            // Raw fields from first Horizon edge
            if (e0.proxyDestinationUrl) {
                config.connectionServerUrl = e0.proxyDestinationUrl;
                config.proxyDestinationUrl = e0.proxyDestinationUrl;
            }
            if (e0.proxyDestinationUrlThumbprints) {
                config.connectionServerThumbprint = e0.proxyDestinationUrlThumbprints;
            }
            if (e0.blastExternalUrl) {
                config.blastExternalUrl = e0.blastExternalUrl;
            }
            if (typeof e0.blastReverseConnectionEnabled === 'boolean') {
                config.blastReverseConnectionEnabled = e0.blastReverseConnectionEnabled;
            }
            if (e0.maxActiveBlastSessions != null) {
                const maxBlast = Number(e0.maxActiveBlastSessions);
                config.maxBlastConnections = maxBlast;
                config.maxActiveBlastSessions = maxBlast;
            }
        }

        // Gateways / external URLs
        const gateways = new Set();
        if (sys.allowedHostHeaderValues) {
            sys.allowedHostHeaderValues.split(/[, ]+/).filter(Boolean).forEach(v => gateways.add(v));
        }
        if (sys.autoAllowedHostHeaderValues) {
            sys.autoAllowedHostHeaderValues.split(/[, ]+/).filter(Boolean).forEach(v => gateways.add(v));
        }
        const externalUrls = new Set();
        const connServers = new Set();
        edges.forEach(e => {
            if (e.blastExternalUrl) {
                gateways.add(e.blastExternalUrl);
                externalUrls.add(e.blastExternalUrl);
            }
            if (e.tunnelExternalUrl) {
                gateways.add(e.tunnelExternalUrl);
                externalUrls.add(e.tunnelExternalUrl);
            }
            if (e.externalUrl) {
                gateways.add(e.externalUrl);
                externalUrls.add(e.externalUrl);
            }
            if (e.proxyDestinationUrl) connServers.add(e.proxyDestinationUrl);
            if (Array.isArray(e.originHeaderDetailsList)) {
                e.originHeaderDetailsList.forEach(o => {
                    if (o.origin) connServers.add(o.origin);
                });
            }
        });
        if (gateways.size) config.gateways = Array.from(gateways);
        if (externalUrls.size) config.externalUrls = Array.from(externalUrls);
        if (connServers.size) config.connectionServers = Array.from(connServers);

        // Certificates
        if (config.connectionServerThumbprint) {
            config.certificates = [config.connectionServerThumbprint];
        }

        // Security settings summary
        const secParts = [];
        if (sys.cipherSuites) secParts.push('cipherSuites=' + sys.cipherSuites);
        edges.forEach(e => {
            if (e.securityHeaders) {
                secParts.push('headers=' + Object.keys(e.securityHeaders).join(','));
            }
        });
        if (secParts.length) config.securitySettings = secParts.join(' | ');

        return config;
    }

    // Fallback: parse plain text summary using regex patterns
    const patterns = {
        'uagName': /UAG\s+Name[:\s]*([^\r\n]+)/i,
        'uagIp': /UAG\s+IP[:\s]*([^\r\n]+)/i,
        'connectionServerUrl': /Connection\s+Server[:\s]*([^\r\n]+)/i,
        'connectionServerThumbprint': /Connection\s+Server\s+Thumbprint[:\s]*([^\r\n]+)/i,
        'maxBlastConnections': /Max\s+Blast\s+Connections[:\s]*(\d+)/i,
        'gateways': /Gateways?:?\s*([^,\r\n]+(?:,[^,\r\n]+)*)/i,
        'externalUrls': /External\s+URLs?:?\s*([^,\r\n]+(?:,[^,\r\n]+)*)/i,
        'connectionServers': /Connection\s+Servers?:?\s*([^,\r\n]+(?:,[^,\r\n]+)*)/i,
        'dnsServers': /DNS\s+Servers?:?\s*([^,\r\n]+(?:,[^,\r\n]+)*)/i,
        'adServers': /AD\s+Servers?:?\s*([^,\r\n]+(?:,[^,\r\n]+)*)/i,
        'certificates': /Certificates?:?\s*([^,\r\n]+(?:,[^,\r\n]+)*)/i,
        'blastSettings': /Blast\s+Settings[:\s]*([^\r\n]+)/i,
        'tunnelSettings': /Tunnel\s+Settings[:\s]*([^\r\n]+)/i,
        'securitySettings': /Security\s+Settings[:\s]*([^\r\n]+)/i,
        'authenticationSettings': /Authentication\s+Settings[:\s]*([^\r\n]+)/i,
        'loadBalancerSettings': /Load\s+Balancer\s+Settings[:\s]*([^\r\n]+)/i
    };

    for (const [key, pattern] of Object.entries(patterns)) {
        const match = content.match(pattern);
        if (match) {
            config[key] = match[1].trim();
        }
    }

    const listFields = ['gateways', 'externalUrls', 'connectionServers', 'dnsServers', 'adServers', 'certificates'];
    listFields.forEach(field => {
        if (typeof config[field] === 'string') {
            config[field] = config[field].split(',').map(item => item.trim()).filter(item => item);
        }
    });

    if (config.maxBlastConnections) {
        config.maxBlastConnections = parseInt(config.maxBlastConnections);
    }

    config._debug.mode = 'text';
    config._debug.notes.push(
        'Text-mode matches: ' +
        Object.keys(patterns).filter(k => config[k] !== undefined).join(', ')
    );

    return config;
}

function performUagConfigComparison() {
    if (uagCompareConfigs.length < 2) {
        setUagCompareStatus('Please select at least 2 config files to compare.', 'error');
        return;
    }

    setUagCompareStatus('Comparing configurations...', 'loading');

    try {
        const comparison = compareUagConfigs(uagCompareConfigs, uagCompareFileNames);
        displayComparisonResults(comparison);

        setUagCompareStatus(`Comparison complete. Found ${comparison.differences.length} differences and ${comparison.identical.length} identical settings.`, 'success');
    } catch (error) {
        console.error('Comparison error:', error);
        setUagCompareStatus('Error during comparison: ' + error.message, 'error');
    }
}

function compareUagConfigs(configs, fileNames) {
    const differences = [];
    const identical = [];

    // Get all unique keys across all configs (skip internal/debug keys that start with "_")
    const allKeys = new Set();
    configs.forEach(config => {
        if (!config || typeof config !== 'object') return;
        Object.keys(config).forEach(key => {
            if (key && !key.startsWith('_')) {
                allKeys.add(key);
            }
        });
    });

    // Compare each key across all configs
    for (const key of allKeys) {
        const values = configs.map(config => config[key]);
        const uniqueValues = [...new Set(values.map(v => JSON.stringify(v)))];
        const concernLevel = getConcernLevel(key);

        if (uniqueValues.length > 1) {
            // Values differ - this is a difference
            differences.push({
                setting: key,
                values: values.map((value, index) => ({
                    file: fileNames[index],
                    value: value
                })),
                concernLevel: concernLevel
            });
        } else {
            // Values are identical
            identical.push({
                setting: key,
                value: values[0],
                files: fileNames.length
            });
        }
    }

    return { differences, identical };
}

function getConcernLevel(setting) {
    // Define concern levels for different settings
    const highConcern = ['connectionServerUrl', 'connectionServerThumbprint', 'uagIp', 'certificates', 'securitySettings'];
    const mediumConcern = ['maxBlastConnections', 'gateways', 'externalUrls', 'authenticationSettings'];
    const lowConcern = ['uagName', 'dnsServers', 'adServers', 'blastSettings', 'tunnelSettings', 'loadBalancerSettings'];

    const settingLower = setting.toLowerCase();

    if (highConcern.some(s => settingLower.includes(s.toLowerCase()))) {
        return 'High';
    } else if (mediumConcern.some(s => settingLower.includes(s.toLowerCase()))) {
        return 'Medium';
    } else if (lowConcern.some(s => settingLower.includes(s.toLowerCase()))) {
        return 'Low';
    } else {
        return 'Unknown';
    }
}

function displayComparisonResults(comparison) {
    const resultsDiv = document.getElementById('uagCompareResults');
    const diffsBody = document.getElementById('compareDiffsBody');
    const sameBody = document.getElementById('compareSameBody');
    const statFiles = document.getElementById('compareStatFiles');
    const statDiffs = document.getElementById('compareStatDiffs');
    const statSame = document.getElementById('compareStatSame');
    const summaryDetails = document.getElementById('uagCompareSummaryDetails');
    const hdrFile1 = document.getElementById('compareHeaderFile1');
    const hdrFile2 = document.getElementById('compareHeaderFile2');

    // Update stats
    statFiles.textContent = uagCompareFileNames.length;
    statDiffs.textContent = comparison.differences.length;
    statSame.textContent = comparison.identical.length;

    // Update column headers to show actual file names
    if (hdrFile1) hdrFile1.textContent = uagCompareFileNames[0] || 'File 1';
    if (hdrFile2) hdrFile2.textContent = uagCompareFileNames[1] || 'File 2';

    // We keep debug info in the config objects for console inspection only.
    // The UI summary area is intentionally left empty to avoid clutter above the tables.
    if (summaryDetails) {
        summaryDetails.innerHTML = '';
    }

    // Display differences
    if (comparison.differences.length > 0) {
        diffsBody.innerHTML = comparison.differences.map(diff => {
            const concernClass = diff.concernLevel === 'High' ? 'text-red-600' :
                               diff.concernLevel === 'Medium' ? 'text-orange-600' :
                               diff.concernLevel === 'Low' ? 'text-yellow-600' : 'text-gray-600';
            return `
                <tr>
                    <td><strong>${formatSettingName(diff.setting)}</strong></td>
                    <td>${formatValue(diff.values[0]?.value)}</td>
                    <td>${formatValue(diff.values[1]?.value)}</td>
                    <td><span class="${concernClass}" style="font-weight: bold;">${diff.concernLevel}</span></td>
                </tr>
            `;
        }).join('');
    } else {
        diffsBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #6c757d;">No differences found</td></tr>';
    }

    // Display identical items
    if (comparison.identical.length > 0) {
        sameBody.innerHTML = comparison.identical.map(item => `
            <tr>
                <td><strong>${formatSettingName(item.setting)}</strong></td>
                <td>${formatValue(item.value)}</td>
                <td>${item.files} files</td>
            </tr>
        `).join('');
    } else {
        sameBody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 40px; color: #6c757d;">No identical settings found</td></tr>';
    }

    resultsDiv.style.display = 'block';
}

function formatSettingName(setting) {
    // Convert camelCase to Title Case
    return setting
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

function formatValue(value) {
    if (Array.isArray(value)) {
        return value.length > 0 ? value.join(', ') : 'None';
    }
    if (value === null || value === undefined) {
        return 'Not set';
    }
    return String(value);
}

function setUagCompareStatus(message, type = '') {
    const statusEl = document.getElementById('uagCompareStatus');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.style.color = type === 'error' ? '#dc3545' :
                             type === 'success' ? '#28a745' :
                             type === 'loading' ? '#4a90e2' : '#6c757d';
        statusEl.style.fontWeight = type === 'error' || type === 'success' ? 'bold' : 'normal';
    }
}

