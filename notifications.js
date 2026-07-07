const nodemailer = require('nodemailer');
const fetch = require('node-fetch');

let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

function formatMessage(reg) {
  const mc = reg.masterClasses && reg.masterClasses.length
    ? ` + мастер-классы (${reg.masterClasses.length})`
    : '';
  return `Регистрация на «Брейк Навсегда» подтверждена: ${reg.nominationName}${mc}. До встречи 7–9 августа в Омске!`;
}

async function sendEmail(reg) {
  if (!mailer || !reg.email) return { skipped: true, reason: 'email not configured or missing' };
  try {
    await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: reg.email,
      subject: 'Регистрация на «Брейк Навсегда» подтверждена',
      text: formatMessage(reg),
      html: `
        <div style="font-family:sans-serif;max-width:480px;">
          <h2>Регистрация подтверждена</h2>
          <p><strong>Участник:</strong> ${reg.fullName} (${reg.nickname})</p>
          <p><strong>Номинация:</strong> ${reg.nominationName}</p>
          <p><strong>Оплачено:</strong> ${reg.amount} ${reg.currency.toUpperCase()}</p>
          <p>Ждём вас 7–9 августа 2026 в Омске!</p>
        </div>`
    });
    return { sent: true, channel: 'email' };
  } catch (err) {
    return { sent: false, channel: 'email', error: err.message };
  }
}

// Российские номера — через SMS.ru (дешевле и проще для РФ, чем Twilio)
async function sendSmsRu(reg) {
  const apiId = process.env.SMS_RU_API_ID;
  if (!apiId) return { skipped: true, reason: 'SMS.ru not configured' };
  try {
    const url = `https://sms.ru/sms/send?api_id=${apiId}&to=${encodeURIComponent(reg.phone)}&msg=${encodeURIComponent(formatMessage(reg))}&json=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK') return { sent: false, channel: 'sms.ru', error: data.status_text || 'unknown error' };
    return { sent: true, channel: 'sms.ru' };
  } catch (err) {
    return { sent: false, channel: 'sms.ru', error: err.message };
  }
}

// Иностранные номера / долларовая оплата — через Twilio
async function sendSmsTwilio(reg) {
  if (!twilioClient || !process.env.TWILIO_FROM_NUMBER) return { skipped: true, reason: 'Twilio not configured' };
  try {
    await twilioClient.messages.create({
      body: formatMessage(reg),
      from: process.env.TWILIO_FROM_NUMBER,
      to: reg.phone
    });
    return { sent: true, channel: 'twilio' };
  } catch (err) {
    return { sent: false, channel: 'twilio', error: err.message };
  }
}

async function sendSms(reg) {
  if (!reg.phone) return { skipped: true, reason: 'no phone' };
  return reg.currency === 'usd' ? sendSmsTwilio(reg) : sendSmsRu(reg);
}

async function notifyRegistration(reg) {
  const [emailResult, smsResult] = await Promise.all([sendEmail(reg), sendSms(reg)]);
  return { email: emailResult, sms: smsResult };
}

module.exports = { notifyRegistration };
