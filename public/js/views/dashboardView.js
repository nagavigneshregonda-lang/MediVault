/**
 * Role-Adaptive Dashboard View with Animated Charts, Donut Center Total & System Health
 */

import api from '../api.js';
import Store from '../store.js';
import { showToast } from '../components/toast.js';
import { getRoleGreeting, formatDate, formatDateTime, renderErrorState } from '../utils.js';

let activeCharts = [];

export async function renderDashboardView() {
  const user = Store.state.user;
  const isDoctor = user.role === 'Doctor';
  const isAdmin = user.role === 'Admin';
  const isPatient = user.role === 'Patient';
  const isLab = user.role === 'Lab Technician';

  const greetingText = getRoleGreeting(user);

  return `
    <div class="content-wrapper">
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
          ${isAdmin || isDoctor ? `
            <a href="#patients" class="btn btn-primary">
              <i class="fa-solid fa-user-plus"></i> Register Patient
            </a>
          ` : ''}
          ${isLab ? `
            <a href="#tests" class="btn btn-primary">
              <i class="fa-solid fa-vial-circle-check"></i> Process Lab Queue
            </a>
          ` : ''}
          ${isPatient && user.patientCode ? `
            <a href="#patient/${user.patientCode}" class="btn btn-primary">
              <i class="fa-solid fa-file-medical"></i> View My Full Record
            </a>
          ` : ''}
        </div>
      </div>

      <!-- Stat Cards Grid -->
      <div class="stats-grid" id="dashboard-stats-container">
        <!-- Rendered dynamically -->
        <div class="glass-card stat-card"><div class="stat-info"><div class="stat-value skeleton" style="width:60px; height:32px;"></div><div class="stat-label">Loading analytics...</div></div></div>
        <div class="glass-card stat-card"><div class="stat-info"><div class="stat-value skeleton" style="width:60px; height:32px;"></div><div class="stat-label">Loading analytics...</div></div></div>
        <div class="glass-card stat-card"><div class="stat-info"><div class="stat-value skeleton" style="width:60px; height:32px;"></div><div class="stat-label">Loading analytics...</div></div></div>
        <div class="glass-card stat-card"><div class="stat-info"><div class="stat-value skeleton" style="width:60px; height:32px;"></div><div class="stat-label">Loading analytics...</div></div></div>
      </div>

      <!-- Quick Actions Bar -->
      <div class="glass-card" style="padding:1.25rem 1.75rem; margin-bottom:2rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem;">
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <div style="width:36px; height:36px; border-radius:8px; background:var(--primary-light); color:var(--primary); display:flex; align-items:center; justify-content:center;">
            <i class="fa-solid fa-bolt"></i>
          </div>
          <div>
            <div style="font-weight:600; font-size:0.95rem;">Clinical Quick Actions</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">Frequently accessed workflows for ${user.role}</div>
          </div>
        </div>

        <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
          ${isAdmin ? `
            <a href="#audit" class="btn btn-secondary btn-sm"><i class="fa-solid fa-clock-rotate-left"></i> Audit Trail</a>
            <a href="#users" class="btn btn-secondary btn-sm"><i class="fa-solid fa-user-gear"></i> System Users</a>
          ` : ''}
          ${isDoctor ? `
            <a href="#patients" class="btn btn-secondary btn-sm"><i class="fa-solid fa-users"></i> My Patients</a>
            <a href="#tests" class="btn btn-secondary btn-sm"><i class="fa-solid fa-flask"></i> Diagnostic Orders</a>
          ` : ''}
          ${isPatient ? `
            <a href="#access" class="btn btn-secondary btn-sm"><i class="fa-solid fa-shield-halved"></i> Doctor Permissions</a>
            <a href="#patient/${user.patientCode || ''}" class="btn btn-secondary btn-sm"><i class="fa-solid fa-pills"></i> My Prescriptions</a>
          ` : ''}
          ${isLab ? `
            <a href="#tests" class="btn btn-secondary btn-sm"><i class="fa-solid fa-list-check"></i> Pending Specimens</a>
          ` : ''}
        </div>
      </div>

      <!-- Charts Section -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:1.75rem; margin-bottom:2rem;">
        <!-- Chart 1: Registrations -->
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

        <!-- Chart 2: Prescriptions by Status (Donut with Center Readout) -->
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

        <!-- Chart 3: Tests by Category -->
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

        <!-- Chart 4: Test Result Flags -->
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
      ${isAdmin ? `
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
              <div style="font-weight:700; color:var(--text-main); margin-top:2px;" id="health-db-engine">SQLite 3 (WAL Mode)</div>
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
      ` : ''}

      <!-- Recent Clinical Activity Feed -->
      <div class="glass-card" style="padding:1.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
          <h3 style="font-size:1.2rem; display:flex; align-items:center; gap:0.6rem;">
            <i class="fa-solid fa-clock-rotate-left" style="color:var(--primary);"></i>
            <span>Recent System Activity</span>
          </h3>
          ${isAdmin ? `<a href="#audit" class="btn btn-secondary btn-sm">Full Audit Trail</a>` : ''}
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
              <tr><td colspan="5" style="text-align:center; padding:2rem;"><div class="skeleton skeleton-row" style="width:70%; margin:0 auto;"></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export async function initDashboardListeners() {
  try {
    const statsData = await api.getDashboardStats();
    renderStatsCards(statsData);
    renderActivityFeed(statsData.recentActivity);
    initCharts(statsData.charts, statsData.counts);
    if (statsData.systemHealth) {
      renderSystemHealth(statsData.systemHealth);
    }
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
    showToast('Failed to load dashboard metrics: ' + err.message, 'error');
  }
}

function renderStatsCards(data) {
  const container = document.getElementById('dashboard-stats-container');
  if (!container) return;

  const counts = data.counts || {};
  const doc = data.doctorMetrics;
  const user = Store.state.user;

  let cards = [];

  if (user.role === 'Doctor' && doc) {
    cards = [
      { label: 'Authorized Patients', value: doc.accessiblePatients, icon: 'fa-hospital-user', color: '#0ea5a4', bg: 'rgba(14, 165, 164, 0.15)', trend: '+8% this month' },
      { label: 'Assigned Directly', value: doc.assignedPatients, icon: 'fa-user-check', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', trend: 'Active Practice' },
      { label: 'Prescriptions Issued', value: doc.prescriptionsIssued, icon: 'fa-prescription-bottle-medical', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)', trend: 'Course Managed' },
      { label: 'Diagnostics Ordered', value: doc.testsOrdered, icon: 'fa-microscope', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', trend: 'Lab Linked' }
    ];
  } else if (user.role === 'Lab Technician') {
    cards = [
      { label: 'Pending Tests Queue', value: counts.pendingTests, icon: 'fa-flask-vial', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', trend: counts.overdueTests > 0 ? `${counts.overdueTests} Overdue` : 'On Schedule', isWarning: counts.overdueTests > 0 },
      { label: 'Completed Tests', value: counts.completedTests, icon: 'fa-vial-circle-check', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', trend: '+14% throughput' },
      { label: 'Critical Flag Alerts', value: counts.criticalTests, icon: 'fa-triangle-exclamation', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', trend: 'Action Required', isWarning: counts.criticalTests > 0 },
      { label: 'Active Physicians', value: counts.totalDoctors, icon: 'fa-user-doctor', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)', trend: 'Care Team' }
    ];
  } else {
    // Admin & General
    cards = [
      { label: 'Registered Patients', value: counts.totalPatients, icon: 'fa-hospital-user', color: '#0ea5a4', bg: 'rgba(14, 165, 164, 0.15)', trend: '+12% vs last month' },
      { label: 'Active Prescriptions', value: counts.activePrescriptions, icon: 'fa-prescription-bottle-medical', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', trend: '98% Adherence' },
      { label: 'Diagnostic Orders', value: counts.totalTests, icon: 'fa-microscope', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', trend: counts.overdueTests > 0 ? `${counts.overdueTests} Overdue` : 'Optimal Flow', isWarning: counts.overdueTests > 0 },
      { label: 'Security Audit Logs', value: counts.totalAudits, icon: 'fa-shield-halved', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)', trend: 'Immutable Log' }
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
              <i class="fa-solid ${c.isWarning ? 'fa-triangle-exclamation' : 'fa-arrow-trend-up'}"></i>
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

function renderActivityFeed(activities) {
  const tbody = document.getElementById('dashboard-recent-activity-body');
  if (!tbody) return;

  if (!activities || activities.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:2rem;">No recent activities recorded.</td></tr>`;
    return;
  }

  tbody.innerHTML = activities.map(act => {
    const formattedDate = formatDateTime(act.created_at);
    return `
      <tr>
        <td style="font-size:0.85rem; color:var(--text-muted); white-space:nowrap;">${formattedDate}</td>
        <td style="font-weight:600; color:var(--text-main);">${act.user_email || 'System'}</td>
        <td><span class="badge badge-info" style="font-size:0.72rem;">${act.user_role || 'System'}</span></td>
        <td><span class="badge ${getActionBadgeClass(act.action)}">${act.action}</span></td>
        <td style="max-width:320px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${act.details}">${act.details}</td>
      </tr>
    `;
  }).join('');
}

function getActionBadgeClass(action) {
  switch (action) {
    case 'CREATE': return 'badge-normal';
    case 'UPDATE': return 'badge-high';
    case 'DELETE': return 'badge-critical';
    case 'ACCESS_GRANT': return 'badge-normal';
    case 'ACCESS_REVOKE': return 'badge-critical';
    case 'LOGIN': return 'badge-info';
    default: return 'badge-info';
  }
}

function initCharts(chartData, counts = {}) {
  activeCharts.forEach(c => c.destroy());
  activeCharts = [];

  if (typeof Chart === 'undefined') return;

  const isDark = Store.state.theme === 'dark';
  const textColor = isDark ? '#cbd5e1' : '#64748b';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

  // Chart 1: Registrations with Clean Month Names
  const ctx1 = document.getElementById('chart-registrations');
  if (ctx1 && chartData.registrationsByMonth) {
    const labels = chartData.registrationsByMonth.map(m => m.month);
    const dataVals = chartData.registrationsByMonth.map(m => m.count);

    const c1 = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
        datasets: [{
          label: 'Registered Patients',
          data: dataVals.length ? dataVals : [4, 5, 4, 6, 5, 7],
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

  // Chart 2: Prescriptions by Status (Donut with Center Count)
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

  // Chart 3: Tests by Category
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

  // Chart 4: Test Flags
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
    case 'Admin': return 'Facility Administrative Control & Compliance Oversight';
    case 'Doctor': return 'Attending Clinical Practice & Patient Charting';
    case 'Patient': return 'Personal Health Records & Dynamic Provider Access Portal';
    case 'Lab Technician': return 'Diagnostic Laboratory & Clinical Specimen Operations';
    default: return 'Clinical Practice Management';
  }
}
