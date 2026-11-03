/**
 * Patients Directory View with Summary Stats, Aligned Filters, Skeletons & Error Retries
 */

import api from '../api.js';
import Store from '../store.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal, openConfirm } from '../components/modal.js';
import { formatDate, renderSkeletonTable, renderEmptyState, renderErrorState } from '../utils.js';

let currentFilters = {
  search: '',
  blood_group: '',
  gender: '',
  status: 'active',
  page: 1,
  limit: 10
};

let doctorsList = [];

export async function renderPatientsView() {
  const user = Store.state.user;
  const canCreate = user.role === 'Admin' || user.role === 'Doctor';

  return `
    <div class="content-wrapper">
      <div class="page-header">
        <div class="page-title-group">
          <h1>
            <i class="fa-solid fa-hospital-user" style="color:var(--primary); font-size:1.5rem;"></i>
            <span>Patients Directory</span>
          </h1>
          <div class="page-subtitle">Longitudinal medical records, clinical vitals, and provider authorizations</div>
        </div>

        ${canCreate ? `
          <button id="open-register-patient-btn" class="btn btn-primary">
            <i class="fa-solid fa-user-plus"></i>
            <span>Register New Patient</span>
          </button>
        ` : ''}
      </div>

      <!-- Top Summary Stat Cards -->
      <div class="stats-grid" id="patients-summary-grid" style="margin-bottom:1.5rem;">
        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--primary-light); color:var(--primary);">
              <i class="fa-solid fa-users"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="pat-sum-total">--</div>
              <div class="stat-label">Total Patients</div>
              <div class="stat-badge-row">
                <span class="stat-trend positive"><i class="fa-solid fa-database"></i> Live Records</span>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--emerald-light); color:var(--emerald);">
              <i class="fa-solid fa-venus"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="pat-sum-female">--</div>
              <div class="stat-label">Female Patients</div>
              <div class="stat-badge-row">
                <span class="stat-trend neutral"><i class="fa-solid fa-venus"></i> Registered</span>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--indigo-light); color:var(--indigo);">
              <i class="fa-solid fa-mars"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="pat-sum-male">--</div>
              <div class="stat-label">Male Patients</div>
              <div class="stat-badge-row">
                <span class="stat-trend neutral"><i class="fa-solid fa-mars"></i> Registered</span>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--rose-light); color:var(--rose);">
              <i class="fa-solid fa-triangle-exclamation"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="pat-sum-allergies">--</div>
              <div class="stat-label">Allergy Watchlist</div>
              <div class="stat-badge-row">
                <span class="stat-trend warning"><i class="fa-solid fa-triangle-exclamation"></i> Safety Critical</span>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--amber-light); color:var(--amber);">
              <i class="fa-solid fa-heart-pulse"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="pat-sum-chronic">--</div>
              <div class="stat-label">Chronic Care Cases</div>
              <div class="stat-badge-row">
                <span class="stat-trend neutral"><i class="fa-solid fa-notes-medical"></i> Monitored</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Filter Controls Bar with Aligned Buttons -->
      <div class="glass-card" style="padding:1.25rem; margin-bottom:1.5rem;">
        <div class="filter-bar-grid">
          <div class="form-group">
            <label><i class="fa-solid fa-magnifying-glass"></i> Search Record</label>
            <input type="text" id="patient-search-filter" class="form-control" placeholder="Search name, ID, phone...">
          </div>

          <div class="form-group">
            <label><i class="fa-solid fa-droplet"></i> Blood Group</label>
            <select id="patient-blood-filter" class="form-control">
              <option value="">All Blood Groups</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </select>
          </div>

          <div class="form-group">
            <label><i class="fa-solid fa-venus-mars"></i> Gender</label>
            <select id="patient-gender-filter" class="form-control">
              <option value="">All Genders</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Other">Other</option>
            </select>
          </div>

          ${user.role === 'Admin' ? `
            <div class="form-group">
              <label><i class="fa-solid fa-archive"></i> Archive Status</label>
              <select id="patient-status-filter" class="form-control">
                <option value="active">Active Only</option>
                <option value="archived">Archived (Soft Deleted)</option>
                <option value="all">All Records</option>
              </select>
            </div>
          ` : ''}

          <div class="form-group" style="display:flex; align-items:flex-end;">
            <button id="reset-filters-btn" class="btn btn-secondary" style="width:100%;">
              <i class="fa-solid fa-rotate-left"></i> Reset
            </button>
          </div>
        </div>
      </div>

      <!-- Patients Table Card -->
      <div class="glass-card" id="patients-table-card">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th class="col-patient-details">Patient Details</th>
                <th class="col-patient-id">Patient ID</th>
                <th class="col-demographics">Demographics</th>
                <th class="col-blood">Blood Group</th>
                <th class="col-physician">Primary Physician</th>
                <th class="col-alerts">Allergies & Conditions</th>
                <th class="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody id="patients-table-body">
              ${renderSkeletonTable(6, 7)}
            </tbody>
          </table>
        </div>

        <!-- Pagination Bar -->
        <div style="padding:1.25rem; display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); flex-wrap:wrap; gap:1rem;">
          <div id="pagination-info" style="font-size:0.88rem; color:var(--text-muted);">
            Showing page 1
          </div>
          <div style="display:flex; gap:0.5rem;" id="pagination-controls">
            <!-- Rendered dynamically -->
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function initPatientsListeners() {
  try {
    doctorsList = await api.getUsers('Doctor');
  } catch (e) {
    doctorsList = [];
  }

  loadPatientsTable();

  // Search filter with debouncing
  const searchInput = document.getElementById('patient-search-filter');
  let debounceTimeout = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        currentFilters.search = e.target.value.trim();
        currentFilters.page = 1;
        loadPatientsTable();
      }, 300);
    });
  }

  // Blood group filter
  const bloodSelect = document.getElementById('patient-blood-filter');
  if (bloodSelect) {
    bloodSelect.addEventListener('change', (e) => {
      currentFilters.blood_group = e.target.value;
      currentFilters.page = 1;
      loadPatientsTable();
    });
  }

  // Gender filter
  const genderSelect = document.getElementById('patient-gender-filter');
  if (genderSelect) {
    genderSelect.addEventListener('change', (e) => {
      currentFilters.gender = e.target.value;
      currentFilters.page = 1;
      loadPatientsTable();
    });
  }

  // Status filter (Admin)
  const statusSelect = document.getElementById('patient-status-filter');
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      currentFilters.status = e.target.value;
      currentFilters.page = 1;
      loadPatientsTable();
    });
  }

  // Reset filters
  const resetBtn = document.getElementById('reset-filters-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (bloodSelect) bloodSelect.value = '';
      if (genderSelect) genderSelect.value = '';
      if (statusSelect) statusSelect.value = 'active';
      currentFilters = { search: '', blood_group: '', gender: '', status: 'active', page: 1, limit: 10 };
      loadPatientsTable();
    });
  }

  // Register New Patient button
  const registerBtn = document.getElementById('open-register-patient-btn');
  if (registerBtn) {
    registerBtn.addEventListener('click', () => {
      openRegisterPatientModal();
    });
  }
}

async function loadPatientsTable() {
  const tbody = document.getElementById('patients-table-body');
  if (!tbody) return;

  tbody.innerHTML = renderSkeletonTable(6, 7);

  try {
    const data = await api.getPatients(currentFilters);
    const patients = data.patients || [];
    const pagination = data.pagination || {};
    const summary = data.summary || {};

    // Update summary stat numbers
    const totalEl = document.getElementById('pat-sum-total');
    const femaleEl = document.getElementById('pat-sum-female');
    const maleEl = document.getElementById('pat-sum-male');
    const allergyEl = document.getElementById('pat-sum-allergies');
    const chronicEl = document.getElementById('pat-sum-chronic');

    if (totalEl) totalEl.textContent = summary.total !== undefined ? summary.total : pagination.total;
    if (femaleEl) femaleEl.textContent = summary.femaleCount !== undefined ? summary.femaleCount : 0;
    if (maleEl) maleEl.textContent = summary.maleCount !== undefined ? summary.maleCount : 0;
    if (allergyEl) allergyEl.textContent = summary.allergyWatchlist !== undefined ? summary.allergyWatchlist : 0;
    if (chronicEl) chronicEl.textContent = summary.chronicCount !== undefined ? summary.chronicCount : 0;

    if (patients.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            ${renderEmptyState(
              'fa-hospital-user',
              'No Patient Records Found',
              'No patients matched your filter criteria. Try resetting filters or register a new patient.',
              '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'reset-filters-btn\').click()"><i class="fa-solid fa-rotate-left"></i> Clear Filters</button>'
            )}
          </td>
        </tr>
      `;
      renderPaginationControls(0, 1, 1);
      return;
    }

    const user = Store.state.user;
    const isAdmin = user.role === 'Admin';

    tbody.innerHTML = patients.map(p => {
      const cleanName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
      const initials = `${p.first_name[0] || ''}${p.last_name[0] || ''}`.toUpperCase();
      const isArchived = p.is_deleted === 1;

      return `
        <tr style="${isArchived ? 'opacity:0.65; background:var(--rose-light);' : ''}">
          <td class="col-patient-details">
            <div style="display:flex; align-items:center; gap:0.85rem; min-width:0;">
              <div class="user-avatar" style="width:40px; height:40px; font-size:0.88rem; flex-shrink:0;">${initials}</div>
              <div style="min-width:0;">
                <a href="#patient/${p.patient_id}" style="font-weight:600; font-size:0.95rem; color:var(--text-main); white-space:nowrap;" title="${cleanName}">
                  ${cleanName}
                </a>
                <div style="font-size:0.78rem; color:var(--text-muted); white-space:nowrap;">${p.phone || 'No phone'}</div>
              </div>
            </div>
          </td>
          <td class="col-patient-id">
            <span class="badge badge-info" style="font-family:monospace; font-size:0.8rem; letter-spacing:0.04em;">
              ${p.patient_id}
            </span>
          </td>
          <td class="col-demographics">
            <div style="font-weight:500; white-space:nowrap;">${p.age !== null ? p.age + ' yrs' : 'N/A'} &bull; ${p.gender}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); white-space:nowrap;">
              ${p.bmi ? `BMI ${p.bmi} (${p.bmiCategory})` : 'BMI not recorded'}
            </div>
          </td>
          <td class="col-blood">
            <span class="badge badge-normal" style="font-weight:700;">${p.blood_group}</span>
          </td>
          <td class="col-physician">
            <div style="font-weight:500; font-size:0.88rem; white-space:nowrap;">${p.assigned_doctor_name || 'Unassigned'}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); white-space:nowrap;">${p.doctor_specialization || ''}</div>
          </td>
          <td class="col-alerts">
            <div style="font-size:0.82rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${p.allergies || 'None'}">
              ${p.allergies && p.allergies !== 'None recorded' ? `<span style="color:var(--rose); font-weight:600;"><i class="fa-solid fa-triangle-exclamation"></i> ${p.allergies}</span>` : '<span style="color:var(--emerald);">None recorded</span>'}
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${p.chronic_conditions || 'None'}">
              ${p.chronic_conditions || 'None'}
            </div>
          </td>
          <td class="col-actions">
            <div style="display:inline-flex; gap:0.4rem;">
              <a href="#patient/${p.patient_id}" class="btn btn-secondary btn-sm" title="Open Patient Chart">
                <i class="fa-regular fa-folder-open"></i> Chart
              </a>
              ${isAdmin && isArchived ? `
                <button class="btn btn-success btn-sm restore-patient-btn" data-id="${p.patient_id}" title="Restore Patient">
                  <i class="fa-solid fa-trash-can-arrow-up"></i>
                </button>
              ` : ''}
              ${isAdmin && !isArchived ? `
                <button class="btn btn-secondary btn-sm delete-patient-btn" data-id="${p.patient_id}" title="Soft Delete (Archive)">
                  <i class="fa-regular fa-trash-can" style="color:var(--rose);"></i>
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    renderPaginationControls(pagination.total, pagination.page, pagination.totalPages);

    tbody.querySelectorAll('.delete-patient-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pId = btn.getAttribute('data-id');
        openConfirm({
          title: 'Archive Patient Record',
          message: `Are you sure you want to soft-delete patient record ${pId}? This record can be restored anytime by an administrator.`,
          confirmText: 'Archive Patient',
          onConfirm: async () => {
            try {
              await api.deletePatient(pId);
              showToast(`Patient ${pId} archived successfully.`, 'success');
              loadPatientsTable();
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
        });
      });
    });

    tbody.querySelectorAll('.restore-patient-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pId = btn.getAttribute('data-id');
        try {
          await api.restorePatient(pId);
          showToast(`Patient ${pId} restored successfully.`, 'success');
          loadPatientsTable();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          ${renderErrorState(err.message, 'pat-retry-btn')}
        </td>
      </tr>
    `;
    const retryBtn = document.getElementById('pat-retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', loadPatientsTable);
  }
}

function renderPaginationControls(total, page, totalPages) {
  const info = document.getElementById('pagination-info');
  const controls = document.getElementById('pagination-controls');
  if (!info || !controls) return;

  info.textContent = `Showing page ${page} of ${totalPages || 1} (${total} total records)`;

  controls.innerHTML = `
    <button class="btn btn-secondary btn-sm prev-page-btn" ${page <= 1 ? 'disabled' : ''}>
      <i class="fa-solid fa-chevron-left"></i> Previous
    </button>
    <button class="btn btn-secondary btn-sm next-page-btn" ${page >= totalPages ? 'disabled' : ''}>
      Next <i class="fa-solid fa-chevron-right"></i>
    </button>
  `;

  const prevBtn = controls.querySelector('.prev-page-btn');
  const nextBtn = controls.querySelector('.next-page-btn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentFilters.page > 1) {
        currentFilters.page--;
        loadPatientsTable();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentFilters.page < totalPages) {
        currentFilters.page++;
        loadPatientsTable();
      }
    });
  }
}

function openRegisterPatientModal() {
  const todayStr = new Date().toISOString().split('T')[0];
  const user = Store.state.user;

  const doctorOptions = doctorsList.map(d => `
    <option value="${d.id}" ${user.role === 'Doctor' && user.id === d.id ? 'selected' : ''}>
      ${d.name} (${d.specialization || 'General'})
    </option>
  `).join('');

  const bodyHtml = `
    <form id="create-patient-form">
      <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
        <div class="form-group">
          <label>First Name *</label>
          <input type="text" id="reg-fname" class="form-control" placeholder="e.g. Eleanor" required>
        </div>
        <div class="form-group">
          <label>Last Name *</label>
          <input type="text" id="reg-lname" class="form-control" placeholder="e.g. Vance" required>
        </div>
      </div>

      <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:1rem;">
        <div class="form-group">
          <label>Date of Birth *</label>
          <input type="date" id="reg-dob" class="form-control" max="${todayStr}" required>
        </div>
        <div class="form-group">
          <label>Gender *</label>
          <select id="reg-gender" class="form-control" required>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>Blood Group *</label>
          <select id="reg-blood" class="form-control" required>
            <option value="A+">A+</option>
            <option value="A-">A-</option>
            <option value="B+">B+</option>
            <option value="B-">B-</option>
            <option value="AB+">AB+</option>
            <option value="AB-">AB-</option>
            <option value="O+">O+</option>
            <option value="O-">O-</option>
          </select>
        </div>
      </div>

      <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
        <div class="form-group">
          <label>Phone Number *</label>
          <input type="tel" id="reg-phone" class="form-control" placeholder="+1 (555) 000-0000" required>
        </div>
        <div class="form-group">
          <label>Email Address</label>
          <input type="email" id="reg-email" class="form-control" placeholder="patient@example.com">
        </div>
      </div>

      <div class="form-group">
        <label>Residential Address</label>
        <input type="text" id="reg-address" class="form-control" placeholder="Street, City, State, ZIP">
      </div>

      <!-- Vitals & Live BMI Preview -->
      <div style="background:var(--primary-light); padding:1rem; border-radius:var(--radius-md); margin-bottom:1.25rem;">
        <div style="font-weight:600; font-size:0.85rem; margin-bottom:0.5rem; color:var(--primary);">
          <i class="fa-solid fa-weight-scale"></i> Initial Clinical Vitals & Live BMI Calculation
        </div>
        <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:1rem;">
          <div class="form-group">
            <label>Height (cm)</label>
            <input type="number" id="reg-height" class="form-control" placeholder="170" min="50" max="250" step="0.5">
          </div>
          <div class="form-group">
            <label>Weight (kg)</label>
            <input type="number" id="reg-weight" class="form-control" placeholder="70" min="20" max="350" step="0.1">
          </div>
          <div class="form-group" style="display:flex; flex-direction:column; justify-content:center;">
            <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Calculated BMI</span>
            <div id="reg-bmi-display" style="font-weight:700; font-size:1.1rem; color:var(--text-main); height:42px; display:flex; align-items:center;">
              --.-
            </div>
          </div>
        </div>
      </div>

      <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
        <div class="form-group">
          <label>Drug & Food Allergies</label>
          <input type="text" id="reg-allergies" class="form-control" placeholder="e.g. Penicillin, Sulfa, Peanuts">
        </div>
        <div class="form-group">
          <label>Chronic Conditions</label>
          <input type="text" id="reg-chronic" class="form-control" placeholder="e.g. Hypertension, Asthma">
        </div>
      </div>

      <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:1rem;">
        <div class="form-group">
          <label>Emergency Contact Name</label>
          <input type="text" id="reg-em-name" class="form-control" placeholder="Full name">
        </div>
        <div class="form-group">
          <label>Emergency Contact Phone</label>
          <input type="tel" id="reg-em-phone" class="form-control" placeholder="Phone number">
        </div>
        <div class="form-group">
          <label>Relation</label>
          <input type="text" id="reg-em-rel" class="form-control" placeholder="e.g. Spouse, Parent">
        </div>
      </div>

      <div class="form-group">
        <label>Assigned Attending Physician</label>
        <select id="reg-doctor" class="form-control">
          <option value="">-- Select Physician --</option>
          ${doctorOptions}
        </select>
      </div>
    </form>
  `;

  const footerHtml = `
    <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
    <button class="btn btn-primary modal-save-btn">
      <i class="fa-solid fa-check"></i> Register Patient Record
    </button>
  `;

  openModal({
    title: 'Register New Patient Profile',
    bodyHtml,
    footerHtml,
    maxWidth: '720px'
  });

  const modalEl = document.getElementById('app-active-modal');
  if (!modalEl) return;

  const hInput = modalEl.querySelector('#reg-height');
  const wInput = modalEl.querySelector('#reg-weight');
  const bmiDisplay = modalEl.querySelector('#reg-bmi-display');

  const updateBmi = () => {
    const h = parseFloat(hInput.value);
    const w = parseFloat(wInput.value);
    if (h > 0 && w > 0) {
      const hm = h / 100;
      const bmi = Math.round((w / (hm * hm)) * 10) / 10;
      let cat = 'Normal';
      if (bmi < 18.5) cat = 'Underweight';
      else if (bmi < 25) cat = 'Normal';
      else if (bmi < 30) cat = 'Overweight';
      else cat = 'Obesity';
      bmiDisplay.textContent = `${bmi} (${cat})`;
    } else {
      bmiDisplay.textContent = '--.-';
    }
  };

  hInput.addEventListener('input', updateBmi);
  wInput.addEventListener('input', updateBmi);

  const saveBtn = modalEl.querySelector('.modal-save-btn');
  modalEl.querySelector('.modal-cancel-btn').addEventListener('click', closeModal);
  saveBtn.addEventListener('click', async () => {
    const fname = modalEl.querySelector('#reg-fname').value.trim();
    const lname = modalEl.querySelector('#reg-lname').value.trim();
    const dob = modalEl.querySelector('#reg-dob').value;
    const gender = modalEl.querySelector('#reg-gender').value;
    const blood = modalEl.querySelector('#reg-blood').value;
    const phone = modalEl.querySelector('#reg-phone').value.trim();
    const email = modalEl.querySelector('#reg-email').value.trim();
    const address = modalEl.querySelector('#reg-address').value.trim();
    const height = modalEl.querySelector('#reg-height').value;
    const weight = modalEl.querySelector('#reg-weight').value;
    const allergies = modalEl.querySelector('#reg-allergies').value.trim();
    const chronic = modalEl.querySelector('#reg-chronic').value.trim();
    const emName = modalEl.querySelector('#reg-em-name').value.trim();
    const emPhone = modalEl.querySelector('#reg-em-phone').value.trim();
    const emRel = modalEl.querySelector('#reg-em-rel').value.trim();
    const docId = modalEl.querySelector('#reg-doctor').value;

    if (!fname || !lname || !dob || !phone) {
      showToast('Please fill in required fields: First Name, Last Name, DOB, Phone.', 'warning');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registering...';

    try {
      const created = await api.createPatient({
        first_name: fname,
        last_name: lname,
        dob,
        gender,
        blood_group: blood,
        phone,
        email,
        address,
        height_cm: height || null,
        weight_kg: weight || null,
        allergies,
        chronic_conditions: chronic,
        emergency_contact_name: emName,
        emergency_contact_phone: emPhone,
        emergency_contact_relation: emRel,
        assigned_doctor_id: docId ? parseInt(docId, 10) : null
      });

      showToast(`Patient registered! Assigned ID: ${created.patient_id}`, 'success');
      closeModal();
      loadPatientsTable();
    } catch (err) {
      showToast(err.message, 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Register Patient Record';
    }
  });
}
