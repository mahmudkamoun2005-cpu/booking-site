require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { notifyRegistration } = require('./notifications');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 8 }
}));

// ---------- Публичные API ----------

app.get('/api/nominations', (req, res) => {
  res.json(db.getNominations());
});

app.get('/api/master-classes', (req, res) => {
  res.json(db.getMasterClasses());
});

app.get('/api/pricing', (req, res) => {
  res.json(db.getPricingInfo());
});

// Определение номинации по дате рождения и полу — клиент это значение не выбирает сам
app.post('/api/detect-nomination', (req, res) => {
  const { birthDate, gender } = req.body;
  const nom = db.detectNomination(birthDate, gender);
  res.json({ nomination: nom });
});

// Личная заявка
app.post('/api/registrations', (req, res) => {
  const { fullName, nickname, birthDate, phone, email, gender, participatesInNomination, masterClasses } = req.body;

  if (!fullName || !nickname || !birthDate || !gender) {
    return res.status(400).json({ error: 'Заполните обязательные поля' });
  }
  if (!['male', 'female'].includes(gender)) {
    return res.status(400).json({ error: 'Некорректно указан пол' });
  }

  const mcIds = Array.isArray(masterClasses) ? masterClasses.slice(0, 2) : [];
  const validMc = db.getMasterClasses().map(m => m.id);
  if (mcIds.some(id => !validMc.includes(id))) {
    return res.status(400).json({ error: 'Неизвестный мастер-класс' });
  }

  let nom = null;
  if (participatesInNomination) {
    nom = db.detectNomination(birthDate, gender);
    if (!nom) {
      return res.status(400).json({ error: 'Возраст не подходит ни под одну номинацию. Свяжитесь с организаторами.' });
    }
  }

  const amount = db.calcIndividualAmount(!!participatesInNomination, mcIds.length);
  if (amount === null) {
    return res.status(400).json({ error: 'Выберите номинацию или хотя бы один мастер-класс' });
  }

  const registration = {
    id: uuidv4(),
    type: 'individual',
    fullName,
    nickname,
    birthDate,
    gender,
    phone: phone || '',
    email: email || '',
    participatesInNomination: !!participatesInNomination,
    nomination: nom ? nom.id : null,
    nominationName: nom ? nom.name : null,
    masterClasses: mcIds,
    amount
  };
  db.createRegistration(registration);
  notifyRegistration(registration).catch(() => {});
  res.json({ registrationId: registration.id, amount });
});

// Командная заявка 4×4
app.post('/api/registrations/team', (req, res) => {
  const { teamName, captainName, phone, email } = req.body;
  if (!teamName || !captainName || !phone) {
    return res.status(400).json({ error: 'Заполните обязательные поля' });
  }

  const registration = {
    id: uuidv4(),
    type: 'team',
    teamName,
    captainName,
    phone,
    email: email || '',
    nomination: '4x4',
    nominationName: '4×4 (команда)',
    amount: db.getTeamFee()
  };
  db.createRegistration(registration);
  notifyRegistration(registration).catch(() => {});
  res.json({ registrationId: registration.id, amount: registration.amount });
});

app.get('/api/registrations/:id', (req, res) => {
  const reg = db.getRegistration(req.params.id);
  if (!reg) return res.status(404).json({ error: 'Не найдено' });
  res.json(reg);
});

// ---------- Админка ----------

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: 'Требуется вход' });
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected || !safeEqual(password, expected)) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }
  req.session.isAdmin = true;
  res.json({ ok: true });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/admin/api/registrations', requireAdmin, (req, res) => {
  res.json(db.listRegistrations());
});

app.get('/admin/api/session', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

app.post('/admin/api/registrations/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!['new', 'paid', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Неизвестный статус' });
  }
  const reg = db.getRegistration(req.params.id);
  if (!reg) return res.status(404).json({ error: 'Заявка не найдена' });
  db.setStatus(reg.id, status);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Break Navsegda site running at ${BASE_URL}`);
});
