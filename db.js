const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'bookings.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    service TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    comment TEXT,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    payment_provider TEXT,
    payment_id TEXT,
    payment_status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

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
  const rows = db.prepare(
    `SELECT time FROM bookings WHERE date = ? AND payment_status != 'cancelled'`
  ).all(date);
  return rows.map(r => r.time);
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
  db.prepare(`
    INSERT INTO bookings (id, service, date, time, name, phone, email, comment, amount, currency, payment_status)
    VALUES (@id, @service, @date, @time, @name, @phone, @email, @comment, @amount, @currency, 'pending')
  `).run(booking);
  return booking;
}

function getBooking(id) {
  return db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(id);
}

function setBookingPayment(id, provider, paymentId, status) {
  db.prepare(`
    UPDATE bookings SET payment_provider = ?, payment_id = ?, payment_status = ? WHERE id = ?
  `).run(provider, paymentId, status, id);
}

function setBookingStatus(id, status) {
  db.prepare(`UPDATE bookings SET payment_status = ? WHERE id = ?`).run(status, id);
}

function listBookings() {
  return db.prepare(`SELECT * FROM bookings ORDER BY date DESC, time DESC`).all();
}

function findByPaymentId(paymentId) {
  return db.prepare(`SELECT * FROM bookings WHERE payment_id = ?`).get(paymentId);
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
