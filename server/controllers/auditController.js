const { query } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');

async function listAuditLogs(req, res) {
  try {
    const {
      action,
      resource,
      user_role,
      search,
      start_date,
      end_date,
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (action) {
      conditions.push('action = ?');
      params.push(action);
    }

    if (resource) {
      conditions.push('resource = ?');
      params.push(resource);
    }

    if (user_role) {
      conditions.push('user_role = ?');
      params.push(user_role);
    }

    if (start_date) {
      conditions.push('DATE(created_at) >= DATE(?)');
      params.push(start_date);
    }

    if (end_date) {
      conditions.push('DATE(created_at) <= DATE(?)');
      params.push(end_date);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(`(
        user_email LIKE ? OR 
        details LIKE ? OR 
        resource_id LIKE ? OR
        ip_address LIKE ?
      )`);
      params.push(term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`;
    const [countRows] = await query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    // Summary stats for the audit page header
    const [summaryRows] = await query(`
      SELECT 
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN action IN ('LOGIN', 'LOGOUT') THEN 1 ELSE 0 END), 0) AS authEvents,
        COALESCE(SUM(CASE WHEN action IN ('ACCESS_GRANT', 'ACCESS_REVOKE') THEN 1 ELSE 0 END), 0) AS consentEvents,
        COALESCE(SUM(CASE WHEN action IN ('CREATE', 'UPDATE', 'DELETE') THEN 1 ELSE 0 END), 0) AS clinicalModifications,
        COALESCE(SUM(CASE WHEN action = 'VIEW' THEN 1 ELSE 0 END), 0) AS chartViews
      FROM audit_logs
    `);
    const summary = summaryRows[0] || {};

    const sql = `
      SELECT * FROM audit_logs
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `;

    const [logs] = await query(sql, [...params, limitNum, offset]);

    return successResponse(res, {
      logs,
      summary,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    }, 'Audit logs retrieved');
  } catch (err) {
    console.error('listAuditLogs error:', err);
    return errorResponse(res, 'Failed to fetch audit logs.', 500);
  }
}

module.exports = {
  listAuditLogs
};
