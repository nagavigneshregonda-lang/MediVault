/**
 * MediVault MySQL Database Configuration & Connection Pool
 * Engine: MySQL 8.0+ via mysql2/promise
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
function printConnectionHelp(err, host, port, user, dbName) {
  console.error('\n======================================================================');
  console.error('❌ [DATABASE ERROR] Unable to connect to MySQL database server.');
  console.error('----------------------------------------------------------------------');
  console.error('Please verify the following:');
  console.error(`  1. Is MySQL server running on ${host}:${port}?`);
  console.error('     - Windows: Open Services (services.msc) and ensure "MySQL80" is Running');
  console.error('     - Or run: net start MySQL80 in an Administrator terminal');
  console.error('  2. Verify your credentials in the local .env file:');
  console.error(`     - DB_HOST: ${host}`);
  console.error(`     - DB_PORT: ${port}`);
  console.error(`     - DB_USER: ${user}`);
  console.error('     - DB_PASSWORD: [set in local .env]');
  console.error(`     - DB_NAME: ${dbName}`);
  console.error(`  3. MySQL Server error message: ${err.message} (${err.code || 'UNKNOWN'})`);
  console.error('======================================================================\n');
}

/**
 * Initialize database, create schema if missing, and auto-seed if empty
 */
async function initDatabase(customDbName) {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  // Password passed as standalone option, never embedded in a URL string
  const password = process.env.DB_PASSWORD || '';
  const dbName = customDbName || process.env.DB_NAME || 'medivault';

  currentDbName = dbName;

  // 1. Initial connection to create database if not exists
  let initialConn;
  try {
    initialConn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true
    });
  } catch (err) {
    printConnectionHelp(err, host, port, user, dbName);
    throw err;
  }

  try {
    await initialConn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
  } finally {
    await initialConn.end();
  }

  // 2. Close existing pool if re-initializing
  if (pool) {
    try {
      await pool.end();
    } catch (_) {}
    pool = null;
  }

  // 3. Create persistent connection pool for the target database
  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database: dbName,
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0,
    multipleStatements: true,
    timezone: 'Z',
    decimalNumbers: true
  });

  // Verify pool connectivity
  const conn = await pool.getConnection();
  try {
    // 4. Check if tables exist; if users table missing, execute schema.sql
    const [tables] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'`,
      [dbName]
    );

    if (tables.length === 0) {
      console.log(`[DB INIT] Tables missing in '${dbName}'. Applying schema from database/schema.sql...`);
      const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await conn.query(schemaSql);
      console.log(`[DB INIT] Schema applied successfully.`);
    }

    // 5. Check if auto-seed is required (empty users table)
    const [userCount] = await conn.query('SELECT COUNT(*) AS total FROM users');
    if (userCount[0].total === 0) {
      console.log(`[DB INIT] Database '${dbName}' is empty. Running auto-seeder...`);
      const { seedDatabase } = require('../db/seed');
      await seedDatabase(pool);
      console.log(`[DB INIT] Auto-seeding completed.`);
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

  return {
    engine: `MySQL ${mysqlVersion} (InnoDB)`,
    version: mysqlVersion,
    status: 'Healthy & Connected',
    databaseName: currentDbName || process.env.DB_NAME || 'medivault',
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
