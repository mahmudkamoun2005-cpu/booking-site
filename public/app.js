let nominations = [];
let masterClasses = [];
let state = {
  nomination: null,
  masterClasses: [],
  currency: 'rub'
};

const nomGridSection = document.getElementById('nom-grid');
const nomOptions = document.getElementById('nomination-options');
const mcOptions = document.getElementById('mc-options');
const submitBtn = document.getElementById('submit-btn');
const errorEl = document.getElementById('error-msg');
const totalAmountEl = document.getElementById('total-amount');

const PRIZE_TEXT = '🏆 Главный приз: поездка в Словению + TOP16/32 на WKB 2027';

function selectNomination(id, auto) {
  nomOptions.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
  const card = nomOptions.querySelector(`.option-card[data-id="${id}"]`);
  if (card) card.classList.add('selected');
  state.nomination = id;
  const hint = document.getElementById('nomination-hint');
  if (hint) {
    hint.textContent = auto
      ? 'Категория подобрана автоматически по дате рождения — при необходимости выберите другую вручную'
      : '';
  }
  updateTotal();
  checkReady();
}

function ageAtEvent(birthDateStr) {
  const birth = new Date(birthDateStr);
  const ref = new Date('2026-08-07'); // первый день чемпионата
  let age = ref.getFullYear() - birth.getFullYear();
  const notYetBirthday = (ref.getMonth() < birth.getMonth()) ||
    (ref.getMonth() === birth.getMonth() && ref.getDate() < birth.getDate());
  if (notYetBirthday) age -= 1;
  return age;
}

function autoDetectNomination() {
  const birthDateVal = document.getElementById('birthDate').value;
  if (!birthDateVal) return;
  const age = ageAtEvent(birthDateVal);
  let autoId = null;
  if (age >= 7 && age <= 10) autoId = '7-10';
  else if (age >= 11 && age <= 13) autoId = '11-13';
  else if (age >= 14 && age <= 17) autoId = '14-17';
  if (autoId) selectNomination(autoId, true);
}

document.getElementById('birthDate').addEventListener('change', autoDetectNomination);

async function loadNominations() {
  const res = await fetch('/api/nominations');
  nominations = await res.json();

  // Секция "Сетка баттлов"
  nomGridSection.innerHTML = nominations.map(n => `
    <div class="nom-card ${n.id === 'old2new' ? 'nom-card--special' : ''}">
      <div class="nom-card__label">${n.id === 'old2new' ? 'Выбор вручную' : 'По дате рождения'}</div>
      <div class="nom-card__title">${formatNomTitle(n)}</div>
      ${n.id !== 'old2new' ? `<div class="nom-card__prize">${PRIZE_TEXT}</div>` : ''}
    </div>
  `).join('');

  // Форма регистрации
  nomOptions.innerHTML = nominations.map(n => `
    <div class="option-card" data-id="${n.id}">
      <div class="option-card__title">${n.name}</div>
    </div>
  `).join('');
  nomOptions.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', () => selectNomination(card.dataset.id, false));
  });
}

function formatNomTitle(n) {
  const m = n.name.match(/^([\d–-]+)\s*(лет)?/);
  if (m && m[2]) return `<b>${m[1]}</b> ${m[2]}`;
  if (n.id === 'girls-15') return n.name.replace('15', '<b>15</b>');
  return n.name;
}

async function loadMasterClasses() {
  const res = await fetch('/api/master-classes');
  masterClasses = await res.json();
  mcOptions.innerHTML = masterClasses.map(m => `
    <div class="option-card" data-id="${m.id}">
      <div class="option-card__title">${m.name}</div>
      <div class="option-card__meta">${m.meta}</div>
    </div>
  `).join('');
  mcOptions.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const idx = state.masterClasses.indexOf(id);
      if (idx >= 0) {
        state.masterClasses.splice(idx, 1);
        card.classList.remove('selected');
      } else {
        if (state.masterClasses.length >= 2) return;
        state.masterClasses.push(id);
        card.classList.add('selected');
      }
      updateTotal();
      checkReady();
    });
  });
}

function calcAmount() {
  const count = Math.min(state.masterClasses.length, 2);
  if (state.currency === 'usd') {
    if (count === 0) return 15;
    if (count === 1) return 34;
    return 44;
  }
  if (count === 0) return 1200;
  if (count === 1) return 2700;
  return 3500;
}

function updateTotal() {
  const amount = calcAmount();
  const symbol = state.currency === 'usd' ? '$' : '₽';
  totalAmountEl.textContent = `${amount.toLocaleString('ru-RU')} ${symbol}`;
}

document.querySelectorAll('.curr-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.curr-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currency = btn.dataset.currency;
    updateTotal();
  });
});

function checkReady() {
  const fullName = document.getElementById('fullName').value.trim();
  const nickname = document.getElementById('nickname').value.trim();
  const birthDate = document.getElementById('birthDate').value;
  const ready = fullName && nickname && birthDate && state.nomination;
  submitBtn.disabled = !ready;
  submitBtn.textContent = ready ? 'Подтвердить регистрацию' : 'Заполните форму выше';
}

['fullName', 'nickname', 'birthDate', 'phone', 'email'].forEach(id => {
  document.getElementById(id).addEventListener('input', checkReady);
});

submitBtn.addEventListener('click', async () => {
  errorEl.textContent = '';
  const fullName = document.getElementById('fullName').value.trim();
  const nickname = document.getElementById('nickname').value.trim();
  const birthDate = document.getElementById('birthDate').value;
  const phone = document.getElementById('phone').value.trim();
  const email = document.getElementById('email').value.trim();

  if (!fullName || !nickname || !birthDate || !state.nomination) {
    errorEl.textContent = 'Заполните обязательные поля и выберите номинацию';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Создаём заявку…';

  try {
    const regRes = await fetch('/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName, nickname, birthDate, phone, email,
        nomination: state.nomination,
        masterClasses: state.masterClasses,
        currency: state.currency
      })
    });
    const regData = await regRes.json();
    if (!regRes.ok) throw new Error(regData.error || 'Не удалось создать заявку');

    const payEndpoint = state.currency === 'usd' ? '/api/pay/stripe' : '/api/pay/yookassa';
    const payRes = await fetch(payEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationId: regData.registrationId })
    });
    const payData = await payRes.json();
    if (!payRes.ok) throw new Error(payData.error || 'Не удалось создать платёж');

    window.location.href = payData.url;
  } catch (err) {
    errorEl.textContent = err.message;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Подтвердить регистрацию';
  }
});

loadNominations();
loadMasterClasses();
updateTotal();
