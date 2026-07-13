const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { DEFAULT_SHOP_DATA } = require('./json-store');

function mapSubscriber(row) {
  return {
    email: row.email,
    code: row.code,
    discountPercent: row.discount_percent,
    subscribedAt: row.subscribed_at,
    used: row.used,
    revoked: row.revoked
  };
}

function createSupabaseStore(url, serviceKey) {
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return {
    name: 'supabase',
    supabase,

    async getShopData() {
      const { data, error } = await supabase
        .from('shop_data')
        .select('data')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        await supabase.from('shop_data').upsert({ id: 1, data: DEFAULT_SHOP_DATA });
        return DEFAULT_SHOP_DATA;
      }
      return data.data;
    },

    async updateShopData(updates) {
      const current = await this.getShopData();
      const updated = { ...current, ...updates };
      const { error } = await supabase
        .from('shop_data')
        .upsert({ id: 1, data: updated, updated_at: new Date().toISOString() });
      if (error) throw error;
      return updated;
    },

    async getSubscribers() {
      const { data, error } = await supabase
        .from('subscribers')
        .select('*')
        .eq('revoked', false)
        .order('subscribed_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapSubscriber);
    },

    async findSubscriberByEmail(email) {
      const { data, error } = await supabase
        .from('subscribers')
        .select('*')
        .ilike('email', email)
        .eq('revoked', false)
        .maybeSingle();
      if (error) throw error;
      return data ? mapSubscriber(data) : null;
    },

    async addSubscriber(subscriber) {
      const { data, error } = await supabase
        .from('subscribers')
        .insert({
          email: subscriber.email.toLowerCase(),
          code: subscriber.code,
          discount_percent: subscriber.discountPercent,
          subscribed_at: subscriber.subscribedAt,
          used: subscriber.used || false,
          revoked: false
        })
        .select()
        .single();
      if (error) throw error;
      return mapSubscriber(data);
    },

    async revokeSubscriber(email) {
      const { data: existing, error: findError } = await supabase
        .from('subscribers')
        .select('id')
        .ilike('email', email)
        .maybeSingle();
      if (findError) throw findError;
      if (!existing) return false;

      const { error } = await supabase
        .from('subscribers')
        .delete()
        .eq('id', existing.id);
      if (error) throw error;
      return true;
    },

    async addLog(level, category, message, meta = {}) {
      const entry = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        level,
        category,
        message,
        meta
      };
      const { error } = await supabase.from('system_logs').insert(entry);
      if (error) throw error;
      return { ...entry, ...meta };
    },

    async getLogs({ category, level, limit = 100 } = {}) {
      let query = supabase
        .from('system_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (category) query = query.eq('category', category);
      if (level) query = query.eq('level', level);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        level: row.level,
        category: row.category,
        message: row.message,
        ...row.meta
      }));
    },

    async getAuthState() {
      const { data, error } = await supabase
        .from('auth_state')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return { failedAttempts: 0, lockedUntil: null, lockoutNotified: false };
      }
      return {
        failedAttempts: data.failed_attempts,
        lockedUntil: data.locked_until,
        lockoutNotified: data.lockout_notified
      };
    },

    async updateAuthState(updates) {
      const row = {};
      if ('failedAttempts' in updates) row.failed_attempts = updates.failedAttempts;
      if ('lockedUntil' in updates) row.locked_until = updates.lockedUntil;
      if ('lockoutNotified' in updates) row.lockout_notified = updates.lockoutNotified;

      const { error } = await supabase
        .from('auth_state')
        .upsert({ id: 1, ...row });
      if (error) throw error;
      return this.getAuthState();
    },

    async createSession(token, username, expiresAt) {
      const { error } = await supabase.from('admin_sessions').insert({
        token,
        username,
        login_at: new Date().toISOString(),
        expires_at: expiresAt
      });
      if (error) throw error;
    },

    async getSession(token) {
      const { data, error } = await supabase
        .from('admin_sessions')
        .select('*')
        .eq('token', token)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      if (new Date(data.expires_at) < new Date()) {
        await this.deleteSession(token);
        return null;
      }
      return { username: data.username, loginAt: data.login_at };
    },

    async deleteSession(token) {
      const { error } = await supabase
        .from('admin_sessions')
        .delete()
        .eq('token', token);
      if (error) throw error;
    },

    async getAdminUser(username) {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('username', username)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async createAdminUser(username, passwordHash) {
      const { error } = await supabase
        .from('admin_users')
        .insert({ username, password_hash: passwordHash });
      if (error) throw error;
      return true;
    },

    async verifyAdminPassword(username, password) {
      const user = await this.getAdminUser(username);
      if (!user) return false;
      return bcrypt.compare(password, user.password_hash);
    },

    async uploadImage(buffer, filename, contentType) {
      const filePath = `uploads/${Date.now()}-${filename}`;
      const { error } = await supabase.storage
        .from('shop-images')
        .upload(filePath, buffer, { contentType, upsert: false });
      if (error) throw error;

      const { data } = supabase.storage.from('shop-images').getPublicUrl(filePath);
      return data.publicUrl;
    }
  };
}

module.exports = { createSupabaseStore };
