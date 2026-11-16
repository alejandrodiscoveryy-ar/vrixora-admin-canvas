-- Reconciles the already-applied production migration 20261116204303.
-- Keep ownership checks unchanged while evaluating auth.uid() only once per statement.
ALTER POLICY user_notification_preferences_own_select
  ON public.user_notification_preferences
  USING (user_id = (SELECT auth.uid()));

ALTER POLICY user_notification_preferences_own_insert
  ON public.user_notification_preferences
  WITH CHECK (user_id = (SELECT auth.uid()));

ALTER POLICY user_notification_preferences_own_update
  ON public.user_notification_preferences
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
