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

## Verify Environment Variable

**Before restarting**, verify in Render that `DB_HOST` is set correctly:

1. Go to your service in Render dashboard
2. Click on **"Environment"** tab
3. Find `DB_HOST` in the list
4. Verify it is: `dpg-culanb8gph6c73d9j150-a`
   - ✅ CORRECT: `dpg-culanb8gph6c73d9j150-a` (has "1" before "50")
   - ❌ WRONG: `dpg-culanb8gph6c73d9jl50-a` (missing "1")

If it's wrong, edit it and save, then restart the service.

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

