/**
 * Single Page Application Hash Router
 */

import Store from './store.js';
import { renderNavbar } from './components/navbar.js';
import { renderSidebar } from './components/sidebar.js';
import { renderLandingView } from './views/landingView.js';
import { renderLoginView, initLoginListeners } from './views/loginView.js';
import { renderActivateView, initActivateListeners } from './views/activateView.js';
import { renderDashboardView, initDashboardListeners } from './views/dashboardView.js';
import { renderPatientsView, initPatientsListeners } from './views/patientsView.js';
import { renderPatientDetailView, initPatientDetailListeners } from './views/patientDetailView.js';
import { renderTestsView, initTestsListeners } from './views/testsView.js';
import { renderAccessView, initAccessListeners } from './views/accessView.js';
import { renderAuditView, initAuditListeners } from './views/auditView.js';
import { renderUsersView, initUsersListeners } from './views/usersView.js';
import { showToast } from './components/toast.js';
import { openModal, closeModal } from './components/modal.js';
import api from './api.js';

export async function handleRouteChange() {
  const root = document.getElementById('app-root');
  if (!root) return;

  let hash = window.location.hash || '#landing';
  if (!hash.startsWith('#')) hash = '#' + hash;

  const isAuth = Store.isAuthenticated();

  // Route Guards
  const publicRoutes = ['#landing', '#login', '#activate'];
  if (!isAuth && !publicRoutes.includes(hash)) {
    window.location.hash = '#login';
    return;
  }

  // 1. Landing View
  if (hash === '#landing') {
    root.innerHTML = renderLandingView();
    setupLandingListeners();
    return;
  }

  // 2. Login View
  if (hash === '#login') {
    if (isAuth) {
      window.location.hash = '#dashboard';
      return;
    }
    root.innerHTML = renderLoginView();
    initLoginListeners();
    return;
  }

  // 2b. Patient Portal Self-Service Activation View
  if (hash === '#activate') {
    if (isAuth) {
      window.location.hash = '#dashboard';
      return;
    }
    root.innerHTML = renderActivateView();
    initActivateListeners();
    return;
  }

  // 3. Authenticated App Shell Routes
  const routeParts = hash.slice(1).split('/');
  const baseRoute = routeParts[0];
  const routeParam = routeParts[1];

  const user = Store.state.user;

  // Patient Route Guard: isolate patient strictly to their own records and dashboard
  if (user && user.role === 'Patient') {
    if (['tests', 'audit', 'users'].includes(baseRoute)) {
      showToast('Access restricted: Patient accounts cannot access clinical administration consoles.', 'warning');
      window.location.hash = '#dashboard';
      return;
    }

    if (baseRoute === 'patients') {
      window.location.hash = '#my-record';
      return;
    }

    if (baseRoute === 'patient' && routeParam) {
      let ownCode = (user.patientCode || user.patient_code || '').toUpperCase();
      if (!ownCode) {
        try {
          const fresh = await api.getMe();
          if (fresh && (fresh.patientCode || fresh.patient_code)) {
            ownCode = (fresh.patientCode || fresh.patient_code).toUpperCase();
            Store.setUser(fresh, Store.state.token);
          }
        } catch (_) {}
      }

      if (!ownCode || routeParam.toUpperCase() !== ownCode) {
        showToast('Access restricted: You cannot view records for another patient.', 'error');
        window.location.hash = ownCode ? `#patient/${ownCode}` : '#my-record';
        return;
      }
    }
  }

  let mainContentHtml = '';
  let initFn = null;

  switch (baseRoute) {
    case 'dashboard':
      mainContentHtml = await renderDashboardView();
      initFn = initDashboardListeners;
      break;

    case 'my-record':
      if (user && user.role === 'Patient') {
        let pCode = user.patientCode || user.patient_code;
        if (!pCode) {
          try {
            const fresh = await api.getMe();
            if (fresh && (fresh.patientCode || fresh.patient_code)) {
              pCode = fresh.patientCode || fresh.patient_code;
              Store.setUser(fresh, Store.state.token);
            }
          } catch (_) {}
        }

        if (pCode) {
          window.location.hash = `#patient/${pCode}`;
          return;
        } else {
          mainContentHtml = `
            <div class="content-wrapper">
              <div class="glass-card" style="padding:4rem 2rem; text-align:center; max-width:620px; margin:3rem auto;">
                <div style="font-size:3.5rem; color:var(--amber); margin-bottom:1rem;">
                  <i class="fa-solid fa-hospital-user"></i>
                </div>
                <h2 style="font-size:1.6rem; margin-bottom:0.75rem;">No Linked Medical Record Found</h2>
                <p style="color:var(--text-muted); font-size:1rem; line-height:1.6; margin-bottom:1.75rem;">
                  Your patient login account (<strong>${user.email || 'User'}</strong>) is not currently associated with a clinical profile in the system. 
                  Please activate your patient account using your hospital records or contact the administrator to link your profile.
                </p>
                <div style="display:flex; justify-content:center; gap:1rem; flex-wrap:wrap;">
                  <a href="#activate" class="btn btn-secondary">
                    <i class="fa-solid fa-id-card-clip"></i> Self-Service Account Activation
                  </a>
                  <a href="#dashboard" class="btn btn-primary">
                    <i class="fa-solid fa-house"></i> Return to Dashboard
                  </a>
                </div>
              </div>
            </div>
          `;
          showToast('No clinical record is linked to your account yet.', 'warning');
          break;
        }
      } else {
        window.location.hash = '#dashboard';
        return;
      }

    case 'patients':
      mainContentHtml = await renderPatientsView();
      initFn = initPatientsListeners;
      break;

    case 'patient':
      if (routeParam) {
        mainContentHtml = await renderPatientDetailView(routeParam);
        initFn = () => initPatientDetailListeners(routeParam);
      } else if (user && user.role === 'Patient') {
        window.location.hash = '#my-record';
        return;
      } else {
        window.location.hash = '#patients';
        return;
      }
      break;

    case 'tests':
      mainContentHtml = await renderTestsView(routeParam);
      initFn = () => initTestsListeners(routeParam);
      break;

    case 'access':
      mainContentHtml = await renderAccessView();
      initFn = initAccessListeners;
      break;

    case 'audit':
      mainContentHtml = await renderAuditView();
      initFn = initAuditListeners;
      break;

    case 'users':
      mainContentHtml = await renderUsersView();
      initFn = initUsersListeners;
      break;

    default:
      // Clean 404 View
      mainContentHtml = `
        <div class="content-wrapper">
          <div class="glass-card" style="padding:4rem 2rem; text-align:center; max-width:600px; margin:3rem auto;">
            <div style="font-size:3.5rem; color:var(--primary); margin-bottom:1rem;">
              <i class="fa-solid fa-compass-drafting"></i>
            </div>
            <h1 style="font-size:2rem; margin-bottom:0.5rem;">404 &mdash; Page Not Found</h1>
            <p style="color:var(--text-muted); font-size:1rem; line-height:1.6; margin-bottom:1.75rem;">
              The requested medical route <code>${hash}</code> could not be found or has been relocated.
            </p>
            <a href="#dashboard" class="btn btn-primary">
              <i class="fa-solid fa-house"></i> Return to Dashboard
            </a>
          </div>
        </div>
      `;
      break;
  }

  // Assemble Complete App Shell
  root.innerHTML = `
    <div class="app-container">
      ${renderSidebar(baseRoute)}
      <main class="app-main">
        ${renderNavbar()}
        <div id="view-mount-point">
          ${mainContentHtml}
        </div>
      </main>
    </div>
  `;

  setupShellEventListeners();

  if (initFn) {
    initFn();
  }
}

function setupLandingListeners() {
  const themeToggle = document.getElementById('landing-theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      Store.toggleTheme();
      const icon = themeToggle.querySelector('i');
      if (icon) {
        icon.className = `fa-solid ${Store.state.theme === 'dark' ? 'fa-sun' : 'fa-moon'}`;
      }
    });
  }
}

function setupShellEventListeners() {
  // Theme Toggle in Topbar
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      Store.toggleTheme();
      const icon = themeBtn.querySelector('i');
      if (icon) {
        icon.className = `fa-solid ${Store.state.theme === 'dark' ? 'fa-sun' : 'fa-moon'}`;
      }
    });
  }

  // Topbar and Sidebar Logout Buttons
  const topbarLogout = document.getElementById('topbar-logout-btn');
  if (topbarLogout) {
    topbarLogout.addEventListener('click', () => Store.logout());
  }

  // Change Password
  const changePwBtn = document.getElementById('topbar-change-password-btn');
  if (changePwBtn) {
    changePwBtn.addEventListener('click', () => openChangePasswordModal());
  }

  const sidebarLogout = document.getElementById('sidebar-logout-btn');
  if (sidebarLogout) {
    sidebarLogout.addEventListener('click', () => Store.logout());
  }

  // Global Search Input in Topbar
  const globalSearch = document.getElementById('global-search-input');
  if (globalSearch) {
    globalSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = globalSearch.value.trim();
        if (query) {
          window.location.hash = `#patients`;
          setTimeout(() => {
            const tableSearch = document.getElementById('patient-search-filter');
            if (tableSearch) {
              tableSearch.value = query;
              tableSearch.dispatchEvent(new Event('input'));
            }
          }, 150);
        }
      }
    });
  }

  // Mobile Sidebar Toggle and Backdrop
  const mobileToggle = document.getElementById('mobile-sidebar-toggle');
  const sidebar = document.getElementById('main-sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');

  if (mobileToggle && sidebar) {
    mobileToggle.style.display = 'flex';
    mobileToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
      if (sidebarBackdrop) sidebarBackdrop.classList.toggle('open');
    });
  }

  if (sidebarBackdrop && sidebar) {
    sidebarBackdrop.addEventListener('click', () => {
      sidebar.classList.remove('open');
      sidebarBackdrop.classList.remove('open');
    });
  }

  // Notifications Bell and Popover Toggle
  const notifBell = document.getElementById('notifications-bell-btn');
  const notifDropdown = document.getElementById('notifications-dropdown');
  const notifIndicator = document.getElementById('notif-badge-indicator');
  const markReadBtn = document.getElementById('mark-notifs-read-btn');

  if (notifBell && notifDropdown) {
    notifBell.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = notifDropdown.classList.contains('open');
      if (isOpen) {
        notifDropdown.classList.remove('open');
        notifBell.setAttribute('aria-expanded', 'false');
      } else {
        notifDropdown.classList.add('open');
        notifBell.setAttribute('aria-expanded', 'true');
      }
    });

    document.addEventListener('click', (e) => {
      if (notifDropdown && !notifDropdown.contains(e.target) && e.target !== notifBell) {
        notifDropdown.classList.remove('open');
        notifBell.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (markReadBtn && notifIndicator) {
    markReadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notifIndicator.style.display = 'none';
      showToast('All clinical alerts marked as read.', 'info');
      if (notifDropdown) notifDropdown.classList.remove('open');
    });
  }
}

function openChangePasswordModal() {
  const bodyHtml = `
    <form id="change-password-form">
      <div class="form-group" style="margin-bottom:1rem;">
        <label>Current Password *</label>
        <input type="password" id="cp-current" class="form-control" placeholder="Enter current password" required autocomplete="current-password">
      </div>
      <div class="form-group" style="margin-bottom:1rem;">
        <label>New Password *</label>
        <input type="password" id="cp-new" class="form-control" placeholder="At least 8 characters (letter + number)" required autocomplete="new-password">
        <small style="color:var(--text-muted); font-size:0.75rem;">Must be at least 8 characters long and contain both a letter and a number.</small>
      </div>
      <div class="form-group" style="margin-bottom:1rem;">
        <label>Confirm New Password *</label>
        <input type="password" id="cp-confirm" class="form-control" placeholder="Re-enter new password" required autocomplete="new-password">
      </div>
    </form>
  `;

  const footerHtml = `
    <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
    <button class="btn btn-primary modal-save-btn">
      <i class="fa-solid fa-key"></i> Update Password
    </button>
  `;

  openModal({
    title: 'Update Account Password',
    bodyHtml,
    footerHtml,
    maxWidth: '480px'
  });

  const modalEl = document.getElementById('app-active-modal');
  if (!modalEl) return;

  const saveBtn = modalEl.querySelector('.modal-save-btn');
  modalEl.querySelector('.modal-cancel-btn').addEventListener('click', closeModal);

  saveBtn.addEventListener('click', async () => {
    const currentPassword = modalEl.querySelector('#cp-current').value;
    const newPassword = modalEl.querySelector('#cp-new').value;
    const confirmPassword = modalEl.querySelector('#cp-confirm').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast('All fields are required.', 'warning');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('New password and confirm password do not match.', 'warning');
      return;
    }

    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      showToast('Password must be at least 8 characters long and contain at least one letter and one number.', 'warning');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';

    try {
      await api.changePassword(currentPassword, newPassword);
      showToast('Password updated successfully!', 'success');
      closeModal();
    } catch (err) {
      showToast(err.message || 'Failed to update password.', 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-key"></i> Update Password';
    }
  });
}
