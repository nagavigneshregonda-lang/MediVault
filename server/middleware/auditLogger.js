const { query } = require('../config/db');

/**
 * Log audit events to database
 */
async function logAudit(options) {
  try {
    const {
      userId = null,
      userEmail = 'Anonymous',
      userRole = 'System',
      action,
      resource,
      resourceId = null,
      details = '',
      ipAddress = '127.0.0.1'
    } = options;

    await query(`
      INSERT INTO audit_logs (user_id, user_email, user_role, action, resource, resource_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      userEmail,
      userRole,
      action,
      resource,
      resourceId ? String(resourceId) : null,
      typeof details === 'object' ? JSON.stringify(details) : String(details),
      ipAddress
    ]);
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

/**
 * Express middleware helper to log request action
 */
function auditMiddleware(action, resource) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode < 400) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        logAudit({
          userId: req.user ? req.user.id : null,
          userEmail: req.user ? req.user.email : 'Anonymous',
          userRole: req.user ? req.user.role : 'Guest',
          action,
          resource,
          resourceId: req.params.id || req.params.patientId || null,
          details: `${req.method} ${req.originalUrl}`,
          ipAddress: Array.isArray(ip) ? ip[0] : ip
        }).catch(() => {});
      }
    });
    next();
  };
}

module.exports = {
  logAudit,
  auditMiddleware
};
