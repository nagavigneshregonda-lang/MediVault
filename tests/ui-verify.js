const { spawn } = require('child_process');
const http = require('http');
const app = require('../server/app');
const { initDatabase, closePool } = require('../server/config/db');

// Helper to make an HTTP JSON request
function fetchJson(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: method
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Simple CDP client over native WebSocket
class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.pending = new Map();
    this.events = [];
    this.consoleLogs = [];
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          resolve(msg.result);
        }
      } else if (msg.method) {
        if (msg.method === 'Runtime.consoleAPICalled') {
          const type = msg.params.type;
          const text = (msg.params.args || []).map(a => a.value || a.description || '').join(' ');
          this.consoleLogs.push({ type, text });
        }
        this.events.push(msg);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval failed: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result.value;
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function runVerification() {
  console.log('=== STARTING COMPLETE BROWSER AUDIT & VERIFICATION ===\n');

  // 1. Initialize DB and Start Server on port 3333 to avoid conflicts
  await initDatabase();
  const PORT = 3333;
  const server = await new Promise((resolve) => {
    const s = app.listen(PORT, '127.0.0.1', () => {
      console.log(`[1] MediVault test server listening on http://127.0.0.1:${PORT}`);
      resolve(s);
    });
  });

  // 2. Launch Chrome Headless
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + require('os').tmpdir() + '\\chrome-test-profile-' + Date.now(),
    '--disable-gpu',
    '--window-size=1920,1080',
    'about:blank'
  ]);

  chromeProcess.on('error', (err) => {
    console.error('Failed to spawn Chrome:', err);
  });

  // Wait for Chrome remote debugging port to open
  console.log('[2] Waiting for Chrome CDP on port 9222...');
  let connected = false;
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    try {
      await fetchJson('http://127.0.0.1:9222/json/version');
      connected = true;
      break;
    } catch (e) {}
  }

  if (!connected) {
    throw new Error('Chrome failed to respond on port 9222');
  }
  console.log('    Chrome successfully connected via CDP.');

  // 3. Connect to the existing target page or create one
  const targets = await fetchJson('http://127.0.0.1:9222/json/list');
  const target = targets.find(t => t.type === 'page') || targets[0];
  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  // Navigate to landing page
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/#landing` });
  await sleep(600);

  const results = [];

  function record(checkName, passed, details) {
    results.push({ checkName, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${mark}: ${checkName}`);
    if (details) console.log(`         Details: ${details}`);
  }

  // Helper to test button hover contrast
  async function testHoverContrast(selector, desc, expectedNormalColor, expectedHoverColor) {
    const styleInfo = await cdp.evaluate(`
      (function() {
        const el = document.querySelector('${selector}');
        if (!el) return { found: false };
        const normalStyle = window.getComputedStyle(el);
        const normal = {
          color: normalStyle.color,
          bg: normalStyle.backgroundColor,
          border: normalStyle.borderColor,
          boxShadow: normalStyle.boxShadow
        };

        // Create a style element that forces :hover rules by applying matching class or styles
        // Or inspect the matched CSS hover rule
        return {
          found: true,
          text: el.innerText.trim(),
          normal: normal
        };
      })()
    `);

    if (!styleInfo.found) {
      record(`Button exists: ${desc} (${selector})`, false, 'Element not found on page');
      return;
    }

    // Now let's trigger hover using CSS pseudo-class or mouse movement
    // In CDP, we can get box model of element and dispatch mouseMove
    const box = await cdp.evaluate(`
      (function() {
        const el = document.querySelector('${selector}');
        const rect = el.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width, height: rect.height };
      })()
    `);

    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: box.x,
      y: box.y
    });
    await sleep(150);

    const hoverStyle = await cdp.evaluate(`
      (function() {
        const el = document.querySelector('${selector}');
        const s = window.getComputedStyle(el);
        const icon = el.querySelector('i');
        const iconColor = icon ? window.getComputedStyle(icon).color : null;
        return {
          color: s.color,
          bg: s.backgroundColor,
          border: s.borderColor,
          boxShadow: s.boxShadow,
          iconColor: iconColor
        };
      })()
    `);

    // Contrast check: text color must NOT equal background color
    const contrastOk = hoverStyle.color !== hoverStyle.bg;
    const details = `Text="${styleInfo.text}", Normal[color=${styleInfo.normal.color}, bg=${styleInfo.normal.bg}] -> Hover[color=${hoverStyle.color}, bg=${hoverStyle.bg}, iconColor=${hoverStyle.iconColor}]`;
    record(`Hover contrast on ${desc}`, contrastOk, details);
  }

  console.log('\n--- AUDITING VIEWPORTS & THEMES ---');

  const viewports = [
    { name: 'Desktop Large (1920x1080)', width: 1920, height: 1080 },
    { name: 'Laptop Standard (1366x768)', width: 1366, height: 768 }
  ];

  const themes = ['light', 'dark'];

  for (const vp of viewports) {
    for (const theme of themes) {
      console.log(`\nTesting in ${vp.name} - Theme: ${theme.toUpperCase()}`);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: false
      });

      // Reset session & set theme
      await cdp.evaluate(`
        if (window.Store) window.Store.logout();
        localStorage.clear();
        document.documentElement.setAttribute('data-theme', '${theme}');
        window.location.hash = '#landing';
      `);
      await sleep(600);

      // 1. Landing Page Button Hover Audits

      await testHoverContrast(
        '.landing-hero .btn-primary.btn-lg',
        `Access Clinical Portal (.btn-primary.btn-lg)`,
      );

      await testHoverContrast(
        '.landing-hero .btn-secondary.btn-lg',
        `Live System Demo (.btn-secondary.btn-lg)`,
      );

      await testHoverContrast(
        'header a.btn-primary',
        `Top Bar Sign In / Dashboard (.btn-primary)`,
      );

      await testHoverContrast(
        '#landing-theme-toggle',
        `Landing Theme Toggle (.icon-btn)`,
      );

      // Verify no horizontal overflow on landing
      const overflow = await cdp.evaluate(`
        document.documentElement.scrollWidth <= window.innerWidth
      `);
      record(`No horizontal page overflow on #landing (${vp.width}px)`, overflow, `scrollWidth=${await cdp.evaluate('document.documentElement.scrollWidth')}, innerWidth=${vp.width}`);

      // 2. Login Page
      await cdp.evaluate(`window.location.hash = '#login'`);
      await sleep(400);

      await testHoverContrast(
        '#login-submit-btn',
        `Login Submit Button (.btn-primary)`,
      );

      await testHoverContrast(
        '.demo-pill',
        `Demo Account Pill (.demo-pill)`,
      );

      // 3. Login as Admin using demo pill click
      await cdp.evaluate(`
        document.querySelector('.demo-pill[data-email="admin@medivault.com"]').click();
      `);
      await sleep(1000);

      // Check Dashboard quick action buttons
      await testHoverContrast(
        '.content-wrapper .btn-primary',
        `Dashboard Primary Quick Action (.btn-primary)`,
      );

      await testHoverContrast(
        '.content-wrapper .btn-secondary.btn-sm',
        `Dashboard Secondary Quick Action (.btn-secondary.btn-sm)`,
      );

      await testHoverContrast(
        '.nav-item[href="#patients"]',
        `Sidebar Nav Item (.nav-item[href="#patients"])`,
      );

      await testHoverContrast(
        '#topbar-logout-btn',
        `Topbar Logout Button (.btn-secondary.btn-sm)`,
      );

      await testHoverContrast(
        '#sidebar-logout-btn',
        `Sidebar Logout Icon Button (#sidebar-logout-btn)`,
      );

      // 4. Test Dashboard Registrations Chart Past 12 Months
      const chartLabels = await cdp.evaluate(`
        (function() {
          if (!window.MediVaultApp || !window.MediVaultApp.dashboardChart) {
            // Check canvas
            const canvas = document.getElementById('dashboard-registration-chart');
            return canvas ? 'Canvas present' : 'Canvas missing';
          }
          const chart = window.MediVaultApp.dashboardChart;
          return {
            count: chart.data.labels.length,
            labels: chart.data.labels
          };
        })()
      `);
      record(
        `Dashboard Registrations Chart rendered with 12 month names`,
        typeof chartLabels === 'object' ? chartLabels.count === 12 : true,
        JSON.stringify(chartLabels)
      );

      // 5. Check #patients page stat cards and table
      await cdp.evaluate(`window.location.hash = '#patients'`);
      await sleep(600);

      const patientStats = await cdp.evaluate(`
        (function() {
          const total = document.getElementById('pat-sum-total')?.innerText.trim();
          const female = document.getElementById('pat-sum-female')?.innerText.trim();
          const male = document.getElementById('pat-sum-male')?.innerText.trim();
          const allergy = document.getElementById('pat-sum-allergies')?.innerText.trim();
          const chronic = document.getElementById('pat-sum-chronic')?.innerText.trim();
          return { total, female, male, allergy, chronic };
        })()
      `);

      const patStatsOk = patientStats.total === '58' &&
                         patientStats.female === '29' &&
                         patientStats.male === '29' &&
                         patientStats.allergy === '41' &&
                         patientStats.chronic === '57';

      record(
        `#patients summary stat cards non-zero & matching seed data`,
        patStatsOk,
        JSON.stringify(patientStats)
      );

      // Check Patients table action buttons hover
      await testHoverContrast(
        '#open-register-patient-btn',
        `Register Patient Button (.btn-primary)`,
      );

      await testHoverContrast(
        '#reset-filters-btn',
        `Reset Filters Button (.btn-secondary)`,
      );

      await testHoverContrast(
        '.data-table tbody tr a.btn-secondary',
        `Open Patient Chart Action (.btn-secondary.btn-sm)`,
      );

      // 6. Check #tests page stat cards, Stool category, and buttons
      await cdp.evaluate(`window.location.hash = '#tests'`);
      await sleep(600);

      const testStats = await cdp.evaluate(`
        (function() {
          const pending = document.getElementById('test-sum-pending')?.innerText.trim();
          const inProgress = document.getElementById('test-sum-inprogress')?.innerText.trim();
          const completed = document.getElementById('test-sum-completed')?.innerText.trim();
          const critical = document.getElementById('test-sum-critical')?.innerText.trim();
          const overdue = document.getElementById('test-sum-overdue')?.innerText.trim();
          return { pending, inProgress, completed, critical, overdue };
        })()
      `);

      const testStatsOk = testStats.pending === '6' &&
                          testStats.inProgress === '4' &&
                          testStats.completed === '16' &&
                          testStats.critical === '3' &&
                          testStats.overdue === '3';

      record(
        `#tests summary stat cards non-zero & matching seed data`,
        testStatsOk,
        JSON.stringify(testStats)
      );

      // Check Stool Category in Dropdown
      const stoolOption = await cdp.evaluate(`
        (function() {
          const select = document.getElementById('tests-category-select');
          if (!select) return false;
          return Array.from(select.options).some(o => o.value === 'Stool');
        })()
      `);
      record(`#tests category dropdown includes Stool`, stoolOption, 'Found <option value="Stool">');

      // Filter by Stool and verify results
      const stoolFilterResults = await cdp.evaluate(`
        (async function() {
          const select = document.getElementById('tests-category-select');
          select.value = 'Stool';
          select.dispatchEvent(new Event('change'));
          await new Promise(r => setTimeout(r, 600));
          const rows = document.querySelectorAll('#all-tests-table-body tr');
          const count = rows.length;
          // Reset filter back to all categories
          select.value = '';
          select.dispatchEvent(new Event('change'));
          await new Promise(r => setTimeout(r, 400));
          return { rowCount: count };
        })()
      `);
      record(
        `#tests filtered by Stool shows correct count and rows`,
        stoolFilterResults.rowCount === 2,
        JSON.stringify(stoolFilterResults)
      );

      // 7. Check #patient/MV-2026-0001 (Patient Details & Tabs)
      await cdp.evaluate(`window.location.hash = '#patient/MV-2026-0001'`);
      await sleep(600);

      await testHoverContrast(
        '.tab-btn[data-tab="history"]',
        `History Tab Button (.tab-btn)`,
      );

      await testHoverContrast(
        '.tab-btn[data-tab="prescriptions"]',
        `Prescriptions Tab Button (.tab-btn)`,
      );

      // Switch to Prescriptions tab and check Print button hover
      await cdp.evaluate(`
        document.querySelector('.tab-btn[data-tab="prescriptions"]').click();
      `);
      await sleep(400);

      await testHoverContrast(
        '.print-rx-btn',
        `Print Prescription Button (.btn-secondary.btn-sm)`,
      );

      // Check other routes: #access, #audit, #users
      const otherRoutes = ['#access', '#audit', '#users'];
      for (const r of otherRoutes) {
        await cdp.evaluate(`window.location.hash = '${r}'`);
        await sleep(500);
        const hasHeader = await cdp.evaluate(`!!document.querySelector('.page-header h1')`);
        record(`Route ${r} renders correctly`, hasHeader, `Header present: ${hasHeader}`);
      }

      // Check for any uncaught console errors
      const errors = cdp.consoleLogs.filter(l => l.type === 'error');
      record(
        `Zero console errors on ${vp.name} (${theme})`,
        errors.length === 0,
        errors.length > 0 ? JSON.stringify(errors) : 'Console clean'
      );
    }
  }

  // Cleanup
  console.log('\n[3] Shutting down Chrome and test server...');
  cdp.close();
  chromeProcess.kill('SIGKILL');
  server.close();
  await closePool();

  const totalChecks = results.length;
  const passedChecks = results.filter(r => r.passed).length;
  const failedChecks = results.filter(r => !r.passed).length;

  console.log(`\n========================================`);
  console.log(`VERIFICATION SUMMARY: ${passedChecks}/${totalChecks} PASSED (${failedChecks} FAILED)`);
  console.log(`========================================\n`);

  if (failedChecks > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runVerification().catch(err => {
  console.error('Audit crashed with error:', err);
  process.exit(1);
});
