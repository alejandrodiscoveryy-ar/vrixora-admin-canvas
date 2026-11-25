ALTER POLICY user_notification_preferences_own_select ON public.user_notification_preferences USING (user_id = (select auth.uid()));
ALTER POLICY user_notification_preferences_own_insert ON public.user_notification_preferences WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY user_notification_preferences_own_update ON public.user_notification_preferences USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
