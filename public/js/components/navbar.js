/**
 * Top Navigation Bar Component with Notifications Popover
 */

import Store from '../store.js';

export function renderNavbar() {
  const user = Store.state.user;
  const isDark = Store.state.theme === 'dark';

  return `
    <header class="app-topbar">
      <div style="display:flex; align-items:center; gap:0.75rem; min-width:0;">
        <button id="mobile-sidebar-toggle" class="icon-btn" style="display:none;" aria-label="Toggle Navigation">
          <i class="fa-solid fa-bars"></i>
        </button>
        ${user && user.role !== 'Patient' ? `
          <div class="topbar-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="global-search-input" placeholder="Search patients (name, ID)..." autocomplete="off">
          </div>
        ` : ''}
      </div>

      <div class="topbar-actions">
        <!-- Theme Toggle -->
        <button id="theme-toggle-btn" class="icon-btn" title="Toggle Light / Dark mode" aria-label="Toggle Theme">
          <i class="fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}"></i>
        </button>

        <!-- Notifications Bell & Popover Dropdown -->
        <div style="position:relative;">
          <button id="notifications-bell-btn" class="icon-btn" title="Clinical Notifications & Alerts" aria-label="Notifications" aria-expanded="false">
            <i class="fa-regular fa-bell"></i>
            <span id="notif-badge-indicator" style="position:absolute; top:7px; right:7px; width:8px; height:8px; background:var(--emerald); border-radius:50%;"></span>
          </button>

          <!-- Dropdown Popover -->
          <div class="notifications-dropdown" id="notifications-dropdown">
            <div class="notif-header">
              <div style="font-weight:700; font-size:0.95rem; display:flex; align-items:center; gap:0.5rem;">
                <i class="fa-solid fa-bell" style="color:var(--primary);"></i>
                <span>Clinical Alerts</span>
              </div>
              <button id="mark-notifs-read-btn" style="background:none; border:none; color:var(--primary); font-size:0.78rem; font-weight:600; cursor:pointer;">
                Mark all read
              </button>
            </div>
            <div class="notif-list" id="notif-items-list">
              <div class="notif-item">
                <div style="width:28px; height:28px; border-radius:50%; background:var(--amber-light); color:var(--amber); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:0.8rem;">
                  <i class="fa-solid fa-clock"></i>
                </div>
                <div style="font-size:0.82rem;">
                  <div style="font-weight:600; color:var(--text-main);">Overdue Diagnostic Tests</div>
                  <div style="color:var(--text-muted); margin-top:2px;">Carotid Duplex Ultrasound ordered > 7 days ago.</div>
                </div>
              </div>
              <div class="notif-item">
                <div style="width:28px; height:28px; border-radius:50%; background:var(--rose-light); color:var(--rose); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:0.8rem;">
                  <i class="fa-solid fa-triangle-exclamation"></i>
                </div>
                <div style="font-size:0.82rem;">
                  <div style="font-weight:600; color:var(--text-main);">Critical Lab Flag Recorded</div>
                  <div style="color:var(--text-muted); margin-top:2px;">Serum Potassium 6.4 mEq/L (Critical) verified.</div>
                </div>
              </div>
              <div class="notif-item">
                <div style="width:28px; height:28px; border-radius:50%; background:var(--emerald-light); color:var(--emerald); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:0.8rem;">
                  <i class="fa-solid fa-user-shield"></i>
                </div>
                <div style="font-size:0.82rem;">
                  <div style="font-weight:600; color:var(--text-main);">Access Authorization Active</div>
                  <div style="color:var(--text-muted); margin-top:2px;">Consent grant active for Dr. Sarah Chen.</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Role Badge Indicator -->
        <div class="badge ${getRoleBadgeClass(user ? user.role : '')}" style="font-size:0.8rem; padding:0.35rem 0.75rem;">
          <i class="fa-solid fa-circle" style="font-size:0.5rem;"></i>
          <span>${user ? user.role : 'Guest'}</span>
        </div>

        ${user ? `
          <!-- Change Password -->
          <button id="topbar-change-password-btn" class="btn btn-secondary btn-sm" title="Change Password">
            <i class="fa-solid fa-key"></i>
            <span>Password</span>
          </button>
        ` : ''}

        <!-- User Logout -->
        <button id="topbar-logout-btn" class="btn btn-secondary btn-sm" title="Log out">
          <i class="fa-solid fa-arrow-right-from-bracket"></i>
          <span>Logout</span>
        </button>
      </div>
    </header>
  `;
}

function getRoleBadgeClass(role) {
  switch (role) {
    case 'Admin': return 'badge-danger';
    case 'Doctor': return 'badge-info';
    case 'Lab Technician': return 'badge-warning';
    case 'Patient': return 'badge-normal';
    default: return 'badge-info';
  }
}
