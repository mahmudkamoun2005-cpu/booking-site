const loginView = document.getElementById('login-view');
const adminView = document.getElementById('admin-view');
const bodyEl = document.getElementById('reg-body');

async function checkSession() {
  const res = await fetch('/admin/api/session');
  const data = await res.json();
  if (data.isAdmin) {
    loginView.style.display = 'none';
    adminView.style.display = 'block';
    loadRegistrations();
  } else {
    loginView.style.display = 'block';
    adminView.style.display = 'none';
  }
}

document.getElementById('login-btn').addEventListener('click', async () => {
  const password = document.getElementById('password').value;
  const res = await fetch('/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  if (res.ok) {
    checkSession();
  } else {
    document.getElementById('login-error').textContent = 'Неверный пароль';
  }
});

document.getElementById('refresh-btn')?.addEventListener('click', loadRegistrations);

async function loadRegistrations() {
  const res = await fetch('/admin/api/registrations');
  if (!res.ok) { checkSession(); return; }
  const regs = await res.json();
  bodyEl.innerHTML = regs.map(r => `
    <tr>
      <td>${new Date(r.created_at).toLocaleDateString('ru-RU')}</td>
      <td>${r.fullName}<br><span style="color:var(--text-dim);font-size:12px;">${r.nickname}</span></td>
      <td>${r.nominationName}</td>
      <td>${r.masterClasses && r.masterClasses.length ? r.masterClasses.length : '—'}</td>
      <td>${r.phone || '—'}</td>
      <td>${r.amount} ${r.currency.toUpperCase()}</td>
      <td>${r.payment_provider || '—'}</td>
      <td><span class="badge ${r.payment_status}">${statusLabel(r.payment_status)}</span></td>
      <td>
        <button class="cancel-btn" data-id="${r.id}" ${r.payment_status === 'cancelled' ? 'disabled' : ''}>
          Отменить
        </button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="9">Заявок пока нет</td></tr>';

  bodyEl.querySelectorAll('.cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => cancelRegistration(btn.dataset.id, btn));
  });
}

async function cancelRegistration(id, btn) {
  if (!confirm('Отменить регистрацию? Если она была оплачена, деньги вернутся автоматически.')) return;
  btn.disabled = true;
  btn.textContent = 'Отменяем…';
  try {
    const res = await fetch(`/admin/api/registrations/${id}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Не удалось отменить');
    loadRegistrations();
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
    btn.textContent = 'Отменить';
  }
}

function statusLabel(status) {
  return { paid: 'Оплачено', pending: 'Ожидает', cancelled: 'Отменено' }[status] || status;
}

checkSession();
