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

// Indian vehicle registration formats: standard (e.g. KA01AB1234) and BH-series (e.g. 22BH1234AB)
const VEHICLE_NUMBER_REGEX = /^([A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/;

function normalizeVehicleNumber(number) {
  return String(number || '').toUpperCase().replace(/[\s-]/g, '');
}

function isValidVehicleNumber(number) {
  return VEHICLE_NUMBER_REGEX.test(normalizeVehicleNumber(number));
}

function buildReminderMessage({ customerName, businessName, vehicleType, vehicleNumber, amount, dueMonths }) {
  const period = dueMonths.length === 1
    ? `for ${formatMonthLabel(dueMonths[0])}`
    : `for ${dueMonths.length} months (${formatMonthLabel(dueMonths[0])} – ${formatMonthLabel(dueMonths[dueMonths.length - 1])})`;
  return (
    `Hi ${customerName}, this is a reminder from ${businessName}. ` +
    `Your ${vehicleType} (${vehicleNumber}) wash payment of ₹${amount} ${period} is due. ` +
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
  monthFromDate,
  getMonthsBetween,
  computeVehicleDue,
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
  isValidVehicleNumber,
  normalizeVehicleNumber,
};
