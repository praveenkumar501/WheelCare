const express = require('express');
const path = require('path');
const { readDB } = require('./db');
const { makeToken, sanitizeClient, sanitizeCustomer, comparePassword } = require('./utils');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// token -> { role, id, clientId }
const sessions = new Map();

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

app.post('/api/login', (req, res) => {
  const { role, username, password } = req.body || {};
  if (!role || !username || !password) {
    return res.status(400).json({ error: 'role, username and password are required' });
  }

  const db = readDB();

  if (role === 'superadmin') {
    if (db.superadmin.username === username && comparePassword(password, db.superadmin.password)) {
      const token = makeToken();
      sessions.set(token, { role: 'superadmin', id: 'superadmin' });
      return res.json({ token, role: 'superadmin', user: { name: 'Super Admin', username } });
    }
  } else if (role === 'client') {
    const client = db.clients.find((c) => c.username === username);
    if (client && comparePassword(password, client.password)) {
      if (client.active === false) {
        return res.status(403).json({ error: 'This business account has been deactivated. Contact the platform admin.' });
      }
      const token = makeToken();
      sessions.set(token, { role: 'client', id: client.id });
      return res.json({ token, role: 'client', user: sanitizeClient(client) });
    }
  } else if (role === 'customer') {
    const customer = db.customers.find((c) => c.username === username);
    if (customer && comparePassword(password, customer.password)) {
      const parentClient = db.clients.find((c) => c.id === customer.clientId);
      if (parentClient && parentClient.active === false) {
        return res.status(403).json({ error: 'This business account is currently inactive. Please contact them directly.' });
      }
      const token = makeToken();
      sessions.set(token, { role: 'customer', id: customer.id, clientId: customer.clientId });
      return res.json({ token, role: 'customer', user: sanitizeCustomer(customer) });
    }
  } else {
    return res.status(400).json({ error: 'Invalid role' });
  }

  return res.status(401).json({ error: 'Invalid username or password' });
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
