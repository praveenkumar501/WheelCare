const { readDB, writeDB } = require('../db');
const { nextId } = require('../db');
const { isValidPhone, isValidPassword, MIN_PASSWORD_LENGTH, hashPassword, isPasswordSetupTokenExpired } = require('../utils');

module.exports = function registerPublicRoutes(app) {
  // ---------- Business registration requests ----------
  app.post('/api/client-requests', (req, res) => {
    const { businessName, ownerName, phone, area } = req.body || {};
    if (!businessName || !ownerName || !phone) {
      return res.status(400).json({ error: 'businessName, ownerName and phone are required' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'phone must be a 10-digit number' });
    }

    const db = readDB();
    const request = {
      id: nextId(db, 'clientRequests', 'req'),
      businessName,
      ownerName,
      phone,
      area: area || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    db.clientRequests.push(request);
    writeDB(db);
    res.status(201).json({ request });
  });

  // ---------- Forgot password (self-service, verified by username + phone) ----------
  app.post('/api/forgot-password', (req, res) => {
    const { role, username, phone, newPassword } = req.body || {};
    if (!role || !username || !phone || !newPassword) {
      return res.status(400).json({ error: 'role, username, phone and newPassword are required' });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const db = readDB();
    let account = null;
    if (role === 'superadmin') {
      if (db.superadmin.username === username && db.superadmin.phone === phone) account = db.superadmin;
    } else if (role === 'client') {
      account = db.clients.find((c) => c.username === username && c.phone === phone) || null;
    } else if (role === 'customer') {
      account = db.customers.find((c) => c.username === username && c.phone === phone) || null;
    } else {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (!account) {
      return res.status(404).json({ error: 'No account found matching that username and phone number' });
    }

    account.password = hashPassword(newPassword);
    writeDB(db);
    res.json({ ok: true });
  });

  // ---------- Set password via WhatsApp/SMS link (new accounts + resets, client or customer) ----------
  app.post('/api/set-password', (req, res) => {
    const { role, token, password } = req.body || {};
    if (!role || !token || !password) {
      return res.status(400).json({ error: 'role, token and password are required' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const db = readDB();
    let account = null;
    if (role === 'client') {
      account = db.clients.find((c) => c.passwordSetupToken === token) || null;
    } else if (role === 'customer') {
      account = db.customers.find((c) => c.passwordSetupToken === token) || null;
    } else {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (!account) {
      return res.status(404).json({ error: 'This setup link is invalid or has already been used' });
    }
    if (isPasswordSetupTokenExpired(account.passwordSetupTokenExpiresAt)) {
      return res.status(410).json({ error: 'This link has expired. Please ask for a new one to be sent.' });
    }

    account.password = hashPassword(password);
    account.passwordSetupToken = null;
    account.passwordSetupTokenExpiresAt = null;
    writeDB(db);
    res.json({ ok: true, username: account.username });
  });
};
