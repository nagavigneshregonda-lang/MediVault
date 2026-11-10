/**
 * Admin Security Audit Trail View with Multi-Dimensional Filters
 */

import api from '../api.js';
import Store from '../store.js';
import { showToast } from '../components/toast.js';
import { formatDateTime, renderSkeletonTable, renderEmptyState, renderErrorState } from '../utils.js';

let auditFilters = {
  action: '',
  resource: '',
  user_role: '',
  search: '',
  start_date: '',
  end_date: '',
  page: 1,
  limit: 20
};

export async function renderAuditView() {
  const user = Store.state.user;
  if (user.role !== 'Admin') {
    return `<div class="content-wrapper"><div class="glass-card" style="padding:3rem; text-align:center;"><h2>Access Restricted to Administrators</h2></div></div>`;
  }

  return `
    <div class="content-wrapper">
      <div class="page-header">
        <div class="page-title-group">
          <h1>
            <i class="fa-solid fa-clock-rotate-left" style="color:var(--primary); font-size:1.5rem;"></i>
            <span>Security & Compliance Audit Trail</span>
          </h1>
          <div class="page-subtitle">Immutable log recording every clinical view, record creation, modification, deletion, and consent grant</div>
        </div>

        <button id="refresh-audit-btn" class="btn btn-secondary">
          <i class="fa-solid fa-arrows-rotate"></i> Refresh Logs
        </button>
      </div>

      <!-- Audit Summary Metrics Grid -->
      <div class="stats-grid" id="audit-summary-grid">
        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--primary-light); color:var(--primary);">
              <i class="fa-solid fa-key"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="stat-auth-events">--</div>
              <div class="stat-label">Authentication Events</div>
              <div class="stat-badge-row">
                <span class="stat-trend positive"><i class="fa-solid fa-shield-halved"></i> Logins & Logouts</span>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--emerald-light); color:var(--emerald);">
              <i class="fa-solid fa-user-shield"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="stat-consent-events">--</div>
              <div class="stat-label">Consent & Authorization</div>
              <div class="stat-badge-row">
                <span class="stat-trend positive"><i class="fa-solid fa-lock"></i> Grants & Revokes</span>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--amber-light); color:var(--amber);">
              <i class="fa-solid fa-file-pen"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="stat-clinical-mods">--</div>
              <div class="stat-label">Clinical Modifications</div>
              <div class="stat-badge-row">
                <span class="stat-trend neutral"><i class="fa-solid fa-pen-to-square"></i> Creates & Updates</span>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:rgba(14, 165, 233, 0.12); color:#0ea5e9;">
              <i class="fa-solid fa-eye"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="stat-chart-views">--</div>
              <div class="stat-label">Chart Access Invocations</div>
              <div class="stat-badge-row">
                <span class="stat-trend positive"><i class="fa-solid fa-hospital-user"></i> HIPAA-inspired logging</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Filters Card with Standard Aligned Grid -->
      <div class="glass-card" style="padding:1.25rem; margin-bottom:1.5rem;">
        <div class="filter-bar-grid">
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:0.8rem; color:var(--text-muted);"><i class="fa-solid fa-magnifying-glass"></i> Search</label>
            <input type="text" id="audit-search-input" class="form-control" placeholder="Search user, IP, details...">
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:0.8rem; color:var(--text-muted);"><i class="fa-solid fa-bolt"></i> Action Type</label>
            <select id="audit-action-select" class="form-control">
              <option value="">All Actions</option>
              <option value="VIEW">VIEW</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="ACCESS_GRANT">ACCESS_GRANT</option>
              <option value="ACCESS_REVOKE">ACCESS_REVOKE</option>
              <option value="LOGIN">LOGIN</option>
              <option value="LOGOUT">LOGOUT</option>
            </select>
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:0.8rem; color:var(--text-muted);"><i class="fa-solid fa-folder"></i> Resource</label>
            <select id="audit-resource-select" class="form-control">
              <option value="">All Resources</option>
              <option value="PATIENT">PATIENT</option>
              <option value="HISTORY">HISTORY</option>
              <option value="PRESCRIPTION">PRESCRIPTION</option>
              <option value="TEST">TEST</option>
              <option value="ACCESS">ACCESS</option>
              <option value="USER">USER</option>
            </select>
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:0.8rem; color:var(--text-muted);"><i class="fa-solid fa-user-tag"></i> User Role</label>
            <select id="audit-role-select" class="form-control">
              <option value="">All Roles</option>
              <option value="Admin">Admin</option>
              <option value="Doctor">Doctor</option>
              <option value="Patient">Patient</option>
              <option value="Lab Technician">Lab Technician</option>
            </select>
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:0.8rem; color:var(--text-muted);"><i class="fa-regular fa-calendar"></i> From Date</label>
            <input type="date" id="audit-start-date" class="form-control">
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:0.8rem; color:var(--text-muted);"><i class="fa-regular fa-calendar"></i> To Date</label>
            <input type="date" id="audit-end-date" class="form-control">
          </div>

          <div style="display:flex; gap:0.5rem;">
            <button id="audit-reset-btn" class="btn btn-secondary" style="width:100%;">
              <i class="fa-solid fa-rotate-left"></i> Reset
            </button>
          </div>
        </div>
      </div>

      <!-- Audit Logs Table -->
      <div class="glass-card">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User Account</th>
                <th>Role</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Resource ID</th>
                <th>Clinical / Security Event Details</th>
                <th>Client IP</th>
              </tr>
            </thead>
            <tbody id="audit-table-body">
              ${renderSkeletonTable(6, 8)}
            </tbody>
          </table>
        </div>

        <div style="padding:1.25rem; display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); flex-wrap:wrap; gap:1rem;">
          <div id="audit-pagination-info" style="font-size:0.88rem; color:var(--text-muted);">Showing page 1</div>
          <div style="display:flex; gap:0.5rem;" id="audit-pagination-controls"></div>
        </div>
      </div>
    </div>
  `;
}

export function initAuditListeners() {
  loadAuditLogs();

  const searchInput = document.getElementById('audit-search-input');
  let debounce = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        auditFilters.search = e.target.value.trim();
        auditFilters.page = 1;
        loadAuditLogs();
      }, 300);
    });
  }

  const actionSelect = document.getElementById('audit-action-select');
  if (actionSelect) {
    actionSelect.addEventListener('change', (e) => {
      auditFilters.action = e.target.value;
      auditFilters.page = 1;
      loadAuditLogs();
    });
  }

  const resSelect = document.getElementById('audit-resource-select');
  if (resSelect) {
    resSelect.addEventListener('change', (e) => {
      auditFilters.resource = e.target.value;
      auditFilters.page = 1;
      loadAuditLogs();
    });
  }

  const roleSelect = document.getElementById('audit-role-select');
  if (roleSelect) {
    roleSelect.addEventListener('change', (e) => {
      auditFilters.user_role = e.target.value;
      auditFilters.page = 1;
      loadAuditLogs();
    });
  }

  const sDate = document.getElementById('audit-start-date');
  if (sDate) {
    sDate.addEventListener('change', (e) => {
      auditFilters.start_date = e.target.value;
      auditFilters.page = 1;
      loadAuditLogs();
    });
  }

  const eDate = document.getElementById('audit-end-date');
  if (eDate) {
    eDate.addEventListener('change', (e) => {
      auditFilters.end_date = e.target.value;
      auditFilters.page = 1;
      loadAuditLogs();
    });
  }

  const resetBtn = document.getElementById('audit-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (actionSelect) actionSelect.value = '';
      if (resSelect) resSelect.value = '';
      if (roleSelect) roleSelect.value = '';
      if (sDate) sDate.value = '';
      if (eDate) eDate.value = '';
      auditFilters = { action: '', resource: '', user_role: '', search: '', start_date: '', end_date: '', page: 1, limit: 20 };
      loadAuditLogs();
    });
  }

  const refreshBtn = document.getElementById('refresh-audit-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadAuditLogs();
      showToast('Audit trail refreshed.', 'info');
    });
  }
}

async function loadAuditLogs() {
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;

  try {
    const data = await api.getAuditLogs(auditFilters);
    const logs = data.logs || [];
    const pagination = data.pagination || {};
    const summary = data.summary || {};

    // Update Summary Header Metrics
    const sAuth = document.getElementById('stat-auth-events');
    const sConsent = document.getElementById('stat-consent-events');
    const sMods = document.getElementById('stat-clinical-mods');
    const sViews = document.getElementById('stat-chart-views');

    if (sAuth) sAuth.textContent = summary.authEvents ?? '--';
    if (sConsent) sConsent.textContent = summary.consentEvents ?? '--';
    if (sMods) sMods.textContent = summary.clinicalModifications ?? '--';
    if (sViews) sViews.textContent = summary.chartViews ?? '--';

    if (logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8">
            ${renderEmptyState('fa-shield-halved', 'No audit events match current query', 'Try adjusting your search criteria, role filters, or date range.')}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = logs.map(l => {
      return `
        <tr>
          <td style="font-size:0.82rem; font-family:monospace; color:var(--text-muted); white-space:nowrap;">
            ${formatDateTime(l.created_at)}
          </td>
          <td>
            <div style="font-weight:600; font-size:0.88rem; color:var(--text-main);">${l.user_email || 'System'}</div>
          </td>
          <td><span class="badge badge-info" style="font-size:0.75rem;">${l.user_role || 'System'}</span></td>
          <td><span class="badge ${getActionBadgeClass(l.action)}">${l.action}</span></td>
          <td><span style="font-weight:600; font-size:0.85rem; color:var(--text-main);">${l.resource}</span></td>
          <td><span style="font-family:monospace; font-size:0.82rem; color:var(--primary);">${l.resource_id || '--'}</span></td>
          <td style="max-width:320px; font-size:0.85rem;" title="${l.details}">
            ${l.details}
          </td>
          <td style="font-family:monospace; font-size:0.82rem; color:var(--text-muted);">${l.ip_address}</td>
        </tr>
      `;
    }).join('');

    const info = document.getElementById('audit-pagination-info');
    const controls = document.getElementById('audit-pagination-controls');
    if (info && controls) {
      info.textContent = `Showing page ${pagination.page} of ${pagination.totalPages || 1} (${pagination.total} audit records)`;
      controls.innerHTML = `
        <button class="btn btn-secondary btn-sm" ${pagination.page <= 1 ? 'disabled' : ''} id="audit-prev-btn">Previous</button>
        <button class="btn btn-secondary btn-sm" ${pagination.page >= pagination.totalPages ? 'disabled' : ''} id="audit-next-btn">Next</button>
      `;
      const prev = document.getElementById('audit-prev-btn');
      const next = document.getElementById('audit-next-btn');
      if (prev) prev.addEventListener('click', () => { auditFilters.page--; loadAuditLogs(); });
      if (next) next.addEventListener('click', () => { auditFilters.page++; loadAuditLogs(); });
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8">${renderErrorState('Failed to retrieve audit trail: ' + err.message, 'loadAuditLogs()')}</td></tr>`;
  }
}

function getActionBadgeClass(action) {
  switch (action) {
    case 'CREATE': return 'badge-normal';
    case 'UPDATE': return 'badge-high';
    case 'DELETE': return 'badge-critical';
    case 'ACCESS_GRANT': return 'badge-normal';
    case 'ACCESS_REVOKE': return 'badge-critical';
    case 'LOGIN': return 'badge-info';
    case 'LOGOUT': return 'badge-low';
    default: return 'badge-info';
  }
}
