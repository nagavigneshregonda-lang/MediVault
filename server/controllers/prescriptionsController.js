const { query } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');
const { checkDrugAllergyConflict } = require('../utils/helpers');
const { logAudit } = require('../middleware/auditLogger');

async function listPrescriptions(req, res) {
  try {
    const patient = req.patient;
    const { status } = req.query;

    let sql = `
      SELECT 
        pr.*,
        u.name AS doctor_name,
        u.specialization AS doctor_specialization,
        u.license_number AS doctor_license
      FROM prescriptions pr
      JOIN users u ON pr.doctor_id = u.id
      WHERE pr.patient_id = ?
    `;
    const params = [patient.id];

    if (status) {
      sql += ` AND pr.status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY pr.created_at DESC`;

    const [prescriptions] = await query(sql, params);

    return successResponse(res, prescriptions, 'Prescriptions retrieved');
  } catch (err) {
    return errorResponse(res, 'Failed to fetch prescriptions.', 500);
  }
}

async function getPrescriptionById(req, res) {
  try {
    const patient = req.patient;
    const { prescriptionId } = req.params;

    const [rows] = await query(`
      SELECT 
        pr.*,
        p.patient_id, p.first_name, p.last_name, p.dob, p.gender, p.blood_group, p.allergies, p.chronic_conditions, p.phone,
        u.name AS doctor_name,
        u.email AS doctor_email,
        u.specialization AS doctor_specialization,
        u.license_number AS doctor_license,
        u.phone AS doctor_phone
      FROM prescriptions pr
      JOIN patients p ON pr.patient_id = p.id
      JOIN users u ON pr.doctor_id = u.id
      WHERE pr.id = ? AND pr.patient_id = ?
    `, [prescriptionId, patient.id]);

    const prescription = rows[0];
    if (!prescription) {
      return errorResponse(res, 'Prescription not found.', 404);
    }

    return successResponse(res, prescription, 'Prescription details retrieved');
  } catch (err) {
    return errorResponse(res, 'Failed to get prescription.', 500);
  }
}

async function addPrescription(req, res) {
  try {
    const patient = req.patient;
    const {
      medication_name,
      dosage,
      frequency,
      duration,
      start_date,
      end_date,
      instructions,
      notes,
      override_allergy_warning = false
    } = req.body;

    if (!medication_name || !dosage || !frequency || !duration || !start_date) {
      return errorResponse(res, 'Medication name, dosage, frequency, duration, and start date are required.', 400);
    }

    // Drug Allergy Cross-Reaction Check
    const allergyCheck = checkDrugAllergyConflict(patient.allergies, medication_name);
    if (allergyCheck.hasConflict && !override_allergy_warning) {
      return res.status(409).json({
        success: false,
        warningType: 'DRUG_ALLERGY_CONFLICT',
        message: allergyCheck.warning,
        allergyConflict: {
          patientAllergies: patient.allergies,
          prescribedDrug: medication_name,
          matchedAllergy: allergyCheck.matchedAllergy
        }
      });
    }

    const doctorId = req.user.role === 'Doctor' ? req.user.id : (patient.assigned_doctor_id || req.user.id);

    const [result] = await query(`
      INSERT INTO prescriptions (
        patient_id, doctor_id, medication_name, dosage, frequency, duration,
        start_date, end_date, instructions, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)
    `, [
      patient.id,
      doctorId,
      medication_name.trim(),
      dosage.trim(),
      frequency.trim(),
      duration.trim(),
      start_date,
      end_date || null,
      instructions ? instructions.trim() : null,
      notes ? notes.trim() : null
    ]);

    const [rows] = await query('SELECT * FROM prescriptions WHERE id = ?', [result.insertId]);
    const created = rows[0];

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'CREATE',
      resource: 'PRESCRIPTION',
      resourceId: created.id,
      details: `Prescribed ${medication_name} (${dosage}) for ${patient.patient_id}${allergyCheck.hasConflict ? ' [Override Confirmed]' : ''}`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, created, 'Prescription created successfully', 201);
  } catch (err) {
    console.error('addPrescription error:', err);
    return errorResponse(res, 'Failed to create prescription.', 500);
  }
}

async function updatePrescriptionStatus(req, res) {
  try {
    const patient = req.patient;
    const { prescriptionId } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['Active', 'Completed', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return errorResponse(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const [existingRows] = await query('SELECT * FROM prescriptions WHERE id = ? AND patient_id = ?', [prescriptionId, patient.id]);
    const existing = existingRows[0];
    if (!existing) {
      return errorResponse(res, 'Prescription not found.', 404);
    }

    await query(`
      UPDATE prescriptions
      SET status = ?,
          notes = COALESCE(?, notes),
          updated_at = NOW()
      WHERE id = ? AND patient_id = ?
    `, [status, notes !== undefined ? notes : null, prescriptionId, patient.id]);

    const [rows] = await query('SELECT * FROM prescriptions WHERE id = ?', [prescriptionId]);
    const updated = rows[0];

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'UPDATE',
      resource: 'PRESCRIPTION',
      resourceId: prescriptionId,
      details: `Updated prescription #${prescriptionId} status to '${status}'`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, updated, 'Prescription status updated successfully');
  } catch (err) {
    return errorResponse(res, 'Failed to update prescription status.', 500);
  }
}

module.exports = {
  listPrescriptions,
  getPrescriptionById,
  addPrescription,
  updatePrescriptionStatus
};
