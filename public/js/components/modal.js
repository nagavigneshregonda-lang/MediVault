/**
 * Dynamic Modal & Dialog Component
 */

let activeModalOverlay = null;

export function openModal({ title, bodyHtml, footerHtml = '', maxWidth = '650px', onClose = null }) {
  closeModal();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'app-active-modal';

  overlay.innerHTML = `
    <div class="modal-box" style="max-width: ${maxWidth}">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="icon-btn modal-close-btn" style="border:none; width:32px; height:32px;">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="modal-body">
        ${bodyHtml}
      </div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>
  `;

  document.body.appendChild(overlay);
  activeModalOverlay = overlay;

  // Animate in
  requestAnimationFrame(() => {
    overlay.classList.add('active');
  });

  const closeHandler = () => {
    overlay.classList.remove('active');
    setTimeout(() => {
      overlay.remove();
      if (activeModalOverlay === overlay) activeModalOverlay = null;
      if (onClose) onClose();
    }, 250);
  };

  overlay.querySelector('.modal-close-btn').addEventListener('click', closeHandler);

  // Click outside backdrop
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeHandler();
  });

  return {
    element: overlay,
    close: closeHandler
  };
}

export function closeModal() {
  if (activeModalOverlay) {
    activeModalOverlay.classList.remove('active');
    setTimeout(() => {
      if (activeModalOverlay) {
        activeModalOverlay.remove();
        activeModalOverlay = null;
      }
    }, 250);
  }
}

export function openConfirm({ title = 'Confirm Action', message, confirmText = 'Confirm', confirmClass = 'btn-danger', onConfirm }) {
  openModal({
    title,
    maxWidth: '450px',
    bodyHtml: `
      <div style="display:flex; gap:1rem; align-items:flex-start;">
        <div style="width:40px; height:40px; border-radius:50%; background:var(--rose-light); color:var(--rose); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <p style="font-size:0.95rem; line-height:1.5;">${message}</p>
      </div>
    `,
    footerHtml: `
      <button class="btn btn-secondary cancel-confirm-btn">Cancel</button>
      <button class="btn ${confirmClass} do-confirm-btn">${confirmText}</button>
    `
  });

  const modalEl = document.getElementById('app-active-modal');
  if (modalEl) {
    modalEl.querySelector('.cancel-confirm-btn').addEventListener('click', closeModal);
    modalEl.querySelector('.do-confirm-btn').addEventListener('click', () => {
      closeModal();
      if (onConfirm) onConfirm();
    });
  }
}

