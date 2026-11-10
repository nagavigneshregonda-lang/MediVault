const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const { authenticate } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roles');

router.use(authenticate);

// List users (Doctors, Lab techs, etc.) - allowed for Admin, Doctor, Lab Technician, Patient (e.g. for doctor selection)
router.get('/', usersController.listUsers);

// Admin-only management
router.post('/', authorizeRoles('Admin'), usersController.createUser);
router.post('/:id/link-patient', authorizeRoles('Admin'), usersController.linkPatientToUser);
router.put('/:id', authorizeRoles('Admin'), usersController.updateUser);

module.exports = router;

