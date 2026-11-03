const { query } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');
const { logAudit } = require('../middleware/auditLogger');

async function listAllGrants(req, res) {
  try {
    let whereClause = '';
    let params = [];

    if (req.user.role === 'Patient') {
      const [patientRows] = await query('SELECT id FROM patients WHERE user_id = ?', [req.user.id]);
      const patient = patientRows[0];
      if (!patient) {
        return successResponse(res, { grants: [], summary: { activeGrants: 0, expiringSoon: 0, revokedGrants: 0, authorizedDoctors: 0 } });
      }
      whereClause = 'WHERE pag.patient_id = ?';
      params.push(patient.id);
    } else if (req.user.role === 'Doctor') {
      whereClause = 'WHERE pag.doctor_id = ?';
      params.push(req.user.id);
    }

    const [grants] = await query(`
      SELECT 
        pag.*,
        p.patient_id AS patient_code,
        p.first_name AS patient_first_name,
        p.last_name AS patient_last_name,
        u.name AS doctor_name,
        u.email AS doctor_email,
        u.specialization AS doctor_specialization,
        grantor.name AS granted_by_name
      FROM patient_access_grants pag
      JOIN patients p ON pag.patient_id = p.id
      JOIN users u ON pag.doctor_id = u.id
      JOIN users grantor ON pag.granted_by = grantor.id
      ${whereClause}
      ORDER BY pag.created_at DESC
    `, params);

    const now = Date.now();
    const threeDaysMs = 3 * 86400000;

    let activeGrants = 0;
    let expiringSoon = 0;
    let revokedGrants = 0;
    const docSet = new Set();

    grants.forEach(g => {
      const exp = g.expires_at ? new Date(g.expires_at).getTime() : null;
      const isExpired = exp && exp < now;

      if (g.status === 'Revoked') {
        revokedGrants++;
      } else if (isExpired) {
        // Expired
      } else {
        activeGrants++;
        docSet.add(g.doctor_id);
        if (exp && (exp - now) < threeDaysMs) {
          expiringSoon++;
        }
      }
    });

    return successResponse(res, {
      grants,
      summary: {
        activeGrants,
        expiringSoon,
        revokedGrants,
        authorizedDoctors: docSet.size
      }
    }, 'Access grants retrieved');
  } catch (err) {
    console.error('listAllGrants error:', err);
    return errorResponse(res, 'Failed to fetch access grants.', 500);
  }
}

async function listPatientGrants(req, res) {
  try {
    const { patientId } = req.params;

    // Verify patient access
    const [patientRows] = await query('SELECT id, patient_id, user_id FROM patients WHERE id = ? OR patient_id = ?', [patientId, patientId]);
    const patient = patientRows[0];
    if (!patient) {
      return errorResponse(res, 'Patient not found.', 404);
    }

    if (req.user.role === 'Patient' && patient.user_id !== req.user.id) {
      return errorResponse(res, 'You may only view access permissions for your own profile.', 403);
    }

    const [grants] = await query(`
      SELECT 
        pag.*,
        u.name AS doctor_name,
        u.email AS doctor_email,
        u.specialization AS doctor_specialization,
        u.phone AS doctor_phone,
        grantor.name AS granted_by_name
      FROM patient_access_grants pag
      JOIN users u ON pag.doctor_id = u.id
      JOIN users grantor ON pag.granted_by = grantor.id
      WHERE pag.patient_id = ?
      ORDER BY pag.created_at DESC
    `, [patient.id]);

    return successResponse(res, grants, 'Patient access grants retrieved');
  } catch (err) {
    return errorResponse(res, 'Failed to fetch access grants.', 500);
  }
}

async function grantDoctorAccess(req, res) {
  try {
    const { patient_id, doctor_id, expires_at, notes } = req.body;

    if (!patient_id || !doctor_id) {
      return errorResponse(res, 'Patient ID and Doctor ID are required.', 400);
    }

    const [patientRows] = await query('SELECT * FROM patients WHERE id = ? OR patient_id = ?', [patient_id, patient_id]);
    const patient = patientRows[0];
    if (!patient) {
      return errorResponse(res, 'Patient not found.', 404);
    }

    // Role check: only the patient themselves or an Admin can grant access
    if (req.user.role === 'Patient' && patient.user_id !== req.user.id) {
      return errorResponse(res, 'Unauthorized to grant access on behalf of another patient.', 403);
    }

    const [doctorRows] = await query("SELECT * FROM users WHERE id = ? AND role = 'Doctor'", [doctor_id]);
    const doctor = doctorRows[0];
    if (!doctor) {
      return errorResponse(res, 'Invalid Doctor ID. User is not registered as a doctor.', 404);
    }

    if (expires_at) {
      const expDate = new Date(expires_at);
      if (expDate <= new Date()) {
        return errorResponse(res, 'Access expiry date must be in the future.', 400);
      }
    }

    const [existingRows] = await query(`
      SELECT id, status FROM patient_access_grants 
      WHERE patient_id = ? AND doctor_id = ?
    `, [patient.id, doctor.id]);
    const existing = existingRows[0];

    if (existing) {
      // Re-activate or update existing grant
      await query(`
        UPDATE patient_access_grants
        SET status = 'Granted',
            expires_at = ?,
            notes = COALESCE(?, notes),
            granted_by = ?,
            updated_at = NOW()
        WHERE id = ?
      `, [expires_at || null, notes || null, req.user.id, existing.id]);
    } else {
      await query(`
        INSERT INTO patient_access_grants (patient_id, doctor_id, granted_by, status, expires_at, notes)
        VALUES (?, ?, ?, 'Granted', ?, ?)
      `, [patient.id, doctor.id, req.user.id, expires_at || null, notes || null]);
    }

    const [updatedRows] = await query(`
      SELECT pag.*, u.name as doctor_name 
      FROM patient_access_grants pag
      JOIN users u ON pag.doctor_id = u.id
      WHERE pag.patient_id = ? AND pag.doctor_id = ?
    `, [patient.id, doctor.id]);
    const updatedGrant = updatedRows[0];

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'ACCESS_GRANT',
      resource: 'ACCESS',
      resourceId: updatedGrant.id,
      details: `Granted record access to Dr. ${doctor.name} for patient ${patient.patient_id}${expires_at ? ' (Expires: ' + expires_at + ')' : ' (Indefinite)'}`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, updatedGrant, `Medical record access successfully granted to Dr. ${doctor.name}`, 201);
  } catch (err) {
    console.error('grantDoctorAccess error:', err);
    return errorResponse(res, 'Failed to grant access.', 500);
  }
}

async function revokeDoctorAccess(req, res) {
  try {
    const { grant_id, patient_id, doctor_id } = req.body;

    let grant = null;
    if (grant_id) {
      const [rows] = await query('SELECT * FROM patient_access_grants WHERE id = ?', [grant_id]);
      grant = rows[0] || null;
    } else if (patient_id && doctor_id) {
      const [patientRows] = await query('SELECT id, user_id FROM patients WHERE id = ? OR patient_id = ?', [patient_id, patient_id]);
      const patient = patientRows[0];
      if (patient) {
        const [rows] = await query('SELECT * FROM patient_access_grants WHERE patient_id = ? AND doctor_id = ?', [patient.id, doctor_id]);
        grant = rows[0] || null;
      }
    }

    if (!grant) {
      return errorResponse(res, 'Access grant record not found.', 404);
    }

    // Role check: patient themselves or Admin
    const [patientRows] = await query('SELECT * FROM patients WHERE id = ?', [grant.patient_id]);
    const patient = patientRows[0];
    if (req.user.role === 'Patient' && patient.user_id !== req.user.id) {
      return errorResponse(res, 'Unauthorized to revoke access for another patient.', 403);
    }

    await query(`
      UPDATE patient_access_grants
      SET status = 'Revoked',
          updated_at = NOW()
      WHERE id = ?
    `, [grant.id]);

    const [doctorRows] = await query('SELECT name FROM users WHERE id = ?', [grant.doctor_id]);
    const doctor = doctorRows[0];

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'ACCESS_REVOKE',
      resource: 'ACCESS',
      resourceId: grant.id,
      details: `Revoked Dr. ${doctor ? doctor.name : grant.doctor_id}'s access to patient ${patient.patient_id}`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, null, `Access revoked from Dr. ${doctor ? doctor.name : ''}`);
  } catch (err) {
    return errorResponse(res, 'Failed to revoke access.', 500);
  }
}

async function listDoctorsForGrant(req, res) {
  try {
    const [doctors] = await query(`
      SELECT id, name, email, specialization, phone, license_number
      FROM users
      WHERE role = 'Doctor'
      ORDER BY name ASC
    `);

    return successResponse(res, doctors, 'Doctors retrieved');
  } catch (err) {
    return errorResponse(res, 'Failed to list doctors.', 500);
  }
}

module.exports = {
  listAllGrants,
  listPatientGrants,
  grantDoctorAccess,
  revokeDoctorAccess,
  listDoctorsForGrant
};
