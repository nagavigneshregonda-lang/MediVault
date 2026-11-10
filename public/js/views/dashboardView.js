/**
 * Role-Adaptive Dashboard View with Distinct Layouts for Admin, Doctor, Lab Tech, and Patient
 */

import api from '../api.js';
import Store from '../store.js';
import { showToast } from '../components/toast.js';
import { getRoleGreeting, formatDate, formatDateTime } from '../utils.js';

let activeCharts = [];

export async function renderDashboardView() {
  const user = Store.state.user;
  const greetingText = getRoleGreeting(user);

  return `
    <div class="content-wrapper" id="dashboard-main-content">
      <!-- Greeting Header -->
      <div class="page-header">
        <div class="page-title-group">
          <h1>
            <span>${greetingText}</span>
            <span style="font-size:1.4rem;">👋</span>
          </h1>
          <div class="page-subtitle">
            ${getRoleSubtitle(user.role)} &bull; ${formatDate(new Date())}
          </div>
        </div>

        <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
          ${user.role === 'Admin' || user.role === 'Doctor' ? `
            <a href="#patients" class="btn btn-primary">
              <i class="fa-solid fa-user-plus"></i> Register Patient
            </a>
          ` : ''}
          ${user.role === 'Lab Technician' ? `
            <a href="#tests/queue" class="btn btn-primary">
              <i class="fa-solid fa-vial-circle-check"></i> Process Lab Queue
            </a>
          ` : ''}
          ${user.role === 'Patient' && user.patientCode ? `
            <a href="#patient/${user.patientCode}" class="btn btn-primary">
              <i class="fa-solid fa-file-medical"></i> View My Full Record
            </a>
          ` : ''}
        </div>
      </div>

      <!-- Stat Cards Grid -->
      <div class="stats-grid" id="dashboard-stats-container">
        <div class="glass-card stat-card"><div class="stat-info"><div class="stat-value skeleton" style="width:60px; height:32px;"></div><div class="stat-label">Loading analytics...</div></div></div>
        <div class="glass-card stat-card"><div class="stat-info"><div class="stat-value skeleton" style="width:60px; height:32px;"></div><div class="stat-label">Loading analytics...</div></div></div>
        <div class="glass-card stat-card"><div class="stat-info"><div class="stat-value skeleton" style="width:60px; height:32px;"></div><div class="stat-label">Loading analytics...</div></div></div>
        <div class="glass-card stat-card"><div class="stat-info"><div class="stat-value skeleton" style="width:60px; height:32px;"></div><div class="stat-label">Loading analytics...</div></div></div>
      </div>

      <!-- Dynamic Role-Specific Body -->
      <div id="dashboard-role-body">
        <div style="text-align:center; padding:2rem; color:var(--text-muted);">
          <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; margin-bottom:1rem;"></i>
          <div>Loading role-tailored dashboard...</div>
        </div>
      </div>
    </div>
  `;
}

export async function initDashboardListeners() {
  try {
    const statsData = await api.getDashboardStats();
    const user = Store.state.user;

    renderStatsCards(statsData, user.role);
    renderRoleSpecificBody(statsData, user.role);
    initRoleCharts(statsData, user.role);

    if (statsData.systemHealth && user.role === 'Admin') {
      renderSystemHealth(statsData.systemHealth);
    }
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
    showToast('Failed to load dashboard metrics: ' + err.message, 'error');
  }
}

function renderStatsCards(data, role) {
  const container = document.getElementById('dashboard-stats-container');
  if (!container) return;

  const counts = data.counts || {};
  let cards = [];

  if (role === 'Admin') {
    cards = [
      { label: 'Registered Patients', value: counts.totalPatients, icon: 'fa-hospital-user', color: '#0ea5a4', bg: 'rgba(14, 165, 164, 0.15)', trend: 'Live Directory', isWarning: false },
      { label: 'Active Prescriptions', value: counts.activePrescriptions, icon: 'fa-prescription-bottle-medical', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', trend: `${counts.totalPrescriptions} Total Regimens`, isWarning: false },
      { label: 'Diagnostic Orders', value: counts.totalTests, icon: 'fa-microscope', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', trend: counts.overdueTests > 0 ? `${counts.overdueTests} Overdue` : 'Specimens Active', isWarning: counts.overdueTests > 0 },
      { label: 'Security Audit Logs', value: counts.totalAudits, icon: 'fa-shield-halved', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)', trend: 'Immutable Trail', isWarning: false }
    ];
  } else if (role === 'Doctor') {
    cards = [
      { label: 'My Patients', value: counts.myPatients, icon: 'fa-hospital-user', color: '#0ea5a4', bg: 'rgba(14, 165, 164, 0.15)', trend: `${counts.grantedPatients || 0} via Active Consent`, isWarning: false },
      { label: 'Prescriptions Issued', value: counts.prescriptionsWritten, icon: 'fa-prescription-bottle-medical', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', trend: `${counts.activePrescriptions || 0} Active Course`, isWarning: false },
      { label: 'Diagnostics Ordered', value: counts.testsOrdered, icon: 'fa-microscope', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', trend: `${counts.pendingTests || 0} Pending Results`, isWarning: false },
      { label: 'Overdue Test Alerts', value: counts.overdueTests, icon: 'fa-triangle-exclamation', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', trend: counts.overdueTests > 0 ? 'Requires Follow-up' : 'All Tests On Time', isWarning: counts.overdueTests > 0 }
    ];
  } else if (role === 'Lab Technician') {
    cards = [
      { label: 'Specimen Queue', value: counts.pendingTests, icon: 'fa-flask-vial', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', trend: `${counts.orderedQueue || 0} Awaiting Processing`, isWarning: false },
      { label: 'In Progress Tests', value: counts.inProgressTests, icon: 'fa-spinner', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', trend: counts.overdueTests > 0 ? `${counts.overdueTests} Overdue` : 'Under Processing', isWarning: counts.overdueTests > 0 },
      { label: 'Completed Tests', value: counts.completedTests, icon: 'fa-vial-circle-check', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', trend: 'Verified Results', isWarning: false },
      { label: 'Critical Flag Alerts', value: counts.criticalTests, icon: 'fa-triangle-exclamation', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', trend: counts.criticalTests > 0 ? 'Immediate Alert' : 'No Critical Flags', isWarning: counts.criticalTests > 0 }
    ];
  } else if (role === 'Patient') {
    cards = [
      { label: 'Active Prescriptions', value: counts.activePrescriptions, icon: 'fa-prescription-bottle-medical', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', trend: `${counts.totalPrescriptions || 0} Total Prescribed`, isWarning: false },
      { label: 'Completed Lab Tests', value: counts.completedTests, icon: 'fa-vial-circle-check', color: '#0ea5a4', bg: 'rgba(14, 165, 164, 0.15)', trend: `${counts.pendingTests || 0} Pending in Lab`, isWarning: false },
      { label: 'Authorized Doctors', value: counts.authorizedDoctors, icon: 'fa-user-doctor', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)', trend: counts.expiringSoonConsents > 0 ? `${counts.expiringSoonConsents} Expiring Soon` : 'Active Permissions', isWarning: counts.expiringSoonConsents > 0 },
      { label: 'Critical Result Flags', value: counts.criticalFlags, icon: 'fa-triangle-exclamation', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', trend: counts.criticalFlags > 0 ? 'Review with Physician' : 'All Clear', isWarning: counts.criticalFlags > 0 }
    ];
  }

  container.innerHTML = cards.map((c, i) => `
    <div class="glass-card stat-card">
      <div class="stat-left">
        <div class="stat-icon" style="background:${c.bg}; color:${c.color};">
          <i class="fa-solid ${c.icon}"></i>
        </div>
        <div class="stat-info">
          <div class="stat-value" id="stat-val-${i}">0</div>
          <div class="stat-label">${c.label}</div>
          <div class="stat-badge-row">
            <span class="stat-trend ${c.isWarning ? 'warning' : 'positive'}">
              <i class="fa-solid ${c.isWarning ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i>
              ${c.trend}
            </span>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  cards.forEach((c, i) => {
    animateValue(`stat-val-${i}`, 0, c.value, 800);
  });
}

function renderRoleSpecificBody(data, role) {
  const body = document.getElementById('dashboard-role-body');
  if (!body) return;

  if (role === 'Admin') {
    body.innerHTML = `
      <!-- Quick Actions -->
      <div class="glass-card" style="padding:1.25rem 1.75rem; margin-bottom:2rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem;">
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <div style="width:36px; height:36px; border-radius:8px; background:var(--primary-light); color:var(--primary); display:flex; align-items:center; justify-content:center;">
            <i class="fa-solid fa-bolt"></i>
          </div>
          <div>
            <div style="font-weight:600; font-size:0.95rem;">Administrative Controls</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">Manage platform security, audit trail, and user provisioning</div>
          </div>
        </div>
        <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
          <a href="#audit" class="btn btn-secondary btn-sm"><i class="fa-solid fa-clock-rotate-left"></i> Security Audit Trail</a>
          <a href="#users" class="btn btn-secondary btn-sm"><i class="fa-solid fa-user-gear"></i> System Accounts</a>
          <a href="#patients" class="btn btn-secondary btn-sm"><i class="fa-solid fa-hospital-user"></i> Master Directory</a>
        </div>
      </div>

      <!-- Charts Section (Admin) -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:1.75rem; margin-bottom:2rem;">
        <div class="glass-card" style="padding:1.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
            <h3 style="font-size:1.1rem; display:flex; align-items:center; gap:0.5rem;">
              <i class="fa-solid fa-chart-line" style="color:var(--primary);"></i>
              <span>Patient Registrations (Past 12 Months)</span>
            </h3>
            <span class="badge badge-info">Monthly Trend</span>
          </div>
          <div style="position:relative; height:260px;">
            <canvas id="chart-registrations"></canvas>
          </div>
        </div>

        <div class="glass-card" style="padding:1.5rem; position:relative;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
            <h3 style="font-size:1.1rem; display:flex; align-items:center; gap:0.5rem;">
              <i class="fa-solid fa-chart-pie" style="color:var(--emerald);"></i>
              <span>Prescriptions Distribution</span>
            </h3>
            <span class="badge badge-normal">Regimen Status</span>
          </div>
          <div style="position:relative; height:260px;">
            <canvas id="chart-prescriptions"></canvas>
            <div id="donut-center-label" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -75%); text-align:center; pointer-events:none;">
              <div id="donut-total-count" style="font-size:1.6rem; font-weight:800; color:var(--text-main); line-height:1;">--</div>
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Total Rx</div>
            </div>
          </div>
        </div>

        <div class="glass-card" style="padding:1.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
            <h3 style="font-size:1.1rem; display:flex; align-items:center; gap:0.5rem;">
              <i class="fa-solid fa-vial" style="color:var(--amber);"></i>
              <span>Diagnostics by Category</span>
            </h3>
            <span class="badge badge-warning">Breakdown</span>
          </div>
          <div style="position:relative; height:260px;">
            <canvas id="chart-tests"></canvas>
          </div>
        </div>

        <div class="glass-card" style="padding:1.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
            <h3 style="font-size:1.1rem; display:flex; align-items:center; gap:0.5rem;">
              <i class="fa-solid fa-triangle-exclamation" style="color:var(--rose);"></i>
              <span>Completed Test Flags</span>
            </h3>
            <span class="badge badge-critical">Clinical</span>
          </div>
          <div style="position:relative; height:260px;">
            <canvas id="chart-flags"></canvas>
          </div>
        </div>
      </div>

      <!-- System Health Card for Administrator -->
      <div class="glass-card" style="padding:1.75rem; margin-bottom:2rem; border-left:4px solid var(--emerald);" id="admin-system-health-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; flex-wrap:wrap; gap:0.75rem;">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <div style="width:40px; height:40px; border-radius:10px; background:var(--emerald-light); color:var(--emerald); display:flex; align-items:center; justify-content:center; font-size:1.2rem;">
              <i class="fa-solid fa-server"></i>
            </div>
            <div>
              <h3 style="font-size:1.15rem; margin:0;">System Architecture & Platform Health</h3>
              <div style="font-size:0.8rem; color:var(--text-muted);">Real-time runtime statistics and database performance metrics</div>
            </div>
          </div>
          <span class="badge badge-normal"><i class="fa-solid fa-circle-check"></i> 100% Operational</span>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1.25rem; font-size:0.88rem;">
          <div style="background:var(--bg-primary); padding:1rem; border-radius:var(--radius-md);">
            <div style="color:var(--text-muted); font-size:0.78rem;">Database Engine</div>
            <div style="font-weight:700; color:var(--text-main); margin-top:2px;" id="health-db-engine">MySQL 8.0+ (InnoDB)</div>
          </div>
          <div style="background:var(--bg-primary); padding:1rem; border-radius:var(--radius-md);">
            <div style="color:var(--text-muted); font-size:0.78rem;">Process Memory (Heap)</div>
            <div style="font-weight:700; color:var(--text-main); margin-top:2px;" id="health-memory">-- MB</div>
          </div>
          <div style="background:var(--bg-primary); padding:1rem; border-radius:var(--radius-md);">
            <div style="color:var(--text-muted); font-size:0.78rem;">Server Uptime</div>
            <div style="font-weight:700; color:var(--text-main); margin-top:2px;" id="health-uptime">--</div>
          </div>
          <div style="background:var(--bg-primary); padding:1rem; border-radius:var(--radius-md);">
            <div style="color:var(--text-muted); font-size:0.78rem;">Node.js Runtime</div>
            <div style="font-weight:700; color:var(--text-main); margin-top:2px;" id="health-node">--</div>
          </div>
        </div>
      </div>

      <!-- Recent System Activity Feed -->
      <div class="glass-card" style="padding:1.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
          <h3 style="font-size:1.2rem; display:flex; align-items:center; gap:0.6rem;">
            <i class="fa-solid fa-clock-rotate-left" style="color:var(--primary);"></i>
            <span>Recent System Activity</span>
          </h3>
          <a href="#audit" class="btn btn-secondary btn-sm">Full Audit Trail</a>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Role</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody id="dashboard-recent-activity-body">
              ${renderActivityRows(data.recentActivity)}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (role === 'Doctor') {
    body.innerHTML = `
      <!-- Quick Actions -->
      <div class="glass-card" style="padding:1.25rem 1.75rem; margin-bottom:2rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem;">
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <div style="width:36px; height:36px; border-radius:8px; background:var(--primary-light); color:var(--primary); display:flex; align-items:center; justify-content:center;">
            <i class="fa-solid fa-stethoscope"></i>
          </div>
          <div>
            <div style="font-weight:600; font-size:0.95rem;">Clinical Workflow</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">View assigned charts, order lab tests, and manage patient care</div>
          </div>
        </div>
        <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
          <a href="#patients" class="btn btn-secondary btn-sm"><i class="fa-solid fa-hospital-user"></i> My Patients</a>
          <a href="#tests" class="btn btn-secondary btn-sm"><i class="fa-solid fa-flask"></i> Diagnostic Orders</a>
          <a href="#access" class="btn btn-secondary btn-sm"><i class="fa-solid fa-shield-halved"></i> Patient Consents</a>
        </div>
      </div>

      <!-- Accessible Patients Table -->
      <div class="glass-card" style="padding:1.75rem; margin-bottom:2rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
          <h3 style="font-size:1.15rem; display:flex; align-items:center; gap:0.6rem;">
            <i class="fa-solid fa-user-doctor" style="color:var(--primary);"></i>
            <span>My Accessible Patients</span>
          </h3>
          <a href="#patients" class="btn btn-secondary btn-sm">Full Directory</a>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Name</th>
                <th>DOB</th>
                <th>Blood Group</th>
                <th>Care Role</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${renderDoctorPatientsList(data.accessiblePatients)}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Charts Section (Doctor) -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:1.75rem; margin-bottom:2rem;">
        <div class="glass-card" style="padding:1.5rem; position:relative;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
            <h3 style="font-size:1.1rem; display:flex; align-items:center; gap:0.5rem;">
              <i class="fa-solid fa-prescription-bottle-medical" style="color:var(--emerald);"></i>
              <span>My Prescriptions Breakdown</span>
            </h3>
            <span class="badge badge-normal">Status</span>
          </div>
          <div style="position:relative; height:260px;">
            <canvas id="chart-prescriptions"></canvas>
            <div id="donut-center-label" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -75%); text-align:center; pointer-events:none;">
              <div id="donut-total-count" style="font-size:1.6rem; font-weight:800; color:var(--text-main); line-height:1;">--</div>
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Prescriptions</div>
            </div>
          </div>
        </div>

        <div class="glass-card" style="padding:1.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
            <h3 style="font-size:1.1rem; display:flex; align-items:center; gap:0.5rem;">
              <i class="fa-solid fa-vial" style="color:var(--amber);"></i>
              <span>My Diagnostic Orders</span>
            </h3>
            <span class="badge badge-warning">By Category</span>
          </div>
          <div style="position:relative; height:260px;">
            <canvas id="chart-tests"></canvas>
          </div>
        </div>
      </div>

      <!-- Doctor Activity Feed -->
      <div class="glass-card" style="padding:1.75rem;">
        <h3 style="font-size:1.15rem; display:flex; align-items:center; gap:0.6rem; margin-bottom:1.25rem;">
          <i class="fa-solid fa-clock-rotate-left" style="color:var(--primary);"></i>
          <span>My Recent Clinical Activity</span>
        </h3>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              ${renderSimpleActivityRows(data.recentActivity)}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (role === 'Lab Technician') {
    body.innerHTML = `
      <!-- Priority Lab Worklist -->
      <div class="glass-card" style="padding:1.75rem; margin-bottom:2rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
          <div>
            <h3 style="font-size:1.15rem; display:flex; align-items:center; gap:0.6rem;">
              <i class="fa-solid fa-list-check" style="color:var(--primary);"></i>
              <span>Specimen Queue Requiring Processing</span>
            </h3>
            <div style="font-size:0.8rem; color:var(--text-muted);">Ordered and in-progress laboratory specimens</div>
          </div>
          <a href="#tests" class="btn btn-secondary btn-sm"><i class="fa-solid fa-flask-vial"></i> Open Lab Manager</a>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Ordered Date</th>
                <th>Test Name</th>
                <th>Category</th>
                <th>Patient</th>
                <th>Status</th>
                <th>Flag</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${renderLabPriorityQueue(data.priorityQueue)}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Charts Section (Lab) -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:1.75rem;">
        <div class="glass-card" style="padding:1.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
            <h3 style="font-size:1.1rem; display:flex; align-items:center; gap:0.5rem;">
              <i class="fa-solid fa-vial" style="color:var(--amber);"></i>
              <span>Diagnostics by Category</span>
            </h3>
            <span class="badge badge-warning">Breakdown</span>
          </div>
          <div style="position:relative; height:260px;">
            <canvas id="chart-tests"></canvas>
          </div>
        </div>

        <div class="glass-card" style="padding:1.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
            <h3 style="font-size:1.1rem; display:flex; align-items:center; gap:0.5rem;">
              <i class="fa-solid fa-triangle-exclamation" style="color:var(--rose);"></i>
              <span>Completed Test Flags</span>
            </h3>
            <span class="badge badge-critical">Clinical</span>
          </div>
          <div style="position:relative; height:260px;">
            <canvas id="chart-flags"></canvas>
          </div>
        </div>
      </div>
    `;
  } else if (role === 'Patient') {
    const patient = data.patient;
    body.innerHTML = `
      <!-- Patient Information Banner -->
      ${patient ? `
        <div class="glass-card" style="padding:1.5rem; margin-bottom:2rem; border-left:4px solid var(--primary);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
            <div>
              <div style="font-weight:700; font-size:1.1rem; color:var(--text-main);">${patient.first_name} ${patient.last_name} &bull; ${patient.patient_id}</div>
              <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.25rem;">
                Blood Group: <strong style="color:var(--text-main);">${patient.blood_group || 'N/A'}</strong> &bull; 
                Allergies: <span class="badge badge-warning" style="font-size:0.75rem;">${patient.allergies || 'None'}</span> &bull;
                Conditions: <span style="color:var(--text-main);">${patient.chronic_conditions || 'None reported'}</span>
              </div>
            </div>
            <a href="#patient/${patient.patient_id}" class="btn btn-primary">
              <i class="fa-solid fa-file-waveform"></i> Full Medical Record
            </a>
          </div>
        </div>
      ` : ''}

      <!-- Authorized Doctors & Consent Status -->
      <div class="glass-card" style="padding:1.75rem; margin-bottom:2rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
          <div>
            <h3 style="font-size:1.15rem; display:flex; align-items:center; gap:0.6rem;">
              <i class="fa-solid fa-user-shield" style="color:var(--primary);"></i>
              <span>Authorized Care Team & Consent</span>
            </h3>
            <div style="font-size:0.8rem; color:var(--text-muted);">Physicians authorized to view and update your medical records</div>
          </div>
          <a href="#access" class="btn btn-secondary btn-sm"><i class="fa-solid fa-plus"></i> Grant Doctor Consent</a>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Doctor</th>
                <th>Email</th>
                <th>Access Level</th>
                <th>Granted Date</th>
                <th>Expires</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${renderPatientConsents(data.authorizedDoctorsList)}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Recent Test Results -->
      <div class="glass-card" style="padding:1.75rem; margin-bottom:2rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
          <h3 style="font-size:1.15rem; display:flex; align-items:center; gap:0.6rem;">
            <i class="fa-solid fa-flask" style="color:var(--primary);"></i>
            <span>Recent Diagnostic Results</span>
          </h3>
          ${patient ? `<a href="#patient/${patient.patient_id}" class="btn btn-secondary btn-sm">All Lab Records</a>` : ''}
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Test Name</th>
                <th>Category</th>
                <th>Result</th>
                <th>Reference Range</th>
                <th>Flag</th>
              </tr>
            </thead>
            <tbody>
              ${renderPatientRecentTests(data.charts?.testResults)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Attach revoke buttons in patient consent table
    body.querySelectorAll('.patient-revoke-grant-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const grantId = e.currentTarget.dataset.id;
        if (!confirm('Are you sure you want to revoke this physician\'s access to your medical record?')) return;
        try {
          await api.revokeAccess(grantId);
          showToast('Doctor access revoked successfully.', 'success');
          initDashboardListeners();
        } catch (err) {
          showToast(err.message || 'Failed to revoke access.', 'error');
        }
      });
    });
  }
}

function renderDoctorPatientsList(patients) {
  if (!patients || patients.length === 0) {
    return `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">No accessible patients currently found.</td></tr>`;
  }
  return patients.map(p => `
    <tr>
      <td><span class="badge badge-info">${p.patient_id}</span></td>
      <td style="font-weight:600; color:var(--text-main);">${p.first_name} ${p.last_name}</td>
      <td>${formatDate(p.dob)}</td>
      <td><span class="badge badge-normal">${p.blood_group || 'N/A'}</span></td>
      <td><span class="badge ${p.care_role === 'Primary' ? 'badge-primary' : 'badge-warning'}">${p.care_role}</span></td>
      <td>
        <a href="#patient/${p.patient_id}" class="btn btn-secondary btn-sm" style="padding:4px 10px; font-size:0.8rem;">
          <i class="fa-solid fa-folder-open"></i> Open Chart
        </a>
      </td>
    </tr>
  `).join('');
}

function renderLabPriorityQueue(queue) {
  if (!queue || queue.length === 0) {
    return `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:2rem;">Lab queue is currently clear!</td></tr>`;
  }
  return queue.map(t => `
    <tr>
      <td style="font-size:0.85rem; color:var(--text-muted);">${formatDate(t.ordered_date)}</td>
      <td style="font-weight:600; color:var(--text-main);">${t.test_name}</td>
      <td><span class="badge badge-info">${t.category}</span></td>
      <td>${t.first_name} ${t.last_name} (${t.patient_id})</td>
      <td><span class="badge ${t.status === 'In Progress' ? 'badge-high' : 'badge-warning'}">${t.status}</span></td>
      <td><span class="badge ${t.flag === 'Critical' ? 'badge-critical' : 'badge-normal'}">${t.flag || 'Normal'}</span></td>
      <td>
        <a href="#tests/queue" class="btn btn-secondary btn-sm" style="padding:4px 10px; font-size:0.8rem;">
          <i class="fa-solid fa-pen-to-square"></i> Process
        </a>
      </td>
    </tr>
  `).join('');
}

function renderPatientConsents(grants) {
  if (!grants || grants.length === 0) {
    return `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">No active physician consents granted.</td></tr>`;
  }
  return grants.map(g => `
    <tr>
      <td style="font-weight:600; color:var(--text-main);">${g.doctor_name}</td>
      <td style="color:var(--text-muted);">${g.doctor_email}</td>
      <td><span class="badge badge-info">${g.notes || 'Full Access'}</span></td>
      <td>${formatDate(g.granted_at)}</td>
      <td>${g.expires_at ? formatDate(g.expires_at) : '<span class="badge badge-normal">Indefinite</span>'}</td>
      <td>
        <button class="btn btn-danger btn-sm patient-revoke-grant-btn" data-id="${g.id}" style="padding:4px 10px; font-size:0.8rem;">
          <i class="fa-solid fa-ban"></i> Revoke
        </button>
      </td>
    </tr>
  `).join('');
}

function renderPatientRecentTests(tests) {
  if (!tests || tests.length === 0) {
    return `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">No completed laboratory results yet.</td></tr>`;
  }
  return tests.map(t => `
    <tr>
      <td style="font-size:0.85rem; color:var(--text-muted);">${formatDate(t.completed_date)}</td>
      <td style="font-weight:600; color:var(--text-main);">${t.test_name}</td>
      <td><span class="badge badge-info">${t.category}</span></td>
      <td style="font-weight:700; color:var(--text-main);">${t.result_value} ${t.unit || ''}</td>
      <td style="color:var(--text-muted);">${t.reference_range || 'N/A'}</td>
      <td><span class="badge ${t.flag === 'Critical' ? 'badge-critical' : (t.flag === 'Abnormal' ? 'badge-warning' : 'badge-normal')}">${t.flag || 'Normal'}</span></td>
    </tr>
  `).join('');
}

function renderActivityRows(activities) {
  if (!activities || activities.length === 0) {
    return `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;">No recent activities recorded.</td></tr>`;
  }
  return activities.map(act => `
    <tr>
      <td style="font-size:0.85rem; color:var(--text-muted); white-space:nowrap;">${formatDateTime(act.created_at)}</td>
      <td style="font-weight:600; color:var(--text-main);">${act.user_email || 'System'}</td>
      <td><span class="badge badge-info" style="font-size:0.72rem;">${act.user_role || 'System'}</span></td>
      <td><span class="badge ${getActionBadgeClass(act.action)}">${act.action}</span></td>
      <td style="max-width:320px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${act.details}">${act.details}</td>
    </tr>
  `).join('');
}

function renderSimpleActivityRows(activities) {
  if (!activities || activities.length === 0) {
    return `<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:2rem;">No recent clinical activities.</td></tr>`;
  }
  return activities.map(act => `
    <tr>
      <td style="font-size:0.85rem; color:var(--text-muted); white-space:nowrap;">${formatDateTime(act.created_at)}</td>
      <td><span class="badge ${getActionBadgeClass(act.action)}">${act.action}</span></td>
      <td style="color:var(--text-main);">${act.details}</td>
    </tr>
  `).join('');
}

function getActionBadgeClass(action) {
  switch (action) {
    case 'CREATE': return 'badge-normal';
    case 'UPDATE': return 'badge-high';
    case 'DELETE': return 'badge-critical';
    case 'ACCESS_GRANT': return 'badge-normal';
    case 'ACCESS_REVOKE': return 'badge-critical';
    case 'LOGIN': return 'badge-info';
    case 'PASSWORD_CHANGE': return 'badge-high';
    default: return 'badge-info';
  }
}

function renderSystemHealth(h) {
  const dbEngine = document.getElementById('health-db-engine');
  const memory = document.getElementById('health-memory');
  const uptime = document.getElementById('health-uptime');
  const node = document.getElementById('health-node');

  if (dbEngine) dbEngine.textContent = h.databaseEngine;
  if (memory) memory.textContent = `${h.memoryUsedMB} MB / ${h.totalAllocatedMB} MB`;
  if (uptime) uptime.textContent = h.uptime;
  if (node) node.textContent = h.nodeVersion;
}

function animateValue(id, start, end, duration) {
  const el = document.getElementById(id);
  if (!el) return;
  if (end === 0) { el.textContent = '0'; return; }

  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    el.textContent = Math.floor(progress * (end - start) + start);
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      el.textContent = end;
    }
  };
  window.requestAnimationFrame(step);
}

function initRoleCharts(statsData, role) {
  activeCharts.forEach(c => c.destroy());
  activeCharts = [];

  if (typeof Chart === 'undefined') return;

  const isDark = Store.state.theme === 'dark';
  const textColor = isDark ? '#cbd5e1' : '#64748b';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
  const chartData = statsData.charts || {};

  // Admin Registrations Line Chart
  const ctx1 = document.getElementById('chart-registrations');
  if (ctx1 && chartData.registrationsByMonth) {
    const labels = chartData.registrationsByMonth.map(m => m.month);
    const dataVals = chartData.registrationsByMonth.map(m => m.count);

    const c1 = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Registered Patients',
          data: dataVals,
          borderColor: '#0ea5a4',
          backgroundColor: 'rgba(14, 165, 164, 0.15)',
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointBackgroundColor: '#0ea5a4',
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (item) => ` ${item.parsed.y} patients registered`
            }
          }
        },
        scales: {
          x: { ticks: { color: textColor }, grid: { display: false } },
          y: { ticks: { color: textColor, precision: 0 }, grid: { color: gridColor }, beginAtZero: true }
        }
      }
    });
    activeCharts.push(c1);
  }

  // Prescriptions Donut Chart (Admin & Doctor)
  const ctx2 = document.getElementById('chart-prescriptions');
  if (ctx2 && chartData.prescriptionsByStatus) {
    const labels = chartData.prescriptionsByStatus.map(p => p.status);
    const dataVals = chartData.prescriptionsByStatus.map(p => p.count);
    const totalRx = dataVals.reduce((a, b) => a + b, 0);

    const centerCountEl = document.getElementById('donut-total-count');
    if (centerCountEl) centerCountEl.textContent = totalRx;

    const c2 = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: dataVals,
          backgroundColor: ['#10b981', '#3b82f6', '#ef4444'],
          borderWidth: 0,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor, padding: 15 } },
          tooltip: {
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (item) => {
                const pct = Math.round((item.parsed / (totalRx || 1)) * 100);
                return ` ${item.label}: ${item.parsed} (${pct}%)`;
              }
            }
          }
        },
        cutout: '72%'
      }
    });
    activeCharts.push(c2);
  }

  // Diagnostics by Category Bar Chart (Admin, Doctor, Lab)
  const ctx3 = document.getElementById('chart-tests');
  if (ctx3 && chartData.testsByCategory) {
    const labels = chartData.testsByCategory.map(t => t.category);
    const dataVals = chartData.testsByCategory.map(t => t.count);

    const c3 = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Test Volume',
          data: dataVals,
          backgroundColor: '#f59e0b',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (item) => ` ${item.parsed.y} diagnostic orders`
            }
          }
        },
        scales: {
          x: { ticks: { color: textColor }, grid: { display: false } },
          y: { ticks: { color: textColor, precision: 0 }, grid: { color: gridColor }, beginAtZero: true }
        }
      }
    });
    activeCharts.push(c3);
  }

  // Test Flags Pie Chart (Admin & Lab)
  const ctx4 = document.getElementById('chart-flags');
  if (ctx4 && chartData.testFlags) {
    const labels = chartData.testFlags.map(f => f.flag);
    const dataVals = chartData.testFlags.map(f => f.count);

    const c4 = new Chart(ctx4, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: dataVals,
          backgroundColor: ['#10b981', '#f59e0b', '#6366f1', '#ef4444', '#94a3b8'],
          borderWidth: 0,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor, padding: 12 } },
          tooltip: {
            padding: 10,
            cornerRadius: 8
          }
        }
      }
    });
    activeCharts.push(c4);
  }
}

function getRoleSubtitle(role) {
  switch (role) {
    case 'Admin': return 'Facility Administrative Control & System Compliance';
    case 'Doctor': return 'Attending Clinical Practice & Patient Charting';
    case 'Patient': return 'Personal Medical Record & Provider Access Portal';
    case 'Lab Technician': return 'Diagnostic Laboratory & Specimen Operations';
    default: return 'Clinical Practice Management';
  }
}
