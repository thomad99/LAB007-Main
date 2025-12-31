const { Pool } = require('pg');

// Helper function to extract hostname from database URL if provided
function getDbHost() {
    const dbHost = process.env.DB_HOST;
    if (!dbHost) return null;
    
    // If it's a full URL (starts with postgresql:// or postgres://), extract the hostname
    if (dbHost.startsWith('postgresql://') || dbHost.startsWith('postgres://')) {
        try {
            const url = new URL(dbHost);
            return url.hostname;
        } catch (e) {
            console.warn('Failed to parse DB_HOST as URL, using as-is:', e.message);
            return dbHost;
        }
    }
    
    // Otherwise, use it as-is (should be just the hostname)
    return dbHost;
}

// First, log the connection details we're using
const dbHost = getDbHost();
const dbConfig = {
    host: dbHost,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: true
};
console.log('Initializing database connection with:', dbConfig);
console.log('DB_HOST value (raw):', process.env.DB_HOST);
console.log('DB_HOST value (parsed hostname):', dbHost);

const pool = new Pool({
    host: dbHost,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: {
        rejectUnauthorized: false
    },
    // Add connection timeout and retry settings
    connectionTimeoutMillis: 10000, // Increased from 5000 to 10000
    idleTimeoutMillis: 30000,
    max: 20,
    // Add retry configuration
    retry: {
        max: 3,
        match: [
            /ETIMEDOUT/,
            /EHOSTUNREACH/,
            /ECONNRESET/,
            /ECONNREFUSED/,
            /ENOTFOUND/
        ]
    }
});

// Handle pool errors (non-fatal - just log the error)
pool.on('error', (err) => {
    console.error('Unexpected error on idle database client:', err);
    console.warn('Database pool error - server will continue running');
    // Don't exit - allow the server to continue and retry connections when needed
});

// Test the pool immediately
const testConnection = async () => {
    let client;
    try {
        client = await pool.connect();
        console.log('Database connection test - getting client successful');
        
        const result = await client.query('SELECT NOW() as now');
        console.log('Database connection test - query successful:', result.rows[0]);
        
        return true;
    } catch (err) {
        console.error('Database connection test failed:', err);
        return false;
    } finally {
        if (client) {
            client.release();
            console.log('Database connection test - client released');
        }
    }
};

// Execute the test immediately (non-blocking, non-fatal)
// The server will start even if the database connection fails initially
// Database will be used when API endpoints are called
testConnection().then(success => {
    if (!success) {
        console.warn('Initial database connection test failed - server will continue to start');
        console.warn('Database will be retried when API endpoints are accessed');
        console.warn('Make sure DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, and DB_PORT are set correctly');
    } else {
        console.log('Database connection test successful');
    }
}).catch(err => {
    console.warn('Database connection test error (non-fatal):', err.message);
    console.warn('Server will continue to start - database will be retried when needed');
});

const query = async (text, params) => {
    const start = Date.now();
    let client;
    let retries = 3;
    let lastError;

    // Retry logic for connection issues
    while (retries > 0) {
        try {
            client = await pool.connect();
            console.log('Got client for query:', { text, params });
            break; // Success, exit retry loop
        } catch (err) {
            lastError = err;
            retries--;
            if (retries > 0 && (err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED')) {
                console.warn(`Database connection attempt failed (${err.code}), retrying... (${retries} attempts left)`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
            } else {
                throw err; // Re-throw if not a retryable error or out of retries
            }
        }
    }

    if (!client) {
        throw lastError || new Error('Failed to get database client after retries');
    }

    try {

        const res = await client.query(text, params);
        const duration = Date.now() - start;
        
        console.log('Query executed successfully:', {
            text,
            duration,
            rows: res.rows.length,
            result: res.rows
        });
        
        return res;
    } catch (err) {
        console.error('Query failed:', {
            text,
            params,
            error: err.message,
            code: err.code,
            detail: err.detail,
            stack: err.stack
        });
        throw err;
    } finally {
        if (client) {
            client.release();
            console.log('Client released after query:', { text });
        }
    }
};

// Export a function to check database health
const checkHealth = async () => {
    try {
        const result = await query('SELECT NOW() as now');
        return {
            status: 'healthy',
            timestamp: result.rows[0].now,
            poolStatus: {
                totalCount: pool.totalCount,
                idleCount: pool.idleCount,
                waitingCount: pool.waitingCount
            }
        };
    } catch (err) {
        return {
            status: 'unhealthy',
            error: err.message,
            details: {
                code: err.code,
                detail: err.detail
            }
        };
    }
};

module.exports = {
    query,
    connect: (callback) => pool.connect(callback),
    pool,
    checkHealth
}; 