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
