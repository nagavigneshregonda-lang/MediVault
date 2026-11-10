/**
 * Self-Service Patient Portal Account Activation View
 */

import api from '../api.js';
import { showToast } from '../components/toast.js';

export function renderActivateView() {
  return `
    <div class="auth-split-container">
      <!-- Left Illustration & Security Assurance -->
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
            <i class="fa-solid fa-shield-halved"></i> Verified Identity Activation
          </div>
          <h2 style="font-size: 2.5rem; line-height: 1.25; margin-bottom: 1.25rem; color: #ffffff;">
            Activate Your Patient Portal Access
          </h2>
          <p style="color: rgba(255, 255, 255, 0.85); font-size: 1.05rem; line-height: 1.6;">
            Registered clinical patients can safely verify their records using their hospital-issued Patient ID, Date of Birth, and registered email address to set up digital access credentials.
          </p>
        </div>

        <div style="display:flex; flex-direction:column; gap:0.9rem; font-size:0.88rem; color:rgba(255,255,255,0.75);">
          <span><i class="fa-solid fa-lock" style="color:#10b981; margin-right:8px;"></i> 3-Point Credential Verification</span>
          <span><i class="fa-solid fa-user-shield" style="color:#10b981; margin-right:8px;"></i> Encrypted Record Association</span>
          <span><i class="fa-solid fa-clock-rotate-left" style="color:#10b981; margin-right:8px;"></i> Immutable Security Audit Logging</span>
        </div>
      </div>

      <!-- Right Activation Form -->
      <div class="auth-form-side">
        <div style="width: 100%; max-width: 460px;">
          <div style="margin-bottom: 1.75rem;">
            <h2 style="font-size: 1.85rem; margin-bottom: 0.35rem;">Activate Patient Account</h2>
            <p style="color: var(--text-muted); font-size: 0.92rem;">
              Enter your clinical registration details to create your secure portal login
            </p>
          </div>

          <form id="activate-form">
            <div class="form-group">
              <label for="act-patient-id">Hospital Patient ID *</label>
              <div style="position:relative;">
                <input type="text" id="act-patient-id" class="form-control" placeholder="e.g. MV-2026-0059" required style="padding-left:2.5rem; text-transform:uppercase;">
                <i class="fa-solid fa-id-card" style="position:absolute; left:1rem; top:50%; transform:translateY(-50%); color:var(--text-light);"></i>
              </div>
              <small style="color:var(--text-muted); font-size:0.75rem;">Found on your clinical appointment slip, discharge summary, or lab report</small>
            </div>

            <div class="form-group">
              <label for="act-dob">Date of Birth *</label>
              <div style="position:relative;">
                <input type="date" id="act-dob" class="form-control" required style="padding-left:2.5rem;">
                <i class="fa-regular fa-calendar" style="position:absolute; left:1rem; top:50%; transform:translateY(-50%); color:var(--text-light);"></i>
              </div>
            </div>

            <div class="form-group">
              <label for="act-email">Registered Email Address *</label>
              <div style="position:relative;">
                <input type="email" id="act-email" class="form-control" placeholder="your.email@example.com" required style="padding-left:2.5rem;">
                <i class="fa-regular fa-envelope" style="position:absolute; left:1rem; top:50%; transform:translateY(-50%); color:var(--text-light);"></i>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="act-password">Create Password *</label>
                <div style="position:relative;">
                  <input type="password" id="act-password" class="form-control" placeholder="Min 6 characters" minlength="6" required style="padding-left:2.5rem;">
                  <i class="fa-solid fa-key" style="position:absolute; left:1rem; top:50%; transform:translateY(-50%); color:var(--text-light);"></i>
                </div>
              </div>

              <div class="form-group">
                <label for="act-confirm-password">Confirm Password *</label>
                <div style="position:relative;">
                  <input type="password" id="act-confirm-password" class="form-control" placeholder="Re-enter password" minlength="6" required style="padding-left:2.5rem;">
                  <i class="fa-solid fa-check-double" style="position:absolute; left:1rem; top:50%; transform:translateY(-50%); color:var(--text-light);"></i>
                </div>
              </div>
            </div>

            <button type="submit" id="activate-submit-btn" class="btn btn-primary" style="width:100%; padding:0.8rem; margin-top:0.75rem;">
              <i class="fa-solid fa-id-card-clip"></i> Verify & Activate Account
            </button>
          </form>

          <div style="margin-top: 1.5rem; text-align: center; border-top: 1px solid var(--border-color); padding-top: 1.25rem;">
            <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 0.5rem;">
              Already have an activated account?
            </p>
            <a href="#login" class="btn btn-secondary btn-sm" style="display:inline-flex; align-items:center; gap:0.4rem;">
              <i class="fa-solid fa-arrow-left"></i> Return to Sign In
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function initActivateListeners() {
  const form = document.getElementById('activate-form');
  const patientIdInput = document.getElementById('act-patient-id');
  const dobInput = document.getElementById('act-dob');
  const emailInput = document.getElementById('act-email');
  const passwordInput = document.getElementById('act-password');
  const confirmPasswordInput = document.getElementById('act-confirm-password');
  const submitBtn = document.getElementById('activate-submit-btn');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const patient_id = patientIdInput.value.trim().toUpperCase();
      const dob = dobInput.value;
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const confirmPassword = confirmPasswordInput.value;

      if (!patient_id || !dob || !email || !password) {
        showToast('Please fill out all required fields.', 'warning');
        return;
      }

      if (password !== confirmPassword) {
        showToast('Passwords do not match. Please re-enter.', 'warning');
        return;
      }

      if (password.length < 6) {
        showToast('Password must be at least 6 characters.', 'warning');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying Clinical Records...';

      try {
        await api.activatePatient({
          patient_id,
          dob,
          email,
          password
        });

        showToast('Account successfully activated! Please sign in with your credentials.', 'success');
        
        // Redirect to login after brief moment
        setTimeout(() => {
          window.location.hash = '#login';
        }, 1200);
      } catch (err) {
        showToast(err.message || 'Account activation failed. Please verify your details.', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-id-card-clip"></i> Verify & Activate Account';
      }
    });
  }
}
