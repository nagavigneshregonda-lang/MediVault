/**
 * Sidebar Navigation Component
 */

import Store from '../store.js';

export function renderSidebar(activeRoute = 'dashboard') {
  const user = Store.state.user;
  if (!user) return '';

  const role = user.role;
  const initials = user.name
    .replace(/^Dr\.\s+/i, '')
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Navigation Items by Role
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', hash: '#dashboard', roles: ['Admin', 'Doctor', 'Patient', 'Lab Technician'] },
    { id: 'patients', label: role === 'Patient' ? 'My Health Record' : 'Patients Directory', icon: 'fa-hospital-user', hash: role === 'Patient' ? (user.patientCode ? `#patient/${user.patientCode}` : '#dashboard') : '#patients', roles: ['Admin', 'Doctor', 'Patient'] },
    { id: 'tests', label: 'Diagnostic Lab', icon: 'fa-flask-vial', hash: '#tests', roles: ['Admin', 'Doctor', 'Lab Technician'] },
    { id: 'access', label: 'Authorized Access', icon: 'fa-shield-halved', hash: '#access', roles: ['Patient', 'Doctor', 'Admin'] },
    { id: 'audit', label: 'Audit Trail', icon: 'fa-clock-rotate-left', hash: '#audit', roles: ['Admin'] },
    { id: 'users', label: 'User Management', icon: 'fa-users-gear', hash: '#users', roles: ['Admin'] }
  ];

  const visibleItems = navItems.filter(item => item.roles.includes(role));

  return `
    <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
    <aside class="app-sidebar" id="main-sidebar">
      <div class="sidebar-header">
        <a href="#dashboard" class="logo-badge">
          <div class="icon-box">
            <i class="fa-solid fa-heart-pulse"></i>
          </div>
          <span>MediVault</span>
        </a>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-section-title">Clinical Navigation</div>
        ${visibleItems.map(item => `
          <a href="${item.hash}" class="nav-item ${activeRoute === item.id ? 'active' : ''}">
            <i class="fa-solid ${item.icon}"></i>
            <span>${item.label}</span>
          </a>
        `).join('')}

        <div class="nav-section-title" style="margin-top:1.5rem;">System & Help</div>
        <a href="#landing" class="nav-item">
          <i class="fa-solid fa-globe"></i>
          <span>Public Portal</span>
        </a>
      </nav>

      <div class="sidebar-footer">
        <div class="sidebar-user" title="${user.name} (${user.role})">
          <div class="user-avatar">${initials}</div>
          <div class="user-info">
            <div class="name">${user.name}</div>
            <div class="role-badge">${user.role}</div>
          </div>
          <button id="sidebar-logout-btn" class="icon-btn" style="width:32px; height:32px; background:transparent; border:none; flex-shrink:0;" title="Sign Out">
            <i class="fa-solid fa-arrow-right-from-bracket"></i>
          </button>
        </div>
      </div>
    </aside>
  `;
}
