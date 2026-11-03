const express = require('express');
const router = express.Router();
const accessController = require('../controllers/accessController');
const { authenticate } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roles');

router.use(authenticate);

// List all grants (filtered by role) with summary statistics
router.get('/', accessController.listAllGrants);

// List available doctors to grant access
router.get('/doctors', accessController.listDoctorsForGrant);

// List active/historical grants for a patient
router.get('/patient/:patientId', accessController.listPatientGrants);

// Grant access (Patient or Admin)
router.post('/grant', authorizeRoles('Patient', 'Admin'), accessController.grantDoctorAccess);

// Revoke access (Patient or Admin)
router.post('/revoke', authorizeRoles('Patient', 'Admin'), accessController.revokeDoctorAccess);

module.exports = router;

