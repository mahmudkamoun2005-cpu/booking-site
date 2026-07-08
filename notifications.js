const nodemailer = require('nodemailer');

let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

function formatMessage(reg) {
  if (reg.type === 'team') {
    return `Заявка команды «${reg.teamName}» на номинацию 4×4 принята. К оплате на месте: ${reg.amount} ₽. До встречи 7–9 августа в Омске!`;
  }
  const mc = reg.masterClasses && reg.masterClasses.length
    ? ` + мастер-классы (${reg.masterClasses.length})`
    : '';
  const nomText = reg.nominationName ? reg.nominationName : 'только мастер-классы';
  return `Заявка на «Брейк Навсегда» принята: ${nomText}${mc}. К оплате на месте: ${reg.amount} ₽. До встречи 7–9 августа в Омске!`;
}

async function sendEmail(reg) {
  if (!mailer) return { skipped: true, reason: 'SMTP не настроен на сервере' };
  if (!reg.email) return { skipped: true, reason: 'no email' };
  try {
    const who = reg.type === 'team'
      ? `<p><strong>Команда:</strong> ${reg.teamName} (капитан ${reg.captainName})</p>`
      : `<p><strong>Участник:</strong> ${reg.fullName} (${reg.nickname})</p>
         <p><strong>Номинация:</strong> ${reg.nominationName || 'только мастер-классы'}</p>`;
    await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: reg.email,
      subject: 'Заявка на «Брейк Навсегда» принята',
      text: formatMessage(reg),
      html: `
        <div style="font-family:sans-serif;max-width:480px;">
          <h2>Заявка принята</h2>
          ${who}
          <p><strong>К оплате на месте:</strong> ${reg.amount} ₽</p>
          <p>Оплата производится на месте проведения чемпионата по реквизитам организаторов.</p>
          <p>Ждём вас 7–9 августа 2026 в Омске!</p>
        </div>`
    });
    return { sent: true, channel: 'email' };
  } catch (err) {
    return { sent: false, channel: 'email', error: err.message };
  }
}

async function notifyRegistration(reg) {
  const emailResult = await sendEmail(reg);
  return { email: emailResult };
}

module.exports = { notifyRegistration };
