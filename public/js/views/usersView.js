/**
 * Admin User Management View
 */

import api from '../api.js';
import Store from '../store.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { formatDate, renderSkeletonTable, renderEmptyState, renderErrorState } from '../utils.js';

export async function renderUsersView() {
  const user = Store.state.user;
  if (user.role !== 'Admin') {
    return `<div class="content-wrapper"><div class="glass-card" style="padding:3rem; text-align:center;"><h2>Access Restricted to Administrators</h2></div></div>`;
  }

  return `
    <div class="content-wrapper">
      <div class="page-header">
        <div class="page-title-group">
          <h1>
            <i class="fa-solid fa-users-gear" style="color:var(--primary); font-size:1.5rem;"></i>
            <span>System User Accounts & Credential Management</span>
          </h1>
          <div class="page-subtitle">Provision physician accounts, laboratory technicians, administrative officers, and security credentials</div>
        </div>

        <button id="add-user-btn" class="btn btn-primary">
          <i class="fa-solid fa-user-plus"></i> Provision New User
        </button>
      </div>

      <!-- Users Summary Metrics Cards -->
      <div class="stats-grid" id="users-summary-grid">
        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--primary-light); color:var(--primary);">
              <i class="fa-solid fa-hospital-user"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="stat-total-users">--</div>
              <div class="stat-label">Total Accounts</div>
              <div class="stat-badge-row">
                <span class="stat-trend positive"><i class="fa-solid fa-users"></i> System Active</span>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--emerald-light); color:var(--emerald);">
              <i class="fa-solid fa-user-doctor"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="stat-doctor-users">--</div>
              <div class="stat-label">Attending Doctors</div>
              <div class="stat-badge-row">
                <span class="stat-trend positive"><i class="fa-solid fa-stethoscope"></i> Clinical Staff</span>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--amber-light); color:var(--amber);">
              <i class="fa-solid fa-microscope"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="stat-lab-users">--</div>
              <div class="stat-label">Lab Technicians</div>
              <div class="stat-badge-row">
                <span class="stat-trend neutral"><i class="fa-solid fa-flask-vial"></i> Diagnostic Lab</span>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--rose-light); color:var(--rose);">
              <i class="fa-solid fa-shield-halved"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="stat-admin-users">--</div>
              <div class="stat-label">Administrators</div>
              <div class="stat-badge-row">
                <span class="stat-trend positive"><i class="fa-solid fa-lock"></i> Full Security</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Users Table Card -->
      <div class="glass-card">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name & User Identity</th>
                <th>Role</th>
                <th>Clinical Specialization / Department</th>
                <th>Medical License #</th>
                <th>Contact Phone</th>
                <th>Account Created</th>
              </tr>
            </thead>
            <tbody id="users-table-body">
              ${renderSkeletonTable(5, 6)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function initUsersListeners() {
  loadUsersTable();

  const addBtn = document.getElementById('add-user-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => openAddUserModal());
  }
}

async function loadUsersTable() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  try {
    const users = await api.getUsers();

    if (!users || users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6">${renderEmptyState('fa-users-gear', 'No user accounts found', 'Provision a new doctor, technician, or administrator account.')}</td></tr>`;
      return;
    }

    // Compute Summaries
    const totalUsers = users.length;
    const doctorUsers = users.filter(u => u.role === 'Doctor').length;
    const labUsers = users.filter(u => u.role === 'Lab Technician').length;
    const adminUsers = users.filter(u => u.role === 'Admin').length;

    const sTot = document.getElementById('stat-total-users');
    const sDoc = document.getElementById('stat-doctor-users');
    const sLab = document.getElementById('stat-lab-users');
    const sAdm = document.getElementById('stat-admin-users');

    if (sTot) sTot.textContent = totalUsers;
    if (sDoc) sDoc.textContent = doctorUsers;
    if (sLab) sLab.textContent = labUsers;
    if (sAdm) sAdm.textContent = adminUsers;

    tbody.innerHTML = users.map(u => {
      const cleanName = u.name.replace(/^Dr\.\s+/i, '');
      const displayName = u.role === 'Doctor' ? `Dr. ${cleanName}` : cleanName;

      const initials = cleanName
        .split(' ')
        .filter(Boolean)
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <div class="user-avatar" style="width:36px; height:36px; font-size:0.82rem;">${initials}</div>
              <div>
                <div style="font-weight:600; color:var(--text-main); font-size:0.95rem;">${displayName}</div>
                <div style="font-size:0.78rem; color:var(--text-muted);">${u.email}</div>
              </div>
            </div>
          </td>
          <td>
            <span class="badge ${getUserRoleBadgeClass(u.role)}">${u.role}</span>
          </td>
          <td>
            <div style="font-size:0.88rem;">${u.specialization || '<span style="color:var(--text-muted);">General</span>'}</div>
          </td>
          <td>
            <span style="font-family:monospace; font-size:0.82rem; color:var(--primary);">${u.license_number || 'N/A'}</span>
          </td>
          <td style="font-size:0.85rem; color:var(--text-muted);">${u.phone || 'N/A'}</td>
          <td style="font-size:0.85rem; color:var(--text-muted);">${formatDate(u.created_at)}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">${renderErrorState('Failed to load users: ' + err.message, 'loadUsersTable()')}</td></tr>`;
  }
}

function getUserRoleBadgeClass(role) {
  switch (role) {
    case 'Admin': return 'badge-danger';
    case 'Doctor': return 'badge-info';
    case 'Lab Technician': return 'badge-warning';
    case 'Patient': return 'badge-normal';
    default: return 'badge-info';
  }
}

function openAddUserModal() {
  const bodyHtml = `
    <form id="create-user-modal-form">
      <div class="form-row">
        <div class="form-group">
          <label>Full Name *</label>
          <input type="text" id="u-name" class="form-control" placeholder="e.g. Jonathan Reed (do not add Dr. prefix)" required>
        </div>
        <div class="form-group">
          <label>Role *</label>
          <select id="u-role" class="form-control" required>
            <option value="Doctor">Doctor</option>
            <option value="Lab Technician">Lab Technician</option>
            <option value="Admin">Administrator</option>
            <option value="Patient">Patient</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Email Address *</label>
          <input type="email" id="u-email" class="form-control" placeholder="doctor@medivault.com" required>
        </div>
        <div class="form-group">
          <label>Temporary Password * (Min 6 chars)</label>
          <input type="password" id="u-password" class="form-control" placeholder="••••••••" minlength="6" required>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Specialization / Department</label>
          <input type="text" id="u-spec" class="form-control" placeholder="e.g. Pediatric Cardiology, Hematology">
        </div>
        <div class="form-group">
          <label>State Medical License #</label>
          <input type="text" id="u-license" class="form-control" placeholder="e.g. MED-TX-98421">
        </div>
      </div>

      <div class="form-group">
        <label>Telephone Number</label>
        <input type="tel" id="u-phone" class="form-control" placeholder="+1 (555) 000-0000">
      </div>
    </form>
  `;

  openModal({
    title: 'Provision New User Account',
    bodyHtml,
    footerHtml: `
      <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
      <button class="btn btn-primary modal-save-btn"><i class="fa-solid fa-check"></i> Create User Account</button>
    `,
    maxWidth: '650px'
  });

  const modalEl = document.getElementById('app-active-modal');
  if (!modalEl) return;

  const saveBtn = modalEl.querySelector('.modal-save-btn');
  modalEl.querySelector('.modal-cancel-btn').addEventListener('click', closeModal);
  saveBtn.addEventListener('click', async () => {
    const rawName = modalEl.querySelector('#u-name').value.trim();
    const role = modalEl.querySelector('#u-role').value;
    const email = modalEl.querySelector('#u-email').value.trim();
    const password = modalEl.querySelector('#u-password').value;
    const spec = modalEl.querySelector('#u-spec').value.trim();
    const license = modalEl.querySelector('#u-license').value.trim();
    const phone = modalEl.querySelector('#u-phone').value.trim();

    if (!rawName || !email || !password) {
      showToast('Name, email, and password are required.', 'warning');
      return;
    }

    // Clean name: Admin should never have "Dr."
    const name = role === 'Doctor' ? (rawName.startsWith('Dr. ') ? rawName : `Dr. ${rawName}`) : rawName.replace(/^Dr\.\s+/i, '');

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Provisioning...';

    try {
      await api.createUser({
        name,
        role,
        email,
        password,
        specialization: spec || null,
        license_number: license || null,
        phone: phone || null
      });

      showToast(`User account created for ${email}`, 'success');
      closeModal();
      loadUsersTable();
    } catch (err) {
      showToast(err.message, 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Create User Account';
    }
  });
}
