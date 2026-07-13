const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SHOP_DATA_FILE = path.join(DATA_DIR, 'shop-data.json');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');
const LOG_FILE = path.join(DATA_DIR, 'system-log.json');
const AUTH_STATE_FILE = path.join(DATA_DIR, 'auth-state.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

const DEFAULT_SHOP_DATA = {
  shopName: 'Caffeine Co.',
  tagline: 'Where Every Cup Tells a Story',
  description: 'Welcome to Caffeine Co., your neighborhood coffee sanctuary.',
  specialty: 'Single-Origin Ethiopian Yirgacheffe — bright, floral notes with a silky body.',
  hours: { weekdays: 'Mon–Fri: 7:00 AM – 9:00 PM', weekends: 'Sat–Sun: 8:00 AM – 10:00 PM' },
  contact: { phone: '+1 (555) 867-5309', email: 'hello@caffeineco.com', address: '42 Brew Street, Coffee District, CA 90210' },
  pros: [],
  discountPercent: 20,
  discountMessage: 'Welcome to the Caffeine Co. family! Enjoy {discount}% off your first visit.',
  mapEmbed: '',
  mapLat: 34.052235,
  mapLng: -118.243683,
  mapZoom: 15,
  heroImage: '',
  specialtyImage: '',
  galleryImages: []
};

function readJSON(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(filePath, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function createJsonStore() {
  return {
    name: 'json',

    async getShopData() {
      return readJSON(SHOP_DATA_FILE, DEFAULT_SHOP_DATA);
    },

    async updateShopData(updates) {
      const current = await this.getShopData();
      const updated = { ...current, ...updates };
      writeJSON(SHOP_DATA_FILE, updated);
      return updated;
    },

    async getSubscribers() {
      return readJSON(SUBSCRIBERS_FILE, []);
    },

    async findSubscriberByEmail(email) {
      const subscribers = await this.getSubscribers();
      return subscribers.find(s => s.email.toLowerCase() === email.toLowerCase()) || null;
    },

    async addSubscriber(subscriber) {
      const subscribers = await this.getSubscribers();
      subscribers.push(subscriber);
      writeJSON(SUBSCRIBERS_FILE, subscribers);
      return subscriber;
    },

    async revokeSubscriber(email) {
      const subscribers = await this.getSubscribers();
      const index = subscribers.findIndex(s => s.email.toLowerCase() === email.toLowerCase());
      if (index === -1) return false;
      subscribers.splice(index, 1);
      writeJSON(SUBSCRIBERS_FILE, subscribers);
      return true;
    },

    async addLog(level, category, message, meta = {}) {
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
    },

    async getLogs({ category, level, limit = 100 } = {}) {
      let logs = readJSON(LOG_FILE, []);
      if (category) logs = logs.filter(l => l.category === category);
      if (level) logs = logs.filter(l => l.level === level);
      return logs.slice(0, limit);
    },

    async getAuthState() {
      return readJSON(AUTH_STATE_FILE, {
        failedAttempts: 0,
        lockedUntil: null,
        lockoutNotified: false
      });
    },

    async updateAuthState(updates) {
      const current = await this.getAuthState();
      const updated = { ...current, ...updates };
      writeJSON(AUTH_STATE_FILE, updated);
      return updated;
    },

    async createSession(token, username, expiresAt) {
      const sessions = readJSON(SESSIONS_FILE, {});
      sessions[token] = { username, loginAt: new Date().toISOString(), expiresAt };
      writeJSON(SESSIONS_FILE, sessions);
    },

    async getSession(token) {
      const sessions = readJSON(SESSIONS_FILE, {});
      const session = sessions[token];
      if (!session) return null;
      if (new Date(session.expiresAt) < new Date()) {
        delete sessions[token];
        writeJSON(SESSIONS_FILE, sessions);
        return null;
      }
      return session;
    },

    async deleteSession(token) {
      const sessions = readJSON(SESSIONS_FILE, {});
      delete sessions[token];
      writeJSON(SESSIONS_FILE, sessions);
    },

    async getAdminUser(username) {
      return null;
    },

    async createAdminUser() {
      return false;
    },

    async verifyAdminPassword() {
      return false;
    }
  };
}

module.exports = { createJsonStore, DEFAULT_SHOP_DATA };
