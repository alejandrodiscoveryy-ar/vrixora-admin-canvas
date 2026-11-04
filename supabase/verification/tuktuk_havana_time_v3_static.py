"""Control estatico sin conectarse a produccion para el parche horario V3."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
files = list((root / 'supabase' / 'migrations').glob('*_tuktuk_havana_official_time_v3.sql'))
assert len(files) == 1, f'Se esperaba exactamente una migracion V3, recibidas: {files}'
sql = files[0].read_text(encoding='utf-8').lower()
for required in (
    '2026-11-01 04:00:00+00',
    '2027-11-07 05:00:00+00',
    'app_private.marketplace_havana_official_time',
    'calculate_marketplace_customer_quote_smart_v1',
    'local_effective := timezone(cfg.timezone,effective_at);',
    'raise exception',
):
    assert required in sql, f'Falta control {required}'
assert re.search(r'revoke all on function\s+app_private\.marketplace_havana_official_time', sql)
print('HORA_CUBA_SQL_STATIC=OK')
