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
      client: {
        businessName: client.businessName, ownerName: client.ownerName, phone: client.phone, area: client.area,
        servicePaused: !!client.servicePaused, pauseReason: client.pauseReason || '',
      },
      dailyBookingLimit: client.dailyBookingLimit || 100,
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
    const { vehicleId, description, photos } = req.body || {};
    if (!vehicleId || !description || !description.trim()) {
      return res.status(400).json({ error: 'vehicleId and description are required' });
    }
    const photoList = Array.isArray(photos) ? photos.filter(Boolean) : [];
    if (photoList.length > 4) {
      return res.status(400).json({ error: 'You can attach up to 4 photos' });
    }
    if (photoList.some((p) => !/^data:image\/(png|jpe?g|webp);base64,/.test(p))) {
      return res.status(400).json({ error: 'Photos must be valid images (PNG, JPEG or WEBP)' });
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
      photos: photoList,
      status: 'open',
      response: null,
      responsePhotos: [],
      createdAt: new Date().toISOString(),
      respondedAt: null,
    };
    db.complaints.push(complaint);
    writeDB(db);
    res.status(201).json({ complaint });
  });

  // ---------- Wash bookings ----------
  app.get('/api/customer/bookings', authenticate('customer'), (req, res) => {
    const db = readDB();
    const bookings = (db.bookings || [])
      .filter((b) => b.customerId === req.session.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ bookings });
  });

  app.post('/api/customer/bookings', authenticate('customer'), (req, res) => {
    const { vehicleId, preferredDate, notes } = req.body || {};
    if (!vehicleId || !preferredDate) {
      return res.status(400).json({ error: 'vehicleId and preferredDate are required' });
    }
    if (Number.isNaN(new Date(preferredDate).getTime())) {
      return res.status(400).json({ error: 'preferredDate must be a valid date' });
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(preferredDate) < today) {
      return res.status(400).json({ error: 'preferredDate cannot be in the past' });
    }

    const db = readDB();
    const customer = db.customers.find((c) => c.id === req.session.id);
    const client = db.clients.find((c) => c.id === customer.clientId);
    if (client && client.servicePaused) {
      return res.status(403).json({ error: 'New wash bookings are paused' + (client.pauseReason ? `: ${client.pauseReason}` : '.') });
    }
    const vehicle = db.vehicles.find((v) => v.id === vehicleId && v.customerId === customer.id);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    const dailyLimit = (client && client.dailyBookingLimit) || 100;
    const bookedCount = (db.bookings || []).filter(
      (b) => b.clientId === customer.clientId && b.preferredDate === preferredDate && b.status !== 'declined'
    ).length;
    if (bookedCount >= dailyLimit) {
      return res.status(409).json({ error: 'No slots available for ' + preferredDate + '. Please try tomorrow.' });
    }

    if (!db.bookings) db.bookings = [];
    const booking = {
      id: nextId(db, 'bookings', 'bk'),
      clientId: customer.clientId,
      customerId: customer.id,
      vehicleId,
      preferredDate,
      notes: (notes || '').trim().slice(0, 300),
      status: 'pending',
      clientNote: '',
      createdAt: new Date().toISOString(),
      respondedAt: null,
    };
    db.bookings.push(booking);
    writeDB(db);
    res.status(201).json({ booking });
  });
};
