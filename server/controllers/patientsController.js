const bcrypt = require('bcryptjs');
const { query, getConnection } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');
const { 
  generatePatientId, 
  calculateAge, 
  calculateBmi, 
  isValidEmail, 
  validatePassword, 
  generateSecurePassword 
} = require('../utils/helpers');
const { logAudit } = require('../middleware/auditLogger');

async function listPatients(req, res) {
  try {
    const user = req.user;
    const {
      search = '',
      blood_group = '',
      gender = '',
      status = 'active', // active, archived, all
      unlinked = '',
      page = 1,
      limit = 10,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    const whereConditions = [];
    const params = [];

    // Filter unlinked patients only (for account linking workflows)
    if (unlinked === 'true' || unlinked === true || unlinked === '1') {
      whereConditions.push('p.user_id IS NULL');
    }

    // Role-based visibility
    if (user.role === 'Patient') {
      whereConditions.push('p.user_id = ?');
      params.push(user.id);
    } else if (user.role === 'Doctor') {
      whereConditions.push(`(
        p.assigned_doctor_id = ? OR 
        p.id IN (
          SELECT patient_id FROM patient_access_grants 
          WHERE doctor_id = ? AND status = 'Granted' 
            AND (expires_at IS NULL OR expires_at > NOW())
        )
      )`);
      params.push(user.id, user.id);
    }

    // Soft delete status filter
    if (status === 'archived') {
      whereConditions.push('p.is_deleted = 1');
    } else if (status === 'all' && user.role === 'Admin') {
      // allow both
    } else {
      whereConditions.push('p.is_deleted = 0');
    }

    // Search query filter
    if (search.trim()) {
      const term = `%${search.trim()}%`;
      whereConditions.push(`(
        p.patient_id LIKE ? OR
        p.first_name LIKE ? OR
        p.last_name LIKE ? OR
        CONCAT(p.first_name, ' ', p.last_name) LIKE ? OR
        p.phone LIKE ? OR
        p.email LIKE ?
      )`);
      params.push(term, term, term, term, term, term);
    }

    // Blood group filter
    if (blood_group) {
      whereConditions.push('p.blood_group = ?');
      params.push(blood_group);
    }

    // Gender filter
    if (gender) {
      whereConditions.push('p.gender = ?');
      params.push(gender);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Count total matching
    const countSql = `SELECT COUNT(*) AS total FROM patients p ${whereClause}`;
    const [countRows] = await query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    // Summary counts over the full filtered dataset
    const summarySql = `
      SELECT 
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN p.gender = 'Male' THEN 1 ELSE 0 END), 0) AS maleCount,
        COALESCE(SUM(CASE WHEN p.gender = 'Female' THEN 1 ELSE 0 END), 0) AS femaleCount,
        COALESCE(SUM(CASE WHEN p.allergies IS NOT NULL AND TRIM(p.allergies) != '' AND LOWER(TRIM(p.allergies)) != 'none' AND LOWER(TRIM(p.allergies)) != 'none recorded' THEN 1 ELSE 0 END), 0) AS allergyWatchlist,
        COALESCE(SUM(CASE WHEN p.chronic_conditions IS NOT NULL AND TRIM(p.chronic_conditions) != '' AND LOWER(TRIM(p.chronic_conditions)) != 'none' AND LOWER(TRIM(p.chronic_conditions)) != 'none recorded' THEN 1 ELSE 0 END), 0) AS chronicCount
      FROM patients p
      ${whereClause}
    `;
    const [summaryRows] = await query(summarySql, params);
    const summary = summaryRows[0] || {};

    // Sorting safe column whitelist
    const allowedSort = ['patient_id', 'first_name', 'last_name', 'dob', 'created_at'];
    const safeSortBy = allowedSort.includes(sortBy) ? `p.${sortBy}` : 'p.created_at';
    const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Query patients with doctor names and login account status
    const querySql = `
      SELECT 
        p.*,
        u.name AS assigned_doctor_name,
        u.specialization AS doctor_specialization,
        u_login.email AS login_email,
        CASE WHEN p.user_id IS NOT NULL THEN 1 ELSE 0 END AS has_login
      FROM patients p
      LEFT JOIN users u ON p.assigned_doctor_id = u.id
      LEFT JOIN users u_login ON p.user_id = u_login.id
      ${whereClause}
      ORDER BY ${safeSortBy} ${safeSortOrder}
      LIMIT ? OFFSET ?
    `;

    const [patients] = await query(querySql, [...params, limitNum, offset]);

    // Enrich with age and BMI
    const enriched = patients.map(pat => {
      const age = calculateAge(pat.dob);
      const bmi = calculateBmi(pat.weight_kg, pat.height_cm);
      return {
        ...pat,
        age,
        bmi: bmi ? bmi.value : null,
        bmiCategory: bmi ? bmi.category : null,
        has_login: Boolean(pat.has_login)
      };
    });

    return successResponse(res, {
      patients: enriched,
      summary,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    }, 'Patients retrieved successfully');
  } catch (err) {
    console.error('listPatients error:', err);
    return errorResponse(res, 'Failed to fetch patients.', 500);
  }
}

async function getPatientById(req, res) {
  try {
    const patient = req.patient;

    let doctor = null;
    if (patient.assigned_doctor_id) {
      const [doctorRows] = await query(`
        SELECT id, name, email, specialization, phone 
        FROM users WHERE id = ?
      `, [patient.assigned_doctor_id]);
      doctor = doctorRows[0] || null;
    }

    let loginAccount = null;
    if (patient.user_id) {
      const [uRows] = await query('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [patient.user_id]);
      loginAccount = uRows[0] || null;
    }

    const [histRows] = await query('SELECT COUNT(*) AS c FROM medical_history WHERE patient_id = ?', [patient.id]);
    const historyCount = Number(histRows[0]?.c || 0);

    const [rxRows] = await query(`
      SELECT COUNT(*) AS c FROM prescriptions WHERE patient_id = ? AND status = 'Active'
    `, [patient.id]);
    const activePrescriptionsCount = Number(rxRows[0]?.c || 0);

    const [compTestRows] = await query(`
      SELECT COUNT(*) AS c FROM test_records WHERE patient_id = ? AND status = 'Completed'
    `, [patient.id]);
    const completedTestsCount = Number(compTestRows[0]?.c || 0);

    const [pendTestRows] = await query(`
      SELECT COUNT(*) AS c FROM test_records WHERE patient_id = ? AND status IN ('Ordered', 'In Progress')
    `, [patient.id]);
    const pendingTestsCount = Number(pendTestRows[0]?.c || 0);

    const age = calculateAge(patient.dob);
    const bmi = calculateBmi(patient.weight_kg, patient.height_cm);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'VIEW',
      resource: 'PATIENT',
      resourceId: patient.patient_id,
      details: `Viewed patient profile: ${patient.first_name} ${patient.last_name} (${patient.patient_id})`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, {
      ...patient,
      age,
      bmi: bmi ? bmi.value : null,
      bmiCategory: bmi ? bmi.category : null,
      has_login: Boolean(patient.user_id),
      loginAccount,
      doctor,
      stats: {
        historyCount,
        activePrescriptionsCount,
        completedTestsCount,
        pendingTestsCount
      }
    }, 'Patient details retrieved');
  } catch (err) {
    console.error('getPatientById error:', err);
    return errorResponse(res, 'Failed to get patient details.', 500);
  }
}

async function createPatient(req, res) {
  let conn = null;
  try {
    const {
      first_name,
      last_name,
      dob,
      gender,
      blood_group,
      phone,
      email,
      address,
      height_cm,
      weight_kg,
      allergies,
      chronic_conditions,
      emergency_contact_name,
      emergency_contact_phone,
      emergency_contact_relation,
      assigned_doctor_id,
      user_id,
      create_login,
      create_patient_login,
      login_email,
      login_password,
      generate_password
    } = req.body;

    if (!first_name || !last_name || !dob || !gender || !blood_group || !phone) {
      return errorResponse(res, 'First name, last name, date of birth, gender, blood group, and phone are required.', 400);
    }

    const dobDate = new Date(dob);
    if (isNaN(dobDate.getTime()) || dobDate > new Date()) {
      return errorResponse(res, 'Date of birth cannot be in the future.', 400);
    }

    // Duplicate check for existing patient
    const [dupes] = await query(`
      SELECT patient_id, first_name, last_name FROM patients 
      WHERE (phone = ? OR (email IS NOT NULL AND email != '' AND LOWER(email) = LOWER(?)))
        AND is_deleted = 0
    `, [phone.trim(), email ? email.trim() : '']);

    if (dupes.length > 0) {
      const duplicate = dupes[0];
      return errorResponse(
        res,
        `Duplicate patient detected! Patient ${duplicate.first_name} ${duplicate.last_name} (${duplicate.patient_id}) already exists with this phone or email.`,
        409
      );
    }

    const wantsLogin = (create_login === false || create_patient_login === false)
      ? false
      : Boolean(create_login || create_patient_login || (req.user && req.user.role === 'Admin' && email && email.trim()));
    let linkedUserId = user_id || null;
    let temporaryPassword = null;
    let targetLoginEmail = null;

    if (wantsLogin) {
      targetLoginEmail = (login_email || email || '').trim();
      if (!isValidEmail(targetLoginEmail)) {
        return errorResponse(res, 'A valid email address is required to create a patient login.', 400);
      }

      // Check if user with this email already exists
      const [existingUsers] = await query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER(?)',
        [targetLoginEmail]
      );
      if (existingUsers.length > 0) {
        return errorResponse(res, `A user account with email '${targetLoginEmail}' already exists.`, 409);
      }

      let rawPassword = '';
      if (generate_password || !login_password) {
        rawPassword = generateSecurePassword();
        temporaryPassword = rawPassword;
      } else {
        const pwdCheck = validatePassword(login_password);
        if (!pwdCheck.valid) {
          return errorResponse(res, pwdCheck.message, 400);
        }
        rawPassword = login_password;
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(rawPassword, salt);

      // Execute in ONE transaction
      conn = await getConnection();
      await conn.beginTransaction();

      const [userInsert] = await conn.query(`
        INSERT INTO users (name, email, password_hash, role, phone)
        VALUES (?, ?, ?, 'Patient', ?)
      `, [
        `${first_name.trim()} ${last_name.trim()}`,
        targetLoginEmail,
        passwordHash,
        phone.trim()
      ]);

      linkedUserId = userInsert.insertId;

      const patientId = await generatePatientId();

      const [patientInsert] = await conn.query(`
        INSERT INTO patients (
          patient_id, user_id, first_name, last_name, dob, gender, blood_group,
          phone, email, address, height_cm, weight_kg, allergies, chronic_conditions,
          emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
          assigned_doctor_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        patientId,
        linkedUserId,
        first_name.trim(),
        last_name.trim(),
        dob,
        gender,
        blood_group,
        phone.trim(),
        email ? email.trim() : targetLoginEmail,
        address ? address.trim() : null,
        height_cm ? parseFloat(height_cm) : null,
        weight_kg ? parseFloat(weight_kg) : null,
        allergies ? allergies.trim() : '',
        chronic_conditions ? chronic_conditions.trim() : '',
        emergency_contact_name ? emergency_contact_name.trim() : null,
        emergency_contact_phone ? emergency_contact_phone.trim() : null,
        emergency_contact_relation ? emergency_contact_relation.trim() : null,
        assigned_doctor_id || null
      ]);

      await conn.commit();

      const [createdRows] = await conn.query('SELECT * FROM patients WHERE id = ?', [patientInsert.insertId]);
      const created = createdRows[0];

      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      logAudit({
        userId: req.user.id,
        userEmail: req.user.email,
        userRole: req.user.role,
        action: 'CREATE',
        resource: 'PATIENT',
        resourceId: patientId,
        details: `Created patient record for ${first_name} ${last_name} (${patientId}) with linked login account (${targetLoginEmail})`,
        ipAddress: Array.isArray(ip) ? ip[0] : ip
      }).catch(() => {});

      return successResponse(res, {
        ...created,
        has_login: true,
        login_email: targetLoginEmail,
        temporary_password: temporaryPassword // Shown once to Admin, never logged or stored in plain text
      }, 'Patient created and login account provisioned successfully', 201);
    }

    // Standard patient creation without login account
    const patientId = await generatePatientId();

    const [result] = await query(`
      INSERT INTO patients (
        patient_id, user_id, first_name, last_name, dob, gender, blood_group,
        phone, email, address, height_cm, weight_kg, allergies, chronic_conditions,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
        assigned_doctor_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      patientId,
      linkedUserId,
      first_name.trim(),
      last_name.trim(),
      dob,
      gender,
      blood_group,
      phone.trim(),
      email ? email.trim() : null,
      address ? address.trim() : null,
      height_cm ? parseFloat(height_cm) : null,
      weight_kg ? parseFloat(weight_kg) : null,
      allergies ? allergies.trim() : '',
      chronic_conditions ? chronic_conditions.trim() : '',
      emergency_contact_name ? emergency_contact_name.trim() : null,
      emergency_contact_phone ? emergency_contact_phone.trim() : null,
      emergency_contact_relation ? emergency_contact_relation.trim() : null,
      assigned_doctor_id || null
    ]);

    const [createdRows] = await query('SELECT * FROM patients WHERE id = ?', [result.insertId]);
    const created = createdRows[0];

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'CREATE',
      resource: 'PATIENT',
      resourceId: patientId,
      details: `Created patient record for ${first_name} ${last_name} (${patientId})`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, {
      ...created,
      has_login: false
    }, 'Patient created successfully', 201);
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
    }
    console.error('createPatient error:', err);
    return errorResponse(res, 'Failed to create patient: ' + err.message, 500);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Admin creates a login account for an existing patient without a login
 */
async function createPatientLogin(req, res) {
  let conn = null;
  try {
    const { id } = req.params;
    const { email, password, generate_password } = req.body;

    const [patRows] = await query('SELECT * FROM patients WHERE id = ? OR patient_id = ?', [id, id]);
    const patient = patRows[0];
    if (!patient) {
      return errorResponse(res, 'Patient record not found.', 404);
    }

    if (patient.user_id) {
      return errorResponse(res, 'This patient already has a linked login account.', 409);
    }

    const targetEmail = (email || patient.email || '').trim();
    if (!isValidEmail(targetEmail)) {
      return errorResponse(res, 'A valid email address is required to create a patient login.', 400);
    }

    const [existingUsers] = await query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER(?)',
      [targetEmail]
    );
    if (existingUsers.length > 0) {
      return errorResponse(res, `A user account with email '${targetEmail}' already exists.`, 409);
    }

    let rawPassword = '';
    let temporaryPassword = null;
    if (generate_password || !password) {
      rawPassword = generateSecurePassword();
      temporaryPassword = rawPassword;
    } else {
      const pwdCheck = validatePassword(password);
      if (!pwdCheck.valid) {
        return errorResponse(res, pwdCheck.message, 400);
      }
      rawPassword = password;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(rawPassword, salt);

    conn = await getConnection();
    await conn.beginTransaction();

    const [userInsert] = await conn.query(`
      INSERT INTO users (name, email, password_hash, role, phone)
      VALUES (?, ?, ?, 'Patient', ?)
    `, [
      `${patient.first_name} ${patient.last_name}`,
      targetEmail,
      passwordHash,
      patient.phone
    ]);

    const newUserId = userInsert.insertId;

    await conn.query(`
      UPDATE patients 
      SET user_id = ?, email = COALESCE(NULLIF(email, ''), ?), updated_at = NOW() 
      WHERE id = ?
    `, [newUserId, targetEmail, patient.id]);

    await conn.commit();

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'CREATE',
      resource: 'USER',
      resourceId: String(newUserId),
      details: `Created portal login for patient ${patient.patient_id} (${targetEmail})`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, {
      patient_id: patient.patient_id,
      user_id: newUserId,
      email: targetEmail,
      temporary_password: temporaryPassword
    }, 'Patient login account created successfully', 201);
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
    }
    console.error('createPatientLogin error:', err);
    return errorResponse(res, 'Failed to create patient login: ' + err.message, 500);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Admin resets password for a patient with an existing login
 */
async function resetPatientPassword(req, res) {
  try {
    const { id } = req.params;
    const { new_password, generate_password } = req.body;

    const [patRows] = await query('SELECT * FROM patients WHERE id = ? OR patient_id = ?', [id, id]);
    const patient = patRows[0];
    if (!patient) {
      return errorResponse(res, 'Patient record not found.', 404);
    }

    if (!patient.user_id) {
      return errorResponse(res, 'Patient does not have a linked login account to reset.', 400);
    }

    const [userRows] = await query('SELECT id, email, name FROM users WHERE id = ?', [patient.user_id]);
    const user = userRows[0];
    if (!user) {
      return errorResponse(res, 'Linked user account was not found.', 404);
    }

    let rawPassword = '';
    let temporaryPassword = null;
    if (generate_password || !new_password) {
      rawPassword = generateSecurePassword();
      temporaryPassword = rawPassword;
    } else {
      const pwdCheck = validatePassword(new_password);
      if (!pwdCheck.valid) {
        return errorResponse(res, pwdCheck.message, 400);
      }
      rawPassword = new_password;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(rawPassword, salt);

    await query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [passwordHash, user.id]);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'UPDATE',
      resource: 'USER',
      resourceId: String(user.id),
      details: `Admin reset password for patient ${patient.patient_id} (${user.email})`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, {
      patient_id: patient.patient_id,
      email: user.email,
      temporary_password: temporaryPassword
    }, 'Password reset successfully');
  } catch (err) {
    console.error('resetPatientPassword error:', err);
    return errorResponse(res, 'Failed to reset password: ' + err.message, 500);
  }
}

async function updatePatient(req, res) {
  try {
    const patient = req.patient;
    const {
      first_name,
      last_name,
      dob,
      gender,
      blood_group,
      phone,
      email,
      address,
      height_cm,
      weight_kg,
      allergies,
      chronic_conditions,
      emergency_contact_name,
      emergency_contact_phone,
      emergency_contact_relation,
      assigned_doctor_id
    } = req.body;

    if (dob) {
      const dobDate = new Date(dob);
      if (dobDate > new Date()) {
        return errorResponse(res, 'Date of birth cannot be in the future.', 400);
      }
    }

    await query(`
      UPDATE patients
      SET first_name = COALESCE(?, first_name),
          last_name = COALESCE(?, last_name),
          dob = COALESCE(?, dob),
          gender = COALESCE(?, gender),
          blood_group = COALESCE(?, blood_group),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          address = COALESCE(?, address),
          height_cm = COALESCE(?, height_cm),
          weight_kg = COALESCE(?, weight_kg),
          allergies = COALESCE(?, allergies),
          chronic_conditions = COALESCE(?, chronic_conditions),
          emergency_contact_name = COALESCE(?, emergency_contact_name),
          emergency_contact_phone = COALESCE(?, emergency_contact_phone),
          emergency_contact_relation = COALESCE(?, emergency_contact_relation),
          assigned_doctor_id = COALESCE(?, assigned_doctor_id),
          updated_at = NOW()
      WHERE id = ?
    `, [
      first_name ? first_name.trim() : null,
      last_name ? last_name.trim() : null,
      dob || null,
      gender || null,
      blood_group || null,
      phone ? phone.trim() : null,
      email !== undefined ? (email ? email.trim() : null) : null,
      address !== undefined ? (address ? address.trim() : null) : null,
      height_cm !== undefined ? (height_cm ? parseFloat(height_cm) : null) : null,
      weight_kg !== undefined ? (weight_kg ? parseFloat(weight_kg) : null) : null,
      allergies !== undefined ? (allergies ? allergies.trim() : '') : null,
      chronic_conditions !== undefined ? (chronic_conditions ? chronic_conditions.trim() : '') : null,
      emergency_contact_name !== undefined ? (emergency_contact_name ? emergency_contact_name.trim() : null) : null,
      emergency_contact_phone !== undefined ? (emergency_contact_phone ? emergency_contact_phone.trim() : null) : null,
      emergency_contact_relation !== undefined ? (emergency_contact_relation ? emergency_contact_relation.trim() : null) : null,
      assigned_doctor_id !== undefined ? (assigned_doctor_id ? parseInt(assigned_doctor_id, 10) : null) : null,
      patient.id
    ]);

    const [updatedRows] = await query('SELECT * FROM patients WHERE id = ?', [patient.id]);
    const updated = updatedRows[0];

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'UPDATE',
      resource: 'PATIENT',
      resourceId: patient.patient_id,
      details: `Updated patient demographics & clinical details for ${updated.first_name} ${updated.last_name}`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, updated, 'Patient updated successfully');
  } catch (err) {
    console.error('updatePatient error:', err);
    return errorResponse(res, 'Failed to update patient.', 500);
  }
}

async function deletePatient(req, res) {
  try {
    const patient = req.patient;

    await query('UPDATE patients SET is_deleted = 1, updated_at = NOW() WHERE id = ?', [patient.id]);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'DELETE',
      resource: 'PATIENT',
      resourceId: patient.patient_id,
      details: `Soft-deleted patient record (${patient.patient_id})`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, null, 'Patient deleted (archived) successfully');
  } catch (err) {
    return errorResponse(res, 'Failed to delete patient.', 500);
  }
}

async function restorePatient(req, res) {
  try {
    const { id } = req.params;

    const [patientRows] = await query('SELECT * FROM patients WHERE id = ? OR patient_id = ?', [id, id]);
    const patient = patientRows[0];
    if (!patient) {
      return errorResponse(res, 'Patient not found.', 404);
    }

    await query('UPDATE patients SET is_deleted = 0, updated_at = NOW() WHERE id = ?', [patient.id]);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'UPDATE',
      resource: 'PATIENT',
      resourceId: patient.patient_id,
      details: `Restored archived patient record (${patient.patient_id})`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, null, 'Patient record restored successfully');
  } catch (err) {
    return errorResponse(res, 'Failed to restore patient.', 500);
  }
}

module.exports = {
  listPatients,
  getPatientById,
  createPatient,
  createPatientLogin,
  resetPatientPassword,
  updatePatient,
  deletePatient,
  restorePatient
};
