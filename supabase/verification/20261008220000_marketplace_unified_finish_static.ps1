# Read-only source checks. Does not connect to or execute SQL on any database.
$ErrorActionPreference = 'Stop'
$migration = Join-Path $PSScriptRoot '../migrations/20261008220000_marketplace_unified_finish.sql'
$sql = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $migration))
function Assert-Source($condition, $message) {
  if (-not $condition) { throw $message }
  Write-Output "PASS: $message"
}
foreach ($actor in @('driver', 'customer', 'admin')) {
  Assert-Source ($sql -match "target_job_id,'$actor',") "$actor delegates to the shared settlement core"
}
Assert-Source ($sql -match 'where project_id=pid and id=target_job_id for update') 'Settlement locks the job'
$replayIndex = $sql.IndexOf("if j.status='settled' then return j;")
$chargeIndex = $sql.IndexOf('insert into public.wallet_transactions(')
Assert-Source ($replayIndex -ge 0 -and $chargeIndex -gt $replayIndex) 'Settled replay returns before charging'
Assert-Source ([regex]::Matches($sql, 'insert into public.wallet_transactions\(').Count -eq 1) 'Only one commission insertion site'
Assert-Source ($sql -match 'a.vehicle_id is distinct from j.assigned_vehicle_id') 'Assignment vehicle is validated'
Assert-Source ($sql -match 'if j.test_deleted_at is not null then\s+raise exception') 'Deleted test ride cannot be finished'
Assert-Source ($sql -match 'other.id<>j.id\s+and other.test_deleted_at is null') 'Deleted test rides do not block restored availability'
Assert-Source ($sql -notmatch '60 seconds|FINISH_TOO_EARLY|scheduled_at') 'No arbitrary finish delay'
Assert-Source ($sql -match "other.status='incident' and ir.id is null") 'Unresolved incidents still block availability'
Write-Output 'Static checks only: transaction behavior and concurrency require an isolated database review.'
Assert-Source ($sql -match "'is_test',j.is_test") 'Recovery reads the test flag from jobs'
Assert-Source ($sql -match 'j.assigned_driver_user_id=actor' -and $sql -match 'a.driver_user_id=actor') 'Recovery scopes both job and assignment to authenticated driver'
Assert-Source ($sql -match 'order by j.updated_at,j.id' -and $sql -match 'target_after_updated_at,target_after_job_id') 'Recovery uses a stable update cursor for late settlements'
Assert-Source ($sql -match 'limit least\(greatest\(coalesce\(target_limit,50\),1\),50\)') 'Recovery page is capped at 50'
Assert-Source ($sql -match 'v.id=a.vehicle_id') 'Recovery uses the shared Marketplace and Control vehicle identity'

foreach ($rpc in @('create_my_marketplace_customer_rating', 'create_marketplace_customer_rating')) {
  $body = [regex]::Match($sql, "(?s)create or replace function public\.$rpc\(.*?\$\$;").Value
  Assert-Source ($body.Length -gt 0) "$rpc keeps the published RPC contract"
  $insert = $body.IndexOf('insert into public.marketplace_')
  $finish = $body.IndexOf('perform app_private.finish_marketplace_job_core(')
  Assert-Source ($insert -ge 0 -and $finish -gt $insert) "$rpc persists rating before shared settlement in the same transaction"
  Assert-Source ($body -match 'for update' -and $body.IndexOf('for update') -lt $insert) "$rpc locks the job before rating or settlement"
  Assert-Source ($body -notmatch 'exception\s+when') "$rpc does not swallow settlement failures (rating rolls back)"
  Assert-Source ($body -match "'en_route','pickup','in_progress','settled'") "$rpc permits first rating and pending rating after another actor closes"
  Assert-Source ($body -match 'target_stars is null or target_stars not between 1 and 5') "$rpc rejects null and invalid stars"
  Assert-Source ($body -match 'test_deleted_at is null|test_deleted_at is not null') "$rpc rejects deleted test jobs even on replay"
}
Assert-Source ([regex]::Matches($sql, "raise exception 'RATING_REQUIRED'").Count -eq 2) 'Both participant finish RPCs require a persisted actor rating'
$legacy = [regex]::Match($sql, '(?s)create or replace function public.advance_my_marketplace_job\(.*?\$function\$;').Value
Assert-Source ($legacy -match "target_action='complete_service'" -and $legacy -match 'return app_private.finish_marketplace_job_core' -and $legacy -notmatch 'wallet_transactions') 'Legacy complete_service cannot independently charge or bypass rating'
Assert-Source ($sql -match "target_actor_kind='admin' and clean_reason is null" -and $sql -match "require_project_permission\(pid,'payments.manage'\)") 'Admin exception requires a reason and both permissions'
Assert-Source ($sql -match "original_status,'completed','finish_service',target_actor_kind" -and $sql -match 'target_idempotency_key,clean_reason') 'Unified close writes actor and reason to audit events'
Assert-Source ($sql -match 'r.customer_id=cid and j.test_deleted_at is null' -and $sql -match 'public.list_marketplace_customer_history') 'Customer history is session-owned and excludes deleted test rides'
