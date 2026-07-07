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

function formatMessage(booking) {
  return `Вы записаны: ${booking.service}, ${booking.date} в ${booking.time}. Оплата подтверждена. Ждём вас!`;
}

async function sendEmail(booking) {
  if (!mailer || !booking.email) return { skipped: true, reason: 'email not configured or missing' };
  try {
    await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: booking.email,
      subject: 'Запись подтверждена',
      text: formatMessage(booking),
      html: `
        <div style="font-family:sans-serif;max-width:480px;">
          <h2>Запись подтверждена</h2>
          <p><strong>Услуга:</strong> ${booking.service}</p>
          <p><strong>Дата и время:</strong> ${booking.date}, ${booking.time}</p>
          <p><strong>Оплачено:</strong> ${booking.amount} ${booking.currency.toUpperCase()}</p>
          <p>Ждём вас!</p>
        </div>`
    });
    return { sent: true, channel: 'email' };
  } catch (err) {
    return { sent: false, channel: 'email', error: err.message };
  }
}

// Российские номера — через SMS.ru (дешевле и проще для РФ, чем Twilio)
async function sendSmsRu(booking) {
  const apiId = process.env.SMS_RU_API_ID;
  if (!apiId) return { skipped: true, reason: 'SMS.ru not configured' };
  try {
    const url = `https://sms.ru/sms/send?api_id=${apiId}&to=${encodeURIComponent(booking.phone)}&msg=${encodeURIComponent(formatMessage(booking))}&json=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK') return { sent: false, channel: 'sms.ru', error: data.status_text || 'unknown error' };
    return { sent: true, channel: 'sms.ru' };
  } catch (err) {
    return { sent: false, channel: 'sms.ru', error: err.message };
  }
}

// Иностранные номера / доллаовая оплата — через Twilio
async function sendSmsTwilio(booking) {
  if (!twilioClient || !process.env.TWILIO_FROM_NUMBER) return { skipped: true, reason: 'Twilio not configured' };
  try {
    await twilioClient.messages.create({
      body: formatMessage(booking),
      from: process.env.TWILIO_FROM_NUMBER,
      to: booking.phone
    });
    return { sent: true, channel: 'twilio' };
  } catch (err) {
    return { sent: false, channel: 'twilio', error: err.message };
  }
}

async function sendSms(booking) {
  if (!booking.phone) return { skipped: true, reason: 'no phone' };
  // Простое правило: рублёвая оплата -> SMS.ru, долларовая -> Twilio.
  // Подходит для большинства случаев; при необходимости замените на определение по коду страны номера.
  return booking.currency === 'usd' ? sendSmsTwilio(booking) : sendSmsRu(booking);
}

async function notifyBooking(booking) {
  const [emailResult, smsResult] = await Promise.all([sendEmail(booking), sendSms(booking)]);
  return { email: emailResult, sms: smsResult };
}

module.exports = { notifyBooking };
