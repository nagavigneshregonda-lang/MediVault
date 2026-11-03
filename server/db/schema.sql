-- ==============================================================================
-- MediVault: Healthcare Record Management System - Database Schema (SQLite)
-- ==============================================================================

PRAGMA foreign_keys = ON;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('Admin', 'Doctor', 'Patient', 'Lab Technician')),
  phone TEXT,
  specialization TEXT,
  license_number TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Patients Table
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT UNIQUE NOT NULL,
  user_id INTEGER UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dob DATE NOT NULL,
  gender TEXT NOT NULL CHECK(gender IN ('Male', 'Female', 'Other')),
  blood_group TEXT NOT NULL CHECK(blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  phone TEXT NOT NULL,
  email TEXT COLLATE NOCASE,
  address TEXT,
  height_cm REAL,
  weight_kg REAL,
  allergies TEXT DEFAULT '',
  chronic_conditions TEXT DEFAULT '',
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relation TEXT,
  assigned_doctor_id INTEGER,
  is_deleted INTEGER DEFAULT 0 CHECK(is_deleted IN (0, 1)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_doctor_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 3. Medical History Table
CREATE TABLE IF NOT EXISTS medical_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  record_date DATE NOT NULL,
  record_type TEXT NOT NULL CHECK(record_type IN ('Diagnosis', 'Surgery', 'Visit', 'Vaccination', 'Hospitalization')),
  title TEXT NOT NULL,
  doctor_id INTEGER,
  doctor_name TEXT,
  facility TEXT,
  severity TEXT NOT NULL CHECK(severity IN ('Routine', 'Mild', 'Moderate', 'Severe', 'Critical')),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 4. Prescriptions Table
CREATE TABLE IF NOT EXISTS prescriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  doctor_id INTEGER NOT NULL,
  medication_name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  duration TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Completed', 'Cancelled')),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- 5. Test Records Table
CREATE TABLE IF NOT EXISTS test_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  ordered_by_doctor_id INTEGER,
  technician_id INTEGER,
  test_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('Blood', 'Imaging', 'Urine', 'Stool', 'Cardiology', 'Pathology', 'Microbiology', 'Genetic', 'Other')),
  ordered_date DATE NOT NULL,
  completed_date DATE,
  result_value TEXT,
  unit TEXT,
  reference_range TEXT,
  flag TEXT DEFAULT 'Normal' CHECK(flag IN ('Normal', 'High', 'Low', 'Critical', 'Pending')),
  status TEXT NOT NULL DEFAULT 'Ordered' CHECK(status IN ('Ordered', 'In Progress', 'Completed', 'Cancelled')),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (ordered_by_doctor_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 6. Patient Access Grants Table (Authorized Access Control)
CREATE TABLE IF NOT EXISTS patient_access_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  doctor_id INTEGER NOT NULL,
  granted_by INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Granted' CHECK(status IN ('Granted', 'Revoked', 'Expired')),
  expires_at DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(patient_id, doctor_id)
);

-- 7. Audit Trail Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  user_email TEXT,
  user_role TEXT,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for high performance query lookups
CREATE INDEX IF NOT EXISTS idx_patients_pid ON patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_user_id ON patients(user_id);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_search ON patients(first_name, last_name, is_deleted);
CREATE INDEX IF NOT EXISTS idx_medical_history_pid ON medical_history(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_pid ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);
CREATE INDEX IF NOT EXISTS idx_test_records_pid ON test_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_test_records_status ON test_records(status);
CREATE INDEX IF NOT EXISTS idx_access_grants_lookup ON patient_access_grants(patient_id, doctor_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at);

