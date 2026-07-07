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
  return /^[0-9]{10}$/.test(String(phone || ''));
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}

function isValidVehicleType(type) {
  return VEHICLE_TYPES.includes(type);
}

function isValidPlanAmount(amount) {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0;
}

function buildReminderMessage({ customerName, businessName, vehicleType, vehicleNumber, amount, month }) {
  return (
    `Hi ${customerName}, this is a reminder from ${businessName}. ` +
    `Your ${vehicleType} (${vehicleNumber}) wash payment of ₹${amount} for ${formatMonthLabel(month)} is due. ` +
    `Please pay at your earliest convenience. Thank you!`
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

function sanitizeClient(client) {
  const { password, ...rest } = client;
  return rest;
}

function sanitizeCustomer(customer) {
  const { password, ...rest } = customer;
  return rest;
}

module.exports = {
  getCurrentMonth,
  formatMonthLabel,
  normalizePhone,
  buildReminderMessage,
  buildWaLink,
  buildSmsLink,
  makeToken,
  sanitizeClient,
  sanitizeCustomer,
  VEHICLE_TYPES,
  PAYMENT_METHODS,
  MIN_PASSWORD_LENGTH,
  isValidPhone,
  isValidPassword,
  isValidVehicleType,
  isValidPlanAmount,
};
