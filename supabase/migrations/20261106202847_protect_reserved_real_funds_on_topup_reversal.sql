-- Applied to production with owner approval on 2026-11-06.
-- Records existing remote migration 20261106202847; safe to replay.
-- Patches one existing trigger function after verifying its exact definition.
DO $patch$
DECLARE definition text;
BEGIN
  definition:=pg_get_functiondef('app_private.marketplace_classify_wallet_transaction()'::regprocedure);
  IF position('TOPUP_REVERSAL_REAL_BALANCE_RESERVED' in definition)>0 THEN RETURN; END IF;
  IF md5(definition)<>'64fc8da6b55273cb1898f3f4b1ee2046' THEN RAISE EXCEPTION 'FINANCIAL_SOURCE_CHANGED_ABORT'; END IF;
  IF position($guard$    new.reversed_ledger_id:=original_tx.id;
    new.real_delta:=new.amount_delta;
    new.promotional_delta:=0;$guard$ in definition)=0 THEN RAISE EXCEPTION 'FINANCIAL_PATCH_ANCHOR_MISSING'; END IF;
  EXECUTE replace(definition,$guard$    new.reversed_ledger_id:=original_tx.id;
    new.real_delta:=new.amount_delta;
    new.promotional_delta:=0;$guard$,$guard$    -- The wallet row is already locked above; preserve real money allocated
    -- to open commissions before allowing a topup reversal.
    select coalesce(sum(r.real_reserved_amount),0)
    into other_real_reserved
    from public.commission_reservations r
    where r.project_id=new.project_id
      and r.user_id=new.user_id
      and r.status='open';

    if real_before + new.amount_delta < other_real_reserved then
      raise exception 'TOPUP_REVERSAL_REAL_BALANCE_RESERVED'
        using errcode='22023';
    end if;

    new.reversed_ledger_id:=original_tx.id;
    new.real_delta:=new.amount_delta;
    new.promotional_delta:=0;$guard$);
END;
$patch$;

