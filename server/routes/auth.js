const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Strict rate limiter for public patient self-service account activation (anti-enumeration & anti-brute-force)
const activationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 1000 : 10, // max 10 attempts per IP per 15 minutes (relaxed in test suite)
  message: {
    success: false,
    message: 'Too many account activation attempts. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/login', authController.login);
router.post('/activate-patient', activationLimiter, authController.activatePatientAccount);
router.get('/me', authenticate, authController.getMe);
router.post('/logout', authenticate, authController.logout);
router.post('/change-password', authenticate, authController.changePassword);

module.exports = router;

