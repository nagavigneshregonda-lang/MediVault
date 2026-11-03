/**
 * MediVault MySQL Database Configuration & Connection Pool
 * Engine: MySQL 8.0+ via mysql2/promise
 * Supports: Local MySQL, Cloud-hosted MySQL (Aiven, AWS RDS, DigitalOcean, etc.)
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

let pool = null;
let currentDbName = null;

/**
 * Obtain or configure the active connection pool
 */
function getPool() {
  if (!pool) {
    throw new Error('Database pool has not been initialized. Please call initDatabase() first.');
  }
  return pool;
}

/**
 * Execute a query via connection pool
 */
async function query(sql, params = []) {
  const p = getPool();
  return p.query(sql, params);
}

/**
 * Execute a prepared statement via connection pool
 */
async function execute(sql, params = []) {
  const p = getPool();
  return p.execute(sql, params);
}

/**
 * Get dedicated connection from pool (for transactions)
 */
async function getConnection() {
  const p = getPool();
  return p.getConnection();
}

/**
 * Helper to display clear diagnostic messages when MySQL connection fails
 */
function printConnectionHelp(err, host, port, user, dbName, useSsl) {
  console.error('\n======================================================================');
  console.error('❌ [DATABASE ERROR] Unable to connect to MySQL database server.');
  console.error('----------------------------------------------------------------------');
  console.error('Please verify the following:');
  console.error(`  1. Is MySQL server running and reachable at ${host}:${port}?`);
  console.error('     - Windows: Open Services (services.msc) and ensure "MySQL80" is Running');
  console.error('     - Cloud (Aiven): Ensure service is RUNNING and IP filtering allows connections');
  console.error('  2. Verify your credentials in the environment variables / .env:');
  console.error(`     - DB_HOST: ${host}`);
  console.error(`     - DB_PORT: ${port}`);
  console.error(`     - DB_USER: ${user}`);
  console.error('     - DB_PASSWORD: [set in environment variables]');
  console.error(`     - DB_NAME: ${dbName}`);
  console.error(`     - DB_SSL: ${useSsl ? 'true (SSL enabled)' : 'false'}`);
  console.error(`  3. MySQL Server error message: ${err.message} (${err.code || 'UNKNOWN'})`);
  console.error('======================================================================\n');
}

/**
 * Helper to construct base connection options from environment variables
 */
function buildConnectionOptions(customDbName, includeDatabase = true) {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  // Password passed as standalone option, never embedded in a URL string
  const password = process.env.DB_PASSWORD || '';
  const dbName = customDbName || process.env.DB_NAME || 'medivault';
  const useSsl = String(process.env.DB_SSL).toLowerCase() === 'true' || process.env.DB_SSL === '1';

  const options = {
    host,
    port,
    user,
    password,
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0,
    multipleStatements: true,
    timezone: 'Z',
    decimalNumbers: true
  };

  if (useSsl) {
    options.ssl = { rejectUnauthorized: false };
  }

  if (includeDatabase) {
    options.database = dbName;
  }

  return { options, host, port, user, password, dbName, useSsl };
}

/**
 * Initialize database, create schema if missing, and auto-seed if empty
 * Handles managed cloud instances (Aiven) where CREATE DATABASE is pre-managed or restricted
 */
async function initDatabase(customDbName) {
  const { options, host, port, user, dbName, useSsl } = buildConnectionOptions(customDbName, true);
  currentDbName = dbName;

  // 1. Check if database already exists by attempting a direct test connection
  let dbAlreadyExists = false;
  try {
    const directTestConn = await mysql.createConnection(options);
    await directTestConn.query('SELECT 1');
    await directTestConn.end();
    dbAlreadyExists = true;
    console.log(`[DB INIT] Target database '${dbName}' exists and is accessible. Skipping CREATE DATABASE.`);
  } catch (err) {
    // If database does not exist (ER_BAD_DB_ERROR / 1049), attempt creation if permissions permit
    if (err.code === 'ER_BAD_DB_ERROR' || err.errno === 1049) {
      dbAlreadyExists = false;
    } else {
      // For any other error (e.g. auth failed, wrong host), warn and attempt standard init
      dbAlreadyExists = false;
    }
  }

  // 2. If database does NOT exist, attempt creation (local root or unmanaged instances)
  if (!dbAlreadyExists) {
    const { options: noDbOptions } = buildConnectionOptions(customDbName, false);
    try {
      const initialConn = await mysql.createConnection(noDbOptions);
      try {
        await initialConn.query(
          `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
        );
        console.log(`[DB INIT] Database '${dbName}' created or confirmed.`);
      } finally {
        await initialConn.end();
      }
    } catch (err) {
      // If user lacks CREATE DATABASE privileges (managed cloud MySQL like Aiven), skip gracefully
      console.log(`[DB INIT] Notice: CREATE DATABASE skipped (${err.message}). Proceeding directly with database '${dbName}'.`);
    }
  }

  // 3. Close existing pool if re-initializing
  if (pool) {
    try {
      await pool.end();
    } catch (_) {}
    pool = null;
  }

  // 4. Create persistent connection pool for the target database
  try {
    pool = mysql.createPool(options);
  } catch (err) {
    printConnectionHelp(err, host, port, user, dbName, useSsl);
    throw err;
  }

  // 5. Verify pool connectivity
  let conn;
  try {
    conn = await pool.getConnection();
  } catch (err) {
    printConnectionHelp(err, host, port, user, dbName, useSsl);
    throw err;
  }

  try {
    // 6. Check if tables exist (check if 'users' table is queryable)
    let tablesExist = false;
    try {
      await conn.query('SELECT 1 FROM users LIMIT 1');
      tablesExist = true;
    } catch (tblErr) {
      if (tblErr.code === 'ER_NO_SUCH_TABLE' || tblErr.errno === 1146) {
        tablesExist = false;
      } else {
        // Fallback to information_schema check
        try {
          const [tables] = await conn.query(
            `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND LOWER(TABLE_NAME) = 'users'`,
            [dbName]
          );
          tablesExist = tables.length > 0;
        } catch (_) {
          tablesExist = false;
        }
      }
    }

    if (!tablesExist) {
      console.log(`[DB INIT] Tables missing in '${dbName}'. Applying schema from database/schema.sql...`);
      const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await conn.query(schemaSql);
      console.log(`[DB INIT] Schema applied successfully.`);
    }

    // 7. Check if auto-seed is required (empty users table)
    // Ensures idempotency: if users exist, NEVER duplicate or re-seed on restart
    const [userCount] = await conn.query('SELECT COUNT(*) AS total FROM users');
    const totalUsers = Number(userCount[0]?.total || 0);

    if (totalUsers === 0) {
      console.log(`[DB INIT] Database '${dbName}' is empty. Running auto-seeder...`);
      const { seedDatabase } = require('../db/seed');
      await seedDatabase(pool);
      console.log(`[DB INIT] Auto-seeding completed.`);
    } else {
      console.log(`[DB INIT] Database '${dbName}' already initialized (${totalUsers} users present). Skipping auto-seed.`);
    }
  } finally {
    conn.release();
  }

  return pool;
}

/**
 * Retrieve telemetry stats for System Health monitoring
 */
async function getPoolStats() {
  if (!pool) return null;
  
  let mysqlVersion = 'Unknown';
  try {
    const [rows] = await pool.query('SELECT VERSION() AS version');
    if (rows && rows[0]) {
      mysqlVersion = rows[0].version;
    }
  } catch (_) {}

  // mysql2 internal pool stats
  const internalPool = pool.pool;
  const total = internalPool ? (internalPool._allConnections ? internalPool._allConnections.length : 0) : 0;
  const free = internalPool ? (internalPool._freeConnections ? internalPool._freeConnections.length : 0) : 0;
  const active = Math.max(0, total - free);
  const useSsl = String(process.env.DB_SSL).toLowerCase() === 'true' || process.env.DB_SSL === '1';

  return {
    engine: `MySQL ${mysqlVersion} (InnoDB)`,
    version: mysqlVersion,
    status: 'Healthy & Connected',
    databaseName: currentDbName || process.env.DB_NAME || 'medivault',
    sslEnabled: useSsl,
    activeConnections: active,
    idleConnections: free,
    totalConnections: total,
    connectionLimit: 15
  };
}

/**
 * Close pool cleanly on app termination
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  query,
  execute,
  getConnection,
  initDatabase,
  closePool,
  getPoolStats
};
