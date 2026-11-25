-- Targeted foreign-key support for driver identity, dispatch assignments, and Impulsa.
-- Existing primary/unique keys and business logic are untouched.
CREATE INDEX IF NOT EXISTS driver_profiles_user_id_idx
  ON public.driver_profiles USING btree (user_id);

CREATE INDEX IF NOT EXISTS job_assignments_driver_vehicle_fk_idx
  ON public.job_assignments USING btree (project_id, driver_user_id, vehicle_id);

CREATE INDEX IF NOT EXISTS marketplace_impulsa_rewards_commission_ledger_id_idx
  ON app_private.marketplace_impulsa_rewards USING btree (commission_ledger_id);
