const { query, getPoolStats } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');

async function getDashboardStats(req, res) {
  try {
    const user = req.user;

    // 1. ADMIN DASHBOARD
    if (user.role === 'Admin') {
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

      const [odRows] = await query(`
        SELECT COUNT(*) AS c FROM test_records 
        WHERE status IN ('Ordered', 'In Progress') 
          AND DATEDIFF(NOW(), ordered_date) > 7
      `);
      const overdueTests = Number(odRows[0]?.c || 0);

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

      const [prescriptionsByStatus] = await query(`
        SELECT status, COUNT(*) AS count
        FROM prescriptions
        GROUP BY status
      `);

      const [testsByCategory] = await query(`
        SELECT category, COUNT(*) AS count
        FROM test_records
        GROUP BY category
        ORDER BY count DESC
      `);

      const [testFlags] = await query(`
        SELECT flag, COUNT(*) AS count
        FROM test_records
        WHERE status = 'Completed'
        GROUP BY flag
      `);

      const [recentActivity] = await query(`
        SELECT * FROM audit_logs
        ORDER BY created_at DESC LIMIT 8
      `);

      const memoryUsage = process.memoryUsage();
      const uptimeSec = Math.floor(process.uptime());
      const hours = Math.floor(uptimeSec / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);
      const poolStats = await getPoolStats();

      const systemHealth = {
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

      return successResponse(res, {
        role: 'Admin',
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
        charts: {
          registrationsByMonth,
          prescriptionsByStatus,
          testsByCategory,
          testFlags
        },
        recentActivity,
        systemHealth
      }, 'Admin dashboard statistics loaded');
    }

    // 2. DOCTOR DASHBOARD
    if (user.role === 'Doctor') {
      const [assignedRows] = await query('SELECT COUNT(*) AS c FROM patients WHERE assigned_doctor_id = ? AND is_deleted = 0', [user.id]);
      const assignedPatients = Number(assignedRows[0]?.c || 0);

      const [grantRows] = await query(`
        SELECT COUNT(DISTINCT patient_id) AS c FROM patient_access_grants 
        WHERE doctor_id = ? AND status = 'Granted' 
          AND (expires_at IS NULL OR expires_at > NOW())
      `, [user.id]);
      const grantedPatients = Number(grantRows[0]?.c || 0);

      const [accessibleRows] = await query(`
        SELECT COUNT(DISTINCT id) AS c FROM patients 
        WHERE is_deleted = 0 AND (
          assigned_doctor_id = ? OR 
          id IN (
            SELECT patient_id FROM patient_access_grants 
            WHERE doctor_id = ? AND status = 'Granted' 
              AND (expires_at IS NULL OR expires_at > NOW())
          )
        )
      `, [user.id, user.id]);
      const myPatients = Number(accessibleRows[0]?.c || 0);

      const [prWrittenRows] = await query('SELECT COUNT(*) AS c FROM prescriptions WHERE doctor_id = ?', [user.id]);
      const prescriptionsWritten = Number(prWrittenRows[0]?.c || 0);

      const [activePrRows] = await query("SELECT COUNT(*) AS c FROM prescriptions WHERE doctor_id = ? AND status = 'Active'", [user.id]);
      const activePrescriptions = Number(activePrRows[0]?.c || 0);

      const [trOrderedRows] = await query('SELECT COUNT(*) AS c FROM test_records WHERE ordered_by_doctor_id = ?', [user.id]);
      const testsOrdered = Number(trOrderedRows[0]?.c || 0);

      const [pendingTrRows] = await query("SELECT COUNT(*) AS c FROM test_records WHERE ordered_by_doctor_id = ? AND status IN ('Ordered', 'In Progress')", [user.id]);
      const pendingTests = Number(pendingTrRows[0]?.c || 0);

      const [overdueRows] = await query(`
        SELECT COUNT(*) AS c FROM test_records tr
        JOIN patients p ON tr.patient_id = p.id
        WHERE tr.status IN ('Ordered', 'In Progress')
          AND DATEDIFF(NOW(), tr.ordered_date) > 7
          AND (
            tr.ordered_by_doctor_id = ? OR 
            p.assigned_doctor_id = ? OR 
            p.id IN (
              SELECT patient_id FROM patient_access_grants 
              WHERE doctor_id = ? AND status = 'Granted' 
                AND (expires_at IS NULL OR expires_at > NOW())
            )
          )
      `, [user.id, user.id, user.id]);
      const overdueTests = Number(overdueRows[0]?.c || 0);

      const [docPrescriptionsByStatus] = await query(`
        SELECT status, COUNT(*) AS count
        FROM prescriptions
        WHERE doctor_id = ?
        GROUP BY status
      `, [user.id]);

      const [docTestsByCategory] = await query(`
        SELECT category, COUNT(*) AS count
        FROM test_records
        WHERE ordered_by_doctor_id = ?
        GROUP BY category
        ORDER BY count DESC
      `, [user.id]);

      const [doctorActivity] = await query(`
        SELECT * FROM audit_logs
        WHERE user_id = ?
        ORDER BY created_at DESC LIMIT 8
      `, [user.id]);

      const [accessiblePatientsList] = await query(`
        SELECT p.id, p.patient_id, p.first_name, p.last_name, p.dob, p.gender, p.blood_group,
               CASE WHEN p.assigned_doctor_id = ? THEN 'Primary' ELSE 'Consulting' END AS care_role
        FROM patients p
        WHERE p.is_deleted = 0 AND (
          p.assigned_doctor_id = ? OR 
          p.id IN (
            SELECT patient_id FROM patient_access_grants 
            WHERE doctor_id = ? AND status = 'Granted' 
              AND (expires_at IS NULL OR expires_at > NOW())
          )
        )
        ORDER BY p.updated_at DESC LIMIT 6
      `, [user.id, user.id, user.id]);

      return successResponse(res, {
        role: 'Doctor',
        counts: {
          myPatients,
          assignedPatients,
          grantedPatients,
          prescriptionsWritten,
          activePrescriptions,
          testsOrdered,
          pendingTests,
          overdueTests
        },
        charts: {
          prescriptionsByStatus: docPrescriptionsByStatus,
          testsByCategory: docTestsByCategory
        },
        recentActivity: doctorActivity,
        accessiblePatients: accessiblePatientsList,
        systemHealth: null
      }, 'Doctor dashboard statistics loaded');
    }

    // 3. LAB TECHNICIAN DASHBOARD
    if (user.role === 'Lab Technician') {
      const [trRows] = await query('SELECT COUNT(*) AS c FROM test_records');
      const totalTests = Number(trRows[0]?.c || 0);

      const [orderedRows] = await query("SELECT COUNT(*) AS c FROM test_records WHERE status = 'Ordered'");
      const orderedQueue = Number(orderedRows[0]?.c || 0);

      const [inProgRows] = await query("SELECT COUNT(*) AS c FROM test_records WHERE status = 'In Progress'");
      const inProgressTests = Number(inProgRows[0]?.c || 0);

      const [completedRows] = await query("SELECT COUNT(*) AS c FROM test_records WHERE status = 'Completed'");
      const completedTests = Number(completedRows[0]?.c || 0);

      const [critRows] = await query("SELECT COUNT(*) AS c FROM test_records WHERE flag = 'Critical'");
      const criticalTests = Number(critRows[0]?.c || 0);

      const [odRows] = await query(`
        SELECT COUNT(*) AS c FROM test_records 
        WHERE status IN ('Ordered', 'In Progress') 
          AND DATEDIFF(NOW(), ordered_date) > 7
      `);
      const overdueTests = Number(odRows[0]?.c || 0);

      const [testsByCategory] = await query(`
        SELECT category, COUNT(*) AS count
        FROM test_records
        GROUP BY category
        ORDER BY count DESC
      `);

      const [testFlags] = await query(`
        SELECT flag, COUNT(*) AS count
        FROM test_records
        WHERE status = 'Completed'
        GROUP BY flag
      `);

      const [priorityQueue] = await query(`
        SELECT tr.id, tr.test_name, tr.category, tr.status, tr.flag, tr.ordered_date,
               p.patient_id, p.first_name, p.last_name
        FROM test_records tr
        JOIN patients p ON tr.patient_id = p.id
        WHERE tr.status IN ('Ordered', 'In Progress')
        ORDER BY 
          CASE WHEN tr.flag = 'Critical' THEN 1 ELSE 2 END,
          tr.ordered_date ASC
        LIMIT 6
      `);

      return successResponse(res, {
        role: 'Lab Technician',
        counts: {
          totalTests,
          pendingTests: orderedQueue + inProgressTests,
          orderedQueue,
          inProgressTests,
          completedTests,
          criticalTests,
          overdueTests
        },
        charts: {
          testsByCategory,
          testFlags
        },
        priorityQueue,
        recentActivity: [],
        systemHealth: null
      }, 'Lab Technician dashboard statistics loaded');
    }

    // 4. PATIENT DASHBOARD
    if (user.role === 'Patient') {
      const [patientRows] = await query('SELECT * FROM patients WHERE user_id = ? AND is_deleted = 0', [user.id]);
      const patient = patientRows[0];

      if (!patient) {
        return successResponse(res, {
          role: 'Patient',
          counts: {
            activePrescriptions: 0,
            totalPrescriptions: 0,
            completedTests: 0,
            pendingTests: 0,
            criticalFlags: 0,
            authorizedDoctors: 0,
            expiringSoonConsents: 0
          },
          charts: {
            testResults: [],
            prescriptionsByStatus: []
          },
          authorizedDoctorsList: [],
          recentActivity: [],
          systemHealth: null
        }, 'Patient dashboard loaded');
      }

      const [activePrRows] = await query("SELECT COUNT(*) AS c FROM prescriptions WHERE patient_id = ? AND status = 'Active'", [patient.id]);
      const activePrescriptions = Number(activePrRows[0]?.c || 0);

      const [totalPrRows] = await query("SELECT COUNT(*) AS c FROM prescriptions WHERE patient_id = ?", [patient.id]);
      const totalPrescriptions = Number(totalPrRows[0]?.c || 0);

      const [compTrRows] = await query("SELECT COUNT(*) AS c FROM test_records WHERE patient_id = ? AND status = 'Completed'", [patient.id]);
      const completedTests = Number(compTrRows[0]?.c || 0);

      const [pendTrRows] = await query("SELECT COUNT(*) AS c FROM test_records WHERE patient_id = ? AND status IN ('Ordered', 'In Progress')", [patient.id]);
      const pendingTests = Number(pendTrRows[0]?.c || 0);

      const [critTrRows] = await query("SELECT COUNT(*) AS c FROM test_records WHERE patient_id = ? AND flag = 'Critical'", [patient.id]);
      const criticalFlags = Number(critTrRows[0]?.c || 0);

      const [authDocRows] = await query(`
        SELECT COUNT(*) AS c FROM patient_access_grants 
        WHERE patient_id = ? AND status = 'Granted' 
          AND (expires_at IS NULL OR expires_at > NOW())
      `, [patient.id]);
      const authorizedDoctors = Number(authDocRows[0]?.c || 0);

      const [expSoonRows] = await query(`
        SELECT COUNT(*) AS c FROM patient_access_grants 
        WHERE patient_id = ? AND status = 'Granted' 
          AND expires_at IS NOT NULL AND expires_at > NOW() 
          AND DATEDIFF(expires_at, NOW()) <= 7
      `, [patient.id]);
      const expiringSoonConsents = Number(expSoonRows[0]?.c || 0);

      const [grantsList] = await query(`
        SELECT pag.id, pag.status, pag.created_at AS granted_at, pag.expires_at, pag.notes,
               u.name AS doctor_name, u.email AS doctor_email
        FROM patient_access_grants pag
        JOIN users u ON pag.doctor_id = u.id
        WHERE pag.patient_id = ? AND pag.status = 'Granted' 
          AND (pag.expires_at IS NULL OR pag.expires_at > NOW())
        ORDER BY pag.created_at DESC
      `, [patient.id]);

      const [testResults] = await query(`
        SELECT id, test_name, category, result_value, unit, reference_range, flag, completed_date
        FROM test_records
        WHERE patient_id = ? AND status = 'Completed'
        ORDER BY completed_date DESC LIMIT 5
      `, [patient.id]);

      const [prescriptionsByStatus] = await query(`
        SELECT status, COUNT(*) AS count
        FROM prescriptions
        WHERE patient_id = ?
        GROUP BY status
      `, [patient.id]);

      const [patientActivity] = await query(`
        SELECT * FROM audit_logs
        WHERE user_id = ? OR resource_id = ?
        ORDER BY created_at DESC LIMIT 6
      `, [user.id, patient.patient_id]);

      return successResponse(res, {
        role: 'Patient',
        patient: {
          id: patient.id,
          patient_id: patient.patient_id,
          first_name: patient.first_name,
          last_name: patient.last_name,
          blood_group: patient.blood_group,
          allergies: patient.allergies,
          chronic_conditions: patient.chronic_conditions
        },
        counts: {
          activePrescriptions,
          totalPrescriptions,
          completedTests,
          pendingTests,
          criticalFlags,
          authorizedDoctors,
          expiringSoonConsents
        },
        charts: {
          testResults,
          prescriptionsByStatus
        },
        authorizedDoctorsList: grantsList,
        recentActivity: patientActivity,
        systemHealth: null
      }, 'Patient dashboard statistics loaded');
    }

    return errorResponse(res, 'Invalid user role', 400);
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
