const { readDB, writeDB } = require('../db');
const { nextId } = require('../db');
const { isValidPhone, isValidPassword, MIN_PASSWORD_LENGTH, hashPassword, isPasswordSetupTokenExpired, isValidUsername, isUsernameTaken } = require('../utils');

module.exports = function registerPublicRoutes(app) {
  // ---------- Shared username availability check (one login, one username pool) ----------
  app.get('/api/username-availability', (req, res) => {
    const username = String(req.query.username || '').toLowerCase();
    if (!isValidUsername(username)) {
      return res.json({ available: false, reason: '3-20 lowercase letters/numbers, no spaces' });
    }
    const db = readDB();
    res.json({ available: !isUsernameTaken(db, username) });
  });

  // ---------- Business registration requests ----------

  app.post('/api/client-requests', (req, res) => {
    const { businessName, ownerName, phone, area, username } = req.body || {};
    if (!businessName || !ownerName || !phone || !username) {
      return res.status(400).json({ error: 'businessName, ownerName, phone and username are required' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'phone must be a 10-digit number' });
    }

    const db = readDB();
    const cleanUsername = String(username).trim().toLowerCase();
    if (!isValidUsername(cleanUsername)) {
      return res.status(400).json({ error: 'Username must be 3-20 lowercase letters/numbers, no spaces' });
    }
    if (isUsernameTaken(db, cleanUsername)) {
      return res.status(409).json({ error: 'That username is already taken' });
    }

    const request = {
      id: nextId(db, 'clientRequests', 'req'),
      businessName,
      ownerName,
      phone,
      area: area || '',
      username: cleanUsername,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    db.clientRequests.push(request);
    writeDB(db);
    res.status(201).json({ request });
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
