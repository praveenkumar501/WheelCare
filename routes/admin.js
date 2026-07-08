const { readDB, writeDB, nextId } = require('../db');
const { sanitizeClient, isValidPhone } = require('../utils');

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
    const { businessName, ownerName, username, phone, area } = req.body || {};
    if (!businessName || !ownerName || !username || !phone) {
      return res.status(400).json({ error: 'businessName, ownerName, username and phone are required' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'phone must be a 10-digit number' });
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
      phone,
      area: area || '',
      active: true,
      createdAt: new Date().toISOString(),
    };
    db.clients.push(client);
    writeDB(db);

    res.status(201).json({ client: clientStats(db, client) });
  });

  app.post('/api/admin/clients/:id/active', authenticate('superadmin'), (req, res) => {
    const { active } = req.body || {};
    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'active must be true or false' });
    }

    const db = readDB();
    const client = db.clients.find((c) => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    client.active = active;
    writeDB(db);
    res.json({ client: clientStats(db, client) });
  });

  app.put('/api/admin/clients/:id', authenticate('superadmin'), (req, res) => {
    const { businessName, ownerName, username, phone, area } = req.body || {};
    if (!businessName || !ownerName || !username || !phone) {
      return res.status(400).json({ error: 'businessName, ownerName, username and phone are required' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'phone must be a 10-digit number' });
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

  // ---------- Business registration requests ----------
  app.get('/api/admin/client-requests', authenticate('superadmin'), (req, res) => {
    const db = readDB();
    const requests = db.clientRequests.filter((r) => r.status === 'pending');
    res.json({ requests });
  });

  app.post('/api/admin/client-requests/:id/approve', authenticate('superadmin'), (req, res) => {
    const db = readDB();
    const request = db.clientRequests.find((r) => r.id === req.params.id && r.status === 'pending');
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (db.clients.some((c) => c.username === request.username)) {
      return res.status(409).json({ error: 'Username already taken by an existing business' });
    }

    const client = {
      id: nextId(db, 'clients', 'c'),
      businessName: request.businessName,
      ownerName: request.ownerName,
      username: request.username,
      phone: request.phone,
      area: request.area,
      active: true,
      createdAt: new Date().toISOString(),
    };
    db.clients.push(client);
    request.status = 'approved';
    writeDB(db);
    res.json({ client: clientStats(db, client) });
  });

  app.post('/api/admin/client-requests/:id/reject', authenticate('superadmin'), (req, res) => {
    const db = readDB();
    const request = db.clientRequests.find((r) => r.id === req.params.id && r.status === 'pending');
    if (!request) return res.status(404).json({ error: 'Request not found' });

    request.status = 'rejected';
    writeDB(db);
    res.json({ ok: true });
  });

  app.get('/api/admin/overview', authenticate('superadmin'), (req, res) => {
    const db = readDB();
    const totalRevenue = db.payments.reduce((sum, p) => sum + p.amount, 0);

    const clientById = new Map(db.clients.map((c) => [c.id, c]));
    const customerById = new Map(db.customers.map((c) => [c.id, c]));
    const vehicleById = new Map(db.vehicles.map((v) => [v.id, v]));

    const recentPayments = [...db.payments]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 6)
      .map((p) => {
        const vehicle = vehicleById.get(p.vehicleId);
        const customer = vehicle ? customerById.get(vehicle.customerId) : null;
        const client = customer ? clientById.get(customer.clientId) : null;
        return {
          id: p.id,
          amount: p.amount,
          method: p.method,
          date: p.date,
          month: p.month,
          customerName: customer ? customer.name : 'Unknown',
          businessName: client ? client.businessName : 'Unknown',
          vehicleNumber: vehicle ? vehicle.number : '',
        };
      });

    const revenueByMonth = new Map();
    db.payments.forEach((p) => {
      revenueByMonth.set(p.month, (revenueByMonth.get(p.month) || 0) + p.amount);
    });
    const monthlyRevenue = [...revenueByMonth.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-6)
      .map(([month, revenue]) => ({ month, revenue }));

    res.json({
      totalClients: db.clients.length,
      totalCustomers: db.customers.length,
      totalVehicles: db.vehicles.length,
      totalStaff: db.staff.length,
      totalRevenue,
      pendingRequests: db.clientRequests.filter((r) => r.status === 'pending').length,
      recentPayments,
      monthlyRevenue,
    });
  });
};
