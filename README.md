# MediVault: Healthcare Record Management System

> **A production-quality, visually stunning Electronic Health Record (EHR) & Clinical Management System designed with glassmorphism aesthetics, patient-centric zero-trust access control, MySQL 8.0+ transactional persistence, and robust clinical decision support.**

---

## 🌟 Key Features

1. **Patient Profiles & Clinical Vitals**
   - Standardized alphanumeric patient IDs (`MV-2026-0001` through `MV-2026-0058`).
   - Automated age calculation from DOB and live BMI computation with clinical categories.
   - Demographics, emergency contact mapping, and duplicate prevention by phone/email.
   - Soft-delete (archival) with `is_deleted = 1` and instant administrative restoration.
   - Summary statistics cards on directory (Total patients, gender split, allergy watchlist, chronic conditions).

2. **Longitudinal Medical History Timeline**
   - Chronological vertical timeline of diagnoses, visits, surgeries, vaccinations, and hospitalizations.
   - Severity tags (*Routine*, *Mild*, *Moderate*, *Severe*, *Critical*), attending physician attribution, and facility details.
   - Full CRUD with automated audit trail logging.

3. **Smart Prescriptions & Drug Allergy Conflict Warning**
   - Real-time cross-reaction collision checking (e.g., penicillin class, sulfa drugs, NSAIDs).
   - Drug allergy warning modal requiring licensed physician override confirmation.
   - Official Hospital Printable Prescription stylesheet (`@media print`) rendering an authentic clinical prescription with clinic branding, patient details, Rx symbol, dosage, instructions, and signature line.

4. **Diagnostic Laboratory & Automated Flagging**
   - Full diagnostic workflow (*Ordered* ➔ *In Progress* ➔ *Completed*).
   - Quantitative and qualitative results tracking with reference range comparison.
   - Automated clinical status flagging: **Normal**, **High**, **Low**, or **Critical**.
   - **Dynamic Overdue Tracking**: automated detection of tests pending analysis for > 7 days (`DATEDIFF(NOW(), tr.ordered_date) > 7`), complete with animated pulse badges and filter views.
   - Summary metric cards on lab dashboard (Pending, In Progress, Completed, Critical, Overdue).

5. **Patient-Authorized Access Control (Zero-Trust Security)**
   - Doctor access is strictly restricted: a physician can only view records if assigned as primary physician OR granted active consent by the patient.
   - Patients can grant or revoke doctor access anytime with optional expiration timestamps.
   - Enforced rigorously at the Express middleware and MySQL database layer.
   - Summary cards on Access Hub (Active consents, expiring soon < 3 days, revoked, authorized providers).

6. **Comprehensive Security Audit Trail**
   - Immutable audit logging of every view, create, update, delete, login, and consent modification.
   - Captures actor email, role, action, resource, timestamp, and IP address.
   - Admin audit query interface with multi-field filtering, aligned grid, and pagination.
   - Summary cards (Authentication events, consent changes, clinical modifications, chart access invocations).

7. **System Health & Administrative Oversight**
   - Live system health telemetry for Administrators: MySQL engine and version (`MySQL 8.0+ InnoDB`), connection pool metrics (active, idle, total, limit), Node.js runtime version, process memory (heap used/allocated), and server uptime.
   - User account provisioning with role enforcement and clean naming standards.

8. **Design System & Responsive Architecture**
   - Seamless Light and Dark mode toggle with persisted preference.
   - Equal 42px form control heights, styled SVG dropdown chevrons, and aligned `.filter-bar-grid`.
   - Micro-interactions: trend badges, skeleton loading states, empty and error states with retry buttons.
   - Interactive notifications popover with clinical alerts and unread indicator.
   - Mobile responsive drawer with backdrop down to 375px.

---

## 🛠️ Technology Stack

- **Backend**: Node.js + Express (RESTful JSON API)
- **Database**: **MySQL 8.0+** using the **InnoDB** storage engine with connection pooling via `mysql2/promise` (automatic schema creation, auto-seeding, and health telemetry)
- **Authentication**: JWT (JSON Web Tokens) with 24-hour expiration & bcryptjs password hashing (salt rounds = 10)
- **Frontend**: Modern HTML5, CSS3 Variables, Glassmorphism UI, Vanilla JavaScript (ES Modules), Hash Router SPA
- **Visualizations**: Chart.js for clinical metric trends and 12-month registration graphs
- **Security**: Helmet security headers, CORS, express-rate-limit, parameterized SQL queries (`?`)
- **Testing**: Jest + Supertest (31/31 automated integration tests passing against isolated `medivault_test` database)

---

## 🚀 Quick Setup & Execution

### Prerequisites
- Node.js (v18, v20, v22, or v24)
- MySQL Server 8.0+ running on `localhost:3306`

### 1. Configure Environment
Copy `.env.example` to `.env` (or configure your existing `.env`):
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your_super_secure_jwt_secret_key_2026_production

# MySQL Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=medivault
```
> **Note**: If your password contains special characters such as `@`, MediVault passes it cleanly as a discrete option object directly to `mysql2`, ensuring no URL encoding errors.

### 2. Install & Run

```bash
# 1. Install dependencies
npm install

# 2. Start MediVault server (auto-creates database and applies schema & seed data)
npm start
```

Open your browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

### 3. Database Utility Commands

```bash
# Manually re-seed the MySQL database
npm run seed

# Run automated integration tests (auto-creates and runs against medivault_test)
npm test
```

---

## 🔑 Demo Accounts & Credentials

The database comes pre-seeded with 58 realistic patient profiles, 15 timeline events, 17 prescriptions, 27 diagnostic tests (including overdue specimens and all 4 clinical flags), and clinical audit records. Use any of the following accounts (or click the 1-click login pills on the sign-in page):

| Role | Email Address | Password | Description / Capabilities |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@medivault.com` | `Admin@123` | Evelyn Reed — Full system oversight, system health, Audit Trail, User management |
| **Doctor** | `doctor@medivault.com` | `Doctor@123` | Dr. Marcus Vance — Assigned to Eleanor Vance, writes prescriptions, orders tests |
| **Doctor** | `dr.chen@medivault.com` | `Doctor@123` | Dr. Sarah Chen — Access granted via patient consent for endocrinology |
| **Doctor** | `dr.patel@medivault.com` | `Doctor@123` | Dr. Raj Patel — Access was revoked by patient (tests 403 access denial) |
| **Patient** | `patient@medivault.com` | `Patient@123` | Eleanor Vance (`MV-2026-0001`) — Can view own record, grant/revoke access |
| **Lab Tech** | `lab@medivault.com` | `Lab@123` | Alex Thorne — Processes diagnostic specimen queue, enters test values |

---

## 📁 Project Directory Structure

```text
WTMP PRODUCT/
├── database/
│   ├── schema.sql               # MySQL 8.0+ InnoDB schema (FKs, indexes, views)
│   ├── seed.sql                 # Complete SQL INSERT statements for all seed data
│   ├── queries.sql              # 26 commented viva queries (joins, GROUP BY, subqueries, views)
│   └── er_diagram.md            # Mermaid ER diagram & 1NF/2NF/3NF/BCNF normalization
├── server/
│   ├── app.js                   # Express application setup, security & middleware
│   ├── config/
│   │   └── db.js                # MySQL connection pool (mysql2/promise), health stats
│   ├── controllers/
│   │   ├── authController.js    # Login, registration, profile retrieval
│   │   ├── usersController.js   # User management & account provisioning
│   │   ├── patientsController.js# Patient CRUD, soft-delete, restore, summary counts
│   │   ├── historyController.js # Medical history timeline management
│   │   ├── prescriptionsController.js # Rx management, drug allergy cross-matching
│   │   ├── testsController.js   # Lab orders, result flagging, overdue tracking
│   │   ├── accessController.js  # Consent hub, doctor authorizations, revocations
│   │   ├── auditController.js   # Compliance audit trail querying and filtering
│   │   └── statsController.js   # Role-specific dashboard stats & system health
│   ├── middleware/
│   │   ├── auth.js              # JWT verification & user attachment
│   │   ├── roles.js             # Role-based access control (RBAC) guard
│   │   ├── patientAccess.js     # Patient consent & doctor relationship guard
│   │   └── auditLogger.js       # Asynchronous audit log persistence
│   ├── routes/                  # Express REST route definitions
│   ├── db/
│   │   └── seed.js              # Seed data script for MySQL (58 patients, 12 months)
│   └── utils/
│       ├── helpers.js           # ID generator, BMI, age, drug allergy collision matrix
│       └── response.js          # Standardized API response formatters
├── public/
│   ├── index.html               # Main single page application host
│   ├── css/
│   │   └── styles.css           # Design system, glassmorphism, responsive styles
│   └── js/
│       ├── app.js               # Application bootstrap & auth verification
│       ├── api.js               # Centralized API client (fetch wrapper)
│       ├── store.js             # Reactive client state management
│       ├── router.js            # SPA hash-based router & route guards
│       ├── utils.js             # Date formatters, role greetings, skeleton loaders
│       ├── components/
│       └── views/
├── tests/
│   ├── api.test.js              # 31 automated integration tests (Supertest + Jest)
│   └── ui-verify.js             # 108 automated headless Chrome UI/UX verification tests
├── AUDIT_REPORT.md              # Full audit findings, repairs, and migration log
├── VIVA_NOTES.md                # 20 MySQL viva Q&As, architecture, and defense guide
├── package.json                 # Project dependencies & npm scripts
└── README.md                    # Project documentation
```
