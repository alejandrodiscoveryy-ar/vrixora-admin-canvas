#!/usr/bin/env python3
"""Exercise the actual unified-finish migration on disposable PostgreSQL 17.

Fixture deliberately substitutes simple wallet/auth helpers and tables. Passing
this suite is a functional smoke/concurrency test, NOT full production parity.
"""
import concurrent.futures
import os
import pathlib
import threading
import uuid
from urllib.parse import urlsplit

import psycopg

HERE = pathlib.Path(__file__).resolve().parent
MIGRATION = HERE.parent / "migrations" / "20261008220000_marketplace_unified_finish.sql"
FIXTURE = HERE / "marketplace_settlement_fixture.sql"
URL = os.environ.get("TEST_DATABASE_URL", "")
if urlsplit(URL).hostname not in ("localhost", "127.0.0.1"):
    raise SystemExit("TEST_DATABASE_URL must point to local disposable PostgreSQL")
PROJECT = uuid.UUID("00000000-0000-4000-8000-000000000001")
DRIVER = uuid.UUID("00000000-0000-4000-8000-000000000002")
CUSTOMER = uuid.UUID("00000000-0000-4000-8000-000000000003")
ADMIN = uuid.UUID("00000000-0000-4000-8000-000000000004")
SESSION = uuid.UUID("00000000-0000-4000-8000-000000000010")
SESSION_TOKEN = "test-only-customer-token"


def connect(actor=None):
    c = psycopg.connect(URL, autocommit=True)
    if actor:
        c.execute("select set_config('app.test_actor',%s,false)", (str(actor),))
    return c


def one(c, query, args=()):
    return c.execute(query, args).fetchone()[0]


def setup():
    with connect() as c:
        c.execute(FIXTURE.read_text(encoding="utf-8"))
        c.execute(MIGRATION.read_text(encoding="utf-8"))
    print("PASS: migration SQL compiled on isolated PostgreSQL 17")


def create_job(number, mode="wallet_commission", deleted=False):
    job = uuid.uuid5(uuid.NAMESPACE_URL, f"marketplace-isolated-test:{number}")
    request = uuid.uuid4()
    commission = 0 if mode == "trial_free" else 7.50
    with connect() as c:
        c.execute("insert into public.service_requests(project_id,id,customer_id) values(%s,%s,%s)",
                  (PROJECT, request, CUSTOMER))
        c.execute("""insert into public.jobs(project_id,id,service_request_id,status,
                  assigned_driver_user_id,assigned_vehicle_id,commission_rate_snapshot,
                  final_price,currency,test_deleted_at)
                  values(%s,%s,%s,'en_route',%s,'veh-1',0.075,100,'CUP',
                  case when %s then now() else null end)""",
                  (PROJECT, job, request, DRIVER, deleted))
        c.execute("""insert into public.job_assignments(project_id,job_id,driver_user_id,
                  vehicle_id,billing_mode,commission_amount_snapshot)
                  values(%s,%s,%s,'veh-1',%s,%s)""",
                  (PROJECT, job, DRIVER, mode, commission))
        if mode == "wallet_commission":
            c.execute("""insert into public.commission_reservations(project_id,job_id,user_id,
                      amount,final_price_snapshot,commission_rate_snapshot,currency)
                      values(%s,%s,%s,%s,100,0.075,'CUP')""",
                      (PROJECT, job, DRIVER, commission))
    return job


def driver_rate(job, key=None):
    with connect(DRIVER) as c:
        return one(c, "select job_id from public.create_my_marketplace_customer_rating(%s,5,null,%s)",
                   (job, key or uuid.uuid4()))


def customer_rate(job, key=None):
    with connect() as c:
        return one(c, "select job_id from public.create_marketplace_customer_rating(%s,%s,%s,5,null,%s)",
                   (SESSION, SESSION_TOKEN, job, key or uuid.uuid4()))


def admin_close(job):
    with connect(ADMIN) as c:
        return one(c, "select status from public.admin_finish_marketplace_job(%s,'cierre excepcional de prueba',%s)",
                   (job, uuid.uuid4()))


def facts(job):
    with connect() as c:
        status = one(c, "select status from public.jobs where id=%s", (job,))
        d = one(c, "select count(*) from public.marketplace_driver_customer_ratings where job_id=%s", (job,))
        u = one(c, "select count(*) from public.marketplace_customer_ratings where job_id=%s", (job,))
        fees = one(c, "select count(*) from public.wallet_transactions where source_type='job_commission' and source_id=%s", (str(job),))
        events = one(c, "select count(*) from public.job_events where job_id=%s and action='finish_service'", (job,))
        return status, d, u, fees, events


def expect_error(f, contains):
    try:
        f()
    except psycopg.Error as e:
        if contains not in str(e):
            raise AssertionError(f"expected {contains}, received: {str(e)[:300]}") from e
    else:
        raise AssertionError(f"expected {contains} but the operation succeeded")


def tests():
    job = create_job(1)
    key = uuid.uuid4()
    assert driver_rate(job, key) == job
    assert facts(job) == ("settled", 1, 0, 1, 1), facts(job)
    assert driver_rate(job, key) == job  # lost response retry
    customer_rate(job)
    assert facts(job) == ("settled", 1, 1, 1, 1), facts(job)
    print("PASS: driver first, customer later, one debit, idempotent retry")

    job = create_job(2)
    customer_rate(job)
    assert facts(job) == ("settled", 0, 1, 1, 1), facts(job)
    driver_rate(job)
    assert facts(job) == ("settled", 1, 1, 1, 1), facts(job)
    print("PASS: customer first, driver later, one debit")

    job = create_job(3)
    assert admin_close(job) == "settled"
    assert facts(job) == ("settled", 0, 0, 1, 1), facts(job)
    driver_rate(job)
    customer_rate(job)
    assert facts(job) == ("settled", 1, 1, 1, 1), facts(job)
    print("PASS: admin closes, both parties still rate, one debit")

    job = create_job(4)
    with connect(DRIVER) as c:
        expect_error(lambda: c.execute(
            "select status from public.finish_my_marketplace_job(%s,%s)",
            (job, uuid.uuid4())).fetchone(), "RATING_REQUIRED")
    with connect() as c:
        expect_error(lambda: c.execute(
            "select status from public.finish_marketplace_customer_job(%s,%s,%s,%s)",
            (SESSION, SESSION_TOKEN, job, uuid.uuid4())).fetchone(), "RATING_REQUIRED")
    with connect(DRIVER) as c:
        expect_error(lambda: c.execute(
            "select status from public.advance_my_marketplace_job(%s,'complete_service',%s)",
            (job, uuid.uuid4())).fetchone(), "RATING_REQUIRED")
    assert facts(job) == ("en_route", 0, 0, 0, 0), facts(job)
    print("PASS: legacy finish RPCs reject unrated closure")

    job = create_job(5, mode="trial_free")
    driver_rate(job)
    assert facts(job) == ("settled", 1, 0, 0, 1), facts(job)
    print("PASS: legitimate free trial closes without commission debit")

    job = create_job(6, deleted=True)
    expect_error(lambda: driver_rate(job), "ACCESS_DENIED")
    expect_error(lambda: customer_rate(job), "JOB_NOT_AVAILABLE")
    assert facts(job) == ("en_route", 0, 0, 0, 0), facts(job)
    print("PASS: deleted test job cannot create settlement")

    job = create_job(7)
    with connect() as c:
        balance = one(c,"select balance from public.wallets where project_id=%s and user_id=%s", (PROJECT, DRIVER))
        c.execute("update public.wallets set balance=0 where project_id=%s and user_id=%s", (PROJECT, DRIVER))
    expect_error(lambda: driver_rate(job), "INSUFFICIENT_MARKETPLACE_WALLET_BALANCE")
    assert facts(job) == ("en_route", 0, 0, 0, 0), facts(job)
    with connect() as c:
        c.execute("update public.wallets set balance=%s where project_id=%s and user_id=%s", (balance, PROJECT, DRIVER))
    print("PASS: failed settlement rolls back the rating")

    job = create_job(8)
    barrier = threading.Barrier(3)
    def race(fn):
        barrier.wait(timeout=15)
        return fn(job)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        fs = [executor.submit(race, f) for f in (driver_rate, customer_rate, admin_close)]
        for future in fs:
            future.result(timeout=30)
    assert facts(job) == ("settled", 1, 1, 1, 1), facts(job)
    print("PASS: three simultaneous closes serialize, settle once, preserve both ratings")

    with connect() as c:
        count = one(c, "select count(*) from public.wallet_transactions where transaction_type='commission'")
        total = one(c, "select coalesce(sum(-amount_delta),0) from public.wallet_transactions where transaction_type='commission'")
    assert count == 4, count  # jobs 1,2,3,8; free trial and rejected cases excluded
    assert total == 30, total
    print("PASS: final wallet ledger contains exactly four 7.50 debits")


if __name__ == "__main__":
    setup()
    tests()
    print("ISOLATED_MARKETPLACE_SETTLEMENT_SMOKE=PASS")
