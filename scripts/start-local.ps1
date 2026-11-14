[CmdletBinding()]
param(
    [switch]$Stop,
    [ValidateSet('Gemini', 'Template')][string]$Mode = 'Gemini',
    [ValidateSet('Backend', 'Frontend')][string]$Server,
    [string]$LaunchId
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$scriptPath = Join-Path $repoRoot 'scripts\start-local.ps1'
$pythonPath = Join-Path $repoRoot '.venv\Scripts\python.exe'
$webRoot = Join-Path $repoRoot 'web'
$stateDirectory = Join-Path $PSScriptRoot '.local'
$statePath = Join-Path $stateDirectory 'servers.json'

# Child windows run only these fixed commands. No credentials are printed or saved.
if ($Server) {
    $parsedId = [guid]::Empty
    if ($Stop -or -not [guid]::TryParse($LaunchId, [ref]$parsedId)) { throw 'Invalid server launch arguments.' }
    $Host.UI.RawUI.WindowTitle = "TERRA-SCOPE $Server"
    if ($Server -eq 'Backend') {
        Set-Location -LiteralPath $repoRoot
        $env:LLM_PROVIDER = $Mode.ToLowerInvariant()
        # Grid warm-up is optional startup work; maps still compute on demand.
        $env:WARM_UP = '0'
        Write-Host "Backend provider: $env:LLM_PROVIDER; configuration loaded from backend/.env."
        & $pythonPath -m uvicorn backend.app.main:app --reload --reload-dir (Join-Path $repoRoot 'backend\app') --host 127.0.0.1 --port 8000
    } else {
        Set-Location -LiteralPath $webRoot
        & (Get-Command npm.cmd -ErrorAction Stop).Source run dev -- --host localhost --port 5173 --strictPort
    }
    Write-Host "Server exited with code $LASTEXITCODE. You may close this window."
    return
}

function Read-State {
    if (-not (Test-Path -LiteralPath $statePath)) { return @() }
    $saved = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if ($saved.repoRoot -ne $repoRoot) { throw 'Startup state belongs to another repository; no process was changed.' }
    return @($saved.servers | Where-Object { $null -ne $_ })
}

function Save-State($records) {
    if (-not (Test-Path -LiteralPath $stateDirectory)) { New-Item -ItemType Directory -Path $stateDirectory | Out-Null }
    @{ repoRoot = $repoRoot; servers = @($records | Where-Object { $null -ne $_ }) } | ConvertTo-Json -Depth 5 |
        Set-Content -LiteralPath $statePath -Encoding UTF8
}

function Get-OwnedWindow($record) {
    if ($record.service -notin @('Backend', 'Frontend') -or [int]$record.processId -le 0) { return $null }
    $parsed = [guid]::Empty
    if (-not [guid]::TryParse([string]$record.launchId, [ref]$parsed)) { return $null }
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$record.processId)" -ErrorAction Stop
    if ($null -eq $proc -or $proc.Name -ne 'powershell.exe') { return $null }
    if ($proc.CommandLine.IndexOf($scriptPath, [StringComparison]::OrdinalIgnoreCase) -lt 0 -or
        $proc.CommandLine.IndexOf([string]$record.launchId, [StringComparison]::OrdinalIgnoreCase) -lt 0) { return $null }
    if ($proc.ProcessId -eq $PID) { throw 'Refusing to stop the controller process.' }
    return $proc
}

function Stop-OwnedWindow($record) {
    $window = Get-OwnedWindow $record
    if ($null -eq $window) {
        Write-Host "$($record.service): tracked window is gone or its identity changed; no PID was stopped."
        return
    }
    $snapshot = @(Get-CimInstance Win32_Process)
    $tree = New-Object System.Collections.Generic.List[object]
    $tree.Add($window)
    for ($index = 0; $index -lt $tree.Count; $index++) {
        if ($tree.Count -gt 100) { throw 'Unexpected server process tree; refusing to stop it.' }
        $parent = $tree[$index]
        foreach ($child in $snapshot) {
            if ($child.ParentProcessId -eq $parent.ProcessId -and $child.CreationDate -ge $parent.CreationDate) { $tree.Add($child) }
        }
    }
    # Stop parents first so the uvicorn reloader cannot respawn a child during shutdown.
    foreach ($entry in $tree) {
        if ($entry.Name -eq 'Code.exe' -or $entry.ExecutablePath -like '*\WindowsApps\OpenAI.*') {
            throw 'Protected application detected; refusing to stop it.'
        }
    }
    foreach ($entry in $tree) {
        $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($entry.ProcessId)" -ErrorAction Stop
        if ($null -ne $current -and $current.CreationDate -eq $entry.CreationDate) {
            Stop-Process -Id $entry.ProcessId -ErrorAction SilentlyContinue
        }
    }
    Write-Host "$($record.service): stopped only the launcher and its server descendants."
}

function Get-LocalText([string]$url) {
    $request = [Net.HttpWebRequest]::Create($url)
    $request.Proxy = $null
    $request.Timeout = 5000
    $response = $null
    try {
        $response = $request.GetResponse()
        if ([int]$response.StatusCode -ne 200) { return $null }
        $reader = New-Object IO.StreamReader($response.GetResponseStream())
        try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
    } catch { return $null } finally { if ($null -ne $response) { $response.Dispose() } }
}

function Test-Service([string]$name) {
    try {
        if ($name -eq 'Backend') {
            $health = Get-LocalText 'http://127.0.0.1:8000/api/v1/health'
            $schema = Get-LocalText 'http://127.0.0.1:8000/openapi.json'
            return $health -and $schema -and (($health | ConvertFrom-Json).status -eq 'ok') -and
                (($schema | ConvertFrom-Json).info.title -eq 'Terra-scope AI API')
        }
        $html = Get-LocalText 'http://localhost:5173/'
        $client = Get-LocalText 'http://localhost:5173/@vite/client'
        return $html -and $client -and ($html -match '<title>Terra-scope AI</title>')
    } catch { return $false }
}

function Get-PortListeners([int]$port) {
    return @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

function Test-OwnedListener($record, [int]$port) {
    $window = Get-OwnedWindow $record
    if ($null -eq $window) { return $false }
    $listeners = @(Get-PortListeners $port)
    if ($listeners.Count -eq 0) { return $false }
    $snapshot = @(Get-CimInstance Win32_Process)
    foreach ($listener in $listeners) {
        $cursor = [int]$listener.OwningProcess
        $owned = $false
        foreach ($depth in 1..16) {
            if ($cursor -eq $window.ProcessId) { $owned = $true; break }
            $proc = $snapshot | Where-Object { $_.ProcessId -eq $cursor } | Select-Object -First 1
            if ($null -eq $proc -or $proc.CreationDate -lt $window.CreationDate) { break }
            $cursor = [int]$proc.ParentProcessId
        }
        if (-not $owned) { return $false }
    }
    return $true
}

$mutexName = 'Local\TerraScopeLocal_' + ([BitConverter]::ToString(
    [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($repoRoot))).Replace('-', '').Substring(0, 16))
$mutex = New-Object Threading.Mutex($false, $mutexName)
$acquired = $false
try {
    try { $acquired = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { throw 'Another local start/stop operation is running.' }
    $records = @(Read-State)
    if ($Stop) {
        foreach ($record in $records) { Stop-OwnedWindow $record }
        Save-State @()
        Write-Host 'Untracked/reused servers and unrelated applications were left running.'
        return
    }
    if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Missing .venv\Scripts\python.exe. Neither Python environment was changed.' }
    if (-not (Test-Path -LiteralPath (Join-Path $webRoot 'node_modules\vite\bin\vite.js'))) { throw 'Frontend dependencies are missing. Run npm ci in web after inspecting the dependency files.' }
    $powershellPath = Join-Path $PSHOME 'powershell.exe'
    foreach ($service in @(@{ name = 'Backend'; port = 8000 }, @{ name = 'Frontend'; port = 5173 })) {
        $name = $service.name
        if (@(Get-PortListeners $service.port).Count -gt 0) {
            if (-not (Test-Service $name)) { throw "Port $($service.port) is occupied by an unhealthy or different service. Nothing was stopped." }
            $restart = $false
            if ($name -eq 'Backend') {
                $actual = Get-LocalText 'http://127.0.0.1:8000/api/v1/llm/status'
                $provider = if ($actual) { ($actual | ConvertFrom-Json).provider } else { 'unknown' }
                if ($provider -ne $Mode.ToLowerInvariant()) {
                    $owned = @($records | Where-Object { $_.service -eq 'Backend' })
                    if ($owned.Count -ne 1 -or -not (Test-OwnedListener $owned[0] 8000)) { throw "Backend provider is $provider; requested $Mode. Stop the unmanaged backend in its own terminal. No process was stopped." }
                    Stop-OwnedWindow $owned[0]
                    $deadline = [DateTime]::UtcNow.AddSeconds(15)
                    while (@(Get-PortListeners 8000).Count -gt 0) {
                        if ([DateTime]::UtcNow -ge $deadline) { throw 'Backend port did not close; no additional process was stopped.' }
                        Start-Sleep -Milliseconds 300
                    }
                    $restart = $true
                }
            }
            if (-not $restart) {
                Write-Host "$name is healthy on port $($service.port); reusing it without starting a duplicate."
                continue
            }
        }
        foreach ($old in @($records | Where-Object { $_.service -eq $name })) { Stop-OwnedWindow $old }
        $records = @($records | Where-Object { $_.service -ne $name })
        $token = [guid]::NewGuid().ToString('N')
        $arguments = @('-NoLogo', '-NoProfile', '-NoExit', '-File', ('"' + $scriptPath + '"'), '-Server', $name, '-LaunchId', $token, '-Mode', $Mode)
        $started = Start-Process -FilePath $powershellPath -ArgumentList $arguments -WorkingDirectory $repoRoot -WindowStyle Normal -PassThru
        $records += [pscustomobject]@{ service = $name; processId = $started.Id; launchId = $token; mode = $(if ($name -eq 'Backend') { $Mode.ToLowerInvariant() } else { 'vite' }) }
        Save-State $records
        $deadline = [DateTime]::UtcNow.AddSeconds(60)
        while (-not (Test-Service $name)) {
            if ([DateTime]::UtcNow -ge $deadline -or $started.HasExited) { throw "$name did not become healthy. Inspect its server window; use -Stop to clean up only tracked servers." }
            Start-Sleep -Seconds 1
        }
        Write-Host "$name started and is healthy."
    }
    # Check more than the initial response, including actual module loading and proxying.
    foreach ($pass in 1..3) {
        foreach ($url in @('http://127.0.0.1:8000/docs', 'http://127.0.0.1:8000/api/v1/variables',
            'http://127.0.0.1:8000/api/v1/regions', 'http://localhost:5173/src/main.tsx',
            'http://localhost:5173/api/v1/health')) {
            if (-not (Get-LocalText $url)) { throw "Stability check failed: $url" }
        }
        if (-not (Test-Service 'Backend') -or -not (Test-Service 'Frontend')) { throw 'A server became unhealthy after startup.' }
        if ($pass -lt 3) { Start-Sleep -Seconds 2 }
    }
    $actual = Get-LocalText 'http://127.0.0.1:8000/api/v1/llm/status' | ConvertFrom-Json
    if ($actual.provider -ne $Mode.ToLowerInvariant()) { throw 'Running backend does not match the requested mode.' }
    Write-Host "Actual backend provider: $($actual.provider); model: $($actual.model); configured: $($actual.configured)."
    Write-Host 'Startup performs no Gemini generation. Chat requests in Gemini Mode may incur charges.'
    Write-Host 'Frontend: http://localhost:5173/'
    Write-Host 'Backend:  http://127.0.0.1:8000/docs'
    Write-Host 'Health:   http://127.0.0.1:8000/api/v1/health'
    Write-Host ('Stop only managed servers: & "' + $scriptPath + '" -Stop')
} finally {
    if ($acquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
