window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Global error:', {
        message: msg,
        url: url,
        line: lineNo,
        column: columnNo,
        error: error
    });
    return false;
};

// Utility function to get correct API base path
function getApiBaseUrl() {
    const basePath = window.location.pathname.startsWith('/webalert') ? '/webalert' : '';
    return window.location.protocol + '//' + window.location.host + basePath;
}

// Function to get URL parameters and pre-fill form (for mobile Safari compatibility)
function prefillFormFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);

    const websiteUrl = urlParams.get('websiteUrl');
    const pollingInterval = urlParams.get('pollingInterval');
    const duration = urlParams.get('duration');
    const email = urlParams.get('email');

    if (websiteUrl) {
        document.getElementById('websiteUrl').value = decodeURIComponent(websiteUrl);
        console.log('Pre-filled website URL from URL parameter:', websiteUrl);
    }
    if (pollingInterval) {
        document.getElementById('pollingInterval').value = parseInt(pollingInterval) || 3;
        console.log('Pre-filled polling interval from URL parameter:', pollingInterval);
    }
    if (duration) {
        document.getElementById('duration').value = parseInt(duration) || 10;
        console.log('Pre-filled duration from URL parameter:', duration);
    }
    if (email) {
        document.getElementById('email').value = decodeURIComponent(email);
        console.log('Pre-filled email from URL parameter:', email);
    }

    // Clear URL parameters after pre-filling to clean up the URL
    if (websiteUrl || pollingInterval || duration || email) {
        const newUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        console.log('Cleared URL parameters from address bar');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    prefillFormFromUrl();
});

document.getElementById('alertForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const statusBox = document.getElementById('statusContent');

    const formData = {
        websiteUrl: document.getElementById('websiteUrl').value,
        email: document.getElementById('email').value,
        phone: null,
        pollingInterval: parseInt(document.getElementById('pollingInterval').value) || 3,
        duration: parseInt(document.getElementById('duration').value),
        smsConsent: false
    };

    // Show the data being sent
    statusBox.innerHTML = `
        <p>⏳ Sending request with:</p>
        <p>🔗 URL: ${formData.websiteUrl}</p>
        <p>📧 Email: ${formData.email}</p>
        <p>🔄 Polling Interval: ${formData.pollingInterval} minutes</p>
        <p>⏱️ Duration: ${formData.duration} minutes</p>
    `;
    document.getElementById('statusBox').classList.add('status-active');

    try {
        console.log('Sending form data:', formData);
        console.log('User Agent:', navigator.userAgent);
        console.log('Is mobile Safari:', /Safari/i.test(navigator.userAgent) && /Mobile/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent));

        statusBox.innerHTML += '<p>📡 Connecting to server...</p>';

        // Use correct base path - detect if running under /webalert
        const apiUrl = getApiBaseUrl() + '/api/monitor';
        console.log('Using API URL:', apiUrl);
        console.log('Fetch options:', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            mode: 'cors',
            credentials: 'same-origin'
        });

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            mode: 'cors',
            credentials: 'same-origin',
            body: JSON.stringify(formData)
        });

        console.log('Fetch response status:', response.status);
        console.log('Fetch response headers:', Object.fromEntries(response.headers.entries()));

        statusBox.innerHTML += '<p>⌛ Processing response...</p>';
        
        // Check if response is JSON before parsing
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            throw new Error(`Server returned ${response.status}: ${text.substring(0, 200)}`);
        }
        
        const data = await response.json();
        console.log('Server response:', data);
        
        if (response.ok) {
            statusBox.innerHTML = `
                <p>✅ Success! Monitoring started</p>
                <p>🆔 Alert ID: ${data.data.subscriber.id}</p>
                <p>🔗 URL: ${formData.websiteUrl}</p>
                <p>🔄 Polling Interval: ${formData.pollingInterval} minutes</p>
                <p>⏱️ Duration: ${formData.duration} minutes</p>
                <p>📧 Email: ${formData.email}</p>
                <p>🔄 First check will begin in about ${formData.pollingInterval} minute(s)</p>
                <p><a href="/status.html" class="status-link">View All Monitoring Tasks</a></p>
            `;
            e.target.reset();
        } else {
            throw new Error(data.error || 'Failed to start monitoring');
        }
    } catch (error) {
        console.error('Form submission error:', error);
        console.error('Primary fetch submission failed:', error);

        // Enhanced error reporting for mobile Safari debugging
        const isMobileSafari = /Safari/i.test(navigator.userAgent) &&
                              /Mobile/i.test(navigator.userAgent) &&
                              !/Chrome/i.test(navigator.userAgent);

        statusBox.innerHTML = `
            <p>❌ Error occurred:</p>
            <p>${error.message}</p>
            ${isMobileSafari ? '<p><small>📱 Mobile Safari detected - if this persists, try using a different browser.</small></p>' : ''}
            <p>Please try again or contact support if the problem persists.</p>
            <p><button onclick="retrySubmission()" style="padding: 5px 10px; margin-top: 10px;">Retry Submission</button></p>
        `;
        document.getElementById('statusBox').classList.remove('status-active');

        // Add retry function to window
        window.retrySubmission = function() {
            console.log('Retrying submission...');
            document.getElementById('alertForm').dispatchEvent(new Event('submit'));
        };
    }
});
