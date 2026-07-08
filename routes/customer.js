const { readDB, writeDB, nextId } = require('../db');
const { getCurrentMonth, computeVehicleDue, buildWaLink } = require('../utils');

module.exports = function registerCustomerRoutes(app, authenticate) {
  app.get('/api/customer/data', authenticate('customer'), (req, res) => {
    const db = readDB();
    const customer = db.customers.find((c) => c.id === req.session.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const client = db.clients.find((c) => c.id === customer.clientId);
    const month = getCurrentMonth();

    const vehicles = db.vehicles
      .filter((v) => v.customerId === customer.id)
      .map((vehicle) => {
        const due = computeVehicleDue(vehicle, db.payments, month);
        return { ...vehicle, paid: due.paid, monthsDue: due.dueMonths.length, dueAmount: due.dueAmount };
      });

    const vehicleIds = new Set(vehicles.map((v) => v.id));
    const paymentHistory = db.payments
      .filter((p) => vehicleIds.has(p.vehicleId))
      .map((p) => {
        const vehicle = vehicles.find((v) => v.id === p.vehicleId);
        return { ...p, vehicleType: vehicle.type, vehicleNumber: vehicle.number };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const anyDue = vehicles.some((v) => !v.paid);
    const totalDue = vehicles.reduce((sum, v) => sum + v.dueAmount, 0);
    const contactMessage = `Hi, I'm ${customer.name} (${customer.flat}). I have a question about my vehicle wash service.`;

    res.json({
      customer: { name: customer.name, phone: customer.phone, flat: customer.flat },
      client: { businessName: client.businessName, ownerName: client.ownerName, phone: client.phone, area: client.area },
      month,
      vehicles,
      anyDue,
      totalDue,
      paymentHistory,
      contactWaLink: buildWaLink(client.phone, contactMessage),
    });
  });

  // ---------- Service quality reports ----------
  app.get('/api/customer/complaints', authenticate('customer'), (req, res) => {
    const db = readDB();
    const complaints = (db.complaints || [])
      .filter((c) => c.customerId === req.session.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ complaints });
  });

  app.post('/api/customer/complaints', authenticate('customer'), (req, res) => {
    const { vehicleId, description, photo } = req.body || {};
    if (!vehicleId || !description || !description.trim()) {
      return res.status(400).json({ error: 'vehicleId and description are required' });
    }
    if (photo && !/^data:image\/(png|jpe?g|webp);base64,/.test(photo)) {
      return res.status(400).json({ error: 'photo must be a valid image (PNG, JPEG or WEBP)' });
    }

    const db = readDB();
    const customer = db.customers.find((c) => c.id === req.session.id);
    const vehicle = db.vehicles.find((v) => v.id === vehicleId && v.customerId === customer.id);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    if (!db.complaints) db.complaints = [];
    const complaint = {
      id: nextId(db, 'complaints', 'cm'),
      clientId: customer.clientId,
      customerId: customer.id,
      vehicleId,
      description: description.trim(),
      photo: photo || null,
      status: 'open',
      response: null,
      createdAt: new Date().toISOString(),
      respondedAt: null,
    };
    db.complaints.push(complaint);
    writeDB(db);
    res.status(201).json({ complaint });
  });
};
