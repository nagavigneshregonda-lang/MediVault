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
 */
export function renderEmptyState(iconClass, title, message, actionHtml = '') {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">
        <i class="fa-solid ${iconClass}"></i>
      </div>
      <h3>${title}</h3>
      <p>${message}</p>
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

