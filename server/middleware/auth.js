const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { errorResponse } = require('../utils/response');

const JWT_SECRET = process.env.JWT_SECRET || 'medivault_super_secure_jwt_secret_key_2026_demo';

async function authenticate(req, res, next) {
  try {
    let token = null;

    // 1. Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      // 2. Check Cookie
      token = req.cookies.token;
    }

    if (!token) {
      return errorResponse(res, 'Authentication required. No token provided.', 401);
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Query active user and dynamically resolve linked patient record if role is Patient
    const [rows] = await query(`
      SELECT u.id, u.name, u.email, u.role, u.phone, u.specialization, u.license_number,
             p.id AS patient_numeric_id, p.id AS patientId, p.patient_id AS patientCode, p.patient_id AS patient_code
      FROM users u
      LEFT JOIN patients p ON p.user_id = u.id AND p.is_deleted = 0
      WHERE u.id = ?
    `, [decoded.id]);

    const user = rows[0];
    if (!user) {
      return errorResponse(res, 'Invalid token. User no longer exists.', 401);
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return errorResponse(res, 'Token expired. Please log in again.', 401);
    }
    return errorResponse(res, 'Invalid or malformed authentication token.', 401);
  }
}

module.exports = {
  authenticate,
  JWT_SECRET
};

