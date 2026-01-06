# GitHub Sync Setup for Debug Files

## Overview
The debug file upload feature automatically syncs uploaded debug ZIP files to your GitHub repository. This ensures that debug files are preserved even though Render's filesystem is non-persistent.

## Setup Instructions

### 1. Create a GitHub Personal Access Token (PAT)

1. Go to GitHub: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Give it a descriptive name: `LAB007-Citrix-Dashboard-Debug-Sync`
4. Set expiration (recommended: 90 days or custom)
5. Select the following scopes:
   - ✅ `repo` (Full control of private repositories)
     - This includes: `repo:status`, `repo_deployment`, `public_repo`, `repo:invite`, `security_events`
6. Click **"Generate token"**
7. **IMPORTANT:** Copy the token immediately (you won't see it again!)

### 2. Configure Environment Variable on Render

1. Go to your Render dashboard: https://dashboard.render.com
2. Select your service (Citrix Audit Dashboard)
3. Go to **Environment** tab
4. Click **"Add Environment Variable"**
5. Add the following:
   - **Key:** `GITHUB_TOKEN`
   - **Value:** `your-github-token-here` (paste the token you copied)
6. Click **"Save Changes"**
7. Render will automatically restart your service

### 3. Optional: Configure Repository and Branch

You can also set these optional environment variables:

- **GITHUB_REPO** (default: `thomad99/CitrixtoHZ`)
  - Format: `username/repository`
  
- **GITHUB_BRANCH** (default: `master`)
  - The branch where files will be uploaded

## How It Works

1. **User uploads debug ZIP** via the web interface
2. **File is saved** to Render's temporary storage (`uploads/debug/`)
3. **Automatically syncs to GitHub** in the background:
   - Location: `Citrix-Horizon/Debug/{filename}`
   - Uses GitHub API to create/update files
   - If file exists, it updates it; otherwise creates new file
4. **File is accessible** from GitHub repository

## File Location on GitHub

Debug files are stored at:
```
https://github.com/thomad99/CitrixtoHZ/tree/master/Citrix-Horizon/Debug
```

## Troubleshooting

### Issue: "GITHUB_TOKEN not configured"
**Solution:** Make sure you've added the `GITHUB_TOKEN` environment variable in Render dashboard.

### Issue: "GitHub API returned status 401"
**Solution:** 
- Check that your token is valid and not expired
- Verify the token has `repo` scope
- Regenerate token if needed

### Issue: "GitHub API returned status 403"
**Solution:**
- Verify you have write access to the repository
- Check that the token has `repo` scope
- Ensure the repository exists and is accessible

### Issue: "GitHub API returned status 404"
**Solution:**
- Verify the repository name is correct (`GITHUB_REPO` environment variable)
- Check that the branch exists (`GITHUB_BRANCH` environment variable)
- Ensure the repository path is correct

### Issue: Files not appearing on GitHub
**Solution:**
- Check Render logs for GitHub sync errors
- Verify the token has correct permissions
- Check that the `Citrix-Horizon/Debug/` folder exists in your repository (GitHub will create it automatically)

## Security Notes

- ⚠️ **Never commit the GITHUB_TOKEN to your code**
- ✅ **Always use environment variables** for sensitive data
- ✅ **Use tokens with minimal required permissions** (only `repo` scope)
- ✅ **Set token expiration** and rotate regularly
- ✅ **Monitor token usage** in GitHub settings

## Testing

After setup, you can test by:

1. Upload a debug ZIP file via the web interface
2. Check Render logs for: `Successfully synced {filename} to GitHub`
3. Visit: https://github.com/thomad99/CitrixtoHZ/tree/master/Citrix-Horizon/Debug
4. Verify your file appears there

## Manual Sync (if needed)

If automatic sync fails, you can manually sync files using:

```powershell
# Navigate to project
cd Citrix-Horizon

# Use git to add and commit debug files
git add Debug/*.zip
git commit -m "Add debug files"
git push origin master
```

## Support

For issues or questions:
- Check Render service logs
- Verify environment variables are set correctly
- Ensure GitHub token has proper permissions
- Contact LAB007.AI support if needed

