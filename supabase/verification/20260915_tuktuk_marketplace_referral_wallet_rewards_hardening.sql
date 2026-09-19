-- R1.1 static checks. Dynamic cutover scenarios remain Block 12/staging debt.
do $$
declare d text;
begin
 if to_regclass('public.marketplace_legacy_referral_reward_transitions') is null then raise exception 'TEST_FAILED: transition table missing'; end if;
 if not (select relrowsecurity from pg_class where oid='public.marketplace_legacy_referral_reward_transitions'::regclass) then raise exception 'TEST_FAILED: transition RLS missing'; end if;
 if has_table_privilege('anon','public.marketplace_legacy_referral_reward_transitions','select') or has_table_privilege('authenticated','public.marketplace_legacy_referral_reward_transitions','insert') then raise exception 'TEST_FAILED: transition direct access exposed'; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.marketplace_legacy_referral_reward_transitions'::regclass and contype='u' and pg_get_constraintdef(oid) like '%project_id, legacy_reward_id%') then raise exception 'TEST_FAILED: legacy reward idempotency missing'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.marketplace_legacy_referral_reward_transitions'::regclass and tgname='marketplace_legacy_referral_transitions_immutable') then raise exception 'TEST_FAILED: transition immutability missing'; end if;
 if exists(select 1 from pg_trigger where tgrelid='public.jobs'::regclass and tgname='marketplace_referral_after_settlement') then raise exception 'TEST_FAILED: old settlement trigger remains'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.job_events'::regclass and tgname='marketplace_referral_after_settle_event') then raise exception 'TEST_FAILED: settle event trigger missing'; end if;
 foreach d in array array['app_private.transition_legacy_marketplace_referral_rewards(uuid)','app_private.maybe_award_marketplace_referral_reward(uuid,uuid,uuid)'] loop if to_regprocedure(d) is null then raise exception 'TEST_FAILED: missing %',d; end if; end loop;
 select lower(pg_get_functiondef('app_private.transition_legacy_marketplace_referral_rewards(uuid)'::regprocedure)) into d;
 if d not like '%status in (''earned'',''applied'')%' or d not like '%legacy_referral_transition%' or d not like '%legacy_reward_id%' then raise exception 'TEST_FAILED: transition candidate/provenance incomplete'; end if;
 select lower(pg_get_functiondef('app_private.p0d_reconcile_payment_reward()'::regprocedure)) into d;
 if d not like '%marketplace_wallet_credit%' then raise exception 'TEST_FAILED: legacy reward freeze missing'; end if;
 select lower(pg_get_functiondef('public.admin_link_client_referrer_code(uuid,uuid,text)'::regprocedure)) into d;
 if d not like '%marketplace_referral_relationship_locked%' or d not like '%marketplace_wallet_credit%' then raise exception 'TEST_FAILED: wallet referral relationship lock missing'; end if;
 select lower(pg_get_functiondef('public.admin_get_client_referral_summary(uuid,uuid)'::regprocedure)) into d;
 if d not like '%marketplace_referral_relationship_locked%' then raise exception 'TEST_FAILED: can_link_referrer wallet rule missing'; end if;
 -- Dynamic debt: earned/applied => one 100 CUP; reverted/pending/test => zero; retries do not duplicate;
 -- applied licence days are unchanged; legacy payment reversals do not alter TukTuk days; settled/incident paths award at most one.
end $$;
