const express = require('express');
const router = express.Router();
const testsController = require('../controllers/testsController');
const { authenticate } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roles');

router.use(authenticate);

// List diagnostic tests across the facility (Admin, Lab Technician, Doctor)
router.get('/', authorizeRoles('Admin', 'Lab Technician', 'Doctor'), testsController.listAllTests);

// Update test result (Lab Technician, Doctor, Admin)
router.put('/:testId', authorizeRoles('Admin', 'Lab Technician', 'Doctor'), testsController.updateTestResult);

module.exports = router;

