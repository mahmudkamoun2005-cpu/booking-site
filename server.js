require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { notifyBooking } = require('./notifications');

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
    const bookingId = session.metadata && session.metadata.bookingId;
    if (bookingId) {
      // Сохраняем payment_intent, а не id сессии — он нужен для будущих возвратов
      db.setBookingPayment(bookingId, 'stripe', session.payment_intent || session.id, 'paid');
      const booking = db.getBooking(bookingId);
      if (booking) notifyBooking(booking).catch(() => {});
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
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 8 } // 8 часов
}));

// ---------- Публичные API: доступны всем, без аккаунта ----------

app.get('/api/services', (req, res) => {
  res.json(db.getServices());
});

app.get('/api/slots', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Укажите дату' });
  res.json({ date, slots: db.getAvailableSlots(date) });
});

app.post('/api/bookings', (req, res) => {
  const { serviceId, date, time, name, phone, email, comment, currency } = req.body;
  const service = db.getService(serviceId);
  if (!service) return res.status(400).json({ error: 'Неизвестная услуга' });
  if (!date || !time || !name || !phone) return res.status(400).json({ error: 'Заполните обязательные поля' });

  const available = db.getAvailableSlots(date);
  if (!available.includes(time)) return res.status(409).json({ error: 'Это время уже занято, выберите другое' });

  const useUsd = currency === 'usd';
  const booking = {
    id: uuidv4(),
    service: service.name,
    date,
    time,
    name,
    phone,
    email: email || '',
    comment: comment || '',
    amount: useUsd ? service.priceUsd : service.priceRub,
    currency: useUsd ? 'usd' : 'rub'
  };
  db.createBooking(booking);
  res.json({ bookingId: booking.id, amount: booking.amount, currency: booking.currency });
});

// ---------- Оплата иностранными картами (Stripe) ----------

app.post('/api/pay/stripe', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe не настроен на сервере' });
  const { bookingId } = req.body;
  const booking = db.getBooking(bookingId);
  if (!booking) return res.status(404).json({ error: 'Заявка не найдена' });

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `${booking.service} — ${booking.date} ${booking.time}` },
          unit_amount: Math.round(booking.amount * 100)
        },
        quantity: 1
      }],
      metadata: { bookingId: booking.id },
      success_url: `${BASE_URL}/success.html?booking=${booking.id}`,
      cancel_url: `${BASE_URL}/?cancelled=1`
    });
    db.setBookingPayment(booking.id, 'stripe', checkoutSession.id, 'pending');
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

  const { bookingId } = req.body;
  const booking = db.getBooking(bookingId);
  if (!booking) return res.status(404).json({ error: 'Заявка не найдена' });

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
        amount: { value: booking.amount.toFixed(2), currency: 'RUB' },
        confirmation: { type: 'redirect', return_url: `${BASE_URL}/success.html?booking=${booking.id}` },
        capture: true,
        description: `${booking.service} — ${booking.date} ${booking.time}`,
        metadata: { bookingId: booking.id }
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.description || 'Ошибка ЮKassa' });

    db.setBookingPayment(booking.id, 'yookassa', data.id, 'pending');
    res.json({ url: data.confirmation.confirmation_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ЮKassa шлёт уведомления о статусе оплаты сюда
app.post('/webhook/yookassa', async (req, res) => {
  const event = req.body;
  if (event && event.event === 'payment.succeeded') {
    const paymentId = event.object.id;
    const booking = db.findByPaymentId(paymentId);
    if (booking) {
      db.setBookingPayment(booking.id, 'yookassa', paymentId, 'paid');
      notifyBooking(booking).catch(() => {});
    }
  }
  res.status(200).end();
});

app.get('/api/bookings/:id', (req, res) => {
  const booking = db.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Не найдено' });
  res.json(booking);
});

// ---------- Админка: пароль вместо аккаунта, доступ только вам ----------

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

app.get('/admin/api/bookings', requireAdmin, (req, res) => {
  res.json(db.listBookings());
});

app.post('/admin/api/bookings/:id/cancel', requireAdmin, async (req, res) => {
  const booking = db.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Заявка не найдена' });
  if (booking.payment_status === 'cancelled') return res.json({ ok: true, refunded: false });

  let refunded = false;
  try {
    if (booking.payment_status === 'paid' && booking.payment_provider === 'stripe' && stripe) {
      await stripe.refunds.create({ payment_intent: booking.payment_id });
      refunded = true;
    } else if (booking.payment_status === 'paid' && booking.payment_provider === 'yookassa') {
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
            payment_id: booking.payment_id,
            amount: { value: booking.amount.toFixed(2), currency: 'RUB' }
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

  db.setBookingStatus(booking.id, 'cancelled');
  res.json({ ok: true, refunded });
});

app.get('/admin/api/session', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

app.listen(PORT, () => {
  console.log(`Booking site running at ${BASE_URL}`);
});
