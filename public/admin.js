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
      <td>${r.type === 'team' ? 'Команда' : 'Личная'}</td>
      <td>${r.type === 'team'
        ? `${r.teamName}<br><span style="color:var(--text-dim);font-size:12px;">капитан: ${r.captainName}</span>`
        : `${r.fullName}<br><span style="color:var(--text-dim);font-size:12px;">${r.nickname}</span>`}</td>
      <td>${r.type === 'team' ? '—' : (r.gender === 'female' ? 'Ж' : 'М')}</td>
      <td>${r.nominationName || 'Только МК'}</td>
      <td>${r.masterClasses && r.masterClasses.length ? r.masterClasses.length : '—'}</td>
      <td>${r.phone || '—'}</td>
      <td>${r.amount} ₽</td>
      <td><span class="badge ${r.status}">${statusLabel(r.status)}</span></td>
      <td>
        <button class="action-btn action-btn--paid" data-id="${r.id}" data-status="paid" ${r.status === 'paid' ? 'disabled' : ''}>Оплачено</button>
        <button class="action-btn action-btn--cancel" data-id="${r.id}" data-status="cancelled" ${r.status === 'cancelled' ? 'disabled' : ''}>Отменить</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="10">Заявок пока нет</td></tr>';

  bodyEl.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => setStatus(btn.dataset.id, btn.dataset.status, btn));
  });
}

async function setStatus(id, status, btn) {
  const labels = { paid: 'Отметить как оплаченную?', cancelled: 'Отменить заявку?' };
  if (!confirm(labels[status] || 'Изменить статус?')) return;
  btn.disabled = true;
  try {
    const res = await fetch(`/admin/api/registrations/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Не удалось изменить статус');
    loadRegistrations();
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
  }
}

function statusLabel(status) {
  return { new: 'Ожидает', paid: 'Оплачено', cancelled: 'Отменено' }[status] || status;
}

checkSession();
