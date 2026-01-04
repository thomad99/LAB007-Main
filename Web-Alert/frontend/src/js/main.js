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
        statusBox.innerHTML += '<p>📡 Connecting to server...</p>';
        
        const response = await fetch('api/monitor', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

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
        statusBox.innerHTML = `
            <p>❌ Error occurred:</p>
            <p>${error.message}</p>
            <p>Please try again or contact support if the problem persists.</p>
        `;
        document.getElementById('statusBox').classList.remove('status-active');
    }
});
