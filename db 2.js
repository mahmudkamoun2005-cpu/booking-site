const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'registrations.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf8');

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeAll(registrations) {
  fs.writeFileSync(DB_FILE, JSON.stringify(registrations, null, 2), 'utf8');
}

// Номинации чемпионата — отредактируйте под свои категории
const NOMINATIONS = [
  { id: '7-10', name: '7–10 лет' },
  { id: '11-13', name: '11–13 лет' },
  { id: '14-17', name: '14–17 лет' },
  { id: 'girls-15', name: 'Девочки до 15' },
  { id: 'old2new', name: 'Old to the new' }
];

// Мастер-классы — отредактируйте под своих инструкторов
const MASTER_CLASSES = [
  { id: 'beatmaster-t', name: 'Beat Master T', meta: 'Predatorz · Москва' },
  { id: 'isaev', name: 'Станислав Исаев', meta: 'Ленинск-Кузнецкий' }
];

const NOMINATION_FEE_RUB = 1200;
const NOMINATION_FEE_USD = 15;
const ONE_MC_TOTAL_RUB = 2700;   // номинация + 1 мастер-класс
const ONE_MC_TOTAL_USD = 34;
const TWO_MC_TOTAL_RUB = 3500;   // номинация + 2 мастер-класса (пакет со скидкой)
const TWO_MC_TOTAL_USD = 44;

function getNominations() {
  return NOMINATIONS;
}

function getMasterClasses() {
  return MASTER_CLASSES;
}

function getNomination(id) {
  return NOMINATIONS.find(n => n.id === id);
}

function calcAmount(masterClassIds, currency) {
  const count = Math.min(masterClassIds.length, 2);
  if (currency === 'usd') {
    if (count === 0) return NOMINATION_FEE_USD;
    if (count === 1) return ONE_MC_TOTAL_USD;
    return TWO_MC_TOTAL_USD;
  }
  if (count === 0) return NOMINATION_FEE_RUB;
  if (count === 1) return ONE_MC_TOTAL_RUB;
  return TWO_MC_TOTAL_RUB;
}

function createRegistration(reg) {
  const registrations = readAll();
  registrations.push({
    ...reg,
    payment_provider: null,
    payment_id: null,
    payment_status: 'pending',
    created_at: new Date().toISOString()
  });
  writeAll(registrations);
  return reg;
}

function getRegistration(id) {
  return readAll().find(r => r.id === id);
}

function setPayment(id, provider, paymentId, status) {
  const registrations = readAll();
  const r = registrations.find(x => x.id === id);
  if (!r) return;
  r.payment_provider = provider;
  r.payment_id = paymentId;
  r.payment_status = status;
  writeAll(registrations);
}

function setStatus(id, status) {
  const registrations = readAll();
  const r = registrations.find(x => x.id === id);
  if (!r) return;
  r.payment_status = status;
  writeAll(registrations);
}

function listRegistrations() {
  return readAll().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

function findByPaymentId(paymentId) {
  return readAll().find(r => r.payment_id === paymentId);
}

module.exports = {
  getNominations,
  getMasterClasses,
  getNomination,
  calcAmount,
  createRegistration,
  getRegistration,
  setPayment,
  setStatus,
  listRegistrations,
  findByPaymentId
};
