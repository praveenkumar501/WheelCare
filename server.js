const express = require('express');
const path = require('path');
const { readDB } = require('./db');
const { makeToken, sanitizeClient, sanitizeCustomer, isValidPhone, buildWaLink, buildSmsLink } = require('./utils');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// token -> { role, id, clientId }
const sessions = new Map();
// `${role}:${phone}` -> { otp, expiresAt }
const otpStore = new Map();
const OTP_TTL_MS = 5 * 60 * 1000;

function authenticate(...roles) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const session = token && sessions.get(token);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    if (roles.length && !roles.includes(session.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.session = session;
    next();
  };
}

function findAccountByPhone(db, role, phone) {
  if (role === 'superadmin') return db.superadmin.phone === phone ? db.superadmin : null;
  if (role === 'client') return db.clients.find((c) => c.phone === phone) || null;
  if (role === 'customer') return db.customers.find((c) => c.phone === phone) || null;
  return null;
}

function establishSession(res, db, role, account) {
  if (role === 'superadmin') {
    const token = makeToken();
    sessions.set(token, { role: 'superadmin', id: 'superadmin' });
    return res.json({ token, role: 'superadmin', user: { name: 'Super Admin', username: account.username } });
  }
  if (role === 'client') {
    if (account.active === false) {
      return res.status(403).json({ error: 'This business account has been deactivated. Contact the platform admin.' });
    }
    const token = makeToken();
    sessions.set(token, { role: 'client', id: account.id });
    return res.json({ token, role: 'client', user: sanitizeClient(account) });
  }
  const parentClient = db.clients.find((c) => c.id === account.clientId);
  if (parentClient && parentClient.active === false) {
    return res.status(403).json({ error: 'This business account is currently inactive. Please contact them directly.' });
  }
  const token = makeToken();
  sessions.set(token, { role: 'customer', id: account.id, clientId: account.clientId });
  return res.json({ token, role: 'customer', user: sanitizeCustomer(account) });
}

app.post('/api/otp/request', (req, res) => {
  const { role, phone } = req.body || {};
  if (!role || !phone) return res.status(400).json({ error: 'role and phone are required' });
  if (!isValidPhone(phone)) return res.status(400).json({ error: 'phone must be a 10-digit number' });

  const db = readDB();
  const account = findAccountByPhone(db, role, phone);
  if (!account) return res.status(404).json({ error: 'No account found with that phone number' });

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(`${role}:${phone}`, { otp, expiresAt: Date.now() + OTP_TTL_MS });

  const message = `Your WheelCare login code is ${otp}. It expires in 5 minutes. Don't share this code with anyone.`;
  res.json({
    waLink: buildWaLink(phone, message),
    smsLink: buildSmsLink(phone, message),
  });
});

app.post('/api/otp/verify', (req, res) => {
  const { role, phone, otp } = req.body || {};
  if (!role || !phone || !otp) return res.status(400).json({ error: 'role, phone and otp are required' });

  const key = `${role}:${phone}`;
  const entry = otpStore.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    otpStore.delete(key);
    return res.status(400).json({ error: 'Code expired or not requested. Please request a new one.' });
  }
  if (entry.otp !== String(otp).trim()) {
    return res.status(401).json({ error: 'Incorrect code' });
  }
  otpStore.delete(key);

  const db = readDB();
  const account = findAccountByPhone(db, role, phone);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  return establishSession(res, db, role, account);
});

app.post('/api/logout', authenticate(), (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.slice(7);
  sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/me', authenticate(), (req, res) => {
  res.json({ role: req.session.role, id: req.session.id });
});

require('./routes/admin')(app, authenticate);
require('./routes/client')(app, authenticate);
require('./routes/customer')(app, authenticate);
require('./routes/public')(app);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`WheelCare server running on http://localhost:${PORT}`);
});
