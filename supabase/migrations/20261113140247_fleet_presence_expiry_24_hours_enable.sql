-- Applied to TukTuk production on 2026-11-13; retain the agreed 24-hour grace period.
-- Expiry protects active jobs and uses the latest authenticated contact, GPS receipt or shift update.
UPDATE app_private.marketplace_presence_policy_v2
SET inactivity_hours = 24, auto_expire_enabled = true
WHERE singleton = true;
