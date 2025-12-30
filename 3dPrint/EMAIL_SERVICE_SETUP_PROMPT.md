# Email Service Setup Instructions

## Context
I have an existing Express.js web service running on a paid Render plan. I need to add an email endpoint that will handle SMTP email sending for another free Render service that cannot send SMTP emails directly.

## What to Add

Add a new POST endpoint `/api/send-email` to my existing Express server that:

1. Accepts email data via HTTP POST with JSON body containing:
   - `from` - sender email address
   - `to` - recipient email address  
   - `subject` - email subject
   - `text` - email body text
   - `attachment` - optional object with:
     - `filename` - attachment filename
     - `content` - base64 encoded file content
     - `encoding` - "base64"

2. Uses nodemailer to send emails via SMTP with these environment variables:
   - `SMTP_HOST` - SMTP server (e.g., smtp.ionos.com)
   - `SMTP_PORT` - SMTP port (e.g., 587)
   - `SMTP_SECURE` - "true" for SSL/TLS, "false" for STARTTLS
   - `SMTP_USER` - SMTP username/email
   - `SMTP_PASS` - SMTP password
   - `EMAIL_SERVICE_API_KEY` - optional API key for authentication

3. Optional security: If `EMAIL_SERVICE_API_KEY` is set, check for `X-API-Key` header and return 401 if missing or invalid

4. Returns JSON response:
   - Success: `{ success: true, messageId: "...", response: "..." }`
   - Error: `{ error: "error message", details: "..." }` with appropriate HTTP status codes

5. Handles large attachments (up to 50MB) - set express.json limit accordingly

## Requirements

- Must use nodemailer package (add to package.json if not already present)
- Must configure SMTP with TLS 1.2 minimum
- Must handle base64 encoded attachments
- Must return proper HTTP status codes (200 for success, 400 for bad request, 401 for auth failure, 500 for server errors)
- Should log email send attempts and results

## Example Request Body
```json
{
  "from": "david.thomas@thinworld.net",
  "to": "david.thomas@thinworld.net",
  "subject": "Test Email",
  "text": "Email body text here",
  "attachment": {
    "filename": "file.stl",
    "content": "base64encodedcontenthere",
    "encoding": "base64"
  }
}
```

## SMTP Configuration Details
- Use `requireTLS: true` when `SMTP_SECURE` is false (for STARTTLS)
- Use `secure: true` when `SMTP_SECURE` is true (for SSL/TLS)
- Set TLS minVersion to 'TLSv1.2'
- Set connectionTimeout, greetingTimeout, socketTimeout to reasonable values (e.g., 30000ms)

Please add this endpoint to my existing Express server without modifying any existing routes or functionality. Just add the new endpoint and ensure nodemailer is in the dependencies.


