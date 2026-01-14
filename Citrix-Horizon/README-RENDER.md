# Deploying to Render

This guide explains how to deploy the Citrix Audit Dashboard to Render web services.

## Prerequisites

1. A GitHub account with this repository
2. A Render account (free tier available)
3. Your code pushed to GitHub

## Deployment Steps

### 1. Push Code to GitHub

First, ensure your code is on GitHub:

```powershell
.\Sync-ToGitHub.ps1
```

### 2. Create Render Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub account if not already connected
4. Select the repository: `thomad99/CitrixtoHZ`
5. Configure the service:
   - **Name**: `citrix-audit-dashboard` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or your preferred plan)

### 3. Environment Variables (Optional)

You can set these in Render dashboard under "Environment":
- `NODE_ENV`: `production`
- `PORT`: `3000` (Render sets this automatically, but you can override)

### 4. Deploy

Click "Create Web Service" and Render will:
1. Clone your repository
2. Run `npm install`
3. Start the server with `npm start`
4. Provide you with a URL (e.g., `https://citrix-audit-dashboard.onrender.com`)

## Using the Deployed Service

### Upload Audit Data

1. Visit your Render URL
2. Click "Choose JSON File" or drag and drop your `citrix-audit-complete.json`
3. Click "Upload File"
4. You'll be redirected to the dashboard

### Download Audit Scripts

1. On the upload page, click "Download Audit Files (ZIP)"
2. Extract the ZIP file on your local machine
3. Run the audit scripts on your Citrix environment
4. Upload the generated JSON file back to the web service

## Features

- **File Upload**: Upload JSON audit files via web interface
- **File Storage**: Uploaded files are stored on the server
- **Dashboard View**: View audit data in the interactive dashboard
- **ZIP Download**: Download all audit scripts as a ZIP file
- **Mobile Access**: Access from any device with internet connection

## File Storage

Uploaded files are stored in the `uploads/` directory on the Render server. Files persist across deployments but may be cleared if you redeploy or the service restarts.

For production use, consider:
- Using Render's persistent disk storage
- Integrating with cloud storage (S3, etc.)
- Database storage for multiple users

## Troubleshooting

### Build Fails

- Check that `package.json` is in the root directory
- Verify Node.js version compatibility (requires Node 18+)

### Upload Fails

- Check file size (100MB limit)
- Ensure file is valid JSON
- Check Render logs for errors

### Files Not Persisting

- Render free tier may clear files on restart
- Consider upgrading to paid plan for persistent storage
- Or use external storage service

## Custom Domain

You can add a custom domain in Render dashboard:
1. Go to your service settings
2. Click "Custom Domains"
3. Add your domain
4. Follow DNS configuration instructions

## API Endpoints

- `GET /` - Upload page
- `GET /dashboard` - Dashboard view
- `GET /todo` - To-do checklist
- `POST /api/upload` - Upload JSON file
- `GET /api/files` - List uploaded files
- `GET /api/download/:filename` - Download specific file
- `GET /api/download-audit-files` - Download audit scripts ZIP
- `GET /api/health` - Health check

