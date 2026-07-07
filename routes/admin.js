const { readDB, writeDB, nextId } = require('../db');
const { sanitizeClient, isValidPhone, isValidPassword, MIN_PASSWORD_LENGTH } = require('../utils');

module.exports = function registerAdminRoutes(app, authenticate) {
  function clientStats(db, client) {
    const customers = db.customers.filter((c) => c.clientId === client.id);
    const customerIds = new Set(customers.map((c) => c.id));
    const vehicles = db.vehicles.filter((v) => customerIds.has(v.customerId));
    const vehicleIds = new Set(vehicles.map((v) => v.id));
    const revenue = db.payments
      .filter((p) => vehicleIds.has(p.vehicleId))
      .reduce((sum, p) => sum + p.amount, 0);
    return {
      ...sanitizeClient(client),
      customerCount: customers.length,
      vehicleCount: vehicles.length,
      revenue,
    };
  }

  app.get('/api/admin/clients', authenticate('superadmin'), (req, res) => {
    const db = readDB();
    const clients = db.clients.map((c) => clientStats(db, c));
    res.json({ clients });
  });

  app.post('/api/admin/clients', authenticate('superadmin'), (req, res) => {
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

    const client = {
      id: nextId(db, 'clients', 'c'),
      businessName,
      ownerName,
      username,
      password,
      phone,
      area: area || '',
      createdAt: new Date().toISOString(),
    };
    db.clients.push(client);
    writeDB(db);

    res.status(201).json({ client: clientStats(db, client) });
  });

  app.put('/api/admin/clients/:id', authenticate('superadmin'), (req, res) => {
    const { businessName, ownerName, username, password, phone, area } = req.body || {};
    if (!businessName || !ownerName || !username || !phone) {
      return res.status(400).json({ error: 'businessName, ownerName, username and phone are required' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'phone must be a 10-digit number' });
    }
    if (password && !isValidPassword(password)) {
      return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const db = readDB();
    const client = db.clients.find((c) => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (db.clients.some((c) => c.username === username && c.id !== client.id)) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    client.businessName = businessName;
    client.ownerName = ownerName;
    client.username = username;
    client.phone = phone;
    client.area = area || '';
    if (password) client.password = password;

    writeDB(db);
    res.json({ client: clientStats(db, client) });
  });

  app.delete('/api/admin/clients/:id', authenticate('superadmin'), (req, res) => {
    const db = readDB();
    const client = db.clients.find((c) => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const customerIds = new Set(db.customers.filter((c) => c.clientId === client.id).map((c) => c.id));
    const vehicleIds = new Set(db.vehicles.filter((v) => customerIds.has(v.customerId)).map((v) => v.id));

    db.payments = db.payments.filter((p) => !vehicleIds.has(p.vehicleId));
    db.vehicles = db.vehicles.filter((v) => !customerIds.has(v.customerId));
    db.customers = db.customers.filter((c) => c.clientId !== client.id);
    db.staff = db.staff.filter((s) => s.clientId !== client.id);
    db.clients = db.clients.filter((c) => c.id !== client.id);

    writeDB(db);
    res.json({ ok: true });
  });

  app.get('/api/admin/overview', authenticate('superadmin'), (req, res) => {
    const db = readDB();
    const totalRevenue = db.payments.reduce((sum, p) => sum + p.amount, 0);
    res.json({
      totalClients: db.clients.length,
      totalCustomers: db.customers.length,
      totalVehicles: db.vehicles.length,
      totalRevenue,
    });
  });
};
