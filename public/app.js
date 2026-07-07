let nominations = [];
let masterClasses = [];
let state = {
  nomination: null,
  masterClasses: [],
  gender: null
};

const nomGridSection = document.getElementById('nom-grid');
const nomOptions = document.getElementById('nomination-options');
const mcOptions = document.getElementById('mc-options');
const genderOptions = document.getElementById('gender-options');
const submitBtn = document.getElementById('submit-btn');
const errorEl = document.getElementById('error-msg');
const totalAmountEl = document.getElementById('total-amount');

const PRIZE_TEXT = '🏆 Главный приз: поездка в Словению + TOP16/32 на WKB 2027';

genderOptions.querySelectorAll('.option-card').forEach(card => {
  card.addEventListener('click', () => {
    genderOptions.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.gender = card.dataset.id;
    autoDetectNomination();
    checkReady();
  });
});

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
  const hint = document.getElementById('nomination-hint');

  let autoId = null;

  if (age >= 18) {
    // Old to the new — отдельная взрослая номинация, доступна только с 18 лет
    autoId = 'old2new';
  } else if (age >= 16 && age <= 17) {
    // 16-17 лет — общая категория независимо от пола
    autoId = '14-17';
  } else if (age >= 14 && age <= 15) {
    // 14-15 лет — девочки в свою номинацию, мальчики к общей 14-17
    if (state.gender === 'female') autoId = 'girls-15';
    else if (state.gender === 'male') autoId = '14-17';
    else if (hint) hint.textContent = 'Укажите пол, чтобы подобрать номинацию автоматически';
  } else if (age >= 11 && age <= 13) {
    autoId = '11-13';
  } else if (age >= 7 && age <= 10) {
    autoId = '7-10';
  }

  if (autoId) selectNomination(autoId, true);
}

document.getElementById('birthDate').addEventListener('change', autoDetectNomination);

async function loadNominations() {
  const res = await fetch('/api/nominations');
  nominations = await res.json();

  nomGridSection.innerHTML = nominations.map(n => `
    <div class="nom-card ${n.id === 'old2new' ? 'nom-card--special' : ''}">
      <div class="nom-card__label">${n.id === 'old2new' ? 'Только 18+ · авто-подбор' : 'По дате рождения'}</div>
      <div class="nom-card__title">${formatNomTitle(n)}</div>
      ${n.id !== 'old2new' ? `<div class="nom-card__prize">${PRIZE_TEXT}</div>` : ''}
    </div>
  `).join('');

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
  if (count === 0) return 1200;
  if (count === 1) return 2700;
  return 3500;
}

function updateTotal() {
  totalAmountEl.textContent = `${calcAmount().toLocaleString('ru-RU')} ₽`;
}

function checkReady() {
  const fullName = document.getElementById('fullName').value.trim();
  const nickname = document.getElementById('nickname').value.trim();
  const birthDate = document.getElementById('birthDate').value;
  const ready = fullName && nickname && birthDate && state.gender && state.nomination;
  submitBtn.disabled = !ready;
  submitBtn.textContent = ready ? 'Отправить заявку' : 'Заполните форму выше';
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

  if (!fullName || !nickname || !birthDate || !state.gender || !state.nomination) {
    errorEl.textContent = 'Заполните обязательные поля, укажите пол и выберите номинацию';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Отправляем…';

  try {
    const regRes = await fetch('/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName, nickname, birthDate, phone, email,
        gender: state.gender,
        nomination: state.nomination,
        masterClasses: state.masterClasses
      })
    });
    const regData = await regRes.json();
    if (!regRes.ok) throw new Error(regData.error || 'Не удалось отправить заявку');

    window.location.href = `/success.html?reg=${regData.registrationId}`;
  } catch (err) {
    errorEl.textContent = err.message;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Отправить заявку';
  }
});

loadNominations();
loadMasterClasses();
updateTotal();
