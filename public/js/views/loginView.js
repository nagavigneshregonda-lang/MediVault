/**
 * Split-Screen Authentication View
 */

import api from '../api.js';
import Store from '../store.js';
import { showToast } from '../components/toast.js';

export function renderLoginView() {
  return `
    <div class="auth-split-container">
      <!-- Left Illustration & Brand Showcase -->
      <div class="auth-brand-side">
        <div>
          <a href="#landing" style="display:inline-flex; align-items:center; gap:0.75rem; color:white; text-decoration:none;">
            <div style="width:42px; height:42px; border-radius:12px; background:linear-gradient(135deg, #0ea5a4 0%, #10b981 100%); display:flex; align-items:center; justify-content:center; font-size:1.3rem;">
              <i class="fa-solid fa-heart-pulse"></i>
            </div>
            <span style="font-family:'Poppins', sans-serif; font-size:1.5rem; font-weight:700;">MediVault</span>
          </a>
        </div>

        <div style="max-width: 520px; margin: 3rem 0;">
          <div class="badge" style="background:rgba(255,255,255,0.15); color:white; margin-bottom:1.25rem;">
            <i class="fa-solid fa-lock"></i> HIPAA-inspired security practices
          </div>
          <h2 style="font-size: 2.5rem; line-height: 1.25; margin-bottom: 1.25rem; color: #ffffff;">
            Secure Electronic Health Records at Scale
          </h2>
          <p style="color: rgba(255, 255, 255, 0.8); font-size: 1.05rem; line-height: 1.6;">
            Access comprehensive longitudinal patient timelines, track diagnostic trends, manage dynamic doctor authorizations, and prescribe safely with allergy cross-conflict detection.
          </p>
        </div>

        <div style="display:flex; gap:2rem; font-size:0.85rem; color:rgba(255,255,255,0.65);">
          <span><i class="fa-solid fa-circle-check" style="color:#10b981; margin-right:6px;"></i> Role-based RBAC</span>
          <span><i class="fa-solid fa-circle-check" style="color:#10b981; margin-right:6px;"></i> Audit Trails</span>
          <span><i class="fa-solid fa-circle-check" style="color:#10b981; margin-right:6px;"></i> Printable Rx</span>
        </div>
      </div>

      <!-- Right Form & 1-Click Demo Logins -->
      <div class="auth-form-side">
        <div style="width: 100%; max-width: 440px;">
          <div style="margin-bottom: 2rem;">
            <h2 style="font-size: 1.85rem; margin-bottom: 0.35rem;">Clinical Portal Sign In</h2>
            <p style="color: var(--text-muted); font-size: 0.92rem;">Enter your credentials or choose a quick role demo</p>
          </div>

          <form id="login-form">
            <div class="form-group">
              <label for="login-email">Email Address</label>
              <div style="position:relative;">
                <input type="email" id="login-email" class="form-control" placeholder="name@medivault.com" required style="padding-left:2.5rem;">
                <i class="fa-regular fa-envelope" style="position:absolute; left:1rem; top:50%; transform:translateY(-50%); color:var(--text-light);"></i>
              </div>
            </div>

            <div class="form-group">
              <label for="login-password">Password</label>
              <div style="position:relative;">
                <input type="password" id="login-password" class="form-control" placeholder="••••••••" required style="padding-left:2.5rem; padding-right:2.5rem;">
                <i class="fa-solid fa-key" style="position:absolute; left:1rem; top:50%; transform:translateY(-50%); color:var(--text-light);"></i>
                <button type="button" id="toggle-password-btn" style="position:absolute; right:1rem; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--text-light); cursor:pointer;">
                  <i class="fa-regular fa-eye" id="password-eye-icon"></i>
                </button>
              </div>
            </div>

            <button type="submit" id="login-submit-btn" class="btn btn-primary" style="width:100%; padding:0.8rem; margin-top:0.75rem;">
              <i class="fa-solid fa-right-to-bracket"></i> Sign In to Account
            </button>
          </form>

          <!-- 1-Click Role Demo Auto-fill -->
          <div style="margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 1.5rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
              <span style="font-size:0.82rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">
                Instant Role-Based Demo Logins
              </span>
            </div>

            <div class="demo-account-pills">
              <div class="demo-pill" data-email="admin@medivault.com" data-pass="Admin@123">
                <div style="font-weight:600; font-size:0.88rem; color:var(--text-main); display:flex; align-items:center; gap:0.4rem;">
                  <i class="fa-solid fa-user-shield" style="color:var(--rose);"></i> Admin
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted);">Audit & Users</div>
              </div>

              <div class="demo-pill" data-email="doctor@medivault.com" data-pass="Doctor@123">
                <div style="font-weight:600; font-size:0.88rem; color:var(--text-main); display:flex; align-items:center; gap:0.4rem;">
                  <i class="fa-solid fa-user-doctor" style="color:var(--primary);"></i> Doctor
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted);">Dr. Marcus Vance</div>
              </div>

              <div class="demo-pill" data-email="patient@medivault.com" data-pass="Patient@123">
                <div style="font-weight:600; font-size:0.88rem; color:var(--text-main); display:flex; align-items:center; gap:0.4rem;">
                  <i class="fa-solid fa-bed-pulse" style="color:var(--emerald);"></i> Patient
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted);">Eleanor Vance</div>
              </div>

              <div class="demo-pill" data-email="lab@medivault.com" data-pass="Lab@123">
                <div style="font-weight:600; font-size:0.88rem; color:var(--text-main); display:flex; align-items:center; gap:0.4rem;">
                  <i class="fa-solid fa-flask" style="color:var(--amber);"></i> Lab Tech
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted);">Alex Thorne</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function initLoginListeners() {
  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('login-email');
  const passInput = document.getElementById('login-password');
  const togglePassBtn = document.getElementById('toggle-password-btn');
  const eyeIcon = document.getElementById('password-eye-icon');
  const submitBtn = document.getElementById('login-submit-btn');

  if (togglePassBtn && passInput) {
    togglePassBtn.addEventListener('click', () => {
      const isPassword = passInput.type === 'password';
      passInput.type = isPassword ? 'text' : 'password';
      eyeIcon.className = isPassword ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
    });
  }

  // Handle Demo Pill clicks
  document.querySelectorAll('.demo-pill').forEach(pill => {
    pill.addEventListener('click', async () => {
      const email = pill.getAttribute('data-email');
      const pass = pill.getAttribute('data-pass');
      emailInput.value = email;
      passInput.value = pass;
      
      // Auto-submit for smooth UX
      form.dispatchEvent(new Event('submit'));
    });
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const password = passInput.value;

      if (!email || !password) {
        showToast('Please enter both email and password.', 'warning');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';

      try {
        const data = await api.login(email, password);
        Store.setUser(data.user, data.token);
        showToast(`Welcome back, ${data.user.name}!`, 'success');

        // Redirect to dashboard (adaptive dashboard renders role-specific Patient Dashboard for patients)
        window.location.hash = '#dashboard';
      } catch (err) {
        showToast(err.message || 'Login failed. Please check credentials.', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In to Account';
      }
    });
  }
}

