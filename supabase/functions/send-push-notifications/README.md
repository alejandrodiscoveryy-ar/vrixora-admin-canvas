# Hardened push dispatcher

The 2026-10-11 development branch reconciles the operative Supabase v16 before
adding Cliente. Vrixora Admin owns the shared contract and future SQL activation.
No deployment, migration, new cron or real push was authorized in this task.
The historical production instructions below are not an activation checklist
for this integration; review Admin's current audit package first.

This endpoint is private service-to-service infrastructure. It intentionally
uses `verify_jwt = false` because pg_cron calls it with a dedicated non-JWT
secret. The handler rejects every request whose
`x-tuktuk-dispatch-secret` header does not match
`TUKTUK_PUSH_DISPATCH_SECRET`.

## Propiedad y activación

Vrixora Admin mantiene este código y su configuración. Sustituye únicamente
el bundle del servicio existente en una futura activación autorizada.
Conductor y su commit local 79919fd permanecen aislados y sin modificaciones.
Se reutiliza el cron existente de cinco minutos; no aplicar migraciones históricas.

Never put the secret value in Git, Flutter, SQL literals, logs, test fixtures,
or a command line recorded in shell history.

## Defaults and bounds

- `limit`: 100, allowed 1..500
- `max_batches`: 10, allowed 1..20
- `concurrency`: 8, allowed 1..20
- `time_budget_ms`: 45000, allowed 1000..50000
- maximum attempts: 5
- processing lease: 300 seconds

Temporary failures are returned to `pending` with exponential backoff. Invalid
FCM tokens are disabled. Permanent failures and exhausted retries remain in
the outbox for audit. A guarded `claim_id` prevents an overlapping worker from
finalizing another worker's lease.

## Shared Cliente queue, prepared only

All six v16 events remain, including new_subscription. Its default audience is
admin; other kinds default to client. Explicit admin/client audience and platform
filters remain, including app_scope. core.ts is functionally identical to v16.

Conductor is processed first with the original limits and time budget. A single
bounded Cliente claim uses only the remaining budget (up to six concurrent sends,
at most 100 claims). Both queues share Google OAuth, Firebase and sendFcm.
Cliente database failures cannot fail completed Conductor work.
Before sending, check claim_uuid, lease, enablement, expiry and unchanged token.
Completion is conditional on the same claim; invalid tokens cannot disable a
replacement token. Use bounded retries and category-only persisted errors.

Only registration lives in Cliente's new marketplace-customer-push-registration.
Anonymous devices never create auth.users or records in notification_outbox or
push_device_tokens. The existing private authentication and verify_jwt=false
remain. Admin is the canonical maintenance location; Conductor remains unchanged.

Local mock tests, without network permission:

```powershell
deno test --config deno.test.json --allow-env=FIREBASE_SERVICE_ACCOUNT_JSON,TUKTUK_PUSH_DISPATCH_SECRET core_test.ts customer_test.ts dispatcher_test.ts
```

Run from this directory. deno.test.json maps the Supabase wrapper to a local
test double only; do not use that config for bundling/deployment. The test RSA
account, OAuth response, device tokens and dispatch secret are synthetic.
Real entrypoints are checked separately with the pinned npm dependency.

Delivery is at least once: an FCM success followed by an unrecorded database
completion can be retried. A lease is not a guarantee of visible reception.
In-flight FCM requests cannot be canceled by a subsequent opt-out. Preserve
the recovered operative v16 snapshot for rollback; old GitHub main is unsafe.
