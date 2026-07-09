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
  generateUsername,
  buildPasswordSetupToken,
  isValidPhone,
  isValidVehicleType,
  isValidPlanAmount,
  isValidVehicleNumber,
  normalizeVehicleNumber,
  PAYMENT_METHODS,
  sanitizeClient,
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
        const { password, passwordSetupToken, ...safeCustomer } = customer;
        return { ...safeCustomer, hasPassword: !!password, vehicles };
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
          const remindedToday = vehicle.lastReminderAt
            && new Date(vehicle.lastReminderAt).toDateString() === new Date().toDateString();
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
            remindedToday: !!remindedToday,
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
      client: {
        businessName: client.businessName, ownerName: client.ownerName, phone: client.phone, area: client.area,
        rates: client.rates || { Bike: 300, Car: 700 },
        servicePaused: !!client.servicePaused, pauseReason: client.pauseReason || '',
        dailyBookingLimit: client.dailyBookingLimit || 100,
        serviceStartTime: client.serviceStartTime || '', serviceEndTime: client.serviceEndTime || '',
        weeklyOffDay: client.weeklyOffDay || '',
      },
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
    const { name, phone, flat, vehicle } = req.body || {};
    if (!name || !phone) {
      return res.status(400).json({ error: 'name and phone are required' });
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
    const client = db.clients.find((c) => c.id === clientId);
    const hasVehicle = vehicle && vehicle.type && vehicle.number && vehicle.planAmount;
    if (hasVehicle && client && client.servicePaused) {
      return res.status(403).json({ error: 'New vehicle bookings are paused' + (client.pauseReason ? `: ${client.pauseReason}` : '.') + ' You can still add this customer without a vehicle.' });
    }

    const existingUsernames = new Set(db.customers.map((c) => c.username));
    const username = generateUsername(existingUsernames, name);
    const { token: setupToken, expiresAt: setupTokenExpiresAt } = buildPasswordSetupToken();
    const customer = {
      id: nextId(db, 'customers', 'cu'),
      clientId,
      name,
      phone,
      flat: flat || '',
      username,
      password: null,
      passwordSetupToken: setupToken,
      passwordSetupTokenExpiresAt: setupTokenExpiresAt,
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

    const setupLink = buildSetPasswordLink(buildOrigin(req), 'customer', setupToken);
    const welcomeMessage = buildWelcomeMessage({
      customerName: customer.name,
      businessName: client.businessName,
      vehicleType: createdVehicle && createdVehicle.type,
      vehicleNumber: createdVehicle && createdVehicle.number,
      username: customer.username,
      setupLink,
    });

    res.status(201).json({
      customer: { ...customer, password: undefined, passwordSetupToken: undefined },
      vehicle: createdVehicle,
      username,
      welcomeMessage,
      welcomeWaLink: buildWaLink(customer.phone, welcomeMessage),
      welcomeSmsLink: buildSmsLink(customer.phone, welcomeMessage),
    });
  });

  app.put('/api/client/customers/:id', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const { name, phone, flat } = req.body || {};
    if (!name || !phone) {
      return res.status(400).json({ error: 'name and phone are required' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'phone must be a 10-digit number' });
    }

    const db = readDB();
    const customer = requireOwnCustomer(db, clientId, req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    customer.name = name;
    customer.phone = phone;
    customer.flat = flat || '';

    writeDB(db);
    res.json({ customer: { ...customer, password: undefined, passwordSetupToken: undefined } });
  });

  app.post('/api/client/customers/:id/resend-setup', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const db = readDB();
    const customer = requireOwnCustomer(db, clientId, req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const client = db.clients.find((c) => c.id === clientId);
    const { token: setupToken, expiresAt: setupTokenExpiresAt } = buildPasswordSetupToken();
    customer.passwordSetupToken = setupToken;
    customer.passwordSetupTokenExpiresAt = setupTokenExpiresAt;
    customer.password = null;
    writeDB(db);

    const setupLink = buildSetPasswordLink(buildOrigin(req), 'customer', setupToken);
    const message = buildPasswordSetupPromptMessage({ customerName: customer.name, businessName: client.businessName, username: customer.username, setupLink });

    res.json({
      username: customer.username,
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
    const client = db.clients.find((c) => c.id === clientId);
    if (client && client.servicePaused) {
      return res.status(403).json({ error: 'New vehicle bookings are paused' + (client.pauseReason ? `: ${client.pauseReason}` : '.') });
    }
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

    vehicle.lastReminderAt = new Date().toISOString();
    writeDB(db);

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
    const now = new Date().toISOString();
    for (const customer of customers) {
      const vehicles = db.vehicles.filter((v) => v.customerId === customer.id);
      for (const vehicle of vehicles) {
        const due = computeVehicleDue(vehicle, db.payments, month);
        if (!due.paid) {
          reminders.push(buildReminder(client, customer, vehicle, due, origin));
          vehicle.lastReminderAt = now;
        }
      }
    }
    writeDB(db);

    res.json({ reminders });
  });

  // ---------- Profile & Rates ----------
  app.get('/api/client/profile', authenticate('client'), (req, res) => {
    const db = readDB();
    const client = db.clients.find((c) => c.id === req.session.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json({ client: { ...sanitizeClient(client), rates: client.rates || { Bike: 300, Car: 700 } } });
  });

  app.put('/api/client/profile', authenticate('client'), (req, res) => {
    const { ownerName, phone, area } = req.body || {};
    if (!ownerName || !phone) {
      return res.status(400).json({ error: 'ownerName and phone are required' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'phone must be a 10-digit number' });
    }

    const db = readDB();
    const client = db.clients.find((c) => c.id === req.session.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    client.ownerName = ownerName;
    client.phone = phone;
    client.area = area || '';
    writeDB(db);
    res.json({ client: { ...sanitizeClient(client), rates: client.rates || { Bike: 300, Car: 700 } } });
  });

  app.put('/api/client/rates', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const { Bike, Car } = req.body || {};
    if (!isValidPlanAmount(Bike) || !isValidPlanAmount(Car)) {
      return res.status(400).json({ error: 'Bike and Car rates must both be positive numbers' });
    }

    const db = readDB();
    const client = db.clients.find((c) => c.id === clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    client.rates = { Bike: Number(Bike), Car: Number(Car) };

    const customerIds = new Set(db.customers.filter((c) => c.clientId === clientId).map((c) => c.id));
    let updatedVehicles = 0;
    db.vehicles.forEach((v) => {
      if (customerIds.has(v.customerId) && client.rates[v.type] !== undefined) {
        v.planAmount = client.rates[v.type];
        updatedVehicles += 1;
      }
    });

    writeDB(db);
    res.json({ rates: client.rates, updatedVehicles });
  });

  const TIME_HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  app.put('/api/client/service-status', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const { paused, reason, dailyBookingLimit, startTime, endTime, weeklyOffDay } = req.body || {};

    if (paused !== undefined && typeof paused !== 'boolean') {
      return res.status(400).json({ error: 'paused must be true or false' });
    }
    if (paused === true && (!reason || !String(reason).trim())) {
      return res.status(400).json({ error: 'A reason is required when pausing new bookings' });
    }
    if (dailyBookingLimit !== undefined) {
      const n = Number(dailyBookingLimit);
      if (!Number.isInteger(n) || n < 1 || n > 1000) {
        return res.status(400).json({ error: 'dailyBookingLimit must be a whole number between 1 and 1000' });
      }
    }
    if (startTime !== undefined && !TIME_HHMM_REGEX.test(startTime)) {
      return res.status(400).json({ error: 'startTime must be in HH:MM format' });
    }
    if (endTime !== undefined && !TIME_HHMM_REGEX.test(endTime)) {
      return res.status(400).json({ error: 'endTime must be in HH:MM format' });
    }
    if (weeklyOffDay !== undefined && weeklyOffDay !== '' && !WEEKDAY_NAMES.includes(weeklyOffDay)) {
      return res.status(400).json({ error: 'weeklyOffDay must be a valid day name or empty' });
    }

    const db = readDB();
    const client = db.clients.find((c) => c.id === clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    if (paused !== undefined) {
      client.servicePaused = paused;
      client.pauseReason = paused ? String(reason || '').trim().slice(0, 200) : '';
    }
    if (dailyBookingLimit !== undefined) client.dailyBookingLimit = Number(dailyBookingLimit);
    if (startTime !== undefined) client.serviceStartTime = startTime;
    if (endTime !== undefined) client.serviceEndTime = endTime;
    if (weeklyOffDay !== undefined) client.weeklyOffDay = weeklyOffDay;

    writeDB(db);
    res.json({
      servicePaused: !!client.servicePaused,
      pauseReason: client.pauseReason || '',
      dailyBookingLimit: client.dailyBookingLimit || 100,
      serviceStartTime: client.serviceStartTime || '',
      serviceEndTime: client.serviceEndTime || '',
      weeklyOffDay: client.weeklyOffDay || '',
    });
  });

  // ---------- Service quality reports ----------
  app.get('/api/client/complaints', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const db = readDB();
    const customerById = new Map(db.customers.map((c) => [c.id, c]));
    const vehicleById = new Map(db.vehicles.map((v) => [v.id, v]));
    const complaints = (db.complaints || [])
      .filter((c) => c.clientId === clientId)
      .map((c) => {
        const customer = customerById.get(c.customerId);
        const vehicle = vehicleById.get(c.vehicleId);
        return {
          ...c,
          customerName: customer ? customer.name : 'Unknown',
          customerFlat: customer ? customer.flat : '',
          vehicleNumber: vehicle ? vehicle.number : '',
          vehicleType: vehicle ? vehicle.type : '',
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ complaints });
  });

  app.post('/api/client/complaints/:id/respond', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const { response, photos } = req.body || {};
    if (!response || !response.trim()) {
      return res.status(400).json({ error: 'response is required' });
    }
    const photoList = Array.isArray(photos) ? photos.filter(Boolean) : [];
    if (photoList.length > 4) {
      return res.status(400).json({ error: 'You can attach up to 4 photos' });
    }
    if (photoList.some((p) => !/^data:image\/(png|jpe?g|webp);base64,/.test(p))) {
      return res.status(400).json({ error: 'Photos must be valid images (PNG, JPEG or WEBP)' });
    }

    const db = readDB();
    const complaint = (db.complaints || []).find((c) => c.id === req.params.id && c.clientId === clientId);
    if (!complaint) return res.status(404).json({ error: 'Report not found' });

    complaint.response = response.trim();
    complaint.responsePhotos = photoList;
    complaint.status = 'resolved';
    complaint.respondedAt = new Date().toISOString();
    writeDB(db);
    res.json({ complaint });
  });

  // ---------- Wash bookings ----------
  app.get('/api/client/bookings', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const db = readDB();
    const customerById = new Map(db.customers.map((c) => [c.id, c]));
    const vehicleById = new Map(db.vehicles.map((v) => [v.id, v]));
    const bookings = (db.bookings || [])
      .filter((b) => b.clientId === clientId)
      .map((b) => {
        const customer = customerById.get(b.customerId);
        const vehicle = vehicleById.get(b.vehicleId);
        return {
          ...b,
          customerName: customer ? customer.name : 'Unknown',
          customerFlat: customer ? customer.flat : '',
          customerPhone: customer ? customer.phone : '',
          vehicleNumber: vehicle ? vehicle.number : '',
          vehicleType: vehicle ? vehicle.type : '',
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ bookings });
  });

  app.post('/api/client/bookings/:id/respond', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const { status, note } = req.body || {};
    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'status must be accepted or declined' });
    }

    const db = readDB();
    const booking = (db.bookings || []).find((b) => b.id === req.params.id && b.clientId === clientId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'pending') {
      return res.status(400).json({ error: 'This booking has already been responded to' });
    }

    booking.status = status;
    booking.clientNote = (note || '').trim().slice(0, 300);
    booking.respondedAt = new Date().toISOString();
    writeDB(db);
    res.json({ booking });
  });

  app.post('/api/client/bookings/:id/complete', authenticate('client'), (req, res) => {
    const clientId = req.session.id;
    const db = readDB();
    const booking = (db.bookings || []).find((b) => b.id === req.params.id && b.clientId === clientId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'accepted') {
      return res.status(400).json({ error: 'Only accepted bookings can be marked complete' });
    }

    booking.status = 'completed';
    writeDB(db);
    res.json({ booking });
  });
};
