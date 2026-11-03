-- ==============================================================================
-- MediVault: Healthcare Record Management System - Database Schema (MySQL 8.0+)
-- Storage Engine: InnoDB | Character Set: utf8mb4 | Collation: utf8mb4_unicode_ci
-- ==============================================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('Admin', 'Doctor', 'Patient', 'Lab Technician') NOT NULL,
  phone VARCHAR(50) DEFAULT NULL,
  specialization VARCHAR(150) DEFAULT NULL,
  license_number VARCHAR(100) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Patients Table
CREATE TABLE IF NOT EXISTS patients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id VARCHAR(50) NOT NULL UNIQUE,
  user_id INT UNIQUE DEFAULT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  dob DATE NOT NULL,
  gender ENUM('Male', 'Female', 'Other') NOT NULL,
  blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(191) DEFAULT NULL,
  address VARCHAR(255) DEFAULT NULL,
  height_cm DECIMAL(5,2) DEFAULT NULL,
  weight_kg DECIMAL(5,2) DEFAULT NULL,
  allergies TEXT DEFAULT NULL,
  chronic_conditions TEXT DEFAULT NULL,
  emergency_contact_name VARCHAR(150) DEFAULT NULL,
  emergency_contact_phone VARCHAR(50) DEFAULT NULL,
  emergency_contact_relation VARCHAR(100) DEFAULT NULL,
  assigned_doctor_id INT DEFAULT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_patients_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_patients_doctor FOREIGN KEY (assigned_doctor_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_patients_pid (patient_id),
  INDEX idx_patients_phone (phone),
  INDEX idx_patients_search (first_name, last_name, is_deleted),
  INDEX idx_patients_is_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Medical History Table
CREATE TABLE IF NOT EXISTS medical_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  record_date DATE NOT NULL,
  record_type ENUM('Diagnosis', 'Surgery', 'Visit', 'Vaccination', 'Hospitalization') NOT NULL,
  title VARCHAR(255) NOT NULL,
  doctor_id INT DEFAULT NULL,
  doctor_name VARCHAR(150) DEFAULT NULL,
  facility VARCHAR(200) DEFAULT NULL,
  severity ENUM('Routine', 'Mild', 'Moderate', 'Severe', 'Critical') NOT NULL,
  notes TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_med_history_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_med_history_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_med_history_pid (patient_id),
  INDEX idx_med_history_date (record_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Prescriptions Table
CREATE TABLE IF NOT EXISTS prescriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  doctor_id INT NOT NULL,
  medication_name VARCHAR(255) NOT NULL,
  dosage VARCHAR(100) NOT NULL,
  frequency VARCHAR(100) NOT NULL,
  duration VARCHAR(100) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE DEFAULT NULL,
  instructions TEXT DEFAULT NULL,
  status ENUM('Active', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Active',
  notes TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_prescriptions_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_prescriptions_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_prescriptions_pid (patient_id),
  INDEX idx_prescriptions_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Test Records Table
CREATE TABLE IF NOT EXISTS test_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  ordered_by_doctor_id INT DEFAULT NULL,
  technician_id INT DEFAULT NULL,
  test_name VARCHAR(255) NOT NULL,
  category ENUM('Blood', 'Imaging', 'Urine', 'Stool', 'Cardiology', 'Pathology', 'Microbiology', 'Genetic', 'Other') NOT NULL,
  ordered_date DATE NOT NULL,
  completed_date DATE DEFAULT NULL,
  result_value VARCHAR(150) DEFAULT NULL,
  unit VARCHAR(50) DEFAULT NULL,
  reference_range VARCHAR(100) DEFAULT NULL,
  flag ENUM('Normal', 'High', 'Low', 'Critical', 'Pending') DEFAULT 'Pending',
  status ENUM('Ordered', 'In Progress', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Ordered',
  notes TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_test_records_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_test_records_doctor FOREIGN KEY (ordered_by_doctor_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_test_records_technician FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_tests_pid (patient_id),
  INDEX idx_tests_status (status),
  INDEX idx_tests_category (category),
  INDEX idx_tests_ordered_date (ordered_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Patient Access Grants Table (Provider Consent Hub)
CREATE TABLE IF NOT EXISTS patient_access_grants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  doctor_id INT NOT NULL,
  granted_by INT NOT NULL,
  status ENUM('Granted', 'Revoked', 'Expired') NOT NULL DEFAULT 'Granted',
  expires_at DATETIME DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_grants_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_grants_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_grants_granted_by FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_patient_doctor (patient_id, doctor_id),
  INDEX idx_grants_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Audit Trail Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL,
  user_email VARCHAR(191) DEFAULT NULL,
  user_role VARCHAR(50) DEFAULT NULL,
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  resource_id VARCHAR(100) DEFAULT NULL,
  details TEXT DEFAULT NULL,
  ip_address VARCHAR(50) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_created_at (created_at),
  INDEX idx_audit_action (action),
  INDEX idx_audit_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Clinical Overview View (Joins & Aggregates)
CREATE OR REPLACE VIEW vw_patient_clinical_summary AS
SELECT 
  p.id AS internal_id,
  p.patient_id,
  CONCAT(p.first_name, ' ', p.last_name) AS full_name,
  p.dob,
  TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) AS calculated_age,
  p.gender,
  p.blood_group,
  p.phone,
  p.allergies,
  p.chronic_conditions,
  u_doc.name AS assigned_doctor_name,
  COUNT(DISTINCT pr.id) AS active_prescription_count,
  COUNT(DISTINCT tr.id) AS total_tests_count,
  SUM(CASE WHEN tr.flag = 'Critical' THEN 1 ELSE 0 END) AS critical_tests_count
FROM patients p
LEFT JOIN users u_doc ON p.assigned_doctor_id = u_doc.id
LEFT JOIN prescriptions pr ON pr.patient_id = p.id AND pr.status = 'Active'
LEFT JOIN test_records tr ON tr.patient_id = p.id
WHERE p.is_deleted = 0
GROUP BY 
  p.id, p.patient_id, p.first_name, p.last_name, p.dob, 
  p.gender, p.blood_group, p.phone, p.allergies, p.chronic_conditions, u_doc.name;
