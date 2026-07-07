const loginView = document.getElementById('login-view');
const adminView = document.getElementById('admin-view');
const bodyEl = document.getElementById('bookings-body');

async function checkSession() {
  const res = await fetch('/admin/api/session');
  const data = await res.json();
  if (data.isAdmin) {
    loginView.style.display = 'none';
    adminView.style.display = 'block';
    loadBookings();
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

document.getElementById('refresh-btn')?.addEventListener('click', loadBookings);

async function loadBookings() {
  const res = await fetch('/admin/api/bookings');
  if (!res.ok) { checkSession(); return; }
  const bookings = await res.json();
  bodyEl.innerHTML = bookings.map(b => `
    <tr>
      <td>${b.date} ${b.time}</td>
      <td>${b.service}</td>
      <td>${b.name}</td>
      <td>${b.phone}</td>
      <td>${b.amount} ${b.currency.toUpperCase()}</td>
      <td>${b.payment_provider || '—'}</td>
      <td><span class="badge ${b.payment_status}">${statusLabel(b.payment_status)}</span></td>
      <td>
        <button class="cancel-btn" data-id="${b.id}" ${b.payment_status === 'cancelled' ? 'disabled' : ''}>
          Отменить
        </button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="8">Заявок пока нет</td></tr>';

  bodyEl.querySelectorAll('.cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => cancelBooking(btn.dataset.id, btn));
  });
}

async function cancelBooking(id, btn) {
  if (!confirm('Отменить запись? Если она была оплачена, деньги вернутся клиенту автоматически.')) return;
  btn.disabled = true;
  btn.textContent = 'Отменяем…';
  try {
    const res = await fetch(`/admin/api/bookings/${id}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Не удалось отменить');
    loadBookings();
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
