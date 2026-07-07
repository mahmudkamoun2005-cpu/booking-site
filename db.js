const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'bookings.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf8');

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeAll(bookings) {
  fs.writeFileSync(DB_FILE, JSON.stringify(bookings, null, 2), 'utf8');
}

// Простой список услуг — отредактируйте под свой бизнес
const SERVICES = [
  { id: 'consult-30', name: 'Консультация (30 мин)', durationMin: 30, priceRub: 1500, priceUsd: 20 },
  { id: 'consult-60', name: 'Консультация (60 мин)', durationMin: 60, priceRub: 2800, priceUsd: 35 },
  { id: 'session-90', name: 'Полная сессия (90 мин)', durationMin: 90, priceRub: 4200, priceUsd: 50 }
];

const WORK_HOURS = { start: 9, end: 18 }; // рабочие часы, слоты по 1 часу

function getServices() {
  return SERVICES;
}

function getService(id) {
  return SERVICES.find(s => s.id === id);
}

function getBookedTimes(date) {
  return readAll()
    .filter(b => b.date === date && b.payment_status !== 'cancelled')
    .map(b => b.time);
}

function getAvailableSlots(date) {
  const booked = new Set(getBookedTimes(date));
  const slots = [];
  for (let h = WORK_HOURS.start; h < WORK_HOURS.end; h++) {
    const t = `${String(h).padStart(2, '0')}:00`;
    if (!booked.has(t)) slots.push(t);
  }
  return slots;
}

function createBooking(booking) {
  const bookings = readAll();
  bookings.push({
    ...booking,
    payment_provider: null,
    payment_id: null,
    payment_status: 'pending',
    created_at: new Date().toISOString()
  });
  writeAll(bookings);
  return booking;
}

function getBooking(id) {
  return readAll().find(b => b.id === id);
}

function setBookingPayment(id, provider, paymentId, status) {
  const bookings = readAll();
  const b = bookings.find(x => x.id === id);
  if (!b) return;
  b.payment_provider = provider;
  b.payment_id = paymentId;
  b.payment_status = status;
  writeAll(bookings);
}

function setBookingStatus(id, status) {
  const bookings = readAll();
  const b = bookings.find(x => x.id === id);
  if (!b) return;
  b.payment_status = status;
  writeAll(bookings);
}

function listBookings() {
  return readAll().sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));
}

function findByPaymentId(paymentId) {
  return readAll().find(b => b.payment_id === paymentId);
}

module.exports = {
  getServices,
  getService,
  getAvailableSlots,
  createBooking,
  getBooking,
  setBookingPayment,
  setBookingStatus,
  listBookings,
  findByPaymentId
};
