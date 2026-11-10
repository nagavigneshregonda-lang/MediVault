const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, getConnection } = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/response');
const { logAudit } = require('../middleware/auditLogger');
const { validatePassword, isValidEmail, normalizeDateToYMD } = require('../utils/helpers');

/**
 * Auto-link a Patient-role user to their matching patient record if exactly one unlinked record matches by email.
 * If zero or multiple matches exist, does not guess and returns null.
 */
async function autoLinkPatientUser(userId, userEmail, clientIp = '127.0.0.1') {
  if (!userId || !userEmail) return null;

  // 1. Check if user already has a linked patient record
  const [existing] = await query(
    'SELECT id, patient_id FROM patients WHERE user_id = ? AND is_deleted = 0 LIMIT 1',
    [userId]
  );
  if (existing.length > 0) {
    return existing[0];
  }

  // 2. Query unlinked patient records with exact case-insensitive trimmed email match
  const cleanEmail = userEmail.trim().toLowerCase();
  const [matches] = await query(
    'SELECT id, patient_id, first_name, last_name FROM patients WHERE user_id IS NULL AND is_deleted = 0 AND LOWER(TRIM(email)) = ?',
    [cleanEmail]
  );

  // 3. Exactly one match -> auto-link inside a transaction with audit log
  if (matches.length === 1) {
    const targetPatient = matches[0];
    let conn = null;
    try {
      conn = await getConnection();
      await conn.beginTransaction();

      // Double-check row is still unlinked within transaction
      const [recheck] = await conn.query(
        'SELECT id, patient_id FROM patients WHERE id = ? AND user_id IS NULL AND is_deleted = 0 FOR UPDATE',
        [targetPatient.id]
      );

      if (recheck.length === 1) {
        await conn.query(
          'UPDATE patients SET user_id = ?, updated_at = NOW() WHERE id = ?',
          [userId, targetPatient.id]
        );
        await conn.commit();

        logAudit({
          userId: userId,
          userEmail: cleanEmail,
          userRole: 'Patient',
          action: 'LINK',
          resource: 'PATIENT',
          resourceId: targetPatient.patient_id,
          details: `Auto-linked patient record ${targetPatient.patient_id} to user ${cleanEmail} based on exact email match`,
          ipAddress: clientIp
        }).catch(() => {});

        return { id: targetPatient.id, patient_id: targetPatient.patient_id };
      } else {
        await conn.rollback();
      }
    } catch (err) {
      if (conn) {
        try { await conn.rollback(); } catch (_) {}
      }
      console.error('Error during autoLinkPatientUser transaction:', err);
    } finally {
      if (conn) conn.release();
    }
  }

  // If 0 or >1 matches, do not guess
  return null;
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return errorResponse(res, 'Email and password are required.', 400);
    }

    const [rows] = await query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER(?)',
      [email.trim()]
    );
    const user = rows[0];

    if (!user) {
      return errorResponse(res, 'Invalid email or password.', 401);
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return errorResponse(res, 'Invalid email or password.', 401);
    }

    const ip = req.ip || (Array.isArray(req.headers['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : (req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '127.0.0.1';

    // Find linked patient id if role is Patient (with auto-linking fallback)
    let linkedPatient = null;
    if (user.role === 'Patient') {
      const [patientRows] = await query('SELECT id, patient_id FROM patients WHERE user_id = ? AND is_deleted = 0 LIMIT 1', [user.id]);
      linkedPatient = patientRows[0] || null;

      if (!linkedPatient) {
        linkedPatient = await autoLinkPatientUser(user.id, user.email, ip);
      }
    }

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

    const isSecure = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production');

    // Set HTTP-only cookie (works behind reverse proxies, SSL/HTTPS and local dev)
    res.cookie('token', token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'LOGIN',
      resource: 'USER',
      resourceId: user.id,
      details: `Successful login as ${user.role}`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    const patientId = linkedPatient ? linkedPatient.id : null;
    const patientCode = linkedPatient ? linkedPatient.patient_id : null;

    return successResponse(res, {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        specialization: user.specialization,
        licenseNumber: user.license_number,
        patientId,
        patientCode,
        patient_id: patientId,
        patient_code: patientCode
      }
    }, 'Login successful');
  } catch (err) {
    console.error('Login error:', err);
    return errorResponse(res, 'An error occurred during authentication.', 500);
  }
}

async function getMe(req, res) {
  try {
    const ip = req.ip || (Array.isArray(req.headers['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : (req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '127.0.0.1';
    let linkedPatient = null;
    if (req.user.role === 'Patient') {
      const [patientRows] = await query('SELECT id, patient_id FROM patients WHERE user_id = ? AND is_deleted = 0 LIMIT 1', [req.user.id]);
      linkedPatient = patientRows[0] || null;

      if (!linkedPatient) {
        linkedPatient = await autoLinkPatientUser(req.user.id, req.user.email, ip);
      }
    }

    const patientId = linkedPatient ? linkedPatient.id : (req.user.patientId || null);
    const patientCode = linkedPatient ? linkedPatient.patient_id : (req.user.patientCode || null);

    return successResponse(res, {
      ...req.user,
      patientId,
      patientCode,
      patient_id: patientId,
      patient_code: patientCode
    }, 'Current user fetched');
  } catch (err) {
    return errorResponse(res, 'Failed to retrieve profile.', 500);
  }
}

/**
 * Self-service patient portal account activation
 * Validates Patient ID, Date of Birth, and registered email against the patient record.
 * Uses generic error messages to prevent account enumeration.
 */
async function activatePatientAccount(req, res) {
  let conn = null;
  try {
    const { patient_id, dob, email, password } = req.body;

    const genericError = 'Account activation failed. Please verify your Patient ID, Date of Birth, and registered email address, or contact your healthcare clinic.';

    if (!patient_id || !dob || !email || !password) {
      return errorResponse(res, 'Patient ID, Date of Birth, registered email address, and new password are required.', 400);
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPatientId = patient_id.trim().toUpperCase();

    if (!isValidEmail(cleanEmail)) {
      return errorResponse(res, 'Please provide a valid email address.', 400);
    }

    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) {
      return errorResponse(res, pwdCheck.message, 400);
    }

    // Look up patient by patient_id code or numeric id, with DATE_FORMAT directly from MySQL
    const [patientRows] = await query(
      `SELECT p.*, DATE_FORMAT(p.dob, '%Y-%m-%d') AS db_dob_str 
       FROM patients p 
       WHERE (UPPER(p.patient_id) = ? OR p.id = ?) AND p.is_deleted = 0`,
      [cleanPatientId, cleanPatientId]
    );
    const patient = patientRows[0];

    if (!patient) {
      return errorResponse(res, genericError, 400);
    }

    // Must not already have a linked user account
    if (patient.user_id !== null && patient.user_id !== undefined) {
      return errorResponse(res, genericError, 400);
    }

    // Registered email check (case-insensitive, trimmed)
    if (!patient.email || patient.email.trim().toLowerCase() !== cleanEmail) {
      return errorResponse(res, genericError, 400);
    }

    // Date of birth check (robust normalization to YYYY-MM-DD, immune to timezone shifts)
    const patDobStr = patient.db_dob_str || normalizeDateToYMD(patient.dob);
    const inputDobStr = normalizeDateToYMD(dob);

    if (!patDobStr || !inputDobStr || patDobStr !== inputDobStr) {
      return errorResponse(res, genericError, 400);
    }

    // Check if user account with this email already exists
    const [existingUsers] = await query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER(?)',
      [cleanEmail]
    );
    if (existingUsers.length > 0) {
      return errorResponse(res, genericError, 400);
    }

    // Hash password with bcrypt
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Atomically create user and link patient in one transaction
    conn = await getConnection();
    await conn.beginTransaction();

    const [userInsert] = await conn.query(`
      INSERT INTO users (name, email, password_hash, role, phone)
      VALUES (?, ?, ?, 'Patient', ?)
    `, [
      `${patient.first_name} ${patient.last_name}`.trim(),
      cleanEmail,
      passwordHash,
      patient.phone || null
    ]);

    const newUserId = userInsert.insertId;

    await conn.query(`
      UPDATE patients 
      SET user_id = ?, updated_at = NOW() 
      WHERE id = ? AND user_id IS NULL
    `, [newUserId, patient.id]);

    await conn.commit();

    const ip = req.ip || (Array.isArray(req.headers['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : (req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '127.0.0.1';

    logAudit({
      userId: newUserId,
      userEmail: cleanEmail,
      userRole: 'Patient',
      action: 'ACTIVATE',
      resource: 'PATIENT',
      resourceId: patient.patient_id,
      details: `Patient successfully activated self-service portal account for record ${patient.patient_id}`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, {
      email: cleanEmail,
      patient_id: patient.patient_id
    }, 'Account successfully activated. You can now log in with your email and password.', 201);
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
    }
    console.error('activatePatientAccount error:', err);
    return errorResponse(res, 'An error occurred during account activation. Please try again.', 500);
  } finally {
    if (conn) conn.release();
  }
}

function logout(req, res) {
  const isSecure = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production');
  res.clearCookie('token', {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax'
  });
  if (req.user) {
    const ip = req.ip || (Array.isArray(req.headers['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : (req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'LOGOUT',
      resource: 'USER',
      resourceId: req.user.id,
      details: 'User logged out',
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});
  }
  return successResponse(res, null, 'Logged out successfully');
}

async function changePassword(req, res) {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return errorResponse(res, 'Both current password and new password are required.', 400);
    }

    const passwordValidation = validatePassword(new_password);
    if (!passwordValidation.valid) {
      return errorResponse(res, passwordValidation.message, 400);
    }

    if (current_password === new_password) {
      return errorResponse(res, 'New password must be different from current password.', 400);
    }

    const [rows] = await query('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
    const user = rows[0];

    if (!user) {
      return errorResponse(res, 'User not found.', 404);
    }

    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) {
      return errorResponse(res, 'Current password is incorrect.', 400);
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    await logAudit({
      userId: req.user.id,
      userRole: req.user.role,
      action: 'PASSWORD_CHANGE',
      resource: 'USER',
      resourceId: req.user.id,
      details: 'User updated their account password',
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, null, 'Password updated successfully.');
  } catch (err) {
    console.error('changePassword error:', err);
    return errorResponse(res, 'Failed to update password.', 500);
  }
}

module.exports = {
  login,
  getMe,
  logout,
  changePassword,
  autoLinkPatientUser,
  activatePatientAccount
};
