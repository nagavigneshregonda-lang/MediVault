const { query } = require('../config/db');
const { errorResponse } = require('../utils/response');

/**
 * Core Access Control Middleware for Patient Data
 * Enforces strict role-based and relationship-based access authorization:
 * - Admin: Full access
 * - Patient: Can access only their own record (matched via user_id)
 * - Doctor: Must be assigned doctor OR have an active, non-expired grant from the patient
 * - Lab Technician: Can view patient data and manage laboratory tests only
 */
function checkPatientAccess(options = {}) {
  const { allowLabTech = true, allowWrite = false } = options;

  return async (req, res, next) => {
    try {
      const patientIdParam = req.params.patientId || req.params.id;
      if (!patientIdParam) {
        return errorResponse(res, 'Patient ID parameter is missing.', 400);
      }

      // Patient lookup (supports numeric ID or unique alphanumeric patient_id like MV-2026-0001)
      const [patients] = await query(`
        SELECT * FROM patients 
        WHERE (id = ? OR patient_id = ?)
      `, [patientIdParam, patientIdParam]);

      const patient = patients[0];

      if (!patient) {
        return errorResponse(res, 'Patient not found.', 404);
      }

      if (patient.is_deleted === 1 && req.user.role !== 'Admin') {
        return errorResponse(res, 'Patient record is archived or deactivated.', 404);
      }

      const user = req.user;

      // 1. Admin: unrestricted authorized access
      if (user.role === 'Admin') {
        req.patient = patient;
        return next();
      }

      // 2. Patient: restricted to self-record only
      if (user.role === 'Patient') {
        if (patient.user_id !== user.id) {
          return errorResponse(res, 'Access denied. You may only access your own personal medical records.', 403);
        }
        req.patient = patient;
        return next();
      }

      // 3. Lab Technician: access for diagnostics
      if (user.role === 'Lab Technician') {
        if (!allowLabTech) {
          return errorResponse(res, 'Access denied. Lab Technicians are restricted to laboratory test workflows.', 403);
        }
        req.patient = patient;
        return next();
      }

      // 4. Doctor: must be primary assigned physician OR have active non-expired consent grant
      if (user.role === 'Doctor') {
        // Direct assignment check
        if (patient.assigned_doctor_id === user.id) {
          req.patient = patient;
          return next();
        }

        // Active patient access grant check (MySQL: NOW())
        const [grants] = await query(`
          SELECT * FROM patient_access_grants
          WHERE patient_id = ? 
            AND doctor_id = ? 
            AND status = 'Granted'
            AND (expires_at IS NULL OR expires_at > NOW())
        `, [patient.id, user.id]);

        const activeGrant = grants[0];
        if (activeGrant) {
          req.patient = patient;
          req.accessGrant = activeGrant;
          return next();
        }

        return errorResponse(
          res,
          'Access denied. You do not have an active patient authorization or assignment for this record.',
          403
        );
      }

      return errorResponse(res, 'Access denied. Unauthorized role.', 403);
    } catch (err) {
      console.error('checkPatientAccess error:', err);
      return errorResponse(res, 'Internal server error checking patient access.', 500);
    }
  };
}

module.exports = {
  checkPatientAccess
};
