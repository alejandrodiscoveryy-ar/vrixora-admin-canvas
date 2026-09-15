-- Static/schema verification for the Marketplace referral-credit cutover. Run locally only.
do $$
declare d text;
begin
 if to_regclass('public.marketplace_referral_rewards') is null then raise exception 'TEST_FAILED: marketplace referral rewards missing'; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.marketplace_referral_rewards'::regclass and contype='u' and pg_get_constraintdef(oid) like '%project_id, referred_user_id%') then raise exception 'TEST_FAILED: one reward per referred user missing'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.marketplace_referral_rewards'::regclass and tgname='marketplace_referral_rewards_immutable') then raise exception 'TEST_FAILED: reward immutability missing'; end if;
 if has_table_privilege('anon','public.marketplace_referral_rewards','select') or has_table_privilege('authenticated','public.marketplace_referral_rewards','insert') then raise exception 'TEST_FAILED: direct reward access exposed'; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.wallet_transactions'::regclass and pg_get_constraintdef(oid) like '%referral_credit%') then raise exception 'TEST_FAILED: referral credit ledger type missing'; end if;
 if not exists(select 1 from public.projects p join public.project_referral_settings s on s.project_id=p.id where p.slug='tuktuk-control' and s.reward_mode='marketplace_wallet_credit' and s.reward_enabled and s.reward_amount=100 and s.reward_currency='CUP' and s.reward_rule_version>=1 and s.reward_effective_at is not null) then raise exception 'TEST_FAILED: TukTuk wallet reward configuration missing'; end if;
 foreach d in array array['app_private.maybe_award_marketplace_referral_reward(uuid,uuid,uuid)','public.admin_set_marketplace_referral_reward_settings(uuid,boolean,numeric,text)','public.admin_get_marketplace_referral_reward_settings(uuid)'] loop if to_regprocedure(d) is null then raise exception 'TEST_FAILED: function missing %',d; end if; end loop;
 select lower(pg_get_functiondef('app_private.maybe_award_marketplace_referral_reward(uuid,uuid,uuid)'::regprocedure)) into d;
 if d not like '%pg_advisory_xact_lock%' or d not like '%marketplace_referral_first_qualification%' or d not like '%referral_reward_ledger%' or d not like '%marketplace_work_trials%' or d not like '%referral_credit%' then raise exception 'TEST_FAILED: reward guardrails incomplete'; end if;
 select lower(pg_get_functiondef('app_private.p0d_reconcile_payment_reward()'::regprocedure)) into d;
 if d not like '%marketplace_wallet_credit%' then raise exception 'TEST_FAILED: legacy payment reward guard missing'; end if;
end $$;
