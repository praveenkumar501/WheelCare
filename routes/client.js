const { readDB, writeDB, nextId } = require('../db');
const {
  getCurrentMonth,
  monthFromDate,
  computeVehicleDue,
  buildReminderMessage,
  buildWelcomeMessage,
  buildStaffWelcomeMessage,
  buildPaymentReceiptMessage,
  buildPasswordSetupPromptMessage,
  buildWaLink,
  buildSmsLink,
  buildOrigin,
  buildLoginLink,
  buildSetPasswordLink,
  makeToken,
  isValidPhone,
  isValidVehicleType,
  isValidPlanAmount,
  isValidVehicleNumber,
  normalizeVehicleNumber,
  PAYMENT_METHODS,
} = require('../utils');

module.exports = function registerClientRoutes(app, authenticate) {
  function requireOwnCustomer(db, clientId, customerId) {
    const customer = db.customers.find((c) => c.id === customerId && c.clientId === clientId);
    return customer || null;
  }

  function requireOwnVehicle(db, clientId, vehicleId) {
    const vehicle = db.vehicles.find((v) => v.id === vehicleId);
    if (!vehicle) return null;
    const customer = requireOwnCustomer(db, clientId, vehicle.customerId);
    return customer ? vehicle : null;
  }

  function buildReminder(client, customer, vehicle, due, origin) {
    const message = buildReminderMessage({
      customerName: customer.name,
      businessName: client.businessName,
      vehicleType: vehicle.type,
      vehicleNumber: vehicle.number,
      amount: due.dueAmount,
      dueMonths: due.dueMonths,
      loginUrl: buildLoginLink(origin, 'customer'),
    });
    return {
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      flat: customer.flat,
      vehicleId: vehicle.id,
      vehicleType: vehicle.type,
      vehicleNumber: vehicle.number,
      amount: due.dueAmount,
      monthsDue: due.dueMonths.length,
      message,
      waLink: buildWaLink(customer.phone, message),
      smsLink: buildSmsLink(customer.phone, message),
    };
  }

  // ---------- Dashboard ----------
  app.get('/api/client/data', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const db = readDB();
    const client = db.clients.find((c) => c.id === clientId);
    const month = getCurrentMonth();

    const customers = db.customers
      .filter((c) => c.clientId === clientId)
      .map((customer) => {
        const vehicles = db.vehicles
          .filter((v) => v.customerId === customer.id)
          .map((vehicle) => {
            const due = computeVehicleDue(vehicle, db.payments, month);
            return { ...vehicle, paid: due.paid, monthsDue: due.dueMonths.length, dueAmount: due.dueAmount };
          });
        return { ...customer, password: undefined, passwordSetupToken: undefined, vehicles };
      });

    const clientVehicleIds = new Set();
    customers.forEach((c) => c.vehicles.forEach((v) => clientVehicleIds.add(v.id)));
    const totalCollected = db.payments
      .filter((p) => clientVehicleIds.has(p.vehicleId) && monthFromDate(p.date) === month)
      .reduce((sum, p) => sum + p.amount, 0);

    let totalPending = 0;
    const pendingVehicles = [];

    for (const customer of customers) {
      for (const vehicle of customer.vehicles) {
        if (!vehicle.paid) {
          totalPending += vehicle.dueAmount;
          pendingVehicles.push({
            customerId: customer.id,
            customerName: customer.name,
            flat: customer.flat,
            phone: customer.phone,
            vehicleId: vehicle.id,
            vehicleType: vehicle.type,
            vehicleNumber: vehicle.number,
            model: vehicle.model,
            amount: vehicle.dueAmount,
            monthsDue: vehicle.monthsDue,
          });
        }
      }
    }

    const customerById = new Map(customers.map((c) => [c.id, c]));
    const vehicleById = new Map();
    customers.forEach((c) => c.vehicles.forEach((v) => vehicleById.set(v.id, v)));
    const totalVehicles = vehicleById.size;

    const recentPayments = db.payments
      .filter((p) => clientVehicleIds.has(p.vehicleId))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
      .map((p) => {
        const vehicle = vehicleById.get(p.vehicleId);
        const customer = customerById.get(vehicle.customerId);
        return {
          ...p,
          vehicleType: vehicle.type,
          vehicleNumber: vehicle.number,
          customerName: customer.name,
        };
      });

    res.json({
      client: { businessName: client.businessName, ownerName: client.ownerName, phone: client.phone, area: client.area },
      month,
      totalCollected,
      totalPending,
      pendingCount: pendingVehicles.length,
      totalCustomers: customers.length,
      totalVehicles,
      recentPayments,
      customers,
      pendingVehicles,
    });
  });

  // ---------- Customers ----------
  app.post('/api/client/customers', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const { name, phone, flat, username, vehicle } = req.body || {};
    if (!name || !phone || !username) {
      return res.status(400).json({ error: 'name, phone and username are required' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'phone must be a 10-digit number' });
    }
    if (vehicle && (vehicle.type || vehicle.number || vehicle.planAmount)) {
      if (!isValidVehicleType(vehicle.type)) {
        return res.status(400).json({ error: 'vehicle type must be Bike or Car' });
      }
      if (!vehicle.number || !isValidVehicleNumber(vehicle.number)) {
        return res.status(400).json({ error: 'vehicle number must be a valid registration number (e.g. KA01AB1234)' });
      }
      if (!isValidPlanAmount(vehicle.planAmount)) {
        return res.status(400).json({ error: 'vehicle planAmount must be a positive number' });
      }
    }

    const db = readDB();
    if (db.customers.some((c) => c.username === username)) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const client = db.clients.find((c) => c.id === clientId);
    const setupToken = makeToken();
    const customer = {
      id: nextId(db, 'customers', 'cu'),
      clientId,
      name,
      phone,
      flat: flat || '',
      username,
      password: null,
      passwordSetupToken: setupToken,
      createdAt: new Date().toISOString(),
    };
    db.customers.push(customer);

    let createdVehicle = null;
    if (vehicle && vehicle.type && vehicle.number && vehicle.planAmount) {
      createdVehicle = {
        id: nextId(db, 'vehicles', 'v'),
        customerId: customer.id,
        type: vehicle.type,
        number: normalizeVehicleNumber(vehicle.number),
        model: vehicle.model || '',
        planAmount: Number(vehicle.planAmount),
        createdAt: new Date().toISOString(),
      };
      db.vehicles.push(createdVehicle);
    }

    writeDB(db);

    const origin = buildOrigin(req);
    const welcomeMessage = buildWelcomeMessage({
      customerName: customer.name,
      businessName: client.businessName,
      vehicleType: createdVehicle && createdVehicle.type,
      vehicleNumber: createdVehicle && createdVehicle.number,
      setupLink: buildSetPasswordLink(origin, setupToken),
    });

    res.status(201).json({
      customer: { ...customer, password: undefined, passwordSetupToken: undefined },
      vehicle: createdVehicle,
      welcomeMessage,
      welcomeWaLink: buildWaLink(customer.phone, welcomeMessage),
      welcomeSmsLink: buildSmsLink(customer.phone, welcomeMessage),
    });
  });

  app.put('/api/client/customers/:id', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const { name, phone, flat, username } = req.body || {};
    if (!name || !phone || !username) {
      return res.status(400).json({ error: 'name, phone and username are required' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'phone must be a 10-digit number' });
    }

    const db = readDB();
    const customer = requireOwnCustomer(db, clientId, req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    if (db.customers.some((c) => c.username === username && c.id !== customer.id)) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    customer.name = name;
    customer.phone = phone;
    customer.flat = flat || '';
    customer.username = username;

    writeDB(db);
    res.json({ customer: { ...customer, password: undefined, passwordSetupToken: undefined } });
  });

  app.post('/api/client/customers/:id/reset-password', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const db = readDB();
    const customer = requireOwnCustomer(db, clientId, req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const client = db.clients.find((c) => c.id === clientId);

    const setupToken = makeToken();
    customer.passwordSetupToken = setupToken;
    customer.password = null;
    writeDB(db);

    const origin = buildOrigin(req);
    const message = buildPasswordSetupPromptMessage({
      customerName: customer.name,
      businessName: client.businessName,
      setupLink: buildSetPasswordLink(origin, setupToken),
    });

    res.json({
      message,
      waLink: buildWaLink(customer.phone, message),
      smsLink: buildSmsLink(customer.phone, message),
    });
  });

  app.delete('/api/client/customers/:id', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const db = readDB();
    const customer = requireOwnCustomer(db, clientId, req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const vehicleIds = new Set(
      db.vehicles.filter((v) => v.customerId === customer.id).map((v) => v.id)
    );
    db.vehicles = db.vehicles.filter((v) => v.customerId !== customer.id);
    db.payments = db.payments.filter((p) => !vehicleIds.has(p.vehicleId));
    db.customers = db.customers.filter((c) => c.id !== customer.id);

    writeDB(db);
    res.json({ ok: true });
  });

  // ---------- Vehicles ----------
  app.post('/api/client/customers/:customerId/vehicles', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const { type, number, model, planAmount } = req.body || {};
    if (!type || !number || !planAmount) {
      return res.status(400).json({ error: 'type, number and planAmount are required' });
    }
    if (!isValidVehicleType(type)) {
      return res.status(400).json({ error: 'type must be Bike or Car' });
    }
    if (!isValidVehicleNumber(number)) {
      return res.status(400).json({ error: 'number must be a valid registration number (e.g. KA01AB1234)' });
    }
    if (!isValidPlanAmount(planAmount)) {
      return res.status(400).json({ error: 'planAmount must be a positive number' });
    }

    const db = readDB();
    const customer = requireOwnCustomer(db, clientId, req.params.customerId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const vehicle = {
      id: nextId(db, 'vehicles', 'v'),
      customerId: customer.id,
      type,
      number: normalizeVehicleNumber(number),
      model: model || '',
      planAmount: Number(planAmount),
      createdAt: new Date().toISOString(),
    };
    db.vehicles.push(vehicle);
    writeDB(db);
    res.status(201).json({ vehicle });
  });

  app.put('/api/client/vehicles/:id', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const { type, number, model, planAmount } = req.body || {};
    if (!type || !number || !planAmount) {
      return res.status(400).json({ error: 'type, number and planAmount are required' });
    }
    if (!isValidVehicleType(type)) {
      return res.status(400).json({ error: 'type must be Bike or Car' });
    }
    if (!isValidVehicleNumber(number)) {
      return res.status(400).json({ error: 'number must be a valid registration number (e.g. KA01AB1234)' });
    }
    if (!isValidPlanAmount(planAmount)) {
      return res.status(400).json({ error: 'planAmount must be a positive number' });
    }

    const db = readDB();
    const vehicle = requireOwnVehicle(db, clientId, req.params.id);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    vehicle.type = type;
    vehicle.number = normalizeVehicleNumber(number);
    vehicle.model = model || '';
    vehicle.planAmount = Number(planAmount);

    writeDB(db);
    res.json({ vehicle });
  });

  app.delete('/api/client/vehicles/:id', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const db = readDB();
    const vehicle = requireOwnVehicle(db, clientId, req.params.id);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    db.payments = db.payments.filter((p) => p.vehicleId !== vehicle.id);
    db.vehicles = db.vehicles.filter((v) => v.id !== vehicle.id);
    writeDB(db);
    res.json({ ok: true });
  });

  // ---------- Staff ----------
  app.get('/api/client/staff', authenticate('client'), (req, res) => {
    const db = readDB();
    const staff = db.staff.filter((s) => s.clientId === req.session.id);
    res.json({ staff });
  });

  app.post('/api/client/staff', authenticate('client'), (req, res) => {
    const { name, phone } = req.body || {};
    if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });
    if (!isValidPhone(phone)) return res.status(400).json({ error: 'phone must be a 10-digit number' });

    const db = readDB();
    const client = db.clients.find((c) => c.id === req.session.id);
    const member = {
      id: nextId(db, 'staff', 's'),
      clientId: req.session.id,
      name,
      phone,
      createdAt: new Date().toISOString(),
    };
    db.staff.push(member);
    writeDB(db);

    const welcomeMessage = buildStaffWelcomeMessage({ staffName: member.name, businessName: client.businessName });
    res.status(201).json({
      staff: member,
      welcomeMessage,
      welcomeWaLink: buildWaLink(member.phone, welcomeMessage),
      welcomeSmsLink: buildSmsLink(member.phone, welcomeMessage),
    });
  });

  app.put('/api/client/staff/:id', authenticate('client'), (req, res) => {
    const { name, phone } = req.body || {};
    if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });
    if (!isValidPhone(phone)) return res.status(400).json({ error: 'phone must be a 10-digit number' });

    const db = readDB();
    const member = db.staff.find((s) => s.id === req.params.id && s.clientId === req.session.id);
    if (!member) return res.status(404).json({ error: 'Staff member not found' });

    member.name = name;
    member.phone = phone;

    writeDB(db);
    res.json({ staff: member });
  });

  app.delete('/api/client/staff/:id', authenticate('client'), (req, res) => {
    const db = readDB();
    const member = db.staff.find((s) => s.id === req.params.id && s.clientId === req.session.id);
    if (!member) return res.status(404).json({ error: 'Staff member not found' });

    db.staff = db.staff.filter((s) => s.id !== member.id);
    writeDB(db);
    res.json({ ok: true });
  });

  // ---------- Payments ----------
  app.get('/api/client/payments', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const db = readDB();
    const customers = db.customers.filter((c) => c.clientId === clientId);
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const vehicles = db.vehicles.filter((v) => customerById.has(v.customerId));
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

    let payments = db.payments.filter((p) => vehicleById.has(p.vehicleId));
    if (req.query.month) {
      payments = payments.filter((p) => p.month === req.query.month);
    }

    const enriched = payments
      .map((p) => {
        const vehicle = vehicleById.get(p.vehicleId);
        const customer = customerById.get(vehicle.customerId);
        return {
          ...p,
          vehicleType: vehicle.type,
          vehicleNumber: vehicle.number,
          customerName: customer.name,
          flat: customer.flat,
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ payments: enriched });
  });

  app.post('/api/client/payments', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const { vehicleId, month, amount, method } = req.body || {};
    if (!vehicleId || !method) return res.status(400).json({ error: 'vehicleId and method are required' });
    if (!PAYMENT_METHODS.includes(method)) return res.status(400).json({ error: 'method must be Cash or UPI' });
    if (amount && !isValidPlanAmount(amount)) return res.status(400).json({ error: 'amount must be a positive number' });

    const db = readDB();
    const vehicle = requireOwnVehicle(db, clientId, vehicleId);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    const paymentMonth = month || getCurrentMonth();
    const paymentAmount = amount ? Number(amount) : vehicle.planAmount;

    let payment = db.payments.find((p) => p.vehicleId === vehicleId && p.month === paymentMonth);
    if (payment) {
      payment.amount = paymentAmount;
      payment.method = method;
      payment.date = new Date().toISOString();
    } else {
      payment = {
        id: nextId(db, 'payments', 'p'),
        vehicleId,
        month: paymentMonth,
        amount: paymentAmount,
        method,
        date: new Date().toISOString(),
      };
      db.payments.push(payment);
    }

    writeDB(db);

    const customer = db.customers.find((c) => c.id === vehicle.customerId);
    const client = db.clients.find((c) => c.id === clientId);
    const receiptMessage = buildPaymentReceiptMessage({
      customerName: customer.name,
      businessName: client.businessName,
      vehicleType: vehicle.type,
      vehicleNumber: vehicle.number,
      amount: payment.amount,
      month: payment.month,
      method: payment.method,
      loginUrl: buildLoginLink(buildOrigin(req), 'customer'),
    });

    res.status(201).json({
      payment,
      receiptMessage,
      receiptWaLink: buildWaLink(customer.phone, receiptMessage),
      receiptSmsLink: buildSmsLink(customer.phone, receiptMessage),
    });
  });

  // ---------- Reminders ----------
  app.get('/api/client/reminder/:vehicleId', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const db = readDB();
    const client = db.clients.find((c) => c.id === clientId);
    const vehicle = requireOwnVehicle(db, clientId, req.params.vehicleId);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    const customer = db.customers.find((c) => c.id === vehicle.customerId);
    const month = getCurrentMonth();
    const due = computeVehicleDue(vehicle, db.payments, month);
    if (due.paid) return res.status(400).json({ error: 'This vehicle has no pending dues' });
    res.json({ reminder: buildReminder(client, customer, vehicle, due, buildOrigin(req)) });
  });

  app.get('/api/client/reminders', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const db = readDB();
    const client = db.clients.find((c) => c.id === clientId);
    const month = getCurrentMonth();

    const origin = buildOrigin(req);
    const customers = db.customers.filter((c) => c.clientId === clientId);
    const reminders = [];
    for (const customer of customers) {
      const vehicles = db.vehicles.filter((v) => v.customerId === customer.id);
      for (const vehicle of vehicles) {
        const due = computeVehicleDue(vehicle, db.payments, month);
        if (!due.paid) reminders.push(buildReminder(client, customer, vehicle, due, origin));
      }
    }

    res.json({ reminders });
  });
};
