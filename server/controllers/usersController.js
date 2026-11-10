const bcrypt = require('bcryptjs');
const { query, getConnection } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');
const { logAudit } = require('../middleware/auditLogger');

async function listUsers(req, res) {
  try {
    const { role } = req.query;

    let sql = `
      SELECT u.id, u.name, u.email, u.role, u.phone, u.specialization, u.license_number, u.created_at, u.updated_at,
             p.id AS linked_patient_id, p.patient_id AS linked_patient_code,
             CONCAT(p.first_name, ' ', p.last_name) AS linked_patient_name
      FROM users u
      LEFT JOIN patients p ON p.user_id = u.id AND p.is_deleted = 0
    `;
    const params = [];

    if (role) {
      sql += ` WHERE u.role = ?`;
      params.push(role);
    }

    sql += ` ORDER BY u.name ASC`;

    const [users] = await query(sql, params);
    return successResponse(res, users, 'Users retrieved successfully');
  } catch (err) {
    return errorResponse(res, 'Failed to fetch users.', 500);
  }
}

async function createUser(req, res) {
  let conn = null;
  try {
    const { name, email, password, role, phone, specialization, license_number, patient_id, patientId } = req.body;

    if (!name || !email || !password || !role) {
      return errorResponse(res, 'Name, email, password, and role are required.', 400);
    }

    const validRoles = ['Admin', 'Doctor', 'Patient', 'Lab Technician'];
    if (!validRoles.includes(role)) {
      return errorResponse(res, `Invalid role. Allowed roles: ${validRoles.join(', ')}`, 400);
    }

    // Patient role linking enforcement: every Patient-role user must be linked to an unlinked patient record
    let targetPatient = null;
    if (role === 'Patient') {
      const pid = patient_id || patientId;
      if (!pid) {
        return errorResponse(res, 'A Patient user account must be linked to an existing patient record. Please select a patient.', 400);
      }

      const [patRows] = await query(
        'SELECT id, patient_id, user_id FROM patients WHERE (id = ? OR patient_id = ?) AND is_deleted = 0',
        [pid, pid]
      );
      if (patRows.length === 0) {
        return errorResponse(res, 'Specified patient record not found.', 404);
      }

      targetPatient = patRows[0];
      if (targetPatient.user_id !== null && targetPatient.user_id !== undefined) {
        return errorResponse(res, 'Selected patient record is already linked to another user account.', 409);
      }
    }

    const [existing] = await query('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()]);
    if (existing.length > 0) {
      return errorResponse(res, 'A user with this email address already exists.', 409);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    if (role === 'Patient' && targetPatient) {
      conn = await getConnection();
      await conn.beginTransaction();

      const [result] = await conn.query(`
        INSERT INTO users (name, email, password_hash, role, phone, specialization, license_number)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        name.trim(),
        email.trim(),
        passwordHash,
        role,
        phone || null,
        specialization || null,
        license_number || null
      ]);

      const newUserId = result.insertId;

      await conn.query(`
        UPDATE patients 
        SET user_id = ?, updated_at = NOW() 
        WHERE id = ? AND user_id IS NULL
      `, [newUserId, targetPatient.id]);

      await conn.commit();

      const [rows] = await query(`
        SELECT u.id, u.name, u.email, u.role, u.phone, u.specialization, u.license_number, u.created_at,
               p.id AS linked_patient_id, p.patient_id AS linked_patient_code
        FROM users u
        LEFT JOIN patients p ON p.user_id = u.id
        WHERE u.id = ?
      `, [newUserId]);

      const newUser = rows[0];

      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      logAudit({
        userId: req.user.id,
        userEmail: req.user.email,
        userRole: req.user.role,
        action: 'CREATE',
        resource: 'USER',
        resourceId: newUser.id,
        details: `Created new user account: ${newUser.email} (${newUser.role}), linked to patient ${targetPatient.patient_id}`,
        ipAddress: Array.isArray(ip) ? ip[0] : ip
      }).catch(() => {});

      return successResponse(res, newUser, 'User created successfully', 201);
    }

    const [result] = await query(`
      INSERT INTO users (name, email, password_hash, role, phone, specialization, license_number)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      name.trim(),
      email.trim(),
      passwordHash,
      role,
      phone || null,
      specialization || null,
      license_number || null
    ]);

    const [rows] = await query(`
      SELECT id, name, email, role, phone, specialization, license_number, created_at
      FROM users WHERE id = ?
    `, [result.insertId]);

    const newUser = rows[0];

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'CREATE',
      resource: 'USER',
      resourceId: newUser.id,
      details: `Created new user account: ${newUser.email} (${newUser.role})`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, newUser, 'User created successfully', 201);
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
    }
    console.error('createUser error:', err);
    return errorResponse(res, 'Failed to create user.', 500);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Link an unlinked Patient user account to a patient record (Admin only)
 */
async function linkPatientToUser(req, res) {
  let conn = null;
  try {
    const { id } = req.params;
    const { patient_id } = req.body;

    if (!patient_id) {
      return errorResponse(res, 'Patient ID is required to link.', 400);
    }

    const [userRows] = await query('SELECT id, name, email, role FROM users WHERE id = ?', [id]);
    const targetUser = userRows[0];
    if (!targetUser) {
      return errorResponse(res, 'User account not found.', 404);
    }

    if (targetUser.role !== 'Patient') {
      return errorResponse(res, 'Only Patient-role accounts can be linked to patient medical records.', 400);
    }

    // Check if user is already linked
    const [existingLink] = await query('SELECT id, patient_id FROM patients WHERE user_id = ? AND is_deleted = 0', [targetUser.id]);
    if (existingLink.length > 0) {
      return errorResponse(res, `This user is already linked to patient record ${existingLink[0].patient_id}.`, 409);
    }

    // Check if patient exists and is unlinked
    const [patRows] = await query(
      'SELECT id, patient_id, user_id, first_name, last_name FROM patients WHERE (id = ? OR patient_id = ?) AND is_deleted = 0',
      [patient_id, patient_id]
    );
    const targetPatient = patRows[0];
    if (!targetPatient) {
      return errorResponse(res, 'Target patient record not found.', 404);
    }

    if (targetPatient.user_id !== null && targetPatient.user_id !== undefined) {
      return errorResponse(res, 'This patient record is already linked to another user account.', 409);
    }

    conn = await getConnection();
    await conn.beginTransaction();

    await conn.query(`
      UPDATE patients 
      SET user_id = ?, updated_at = NOW() 
      WHERE id = ? AND user_id IS NULL
    `, [targetUser.id, targetPatient.id]);

    await conn.commit();

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'LINK',
      resource: 'PATIENT',
      resourceId: targetPatient.patient_id,
      details: `Admin linked user ${targetUser.email} to patient ${targetPatient.patient_id} (${targetPatient.first_name} ${targetPatient.last_name})`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, {
      userId: targetUser.id,
      userEmail: targetUser.email,
      patientId: targetPatient.id,
      patientCode: targetPatient.patient_id
    }, `User ${targetUser.email} successfully linked to patient ${targetPatient.patient_id}`);
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
    }
    console.error('linkPatientToUser error:', err);
    return errorResponse(res, 'Failed to link user to patient record.', 500);
  } finally {
    if (conn) conn.release();
  }
}

async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { name, phone, specialization, license_number, role, password } = req.body;

    const [existingRows] = await query('SELECT * FROM users WHERE id = ?', [id]);
    const existing = existingRows[0];
    if (!existing) {
      return errorResponse(res, 'User not found.', 404);
    }

    let passwordHash = existing.password_hash;
    if (password && password.trim().length >= 6) {
      const salt = await bcrypt.genSalt(10);
      passwordHash = await bcrypt.hash(password.trim(), salt);
    }

    await query(`
      UPDATE users
      SET name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          specialization = COALESCE(?, specialization),
          license_number = COALESCE(?, license_number),
          role = COALESCE(?, role),
          password_hash = ?,
          updated_at = NOW()
      WHERE id = ?
    `, [
      name || null,
      phone !== undefined ? phone : null,
      specialization !== undefined ? specialization : null,
      license_number !== undefined ? license_number : null,
      role || null,
      passwordHash,
      id
    ]);

    const [updatedRows] = await query(`
      SELECT id, name, email, role, phone, specialization, license_number, updated_at
      FROM users WHERE id = ?
    `, [id]);

    const updated = updatedRows[0];

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'UPDATE',
      resource: 'USER',
      resourceId: id,
      details: `Updated user profile: ${updated.email}`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, updated, 'User updated successfully');
  } catch (err) {
    return errorResponse(res, 'Failed to update user.', 500);
  }
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  linkPatientToUser
};
