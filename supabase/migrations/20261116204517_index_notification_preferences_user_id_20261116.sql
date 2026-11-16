-- Reconciles the already-applied production migration 20261116204517.
-- The existing (project_id, user_id) PK cannot serve user_id-only RLS filters.
CREATE INDEX IF NOT EXISTS user_notification_preferences_user_id_idx
  ON public.user_notification_preferences USING btree (user_id);
