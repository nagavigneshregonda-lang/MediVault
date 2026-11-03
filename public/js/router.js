/**
 * Single Page Application Hash Router
 */

import Store from './store.js';
import { renderNavbar } from './components/navbar.js';
import { renderSidebar } from './components/sidebar.js';
import { renderLandingView } from './views/landingView.js';
import { renderLoginView, initLoginListeners } from './views/loginView.js';
import { renderDashboardView, initDashboardListeners } from './views/dashboardView.js';
import { renderPatientsView, initPatientsListeners } from './views/patientsView.js';
import { renderPatientDetailView, initPatientDetailListeners } from './views/patientDetailView.js';
import { renderTestsView, initTestsListeners } from './views/testsView.js';
import { renderAccessView, initAccessListeners } from './views/accessView.js';
import { renderAuditView, initAuditListeners } from './views/auditView.js';
import { renderUsersView, initUsersListeners } from './views/usersView.js';
import { showToast } from './components/toast.js';

export async function handleRouteChange() {
  const root = document.getElementById('app-root');
  if (!root) return;

  let hash = window.location.hash || '#landing';
  if (!hash.startsWith('#')) hash = '#' + hash;

  const isAuth = Store.isAuthenticated();

  // Route Guards
  const publicRoutes = ['#landing', '#login'];
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

  // 3. Authenticated App Shell Routes
  const routeParts = hash.slice(1).split('/');
  const baseRoute = routeParts[0];
  const routeParam = routeParts[1];

  let mainContentHtml = '';
  let initFn = null;

  switch (baseRoute) {
    case 'dashboard':
      mainContentHtml = await renderDashboardView();
      initFn = initDashboardListeners;
      break;

    case 'patients':
      mainContentHtml = await renderPatientsView();
      initFn = initPatientsListeners;
      break;

    case 'patient':
      if (routeParam) {
        mainContentHtml = await renderPatientDetailView(routeParam);
        initFn = () => initPatientDetailListeners(routeParam);
      } else {
        window.location.hash = '#patients';
        return;
      }
      break;

    case 'tests':
      mainContentHtml = await renderTestsView();
      initFn = initTestsListeners;
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
