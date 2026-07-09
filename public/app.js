(function () {
  'use strict';

  const API = '/api';
  const VEHICLE_NUMBER_PATTERN = '[A-Za-z]{2}[0-9]{1,2}[A-Za-z]{1,3}[0-9]{4}|[0-9]{2}[Bb][Hh][0-9]{4}[A-Za-z]{1,2}';
  const VEHICLE_NUMBER_TITLE = 'Format: KA01AB1234 (or BH-series like 22BH1234AB)';
  const EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
  const DELETE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/><path d="M10 11v6M14 11v6"/></svg>';
  const EYE_OPEN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.6 20.6 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a20.6 20.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';

  function pwdFieldHtml(label, name, opts) {
    opts = opts || {};
    const attrs = [
      'type="password"',
      'name="' + name + '"',
      opts.id ? 'id="' + opts.id + '"' : '',
      opts.required ? 'required' : '',
      opts.minlength ? 'minlength="' + opts.minlength + '"' : '',
      opts.placeholder ? 'placeholder="' + esc(opts.placeholder) + '"' : '',
      opts.title ? 'title="' + esc(opts.title) + '"' : '',
      opts.autocomplete ? 'autocomplete="' + opts.autocomplete + '"' : '',
    ].filter(Boolean).join(' ');
    return (
      '<div class="field"><label>' + esc(label) + '</label>' +
      '<div class="pwd-wrap"><input ' + attrs + ' />' +
      '<button type="button" class="pwd-toggle-btn" tabindex="-1" aria-label="Show password">' + EYE_OPEN_ICON + '</button></div></div>'
    );
  }

  const state = {
    token: localStorage.getItem('wc_token') || null,
    role: localStorage.getItem('wc_role') || null,
    user: JSON.parse(localStorage.getItem('wc_user') || 'null'),
    loginRole: 'client',
    view: 'landing',
    clientTab: 'home',
    adminTab: 'overview',
    customerTab: 'vehicles',
    data: null, // role-specific dashboard payload
    staff: null,
    payments: null,
    adminClients: null,
    clientRequests: null,
    adminOverview: null,
    clientComplaints: null,
    customerComplaints: null,
    customerBookings: null,
    clientBookings: null,
    customerSearch: '',
    staffSearch: '',
    paymentsSearch: '',
    reportsSearch: '',
    adminBusinessSearch: '',
  };

  const $app = document.getElementById('app');
  const $toasts = document.getElementById('toast-container');

  // ---------------- API helper ----------------
  let sessionExpiring = false;
  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    const res = await fetch(API + path, Object.assign({}, opts, { headers }));
    let data = {};
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (res.status === 401 && state.token) {
      if (!sessionExpiring) {
        sessionExpiring = true;
        setTimeout(() => { sessionExpiring = false; }, 1000);
        logout();
      }
      throw new Error('Your session expired — please log in again.');
    }
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  }

  let lastToastKey = '';
  let lastToastAt = 0;
  function toast(message, type) {
    const now = Date.now();
    const key = message + '|' + type;
    if (key === lastToastKey && now - lastToastAt < 1500) return;
    lastToastKey = key;
    lastToastAt = now;
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = message;
    $toasts.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function money(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }

  function initials(name) {
    return String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }

  function vehicleIconHtml(type, size) {
    const isCar = type === 'Car';
    return '<span class="vtype-badge ' + (isCar ? 'car' : 'bike') + ' vtype-' + (size || 'md') + '">' + (isCar ? '🚗' : '🛵') + '</span>';
  }

  function ovCardHtml(icon, value, label) {
    return '<div class="overview-card"><div class="ov-icon">' + icon + '</div><div class="ov-value">' + value + '</div><div class="ov-label">' + esc(label) + '</div></div>';
  }

  function monthGroupedPaymentsHtml(payments, rowFn) {
    if (payments.length === 0) {
      return '<div class="card"><div class="empty-state"><div class="empty-icon">💳</div>No payments recorded yet.</div></div>';
    }
    const groups = new Map();
    payments.forEach((p) => {
      if (!groups.has(p.month)) groups.set(p.month, []);
      groups.get(p.month).push(p);
    });
    const months = [...groups.keys()].sort().reverse();
    return months.map((m) => {
      const rows = groups.get(m);
      const monthTotal = rows.reduce((sum, p) => sum + p.amount, 0);
      return (
        '<div class="month-group">' +
          '<div class="month-group-header"><span>' + esc(monthLabel(m)) + '</span><span class="month-group-total">' + money(monthTotal) + '</span></div>' +
          '<div class="card">' + rows.map(rowFn).join('') + '</div>' +
        '</div>'
      );
    }).join('');
  }

  function monthLabel(monthStr) {
    if (!monthStr) return '';
    const [y, m] = monthStr.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function logout() {
    state.token = null; state.role = null; state.user = null; state.data = null;
    state.view = 'login';
    localStorage.removeItem('wc_token'); localStorage.removeItem('wc_role'); localStorage.removeItem('wc_user');
    render();
  }

  function saveSession(token, role, user) {
    state.token = token; state.role = role; state.user = user;
    localStorage.setItem('wc_token', token);
    localStorage.setItem('wc_role', role);
    localStorage.setItem('wc_user', JSON.stringify(user));
  }

  // ---------------- Modal ----------------
  function openModal(title, bodyHtml, onMount) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal-box">' +
        '<div class="modal-header"><h3>' + esc(title) + '</h3><button class="modal-close" data-close>✕</button></div>' +
        '<div class="modal-body">' + bodyHtml + '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.hasAttribute('data-close')) overlay.remove(); });
    if (onMount) onMount(overlay);
    return overlay;
  }

  function disableUntilDirty(form) {
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    const snapshot = () => JSON.stringify([...new FormData(form).entries()]);
    const initial = snapshot();
    btn.disabled = true;
    form.addEventListener('input', () => { btn.disabled = snapshot() === initial; });
    form.addEventListener('change', () => { btn.disabled = snapshot() === initial; });
  }

  function showSendConfirmation(overlay, waLink, smsLink, onDone) {
    const body = overlay.querySelector('.modal-body');
    body.innerHTML =
      '<div style="text-align:center; padding: 8px 0 4px;">' +
        '<div style="font-size:34px; margin-bottom:10px;">✅</div>' +
        '<p style="font-size:13.5px; color:var(--text-muted); margin-bottom:18px;">Send a WhatsApp or SMS notification now?</p>' +
        '<div style="display:flex; gap:10px;">' +
          '<a href="' + waLink + '" target="_blank" rel="noopener" class="btn btn-primary" style="flex:1;">💬 WhatsApp</a>' +
          '<a href="' + smsLink + '" target="_blank" rel="noopener" class="btn btn-outline" style="flex:1;">✉️ SMS</a>' +
        '</div>' +
        '<button class="btn btn-ghost btn-block" id="confirm-done-btn" style="margin-top:10px;">Skip</button>' +
      '</div>';
    body.querySelector('#confirm-done-btn').addEventListener('click', () => { overlay.remove(); onDone(); });
    body.querySelectorAll('a.btn').forEach((a) => {
      a.addEventListener('click', () => setTimeout(() => { overlay.remove(); onDone(); }, 200));
    });
  }

  function openSendConfirmationModal(title, waLink, smsLink, onDone) {
    const overlay = openModal(title, '<div></div>');
    showSendConfirmation(overlay, waLink, smsLink, onDone);
  }

  // ---------------- Root render ----------------
  function render() {
    if (state.view === 'set-password') return renderSetPassword();
    if (!state.token) {
      return state.view === 'login' ? renderLogin() : renderLanding();
    }
    if (state.role === 'superadmin') return renderAdminShell();
    if (state.role === 'client') return renderClientShell();
    if (state.role === 'customer') return renderCustomerShell();
  }

  // ================= LANDING =================
  const LANDING_FEATURES = [
    { icon: '💰', title: 'Dues Tracked Automatically', body: 'Every vehicle’s subscription is tracked month by month — arrears carry forward automatically, no spreadsheets.' },
    { icon: '💬', title: 'WhatsApp & SMS Reminders', body: 'One-tap payment reminders and receipts via wa.me and SMS deep links — no messaging API bills.' },
    { icon: '👥', title: 'Built for Every Role', body: 'Business owners, staff, and customers each get a dashboard scoped to exactly what they need.' },
    { icon: '📊', title: 'Real-Time Dashboard', body: 'Collections, pending dues, and full payment history — always current, always one tap away.' },
  ];

  const LANDING_STEPS = [
    { n: '1', title: 'Register your business', body: 'Sign up in a minute with your phone number and area — we generate your login username for you.' },
    { n: '2', title: 'Add customers & vehicles', body: 'Log bikes and cars with a monthly plan amount. Everyone gets a WhatsApp/SMS link to set their own password.' },
    { n: '3', title: 'Collect and remind', body: 'Record payments as they come in, and tap to send WhatsApp reminders for anything overdue.' },
  ];

  const HERO_ILLUSTRATION_HTML =
    '<div class="vehicle-tile bike-tile"><img src="/images/hero-bike-wash.jpg" alt="Motorcycle being washed" loading="lazy" /></div>' +
    '<div class="vehicle-tile car-tile"><img src="/images/hero-car-wash.jpg" alt="Car being washed" loading="lazy" /></div>';

  const TRUST_BADGES = [
    '✓ No setup fees', '✓ No messaging API costs', '✓ Live in under 5 minutes',
  ];

  function renderLanding() {
    $app.innerHTML =
      '<div class="landing premium-bg">' +
        '<nav class="landing-nav">' +
          '<div class="landing-brand">🛞 Wheel<span class="grad-text">Care</span></div>' +
          '<button class="btn btn-outline-light btn-sm" id="nav-login-btn">Log In</button>' +
        '</nav>' +
        '<section class="landing-hero">' +
          '<div class="landing-kicker">VEHICLE CARE SUBSCRIPTION PLATFORM</div>' +
          '<h1 class="landing-headline">Run your <span class="grad-text">vehicle care</span> subscription business like a pro</h1>' +
          '<p class="landing-sub">Track monthly dues, send WhatsApp reminders with one tap, and manage customers, staff and payments — all from one dashboard.</p>' +
          '<div class="landing-cta-row">' +
            '<button class="btn btn-primary" id="get-started-btn">Get Started Free</button>' +
            '<button class="btn btn-outline-light" id="hero-login-btn">I already have an account</button>' +
          '</div>' +
          '<div class="trust-badge-row">' +
            TRUST_BADGES.map((t) => '<span class="trust-badge">' + esc(t) + '</span>').join('') +
          '</div>' +
          '<div class="hero-stage"><div class="hero-illustration">' + HERO_ILLUSTRATION_HTML + '</div></div>' +
        '</section>' +
        '<section class="landing-steps">' +
          '<div class="landing-kicker center">GET STARTED</div>' +
          '<h2 class="landing-section-title">How it works</h2>' +
          '<div class="steps-grid">' +
            LANDING_STEPS.map((s) =>
              '<div class="glass-card step-card"><div class="step-num">' + s.n + '</div>' +
              '<h3>' + esc(s.title) + '</h3><p>' + esc(s.body) + '</p></div>'
            ).join('') +
          '</div>' +
        '</section>' +
        '<section class="landing-features">' +
          '<div class="landing-kicker center">CAPABILITIES</div>' +
          '<h2 class="landing-section-title">Everything you need</h2>' +
          '<div class="feature-grid">' +
            LANDING_FEATURES.map((f) =>
              '<div class="glass-card feature-card"><div class="feature-icon">' + f.icon + '</div>' +
              '<h3>' + esc(f.title) + '</h3><p>' + esc(f.body) + '</p></div>'
            ).join('') +
          '</div>' +
        '</section>' +
        '<section class="landing-cta-band">' +
          '<div class="glass-card cta-band-card">' +
            '<h2>Ready to run your business on WheelCare?</h2>' +
            '<p>Set up your business, add your first customer, and send your first reminder — all in the next five minutes.</p>' +
            '<button class="btn btn-primary" id="cta-band-btn">Get Started Free</button>' +
          '</div>' +
        '</section>' +
        '<footer class="landing-footer">' +
          '<p>WheelCare — built for community vehicle wash &amp; maintenance businesses.</p>' +
          '<p>Developed by Praveen Kumar Athyala</p>' +
          '<button class="link-btn" id="admin-login-btn">Platform admin login</button>' +
        '</footer>' +
      '</div>';

    const goToLogin = (role) => { state.loginRole = role; state.view = 'login'; render(); };
    document.getElementById('nav-login-btn').addEventListener('click', () => goToLogin('client'));
    document.getElementById('hero-login-btn').addEventListener('click', () => goToLogin('client'));
    document.getElementById('get-started-btn').addEventListener('click', () => goToLogin('client'));
    document.getElementById('cta-band-btn').addEventListener('click', () => goToLogin('client'));
    document.getElementById('admin-login-btn').addEventListener('click', () => goToLogin('superadmin'));
  }

  // ================= LOGIN =================
  const ROLE_HINTS = {
    client: 'Demo username: praveen · password: password123',
    customer: 'Demo username: anita · password: password123',
    superadmin: 'Demo username: admin · password: password123',
  };
  const ROLE_LABELS = { client: 'Business', customer: 'Customer', superadmin: 'Super Admin' };

  function renderLogin(errorMsg) {
    $app.innerHTML =
      '<div class="auth-screen premium-bg">' +
        '<button class="auth-back-link" id="auth-back-btn">← Back</button>' +
        '<div class="auth-center">' +
          '<div class="auth-badge-glow">🛞</div>' +
          '<h1 class="auth-brand">Wheel<span class="grad-text">Care</span></h1>' +
          '<p class="auth-tagline">Monthly bike &amp; car wash subscriptions for your community.</p>' +
          '<div class="glass-card auth-card-dark">' +
            '<div class="role-tabs" id="role-tabs">' +
              Object.keys(ROLE_LABELS).map((r) =>
                '<button class="role-tab' + (state.loginRole === r ? ' active' : '') + '" data-role="' + r + '">' + ROLE_LABELS[r] + '</button>'
              ).join('') +
            '</div>' +
            (errorMsg ? '<div class="auth-error">' + esc(errorMsg) + '</div>' : '') +
            '<form id="login-form">' +
              '<div class="field"><label>Username</label><input id="login-username" required autocomplete="username" /></div>' +
              pwdFieldHtml('Password', 'password', { id: 'login-password', required: true, autocomplete: 'current-password' }) +
              '<button type="submit" class="btn btn-primary btn-block">Log In</button>' +
            '</form>' +
            '<div class="auth-links">' +
              (state.loginRole === 'client' ? '<button class="link-btn" id="register-business-btn">Register your business</button>' : '<span></span>') +
              '<button class="link-btn" id="forgot-password-btn">Forgot password?</button>' +
            '</div>' +
            '<div class="auth-hint">' + ROLE_HINTS[state.loginRole] + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.getElementById('auth-back-btn').addEventListener('click', () => {
      state.view = 'landing';
      render();
    });

    document.getElementById('role-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.role-tab');
      if (!btn) return;
      state.loginRole = btn.dataset.role;
      renderLogin();
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      try {
        const result = await api('/login', { method: 'POST', body: JSON.stringify({ role: state.loginRole, username, password }) });
        saveSession(result.token, result.role, result.user);
        toast('Welcome back, ' + (result.user.name || result.user.businessName || result.user.username) + '!', 'success');
        render();
      } catch (err) {
        renderLogin(err.message);
      }
    });

    const registerBtn = document.getElementById('register-business-btn');
    if (registerBtn) registerBtn.addEventListener('click', openRegisterBusinessModal);
    document.getElementById('forgot-password-btn').addEventListener('click', openForgotPasswordModal);
  }

  function openForgotPasswordModal() {
    const role = state.loginRole;
    const html =
      '<form id="forgot-password-form">' +
        '<div class="field"><label>Username</label><input name="username" required /></div>' +
        '<div class="field"><label>Phone</label><div class="phone-input-group"><span class="phone-prefix">+91</span><input name="phone" required pattern="[6-9][0-9]{9}" title="Enter a valid 10-digit mobile number" inputmode="numeric" placeholder="10-digit number" /></div></div>' +
        pwdFieldHtml('New Password', 'newPassword', { required: true, minlength: 6, title: 'At least 6 characters' }) +
        '<button type="submit" class="btn btn-primary btn-block">Reset Password</button>' +
      '</form>';
    const overlay = openModal('Forgot Password', html, (ov) => {
      ov.querySelector('#forgot-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
          await api('/forgot-password', {
            method: 'POST',
            body: JSON.stringify({
              role, username: f.get('username'), phone: f.get('phone'), newPassword: f.get('newPassword'),
            }),
          });
          toast('Password reset — you can log in now', 'success');
          overlay.remove();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  function renderSetPassword() {
    const role = state.setPasswordRole;
    const token = state.setPasswordToken;
    if (!role || !token) {
      state.view = 'login';
      return renderLogin();
    }
    // Opening a set-password link is always a fresh, explicit action —
    // drop any stale session so a stored login doesn't hijack the flow.
    if (state.token) { state.token = null; state.role = null; state.user = null; state.data = null; }
    localStorage.removeItem('wc_token'); localStorage.removeItem('wc_role'); localStorage.removeItem('wc_user');
    $app.innerHTML =
      '<div class="auth-screen premium-bg">' +
        '<div class="auth-center">' +
          '<div class="auth-badge-glow">🛞</div>' +
          '<h1 class="auth-brand">Wheel<span class="grad-text">Care</span></h1>' +
          '<p class="auth-tagline">Set your account password to finish signing in.</p>' +
          '<div class="glass-card auth-card-dark">' +
            '<form id="set-password-form">' +
              pwdFieldHtml('New Password', 'password', { required: true, minlength: 6, autocomplete: 'new-password' }) +
              pwdFieldHtml('Confirm Password', 'confirm', { required: true, minlength: 6, autocomplete: 'new-password' }) +
              '<button type="submit" class="btn btn-primary btn-block">Set Password &amp; Continue</button>' +
            '</form>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.getElementById('set-password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('set-password-form').password.value;
      const confirm = document.getElementById('set-password-form').confirm.value;
      if (password !== confirm) {
        toast('Passwords do not match', 'error');
        return;
      }
      try {
        const result = await api('/set-password', { method: 'POST', body: JSON.stringify({ role, token, password }) });
        toast('Password set! Log in as ' + result.username, 'success');
        state.view = 'login';
        state.loginRole = role;
        location.hash = '#/login?role=' + role;
        render();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  function openRegisterBusinessModal() {
    const html =
      '<form id="register-business-form">' +
        '<div class="field"><label>Business Name</label><input name="businessName" required /></div>' +
        '<div class="field"><label>Owner Name</label><input name="ownerName" required /></div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Phone</label><div class="phone-input-group"><span class="phone-prefix">+91</span><input name="phone" required pattern="[6-9][0-9]{9}" title="Enter a valid 10-digit mobile number" inputmode="numeric" placeholder="10-digit number" /></div></div>' +
          '<div class="field"><label>Area</label><input name="area" placeholder="Sunrise Residency" /></div>' +
        '</div>' +
        '<p style="font-size:12px;color:var(--text-muted);margin:-4px 0 16px;">Once approved, we\'ll generate your login username and send you a WhatsApp/SMS link to set your password.</p>' +
        '<button type="submit" class="btn btn-primary btn-block">Submit Request</button>' +
      '</form>';
    const overlay = openModal('Register Your Business', html, (ov) => {
      ov.querySelector('#register-business-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
          await api('/client-requests', {
            method: 'POST',
            body: JSON.stringify({
              businessName: f.get('businessName'), ownerName: f.get('ownerName'),
              phone: f.get('phone'), area: f.get('area'),
            }),
          });
          toast('Request submitted! We’ll notify you once approved.', 'success');
          overlay.remove();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  // ================= SHELL =================
  const CLIENT_TABS = [
    { id: 'home', icon: '🏠', label: 'Home' },
    { id: 'customers', icon: '👥', label: 'Customers' },
    { id: 'bookings', icon: '📅', label: 'Bookings' },
    { id: 'staff', icon: '🧰', label: 'Staff' },
    { id: 'payments', icon: '💳', label: 'Payments' },
    { id: 'reports', icon: '📷', label: 'Reports' },
    { id: 'profile', icon: '⚙️', label: 'Profile' },
  ];
  const ADMIN_TABS = [
    { id: 'overview', icon: '📊', label: 'Overview' },
    { id: 'businesses', icon: '🏢', label: 'Businesses' },
  ];
  const CUSTOMER_TABS = [
    { id: 'vehicles', icon: '🏠', label: 'Vehicles' },
    { id: 'bookings', icon: '📅', label: 'Bookings' },
    { id: 'payments', icon: '💳', label: 'Payments' },
    { id: 'reports', icon: '📷', label: 'Reports' },
  ];

  function shellHtml(subtitle, tabs, activeId) {
    const name = state.user ? (state.user.businessName || state.user.name || state.user.username) : '';
    return (
      '<div class="app-shell">' +
        '<header class="topbar">' +
          '<div class="topbar-left"><div class="logo-dot">🛞</div><div><div class="topbar-title">WheelCare</div><div class="topbar-sub">' + esc(subtitle) + '</div></div></div>' +
          '<div class="topbar-right"><span class="topbar-user">' + esc(name) + '</span><button class="icon-btn" id="logout-btn">Logout</button></div>' +
        '</header>' +
        '<main class="content' + (tabs ? ' with-sidebar' : ' no-bottom-pad') + '" id="content"><div class="loading-spinner">Loading…</div></main>' +
        (tabs ? bottomNavHtml(tabs, activeId) : '') +
      '</div>'
    );
  }

  function bottomNavHtml(tabs, activeId) {
    return '<nav class="bottom-nav sidebar-nav" id="bottom-nav">' +
      tabs.map((t) =>
        '<button class="nav-item' + (activeId === t.id ? ' active' : '') + '" data-tab="' + t.id + '">' +
          '<span class="nav-icon">' + t.icon + '</span><span>' + t.label + '</span>' +
        '</button>'
      ).join('') +
      '<div class="sidebar-footer">' +
        '<div class="sidebar-footer-illustration"><span>🏍️</span><span>🚗</span></div>' +
        '<div class="sidebar-footer-brand">Wheel<span class="grad-text">Care</span></div>' +
        '<div class="sidebar-footer-tag">Vehicle care, simplified.</div>' +
      '</div>' +
    '</nav>';
  }

  function bindShellEvents(onTabChange, tabStateKey) {
    document.getElementById('logout-btn').addEventListener('click', logout);
    const nav = document.getElementById('bottom-nav');
    if (nav) {
      nav.addEventListener('click', (e) => {
        const btn = e.target.closest('.nav-item');
        if (!btn) return;
        state[tabStateKey] = btn.dataset.tab;
        onTabChange();
      });
    }
  }

  // ================= CLIENT =================
  async function renderClientShell() {
    $app.innerHTML = shellHtml('Business Dashboard', CLIENT_TABS, state.clientTab);
    bindShellEvents(renderClientTab, 'clientTab');
    await loadClientData();
    if (!state.token) return;
    renderClientTab();
  }

  async function loadClientData() {
    try {
      state.data = await api('/client/data');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function renderClientTab() {
    const nav = document.getElementById('bottom-nav');
    if (nav) {
      nav.querySelectorAll('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === state.clientTab));
    }
    if (state.clientTab === 'home') return renderClientHome();
    if (state.clientTab === 'customers') return renderClientCustomers();
    if (state.clientTab === 'bookings') return renderClientBookings();
    if (state.clientTab === 'staff') return renderClientStaff();
    if (state.clientTab === 'payments') return renderClientPayments();
    if (state.clientTab === 'reports') return renderClientReports();
    if (state.clientTab === 'profile') return renderClientProfile();
  }

  function renderReportsList() {
    const list = document.getElementById('reports-list');
    const complaints = state.clientComplaints || [];
    const q = state.reportsSearch.trim().toLowerCase();
    const filtered = q
      ? complaints.filter((c) => c.customerName.toLowerCase().includes(q) || c.vehicleNumber.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
      : complaints;

    list.innerHTML = filtered.length === 0
      ? '<div class="card"><div class="empty-state"><div class="empty-icon">' + (q ? '🔍' : '📷') + '</div>' + (q ? 'No reports match your search.' : 'No reports from customers yet.') + '</div></div>'
      : filtered.map((c) => complaintCardHtml(c, { showCustomer: true, canRespond: c.status !== 'resolved' })).join('');

    list.querySelectorAll('.complaint-respond-form').forEach((form) => {
      const photoBox = bindMultiPhotoInput(form.querySelector('.respond-photo-input'), form.querySelector('.respond-photo-preview'));

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
          await api('/client/complaints/' + form.dataset.complaintId + '/respond', {
            method: 'POST',
            body: JSON.stringify({ response: f.get('response'), photos: photoBox.photos }),
          });
          toast('Response sent', 'success');
          renderClientReports();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  async function renderClientReports() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading-spinner">Loading…</div>';
    try {
      const result = await api('/client/complaints');
      state.clientComplaints = result.complaints;
    } catch (err) {
      toast(err.message, 'error');
      return;
    }
    const complaints = state.clientComplaints || [];
    const openCount = complaints.filter((c) => c.status !== 'resolved').length;

    content.innerHTML =
      '<div class="section-header"><h3>Service Reports<span class="count-badge">' + openCount + ' open</span></h3></div>' +
      (complaints.length > 1 ? '<div class="field"><input type="search" id="reports-search" placeholder="Search by customer, vehicle number or description…" value="' + esc(state.reportsSearch) + '" /></div>' : '') +
      '<div id="reports-list"></div>';

    renderReportsList();
    const reportsSearchInput = document.getElementById('reports-search');
    if (reportsSearchInput) {
      reportsSearchInput.addEventListener('input', (e) => {
        state.reportsSearch = e.target.value;
        renderReportsList();
      });
    }
  }

  async function renderClientBookings() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading-spinner">Loading…</div>';
    try {
      const result = await api('/client/bookings');
      state.clientBookings = result.bookings;
    } catch (err) {
      toast(err.message, 'error');
      return;
    }
    const bookings = state.clientBookings || [];
    const pendingCount = bookings.filter((b) => b.status === 'pending').length;

    content.innerHTML =
      '<div class="section-header"><h3>Wash Bookings<span class="count-badge">' + pendingCount + ' pending</span></h3></div>' +
      (bookings.length === 0
        ? '<div class="card"><div class="empty-state"><div class="empty-icon">📅</div>No bookings yet.</div></div>'
        : bookings.map((b) => bookingCardHtml(b, { showCustomer: true, canRespond: true })).join(''));

    content.querySelectorAll('[data-accept-booking]').forEach((btn) => {
      btn.addEventListener('click', () => respondBooking(btn.dataset.acceptBooking, 'accepted'));
    });
    content.querySelectorAll('[data-decline-booking]').forEach((btn) => {
      btn.addEventListener('click', () => respondBooking(btn.dataset.declineBooking, 'declined'));
    });
    content.querySelectorAll('[data-complete-booking]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api('/client/bookings/' + btn.dataset.completeBooking + '/complete', { method: 'POST' });
          toast('Booking marked complete', 'success');
          renderClientBookings();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  async function respondBooking(id, status) {
    try {
      await api('/client/bookings/' + id + '/respond', { method: 'POST', body: JSON.stringify({ status }) });
      toast(status === 'accepted' ? 'Booking accepted' : 'Booking declined', 'success');
      renderClientBookings();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function renderClientProfile() {
    const content = document.getElementById('content');
    const d = state.data;
    if (!d) { content.innerHTML = '<div class="loading-spinner">Loading…</div>'; return; }
    const rates = d.client.rates || { Bike: 300, Car: 700 };

    content.innerHTML =
      '<div class="section-header"><h3>Business Profile</h3></div>' +
      '<div class="card">' +
        '<div class="provider-info">' +
          '<div class="provider-avatar">' + esc(initials(d.client.businessName)) + '</div>' +
          '<div><div class="provider-name">' + esc(d.client.businessName) + '</div>' +
          '<div class="provider-meta">Username: ' + esc(state.user.username || '') + '</div></div>' +
        '</div>' +
        '<form id="profile-form" style="margin-top:18px;">' +
          '<div class="field"><label>Owner Name</label><input name="ownerName" required value="' + esc(d.client.ownerName) + '" /></div>' +
          '<div class="form-grid">' +
            '<div class="field"><label>Phone</label><div class="phone-input-group"><span class="phone-prefix">+91</span><input name="phone" required pattern="[6-9][0-9]{9}" title="Enter a valid 10-digit mobile number" inputmode="numeric" value="' + esc(d.client.phone) + '" /></div></div>' +
            '<div class="field"><label>Area</label><input name="area" value="' + esc(d.client.area || '') + '" /></div>' +
          '</div>' +
          '<button type="submit" class="btn btn-outline btn-block">Save Profile</button>' +
        '</form>' +
      '</div>' +
      '<div class="section-header"><h3>Service Rates</h3></div>' +
      '<div class="card">' +
        '<div class="info-note"><span class="in-icon">💡</span>Updating a rate here applies it to every customer\'s vehicle of that type immediately.</div>' +
        '<form id="rates-form">' +
          '<div class="form-grid">' +
            '<div class="field"><label>' + vehicleIconHtml('Bike', 'sm') + 'Bike Rate (₹/mo)</label><input name="Bike" type="text" inputmode="numeric" pattern="[0-9]+" required value="' + esc(rates.Bike) + '" /></div>' +
            '<div class="field"><label>' + vehicleIconHtml('Car', 'sm') + 'Car Rate (₹/mo)</label><input name="Car" type="text" inputmode="numeric" pattern="[0-9]+" required value="' + esc(rates.Car) + '" /></div>' +
          '</div>' +
          '<button type="submit" class="btn btn-primary btn-block">Update Rates for All Vehicles</button>' +
        '</form>' +
      '</div>' +
      '<div class="section-header"><h3>Service Status</h3></div>' +
      '<div class="card">' +
        '<div class="info-note"><span class="in-icon">🚰</span>Pause new vehicle bookings and wash requests temporarily — for example during a water shortage. Existing customers and vehicles are not affected.</div>' +
        '<form id="pause-form">' +
          '<label class="toggle-row">' +
            '<span class="toggle-label">New bookings' + (d.client.servicePaused ? ' <span class="chip chip-due">Paused</span>' : ' <span class="chip chip-paid">Open</span>') + '</span>' +
            '<span class="toggle-switch"><input type="checkbox" name="paused"' + (d.client.servicePaused ? ' checked' : '') + ' /><span class="toggle-track"></span></span>' +
          '</label>' +
          '<div class="field" id="pause-reason-field" style="margin-top:12px;' + (d.client.servicePaused ? '' : 'display:none;') + '">' +
            '<label>Reason shown to customers</label>' +
            '<input name="reason" placeholder="e.g. Temporary water shortage" maxlength="200" value="' + esc(d.client.pauseReason || '') + '" />' +
          '</div>' +
          '<div class="field" style="margin-top:12px;">' +
            '<label>Daily wash booking limit</label>' +
            '<input name="dailyBookingLimit" type="text" inputmode="numeric" pattern="[0-9]+" value="' + esc(d.client.dailyBookingLimit || 100) + '" />' +
            '<p style="font-size:11.5px;color:var(--text-muted);margin-top:5px;">Once this many bookings are made for a day, customers see "No slots available — please try tomorrow."</p>' +
          '</div>' +
          '<button type="submit" class="btn btn-outline btn-block" style="margin-top:14px;">Save Status</button>' +
        '</form>' +
      '</div>';

    disableUntilDirty(content.querySelector('#profile-form'));
    disableUntilDirty(content.querySelector('#rates-form'));

    const pauseToggle = content.querySelector('#pause-form input[name="paused"]');
    const pauseReasonField = content.querySelector('#pause-reason-field');
    pauseToggle.addEventListener('change', () => {
      pauseReasonField.style.display = pauseToggle.checked ? '' : 'none';
    });
    content.querySelector('#pause-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await api('/client/service-status', {
          method: 'PUT',
          body: JSON.stringify({ paused: pauseToggle.checked, reason: f.get('reason'), dailyBookingLimit: f.get('dailyBookingLimit') }),
        });
        toast(pauseToggle.checked ? 'New bookings paused' : 'New bookings resumed', 'success');
        await loadClientData();
        renderClientTab();
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    content.querySelector('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await api('/client/profile', {
          method: 'PUT',
          body: JSON.stringify({ ownerName: f.get('ownerName'), phone: f.get('phone'), area: f.get('area') }),
        });
        toast('Profile updated', 'success');
        await loadClientData();
        renderClientTab();
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    content.querySelector('#rates-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        const result = await api('/client/rates', {
          method: 'PUT',
          body: JSON.stringify({ Bike: f.get('Bike'), Car: f.get('Car') }),
        });
        toast('Rates updated — applied to ' + result.updatedVehicles + ' vehicle(s)', 'success');
        await loadClientData();
        renderClientTab();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  function renderClientHome() {
    const content = document.getElementById('content');
    const d = state.data;
    if (!d) { content.innerHTML = '<div class="loading-spinner">Loading…</div>'; return; }

    content.innerHTML =
      (d.client.servicePaused
        ? '<div class="reminder-digest"><div class="rd-icon">🚰</div>' +
          '<div><div class="rd-title">New bookings are paused</div>' +
          '<div class="rd-sub">Customers see: "' + esc(d.client.pauseReason || 'Not accepting new bookings right now') + '". <a href="#" id="resume-bookings-link" style="color:inherit;text-decoration:underline;">Resume bookings</a></div></div></div>'
        : '') +
      '<div class="hero-banner">' +
        '<div class="month-label">' + esc(monthLabel(d.month)) + '</div>' +
        '<h2>' + esc(d.client.businessName) + '</h2>' +
      '</div>' +
      '<div class="stat-row">' +
        '<div class="stat-card collected"><div class="stat-label">Collected this month</div><div class="stat-value">' + money(d.totalCollected) + '</div></div>' +
        '<div class="stat-card pending"><div class="stat-label">Pending this month</div><div class="stat-value">' + money(d.totalPending) + '</div></div>' +
      '</div>' +
      '<div class="overview-row overview-row-sm">' +
        ovCardHtml('👥', d.totalCustomers, 'Customers') +
        ovCardHtml('🚗', d.totalVehicles, 'Vehicles') +
      '</div>' +
      reminderDigestHtml(d.pendingVehicles) +
      '<div class="section-header"><h3>Payment Due<span class="count-badge">' + d.pendingVehicles.length + '</span></h3>' +
        (d.pendingVehicles.length ? '<button class="btn btn-outline btn-sm" id="remind-all-btn">Remind All</button>' : '') +
      '</div>' +
      '<div class="card">' +
        (d.pendingVehicles.length === 0
          ? '<div class="empty-state"><div class="empty-icon">🎉</div>All vehicles are paid up for this month!</div>'
          : d.pendingVehicles.map(pendingItemHtml).join('')) +
      '</div>' +
      '<div class="section-header"><h3>Recent Payments</h3>' +
        '<button class="link-btn" id="view-all-payments-btn">View all</button>' +
      '</div>' +
      '<div class="card">' +
        (d.recentPayments.length === 0
          ? '<div class="empty-state"><div class="empty-icon">🧾</div>No payments recorded yet.</div>'
          : d.recentPayments.map((p) =>
              '<div class="payment-row clickable-row" data-open-customer="' + vehicleCustomerId(p.vehicleId) + '"><div class="pr-left"><div class="pr-name">' + vehicleIconHtml(p.vehicleType, 'sm') + esc(p.customerName) + ' · ' + esc(p.vehicleNumber) + '</div>' +
              '<div class="pr-sub">' + esc(monthLabel(p.month)) + ' · ' + formatDate(p.date) + '</div></div>' +
              '<div class="pr-right"><div class="pr-amount">' + money(p.amount) + '</div><div class="pr-method">' + esc(p.method) + '</div></div></div>'
            ).join('')) +
      '</div>';

    content.querySelectorAll('[data-remind-wa]').forEach((btn) => {
      btn.addEventListener('click', () => sendReminder(btn.dataset.remindWa, 'wa'));
    });
    content.querySelectorAll('[data-remind-sms]').forEach((btn) => {
      btn.addEventListener('click', () => sendReminder(btn.dataset.remindSms, 'sms'));
    });
    const remindAllBtn = document.getElementById('remind-all-btn');
    if (remindAllBtn) remindAllBtn.addEventListener('click', remindAll);
    document.getElementById('view-all-payments-btn').addEventListener('click', () => {
      state.clientTab = 'payments';
      renderClientTab();
    });
    const resumeLink = document.getElementById('resume-bookings-link');
    if (resumeLink) {
      resumeLink.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await api('/client/service-status', { method: 'PUT', body: JSON.stringify({ paused: false }) });
          toast('New bookings resumed', 'success');
          await loadClientData();
          renderClientTab();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    }
  }

  function reminderDigestHtml(pendingVehicles) {
    if (pendingVehicles.length === 0) return '';
    const notReminded = pendingVehicles.filter((v) => !v.remindedToday).length;
    if (notReminded === 0) {
      return (
        '<div class="reminder-digest done">' +
          '<div class="rd-icon">✅</div>' +
          '<div><div class="rd-title">All caught up</div>' +
          '<div class="rd-sub">Every overdue customer has already been reminded today.</div></div>' +
        '</div>'
      );
    }
    return (
      '<div class="reminder-digest">' +
        '<div class="rd-icon">🔔</div>' +
        '<div><div class="rd-title">' + notReminded + (notReminded === 1 ? ' reminder' : ' reminders') + ' ready to send today</div>' +
        '<div class="rd-sub">We\'ve worked out who\'s overdue — tap once to send them all.</div></div>' +
      '</div>'
    );
  }

  function pendingItemHtml(v) {
    const monthsBadge = v.monthsDue > 1 ? ' <span class="chip chip-amber">' + v.monthsDue + ' months</span>' : '';
    return (
      '<div class="pending-item">' +
        '<div class="pending-info clickable-row" data-open-customer="' + v.customerId + '" style="display:flex; align-items:center;">' + vehicleIconHtml(v.vehicleType, 'md') +
        '<div><div class="pi-name">' + esc(v.customerName) + '</div>' +
        '<div class="pi-sub">' + esc(v.vehicleType) + ' · ' + esc(v.vehicleNumber) + ' · ' + esc(v.flat || '') + ' · ' + money(v.amount) + monthsBadge + '</div></div></div>' +
        (v.remindedToday
          ? '<span class="chip chip-paid">✓ Sent today</span>'
          : '<div class="pending-actions">' +
              '<button class="icon-round wa" title="WhatsApp reminder" data-remind-wa="' + v.vehicleId + '">💬</button>' +
              '<button class="icon-round sms" title="SMS reminder" data-remind-sms="' + v.vehicleId + '">✉️</button>' +
            '</div>') +
      '</div>'
    );
  }

  async function sendReminder(vehicleId, channel) {
    try {
      const { reminder } = await api('/client/reminder/' + vehicleId);
      window.open(channel === 'wa' ? reminder.waLink : reminder.smsLink, '_blank');
      toast('Reminder opened for ' + reminder.customerName, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function remindAll() {
    try {
      const { reminders } = await api('/client/reminders');
      if (!reminders.length) return toast('No pending reminders', 'success');
      reminders.forEach((r, i) => {
        setTimeout(() => window.open(r.waLink, '_blank'), i * 350);
      });
      toast('Opening WhatsApp reminders for ' + reminders.length + ' customer(s)…', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function renderClientCustomers() {
    const content = document.getElementById('content');
    const d = state.data;
    if (!d) { content.innerHTML = '<div class="loading-spinner">Loading…</div>'; return; }

    content.innerHTML =
      '<div class="section-header"><h3>Customers<span class="count-badge" id="customers-count">' + d.customers.length + '</span></h3>' +
        '<button class="btn btn-primary btn-sm" id="add-customer-btn">+ Add Customer</button>' +
      '</div>' +
      '<div class="field"><input type="search" id="customer-search" placeholder="Search by name, flat, phone or vehicle number…" value="' + esc(state.customerSearch) + '" /></div>' +
      '<div id="customers-list"></div>';

    document.getElementById('add-customer-btn').addEventListener('click', openAddCustomerModal);
    const searchInput = document.getElementById('customer-search');
    searchInput.addEventListener('input', (e) => {
      state.customerSearch = e.target.value;
      renderCustomersList();
    });
    renderCustomersList();
  }

  function vehicleCustomerId(vehicleId) {
    if (!state.data) return '';
    const customer = state.data.customers.find((c) => c.vehicles.some((v) => v.id === vehicleId));
    return customer ? customer.id : '';
  }

  function filteredCustomers() {
    const q = state.customerSearch.trim().toLowerCase();
    if (!q) return state.data.customers;
    return state.data.customers.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.flat || '').toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.vehicles.some((v) => v.number.toLowerCase().includes(q))
    );
  }

  function renderCustomersList() {
    const list = document.getElementById('customers-list');
    const customers = filteredCustomers();
    document.getElementById('customers-count').textContent = customers.length;

    list.innerHTML = customers.length === 0
      ? '<div class="card"><div class="empty-state"><div class="empty-icon">' + (state.customerSearch ? '🔍' : '👥') + '</div>' +
        (state.customerSearch ? 'No customers match your search.' : 'No customers yet. Add your first one!') + '</div></div>'
      : '<div class="cards-grid">' + customers.map(customerCardHtml).join('') + '</div>';

    list.querySelectorAll('[data-add-vehicle]').forEach((btn) => {
      btn.addEventListener('click', () => openAddVehicleModal(btn.dataset.addVehicle, btn.dataset.customerName));
    });
    list.querySelectorAll('[data-edit-customer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const customer = state.data.customers.find((c) => c.id === btn.dataset.editCustomer);
        if (customer) openEditCustomerModal(customer);
      });
    });
    list.querySelectorAll('[data-delete-customer]').forEach((btn) => {
      btn.addEventListener('click', () => deleteCustomer(btn.dataset.deleteCustomer, btn.dataset.customerName));
    });
    list.querySelectorAll('[data-edit-vehicle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        for (const customer of state.data.customers) {
          const vehicle = customer.vehicles.find((v) => v.id === btn.dataset.editVehicle);
          if (vehicle) return openEditVehicleModal(vehicle);
        }
      });
    });
    list.querySelectorAll('[data-delete-vehicle]').forEach((btn) => {
      btn.addEventListener('click', () => deleteVehicle(btn.dataset.deleteVehicle, btn.dataset.vehicleNumber));
    });
  }

  async function deleteCustomer(customerId, customerName) {
    if (!window.confirm('Remove ' + customerName + ' and all their vehicles? This cannot be undone.')) return;
    try {
      await api('/client/customers/' + customerId, { method: 'DELETE' });
      toast('Customer removed', 'success');
      await loadClientData();
      renderClientCustomers();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function deleteVehicle(vehicleId, vehicleNumber) {
    if (!window.confirm('Remove vehicle ' + vehicleNumber + '? This cannot be undone.')) return;
    try {
      await api('/client/vehicles/' + vehicleId, { method: 'DELETE' });
      toast('Vehicle removed', 'success');
      await loadClientData();
      renderClientCustomers();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function customerCardHtml(c) {
    return (
      '<div class="card customer-card">' +
        '<div class="cc-top"><div class="clickable-row" data-open-customer="' + c.id + '"><div class="cc-name">' + esc(c.name) + '</div>' +
        '<div class="cc-meta">' + esc(c.flat || '') + ' · ' + esc(c.phone) + '</div></div>' +
        '<div class="cc-actions">' +
          '<button class="link-btn" data-add-vehicle="' + c.id + '" data-customer-name="' + esc(c.name) + '">+ Vehicle</button>' +
          '<button class="icon-action-btn" title="Edit customer" data-edit-customer="' + c.id + '">' + EDIT_ICON + '</button>' +
          '<button class="icon-action-btn danger" title="Delete customer" data-delete-customer="' + c.id + '" data-customer-name="' + esc(c.name) + '">' + DELETE_ICON + '</button>' +
        '</div></div>' +
        '<div class="cc-vehicles">' +
          (c.vehicles.length === 0
            ? '<div style="font-size:12.5px;color:var(--text-muted)">No vehicles added yet</div>'
            : c.vehicles.map(vehicleRowHtml).join('')) +
        '</div>' +
      '</div>'
    );
  }

  function vehicleRowHtml(v) {
    const amount = v.paid ? v.planAmount : v.dueAmount;
    const statusLabel = v.paid ? 'Paid' : (v.monthsDue > 1 ? v.monthsDue + ' months due' : 'Due');
    return (
      '<div class="vehicle-row">' +
        '<div class="vr-info">' + vehicleIconHtml(v.type, 'md') +
        '<div><div class="vr-name">' + esc(v.model || v.type) + '</div><div class="vr-sub">' + esc(v.number) + '</div></div></div>' +
        '<div class="vr-right"><span class="vr-amount">' + money(amount) + '</span>' +
        '<span class="chip ' + (v.paid ? 'chip-paid' : 'chip-due') + '">' + statusLabel + '</span>' +
        '<div class="vr-actions">' +
          '<button class="icon-action-btn sm" title="Edit vehicle" data-edit-vehicle="' + v.id + '">' + EDIT_ICON + '</button>' +
          '<button class="icon-action-btn sm danger" title="Delete vehicle" data-delete-vehicle="' + v.id + '" data-vehicle-number="' + esc(v.number) + '">' + DELETE_ICON + '</button>' +
        '</div></div>' +
      '</div>'
    );
  }

  function openCustomerDetailModal(customerId) {
    const customer = state.data && state.data.customers.find((c) => c.id === customerId);
    if (!customer) return;
    const totalDue = customer.vehicles.reduce((sum, v) => sum + (v.paid ? 0 : v.dueAmount), 0);

    const html =
      '<div class="provider-info">' +
        '<div class="provider-avatar">' + esc(initials(customer.name)) + '</div>' +
        '<div><div class="provider-name">' + esc(customer.name) + '</div>' +
        '<div class="provider-meta">' + esc(customer.flat || '') + (customer.flat ? ' · ' : '') + esc(customer.phone) + '</div></div>' +
      '</div>' +
      '<div class="stat-row" style="margin-top:16px;">' +
        '<div class="stat-card"><div class="stat-label">Vehicles</div><div class="stat-value">' + customer.vehicles.length + '</div></div>' +
        '<div class="stat-card ' + (totalDue > 0 ? 'pending' : 'collected') + '"><div class="stat-label">' + (totalDue > 0 ? 'Total Due' : 'Status') + '</div><div class="stat-value">' + (totalDue > 0 ? money(totalDue) : 'All Paid') + '</div></div>' +
      '</div>' +
      '<div class="divider-label">Vehicles</div>' +
      (customer.vehicles.length
        ? customer.vehicles.map(vehicleRowHtml).join('')
        : '<div class="empty-state" style="padding:12px 0;">No vehicles yet</div>') +
      '<div class="divider-label">Payment History</div>' +
      '<div id="cust-detail-payments"><div class="loading-spinner">Loading…</div></div>' +
      '<div class="divider-label">Service Reports</div>' +
      '<div id="cust-detail-reports"><div class="loading-spinner">Loading…</div></div>' +
      '<div style="display:flex; gap:10px; margin-top:16px;">' +
        '<button class="btn btn-outline" id="cust-detail-edit-btn" style="flex:1;">Edit Customer</button>' +
        '<button class="btn btn-primary" id="cust-detail-vehicle-btn" style="flex:1;">+ Add Vehicle</button>' +
      '</div>';

    const overlay = openModal(customer.name, html, async (ov) => {
      ov.querySelectorAll('[data-edit-vehicle]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const vehicle = customer.vehicles.find((v) => v.id === btn.dataset.editVehicle);
          if (vehicle) { overlay.remove(); openEditVehicleModal(vehicle); }
        });
      });
      ov.querySelectorAll('[data-delete-vehicle]').forEach((btn) => {
        btn.addEventListener('click', () => deleteVehicle(btn.dataset.deleteVehicle, btn.dataset.vehicleNumber));
      });
      ov.querySelector('#cust-detail-edit-btn').addEventListener('click', () => { overlay.remove(); openEditCustomerModal(customer); });
      ov.querySelector('#cust-detail-vehicle-btn').addEventListener('click', () => { overlay.remove(); openAddVehicleModal(customer.id, customer.name); });

      try {
        const [paymentsResult, complaintsResult] = await Promise.all([
          api('/client/payments'),
          api('/client/complaints'),
        ]);
        const custVehicleIds = new Set(customer.vehicles.map((v) => v.id));
        const custPayments = paymentsResult.payments.filter((p) => custVehicleIds.has(p.vehicleId));
        const payBox = ov.querySelector('#cust-detail-payments');
        payBox.innerHTML = custPayments.length
          ? monthGroupedPaymentsHtml(custPayments, (p) =>
              '<div class="payment-row"><div class="pr-left"><div class="pr-name">' + vehicleIconHtml(p.vehicleType, 'sm') + esc(p.vehicleType) + ' · ' + esc(p.vehicleNumber) + '</div>' +
              '<div class="pr-sub">' + formatDate(p.date) + '</div></div>' +
              '<div class="pr-right"><div class="pr-amount">' + money(p.amount) + '</div><div class="pr-method">' + esc(p.method) + '</div></div></div>'
            )
          : '<div class="empty-state" style="padding:12px 0;">No payments yet</div>';

        const custComplaints = complaintsResult.complaints.filter((c) => c.customerId === customerId);
        const repBox = ov.querySelector('#cust-detail-reports');
        repBox.innerHTML = custComplaints.length
          ? custComplaints.map((c) => complaintCardHtml(c, { showCustomer: false, canRespond: c.status !== 'resolved' })).join('')
          : '<div class="empty-state" style="padding:12px 0;">No reports</div>';

        repBox.querySelectorAll('.complaint-respond-form').forEach((form) => {
          const photoBox = bindMultiPhotoInput(form.querySelector('.respond-photo-input'), form.querySelector('.respond-photo-preview'));
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const f = new FormData(e.target);
            try {
              await api('/client/complaints/' + form.dataset.complaintId + '/respond', {
                method: 'POST',
                body: JSON.stringify({ response: f.get('response'), photos: photoBox.photos }),
              });
              toast('Response sent', 'success');
              overlay.remove();
              openCustomerDetailModal(customerId);
            } catch (err) {
              toast(err.message, 'error');
            }
          });
        });
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  function isBookingPaused() {
    return !!(state.data && state.data.client && state.data.client.servicePaused);
  }

  function pausedBookingNoticeHtml() {
    const reason = state.data && state.data.client && state.data.client.pauseReason;
    return '<div class="info-note" style="background:var(--red-light);color:var(--red);">' +
      '<span class="in-icon">🚰</span>New bookings are paused' + (reason ? ': ' + esc(reason) : '.') +
      ' <a href="#" data-go-to-profile style="color:inherit;text-decoration:underline;">Manage in Profile</a></div>';
  }

  function bindGoToProfileLinks(container) {
    container.querySelectorAll('[data-go-to-profile]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const overlay = a.closest('.modal-overlay');
        if (overlay) overlay.remove();
        state.clientTab = 'profile';
        renderClientTab();
      });
    });
  }

  function openAddCustomerModal() {
    const html =
      '<div class="modal-intro">' +
        '<div class="modal-intro-icon" id="add-cust-avatar">👤</div>' +
        '<div class="modal-intro-text">Add a new customer to your business. They\'ll get a WhatsApp/SMS link to set their own password — no need to create one for them.</div>' +
      '</div>' +
      '<form id="add-customer-form">' +
        '<div class="form-section">' +
          '<div class="form-section-title"><span class="fs-num">1</span>Customer Details</div>' +
          '<div class="field"><label>Full Name</label><input name="name" required /></div>' +
          '<div class="form-grid">' +
            '<div class="field"><label>Phone</label><div class="phone-input-group"><span class="phone-prefix">+91</span><input name="phone" required pattern="[6-9][0-9]{9}" title="Enter a valid 10-digit mobile number" inputmode="numeric" placeholder="10-digit number" /></div></div>' +
            '<div class="field"><label>Flat / Unit</label><input name="flat" placeholder="A-101" /></div>' +
          '</div>' +
        '</div>' +
        (isBookingPaused()
          ? pausedBookingNoticeHtml()
          : '<div class="form-section">' +
              '<div class="form-section-title"><span class="fs-num">2</span>First Vehicle <span class="fs-optional">(optional)</span></div>' +
              '<div class="form-grid">' +
                '<div class="field"><label>Type</label><select name="vtype" id="add-cust-vtype"><option value="">— None —</option><option value="Bike">Bike</option><option value="Car">Car</option></select></div>' +
                '<div class="field"><label>Reg. Number</label><input name="vnumber" placeholder="KA01AB1234" style="text-transform:uppercase" pattern="' + VEHICLE_NUMBER_PATTERN + '" title="' + VEHICLE_NUMBER_TITLE + '" /></div>' +
              '</div>' +
              '<div class="form-grid">' +
                '<div class="field"><label>Model</label><input name="vmodel" placeholder="Honda Activa" /></div>' +
                '<div class="field"><label>Monthly Plan (₹)</label><input name="vamount" type="text" inputmode="numeric" pattern="[0-9]+" placeholder="300" /></div>' +
              '</div>' +
            '</div>') +
        '<button type="submit" class="btn btn-primary btn-block">Add Customer</button>' +
      '</form>';

    const overlay = openModal('Add Customer', html, (ov) => {
      bindGoToProfileLinks(ov);
      const avatar = ov.querySelector('#add-cust-avatar');
      const nameInput = ov.querySelector('#add-customer-form input[name="name"]');
      nameInput.addEventListener('input', () => {
        avatar.textContent = nameInput.value.trim() ? initials(nameInput.value) : '👤';
      });
      ov.querySelector('#add-customer-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const payload = {
          name: f.get('name'), phone: f.get('phone'), flat: f.get('flat'),
        };
        if (f.get('vtype') && f.get('vnumber') && f.get('vamount')) {
          payload.vehicle = { type: f.get('vtype'), number: f.get('vnumber'), model: f.get('vmodel'), planAmount: f.get('vamount') };
        }
        try {
          const result = await api('/client/customers', { method: 'POST', body: JSON.stringify(payload) });
          toast('Customer added — username: ' + result.username, 'success');
          showSendConfirmation(overlay, result.welcomeWaLink, result.welcomeSmsLink, async () => {
            await loadClientData();
            renderClientTab();
          });
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  function openAddVehicleModal(customerId, customerName) {
    if (isBookingPaused()) {
      return openModal('Add Vehicle', pausedBookingNoticeHtml(), (ov) => bindGoToProfileLinks(ov));
    }
    const html =
      '<form id="add-vehicle-form">' +
        '<div class="field"><label>For</label><input value="' + esc(customerName) + '" disabled /></div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Type</label><select name="type" required><option value="Bike">Bike</option><option value="Car">Car</option></select></div>' +
          '<div class="field"><label>Reg. Number</label><input name="number" required placeholder="KA01AB1234" style="text-transform:uppercase" pattern="' + VEHICLE_NUMBER_PATTERN + '" title="' + VEHICLE_NUMBER_TITLE + '" /></div>' +
        '</div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Model</label><input name="model" placeholder="Honda Activa" /></div>' +
          '<div class="field"><label>Monthly Plan (₹)</label><input name="planAmount" type="text" inputmode="numeric" pattern="[0-9]+" required placeholder="300" /></div>' +
        '</div>' +
        '<button type="submit" class="btn btn-primary btn-block">Add Vehicle</button>' +
      '</form>';

    const overlay = openModal('Add Vehicle', html, (ov) => {
      ov.querySelector('#add-vehicle-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
          await api('/client/customers/' + customerId + '/vehicles', {
            method: 'POST',
            body: JSON.stringify({ type: f.get('type'), number: f.get('number'), model: f.get('model'), planAmount: f.get('planAmount') }),
          });
          toast('Vehicle added', 'success');
          overlay.remove();
          await loadClientData();
          renderClientTab();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  function openEditCustomerModal(customer) {
    const html =
      '<div class="modal-intro">' +
        '<div class="modal-intro-icon">' + esc(initials(customer.name)) + '</div>' +
        '<div class="modal-intro-text">Update ' + esc(customer.name) + '\'s details, or register another vehicle for them.</div>' +
      '</div>' +
      '<form id="edit-customer-form">' +
        '<div class="form-section">' +
          '<div class="form-section-title"><span class="fs-num">1</span>Customer Details</div>' +
          '<div class="field"><label>Full Name</label><input name="name" required value="' + esc(customer.name) + '" /></div>' +
          '<div class="form-grid">' +
            '<div class="field"><label>Phone</label><div class="phone-input-group"><span class="phone-prefix">+91</span><input name="phone" required pattern="[6-9][0-9]{9}" title="Enter a valid 10-digit mobile number" inputmode="numeric" value="' + esc(customer.phone) + '" /></div></div>' +
            '<div class="field"><label>Flat / Unit</label><input name="flat" value="' + esc(customer.flat || '') + '" /></div>' +
          '</div>' +
          '<div class="field"><label>Login Username</label><input value="' + esc(customer.username) + '" disabled /></div>' +
          '<button type="button" class="btn btn-outline btn-sm" id="resend-setup-btn" style="margin:-4px 0 14px;">Resend password setup link</button>' +
        '</div>' +
        (isBookingPaused()
          ? pausedBookingNoticeHtml()
          : '<div class="form-section">' +
              '<div class="form-section-title"><span class="fs-num">2</span>Add a Vehicle <span class="fs-optional">(optional)</span></div>' +
              '<div class="form-grid">' +
                '<div class="field"><label>Type</label><select name="vtype"><option value="">— None —</option><option value="Bike">Bike</option><option value="Car">Car</option></select></div>' +
                '<div class="field"><label>Reg. Number</label><input name="vnumber" placeholder="KA01AB1234" style="text-transform:uppercase" pattern="' + VEHICLE_NUMBER_PATTERN + '" title="' + VEHICLE_NUMBER_TITLE + '" /></div>' +
              '</div>' +
              '<div class="form-grid">' +
                '<div class="field"><label>Model</label><input name="vmodel" placeholder="Honda Activa" /></div>' +
                '<div class="field"><label>Monthly Plan (₹)</label><input name="vamount" type="text" inputmode="numeric" pattern="[0-9]+" placeholder="300" /></div>' +
              '</div>' +
            '</div>') +
        '<button type="submit" class="btn btn-primary btn-block">Save Changes</button>' +
      '</form>';

    const overlay = openModal('Edit Customer', html, (ov) => {
      bindGoToProfileLinks(ov);
      disableUntilDirty(ov.querySelector('#edit-customer-form'));
      ov.querySelector('#resend-setup-btn').addEventListener('click', async () => {
        try {
          const result = await api('/client/customers/' + customer.id + '/resend-setup', { method: 'POST' });
          showSendConfirmation(overlay, result.waLink, result.smsLink, () => {});
        } catch (err) {
          toast(err.message, 'error');
        }
      });
      ov.querySelector('#edit-customer-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const payload = { name: f.get('name'), phone: f.get('phone'), flat: f.get('flat') };
        try {
          await api('/client/customers/' + customer.id, { method: 'PUT', body: JSON.stringify(payload) });
          if (f.get('vtype') && f.get('vnumber') && f.get('vamount')) {
            await api('/client/customers/' + customer.id + '/vehicles', {
              method: 'POST',
              body: JSON.stringify({ type: f.get('vtype'), number: f.get('vnumber'), model: f.get('vmodel'), planAmount: f.get('vamount') }),
            });
          }
          toast('Customer updated', 'success');
          overlay.remove();
          await loadClientData();
          renderClientTab();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  function openEditVehicleModal(vehicle) {
    const html =
      '<form id="edit-vehicle-form">' +
        '<div class="form-grid">' +
          '<div class="field"><label>Type</label><select name="type" required>' +
            '<option value="Bike"' + (vehicle.type === 'Bike' ? ' selected' : '') + '>Bike</option>' +
            '<option value="Car"' + (vehicle.type === 'Car' ? ' selected' : '') + '>Car</option>' +
          '</select></div>' +
          '<div class="field"><label>Reg. Number</label><input name="number" required value="' + esc(vehicle.number) + '" style="text-transform:uppercase" pattern="' + VEHICLE_NUMBER_PATTERN + '" title="' + VEHICLE_NUMBER_TITLE + '" /></div>' +
        '</div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Model</label><input name="model" value="' + esc(vehicle.model || '') + '" /></div>' +
          '<div class="field"><label>Monthly Plan (₹)</label><input name="planAmount" type="text" inputmode="numeric" pattern="[0-9]+" required value="' + vehicle.planAmount + '" /></div>' +
        '</div>' +
        '<button type="submit" class="btn btn-primary btn-block">Save Changes</button>' +
      '</form>';

    const overlay = openModal('Edit Vehicle', html, (ov) => {
      disableUntilDirty(ov.querySelector('#edit-vehicle-form'));
      ov.querySelector('#edit-vehicle-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
          await api('/client/vehicles/' + vehicle.id, {
            method: 'PUT',
            body: JSON.stringify({ type: f.get('type'), number: f.get('number'), model: f.get('model'), planAmount: f.get('planAmount') }),
          });
          toast('Vehicle updated', 'success');
          overlay.remove();
          await loadClientData();
          renderClientTab();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  async function renderClientStaff() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading-spinner">Loading…</div>';
    try {
      state.staff = (await api('/client/staff')).staff;
    } catch (err) {
      toast(err.message, 'error');
      state.staff = [];
    }
    const staff = state.staff;
    const q = state.staffSearch.trim().toLowerCase();
    const filteredStaff = q ? staff.filter((s) => s.name.toLowerCase().includes(q) || s.phone.includes(q)) : staff;
    content.innerHTML =
      '<div class="section-header"><h3>Staff<span class="count-badge">' + staff.length + '</span></h3>' +
        '<button class="btn btn-primary btn-sm" id="add-staff-btn">+ Add Staff</button>' +
      '</div>' +
      (staff.length > 1 ? '<div class="field"><input type="search" id="staff-search" placeholder="Search by name or phone…" value="' + esc(state.staffSearch) + '" /></div>' : '') +
      (staff.length === 0
        ? '<div class="card"><div class="empty-state"><div class="empty-icon">🧰</div>No staff members yet.</div></div>'
        : filteredStaff.length === 0
        ? '<div class="card"><div class="empty-state"><div class="empty-icon">🔍</div>No staff match your search.</div></div>'
        : '<div class="cards-grid">' + filteredStaff.map((s) =>
            '<div class="card staff-card"><div class="staff-avatar">' + esc(initials(s.name)) + '</div>' +
            '<div class="staff-info"><div class="sr-name">' + esc(s.name) + '</div><div class="sr-phone">' + esc(s.phone) + '</div></div>' +
            '<div class="cc-actions">' +
              '<button class="icon-action-btn" title="Edit staff" data-edit-staff="' + s.id + '">' + EDIT_ICON + '</button>' +
              '<button class="icon-action-btn danger" title="Remove staff" data-remove-staff="' + s.id + '">' + DELETE_ICON + '</button>' +
            '</div></div>'
          ).join('') + '</div>');

    const staffSearchInput = document.getElementById('staff-search');
    if (staffSearchInput) {
      staffSearchInput.addEventListener('input', (e) => {
        state.staffSearch = e.target.value;
        renderClientStaff();
      });
      staffSearchInput.focus();
      staffSearchInput.selectionStart = staffSearchInput.selectionEnd = staffSearchInput.value.length;
    }

    document.getElementById('add-staff-btn').addEventListener('click', () => {
      const html =
        '<form id="add-staff-form">' +
          '<div class="field"><label>Full Name</label><input name="name" required /></div>' +
          '<div class="field"><label>Phone</label><div class="phone-input-group"><span class="phone-prefix">+91</span><input name="phone" required pattern="[6-9][0-9]{9}" title="Enter a valid 10-digit mobile number" inputmode="numeric" placeholder="10-digit number" /></div></div>' +
          '<button type="submit" class="btn btn-primary btn-block">Add Staff</button>' +
        '</form>';
      const overlay = openModal('Add Staff Member', html, (ov) => {
        ov.querySelector('#add-staff-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = new FormData(e.target);
          try {
            const result = await api('/client/staff', { method: 'POST', body: JSON.stringify({ name: f.get('name'), phone: f.get('phone') }) });
            toast('Staff member added', 'success');
            showSendConfirmation(overlay, result.welcomeWaLink, result.welcomeSmsLink, renderClientStaff);
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
    });

    content.querySelectorAll('[data-remove-staff]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api('/client/staff/' + btn.dataset.removeStaff, { method: 'DELETE' });
          toast('Staff member removed', 'success');
          renderClientStaff();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    content.querySelectorAll('[data-edit-staff]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const member = staff.find((s) => s.id === btn.dataset.editStaff);
        if (!member) return;
        const html =
          '<form id="edit-staff-form">' +
            '<div class="field"><label>Full Name</label><input name="name" required value="' + esc(member.name) + '" /></div>' +
            '<div class="field"><label>Phone</label><div class="phone-input-group"><span class="phone-prefix">+91</span><input name="phone" required pattern="[6-9][0-9]{9}" title="Enter a valid 10-digit mobile number" inputmode="numeric" value="' + esc(member.phone) + '" /></div></div>' +
            '<button type="submit" class="btn btn-primary btn-block">Save Changes</button>' +
          '</form>';
        const overlay = openModal('Edit Staff Member', html, (ov) => {
          disableUntilDirty(ov.querySelector('#edit-staff-form'));
          ov.querySelector('#edit-staff-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const f = new FormData(e.target);
            try {
              await api('/client/staff/' + member.id, { method: 'PUT', body: JSON.stringify({ name: f.get('name'), phone: f.get('phone') }) });
              toast('Staff member updated', 'success');
              overlay.remove();
              renderClientStaff();
            } catch (err) {
              toast(err.message, 'error');
            }
          });
        });
      });
    });
  }

  function renderPaymentsList() {
    const list = document.getElementById('payments-list');
    const payments = state.payments;
    const q = state.paymentsSearch.trim().toLowerCase();
    const filtered = q ? payments.filter((p) => p.customerName.toLowerCase().includes(q) || p.vehicleNumber.toLowerCase().includes(q)) : payments;

    if (payments.length === 0) {
      list.innerHTML = '<div class="card"><div class="empty-state"><div class="empty-icon">🧾</div>No payments recorded yet.</div></div>';
    } else if (filtered.length === 0) {
      list.innerHTML = '<div class="card"><div class="empty-state"><div class="empty-icon">🔍</div>No payments match your search.</div></div>';
    } else {
      list.innerHTML = monthGroupedPaymentsHtml(filtered, (p) =>
        '<div class="payment-row clickable-row" data-open-customer="' + vehicleCustomerId(p.vehicleId) + '"><div class="pr-left"><div class="pr-name">' + vehicleIconHtml(p.vehicleType, 'sm') + esc(p.customerName) + ' · ' + esc(p.vehicleNumber) + '</div>' +
        '<div class="pr-sub">' + formatDate(p.date) + '</div></div>' +
        '<div class="pr-right"><div class="pr-amount">' + money(p.amount) + '</div><div class="pr-method">' + esc(p.method) + '</div></div></div>'
      );
    }
  }

  async function renderClientPayments() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading-spinner">Loading…</div>';
    try {
      state.payments = (await api('/client/payments')).payments;
    } catch (err) {
      toast(err.message, 'error');
      state.payments = [];
    }

    content.innerHTML =
      '<div class="section-header"><h3>Record a Payment</h3></div>' +
      '<div class="card"><form id="record-payment-form">' +
        '<div class="field"><label>Customer</label><select name="customerId" id="pay-customer" required><option value="">Select customer…</option>' +
          state.data.customers.map((c) => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Vehicle</label><select name="vehicleId" id="pay-vehicle" required><option value="">Select customer first…</option></select></div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Month</label><input name="month" id="pay-month" value="' + esc(state.data.month) + '" /></div>' +
          '<div class="field"><label>Amount (₹)</label><input name="amount" id="pay-amount" type="text" inputmode="numeric" pattern="[0-9]+" /></div>' +
        '</div>' +
        '<div class="field"><label>Method</label><select name="method" required><option value="Cash">Cash</option><option value="UPI">UPI</option></select></div>' +
        '<button type="submit" class="btn btn-primary btn-block">Record Payment</button>' +
      '</form></div>' +
      '<div class="section-header"><h3>Payment History<span class="count-badge" id="payments-count">' + state.payments.length + '</span></h3></div>' +
      (state.payments.length > 1 ? '<div class="field"><input type="search" id="payments-search" placeholder="Search by customer or vehicle number…" value="' + esc(state.paymentsSearch) + '" /></div>' : '') +
      '<div id="payments-list"></div>';

    renderPaymentsList();
    const paymentsSearchInput = document.getElementById('payments-search');
    if (paymentsSearchInput) {
      paymentsSearchInput.addEventListener('input', (e) => {
        state.paymentsSearch = e.target.value;
        renderPaymentsList();
      });
    }

    const customerSelect = document.getElementById('pay-customer');
    const vehicleSelect = document.getElementById('pay-vehicle');
    const amountInput = document.getElementById('pay-amount');

    customerSelect.addEventListener('change', () => {
      const customer = state.data.customers.find((c) => c.id === customerSelect.value);
      vehicleSelect.innerHTML = '<option value="">Select vehicle…</option>' +
        (customer ? customer.vehicles.map((v) => '<option value="' + v.id + '" data-amount="' + v.planAmount + '">' + esc(v.type) + ' · ' + esc(v.number) + '</option>').join('') : '');
    });
    vehicleSelect.addEventListener('change', () => {
      const opt = vehicleSelect.selectedOptions[0];
      if (opt && opt.dataset.amount) amountInput.value = opt.dataset.amount;
    });

    document.getElementById('record-payment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        const result = await api('/client/payments', {
          method: 'POST',
          body: JSON.stringify({ vehicleId: f.get('vehicleId'), month: f.get('month'), amount: f.get('amount'), method: f.get('method') }),
        });
        toast('Payment recorded', 'success');
        openSendConfirmationModal('Send Receipt', result.receiptWaLink, result.receiptSmsLink, async () => {
          await loadClientData();
          renderClientPayments();
        });
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // ================= CUSTOMER =================
  async function renderCustomerShell() {
    $app.innerHTML = shellHtml('My Vehicles', CUSTOMER_TABS, state.customerTab);
    bindShellEvents(renderCustomerTab, 'customerTab');
    await loadCustomerData();
    if (!state.token) return;
    renderCustomerTab();
  }

  async function loadCustomerData() {
    try {
      state.data = await api('/customer/data');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function renderCustomerTab() {
    const nav = document.getElementById('bottom-nav');
    if (nav) {
      nav.querySelectorAll('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === state.customerTab));
    }
    if (state.customerTab === 'reports') return renderCustomerReports();
    if (state.customerTab === 'payments') return renderCustomerPayments();
    if (state.customerTab === 'bookings') return renderCustomerBookings();
    return renderCustomerDashboard();
  }

  function renderCustomerDashboard() {
    const content = document.getElementById('content');
    const d = state.data;
    if (!d) { content.innerHTML = '<div class="loading-spinner">Loading…</div>'; return; }

    content.innerHTML =
      (d.client.servicePaused
        ? '<div class="reminder-digest"><div class="rd-icon">🚰</div>' +
          '<div><div class="rd-title">New bookings temporarily paused</div>' +
          '<div class="rd-sub">' + esc(d.client.pauseReason || 'We\'re not accepting new bookings right now.') + ' We apologize for the inconvenience.</div></div></div>'
        : '') +
      '<div class="status-banner ' + (d.anyDue ? 'due' : 'paid') + '">' +
        '<div class="sb-icon">' + (d.anyDue ? '⏰' : '✅') + '</div>' +
        '<h2>' + (d.anyDue ? 'Payment Due: ' + money(d.totalDue) : 'All Paid Up!') + '</h2>' +
        '<p>' + (d.anyDue
          ? 'You have pending vehicle wash payment(s) as of ' + esc(monthLabel(d.month)) + '.'
          : 'Your subscription is fully settled for ' + esc(monthLabel(d.month)) + '. Thank you!') + '</p>' +
      '</div>' +
      '<div class="section-header"><h3>My Vehicles</h3></div>' +
      '<div class="cards-grid">' + d.vehicles.map((v) => {
        const statusLabel = v.paid ? 'Paid' : (v.monthsDue > 1 ? v.monthsDue + ' months due' : 'Due');
        return (
          '<div class="vehicle-card"><div class="vc-left">' + vehicleIconHtml(v.type, 'lg') +
          '<div><div class="vc-name">' + esc(v.model || v.type) + '</div><div class="vc-sub">' + esc(v.number) + ' · ' + esc(v.type) + '</div></div></div>' +
          '<div class="vc-right"><div class="vc-amount">' + (v.paid ? money(v.planAmount) + '/mo' : money(v.dueAmount)) + '</div>' +
          '<span class="chip ' + (v.paid ? 'chip-paid' : 'chip-due') + '">' + statusLabel + '</span></div></div>'
        );
      }).join('') + '</div>' +
      '<div class="section-header"><h3>Your Service Provider</h3></div>' +
      '<div class="card provider-card">' +
        '<div class="provider-info">' +
          '<div class="provider-avatar">' + esc(initials(d.client.businessName)) + '</div>' +
          '<div><div class="provider-name">' + esc(d.client.businessName) + '</div>' +
          '<div class="provider-meta">' + esc(d.client.ownerName) + (d.client.area ? ' · ' + esc(d.client.area) : '') + '</div></div>' +
        '</div>' +
        '<button class="btn btn-navy btn-block" id="contact-btn" style="margin-top:14px;">💬 Message on WhatsApp</button>' +
      '</div>';

    document.getElementById('contact-btn').addEventListener('click', () => window.open(d.contactWaLink, '_blank'));
  }

  function renderCustomerPayments() {
    const content = document.getElementById('content');
    const d = state.data;
    if (!d) { content.innerHTML = '<div class="loading-spinner">Loading…</div>'; return; }

    content.innerHTML =
      '<div class="section-header"><h3>Payment History<span class="count-badge">' + d.paymentHistory.length + '</span></h3></div>' +
      monthGroupedPaymentsHtml(d.paymentHistory, (p) =>
        '<div class="payment-row"><div class="pr-left"><div class="pr-name">' + vehicleIconHtml(p.vehicleType, 'sm') + esc(p.vehicleType) + ' · ' + esc(p.vehicleNumber) + '</div>' +
        '<div class="pr-sub">' + formatDate(p.date) + '</div></div>' +
        '<div class="pr-right"><div class="pr-amount">' + money(p.amount) + '</div><div class="pr-method">' + esc(p.method) + '</div></div></div>'
      );
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read that file'));
      reader.readAsDataURL(file);
    });
  }

  function bindMultiPhotoInput(input, previewContainer) {
    const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const box = { photos: [] };

    function render() {
      previewContainer.innerHTML = box.photos.map((src, i) =>
        '<div class="photo-preview-item"><img class="complaint-photo" src="' + src + '" alt="Preview" />' +
        '<button type="button" class="photo-remove-btn" data-remove-photo="' + i + '">✕</button></div>'
      ).join('');
      previewContainer.querySelectorAll('[data-remove-photo]').forEach((btn) => {
        btn.addEventListener('click', () => {
          box.photos.splice(Number(btn.dataset.removePhoto), 1);
          render();
        });
      });
    }

    input.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = ''; // clear so picking the same file again still fires change
      for (const file of files) {
        if (box.photos.length >= 4) { toast('You can attach up to 4 photos', 'error'); break; }
        if (!ALLOWED_PHOTO_TYPES.includes(file.type)) { toast('Photos must be JPEG, PNG or WEBP images', 'error'); continue; }
        if (file.size > 2 * 1024 * 1024) { toast('Each photo must be under 2MB', 'error'); continue; }
        try {
          box.photos.push(await readFileAsDataUrl(file));
        } catch (err) {
          toast(err.message, 'error');
        }
      }
      render();
    });
    return box;
  }

  function photoGridHtml(photos, altPrefix) {
    if (!photos || photos.length === 0) return '';
    return '<div class="complaint-photo-grid">' +
      photos.map((src, i) => '<img class="complaint-photo" src="' + src + '" alt="' + esc(altPrefix) + ' ' + (i + 1) + '" />').join('') +
    '</div>';
  }

  function complaintCardHtml(c, opts) {
    opts = opts || {};
    const statusChip = c.status === 'resolved'
      ? '<span class="chip chip-paid">Resolved</span>'
      : '<span class="chip chip-due">Open</span>';
    return (
      '<div class="card complaint-card">' +
        '<div class="cc-top"><div' + (opts.showCustomer ? ' class="clickable-row" data-open-customer="' + c.customerId + '"' : '') + '>' +
          (opts.showCustomer ? '<div class="cc-name">' + esc(c.customerName) + (c.customerFlat ? ' · ' + esc(c.customerFlat) : '') + '</div>' : '') +
          '<div class="cc-meta">' + vehicleIconHtml(c.vehicleType, 'sm') + esc(c.vehicleType) + ' · ' + esc(c.vehicleNumber) + ' · ' + formatDate(c.createdAt) + '</div>' +
        '</div>' + statusChip + '</div>' +
        '<p class="complaint-desc">' + esc(c.description) + '</p>' +
        photoGridHtml(c.photos, 'Proof photo') +
        (c.response
          ? '<div class="complaint-response"><strong>Response:</strong> ' + esc(c.response) + '</div>' +
            photoGridHtml(c.responsePhotos, 'Resolution photo')
          : (opts.canRespond
              ? '<form class="complaint-respond-form" data-complaint-id="' + c.id + '">' +
                  '<textarea name="response" rows="2" placeholder="Write a response…" required></textarea>' +
                  '<div class="field" style="margin:8px 0 0;"><input type="file" name="responsePhotos" class="respond-photo-input" multiple accept="image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp" />' +
                  '<p style="font-size:11px;color:var(--text-muted);margin-top:5px;">Optional proof photos · up to 4 · JPEG, PNG or WEBP · 2MB each</p></div>' +
                  '<div class="complaint-photo-grid respond-photo-preview"></div>' +
                  '<button type="submit" class="btn btn-primary btn-sm">Send Response &amp; Resolve</button>' +
                '</form>'
              : '<div class="complaint-response pending">Awaiting response from ' + esc('the business') + '…</div>')) +
      '</div>'
    );
  }

  async function loadCustomerComplaints() {
    try {
      const result = await api('/customer/complaints');
      state.customerComplaints = result.complaints;
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function renderCustomerReports() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading-spinner">Loading…</div>';
    await loadCustomerComplaints();
    if (!state.token) return;
    const complaints = state.customerComplaints || [];

    content.innerHTML =
      '<div class="section-header"><h3>Service Reports</h3>' +
        '<button class="btn btn-primary btn-sm" id="raise-report-btn">📷 Raise a Report</button>' +
      '</div>' +
      '<p style="font-size:12.5px;color:var(--text-muted);margin:-8px 0 16px;">Not happy with a wash? Raise a report with a photo — your provider will see it and respond.</p>' +
      (complaints.length === 0
        ? '<div class="card"><div class="empty-state"><div class="empty-icon">📷</div>No reports raised yet.</div></div>'
        : complaints.map((c) => complaintCardHtml(c, { showCustomer: false, canRespond: false })).join(''));

    document.getElementById('raise-report-btn').addEventListener('click', openRaiseReportModal);
  }

  function openRaiseReportModal() {
    const d = state.data;
    const vehicles = (d && d.vehicles) || [];
    const html =
      '<form id="raise-report-form">' +
        '<div class="field"><label>Vehicle</label><select name="vehicleId" required>' +
          vehicles.map((v) => '<option value="' + v.id + '">' + esc(v.type) + ' · ' + esc(v.number) + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>What went wrong?</label><textarea name="description" rows="3" required placeholder="e.g. Bike wasn\'t cleaned properly, dust still on seat…"></textarea></div>' +
        '<div class="field"><label>Photo proof (optional)</label><input type="file" name="photos" multiple accept="image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp" id="report-photo-input" /><p style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Up to 4 photos · JPEG, PNG or WEBP · 2MB each</p></div>' +
        '<div class="complaint-photo-grid" id="report-photo-preview"></div>' +
        '<button type="submit" class="btn btn-primary btn-block">Submit Report</button>' +
      '</form>';
    const overlay = openModal('Raise a Report', html, (ov) => {
      const photoBox = bindMultiPhotoInput(ov.querySelector('#report-photo-input'), ov.querySelector('#report-photo-preview'));

      ov.querySelector('#raise-report-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
          await api('/customer/complaints', {
            method: 'POST',
            body: JSON.stringify({
              vehicleId: f.get('vehicleId'),
              description: f.get('description'),
              photos: photoBox.photos,
            }),
          });
          toast('Report submitted', 'success');
          overlay.remove();
          renderCustomerReports();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  const BOOKING_STATUS_CHIP = {
    pending: { cls: 'chip-amber', label: 'Pending' },
    accepted: { cls: 'chip-paid', label: 'Accepted' },
    declined: { cls: 'chip-due', label: 'Declined' },
    completed: { cls: 'chip-navy', label: 'Completed' },
  };

  function bookingCardHtml(b, opts) {
    opts = opts || {};
    const chip = BOOKING_STATUS_CHIP[b.status] || BOOKING_STATUS_CHIP.pending;
    return (
      '<div class="card complaint-card">' +
        '<div class="cc-top"><div' + (opts.showCustomer ? ' class="clickable-row" data-open-customer="' + b.customerId + '"' : '') + '>' +
          (opts.showCustomer ? '<div class="cc-name">' + esc(b.customerName) + (b.customerFlat ? ' · ' + esc(b.customerFlat) : '') + '</div>' : '') +
          '<div class="cc-meta">' + vehicleIconHtml(b.vehicleType, 'sm') + esc(b.vehicleType) + ' · ' + esc(b.vehicleNumber) + ' · Preferred: ' + formatDate(b.preferredDate) + '</div>' +
        '</div><span class="chip ' + chip.cls + '">' + chip.label + '</span></div>' +
        (b.notes ? '<p class="complaint-desc">' + esc(b.notes) + '</p>' : '') +
        (b.clientNote ? '<div class="complaint-response"><strong>Note:</strong> ' + esc(b.clientNote) + '</div>' : '') +
        (opts.canRespond && b.status === 'pending'
          ? '<div style="display:flex; gap:8px; margin-top:10px;">' +
              '<button class="btn btn-primary btn-sm" style="flex:1;" data-accept-booking="' + b.id + '">Accept</button>' +
              '<button class="btn btn-outline btn-sm" style="flex:1;" data-decline-booking="' + b.id + '">Decline</button>' +
            '</div>'
          : '') +
        (opts.canRespond && b.status === 'accepted'
          ? '<button class="btn btn-outline btn-sm btn-block" style="margin-top:10px;" data-complete-booking="' + b.id + '">Mark Complete</button>'
          : '') +
      '</div>'
    );
  }

  async function loadCustomerBookings() {
    try {
      const result = await api('/customer/bookings');
      state.customerBookings = result.bookings;
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function renderCustomerBookings() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading-spinner">Loading…</div>';
    await loadCustomerBookings();
    if (!state.token) return;
    const bookings = state.customerBookings || [];

    content.innerHTML =
      '<div class="section-header"><h3>Wash Bookings</h3>' +
        '<button class="btn btn-primary btn-sm" id="book-wash-btn">📅 Book a Wash</button>' +
      '</div>' +
      '<p style="font-size:12.5px;color:var(--text-muted);margin:-8px 0 16px;">Request a wash for a preferred date — your provider will confirm it.</p>' +
      (bookings.length === 0
        ? '<div class="card"><div class="empty-state"><div class="empty-icon">📅</div>No bookings yet.</div></div>'
        : bookings.map((b) => bookingCardHtml(b, { showCustomer: false, canRespond: false })).join(''));

    document.getElementById('book-wash-btn').addEventListener('click', openBookWashModal);
  }

  function openBookWashModal() {
    const d = state.data;
    const vehicles = (d && d.vehicles) || [];
    const today = new Date().toISOString().slice(0, 10);
    const html =
      (d && d.client && d.client.servicePaused
        ? '<div class="info-note" style="background:var(--red-light);color:var(--red);"><span class="in-icon">🚰</span>New wash bookings are paused' + (d.client.pauseReason ? ': ' + esc(d.client.pauseReason) : '.') + '</div>'
        : '<form id="book-wash-form">' +
            '<div class="field"><label>Vehicle</label><select name="vehicleId" required>' +
              vehicles.map((v) => '<option value="' + v.id + '">' + esc(v.type) + ' · ' + esc(v.number) + '</option>').join('') +
            '</select></div>' +
            '<div class="field"><label>Preferred Date</label><input type="date" name="preferredDate" required min="' + today + '" value="' + today + '" /></div>' +
            '<div class="field"><label>Notes (optional)</label><textarea name="notes" rows="2" placeholder="e.g. Please come before 10am"></textarea></div>' +
            '<button type="submit" class="btn btn-primary btn-block">Request Booking</button>' +
          '</form>');
    const overlay = openModal('Book a Wash', html, (ov) => {
      const form = ov.querySelector('#book-wash-form');
      if (!form) return;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
          await api('/customer/bookings', {
            method: 'POST',
            body: JSON.stringify({ vehicleId: f.get('vehicleId'), preferredDate: f.get('preferredDate'), notes: f.get('notes') }),
          });
          toast('Booking requested', 'success');
          overlay.remove();
          renderCustomerBookings();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  // ================= SUPER ADMIN =================
  async function renderAdminShell() {
    $app.innerHTML = shellHtml('Platform Overview', ADMIN_TABS, state.adminTab);
    bindShellEvents(renderAdminTab, 'adminTab');
    await loadAdminData();
    if (!state.token) return;
    renderAdminTab();
  }

  async function loadAdminData() {
    try {
      const [overview, clients, requests] = await Promise.all([api('/admin/overview'), api('/admin/clients'), api('/admin/client-requests')]);
      state.adminOverview = overview;
      state.adminClients = clients.clients;
      state.clientRequests = requests.requests;
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function renderAdminTab() {
    const nav = document.getElementById('bottom-nav');
    if (nav) {
      nav.querySelectorAll('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === state.adminTab));
    }
    if (state.adminTab === 'businesses') return renderAdminBusinesses();
    return renderAdminOverview();
  }

  function renderAdminOverview() {
    const content = document.getElementById('content');
    const overview = state.adminOverview;
    if (!overview) { content.innerHTML = '<div class="loading-spinner">Loading…</div>'; return; }

    const maxMonthRevenue = Math.max(1, ...overview.monthlyRevenue.map((m) => m.revenue));

    content.innerHTML =
      '<div class="overview-row">' +
        ovCardHtml('🏢', overview.totalClients, 'Businesses') +
        ovCardHtml('👥', overview.totalCustomers, 'Customers') +
        ovCardHtml('🚗', overview.totalVehicles, 'Vehicles') +
        ovCardHtml('💰', money(overview.totalRevenue), 'Total Revenue') +
      '</div>' +
      '<div class="overview-row overview-row-sm">' +
        ovCardHtml('🧰', overview.totalStaff, 'Staff') +
        ovCardHtml('📝', overview.pendingRequests, 'Pending Requests') +
      '</div>' +
      (overview.monthlyRevenue.length === 0 ? '' :
        '<div class="section-header"><h3>Revenue Trend</h3></div>' +
        '<div class="card">' +
          '<div class="revenue-chart">' + overview.monthlyRevenue.map((m) =>
            '<div class="revenue-bar-col">' +
              '<div class="revenue-bar-track"><div class="revenue-bar-fill" style="height:' + Math.max(6, Math.round((m.revenue / maxMonthRevenue) * 100)) + '%"></div></div>' +
              '<div class="revenue-bar-amount">' + money(m.revenue) + '</div>' +
              '<div class="revenue-bar-label">' + esc(monthLabel(m.month)) + '</div>' +
            '</div>'
          ).join('') + '</div>' +
        '</div>') +
      '<div class="section-header"><h3>Recent Payments (all businesses)</h3></div>' +
      '<div class="card">' +
        (overview.recentPayments.length === 0
          ? '<div class="empty-state"><div class="empty-icon">🧾</div>No payments recorded yet.</div>'
          : overview.recentPayments.map((p) =>
              '<div class="payment-row"><div class="pr-left"><div class="pr-name">' + vehicleIconHtml(p.vehicleType, 'sm') + esc(p.customerName) + ' · ' + esc(p.vehicleNumber) + '</div>' +
              '<div class="pr-sub">' + esc(p.businessName) + ' · ' + esc(monthLabel(p.month)) + ' · ' + formatDate(p.date) + '</div></div>' +
              '<div class="pr-right"><div class="pr-amount">' + money(p.amount) + '</div><div class="pr-method">' + esc(p.method) + '</div></div></div>'
            ).join('')) +
      '</div>';
  }

  function renderAdminBusinessesList() {
    const list = document.getElementById('admin-biz-list');
    const q = state.adminBusinessSearch.trim().toLowerCase();
    const clients = q
      ? state.adminClients.filter((c) => c.businessName.toLowerCase().includes(q) || c.ownerName.toLowerCase().includes(q) || (c.area || '').toLowerCase().includes(q))
      : state.adminClients;

    list.innerHTML = state.adminClients.length === 0
      ? '<div class="card"><div class="empty-state"><div class="empty-icon">🏢</div>No client businesses onboarded yet.</div></div>'
      : clients.length === 0
      ? '<div class="card"><div class="empty-state"><div class="empty-icon">🔍</div>No businesses match your search.</div></div>'
      : '<div class="cards-grid">' + clients.map((c) =>
          '<div class="card"><div class="cc-top"><div><div class="cc-name">' + esc(c.businessName) +
          ' <span class="chip ' + (c.active === false ? 'chip-due' : 'chip-paid') + '">' + (c.active === false ? 'Inactive' : 'Active') + '</span></div>' +
          '<div class="cc-meta">' + esc(c.ownerName) + ' · ' + esc(c.area || '') + '</div></div>' +
          '<div class="cc-actions">' +
            '<button class="icon-action-btn" title="Edit business" data-edit-client="' + c.id + '">' + EDIT_ICON + '</button>' +
            '<button class="icon-action-btn danger" title="Delete business" data-delete-client="' + c.id + '" data-business-name="' + esc(c.businessName) + '">' + DELETE_ICON + '</button>' +
          '</div></div>' +
          '<div class="cc-vehicle-mix">' + vehicleIconHtml('Bike', 'md') + vehicleIconHtml('Car', 'md') + '<span class="cc-vehicle-mix-label">' + c.vehicleCount + ' vehicles on the road</span></div>' +
          '<div class="cc-vehicles">' +
            '<div class="vehicle-row"><div class="vr-info"><span class="vr-icon">👥</span><div class="vr-name">' + c.customerCount + ' customers</div></div>' +
            '<span class="vr-amount">' + c.vehicleCount + ' vehicles</span></div>' +
            '<div class="vehicle-row"><div class="vr-info"><span class="vr-icon">💰</span><div class="vr-name">Revenue collected</div></div>' +
            '<span class="vr-amount">' + money(c.revenue) + '</span></div>' +
          '</div>' +
          '<button class="btn btn-outline btn-sm btn-block" style="margin-top:10px;" data-toggle-active="' + c.id + '" data-currently-active="' + (c.active !== false) + '">' +
            (c.active === false ? 'Activate Business' : 'Deactivate Business') +
          '</button></div>'
        ).join('') + '</div>';

    list.querySelectorAll('[data-toggle-active]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const currentlyActive = btn.dataset.currentlyActive === 'true';
        try {
          await api('/admin/clients/' + btn.dataset.toggleActive + '/active', {
            method: 'POST',
            body: JSON.stringify({ active: !currentlyActive }),
          });
          toast(currentlyActive ? 'Business deactivated' : 'Business activated', 'success');
          await loadAdminData();
          renderAdminTab();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
    list.querySelectorAll('[data-edit-client]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const client = state.adminClients.find((c) => c.id === btn.dataset.editClient);
        if (client) openEditClientModal(client);
      });
    });
    list.querySelectorAll('[data-delete-client]').forEach((btn) => {
      btn.addEventListener('click', () => deleteClient(btn.dataset.deleteClient, btn.dataset.businessName));
    });
  }

  function renderAdminBusinesses() {
    const content = document.getElementById('content');

    content.innerHTML =
      (state.clientRequests.length === 0 ? '' :
        '<div class="section-header"><h3>Pending Requests<span class="count-badge">' + state.clientRequests.length + '</span></h3></div>' +
        '<div class="cards-grid">' + state.clientRequests.map((r) =>
          '<div class="card"><div class="cc-top"><div><div class="cc-name">' + esc(r.businessName) + '</div>' +
          '<div class="cc-meta">' + esc(r.ownerName) + ' · ' + esc(r.phone) + ' · ' + esc(r.area || '') + '</div></div></div>' +
          '<div class="cc-vehicles" style="margin-top:12px; display:flex; gap:8px;">' +
            '<button class="btn btn-primary btn-sm" data-approve-request="' + r.id + '" style="flex:1;">Approve</button>' +
            '<button class="btn btn-outline btn-sm" data-reject-request="' + r.id + '" style="flex:1;">Reject</button>' +
          '</div></div>'
        ).join('') + '</div>') +
      '<div class="section-header"><h3>Client Businesses<span class="count-badge">' + state.adminClients.length + '</span></h3>' +
        '<button class="btn btn-primary btn-sm" id="add-client-btn">+ Add Business</button>' +
      '</div>' +
      (state.adminClients.length > 1 ? '<div class="field"><input type="search" id="admin-biz-search" placeholder="Search by business name, owner or area…" value="' + esc(state.adminBusinessSearch) + '" /></div>' : '') +
      '<div id="admin-biz-list"></div>';

    renderAdminBusinessesList();
    const adminBizSearchInput = document.getElementById('admin-biz-search');
    if (adminBizSearchInput) {
      adminBizSearchInput.addEventListener('input', (e) => {
        state.adminBusinessSearch = e.target.value;
        renderAdminBusinessesList();
      });
    }

    content.querySelectorAll('[data-approve-request]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const result = await api('/admin/client-requests/' + btn.dataset.approveRequest + '/approve', { method: 'POST' });
          toast('Business approved — username: ' + result.username, 'success');
          openSendConfirmationModal('Send Setup Link', result.waLink, result.smsLink, async () => { await loadAdminData(); renderAdminTab(); });
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
    content.querySelectorAll('[data-reject-request]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('Reject this business registration request?')) return;
        try {
          await api('/admin/client-requests/' + btn.dataset.rejectRequest + '/reject', { method: 'POST' });
          toast('Request rejected', 'success');
          await loadAdminData();
          renderAdminTab();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
    document.getElementById('add-client-btn').addEventListener('click', () => {
      const html =
        '<form id="add-client-form">' +
          '<div class="field"><label>Business Name</label><input name="businessName" required /></div>' +
          '<div class="field"><label>Owner Name</label><input name="ownerName" required /></div>' +
          '<div class="form-grid">' +
            '<div class="field"><label>Phone</label><div class="phone-input-group"><span class="phone-prefix">+91</span><input name="phone" required pattern="[6-9][0-9]{9}" title="Enter a valid 10-digit mobile number" inputmode="numeric" placeholder="10-digit number" /></div></div>' +
            '<div class="field"><label>Area</label><input name="area" placeholder="Sunrise Residency" /></div>' +
          '</div>' +
          '<p style="font-size:12px;color:var(--text-muted);margin:-4px 0 16px;">A login username is generated automatically. The business owner gets a WhatsApp/SMS link to set their own password.</p>' +
          '<button type="submit" class="btn btn-primary btn-block">Onboard Business</button>' +
        '</form>';
      const overlay = openModal('Add Client Business', html, (ov) => {
        ov.querySelector('#add-client-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = new FormData(e.target);
          try {
            const result = await api('/admin/clients', {
              method: 'POST',
              body: JSON.stringify({
                businessName: f.get('businessName'), ownerName: f.get('ownerName'),
                phone: f.get('phone'), area: f.get('area'),
              }),
            });
            toast('Business onboarded — username: ' + result.username, 'success');
            showSendConfirmation(overlay, result.waLink, result.smsLink, async () => { await loadAdminData(); renderAdminTab(); });
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
    });

  }

  function openEditClientModal(client) {
    const html =
      '<form id="edit-client-form">' +
        '<div class="field"><label>Business Name</label><input name="businessName" required value="' + esc(client.businessName) + '" /></div>' +
        '<div class="field"><label>Owner Name</label><input name="ownerName" required value="' + esc(client.ownerName) + '" /></div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Phone</label><div class="phone-input-group"><span class="phone-prefix">+91</span><input name="phone" required pattern="[6-9][0-9]{9}" title="Enter a valid 10-digit mobile number" inputmode="numeric" value="' + esc(client.phone) + '" /></div></div>' +
          '<div class="field"><label>Area</label><input name="area" value="' + esc(client.area || '') + '" /></div>' +
        '</div>' +
        '<div class="field"><label>Login Username</label><input value="' + esc(client.username) + '" disabled /></div>' +
        '<button type="button" class="btn btn-outline btn-sm" id="resend-client-setup-btn" style="margin:-8px 0 16px;">Resend password setup link</button>' +
        '<button type="submit" class="btn btn-primary btn-block">Save Changes</button>' +
      '</form>';

    const overlay = openModal('Edit Client Business', html, (ov) => {
      disableUntilDirty(ov.querySelector('#edit-client-form'));
      ov.querySelector('#resend-client-setup-btn').addEventListener('click', async () => {
        try {
          const result = await api('/admin/clients/' + client.id + '/resend-setup', { method: 'POST' });
          showSendConfirmation(overlay, result.waLink, result.smsLink, () => {});
        } catch (err) {
          toast(err.message, 'error');
        }
      });
      ov.querySelector('#edit-client-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const payload = {
          businessName: f.get('businessName'), ownerName: f.get('ownerName'),
          phone: f.get('phone'), area: f.get('area'),
        };
        try {
          await api('/admin/clients/' + client.id, { method: 'PUT', body: JSON.stringify(payload) });
          toast('Business updated', 'success');
          overlay.remove();
          await loadAdminData();
          renderAdminTab();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  async function deleteClient(clientId, businessName) {
    if (!window.confirm('Delete ' + businessName + ' and all its customers, vehicles and payment history? This cannot be undone.')) return;
    try {
      await api('/admin/clients/' + clientId, { method: 'DELETE' });
      toast('Business removed', 'success');
      await loadAdminData();
      renderAdminTab();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    return { path, params: new URLSearchParams(qs || '') };
  }

  document.addEventListener('input', (e) => {
    if (e.target && e.target.matches('.phone-input-group input')) {
      let digits = e.target.value.replace(/\D/g, '');
      if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
      e.target.value = digits.slice(0, 10);
    }
    if (e.target && e.target.matches('input[name="Bike"], input[name="Car"], input[name="vamount"], input[name="planAmount"], input#pay-amount, input[name="dailyBookingLimit"]')) {
      e.target.value = e.target.value.replace(/\D/g, '');
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target && (e.target.matches('select[name="vtype"]') || e.target.matches('select[name="type"]'))) {
      const rates = state.data && state.data.client && state.data.client.rates;
      if (!rates) return;
      const form = e.target.closest('form');
      if (!form) return;
      const amountInput = form.querySelector('input[name="vamount"], input[name="planAmount"]');
      if (amountInput && !amountInput.value && rates[e.target.value]) {
        amountInput.value = rates[e.target.value];
      }
    }
  });

  document.body.addEventListener('click', (e) => {
    const customerRow = e.target.closest('[data-open-customer]');
    if (customerRow && customerRow.dataset.openCustomer && !e.target.closest('button, a, input, textarea, select, form')) {
      openCustomerDetailModal(customerRow.dataset.openCustomer);
      return;
    }
    const btn = e.target.closest('.pwd-toggle-btn');
    if (btn) {
      const input = btn.previousElementSibling;
      if (input) {
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        btn.innerHTML = showing ? EYE_OPEN_ICON : EYE_OFF_ICON;
      }
      return;
    }
    const photo = e.target.closest('.complaint-photo');
    if (photo && photo.src) window.open(photo.src, '_blank');
  });

  const initialHash = parseHash();
  if (initialHash.path === 'login') {
    state.view = 'login';
    const role = initialHash.params.get('role');
    if (role && ROLE_LABELS[role]) state.loginRole = role;
  } else if (initialHash.path === 'set-password') {
    state.view = 'set-password';
    state.setPasswordRole = initialHash.params.get('role');
    state.setPasswordToken = initialHash.params.get('token');
  }
  render();
})();
