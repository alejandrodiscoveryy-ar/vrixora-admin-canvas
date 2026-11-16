-- Tracks migration already applied on the live Supabase project at 2026-11-16 21:16 UTC.
-- Surgical FK support only: no changes to dispatch, tariffs, wallets, ownership policies or commissions.
CREATE INDEX IF NOT EXISTS driver_profiles_user_id_idx
  ON public.driver_profiles USING btree (user_id);

CREATE INDEX IF NOT EXISTS job_assignments_driver_vehicle_fk_idx
  ON public.job_assignments USING btree (project_id, driver_user_id, vehicle_id);

CREATE INDEX IF NOT EXISTS marketplace_impulsa_rewards_commission_ledger_id_idx
  ON app_private.marketplace_impulsa_rewards USING btree (commission_ledger_id);
