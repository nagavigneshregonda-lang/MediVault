const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');
const { logAudit } = require('../middleware/auditLogger');

async function listUsers(req, res) {
  try {
    const { role } = req.query;

    let sql = `
      SELECT id, name, email, role, phone, specialization, license_number, created_at, updated_at
      FROM users
    `;
    const params = [];

    if (role) {
      sql += ` WHERE role = ?`;
      params.push(role);
    }

    sql += ` ORDER BY name ASC`;

    const [users] = await query(sql, params);
    return successResponse(res, users, 'Users retrieved successfully');
  } catch (err) {
    return errorResponse(res, 'Failed to fetch users.', 500);
  }
}

async function createUser(req, res) {
  try {
    const { name, email, password, role, phone, specialization, license_number } = req.body;

    if (!name || !email || !password || !role) {
      return errorResponse(res, 'Name, email, password, and role are required.', 400);
    }

    const validRoles = ['Admin', 'Doctor', 'Patient', 'Lab Technician'];
    if (!validRoles.includes(role)) {
      return errorResponse(res, `Invalid role. Allowed roles: ${validRoles.join(', ')}`, 400);
    }

    const [existing] = await query('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()]);
    if (existing.length > 0) {
      return errorResponse(res, 'A user with this email address already exists.', 409);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const [result] = await query(`
      INSERT INTO users (name, email, password_hash, role, phone, specialization, license_number)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      name.trim(),
      email.trim(),
      passwordHash,
      role,
      phone || null,
      specialization || null,
      license_number || null
    ]);

    const [rows] = await query(`
      SELECT id, name, email, role, phone, specialization, license_number, created_at
      FROM users WHERE id = ?
    `, [result.insertId]);

    const newUser = rows[0];

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'CREATE',
      resource: 'USER',
      resourceId: newUser.id,
      details: `Created new user account: ${newUser.email} (${newUser.role})`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, newUser, 'User created successfully', 201);
  } catch (err) {
    console.error('createUser error:', err);
    return errorResponse(res, 'Failed to create user.', 500);
  }
}

async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { name, phone, specialization, license_number, role, password } = req.body;

    const [existingRows] = await query('SELECT * FROM users WHERE id = ?', [id]);
    const existing = existingRows[0];
    if (!existing) {
      return errorResponse(res, 'User not found.', 404);
    }

    let passwordHash = existing.password_hash;
    if (password && password.trim().length >= 6) {
      const salt = await bcrypt.genSalt(10);
      passwordHash = await bcrypt.hash(password.trim(), salt);
    }

    await query(`
      UPDATE users
      SET name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          specialization = COALESCE(?, specialization),
          license_number = COALESCE(?, license_number),
          role = COALESCE(?, role),
          password_hash = ?,
          updated_at = NOW()
      WHERE id = ?
    `, [
      name || null,
      phone !== undefined ? phone : null,
      specialization !== undefined ? specialization : null,
      license_number !== undefined ? license_number : null,
      role || null,
      passwordHash,
      id
    ]);

    const [updatedRows] = await query(`
      SELECT id, name, email, role, phone, specialization, license_number, updated_at
      FROM users WHERE id = ?
    `, [id]);

    const updated = updatedRows[0];

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'UPDATE',
      resource: 'USER',
      resourceId: id,
      details: `Updated user profile: ${updated.email}`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, updated, 'User updated successfully');
  } catch (err) {
    return errorResponse(res, 'Failed to update user.', 500);
  }
}

module.exports = {
  listUsers,
  createUser,
  updateUser
};
