/**
 * Centralized Utility Functions for Formatting, Greetings, and UI States
 */

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Format date string into "28 Jan 2026"
 */
export function formatDate(dateString) {
  if (!dateString) return '--';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const day = String(d.getDate()).padStart(2, '0');
    const month = MONTH_NAMES[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch (e) {
    return dateString;
  }
}

/**
 * Format datetime string into "28 Jan 2026, 10:30 AM"
 */
export function formatDateTime(dateString) {
  if (!dateString) return '--';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const day = String(d.getDate()).padStart(2, '0');
    const month = MONTH_NAMES[d.getMonth()];
    const year = d.getFullYear();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${day} ${month} ${year}, ${timeStr}`;
  } catch (e) {
    return dateString;
  }
}

/**
 * Role-aware greeting: Prefix "Dr." ONLY for Doctor role; never for Admin/Patient/Lab Tech.
 */
export function getRoleGreeting(user) {
  const hour = new Date().getHours();
  let timeGreeting = 'Good morning';
  if (hour >= 12 && hour < 17) timeGreeting = 'Good afternoon';
  else if (hour >= 17) timeGreeting = 'Good evening';

  if (!user || !user.name) return timeGreeting;

  // Clean raw name in case it contains title prefix
  const cleanName = user.name.replace(/^Dr\.\s+/i, '').trim();
  const nameParts = cleanName.split(' ').filter(Boolean);
  const firstName = nameParts[0] || 'User';
  const lastName = nameParts[nameParts.length - 1] || firstName;

  if (user.role === 'Doctor') {
    return `${timeGreeting}, Dr. ${lastName}`;
  } else {
    // Admin, Patient, Lab Tech must NEVER see "Dr."
    return `${timeGreeting}, ${firstName}`;
  }
}

/**
 * Render animated table loading skeletons
 */
export function renderSkeletonTable(rows = 5, cols = 6) {
  let html = '';
  for (let r = 0; r < rows; r++) {
    html += '<tr>';
    for (let c = 0; c < cols; c++) {
      html += `<td><div class="skeleton skeleton-row" style="width: ${c === 0 ? '75%' : '60%'};"></div></td>`;
    }
    html += '</tr>';
  }
  return html;
}

/**
 * Render clean empty state
 * Supports both signatures:
 * - renderEmptyState(iconClass, title, message, actionHtml)
 * - renderEmptyState(title, message, actionHtml)
 */
export function renderEmptyState(arg1, arg2, arg3, arg4) {
  let iconClass = 'fa-folder-open';
  let title = '';
  let message = '';
  let actionHtml = '';

  if (typeof arg3 === 'string' || typeof arg4 === 'string') {
    iconClass = (arg1 && typeof arg1 === 'string' && arg1.startsWith('fa-')) ? arg1 : (arg1 || 'fa-folder-open');
    title = arg2 || '';
    message = arg3 || '';
    actionHtml = arg4 || '';
  } else {
    if (typeof arg1 === 'string' && arg1.startsWith('fa-')) {
      iconClass = arg1;
      title = arg2 || '';
      message = '';
      actionHtml = '';
    } else {
      title = arg1 || '';
      message = arg2 || '';
      actionHtml = typeof arg3 === 'string' ? arg3 : '';
    }
  }

  // Never allow literal "undefined" or "null" to be rendered
  if (!iconClass || iconClass === 'undefined' || iconClass === 'null') iconClass = 'fa-folder-open';
  if (!title || title === 'undefined' || title === 'null') title = '';
  if (!message || message === 'undefined' || message === 'null') message = '';
  if (!actionHtml || actionHtml === 'undefined' || actionHtml === 'null') actionHtml = '';

  return `
    <div class="empty-state">
      <div class="empty-state-icon">
        <i class="fa-solid ${iconClass}"></i>
      </div>
      ${title ? `<h3>${title}</h3>` : ''}
      ${message ? `<p>${message}</p>` : ''}
      ${actionHtml}
    </div>
  `;
}

/**
 * Render error state with retry action
 */
export function renderErrorState(message, retryBtnId = 'retry-fetch-btn') {
  return `
    <div class="error-state">
      <div style="font-size:2rem; margin-bottom:0.75rem;"><i class="fa-solid fa-triangle-exclamation"></i></div>
      <h3 style="font-size:1.15rem; margin-bottom:0.35rem;">Unable to Load Data</h3>
      <p style="font-size:0.9rem; margin-bottom:1rem; opacity:0.9;">${message}</p>
      <button id="${retryBtnId}" class="btn btn-secondary btn-sm" style="background:var(--bg-surface);">
        <i class="fa-solid fa-rotate-right"></i> Try Again
      </button>
    </div>
  `;
}

