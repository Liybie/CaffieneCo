const bcrypt = require('bcryptjs');
const { createJsonStore } = require('./json-store');
const { createSupabaseStore } = require('./supabase-store');

let store = null;

function isSupabaseConfigured() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(url && key && !url.includes('your-project'));
}

function getStore() {
  if (store) return store;

  if (isSupabaseConfigured()) {
    store = createSupabaseStore(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    console.log('  Storage: Supabase');
  } else {
    store = createJsonStore();
    console.log('  Storage: Local JSON files (set SUPABASE_URL for production)');
  }
  return store;
}

async function ensureAdminUser() {
  const db = getStore();
  const username = process.env.ADMIN_USER || 'AlgoCoffee';
  const password = process.env.ADMIN_PASS || 'Algo123';

  if (db.name !== 'supabase') return;

  const existing = await db.getAdminUser(username);
  if (existing) return;

  const hash = await bcrypt.hash(password, 10);
  await db.createAdminUser(username, hash);
  await db.addLog('info', 'system', `Admin user "${username}" seeded in Supabase.`);
}

async function verifyAdminCredentials(username, password) {
  const db = getStore();
  const envUser = process.env.ADMIN_USER || 'AlgoCoffee';
  const envPass = process.env.ADMIN_PASS || 'Algo123';

  if (db.name === 'supabase') {
    const valid = await db.verifyAdminPassword(username, password);
    if (valid) return true;
    return username === envUser && password === envPass;
  }

  return username === envUser && password === envPass;
}

module.exports = {
  getStore,
  ensureAdminUser,
  verifyAdminCredentials,
  isSupabaseConfigured
};
