const express = require('express');
const router = express.Router();
const patientsController = require('../controllers/patientsController');
const historyController = require('../controllers/historyController');
const prescriptionsController = require('../controllers/prescriptionsController');
const testsController = require('../controllers/testsController');
const statsController = require('../controllers/statsController');

const { authenticate } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roles');
const { checkPatientAccess } = require('../middleware/patientAccess');

router.use(authenticate);

// 1. Patient Profile Endpoints
router.get('/', patientsController.listPatients);
router.post('/', authorizeRoles('Admin', 'Doctor'), patientsController.createPatient);

router.get('/:id', checkPatientAccess(), patientsController.getPatientById);
router.put('/:id', authorizeRoles('Admin', 'Doctor'), checkPatientAccess(), patientsController.updatePatient);
router.delete('/:id', authorizeRoles('Admin'), checkPatientAccess(), patientsController.deletePatient);
router.post('/:id/restore', authorizeRoles('Admin'), patientsController.restorePatient);

// 2. Medical History Sub-routes
router.get('/:id/history', checkPatientAccess(), historyController.listMedicalHistory);
router.post('/:id/history', authorizeRoles('Admin', 'Doctor'), checkPatientAccess(), historyController.addMedicalHistory);
router.put('/:id/history/:historyId', authorizeRoles('Admin', 'Doctor'), checkPatientAccess(), historyController.updateMedicalHistory);
router.delete('/:id/history/:historyId', authorizeRoles('Admin', 'Doctor'), checkPatientAccess(), historyController.deleteMedicalHistory);

// 3. Prescriptions Sub-routes
router.get('/:id/prescriptions', checkPatientAccess(), prescriptionsController.listPrescriptions);
router.post('/:id/prescriptions', authorizeRoles('Admin', 'Doctor'), checkPatientAccess(), prescriptionsController.addPrescription);
router.get('/:id/prescriptions/:prescriptionId', checkPatientAccess(), prescriptionsController.getPrescriptionById);
router.patch('/:id/prescriptions/:prescriptionId/status', authorizeRoles('Admin', 'Doctor'), checkPatientAccess(), prescriptionsController.updatePrescriptionStatus);

// 4. Test Records Sub-routes
router.get('/:id/tests', checkPatientAccess({ allowLabTech: true }), testsController.listPatientTests);
router.post('/:id/tests', authorizeRoles('Admin', 'Doctor'), checkPatientAccess(), testsController.orderTest);
router.put('/:id/tests/:testId', authorizeRoles('Admin', 'Doctor', 'Lab Technician'), testsController.updateTestResult);

// 5. Patient Health & Lab Trends
router.get('/:id/trends', checkPatientAccess({ allowLabTech: true }), statsController.getPatientTrend);

module.exports = router;

