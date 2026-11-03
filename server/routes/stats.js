const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/dashboard', statsController.getDashboardStats);

module.exports = router;

