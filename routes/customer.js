const { readDB } = require('../db');
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
      client: { businessName: client.businessName, ownerName: client.ownerName, phone: client.phone },
      month,
      vehicles,
      anyDue,
      totalDue,
      paymentHistory,
      contactWaLink: buildWaLink(client.phone, contactMessage),
    });
  });
};
