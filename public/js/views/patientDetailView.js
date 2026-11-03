/**
 * Comprehensive Patient Chart & 5-Tab Longitudinal Record View
 */

import api from '../api.js';
import Store from '../store.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal, openConfirm } from '../components/modal.js';
import { formatDate, formatDateTime, renderSkeletonTable, renderEmptyState, renderErrorState } from '../utils.js';

let activePatient = null;
let currentTab = 'overview';
let patientTrendChart = null;
let availableDoctors = [];

export async function renderPatientDetailView(patientId) {
  const user = Store.state.user;

  return `
    <div class="content-wrapper" id="patient-detail-container">
      <!-- Top Breadcrumb & Back -->
      <div style="margin-bottom: 1.25rem; display: flex; align-items: center; justify-content: space-between; flex-wrap:wrap; gap:0.5rem;">
        <a href="${user.role === 'Patient' ? '#dashboard' : '#patients'}" class="btn btn-secondary btn-sm">
          <i class="fa-solid fa-arrow-left"></i> ${user.role === 'Patient' ? 'Back to Dashboard' : 'Back to Patients Directory'}
        </a>
        <div style="display:flex; gap:0.5rem;" id="patient-header-actions">
          <!-- Dynamic action buttons -->
        </div>
      </div>

      <!-- Patient Header Banner Card -->
      <div class="glass-card" style="padding:1.75rem; margin-bottom:1.5rem;" id="patient-banner-card">
        <div style="display:flex; align-items:center; gap:1.5rem; flex-wrap:wrap;">
          <div class="user-avatar" id="banner-avatar" style="width:72px; height:72px; font-size:1.8rem; box-shadow:var(--shadow-md);">
            --
          </div>
          <div style="flex:1; min-width:260px;">
            <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-bottom:0.35rem;">
              <h1 id="banner-name" style="font-size:1.85rem; margin:0;">Loading Patient...</h1>
              <span class="badge badge-info" id="banner-pid" style="font-family:monospace; font-size:0.9rem;">----</span>
              <span class="badge badge-normal" id="banner-blood">--</span>
            </div>
            <div style="display:flex; gap:1.25rem; color:var(--text-muted); font-size:0.92rem; flex-wrap:wrap;">
              <span id="banner-demographics"><i class="fa-solid fa-cake-candles"></i> Age: -- &bull; Gender: --</span>
              <span id="banner-phone"><i class="fa-solid fa-phone"></i> --</span>
              <span id="banner-doctor"><i class="fa-solid fa-user-doctor"></i> Doctor: --</span>
            </div>
          </div>
        </div>

        <!-- Allergy Alert Banner -->
        <div id="patient-allergy-alert" style="display:none; margin-top:1.25rem; background:var(--rose-light); border:1px solid rgba(239, 68, 68, 0.3); border-radius:var(--radius-md); padding:0.85rem 1.25rem; color:#991b1b; align-items:center; gap:0.75rem;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:1.2rem; flex-shrink:0;"></i>
          <div style="font-size:0.9rem;">
            <strong>High-Risk Patient Allergy Alert:</strong> <span id="allergy-alert-text">None</span>.
            Prescribing conflicting substances will trigger automatic safety checks.
          </div>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="tabs-nav" id="patient-tabs-nav">
        <button class="tab-btn active" data-tab="overview">
          <i class="fa-solid fa-id-card"></i> Clinical Overview
        </button>
        <button class="tab-btn" data-tab="history">
          <i class="fa-solid fa-timeline"></i> Medical History
        </button>
        <button class="tab-btn" data-tab="prescriptions">
          <i class="fa-solid fa-prescription-bottle-medical"></i> Prescriptions & Rx
        </button>
        <button class="tab-btn" data-tab="tests">
          <i class="fa-solid fa-flask-vial"></i> Diagnostic Lab Tests
        </button>
        <button class="tab-btn" data-tab="access">
          <i class="fa-solid fa-shield-halved"></i> Authorized Access Grants
        </button>
      </div>

      <!-- Tab Content Area -->
      <div id="patient-tab-content">
        <!-- Rendered dynamically -->
      </div>
    </div>
  `;
}

export async function initPatientDetailListeners(patientId) {
  try {
    activePatient = await api.getPatient(patientId);
    Store.setCurrentPatient(activePatient);
    availableDoctors = await api.getDoctorsForGrant();
  } catch (err) {
    showToast(err.message || 'Access denied or patient not found.', 'error');
    const container = document.getElementById('patient-detail-container');
    if (container) {
      container.innerHTML = `
        <div class="glass-card" style="padding:3rem; text-align:center;">
          <div style="font-size:3rem; color:var(--rose); margin-bottom:1rem;"><i class="fa-solid fa-shield-xmark"></i></div>
          <h2>Access Denied or Patient Not Found</h2>
          <p style="color:var(--text-muted); max-width:500px; margin:0.75rem auto 1.5rem;">
            ${err.message || 'You do not have active physician authorization or credentials to inspect this patient chart.'}
          </p>
          <a href="#dashboard" class="btn btn-primary"><i class="fa-solid fa-house"></i> Return to Dashboard</a>
        </div>
      `;
    }
    return;
  }

  populateHeaderBanner(activePatient);
  setupTabs();
  switchTab(currentTab);
}

function populateHeaderBanner(p) {
  const initials = `${p.first_name[0] || ''}${p.last_name[0] || ''}`.toUpperCase();
  const avatar = document.getElementById('banner-avatar');
  const name = document.getElementById('banner-name');
  const pid = document.getElementById('banner-pid');
  const blood = document.getElementById('banner-blood');
  const demo = document.getElementById('banner-demographics');
  const phone = document.getElementById('banner-phone');
  const doc = document.getElementById('banner-doctor');
  const allergyAlert = document.getElementById('patient-allergy-alert');
  const allergyText = document.getElementById('allergy-alert-text');

  if (avatar) avatar.textContent = initials;
  if (name) name.textContent = `${p.first_name} ${p.last_name}`;
  if (pid) pid.textContent = p.patient_id;
  if (blood) blood.textContent = `Blood: ${p.blood_group}`;
  if (demo) demo.innerHTML = `<i class="fa-solid fa-cake-candles"></i> Age: ${p.age !== null ? p.age : 'N/A'} yrs &bull; Gender: ${p.gender}`;
  if (phone) phone.innerHTML = `<i class="fa-solid fa-phone"></i> ${p.phone}`;
  if (doc) doc.innerHTML = `<i class="fa-solid fa-user-doctor"></i> Doctor: ${p.doctor ? p.doctor.name : 'Unassigned'}`;

  if (p.allergies && p.allergies.trim()) {
    if (allergyAlert) allergyAlert.style.display = 'flex';
    if (allergyText) allergyText.textContent = p.allergies;
  }
}

function setupTabs() {
  const tabBtns = document.querySelectorAll('#patient-tabs-nav .tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      currentTab = tab;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  const contentArea = document.getElementById('patient-tab-content');
  if (!contentArea) return;

  if (tab === 'overview') {
    renderOverviewTab(contentArea);
  } else if (tab === 'history') {
    renderHistoryTab(contentArea);
  } else if (tab === 'prescriptions') {
    renderPrescriptionsTab(contentArea);
  } else if (tab === 'tests') {
    renderTestsTab(contentArea);
  } else if (tab === 'access') {
    renderAccessTab(contentArea);
  }
}

/* ==============================================================================
   TAB 1: CLINICAL OVERVIEW
   ============================================================================== */
async function renderOverviewTab(container) {
  const p = activePatient;
  const bmiInfo = p.bmi ? `${p.bmi} (${p.bmiCategory})` : 'Not recorded';

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:1.5rem; margin-bottom:1.5rem;">
      <!-- Demographics & Physical Card -->
      <div class="glass-card" style="padding:1.5rem;">
        <h3 style="font-size:1.1rem; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem;">
          <i class="fa-solid fa-id-card" style="color:var(--primary);"></i>
          <span>Demographics & Contact Details</span>
        </h3>
        <div style="display:flex; flex-direction:column; gap:0.75rem; font-size:0.92rem;">
          <div><strong style="color:var(--text-muted);">Date of Birth:</strong> ${formatDate(p.dob)} (${p.age} years old)</div>
          <div><strong style="color:var(--text-muted);">Gender:</strong> ${p.gender}</div>
          <div><strong style="color:var(--text-muted);">Blood Group:</strong> <span class="badge badge-normal">${p.blood_group}</span></div>
          <div><strong style="color:var(--text-muted);">Email:</strong> ${p.email || 'Not provided'}</div>
          <div><strong style="color:var(--text-muted);">Phone:</strong> ${p.phone}</div>
          <div><strong style="color:var(--text-muted);">Address:</strong> ${p.address || 'Not recorded'}</div>
        </div>
      </div>

      <!-- Vitals & BMI Calculator Display -->
      <div class="glass-card" style="padding:1.5rem;">
        <h3 style="font-size:1.1rem; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem;">
          <i class="fa-solid fa-heart-pulse" style="color:var(--emerald);"></i>
          <span>Physical Vitals & Body Mass Index</span>
        </h3>
        <div style="display:flex; flex-direction:column; gap:0.75rem; font-size:0.92rem;">
          <div><strong style="color:var(--text-muted);">Height:</strong> ${p.height_cm ? p.height_cm + ' cm' : 'N/A'}</div>
          <div><strong style="color:var(--text-muted);">Weight:</strong> ${p.weight_kg ? p.weight_kg + ' kg' : 'N/A'}</div>
          <div><strong style="color:var(--text-muted);">Calculated BMI:</strong> <span class="badge badge-info" style="font-size:0.85rem;">${bmiInfo}</span></div>
          <div style="margin-top:0.5rem; padding:0.75rem; border-radius:var(--radius-md); background:var(--bg-primary); font-size:0.82rem; color:var(--text-muted);">
            <i class="fa-solid fa-circle-info"></i> BMI categories: Normal (18.5 - 24.9), Overweight (25 - 29.9), Obesity (≥ 30).
          </div>
        </div>
      </div>

      <!-- Chronic Conditions & Allergies Card -->
      <div class="glass-card" style="padding:1.5rem;">
        <h3 style="font-size:1.1rem; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem;">
          <i class="fa-solid fa-notes-medical" style="color:var(--amber);"></i>
          <span>Clinical Alerts & Conditions</span>
        </h3>
        <div style="display:flex; flex-direction:column; gap:0.75rem; font-size:0.92rem;">
          <div>
            <strong style="color:var(--text-muted); display:block; margin-bottom:0.2rem;">Recorded Allergies:</strong>
            ${p.allergies ? `<span class="badge badge-critical" style="font-size:0.82rem;"><i class="fa-solid fa-triangle-exclamation"></i> ${p.allergies}</span>` : '<span style="color:var(--emerald);">None reported</span>'}
          </div>
          <div>
            <strong style="color:var(--text-muted); display:block; margin-bottom:0.2rem;">Chronic Conditions:</strong>
            ${p.chronic_conditions ? `<span>${p.chronic_conditions}</span>` : '<span>None reported</span>'}
          </div>
        </div>
      </div>

      <!-- Emergency Contact Card -->
      <div class="glass-card" style="padding:1.5rem;">
        <h3 style="font-size:1.1rem; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem;">
          <i class="fa-solid fa-phone-volume" style="color:var(--rose);"></i>
          <span>Emergency Contact</span>
        </h3>
        <div style="display:flex; flex-direction:column; gap:0.75rem; font-size:0.92rem;">
          <div><strong style="color:var(--text-muted);">Contact Name:</strong> ${p.emergency_contact_name || 'Not on file'}</div>
          <div><strong style="color:var(--text-muted);">Telephone:</strong> ${p.emergency_contact_phone || 'Not on file'}</div>
          <div><strong style="color:var(--text-muted);">Relationship:</strong> ${p.emergency_contact_relation || 'Not specified'}</div>
        </div>
      </div>
    </div>

    <!-- Health & Lab Trends Chart Card -->
    <div class="glass-card" style="padding:1.75rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
        <h3 style="font-size:1.15rem; display:flex; align-items:center; gap:0.5rem;">
          <i class="fa-solid fa-chart-line" style="color:var(--primary);"></i>
          <span>Longitudinal Diagnostic Lab Trends</span>
        </h3>
        <span class="badge badge-info">Chart View</span>
      </div>
      <div style="position:relative; height:280px;" id="patient-trend-chart-box">
        <canvas id="patient-trend-canvas"></canvas>
      </div>
    </div>
  `;

  // Load trends for chart
  try {
    const trends = await api.getPatientTrend(p.patient_id);
    initPatientTrendChart(trends);
  } catch (err) {
    console.error('Failed to load patient trends:', err);
  }
}

function initPatientTrendChart(trends) {
  if (patientTrendChart) {
    patientTrendChart.destroy();
    patientTrendChart = null;
  }

  const canvas = document.getElementById('patient-trend-canvas');
  if (!canvas || typeof Chart === 'undefined') return;

  const validTrends = (trends || []).filter(t => !isNaN(parseFloat(t.result_value)));

  if (validTrends.length === 0) {
    const box = document.getElementById('patient-trend-chart-box');
    if (box) {
      box.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-muted);">No sequential quantitative lab results recorded yet.</div>`;
    }
    return;
  }

  const labels = validTrends.map(t => `${t.test_name.split(' ')[0]} (${formatDate(t.completed_date) || 'Recent'})`);
  const values = validTrends.map(t => parseFloat(t.result_value));

  const isDark = Store.state.theme === 'dark';
  const textColor = isDark ? '#cbd5e1' : '#64748b';

  patientTrendChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Result Value',
        data: values,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        fill: true,
        tension: 0.3,
        borderWidth: 2.5,
        pointBackgroundColor: '#10b981',
        pointRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: textColor }, grid: { display: false } },
        y: { ticks: { color: textColor }, grid: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' } }
      }
    }
  });
}

/* ==============================================================================
   TAB 2: MEDICAL HISTORY TIMELINE
   ============================================================================== */
async function renderHistoryTab(container) {
  const user = Store.state.user;
  const canAdd = user.role === 'Admin' || user.role === 'Doctor';

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
      <div>
        <h3 style="font-size:1.25rem;">Medical History Timeline</h3>
        <p style="color:var(--text-muted); font-size:0.88rem;">Chronological record of diagnoses, clinical visits, surgeries, and vaccinations</p>
      </div>
      ${canAdd ? `
        <button id="add-history-entry-btn" class="btn btn-primary">
          <i class="fa-solid fa-plus"></i> Add Timeline Entry
        </button>
      ` : ''}
    </div>

    <div class="glass-card" style="padding:2rem;">
      <div class="timeline" id="history-timeline-list">
        <div style="text-align:center; padding:1.5rem; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading timeline...</div>
      </div>
    </div>
  `;

  loadHistoryTimeline();

  const addBtn = container.querySelector('#add-history-entry-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => openAddHistoryModal());
  }
}

async function loadHistoryTimeline() {
  const timelineEl = document.getElementById('history-timeline-list');
  if (!timelineEl) return;

  try {
    const history = await api.getMedicalHistory(activePatient.patient_id);
    const user = Store.state.user;
    const canModify = user.role === 'Admin' || user.role === 'Doctor';

    if (!history || history.length === 0) {
      timelineEl.innerHTML = renderEmptyState('No medical history records catalogued yet.', 'New diagnoses or clinical visits added will build the longitudinal timeline.');
      return;
    }

    timelineEl.innerHTML = history.map(item => {
      let icon = 'fa-notes-medical';
      if (item.record_type === 'Surgery') icon = 'fa-syringe';
      else if (item.record_type === 'Vaccination') icon = 'fa-shield-virus';
      else if (item.record_type === 'Hospitalization') icon = 'fa-hospital';
      else if (item.record_type === 'Visit') icon = 'fa-user-doctor';

      return `
        <div class="timeline-item">
          <div class="timeline-marker">
            <i class="fa-solid ${icon}" style="font-size:0.65rem; color:var(--primary);"></i>
          </div>
          <div class="timeline-content">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.4rem; flex-wrap:wrap; gap:0.5rem;">
              <div>
                <span class="badge ${getSeverityBadgeClass(item.severity)}" style="margin-right:0.5rem;">${item.severity}</span>
                <span style="font-weight:700; font-size:1.05rem;">${item.title}</span>
              </div>
              <div style="display:flex; align-items:center; gap:0.6rem;">
                <span style="font-size:0.85rem; color:var(--text-muted); font-weight:500;">
                  <i class="fa-regular fa-calendar"></i> ${formatDate(item.record_date)}
                </span>
                ${canModify ? `
                  <button class="btn btn-secondary btn-sm delete-history-btn" data-id="${item.id}" style="padding:0.25rem 0.5rem;" title="Delete Record">
                    <i class="fa-regular fa-trash-can" style="color:var(--rose);"></i>
                  </button>
                ` : ''}
              </div>
            </div>

            <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:0.6rem;">
              <span style="font-weight:600; color:var(--text-main);"><i class="fa-solid fa-user-doctor"></i> ${item.doctor_name || 'Attending Physician'}</span>
              ${item.facility ? ` &bull; <span>${item.facility}</span>` : ''}
            </div>

            ${item.notes ? `<p style="font-size:0.92rem; line-height:1.5; color:var(--text-main);">${item.notes}</p>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Attach delete handlers
    timelineEl.querySelectorAll('.delete-history-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hId = btn.getAttribute('data-id');
        openConfirm({
          title: 'Delete History Entry',
          message: 'Are you sure you want to delete this clinical history entry? This will be recorded in the audit trail.',
          onConfirm: async () => {
            try {
              await api.deleteMedicalHistory(activePatient.patient_id, hId);
              showToast('History entry deleted.', 'success');
              loadHistoryTimeline();
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
        });
      });
    });
  } catch (err) {
    timelineEl.innerHTML = renderErrorState('Failed to load medical history: ' + err.message, 'loadHistoryTimeline()');
  }
}

function getSeverityBadgeClass(sev) {
  switch (sev) {
    case 'Critical': return 'badge-critical';
    case 'Severe': return 'badge-critical';
    case 'Moderate': return 'badge-high';
    case 'Mild': return 'badge-low';
    default: return 'badge-normal';
  }
}

function openAddHistoryModal() {
  const todayStr = new Date().toISOString().split('T')[0];
  const user = Store.state.user;

  const bodyHtml = `
    <form id="add-history-form">
      <div class="form-row">
        <div class="form-group">
          <label>Record Date *</label>
          <input type="date" id="hist-date" class="form-control" value="${todayStr}" required>
        </div>
        <div class="form-group">
          <label>Record Type *</label>
          <select id="hist-type" class="form-control" required>
            <option value="Diagnosis">Diagnosis</option>
            <option value="Visit">Clinical Visit</option>
            <option value="Surgery">Surgery / Procedure</option>
            <option value="Vaccination">Vaccination</option>
            <option value="Hospitalization">Hospitalization</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label>Title / Primary Diagnosis *</label>
        <input type="text" id="hist-title" class="form-control" placeholder="e.g. Essential Hypertension Follow-up" required>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Clinical Severity *</label>
          <select id="hist-severity" class="form-control" required>
            <option value="Routine">Routine</option>
            <option value="Mild">Mild</option>
            <option value="Moderate">Moderate</option>
            <option value="Severe">Severe</option>
            <option value="Critical">Critical</option>
          </select>
        </div>
        <div class="form-group">
          <label>Attending Doctor Name</label>
          <input type="text" id="hist-doctor" class="form-control" value="${user.role === 'Doctor' ? user.name : ''}" placeholder="Dr. Name">
        </div>
      </div>

      <div class="form-group">
        <label>Clinic / Hospital Facility</label>
        <input type="text" id="hist-facility" class="form-control" placeholder="e.g. MediVault Cardiovascular Center">
      </div>

      <div class="form-group">
        <label>Clinical Notes & Observations</label>
        <textarea id="hist-notes" class="form-control" rows="3" placeholder="Clinical findings, treatment decisions, patient responses..."></textarea>
      </div>
    </form>
  `;

  openModal({
    title: 'Add Medical History Timeline Record',
    bodyHtml,
    footerHtml: `
      <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
      <button class="btn btn-primary modal-save-btn"><i class="fa-solid fa-check"></i> Add to Timeline</button>
    `,
    maxWidth: '650px'
  });

  const modalEl = document.getElementById('app-active-modal');
  if (!modalEl) return;

  const saveBtn = modalEl.querySelector('.modal-save-btn');
  modalEl.querySelector('.modal-cancel-btn').addEventListener('click', closeModal);
  saveBtn.addEventListener('click', async () => {
    const date = modalEl.querySelector('#hist-date').value;
    const type = modalEl.querySelector('#hist-type').value;
    const title = modalEl.querySelector('#hist-title').value.trim();
    const severity = modalEl.querySelector('#hist-severity').value;
    const doctor = modalEl.querySelector('#hist-doctor').value.trim();
    const facility = modalEl.querySelector('#hist-facility').value.trim();
    const notes = modalEl.querySelector('#hist-notes').value.trim();

    if (!date || !title) {
      showToast('Please specify record date and title.', 'warning');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      await api.addMedicalHistory(activePatient.patient_id, {
        record_date: date,
        record_type: type,
        title,
        severity,
        doctor_name: doctor || null,
        facility: facility || null,
        notes: notes || null
      });
      showToast('Medical timeline record added.', 'success');
      closeModal();
      loadHistoryTimeline();
    } catch (err) {
      showToast(err.message, 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Add to Timeline';
    }
  });
}

/* ==============================================================================
   TAB 3: PRESCRIPTIONS & RX (WITH DRUG ALLERGY WARNING & OFFICIAL PRINT)
   ============================================================================== */
async function renderPrescriptionsTab(container) {
  const user = Store.state.user;
  const canPrescribe = user.role === 'Admin' || user.role === 'Doctor';

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
      <div>
        <h3 style="font-size:1.25rem;">Prescription Management & Active Medications</h3>
        <p style="color:var(--text-muted); font-size:0.88rem;">Real-time drug allergy collision detection and official hospital printable prescriptions</p>
      </div>
      <div style="display:flex; gap:0.75rem;">
        ${canPrescribe ? `
          <button id="add-prescription-btn" class="btn btn-primary">
            <i class="fa-solid fa-pills"></i> Write New Prescription
          </button>
        ` : ''}
      </div>
    </div>

    <!-- Prescriptions List Card -->
    <div class="glass-card">
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Medication & Dosage</th>
              <th>Frequency & Duration</th>
              <th>Prescribed By</th>
              <th>Start Date</th>
              <th>Status</th>
              <th>Special Instructions</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody id="prescriptions-table-body">
            ${renderSkeletonTable(5, 7)}
          </tbody>
        </table>
      </div>
    </div>
  `;

  loadPrescriptionsTable();

  const addBtn = container.querySelector('#add-prescription-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => openAddPrescriptionModal());
  }
}

async function loadPrescriptionsTable() {
  const tbody = document.getElementById('prescriptions-table-body');
  if (!tbody) return;

  try {
    const prescriptions = await api.getPrescriptions(activePatient.patient_id);
    const user = Store.state.user;
    const canModify = user.role === 'Admin' || user.role === 'Doctor';

    if (!prescriptions || prescriptions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            ${renderEmptyState('No prescriptions recorded', 'There are no medications currently on file for this patient.')}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = prescriptions.map(pr => {
      const isActive = pr.status === 'Active';
      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <div style="width:36px; height:36px; border-radius:8px; background:var(--primary-light); color:var(--primary); display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:1.1rem;">
                ℞
              </div>
              <div>
                <div style="font-weight:700; font-size:0.98rem; color:var(--text-main);">${pr.medication_name}</div>
                <div style="font-size:0.82rem; color:var(--primary); font-weight:600;">${pr.dosage}</div>
              </div>
            </div>
          </td>
          <td>
            <div style="font-weight:500;">${pr.frequency}</div>
            <div style="font-size:0.78rem; color:var(--text-muted);">${pr.duration}</div>
          </td>
          <td>
            <div style="font-weight:500;">${pr.doctor_name}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${pr.doctor_specialization || 'Attending'}</div>
          </td>
          <td style="font-size:0.88rem; color:var(--text-muted);">${formatDate(pr.start_date)}</td>
          <td>
            <span class="badge ${getStatusBadgeClass(pr.status)}">${pr.status}</span>
          </td>
          <td style="max-width:240px; font-size:0.85rem; color:var(--text-main);">
            ${pr.instructions || 'Standard dosing instructions'}
          </td>
          <td style="text-align:right;">
            <div style="display:inline-flex; gap:0.4rem;">
              <button class="btn btn-secondary btn-sm print-rx-btn" data-id="${pr.id}" title="Print Official Prescription">
                <i class="fa-solid fa-print"></i> Print
              </button>
              ${canModify && isActive ? `
                <button class="btn btn-success btn-sm complete-rx-btn" data-id="${pr.id}" title="Mark Course Completed">
                  <i class="fa-solid fa-check"></i>
                </button>
                <button class="btn btn-secondary btn-sm cancel-rx-btn" data-id="${pr.id}" title="Discontinue / Cancel Medication">
                  <i class="fa-solid fa-ban" style="color:var(--rose);"></i>
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Print Rx buttons
    tbody.querySelectorAll('.print-rx-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const rxId = btn.getAttribute('data-id');
        openPrintPrescriptionDialog(rxId);
      });
    });

    // Complete / Cancel buttons
    tbody.querySelectorAll('.complete-rx-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const rxId = btn.getAttribute('data-id');
        try {
          await api.updatePrescriptionStatus(activePatient.patient_id, rxId, 'Completed', 'Patient completed prescribed regimen');
          showToast('Prescription status updated to Completed.', 'success');
          loadPrescriptionsTable();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    tbody.querySelectorAll('.cancel-rx-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const rxId = btn.getAttribute('data-id');
        openConfirm({
          title: 'Discontinue Medication',
          message: 'Are you sure you want to cancel / discontinue this active prescription?',
          confirmText: 'Discontinue Rx',
          onConfirm: async () => {
            try {
              await api.updatePrescriptionStatus(activePatient.patient_id, rxId, 'Cancelled', 'Discontinued by physician');
              showToast('Prescription discontinued.', 'info');
              loadPrescriptionsTable();
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
        });
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">${renderErrorState('Failed to load prescriptions: ' + err.message, 'loadPrescriptionsTable()')}</td></tr>`;
  }
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'Active': return 'badge-normal';
    case 'Completed': return 'badge-low';
    case 'Cancelled': return 'badge-critical';
    default: return 'badge-info';
  }
}

function openAddPrescriptionModal() {
  const todayStr = new Date().toISOString().split('T')[0];

  const bodyHtml = `
    <form id="add-prescription-form">
      <div id="rx-conflict-warning-box" style="display:none; margin-bottom:1.25rem; background:var(--rose-light); border:2px solid var(--rose); padding:1rem; border-radius:var(--radius-md); color:#991b1b;">
        <div style="font-weight:700; font-size:0.95rem; display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:1.2rem;"></i> CLINICAL ALLERGY CONFLICT WARNING!
        </div>
        <p id="rx-conflict-warning-text" style="font-size:0.88rem; line-height:1.5; margin-bottom:0.75rem;"></p>
        <label style="display:flex; align-items:center; gap:0.5rem; font-weight:600; font-size:0.85rem; cursor:pointer;">
          <input type="checkbox" id="rx-override-checkbox">
          I am a licensed physician and confirm clinical override with precautions.
        </label>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Medication Name *</label>
          <input type="text" id="rx-med-name" class="form-control" placeholder="e.g. Lisinopril, Amoxicillin, Metformin" required>
        </div>
        <div class="form-group">
          <label>Strength / Dosage *</label>
          <input type="text" id="rx-dosage" class="form-control" placeholder="e.g. 500 mg, 20 mg" required>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Frequency *</label>
          <input type="text" id="rx-frequency" class="form-control" placeholder="e.g. Once daily in morning, Twice daily with meals" required>
        </div>
        <div class="form-group">
          <label>Duration *</label>
          <input type="text" id="rx-duration" class="form-control" placeholder="e.g. 7 days, 30 days, 3 months" required>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Start Date *</label>
          <input type="date" id="rx-start-date" class="form-control" value="${todayStr}" required>
        </div>
        <div class="form-group">
          <label>End Date (Optional)</label>
          <input type="date" id="rx-end-date" class="form-control">
        </div>
      </div>

      <div class="form-group">
        <label>Patient Instructions & Warnings</label>
        <textarea id="rx-instructions" class="form-control" rows="2" placeholder="e.g. Take with plenty of water. Do not consume grapefruit."></textarea>
      </div>

      <div class="form-group">
        <label>Internal Physician Notes</label>
        <input type="text" id="rx-notes" class="form-control" placeholder="e.g. Titration for hypertension control">
      </div>
    </form>
  `;

  openModal({
    title: 'Generate New Prescription (Rx)',
    bodyHtml,
    footerHtml: `
      <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
      <button class="btn btn-primary modal-save-btn"><i class="fa-solid fa-check"></i> Prescribe Medication</button>
    `,
    maxWidth: '680px'
  });

  const modalEl = document.getElementById('app-active-modal');
  if (!modalEl) return;

  const warningBox = modalEl.querySelector('#rx-conflict-warning-box');
  const warningText = modalEl.querySelector('#rx-conflict-warning-text');
  const overrideCheckbox = modalEl.querySelector('#rx-override-checkbox');
  const saveBtn = modalEl.querySelector('.modal-save-btn');

  modalEl.querySelector('.modal-cancel-btn').addEventListener('click', closeModal);
  saveBtn.addEventListener('click', async () => {
    const medName = modalEl.querySelector('#rx-med-name').value.trim();
    const dosage = modalEl.querySelector('#rx-dosage').value.trim();
    const freq = modalEl.querySelector('#rx-frequency').value.trim();
    const duration = modalEl.querySelector('#rx-duration').value.trim();
    const start = modalEl.querySelector('#rx-start-date').value;
    const end = modalEl.querySelector('#rx-end-date').value;
    const instructions = modalEl.querySelector('#rx-instructions').value.trim();
    const notes = modalEl.querySelector('#rx-notes').value.trim();
    const override = overrideCheckbox ? overrideCheckbox.checked : false;

    if (!medName || !dosage || !freq || !duration || !start) {
      showToast('Please fill all required prescription fields.', 'warning');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

    try {
      await api.addPrescription(activePatient.patient_id, {
        medication_name: medName,
        dosage,
        frequency: freq,
        duration,
        start_date: start,
        end_date: end || null,
        instructions: instructions || null,
        notes: notes || null,
        override_allergy_warning: override
      });

      showToast(`Prescription for ${medName} created successfully!`, 'success');
      closeModal();
      loadPrescriptionsTable();
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Prescribe Medication';

      if (err.isAllergyConflict) {
        // Show allergy warning box
        warningBox.style.display = 'block';
        warningText.textContent = err.message;
        showToast('Drug allergy collision detected! Physician override required.', 'warning');
      } else {
        showToast(err.message, 'error');
      }
    }
  });
}

async function openPrintPrescriptionDialog(rxId) {
  try {
    const rx = await api.getPrescription(activePatient.patient_id, rxId);

    const bodyHtml = `
      <div id="printable-prescription">
        <!-- Hospital Header -->
        <div class="rx-header">
          <div>
            <div class="rx-hospital-name">MediVault Medical Center</div>
            <div class="rx-hospital-sub">Department of Clinical Medicine & Patient Care</div>
            <div class="rx-hospital-sub">100 Healthcare Boulevard, Suite 500 &bull; Tel: +1 (555) 019-2000</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:800; font-size:18px; color:#0f766e;">Rx #${rx.id}</div>
            <div style="font-size:12px; color:#6b7280;">Date: ${formatDate(rx.start_date)}</div>
          </div>
        </div>

        <!-- Meta Grid -->
        <div class="rx-meta-grid">
          <div class="rx-meta-col">
            <p><strong>Patient Name:</strong> ${rx.first_name} ${rx.last_name}</p>
            <p><strong>Patient ID:</strong> ${rx.patient_id}</p>
            <p><strong>Date of Birth:</strong> ${formatDate(rx.dob)} (${activePatient.age} yrs)</p>
            <p><strong>Known Allergies:</strong> <span style="color:#b91c1c; font-weight:600;">${rx.allergies || 'None'}</span></p>
          </div>
          <div class="rx-meta-col">
            <p><strong>Prescribing Physician:</strong> Dr. ${rx.doctor_name.replace(/^Dr\.\s+/i, '')}</p>
            <p><strong>Specialization:</strong> ${rx.doctor_specialization || 'General Practice'}</p>
            <p><strong>State License #:</strong> ${rx.doctor_license || 'MED-TX-98421'}</p>
            <p><strong>Clinic Contact:</strong> ${rx.doctor_phone || '+1 (555) 302-8819'}</p>
          </div>
        </div>

        <!-- Rx Symbol & Medication -->
        <div class="rx-symbol">℞</div>
        <div class="rx-medication-box">
          <div class="rx-med-name">${rx.medication_name} — ${rx.dosage}</div>
          <div class="rx-med-sig"><strong>Sig:</strong> ${rx.frequency} for ${rx.duration}.</div>
          ${rx.instructions ? `<div class="rx-instructions"><strong>Directions:</strong> ${rx.instructions}</div>` : ''}
        </div>

        <!-- Footer Signature -->
        <div class="rx-footer">
          <div class="rx-watermark">
            Official E-Prescription &bull; Generated by MediVault Electronic Health System &bull; Tamper Verification ID: ${rx.patient_id}-RX${rx.id}
          </div>
          <div>
            <div class="rx-signature-line">
              Dr. ${rx.doctor_name.replace(/^Dr\.\s+/i, '')}
            </div>
            <div style="text-align:center; font-size:10px; color:#6b7280; margin-top:2px;">Physician Digital Signature</div>
          </div>
        </div>
      </div>
    `;

    openModal({
      title: 'Official Prescription Preview',
      bodyHtml,
      footerHtml: `
        <button class="btn btn-secondary modal-cancel-btn">Close Preview</button>
        <button class="btn btn-primary do-print-btn"><i class="fa-solid fa-print"></i> Print Prescription</button>
      `,
      maxWidth: '750px'
    });

    const modalEl = document.getElementById('app-active-modal');
    if (!modalEl) return;

    modalEl.querySelector('.modal-cancel-btn').addEventListener('click', closeModal);
    modalEl.querySelector('.do-print-btn').addEventListener('click', () => {
      window.print();
    });
  } catch (err) {
    showToast('Failed to load prescription for printing: ' + err.message, 'error');
  }
}

/* ==============================================================================
   TAB 4: DIAGNOSTIC LAB TESTS
   ============================================================================== */
async function renderTestsTab(container) {
  const user = Store.state.user;
  const canOrder = user.role === 'Admin' || user.role === 'Doctor';

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
      <div>
        <h3 style="font-size:1.25rem;">Diagnostic Lab Tests</h3>
        <p style="color:var(--text-muted); font-size:0.88rem;">Automated Normal / High / Low / Critical evaluation against reference ranges</p>
      </div>
      ${canOrder ? `
        <button id="order-diagnostic-test-btn" class="btn btn-primary">
          <i class="fa-solid fa-flask-vial"></i> Order Diagnostic Test
        </button>
      ` : ''}
    </div>

    <!-- Tests Table Card -->
    <div class="glass-card">
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Test Name & Category</th>
              <th>Ordered By / Date</th>
              <th>Result Value & Units</th>
              <th>Normal Reference Range</th>
              <th>Clinical Flag</th>
              <th>Status</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody id="tests-table-body">
            ${renderSkeletonTable(5, 7)}
          </tbody>
        </table>
      </div>
    </div>
  `;

  loadTestsTable();

  const orderBtn = container.querySelector('#order-diagnostic-test-btn');
  if (orderBtn) {
    orderBtn.addEventListener('click', () => openOrderTestModal());
  }
}

async function loadTestsTable() {
  const tbody = document.getElementById('tests-table-body');
  if (!tbody) return;

  try {
    const tests = await api.getPatientTests(activePatient.patient_id);
    const user = Store.state.user;
    const canUpdateResult = user.role === 'Admin' || user.role === 'Doctor' || user.role === 'Lab Technician';

    if (!tests || tests.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            ${renderEmptyState('No laboratory tests on record', 'Order a diagnostic test to initiate specimen processing.')}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = tests.map(t => {
      const isOverdue = t.is_overdue || (
        (t.status === 'Ordered' || t.status === 'In Progress') &&
        (Date.now() - new Date(t.ordered_date).getTime() > 7 * 86400000)
      );

      return `
        <tr>
          <td>
            <div style="font-weight:700; font-size:0.95rem; color:var(--text-main);">${t.test_name}</div>
            <div style="display:flex; align-items:center; gap:0.4rem; margin-top:3px;">
              <span class="badge badge-info" style="font-size:0.75rem;">${t.category}</span>
              ${isOverdue ? `<span class="badge badge-overdue"><i class="fa-solid fa-clock-rotate-left"></i> Overdue</span>` : ''}
            </div>
          </td>
          <td>
            <div style="font-weight:500;">${t.ordered_by_doctor_name || 'Dr. Attending'}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${formatDate(t.ordered_date)}</div>
          </td>
          <td>
            ${t.result_value !== null ? `
              <div style="font-weight:700; font-size:1.05rem; color:var(--text-main);">
                ${t.result_value} <span style="font-weight:400; font-size:0.85rem; color:var(--text-muted);">${t.unit || ''}</span>
              </div>
            ` : '<span style="color:var(--text-muted); font-style:italic;">Pending specimen analysis</span>'}
          </td>
          <td>
            <div style="font-family:monospace; font-size:0.85rem;">${t.reference_range || 'N/A'}</div>
          </td>
          <td>
            <span class="badge ${getFlagBadgeClass(t.flag)}">${t.flag}</span>
          </td>
          <td>
            <span class="badge ${getStatusBadgeClass(t.status)}">${t.status}</span>
          </td>
          <td style="text-align:right;">
            ${canUpdateResult ? `
              <button class="btn btn-secondary btn-sm update-test-result-btn" data-id="${t.id}" title="Enter / Modify Results">
                <i class="fa-solid fa-pen-to-square"></i> Results
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.update-test-result-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tId = btn.getAttribute('data-id');
        const testObj = tests.find(item => String(item.id) === String(tId));
        if (testObj) openUpdateTestModal(testObj);
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">${renderErrorState('Failed to load test records: ' + err.message, 'loadTestsTable()')}</td></tr>`;
  }
}

function getFlagBadgeClass(flag) {
  switch (flag) {
    case 'Normal': return 'badge-normal';
    case 'High': return 'badge-high';
    case 'Low': return 'badge-low';
    case 'Critical': return 'badge-critical';
    case 'Pending': return 'badge-pending';
    default: return 'badge-info';
  }
}

function openOrderTestModal() {
  const bodyHtml = `
    <form id="order-test-form">
      <div class="form-row">
        <div class="form-group">
          <label>Diagnostic Test Name *</label>
          <input type="text" id="order-test-name" class="form-control" placeholder="e.g. Complete Blood Count (CBC), Fasting Lipid Panel" required>
        </div>
        <div class="form-group">
          <label>Category *</label>
          <select id="order-test-cat" class="form-control" required>
            <option value="Blood">Blood (Hematology / Chem)</option>
            <option value="Imaging">Imaging (X-Ray / MRI / CT / Echo)</option>
            <option value="Urine">Urinalysis</option>
            <option value="Stool">Stool (Microbiology)</option>
            <option value="Cardiology">Cardiology (ECG / Stress)</option>
            <option value="Pathology">Pathology & Biopsy</option>
            <option value="Genetic">Genetic Diagnostics</option>
            <option value="Other">Other Clinical Test</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Normal Reference Range (Optional)</label>
          <input type="text" id="order-test-ref" class="form-control" placeholder="e.g. 70 - 100, < 140, 3.5 - 5.0">
        </div>
        <div class="form-group">
          <label>Measurement Unit (Optional)</label>
          <input type="text" id="order-test-unit" class="form-control" placeholder="e.g. mg/dL, mmol/L, %">
        </div>
      </div>

      <div class="form-group">
        <label>Diagnostic Instructions & Clinical Indications</label>
        <textarea id="order-test-notes" class="form-control" rows="2" placeholder="Clinical justification or fasting requirements..."></textarea>
      </div>
    </form>
  `;

  openModal({
    title: 'Order Diagnostic Laboratory Test',
    bodyHtml,
    footerHtml: `
      <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
      <button class="btn btn-primary modal-save-btn"><i class="fa-solid fa-check"></i> Place Test Order</button>
    `,
    maxWidth: '620px'
  });

  const modalEl = document.getElementById('app-active-modal');
  if (!modalEl) return;

  const saveBtn = modalEl.querySelector('.modal-save-btn');
  modalEl.querySelector('.modal-cancel-btn').addEventListener('click', closeModal);
  saveBtn.addEventListener('click', async () => {
    const name = modalEl.querySelector('#order-test-name').value.trim();
    const cat = modalEl.querySelector('#order-test-cat').value;
    const ref = modalEl.querySelector('#order-test-ref').value.trim();
    const unit = modalEl.querySelector('#order-test-unit').value.trim();
    const notes = modalEl.querySelector('#order-test-notes').value.trim();

    if (!name) {
      showToast('Test name is required.', 'warning');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Placing Order...';

    try {
      await api.orderTest(activePatient.patient_id, {
        test_name: name,
        category: cat,
        reference_range: ref || null,
        unit: unit || null,
        notes: notes || null
      });

      showToast(`Diagnostic order placed for ${name}`, 'success');
      closeModal();
      loadTestsTable();
    } catch (err) {
      showToast(err.message, 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Place Test Order';
    }
  });
}

function openUpdateTestModal(test) {
  const bodyHtml = `
    <form id="update-test-form">
      <div style="background:var(--primary-light); padding:0.85rem; border-radius:var(--radius-md); margin-bottom:1.25rem;">
        <div style="font-weight:700; color:var(--primary); font-size:1.05rem;">${test.test_name}</div>
        <div style="font-size:0.82rem; color:var(--text-muted);">Category: ${test.category} &bull; Ordered: ${formatDate(test.ordered_date)}</div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Result Value *</label>
          <input type="text" id="up-test-val" class="form-control" value="${test.result_value || ''}" placeholder="e.g. 98, 14.2, Negative" required>
        </div>
        <div class="form-group">
          <label>Measurement Unit</label>
          <input type="text" id="up-test-unit" class="form-control" value="${test.unit || ''}" placeholder="e.g. mg/dL, g/dL">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Reference Range</label>
          <input type="text" id="up-test-ref" class="form-control" value="${test.reference_range || ''}" placeholder="e.g. 70 - 100">
        </div>
        <div class="form-group">
          <label>Clinical Flag (Auto or Explicit)</label>
          <select id="up-test-flag" class="form-control">
            <option value="" ${!test.flag || test.flag === 'Pending' ? 'selected' : ''}>-- Auto-Calculate from Range --</option>
            <option value="Normal" ${test.flag === 'Normal' ? 'selected' : ''}>Normal</option>
            <option value="High" ${test.flag === 'High' ? 'selected' : ''}>High</option>
            <option value="Low" ${test.flag === 'Low' ? 'selected' : ''}>Low</option>
            <option value="Critical" ${test.flag === 'Critical' ? 'selected' : ''}>Critical</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label>Diagnostic Workflow Status</label>
        <select id="up-test-status" class="form-control">
          <option value="Ordered" ${test.status === 'Ordered' ? 'selected' : ''}>Ordered</option>
          <option value="In Progress" ${test.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
          <option value="Completed" ${test.status === 'Completed' ? 'selected' : ''}>Completed</option>
          <option value="Cancelled" ${test.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
      </div>

      <div class="form-group">
        <label>Laboratory Technician Findings / Notes</label>
        <textarea id="up-test-notes" class="form-control" rows="2" placeholder="Lab observations...">${test.notes || ''}</textarea>
      </div>
    </form>
  `;

  openModal({
    title: 'Enter / Verify Diagnostic Results',
    bodyHtml,
    footerHtml: `
      <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
      <button class="btn btn-primary modal-save-btn"><i class="fa-solid fa-check"></i> Save & Release Result</button>
    `,
    maxWidth: '620px'
  });

  const modalEl = document.getElementById('app-active-modal');
  if (!modalEl) return;

  const saveBtn = modalEl.querySelector('.modal-save-btn');
  modalEl.querySelector('.modal-cancel-btn').addEventListener('click', closeModal);
  saveBtn.addEventListener('click', async () => {
    const val = modalEl.querySelector('#up-test-val').value.trim();
    const unit = modalEl.querySelector('#up-test-unit').value.trim();
    const ref = modalEl.querySelector('#up-test-ref').value.trim();
    const flag = modalEl.querySelector('#up-test-flag').value;
    const status = modalEl.querySelector('#up-test-status').value;
    const notes = modalEl.querySelector('#up-test-notes').value.trim();

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

      showToast(`Test results updated for ${test.test_name}`, 'success');
      closeModal();
      loadTestsTable();
    } catch (err) {
      showToast(err.message, 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save & Release Result';
    }
  });
}

/* ==============================================================================
   TAB 5: AUTHORIZED ACCESS GRANTS (CONSENT & ZERO-TRUST ACCESS)
   ============================================================================== */
async function renderAccessTab(container) {
  const user = Store.state.user;
  const isSelfPatient = user.role === 'Patient' && user.patientCode === activePatient.patient_id;
  const isAdmin = user.role === 'Admin';
  const canGrant = isSelfPatient || isAdmin;

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
      <div>
        <h3 style="font-size:1.25rem;">Authorized Medical Access Control</h3>
        <p style="color:var(--text-muted); font-size:0.88rem;">
          Patient-directed consent management: only explicitly assigned or authorized physicians can inspect this record
        </p>
      </div>
      ${canGrant ? `
        <button id="grant-doctor-access-btn" class="btn btn-primary">
          <i class="fa-solid fa-user-shield"></i> Grant Doctor Access
        </button>
      ` : ''}
    </div>

    <!-- Active Doctor Grants Card -->
    <div class="glass-card">
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Authorized Physician</th>
              <th>Specialization</th>
              <th>Authorization Status</th>
              <th>Expiration Date</th>
              <th>Granted By</th>
              <th>Clinical Purpose / Notes</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody id="access-grants-table-body">
            ${renderSkeletonTable(3, 7)}
          </tbody>
        </table>
      </div>
    </div>
  `;

  loadAccessGrantsTable();

  const grantBtn = container.querySelector('#grant-doctor-access-btn');
  if (grantBtn) {
    grantBtn.addEventListener('click', () => openGrantAccessModal());
  }
}

async function loadAccessGrantsTable() {
  const tbody = document.getElementById('access-grants-table-body');
  if (!tbody) return;

  try {
    const grants = await api.getPatientGrants(activePatient.patient_id);
    const user = Store.state.user;
    const canRevoke = user.role === 'Admin' || (user.role === 'Patient' && user.patientCode === activePatient.patient_id);

    if (!grants || grants.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            ${renderEmptyState('No secondary doctor authorizations active', `Only the primary assigned physician (${activePatient.doctor ? activePatient.doctor.name : 'None'}) has chart access.`)}
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

      return `
        <tr>
          <td>
            <div style="font-weight:700; color:var(--text-main);">${g.doctor_name}</div>
            <div style="font-size:0.78rem; color:var(--text-muted);">${g.doctor_email}</div>
          </td>
          <td>${g.doctor_specialization || 'General Practice'}</td>
          <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
          <td style="font-size:0.88rem;">${g.expires_at ? formatDateTime(g.expires_at) : '<span style="color:var(--text-muted);">Indefinite / Permanent</span>'}</td>
          <td>${g.granted_by_name || 'Patient'}</td>
          <td style="max-width:240px; font-size:0.85rem;">${g.notes || 'General medical consultation'}</td>
          <td style="text-align:right;">
            ${canRevoke && isGranted && !isExpired ? `
              <button class="btn btn-danger btn-sm revoke-grant-btn" data-id="${g.id}" data-doc="${g.doctor_name}" title="Revoke Doctor Access Immediately">
                <i class="fa-solid fa-ban"></i> Revoke Access
              </button>
            ` : '<span style="color:var(--text-muted); font-size:0.82rem;">None</span>'}
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.revoke-grant-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const gId = btn.getAttribute('data-id');
        const docName = btn.getAttribute('data-doc');
        openConfirm({
          title: 'Revoke Medical Record Access',
          message: `Are you sure you want to revoke chart access from Dr. ${docName}? They will immediately be blocked from accessing this medical profile.`,
          confirmText: 'Revoke Access',
          onConfirm: async () => {
            try {
              await api.revokeAccess(activePatient.patient_id, null, gId);
              showToast(`Access revoked from Dr. ${docName}.`, 'info');
              loadAccessGrantsTable();
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
        });
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">${renderErrorState('Failed to load grants: ' + err.message, 'loadAccessGrantsTable()')}</td></tr>`;
  }
}

function openGrantAccessModal() {
  const doctorOptions = availableDoctors.map(d => `
    <option value="${d.id}">${d.name} (${d.specialization || 'General Medicine'})</option>
  `).join('');

  const bodyHtml = `
    <form id="grant-access-form">
      <div class="form-group">
        <label>Select Doctor to Authorize *</label>
        <select id="grant-doctor-id" class="form-control" required>
          <option value="">-- Choose Physician --</option>
          ${doctorOptions}
        </select>
      </div>

      <div class="form-group">
        <label>Access Expiration Date (Optional - leave blank for indefinite)</label>
        <input type="datetime-local" id="grant-expires-at" class="form-control">
      </div>

      <div class="form-group">
        <label>Purpose of Access / Clinical Consultation Notes</label>
        <textarea id="grant-notes" class="form-control" rows="2" placeholder="e.g. Authorized for second opinion regarding cardiology consult..."></textarea>
      </div>
    </form>
  `;

  openModal({
    title: 'Grant Medical Record Access Authorization',
    bodyHtml,
    footerHtml: `
      <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
      <button class="btn btn-primary modal-save-btn"><i class="fa-solid fa-shield-check"></i> Authorize Doctor</button>
    `,
    maxWidth: '580px'
  });

  const modalEl = document.getElementById('app-active-modal');
  if (!modalEl) return;

  const saveBtn = modalEl.querySelector('.modal-save-btn');
  modalEl.querySelector('.modal-cancel-btn').addEventListener('click', closeModal);
  saveBtn.addEventListener('click', async () => {
    const docId = modalEl.querySelector('#grant-doctor-id').value;
    const expires = modalEl.querySelector('#grant-expires-at').value;
    const notes = modalEl.querySelector('#grant-notes').value.trim();

    if (!docId) {
      showToast('Please select a physician to authorize.', 'warning');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authorizing...';

    try {
      await api.grantAccess(
        activePatient.patient_id,
        parseInt(docId, 10),
        expires || null,
        notes || null
      );

      showToast('Doctor access granted successfully!', 'success');
      closeModal();
      loadAccessGrantsTable();
    } catch (err) {
      showToast(err.message, 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-shield-check"></i> Authorize Doctor';
    }
  });
}
