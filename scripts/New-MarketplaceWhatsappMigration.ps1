# Generate the actual migration with the installed Supabase CLI; no remote database changes.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root
try {
    $Name = 'marketplace_admin_whatsapp_payload'
    $Existing = @(Get-ChildItem "supabase/migrations/*_${Name}.sql" -ErrorAction SilentlyContinue)
    if ($Existing.Count -gt 0) { throw "A migration already exists. Review it instead of generating a duplicate." }
    $Cli = Get-Command supabase -ErrorAction Stop
    & $Cli.Source migration new --help | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Supabase CLI migration command not available." }
    & $Cli.Source migration new $Name
    if ($LASTEXITCODE -ne 0) { throw "Migration creation failed." }
    $New = @(Get-ChildItem "supabase/migrations/*_${Name}.sql")
    if ($New.Count -ne 1) { throw "Expected exactly one generated migration." }
    [System.IO.File]::WriteAllText($New[0].FullName, [System.IO.File]::ReadAllText((Join-Path $Root 'supabase/proposals/marketplace_admin_whatsapp_payload.sql')), [System.Text.UTF8Encoding]::new($false))
    Write-Output "Created $($New[0].Name). Review and test against an isolated database before any deployment."
} finally { Pop-Location }
