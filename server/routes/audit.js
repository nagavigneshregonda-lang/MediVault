const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { authenticate } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roles');

router.use(authenticate);

// Admin-only Audit Trail
router.get('/', authorizeRoles('Admin'), auditController.listAuditLogs);

module.exports = router;

