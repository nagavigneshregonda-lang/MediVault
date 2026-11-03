-- ==============================================================================
-- MediVault: Healthcare Record Management System - SQL Queries Collection
-- Total Queries: 26 (Viva & Evaluation Reference)
-- Covers: Joins, Aggregates, GROUP BY/HAVING, Subqueries, Date Functions,
-- Window Functions, UPDATE/DELETE, and Views.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. INNER JOIN: Retrieve Patient Profiles with Assigned Primary Physician
-- ------------------------------------------------------------------------------
SELECT 
  p.patient_id,
  CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
  p.dob,
  p.blood_group,
  p.phone,
  u.name AS physician_name,
  u.specialization,
  u.license_number
FROM patients p
INNER JOIN users u ON p.assigned_doctor_id = u.id
WHERE p.is_deleted = 0;

-- ------------------------------------------------------------------------------
-- 2. LEFT JOIN: All Patients with Active Prescriptions (includes patients with none)
-- ------------------------------------------------------------------------------
SELECT 
  p.patient_id,
  CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
  COALESCE(pr.medication_name, 'No Active Prescription') AS medication,
  pr.dosage,
  pr.frequency,
  pr.status
FROM patients p
LEFT JOIN prescriptions pr ON p.id = pr.patient_id AND pr.status = 'Active'
WHERE p.is_deleted = 0
ORDER BY p.patient_id ASC;

-- ------------------------------------------------------------------------------
-- 3. MULTI-TABLE JOIN: Diagnostic Test Results with Patient, Doctor & Lab Technician
-- ------------------------------------------------------------------------------
SELECT 
  tr.id AS test_id,
  tr.test_name,
  tr.category,
  tr.flag,
  tr.status,
  CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
  p.patient_id,
  u_doc.name AS ordered_by_doctor,
  COALESCE(u_tech.name, 'Pending Assignment') AS reported_by_technician,
  tr.ordered_date,
  tr.completed_date
FROM test_records tr
INNER JOIN patients p ON tr.patient_id = p.id
LEFT JOIN users u_doc ON tr.ordered_by_doctor_id = u_doc.id
LEFT JOIN users u_tech ON tr.technician_id = u_tech.id
ORDER BY tr.ordered_date DESC;

-- ------------------------------------------------------------------------------
-- 4. AGGREGATES: Global Patient Demographics & Vitals Summary
-- ------------------------------------------------------------------------------
SELECT 
  COUNT(*) AS total_registered_patients,
  ROUND(AVG(TIMESTAMPDIFF(YEAR, dob, CURDATE())), 1) AS average_age,
  MIN(TIMESTAMPDIFF(YEAR, dob, CURDATE())) AS youngest_patient_age,
  MAX(TIMESTAMPDIFF(YEAR, dob, CURDATE())) AS oldest_patient_age,
  ROUND(AVG(weight_kg / POWER(height_cm / 100, 2)), 2) AS average_bmi
FROM patients
WHERE is_deleted = 0 AND height_cm > 0 AND weight_kg > 0;

-- ------------------------------------------------------------------------------
-- 5. CONDITIONAL AGGREGATION: Summary Dashboard Metrics in a Single Query
-- ------------------------------------------------------------------------------
SELECT 
  COUNT(*) AS total,
  COALESCE(SUM(CASE WHEN gender = 'Female' THEN 1 ELSE 0 END), 0) AS female_count,
  COALESCE(SUM(CASE WHEN gender = 'Male' THEN 1 ELSE 0 END), 0) AS male_count,
  COALESCE(SUM(CASE WHEN allergies IS NOT NULL AND TRIM(allergies) != '' 
               AND LOWER(TRIM(allergies)) NOT IN ('none', 'none recorded') THEN 1 ELSE 0 END), 0) AS allergy_watchlist,
  COALESCE(SUM(CASE WHEN chronic_conditions IS NOT NULL AND TRIM(chronic_conditions) != '' 
               AND LOWER(TRIM(chronic_conditions)) NOT IN ('none', 'none recorded') THEN 1 ELSE 0 END), 0) AS chronic_care_count
FROM patients
WHERE is_deleted = 0;

-- ------------------------------------------------------------------------------
-- 6. GROUP BY & AGGREGATES: Test Volume and Breakdown by Category
-- ------------------------------------------------------------------------------
SELECT 
  category,
  COUNT(*) AS total_tests,
  SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed_count,
  SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress_count,
  SUM(CASE WHEN status = 'Ordered' THEN 1 ELSE 0 END) AS ordered_count,
  SUM(CASE WHEN flag = 'Critical' THEN 1 ELSE 0 END) AS critical_flags
FROM test_records
GROUP BY category
ORDER BY total_tests DESC;

-- ------------------------------------------------------------------------------
-- 7. GROUP BY with HAVING: High-Volume Physicians with Over 5 Assigned Patients
-- ------------------------------------------------------------------------------
SELECT 
  u.id AS doctor_id,
  u.name AS doctor_name,
  u.specialization,
  COUNT(p.id) AS assigned_patient_count
FROM users u
INNER JOIN patients p ON u.id = p.assigned_doctor_id
WHERE u.role = 'Doctor' AND p.is_deleted = 0
GROUP BY u.id, u.name, u.specialization
HAVING COUNT(p.id) >= 5
ORDER BY assigned_patient_count DESC;

-- ------------------------------------------------------------------------------
-- 8. GROUP BY with HAVING: Diagnostic Tests with Critical Severity Rate > 15%
-- ------------------------------------------------------------------------------
SELECT 
  category,
  COUNT(*) AS total_tests,
  SUM(CASE WHEN flag = 'Critical' THEN 1 ELSE 0 END) AS critical_count,
  ROUND(SUM(CASE WHEN flag = 'Critical' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS critical_percentage
FROM test_records
GROUP BY category
HAVING critical_count > 0 AND critical_percentage >= 15.0;

-- ------------------------------------------------------------------------------
-- 9. SUBQUERY IN WHERE (IN): Patients Currently Taking Cardiovascular Drugs
-- ------------------------------------------------------------------------------
SELECT 
  patient_id,
  CONCAT(first_name, ' ', last_name) AS patient_name,
  phone,
  chronic_conditions
FROM patients
WHERE id IN (
  SELECT DISTINCT patient_id
  FROM prescriptions
  WHERE status = 'Active' AND medication_name IN ('Lisinopril', 'Atorvastatin Calcium', 'Clopidogrel (Plavix)', 'Metoprolol Succinate ER')
) AND is_deleted = 0;

-- ------------------------------------------------------------------------------
-- 10. SUBQUERY IN WHERE (EXISTS): Doctors Who Ordered at Least One Critical Lab Test
-- ------------------------------------------------------------------------------
SELECT 
  u.id,
  u.name,
  u.email,
  u.specialization
FROM users u
WHERE u.role = 'Doctor'
  AND EXISTS (
    SELECT 1 
    FROM test_records tr 
    WHERE tr.ordered_by_doctor_id = u.id AND tr.flag = 'Critical'
  );

-- ------------------------------------------------------------------------------
-- 11. SCALAR SUBQUERY IN PROJECTION: Patient Details with Total Test Count
-- ------------------------------------------------------------------------------
SELECT 
  p.patient_id,
  CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
  p.blood_group,
  (SELECT COUNT(*) FROM test_records tr WHERE tr.patient_id = p.id) AS total_tests,
  (SELECT COUNT(*) FROM prescriptions pr WHERE pr.patient_id = p.id AND pr.status = 'Active') AS active_rx_count
FROM patients p
WHERE p.is_deleted = 0
ORDER BY total_tests DESC
LIMIT 10;

-- ------------------------------------------------------------------------------
-- 12. CORRELATED SUBQUERY: Most Recent Prescription Prescribed for Each Patient
-- ------------------------------------------------------------------------------
SELECT 
  p.patient_id,
  CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
  pr.medication_name,
  pr.dosage,
  pr.start_date
FROM patients p
INNER JOIN prescriptions pr ON p.id = pr.patient_id
WHERE pr.start_date = (
  SELECT MAX(pr_sub.start_date)
  FROM prescriptions pr_sub
  WHERE pr_sub.patient_id = p.id
)
ORDER BY pr.start_date DESC;

-- ------------------------------------------------------------------------------
-- 13. DERIVED TABLE (Subquery in FROM): Monthly New Patient Registrations
-- ------------------------------------------------------------------------------
SELECT 
  monthly_data.reg_month,
  monthly_data.patient_count,
  ROUND(monthly_data.patient_count * 100.0 / (SELECT COUNT(*) FROM patients WHERE is_deleted = 0), 1) AS share_pct
FROM (
  SELECT 
    DATE_FORMAT(created_at, '%Y-%m') AS reg_month,
    COUNT(*) AS patient_count
  FROM patients
  WHERE is_deleted = 0
  GROUP BY DATE_FORMAT(created_at, '%Y-%m')
) AS monthly_data
ORDER BY monthly_data.reg_month DESC;

-- ------------------------------------------------------------------------------
-- 14. DATE FUNCTION: Calculate Exact Age & Filter Senior Patients (>= 60 years)
-- ------------------------------------------------------------------------------
SELECT 
  patient_id,
  CONCAT(first_name, ' ', last_name) AS patient_name,
  dob,
  TIMESTAMPDIFF(YEAR, dob, CURDATE()) AS age_in_years,
  chronic_conditions
FROM patients
WHERE is_deleted = 0 AND TIMESTAMPDIFF(YEAR, dob, CURDATE()) >= 60
ORDER BY age_in_years DESC;

-- ------------------------------------------------------------------------------
-- 15. DATE FUNCTION: Overdue Specimen Detection (> 7 Days from Order Date)
-- ------------------------------------------------------------------------------
SELECT 
  tr.id,
  tr.test_name,
  tr.category,
  tr.ordered_date,
  DATEDIFF(NOW(), tr.ordered_date) AS days_elapsed,
  p.patient_id,
  CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
  u.name AS ordering_physician
FROM test_records tr
INNER JOIN patients p ON tr.patient_id = p.id
LEFT JOIN users u ON tr.ordered_by_doctor_id = u.id
WHERE tr.status IN ('Ordered', 'In Progress')
  AND DATEDIFF(NOW(), tr.ordered_date) > 7
ORDER BY days_elapsed DESC;

-- ------------------------------------------------------------------------------
-- 16. DATE FUNCTION: Patient Access Consents Expiring Within the Next 14 Days
-- ------------------------------------------------------------------------------
SELECT 
  g.id,
  p.patient_id,
  CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
  u_doc.name AS authorized_doctor,
  g.expires_at,
  DATEDIFF(g.expires_at, NOW()) AS days_until_expiration
FROM patient_access_grants g
INNER JOIN patients p ON g.patient_id = p.id
INNER JOIN users u_doc ON g.doctor_id = u_doc.id
WHERE g.status = 'Granted'
  AND g.expires_at IS NOT NULL
  AND g.expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 14 DAY)
ORDER BY g.expires_at ASC;

-- ------------------------------------------------------------------------------
-- 17. STRING FUNCTIONS & CONCATENATION: Formatted Clinical Card Output
-- ------------------------------------------------------------------------------
SELECT 
  patient_id,
  UPPER(CONCAT(last_name, ', ', first_name)) AS catalog_name,
  CONCAT('Phone: ', phone, ' | Blood: ', blood_group) AS contact_summary,
  CONCAT(SUBSTRING(first_name, 1, 1), SUBSTRING(last_name, 1, 1)) AS avatar_initials
FROM patients
WHERE is_deleted = 0
LIMIT 10;

-- ------------------------------------------------------------------------------
-- 18. PATTERN MATCHING & TEXT SEARCH: Global Patient Finder
-- ------------------------------------------------------------------------------
SELECT 
  patient_id,
  first_name,
  last_name,
  phone,
  email,
  dob
FROM patients
WHERE is_deleted = 0
  AND (
    first_name LIKE '%Elena%' 
    OR last_name LIKE '%Elena%' 
    OR patient_id LIKE '%Elena%' 
    OR phone LIKE '%Elena%'
  );

-- ------------------------------------------------------------------------------
-- 19. WINDOW FUNCTION: Row Numbering Active Prescriptions per Patient
-- ------------------------------------------------------------------------------
SELECT 
  ROW_NUMBER() OVER (PARTITION BY patient_id ORDER BY start_date DESC) AS rx_sequence,
  patient_id,
  medication_name,
  dosage,
  start_date,
  status
FROM prescriptions
WHERE status = 'Active';

-- ------------------------------------------------------------------------------
-- 20. WINDOW FUNCTION: Ranking Doctors by Total Ordered Test Volume
-- ------------------------------------------------------------------------------
SELECT 
  DENSE_RANK() OVER (ORDER BY COUNT(tr.id) DESC) AS rank_position,
  u.id AS doctor_id,
  u.name AS doctor_name,
  u.specialization,
  COUNT(tr.id) AS total_tests_ordered
FROM users u
INNER JOIN test_records tr ON u.id = tr.ordered_by_doctor_id
WHERE u.role = 'Doctor'
GROUP BY u.id, u.name, u.specialization;

-- ------------------------------------------------------------------------------
-- 21. UPDATE WITH SUBQUERY: Soft-Delete Patient and Revoke All Active Grants
-- ------------------------------------------------------------------------------
-- Step 1: Soft-delete patient record
UPDATE patients 
SET is_deleted = 1, updated_at = NOW() 
WHERE patient_id = 'MV-2026-9999';

-- Step 2: Cascade status update to access grants
UPDATE patient_access_grants 
SET status = 'Revoked', updated_at = NOW() 
WHERE patient_id = (SELECT id FROM patients WHERE patient_id = 'MV-2026-9999');

-- ------------------------------------------------------------------------------
-- 22. UPDATE: Extend Doctor Access Consent Expiry by 30 Days
-- ------------------------------------------------------------------------------
UPDATE patient_access_grants
SET 
  expires_at = DATE_ADD(COALESCE(expires_at, NOW()), INTERVAL 30 DAY),
  notes = CONCAT(COALESCE(notes, ''), ' [Extended 30 days by clinical coordinator]'),
  updated_at = NOW()
WHERE patient_id = 1 AND doctor_id = 2;

-- ------------------------------------------------------------------------------
-- 23. DELETE: Maintenance Housekeeping of Stale Audit Trail Logs (> 180 Days)
-- ------------------------------------------------------------------------------
DELETE FROM audit_logs 
WHERE created_at < DATE_SUB(NOW(), INTERVAL 180 DAY);

-- ------------------------------------------------------------------------------
-- 24. TRANSACTIONAL WRITE: Prescribe Medication & Record Audit Trail Atomically
-- ------------------------------------------------------------------------------
START TRANSACTION;

INSERT INTO prescriptions (
  patient_id, doctor_id, medication_name, dosage, frequency, duration, start_date, instructions, status
) VALUES (
  1, 2, 'Atorvastatin Calcium', '20 mg', 'Once daily at bedtime', '90 days', CURDATE(), 'Take after dinner', 'Active'
);

INSERT INTO audit_logs (
  user_id, user_email, user_role, action, resource, resource_id, details, ip_address, created_at
) VALUES (
  2, 'doctor@medivault.com', 'Doctor', 'CREATE', 'PRESCRIPTION', LAST_INSERT_ID(), 'Prescribed Atorvastatin Calcium 20 mg', '127.0.0.1', NOW()
);

COMMIT;

-- ------------------------------------------------------------------------------
-- 25. QUERY THE CLINICAL SUMMARY VIEW: Patients with Critical Test Alerts
-- ------------------------------------------------------------------------------
SELECT 
  patient_id,
  full_name,
  calculated_age,
  assigned_doctor_name,
  active_prescription_count,
  critical_tests_count
FROM vw_patient_clinical_summary
WHERE critical_tests_count > 0
ORDER BY critical_tests_count DESC;

-- ------------------------------------------------------------------------------
-- 26. VIEW QUERY: High-Risk Chronic Care Watchlist with Medication Counts
-- ------------------------------------------------------------------------------
SELECT 
  patient_id,
  full_name,
  calculated_age,
  blood_group,
  chronic_conditions,
  allergies,
  active_prescription_count
FROM vw_patient_clinical_summary
WHERE chronic_conditions IS NOT NULL 
  AND TRIM(chronic_conditions) != ''
  AND LOWER(TRIM(chronic_conditions)) NOT IN ('none', 'none recorded')
ORDER BY calculated_age DESC;

