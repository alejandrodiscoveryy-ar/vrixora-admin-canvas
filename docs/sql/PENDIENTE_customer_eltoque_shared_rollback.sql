-- FUTURE rollback only, with express owner authorization.
-- Disable new enqueueing without deleting subscriptions, deliveries or history.
begin;
drop trigger if exists trg_marketplace_customer_eltoque_push on public.project_exchange_rate_history;
commit;
-- Already queued/in-flight deliveries may still be sent. Restore the operative
-- dispatcher v16 separately to disable Cliente processing; keep registration
-- unsubscribe available. Do not use old GitHub main as dispatcher rollback.
