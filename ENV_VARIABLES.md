# Environment Variables for LAB007 Unified Services

This document lists all environment variables required for the unified LAB007 service that combines all projects.

## Required Environment Variables

### Server Configuration
- `PORT` - Server port (default: 3000, Render sets this automatically)

---

## 3D Print Project Variables

### Email Configuration (Choose ONE method)

#### Option 1: SendGrid API (Recommended for Free Render Plans)
- `SENDGRID_API_KEY` - SendGrid API key for email sending

#### Option 2: External Email Service
- `EMAIL_SERVICE_URL` - URL of external email service (e.g., https://your-email-service.onrender.com)
- `EMAIL_SERVICE_API_KEY` - API key for external email service (optional)

#### Option 3: Direct SMTP (Requires Paid Render Plan)
- `SMTP_HOST` - SMTP server hostname (e.g., smtp.gmail.com, smtp.ionos.com)
- `SMTP_PORT` - SMTP port (587 for STARTTLS, 465 for SSL/TLS)
- `SMTP_SECURE` - Set to 'true' or '1' for SSL/TLS (port 465), false/empty for STARTTLS (port 587)
- `SMTP_USER` - SMTP username/email
- `SMTP_PASS` - SMTP password or app password
- `SMTP_FROM` - Display name for email sender (optional, e.g., "LAB007 3D Print Quote")

### Email Notification Settings
- `ORDER_NOTIFY_EMAIL` - Email address to receive order notifications (default: info@lab007.ai)
- `ORDER_EMAIL_HEADER` - Subject prefix for order emails (optional)

---

## Citrix-Horizon Project Variables

No environment variables required (uses PORT only, which is set automatically by Render).

---

## VINValue Project Variables

- `WEBUYEMAIL` - Default email for WeBuyAnyCar form submissions (default: Thomad99@gmail.com)
- `WEBUYZIPCODE` - Default ZIP code for valuations (default: 34238)
- `OPENAI_API_KEY` - OpenAI API key for image analysis (optional, for VIN extraction from images)
- `PLAYWRIGHT_BROWSERS_PATH` - Path for Playwright browsers (usually '0' for Render)

---

## Web-Alert Project Variables

### Database Configuration
- `DB_HOST` - PostgreSQL database hostname
- `DB_USER` - PostgreSQL database username
- `DB_NAME` - PostgreSQL database name
- `DB_PASSWORD` - PostgreSQL database password
- `DB_PORT` - PostgreSQL database port (default: 5432)

### Email Configuration
- `EMAIL_USER` - Gmail address for sending alerts
- `EMAIL_PASSWORD` - Gmail app password (not regular password)
- `EMAIL_FROM` - Email sender address (optional, defaults to EMAIL_USER)

### SMS Configuration (Optional - Twilio)
- `TWILIO_ACCOUNT_SID` - Twilio account SID
- `TWILIO_AUTH_TOKEN` - Twilio auth token
- `TWILIO_PHONE_NUMBER` - Twilio phone number for sending SMS

### Environment
- `NODE_ENV` - Environment mode (development or production)

### Optional
- `PUPPETEER_EXECUTABLE_PATH` - Path to Chrome/Chromium executable (usually not needed on Render)
- `WEBALERT_API_KEY` - API key for external API access to `/api/external/monitor` endpoint (optional, but recommended for security)

---

## Complete Environment Variables List

Copy and paste this into your Render environment variables:

```bash
# Server
PORT=3000

# 3D Print - Email (Choose ONE method)
# Option 1: SendGrid
SENDGRID_API_KEY=your_sendgrid_api_key_here

# Option 2: External Email Service
# EMAIL_SERVICE_URL=https://your-email-service.onrender.com
# EMAIL_SERVICE_API_KEY=your_api_key_here

# Option 3: Direct SMTP (requires paid Render plan)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=your_email@gmail.com
# SMTP_PASS=your_app_password
# SMTP_FROM=LAB007 3D Print Quote

# 3D Print - Notifications
ORDER_NOTIFY_EMAIL=info@lab007.ai
ORDER_EMAIL_HEADER=New 3D Print Order

# VINValue
WEBUYEMAIL=Thomad99@gmail.com
WEBUYZIPCODE=34238
OPENAI_API_KEY=your_openai_api_key_here
PLAYWRIGHT_BROWSERS_PATH=0

# Web-Alert - Database
DB_HOST=your_db_host
DB_USER=your_db_user
DB_NAME=your_db_name
DB_PASSWORD=your_db_password
DB_PORT=5432

# Web-Alert - Email
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_gmail_app_password
EMAIL_FROM=your_email@gmail.com

# Web-Alert - External API (Optional)
# WEBALERT_API_KEY=your_secret_api_key_here

# Web-Alert - SMS (Optional - Currently Disabled)
# To enable Twilio SMS, uncomment and set these variables:
# TWILIO_ACCOUNT_SID=your_twilio_sid
# TWILIO_AUTH_TOKEN=your_twilio_token
# TWILIO_PHONE_NUMBER=+1234567890
# Note: If Twilio is disabled, the service will automatically fall back to email-to-SMS gateway if EMAIL_USER and EMAIL_PASSWORD are configured.

# Environment
NODE_ENV=production
```

---

## Notes

1. **Email Configuration**: For 3D Print project, you only need ONE email method (SendGrid, External Service, or SMTP). SendGrid is recommended for free Render plans.

2. **Database**: Web-Alert requires a PostgreSQL database. You can use Render's PostgreSQL addon or an external database.

3. **SMS**: Web-Alert SMS is optional. If not configured, only email alerts will be sent.

4. **OpenAI API**: VINValue's image analysis feature is optional. The service works without it, but won't be able to extract VIN from images.

5. **Web-Alert External API**: The `/api/external/monitor` endpoint allows other services to trigger web alerts. If `WEBALERT_API_KEY` is set, API key authentication is required. If not set, the endpoint is accessible without authentication (not recommended for production).

5. **Render Free Tier Limitations**: 
   - SMTP ports (25, 465, 587) are blocked on free plans
   - Use SendGrid API or external email service instead
   - Consider upgrading to paid plan for direct SMTP

---

## Setting Environment Variables in Render

1. Go to your Render dashboard
2. Select your service
3. Go to "Environment" tab
4. Add each variable using "Add Environment Variable"
5. Save changes (service will restart automatically)

