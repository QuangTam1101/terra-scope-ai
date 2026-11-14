# Runs every Terra-scope test layer and prints a summary.
#   powershell -ExecutionPolicy Bypass -File .\scripts\test-all.ps1                 # unit + build + live API + browser (servers must run)
#   powershell -ExecutionPolicy Bypass -File .\scripts\test-all.ps1 -Gemini         # also the billable Gemini checks (server in Gemini mode)
#   powershell -ExecutionPolicy Bypass -File .\scripts\test-all.ps1 -SkipLive       # only offline unit tests, typecheck and build
param([switch]$Gemini, [switch]$SkipLive)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$py = Join-Path $root '.venv\Scripts\python.exe'
$env:PYTHONUTF8 = '1'
if ($Gemini) { $env:TERRA_E2E_GEMINI = '1' } else { Remove-Item Env:TERRA_E2E_GEMINI -ErrorAction SilentlyContinue }
$results = [ordered]@{}

function Step($name, [scriptblock]$block) {
    Write-Host "`n==== $name ====" -ForegroundColor Cyan
    $t0 = Get-Date
    & $block
    $ok = ($LASTEXITCODE -eq 0)
    $results[$name] = '{0} ({1:n0} s)' -f ($(if ($ok) { 'PASS' } else { 'FAIL' })), ((Get-Date) - $t0).TotalSeconds
}

Push-Location $root
Step 'Backend unit tests (fake data)' { & $py -m pytest -q backend/tests -p no:cacheprovider }
Step 'Python dependencies' { & $py -m pip check }
Push-Location (Join-Path $root 'web')
Step 'Frontend typecheck' { npm run typecheck }
Step 'Frontend unit tests' { npm run test }
Step 'Frontend production build' { npm run build }
Pop-Location
if (-not $SkipLive) {
    Step 'Live API end-to-end (real NASA data)' { & $py -m pytest -q backend/tests_e2e -p no:cacheprovider }
    Push-Location (Join-Path $root 'web')
    Step 'Browser end-to-end (headless Chrome)' { npm run e2e }
    Pop-Location
}
Pop-Location

Write-Host "`n==== Summary ====" -ForegroundColor Cyan
$results.GetEnumerator() | ForEach-Object { '{0,-40} {1}' -f $_.Key, $_.Value }
if ($results.Values -match 'FAIL') { exit 1 } else { exit 0 }
