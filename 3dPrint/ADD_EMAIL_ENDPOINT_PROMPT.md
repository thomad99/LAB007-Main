# Add Email Endpoint to Existing Server

## Task
Add a POST endpoint `/api/send-email` to my existing Express server that forwards email requests from my free Render service and sends them via SMTP.

## What to Add

### 1. Add nodemailer dependency (if not already present)
Add to `package.json` dependencies:
```json
"nodemailer": "^6.9.7"
```

### 2. Add to your existing server.js (or main server file)

**At the top with other requires:**
```javascript
const nodemailer = require('nodemailer');
```

**After your existing middleware setup, add:**
```javascript
// Ensure JSON body parser can handle large payloads (for file attachments)
app.use(express.json({ limit: '50mb' }));
```

**Add SMTP configuration (before your routes):**
```javascript
// SMTP configuration for email forwarding
const smtpConfig = {
  host: process.env.SMTP_HOST || 'smtp.ionos.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  requireTLS: process.env.SMTP_SECURE !== 'true' && process.env.SMTP_SECURE !== '1',
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000,
  tls: {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2'
  }
};

const emailTransporter = nodemailer.createTransport(smtpConfig);

// Optional: API key for authentication
const EMAIL_SERVICE_API_KEY = process.env.EMAIL_SERVICE_API_KEY || null;
```

**Add the email endpoint (add with your other routes):**
```javascript
// Email forwarding endpoint (for free Render service)
app.post('/api/send-email', (req, res) => {
  console.log('=== Email Forwarding Request Received ===');
  
  // Optional: Check API key if set
  if (EMAIL_SERVICE_API_KEY && req.headers['x-api-key'] !== EMAIL_SERVICE_API_KEY) {
    console.error('Invalid API key provided');
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const { from, to, subject, text, html, attachment } = req.body;

  // Validate required fields
  if (!from || !to || !subject || !text) {
    console.error('Missing required fields:', { from: !!from, to: !!to, subject: !!subject, text: !!text });
    return res.status(400).json({ error: 'Missing required fields: from, to, subject, text' });
  }

  console.log(`Sending email from ${from} to ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Has HTML: ${!!html}`);
  console.log(`Has attachment: ${!!attachment}`);

  const mailOptions = {
    from: from,
    to: to,
    subject: subject,
    text: text,
    html: html || null,
    attachments: attachment ? [
      {
        filename: attachment.filename,
        content: attachment.content,
        encoding: attachment.encoding || 'base64'
      }
    ] : []
  };

  emailTransporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('=== Email Send FAILED ===');
      console.error('Error:', error.message);
      console.error('Error Code:', error.code);
      console.error('Full Error:', error);
      return res.status(500).json({ 
        error: 'Failed to send email',
        details: error.message,
        code: error.code
      });
    }

    console.log('=== Email Send SUCCESS ===');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
    res.json({ 
      success: true, 
      messageId: info.messageId,
      response: info.response 
    });
  });
});
```

## Environment Variables Needed

Add these to your Render service environment variables:
- `SMTP_HOST` - Your SMTP server (e.g., smtp.ionos.com)
- `SMTP_PORT` - SMTP port (e.g., 587)
- `SMTP_SECURE` - "true" for SSL/TLS, "false" for STARTTLS (defaults based on port)
- `SMTP_USER` - Your SMTP username/email
- `SMTP_PASS` - Your SMTP password
- `EMAIL_SERVICE_API_KEY` - (Optional) API key for authentication

## Important Notes

1. **Don't modify existing routes** - Just add this new endpoint
2. **Don't change existing middleware** - Only add the JSON limit if it's not already set to handle large payloads
3. **The endpoint should be accessible at**: `https://your-service.onrender.com/api/send-email`
4. **It accepts POST requests** with JSON body containing: `from`, `to`, `subject`, `text`, and optional `attachment` object

## Testing

After adding, you can test by visiting the URL in a browser (should show "Cannot GET" - that's normal, it only accepts POST).

The endpoint will work when your free service sends POST requests to it.


