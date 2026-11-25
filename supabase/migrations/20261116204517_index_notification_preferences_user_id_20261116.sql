CREATE INDEX IF NOT EXISTS user_notification_preferences_user_id_idx ON public.user_notification_preferences USING btree (user_id);
