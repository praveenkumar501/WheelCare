(function () {
  'use strict';

  const API = '/api';
  const state = {
    token: localStorage.getItem('wc_token') || null,
    role: localStorage.getItem('wc_role') || null,
    user: JSON.parse(localStorage.getItem('wc_user') || 'null'),
    loginRole: 'client',
    clientTab: 'home',
    data: null, // role-specific dashboard payload
    staff: null,
    payments: null,
    adminClients: null,
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

  // ---------------- Root render ----------------
  function render() {
    if (!state.token) return renderLogin();
    if (state.role === 'superadmin') return renderAdminShell();
    if (state.role === 'client') return renderClientShell();
    if (state.role === 'customer') return renderCustomerShell();
  }

  // ================= LOGIN =================
  const ROLE_HINTS = {
    client: 'Demo: praveen / praveen123',
    customer: 'Demo: anita / anita123',
    superadmin: 'Demo: admin / admin123',
  };
  const ROLE_LABELS = { client: 'Business', customer: 'Customer', superadmin: 'Super Admin' };

  function renderLogin(errorMsg) {
    $app.innerHTML =
      '<div class="auth-screen">' +
        '<div class="auth-hero">' +
          '<div class="hero-badge">🛞</div>' +
          '<h1>WheelCare</h1>' +
          '<p>Monthly bike &amp; car wash subscriptions for your community — one tap to track dues and send reminders.</p>' +
        '</div>' +
        '<div class="auth-card">' +
          '<div class="role-tabs" id="role-tabs">' +
            Object.keys(ROLE_LABELS).map((r) =>
              '<button class="role-tab' + (state.loginRole === r ? ' active' : '') + '" data-role="' + r + '">' + ROLE_LABELS[r] + '</button>'
            ).join('') +
          '</div>' +
          (errorMsg ? '<div class="auth-error">' + esc(errorMsg) + '</div>' : '') +
          '<form id="login-form">' +
            '<div class="field"><label>Username</label><input id="login-username" autocomplete="username" required /></div>' +
            '<div class="field"><label>Password</label><input id="login-password" type="password" autocomplete="current-password" required /></div>' +
            '<button type="submit" class="btn btn-primary btn-block">Log In</button>' +
          '</form>' +
          '<div class="auth-hint">' + ROLE_HINTS[state.loginRole] + '</div>' +
        '</div>' +
      '</div>';

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
      '<div class="section-header"><h3>Payment Due<span class="count-badge">' + d.pendingVehicles.length + '</span></h3>' +
        (d.pendingVehicles.length ? '<button class="btn btn-outline btn-sm" id="remind-all-btn">Remind All</button>' : '') +
      '</div>' +
      '<div class="card">' +
        (d.pendingVehicles.length === 0
          ? '<div class="empty-state"><div class="empty-icon">🎉</div>All vehicles are paid up for this month!</div>'
          : d.pendingVehicles.map(pendingItemHtml).join('')) +
      '</div>';

    content.querySelectorAll('[data-remind-wa]').forEach((btn) => {
      btn.addEventListener('click', () => sendReminder(btn.dataset.remindWa, 'wa'));
    });
    content.querySelectorAll('[data-remind-sms]').forEach((btn) => {
      btn.addEventListener('click', () => sendReminder(btn.dataset.remindSms, 'sms'));
    });
    const remindAllBtn = document.getElementById('remind-all-btn');
    if (remindAllBtn) remindAllBtn.addEventListener('click', remindAll);
  }

  function pendingItemHtml(v) {
    return (
      '<div class="pending-item">' +
        '<div class="pending-info"><div class="pi-name">' + esc(v.customerName) + '</div>' +
        '<div class="pi-sub">' + esc(v.vehicleType) + ' · ' + esc(v.vehicleNumber) + ' · ' + esc(v.flat || '') + ' · ' + money(v.amount) + '</div></div>' +
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
      '<div class="section-header"><h3>Customers<span class="count-badge">' + d.customers.length + '</span></h3>' +
        '<button class="btn btn-primary btn-sm" id="add-customer-btn">+ Add Customer</button>' +
      '</div>' +
      (d.customers.length === 0
        ? '<div class="card"><div class="empty-state"><div class="empty-icon">👥</div>No customers yet. Add your first one!</div></div>'
        : '<div class="cards-grid">' + d.customers.map(customerCardHtml).join('') + '</div>');

    document.getElementById('add-customer-btn').addEventListener('click', openAddCustomerModal);
    content.querySelectorAll('[data-add-vehicle]').forEach((btn) => {
      btn.addEventListener('click', () => openAddVehicleModal(btn.dataset.addVehicle, btn.dataset.customerName));
    });
  }

  function customerCardHtml(c) {
    return (
      '<div class="card customer-card">' +
        '<div class="cc-top"><div><div class="cc-name">' + esc(c.name) + '</div>' +
        '<div class="cc-meta">' + esc(c.flat || '') + ' · ' + esc(c.phone) + '</div></div>' +
        '<button class="link-btn" data-add-vehicle="' + c.id + '" data-customer-name="' + esc(c.name) + '">+ Vehicle</button></div>' +
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
    return (
      '<div class="vehicle-row">' +
        '<div class="vr-info"><span class="vr-icon">' + icon + '</span>' +
        '<div><div class="vr-name">' + esc(v.model || v.type) + '</div><div class="vr-sub">' + esc(v.number) + '</div></div></div>' +
        '<div class="vr-right"><span class="vr-amount">' + money(v.planAmount) + '</span>' +
        '<span class="chip ' + (v.paid ? 'chip-paid' : 'chip-due') + '">' + (v.paid ? 'Paid' : 'Due') + '</span></div>' +
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
        '<div class="form-grid">' +
          '<div class="field"><label>Login Username</label><input name="username" required /></div>' +
          '<div class="field"><label>Login Password</label><input name="password" type="password" required minlength="6" title="At least 6 characters" /></div>' +
        '</div>' +
        '<div class="divider-label">First Vehicle (optional)</div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>Type</label><select name="vtype"><option value="">— None —</option><option value="Bike">Bike</option><option value="Car">Car</option></select></div>' +
          '<div class="field"><label>Reg. Number</label><input name="vnumber" placeholder="KA01AB1234" /></div>' +
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
          username: f.get('username'), password: f.get('password'),
        };
        if (f.get('vtype') && f.get('vnumber') && f.get('vamount')) {
          payload.vehicle = { type: f.get('vtype'), number: f.get('vnumber'), model: f.get('vmodel'), planAmount: f.get('vamount') };
        }
        try {
          await api('/client/customers', { method: 'POST', body: JSON.stringify(payload) });
          toast('Customer added', 'success');
          overlay.remove();
          await loadClientData();
          renderClientTab();
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
          '<div class="field"><label>Reg. Number</label><input name="number" required placeholder="KA01AB1234" /></div>' +
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
      '<div class="card">' +
        (staff.length === 0
          ? '<div class="empty-state"><div class="empty-icon">🧰</div>No staff members yet.</div>'
          : staff.map((s) =>
              '<div class="staff-row"><div><div class="sr-name">' + esc(s.name) + '</div><div class="sr-phone">' + esc(s.phone) + '</div></div>' +
              '<button class="btn btn-danger-ghost" data-remove-staff="' + s.id + '">Remove</button></div>'
            ).join('')) +
      '</div>';

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
            await api('/client/staff', { method: 'POST', body: JSON.stringify({ name: f.get('name'), phone: f.get('phone') }) });
            toast('Staff member added', 'success');
            overlay.remove();
            renderClientStaff();
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
        await api('/client/payments', {
          method: 'POST',
          body: JSON.stringify({ vehicleId: f.get('vehicleId'), month: f.get('month'), amount: f.get('amount'), method: f.get('method') }),
        });
        toast('Payment recorded', 'success');
        await loadClientData();
        renderClientPayments();
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
        '<h2>' + (d.anyDue ? 'Payment Due' : 'All Paid Up!') + '</h2>' +
        '<p>' + (d.anyDue
          ? 'You have pending vehicle wash payment(s) for ' + esc(monthLabel(d.month)) + '.'
          : 'Your subscription is fully settled for ' + esc(monthLabel(d.month)) + '. Thank you!') + '</p>' +
      '</div>' +
      '<div class="section-header"><h3>My Vehicles</h3></div>' +
      '<div class="cards-grid">' + d.vehicles.map((v) => {
        const icon = v.type === 'Car' ? '🚗' : '🛵';
        return (
          '<div class="vehicle-card"><div class="vc-left"><div class="vc-icon">' + icon + '</div>' +
          '<div><div class="vc-name">' + esc(v.model || v.type) + '</div><div class="vc-sub">' + esc(v.number) + ' · ' + esc(v.type) + '</div></div></div>' +
          '<div class="vc-right"><div class="vc-amount">' + money(v.planAmount) + '/mo</div>' +
          '<span class="chip ' + (v.paid ? 'chip-paid' : 'chip-due') + '">' + (v.paid ? 'Paid' : 'Due') + '</span></div></div>'
        );
      }).join('') + '</div>' +
      '<button class="btn btn-navy btn-block" id="contact-btn" style="margin: 16px 0 6px;">💬 Message ' + esc(d.client.businessName) + ' on WhatsApp</button>' +
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
    let overview, clients;
    try {
      [overview, clients] = await Promise.all([api('/admin/overview'), api('/admin/clients')]);
    } catch (err) {
      toast(err.message, 'error');
      if (/unauthorized/i.test(err.message)) return logout();
      return;
    }
    state.adminClients = clients.clients;

    content.innerHTML =
      '<div class="overview-row">' +
        '<div class="overview-card"><div class="ov-value">' + overview.totalClients + '</div><div class="ov-label">Businesses</div></div>' +
        '<div class="overview-card"><div class="ov-value">' + overview.totalCustomers + '</div><div class="ov-label">Customers</div></div>' +
        '<div class="overview-card"><div class="ov-value">' + overview.totalVehicles + '</div><div class="ov-label">Vehicles</div></div>' +
        '<div class="overview-card"><div class="ov-value">' + money(overview.totalRevenue) + '</div><div class="ov-label">Total Revenue</div></div>' +
      '</div>' +
      '<div class="section-header"><h3>Client Businesses<span class="count-badge">' + state.adminClients.length + '</span></h3>' +
        '<button class="btn btn-primary btn-sm" id="add-client-btn">+ Add Business</button>' +
      '</div>' +
      (state.adminClients.length === 0
        ? '<div class="card"><div class="empty-state"><div class="empty-icon">🏢</div>No client businesses onboarded yet.</div></div>'
        : '<div class="cards-grid">' + state.adminClients.map((c) =>
            '<div class="card"><div class="cc-top"><div><div class="cc-name">' + esc(c.businessName) + '</div>' +
            '<div class="cc-meta">' + esc(c.ownerName) + ' · ' + esc(c.area || '') + '</div></div></div>' +
            '<div class="cc-vehicles">' +
              '<div class="vehicle-row"><div class="vr-info"><span class="vr-icon">👥</span><div class="vr-name">' + c.customerCount + ' customers</div></div>' +
              '<span class="vr-amount">' + c.vehicleCount + ' vehicles</span></div>' +
              '<div class="vehicle-row"><div class="vr-info"><span class="vr-icon">💰</span><div class="vr-name">Revenue collected</div></div>' +
              '<span class="vr-amount">' + money(c.revenue) + '</span></div>' +
            '</div></div>'
          ).join('') + '</div>');

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
            '<div class="field"><label>Login Password</label><input name="password" type="password" required minlength="6" title="At least 6 characters" /></div>' +
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
  }

  render();
})();
