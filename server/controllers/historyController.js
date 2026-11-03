const { query } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');
const { logAudit } = require('../middleware/auditLogger');

async function listMedicalHistory(req, res) {
  try {
    const patient = req.patient;

    const [history] = await query(`
      SELECT mh.*, u.name as doctor_account_name, u.specialization as doctor_specialization
      FROM medical_history mh
      LEFT JOIN users u ON mh.doctor_id = u.id
      WHERE mh.patient_id = ?
      ORDER BY mh.record_date DESC, mh.id DESC
    `, [patient.id]);

    return successResponse(res, history, 'Medical history retrieved');
  } catch (err) {
    return errorResponse(res, 'Failed to retrieve medical history.', 500);
  }
}

async function addMedicalHistory(req, res) {
  try {
    const patient = req.patient;
    const {
      record_date,
      record_type,
      title,
      doctor_name,
      facility,
      severity = 'Routine',
      notes
    } = req.body;

    if (!record_date || !record_type || !title) {
      return errorResponse(res, 'Record date, record type, and title/diagnosis are required.', 400);
    }

    const validTypes = ['Diagnosis', 'Surgery', 'Visit', 'Vaccination', 'Hospitalization'];
    if (!validTypes.includes(record_type)) {
      return errorResponse(res, `Invalid record type. Must be one of: ${validTypes.join(', ')}`, 400);
    }

    const validSeverities = ['Routine', 'Mild', 'Moderate', 'Severe', 'Critical'];
    if (!validSeverities.includes(severity)) {
      return errorResponse(res, `Invalid severity. Must be one of: ${validSeverities.join(', ')}`, 400);
    }

    const attendingDoctorName = doctor_name || (req.user.role === 'Doctor' ? req.user.name : null);

    const [result] = await query(`
      INSERT INTO medical_history (
        patient_id, record_date, record_type, title, doctor_id, doctor_name, facility, severity, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      patient.id,
      record_date,
      record_type,
      title.trim(),
      req.user.role === 'Doctor' ? req.user.id : null,
      attendingDoctorName,
      facility ? facility.trim() : null,
      severity,
      notes ? notes.trim() : null
    ]);

    const [rows] = await query('SELECT * FROM medical_history WHERE id = ?', [result.insertId]);
    const created = rows[0];

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'CREATE',
      resource: 'HISTORY',
      resourceId: created.id,
      details: `Added ${record_type} entry for ${patient.patient_id}: "${title}"`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, created, 'Medical history record added successfully', 201);
  } catch (err) {
    console.error('addMedicalHistory error:', err);
    return errorResponse(res, 'Failed to add medical history entry.', 500);
  }
}

async function updateMedicalHistory(req, res) {
  try {
    const patient = req.patient;
    const { historyId } = req.params;
    const { record_date, record_type, title, doctor_name, facility, severity, notes } = req.body;

    const [existingRows] = await query('SELECT * FROM medical_history WHERE id = ? AND patient_id = ?', [historyId, patient.id]);
    const existing = existingRows[0];
    if (!existing) {
      return errorResponse(res, 'Medical history entry not found.', 404);
    }

    await query(`
      UPDATE medical_history
      SET record_date = COALESCE(?, record_date),
          record_type = COALESCE(?, record_type),
          title = COALESCE(?, title),
          doctor_name = COALESCE(?, doctor_name),
          facility = COALESCE(?, facility),
          severity = COALESCE(?, severity),
          notes = COALESCE(?, notes)
      WHERE id = ? AND patient_id = ?
    `, [
      record_date || null,
      record_type || null,
      title ? title.trim() : null,
      doctor_name !== undefined ? doctor_name : null,
      facility !== undefined ? facility : null,
      severity || null,
      notes !== undefined ? notes : null,
      historyId,
      patient.id
    ]);

    const [updatedRows] = await query('SELECT * FROM medical_history WHERE id = ?', [historyId]);
    const updated = updatedRows[0];

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'UPDATE',
      resource: 'HISTORY',
      resourceId: historyId,
      details: `Updated medical history #${historyId} for ${patient.patient_id}`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, updated, 'Medical history record updated');
  } catch (err) {
    return errorResponse(res, 'Failed to update medical history entry.', 500);
  }
}

async function deleteMedicalHistory(req, res) {
  try {
    const patient = req.patient;
    const { historyId } = req.params;

    const [existingRows] = await query('SELECT * FROM medical_history WHERE id = ? AND patient_id = ?', [historyId, patient.id]);
    const existing = existingRows[0];
    if (!existing) {
      return errorResponse(res, 'Medical history entry not found.', 404);
    }

    await query('DELETE FROM medical_history WHERE id = ? AND patient_id = ?', [historyId, patient.id]);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'DELETE',
      resource: 'HISTORY',
      resourceId: historyId,
      details: `Deleted medical history entry #${historyId} from ${patient.patient_id}`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, null, 'Medical history entry deleted');
  } catch (err) {
    return errorResponse(res, 'Failed to delete medical history entry.', 500);
  }
}

module.exports = {
  listMedicalHistory,
  addMedicalHistory,
  updateMedicalHistory,
  deleteMedicalHistory
};
