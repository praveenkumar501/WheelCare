const { readDB, writeDB, nextId } = require('../db');
const { isValidPhone } = require('../utils');

module.exports = function registerPublicRoutes(app) {
  // ---------- Business registration requests ----------
  app.post('/api/client-requests', (req, res) => {
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
    if (db.clientRequests.some((r) => r.username === username && r.status === 'pending')) {
      return res.status(409).json({ error: 'A request with this username is already pending review' });
    }

    const request = {
      id: nextId(db, 'clientRequests', 'req'),
      businessName,
      ownerName,
      username,
      phone,
      area: area || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    db.clientRequests.push(request);
    writeDB(db);
    res.status(201).json({ request });
  });
};
