const { query } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');
const { generatePatientId, calculateAge, calculateBmi } = require('../utils/helpers');
const { logAudit } = require('../middleware/auditLogger');

async function listPatients(req, res) {
  try {
    const user = req.user;
    const {
      search = '',
      blood_group = '',
      gender = '',
      status = 'active', // active, archived, all
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

    // Query patients with doctor names
    const querySql = `
      SELECT 
        p.*,
        u.name AS assigned_doctor_name,
        u.specialization AS doctor_specialization
      FROM patients p
      LEFT JOIN users u ON p.assigned_doctor_id = u.id
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
        bmiCategory: bmi ? bmi.category : null
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
      user_id
    } = req.body;

    if (!first_name || !last_name || !dob || !gender || !blood_group || !phone) {
      return errorResponse(res, 'First name, last name, date of birth, gender, blood group, and phone are required.', 400);
    }

    const dobDate = new Date(dob);
    if (isNaN(dobDate.getTime()) || dobDate > new Date()) {
      return errorResponse(res, 'Date of birth cannot be in the future.', 400);
    }

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
      user_id || null,
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

    return successResponse(res, created, 'Patient created successfully', 201);
  } catch (err) {
    console.error('createPatient error:', err);
    return errorResponse(res, 'Failed to create patient: ' + err.message, 500);
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
  updatePatient,
  deletePatient,
  restorePatient
};
