/**
 * Authorized Access & Consent Control Hub
 */

import api from '../api.js';
import Store from '../store.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal, openConfirm } from '../components/modal.js';
import { formatDate, formatDateTime, renderSkeletonTable, renderEmptyState, renderErrorState } from '../utils.js';

let availableDoctors = [];

export async function renderAccessView() {
  const user = Store.state.user;
  const isPatient = user.role === 'Patient';
  const isAdmin = user.role === 'Admin';

  return `
    <div class="content-wrapper">
      <div class="page-header">
        <div class="page-title-group">
          <h1>
            <i class="fa-solid fa-shield-halved" style="color:var(--primary); font-size:1.5rem;"></i>
            <span>Authorized Medical Access Control</span>
          </h1>
          <div class="page-subtitle">
            ${isPatient ? 'Manage which healthcare providers are authorized to view and edit your medical chart' : 'Review active clinical authorizations, expiration windows, and patient consent grants'}
          </div>
        </div>

        ${isPatient || isAdmin ? `
          <button id="hub-grant-access-btn" class="btn btn-primary">
            <i class="fa-solid fa-user-shield"></i> Grant New Doctor Authorization
          </button>
        ` : ''}
      </div>

      <!-- Access Summary Metrics Cards -->
      <div class="stats-grid" id="access-summary-grid">
        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--emerald-light); color:var(--emerald);">
              <i class="fa-solid fa-user-shield"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="stat-active-consents">--</div>
              <div class="stat-label">Active Consents</div>
              <div class="stat-badge-row">
                <span class="stat-trend positive"><i class="fa-solid fa-lock"></i> Enforced</span>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--amber-light); color:var(--amber);">
              <i class="fa-solid fa-clock-rotate-left"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="stat-expiring-soon">--</div>
              <div class="stat-label">Expiring Soon (&lt; 3 Days)</div>
              <div class="stat-badge-row">
                <span class="stat-trend warning"><i class="fa-solid fa-hourglass-half"></i> Renewal Req.</span>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--rose-light); color:var(--rose);">
              <i class="fa-solid fa-user-xmark"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="stat-revoked-consents">--</div>
              <div class="stat-label">Revoked Consents</div>
              <div class="stat-badge-row">
                <span class="stat-trend neutral"><i class="fa-solid fa-ban"></i> Terminated</span>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--primary-light); color:var(--primary);">
              <i class="fa-solid fa-user-doctor"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="stat-auth-doctors">--</div>
              <div class="stat-label">Authorized Providers</div>
              <div class="stat-badge-row">
                <span class="stat-trend positive"><i class="fa-solid fa-stethoscope"></i> Verified Staff</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Consent Architecture Explainer Card -->
      <div class="glass-card" style="padding:1.25rem 1.5rem; margin-bottom:1.5rem; background:linear-gradient(135deg, rgba(14, 165, 164, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%); border-left:4px solid var(--primary);">
        <div style="display:flex; align-items:flex-start; gap:1rem;">
          <div style="width:38px; height:38px; border-radius:10px; background:var(--primary); color:white; display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0;">
            <i class="fa-solid fa-lock"></i>
          </div>
          <div>
            <div style="font-weight:700; font-size:1rem; margin-bottom:0.2rem;">Zero-Trust Clinical Access Control</div>
            <p style="font-size:0.88rem; color:var(--text-muted); line-height:1.5; margin:0;">
              Physicians cannot browse or modify medical charts unless they are the primary assigned doctor or hold an active, non-expired consent grant. All access grants and revokes are recorded in the immutable security audit trail.
            </p>
          </div>
        </div>
      </div>

      <!-- Access Grants Table Card -->
      <div class="glass-card">
        <div style="padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
          <h3 style="font-size:1.15rem; display:flex; align-items:center; gap:0.5rem; margin:0;">
            <i class="fa-solid fa-list-check" style="color:var(--primary);"></i>
            <span>${isPatient ? 'Your Authorized Healthcare Providers' : 'System-Wide Authorization Records'}</span>
          </h3>
          <span class="badge badge-normal" id="access-count-badge">Active</span>
        </div>

        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                ${!isPatient ? `<th>Patient</th>` : ''}
                <th>Authorized Physician</th>
                <th>Specialization</th>
                <th>Authorization Status</th>
                <th>Access Expiration</th>
                <th>Granted By</th>
                <th>Purpose / Consultation Notes</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody id="hub-grants-table-body">
              ${renderSkeletonTable(5, isPatient ? 7 : 8)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export async function initAccessListeners() {
  try {
    availableDoctors = await api.getDoctorsForGrant();
  } catch (e) {
    availableDoctors = [];
  }

  loadHubGrants();

  const grantBtn = document.getElementById('hub-grant-access-btn');
  if (grantBtn) {
    grantBtn.addEventListener('click', () => openHubGrantModal());
  }
}

async function loadHubGrants() {
  const tbody = document.getElementById('hub-grants-table-body');
  if (!tbody) return;

  const user = Store.state.user;
  const isPatient = user.role === 'Patient';
  const colSpan = isPatient ? 7 : 8;

  try {
    const res = await api.getAllGrants();
    const grants = res.grants || [];
    const summary = res.summary || {};

    // Update Summary Metrics
    const sActive = document.getElementById('stat-active-consents');
    const sExp = document.getElementById('stat-expiring-soon');
    const sRev = document.getElementById('stat-revoked-consents');
    const sDoc = document.getElementById('stat-auth-doctors');
    const countBadge = document.getElementById('access-count-badge');

    if (sActive) sActive.textContent = summary.activeGrants ?? 0;
    if (sExp) sExp.textContent = summary.expiringSoon ?? 0;
    if (sRev) sRev.textContent = summary.revokedGrants ?? 0;
    if (sDoc) sDoc.textContent = summary.authorizedDoctors ?? 0;
    if (countBadge) countBadge.textContent = `${summary.activeGrants || 0} Active Grants`;

    if (grants.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${colSpan}">
            ${renderEmptyState('fa-user-shield', 'No secondary doctor authorizations on record', 'Patients can grant temporary or indefinite access to specialist physicians.')}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = grants.map(g => {
      const isGranted = g.status === 'Granted';
      const isExpired = g.expires_at && new Date(g.expires_at) < new Date();
      const statusLabel = isExpired ? 'Expired' : g.status;
      const statusBadge = isGranted && !isExpired ? 'badge-normal' : 'badge-critical';
      const patientCode = g.patient_code || user.patientCode || 'MV-2026-0001';

      return `
        <tr>
          ${!isPatient ? `
            <td>
              <div style="font-weight:600; color:var(--text-main); font-size:0.92rem;">${g.patient_first_name ? g.patient_first_name + ' ' + g.patient_last_name : patientCode}</div>
              <span class="badge badge-info" style="font-family:monospace; font-size:0.75rem;">${patientCode}</span>
            </td>
          ` : ''}
          <td>
            <div style="font-weight:700; color:var(--text-main);">${g.doctor_name}</div>
            <div style="font-size:0.78rem; color:var(--text-muted);">${g.doctor_email}</div>
          </td>
          <td>${g.doctor_specialization || 'Clinical Specialist'}</td>
          <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
          <td style="font-size:0.88rem;">${g.expires_at ? formatDateTime(g.expires_at) : '<span style="color:var(--text-muted);">Indefinite / Permanent</span>'}</td>
          <td>${g.granted_by_name || 'Patient'}</td>
          <td style="max-width:240px; font-size:0.85rem;">${g.notes || 'Clinical consultation'}</td>
          <td style="text-align:right;">
            ${(user.role === 'Patient' || user.role === 'Admin') && isGranted && !isExpired ? `
              <button class="btn btn-danger btn-sm hub-revoke-btn" data-id="${g.id}" data-pid="${patientCode}" data-doc="${g.doctor_name}">
                <i class="fa-solid fa-ban"></i> Revoke
              </button>
            ` : '<span style="color:var(--text-muted); font-size:0.82rem;">None</span>'}
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.hub-revoke-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const gId = btn.getAttribute('data-id');
        const docName = btn.getAttribute('data-doc');
        const pid = btn.getAttribute('data-pid');
        openConfirm({
          title: 'Revoke Doctor Access',
          message: `Are you sure you want to revoke chart access permissions from Dr. ${docName}? They will immediately lose authorization to access this patient profile.`,
          confirmText: 'Revoke Access',
          onConfirm: async () => {
            try {
              await api.revokeAccess(pid, null, gId);
              showToast(`Access revoked from Dr. ${docName}.`, 'info');
              loadHubGrants();
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
        });
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="${colSpan}">${renderErrorState('Failed to load grants: ' + err.message, 'loadHubGrants()')}</td></tr>`;
  }
}

function openHubGrantModal() {
  const user = Store.state.user;
  const targetPid = user.patientCode || 'MV-2026-0001';

  const docOptions = availableDoctors.map(d => `
    <option value="${d.id}">${d.name} (${d.specialization || 'General Practice'})</option>
  `).join('');

  const bodyHtml = `
    <form id="hub-grant-form">
      ${user.role === 'Admin' ? `
        <div class="form-group">
          <label>Target Patient ID *</label>
          <input type="text" id="hub-patient-id" class="form-control" value="${targetPid}" placeholder="e.g. MV-2026-0001" required>
        </div>
      ` : ''}

      <div class="form-group">
        <label>Select Doctor to Authorize *</label>
        <select id="hub-doc-id" class="form-control" required>
          <option value="">-- Choose Doctor --</option>
          ${docOptions}
        </select>
      </div>

      <div class="form-group">
        <label>Access Expiration Date (Optional - leave blank for indefinite)</label>
        <input type="datetime-local" id="hub-expires-at" class="form-control">
      </div>

      <div class="form-group">
        <label>Purpose / Clinical Consultation Notes</label>
        <textarea id="hub-grant-notes" class="form-control" rows="2" placeholder="e.g. Authorized for second opinion regarding cardiology consult..."></textarea>
      </div>
    </form>
  `;

  openModal({
    title: 'Grant Medical Record Access Authorization',
    bodyHtml,
    footerHtml: `
      <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
      <button class="btn btn-primary modal-save-btn"><i class="fa-solid fa-check"></i> Authorize Provider</button>
    `,
    maxWidth: '580px'
  });

  const modalEl = document.getElementById('app-active-modal');
  if (!modalEl) return;

  const saveBtn = modalEl.querySelector('.modal-save-btn');
  modalEl.querySelector('.modal-cancel-btn').addEventListener('click', closeModal);
  saveBtn.addEventListener('click', async () => {
    const pidInput = modalEl.querySelector('#hub-patient-id');
    const effectivePid = pidInput ? pidInput.value.trim() : targetPid;
    const docId = modalEl.querySelector('#hub-doc-id').value;
    const expires = modalEl.querySelector('#hub-expires-at').value;
    const notes = modalEl.querySelector('#hub-grant-notes').value.trim();

    if (!docId) {
      showToast('Please select a physician to authorize.', 'warning');
      return;
    }
    if (!effectivePid) {
      showToast('Patient ID is required.', 'warning');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authorizing...';

    try {
      await api.grantAccess(effectivePid, parseInt(docId, 10), expires || null, notes || null);
      showToast('Doctor authorization granted!', 'success');
      closeModal();
      loadHubGrants();
    } catch (err) {
      showToast(err.message, 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Authorize Provider';
    }
  });
}
