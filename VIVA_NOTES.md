# MediVault: Academic Viva & Technical Defense Guide

> **This document is prepared specifically for college viva examinations, project presentations, and technical interviews. It explains every design decision, algorithm, architectural pattern, and database concept in simple, crystal-clear terms.**

---

## 1. High-Level Architecture Explanation

MediVault follows an enterprise **Layered Client-Server Architecture** composed of three primary tiers:

```
[ Frontend: HTML5 / Modern CSS3 / Vanilla JS SPA (ES Modules) ]
                           │
                  HTTP / REST / JSON / JWT (Bearer)
                           │
[ Application Tier: Node.js + Express REST API ]
     ├── Routing & express-validator Layer
     ├── Authentication & RBAC Middleware (Admin, Doctor, Patient, Lab Tech)
     ├── Dynamic Patient Access & Consent Guard (Relationship Check)
     ├── Clinical Business Logic & Drug Allergy Cross-Reaction Engine
     └── Regulatory Audit Trail Logger
                           │
              Parameterized SQL Statements (?) via mysql2/promise
                           │
[ Data Tier: MySQL 8.0+ (InnoDB Engine) with Connection Pool & Foreign Keys ]
```

1. **Presentation Tier (Frontend)**:
   - Built using modern **Vanilla JavaScript (ES Modules)** with a hash-based single page application (SPA) router (`#dashboard`, `#patients`, `#patient/:id`, `#tests`, `#access`, `#audit`, `#users`).
   - Utilizes CSS variables for instantaneous dark/light mode switching and glassmorphism styling.
   - Communicates with the backend exclusively via asynchronous `fetch()` requests carrying signed JWT tokens.

2. **Application Tier (Backend REST API)**:
   - Powered by **Node.js and Express**.
   - Modularized into `controllers/` (business logic), `middleware/` (security guards), `routes/` (URL definitions), `config/db.js` (connection pooling), and `utils/` (reusable clinical helpers).
   - Enforces the **Fail-Closed Principle**: access is denied by default unless an explicit permission or authorized relationship match is verified.

3. **Data Tier (Persistence)**:
   - **MySQL 8.0+** using the ACID-compliant **InnoDB** transactional storage engine.
   - Managed via a persistent connection pool using `mysql2/promise` with automatic reconnection, queue limits, and resource optimization.
   - All queries use parameterized statements (`?`) to guarantee absolute protection against SQL injection attacks.

---

## 2. How Login & JWT Authentication Work

```
User enters Email & Password
           │
           ▼
Server verifies email in MySQL (users table)
           │
           ▼
bcrypt.compare(password, user.password_hash)
   ├── Match False  ──> HTTP 401 Unauthorized (constant-time check)
   └── Match True   ──> Generate JWT Token
                              │
                    jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
                              │
                    Return { token, user } in JSON & set httpOnly Cookie
```

### The Authentication Flow Step-by-Step:
1. The user enters their email and password on the split-screen login page.
2. The server queries the `users` table using a parameterized statement. If the email is not found, a generic `401 Unauthorized` is returned (preventing username enumeration attacks).
3. The server runs `bcrypt.compare(plaintextPassword, user.password_hash)`. Bcrypt uses salted SHA-512 hashing with a cost factor of 10.
4. If valid, the server calls `jwt.sign()` containing the claims: `{ id, name, email, role }` signed with a secret key (`HMAC-SHA256`).
5. The token is sent to the browser and stored in `localStorage` for Authorization headers (`Bearer <token>`).
6. On every subsequent API request, the `authenticate` middleware decodes the token using `jwt.verify()`, checks if the user still exists in MySQL, and attaches the user object to `req.user`.

---

## 3. How Patient-Authorized Access Control Works

The most critical security feature of MediVault is its **Multi-Factor Clinical Access Guard** implemented in `server/middleware/patientAccess.js`.

```
Incoming Request for Patient Chart
               │
               ▼
   Is user role 'Admin'? ───────────────► [ YES ] ──> Allow Access
               │ [ NO ]
               ▼
   Is user role 'Patient'? ─────────────► [ YES ] ──> Does patient.user_id === req.user.id?
               │ [ NO ]                                   ├── YES ──> Allow Access
               │                                          └── NO  ──> Deny (403 Forbidden)
               ▼
   Is user role 'Doctor'? ──────────────► [ YES ] ──> Is doctor assigned (patient.assigned_doctor_id)?
               │ [ NO ]                                   ├── YES ──> Allow Access
               │                                          └── NO  ──> Does an active, non-expired grant
               ▼                                                      exist in patient_access_grants?
   Is user role 'Lab Tech'?                                               ├── YES ──> Allow Access
       ├── YES (Diagnostics Only)                                         └── NO  ──> Deny (403 Forbidden)
       └── NO  (Blocked: 403 Forbidden)
```

### Key Takeaway for Viva:
> *"Doctor authorization is not just a role check; it is a **relationship check**. Even a registered doctor cannot view a patient's chart unless they are assigned as the attending physician or the patient has explicitly granted them active, non-expired consent in MySQL."*

---

## 4. Database Schema & Relational Integrity

1. **`users`**: Stores authentication credentials, hashed passwords, roles (`Admin`, `Doctor`, `Patient`, `Lab Technician`), phone, and medical license numbers.
2. **`patients`**: Stores longitudinal patient profiles, unique generated IDs (`MV-2026-XXXX`), blood groups, height, weight, allergies, chronic conditions, and assigned doctor FK. Contains `is_deleted` column for soft-delete.
3. **`medical_history`**: Stores diagnoses, surgeries, visits, vaccinations, and hospitalizations linked to `patient_id` with severity tags and FK to `users`.
4. **`prescriptions`**: Stores prescribed medications, dosage, frequency, duration, start/end dates, instructions, status (`Active`, `Completed`, `Cancelled`), and prescribing doctor FK.
5. **`test_records`**: Stores laboratory tests, category (`Blood`, `Imaging`, `Urine`, `Stool`, etc.), ordered date, result value, units, reference range, status, and automated flags (`Normal`, `High`, `Low`, `Critical`).
6. **`patient_access_grants`**: Stores patient consent grants linking a `patient_id` to a `doctor_id` with `status` (`Granted`, `Revoked`) and an optional `expires_at` DATETIME.
7. **`audit_logs`**: Permanent event ledger recording actor, action (`CREATE`, `VIEW`, `UPDATE`, `DELETE`, `ACCESS_GRANT`, `ACCESS_REVOKE`), target resource, details, timestamp, and IP address.

---

## 5. Walkthrough of a Full CRUD Flow (Prescription Lifecycle)

1. **Create (`POST /api/patients/:id/prescriptions`)**:
   - Doctor submits medication name (e.g., *Amoxicillin*).
   - Middleware `checkPatientAccess` verifies doctor has authorized access to the patient in MySQL.
   - Business rule `checkDrugAllergyConflict()` inspects the patient's recorded allergies. If patient has a *Penicillin* allergy, the API intercepts the request and responds with `409 DRUG_ALLERGY_CONFLICT`.
   - The UI displays a warning modal. If the physician confirms clinical necessity and checks the override checkbox, the prescription is persisted with status `Active`.
   - An audit record is created: `Doctor prescribed Amoxicillin (500mg) for MV-2026-0001 [Override Confirmed]`.

2. **Read (`GET /api/patients/:id/prescriptions`)**:
   - Patient or doctor views active medications table.
   - Clicking "Print" fetches `/api/patients/:id/prescriptions/:prId` and renders the print stylesheet (`print.css`).

3. **Update (`PATCH /api/patients/:id/prescriptions/:prId/status`)**:
   - When the course finishes, the physician marks status as `Completed`.
   - Audit trail records status transition.

4. **Delete / Discontinue**:
   - If discontinued early, status is marked `Cancelled` with clinical justification notes, preserving audit history without destroying medical evidence.

---

## 6. Security Measures Implemented

1. **Zero SQL Injection**: 100% of database queries use parameterized placeholders (`?`). No SQL string concatenation exists anywhere.
2. **Password Cryptography**: Passwords hashed using bcrypt with salt rounds = 10. Plaintext passwords are never logged or stored.
3. **Cross-Site Scripting (XSS) Prevention**: Content Security Policy (CSP) enforced via Helmet; modern DOM innerText and escaped data bindings used throughout the UI.
4. **Brute-Force Rate Limiting**: `express-rate-limit` caps login requests at 50 attempts per 15-minute window per IP.
5. **Role-Based Authorization & Separation of Concerns**: Strict middleware layers prevent privilege escalation. Patients cannot view other patients; Lab Technicians cannot alter prescriptions or clinical diagnoses.
6. **Soft Delete**: Patient records are never hard-deleted; `is_deleted = 1` retains data integrity while removing them from active clinical lists.

---

## 7. Core General Viva Questions & Model Answers

### Q1: What is MediVault and what problem does it solve?
**Answer**: MediVault is a secure, role-based Electronic Health Record (EHR) web application that centralizes patient demographics, medical history, prescriptions, and laboratory tests while enforcing patient-controlled consent and dynamic provider access authorization.

### Q2: Why did you choose MySQL over NoSQL (like MongoDB) for MediVault?
**Answer**: Healthcare data is inherently relational with strict referential integrity requirements: prescriptions, test records, access grants, and audit logs must reference valid patient and user IDs. MySQL with the InnoDB engine guarantees ACID compliance, foreign key constraints with cascade/restrict rules, and predictable indexing, preventing orphaned medical records and data corruption.

### Q3: What is JWT and how is it structured?
**Answer**: JSON Web Token is a compact, URL-safe means of representing claims to be transferred between two parties. It consists of three parts separated by dots: Header (algorithm & token type), Payload (user ID, role, expiration), and Signature (HMAC-SHA256 hash using a server secret).

### Q4: How are passwords stored securely in MediVault?
**Answer**: Passwords are never stored in plaintext. They are hashed using `bcryptjs` with a salt factor of 10, protecting against rainbow table attacks and brute force.

### Q5: What is the difference between Authentication and Authorization in your app?
**Answer**: Authentication verifies *who the user is* (via email, password, and JWT in `authenticate` middleware). Authorization determines *what actions that user is permitted to perform* (via `authorizeRoles` and `checkPatientAccess`).

### Q6: How does the drug allergy cross-conflict warning work?
**Answer**: The helper `checkDrugAllergyConflict()` compares the prescribed medication name against the patient's recorded allergies using direct matching and a class-based cross-reactivity dictionary (e.g., penicillin cross-matching with amoxicillin, ampicillin, and augmentin). Conflicting prescriptions are stopped with an HTTP 409 status until explicitly overridden.

### Q7: How does automatic test flagging work?
**Answer**: When a lab technician enters a numeric result value, `autoFlagTestResult()` parses the normal reference range (e.g., "70 - 100 mg/dL") and automatically classifies the result as **Normal**, **High**, **Low**, or **Critical** (if exceeding 140% of the upper limit).

### Q8: What happens if an unauthorized doctor tries to access a patient's chart?
**Answer**: The backend `checkPatientAccess` middleware checks if the doctor is assigned to the patient or has an active record in `patient_access_grants`. If neither exists, it halts execution and returns HTTP 403 Forbidden with a clear security error message.

### Q9: Can access control be bypassed by tampering with the client-side UI?
**Answer**: No. Access control is strictly enforced on the server in Express middleware before any database query is executed. Hiding buttons in the UI is only for user experience; the backend is the authoritative security boundary.

### Q10: What is an Audit Trail and why is it mandatory in healthcare?
**Answer**: An audit trail is an append-only log recording who accessed or modified patient data, at what time, from what IP address, and what action was taken. It is required for accountability and HIPAA-inspired security practices.

### Q11: How does patient account linking and portal login work?
**Answer**: Each patient record has a nullable `UNIQUE user_id` foreign key referencing `users.id`. When an administrator registers a patient with a login account (or provisions one for an existing patient), the patient record and user record (role 'Patient') are created in ONE atomic database transaction (`conn.beginTransaction()`, `commit()`, `rollback()`). If an auto-generated temporary password is used, it is shown once to the administrator and never logged in plaintext.

### Q12: How are dashboards role-scoped for privacy?
**Answer**: `GET /api/stats/dashboard` returns strictly role-scoped telemetry. Admin sees facility-wide counts, full audit trails, and system health. Doctor sees only their assigned patients and active consent counts, their own prescriptions, and their ordered tests. Lab Technician sees the specimen worklist and test flag distributions with zero patient demographic data or audit data. Patient sees only their active prescriptions, completed test results, and authorized care team, with zero facility-wide counts.

### Q13: How is rate limiting implemented?
**Answer**: General API requests (`/api`) are rate limited to 1,000 requests per 15-minute window per IP (configurable via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`). Sensitive authentication endpoints (`/api/auth/login`) are capped at 15 attempts per 15-minute window with a friendly lockout notification to prevent brute-force credential stuffing.

---

## 8. Top 20 MySQL Questions & Detailed Model Answers for Viva

### Q1: What is the difference between InnoDB and MyISAM storage engines in MySQL, and why does MediVault use InnoDB?
**Answer**:
- **InnoDB**: Supports ACID transactions, foreign key constraints, row-level locking, and crash recovery via redo/undo logs.
- **MyISAM**: Does not support transactions, does not support foreign keys, and only provides table-level locking (causing write bottlenecks).
- **MediVault uses InnoDB** because medical data requires strict transactional integrity (e.g., recording consent grants and logging audits atomically) and referential integrity between patients, prescriptions, tests, and users.

### Q2: Explain the ACID properties in the context of MySQL.
**Answer**:
- **Atomicity**: All operations in a transaction either complete entirely or roll back cleanly. In MediVault, if a doctor orders a test and the audit log fails, the entire transaction can be rolled back.
- **Consistency**: The database transitions from one valid state to another, preserving all check constraints, foreign keys, and unique keys.
- **Isolation**: Concurrent transactions execute without interfering with one another, controlled via isolation levels (default: `REPEATABLE READ`).
- **Durability**: Once a transaction is committed, changes survive server crashes or power failures via the InnoDB Write-Ahead Redo Log.

### Q3: How do database indexes work in MySQL, and what data structure is used?
**Answer**: MySQL InnoDB creates **B+ Tree (Balanced Tree)** data structures for indexes. In a B+ Tree, leaf nodes contain data or primary key pointers linked sequentially in a doubly-linked list.
- A search operation takes $O(\log n)$ time instead of a full table scan $O(n)$.
- MediVault indexes `patient_id` in `patients`, `(patient_id, doctor_id, status)` in `patient_access_grants`, and `(status, flag)` in `test_records` for fast lookups and filtering.

### Q4: Why use a Connection Pool (`mysql2.createPool`) instead of single connections?
**Answer**: Creating a new TCP connection and performing the MySQL TLS/authentication handshake for every incoming HTTP request is computationally expensive (~20-50ms latency overhead). A **Connection Pool** pre-establishes a set of reusable connections (e.g., 15 connections in MediVault). When a request arrives, it borrows an idle connection, executes queries, and immediately releases it back to the pool, providing high throughput and preventing connection exhaustion under concurrent traffic.

### Q5: Explain Database Normalization and identify the normal forms achieved in MediVault.
**Answer**: Normalization minimizes data redundancy and prevents insertion, update, and deletion anomalies:
- **1NF**: Every table has a Primary Key, and all columns contain atomic (indivisible) values.
- **2NF**: In 1NF and every non-key attribute is fully functionally dependent on the entire primary key (no partial dependencies).
- **3NF**: In 2NF and no transitive functional dependencies exist ($X \to Y$ and $Y \to Z$). Doctor names and specializations are stored in `users`, not duplicated in `prescriptions` or `patients`.
- **BCNF**: Every determinant is a candidate key. MediVault tables comply with 3NF and BCNF.

### Q6: How do Foreign Key constraints enforce referential integrity in MediVault?
**Answer**: Foreign keys (`FOREIGN KEY (patient_id) REFERENCES patients(id)`) ensure that child records cannot point to non-existent parent rows.
- MediVault uses `ON DELETE CASCADE` on operational records (`prescriptions`, `test_records`, `medical_history`) so that if a test patient is purged, related child records clean up automatically without leaving orphans.
- For `assigned_doctor_id`, `ON DELETE SET NULL` is used so deleting a staff account does not erase patient records.

### Q7: Why is `utf8mb4` used instead of `utf8` in MySQL?
**Answer**: MySQL's legacy `utf8` character set only supports up to 3 bytes per character (Basic Multilingual Plane), failing on 4-byte UTF-8 sequences such as emojis, specialized medical symbols, and certain international scripts. `utf8mb4` is full RFC 3629 UTF-8 supporting all 4-byte characters. MediVault uses `utf8mb4` with `utf8mb4_unicode_ci` collation for accurate linguistic sorting and case-insensitive matching.

### Q8: What are MySQL Transaction Isolation Levels, and what is the default?
**Answer**: The 4 ANSI SQL isolation levels supported by MySQL InnoDB:
1. **READ UNCOMMITTED**: Lowest isolation; allows dirty reads (reading uncommitted data).
2. **READ COMMITTED**: Prevents dirty reads; each query reads committed data.
3. **REPEATABLE READ** *(MySQL InnoDB Default)*: Guarantees that multiple reads of the same row within a transaction return identical snapshots using Multi-Version Concurrency Control (MVCC). Prevents non-repeatable reads and phantom reads.
4. **SERIALIZABLE**: Highest isolation; locks rows via shared locks, eliminating concurrency.

### Q9: Name 5 MySQL Date/Time functions used in MediVault and explain their purpose.
**Answer**:
1. `NOW()`: Returns the current date and time (`YYYY-MM-DD HH:MM:SS`) for timestamps.
2. `CURDATE()`: Returns the current calendar date (`YYYY-MM-DD`).
3. `DATEDIFF(expr1, expr2)`: Computes the difference in days between two dates. Used in MediVault to calculate overdue tests: `DATEDIFF(NOW(), tr.ordered_date) > 7`.
4. `DATE_FORMAT(date, format)`: Formats dates into strings, e.g., `DATE_FORMAT(created_at, '%Y-%m')` for monthly aggregations.
5. `DATE_SUB(date, INTERVAL expr unit)`: Subtracts an interval from a date, e.g., `DATE_SUB(CURDATE(), INTERVAL 12 MONTH)` to compute the rolling 12-month registration window.

### Q10: What is the difference between `WHERE` and `HAVING` in SQL?
**Answer**:
- `WHERE` filters rows **before** any grouping or aggregation takes place. It operates on individual table columns (e.g., `WHERE is_deleted = 0`).
- `HAVING` filters rows **after** grouping (`GROUP BY`) has aggregated data. It operates on aggregate functions (e.g., `GROUP BY patient_id HAVING COUNT(*) > 3`).

### Q11: What is a Database View and how is it used in MediVault?
**Answer**: A View is a virtual table defined by an underlying SQL query. It contains no stored data itself; when queried, the database dynamically executes the view definition.
- MediVault defines `vw_patient_clinical_summary` in `database/schema.sql`, joining patients, assigned doctors, and aggregate counts of active prescriptions and pending tests.
- Views enhance security (by exposing only required columns) and simplify complex client queries into a clean `SELECT * FROM vw_patient_clinical_summary`.

### Q12: What is the difference between correlated and non-correlated subqueries?
**Answer**:
- **Non-correlated subquery**: Independent of the outer query. It evaluates once and its static result is used by the outer query (e.g., `WHERE patient_id IN (SELECT patient_id FROM patient_access_grants WHERE doctor_id = ?)`).
- **Correlated subquery**: Depends on values from the current row of the outer query and re-evaluates for every row evaluated by the outer query (e.g., `SELECT p.*, (SELECT COUNT(*) FROM test_records tr WHERE tr.patient_id = p.id) AS test_count FROM patients p`).

### Q13: Explain the different types of SQL Joins used in MediVault.
**Answer**:
1. **INNER JOIN**: Returns rows only when there is a match in both tables (e.g., joining `prescriptions` with `users` to require a valid doctor).
2. **LEFT JOIN (LEFT OUTER JOIN)**: Returns all rows from the left table and matched rows from the right table, filling with `NULL` where no match exists (e.g., listing all patients with their assigned doctor, including self-registered patients without one).
3. **RIGHT JOIN**: Returns all rows from the right table and matching rows from the left.
4. **CROSS JOIN**: Produces the Cartesian product of two tables ($m \times n$ rows).

### Q14: How does pagination work in MySQL and what is the difference between `LIMIT` and `OFFSET`?
**Answer**:
- Syntax: `SELECT * FROM patients ORDER BY created_at DESC LIMIT ? OFFSET ?`.
- `LIMIT` specifies the maximum number of rows to return per page (e.g., 10 or 20).
- `OFFSET` specifies how many rows to skip before returning rows (calculated as `(pageNumber - 1) * limit`).
- In `mysql2`, pagination parameters in prepared statements must be supplied as integer types (`parseInt(limit, 10)`).

### Q15: How do Prepared Statements prevent SQL Injection in MySQL?
**Answer**: When a prepared statement is executed:
1. The SQL structure is sent to the MySQL server and parsed/compiled into an execution tree with placeholders (`?`).
2. The parameter values are sent separately in a binary protocol packet.
3. The database engine never interprets the parameters as executable SQL code, even if they contain quotes, semicolons, or SQL keywords like `DROP TABLE` or `' OR '1'='1`.

### Q16: How does the `EXPLAIN` command assist in query optimization?
**Answer**: Prepending `EXPLAIN` to any `SELECT` query instructs MySQL to return the **Query Execution Plan** without running the query. It reveals:
- `type`: Join type (`ALL` = full table scan, `ref`/`eq_ref` = index lookup, `range` = index range scan).
- `possible_keys` and `key`: Which indexes were considered and which index was actually chosen by the query optimizer.
- `rows`: Estimated number of rows MySQL must examine.
- `Extra`: Whether filesort (`Using filesort`) or temporary tables (`Using temporary`) are being used.

### Q17: Compare Auto-Increment Integer Primary Keys vs UUIDs in MySQL.
**Answer**:
- **AUTO_INCREMENT INT/BIGINT** *(Used in MediVault)*: 4 or 8 bytes. Sequential insertion preserves B+ tree balance with minimal page splits, resulting in optimal insert speed, compact index leaf nodes, and high cache efficiency.
- **UUID (v4)**: 16 or 36 bytes. Randomly distributed values cause frequent random page writes and B+ tree page splits (index fragmentation), increasing table storage size by 3x-4x.
- MediVault uses `AUTO_INCREMENT` internally for foreign keys and generates a clean human-readable code (`MV-2026-XXXX`) for patient identification.

### Q18: What is a Deadlock in MySQL and how does InnoDB handle it?
**Answer**: A deadlock occurs when two or more transactions mutually block each other by holding locks that the other transactions need (e.g., Transaction A locks Patient 1 and requests Patient 2; Transaction B locks Patient 2 and requests Patient 1).
- **InnoDB Detection**: InnoDB automatically detects deadlocks using a wait-for graph algorithm.
- **Resolution**: It selects the transaction that has modified the smallest number of rows as the "victim" and rolls it back with error `1213 (ER_LOCK_DEADLOCK)`, allowing the other transaction to proceed.

### Q19: Why use the Soft Delete pattern instead of physical `DELETE`?
**Answer**: In healthcare applications, deleting medical data violates compliance and destroys legal audit trails. Following HIPAA-inspired security practices, MediVault sets `is_deleted = 1` and updates `updated_at = NOW()`.
- Active queries filter `WHERE is_deleted = 0`.
- Historical relationships and audit logs remain intact.
- An Administrator can instantly restore mistakenly deactivated profiles via `UPDATE patients SET is_deleted = 0`.

### Q20: How are backups and restoration handled in MySQL?
**Answer**:
- **Logical Backup (`mysqldump`)**: Generates SQL text scripts containing `CREATE TABLE` and `INSERT` statements (`mysqldump -u root -p medivault > backup.sql`). Easily inspected and portable across MySQL versions.
- **Physical Backup (MySQL Enterprise Backup / Percona XtraBackup)**: Copies raw InnoDB data files and redo log blocks at the binary level without blocking client transactions, ideal for databases in the hundreds of gigabytes.
- **Restoration**: `mysql -u root -p medivault < backup.sql` or applying binary logs (Point-in-Time Recovery).
