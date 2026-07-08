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

// Индивидуальные номинации — подбираются автоматически по дате рождения и полу
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

// Цены на отдельные услуги — одинаковы и для заявок заранее, и "с улицы"
const NOMINATION_FEE = 1200;
const ONE_MC_FEE = 1500;

// Пакетные скидки — доступны ТОЛЬКО тем, кто подал заявку на сайте заранее
const TWO_MC_PACKAGE = 2500;         // 2 мастер-класса без номинации
const ONE_MC_WITH_NOMINATION = 2700; // номинация + 1 мастер-класс (без скидки, простая сумма)
const TWO_MC_WITH_NOMINATION = 3500; // номинация + 2 мастер-класса (пакет со скидкой)

const TEAM_4X4_FEE = 4000;

function getNominations() {
  return NOMINATIONS;
}

function getMasterClasses() {
  return MASTER_CLASSES;
}

function getNomination(id) {
  return NOMINATIONS.find(n => n.id === id);
}

function getPricingInfo() {
  return {
    nominationFee: NOMINATION_FEE,
    oneMcFee: ONE_MC_FEE,
    twoMcPackage: TWO_MC_PACKAGE,
    oneMcWithNomination: ONE_MC_WITH_NOMINATION,
    twoMcWithNomination: TWO_MC_WITH_NOMINATION,
    team4x4Fee: TEAM_4X4_FEE
  };
}

// Автоматический подбор номинации — клиент не выбирает её сам
function detectNomination(birthDate, gender) {
  if (!birthDate || !gender) return null;
  const birth = new Date(birthDate);
  const ref = new Date('2026-08-07'); // первый день чемпионата
  let age = ref.getFullYear() - birth.getFullYear();
  const notYetBirthday = (ref.getMonth() < birth.getMonth()) ||
    (ref.getMonth() === birth.getMonth() && ref.getDate() < birth.getDate());
  if (notYetBirthday) age -= 1;

  if (age >= 18) return getNomination('old2new');

  if (gender === 'female') {
    if (age <= 15) return getNomination('girls-15');
    if (age >= 16 && age <= 17) return getNomination('14-17');
    return null;
  }

  if (gender === 'male') {
    if (age >= 7 && age <= 10) return getNomination('7-10');
    if (age >= 11 && age <= 13) return getNomination('11-13');
    if (age >= 14 && age <= 17) return getNomination('14-17');
    return null;
  }

  return null;
}

// participatesInNomination: bool, mcCount: 0-2
function calcIndividualAmount(participatesInNomination, mcCount) {
  const count = Math.min(mcCount, 2);
  if (participatesInNomination) {
    if (count === 0) return NOMINATION_FEE;
    if (count === 1) return ONE_MC_WITH_NOMINATION;
    return TWO_MC_WITH_NOMINATION;
  }
  if (count === 1) return ONE_MC_FEE;
  if (count === 2) return TWO_MC_PACKAGE;
  return null; // без номинации нужен хотя бы один мастер-класс
}

function getTeamFee() {
  return TEAM_4X4_FEE;
}

function createRegistration(reg) {
  const registrations = readAll();
  registrations.push({
    ...reg,
    status: 'new', // new -> paid (оплачено на месте) -> cancelled
    created_at: new Date().toISOString()
  });
  writeAll(registrations);
  return reg;
}

function getRegistration(id) {
  return readAll().find(r => r.id === id);
}

function setStatus(id, status) {
  const registrations = readAll();
  const r = registrations.find(x => x.id === id);
  if (!r) return;
  r.status = status;
  writeAll(registrations);
}

function listRegistrations() {
  return readAll().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

module.exports = {
  getNominations,
  getMasterClasses,
  getNomination,
  getPricingInfo,
  detectNomination,
  calcIndividualAmount,
  getTeamFee,
  createRegistration,
  getRegistration,
  setStatus,
  listRegistrations
};
