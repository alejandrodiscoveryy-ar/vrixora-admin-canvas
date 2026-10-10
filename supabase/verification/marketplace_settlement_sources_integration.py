#!/usr/bin/env python3
"""Extra disposable PG17 smoke with the project's actual R10 wallet-source trigger.

No remote connections. Not a full-Supabase schema or production certification.
"""
from pathlib import Path
import re
import uuid
import marketplace_settlement_integration as baseline

HERE = Path(__file__).resolve().parent
SOURCE_MIGRATION = HERE.parent / "migrations" / "20260919130000_tuktuk_marketplace_reservation_sources_v10.sql"
OVERLAY = HERE / "marketplace_settlement_sources_fixture.sql"


def setup_with_real_source_classifier():
    sql = SOURCE_MIGRATION.read_text(encoding="utf-8")
    match = re.search(
        r"create or replace function app_private\.marketplace_classify_wallet_transaction\(\)"
        r"[\s\S]*?\n\$\$;",
        sql,
        flags=re.IGNORECASE,
    )
    if match is None:
        raise RuntimeError("Cannot locate the original R10 wallet classifier")
    classifier = match.group(0)
    required = (
        "WALLET_SOURCE_RESERVATION_SPLIT_INVALID",
        "WALLET_SOURCE_OTHER_RESERVATIONS_UNFUNDED",
        "new.real_delta:=-active_reservation.real_reserved_amount",
        "new.promotional_delta:=-active_reservation.promotional_reserved_amount",
    )
    for value in required:
        if value not in classifier:
            raise RuntimeError(f"R10 source contract changed: missing {value}")
    with baseline.connect() as c:
        c.execute(baseline.FIXTURE.read_text(encoding="utf-8"))
        c.execute(OVERLAY.read_text(encoding="utf-8"))
        c.execute(classifier)
        c.execute(
            "create trigger wallet_transactions_classify_sources "
            "before insert on public.wallet_transactions "
            "for each row execute function app_private.marketplace_classify_wallet_transaction()"
        )
        c.execute(baseline.MIGRATION.read_text(encoding="utf-8"))
    print("PASS: original wallet-source classifier from R10 compiled with unified finish")


def promotional_source_and_insufficient_reservation():
    # Primero entra saldo promocional real en el ledger, luego se ejecuta la
    # liquidacion con procedencia 100% promocional.
    with baseline.connect() as c:
        balance = baseline.one(
            c,
            "select balance from public.wallets where project_id=%s and user_id=%s",
            (baseline.PROJECT, baseline.DRIVER),
        )
        ledger = baseline.one(
            c,
            "select coalesce(sum(amount_delta),0) from public.wallet_transactions "
            "where project_id=%s and user_id=%s",
            (baseline.PROJECT, baseline.DRIVER),
        )
        assert balance == ledger, (balance, ledger)
        c.execute(
            "insert into public.wallet_transactions(project_id,user_id,currency,"
            "transaction_type,amount_delta,balance_after,source_type,source_id,"
            "idempotency_key) values(%s,%s,'CUP','referral_credit',10,%s,"
            "'referral_reward','fictitious-referral',%s)",
            (baseline.PROJECT, baseline.DRIVER, balance + 10, uuid.uuid4()),
        )

    job = baseline.create_job(9)
    with baseline.connect() as c:
        c.execute(
            "update public.commission_reservations "
            "set real_reserved_amount=0,promotional_reserved_amount=amount "
            "where project_id=%s and job_id=%s",
            (baseline.PROJECT, job),
        )
    baseline.customer_rate(job)
    baseline.driver_rate(job)
    assert baseline.facts(job) == ("settled", 1, 1, 1, 1), baseline.facts(job)
    with baseline.connect() as c:
        split = c.execute(
            "select real_delta,promotional_delta from public.wallet_transactions "
            "where source_type='job_commission' and source_id=%s",
            (str(job),),
        ).fetchone()
        assert tuple(split) == (0, -7.50), split
    print("PASS: promotional reservation debits only promotional source; second rating charges zero")

    # Restan 2.50 promocionales. Forzar reserva ficticia por 7.50 y
    # comprobar que el clasificador real la rechaza y revierte la valoracion.
    unfunded = baseline.create_job(10)
    with baseline.connect() as c:
        c.execute(
            "update public.commission_reservations "
            "set real_reserved_amount=0,promotional_reserved_amount=amount "
            "where project_id=%s and job_id=%s",
            (baseline.PROJECT, unfunded),
        )
    baseline.expect_error(
        lambda: baseline.driver_rate(unfunded),
        "WALLET_SOURCE_OTHER_RESERVATIONS_UNFUNDED",
    )
    assert baseline.facts(unfunded) == ("en_route", 0, 0, 0, 0)
    print("PASS: unfunded promotional reservation rejects close and rolls back rating")

    with baseline.connect() as c:
        rows = c.execute(
            "select coalesce(sum(real_delta),0),coalesce(sum(promotional_delta),0),"
            "coalesce(sum(amount_delta),0) from public.wallet_transactions "
            "where project_id=%s and user_id=%s",
            (baseline.PROJECT, baseline.DRIVER),
        ).fetchone()
        assert rows[0] + rows[1] == rows[2], rows
    print("PASS: wallet ledger real+promotional sources reconcile with the total")


if __name__ == "__main__":
    setup_with_real_source_classifier()
    baseline.tests()
    promotional_source_and_insufficient_reservation()
    print("MARKETPLACE_FINANCIAL_SOURCES_ISOLATED=PASS")
