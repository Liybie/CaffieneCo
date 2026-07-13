-- Caffeine Co. — Supabase Schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL → New query)

-- Shop content (single row)
CREATE TABLE IF NOT EXISTS shop_data (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Discount email subscribers
CREATE TABLE IF NOT EXISTS subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  code TEXT NOT NULL,
  discount_percent INT NOT NULL,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used BOOLEAN NOT NULL DEFAULT FALSE,
  revoked BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers (LOWER(email));

-- System activity log
CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs (timestamp DESC);

-- Admin auth lockout state (single row, persists across serverless restarts)
CREATE TABLE IF NOT EXISTS auth_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  lockout_notified BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO auth_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Admin sessions (persist across serverless instances)
CREATE TABLE IF NOT EXISTS admin_sessions (
  token UUID PRIMARY KEY,
  username TEXT NOT NULL,
  login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions (expires_at);

-- Admin credentials (bcrypt hashed password)
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Storage bucket for shop images (create via Dashboard → Storage → New bucket)
-- Bucket name: shop-images
-- Public: true (images are displayed on the customer site)
