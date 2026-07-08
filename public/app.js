let nominations = [];
let masterClasses = [];
let state = {
  gender: null,
  participation: null, // 'with-nomination' | 'mc-only'
  masterClasses: [],
  resolvedNomination: null // объект номинации или null
};

const nomGridSection = document.getElementById('nom-grid');
const genderOptions = document.getElementById('gender-options');
const participationOptions = document.getElementById('participation-options');
const nominationBlock = document.getElementById('nomination-block');
const nominationDisplay = document.getElementById('nomination-display');
const mcOptions = document.getElementById('mc-options');
const mcHint = document.getElementById('mc-required-hint');
const submitBtn = document.getElementById('submit-btn');
const errorEl = document.getElementById('error-msg');
const totalAmountEl = document.getElementById('total-amount');

const PRIZE_TEXT = '🏆 Главный приз: поездка в Словению + TOP16/32 на WKB 2027';

// ---------- Переключатель режима: личная / командная заявка ----------

const individualForm = document.getElementById('individual-form');
const teamForm = document.getElementById('team-form');
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.mode;
    individualForm.style.display = mode === 'individual' ? 'block' : 'none';
    teamForm.style.display = mode === 'team' ? 'block' : 'none';
  });
});

// ---------- Пол ----------

genderOptions.querySelectorAll('.option-card').forEach(card => {
  card.addEventListener('click', () => {
    genderOptions.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.gender = card.dataset.id;
    resolveNomination();
    checkReady();
  });
});

// ---------- Формат участия ----------

participationOptions.querySelectorAll('.option-card').forEach(card => {
  card.addEventListener('click', () => {
    participationOptions.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.participation = card.dataset.id;
    nominationBlock.style.display = state.participation === 'mc-only' ? 'none' : 'block';
    mcHint.textContent = state.participation === 'mc-only' ? '(выберите хотя бы один)' : '(необязательно)';
    resolveNomination();
    updateTotal();
    checkReady();
  });
});

// ---------- Возраст ----------

function ageAtEvent(birthDateStr) {
  const birth = new Date(birthDateStr);
  const ref = new Date('2026-08-07'); // первый день чемпионата
  let age = ref.getFullYear() - birth.getFullYear();
  const notYetBirthday = (ref.getMonth() < birth.getMonth()) ||
    (ref.getMonth() === birth.getMonth() && ref.getDate() < birth.getDate());
  if (notYetBirthday) age -= 1;
  return age;
}

// ---------- Автоматический подбор номинации (клиент её не выбирает) ----------

function localDetectNomination(birthDateStr, gender) {
  if (!birthDateStr || !gender) return null;
  const age = ageAtEvent(birthDateStr);
  const find = id => nominations.find(n => n.id === id);

  if (age >= 18) return find('old2new');
  if (gender === 'female') {
    if (age <= 15) return find('girls-15');
    if (age >= 16 && age <= 17) return find('14-17');
    return null;
  }
  if (gender === 'male') {
    if (age >= 7 && age <= 10) return find('7-10');
    if (age >= 11 && age <= 13) return find('11-13');
    if (age >= 14 && age <= 17) return find('14-17');
    return null;
  }
  return null;
}

function resolveNomination() {
  if (state.participation === 'mc-only') {
    state.resolvedNomination = null;
    updateTotal();
    checkReady();
    return;
  }
  const birthDateVal = document.getElementById('birthDate').value;
  if (!birthDateVal || !state.gender) {
    nominationDisplay.textContent = 'Укажите дату рождения и пол';
    nominationDisplay.className = 'nomination-display';
    state.resolvedNomination = null;
    updateTotal();
    checkReady();
    return;
  }
  const nom = localDetectNomination(birthDateVal, state.gender);
  if (nom) {
    nominationDisplay.textContent = nom.name;
    nominationDisplay.className = 'nomination-display resolved';
    state.resolvedNomination = nom;
  } else {
    nominationDisplay.textContent = 'Возраст не подходит ни под одну номинацию — свяжитесь с организаторами';
    nominationDisplay.className = 'nomination-display error';
    state.resolvedNomination = null;
  }
  updateTotal();
  checkReady();
}

document.getElementById('birthDate').addEventListener('change', resolveNomination);

// ---------- Загрузка справочников ----------

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

// ---------- Расчёт суммы ----------

function calcAmount() {
  const count = Math.min(state.masterClasses.length, 2);
  const withNomination = state.participation === 'with-nomination';
  if (withNomination) {
    if (count === 0) return 1200;
    if (count === 1) return 2700;
    return 3500;
  }
  if (count === 1) return 1500;
  if (count === 2) return 2500;
  return 0;
}

function updateTotal() {
  totalAmountEl.textContent = `${calcAmount().toLocaleString('ru-RU')} ₽`;
}

// ---------- Готовность формы ----------

function checkReady() {
  const fullName = document.getElementById('fullName').value.trim();
  const nickname = document.getElementById('nickname').value.trim();
  const birthDate = document.getElementById('birthDate').value;
  const email = document.getElementById('email').value.trim();

  let ready = fullName && nickname && birthDate && email && state.gender && state.participation;
  if (state.participation === 'with-nomination') {
    ready = ready && !!state.resolvedNomination;
  } else if (state.participation === 'mc-only') {
    ready = ready && state.masterClasses.length >= 1;
  }

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

  submitBtn.disabled = true;
  submitBtn.textContent = 'Отправляем…';

  try {
    const regRes = await fetch('/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName, nickname, birthDate, phone, email,
        gender: state.gender,
        participatesInNomination: state.participation === 'with-nomination',
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

// ---------- Командная заявка 4×4 ----------

const teamSubmitBtn = document.getElementById('submit-team-btn');
const teamErrorEl = document.getElementById('team-error-msg');

function checkTeamReady() {
  const teamName = document.getElementById('teamName').value.trim();
  const captainName = document.getElementById('captainName').value.trim();
  const teamPhone = document.getElementById('teamPhone').value.trim();
  const teamEmail = document.getElementById('teamEmail').value.trim();
  const ready = teamName && captainName && teamPhone && teamEmail;
  teamSubmitBtn.disabled = !ready;
  teamSubmitBtn.textContent = ready ? 'Отправить заявку команды' : 'Заполните форму выше';
}

['teamName', 'captainName', 'teamPhone', 'teamEmail'].forEach(id => {
  document.getElementById(id).addEventListener('input', checkTeamReady);
});

teamSubmitBtn.addEventListener('click', async () => {
  teamErrorEl.textContent = '';
  const teamName = document.getElementById('teamName').value.trim();
  const captainName = document.getElementById('captainName').value.trim();
  const phone = document.getElementById('teamPhone').value.trim();
  const email = document.getElementById('teamEmail').value.trim();

  teamSubmitBtn.disabled = true;
  teamSubmitBtn.textContent = 'Отправляем…';

  try {
    const regRes = await fetch('/api/registrations/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName, captainName, phone, email })
    });
    const regData = await regRes.json();
    if (!regRes.ok) throw new Error(regData.error || 'Не удалось отправить заявку');

    window.location.href = `/success.html?reg=${regData.registrationId}`;
  } catch (err) {
    teamErrorEl.textContent = err.message;
    teamSubmitBtn.disabled = false;
    teamSubmitBtn.textContent = 'Отправить заявку команды';
  }
});

loadNominations();
loadMasterClasses();
updateTotal();
