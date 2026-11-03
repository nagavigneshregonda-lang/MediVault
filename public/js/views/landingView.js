/**
 * Public Landing Page View
 */

import Store from '../store.js';

export function renderLandingView() {
  const isAuth = Store.isAuthenticated();

  return `
    <div style="min-height: 100vh; display: flex; flex-direction: column;">
      <!-- Public Top Bar -->
      <header class="glass" style="height: 70px; padding: 0 2.5rem; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div style="width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #0ea5a4 0%, #10b981 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 1.25rem;">
            <i class="fa-solid fa-heart-pulse"></i>
          </div>
          <span style="font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 1.35rem; letter-spacing: -0.02em;">MediVault</span>
        </div>

        <div style="display: flex; align-items: center; gap: 1rem;">
          <button id="landing-theme-toggle" class="icon-btn" title="Toggle Theme">
            <i class="fa-solid ${Store.state.theme === 'dark' ? 'fa-sun' : 'fa-moon'}"></i>
          </button>
          ${isAuth ? `
            <a href="#dashboard" class="btn btn-primary">
              <i class="fa-solid fa-gauge"></i> Open Dashboard
            </a>
          ` : `
            <a href="#login" class="btn btn-primary">
              <i class="fa-solid fa-right-to-bracket"></i> Sign In to Portal
            </a>
          `}
        </div>
      </header>

      <!-- Hero Section with ECG Pulse -->
      <section class="landing-hero">
        <div style="max-width: 850px; margin: 0 auto; z-index: 2;">
          <div class="badge badge-normal" style="padding: 0.45rem 1rem; font-size: 0.85rem; margin-bottom: 1.5rem; border: 1px solid rgba(16, 185, 129, 0.3);">
            <i class="fa-solid fa-shield-check"></i> Next-Gen Enterprise Healthcare Record System
          </div>
          <h1 style="font-size: 3.2rem; line-height: 1.2; font-weight: 800; margin-bottom: 1.25rem;">
            Unified Clinical Records. <br>
            <span style="background: linear-gradient(135deg, #0ea5a4 0%, #10b981 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Patient-Controlled Access.</span>
          </h1>
          <p style="font-size: 1.15rem; color: var(--text-muted); max-width: 680px; margin: 0 auto 2rem; line-height: 1.6;">
            MediVault empowers hospitals, physicians, lab specialists, and patients with real-time electronic health records, automated drug allergy warnings, diagnostic flagging, and zero-trust consent access.
          </p>

          <!-- Animated Heartbeat Line -->
          <svg class="heartbeat-svg" viewBox="0 0 500 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 50 H120 L135 15 L150 85 L165 30 L180 65 L190 50 H300 L315 20 L330 90 L345 50 H500" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>

          <div style="display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap; margin-top: 1.5rem;">
            <a href="#login" class="btn btn-primary btn-lg">
              <i class="fa-solid fa-hospital-user"></i> Access Clinical Portal
            </a>
            <a href="#dashboard" class="btn btn-secondary btn-lg">
              <i class="fa-solid fa-chart-line"></i> View Live System Demo
            </a>
          </div>
        </div>
      </section>

      <!-- Key Capabilities Section -->
      <section style="padding: 5rem 2rem; max-width: 1200px; margin: 0 auto; width: 100%;">
        <div style="text-align: center; margin-bottom: 3.5rem;">
          <h2 style="font-size: 2.2rem; margin-bottom: 0.5rem;">Engineered for Clinical Excellence</h2>
          <p style="color: var(--text-muted); font-size: 1.05rem;">Integrated tools tailored for every stakeholder in the medical care ecosystem</p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 2rem;">
          <div class="glass-card" style="padding: 2rem;">
            <div style="width: 50px; height: 50px; border-radius: 12px; background: rgba(14, 165, 164, 0.15); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 1.25rem;">
              <i class="fa-solid fa-id-card-clip"></i>
            </div>
            <h3 style="font-size: 1.2rem; margin-bottom: 0.75rem;">Patient Identity & Vitals</h3>
            <p style="color: var(--text-muted); font-size: 0.92rem; line-height: 1.6;">
              Unique alphanumeric patient IDs (MV-2026-XXXX), automated age and BMI calculators, emergency contacts, and duplicate prevention.
            </p>
          </div>

          <div class="glass-card" style="padding: 2rem;">
            <div style="width: 50px; height: 50px; border-radius: 12px; background: rgba(16, 185, 129, 0.15); color: var(--emerald); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 1.25rem;">
              <i class="fa-solid fa-pills"></i>
            </div>
            <h3 style="font-size: 1.2rem; margin-bottom: 0.75rem;">Smart Rx with Allergy Check</h3>
            <p style="color: var(--text-muted); font-size: 0.92rem; line-height: 1.6;">
              Detects real-time cross-reactive drug conflicts (Penicillins, Sulfas, NSAIDs). Includes clinical printable prescription stylesheets.
            </p>
          </div>

          <div class="glass-card" style="padding: 2rem;">
            <div style="width: 50px; height: 50px; border-radius: 12px; background: rgba(245, 158, 11, 0.15); color: var(--amber); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 1.25rem;">
              <i class="fa-solid fa-microscope"></i>
            </div>
            <h3 style="font-size: 1.2rem; margin-bottom: 0.75rem;">Automated Diagnostic Flags</h3>
            <p style="color: var(--text-muted); font-size: 0.92rem; line-height: 1.6;">
              Diagnostic test tracking with automatic evaluation against reference ranges, assigning Normal, High, Low, or Critical warning flags.
            </p>
          </div>

          <div class="glass-card" style="padding: 2rem;">
            <div style="width: 50px; height: 50px; border-radius: 12px; background: rgba(99, 102, 241, 0.15); color: var(--indigo); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 1.25rem;">
              <i class="fa-solid fa-user-lock"></i>
            </div>
            <h3 style="font-size: 1.2rem; margin-bottom: 0.75rem;">Patient Consent Authorization</h3>
            <p style="color: var(--text-muted); font-size: 0.92rem; line-height: 1.6;">
              Patients grant or revoke doctors' record access with dynamic expiration dates. Doctors without explicit access are blocked at the database level.
            </p>
          </div>
        </div>
      </section>

      <!-- Security & Regulatory Highlights -->
      <section class="glass" style="padding: 4rem 2rem; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);">
        <div style="max-width: 1100px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 2rem;">
          <div>
            <h3 style="font-size: 1.6rem; margin-bottom: 0.5rem;">Bank-Grade Healthcare Security</h3>
            <p style="color: var(--text-muted); max-width: 600px;">
              Every view, update, access grant, and diagnostic record modification is permanently logged with IP address and timestamps into an immutable Audit Trail.
            </p>
          </div>
          <div style="display: flex; gap: 1.5rem; flex-wrap: wrap;">
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: 700; color: var(--primary);">256-Bit</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">JWT Signed Tokens</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: 700; color: var(--emerald);">100%</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">Parameterized Queries</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 1.8rem; font-weight: 700; color: var(--indigo);">Zero</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">Unauthorized Access</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Footer -->
      <footer style="padding: 2.5rem; text-align: center; color: var(--text-muted); font-size: 0.9rem; margin-top: auto;">
        <p>© 2026 MediVault Healthcare Record Management System. Built for high-reliability medical informatics.</p>
      </footer>
    </div>
  `;
}

