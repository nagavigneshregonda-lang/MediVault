const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/response');
const { logAudit } = require('../middleware/auditLogger');
const { validatePassword } = require('../utils/helpers');

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

    const isSecure = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production');

    // Set HTTP-only cookie (works behind reverse proxies, SSL/HTTPS and local dev)
    res.cookie('token', token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    const ip = req.ip || (Array.isArray(req.headers['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : (req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '127.0.0.1';
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
  const isSecure = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production');
  res.clearCookie('token', {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax'
  });
  if (req.user) {
    const ip = req.ip || (Array.isArray(req.headers['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : (req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '127.0.0.1';
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

async function changePassword(req, res) {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return errorResponse(res, 'Both current password and new password are required.', 400);
    }

    const passwordValidation = validatePassword(new_password);
    if (!passwordValidation.valid) {
      return errorResponse(res, passwordValidation.message, 400);
    }

    if (current_password === new_password) {
      return errorResponse(res, 'New password must be different from current password.', 400);
    }

    const [rows] = await query('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
    const user = rows[0];

    if (!user) {
      return errorResponse(res, 'User not found.', 404);
    }

    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) {
      return errorResponse(res, 'Current password is incorrect.', 400);
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    await logAudit({
      userId: req.user.id,
      userRole: req.user.role,
      action: 'PASSWORD_CHANGE',
      resource: 'USER',
      resourceId: req.user.id,
      details: 'User updated their account password',
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, null, 'Password updated successfully.');
  } catch (err) {
    console.error('changePassword error:', err);
    return errorResponse(res, 'Failed to update password.', 500);
  }
}

module.exports = {
  login,
  getMe,
  logout,
  changePassword
};
