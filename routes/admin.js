const { readDB, writeDB, nextId } = require('../db');
const {
  sanitizeClient, isValidPhone, generateUsername, buildPasswordSetupToken,
  buildOrigin, buildPasswordSetupPromptMessage, buildWaLink, buildSmsLink,
  hashPassword, isValidPassword, MIN_PASSWORD_LENGTH,
} = require('../utils');

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

  // ---------- Factory reset (destructive; super admin only) ----------
  app.post('/api/admin/factory-reset', authenticate('superadmin'), (req, res) => {
    const { confirm, newUsername, newPassword } = req.body || {};
    if (confirm !== 'RESET') {
      return res.status(400).json({ error: 'confirm must be the exact string "RESET"' });
    }
    if (!newUsername || !newPassword) {
      return res.status(400).json({ error: 'newUsername and newPassword are required' });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const db = readDB();
    db.clients = [];
    db.customers = [];
    db.vehicles = [];
    db.payments = [];
    db.complaints = [];
    db.bookings = [];
    db.clientRequests = [];
    db.staff = [];
    db.superadmin = {
      username: newUsername,
      phone: db.superadmin.phone,
      password: hashPassword(newPassword),
    };
    writeDB(db);
    res.json({ ok: true, username: newUsername });
  });

  app.get('/api/admin/clients', authenticate('superadmin'), (req, res) => {
    const db = readDB();
    const clients = db.clients.map((c) => clientStats(db, c));
    res.json({ clients });
  });

  app.post('/api/admin/clients', authenticate('superadmin'), (req, res) => {
    const { businessName, ownerName, phone, area } = req.body || {};
    if (!businessName || !ownerName || !phone) {
      return res.status(400).json({ error: 'businessName, ownerName and phone are required' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'phone must be a 10-digit number' });
    }

    const db = readDB();
    const existingUsernames = new Set(db.clients.map((c) => c.username));
    const username = generateUsername(existingUsernames, ownerName || businessName);
    const { token: setupToken, expiresAt: setupTokenExpiresAt } = buildPasswordSetupToken();

    const client = {
      id: nextId(db, 'clients', 'c'),
      businessName,
      ownerName,
      username,
      password: null,
      passwordSetupToken: setupToken,
      passwordSetupTokenExpiresAt: setupTokenExpiresAt,
      phone,
      area: area || '',
      active: true,
      rates: { Bike: 300, Car: 700 },
      createdAt: new Date().toISOString(),
    };
    db.clients.push(client);
    writeDB(db);

    const origin = buildOrigin(req);
    const setupLink = `${origin}/#/set-password?role=client&token=${setupToken}`;
    const message = buildPasswordSetupPromptMessage({ customerName: ownerName, businessName: 'WheelCare', username, setupLink });

    res.status(201).json({
      client: clientStats(db, client),
      username,
      waLink: buildWaLink(phone, message),
      smsLink: buildSmsLink(phone, message),
    });
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
    const { businessName, ownerName, phone, area } = req.body || {};
    if (!businessName || !ownerName || !phone) {
      return res.status(400).json({ error: 'businessName, ownerName and phone are required' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'phone must be a 10-digit number' });
    }

    const db = readDB();
    const client = db.clients.find((c) => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    client.businessName = businessName;
    client.ownerName = ownerName;
    client.phone = phone;
    client.area = area || '';

    writeDB(db);
    res.json({ client: clientStats(db, client) });
  });

  app.post('/api/admin/clients/:id/resend-setup', authenticate('superadmin'), (req, res) => {
    const db = readDB();
    const client = db.clients.find((c) => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const { token: setupToken, expiresAt: setupTokenExpiresAt } = buildPasswordSetupToken();
    client.passwordSetupToken = setupToken;
    client.passwordSetupTokenExpiresAt = setupTokenExpiresAt;
    writeDB(db);

    const origin = buildOrigin(req);
    const setupLink = `${origin}/#/set-password?role=client&token=${setupToken}`;
    const message = buildPasswordSetupPromptMessage({ customerName: client.ownerName, businessName: 'WheelCare', username: client.username, setupLink });

    res.json({
      username: client.username,
      waLink: buildWaLink(client.phone, message),
      smsLink: buildSmsLink(client.phone, message),
    });
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

    const existingUsernames = new Set(db.clients.map((c) => c.username));
    const username = (request.username && !existingUsernames.has(request.username))
      ? request.username
      : generateUsername(existingUsernames, request.ownerName || request.businessName);
    const { token: setupToken, expiresAt: setupTokenExpiresAt } = buildPasswordSetupToken();

    const client = {
      id: nextId(db, 'clients', 'c'),
      businessName: request.businessName,
      ownerName: request.ownerName,
      username,
      password: null,
      passwordSetupToken: setupToken,
      passwordSetupTokenExpiresAt: setupTokenExpiresAt,
      phone: request.phone,
      area: request.area,
      active: true,
      rates: { Bike: 300, Car: 700 },
      createdAt: new Date().toISOString(),
    };
    db.clients.push(client);
    request.status = 'approved';
    writeDB(db);

    const origin = buildOrigin(req);
    const setupLink = `${origin}/#/set-password?role=client&token=${setupToken}`;
    const message = buildPasswordSetupPromptMessage({ customerName: client.ownerName, businessName: 'WheelCare', username: client.username, setupLink });

    res.json({
      client: clientStats(db, client),
      username,
      waLink: buildWaLink(client.phone, message),
      smsLink: buildSmsLink(client.phone, message),
    });
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
          vehicleType: vehicle ? vehicle.type : '',
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
