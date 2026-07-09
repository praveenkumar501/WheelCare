const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { readDB } = db;
const { makeToken, sanitizeClient, sanitizeCustomer, comparePassword } = require('./utils');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(express.json({ limit: '12mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api/')) {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    }
  });
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// token -> { role, id, clientId }
// Persisted to disk so sessions survive a server sleep/wake cycle (e.g. Render's
// free-tier idle spin-down); a fresh deploy still requires logging in again.
const SESSIONS_PATH = path.join(__dirname, 'data', 'sessions.json');

function loadSessions() {
  try {
    const raw = fs.readFileSync(SESSIONS_PATH, 'utf8');
    return new Map(Object.entries(JSON.parse(raw)));
  } catch (e) {
    return new Map();
  }
}

function saveSessions() {
  try {
    fs.writeFileSync(SESSIONS_PATH, JSON.stringify(Object.fromEntries(sessions)));
  } catch (e) {
    // best-effort; an in-memory-only session is still better than a crash
  }
}

const sessions = loadSessions();

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

app.get('/api/health', (req, res) => {
  res.json({ ok: true, dbBackend: db.getBackend() });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const db = readDB();

  if (db.superadmin.username === username && comparePassword(password, db.superadmin.password)) {
    const token = makeToken();
    sessions.set(token, { role: 'superadmin', id: 'superadmin' });
    saveSessions();
    return res.json({ token, role: 'superadmin', user: { name: 'Super Admin', username } });
  }

  const client = db.clients.find((c) => c.username === username);
  if (client && comparePassword(password, client.password)) {
    if (client.active === false) {
      return res.status(403).json({ error: 'This business account has been deactivated. Contact the platform admin.' });
    }
    const token = makeToken();
    sessions.set(token, { role: 'client', id: client.id });
    saveSessions();
    return res.json({ token, role: 'client', user: sanitizeClient(client) });
  }

  const customer = db.customers.find((c) => c.username === username);
  if (customer && comparePassword(password, customer.password)) {
    const parentClient = db.clients.find((c) => c.id === customer.clientId);
    if (parentClient && parentClient.active === false) {
      return res.status(403).json({ error: 'This business account is currently inactive. Please contact them directly.' });
    }
    const token = makeToken();
    sessions.set(token, { role: 'customer', id: customer.id, clientId: customer.clientId });
    saveSessions();
    return res.json({ token, role: 'customer', user: sanitizeCustomer(customer) });
  }

  return res.status(401).json({ error: 'Invalid username or password' });
});

app.post('/api/logout', authenticate(), (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.slice(7);
  sessions.delete(token);
  saveSessions();
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

db.ready().then(() => {
  app.listen(PORT, () => {
    console.log(`WheelCare server running on http://localhost:${PORT} — db backend: ${db.getBackend()}`);
  });
  setInterval(() => {
    console.log(`${new Date().toISOString()} heartbeat — db backend: ${db.getBackend()}`);
  }, 15 * 60 * 1000);

  // Render's free tier spins the service down after ~15 min without inbound
  // traffic, making the next visit painfully slow. Pinging our own public
  // /api/health URL counts as traffic and keeps the instance awake.
  // RENDER_EXTERNAL_URL is set automatically by Render; KEEP_ALIVE_URL can
  // override it on other hosts. No env var set (e.g. local dev) = no pinging.
  const keepAliveBase = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
  if (keepAliveBase) {
    const healthUrl = `${keepAliveBase.replace(/\/$/, '')}/api/health`;
    console.log(`keep-alive: pinging ${healthUrl} every 10 minutes`);
    setInterval(() => {
      fetch(healthUrl)
        .then((res) => { if (!res.ok) console.error(`keep-alive ping got HTTP ${res.status}`); })
        .catch((err) => console.error('keep-alive ping failed:', err.message));
    }, 10 * 60 * 1000);
  }
});
