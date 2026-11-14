# Local development on Windows

From a normal MSI PowerShell terminal (no administrator access):

```powershell
& 'D:\Projects\terra-scope-ai\scripts\start-local.ps1' -Mode Gemini
# Explicit offline fallback:
& 'D:\Projects\terra-scope-ai\scripts\start-local.ps1' -Mode Template
```

Stop only the server windows and descendants launched by the script:

```powershell
& 'D:\Projects\terra-scope-ai\scripts\start-local.ps1' -Stop
```

The script resolves all paths from its own location, uses `.venv\Scripts\python.exe`,
and opens separate backend/frontend PowerShell windows only when their ports are free.
It checks service identity and health, modules, API proxying, and repeated stability.
An occupied unhealthy/unrecognized port is reported without killing its process.
Repeated starts reuse healthy servers only when the backend provider matches the requested mode.
A provider mismatch restarts only a verified launcher-owned backend. Stop validates a unique launch token, script path,
PID and process creation time; it never searches for and terminates all Node/Python processes.
Launch state is stored in ignored `scripts/.local/servers.json`, without credentials.

Backend windows set `LLM_PROVIDER` from `-Mode` in their own process only (default: Gemini).
The `.env` file, Gemini key and the parent terminal's environment remain unchanged.
Optional global grid warm-up is disabled for local startup; grid maps compute normally
on first use. No algorithms or datasets are changed. Startup does not generate Gemini content.

The read-only `/api/v1/llm/status` reports the running provider, safe model ID and configuration
availability without credentials. An unmanaged backend is reused only when healthy and its provider
matches; otherwise the script asks you to stop it in its own terminal. Unmanaged servers are not stopped.

If Vite reports EPERM again, inspect the exact file's ownership and ACL before clearing
anything. MSI must retain inherited Modify on `web/node_modules/.vite-terrascope` and
`web/dist`. Do not delete either Python environment, remove node_modules, disable
antivirus, or run all tools as administrator. No execution-policy change is made.

Chat in Gemini Mode may incur API charges. Live tests were explicitly authorized for the repair.
For later smoke runs, the script requires an explicit billable-call flag:

```powershell
Set-Location 'D:\Projects\terra-scope-ai'
.\.venv\Scripts\python.exe backend/scripts/smoke_detective.py --mode gemini --approve-billable
# After starting -Mode Template:
.\.venv\Scripts\python.exe backend/scripts/smoke_detective.py --mode template
```

Each run performs seven chat requests through Vite, no retries, and stops at the first failed
assertion. The original Phase 3 `smoke_gemini.py` remains available for its narrower generation test.
