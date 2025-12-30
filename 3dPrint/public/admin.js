// Load settings on page load
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
});

const form = document.getElementById('settingsForm');
const resetBtn = document.getElementById('resetBtn');
const message = document.getElementById('message');
const messageText = document.getElementById('messageText');
const quickPresetSelect = document.getElementById('quickPreset');

// Load settings from server
async function loadSettings() {
    try {
        const response = await fetch('api/settings');
        const settings = await response.json();
        
        // Populate form fields
        document.getElementById('filamentCostPerMeter').value = settings.filamentCostPerMeter;
        document.getElementById('electricityCostPerMinute').value = settings.electricityCostPerMinute;
        document.getElementById('laborCostFixed').value = settings.laborCostFixed;
        document.getElementById('postageBaseCost').value = settings.postageBaseCost;
        document.getElementById('layerHeight').value = settings.layerHeight;
        document.getElementById('printSpeed').value = settings.printSpeed;
        document.getElementById('infillPercentage').value = settings.infillPercentage;
        document.getElementById('wallThickness').value = settings.wallThickness;

        // Optional quality-specific layer heights
        document.getElementById('draftLayerHeight').value = settings.draftLayerHeight || 0.24;
        document.getElementById('highQualityLayerHeight').value = settings.highQualityLayerHeight || 0.10;
    } catch (error) {
        showMessage('Failed to load settings. Using defaults.', 'error');
        console.error('Error loading settings:', error);
    }
}

// Handle form submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const settings = {
        filamentCostPerMeter: parseFloat(document.getElementById('filamentCostPerMeter').value),
        electricityCostPerMinute: parseFloat(document.getElementById('electricityCostPerMinute').value),
        laborCostFixed: parseFloat(document.getElementById('laborCostFixed').value),
        postageBaseCost: parseFloat(document.getElementById('postageBaseCost').value),
        layerHeight: parseFloat(document.getElementById('layerHeight').value),
        printSpeed: parseFloat(document.getElementById('printSpeed').value),
        infillPercentage: parseFloat(document.getElementById('infillPercentage').value),
        wallThickness: parseFloat(document.getElementById('wallThickness').value),
        draftLayerHeight: parseFloat(document.getElementById('draftLayerHeight').value) || 0.24,
        highQualityLayerHeight: parseFloat(document.getElementById('highQualityLayerHeight').value) || 0.16
    };
    
    try {
        const response = await fetch('api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('Settings saved successfully!', 'success');
        } else {
            showMessage('Failed to save settings. Please try again.', 'error');
        }
    } catch (error) {
        showMessage('Error saving settings. Please try again.', 'error');
        console.error('Error saving settings:', error);
    }
});

// Reset to defaults
resetBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
        document.getElementById('filamentCostPerMeter').value = 0.02;
        document.getElementById('electricityCostPerMinute').value = 0.001;
        document.getElementById('laborCostFixed').value = 25.00;
        document.getElementById('postageBaseCost').value = 5.00;
        document.getElementById('layerHeight').value = 0.2;
        document.getElementById('printSpeed').value = 60;
        document.getElementById('infillPercentage').value = 20;
        document.getElementById('wallThickness').value = 0.8;
        document.getElementById('draftLayerHeight').value = 0.24;
        document.getElementById('highQualityLayerHeight').value = 0.16;
        
        showMessage('Settings reset to defaults. Click "Save Settings" to apply.', 'success');
    }
});

// Apply quick presets based on typical slicer profiles
if (quickPresetSelect) {
    quickPresetSelect.addEventListener('change', () => {
        const preset = quickPresetSelect.value;

        if (preset === 'draft') {
            // Example: 0.24mm layer height for draft
            document.getElementById('draftLayerHeight').value = 0.24;
            document.getElementById('highQualityLayerHeight').value = 0.16;
            document.getElementById('layerHeight').value = 0.24;
        } else if (preset === 'high') {
            // Example: 0.16mm layer height for high quality
            document.getElementById('draftLayerHeight').value = 0.24;
            document.getElementById('highQualityLayerHeight').value = 0.16;
            document.getElementById('layerHeight').value = 0.16;
        }
    });
}

function showMessage(text, type) {
    messageText.textContent = text;
    message.className = `message ${type}`;
    message.style.display = 'block';
    
    // Hide message after 5 seconds
    setTimeout(() => {
        message.style.display = 'none';
    }, 5000);
}

