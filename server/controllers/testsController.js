const { query } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');
const { autoFlagTestResult } = require('../utils/helpers');
const { logAudit } = require('../middleware/auditLogger');

function isTestOverdue(orderedDate, status) {
  if (status !== 'Ordered' && status !== 'In Progress') return false;
  if (!orderedDate) return false;
  const oDate = new Date(orderedDate);
  const now = new Date();
  const diffDays = (now - oDate) / (1000 * 60 * 60 * 24);
  return diffDays > 7;
}

async function listPatientTests(req, res) {
  try {
    const patient = req.patient;
    const { category, status } = req.query;

    let sql = `
      SELECT 
        tr.*,
        u_doc.name AS ordered_by_doctor_name,
        u_tech.name AS technician_name
      FROM test_records tr
      LEFT JOIN users u_doc ON tr.ordered_by_doctor_id = u_doc.id
      LEFT JOIN users u_tech ON tr.technician_id = u_tech.id
      WHERE tr.patient_id = ?
    `;
    const params = [patient.id];

    if (category) {
      sql += ` AND tr.category = ?`;
      params.push(category);
    }

    if (status) {
      sql += ` AND tr.status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY tr.ordered_date DESC, tr.id DESC`;

    const [tests] = await query(sql, params);

    const enriched = tests.map(t => ({
      ...t,
      is_overdue: isTestOverdue(t.ordered_date, t.status)
    }));

    return successResponse(res, enriched, 'Test records retrieved');
  } catch (err) {
    return errorResponse(res, 'Failed to fetch test records.', 500);
  }
}

async function listAllTests(req, res) {
  try {
    const { status, category, search, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['p.is_deleted = 0'];
    const params = [];

    if (status) {
      conditions.push('tr.status = ?');
      params.push(status);
    }

    if (category) {
      conditions.push('tr.category = ?');
      params.push(category);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(`(
        tr.test_name LIKE ? OR 
        p.patient_id LIKE ? OR 
        p.first_name LIKE ? OR 
        p.last_name LIKE ?
      )`);
      params.push(term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*) AS total
      FROM test_records tr
      JOIN patients p ON tr.patient_id = p.id
      ${whereClause}
    `;
    const [countRows] = await query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    // Summary counts over the full filtered dataset
    const summarySql = `
      SELECT 
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN tr.status = 'Ordered' THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN tr.status = 'In Progress' THEN 1 ELSE 0 END), 0) AS inProgress,
        COALESCE(SUM(CASE WHEN tr.status = 'Completed' THEN 1 ELSE 0 END), 0) AS completed,
        COALESCE(SUM(CASE WHEN tr.flag = 'Critical' THEN 1 ELSE 0 END), 0) AS critical,
        COALESCE(SUM(CASE WHEN tr.status IN ('Ordered', 'In Progress') AND DATEDIFF(NOW(), tr.ordered_date) > 7 THEN 1 ELSE 0 END), 0) AS overdue
      FROM test_records tr
      JOIN patients p ON tr.patient_id = p.id
      ${whereClause}
    `;
    const [summaryRows] = await query(summarySql, params);
    const summaryCounts = summaryRows[0] || {};

    const sql = `
      SELECT 
        tr.*,
        p.patient_id, p.first_name, p.last_name, p.dob, p.gender,
        u_doc.name AS ordered_by_doctor_name,
        u_tech.name AS technician_name
      FROM test_records tr
      JOIN patients p ON tr.patient_id = p.id
      LEFT JOIN users u_doc ON tr.ordered_by_doctor_id = u_doc.id
      LEFT JOIN users u_tech ON tr.technician_id = u_tech.id
      ${whereClause}
      ORDER BY tr.ordered_date DESC, tr.id DESC
      LIMIT ? OFFSET ?
    `;

    const [tests] = await query(sql, [...params, limitNum, offset]);

    const enriched = tests.map(t => ({
      ...t,
      is_overdue: isTestOverdue(t.ordered_date, t.status)
    }));

    return successResponse(res, {
      tests: enriched,
      summary: summaryCounts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    }, 'Diagnostic tests retrieved');
  } catch (err) {
    console.error('listAllTests error:', err);
    return errorResponse(res, 'Failed to fetch diagnostic tests.', 500);
  }
}

async function orderTest(req, res) {
  try {
    const patient = req.patient;
    const {
      test_name,
      category,
      ordered_date = new Date().toISOString().split('T')[0],
      reference_range,
      unit,
      notes
    } = req.body;

    if (!test_name || !category) {
      return errorResponse(res, 'Test name and category are required.', 400);
    }

    const validCategories = ['Blood', 'Imaging', 'Urine', 'Stool', 'Cardiology', 'Pathology', 'Microbiology', 'Genetic', 'Other'];
    if (!validCategories.includes(category)) {
      return errorResponse(res, `Invalid category. Must be one of: ${validCategories.join(', ')}`, 400);
    }

    const doctorId = req.user.role === 'Doctor' ? req.user.id : (patient.assigned_doctor_id || null);

    const [result] = await query(`
      INSERT INTO test_records (
        patient_id, ordered_by_doctor_id, test_name, category, ordered_date,
        reference_range, unit, flag, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', 'Ordered', ?)
    `, [
      patient.id,
      doctorId,
      test_name.trim(),
      category,
      ordered_date,
      reference_range ? reference_range.trim() : null,
      unit ? unit.trim() : null,
      notes ? notes.trim() : null
    ]);

    const [rows] = await query('SELECT * FROM test_records WHERE id = ?', [result.insertId]);
    const created = rows[0];

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'CREATE',
      resource: 'TEST',
      resourceId: created.id,
      details: `Ordered diagnostic test "${test_name}" (${category}) for patient ${patient.patient_id}`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, created, 'Test order placed successfully', 201);
  } catch (err) {
    console.error('orderTest error:', err);
    return errorResponse(res, 'Failed to order test.', 500);
  }
}

async function updateTestResult(req, res) {
  try {
    const { testId } = req.params;
    const {
      result_value,
      unit,
      reference_range,
      flag,
      status,
      completed_date,
      notes
    } = req.body;

    const [existingRows] = await query(`
      SELECT tr.*, p.patient_id 
      FROM test_records tr
      JOIN patients p ON tr.patient_id = p.id
      WHERE tr.id = ?
    `, [testId]);
    const existing = existingRows[0];

    if (!existing) {
      return errorResponse(res, 'Test record not found.', 404);
    }

    let calculatedFlag = flag || existing.flag;
    const effRange = reference_range !== undefined ? reference_range : existing.reference_range;
    const effVal = result_value !== undefined ? result_value : existing.result_value;

    if (!flag && effVal && effRange) {
      calculatedFlag = autoFlagTestResult(effVal, effRange);
    }

    const effStatus = status || (result_value ? 'Completed' : existing.status);
    const effCompletedDate = completed_date || (effStatus === 'Completed' ? new Date().toISOString().split('T')[0] : existing.completed_date);
    const technicianId = req.user.role === 'Lab Technician' ? req.user.id : existing.technician_id;

    await query(`
      UPDATE test_records
      SET result_value = COALESCE(?, result_value),
          unit = COALESCE(?, unit),
          reference_range = COALESCE(?, reference_range),
          flag = ?,
          status = ?,
          completed_date = ?,
          technician_id = COALESCE(?, technician_id),
          notes = COALESCE(?, notes),
          updated_at = NOW()
      WHERE id = ?
    `, [
      result_value !== undefined ? String(result_value).trim() : null,
      unit !== undefined ? unit.trim() : null,
      reference_range !== undefined ? reference_range.trim() : null,
      calculatedFlag,
      effStatus,
      effCompletedDate,
      technicianId,
      notes !== undefined ? notes.trim() : null,
      testId
    ]);

    const [updatedRows] = await query('SELECT * FROM test_records WHERE id = ?', [testId]);
    const updated = updatedRows[0];

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    logAudit({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'UPDATE',
      resource: 'TEST',
      resourceId: testId,
      details: `Updated test result #${testId} (${updated.test_name}) -> Value: ${updated.result_value} ${updated.unit || ''}, Flag: ${updated.flag}, Status: ${updated.status}`,
      ipAddress: Array.isArray(ip) ? ip[0] : ip
    }).catch(() => {});

    return successResponse(res, updated, 'Test result updated successfully');
  } catch (err) {
    console.error('updateTestResult error:', err);
    return errorResponse(res, 'Failed to update test result.', 500);
  }
}

module.exports = {
  listPatientTests,
  listAllTests,
  orderTest,
  updateTestResult
};
