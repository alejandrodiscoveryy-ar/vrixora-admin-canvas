from pathlib import Path

migrations = list(Path('supabase/migrations').glob('*_marketplace_customer_cancel_pretrip_reason_guard.sql'))
assert len(migrations) == 1, f'Migrations found: {migrations}'
s = migrations[0].read_text(encoding='utf-8')
assert "('en_route','pickup','in_progress','completed','settled','incident')" in s
assert "('in_progress','completed','settled','incident')" in s
assert 'CUSTOMER_CANCELLATION_REASON_REQUIRED_AFTER_ASSIGNMENT' in s
assert "reason = 'Cancelación antes de asignar conductor'" in s
assert 'j.assigned_driver_user_id is not null' in s
assert 'j.assigned_vehicle_id is not null' in s
assert 'CUSTOMER_CANCEL_BLOCKING_POLICY_CHANGED' in s
assert 'CUSTOMER_CANCEL_OWNERSHIP_POLICY_CHANGED' in s
assert 'execute definition;' in s
assert "to_regprocedure('public.cancel_marketplace_customer_job" in s
assert 'grant execute' not in s.lower()
print('CUSTOMER_CANCEL_PRETRIP_STATIC=OK; REMOTE_DATABASE_UNMODIFIED')
