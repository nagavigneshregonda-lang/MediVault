const request = require('supertest');
const app = require('../server/app');
const { initDatabase, closePool, query } = require('../server/config/db');
const { seedDatabase } = require('../server/db/seed');

jest.setTimeout(30000);

let adminToken;
let doctorMarcusToken; // assigned to Eleanor Vance (MV-2026-0001)
let doctorRajToken;    // NOT assigned to Eleanor Vance, grant was revoked
let doctorChenToken;   // granted access by Eleanor Vance
let patientToken;      // Eleanor Vance
let labToken;          // Alex Thorne

beforeAll(async () => {
  // Initialize and re-seed test database before tests
  await initDatabase('medivault_test');
  await seedDatabase();

  // 1. Login Admin
  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@medivault.com', password: 'Admin@123' });
  adminToken = adminRes.body.data.token;

  // 2. Login Doctor Marcus
  const docMarcusRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'doctor@medivault.com', password: 'Doctor@123' });
  doctorMarcusToken = docMarcusRes.body.data.token;

  // 3. Login Doctor Raj
  const docRajRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'dr.patel@medivault.com', password: 'Doctor@123' });
  doctorRajToken = docRajRes.body.data.token;

  // 4. Login Doctor Sarah Chen
  const docChenRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'dr.chen@medivault.com', password: 'Doctor@123' });
  doctorChenToken = docChenRes.body.data.token;

  // 5. Login Patient (Eleanor Vance)
  const patientRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'patient@medivault.com', password: 'Patient@123' });
  patientToken = patientRes.body.data.token;

  // 6. Login Lab Technician
  const labRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'lab@medivault.com', password: 'Lab@123' });
  labToken = labRes.body.data.token;
});

afterAll(async () => {
  await closePool();
});

describe('1. Authentication & Security Tests', () => {
  test('Successful login returns token and user payload', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@medivault.com', password: 'Admin@123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.role).toBe('Admin');
  });

  test('Login failure with incorrect password returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@medivault.com', password: 'WrongPassword!' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('Login failure with unregistered email returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unknown.user@medivault.com', password: 'Admin@123' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('Protected endpoint returns 401 when token is missing', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('/api/auth/me returns current user identity when token provided', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('patient@medivault.com');
    expect(res.body.data.role).toBe('Patient');
  });
});

describe('2. Role-Based Access Control (RBAC) & Authorized Access', () => {
  test('Admin can access Audit Trail', async () => {
    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.logs)).toBe(true);
  });

  test('Non-Admin (Patient, Doctor, Lab) is rejected with 403 on Audit Trail', async () => {
    const res1 = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(res1.status).toBe(403);

    const res2 = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${doctorMarcusToken}`);
    expect(res2.status).toBe(403);

    const res3 = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${labToken}`);
    expect(res3.status).toBe(403);
  });

  test('Assigned Doctor can access patient record (Dr. Marcus -> MV-2026-0001)', async () => {
    const res = await request(app)
      .get('/api/patients/MV-2026-0001')
      .set('Authorization', `Bearer ${doctorMarcusToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.first_name).toBe('Eleanor');
  });

  test('Doctor with active consent grant can access patient (Dr. Sarah Chen -> MV-2026-0001)', async () => {
    const res = await request(app)
      .get('/api/patients/MV-2026-0001')
      .set('Authorization', `Bearer ${doctorChenToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.patient_id).toBe('MV-2026-0001');
  });

  test('Doctor WITHOUT assignment or active consent is DENIED with 403 (Dr. Raj -> MV-2026-0001)', async () => {
    const res = await request(app)
      .get('/api/patients/MV-2026-0001')
      .set('Authorization', `Bearer ${doctorRajToken}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Access denied/i);
  });

  test('Patient CAN access their own record', async () => {
    const res = await request(app)
      .get('/api/patients/MV-2026-0001')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('patient@medivault.com');
  });

  test('Patient CANNOT access another patient record (403 Forbidden)', async () => {
    const res = await request(app)
      .get('/api/patients/MV-2026-0002')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(403);
  });
});

describe('3. Exact Seed Data Summary Counts, Filters & Categories', () => {
  test('Patients summary counts exactly match initial seed data across full dataset', async () => {
    const res = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const summary = res.body.data.summary;
    expect(summary).toBeDefined();
    expect(summary.total).toBe(58);
    expect(summary.femaleCount).toBe(29);
    expect(summary.maleCount).toBe(29);
    expect(summary.allergyWatchlist).toBe(41);
    expect(summary.chronicCount).toBe(57);
  });

  test('Patients summary counts dynamically update over filtered dataset (Female filter)', async () => {
    const res = await request(app)
      .get('/api/patients?gender=Female')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const summary = res.body.data.summary;
    expect(summary.total).toBe(29);
    expect(summary.femaleCount).toBe(29);
    expect(summary.maleCount).toBe(0);
    expect(summary.allergyWatchlist).toBe(21);
    expect(summary.chronicCount).toBe(28);
  });

  test('Diagnostic tests summary counts match initial seed data', async () => {
    const res = await request(app)
      .get('/api/tests')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const summary = res.body.data.summary;
    expect(summary).toBeDefined();
    expect(summary.total).toBe(27);
    expect(summary.pending).toBe(6);
    expect(summary.inProgress).toBe(4);
    expect(summary.completed).toBe(16);
    expect(summary.critical).toBe(3);
    expect(summary.overdue).toBe(3);
  });

  test('Stool category tests exist in seed data and filter properly', async () => {
    const res = await request(app)
      .get('/api/tests?category=Stool')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.tests.length).toBe(2);
    expect(res.body.data.summary.total).toBe(2);
    const testNames = res.body.data.tests.map(t => t.test_name);
    expect(testNames).toContain('Helicobacter Pylori Stool Antigen');
    expect(testNames).toContain('Fecal Calprotectin Quantitative');
  });

  test('Dashboard chart past 12 months provides all 12 consecutive months with short month names', async () => {
    const res = await request(app)
      .get('/api/stats/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const regTrend = res.body.data.charts.registrationsByMonth;
    expect(regTrend).toBeDefined();
    expect(regTrend.length).toBe(12);
    regTrend.forEach(item => {
      expect(typeof item.month).toBe('string');
      expect(item.month.length).toBe(3);
      expect(typeof item.count).toBe('number');
      expect(item.count).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('4. Patient Profiles, Validations & Business Rules', () => {
  test('Creating patient auto-generates sequential ID (MV-2026-XXXX) and calculates age/BMI', async () => {
    const newPat = {
      first_name: 'Jessica',
      last_name: 'Taylor',
      dob: '1996-03-15',
      gender: 'Female',
      blood_group: 'A+',
      phone: '+1 (555) 999-0011',
      email: 'jessica.taylor.test@example.com',
      height_cm: 165,
      weight_kg: 60,
      allergies: 'Latex',
      chronic_conditions: 'None'
    };

    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newPat);

    expect(res.status).toBe(201);
    expect(res.body.data.patient_id).toMatch(/^MV-\d{4}-\d{4}$/);
    expect(res.body.data.first_name).toBe('Jessica');
  });

  test('Creating patient with future DOB fails with 400 validation error', async () => {
    const futurePat = {
      first_name: 'Future',
      last_name: 'Child',
      dob: '2040-01-01',
      gender: 'Female',
      blood_group: 'O+',
      phone: '+1 (555) 000-1122'
    };

    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(futurePat);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot be in the future/i);
  });

  test('Duplicate patient prevention: duplicate phone returns 409 Conflict', async () => {
    const duplicate = {
      first_name: 'Imposter',
      last_name: 'Vance',
      dob: '1985-01-01',
      gender: 'Female',
      blood_group: 'O+',
      phone: '+1 (555) 882-9011' // Eleanor Vance's phone
    };

    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(duplicate);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Duplicate patient detected/i);
  });

  test('Admin can soft-delete and restore a patient', async () => {
    // Delete
    const delRes = await request(app)
      .delete('/api/patients/MV-2026-0016')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);

    // Verify list default hides deleted
    const listRes = await request(app)
      .get('/api/patients?search=Liam')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.body.data.patients.length).toBe(0);

    // Restore
    const restoreRes = await request(app)
      .post('/api/patients/MV-2026-0016/restore')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(200);

    // Verify restored
    const listAgain = await request(app)
      .get('/api/patients?search=Liam')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listAgain.body.data.patients.length).toBe(1);
  });
});

describe('4. Prescriptions & Drug Allergy Conflict Warning', () => {
  test('Prescribing a medication conflicting with patient allergy triggers 409 Warning', async () => {
    // Eleanor Vance is allergic to Penicillin. Prescribing Amoxicillin should trigger conflict.
    const conflictPrescription = {
      medication_name: 'Amoxicillin Trihydrate',
      dosage: '500 mg',
      frequency: 'Three times daily',
      duration: '7 days',
      start_date: '2026-02-01',
      instructions: 'Take after meals'
    };

    const res = await request(app)
      .post('/api/patients/MV-2026-0001/prescriptions')
      .set('Authorization', `Bearer ${doctorMarcusToken}`)
      .send(conflictPrescription);

    expect(res.status).toBe(409);
    expect(res.body.warningType).toBe('DRUG_ALLERGY_CONFLICT');
    expect(res.body.message).toMatch(/PENICILLIN/i);
  });

  test('Prescribing with explicit override allows doctor confirmation after warning', async () => {
    const overridePrescription = {
      medication_name: 'Amoxicillin Trihydrate',
      dosage: '500 mg',
      frequency: 'Three times daily',
      duration: '7 days',
      start_date: '2026-02-01',
      instructions: 'Take with antihistamine under close clinical observation',
      override_allergy_warning: true
    };

    const res = await request(app)
      .post('/api/patients/MV-2026-0001/prescriptions')
      .set('Authorization', `Bearer ${doctorMarcusToken}`)
      .send(overridePrescription);

    expect(res.status).toBe(201);
    expect(res.body.data.medication_name).toBe('Amoxicillin Trihydrate');
  });

  test('Updating prescription status to Completed', async () => {
    const res = await request(app)
      .patch('/api/patients/MV-2026-0001/prescriptions/2/status')
      .set('Authorization', `Bearer ${doctorMarcusToken}`)
      .send({ status: 'Completed', notes: 'Completed full course as directed' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Completed');
  });
});

describe('5. Diagnostic Tests & Lab Technician Workflow', () => {
  let createdTestId;

  test('Doctor orders a diagnostic test for patient', async () => {
    const newTest = {
      test_name: 'Serum Potassium & Sodium Panel',
      category: 'Blood',
      reference_range: '3.5 - 5.0',
      unit: 'mEq/L',
      notes: 'Evaluate electrolyte balance'
    };

    const res = await request(app)
      .post('/api/patients/MV-2026-0001/tests')
      .set('Authorization', `Bearer ${doctorMarcusToken}`)
      .send(newTest);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('Ordered');
    expect(res.body.data.flag).toBe('Pending');
    createdTestId = res.body.data.id;
  });

  test('Lab Technician updates test result with auto-flag calculation (High)', async () => {
    const update = {
      result_value: '5.8', // Above high bound of 5.0
      status: 'Completed',
      notes: 'Elevated potassium verified with repeat specimen check'
    };

    const res = await request(app)
      .put(`/api/tests/${createdTestId}`)
      .set('Authorization', `Bearer ${labToken}`)
      .send(update);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Completed');
    expect(res.body.data.flag).toBe('High');
  });
});

describe('6. Patient Dynamic Access Authorization & Revocation', () => {
  test('Patient grants Dr. Raj Patel access, enabling him to view record', async () => {
    const [docRajRows] = await query("SELECT id FROM users WHERE email = 'dr.patel@medivault.com'");
    const docRaj = docRajRows[0];

    // 1. Grant access
    const grantRes = await request(app)
      .post('/api/access/grant')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        patient_id: 'MV-2026-0001',
        doctor_id: docRaj.id,
        notes: 'Temporary access granted for pulmonology second opinion.'
      });
    expect(grantRes.status).toBe(201);

    // 2. Dr. Raj now HAS access (previously returned 403)
    const accessRes = await request(app)
      .get('/api/patients/MV-2026-0001')
      .set('Authorization', `Bearer ${doctorRajToken}`);
    expect(accessRes.status).toBe(200);

    // 3. Patient revokes access
    const revokeRes = await request(app)
      .post('/api/access/revoke')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        patient_id: 'MV-2026-0001',
        doctor_id: docRaj.id
      });
    expect(revokeRes.status).toBe(200);

    // 4. Dr. Raj is once again DENIED with 403
    const deniedRes = await request(app)
      .get('/api/patients/MV-2026-0001')
      .set('Authorization', `Bearer ${doctorRajToken}`);
    expect(deniedRes.status).toBe(403);
  });
});

describe('7. System Analytics & Health Monitoring', () => {
  test('Admin dashboard stats includes readable months, overdue tests, and system health payload', async () => {
    const res = await request(app)
      .get('/api/stats/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.counts.totalPatients).toBeGreaterThanOrEqual(50);
    expect(res.body.data.counts.overdueTests).toBeDefined();

    // Check systemHealth
    const health = res.body.data.systemHealth;
    expect(health).toBeDefined();
    expect(health.databaseStatus).toBe('Healthy & Connected');
    expect(health.nodeVersion).toBeDefined();

    // Check readable months in registration trend
    const regTrend = res.body.data.charts.registrationsByMonth;
    expect(Array.isArray(regTrend)).toBe(true);
    expect(regTrend.length).toBeGreaterThan(0);
    expect(typeof regTrend[0].month).toBe('string');
    expect(regTrend[0].month.length).toBe(3);
  });
});

describe('8. Diagnostic Tests Summary & Overdue Logic', () => {
  test('GET /api/tests returns categorized summary counts and overdue flags', async () => {
    const res = await request(app)
      .get('/api/tests')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.summary.total).toBeGreaterThan(0);
    expect(res.body.data.summary.pending).toBeDefined();
    expect(res.body.data.summary.critical).toBeDefined();
    expect(res.body.data.summary.overdue).toBeGreaterThan(0);

    // Verify overdue test flag is present in returned tests
    const overdueItem = res.body.data.tests.find(t => t.is_overdue === true);
    expect(overdueItem).toBeDefined();
  });

  test('GET /api/tests?status=queue returns only Ordered and In Progress tests for lab queue', async () => {
    const res = await request(app)
      .get('/api/tests?status=queue')
      .set('Authorization', `Bearer ${labToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tests.length).toBeGreaterThan(0);
    res.body.data.tests.forEach(test => {
      expect(['Ordered', 'In Progress']).toContain(test.status);
    });
  });
});

describe('9. Access Grants Hub & Summary Statistics', () => {
  test('GET /api/access returns system-wide grants and consent summary', async () => {
    const res = await request(app)
      .get('/api/access')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.grants).toBeDefined();
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.summary.activeGrants).toBeGreaterThan(0);
  });
});

describe('10. Patient Summary Counts Validation', () => {
  test('GET /api/patients returns non-zero summary counts matching dataset', async () => {
    const res = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.summary.total).toBeGreaterThanOrEqual(50);
    expect(res.body.data.summary.maleCount).toBeGreaterThan(0);
    expect(res.body.data.summary.femaleCount).toBeGreaterThan(0);
    expect(res.body.data.summary.allergyWatchlist).toBeGreaterThan(0);
    expect(res.body.data.summary.chronicCount).toBeGreaterThan(0);
  });
});

describe('11. Patient Account Provisioning, Role-Scoped Dashboards & Strict Access Enforcement', () => {
  let newPatientEmail = `test.patient.${Date.now()}@medivault.com`;
  let newPatientTemporaryPassword;
  let newPatientId;
  let newPatientCode;
  let newPatientToken;

  test('1. Admin creates a patient with login account in one transaction', async () => {
    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        first_name: 'Jessica',
        last_name: 'Walsh',
        dob: '1992-04-12',
        gender: 'Female',
        blood_group: 'B+',
        phone: '+1 555-882-9911',
        email: newPatientEmail,
        create_login: true,
        login_email: newPatientEmail,
        generate_temporary: true
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.patient_id).toBeDefined();
    expect(res.body.data.temporary_password).toBeDefined();
    expect(res.body.data.password_hash).toBeUndefined(); // Never leak hash

    newPatientId = res.body.data.id;
    newPatientCode = res.body.data.patient_id;
    newPatientTemporaryPassword = res.body.data.temporary_password;

    // Verify linked account in DB
    const [pRows] = await query('SELECT * FROM patients WHERE id = ?', [newPatientId]);
    expect(pRows[0].user_id).not.toBeNull();

    const [uRows] = await query('SELECT * FROM users WHERE id = ?', [pRows[0].user_id]);
    expect(uRows[0].email).toBe(newPatientEmail.toLowerCase());
    expect(uRows[0].role).toBe('Patient');
  });

  test('2. Duplicate email rejected with 409 Conflict', async () => {
    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        first_name: 'Clone',
        last_name: 'Patient',
        dob: '1990-01-01',
        gender: 'Male',
        blood_group: 'O+',
        phone: '+1 555-111-2222',
        create_login: true,
        login_email: newPatientEmail, // Duplicate
        generate_temporary: true
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test('3. Double linking rejected with 409 Conflict', async () => {
    const res = await request(app)
      .post(`/api/patients/${newPatientId}/create-login`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `another.${Date.now()}@medivault.com`,
        generate_temporary: true
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test('4. Non-Admin cannot create login account (403 Forbidden)', async () => {
    // Create an unlinked patient first
    const unlinkedRes = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        first_name: 'NoLogin',
        last_name: 'Person',
        dob: '1985-05-15',
        gender: 'Male',
        blood_group: 'A+',
        phone: '+1 555-333-4444'
      });
    const unlinkedId = unlinkedRes.body.data.id;

    // Doctor attempts to provision login -> 403
    const docRes = await request(app)
      .post(`/api/patients/${unlinkedId}/create-login`)
      .set('Authorization', `Bearer ${doctorMarcusToken}`)
      .send({ email: 'nologin@test.com', generate_temporary: true });
    expect(docRes.status).toBe(403);

    // Patient attempts to provision login -> 403
    const patRes = await request(app)
      .post(`/api/patients/${unlinkedId}/create-login`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ email: 'nologin@test.com', generate_temporary: true });
    expect(patRes.status).toBe(403);
  });

  test('5. New patient logs in with temporary password and accesses own record', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: newPatientEmail, password: newPatientTemporaryPassword });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.user.role).toBe('Patient');
    expect(loginRes.body.data.user.patientCode).toBe(newPatientCode);
    expect(loginRes.body.data.user.patientId).toBeDefined();

    newPatientToken = loginRes.body.data.token;

    // Verify /api/auth/me returns the linked patient record id and code
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${newPatientToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.patientCode).toBe(newPatientCode);
    expect(meRes.body.data.patientId).toBe(newPatientId);

    // Access own record -> 200
    const ownRecRes = await request(app)
      .get(`/api/patients/${newPatientCode}`)
      .set('Authorization', `Bearer ${newPatientToken}`);
    expect(ownRecRes.status).toBe(200);
    expect(ownRecRes.body.data.patient_id).toBe(newPatientCode);
  });

  test('5b. Seeded demo patient retrieves their record id from /api/auth/me and opens own record', async () => {
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.role).toBe('Patient');
    expect(meRes.body.data.patientCode).toBe('MV-2026-0001');
    expect(meRes.body.data.patientId).toBeDefined();

    // Opens own record
    const ownRecRes = await request(app)
      .get('/api/patients/MV-2026-0001')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(ownRecRes.status).toBe(200);
    expect(ownRecRes.body.data.first_name).toBe('Eleanor');

    // Attempting another record -> 403
    const forbiddenRes = await request(app)
      .get('/api/patients/MV-2026-0002')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(forbiddenRes.status).toBe(403);
  });

  test('5c. User linked to patient dynamically receives patientCode on /api/auth/me and opens own record', async () => {
    // 1. Create an unlinked patient first
    const createPatRes = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        first_name: 'LateLink',
        last_name: 'User',
        dob: '1995-08-20',
        gender: 'Male',
        blood_group: 'AB+',
        phone: '+1 555-909-8877'
      });
    expect(createPatRes.status).toBe(201);
    const latePatientId = createPatRes.body.data.id;
    const latePatientCode = createPatRes.body.data.patient_id;

    // 2. Admin provisions login for this patient
    const lateEmail = `latelink.${Date.now()}@example.com`;
    const provRes = await request(app)
      .post(`/api/patients/${latePatientId}/create-login`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: lateEmail, generate_temporary: true });
    expect(provRes.status).toBe(201);
    const tempPw = provRes.body.data.temporary_password;

    // 3. User logs in
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: lateEmail, password: tempPw });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.data.token;

    // 4. /api/auth/me returns the linked patient id and code
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.patientCode).toBe(latePatientCode);
    expect(meRes.body.data.patientId).toBe(latePatientId);

    // 5. Opens own record -> 200
    const ownRecRes = await request(app)
      .get(`/api/patients/${latePatientCode}`)
      .set('Authorization', `Bearer ${token}`);
    expect(ownRecRes.status).toBe(200);
    expect(ownRecRes.body.data.patient_id).toBe(latePatientCode);

    // 6. Accessing another record -> 403
    const forbiddenRes = await request(app)
      .get('/api/patients/MV-2026-0001')
      .set('Authorization', `Bearer ${token}`);
    expect(forbiddenRes.status).toBe(403);
  });

  test('6. Patient cannot open another patient\'s record (403 Forbidden)', async () => {
    // New patient tries to access Eleanor Vance (MV-2026-0001)
    const res = await request(app)
      .get('/api/patients/MV-2026-0001')
      .set('Authorization', `Bearer ${newPatientToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('7. Patient gets role-scoped dashboard without global counts or system health', async () => {
    const res = await request(app)
      .get('/api/stats/dashboard')
      .set('Authorization', `Bearer ${newPatientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('Patient');
    expect(res.body.data.counts.totalPatients).toBeUndefined();
    expect(res.body.data.counts.totalDoctors).toBeUndefined();
    expect(res.body.data.systemHealth).toBeNull();
    expect(res.body.data.counts.activePrescriptions).toBeDefined();
    expect(res.body.data.counts.authorizedDoctors).toBeDefined();
  });

  test('8. Doctor gets role-scoped dashboard without global counts or system health', async () => {
    const res = await request(app)
      .get('/api/stats/dashboard')
      .set('Authorization', `Bearer ${doctorMarcusToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('Doctor');
    expect(res.body.data.counts.totalPatients).toBeUndefined();
    expect(res.body.data.counts.totalDoctors).toBeUndefined();
    expect(res.body.data.systemHealth).toBeNull();
    expect(res.body.data.counts.myPatients).toBeDefined();
    expect(res.body.data.counts.prescriptionsWritten).toBeDefined();
  });

  test('9. Lab Tech cannot access patient directory (403) and gets no audit data', async () => {
    // Cannot access patients directory
    const patListRes = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${labToken}`);
    expect(patListRes.status).toBe(403);

    // Cannot access audit logs
    const auditRes = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${labToken}`);
    expect(auditRes.status).toBe(403);

    // Dashboard has no patient or audit data
    const dashRes = await request(app)
      .get('/api/stats/dashboard')
      .set('Authorization', `Bearer ${labToken}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.role).toBe('Lab Technician');
    expect(dashRes.body.data.counts.totalPatients).toBeUndefined();
    expect(dashRes.body.data.systemHealth).toBeNull();
    expect(dashRes.body.data.recentActivity).toEqual([]);
  });

  test('10. Only Admin can read audit logs', async () => {
    const adminAuditRes = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminAuditRes.status).toBe(200);

    const docAuditRes = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${doctorMarcusToken}`);
    expect(docAuditRes.status).toBe(403);

    const patAuditRes = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patAuditRes.status).toBe(403);
  });

  test('11. User can change their own password via /api/auth/change-password', async () => {
    const newPassword = 'NewSecretPassword@999';

    // 1. Change password with valid credentials
    const changeRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${newPatientToken}`)
      .send({
        current_password: newPatientTemporaryPassword,
        new_password: newPassword
      });

    expect(changeRes.status).toBe(200);
    expect(changeRes.body.success).toBe(true);

    // 2. Old password fails
    const oldLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: newPatientEmail, password: newPatientTemporaryPassword });
    expect(oldLoginRes.status).toBe(401);

    // 3. New password succeeds
    const newLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: newPatientEmail, password: newPassword });
    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.success).toBe(true);
  });
});

describe('12. Universal Patient Account Linking & Self-Service Activation', () => {
  let unlinkedPatientCode;
  let unlinkedPatientDob = '1990-05-15';
  let unlinkedPatientEmail = 'unlinked.patient@medivault.test';
  let unlinkedPatientId;

  beforeAll(async () => {
    // Create an unlinked patient record for testing
    const createPatRes = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        first_name: 'TestUnlinked',
        last_name: 'Patient',
        dob: unlinkedPatientDob,
        gender: 'Female',
        blood_group: 'B+',
        phone: '+1 (555) 998-1122',
        email: unlinkedPatientEmail,
        create_login: false
      });
    expect(createPatRes.status).toBe(201);
    unlinkedPatientCode = createPatRes.body.data.patient_id;
    unlinkedPatientId = createPatRes.body.data.id;
  });

  test('1. Creating Patient-role user in User Management requires an unlinked patient_id (400 if missing)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Unlinked Patient User',
        email: 'patient.nolink@medivault.test',
        password: 'Password@123',
        role: 'Patient'
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/linked to an existing patient record/i);
  });

  test('2. Creating Patient-role user with already-linked patient record fails with 409 Conflict', async () => {
    // Eleanor Vance (id 1, MV-2026-0001) is already linked
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Duplicate Link User',
        email: 'duplicate.link@medivault.test',
        password: 'Password@123',
        role: 'Patient',
        patient_id: 'MV-2026-0001'
      });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already linked/i);
  });

  test('3. Creating Patient-role user with valid unlinked patient_id succeeds and links them', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Linked Patient User',
        email: 'linked.user@medivault.test',
        password: 'Password@123',
        role: 'Patient',
        patient_id: unlinkedPatientCode
      });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('Patient');

    // Verify patient is now linked
    const patCheck = await request(app)
      .get(`/api/patients/${unlinkedPatientCode}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(patCheck.body.data.has_login).toBe(true);
    expect(patCheck.body.data.user_id).toBe(res.body.data.id);
  });

  test('4. Admin link endpoint: POST /api/users/:id/link-patient links unlinked Patient user to patient', async () => {
    // Create another unlinked patient
    const createPat = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        first_name: 'ManualLink',
        last_name: 'Patient',
        dob: '1985-08-20',
        gender: 'Male',
        blood_group: 'O+',
        phone: '+1 (555) 777-3322',
        email: 'manuallink.pat@medivault.test',
        create_login: false
      });
    const targetPatId = createPat.body.data.id;
    const targetPatCode = createPat.body.data.patient_id;

    // Manually insert an unlinked Patient user to test linking endpoint
    const [userInsert] = await query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ('Manual User', 'manual.user@medivault.test', 'hash123', 'Patient')"
    );
    const orphanUserId = userInsert.insertId;

    // Non-Admin cannot link (403)
    const forbiddenRes = await request(app)
      .post(`/api/users/${orphanUserId}/link-patient`)
      .set('Authorization', `Bearer ${doctorMarcusToken}`)
      .send({ patient_id: targetPatCode });
    expect(forbiddenRes.status).toBe(403);

    // Admin links successfully
    const linkRes = await request(app)
      .post(`/api/users/${orphanUserId}/link-patient`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ patient_id: targetPatCode });
    expect(linkRes.status).toBe(200);
    expect(linkRes.body.success).toBe(true);

    // Linking again fails with 409
    const secondLinkRes = await request(app)
      .post(`/api/users/${orphanUserId}/link-patient`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ patient_id: targetPatCode });
    expect(secondLinkRes.status).toBe(409);
  });

  test('5. Auto-link on /api/auth/me and login: exact email match links unlinked patient inside transaction', async () => {
    const autoLinkEmail = 'autolink.test@medivault.test';

    // 1. Create unlinked patient with specific email
    const createPat = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        first_name: 'AutoLinked',
        last_name: 'Candidate',
        dob: '1992-03-10',
        gender: 'Female',
        blood_group: 'A-',
        phone: '+1 (555) 443-8899',
        email: autoLinkEmail,
        create_login: false
      });
    const patCode = createPat.body.data.patient_id;

    // 2. Manually insert unlinked Patient-role user with same email (bcrypt hash of 'Password@123')
    const bcrypt = require('bcryptjs');
    const pwdHash = await bcrypt.hash('Password@123', 10);
    const [uRes] = await query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ('Auto Candidate', ?, ?, 'Patient')",
      [autoLinkEmail, pwdHash]
    );
    const orphanUserId = uRes.insertId;

    // 3. User logs in -> auto-link executes
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: autoLinkEmail, password: 'Password@123' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user.patientCode).toBe(patCode);
    const token = loginRes.body.data.token;

    // 4. /api/auth/me also returns linked patient
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.patientCode).toBe(patCode);

    // 5. Patient can open their own record
    const ownRecRes = await request(app)
      .get(`/api/patients/${patCode}`)
      .set('Authorization', `Bearer ${token}`);
    expect(ownRecRes.status).toBe(200);

    // 6. Patient CANNOT open another record (403)
    const otherRecRes = await request(app)
      .get('/api/patients/MV-2026-0001')
      .set('Authorization', `Bearer ${token}`);
    expect(otherRecRes.status).toBe(403);
  });

  test('6. Auto-link does NOT guess if multiple unlinked patients share the same email (refuses ambiguous link)', async () => {
    const sharedEmail = 'shared.family@medivault.test';

    // Insert 2 unlinked patients directly sharing the same email
    await query(`
      INSERT INTO patients (patient_id, first_name, last_name, dob, gender, blood_group, phone, email, is_deleted)
      VALUES 
        ('MV-TEST-AMB1', 'FamilyOne', 'Member', '1970-01-01', 'Male', 'O+', '+1 (555) 111-0001', ?, 0),
        ('MV-TEST-AMB2', 'FamilyTwo', 'Member', '1972-02-02', 'Female', 'O+', '+1 (555) 111-0002', ?, 0)
    `, [sharedEmail, sharedEmail]);

    // Create user with that email
    const bcrypt = require('bcryptjs');
    const pwdHash = await bcrypt.hash('Password@123', 10);
    await query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ('Family User', ?, ?, 'Patient')",
      [sharedEmail, pwdHash]
    );

    // Login does NOT guess which patient to link
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: sharedEmail, password: 'Password@123' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user.patientId).toBeNull();
    expect(loginRes.body.data.user.patientCode).toBeNull();
  });

  test('7. Self-Service Activation: validates Patient ID, DOB, and email; rejects mismatches with generic error', async () => {
    const actEmail = 'self.activate@medivault.test';
    const actDob = '1984-11-25';

    // 1. Create unlinked patient
    const createPat = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        first_name: 'Self',
        last_name: 'Activator',
        dob: actDob,
        gender: 'Male',
        blood_group: 'A+',
        phone: '+1 (555) 987-6543',
        email: actEmail,
        create_login: false
      });
    const patCode = createPat.body.data.patient_id;

    // A. Mismatch: Wrong DOB returns 400 with generic error (no enumeration)
    const wrongDobRes = await request(app)
      .post('/api/auth/activate-patient')
      .send({
        patient_id: patCode,
        dob: '1999-01-01',
        email: actEmail,
        password: 'SecurePassword@123'
      });
    expect(wrongDobRes.status).toBe(400);
    expect(wrongDobRes.body.message).toMatch(/Account activation failed/i);

    // B. Mismatch: Wrong Email returns 400 with generic error
    const wrongEmailRes = await request(app)
      .post('/api/auth/activate-patient')
      .send({
        patient_id: patCode,
        dob: actDob,
        email: 'wrong.email@medivault.test',
        password: 'SecurePassword@123'
      });
    expect(wrongEmailRes.status).toBe(400);
    expect(wrongEmailRes.body.message).toMatch(/Account activation failed/i);

    // C. Mismatch: Wrong Patient ID returns 400 with generic error
    const wrongIdRes = await request(app)
      .post('/api/auth/activate-patient')
      .send({
        patient_id: 'MV-9999-9999',
        dob: actDob,
        email: actEmail,
        password: 'SecurePassword@123'
      });
    expect(wrongIdRes.status).toBe(400);
    expect(wrongIdRes.body.message).toMatch(/Account activation failed/i);

    // D. Valid activation succeeds (201)
    const validRes = await request(app)
      .post('/api/auth/activate-patient')
      .send({
        patient_id: patCode,
        dob: actDob,
        email: actEmail,
        password: 'SecurePassword@123'
      });
    expect(validRes.status).toBe(201);
    expect(validRes.body.success).toBe(true);

    // E. Subsequent activation attempt on already-activated record fails (400)
    const repeatRes = await request(app)
      .post('/api/auth/activate-patient')
      .send({
        patient_id: patCode,
        dob: actDob,
        email: actEmail,
        password: 'SecurePassword@123'
      });
    expect(repeatRes.status).toBe(400);
    expect(repeatRes.body.message).toMatch(/Account activation failed/i);

    // F. Activated patient logs in and accesses their medical record
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: actEmail, password: 'SecurePassword@123' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user.patientCode).toBe(patCode);

    const token = loginRes.body.data.token;
    const patRecordRes = await request(app)
      .get(`/api/patients/${patCode}`)
      .set('Authorization', `Bearer ${token}`);
    expect(patRecordRes.status).toBe(200);
    expect(patRecordRes.body.data.patient_id).toBe(patCode);
  });

  test('8. Database startup migration is idempotent and runs cleanly on repeat calls', async () => {
    await expect(initDatabase('medivault_test')).resolves.not.toThrow();
  });
});



