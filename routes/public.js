const { readDB, writeDB, nextId } = require('../db');
const { isValidPhone, isValidPassword, MIN_PASSWORD_LENGTH } = require('../utils');

module.exports = function registerPublicRoutes(app) {
  // ---------- Business registration requests ----------
  app.post('/api/client-requests', (req, res) => {
    const { businessName, ownerName, username, password, phone, area } = req.body || {};
    if (!businessName || !ownerName || !username || !password || !phone) {
      return res.status(400).json({ error: 'businessName, ownerName, username, password and phone are required' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'phone must be a 10-digit number' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const db = readDB();
    if (db.clients.some((c) => c.username === username)) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    if (db.clientRequests.some((r) => r.username === username && r.status === 'pending')) {
      return res.status(409).json({ error: 'A request with this username is already pending review' });
    }

    const request = {
      id: nextId(db, 'clientRequests', 'req'),
      businessName,
      ownerName,
      username,
      password,
      phone,
      area: area || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    db.clientRequests.push(request);
    writeDB(db);
    res.status(201).json({ request: { ...request, password: undefined } });
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

    account.password = newPassword;
    writeDB(db);
    res.json({ ok: true });
  });
};
