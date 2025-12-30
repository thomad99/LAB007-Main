const fileInput = document.getElementById('fileInput');
const uploadBox = document.getElementById('uploadBox');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const removeFile = document.getElementById('removeFile');
const resultsSection = document.getElementById('resultsSection');
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const errorMessage = document.getElementById('errorMessage');
const previewSection = document.getElementById('previewSection');
const qualityDraftBtn = document.getElementById('qualityDraftBtn');
const qualityHighBtn = document.getElementById('qualityHighBtn');

let selectedFile = null;
let loadingStepInterval = null;
let qualityMode = 'draft'; // default
let currentQuoteData = null; // Store current quote data for order submission
let currentFileId = null; // Store file ID from upload response

// Debug logging
function addDebugLog(message, type = 'info') {
    const debugLog = document.getElementById('debugLog');
    if (!debugLog) return;
    
    const entry = document.createElement('p');
    entry.className = `debug-entry debug-${type}`;
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    debugLog.appendChild(entry);
    debugLog.scrollTop = debugLog.scrollHeight;
    
    console.log(`[DEBUG ${type.toUpperCase()}] ${message}`);
}

// Debug panel toggle
const debugToggle = document.getElementById('debugToggle');
const debugPanel = document.getElementById('debugPanel');
if (debugToggle && debugPanel) {
    debugToggle.addEventListener('click', () => {
        const content = document.querySelector('.debug-content');
        if (content.style.display === 'none') {
            content.style.display = 'block';
            debugToggle.textContent = 'Hide';
        } else {
            content.style.display = 'none';
            debugToggle.textContent = 'Show';
        }
    });
}

// Make debug function available globally
window.addDebugLog = addDebugLog;

// Check logo on page load
document.addEventListener('DOMContentLoaded', () => {
    const logo = document.querySelector('.logo');
    if (logo) {
        addDebugLog(`Logo source: ${logo.src}`);
        logo.addEventListener('load', () => {
            addDebugLog('Logo image loaded successfully', 'success');
        });
        logo.addEventListener('error', () => {
            addDebugLog(`Logo failed to load from: ${logo.src}`, 'error');
        });
    }
});

// Quality selectors
if (qualityDraftBtn && qualityHighBtn) {
    const setQualityMode = (mode) => {
        qualityMode = mode;
        if (mode === 'draft') {
            qualityDraftBtn.classList.add('active');
            qualityHighBtn.classList.remove('active');
        } else {
            qualityHighBtn.classList.add('active');
            qualityDraftBtn.classList.remove('active');
        }
        addDebugLog(`Quality mode set to: ${qualityMode}`);
        // Re-price if a file is already selected
        if (selectedFile) {
            addDebugLog('Recalculating quote for new quality mode...');
            uploadFile(selectedFile);
        }
    };

    qualityDraftBtn.addEventListener('click', () => setQualityMode('draft'));
    qualityHighBtn.addEventListener('click', () => setQualityMode('high'));
}

// Click to upload
uploadBox.addEventListener('click', () => {
    fileInput.click();
});

// File input change
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

// Drag and drop
uploadBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadBox.classList.add('dragover');
});

uploadBox.addEventListener('dragleave', () => {
    uploadBox.classList.remove('dragover');
});

uploadBox.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadBox.classList.remove('dragover');
    
    if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
});

// Remove file
removeFile.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    fileInfo.style.display = 'none';
    resultsSection.style.display = 'none';
    error.style.display = 'none';
    previewSection.style.display = 'none';
    if (typeof clear3DViewer === 'function') {
        clear3DViewer();
    }
    if (loadingStepInterval) {
        clearInterval(loadingStepInterval);
        loadingStepInterval = null;
    }
});

async function handleFile(file) {
    addDebugLog(`File selected: ${file.name}`);
    
    // Validate file type
    const allowedTypes = ['.stl', '.obj', '.3mf'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    addDebugLog(`File extension: ${ext}`);
    
    if (!allowedTypes.includes(ext)) {
        addDebugLog('ERROR: Invalid file type', 'error');
        showError('Invalid file type. Please upload STL, OBJ, or 3MF files.');
        return;
    }
    
    // Validate file size (50MB)
    if (file.size > 50 * 1024 * 1024) {
        addDebugLog(`ERROR: File too large: ${(file.size / 1024 / 1024).toFixed(2)} MB`, 'error');
        showError('File size exceeds 50MB limit.');
        return;
    }
    
    addDebugLog(`File size: ${(file.size / 1024).toFixed(2)} KB - OK`);
    
    selectedFile = file;
    fileName.textContent = file.name;
    fileInfo.style.display = 'flex';
    resultsSection.style.display = 'none';
    error.style.display = 'none';
    previewSection.style.display = 'none';
    
    // Load 3D preview if STL or OBJ file
    if (ext === '.stl' || ext === '.obj') {
        addDebugLog(`${ext.toUpperCase()} file detected, loading 3D preview...`);
        if (typeof loadSTLFile === 'function') {
            try {
                previewSection.style.display = 'block';
                // Ensure the Three.js viewer resizes now that it's visible
                if (typeof forceViewerResize === 'function') {
                    forceViewerResize();
                }
                await loadSTLFile(file);
            } catch (err) {
                addDebugLog(`ERROR loading 3D preview: ${err.message}`, 'error');
                console.error('Error loading 3D preview:', err);
                // Continue even if preview fails
            }
        } else {
            addDebugLog('WARNING: loadSTLFile function not available', 'warning');
        }
    } else {
        addDebugLog(`3D preview not available for ${ext} files`);
    }
    
    // Auto-upload
    addDebugLog('Starting file upload to server...');
    uploadFile(file);
}

function uploadFile(file) {
    const formData = new FormData();
    formData.append('cadFile', file);

    formData.append('qualityMode', qualityMode);
    addDebugLog(`Quality mode: ${qualityMode}`);
    
    addDebugLog('Creating FormData and preparing upload...');
    
    loading.style.display = 'block';
    resultsSection.style.display = 'none';
    error.style.display = 'none';
    
    // Reset loading steps
    document.querySelectorAll('.step').forEach(step => {
        step.classList.remove('active');
    });
    document.getElementById('step1').classList.add('active');
    
    // Animate through loading steps
    let currentStep = 1;
    loadingStepInterval = setInterval(() => {
        document.getElementById(`step${currentStep}`).classList.remove('active');
        currentStep++;
        if (currentStep <= 4) {
            document.getElementById(`step${currentStep}`).classList.add('active');
        } else {
            currentStep = 1;
            document.getElementById(`step${currentStep}`).classList.add('active');
        }
    }, 1500);
    
    addDebugLog('Sending POST request to /api/upload...');
    const startTime = Date.now();
    
    fetch('/api/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        addDebugLog(`Server responded in ${elapsed}s (Status: ${response.status})`);
        if (!response.ok) {
            addDebugLog(`ERROR: HTTP ${response.status}`, 'error');
        }
        return response.json();
    })
    .then(data => {
        if (loadingStepInterval) {
            clearInterval(loadingStepInterval);
            loadingStepInterval = null;
        }
        loading.style.display = 'none';
        
        if (data.error) {
            addDebugLog(`ERROR from server: ${data.error}`, 'error');
            showError(data.error);
        } else if (data.success) {
            addDebugLog('SUCCESS: File processed successfully!', 'success');
            addDebugLog(`Volume: ${data.volume} cm³`);
            addDebugLog(`Print time: ${data.printTime} minutes`);
            addDebugLog(`Filament: ${data.filamentMeters} meters`);
            if (typeof data.filamentWeightGrams !== 'undefined') {
                addDebugLog(`Filament weight: ${data.filamentWeightGrams} g`);
            }
            addDebugLog(`Total cost: $${data.total}`);
            displayResults(data);
        } else {
            addDebugLog('ERROR: Unexpected response format', 'error');
            showError('An unexpected error occurred.');
        }
    })
    .catch(err => {
        if (loadingStepInterval) {
            clearInterval(loadingStepInterval);
            loadingStepInterval = null;
        }
        loading.style.display = 'none';
        addDebugLog(`ERROR: Network or parsing error: ${err.message}`, 'error');
        showError('Failed to upload file. Please try again.');
        console.error('Upload error:', err);
    });
}

function displayResults(data) {
    document.getElementById('volumeValue').textContent = data.volume + ' cm³';
    document.getElementById('printTimeValue').textContent = data.printTime + ' minutes';
    
    // Store detailed breakdown in hidden fields (for email)
    if (document.getElementById('filamentValue')) {
        document.getElementById('filamentValue').textContent = data.filamentMeters + ' meters';
    }
    if (typeof data.filamentWeightGrams !== 'undefined' && document.getElementById('filamentWeightValue')) {
        document.getElementById('filamentWeightValue').textContent = data.filamentWeightGrams + ' g';
    }
    if (document.getElementById('filamentCost')) {
        document.getElementById('filamentCost').textContent = data.filamentCost;
    }
    if (document.getElementById('electricityCost')) {
        document.getElementById('electricityCost').textContent = data.electricityCost;
    }
    if (document.getElementById('laborCost')) {
        document.getElementById('laborCost').textContent = data.laborCost;
    }
    if (document.getElementById('postageCost')) {
        document.getElementById('postageCost').textContent = data.postageCost;
    }
    if (document.getElementById('subtotal')) {
        document.getElementById('subtotal').textContent = data.subtotal;
    }
    
    // Show subtotal as "Total Price" (before shipping)
    document.getElementById('totalPrice').textContent = data.subtotal;
    
    // Store quote data and file ID for order submission
    currentQuoteData = data;
    currentFileId = data.fileId;
    
    resultsSection.style.display = 'block';
    error.style.display = 'none';

    // Smoothly scroll the quote section into view after calculation
    try {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
        // Fallback for older browsers
        window.location.hash = '#resultsSection';
    }
}

function showError(message) {
    errorMessage.textContent = message;
    error.style.display = 'block';
    resultsSection.style.display = 'none';
}

// Order functionality
const orderNowBtn = document.getElementById('orderNowBtn');
const orderModal = document.getElementById('orderModal');
const closeModal = document.getElementById('closeModal');
const cancelOrder = document.getElementById('cancelOrder');
const orderForm = document.getElementById('orderForm');

if (orderNowBtn) {
    orderNowBtn.addEventListener('click', () => {
        if (!currentFileId || !currentQuoteData) {
            showError('Please wait for quote calculation to complete.');
            return;
        }
        orderModal.style.display = 'flex';
    });
}

if (closeModal) {
    closeModal.addEventListener('click', () => {
        orderModal.style.display = 'none';
        orderForm.reset();
        if (shippingResult) {
            shippingResult.style.display = 'none';
        }
    });
}

if (cancelOrder) {
    cancelOrder.addEventListener('click', () => {
        orderModal.style.display = 'none';
        orderForm.reset();
        if (shippingResult) {
            shippingResult.style.display = 'none';
        }
    });
}

// Close modal when clicking outside
if (orderModal) {
    orderModal.addEventListener('click', (e) => {
        if (e.target === orderModal) {
            orderModal.style.display = 'none';
            orderForm.reset();
            if (shippingResult) {
                shippingResult.style.display = 'none';
            }
        }
    });
}

// Handle shipping option changes
const shippingOptionShip = document.getElementById('shippingOptionShip');
const shippingOptionCollection = document.getElementById('shippingOptionCollection');
const zipcodeGroup = document.getElementById('zipcodeGroup');
const customerZip = document.getElementById('customerZip');
const calculateShippingBtn = document.getElementById('calculateShippingBtn');
const shippingResult = document.getElementById('shippingResult');
const calculatedShippingCost = document.getElementById('calculatedShippingCost');
const grandTotal = document.getElementById('grandTotal');

if (shippingOptionCollection && shippingOptionShip && zipcodeGroup) {
    shippingOptionCollection.addEventListener('change', () => {
        if (shippingOptionCollection.checked) {
            zipcodeGroup.style.display = 'none';
            customerZip.removeAttribute('required');
            shippingResult.style.display = 'none';
            // Recalculate with collection and current quantity
            calculateShipping();
        }
    });
    
    shippingOptionShip.addEventListener('change', () => {
        if (shippingOptionShip.checked) {
            zipcodeGroup.style.display = 'block';
            customerZip.setAttribute('required', 'required');
            shippingResult.style.display = 'none';
        }
    });
}

// Calculate shipping button click
if (calculateShippingBtn) {
    calculateShippingBtn.addEventListener('click', () => {
        if (!customerZip || customerZip.value.length !== 5) {
            alert('Please enter a valid 5-digit zipcode');
            return;
        }
        calculateShipping();
    });
}

// Function to calculate shipping cost
async function calculateShipping() {
    if (!currentQuoteData) return;
    
    const isCollection = shippingOptionCollection && shippingOptionCollection.checked;
    const zipcode = customerZip ? customerZip.value.trim() : null;
    
    const quantity = parseInt(document.getElementById('quantity') ? document.getElementById('quantity').value : 1) || 1;
    
    if (isCollection) {
        // Collection - no shipping cost, but need to recalculate with quantity
        calculateShippingBtn.disabled = true;
        calculateShippingBtn.textContent = 'Calculating...';
        
        try {
            const response = await fetch('/api/recalculate-shipping', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    volume: currentQuoteData.volume,
                    printTime: currentQuoteData.printTime,
                    toZip: null,
                    isCollection: true,
                    qualityMode: qualityMode,
                    quantity: quantity
                })
            });
            
            const data = await response.json();
            if (data.success) {
                calculatedShippingCost.textContent = '$0.00';
                grandTotal.textContent = '$' + data.total;
                shippingResult.style.display = 'block';
                currentQuoteData.postageCost = '0.00';
                currentQuoteData.total = data.total;
                currentQuoteData.subtotal = data.subtotal;
            }
        } catch (err) {
            console.error('Error calculating shipping:', err);
            alert('Error calculating shipping. Please try again.');
        } finally {
            calculateShippingBtn.disabled = false;
            calculateShippingBtn.textContent = 'Calculate Shipping';
        }
        return;
    }
    
    if (!zipcode || zipcode.length !== 5) {
        alert('Please enter a valid 5-digit zipcode');
        return;
    }
    
    calculateShippingBtn.disabled = true;
    calculateShippingBtn.textContent = 'Calculating...';
    
    try {
        const response = await fetch('/api/recalculate-shipping', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                volume: currentQuoteData.volume,
                printTime: currentQuoteData.printTime,
                toZip: zipcode,
                isCollection: false,
                qualityMode: qualityMode,
                quantity: parseInt(document.getElementById('quantity') ? document.getElementById('quantity').value : 1) || 1
            })
        });
        
        const data = await response.json();
        if (data.success) {
            // Show shipping result
            calculatedShippingCost.textContent = '$' + data.postageCost;
            grandTotal.textContent = '$' + data.total;
            shippingResult.style.display = 'block';
            
            // Update stored quote data
            currentQuoteData.postageCost = data.postageCost;
            currentQuoteData.total = data.total;
        } else {
            alert('Error calculating shipping: ' + (data.error || 'Unknown error'));
        }
    } catch (err) {
        console.error('Error calculating shipping:', err);
        alert('Error calculating shipping. Please try again.');
    } finally {
        calculateShippingBtn.disabled = false;
        calculateShippingBtn.textContent = 'Calculate Shipping';
    }
}

if (orderForm) {
    orderForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const customerName = document.getElementById('customerName').value.trim();
        const customerEmail = document.getElementById('customerEmail').value.trim();
        const quantity = parseInt(document.getElementById('quantity') ? document.getElementById('quantity').value : 1) || 1;
        const colorChoice = document.getElementById('colorChoice') ? document.getElementById('colorChoice').value : '';
        const shippingOption = document.querySelector('input[name="shippingOption"]:checked');
        const isCollection = shippingOption && shippingOption.value === 'collection';
        const zipcode = customerZip ? customerZip.value.trim() : null;
        
        if (!colorChoice) {
            showError('Please select a color.');
            return;
        }
        
        if (quantity < 1) {
            showError('Quantity must be at least 1.');
            return;
        }
        
        if (!customerName || !customerEmail) {
            showError('Please fill in all required fields.');
            return;
        }
        
        if (!isCollection && (!zipcode || zipcode.length !== 5)) {
            showError('Please enter a valid 5-digit zipcode for shipping.');
            return;
        }
        
        // Check if shipping has been calculated
        if (!isCollection && shippingResult.style.display === 'none') {
            showError('Please click "Calculate Shipping" to get your shipping cost.');
            return;
        }
        
        if (!currentFileId || !currentQuoteData) {
            showError('Quote data is missing. Please upload your file again.');
            return;
        }
        
        // Disable form during submission
        const submitBtn = orderForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
        
        try {
            const response = await fetch('/api/order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fileId: currentFileId,
                    customerName: customerName,
                    customerEmail: customerEmail,
                    customerZip: zipcode,
                    quantity: quantity,
                    colorChoice: colorChoice,
                    isCollection: isCollection,
                    qualityMode: qualityMode,
                    quoteData: currentQuoteData
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                orderModal.style.display = 'none';
                orderForm.reset();
                showSuccessMessage('Thank you! Your order has been submitted. We will review your quote and contact you at ' + customerEmail + ' with a payment link.');
            } else {
                showError(data.error || 'Failed to submit order. Please try again.');
            }
        } catch (err) {
            console.error('Order submission error:', err);
            showError('Failed to submit order. Please try again.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

function showSuccessMessage(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    // Append to bottom of results section instead of inserting at top
    resultsSection.appendChild(successDiv);
    
    // Scroll to the success message
    successDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    setTimeout(() => {
        successDiv.remove();
    }, 10000);
}

