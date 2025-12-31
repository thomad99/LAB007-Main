const nodemailer = require('nodemailer');

// SendGrid support (for free Render plans that block SMTP)
let sendgrid = null;
if (process.env.SENDGRID_API_KEY) {
    try {
        sendgrid = require('@sendgrid/mail');
        sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
        console.log('[Web-Alert Email] SendGrid initialized (using API instead of SMTP)');
    } catch (err) {
        console.error('[Web-Alert Email] Failed to initialize SendGrid:', err.message);
    }
}

// SMTP configuration (same as 3D Print)
const smtpPort = parseInt(process.env.SMTP_PORT || '587');
const smtpSecure = process.env.SMTP_SECURE !== undefined 
    ? process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1'
    : smtpPort === 465; // Default: port 465 = secure, port 587 = STARTTLS

const smtpConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: smtpPort,
    secure: smtpSecure, // true = SSL/TLS, false = STARTTLS
    auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
    },
    requireTLS: !smtpSecure, // Require TLS upgrade for STARTTLS (port 587 with secure: false)
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    debug: false, // Disable verbose debug output
    logger: false, // Disable verbose logging
    tls: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2'
    }
};

// Create transporter (only if SMTP credentials are available)
let transporter = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
        transporter = nodemailer.createTransport(smtpConfig);
        console.log('[Web-Alert Email] SMTP transporter initialized');
    } catch (error) {
        console.warn('[Web-Alert Email] Failed to initialize SMTP transporter:', error.message);
    }
} else {
    console.warn('[Web-Alert Email] SMTP credentials not configured (SMTP_USER or SMTP_PASS missing)');
}

async function sendAlert(email, websiteUrl, contentBefore, contentAfter) {
    console.log('[Web-Alert Email] Sending alert email...');
    console.log('[Web-Alert Email] To:', email);
    console.log('[Web-Alert Email] Website:', websiteUrl);
    
    try {
        // Use ALERT_SUBJECT environment variable, fallback to default
        const emailSubject = process.env.ALERT_SUBJECT || 'LOVESAILING PAGE UPDATE';
        
        // Create LAB007 logo HTML (base64 encoded or hosted URL)
        const lab007Logo = `
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="https://raw.githubusercontent.com/thomad99/LAB007-WebAlert/main/frontend/public/lab007-trans.PNG" 
                     alt="LAB007 Logo" 
                     style="max-width: 200px; height: auto; border-radius: 8px;">
            </div>
        `;
        
        // Extract text changes (simple diff for text content)
        let changesText = '';
        if (contentBefore && contentAfter) {
            // Simple text comparison - show what changed
            const beforeWords = contentBefore.split(/\s+/).filter(word => word.length > 0);
            const afterWords = contentAfter.split(/\s+/).filter(word => word.length > 0);
            
            // Find added/removed words (basic diff)
            const added = afterWords.filter(word => !beforeWords.includes(word));
            const removed = beforeWords.filter(word => !afterWords.includes(word));
            
            if (added.length > 0 || removed.length > 0) {
                changesText = `
                    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
                        <h4 style="color: #495057; margin-top: 0;">📝 Text Changes Detected:</h4>
                        ${added.length > 0 ? `<p><strong>Added:</strong> ${added.slice(0, 10).join(', ')}${added.length > 10 ? '...' : ''}</p>` : ''}
                        ${removed.length > 0 ? `<p><strong>Removed:</strong> ${removed.slice(0, 10).join(', ')}${removed.length > 10 ? '...' : ''}</p>` : ''}
                        <p style="font-size: 12px; color: #6c757d;">Showing first 10 changes. Full content comparison available in monitoring logs.</p>
                    </div>
                `;
            }
        }
        
        const mailOptions = {
            from: `"LAB007 Web Alert" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
            to: email,
            subject: emailSubject,
            text: `HI,\n\nChange Detected on webpage: ${websiteUrl}\nDate and time: ${new Date().toLocaleString()}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { text-align: center; margin-bottom: 30px; }
                        .alert-box { background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 20px 0; }
                        .website-link { color: #007bff; text-decoration: none; }
                        .website-link:hover { text-decoration: underline; }
                        .timestamp { color: #6c757d; font-size: 14px; }
                        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; text-align: center; color: #6c757d; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        ${lab007Logo}
                        
                        <div class="header">
                            <h1 style="color: #dc3545; margin: 0;">🚨 ${emailSubject}</h1>
                        </div>
                        
                        <div class="alert-box">
                            <h2 style="margin-top: 0; color: #856404;">HI,</h2>
                            <p><strong>Change Detected on webpage:</strong> <a href="${websiteUrl}" class="website-link">${websiteUrl}</a></p>
                            <p class="timestamp"><strong>Date and time:</strong> ${new Date().toLocaleString()}</p>
                        </div>
                        
                        ${changesText}
                        
                        <div style="background-color: #e9ecef; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <h4 style="margin-top: 0; color: #495057;">🔍 What This Means:</h4>
                            <p>The content of the monitored webpage has changed. This could be:</p>
                            <ul style="margin: 10px 0; padding-left: 20px;">
                                <li>New content added</li>
                                <li>Existing content modified</li>
                                <li>Content removed</li>
                                <li>Page structure changes</li>
                            </ul>
                        </div>
                        
                        <div class="footer">
                            <p>This alert was sent by LAB007 Web Alert System</p>
                            <p>Monitoring frequency: Every 3 minutes</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };
        
        // Send via SendGrid if available, otherwise use SMTP
        if (sendgrid) {
            console.log('[Web-Alert Email] Using SendGrid API...');
            const msg = {
                to: email,
                from: process.env.SMTP_USER || process.env.EMAIL_USER,
                subject: emailSubject,
                text: mailOptions.text,
                html: mailOptions.html
            };
            await sendgrid.send(msg);
            console.log('[Web-Alert Email] Email sent successfully via SendGrid');
            return { messageId: 'sendgrid-' + Date.now() };
        } else if (transporter) {
            console.log('[Web-Alert Email] Using SMTP...');
            const info = await transporter.sendMail(mailOptions);
            console.log('[Web-Alert Email] Email sent successfully via SMTP:', info.messageId);
            return info;
        } else {
            throw new Error('Email service not configured. Please set SMTP_USER/SMTP_PASS or SENDGRID_API_KEY');
        }
    } catch (error) {
        console.error('[Web-Alert Email] Error sending email:', error.message);
        throw error;
    }
}

async function sendWelcomeEmail(email, websiteUrl, duration) {
    console.log('[Web-Alert Email] Sending welcome email to:', email);
    console.log('[Web-Alert Email] Website:', websiteUrl);
    console.log('[Web-Alert Email] Duration:', duration);
    
    try {
        const mailOptions = {
            from: `"Web Alert Service" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
            to: email,
            subject: 'LAB007-ALERTS-STARTED',
            text: `Web Alerts Activated\n\nURL: ${websiteUrl}\nPoll Period: Every 3 minutes\nDuration: ${duration} minutes\n\nMonitoring has started successfully. You will receive notifications if any changes are detected.`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #0066cc;">Web Alerts Activated</h2>
                    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>URL:</strong> <a href="${websiteUrl}">${websiteUrl}</a></p>
                        <p><strong>Poll Period:</strong> Every 3 minutes</p>
                        <p><strong>Duration:</strong> ${duration} minutes</p>
                        <p><strong>Start Time:</strong> ${new Date().toLocaleString()}</p>
                    </div>
                    <p>Monitoring has started successfully. You will receive notifications if any changes are detected on the website.</p>
                    <p>Monitoring will automatically stop after ${duration} minutes.</p>
                </div>
            `
        };
        
        console.log('[Web-Alert Email] Mail options prepared:', {
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject
        });
        
        if (sendgrid) {
            console.log('[Web-Alert Email] Using SendGrid API...');
            const msg = {
                to: email,
                from: process.env.SMTP_USER || process.env.EMAIL_USER,
                subject: mailOptions.subject,
                text: mailOptions.text,
                html: mailOptions.html
            };
            await sendgrid.send(msg);
            console.log('[Web-Alert Email] Welcome email sent successfully via SendGrid');
            return { messageId: 'sendgrid-' + Date.now() };
        } else if (transporter) {
            console.log('[Web-Alert Email] Using SMTP...');
            const info = await transporter.sendMail(mailOptions);
            console.log('[Web-Alert Email] Welcome email sent successfully via SMTP:', info.messageId);
            return info;
        } else {
            console.error('[Web-Alert Email] Email service not configured - SMTP_USER/SMTP_PASS or SENDGRID_API_KEY required');
            throw new Error('Email service not configured. Please set SMTP_USER/SMTP_PASS or SENDGRID_API_KEY');
        }
    } catch (error) {
        console.error('[Web-Alert Email] Error sending welcome email:', error.message);
        console.error('[Web-Alert Email] Error stack:', error.stack);
        throw error;
    }
}

async function sendSummaryEmail(email, websiteUrl, duration, checkCount, changesDetected, lastCheck) {
    console.log('[Web-Alert Email] Sending summary email to:', email);
    
    try {
        const summaryText = changesDetected > 0 
            ? `We detected ${changesDetected} change(s) during monitoring.`
            : 'No changes were detected during monitoring.';
        
        const mailOptions = {
            from: `"Web Alert Service" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
            to: email,
            subject: 'LAB007-ALERTS-ENDED',
            text: `Monitoring completed for ${websiteUrl}. ${summaryText} Total checks: ${checkCount}`,
            html: `
                <h2>📊 Monitoring Summary</h2>
                <p><strong>Website:</strong> <a href="${websiteUrl}">${websiteUrl}</a></p>
                <p><strong>Duration:</strong> ${duration} minutes</p>
                <p><strong>Total Checks:</strong> ${checkCount}</p>
                <p><strong>Changes Detected:</strong> ${changesDetected}</p>
                <p><strong>Last Check:</strong> ${lastCheck ? new Date(lastCheck).toLocaleString() : 'N/A'}</p>
                <p><strong>End Time:</strong> ${new Date().toLocaleString()}</p>
                <hr>
                <p>${summaryText}</p>
                <p>Monitoring has been completed and stopped automatically.</p>
                <p>Thank you for using Web Alert!</p>
            `
        };
        
        if (sendgrid) {
            const msg = {
                to: email,
                from: process.env.SMTP_USER || process.env.EMAIL_USER,
                subject: mailOptions.subject,
                text: mailOptions.text,
                html: mailOptions.html
            };
            await sendgrid.send(msg);
            return { messageId: 'sendgrid-' + Date.now() };
        } else if (transporter) {
            const info = await transporter.sendMail(mailOptions);
            return info;
        } else {
            throw new Error('Email service not configured');
        }
    } catch (error) {
        console.error('[Web-Alert Email] Error sending summary email:', error.message);
        throw error;
    }
}

module.exports = {
    sendAlert,
    sendWelcomeEmail,
    sendSummaryEmail
}; 