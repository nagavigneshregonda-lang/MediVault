/**
 * Facility-wide Diagnostic Laboratory & Specimen Management View with Summary Stats & Overdue Indicators
 */

import api from '../api.js';
import Store from '../store.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { formatDate, renderSkeletonTable, renderEmptyState, renderErrorState } from '../utils.js';

let testFilters = {
  status: '',
  category: '',
  search: '',
  page: 1,
  limit: 15
};

export async function renderTestsView() {
  const user = Store.state.user;

  return `
    <div class="content-wrapper">
      <div class="page-header">
        <div class="page-title-group">
          <h1>
            <i class="fa-solid fa-flask-vial" style="color:var(--primary); font-size:1.5rem;"></i>
            <span>Diagnostic Laboratory Operations</span>
          </h1>
          <div class="page-subtitle">Centralized clinical specimen queue, quantitative analysis, and automated warning flags</div>
        </div>
      </div>

      <!-- Summary Stat Cards -->
      <div class="stats-grid" id="tests-summary-grid" style="margin-bottom:1.5rem;">
        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--amber-light); color:var(--amber);">
              <i class="fa-solid fa-clock"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="test-sum-pending">--</div>
              <div class="stat-label">Pending Collection</div>
              <div class="stat-badge-row">
                <span class="stat-trend warning"><i class="fa-solid fa-hourglass-start"></i> Ordered Queue</span>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--indigo-light); color:var(--indigo);">
              <i class="fa-solid fa-vial"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="test-sum-inprogress">--</div>
              <div class="stat-label">In Progress</div>
              <div class="stat-badge-row">
                <span class="stat-trend neutral"><i class="fa-solid fa-spinner"></i> Processing</span>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:var(--emerald-light); color:var(--emerald);">
              <i class="fa-solid fa-vial-circle-check"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="test-sum-completed">--</div>
              <div class="stat-label">Completed Tests</div>
              <div class="stat-badge-row">
                <span class="stat-trend positive"><i class="fa-solid fa-check"></i> Verified</span>
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
              <div class="stat-value" id="test-sum-critical">--</div>
              <div class="stat-label">Critical Warnings</div>
              <div class="stat-badge-row">
                <span class="stat-trend critical"><i class="fa-solid fa-triangle-exclamation"></i> Immediate Alert</span>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card stat-card">
          <div class="stat-left">
            <div class="stat-icon" style="background:rgba(234, 88, 12, 0.15); color:#ea580c;">
              <i class="fa-solid fa-clock-rotate-left"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value" id="test-sum-overdue">--</div>
              <div class="stat-label">Overdue Tests</div>
              <div class="stat-badge-row">
                <span class="stat-trend warning"><i class="fa-solid fa-triangle-exclamation"></i> &gt; 7 Days</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Filters Bar with Aligned Buttons -->
      <div class="glass-card" style="padding:1.25rem; margin-bottom:1.5rem;">
        <div class="filter-bar-grid">
          <div class="form-group">
            <label><i class="fa-solid fa-magnifying-glass"></i> Search Diagnostics</label>
            <input type="text" id="tests-search-input" class="form-control" placeholder="Search test name, patient ID...">
          </div>

          <div class="form-group">
            <label><i class="fa-solid fa-list-check"></i> Workflow Status</label>
            <select id="tests-status-select" class="form-control">
              <option value="">All Statuses</option>
              <option value="Ordered">Ordered (Pending)</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div class="form-group">
            <label><i class="fa-solid fa-layer-group"></i> Category</label>
            <select id="tests-category-select" class="form-control">
              <option value="">All Categories</option>
              <option value="Blood">Blood (Hematology / Chem)</option>
              <option value="Imaging">Imaging (X-Ray / MRI / Echo)</option>
              <option value="Urine">Urinalysis</option>
              <option value="Stool">Stool (Microbiology)</option>
              <option value="Cardiology">Cardiology (ECG)</option>
              <option value="Pathology">Pathology & Biopsy</option>
              <option value="Other">Other Diagnostics</option>
            </select>
          </div>

          <div class="form-group" style="display:flex; align-items:flex-end;">
            <button id="tests-reset-btn" class="btn btn-secondary" style="width:100%;">
              <i class="fa-solid fa-rotate-left"></i> Reset
            </button>
          </div>
        </div>
      </div>

      <!-- Tests Table -->
      <div class="glass-card">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Diagnostic Test</th>
                <th>Patient Details</th>
                <th>Ordered By</th>
                <th>Ordered Date</th>
                <th>Result Value</th>
                <th>Reference Range</th>
                <th>Clinical Flag</th>
                <th>Status</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody id="all-tests-table-body">
              ${renderSkeletonTable(6, 9)}
            </tbody>
          </table>
        </div>

        <div style="padding:1.25rem; display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); flex-wrap:wrap; gap:1rem;">
          <div id="tests-pagination-info" style="font-size:0.88rem; color:var(--text-muted);">Showing page 1</div>
          <div style="display:flex; gap:0.5rem;" id="tests-pagination-controls"></div>
        </div>
      </div>
    </div>
  `;
}

export function initTestsListeners() {
  loadAllTestsTable();

  const searchInput = document.getElementById('tests-search-input');
  let debounce = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        testFilters.search = e.target.value.trim();
        testFilters.page = 1;
        loadAllTestsTable();
      }, 300);
    });
  }

  const statusSelect = document.getElementById('tests-status-select');
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      testFilters.status = e.target.value;
      testFilters.page = 1;
      loadAllTestsTable();
    });
  }

  const catSelect = document.getElementById('tests-category-select');
  if (catSelect) {
    catSelect.addEventListener('change', (e) => {
      testFilters.category = e.target.value;
      testFilters.page = 1;
      loadAllTestsTable();
    });
  }

  const resetBtn = document.getElementById('tests-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (statusSelect) statusSelect.value = '';
      if (catSelect) catSelect.value = '';
      testFilters = { status: '', category: '', search: '', page: 1, limit: 15 };
      loadAllTestsTable();
    });
  }
}

async function loadAllTestsTable() {
  const tbody = document.getElementById('all-tests-table-body');
  if (!tbody) return;

  tbody.innerHTML = renderSkeletonTable(6, 9);

  try {
    const data = await api.getAllTests(testFilters);
    const tests = data.tests || [];
    const pagination = data.pagination || {};
    const summary = data.summary || {};

    // Update summary stat numbers
    const pendingEl = document.getElementById('test-sum-pending');
    const inProgEl = document.getElementById('test-sum-inprogress');
    const compEl = document.getElementById('test-sum-completed');
    const critEl = document.getElementById('test-sum-critical');
    const overdueEl = document.getElementById('test-sum-overdue');

    if (pendingEl) pendingEl.textContent = summary.pending !== undefined ? summary.pending : 0;
    if (inProgEl) inProgEl.textContent = summary.inProgress !== undefined ? summary.inProgress : 0;
    if (compEl) compEl.textContent = summary.completed !== undefined ? summary.completed : 0;
    if (critEl) critEl.textContent = summary.critical !== undefined ? summary.critical : 0;
    if (overdueEl) overdueEl.textContent = summary.overdue !== undefined ? summary.overdue : 0;

    if (tests.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9">
            ${renderEmptyState(
              'fa-vial',
              'No Diagnostic Tests Found',
              'No test orders match your selected filters. Try clearing filters or checking other categories.',
              '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'tests-reset-btn\').click()"><i class="fa-solid fa-rotate-left"></i> Reset Filters</button>'
            )}
          </td>
        </tr>
      `;
      return;
    }

    const user = Store.state.user;
    const canProcess = user.role === 'Admin' || user.role === 'Doctor' || user.role === 'Lab Technician';

    tbody.innerHTML = tests.map(t => {
      const formattedDate = formatDate(t.ordered_date);
      return `
        <tr>
          <td>
            <div style="font-weight:700; color:var(--text-main); font-size:0.95rem;">${t.test_name}</div>
            <span class="badge badge-info" style="font-size:0.75rem; margin-top:2px;">${t.category}</span>
          </td>
          <td>
            <a href="#patient/${t.patient_id}" style="font-weight:600; color:var(--text-main);" title="${t.first_name} ${t.last_name}">
              ${t.first_name} ${t.last_name}
            </a>
            <div style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${t.patient_id}</div>
          </td>
          <td>
            <div style="font-weight:500;">${t.ordered_by_doctor_name || 'Attending Physician'}</div>
          </td>
          <td style="font-size:0.85rem; color:var(--text-muted); white-space:nowrap;">
            ${formattedDate}
            ${t.is_overdue ? `<div style="margin-top:2px;"><span class="badge badge-overdue"><i class="fa-solid fa-clock"></i> Overdue</span></div>` : ''}
          </td>
          <td>
            ${t.result_value ? `
              <div style="font-weight:700; color:var(--text-main); font-size:1rem;">
                ${t.result_value} <span style="font-weight:normal; font-size:0.8rem; color:var(--text-muted);">${t.unit || ''}</span>
              </div>
            ` : '<span style="color:var(--text-muted); font-style:italic;">Pending analysis</span>'}
          </td>
          <td><span style="font-family:monospace; font-size:0.85rem;">${t.reference_range || 'N/A'}</span></td>
          <td><span class="badge ${getFlagBadgeClass(t.flag)}">${t.flag}</span></td>
          <td><span class="badge ${getStatusBadgeClass(t.status)}">${t.status}</span></td>
          <td style="text-align:right; white-space:nowrap;">
            ${canProcess ? `
              <button class="btn btn-primary btn-sm enter-results-btn" data-id="${t.id}" title="Enter Lab Results">
                <i class="fa-solid fa-pen-to-square"></i> Results
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');

    // Pagination controls
    const info = document.getElementById('tests-pagination-info');
    const controls = document.getElementById('tests-pagination-controls');
    if (info && controls) {
      info.textContent = `Showing page ${pagination.page} of ${pagination.totalPages || 1} (${pagination.total} tests)`;
      controls.innerHTML = `
        <button class="btn btn-secondary btn-sm" ${pagination.page <= 1 ? 'disabled' : ''} id="tests-prev-btn">
          <i class="fa-solid fa-chevron-left"></i> Previous
        </button>
        <button class="btn btn-secondary btn-sm" ${pagination.page >= pagination.totalPages ? 'disabled' : ''} id="tests-next-btn">
          Next <i class="fa-solid fa-chevron-right"></i>
        </button>
      `;
      const prev = document.getElementById('tests-prev-btn');
      const next = document.getElementById('tests-next-btn');
      if (prev) prev.addEventListener('click', () => { testFilters.page--; loadAllTestsTable(); });
      if (next) next.addEventListener('click', () => { testFilters.page++; loadAllTestsTable(); });
    }

    // Attach enter results handlers
    tbody.querySelectorAll('.enter-results-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tId = btn.getAttribute('data-id');
        const test = tests.find(item => String(item.id) === String(tId));
        if (test) openGlobalUpdateTestModal(test);
      });
    });
  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9">
          ${renderErrorState(err.message, 'tests-retry-btn')}
        </td>
      </tr>
    `;
    const retry = document.getElementById('tests-retry-btn');
    if (retry) retry.addEventListener('click', loadAllTestsTable);
  }
}

function openGlobalUpdateTestModal(test) {
  const bodyHtml = `
    <form id="global-test-modal-form">
      <div style="background:var(--primary-light); padding:1rem; border-radius:var(--radius-md); margin-bottom:1.25rem;">
        <div style="font-weight:700; font-size:1.1rem; color:var(--primary);">${test.test_name} (${test.category})</div>
        <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.25rem;">
          Patient: <strong>${test.first_name} ${test.last_name} (${test.patient_id})</strong> &bull; Ordered: ${formatDate(test.ordered_date)}
        </div>
      </div>

      <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
        <div class="form-group">
          <label>Result Value *</label>
          <input type="text" id="g-test-val" class="form-control" value="${test.result_value || ''}" placeholder="e.g. 5.8, 140, Negative" required>
        </div>
        <div class="form-group">
          <label>Measurement Unit</label>
          <input type="text" id="g-test-unit" class="form-control" value="${test.unit || ''}" placeholder="e.g. mg/dL, %">
        </div>
      </div>

      <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
        <div class="form-group">
          <label>Normal Reference Range</label>
          <input type="text" id="g-test-ref" class="form-control" value="${test.reference_range || ''}" placeholder="e.g. 70 - 100, 3.5 - 5.0">
        </div>
        <div class="form-group">
          <label>Clinical Flag</label>
          <select id="g-test-flag" class="form-control">
            <option value="">-- Auto-Calculate from Range --</option>
            <option value="Normal" ${test.flag === 'Normal' ? 'selected' : ''}>Normal</option>
            <option value="High" ${test.flag === 'High' ? 'selected' : ''}>High</option>
            <option value="Low" ${test.flag === 'Low' ? 'selected' : ''}>Low</option>
            <option value="Critical" ${test.flag === 'Critical' ? 'selected' : ''}>Critical</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label>Diagnostic Status</label>
        <select id="g-test-status" class="form-control">
          <option value="In Progress" ${test.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
          <option value="Completed" ${test.status === 'Completed' || !test.status ? 'selected' : ''}>Completed</option>
          <option value="Ordered" ${test.status === 'Ordered' ? 'selected' : ''}>Ordered</option>
          <option value="Cancelled" ${test.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
      </div>

      <div class="form-group">
        <label>Technician Findings / Notes</label>
        <textarea id="g-test-notes" class="form-control" rows="2" placeholder="Clinical observations...">${test.notes || ''}</textarea>
      </div>
    </form>
  `;

  openModal({
    title: 'Process Laboratory Specimen & Enter Results',
    bodyHtml,
    footerHtml: `
      <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
      <button class="btn btn-primary modal-save-btn"><i class="fa-solid fa-check"></i> Release Verified Result</button>
    `,
    maxWidth: '650px'
  });

  const modalEl = document.getElementById('app-active-modal');
  if (!modalEl) return;

  const saveBtn = modalEl.querySelector('.modal-save-btn');
  modalEl.querySelector('.modal-cancel-btn').addEventListener('click', closeModal);
  saveBtn.addEventListener('click', async () => {
    const val = modalEl.querySelector('#g-test-val').value.trim();
    const unit = modalEl.querySelector('#g-test-unit').value.trim();
    const ref = modalEl.querySelector('#g-test-ref').value.trim();
    const flag = modalEl.querySelector('#g-test-flag').value;
    const status = modalEl.querySelector('#g-test-status').value;
    const notes = modalEl.querySelector('#g-test-notes').value.trim();

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      await api.updateTestResult(test.id, {
        result_value: val || null,
        unit: unit || null,
        reference_range: ref || null,
        flag: flag || undefined,
        status,
        notes: notes || null
      });

      showToast(`Specimen result saved for ${test.test_name}!`, 'success');
      closeModal();
      loadAllTestsTable();
    } catch (err) {
      showToast(err.message, 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Release Verified Result';
    }
  });
}

function getFlagBadgeClass(flag) {
  switch (flag) {
    case 'Normal': return 'badge-normal';
    case 'High': return 'badge-high';
    case 'Low': return 'badge-low';
    case 'Critical': return 'badge-critical';
    default: return 'badge-pending';
  }
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'Completed': return 'badge-normal';
    case 'In Progress': return 'badge-high';
    case 'Ordered': return 'badge-pending';
    default: return 'badge-critical';
  }
}
