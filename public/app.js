(function () {
  'use strict';

  const API = '/api';
  const VEHICLE_NUMBER_PATTERN = '[A-Za-z]{2}[0-9]{1,2}[A-Za-z]{1,3}[0-9]{4}|[0-9]{2}[Bb][Hh][0-9]{4}[A-Za-z]{1,2}';
  const VEHICLE_NUMBER_TITLE = 'Format: KA01AB1234 (or BH-series like 22BH1234AB)';
  const MIN_PASSWORD_LEN = 6;
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
    loginMethod: 'password',
    view: 'landing',
    clientTab: 'home',
    data: null, // role-specific dashboard payload
    staff: null,
    payments: null,
    adminClients: null,
    clientRequests: null,
    customerSearch: '',
  };

  const $app = document.getElementById('app');
  const $toasts = document.getElementById('toast-container');

  // ---------------- API helper ----------------
  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    const res = await fetch(API + path, Object.assign({}, opts, { headers }));
    let data = {};
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  }

  function toast(message, type) {
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

  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.pwd-toggle-btn');
    if (!btn) return;
    const input = btn.previousElementSibling;
    if (!input) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.innerHTML = showing ? EYE_OPEN_ICON : EYE_OFF_ICON;
  });

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
    if (!state.token) return state.view === 'login' ? renderLogin() : renderLanding();
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

  function renderLanding() {
    $app.innerHTML =
      '<div class="landing premium-bg">' +
        '<nav class="landing-nav">' +
          '<div class="landing-brand">🛞 Wheel<span class="grad-text">Care</span></div>' +
          '<button class="btn btn-outline-light btn-sm" id="nav-login-btn">Log In</button>' +
        '</nav>' +
        '<section class="landing-hero">' +
          '<div class="auth-badge-glow" style="margin:0 auto 24px;">🛞</div>' +
          '<h1 class="landing-headline">Run your <span class="grad-text">vehicle care</span> subscription business like a pro</h1>' +
          '<p class="landing-sub">Track monthly dues, send WhatsApp reminders with one tap, and manage customers, staff and payments — all from one dashboard.</p>' +
          '<div class="landing-cta-row">' +
            '<button class="btn btn-primary" id="get-started-btn">Get Started Free</button>' +
            '<button class="btn btn-outline-light" id="hero-login-btn">I already have an account</button>' +
          '</div>' +
        '</section>' +
        '<section class="landing-features">' +
          '<div class="feature-grid">' +
            LANDING_FEATURES.map((f) =>
              '<div class="glass-card feature-card"><div class="feature-icon">' + f.icon + '</div>' +
              '<h3>' + esc(f.title) + '</h3><p>' + esc(f.body) + '</p></div>'
            ).join('') +
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
    document.getElementById('admin-login-btn').addEventListener('click', () => goToLogin('superadmin'));
  }

  // ================= LOGIN =================
  const ROLE_HINTS = {
    client: 'Demo phone: 9876543210 · password: praveen123',
    customer: 'Demo phone: 9812345671 · password: anita123',
    superadmin: 'Demo phone: 9999999999 · password: admin123',
  };
  const ROLE_LABELS = { client: 'Business', customer: 'Customer', superadmin: 'Super Admin' };

  function renderLogin(errorMsg) {
    if (!state.loginMethod) state.loginMethod = 'password';
    const isOtp = state.loginMethod === 'otp';

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
            '<div class="method-tabs" id="method-tabs">' +
              '<button class="method-tab' + (!isOtp ? ' active' : '') + '" data-method="password">Password</button>' +
              '<button class="method-tab' + (isOtp ? ' active' : '') + '" data-method="otp">OTP</button>' +
            '</div>' +
            (errorMsg ? '<div class="auth-error">' + esc(errorMsg) + '</div>' : '') +
            (isOtp ? otpFormHtml() :
              '<form id="login-form">' +
                '<div class="field"><label>Phone</label><input id="login-phone" required pattern="[0-9]{10}" placeholder="10-digit number" autocomplete="tel" /></div>' +
                pwdFieldHtml('Password', 'password', { id: 'login-password', required: true, autocomplete: 'current-password' }) +
                '<button type="submit" class="btn btn-primary btn-block">Log In</button>' +
              '</form>') +
            '<div class="auth-links">' +
              '<button class="link-btn" id="forgot-password-btn">Forgot password?</button>' +
              (state.loginRole === 'client' ? '<button class="link-btn" id="register-business-btn">Register your business</button>' : '') +
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

    document.getElementById('method-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.method-tab');
      if (!btn) return;
      state.loginMethod = btn.dataset.method;
      renderLogin();
    });

    if (isOtp) {
      bindOtpForm();
    } else {
      document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = document.getElementById('login-phone').value.trim();
        const password = document.getElementById('login-password').value;
        try {
          const result = await api('/login', { method: 'POST', body: JSON.stringify({ role: state.loginRole, phone, password }) });
          saveSession(result.token, result.role, result.user);
          toast('Welcome back, ' + (result.user.name || result.user.businessName || result.user.username) + '!', 'success');
          render();
        } catch (err) {
          renderLogin(err.message);
        }
      });
    }

    document.getElementById('forgot-password-btn').addEventListener('click', openForgotPasswordModal);
    const registerBtn = document.getElementById('register-business-btn');
    if (registerBtn) registerBtn.addEventListener('click', openRegisterBusinessModal);
  }

  function otpFormHtml() {
    return (
      '<form id="otp-request-form">' +
        '<div class="field"><label>Phone</label><input id="otp-phone" required pattern="[0-9]{10}" placeholder="10-digit number" autocomplete="tel" /></div>' +
        '<button type="submit" class="btn btn-primary btn-block" id="send-otp-btn">Send OTP</button>' +
      '</form>' +
      '<div id="otp-step2" class="hidden">' +
        '<div class="otp-tap-row">' +
          '<a href="#" target="_blank" rel="noopener" class="btn btn-outline-light" id="otp-wa-link">💬 WhatsApp</a>' +
          '<a href="#" target="_blank" rel="noopener" class="btn btn-outline-light" id="otp-sms-link">✉️ SMS</a>' +
        '</div>' +
        '<p style="font-size:12px;color:rgba(255,255,255,0.55);margin:10px 0 16px;">Tap one to see your code, then enter it below.</p>' +
        '<form id="otp-verify-form">' +
          '<div class="field"><label>Enter Code</label><input id="otp-code" required maxlength="6" pattern="[0-9]{6}" placeholder="6-digit code" autocomplete="one-time-code" /></div>' +
          '<button type="submit" class="btn btn-primary btn-block">Verify &amp; Log In</button>' +
        '</form>' +
      '</div>'
    );
  }

  function bindOtpForm() {
    document.getElementById('otp-request-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = document.getElementById('otp-phone').value.trim();
      try {
        const result = await api('/otp/request', { method: 'POST', body: JSON.stringify({ role: state.loginRole, phone }) });
        document.getElementById('otp-wa-link').href = result.waLink;
        document.getElementById('otp-sms-link').href = result.smsLink;
        document.getElementById('otp-step2').classList.remove('hidden');
        document.getElementById('send-otp-btn').textContent = 'Resend OTP';
        toast('Code ready — tap WhatsApp or SMS to view it', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    document.getElementById('otp-verify-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = document.getElementById('otp-phone').value.trim();
      const otp = document.getElementById('otp-code').value.trim();
      try {
        const result = await api('/otp/verify', { method: 'POST', body: JSON.stringify({ role: state.loginRole, phone, otp }) });
        saveSession(result.token, result.role, result.user);
        toast('Welcome back, ' + (result.user.name || result.user.businessName || result.user.username) + '!', 'success');
        render();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  function openForgotPasswordModal() {
    const html =
      '<form id="forgot-password-form">' +
        '<div class="field"><label>Role</label><select name="role">' +
          Object.keys(ROLE_LABELS).map((r) => '<option value="' + r + '"' + (state.loginRole === r ? ' selected' : '') + '>' + ROLE_LABELS[r] + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Username</label><input name="username" required /></div>' +
        '<div class="field"><label>Phone (registered with your account)</label><input name="phone" required pattern="[0-9]{10}" placeholder="10-digit number" /></div>' +
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
            body: JSON.stringify({ role: f.get('role'), username: f.get('username'), phone: f.get('phone'), newPassword: f.get('newPassword') }),
          });
          toast('Password reset. You can log in now.', 'success');
          overlay.remove();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  function openRegisterBusinessModal() {
    const html =
      '<form id="register-business-form">' +
        '<div class="field"><label>Business Name</label><input name="businessName" required /></div>' +
        '<div class="field"><label>Owner Name</label><input name="ownerName" required /></div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Phone</label><input name="phone" required pattern="[0-9]{10}" placeholder="10-digit number" /></div>' +
          '<div class="field"><label>Area</label><input name="area" placeholder="Sunrise Residency" /></div>' +
        '</div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Choose Username</label><input name="username" required /></div>' +
          pwdFieldHtml('Choose Password', 'password', { required: true, minlength: 6, title: 'At least 6 characters' }) +
        '</div>' +
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
              username: f.get('username'), password: f.get('password'),
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
  function shellHtml(subtitle, showBottomNav) {
    const name = state.user ? (state.user.businessName || state.user.name || state.user.username) : '';
    return (
      '<div class="app-shell">' +
        '<header class="topbar">' +
          '<div class="topbar-left"><div class="logo-dot">🛞</div><div><div class="topbar-title">WheelCare</div><div class="topbar-sub">' + esc(subtitle) + '</div></div></div>' +
          '<div class="topbar-right"><span class="topbar-user">' + esc(name) + '</span><button class="icon-btn" id="logout-btn">Logout</button></div>' +
        '</header>' +
        '<main class="content' + (showBottomNav ? ' with-sidebar' : ' no-bottom-pad') + '" id="content"><div class="loading-spinner">Loading…</div></main>' +
        (showBottomNav ? bottomNavHtml() : '') +
      '</div>'
    );
  }

  function bottomNavHtml() {
    const tabs = [
      { id: 'home', icon: '🏠', label: 'Home' },
      { id: 'customers', icon: '👥', label: 'Customers' },
      { id: 'staff', icon: '🧰', label: 'Staff' },
      { id: 'payments', icon: '💳', label: 'Payments' },
    ];
    return '<nav class="bottom-nav sidebar-nav" id="bottom-nav">' +
      tabs.map((t) =>
        '<button class="nav-item' + (state.clientTab === t.id ? ' active' : '') + '" data-tab="' + t.id + '">' +
          '<span class="nav-icon">' + t.icon + '</span><span>' + t.label + '</span>' +
        '</button>'
      ).join('') +
    '</nav>';
  }

  function bindShellEvents(onTabChange) {
    document.getElementById('logout-btn').addEventListener('click', logout);
    const nav = document.getElementById('bottom-nav');
    if (nav) {
      nav.addEventListener('click', (e) => {
        const btn = e.target.closest('.nav-item');
        if (!btn) return;
        state.clientTab = btn.dataset.tab;
        onTabChange();
      });
    }
  }

  // ================= CLIENT =================
  async function renderClientShell() {
    $app.innerHTML = shellHtml('Business Dashboard', true);
    bindShellEvents(renderClientTab);
    await loadClientData();
    renderClientTab();
  }

  async function loadClientData() {
    try {
      state.data = await api('/client/data');
    } catch (err) {
      toast(err.message, 'error');
      if (/unauthorized/i.test(err.message)) logout();
    }
  }

  function renderClientTab() {
    const nav = document.getElementById('bottom-nav');
    if (nav) {
      nav.querySelectorAll('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === state.clientTab));
    }
    if (state.clientTab === 'home') return renderClientHome();
    if (state.clientTab === 'customers') return renderClientCustomers();
    if (state.clientTab === 'staff') return renderClientStaff();
    if (state.clientTab === 'payments') return renderClientPayments();
  }

  function renderClientHome() {
    const content = document.getElementById('content');
    const d = state.data;
    if (!d) { content.innerHTML = '<div class="loading-spinner">Loading…</div>'; return; }

    content.innerHTML =
      '<div class="hero-banner">' +
        '<div class="month-label">' + esc(monthLabel(d.month)) + '</div>' +
        '<h2>' + esc(d.client.businessName) + '</h2>' +
      '</div>' +
      '<div class="stat-row">' +
        '<div class="stat-card collected"><div class="stat-label">Collected this month</div><div class="stat-value">' + money(d.totalCollected) + '</div></div>' +
        '<div class="stat-card pending"><div class="stat-label">Pending this month</div><div class="stat-value">' + money(d.totalPending) + '</div></div>' +
      '</div>' +
      '<div class="overview-row overview-row-sm">' +
        '<div class="overview-card"><div class="ov-value">' + d.totalCustomers + '</div><div class="ov-label">Customers</div></div>' +
        '<div class="overview-card"><div class="ov-value">' + d.totalVehicles + '</div><div class="ov-label">Vehicles</div></div>' +
      '</div>' +
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
              '<div class="payment-row"><div class="pr-left"><div class="pr-name">' + esc(p.customerName) + ' · ' + esc(p.vehicleNumber) + '</div>' +
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
  }

  function pendingItemHtml(v) {
    const monthsBadge = v.monthsDue > 1 ? ' <span class="chip chip-amber">' + v.monthsDue + ' months</span>' : '';
    return (
      '<div class="pending-item">' +
        '<div class="pending-info"><div class="pi-name">' + esc(v.customerName) + '</div>' +
        '<div class="pi-sub">' + esc(v.vehicleType) + ' · ' + esc(v.vehicleNumber) + ' · ' + esc(v.flat || '') + ' · ' + money(v.amount) + monthsBadge + '</div></div>' +
        '<div class="pending-actions">' +
          '<button class="icon-round wa" title="WhatsApp reminder" data-remind-wa="' + v.vehicleId + '">💬</button>' +
          '<button class="icon-round sms" title="SMS reminder" data-remind-sms="' + v.vehicleId + '">✉️</button>' +
        '</div>' +
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
        '<div class="cc-top"><div><div class="cc-name">' + esc(c.name) + '</div>' +
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
    const icon = v.type === 'Car' ? '🚗' : '🛵';
    const amount = v.paid ? v.planAmount : v.dueAmount;
    const statusLabel = v.paid ? 'Paid' : (v.monthsDue > 1 ? v.monthsDue + ' months due' : 'Due');
    return (
      '<div class="vehicle-row">' +
        '<div class="vr-info"><span class="vr-icon">' + icon + '</span>' +
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

  function openAddCustomerModal() {
    const html =
      '<form id="add-customer-form">' +
        '<div class="field"><label>Full Name</label><input name="name" required /></div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Phone</label><input name="phone" required pattern="[0-9]{10}" placeholder="10-digit number" /></div>' +
          '<div class="field"><label>Flat / Unit</label><input name="flat" placeholder="A-101" /></div>' +
        '</div>' +
        '<div class="field"><label>Login Username</label><input name="username" required /></div>' +
        '<p style="font-size:12px;color:var(--text-muted);margin:-4px 0 16px;">The customer sets their own password via a link you send them after adding them.</p>' +
        '<div class="divider-label">First Vehicle (optional)</div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Type</label><select name="vtype"><option value="">— None —</option><option value="Bike">Bike</option><option value="Car">Car</option></select></div>' +
          '<div class="field"><label>Reg. Number</label><input name="vnumber" placeholder="KA01AB1234" style="text-transform:uppercase" pattern="' + VEHICLE_NUMBER_PATTERN + '" title="' + VEHICLE_NUMBER_TITLE + '" /></div>' +
        '</div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Model</label><input name="vmodel" placeholder="Honda Activa" /></div>' +
          '<div class="field"><label>Monthly Plan (₹)</label><input name="vamount" type="number" min="1" placeholder="300" /></div>' +
        '</div>' +
        '<button type="submit" class="btn btn-primary btn-block">Add Customer</button>' +
      '</form>';

    const overlay = openModal('Add Customer', html, (ov) => {
      ov.querySelector('#add-customer-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const payload = {
          name: f.get('name'), phone: f.get('phone'), flat: f.get('flat'),
          username: f.get('username'),
        };
        if (f.get('vtype') && f.get('vnumber') && f.get('vamount')) {
          payload.vehicle = { type: f.get('vtype'), number: f.get('vnumber'), model: f.get('vmodel'), planAmount: f.get('vamount') };
        }
        try {
          const result = await api('/client/customers', { method: 'POST', body: JSON.stringify(payload) });
          toast('Customer added', 'success');
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
    const html =
      '<form id="add-vehicle-form">' +
        '<div class="field"><label>For</label><input value="' + esc(customerName) + '" disabled /></div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Type</label><select name="type" required><option value="Bike">Bike</option><option value="Car">Car</option></select></div>' +
          '<div class="field"><label>Reg. Number</label><input name="number" required placeholder="KA01AB1234" style="text-transform:uppercase" pattern="' + VEHICLE_NUMBER_PATTERN + '" title="' + VEHICLE_NUMBER_TITLE + '" /></div>' +
        '</div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Model</label><input name="model" placeholder="Honda Activa" /></div>' +
          '<div class="field"><label>Monthly Plan (₹)</label><input name="planAmount" type="number" min="1" required placeholder="300" /></div>' +
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
      '<form id="edit-customer-form">' +
        '<div class="field"><label>Full Name</label><input name="name" required value="' + esc(customer.name) + '" /></div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Phone</label><input name="phone" required pattern="[0-9]{10}" value="' + esc(customer.phone) + '" /></div>' +
          '<div class="field"><label>Flat / Unit</label><input name="flat" value="' + esc(customer.flat || '') + '" /></div>' +
        '</div>' +
        '<div class="field"><label>Login Username</label><input name="username" required value="' + esc(customer.username) + '" /></div>' +
        '<button type="button" class="btn btn-outline btn-block btn-sm" id="reset-pwd-btn" style="margin-bottom:16px;">Send Password Setup Link</button>' +
        '<div class="divider-label">Add a Vehicle (optional)</div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Type</label><select name="vtype"><option value="">— None —</option><option value="Bike">Bike</option><option value="Car">Car</option></select></div>' +
          '<div class="field"><label>Reg. Number</label><input name="vnumber" placeholder="KA01AB1234" style="text-transform:uppercase" pattern="' + VEHICLE_NUMBER_PATTERN + '" title="' + VEHICLE_NUMBER_TITLE + '" /></div>' +
        '</div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Model</label><input name="vmodel" placeholder="Honda Activa" /></div>' +
          '<div class="field"><label>Monthly Plan (₹)</label><input name="vamount" type="number" min="1" placeholder="300" /></div>' +
        '</div>' +
        '<button type="submit" class="btn btn-primary btn-block">Save Changes</button>' +
      '</form>';

    const overlay = openModal('Edit Customer', html, (ov) => {
      ov.querySelector('#reset-pwd-btn').addEventListener('click', async () => {
        try {
          const result = await api('/client/customers/' + customer.id + '/reset-password', { method: 'POST' });
          showSendConfirmation(overlay, result.waLink, result.smsLink, () => {});
        } catch (err) {
          toast(err.message, 'error');
        }
      });
      ov.querySelector('#edit-customer-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const payload = { name: f.get('name'), phone: f.get('phone'), flat: f.get('flat'), username: f.get('username') };
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
          '<div class="field"><label>Monthly Plan (₹)</label><input name="planAmount" type="number" min="1" required value="' + vehicle.planAmount + '" /></div>' +
        '</div>' +
        '<button type="submit" class="btn btn-primary btn-block">Save Changes</button>' +
      '</form>';

    const overlay = openModal('Edit Vehicle', html, (ov) => {
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
    content.innerHTML =
      '<div class="section-header"><h3>Staff<span class="count-badge">' + staff.length + '</span></h3>' +
        '<button class="btn btn-primary btn-sm" id="add-staff-btn">+ Add Staff</button>' +
      '</div>' +
      (staff.length === 0
        ? '<div class="card"><div class="empty-state"><div class="empty-icon">🧰</div>No staff members yet.</div></div>'
        : '<div class="cards-grid">' + staff.map((s) =>
            '<div class="card staff-card"><div class="staff-avatar">' + esc(initials(s.name)) + '</div>' +
            '<div class="staff-info"><div class="sr-name">' + esc(s.name) + '</div><div class="sr-phone">' + esc(s.phone) + '</div></div>' +
            '<div class="cc-actions">' +
              '<button class="icon-action-btn" title="Edit staff" data-edit-staff="' + s.id + '">' + EDIT_ICON + '</button>' +
              '<button class="icon-action-btn danger" title="Remove staff" data-remove-staff="' + s.id + '">' + DELETE_ICON + '</button>' +
            '</div></div>'
          ).join('') + '</div>');

    document.getElementById('add-staff-btn').addEventListener('click', () => {
      const html =
        '<form id="add-staff-form">' +
          '<div class="field"><label>Full Name</label><input name="name" required /></div>' +
          '<div class="field"><label>Phone</label><input name="phone" required pattern="[0-9]{10}" placeholder="10-digit number" /></div>' +
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
            '<div class="field"><label>Phone</label><input name="phone" required pattern="[0-9]{10}" value="' + esc(member.phone) + '" /></div>' +
            '<button type="submit" class="btn btn-primary btn-block">Save Changes</button>' +
          '</form>';
        const overlay = openModal('Edit Staff Member', html, (ov) => {
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

  async function renderClientPayments() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading-spinner">Loading…</div>';
    try {
      state.payments = (await api('/client/payments')).payments;
    } catch (err) {
      toast(err.message, 'error');
      state.payments = [];
    }
    const payments = state.payments;

    content.innerHTML =
      '<div class="section-header"><h3>Record a Payment</h3></div>' +
      '<div class="card"><form id="record-payment-form">' +
        '<div class="field"><label>Customer</label><select name="customerId" id="pay-customer" required><option value="">Select customer…</option>' +
          state.data.customers.map((c) => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Vehicle</label><select name="vehicleId" id="pay-vehicle" required><option value="">Select customer first…</option></select></div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Month</label><input name="month" id="pay-month" value="' + esc(state.data.month) + '" /></div>' +
          '<div class="field"><label>Amount (₹)</label><input name="amount" id="pay-amount" type="number" /></div>' +
        '</div>' +
        '<div class="field"><label>Method</label><select name="method" required><option value="Cash">Cash</option><option value="UPI">UPI</option></select></div>' +
        '<button type="submit" class="btn btn-primary btn-block">Record Payment</button>' +
      '</form></div>' +
      '<div class="section-header"><h3>Payment History<span class="count-badge">' + payments.length + '</span></h3></div>' +
      '<div class="card">' +
        (payments.length === 0
          ? '<div class="empty-state"><div class="empty-icon">💳</div>No payments recorded yet.</div>'
          : payments.map((p) =>
              '<div class="payment-row"><div class="pr-left"><div class="pr-name">' + esc(p.customerName) + ' · ' + esc(p.vehicleNumber) + '</div>' +
              '<div class="pr-sub">' + esc(monthLabel(p.month)) + ' · ' + formatDate(p.date) + '</div></div>' +
              '<div class="pr-right"><div class="pr-amount">' + money(p.amount) + '</div><div class="pr-method">' + esc(p.method) + '</div></div></div>'
            ).join('')) +
      '</div>';

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
    $app.innerHTML = shellHtml('My Vehicles', false);
    document.getElementById('logout-btn').addEventListener('click', logout);
    await loadCustomerData();
    renderCustomerDashboard();
  }

  async function loadCustomerData() {
    try {
      state.data = await api('/customer/data');
    } catch (err) {
      toast(err.message, 'error');
      if (/unauthorized/i.test(err.message)) logout();
    }
  }

  function renderCustomerDashboard() {
    const content = document.getElementById('content');
    const d = state.data;
    if (!d) { content.innerHTML = '<div class="loading-spinner">Loading…</div>'; return; }

    content.innerHTML =
      '<div class="status-banner ' + (d.anyDue ? 'due' : 'paid') + '">' +
        '<div class="sb-icon">' + (d.anyDue ? '⏰' : '✅') + '</div>' +
        '<h2>' + (d.anyDue ? 'Payment Due: ' + money(d.totalDue) : 'All Paid Up!') + '</h2>' +
        '<p>' + (d.anyDue
          ? 'You have pending vehicle wash payment(s) as of ' + esc(monthLabel(d.month)) + '.'
          : 'Your subscription is fully settled for ' + esc(monthLabel(d.month)) + '. Thank you!') + '</p>' +
      '</div>' +
      '<div class="section-header"><h3>My Vehicles</h3></div>' +
      '<div class="cards-grid">' + d.vehicles.map((v) => {
        const icon = v.type === 'Car' ? '🚗' : '🛵';
        const statusLabel = v.paid ? 'Paid' : (v.monthsDue > 1 ? v.monthsDue + ' months due' : 'Due');
        return (
          '<div class="vehicle-card"><div class="vc-left"><div class="vc-icon">' + icon + '</div>' +
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
      '</div>' +
      '<div class="section-header"><h3>Payment History<span class="count-badge">' + d.paymentHistory.length + '</span></h3></div>' +
      '<div class="card">' +
        (d.paymentHistory.length === 0
          ? '<div class="empty-state"><div class="empty-icon">🧾</div>No payment history yet.</div>'
          : d.paymentHistory.map((p) =>
              '<div class="payment-row"><div class="pr-left"><div class="pr-name">' + esc(p.vehicleType) + ' · ' + esc(p.vehicleNumber) + '</div>' +
              '<div class="pr-sub">' + esc(monthLabel(p.month)) + ' · ' + formatDate(p.date) + '</div></div>' +
              '<div class="pr-right"><div class="pr-amount">' + money(p.amount) + '</div><div class="pr-method">' + esc(p.method) + '</div></div></div>'
            ).join('')) +
      '</div>';

    document.getElementById('contact-btn').addEventListener('click', () => window.open(d.contactWaLink, '_blank'));
  }

  // ================= SUPER ADMIN =================
  async function renderAdminShell() {
    $app.innerHTML = shellHtml('Platform Overview', false);
    document.getElementById('logout-btn').addEventListener('click', logout);
    await renderAdminDashboard();
  }

  async function renderAdminDashboard() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading-spinner">Loading…</div>';
    let overview, clients, requests;
    try {
      [overview, clients, requests] = await Promise.all([api('/admin/overview'), api('/admin/clients'), api('/admin/client-requests')]);
    } catch (err) {
      toast(err.message, 'error');
      if (/unauthorized/i.test(err.message)) return logout();
      return;
    }
    state.adminClients = clients.clients;
    state.clientRequests = requests.requests;

    content.innerHTML =
      '<div class="overview-row">' +
        '<div class="overview-card"><div class="ov-value">' + overview.totalClients + '</div><div class="ov-label">Businesses</div></div>' +
        '<div class="overview-card"><div class="ov-value">' + overview.totalCustomers + '</div><div class="ov-label">Customers</div></div>' +
        '<div class="overview-card"><div class="ov-value">' + overview.totalVehicles + '</div><div class="ov-label">Vehicles</div></div>' +
        '<div class="overview-card"><div class="ov-value">' + money(overview.totalRevenue) + '</div><div class="ov-label">Total Revenue</div></div>' +
      '</div>' +
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
      (state.adminClients.length === 0
        ? '<div class="card"><div class="empty-state"><div class="empty-icon">🏢</div>No client businesses onboarded yet.</div></div>'
        : '<div class="cards-grid">' + state.adminClients.map((c) =>
            '<div class="card"><div class="cc-top"><div><div class="cc-name">' + esc(c.businessName) +
            ' <span class="chip ' + (c.active === false ? 'chip-due' : 'chip-paid') + '">' + (c.active === false ? 'Inactive' : 'Active') + '</span></div>' +
            '<div class="cc-meta">' + esc(c.ownerName) + ' · ' + esc(c.area || '') + '</div></div>' +
            '<div class="cc-actions">' +
              '<button class="icon-action-btn" title="Edit business" data-edit-client="' + c.id + '">' + EDIT_ICON + '</button>' +
              '<button class="icon-action-btn danger" title="Delete business" data-delete-client="' + c.id + '" data-business-name="' + esc(c.businessName) + '">' + DELETE_ICON + '</button>' +
            '</div></div>' +
            '<div class="cc-vehicles">' +
              '<div class="vehicle-row"><div class="vr-info"><span class="vr-icon">👥</span><div class="vr-name">' + c.customerCount + ' customers</div></div>' +
              '<span class="vr-amount">' + c.vehicleCount + ' vehicles</span></div>' +
              '<div class="vehicle-row"><div class="vr-info"><span class="vr-icon">💰</span><div class="vr-name">Revenue collected</div></div>' +
              '<span class="vr-amount">' + money(c.revenue) + '</span></div>' +
            '</div>' +
            '<button class="btn btn-outline btn-sm btn-block" style="margin-top:10px;" data-toggle-active="' + c.id + '" data-currently-active="' + (c.active !== false) + '">' +
              (c.active === false ? 'Activate Business' : 'Deactivate Business') +
            '</button></div>'
          ).join('') + '</div>');

    content.querySelectorAll('[data-approve-request]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api('/admin/client-requests/' + btn.dataset.approveRequest + '/approve', { method: 'POST' });
          toast('Business approved', 'success');
          renderAdminDashboard();
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
          renderAdminDashboard();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
    content.querySelectorAll('[data-toggle-active]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const currentlyActive = btn.dataset.currentlyActive === 'true';
        try {
          await api('/admin/clients/' + btn.dataset.toggleActive + '/active', {
            method: 'POST',
            body: JSON.stringify({ active: !currentlyActive }),
          });
          toast(currentlyActive ? 'Business deactivated' : 'Business activated', 'success');
          renderAdminDashboard();
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
            '<div class="field"><label>Phone</label><input name="phone" required pattern="[0-9]{10}" placeholder="10-digit number" /></div>' +
            '<div class="field"><label>Area</label><input name="area" placeholder="Sunrise Residency" /></div>' +
          '</div>' +
          '<div class="form-grid">' +
            '<div class="field"><label>Login Username</label><input name="username" required /></div>' +
            pwdFieldHtml('Login Password', 'password', { required: true, minlength: 6, title: 'At least 6 characters' }) +
          '</div>' +
          '<button type="submit" class="btn btn-primary btn-block">Onboard Business</button>' +
        '</form>';
      const overlay = openModal('Add Client Business', html, (ov) => {
        ov.querySelector('#add-client-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = new FormData(e.target);
          try {
            await api('/admin/clients', {
              method: 'POST',
              body: JSON.stringify({
                businessName: f.get('businessName'), ownerName: f.get('ownerName'),
                phone: f.get('phone'), area: f.get('area'),
                username: f.get('username'), password: f.get('password'),
              }),
            });
            toast('Business onboarded', 'success');
            overlay.remove();
            renderAdminDashboard();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
    });

    content.querySelectorAll('[data-edit-client]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const client = state.adminClients.find((c) => c.id === btn.dataset.editClient);
        if (client) openEditClientModal(client);
      });
    });
    content.querySelectorAll('[data-delete-client]').forEach((btn) => {
      btn.addEventListener('click', () => deleteClient(btn.dataset.deleteClient, btn.dataset.businessName));
    });
  }

  function openEditClientModal(client) {
    const html =
      '<form id="edit-client-form">' +
        '<div class="field"><label>Business Name</label><input name="businessName" required value="' + esc(client.businessName) + '" /></div>' +
        '<div class="field"><label>Owner Name</label><input name="ownerName" required value="' + esc(client.ownerName) + '" /></div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Phone</label><input name="phone" required pattern="[0-9]{10}" value="' + esc(client.phone) + '" /></div>' +
          '<div class="field"><label>Area</label><input name="area" value="' + esc(client.area || '') + '" /></div>' +
        '</div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Login Username</label><input name="username" required value="' + esc(client.username) + '" /></div>' +
          pwdFieldHtml('New Password', 'password', { minlength: 6, placeholder: 'Leave blank to keep', title: 'At least 6 characters' }) +
        '</div>' +
        '<button type="submit" class="btn btn-primary btn-block">Save Changes</button>' +
      '</form>';

    const overlay = openModal('Edit Client Business', html, (ov) => {
      ov.querySelector('#edit-client-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const payload = {
          businessName: f.get('businessName'), ownerName: f.get('ownerName'),
          phone: f.get('phone'), area: f.get('area'), username: f.get('username'),
        };
        if (f.get('password')) payload.password = f.get('password');
        try {
          await api('/admin/clients/' + client.id, { method: 'PUT', body: JSON.stringify(payload) });
          toast('Business updated', 'success');
          overlay.remove();
          renderAdminDashboard();
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
      renderAdminDashboard();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ================= SET PASSWORD (public, via WhatsApp/SMS link) =================
  function renderSetPassword(token) {
    $app.innerHTML =
      '<div class="auth-screen premium-bg">' +
        '<div class="auth-center">' +
          '<div class="auth-badge-glow">🔑</div>' +
          '<h1 class="auth-brand">Set Your <span class="grad-text">Password</span></h1>' +
          '<p class="auth-tagline">Choose a password to activate your account.</p>' +
          '<div class="glass-card auth-card-dark">' +
            '<div class="auth-error hidden" id="setpwd-error"></div>' +
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
      const f = new FormData(e.target);
      const password = f.get('password');
      const errorEl = document.getElementById('setpwd-error');
      errorEl.classList.add('hidden');
      if (password !== f.get('confirm')) {
        errorEl.textContent = 'Passwords do not match';
        errorEl.classList.remove('hidden');
        return;
      }
      try {
        const result = await api('/set-password', { method: 'POST', body: JSON.stringify({ token, password }) });
        location.hash = '';
        state.view = 'login';
        state.loginRole = 'customer';
        render();
        toast('Password set! Log in as ' + result.username + '.', 'success');
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
      }
    });
  }

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    return { path, params: new URLSearchParams(qs || '') };
  }

  const initialHash = parseHash();
  if (initialHash.path === 'set-password' && initialHash.params.get('token')) {
    renderSetPassword(initialHash.params.get('token'));
  } else {
    if (initialHash.path === 'login') {
      state.view = 'login';
      const role = initialHash.params.get('role');
      if (role && ROLE_LABELS[role]) state.loginRole = role;
    }
    render();
  }
})();
