const { query, getPoolStats } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');

async function getDashboardStats(req, res) {
  try {
    const user = req.user;

    // 1. Overall counts
    const [pRows] = await query('SELECT COUNT(*) AS c FROM patients WHERE is_deleted = 0');
    const totalPatients = Number(pRows[0]?.c || 0);

    const [dRows] = await query("SELECT COUNT(*) AS c FROM users WHERE role = 'Doctor'");
    const totalDoctors = Number(dRows[0]?.c || 0);

    const [prRows] = await query('SELECT COUNT(*) AS c FROM prescriptions');
    const totalPrescriptions = Number(prRows[0]?.c || 0);

    const [aprRows] = await query("SELECT COUNT(*) AS c FROM prescriptions WHERE status = 'Active'");
    const activePrescriptions = Number(aprRows[0]?.c || 0);

    const [trRows] = await query('SELECT COUNT(*) AS c FROM test_records');
    const totalTests = Number(trRows[0]?.c || 0);

    const [ptrRows] = await query("SELECT COUNT(*) AS c FROM test_records WHERE status IN ('Ordered', 'In Progress')");
    const pendingTests = Number(ptrRows[0]?.c || 0);

    const [ctrRows] = await query("SELECT COUNT(*) AS c FROM test_records WHERE status = 'Completed'");
    const completedTests = Number(ctrRows[0]?.c || 0);

    const [critRows] = await query("SELECT COUNT(*) AS c FROM test_records WHERE flag = 'Critical'");
    const criticalTests = Number(critRows[0]?.c || 0);

    const [audRows] = await query('SELECT COUNT(*) AS c FROM audit_logs');
    const totalAudits = Number(audRows[0]?.c || 0);

    // Count overdue tests: ordered > 7 days ago and still pending
    const [odRows] = await query(`
      SELECT COUNT(*) AS c FROM test_records 
      WHERE status IN ('Ordered', 'In Progress') 
        AND DATEDIFF(NOW(), ordered_date) > 7
    `);
    const overdueTests = Number(odRows[0]?.c || 0);

    // 2. Doctor-specific metrics if Doctor
    let doctorMetrics = null;
    if (user.role === 'Doctor') {
      const [docPatRows] = await query('SELECT COUNT(*) AS c FROM patients WHERE assigned_doctor_id = ? AND is_deleted = 0', [user.id]);
      const assignedCount = Number(docPatRows[0]?.c || 0);

      const [docGrantRows] = await query(`
        SELECT COUNT(DISTINCT patient_id) AS c FROM patient_access_grants 
        WHERE doctor_id = ? AND status = 'Granted' 
          AND (expires_at IS NULL OR expires_at > NOW())
      `, [user.id]);
      const grantedCount = Number(docGrantRows[0]?.c || 0);

      const [docPrRows] = await query('SELECT COUNT(*) AS c FROM prescriptions WHERE doctor_id = ?', [user.id]);
      const doctorPrescriptions = Number(docPrRows[0]?.c || 0);

      const [docTrRows] = await query('SELECT COUNT(*) AS c FROM test_records WHERE ordered_by_doctor_id = ?', [user.id]);
      const doctorTests = Number(docTrRows[0]?.c || 0);

      doctorMetrics = {
        accessiblePatients: assignedCount + grantedCount,
        assignedPatients: assignedCount,
        grantedPatients: grantedCount,
        prescriptionsIssued: doctorPrescriptions,
        testsOrdered: doctorTests
      };
    }

    // 3. Patient registrations over the past 12 months with clean month names (all 12 months filled)
    const [rawRegistrations] = await query(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') AS ym,
        COUNT(*) AS count
      FROM patients
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY ym
      ORDER BY ym ASC
    `);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const past12Months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      past12Months.push({
        raw: ym,
        month: monthNames[d.getMonth()]
      });
    }

    const countMap = new Map();
    rawRegistrations.forEach(r => countMap.set(r.ym, Number(r.count)));

    const registrationsByMonth = past12Months.map(m => ({
      raw: m.raw,
      month: m.month,
      count: countMap.get(m.raw) || 0
    }));

    // 4. Prescriptions by status
    const [prescriptionsByStatus] = await query(`
      SELECT status, COUNT(*) AS count
      FROM prescriptions
      GROUP BY status
    `);

    // 5. Tests by category
    const [testsByCategory] = await query(`
      SELECT category, COUNT(*) AS count
      FROM test_records
      GROUP BY category
      ORDER BY count DESC
    `);

    // 6. Test results flag distribution
    const [testFlags] = await query(`
      SELECT flag, COUNT(*) AS count
      FROM test_records
      WHERE status = 'Completed'
      GROUP BY flag
    `);

    // 7. Recent activity / audit trail
    let recentActivitySql = `
      SELECT * FROM audit_logs
    `;
    const activityParams = [];

    if (user.role === 'Patient') {
      recentActivitySql += ` WHERE user_id = ? OR resource_id IN (SELECT patient_id FROM patients WHERE user_id = ?)`;
      activityParams.push(user.id, user.id);
    } else if (user.role === 'Doctor') {
      recentActivitySql += ` WHERE user_id = ? OR action IN ('ACCESS_GRANT', 'ACCESS_REVOKE', 'CREATE')`;
      activityParams.push(user.id);
    }

    recentActivitySql += ` ORDER BY created_at DESC LIMIT 8`;
    const [recentActivity] = await query(recentActivitySql, activityParams);

    // 8. System Health Metrics for Admin Dashboard
    let systemHealth = null;
    if (user.role === 'Admin') {
      const memoryUsage = process.memoryUsage();
      const uptimeSec = Math.floor(process.uptime());
      const hours = Math.floor(uptimeSec / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);
      const poolStats = await getPoolStats();

      systemHealth = {
        status: 'Operational',
        databaseEngine: poolStats ? poolStats.engine : 'MySQL 8.0+ (InnoDB)',
        databaseStatus: poolStats ? poolStats.status : 'Healthy & Connected',
        databaseName: poolStats ? poolStats.databaseName : 'medivault',
        activeConnections: poolStats ? poolStats.activeConnections : 0,
        idleConnections: poolStats ? poolStats.idleConnections : 0,
        totalConnections: poolStats ? poolStats.totalConnections : 0,
        connectionLimit: poolStats ? poolStats.connectionLimit : 15,
        uptime: `${hours}h ${minutes}m`,
        memoryUsedMB: Math.round((memoryUsage.heapUsed / 1024 / 1024) * 10) / 10,
        totalAllocatedMB: Math.round((memoryUsage.heapTotal / 1024 / 1024) * 10) / 10,
        nodeVersion: process.version,
        activeAuditEntries: totalAudits,
        totalActivePatients: totalPatients
      };
    }

    return successResponse(res, {
      role: user.role,
      counts: {
        totalPatients,
        totalDoctors,
        totalPrescriptions,
        activePrescriptions,
        totalTests,
        pendingTests,
        completedTests,
        criticalTests,
        overdueTests,
        totalAudits
      },
      doctorMetrics,
      charts: {
        registrationsByMonth,
        prescriptionsByStatus,
        testsByCategory,
        testFlags
      },
      recentActivity,
      systemHealth
    }, 'Dashboard statistics loaded');
  } catch (err) {
    console.error('getDashboardStats error:', err);
    return errorResponse(res, 'Failed to fetch dashboard statistics.', 500);
  }
}

async function getPatientTrend(req, res) {
  try {
    const patient = req.patient;

    const [trends] = await query(`
      SELECT 
        test_name, 
        result_value, 
        unit, 
        completed_date, 
        flag 
      FROM test_records
      WHERE patient_id = ? AND status = 'Completed' AND result_value IS NOT NULL
      ORDER BY completed_date ASC
    `, [patient.id]);

    return successResponse(res, trends, 'Patient health trends retrieved');
  } catch (err) {
    return errorResponse(res, 'Failed to get patient trends.', 500);
  }
}

module.exports = {
  getDashboardStats,
  getPatientTrend
};
