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
 * Idempotent startup migrations for database evolution
 * Ensures columns, constraints and indexes exist without wiping existing production data
 */
async function runStartupMigrations(conn, dbName) {
  try {
    // 1. Verify patients.user_id column
    const [cols] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'patients' AND COLUMN_NAME = 'user_id'
    `, [dbName]);

    if (cols.length === 0) {
      console.log(`[MIGRATION] Adding 'user_id' column to 'patients' table in '${dbName}'...`);
      await conn.query(`
        ALTER TABLE patients 
        ADD COLUMN user_id INT UNIQUE DEFAULT NULL AFTER patient_id
      `);
      try {
        await conn.query(`
          ALTER TABLE patients 
          ADD CONSTRAINT fk_patients_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        `);
      } catch (fkErr) {
        console.warn(`[MIGRATION] Notice: Could not add fk_patients_user: ${fkErr.message}`);
      }
      console.log(`[MIGRATION] 'user_id' column successfully added to 'patients'.`);
    } else {
      // Column exists, verify UNIQUE index on user_id
      const [indexes] = await conn.query(`
        SELECT INDEX_NAME 
        FROM information_schema.STATISTICS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'patients' AND COLUMN_NAME = 'user_id' AND NON_UNIQUE = 0
      `, [dbName]);

      if (indexes.length === 0) {
        console.log(`[MIGRATION] Ensuring UNIQUE constraint on 'patients.user_id'...`);
        try {
          await conn.query(`ALTER TABLE patients ADD UNIQUE (user_id)`);
        } catch (idxErr) {
          console.warn(`[MIGRATION] Notice: Unique constraint check: ${idxErr.message}`);
        }
      }
    }

    // 2. Safe, idempotent auto-linking of unlinked Patient users
    let autoLinkedCount = 0;

    // Specific linking check: user nagavigneshregonda@gmail.com to patient MV-2026-0059
    try {
      const [nagaUsers] = await conn.query(`
        SELECT id, email FROM users WHERE LOWER(email) = 'nagavigneshregonda@gmail.com' AND role = 'Patient'
      `);
      if (nagaUsers.length > 0) {
        const uId = nagaUsers[0].id;
        const [nagaLink] = await conn.query(`
          SELECT id FROM patients WHERE user_id = ? AND is_deleted = 0
        `, [uId]);
        if (nagaLink.length === 0) {
          const [targetPat] = await conn.query(`
            SELECT id FROM patients WHERE patient_id = 'MV-2026-0059' AND user_id IS NULL AND is_deleted = 0
          `);
          if (targetPat.length > 0) {
            await conn.query(`
              UPDATE patients SET user_id = ?, updated_at = NOW() WHERE id = ?
            `, [uId, targetPat[0].id]);
            autoLinkedCount++;
            console.log(`[MIGRATION] Linked nagavigneshregonda@gmail.com to patient MV-2026-0059.`);
          }
        }
      }
    } catch (nagaErr) {
      console.warn(`[MIGRATION] Notice checking nagavigneshregonda link: ${nagaErr.message}`);
    }

    // General auto-link: unlinked Patient users by exact email match (only if exactly 1 unlinked match)
    try {
      const [unlinkedPatientUsers] = await conn.query(`
        SELECT u.id, u.email 
        FROM users u
        LEFT JOIN patients p ON p.user_id = u.id AND p.is_deleted = 0
        WHERE u.role = 'Patient' AND p.id IS NULL
      `);

      for (const u of unlinkedPatientUsers) {
        const cleanEmail = (u.email || '').trim().toLowerCase();
        if (!cleanEmail) continue;

        const [matchingPatients] = await conn.query(`
          SELECT id, patient_id FROM patients 
          WHERE user_id IS NULL AND is_deleted = 0 AND LOWER(TRIM(email)) = ?
        `, [cleanEmail]);

        if (matchingPatients.length === 1) {
          await conn.query(`
            UPDATE patients SET user_id = ?, updated_at = NOW() WHERE id = ?
          `, [u.id, matchingPatients[0].id]);
          autoLinkedCount++;
          console.log(`[MIGRATION] Auto-linked Patient user ${u.email} to patient ${matchingPatients[0].patient_id}.`);
        }
      }
    } catch (linkErr) {
      console.warn(`[MIGRATION] Notice auto-linking unlinked patient accounts: ${linkErr.message}`);
    }

    if (autoLinkedCount > 0) {
      console.log(`[MIGRATION] Auto-linked ${autoLinkedCount} unlinked Patient user account(s).`);
    }

    // 3. Ensure patient MV-2026-0060 is accurately configured for patient self-service activation
    try {
      const [pat60] = await conn.query(`SELECT id, patient_id, user_id, email, dob FROM patients WHERE patient_id = 'MV-2026-0060'`);
      if (pat60.length > 0) {
        // If it was linked to the old dummy test user or has dummy email, reset it so the patient can activate
        if (pat60[0].email && pat60[0].email.includes('sarah.jenkins')) {
          await conn.query(`
            UPDATE patients 
            SET email = '2403a51153@sru.edu.in',
                dob = '2007-05-04',
                user_id = NULL,
                updated_at = NOW() 
            WHERE patient_id = 'MV-2026-0060'
          `);
          await conn.query(`DELETE FROM users WHERE email LIKE 'sarah.jenkins%@example.com'`);
          console.log(`[MIGRATION] Reset patient MV-2026-0060 to 2403a51153@sru.edu.in (DOB: 2007-05-04) for activation.`);
        }
      } else {
        // If MV-2026-0060 does not exist, provision it as an unlinked patient profile
        await conn.query(`
          INSERT INTO patients (patient_id, first_name, last_name, dob, gender, blood_group, phone, email, is_deleted)
          VALUES ('MV-2026-0060', 'Student', 'Patient', '2007-05-04', 'Male', 'O+', '+91 9392860162', '2403a51153@sru.edu.in', 0)
        `);
        console.log(`[MIGRATION] Provisioned unlinked patient MV-2026-0060 for 2403a51153@sru.edu.in.`);
      }
    } catch (pat60Err) {
      console.warn(`[MIGRATION] Notice checking MV-2026-0060: ${pat60Err.message}`);
    }
  } catch (migErr) {
    console.warn(`[MIGRATION] Startup migration check warning: ${migErr.message}`);
  }
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
    } else {
      // Run idempotent startup migrations on existing databases
      await runStartupMigrations(conn, dbName);
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
