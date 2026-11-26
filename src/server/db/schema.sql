-- ============================================================================
-- acc.asis (ACAS) — Free-Tier PostgreSQL Schema (Compatible with Supabase & Neon)
-- ============================================================================

CREATE TABLE IF NOT EXISTS acas_users (
  telegram_id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  two_factor_verified BOOLEAN NOT NULL DEFAULT TRUE,
  enabled_modules JSONB NOT NULL DEFAULT '{"events":true,"conferences":true,"volunteering":true,"scholarships":true,"competitions":true}'::jsonb,
  default_horizon TEXT NOT NULL DEFAULT 'all',
  custom_days_max INTEGER NOT NULL DEFAULT 120,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acas_insights (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL CHECK (module_id IN ('events', 'conferences', 'volunteering', 'scholarships', 'competitions')),
  title TEXT NOT NULL,
  insight TEXT NOT NULL,
  target_date_iso DATE NOT NULL,
  days_remaining INTEGER NOT NULL,
  channel_handle TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  message_id BIGINT NOT NULL,
  source_url TEXT NOT NULL,
  payload JSONB NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acas_insights_module_date
  ON acas_insights (module_id, target_date_iso ASC);
