
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ops = readFileSync(
  'src/features/admin/MarketplaceSection.tsx', 'utf8'
);

test('cancelacion restringida a carreras asistidas', () => {
  assert.match(ops, /admin_list_assisted_job_ids/);
  assert.match(ops, /admin_cancel_assisted_marketplace_job/);
  assert.match(ops, /assistedJobIds\.data\?\.has\(job\.jobId\)/);
  assert.match(ops, /target_expected_status: assistedCancel\.status/);
  assert.match(ops, /Cancelar por solicitud del cliente/);
  assert.match(ops, /assistedCancelReason\.trim\(\)\.length < 8/);
  assert.match(ops, /window\.confirm/);
  assert.match(ops, /marketplace-wallets/);
});
