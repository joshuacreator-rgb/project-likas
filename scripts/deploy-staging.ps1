<#
.SYNOPSIS
  Deploys to Railway staging and refuses to call it a success without evidence.

.DESCRIPTION
  A Railway deploy can report success while the container serves yesterday's
  bundle, because the HTML shell is byte-identical across builds. This script
  therefore treats "deployed" and "verified" as separate facts, and only prints
  PASS when the smoke gate has run against the live origin afterwards.

  It deliberately does not run migrations. `railway up` does not run them either,
  so a schema change shipped without its migration is a live failure mode. This
  script will say so rather than imply the deploy is complete.

.EXAMPLE
  pwsh scripts/deploy-staging.ps1
  pwsh scripts/deploy-staging.ps1 -SkipPush
#>
[CmdletBinding()]
param(
  [string]$Environment = "staging",
  [string]$Service = "comfortable-youth",
  [switch]$SkipPush
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

function Write-Step($message) { Write-Host "`n==> $message" -ForegroundColor Cyan }
function Write-Ok($message)    { Write-Host "    OK   $message" -ForegroundColor Green }
function Write-Bad($message)    { Write-Host "    FAIL $message" -ForegroundColor Red }

$branch = "staging"
$expected = (git rev-parse --short HEAD).Trim()

Write-Step "Repository state"
$dirty = git status --porcelain
if ($dirty) {
  Write-Bad "Working tree has uncommitted changes. Staging is a client-facing environment; commit first."
  $dirty | ForEach-Object { Write-Host "      $_" }
  exit 1
}
$behind = (git rev-list --left-right --count "origin/$branch...HEAD")
Write-Ok "clean tree at $expected, $behind ahead/behind origin/$branch"

if (-not $SkipPush) {
  Write-Step "Pushing to origin/$branch"
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { Write-Bad "push failed"; exit 1 }
  Write-Ok "pushed"
}

Write-Step "Deploying to $Environment/$Service"
railway up --service $Service --environment $Environment
if ($LASTEXITCODE -ne 0) { Write-Bad "railway up failed"; exit 1 }

Write-Step "Waiting for the build to leave BUILDING"
# Polled rather than slept through, because a failed build should stop us here
# instead of after a smoke run that fails for an unrelated-looking reason.
$deadline = (Get-Date).AddMinutes(12)
$state = "UNKNOWN"
while ((Get-Date) -lt $deadline) {
  $line = railway deployment list 2>$null | Select-Object -First 2 | Select-Object -Last 1
  if ($line -match "\|\s*(SUCCESS|FAILED|CRASHED|REMOVED|BUILDING)\s*\|") { $state = $matches[1] }
  if ($state -ne "BUILDING" -and $state -ne "UNKNOWN") { break }
  Write-Host "    still $state"
  Start-Sleep -Seconds 15
}

if ($state -ne "SUCCESS") {
  Write-Bad "build ended in $state, not SUCCESS. Not verifying a deploy that did not land."
  exit 1
}
Write-Ok "build SUCCESS"

Write-Step "Smoke gate against the live origin"
node scripts/smoke-staging.mjs
$smoke = $LASTEXITCODE

Write-Step "Result"
if ($smoke -ne 0) {
  Write-Bad "deployed $expected but the smoke gate failed."
  Write-Host "    The container is live but is not serving the code that was pushed."
  Write-Host "    Do not demonstrate or announce this deploy until it is understood."
  exit 1
}
Write-Ok "deployed and verified $expected"

Write-Host ""
Write-Host "Migrations: NOT run by this script and NOT run by railway up." -ForegroundColor Yellow
Write-Host "If this commit changed drizzle/schema.ts, the deploy is incomplete until" -ForegroundColor Yellow
Write-Host "drizzle-kit migrate has been run inside the container. Check git show --stat:" -ForegroundColor Yellow
git --no-pager show --stat --oneline $expected | Select-Object -First 15