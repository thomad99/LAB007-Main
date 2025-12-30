# Database Connection Fix Guide

## Current Issue

The database connection is failing because the database pool was created with an incorrect hostname. The pool is created once when the server starts, and it caches the connection configuration.

**Error:** `getaddrinfo ENOTFOUND dpg-culanb8gph6c73d9jl50-a`
**Correct hostname:** `dpg-culanb8gph6c73d9j150-a` (note the "1" before "50")

## Solution: Restart the Service on Render

The database pool needs to be recreated with the correct hostname. To do this:

1. **Go to your Render Dashboard:** https://dashboard.render.com
2. **Navigate to your service:** `lab007-main` (or whatever you named it)
3. **Click "Manual Deploy"** → **"Clear build cache & deploy"**
   - OR click the **three dots menu (⋮)** → **"Restart"**

This will restart the service and recreate the database pool with the current environment variable values.

## Get the Correct Database Hostname

**For Render PostgreSQL databases, you need the INTERNAL hostname** (for services on Render):

1. Go to your **PostgreSQL database** in Render dashboard (not the web service)
2. Click on the database name to open it
3. Go to the **"Info"** or **"Connections"** tab
4. Look for **"Internal Database URL"** or **"Internal Hostname"**
5. The hostname should look like: `dpg-xxxxx-xxxxx-xxxxx-a` (ends with `-a`)
   - It may also include `.render.com` at the end - that's fine
   - Example: `dpg-culanb8gph6c73d9j150-a.render.com` or `dpg-culanb8gph6c73d9j150-a`

## Update Environment Variable

1. Go to your **web service** (`lab007-main`) in Render dashboard
2. Click on **"Environment"** tab
3. Find `DB_HOST` in the list
4. **IMPORTANT:** `DB_HOST` should contain **ONLY the hostname**, NOT the full connection URL
   - ✅ CORRECT: `dpg-culanb8gph6c73d9j150-a.render.com` or `dpg-culanb8gph6c73d9j150-a`
   - ❌ WRONG: `postgresql://user:pass@dpg-xxxxx-a/dbname` (full URL)
5. **Edit** it and paste **just the hostname** (extract from the Internal Database URL if needed)
6. Click **"Save Changes"**
7. **Restart the service** (see instructions above)

**Note:** 
- For services running on Render, always use the INTERNAL hostname (ending with `-a`)
- The code now automatically extracts the hostname if you accidentally provide a full URL, but it's better to set just the hostname
- External hostnames are only needed if connecting from outside Render

## After Restart

After restarting, check the logs. You should see:
```
Initializing database connection with: {
  host: 'dpg-culanb8gph6c73d9j150-a',
  ...
}
DB_HOST value: dpg-culanb8gph6c73d9j150-a
```

And the database connection should work correctly.

## Test the Connection

After restarting, test the connection:
- Health check: `https://lab007-main.onrender.com/webalert/health`
- Database test: `https://lab007-main.onrender.com/webalert/api/test-db`

Both should show `dbConnected: true` and the correct hostname.

