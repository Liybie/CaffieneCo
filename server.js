require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { getStore, ensureAdminUser, verifyAdminCredentials, isSupabaseConfigured } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 10 * 60 * 1000;
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'ParagatosLiybie@gmail.com';
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  }
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

let initialized = false;
async function ensureInitialized() {
  if (initialized) return;
  await ensureAdminUser();
  if (isSupabaseConfigured()) {
    await getStore().getShopData();
  }
  initialized = true;
}

app.use(async (req, res, next) => {
  try {
    await ensureInitialized();
    next();
  } catch (err) {
    console.error('Init error:', err.message);
    res.status(500).json({ error: 'Server initialization failed.' });
  }
});

async function addLog(level, category, message, meta = {}) {
  return getStore().addLog(level, category, message, meta);
}

async function getAuthState() {
  return getStore().getAuthState();
}

async function isLockedOut() {
  const state = await getAuthState();
  if (state.lockedUntil && Date.now() < new Date(state.lockedUntil).getTime()) {
    return true;
  }
  if (state.lockedUntil && Date.now() >= new Date(state.lockedUntil).getTime()) {
    await getStore().updateAuthState({
      failedAttempts: 0,
      lockedUntil: null,
      lockoutNotified: false
    });
    await addLog('info', 'security', 'Admin lockout period expired. Site access restored.');
  }
  return false;
}

async function getLockoutRemainingMs() {
  const state = await getAuthState();
  if (!state.lockedUntil) return 0;
  return Math.max(0, new Date(state.lockedUntil).getTime() - Date.now());
}

function isExemptFromSiteLock(req) {
  const p = req.path;
  return (
    p.startsWith('/api/auth') ||
    p.startsWith('/admin') ||
    p.startsWith('/css/') ||
    p.startsWith('/js/') ||
    p.startsWith('/uploads/') ||
    p === '/locked.html' ||
    p === '/favicon.ico'
  );
}

app.use(async (req, res, next) => {
  if (!await isLockedOut() || isExemptFromSiteLock(req)) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(503).json({
      locked: true,
      error: 'Site temporarily locked due to security measures.',
      remainingMs: await getLockoutRemainingMs()
    });
  }

  return res.sendFile(path.join(__dirname, 'public', 'locked.html'));
});

async function createTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass || user === 'your-email@gmail.com') return null;
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
    await addLog('warn', 'email', `Email not sent (SMTP not configured): ${subject}`, { to });
    return { sent: false, reason: 'SMTP not configured' };
  }
  try {
    await transporter.sendMail({
      from: `"Caffeine Co." <${process.env.SMTP_USER}>`,
      to,
      subject,
      html
    });
    await addLog('info', 'email', `Email sent: ${subject}`, { to });
    return { sent: true };
  } catch (err) {
    await addLog('error', 'email', `Failed to send email: ${err.message}`, { to, subject });
    return { sent: false, reason: err.message };
  }
}

function generateDiscountCode() {
  return 'CAFFEINE' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function buildDiscountEmailHtml(message, code, discountPercent) {
  return `
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
}

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const session = await getStore().getSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  req.session = session;
  req.authToken = token;
  next();
}

async function saveUploadedImage(file) {
  const db = getStore();

  if (db.name === 'supabase' && db.uploadImage) {
    return db.uploadImage(file.buffer, file.originalname, file.mimetype);
  }

  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const ext = path.extname(file.originalname) || '.jpg';
  const filename = `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), file.buffer);
  return `/uploads/${filename}`;
}

app.get('/api/shop', async (req, res) => {
  try {
    const data = await getStore().getShopData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load shop data.' });
  }
});

app.post('/api/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const db = getStore();
    const existing = await db.findSubscriberByEmail(email);
    if (existing) {
      await addLog('info', 'customer', `Duplicate discount request from ${email}`);
      return res.status(409).json({
        error: 'This email has already received a welcome discount.',
        alreadyUsed: true
      });
    }

    const shopData = await db.getShopData();
    const discountPercent = shopData.discountPercent || 20;
    const code = generateDiscountCode();
    const message = (shopData.discountMessage || 'Enjoy {discount}% off!')
      .replace('{discount}', discountPercent);

    await db.addSubscriber({
      email: email.toLowerCase(),
      code,
      discountPercent,
      subscribedAt: new Date().toISOString(),
      used: false
    });

    const emailHtml = buildDiscountEmailHtml(message, code, discountPercent);
    const emailResult = await sendEmail(
      email,
      `Your ${discountPercent}% Welcome Discount — Caffeine Co.`,
      emailHtml
    );
    await addLog('info', 'customer', `New subscriber: ${email} — code ${code} (${discountPercent}% off)`);

    res.json({
      success: true,
      message: emailResult.sent
        ? `Your ${discountPercent}% discount code has been sent to ${email}!`
        : `Welcome! Your code is ${code} (${discountPercent}% off). Check your inbox when email is configured.`,
      code: emailResult.sent ? undefined : code,
      emailSent: emailResult.sent
    });
  } catch (err) {
    await addLog('error', 'customer', `Subscribe error: ${err.message}`);
    res.status(500).json({ error: 'Failed to process subscription.' });
  }
});

app.get('/api/auth/status', async (req, res) => {
  try {
    if (await isLockedOut()) {
      return res.json({
        locked: true,
        remainingMs: await getLockoutRemainingMs(),
        remainingMinutes: Math.ceil(await getLockoutRemainingMs() / 60000)
      });
    }
    const state = await getAuthState();
    res.json({ locked: false, failedAttempts: state.failedAttempts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check auth status.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (await isLockedOut()) {
      const remaining = Math.ceil(await getLockoutRemainingMs() / 60000);
      await addLog('warn', 'security', `Login attempt while locked out (${remaining} min remaining)`);
      return res.status(423).json({
        error: `Too many failed attempts. Access is locked for ${remaining} more minute(s).`,
        locked: true,
        remainingMs: await getLockoutRemainingMs()
      });
    }

    if (await verifyAdminCredentials(username, password)) {
      await getStore().updateAuthState({
        failedAttempts: 0,
        lockedUntil: null,
        lockoutNotified: false
      });

      const token = uuidv4();
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
      await getStore().createSession(token, username, expiresAt);
      await addLog('info', 'auth', `Admin login successful: ${username}`);

      return res.json({ success: true, token });
    }

    const state = await getAuthState();
    const failedAttempts = state.failedAttempts + 1;
    await getStore().updateAuthState({ failedAttempts });
    await addLog('warn', 'auth', `Failed login attempt #${failedAttempts} for user "${username || 'unknown'}"`);

    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
      await getStore().updateAuthState({ lockedUntil });
      await addLog('error', 'security', `Site LOCKED for 10 minutes after ${MAX_FAILED_ATTEMPTS} failed admin login attempts.`);

      if (!state.lockoutNotified) {
        await getStore().updateAuthState({ lockoutNotified: true });
        const notifyHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 2px solid #c0392b; border-radius: 8px;">
            <h2 style="color: #c0392b;">Security Alert — Caffeine Co. Admin</h2>
            <p><strong>${MAX_FAILED_ATTEMPTS} failed login attempts</strong> were detected on the admin panel.</p>
            <p>The entire website has been <strong>locked for 10 minutes</strong> as a security precaution.</p>
            <p style="color: #666; font-size: 13px;">Time: ${new Date().toLocaleString()}</p>
            <p style="color: #666; font-size: 13px;">Attempted username: ${username || 'unknown'}</p>
            <p style="color: #666; font-size: 13px;">If this wasn't you, please review your credentials immediately.</p>
          </div>
        `;
        await sendEmail(ADMIN_NOTIFY_EMAIL, 'Security Alert — Caffeine Co. Site Locked', notifyHtml);
        await addLog('info', 'security', `Lockout notification sent to ${ADMIN_NOTIFY_EMAIL}`);
      }

      return res.status(423).json({
        error: 'Too many failed attempts. The website is locked for 10 minutes.',
        locked: true,
        remainingMs: LOCKOUT_DURATION_MS
      });
    }

    const remaining = MAX_FAILED_ATTEMPTS - failedAttempts;
    res.status(401).json({
      error: `Invalid credentials. ${remaining} attempt(s) remaining before lockout.`,
      failedAttempts,
      remainingAttempts: remaining
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed.' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    await getStore().deleteSession(req.authToken);
    await addLog('info', 'auth', 'Admin logged out.');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed.' });
  }
});

app.get('/api/admin/shop', requireAuth, async (req, res) => {
  try {
    res.json(await getStore().getShopData());
  } catch (err) {
    res.status(500).json({ error: 'Failed to load shop data.' });
  }
});

app.put('/api/admin/shop', requireAuth, async (req, res) => {
  try {
    const updated = await getStore().updateShopData(req.body);
    await addLog('info', 'admin', 'Shop information updated.', { fields: Object.keys(req.body) });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update shop data.' });
  }
});

app.post('/api/admin/upload', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file provided.' });
    const url = await saveUploadedImage(req.file);
    await addLog('info', 'admin', 'Image uploaded.', { url, originalName: req.file.originalname });
    res.json({ success: true, url });
  } catch (err) {
    await addLog('error', 'admin', `Image upload failed: ${err.message}`);
    res.status(500).json({ error: err.message || 'Upload failed.' });
  }
});

app.get('/api/admin/subscribers', requireAuth, async (req, res) => {
  try {
    res.json(await getStore().getSubscribers());
  } catch (err) {
    res.status(500).json({ error: 'Failed to load subscribers.' });
  }
});

app.delete('/api/admin/subscribers/:email/revoke', requireAuth, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const revoked = await getStore().revokeSubscriber(email);
    if (!revoked) {
      return res.status(404).json({ error: 'Subscriber not found.' });
    }
    await addLog('info', 'admin', `Discount code revoked for ${email} (testing reset).`, { email });
    res.json({ success: true, message: `Code revoked for ${email}. They can register again to test email delivery.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke subscriber.' });
  }
});

app.get('/api/admin/logs', requireAuth, async (req, res) => {
  try {
    const { category, level, limit = 100 } = req.query;
    const logs = await getStore().getLogs({
      category: category || undefined,
      level: level || undefined,
      limit: parseInt(limit, 10)
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load logs.' });
  }
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

async function startServer() {
  try {
    await ensureInitialized();
    await addLog('info', 'system', `Server started on port ${PORT}`);
    app.listen(PORT, () => {
      console.log(`\n  Caffeine Co. running at http://localhost:${PORT}`);
      console.log(`  Admin panel at http://localhost:${PORT}/admin\n`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
