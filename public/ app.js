let services = [];
let state = {
  serviceId: null,
  date: null,
  time: null,
  currency: 'rub'
};

const servicesEl = document.getElementById('services');
const dateInput = document.getElementById('date-input');
const slotsEl = document.getElementById('slots');
const payBtn = document.getElementById('pay-btn');
const errorEl = document.getElementById('error-msg');

// Дата по умолчанию — сегодня, минимум — сегодня
const today = new Date().toISOString().slice(0, 10);
dateInput.min = today;
dateInput.value = today;

async function loadServices() {
  const res = await fetch('/api/services');
  services = await res.json();
  servicesEl.innerHTML = services.map(s => `
    <div class="service-card" data-id="${s.id}">
      <div>
        <div class="service-card__name">${s.name}</div>
        <div class="service-card__meta">${s.durationMin} мин</div>
      </div>
      <div class="service-card__price">${s.priceRub} ₽</div>
    </div>
  `).join('');
  servicesEl.querySelectorAll('.service-card').forEach(card => {
    card.addEventListener('click', () => {
      servicesEl.querySelectorAll('.service-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.serviceId = card.dataset.id;
      updateTicket();
      checkReady();
    });
  });
}

async function loadSlots(date) {
  slotsEl.innerHTML = '<p class="hint">Загрузка…</p>';
  const res = await fetch(`/api/slots?date=${encodeURIComponent(date)}`);
  const data = await res.json();
  if (!data.slots || data.slots.length === 0) {
    slotsEl.innerHTML = '<p class="hint">На эту дату свободных мест нет</p>';
    return;
  }
  slotsEl.innerHTML = data.slots.map(t => `<div class="slot" data-time="${t}">${t}</div>`).join('');
  slotsEl.querySelectorAll('.slot').forEach(el => {
    el.addEventListener('click', () => {
      slotsEl.querySelectorAll('.slot').forEach(s => s.classList.remove('selected'));
      el.classList.add('selected');
      state.time = el.dataset.time;
      updateTicket();
      checkReady();
    });
  });
}

dateInput.addEventListener('change', () => {
  state.date = dateInput.value;
  state.time = null;
  loadSlots(state.date);
  updateTicket();
  checkReady();
});

document.querySelectorAll('.curr-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.curr-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currency = btn.dataset.currency;
    updateTicket();
  });
});

function updateTicket() {
  const service = services.find(s => s.id === state.serviceId);
  document.getElementById('t-service').textContent = service ? service.name : '—';
  document.getElementById('t-datetime').textContent =
    (state.date || '—') + (state.time ? `, ${state.time}` : '');
  if (service) {
    const amount = state.currency === 'usd' ? service.priceUsd : service.priceRub;
    const symbol = state.currency === 'usd' ? '$' : '₽';
    document.getElementById('t-amount').textContent = `${amount} ${symbol}`;
  } else {
    document.getElementById('t-amount').textContent = '—';
  }
}

function checkReady() {
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const ready = state.serviceId && state.date && state.time;
  payBtn.disabled = !ready;
  payBtn.textContent = ready ? 'Перейти к оплате' : 'Заполните форму выше';
}

['name', 'phone', 'email', 'comment'].forEach(id => {
  document.getElementById(id).addEventListener('input', checkReady);
});

// Загружаем слоты для даты по умолчанию
state.date = today;
loadSlots(today);

payBtn.addEventListener('click', async () => {
  errorEl.textContent = '';
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const email = document.getElementById('email').value.trim();
  const comment = document.getElementById('comment').value.trim();

  if (!name || !phone) {
    errorEl.textContent = 'Укажите имя и телефон';
    return;
  }

  payBtn.disabled = true;
  payBtn.textContent = 'Создаём заявку…';

  try {
    const bookingRes = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId: state.serviceId,
        date: state.date,
        time: state.time,
        name, phone, email, comment,
        currency: state.currency
      })
    });
    const bookingData = await bookingRes.json();
    if (!bookingRes.ok) throw new Error(bookingData.error || 'Не удалось создать заявку');

    const payEndpoint = state.currency === 'usd' ? '/api/pay/stripe' : '/api/pay/yookassa';
    const payRes = await fetch(payEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: bookingData.bookingId })
    });
    const payData = await payRes.json();
    if (!payRes.ok) throw new Error(payData.error || 'Не удалось создать платёж');

    window.location.href = payData.url;
  } catch (err) {
    errorEl.textContent = err.message;
    payBtn.disabled = false;
    payBtn.textContent = 'Перейти к оплате';
  }
});

loadServices();
