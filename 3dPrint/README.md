# LAB007 3D Print Quote Service

A web application for providing instant quotes for 3D printing services. Users can upload CAD files (STL, OBJ, 3MF) and receive automatic price calculations based on filament usage, print time, and other factors.

## Features

- **User-Friendly Quote Page**: Upload CAD files and get instant price estimates
- **Admin Dashboard**: Manage pricing variables including:
  - Filament cost per meter
  - Electricity cost per minute
  - Labor cost per minute
  - Postage costs
  - Print parameters (layer height, speed, infill, etc.)
- **Automatic Calculations**: 
  - Volume calculation from STL files
  - Print time estimation
  - Filament requirement calculation
  - Total cost breakdown
- **Mobile Responsive**: Clean, simple design that works on all devices

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

3. Access the application:
   - Quote page: http://localhost:3000
   - Admin page: http://localhost:3000/admin

## Deployment on Render

1. Create a new Web Service on Render
2. Connect your Git repository
3. Set the following:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. The app will automatically use the PORT environment variable provided by Render

### Environment Variables (Required for Email Notifications)

**IMPORTANT:** Free Render plans block SMTP ports (25, 465, 587). You have two options:

#### Option 1: Use SendGrid API (Recommended for Free Render Plans)

SendGrid works on free Render plans and offers 100 emails/day free:

1. Sign up at [SendGrid](https://sendgrid.com) (free tier available)
2. Create an API key in SendGrid dashboard
3. Set these environment variables in Render:
   - `SENDGRID_API_KEY` - Your SendGrid API key (required)
   - `SMTP_FROM` - Verified sender email address in SendGrid
   - `ORDER_NOTIFY_EMAIL` - Email address to receive notifications
   - `ORDER_EMAIL_HEADER` - Subject line prefix (optional)

#### Option 2: Use SMTP (Requires Paid Render Plan)

To use SMTP, upgrade to a paid Render plan ($7/month minimum). Then set:

- `SMTP_HOST` - SMTP server hostname (default: `smtp.gmail.com`)
- `SMTP_PORT` - SMTP server port (default: `587`)
- `SMTP_USER` - Your SMTP username/email
- `SMTP_PASS` - Your SMTP password or app-specific password
- `SMTP_SECURE` - Set to `true` for SSL/TLS on port 587 (optional)
- `SMTP_FROM` - Email address to send from (optional, defaults to SMTP_USER)
- `ORDER_NOTIFY_EMAIL` - Email address to receive new order notifications (optional, defaults to `david.thomas@thinworld.net`)
- `ORDER_EMAIL_HEADER` - Subject line to use for order notification emails (optional, defaults to `New 3D Print Order Request from <customer name>`)

**For IONOS:**
- `SMTP_HOST` = `smtp.ionos.com`
- `SMTP_PORT` = `587` (with SSL/TLS) or `465` (SSL/TLS)
- `SMTP_USER` = Your full IONOS email address (e.g., `david.thomas@thinworld.net`)
- `SMTP_PASS` = Your IONOS email password
- `SMTP_SECURE` = `true` (required for port 587 with SSL/TLS, optional for port 465 as it's automatic)
- For port 587 with SSL: Set `SMTP_PORT=587` and `SMTP_SECURE=true`
- For port 465: Set `SMTP_PORT=465` (secure: true is automatic)

**For Gmail:**
- `SMTP_HOST` = `smtp.gmail.com`
- `SMTP_PORT` = `587` (STARTTLS) or `465` (SSL/TLS)
- Use an App Password instead of your regular password
- Enable 2-factor authentication first
- Generate an App Password at: https://myaccount.google.com/apppasswords

## File Structure

```
├── server.js          # Express server and API endpoints
├── package.json       # Dependencies and scripts
├── public/            # Frontend files
│   ├── index.html     # Main quote page
│   ├── admin.html     # Admin settings page
│   ├── styles.css     # Main styles
│   ├── admin.css      # Admin page styles
│   ├── script.js      # Quote page JavaScript
│   └── admin.js       # Admin page JavaScript
├── images/            # Logo and assets
└── uploads/           # Temporary file storage (auto-created)
```

## API Endpoints

- `GET /` - Main quote page
- `GET /admin` - Admin settings page
- `GET /api/settings` - Get current pricing settings
- `POST /api/settings` - Update pricing settings
- `POST /api/upload` - Upload and analyze CAD file
- `POST /api/order` - Submit order request (sends email notification with attached file)

## Supported File Formats

- STL (Stereolithography)
- OBJ (Wavefront OBJ)
- 3MF (3D Manufacturing Format)

## SEO & Search Engine Optimization

The website includes comprehensive SEO optimization:

- **Meta Tags**: Title, description, keywords optimized for "3D printing online quotes" and "3D printing pricing"
- **Location Targeting**: Optimized for Sarasota, Florida searches
- **Structured Data**: JSON-LD schema markup for LocalBusiness, Service, and WebApplication
- **Open Graph Tags**: For social media sharing (Facebook, LinkedIn, etc.)
- **Twitter Cards**: Optimized Twitter sharing
- **Robots.txt**: Configured to allow search engine crawling
- **Sitemap.xml**: Helps search engines index the site
- **Semantic HTML**: Proper heading structure and ARIA labels

### Important: Update Domain URLs

Before deploying, update the following URLs in `public/index.html`:
- Replace `https://lab007-3dprint.onrender.com/` with your actual Render domain
- Update canonical URLs
- Update Open Graph image URLs
- Update sitemap.xml location

## Order System

When a customer clicks "Order Now" after receiving a quote:
1. Customer provides name and email address
2. System sends email notification to `david.thomas@thinworld.net` with:
   - Customer information
   - Quote details
   - Attached STL file
3. Customer receives confirmation message
4. Uploaded file is cleaned up after email is sent

## Notes

- Uploaded files are temporarily stored (up to 24 hours) for order processing
- Settings are stored in `settings.json` (created automatically)
- Maximum file size: 50MB
- The STL parser uses the `node-stl` npm package for volume calculations
- Email notifications require SMTP configuration (see Environment Variables above)

