# Database Connection Testing Guide

## Web-Alert Database Connection

The Web-Alert service uses a PostgreSQL database. To check if the database connection is working, you can use these endpoints:

### 1. Test Database Connection
**Endpoint:** `https://your-render-url.onrender.com/webalert/api/test-db`

This endpoint will:
- Test the database connection
- Show the current database configuration (host, user, database, port)
- Return the current timestamp from the database if connected
- Show detailed error messages if connection fails

**Response (Success):**
```json
{
  "success": true,
  "timestamp": "2025-12-30T20:45:03.287Z",
  "dbConfig": {
    "host": "your_db_host",
    "user": "your_db_user",
    "database": "your_db_name",
    "port": "5432"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Error message here",
  "details": {
    "code": "error_code",
    "detail": "Detailed error message"
  }
}
```

### 2. Health Check Endpoint
**Endpoint:** `https://your-render-url.onrender.com/webalert/health`

This endpoint shows:
- Overall service status
- Database connection status
- Database configuration (without password)

### 3. Required Environment Variables

Make sure these environment variables are set in your Render dashboard:

```
DB_HOST=your_database_host
DB_USER=your_database_user
DB_NAME=your_database_name
DB_PASSWORD=your_database_password
DB_PORT=5432
```

### 4. Common Issues

1. **"Database pool not available"**
   - The database pool failed to initialize
   - Check that all DB_* environment variables are set correctly

2. **Connection timeout**
   - Database host is unreachable
   - Check that DB_HOST is correct
   - Verify database is accessible from Render's network

3. **Authentication failed**
   - DB_USER or DB_PASSWORD is incorrect
   - Double-check your credentials

4. **Database does not exist**
   - DB_NAME is incorrect
   - Verify the database name matches exactly

### 5. Testing Locally

To test the database connection locally, you can:

1. Set up a `.env` file with your database credentials
2. Run: `node -e "require('dotenv').config(); require('./Web-Alert/backend/config/db').checkHealth().then(console.log)"`

