function getCurrentMonth() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatMonthLabel(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function monthFromDate(isoDate) {
  const d = new Date(isoDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthsBetween(startMonth, endMonth) {
  const [sy, sm] = startMonth.split('-').map(Number);
  const [ey, em] = endMonth.split('-').map(Number);
  const months = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

function computeVehicleDue(vehicle, payments, currentMonth) {
  const startMonth = monthFromDate(vehicle.createdAt);
  const months = getMonthsBetween(startMonth, currentMonth);
  const paidMonths = new Set(payments.filter((p) => p.vehicleId === vehicle.id).map((p) => p.month));
  const dueMonths = months.filter((m) => !paidMonths.has(m));
  return {
    paid: dueMonths.length === 0,
    dueMonths,
    dueAmount: dueMonths.length * vehicle.planAmount,
  };
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

const VEHICLE_TYPES = ['Bike', 'Car'];
const PAYMENT_METHODS = ['Cash', 'UPI'];
const MIN_PASSWORD_LENGTH = 6;

function isValidPhone(phone) {
  const s = String(phone || '');
  if (!/^[6-9][0-9]{9}$/.test(s)) return false;
  if (/^(\d)\1{9}$/.test(s)) return false; // reject all-same-digit numbers (e.g. 9999999999)
  return true;
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}

const bcrypt = require('bcryptjs');

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function comparePassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compareSync(password, hash);
}

function isValidVehicleType(type) {
  return VEHICLE_TYPES.includes(type);
}

function isValidPlanAmount(amount) {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0;
}

// Indian vehicle registration formats: standard (e.g. KA01AB1234) and BH-series (e.g. 22BH1234AB)
const VEHICLE_NUMBER_REGEX = /^([A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/;

function normalizeVehicleNumber(number) {
  return String(number || '').toUpperCase().replace(/[\s-]/g, '');
}

function isValidVehicleNumber(number) {
  return VEHICLE_NUMBER_REGEX.test(normalizeVehicleNumber(number));
}

function buildOrigin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function buildLoginLink(origin, role) {
  return `${origin}/#/login?role=${role}`;
}

function buildSetPasswordLink(origin, role, token) {
  return `${origin}/#/set-password?role=${role}&token=${token}`;
}

function buildReminderMessage({ customerName, businessName, vehicleType, vehicleNumber, amount, dueMonths, loginUrl }) {
  const period = dueMonths.length === 1
    ? `for ${formatMonthLabel(dueMonths[0])}`
    : `for ${dueMonths.length} months (${formatMonthLabel(dueMonths[0])} – ${formatMonthLabel(dueMonths[dueMonths.length - 1])})`;
  return (
    `Hi ${customerName}, this is a reminder from ${businessName}. ` +
    `Your ${vehicleType} (${vehicleNumber}) wash payment of ₹${amount} ${period} is due. ` +
    `Please pay at your earliest convenience. Log in here: ${loginUrl}. Thank you!`
  );
}

function buildWelcomeMessage({ customerName, businessName, vehicleType, vehicleNumber, username, setupLink }) {
  const vehicleLine = vehicleType && vehicleNumber
    ? ` We've registered your ${vehicleType} (${vehicleNumber}) for the monthly wash plan.`
    : '';
  return (
    `Hi ${customerName}, welcome to ${businessName}!${vehicleLine} ` +
    `Your login username is: ${username}. ` +
    `Tap here to set your password and access your account: ${setupLink}. Thank you!`
  );
}

function buildStaffWelcomeMessage({ staffName, businessName }) {
  return `Hi ${staffName}, you've been added as a staff member at ${businessName}. Welcome aboard!`;
}

function buildPaymentReceiptMessage({ customerName, businessName, vehicleType, vehicleNumber, amount, month, method, loginUrl }) {
  return (
    `Hi ${customerName}, this confirms ${businessName} received your payment of ₹${amount} (${method}) ` +
    `for your ${vehicleType} (${vehicleNumber}) — ${formatMonthLabel(month)}. View your history: ${loginUrl}. Thank you!`
  );
}

function buildPasswordSetupPromptMessage({ customerName, businessName, username, setupLink }) {
  return (
    `Hi ${customerName}, ${businessName} sent you a link to set (or reset) your account password. ` +
    `Your login username is: ${username}. Set your password here: ${setupLink}. ` +
    `If you didn't request this, you can ignore it.`
  );
}

function buildWaLink(phone, message) {
  const normalized = normalizePhone(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function buildSmsLink(phone, message) {
  return `sms:${phone}?body=${encodeURIComponent(message)}`;
}

function makeToken() {
  return require('crypto').randomBytes(24).toString('hex');
}

const PASSWORD_SETUP_TOKEN_TTL_MS = 15 * 60 * 1000;

function buildPasswordSetupToken() {
  return {
    token: makeToken(),
    expiresAt: new Date(Date.now() + PASSWORD_SETUP_TOKEN_TTL_MS).toISOString(),
  };
}

function isPasswordSetupTokenExpired(expiresAt) {
  return !expiresAt || new Date(expiresAt).getTime() < Date.now();
}

const USERNAME_REGEX = /^[a-z0-9]{3,20}$/;

function isValidUsername(username) {
  return USERNAME_REGEX.test(String(username || ''));
}

// Usernames are shared across a single login form (no role picker), so they
// must be unique across superadmin, clients, customers and pending requests —
// not just within one role — or login couldn't tell two accounts apart.
function isUsernameTaken(db, username) {
  return db.superadmin.username === username
    || db.clients.some((c) => c.username === username)
    || db.customers.some((c) => c.username === username)
    || db.clientRequests.some((r) => r.status === 'pending' && r.username === username);
}

function generateUsername(existingUsernames, base) {
  const slug = String(base || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14) || 'user';
  let candidate = slug;
  let n = 1;
  while (existingUsernames.has(candidate)) {
    n += 1;
    candidate = `${slug}${n}`;
  }
  return candidate;
}

function sanitizeClient(client) {
  const { password, passwordSetupToken, passwordSetupTokenExpiresAt, ...rest } = client;
  return rest;
}

function sanitizeCustomer(customer) {
  const { password, passwordSetupToken, passwordSetupTokenExpiresAt, ...rest } = customer;
  return rest;
}

module.exports = {
  getCurrentMonth,
  formatMonthLabel,
  monthFromDate,
  getMonthsBetween,
  computeVehicleDue,
  normalizePhone,
  buildOrigin,
  buildLoginLink,
  buildSetPasswordLink,
  buildReminderMessage,
  buildWelcomeMessage,
  buildStaffWelcomeMessage,
  buildPaymentReceiptMessage,
  buildPasswordSetupPromptMessage,
  buildWaLink,
  buildSmsLink,
  makeToken,
  buildPasswordSetupToken,
  isPasswordSetupTokenExpired,
  generateUsername,
  USERNAME_REGEX,
  isValidUsername,
  isUsernameTaken,
  sanitizeClient,
  sanitizeCustomer,
  VEHICLE_TYPES,
  PAYMENT_METHODS,
  MIN_PASSWORD_LENGTH,
  isValidPhone,
  isValidPassword,
  isValidVehicleType,
  isValidPlanAmount,
  isValidVehicleNumber,
  normalizeVehicleNumber,
  hashPassword,
  comparePassword,
};
