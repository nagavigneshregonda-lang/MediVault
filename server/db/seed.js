/**
 * MediVault Database Seeder (MySQL 8.0+)
 * Seeds realistic clinical and operational data for testing & demonstrations
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { getPool, getConnection } = require('../config/db');

// Helper to calculate relative date string (YYYY-MM-DD)
function getRelativeDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

// Helper for relative datetime string (YYYY-MM-DD HH:MM:SS)
function getRelativeDateTime(daysAgo, hour = 10, minute = 30) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

async function seedDatabase(customPool) {
  console.log('--- Starting MediVault Seed Process (MySQL) ---');
  const pool = customPool || getPool();
  const conn = await pool.getConnection();

  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query('DROP TABLE IF EXISTS audit_logs');
    await conn.query('DROP TABLE IF EXISTS patient_access_grants');
    await conn.query('DROP TABLE IF EXISTS test_records');
    await conn.query('DROP TABLE IF EXISTS prescriptions');
    await conn.query('DROP TABLE IF EXISTS medical_history');
    await conn.query('DROP TABLE IF EXISTS patients');
    await conn.query('DROP TABLE IF EXISTS users');
    await conn.query('DROP VIEW IF EXISTS vw_patient_clinical_summary');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('Cleared existing data.');

    // Re-apply schema
    const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await conn.query(schemaSql);
    console.log('Schema recreated with InnoDB tables, foreign keys, and indexes.');

    // Password hashes
    const adminHash = await bcrypt.hash('Admin@123', 10);
    const doctorHash = await bcrypt.hash('Doctor@123', 10);
    const patientHash = await bcrypt.hash('Patient@123', 10);
    const labHash = await bcrypt.hash('Lab@123', 10);

    // 1. Insert Users
    const insertUserSql = `
      INSERT INTO users (name, email, password_hash, role, phone, specialization, license_number, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // Admin: Evelyn Reed (NO "Dr." prefix!)
    await conn.execute(insertUserSql, [
      'Evelyn Reed',
      'admin@medivault.com',
      adminHash,
      'Admin',
      '+1 (555) 019-2831',
      'Chief Healthcare Administrator & Health Informatics',
      'ADM-MED-001',
      getRelativeDateTime(360, 9, 0)
    ]);
    const [[adminUser]] = await conn.query("SELECT id FROM users WHERE email = 'admin@medivault.com'");

    // 3 Doctors
    await conn.execute(insertUserSql, [
      'Dr. Marcus Vance',
      'doctor@medivault.com',
      doctorHash,
      'Doctor',
      '+1 (555) 302-8819',
      'Cardiovascular Medicine & Interventional Cardiology',
      'MED-TX-98421',
      getRelativeDateTime(350, 8, 30)
    ]);
    const [[docMarcus]] = await conn.query("SELECT id FROM users WHERE email = 'doctor@medivault.com'");

    await conn.execute(insertUserSql, [
      'Dr. Sarah Chen',
      'dr.chen@medivault.com',
      doctorHash,
      'Doctor',
      '+1 (555) 441-9022',
      'Internal Medicine & Endocrinology',
      'MED-CA-44102',
      getRelativeDateTime(340, 11, 15)
    ]);
    const [[docSarah]] = await conn.query("SELECT id FROM users WHERE email = 'dr.chen@medivault.com'");

    await conn.execute(insertUserSql, [
      'Dr. Raj Patel',
      'dr.patel@medivault.com',
      doctorHash,
      'Doctor',
      '+1 (555) 672-3341',
      'Pulmonology & Critical Care Medicine',
      'MED-NY-55219',
      getRelativeDateTime(330, 14, 0)
    ]);
    const [[docRaj]] = await conn.query("SELECT id FROM users WHERE email = 'dr.patel@medivault.com'");

    // 2 Lab Technicians
    await conn.execute(insertUserSql, [
      'Alex Thorne',
      'lab@medivault.com',
      labHash,
      'Lab Technician',
      '+1 (555) 789-2211',
      'Clinical Hematology & Toxicology Lead',
      'LAB-CERT-8821',
      getRelativeDateTime(300, 7, 45)
    ]);
    const [[techAlex]] = await conn.query("SELECT id FROM users WHERE email = 'lab@medivault.com'");

    await conn.execute(insertUserSql, [
      'Morgan Taylor',
      'lab.morgan@medivault.com',
      labHash,
      'Lab Technician',
      '+1 (555) 789-3344',
      'Diagnostic Molecular Imaging & Pathology',
      'LAB-CERT-7734',
      getRelativeDateTime(290, 8, 15)
    ]);
    const [[techMorgan]] = await conn.query("SELECT id FROM users WHERE email = 'lab.morgan@medivault.com'");

    // Patient User Account (Eleanor Vance)
    await conn.execute(insertUserSql, [
      'Eleanor Vance',
      'patient@medivault.com',
      patientHash,
      'Patient',
      '+1 (555) 882-9011',
      null,
      null,
      getRelativeDateTime(280, 10, 20)
    ]);
    const [[patientUser]] = await conn.query("SELECT id FROM users WHERE email = 'patient@medivault.com'");

    console.log('Seeded Users: 1 Admin (Evelyn Reed), 3 Doctors, 2 Lab Technicians, 1 Patient User Account.');

    // 2. Insert 58 Patients distributed across 12 months (3 to 8 per month)
    const insertPatientSql = `
      INSERT INTO patients (
        patient_id, user_id, first_name, last_name, dob, gender, blood_group,
        phone, email, address, height_cm, weight_kg, allergies, chronic_conditions,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
        assigned_doctor_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const rawPatients = [
      // Month -11
      { id: 'MV-2026-0001', user_id: patientUser.id, fn: 'Eleanor', ln: 'Vance', dob: '1984-06-14', g: 'Female', bg: 'O+', ph: '+1 (555) 882-9011', em: 'patient@medivault.com', ad: '742 Evergreen Terrace, Springfield, OR', h: 168, w: 62.5, al: 'Penicillin, Shellfish', cc: 'Essential Hypertension, Mild Migraines', ecn: 'Thomas Vance', ecp: '+1 (555) 882-9012', ecr: 'Spouse', doc: docMarcus.id, days: 345 },
      { id: 'MV-2026-0002', user_id: null, fn: 'Arthur', ln: 'Pendelton', dob: '1958-11-23', g: 'Male', bg: 'A+', ph: '+1 (555) 234-5678', em: 'arthur.pendelton@example.com', ad: '104 Beacon Hill Rd, Boston, MA', h: 175, w: 84.0, al: 'Sulfa Drugs', cc: 'Type 2 Diabetes, Coronary Artery Disease', ecn: 'Margaret Pendelton', ecp: '+1 (555) 234-5679', ecr: 'Wife', doc: docMarcus.id, days: 340 },
      { id: 'MV-2026-0003', user_id: null, fn: 'Sophia', ln: 'Rodriguez', dob: '1992-04-18', g: 'Female', bg: 'B+', ph: '+1 (555) 345-6789', em: 'sophia.rodriguez@example.com', ad: '450 Sunset Blvd, Los Angeles, CA', h: 162, w: 58.0, al: 'NSAIDs, Ibuprofen', cc: 'Bronchial Asthma', ecn: 'Mateo Rodriguez', ecp: '+1 (555) 345-6780', ecr: 'Brother', doc: docRaj.id, days: 335 },

      // Month -10
      { id: 'MV-2026-0004', user_id: null, fn: 'David', ln: 'Kim', dob: '1976-08-30', g: 'Male', bg: 'AB-', ph: '+1 (555) 456-7890', em: 'david.kim@example.com', ad: '89 Pine Grove Way, Seattle, WA', h: 182, w: 79.5, al: 'Codeine', cc: 'Hyperlipidemia', ecn: 'Grace Kim', ecp: '+1 (555) 456-7891', ecr: 'Spouse', doc: docSarah.id, days: 320 },
      { id: 'MV-2026-0005', user_id: null, fn: 'Fatima', ln: 'Al-Mansoor', dob: '1989-12-05', g: 'Female', bg: 'A-', ph: '+1 (555) 567-8901', em: 'fatima.almansoor@example.com', ad: '320 Michigan Ave, Chicago, IL', h: 165, w: 64.0, al: 'Latex', cc: 'Hypothyroidism, Hashimoto Thyroiditis', ecn: 'Tariq Al-Mansoor', ecp: '+1 (555) 567-8902', ecr: 'Husband', doc: docSarah.id, days: 312 },
      { id: 'MV-2026-0006', user_id: null, fn: 'James', ln: "O'Connor", dob: '1965-02-17', g: 'Male', bg: 'O-', ph: '+1 (555) 678-9012', em: 'james.oconnor@example.com', ad: '15 High St, Philadelphia, PA', h: 178, w: 92.0, al: 'Penicillin, Cephalosporins', cc: 'COPD, Stage 2 Hypertension', ecn: 'Clara O Connor', ecp: '+1 (555) 678-9013', ecr: 'Daughter', doc: docRaj.id, days: 308 },
      { id: 'MV-2026-0007', user_id: null, fn: 'Emily', ln: 'Watson', dob: '2001-07-22', g: 'Female', bg: 'B-', ph: '+1 (555) 789-0123', em: 'emily.watson@example.com', ad: '502 Univ Parkway, Austin, TX', h: 170, w: 56.5, al: 'Peanuts, Amoxicillin', cc: 'Celiac Disease', ecn: 'Robert Watson', ecp: '+1 (555) 789-0124', ecr: 'Father', doc: docSarah.id, days: 302 },

      // Month -9
      { id: 'MV-2026-0008', user_id: null, fn: 'Carlos', ln: 'Gomez', dob: '1981-10-11', g: 'Male', bg: 'O+', ph: '+1 (555) 890-1234', em: 'carlos.gomez@example.com', ad: '221 Biscayne Bay Dr, Miami, FL', h: 176, w: 81.0, al: 'None recorded', cc: 'Pre-diabetes, Gout', ecn: 'Elena Gomez', ecp: '+1 (555) 890-1235', ecr: 'Wife', doc: docSarah.id, days: 290 },
      { id: 'MV-2026-0009', user_id: null, fn: 'Chloe', ln: 'Bennett', dob: '1995-03-09', g: 'Female', bg: 'A+', ph: '+1 (555) 901-2345', em: 'chloe.bennett@example.com', ad: '610 Market St, San Francisco, CA', h: 164, w: 60.0, al: 'Aspirin', cc: 'Polycystic Ovary Syndrome (PCOS)', ecn: 'Lucas Bennett', ecp: '+1 (555) 901-2346', ecr: 'Brother', doc: docSarah.id, days: 280 },
      { id: 'MV-2026-0010', user_id: null, fn: 'Lucas', ln: 'Moreau', dob: '1972-09-19', g: 'Male', bg: 'AB+', ph: '+1 (555) 012-3456', em: 'lucas.moreau@example.com', ad: '77 Rue Royal, New Orleans, LA', h: 180, w: 86.5, al: 'Sulfa', cc: 'Cardiac Arrhythmia, Atrial Fibrillation', ecn: 'Camille Moreau', ecp: '+1 (555) 012-3457', ecr: 'Spouse', doc: docMarcus.id, days: 275 },

      // Month -8
      { id: 'MV-2026-0011', user_id: null, fn: 'Hannah', ln: 'Schmidt', dob: '1990-01-28', g: 'Female', bg: 'B+', ph: '+1 (555) 123-4560', em: 'hannah.schmidt@example.com', ad: '14 Elm Creek Lane, Denver, CO', h: 167, w: 59.0, al: 'Tetracycline', cc: 'Allergic Rhinitis, Eczema', ecn: 'Klaus Schmidt', ecp: '+1 (555) 123-4561', ecr: 'Father', doc: docRaj.id, days: 260 },
      { id: 'MV-2026-0012', user_id: null, fn: 'Tariq', ln: 'Jackson', dob: '1969-05-12', g: 'Male', bg: 'O+', ph: '+1 (555) 234-5670', em: 'tariq.jackson@example.com', ad: '88 Peachtree St, Atlanta, GA', h: 185, w: 95.0, al: 'Penicillin', cc: 'Congestive Heart Failure, Hypertension', ecn: 'Keisha Jackson', ecp: '+1 (555) 234-5671', ecr: 'Wife', doc: docMarcus.id, days: 254 },
      { id: 'MV-2026-0013', user_id: null, fn: 'Olivia', ln: 'Rivera', dob: '1998-11-15', g: 'Female', bg: 'A+', ph: '+1 (555) 345-6701', em: 'olivia.rivera@example.com', ad: '344 Camelback Rd, Phoenix, AZ', h: 161, w: 54.0, al: 'None recorded', cc: 'Iron Deficiency Anemia', ecn: 'Maria Rivera', ecp: '+1 (555) 345-6702', ecr: 'Mother', doc: docSarah.id, days: 248 },
      { id: 'MV-2026-0014', user_id: null, fn: 'Samuel', ln: 'Ward', dob: '1961-07-04', g: 'Male', bg: 'B-', ph: '+1 (555) 456-7802', em: 'samuel.ward@example.com', ad: '210 Oak Ridge Dr, Nashville, TN', h: 172, w: 78.0, al: 'Morphine', cc: 'Osteoarthritis, Chronic Low Back Pain', ecn: 'Dorothy Ward', ecp: '+1 (555) 456-7803', ecr: 'Wife', doc: docMarcus.id, days: 244 },
      { id: 'MV-2026-0015', user_id: null, fn: 'Priya', ln: 'Sharma', dob: '1993-09-08', g: 'Female', bg: 'O-', ph: '+1 (555) 567-8913', em: 'priya.sharma@example.com', ad: '92 Hudson Yards, New York, NY', h: 163, w: 57.0, al: 'Ciprofloxacin', cc: 'Generalized Anxiety, Vitiligo', ecn: 'Anil Sharma', ecp: '+1 (555) 567-8914', ecr: 'Father', doc: docSarah.id, days: 241 },

      // Month -7
      { id: 'MV-2026-0016', user_id: null, fn: 'Liam', ln: 'Hayes', dob: '2003-02-14', g: 'Male', bg: 'AB-', ph: '+1 (555) 678-9024', em: 'liam.hayes@example.com', ad: '412 Lakeview Ave, Minneapolis, MN', h: 183, w: 76.0, al: 'None recorded', cc: 'Exercise-Induced Bronchospasm', ecn: 'Karen Hayes', ecp: '+1 (555) 678-9025', ecr: 'Mother', doc: docRaj.id, days: 230 },
      { id: 'MV-2026-0017', user_id: null, fn: 'Maya', ln: 'Lin', dob: '1988-04-12', g: 'Female', bg: 'A+', ph: '+1 (555) 789-1122', em: 'maya.lin@example.com', ad: '55 Columbus Cir, New York, NY', h: 166, w: 61.0, al: 'Sulfa', cc: 'Migraine with Aura', ecn: 'Wei Lin', ecp: '+1 (555) 789-1123', ecr: 'Brother', doc: docSarah.id, days: 222 },
      { id: 'MV-2026-0018', user_id: null, fn: 'Benjamin', ln: 'Foster', dob: '1974-12-01', g: 'Male', bg: 'O+', ph: '+1 (555) 890-2233', em: 'benjamin.foster@example.com', ad: '12 Magnolia Blvd, Charleston, SC', h: 179, w: 88.0, al: 'Penicillin', cc: 'Obstructive Sleep Apnea, Hyperuricemia', ecn: 'Sarah Foster', ecp: '+1 (555) 890-2234', ecr: 'Wife', doc: docRaj.id, days: 215 },
      { id: 'MV-2026-0019', user_id: null, fn: 'Elena', ln: 'Rostova', dob: '1996-06-25', g: 'Female', bg: 'B+', ph: '+1 (555) 901-3344', em: 'elena.rostova@example.com', ad: '300 Pier Ave, Santa Monica, CA', h: 169, w: 58.5, al: 'None recorded', cc: 'Raynaud Syndrome', ecn: 'Dmitri Rostov', ecp: '+1 (555) 901-3345', ecr: 'Father', doc: docSarah.id, days: 211 },

      // Month -6
      { id: 'MV-2026-0020', user_id: null, fn: 'Gabriel', ln: 'Santos', dob: '1985-03-14', g: 'Male', bg: 'AB+', ph: '+1 (555) 012-4455', em: 'gabriel.santos@example.com', ad: '88 Ocean Way, San Diego, CA', h: 174, w: 82.0, al: 'Aspirin', cc: 'GERD, Essential Tremor', ecn: 'Isabella Santos', ecp: '+1 (555) 012-4456', ecr: 'Wife', doc: docMarcus.id, days: 200 },
      { id: 'MV-2026-0021', user_id: null, fn: 'Zoe', ln: 'Kowalski', dob: '1991-10-09', g: 'Female', bg: 'O-', ph: '+1 (555) 123-5566', em: 'zoe.kowalski@example.com', ad: '17 Prairie Rd, Omaha, NE', h: 164, w: 63.0, al: 'Latex, Iodine', cc: 'Endometriosis', ecn: 'Piotr Kowalski', ecp: '+1 (555) 123-5567', ecr: 'Brother', doc: docSarah.id, days: 195 },
      { id: 'MV-2026-0022', user_id: null, fn: 'Henry', ln: 'Cavendish', dob: '1963-08-17', g: 'Male', bg: 'A-', ph: '+1 (555) 234-6677', em: 'henry.cavendish@example.com', ad: '44 Queen Anne Rd, Seattle, WA', h: 181, w: 91.0, al: 'Codeine', cc: 'Peripheral Artery Disease, T2D', ecn: 'Victoria Cavendish', ecp: '+1 (555) 234-6678', ecr: 'Spouse', doc: docMarcus.id, days: 190 },
      { id: 'MV-2026-0023', user_id: null, fn: 'Amina', ln: 'Diallo', dob: '1999-01-30', g: 'Female', bg: 'B+', ph: '+1 (555) 345-7788', em: 'amina.diallo@example.com', ad: '620 Commonwealth Ave, Boston, MA', h: 171, w: 60.0, al: 'None recorded', cc: 'Sickle Cell Trait', ecn: 'Oumar Diallo', ecp: '+1 (555) 345-7789', ecr: 'Father', doc: docSarah.id, days: 186 },
      { id: 'MV-2026-0024', user_id: null, fn: 'Noah', ln: 'Zimmerman', dob: '1979-05-22', g: 'Male', bg: 'O+', ph: '+1 (555) 456-8899', em: 'noah.zimmerman@example.com', ad: '109 Summit Ave, St. Paul, MN', h: 177, w: 79.0, al: 'Penicillin', cc: 'Chronic Sinusitis', ecn: 'Rachel Zimmerman', ecp: '+1 (555) 456-8800', ecr: 'Wife', doc: docRaj.id, days: 182 },
      { id: 'MV-2026-0025', user_id: null, fn: 'Leila', ln: 'Moradi', dob: '1987-11-19', g: 'Female', bg: 'A+', ph: '+1 (555) 567-9900', em: 'leila.moradi@example.com', ad: '81 Westwood Blvd, Los Angeles, CA', h: 165, w: 57.0, al: 'NSAIDs', cc: 'Ulcerative Colitis in Remission', ecn: 'Farhad Moradi', ecp: '+1 (555) 567-9901', ecr: 'Husband', doc: docSarah.id, days: 180 },

      // Month -5
      { id: 'MV-2026-0026', user_id: null, fn: 'Mason', ln: 'Cooper', dob: '1982-07-08', g: 'Male', bg: 'B-', ph: '+1 (555) 678-0011', em: 'mason.cooper@example.com', ad: '95 River St, Portland, OR', h: 184, w: 87.0, al: 'None recorded', cc: 'Lumbar Disc Herniation', ecn: 'Abigail Cooper', ecp: '+1 (555) 678-0012', ecr: 'Spouse', doc: docMarcus.id, days: 168 },
      { id: 'MV-2026-0027', user_id: null, fn: 'Kavita', ln: 'Nair', dob: '1994-02-11', g: 'Female', bg: 'O+', ph: '+1 (555) 789-1133', em: 'kavita.nair@example.com', ad: '730 Midtown Way, Atlanta, GA', h: 160, w: 53.0, al: 'Amoxicillin', cc: 'Polycystic Ovary Syndrome', ecn: 'Rajesh Nair', ecp: '+1 (555) 789-1134', ecr: 'Father', doc: docSarah.id, days: 161 },
      { id: 'MV-2026-0028', user_id: null, fn: 'Ethan', ln: 'Brooks', dob: '2000-09-15', g: 'Male', bg: 'A+', ph: '+1 (555) 890-2244', em: 'ethan.brooks@example.com', ad: '18 Campus Dr, Durham, NC', h: 180, w: 75.0, al: 'None recorded', cc: 'Mild Seasonal Allergies', ecn: 'Laura Brooks', ecp: '+1 (555) 890-2245', ecr: 'Mother', doc: docRaj.id, days: 155 },
      { id: 'MV-2026-0029', user_id: null, fn: 'Svetlana', ln: 'Popova', dob: '1970-04-03', g: 'Female', bg: 'AB-', ph: '+1 (555) 901-3355', em: 'svetlana.popova@example.com', ad: '228 Bayshore Dr, Tampa, FL', h: 168, w: 69.0, al: 'Sulfa Drugs', cc: 'Hypertension, Dyslipidemia', ecn: 'Igor Popov', ecp: '+1 (555) 901-3356', ecr: 'Husband', doc: docMarcus.id, days: 151 },

      // Month -4
      { id: 'MV-2026-0030', user_id: null, fn: 'Julian', ln: 'Mercer', dob: '1967-12-28', g: 'Male', bg: 'O-', ph: '+1 (555) 012-4466', em: 'julian.mercer@example.com', ad: '510 Walnut St, Philadelphia, PA', h: 176, w: 85.0, al: 'Penicillin, Cephalexin', cc: 'Chronic Kidney Disease Stage 2', ecn: 'Diane Mercer', ecp: '+1 (555) 012-4467', ecr: 'Wife', doc: docMarcus.id, days: 140 },
      { id: 'MV-2026-0031', user_id: null, fn: 'Nora', ln: 'Lindqvist', dob: '1997-08-16', g: 'Female', bg: 'B+', ph: '+1 (555) 123-5577', em: 'nora.lindqvist@example.com', ad: '304 Nordic Way, Salt Lake City, UT', h: 172, w: 62.0, al: 'None recorded', cc: 'Mild Exercise Asthma', ecn: 'Erik Lindqvist', ecp: '+1 (555) 123-5578', ecr: 'Father', doc: docRaj.id, days: 135 },
      { id: 'MV-2026-0032', user_id: null, fn: 'Wyatt', ln: 'Gallagher', dob: '1986-05-04', g: 'Male', bg: 'A+', ph: '+1 (555) 234-6688', em: 'wyatt.gallagher@example.com', ad: '88 Pioneer Blvd, Dallas, TX', h: 182, w: 89.0, al: 'None recorded', cc: 'Hypertension, Sleep Apnea', ecn: 'Cassidy Gallagher', ecp: '+1 (555) 234-6689', ecr: 'Spouse', doc: docMarcus.id, days: 130 },
      { id: 'MV-2026-0033', user_id: null, fn: 'Ananya', ln: 'Deshmukh', dob: '1993-11-20', g: 'Female', bg: 'AB+', ph: '+1 (555) 345-7799', em: 'ananya.deshmukh@example.com', ad: '414 Silicon Valley Blvd, San Jose, CA', h: 163, w: 55.0, al: 'Latex', cc: 'Allergic Contact Dermatitis', ecn: 'Aditya Deshmukh', ecp: '+1 (555) 345-7700', ecr: 'Husband', doc: docSarah.id, days: 126 },
      { id: 'MV-2026-0034', user_id: null, fn: 'Caleb', ln: 'Sterling', dob: '1975-01-14', g: 'Male', bg: 'O+', ph: '+1 (555) 456-8811', em: 'caleb.sterling@example.com', ad: '99 Liberty Ave, Pittsburgh, PA', h: 175, w: 83.0, al: 'Morphine', cc: 'Essential Hypertension', ecn: 'Bethany Sterling', ecp: '+1 (555) 456-8812', ecr: 'Wife', doc: docMarcus.id, days: 124 },
      { id: 'MV-2026-0035', user_id: null, fn: 'Miriam', ln: 'Goldstein', dob: '1960-03-31', g: 'Female', bg: 'A-', ph: '+1 (555) 567-9922', em: 'miriam.goldstein@example.com', ad: '64 Central Park West, New York, NY', h: 161, w: 66.0, al: 'Ciprofloxacin', cc: 'Osteoporosis, Hypothyroidism', ecn: 'David Goldstein', ecp: '+1 (555) 567-9923', ecr: 'Son', doc: docSarah.id, days: 122 },
      { id: 'MV-2026-0036', user_id: null, fn: 'Oscar', ln: 'Valdez', dob: '1983-09-02', g: 'Male', bg: 'B-', ph: '+1 (555) 678-0033', em: 'oscar.valdez@example.com', ad: '150 Rio Grande Ave, Albuquerque, NM', h: 178, w: 80.0, al: 'Sulfa', cc: 'Chronic Bronchitis', ecn: 'Sofia Valdez', ecp: '+1 (555) 678-0034', ecr: 'Wife', doc: docRaj.id, days: 120 },

      // Month -3
      { id: 'MV-2026-0037', user_id: null, fn: 'Harper', ln: 'Kennedy', dob: '1995-12-14', g: 'Female', bg: 'O+', ph: '+1 (555) 789-1144', em: 'harper.kennedy@example.com', ad: '72 Beacon St, Boston, MA', h: 167, w: 58.0, al: 'Penicillin', cc: 'Tension Headaches', ecn: 'Claire Kennedy', ecp: '+1 (555) 789-1145', ecr: 'Sister', doc: docSarah.id, days: 110 },
      { id: 'MV-2026-0038', user_id: null, fn: 'Declan', ln: 'O\'Sullivan', dob: '1968-06-19', g: 'Male', bg: 'A+', ph: '+1 (555) 890-2255', em: 'declan.osullivan@example.com', ad: '83 Emerald Isle Rd, Chicago, IL', h: 181, w: 90.0, al: 'None recorded', cc: 'Atrial Flutter, Gout', ecn: 'Siobhan O\'Sullivan', ecp: '+1 (555) 890-2256', ecr: 'Wife', doc: docMarcus.id, days: 104 },
      { id: 'MV-2026-0039', user_id: null, fn: 'Yuki', ln: 'Tanaka', dob: '1990-04-27', g: 'Female', bg: 'B+', ph: '+1 (555) 901-3366', em: 'yuki.tanaka@example.com', ad: '41 Japantown Way, San Francisco, CA', h: 159, w: 51.0, al: 'Shellfish, Tetracycline', cc: 'Allergic Asthma', ecn: 'Kenji Tanaka', ecp: '+1 (555) 901-3367', ecr: 'Brother', doc: docRaj.id, days: 98 },
      { id: 'MV-2026-0040', user_id: null, fn: 'Darius', ln: 'Washington', dob: '1977-10-15', g: 'Male', bg: 'AB-', ph: '+1 (555) 012-4477', em: 'darius.washington@example.com', ad: '25 Martin Luther King Jr Blvd, Detroit, MI', h: 186, w: 98.0, al: 'None recorded', cc: 'Hypertension Stage 2', ecn: 'Monique Washington', ecp: '+1 (555) 012-4478', ecr: 'Wife', doc: docMarcus.id, days: 95 },
      { id: 'MV-2026-0041', user_id: null, fn: 'Camila', ln: 'Herrera', dob: '2002-03-08', g: 'Female', bg: 'O-', ph: '+1 (555) 123-5588', em: 'camila.herrera@example.com', ad: '910 Coronado Ave, San Diego, CA', h: 165, w: 56.0, al: 'Ibuprofen', cc: 'Mild Iron Deficiency', ecn: 'Rosa Herrera', ecp: '+1 (555) 123-5589', ecr: 'Mother', doc: docSarah.id, days: 92 },

      // Month -2 (8 patients)
      { id: 'MV-2026-0042', user_id: null, fn: 'Alexander', ln: 'Wright', dob: '1980-01-22', g: 'Male', bg: 'A+', ph: '+1 (555) 234-6699', em: 'alexander.wright@example.com', ad: '112 Commonwealth St, Richmond, VA', h: 179, w: 84.0, al: 'None recorded', cc: 'Hypercholesterolemia', ecn: 'Stephanie Wright', ecp: '+1 (555) 234-6600', ecr: 'Wife', doc: docMarcus.id, days: 85 },
      { id: 'MV-2026-0043', user_id: null, fn: 'Chloe', ln: 'Dupond', dob: '1992-07-14', g: 'Female', bg: 'B-', ph: '+1 (555) 345-7711', em: 'chloe.dupond@example.com', ad: '58 French Quarter Ln, New Orleans, LA', h: 168, w: 59.0, al: 'Penicillin', cc: 'Chronic Fatigue, Migraines', ecn: 'Jean Dupond', ecp: '+1 (555) 345-7712', ecr: 'Father', doc: docSarah.id, days: 80 },
      { id: 'MV-2026-0044', user_id: null, fn: 'Lucas', ln: 'Silva', dob: '1987-12-05', g: 'Male', bg: 'O+', ph: '+1 (555) 456-8822', em: 'lucas.silva@example.com', ad: '302 Brickell Ave, Miami, FL', h: 175, w: 81.0, al: 'Sulfa Drugs', cc: 'Mild Asthma', ecn: 'Beatriz Silva', ecp: '+1 (555) 456-8823', ecr: 'Sister', doc: docRaj.id, days: 77 },
      { id: 'MV-2026-0045', user_id: null, fn: 'Seraphina', ln: 'Lockwood', dob: '1996-09-30', g: 'Female', bg: 'A-', ph: '+1 (555) 567-9933', em: 'seraphina.lockwood@example.com', ad: '47 Providence Rd, Charlotte, NC', h: 170, w: 61.0, al: 'None recorded', cc: 'Hypothyroidism', ecn: 'Gideon Lockwood', ecp: '+1 (555) 567-9934', ecr: 'Spouse', doc: docSarah.id, days: 73 },
      { id: 'MV-2026-0046', user_id: null, fn: 'Felix', ln: 'Bauer', dob: '1964-11-18', g: 'Male', bg: 'AB+', ph: '+1 (555) 678-0044', em: 'felix.bauer@example.com', ad: '91 Germanic Way, Milwaukee, WI', h: 183, w: 94.0, al: 'Aspirin, Naproxen', cc: 'Coronary Artery Disease, T2D', ecn: 'Greta Bauer', ecp: '+1 (555) 678-0045', ecr: 'Wife', doc: docMarcus.id, days: 70 },
      { id: 'MV-2026-0047', user_id: null, fn: 'Fatou', ln: 'Sow', dob: '1998-05-26', g: 'Female', bg: 'O-', ph: '+1 (555) 789-1155', em: 'fatou.sow@example.com', ad: '14 Harlem Blvd, New York, NY', h: 166, w: 57.0, al: 'Codeine', cc: 'Mild Eczema', ecn: 'Amadou Sow', ecp: '+1 (555) 789-1156', ecr: 'Brother', doc: docSarah.id, days: 66 },
      { id: 'MV-2026-0048', user_id: null, fn: 'Dominic', ln: 'Toretti', dob: '1978-08-11', g: 'Male', bg: 'B+', ph: '+1 (555) 890-2266', em: 'dominic.toretti@example.com', ad: '88 North End Way, Boston, MA', h: 177, w: 86.0, al: 'Penicillin', cc: 'Essential Hypertension', ecn: 'Gina Toretti', ecp: '+1 (555) 890-2267', ecr: 'Wife', doc: docMarcus.id, days: 63 },
      { id: 'MV-2026-0049', user_id: null, fn: 'Aria', ln: 'Montgomery', dob: '2001-10-02', g: 'Female', bg: 'A+', ph: '+1 (555) 901-3377', em: 'aria.montgomery@example.com', ad: '12 University Hills, Boulder, CO', h: 162, w: 54.0, al: 'None recorded', cc: 'None recorded', ecn: 'Byron Montgomery', ecp: '+1 (555) 901-3378', ecr: 'Father', doc: docSarah.id, days: 61 },

      // Month -1
      { id: 'MV-2026-0050', user_id: null, fn: 'Victor', ln: 'Navarro', dob: '1971-04-16', g: 'Male', bg: 'O+', ph: '+1 (555) 012-4488', em: 'victor.navarro@example.com', ad: '77 Paseo del Norte, El Paso, TX', h: 174, w: 82.0, al: 'Sulfa', cc: 'Type 2 Diabetes', ecn: 'Carmen Navarro', ecp: '+1 (555) 012-4489', ecr: 'Wife', doc: docSarah.id, days: 50 },
      { id: 'MV-2026-0051', user_id: null, fn: 'Ingrid', ln: 'Bergstrom', dob: '1989-01-29', g: 'Female', bg: 'AB-', ph: '+1 (555) 123-5599', em: 'ingrid.bergstrom@example.com', ad: '304 Fjord Lane, Duluth, MN', h: 173, w: 65.0, al: 'None recorded', cc: 'Seasonal Bronchospasm', ecn: 'Lars Bergstrom', ecp: '+1 (555) 123-5500', ecr: 'Husband', doc: docRaj.id, days: 42 },
      { id: 'MV-2026-0052', user_id: null, fn: 'Zane', ln: 'Sterling', dob: '1984-06-21', g: 'Male', bg: 'A-', ph: '+1 (555) 234-6611', em: 'zane.sterling@example.com', ad: '900 Wall St, New York, NY', h: 182, w: 79.0, al: 'Penicillin, Augmentin', cc: 'Chronic Stress Gastritis', ecn: 'Vivian Sterling', ecp: '+1 (555) 234-6612', ecr: 'Spouse', doc: docSarah.id, days: 38 },
      { id: 'MV-2026-0053', user_id: null, fn: 'Nadia', ln: 'Petrova', dob: '1995-03-17', g: 'Female', bg: 'B+', ph: '+1 (555) 345-7722', em: 'nadia.petrova@example.com', ad: '150 Russian Hill, San Francisco, CA', h: 167, w: 58.0, al: 'None recorded', cc: 'Mild Hypothyroidism', ecn: 'Oleg Petrov', ecp: '+1 (555) 345-7723', ecr: 'Father', doc: docSarah.id, days: 35 },
      { id: 'MV-2026-0054', user_id: null, fn: 'Tristan', ln: 'Vogel', dob: '2004-05-10', g: 'Male', bg: 'O-', ph: '+1 (555) 456-8833', em: 'tristan.vogel@example.com', ad: '22 Campus Way, Madison, WI', h: 185, w: 77.0, al: 'Amoxicillin', cc: 'Exercise Asthma', ecn: 'Helga Vogel', ecp: '+1 (555) 456-8834', ecr: 'Mother', doc: docRaj.id, days: 32 },

      // Month 0
      { id: 'MV-2026-0055', user_id: null, fn: 'Claire', ln: 'Delacroix', dob: '1993-11-04', g: 'Female', bg: 'A+', ph: '+1 (555) 567-9944', em: 'claire.delacroix@example.com', ad: '400 Bourbon St, New Orleans, LA', h: 164, w: 56.5, al: 'Latex', cc: 'Migraines', ecn: 'Henri Delacroix', ecp: '+1 (555) 567-9945', ecr: 'Brother', doc: docSarah.id, days: 22 },
      { id: 'MV-2026-0056', user_id: null, fn: 'Ronan', ln: 'O\'Malley', dob: '1973-08-20', g: 'Male', bg: 'B-', ph: '+1 (555) 678-0055', em: 'ronan.omalley@example.com', ad: '19 Atlantic Ave, Boston, MA', h: 179, w: 88.0, al: 'None recorded', cc: 'Hypertension, Dyslipidemia', ecn: 'Bridie O\'Malley', ecp: '+1 (555) 678-0056', ecr: 'Wife', doc: docMarcus.id, days: 15 },
      { id: 'MV-2026-0057', user_id: null, fn: 'Jasmine', ln: 'Kaur', dob: '1998-02-14', g: 'Female', bg: 'AB+', ph: '+1 (555) 789-1166', em: 'jasmine.kaur@example.com', ad: '610 Golden Gate Way, Fremont, CA', h: 165, w: 59.0, al: 'Ciprofloxacin', cc: 'Mild Anemia', ecn: 'Harpreet Kaur', ecp: '+1 (555) 789-1167', ecr: 'Mother', doc: docSarah.id, days: 8 },
      { id: 'MV-2026-0058', user_id: null, fn: 'Marcus', ln: 'Thorne', dob: '1981-12-30', g: 'Male', bg: 'O+', ph: '+1 (555) 890-2277', em: 'marcus.thorne@example.com', ad: '88 Highland Park, Dallas, TX', h: 181, w: 85.0, al: 'Penicillin', cc: 'Stage 1 Hypertension', ecn: 'Valerie Thorne', ecp: '+1 (555) 890-2278', ecr: 'Spouse', doc: docMarcus.id, days: 3 }
    ];

    for (const p of rawPatients) {
      await conn.execute(insertPatientSql, [
        p.id,
        p.user_id,
        p.fn,
        p.ln,
        p.dob,
        p.g,
        p.bg,
        p.ph,
        p.em,
        p.ad,
        p.h,
        p.w,
        p.al,
        p.cc,
        p.ecn,
        p.ecp,
        p.ecr,
        p.doc,
        getRelativeDateTime(p.days, 11, 15)
      ]);
    }
    console.log(`Seeded ${rawPatients.length} realistic patient profiles with monthly volume between 3 and 8.`);

    // Patients lookup map
    const patientsMap = {};
    const [allPatients] = await conn.query('SELECT id, patient_id, first_name, last_name, allergies FROM patients');
    for (const p of allPatients) {
      patientsMap[p.patient_id] = p;
    }

    // 3. Medical History Records
    const insertHistorySql = `
      INSERT INTO medical_history (
        patient_id, record_date, record_type, title, doctor_id, doctor_name, facility, severity, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const historyRecords = [
      { pid: 'MV-2026-0001', daysAgo: 200, type: 'Diagnosis', title: 'Essential (Primary) Hypertension Stage 1', docId: docMarcus.id, docName: 'Dr. Marcus Vance', facility: 'Heart & Vascular Pavilion', severity: 'Moderate', notes: 'Resting BP 144/92 mmHg over consecutive visits. Initiated lifestyle counseling and antihypertensive medication.' },
      { pid: 'MV-2026-0001', daysAgo: 130, type: 'Visit', title: 'Cardiology Follow-up & ECG', docId: docMarcus.id, docName: 'Dr. Marcus Vance', facility: 'Cardiology Clinic B', severity: 'Routine', notes: 'Normal sinus rhythm. BP improved to 126/82 mmHg on Lisinopril 10mg daily. No peripheral edema noted.' },
      { pid: 'MV-2026-0001', daysAgo: 60, type: 'Vaccination', title: 'Annual Quadrivalent Influenza Vaccine', docId: docSarah.id, docName: 'Dr. Sarah Chen', facility: 'MediVault Community Health Center', severity: 'Routine', notes: 'Administered 0.5 mL IM left deltoid. No acute reaction within 15 minutes observation.' },
      { pid: 'MV-2026-0001', daysAgo: 25, type: 'Diagnosis', title: 'Tension-Type Migraine Headache', docId: docSarah.id, docName: 'Dr. Sarah Chen', facility: 'Neurology & Wellness Suites', severity: 'Mild', notes: 'Recurrent bilateral throbbing headaches exacerbated by screen fatigue. Prescribed sleep hygiene protocol.' },

      { pid: 'MV-2026-0002', daysAgo: 260, type: 'Diagnosis', title: 'Type 2 Diabetes Mellitus with Mild Neuropathy', docId: docSarah.id, docName: 'Dr. Sarah Chen', facility: 'Diabetes & Endocrinology Institute', severity: 'Moderate', notes: 'HbA1c elevated at 8.4%. Patient reports mild tingling sensations in bilateral lower extremities.' },
      { pid: 'MV-2026-0002', daysAgo: 180, type: 'Surgery', title: 'Percutaneous Coronary Intervention (Stent Placement in LAD)', docId: docMarcus.id, docName: 'Dr. Marcus Vance', facility: 'Cardiac Cath Lab, MediVault Memorial', severity: 'Critical', notes: 'Successfully deployed drug-eluting stent in proximal left anterior descending artery. Uncomplicated recovery.' },
      { pid: 'MV-2026-0002', daysAgo: 50, type: 'Visit', title: 'Post-PCI Cardiac Evaluation', docId: docMarcus.id, docName: 'Dr. Marcus Vance', facility: 'Cardiology Suite 402', severity: 'Routine', notes: 'Patient tolerating dual antiplatelet therapy well. Stress echo negative for ischemia.' },

      { pid: 'MV-2026-0003', daysAgo: 190, type: 'Diagnosis', title: 'Moderate Persistent Bronchial Asthma Exacerbation', docId: docRaj.id, docName: 'Dr. Raj Patel', facility: 'Pulmonary Medicine Dept', severity: 'Severe', notes: 'Patient presented with wheezing and nocturnal dyspnea triggered by seasonal tree pollen. Peak flow at 65% predicted.' },
      { pid: 'MV-2026-0003', daysAgo: 90, type: 'Visit', title: 'Spirometry and Pulmonary Function Test', docId: docRaj.id, docName: 'Dr. Raj Patel', facility: 'Respiratory Therapy Lab', severity: 'Routine', notes: 'Post-bronchodilator FEV1 improved by 18%. Inhaled corticosteroid dosage adjusted.' },

      { pid: 'MV-2026-0006', daysAgo: 240, type: 'Hospitalization', title: 'Acute COPD Exacerbation with Hypoxemia', docId: docRaj.id, docName: 'Dr. Raj Patel', facility: 'Critical Care Inpatient Unit', severity: 'Critical', notes: 'Admitted for oxygen therapy, IV methylprednisolone, and nebulized bronchodilators for 4 days. Discharged stable.' },
      { pid: 'MV-2026-0006', daysAgo: 110, type: 'Visit', title: 'Pulmonary Rehabilitation Assessment', docId: docRaj.id, docName: 'Dr. Raj Patel', facility: 'Rehab Medicine Annex', severity: 'Moderate', notes: 'Completed 6-minute walk test (380 meters). Supplemental oxygen ordered at 2 L/min during exertion.' },

      { pid: 'MV-2026-0010', daysAgo: 170, type: 'Diagnosis', title: 'Paroxysmal Atrial Fibrillation', docId: docMarcus.id, docName: 'Dr. Marcus Vance', facility: 'Arrhythmia Center', severity: 'Severe', notes: 'Holter monitor confirmed episodes of AFib with rapid ventricular response up to 138 bpm.' },
      { pid: 'MV-2026-0012', daysAgo: 100, type: 'Diagnosis', title: 'Congestive Heart Failure (NYHA Class II)', docId: docMarcus.id, docName: 'Dr. Marcus Vance', facility: 'Heart Failure Care Clinic', severity: 'Severe', notes: 'Echocardiogram reveals reduced ejection fraction of 42%. Mild trace ankle edema.' },
      { pid: 'MV-2026-0016', daysAgo: 45, type: 'Visit', title: 'Athletic Physical & Pulmonary Clearance', docId: docRaj.id, docName: 'Dr. Raj Patel', facility: 'Sports Medicine Annex', severity: 'Routine', notes: 'Spirometry normal. Cleared for intercollegiate track with Albuterol premedication.' },
      { pid: 'MV-2026-0022', daysAgo: 30, type: 'Diagnosis', title: 'Peripheral Artery Disease Evaluation', docId: docMarcus.id, docName: 'Dr. Marcus Vance', facility: 'Vascular Diagnostic Suite', severity: 'Moderate', notes: 'Ankle-brachial index measured at 0.78 on the right lower extremity. Started Cilostazol.' }
    ];

    for (const h of historyRecords) {
      const pat = patientsMap[h.pid];
      if (pat) {
        await conn.execute(insertHistorySql, [
          pat.id,
          getRelativeDate(h.daysAgo),
          h.type,
          h.title,
          h.docId,
          h.docName,
          h.facility,
          h.severity,
          h.notes,
          getRelativeDateTime(h.daysAgo, 14, 20)
        ]);
      }
    }
    console.log(`Seeded ${historyRecords.length} medical history timeline entries.`);

    // 4. Prescriptions
    const insertPrescriptionSql = `
      INSERT INTO prescriptions (
        patient_id, doctor_id, medication_name, dosage, frequency, duration,
        start_date, end_date, instructions, status, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const prescriptionData = [
      { pid: 'MV-2026-0001', docId: docMarcus.id, med: 'Lisinopril', dosage: '10 mg', freq: 'Once daily in the morning', dur: '90 days', daysAgo: 200, status: 'Completed', inst: 'Take with or without food. Monitor blood pressure weekly.', notes: 'Initial titration for hypertension.' },
      { pid: 'MV-2026-0001', docId: docMarcus.id, med: 'Lisinopril', dosage: '20 mg', freq: 'Once daily in the morning', dur: '180 days', daysAgo: 110, status: 'Active', inst: 'Maintain daily morning dose. Refill before expiration.', notes: 'Dose increased for optimal target systolic control (< 130 mmHg).' },
      { pid: 'MV-2026-0001', docId: docSarah.id, med: 'Sumatriptan', dosage: '50 mg', freq: 'As needed at migraine onset', dur: '30 days', daysAgo: 25, status: 'Active', inst: 'Take single dose at earliest sign of migraine aura. Do not exceed 200mg in 24 hours.', notes: 'Abortive therapy for acute migraine flares.' },

      { pid: 'MV-2026-0002', docId: docSarah.id, med: 'Metformin Hydrochloride ER', dosage: '1000 mg', freq: 'Twice daily with meals', dur: '180 days', daysAgo: 250, status: 'Completed', inst: 'Take with breakfast and dinner to reduce GI upset.', notes: 'First-line glycemic control.' },
      { pid: 'MV-2026-0002', docId: docMarcus.id, med: 'Clopidogrel (Plavix)', dosage: '75 mg', freq: 'Once daily', dur: '365 days', daysAgo: 170, status: 'Active', inst: 'Take consistently every morning. Do not discontinue without consulting cardiologist.', notes: 'Antiplatelet therapy post-stent placement.' },
      { pid: 'MV-2026-0002', docId: docMarcus.id, med: 'Atorvastatin Calcium', dosage: '40 mg', freq: 'Once daily at bedtime', dur: '180 days', daysAgo: 170, status: 'Active', inst: 'Avoid grapefruit consumption while on this medication.', notes: 'High-intensity statin regimen.' },

      { pid: 'MV-2026-0003', docId: docRaj.id, med: 'Fluticasone Propionate / Salmeterol', dosage: '250/50 mcg', freq: '1 inhalation twice daily', dur: '90 days', daysAgo: 85, status: 'Active', inst: 'Rinse mouth thoroughly with water after inhalation to prevent oral candidiasis.', notes: 'Controller maintenance for moderate asthma.' },
      { pid: 'MV-2026-0003', docId: docRaj.id, med: 'Albuterol Sulfate HFA Inhaler', dosage: '90 mcg/actuation', freq: '1-2 puffs every 4-6 hours PRN', dur: 'As needed', daysAgo: 85, status: 'Active', inst: 'Use spacer device if available. Carry for sudden shortness of breath.', notes: 'Rescue bronchodilator.' },

      { pid: 'MV-2026-0004', docId: docSarah.id, med: 'Rosuvastatin (Crestor)', dosage: '10 mg', freq: 'Once daily in the evening', dur: '90 days', daysAgo: 110, status: 'Completed', inst: 'Take with or without food. Report any unexplained muscle aches.', notes: 'Targeting LDL < 100 mg/dL.' },
      { pid: 'MV-2026-0005', docId: docSarah.id, med: 'Levothyroxine Sodium', dosage: '75 mcg', freq: 'Once daily on empty stomach', dur: '180 days', daysAgo: 140, status: 'Active', inst: 'Take 30-60 minutes before breakfast with full glass of plain water.', notes: 'Thyroid hormone replacement.' },
      { pid: 'MV-2026-0006', docId: docRaj.id, med: 'Tiotropium Bromide (Spiriva)', dosage: '2.5 mcg', freq: '2 inhalations once daily', dur: '90 days', daysAgo: 70, status: 'Active', inst: 'Inhale at same time each day.', notes: 'Long-acting anticholinergic for COPD.' },
      { pid: 'MV-2026-0010', docId: docMarcus.id, med: 'Apixaban (Eliquis)', dosage: '5 mg', freq: 'Twice daily', dur: '180 days', daysAgo: 165, status: 'Active', inst: 'Take morning and evening. Do not skip doses to maintain stroke protection.', notes: 'Oral anticoagulant.' },
      { pid: 'MV-2026-0010', docId: docMarcus.id, med: 'Metoprolol Succinate ER', dosage: '50 mg', freq: 'Once daily', dur: '90 days', daysAgo: 165, status: 'Completed', inst: 'Swallow whole, do not crush or chew. Take with food.', notes: 'Ventricular rate control.' },
      { pid: 'MV-2026-0012', docId: docMarcus.id, med: 'Furosemide (Lasix)', dosage: '40 mg', freq: 'Once daily in the morning', dur: '60 days', daysAgo: 45, status: 'Active', inst: 'Take early morning to prevent nocturia.', notes: 'Loop diuretic for volume overload management.' },
      { pid: 'MV-2026-0020', docId: docMarcus.id, med: 'Omeprazole', dosage: '20 mg', freq: 'Once daily before breakfast', dur: '30 days', daysAgo: 20, status: 'Active', inst: 'Take with water before morning meal.', notes: 'Proton pump inhibitor for reflux relief.' },
      { pid: 'MV-2026-0022', docId: docMarcus.id, med: 'Cilostazol', dosage: '100 mg', freq: 'Twice daily 30 min before meals', dur: '90 days', daysAgo: 30, status: 'Active', inst: 'Take on empty stomach.', notes: 'Vasodilator for intermittent claudication.' },
      { pid: 'MV-2026-0001', docId: docMarcus.id, med: 'Propranolol', dosage: '40 mg', freq: 'Once daily', dur: '14 days', daysAgo: 90, status: 'Cancelled', inst: 'Discontinued due to mild bradycardia.', notes: 'Switched to Lisinopril titration.' }
    ];

    for (const pr of prescriptionData) {
      const pat = patientsMap[pr.pid];
      if (pat) {
        await conn.execute(insertPrescriptionSql, [
          pat.id,
          pr.docId,
          pr.med,
          pr.dosage,
          pr.freq,
          pr.dur,
          getRelativeDate(pr.daysAgo),
          null,
          pr.inst,
          pr.status,
          pr.notes,
          getRelativeDateTime(pr.daysAgo, 10, 0)
        ]);
      }
    }
    console.log(`Seeded ${prescriptionData.length} realistic prescriptions (Active, Completed, Cancelled).`);

    // 5. Diagnostic Tests
    const insertTestSql = `
      INSERT INTO test_records (
        patient_id, ordered_by_doctor_id, technician_id, test_name, category,
        ordered_date, completed_date, result_value, unit, reference_range,
        flag, status, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const diagnosticTests = [
      // Completed Normal
      { pid: 'MV-2026-0001', docId: docMarcus.id, techId: techAlex.id, name: 'Comprehensive Metabolic Panel (CMP)', cat: 'Blood', oDays: 52, cDays: 51, val: '98', unit: 'mg/dL (Glucose)', ref: '70 - 99', flag: 'Normal', status: 'Completed', notes: 'Electrolytes, renal parameters, and hepatic enzymes normal.' },
      { pid: 'MV-2026-0001', docId: docMarcus.id, techId: techMorgan.id, name: '12-Lead Electrocardiogram (ECG)', cat: 'Cardiology', oDays: 45, cDays: 45, val: 'Normal Sinus Rhythm 72 bpm', unit: '', ref: '60 - 100 bpm', flag: 'Normal', status: 'Completed', notes: 'Normal axis, no ST-T wave abnormalities.' },
      { pid: 'MV-2026-0003', docId: docRaj.id, techId: techMorgan.id, name: 'Chest X-Ray (PA & Lateral Views)', cat: 'Imaging', oDays: 40, cDays: 40, val: 'Clear lung fields', unit: '', ref: 'Clear lung fields', flag: 'Normal', status: 'Completed', notes: 'No focal consolidation, pneumothorax, or pleural effusion.' },
      { pid: 'MV-2026-0010', docId: docMarcus.id, techId: techMorgan.id, name: 'Echocardiogram Transthoracic (TTE)', cat: 'Imaging', oDays: 35, cDays: 34, val: '58% LVEF', unit: '%', ref: '50 - 70', flag: 'Normal', status: 'Completed', notes: 'Preserved systolic function, mild left atrial enlargement.' },
      { pid: 'MV-2026-0016', docId: docRaj.id, techId: techAlex.id, name: 'Urinalysis Multi-Panel with Microscopy', cat: 'Urine', oDays: 28, cDays: 28, val: 'Negative', unit: '', ref: 'Negative', flag: 'Normal', status: 'Completed', notes: 'No protein, glucose, leukocytes, or erythrocytes present.' },

      // Completed High
      { pid: 'MV-2026-0001', docId: docMarcus.id, techId: techAlex.id, name: 'Lipid Panel (Fasting)', cat: 'Blood', oDays: 48, cDays: 47, val: '228', unit: 'mg/dL (Total Chol)', ref: '< 200', flag: 'High', status: 'Completed', notes: 'Elevated total cholesterol. LDL was 142 mg/dL.' },
      { pid: 'MV-2026-0002', docId: docSarah.id, techId: techAlex.id, name: 'Hemoglobin A1c (HbA1c)', cat: 'Blood', oDays: 55, cDays: 54, val: '7.8', unit: '%', ref: '4.0 - 5.6', flag: 'High', status: 'Completed', notes: 'Moderate glycemic elevation. Metformin dose adjusted.' },
      { pid: 'MV-2026-0004', docId: docSarah.id, techId: techAlex.id, name: 'Serum LDL Cholesterol Direct', cat: 'Blood', oDays: 38, cDays: 37, val: '168', unit: 'mg/dL', ref: '< 100', flag: 'High', status: 'Completed', notes: 'Marked LDL elevation requiring high-potency statin.' },
      { pid: 'MV-2026-0005', docId: docSarah.id, techId: techAlex.id, name: 'Thyroid Stimulating Hormone (TSH)', cat: 'Blood', oDays: 30, cDays: 29, val: '8.4', unit: 'uIU/mL', ref: '0.4 - 4.0', flag: 'High', status: 'Completed', notes: 'Suboptimal thyroid control. Increased Levothyroxine.' },
      { pid: 'MV-2026-0008', docId: docSarah.id, techId: techAlex.id, name: 'Serum Uric Acid Quantitative', cat: 'Blood', oDays: 26, cDays: 25, val: '8.9', unit: 'mg/dL', ref: '3.5 - 7.2', flag: 'High', status: 'Completed', notes: 'Hyperuricemia correlated with recent acute metatarsal gout flare.' },

      // Completed Low
      { pid: 'MV-2026-0005', docId: docSarah.id, techId: techAlex.id, name: 'Free Thyroxine (Free T4)', cat: 'Blood', oDays: 30, cDays: 29, val: '0.6', unit: 'ng/dL', ref: '0.8 - 1.8', flag: 'Low', status: 'Completed', notes: 'Corresponds with primary elevated TSH.' },
      { pid: 'MV-2026-0013', docId: docSarah.id, techId: techAlex.id, name: 'Serum Ferritin & Iron Saturation', cat: 'Blood', oDays: 32, cDays: 31, val: '12', unit: 'ng/mL', ref: '30 - 200', flag: 'Low', status: 'Completed', notes: 'Severe iron deficiency anemia. Commenced oral ferrous sulfate.' },
      { pid: 'MV-2026-0021', docId: docSarah.id, techId: techAlex.id, name: 'Serum Vitamin D (25-Hydroxy)', cat: 'Blood', oDays: 22, cDays: 21, val: '18', unit: 'ng/mL', ref: '30 - 100', flag: 'Low', status: 'Completed', notes: 'Hypovitaminosis D. Started Ergocalciferol 50,000 IU weekly.' },

      // Completed Critical
      { pid: 'MV-2026-0006', docId: docRaj.id, techId: techAlex.id, name: 'Arterial Blood Gas (ABG - PaO2)', cat: 'Blood', oDays: 58, cDays: 58, val: '52', unit: 'mmHg', ref: '75 - 100', flag: 'Critical', status: 'Completed', notes: 'Severe hypoxemia during acute exacerbation. Required high-flow oxygen.' },
      { pid: 'MV-2026-0012', docId: docMarcus.id, techId: techAlex.id, name: 'B-Type Natriuretic Peptide (BNP)', cat: 'Blood', oDays: 42, cDays: 41, val: '720', unit: 'pg/mL', ref: '< 100', flag: 'Critical', status: 'Completed', notes: 'Marked volume overload indicating decompensated CHF.' },
      { pid: 'MV-2026-0022', docId: docMarcus.id, techId: techAlex.id, name: 'Serum Potassium (K+ Critical Panel)', cat: 'Blood', oDays: 18, cDays: 18, val: '6.4', unit: 'mEq/L', ref: '3.5 - 5.0', flag: 'Critical', status: 'Completed', notes: 'Critical hyperkalemia. Immediate IV calcium gluconate and insulin-dextrose administered.' },

      // In Progress
      { pid: 'MV-2026-0007', docId: docSarah.id, techId: techAlex.id, name: 'tTG-IgA Celiac Antibody Panel', cat: 'Pathology', oDays: 4, cDays: null, val: null, unit: 'U/mL', ref: '< 15.0', flag: 'Pending', status: 'In Progress', notes: 'Specimen centrifuge complete; incubation in progress.' },
      { pid: 'MV-2026-0015', docId: docSarah.id, techId: techMorgan.id, name: 'Antinuclear Antibodies (ANA) Screen', cat: 'Pathology', oDays: 3, cDays: null, val: null, unit: '', ref: 'Negative', flag: 'Pending', status: 'In Progress', notes: 'Immunofluorescence staining in progress.' },
      { pid: 'MV-2026-0020', docId: docMarcus.id, techId: techAlex.id, name: 'Helicobacter Pylori Stool Antigen', cat: 'Stool', oDays: 2, cDays: null, val: null, unit: '', ref: 'Negative', flag: 'Pending', status: 'In Progress', notes: 'Enzyme immunoassay running on stool specimen.' },

      // In Progress & Overdue (> 7 days)
      { pid: 'MV-2026-0004', docId: docSarah.id, techId: techAlex.id, name: 'Hemoglobin Electrophoresis Panel', cat: 'Blood', oDays: 16, cDays: null, val: null, unit: '%', ref: 'Normal pattern', flag: 'Pending', status: 'In Progress', notes: 'Reference laboratory send-out specimen pending return.' },

      // Ordered (Pending Queue)
      { pid: 'MV-2026-0001', docId: docSarah.id, techId: null, name: 'Serum Cortisol Morning Baseline', cat: 'Blood', oDays: 5, cDays: null, val: null, unit: 'ug/dL', ref: '6.0 - 18.4', flag: 'Pending', status: 'Ordered', notes: 'Fast 8 hours prior; collection strictly between 07:00 and 09:00.' },
      { pid: 'MV-2026-0009', docId: docSarah.id, techId: null, name: 'Pelvic Ultrasound (Transvaginal & Abdominal)', cat: 'Imaging', oDays: 4, cDays: null, val: null, unit: '', ref: 'Normal ovarian architecture', flag: 'Pending', status: 'Ordered', notes: 'Evaluate bilateral ovarian follicular distribution.' },
      { pid: 'MV-2026-0011', docId: docRaj.id, techId: null, name: 'Fractional Exhaled Nitric Oxide (FeNO)', cat: 'Cardiology', oDays: 3, cDays: null, val: null, unit: 'ppb', ref: '< 25', flag: 'Pending', status: 'Ordered', notes: 'Assess eosinophilic airway inflammation.' },
      { pid: 'MV-2026-0025', docId: docSarah.id, techId: null, name: 'Fecal Calprotectin Quantitative', cat: 'Stool', oDays: 2, cDays: null, val: null, unit: 'ug/g', ref: '< 50', flag: 'Pending', status: 'Ordered', notes: 'Assess mucosal inflammatory status in stool specimen for IBD.' },

      // Ordered & Overdue (> 7 days)
      { pid: 'MV-2026-0002', docId: docMarcus.id, techId: null, name: 'Carotid Artery Duplex Ultrasound', cat: 'Imaging', oDays: 12, cDays: null, val: null, unit: '', ref: 'No hemodynamically significant stenosis', flag: 'Pending', status: 'Ordered', notes: 'Patient rescheduled appointment; awaiting imaging slot.' },
      { pid: 'MV-2026-0014', docId: docMarcus.id, techId: null, name: 'Lumbar Spine Magnetic Resonance Imaging (MRI)', cat: 'Imaging', oDays: 14, cDays: null, val: null, unit: '', ref: 'Normal disc height', flag: 'Pending', status: 'Ordered', notes: 'Prior authorization approved; pending imaging center scheduling.' },

      // Cancelled
      { pid: 'MV-2026-0003', docId: docRaj.id, techId: null, name: 'Methacholine Bronchoprovocation Challenge', cat: 'Cardiology', oDays: 20, cDays: null, val: null, unit: '', ref: 'Negative', flag: 'Pending', status: 'Cancelled', notes: 'Cancelled due to acute viral rhinitis on scheduled test date.' }
    ];

    for (const t of diagnosticTests) {
      const pat = patientsMap[t.pid];
      if (pat) {
        await conn.execute(insertTestSql, [
          pat.id,
          t.docId,
          t.techId,
          t.name,
          t.cat,
          getRelativeDate(t.oDays),
          t.cDays ? getRelativeDate(t.cDays) : null,
          t.val,
          t.unit,
          t.ref,
          t.flag,
          t.status,
          t.notes,
          getRelativeDateTime(t.oDays, 9, 30)
        ]);
      }
    }
    console.log(`Seeded ${diagnosticTests.length} diagnostic tests with Normal, High, Low, Critical flags and Overdue specimens.`);

    // 6. Patient Access Grants
    const insertGrantSql = `
      INSERT INTO patient_access_grants (
        patient_id, doctor_id, granted_by, status, expires_at, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const elPatient = patientsMap['MV-2026-0001'];
    if (elPatient) {
      await conn.execute(insertGrantSql, [
        elPatient.id,
        docSarah.id,
        patientUser.id,
        'Granted',
        getRelativeDateTime(-60, 23, 59),
        'Authorized Dr. Sarah Chen for multidisciplinary consult regarding tension migraines and endocrine balance.',
        getRelativeDateTime(90, 11, 0)
      ]);

      await conn.execute(insertGrantSql, [
        elPatient.id,
        docRaj.id,
        patientUser.id,
        'Revoked',
        null,
        'Temporary pulmonology consultation completed. Access revoked by patient.',
        getRelativeDateTime(150, 15, 30)
      ]);
    }

    const arPatient = patientsMap['MV-2026-0002'];
    if (arPatient) {
      await conn.execute(insertGrantSql, [
        arPatient.id,
        docSarah.id,
        adminUser.id,
        'Granted',
        null,
        'Endocrine consult for diabetic care plan optimization.',
        getRelativeDateTime(180, 10, 0)
      ]);
    }

    const soPatient = patientsMap['MV-2026-0003'];
    if (soPatient) {
      await conn.execute(insertGrantSql, [
        soPatient.id,
        docMarcus.id,
        adminUser.id,
        'Granted',
        getRelativeDateTime(-30, 18, 0),
        'Cardiopulmonary clearance prior to endurance training program.',
        getRelativeDateTime(30, 9, 0)
      ]);
    }
    console.log('Seeded patient access authorizations and consent grants.');

    // 7. Audit Trail Logs
    const insertAuditSql = `
      INSERT INTO audit_logs (
        user_id, user_email, user_role, action, resource, resource_id, details, ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const auditEvents = [
      { uId: adminUser.id, email: 'admin@medivault.com', role: 'Admin', action: 'LOGIN', res: 'USER', resId: String(adminUser.id), details: 'Administrative system logon with 2FA clearance', ip: '192.168.1.10', days: 280 },
      { uId: docMarcus.id, email: 'doctor@medivault.com', role: 'Doctor', action: 'CREATE', res: 'PATIENT', resId: 'MV-2026-0001', details: 'Registered new patient profile Eleanor Vance (MV-2026-0001)', ip: '192.168.1.15', days: 280 },
      { uId: patientUser.id, email: 'patient@medivault.com', role: 'Patient', action: 'LOGIN', res: 'USER', resId: String(patientUser.id), details: 'Patient accessed personal health records portal', ip: '73.189.42.11', days: 275 },
      { uId: docMarcus.id, email: 'doctor@medivault.com', role: 'Doctor', action: 'CREATE', res: 'PRESCRIPTION', resId: '1', details: 'Prescribed Lisinopril (10 mg) for MV-2026-0001', ip: '192.168.1.15', days: 200 },
      { uId: docMarcus.id, email: 'doctor@medivault.com', role: 'Doctor', action: 'CREATE', res: 'TEST', resId: '1', details: 'Ordered Comprehensive Metabolic Panel for MV-2026-0001', ip: '192.168.1.15', days: 52 },
      { uId: techAlex.id, email: 'lab@medivault.com', role: 'Lab Technician', action: 'UPDATE', res: 'TEST', resId: '1', details: 'Verified & released CMP lab results for MV-2026-0001 [Normal]', ip: '192.168.1.44', days: 51 },
      { uId: patientUser.id, email: 'patient@medivault.com', role: 'Patient', action: 'ACCESS_GRANT', res: 'ACCESS', resId: '1', details: 'Granted record access to Dr. Sarah Chen', ip: '73.189.42.11', days: 90 },
      { uId: docSarah.id, email: 'dr.chen@medivault.com', role: 'Doctor', action: 'VIEW', res: 'PATIENT', resId: 'MV-2026-0001', details: 'Viewed patient profile Eleanor Vance via patient consent grant', ip: '192.168.1.22', days: 89 },
      { uId: docSarah.id, email: 'dr.chen@medivault.com', role: 'Doctor', action: 'CREATE', res: 'PRESCRIPTION', resId: '3', details: 'Prescribed Sumatriptan 50 mg for MV-2026-0001', ip: '192.168.1.22', days: 25 },
      { uId: techAlex.id, email: 'lab@medivault.com', role: 'Lab Technician', action: 'UPDATE', res: 'TEST', resId: '17', details: 'Updated test status to In Progress (Celiac Disease Antibody Panel)', ip: '192.168.1.44', days: 4 },
      { uId: adminUser.id, email: 'admin@medivault.com', role: 'Admin', action: 'VIEW', res: 'AUDIT', resId: null, details: 'Reviewed quarterly compliance and security audit logs', ip: '192.168.1.10', days: 1 }
    ];

    for (const a of auditEvents) {
      await conn.execute(insertAuditSql, [
        a.uId,
        a.email,
        a.role,
        a.action,
        a.res,
        a.resId,
        a.details,
        a.ip,
        getRelativeDateTime(a.days, 14, 0)
      ]);
    }
    console.log(`Seeded ${auditEvents.length} audit trail records.`);
    console.log('--- MediVault Database Seeding Completed Successfully ---');
  } finally {
    conn.release();
  }
}

if (require.main === module) {
  const { initDatabase } = require('../config/db');
  (async () => {
    try {
      const pool = await initDatabase();
      await seedDatabase(pool);
      process.exit(0);
    } catch (err) {
      console.error('Seeding error:', err);
      process.exit(1);
    }
  })();
}

module.exports = { seedDatabase };
