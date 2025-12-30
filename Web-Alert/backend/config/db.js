const { Pool } = require('pg');

// First, log the connection details we're using
console.log('Initializing database connection with:', {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: true
});

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: {
        rejectUnauthorized: false
    },
    // Add connection timeout and retry settings
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    max: 20
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

    try {
        client = await pool.connect();
        console.log('Got client for query:', { text, params });

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