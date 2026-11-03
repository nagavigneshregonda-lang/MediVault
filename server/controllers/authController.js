const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/response');
const { logAudit } = require('../middleware/auditLogger');

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return errorResponse(res, 'Email and password are required.', 400);
    }

    const [rows] = await query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER(?)',
      [email.trim()]
    );
    const user = rows[0];

    if (!user) {
      return errorResponse(res, 'Invalid email or password.', 401);
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return errorResponse(res, 'Invalid email or password.', 401);
    }

    // Find linked patient id if role is Patient
    let linkedPatient = null;
    if (user.role === 'Patient') {
      const [patientRows] = await query('SELECT id, patient_id FROM patients WHERE user_id = ?', [user.id]);
      linkedPatient = patientRows[0] || null;
    }

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'LOGIN',
      resource: 'USER',
      resourceId: user.id,
      details: `Successful login as ${user.role}`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        specialization: user.specialization,
        licenseNumber: user.license_number,
        patientId: linkedPatient ? linkedPatient.id : null,
        patientCode: linkedPatient ? linkedPatient.patient_id : null
      }
    }, 'Login successful');
  } catch (err) {
    console.error('Login error:', err);
    return errorResponse(res, 'An error occurred during authentication.', 500);
  }
}

async function getMe(req, res) {
  try {
    let linkedPatient = null;
    if (req.user.role === 'Patient') {
      const [patientRows] = await query('SELECT id, patient_id FROM patients WHERE user_id = ?', [req.user.id]);
      linkedPatient = patientRows[0] || null;
    }

    return successResponse(res, {
      ...req.user,
      patientId: linkedPatient ? linkedPatient.id : null,
      patientCode: linkedPatient ? linkedPatient.patient_id : null
    }, 'Current user fetched');
  } catch (err) {
    return errorResponse(res, 'Failed to retrieve profile.', 500);
  }
}

function logout(req, res) {
  res.clearCookie('token');
  if (req.user) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'LOGOUT',
      resource: 'USER',
      resourceId: req.user.id,
      details: 'User logged out',
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});
  }
  return successResponse(res, null, 'Logged out successfully');
}

module.exports = {
  login,
  getMe,
  logout
};
