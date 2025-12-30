// Email service endpoint for your paid Render service
// This handles SMTP email sending for your free Render service
// Rename this file to server.js when deploying

const express = require('express');
const nodemailer = require('nodemailer');
const app = express();

app.use(express.json({ limit: '50mb' })); // Allow large attachments

// SMTP configuration (same as before)
const smtpConfig = {
  host: process.env.SMTP_HOST || 'smtp.ionos.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  requireTLS: !process.env.SMTP_SECURE,
  tls: {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2'
  }
};

const emailTransporter = nodemailer.createTransport(smtpConfig);

// Optional: API key authentication
const API_KEY = process.env.EMAIL_SERVICE_API_KEY || null;

// Email endpoint
app.post('/api/send-email', (req, res) => {
  // Optional: Check API key
  if (API_KEY && req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const { from, to, subject, text, html, attachment } = req.body;

  if (!from || !to || !subject || !text) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

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
      console.error('Email send failed:', error);
      return res.status(500).json({ 
        error: 'Failed to send email',
        details: error.message 
      });
    }

    console.log('Email sent:', info.messageId);
    res.json({ 
      success: true, 
      messageId: info.messageId,
      response: info.response 
    });
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Email service running on port ${PORT}`);
});

