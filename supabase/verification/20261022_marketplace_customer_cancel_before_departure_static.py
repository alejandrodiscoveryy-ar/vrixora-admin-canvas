from pathlib import Path

p = Path("supabase/migrations/20261022175058_marketplace_customer_cancel_before_departure_20261022.sql")
s = p.read_text(encoding="utf-8")
assert "CUSTOMER_CANCEL_FUNCTION_MISSING" in s
assert "CUSTOMER_CANCEL_EXPECTED_FRAGMENT_MISSING_OR_DUPLICATED" in s
assert "'en_route','pickup','in_progress'" in s
assert "CUSTOMER_CANCELLATION_REQUIRES_SUPPORT" in s
assert "execute replace(definition, old_fragment, new_fragment)" in s
assert "to_regprocedure('public.cancel_marketplace_customer_job" in s
assert 'public.cancel_marketplace_customer_job' in s
print('BACKEND_STATIC_POLICY=OK; REMOTE_DB_NOT_TESTED')
