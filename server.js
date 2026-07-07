require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const SHOP_DATA_FILE = path.join(DATA_DIR, 'shop-data.json');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');
const LOG_FILE = path.join(DATA_DIR, 'system-log.json');

const ADMIN_USER = 'AlgoCoffee';
const ADMIN_PASS = 'Algo123';
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 10 * 60 * 1000;
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'ParagatosLiybie@gmail.com';

const activeSessions = new Map();
const authState = {
  failedAttempts: 0,
  lockedUntil: null,
  lockoutNotified: false
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readJSON(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function addLog(level, category, message, meta = {}) {
  const logs = readJSON(LOG_FILE, []);
  const entry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    ...meta
  };
  logs.unshift(entry);
  if (logs.length > 500) logs.length = 500;
  writeJSON(LOG_FILE, logs);
  return entry;
}

function isLockedOut() {
  if (authState.lockedUntil && Date.now() < authState.lockedUntil) {
    return true;
  }
  if (authState.lockedUntil && Date.now() >= authState.lockedUntil) {
    authState.failedAttempts = 0;
    authState.lockedUntil = null;
    authState.lockoutNotified = false;
    addLog('info', 'security', 'Admin lockout period expired. Login access restored.');
  }
  return false;
}

function getLockoutRemainingMs() {
  if (!authState.lockedUntil) return 0;
  return Math.max(0, authState.lockedUntil - Date.now());
}

async function createTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass || user === 'your-email@gmail.com') {
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: { user, pass }
  });
}

async function sendEmail(to, subject, html) {
  const transporter = await createTransporter();
  if (!transporter) {
    addLog('warn', 'email', `Email not sent (SMTP not configured): ${subject}`, { to });
    return { sent: false, reason: 'SMTP not configured' };
  }
  try {
    await transporter.sendMail({
      from: `"Caffeine Co." <${process.env.SMTP_USER}>`,
      to,
      subject,
      html
    });
    addLog('info', 'email', `Email sent: ${subject}`, { to });
    return { sent: true };
  } catch (err) {
    addLog('error', 'email', `Failed to send email: ${err.message}`, { to, subject });
    return { sent: false, reason: err.message };
  }
}

function generateDiscountCode() {
  return 'CAFFEINE' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.session = activeSessions.get(token);
  next();
}

app.get('/api/shop', (req, res) => {
  const data = readJSON(SHOP_DATA_FILE);
  res.json(data);
});

app.post('/api/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const subscribers = readJSON(SUBSCRIBERS_FILE, []);
  const existing = subscribers.find(s => s.email.toLowerCase() === email.toLowerCase());

  if (existing) {
    addLog('info', 'customer', `Duplicate discount request from ${email}`);
    return res.status(409).json({
      error: 'This email has already received a welcome discount.',
      alreadyUsed: true
    });
  }

  const shopData = readJSON(SHOP_DATA_FILE);
  const discountPercent = shopData.discountPercent || 20;
  const code = generateDiscountCode();
  const message = (shopData.discountMessage || 'Enjoy {discount}% off!')
    .replace('{discount}', discountPercent);

  subscribers.push({
    email: email.toLowerCase(),
    code,
    discountPercent,
    subscribedAt: new Date().toISOString(),
    used: false
  });
  writeJSON(SUBSCRIBERS_FILE, subscribers);

  const emailHtml = `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #1a1209; color: #f5e6d3; padding: 40px; border-radius: 12px;">
      <h1 style="color: #c8a97e; margin-bottom: 8px; font-family: Georgia, serif; letter-spacing: 0.05em;">Welcome to Caffeine Co.</h1>
      <p style="font-size: 16px; line-height: 1.6;">${message}</p>
      <div style="background: #2d1f0f; border: 2px dashed #c8a97e; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
        <p style="margin: 0; font-size: 14px; color: #a89070;">Your exclusive code</p>
        <p style="margin: 8px 0 0; font-size: 28px; font-weight: bold; color: #c8a97e; letter-spacing: 3px;">${code}</p>
        <p style="margin: 8px 0 0; font-size: 22px; color: #e8d5b7;">${discountPercent}% OFF</p>
      </div>
      <p style="font-size: 14px; color: #a89070;">Present this code on your first visit. One-time use only.</p>
      <p style="font-size: 14px; margin-top: 24px;">See you soon!<br><strong>Caffeine Co. Team</strong></p>
    </div>
  `;

  const emailResult = await sendEmail(email, `Your ${discountPercent}% Welcome Discount — Caffeine Co.`, emailHtml);
  addLog('info', 'customer', `New subscriber: ${email} — code ${code} (${discountPercent}% off)`);

  res.json({
    success: true,
    message: emailResult.sent
      ? `Your ${discountPercent}% discount code has been sent to ${email}!`
      : `Welcome! Your code is ${code} (${discountPercent}% off). Check your inbox when email is configured.`,
    code: emailResult.sent ? undefined : code,
    emailSent: emailResult.sent
  });
});

app.get('/api/auth/status', (req, res) => {
  if (isLockedOut()) {
    return res.json({
      locked: true,
      remainingMs: getLockoutRemainingMs(),
      remainingMinutes: Math.ceil(getLockoutRemainingMs() / 60000)
    });
  }
  res.json({ locked: false, failedAttempts: authState.failedAttempts });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (isLockedOut()) {
    const remaining = Math.ceil(getLockoutRemainingMs() / 60000);
    addLog('warn', 'security', `Login attempt while locked out (${remaining} min remaining)`);
    return res.status(423).json({
      error: `Too many failed attempts. Admin access is locked for ${remaining} more minute(s).`,
      locked: true,
      remainingMs: getLockoutRemainingMs()
    });
  }

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    authState.failedAttempts = 0;
    authState.lockedUntil = null;
    authState.lockoutNotified = false;

    const token = uuidv4();
    activeSessions.set(token, { username, loginAt: new Date().toISOString() });
    addLog('info', 'auth', `Admin login successful: ${username}`);

    return res.json({ success: true, token });
  }

  authState.failedAttempts++;
  addLog('warn', 'auth', `Failed login attempt #${authState.failedAttempts} for user "${username || 'unknown'}"`);

  if (authState.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    authState.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    addLog('error', 'security', `Admin access LOCKED for 10 minutes after ${MAX_FAILED_ATTEMPTS} failed attempts.`);

    if (!authState.lockoutNotified) {
      authState.lockoutNotified = true;
      const notifyHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 2px solid #c0392b; border-radius: 8px;">
          <h2 style="color: #c0392b;">Security Alert — Caffeine Co. Admin</h2>
          <p><strong>${MAX_FAILED_ATTEMPTS} failed login attempts</strong> were detected on the admin panel.</p>
          <p>Admin access has been <strong>locked for 10 minutes</strong> as a security precaution.</p>
          <p style="color: #666; font-size: 13px;">Time: ${new Date().toLocaleString()}</p>
          <p style="color: #666; font-size: 13px;">If this wasn't you, please review your credentials immediately.</p>
        </div>
      `;
      await sendEmail(ADMIN_NOTIFY_EMAIL, 'Admin Lockout Alert — Caffeine Co.', notifyHtml);
      addLog('info', 'security', `Lockout notification sent to ${ADMIN_NOTIFY_EMAIL}`);
    }

    return res.status(423).json({
      error: 'Too many failed attempts. Admin access locked for 10 minutes.',
      locked: true,
      remainingMs: LOCKOUT_DURATION_MS
    });
  }

  const remaining = MAX_FAILED_ATTEMPTS - authState.failedAttempts;
  res.status(401).json({
    error: `Invalid credentials. ${remaining} attempt(s) remaining before lockout.`,
    failedAttempts: authState.failedAttempts,
    remainingAttempts: remaining
  });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  activeSessions.delete(token);
  addLog('info', 'auth', 'Admin logged out.');
  res.json({ success: true });
});

app.get('/api/admin/shop', requireAuth, (req, res) => {
  res.json(readJSON(SHOP_DATA_FILE));
});

app.put('/api/admin/shop', requireAuth, (req, res) => {
  const current = readJSON(SHOP_DATA_FILE);
  const updated = { ...current, ...req.body };
  writeJSON(SHOP_DATA_FILE, updated);
  addLog('info', 'admin', 'Shop information updated.', { fields: Object.keys(req.body) });
  res.json(updated);
});

app.get('/api/admin/subscribers', requireAuth, (req, res) => {
  res.json(readJSON(SUBSCRIBERS_FILE, []));
});

app.get('/api/admin/logs', requireAuth, (req, res) => {
  const logs = readJSON(LOG_FILE, []);
  const { category, level, limit = 100 } = req.query;
  let filtered = logs;
  if (category) filtered = filtered.filter(l => l.category === category);
  if (level) filtered = filtered.filter(l => l.level === level);
  res.json(filtered.slice(0, parseInt(limit, 10)));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  Caffeine Co. running at http://localhost:${PORT}`);
  console.log(`  Admin panel at http://localhost:${PORT}/admin\n`);
  addLog('info', 'system', `Server started on port ${PORT}`);
});
