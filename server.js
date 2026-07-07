require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { notifyRegistration } = require('./notifications');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

// Stripe webhook needs the raw body, so it's mounted BEFORE express.json()
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(400).send('Stripe not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const regId = session.metadata && session.metadata.registrationId;
    if (regId) {
      db.setPayment(regId, 'stripe', session.payment_intent || session.id, 'paid');
      const reg = db.getRegistration(regId);
      if (reg) notifyRegistration(reg).catch(() => {});
    }
  }
  res.json({ received: true });
});

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

app.post('/api/registrations', (req, res) => {
  const { fullName, nickname, birthDate, phone, email, nomination, masterClasses, currency } = req.body;

  if (!fullName || !nickname || !birthDate || !nomination) {
    return res.status(400).json({ error: 'Заполните обязательные поля' });
  }
  const nom = db.getNomination(nomination);
  if (!nom) return res.status(400).json({ error: 'Неизвестная номинация' });

  const mcIds = Array.isArray(masterClasses) ? masterClasses.slice(0, 2) : [];
  const validMc = db.getMasterClasses().map(m => m.id);
  if (mcIds.some(id => !validMc.includes(id))) {
    return res.status(400).json({ error: 'Неизвестный мастер-класс' });
  }

  const useUsd = currency === 'usd';
  const amount = db.calcAmount(mcIds, useUsd ? 'usd' : 'rub');

  const registration = {
    id: uuidv4(),
    fullName,
    nickname,
    birthDate,
    phone: phone || '',
    email: email || '',
    nomination: nom.id,
    nominationName: nom.name,
    masterClasses: mcIds,
    amount,
    currency: useUsd ? 'usd' : 'rub'
  };
  db.createRegistration(registration);
  res.json({ registrationId: registration.id, amount, currency: registration.currency });
});

app.get('/api/registrations/:id', (req, res) => {
  const reg = db.getRegistration(req.params.id);
  if (!reg) return res.status(404).json({ error: 'Не найдено' });
  res.json(reg);
});

// ---------- Оплата иностранными картами (Stripe) ----------

app.post('/api/pay/stripe', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe не настроен на сервере' });
  const { registrationId } = req.body;
  const reg = db.getRegistration(registrationId);
  if (!reg) return res.status(404).json({ error: 'Заявка не найдена' });

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Брейк Навсегда — ${reg.nominationName}, ${reg.nickname}` },
          unit_amount: Math.round(reg.amount * 100)
        },
        quantity: 1
      }],
      metadata: { registrationId: reg.id },
      success_url: `${BASE_URL}/success.html?reg=${reg.id}`,
      cancel_url: `${BASE_URL}/?cancelled=1`
    });
    db.setPayment(reg.id, 'stripe', checkoutSession.id, 'pending');
    res.json({ url: checkoutSession.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Оплата российскими картами (ЮKassa) ----------

app.post('/api/pay/yookassa', async (req, res) => {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) return res.status(500).json({ error: 'ЮKassa не настроена на сервере' });

  const { registrationId } = req.body;
  const reg = db.getRegistration(registrationId);
  if (!reg) return res.status(404).json({ error: 'Заявка не найдена' });

  try {
    const idempotenceKey = uuidv4();
    const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
    const response = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotence-Key': idempotenceKey,
        Authorization: `Basic ${auth}`
      },
      body: JSON.stringify({
        amount: { value: reg.amount.toFixed(2), currency: 'RUB' },
        confirmation: { type: 'redirect', return_url: `${BASE_URL}/success.html?reg=${reg.id}` },
        capture: true,
        description: `Брейк Навсегда — ${reg.nominationName}, ${reg.nickname}`,
        metadata: { registrationId: reg.id }
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.description || 'Ошибка ЮKassa' });

    db.setPayment(reg.id, 'yookassa', data.id, 'pending');
    res.json({ url: data.confirmation.confirmation_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/webhook/yookassa', async (req, res) => {
  const event = req.body;
  if (event && event.event === 'payment.succeeded') {
    const paymentId = event.object.id;
    const reg = db.findByPaymentId(paymentId);
    if (reg) {
      db.setPayment(reg.id, 'yookassa', paymentId, 'paid');
      notifyRegistration(reg).catch(() => {});
    }
  }
  res.status(200).end();
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

app.post('/admin/api/registrations/:id/cancel', requireAdmin, async (req, res) => {
  const reg = db.getRegistration(req.params.id);
  if (!reg) return res.status(404).json({ error: 'Заявка не найдена' });
  if (reg.payment_status === 'cancelled') return res.json({ ok: true, refunded: false });

  let refunded = false;
  try {
    if (reg.payment_status === 'paid' && reg.payment_provider === 'stripe' && stripe) {
      await stripe.refunds.create({ payment_intent: reg.payment_id });
      refunded = true;
    } else if (reg.payment_status === 'paid' && reg.payment_provider === 'yookassa') {
      const shopId = process.env.YOOKASSA_SHOP_ID;
      const secretKey = process.env.YOOKASSA_SECRET_KEY;
      if (shopId && secretKey) {
        const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
        const response = await fetch('https://api.yookassa.ru/v3/refunds', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotence-Key': uuidv4(),
            Authorization: `Basic ${auth}`
          },
          body: JSON.stringify({
            payment_id: reg.payment_id,
            amount: { value: reg.amount.toFixed(2), currency: 'RUB' }
          })
        });
        if (response.ok) refunded = true;
        else {
          const data = await response.json();
          return res.status(500).json({ error: data.description || 'Не удалось выполнить возврат' });
        }
      }
    }
  } catch (err) {
    return res.status(500).json({ error: `Возврат не выполнен: ${err.message}` });
  }

  db.setStatus(reg.id, 'cancelled');
  res.json({ ok: true, refunded });
});

app.listen(PORT, () => {
  console.log(`Break Navsegda site running at ${BASE_URL}`);
});
