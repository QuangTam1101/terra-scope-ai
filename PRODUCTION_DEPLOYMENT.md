# TERRA-SCOPE AI — production deployment status

Updated: 15/11/2026 (Asia/Singapore). **Linux production container validated; public deployment blocked by account/billing decisions.** No public application or API URL has been created. Do not interpret this document as a successful public launch.

## Verified release and Linux container

- Source commit: `f406100c293578f898a3a950a739b30727d7d1c3` on `main`.
- [Successful validation run](https://github.com/QuangTam1101/terra-scope-ai/actions/runs/43693733242), workflow `Build verified Forecast backend image`, `publish=false`.
- The earlier run failed only while copying its completed JSON report out of tmpfs. The reviewed fix uses `docker exec terra-api cat /tmp/linux-forecast.json > validation-reports/linux-forecast.json`.
- The new run passed model retrieval, checksum verification, Linux dependency installation/`pip check`, offline artifact gate, production startup, real HTTP smoke and report upload.
- Repo visibility checked through unauthenticated GitHub API: **PUBLIC**. Release `Forecast models v1`, tag `forecast-models-v1`, is accessible without authentication. Provenance remains the owner-approved repository/release; public access does not replace verification.
- Ten models verified against pinned manifest SHA256 `def7b92323142bceeca5491622a311b631e1acbaf59bd49e35684113fe8b7985` before deserialization. The models and downloaded manifest remain Git-ignored.
- Artifact `linux-validation-reports` downloaded to local ignored `scripts/.local/linux-validation-43693733242/`. A concise, non-secret evidence copy is in `docs/LINUX_DEPLOYMENT_VERIFICATION.json`.

| Measurement | Verified Linux result |
|---|---|
| Image size, uncompressed | 759,937,372 bytes / 724.733 MiB |
| Validation resource limit | 2 CPU, 4 GiB RAM, swap disabled beyond that limit |
| Peak cgroup memory | 4,040,663,040 bytes / 3.763 GiB (94.1% of limit) |
| OOM/crash | No OOM; container still running when evidence collected |
| Regional inference, 10 cases | About 2.86–4.14 seconds per request |
| Forecast maps, 10 cases | About 0.88–3.49 seconds per request |
| Dataset origins | Satellite 2024-12; Outlook climate indices 2026-06 |
| Python scientific compatibility | scikit-learn 1.9.1, joblib 1.6.0, netCDF4 1.7.5.1.post1, xarray 2026.9.0 |

Memory includes the server, in-container smoke client and filesystem/page caches; it is not FastAPI RSS alone. Workload was sequential. Global Forecast maps passed; NASA statistical grids were bounded to a small real-data bbox. This does not establish global analytical-grid latency, concurrent-user capacity, restart reliability on a cloud host or an uptime SLA. Do not provision production at 4 GB solely because the 4 GiB test survived.

## Architecture and service specification

Frontend: **Vercel**, React/Vite static deployment. Backend: **always-on Linux container**, preferably a managed service if budget permits. NASA cubes and the ten trusted ML artifacts are immutable image contents. Grid cache is writable and regenerable; no database is required by the current app.

| Service | Configuration | Actual deployment status |
|---|---|---|
| Frontend | Vite; Git main; Root `web`; Node 22.x; install `npm ci`; build `npm run build`; output `dist` | Project settings drafted locally; no project/deployment created |
| FastAPI proposal | Render Web Service `2c-8g`, 2 CPU / 8 GB RAM, one instance, one worker, no paid disk/add-on | Awaiting explicit paid-plan approval and authenticated account access |
| Runtime | Production uvicorn CMD in `backend/Dockerfile`, bind `0.0.0.0:$PORT`, no reload/debug; BLAS/OpenMP 1 thread | Verified in Linux container |
| Health | `/api/v1/health` | Passed in Linux; no public endpoint yet |
| Cache | `/app/backend/.cache/grids`, writable by user `app`; temporary cache acceptable | Writable tmpfs passed in Linux |
| API routing | Public HTTPS backend origin through `VITE_API_BASE_URL`; exact-origin CORS | Waiting for actual domains |
| Registry image | Candidate built and tested in CI; not pushed to any registry | Publication is still pending |

The existing validation workflow intentionally blocks `publish=true`. Do not bypass that guard. After selecting an approved host, use a separately reviewed image publication step/workflow that builds and validates the exact source and records its image digest. For Render image-backed deployment, supply that published digest, not the local-only candidate tag. Importing the Git repository into Render directly currently lacks the ignored model files; its build must receive verified release assets before the Docker gate. Neither method has been represented as already deployed.

## Cost comparison and approval boundary

Prices checked against official pages on 15/11/2026; tax, overages and optional services are additional.

| Candidate | Monthly compute estimate | Operational tradeoff |
|---|---|---|
| Render `2c-8g`, 2 CPU / 8 GB | **135 USD/month** | Managed HTTPS, deployment and logs; simplest managed choice |
| DigitalOcean Basic Regular, 4 vCPU / 8 GiB / 160 GiB SSD | **48 USD/month** | Lower cost, shared CPU; requires VM patching, firewall, Docker service, reverse proxy/TLS, monitoring and backups |

Sources: [Render pricing](https://render.com/pricing), [DigitalOcean Droplets](https://www.digitalocean.com/pricing/droplets). Neither provider is provisioned or approved for payment. Persistent cache disk is optional; do not add one by default. No assumption of free 8 GB hosting has been made.

Vercel CLI authentication succeeds. The available workspace reports **Pro**, not Hobby. Its existing subscription and included usage must not be called a free deployment allowance. [Vercel pricing](https://vercel.com/pricing) lists Pro from 20 USD/month plus applicable usage; no plan change or charge was accepted. Before deploying there, the owner must confirm use/cost controls for that workspace or log in to an authorized Hobby workspace. No unrelated project was modified.

## Credentials and environment names

Set secrets in backend host settings only. Never put credentials in Vite variables, Git, Docker layers, image build args, public logs, or this document. The local backend key exists; it has not been printed, uploaded or used for a live Gemini request in this deployment stage.

- Vercel: `VITE_API_BASE_URL` (public HTTPS origin, without path or trailing slash). Missing/invalid origin fails hosted builds intentionally.
- Backend: `CORS_ORIGINS` (exact frontend HTTPS origins), `LLM_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`.
- Limits: `LLM_TIMEOUT_SECONDS`, `LLM_MAX_OUTPUT_TOKENS`, `LLM_REQUESTS_PER_MINUTE`, `AGENT_MAX_TOOL_CALLS`, `AGENT_MAX_STEPS`, `AGENT_TIMEOUT_SECONDS`, `AGENT_MAX_EVIDENCE_BYTES`.
- Process/data: host-provided `PORT`, `WARM_UP=0` initially, `GRID_CACHE_DIR` if overriding the Docker default. Optional `PIPELINE_DIR`, `CUBE_DIR`, `GRID_V2_DIR`, `GRID_V2` only when matching assets are actually provisioned.

Confirm Gemini model availability and quota in the owner's project. A configured key or model string does not verify a live response. Template Mode must remain usable if Gemini is unavailable.

## Account/tool blockers and exact resumption steps

1. **Billing decision**: approve a specific backend provider/plan or request the lower-cost option. Render proposal is 135 USD/month compute, one instance, no disk/add-on, plus applicable tax/usage. No service creation should accept a recurring fee before this approval.
2. **Backend account access**: no Render CLI/API authentication was found in the inspected configuration/environment. The owner must sign in at https://dashboard.render.com/ or enable an approved terminal/API route. Do not paste passwords, MFA codes or API keys into chat. If using an API credential, store it locally in an ignored deployment environment file/process variable and share only that setup is complete.
3. **Vercel workspace decision**: approve the existing Pro workspace under explicit cost controls, or sign in to Hobby with `npm exec --yes --package=vercel -- vercel login`. No need to paste a Vercel token into chat.
4. **Browser tool limit**: browser host was unavailable; native Chrome control stopped because the tool could not reliably determine the current URL for policy enforcement. No further app inputs were attempted. Browser login/MFA and public browser E2E need user handoff or working browser access. CLI/API tasks can continue independently.
5. With account/budget resolved: publish the validated image via reviewed CI, create backend, set health/env, verify HTTPS/API, create/link Vercel project, set real API origin, connect Git main, deploy, set exact CORS origins and run the public checklist below.

Vercel draft settings are in ignored `scripts/.local/vercel-project-setup.json`. Backend secrets are deliberately absent. Project creation and Git connection must be verified against the selected account/workspace, not guessed from a prospective project name.

## Redeploy and rollback

Frontend: GitHub integration production branch `main`; reviewed pushes trigger Vercel production builds once the connection is configured. Changing `VITE_API_BASE_URL` requires a new build. Read Vercel Build Logs and inspect actual frontend network requests after deploy.

Backend: preserve the exact validated commit, resolved Linux package list, model manifest and image digest. Publish a tested image, update the host's digest and deploy deliberately. A Git push alone does not update a prebuilt-image Render service. Review dependency/base-image drift before rebuilding; versions currently use ranges and the Python base tag is not digest-pinned.

Rollback frontend by promoting the last verified Vercel deployment; rollback backend by redeploying the last verified image digest with compatible env and immutable data. Keep previous image availability. Do not force-push or rewrite Git history. Regenerable cache can be rebuilt after rollback; do not mount empty storage over cube/model directories.

## Security, performance and monitoring gates

- Gitleaks 8.30.1, official binary checksum verified, scanned all local Git refs (29 commits at scan time), ~4.24 MB of relevant history: **no leaks found** by its rules. Exact configured-key and common-token checks on deployment candidates also found none. This is evidence, not a guarantee against every secret format or external fork/cached copy.
- Real `.env` files, model binaries, downloaded checksums, local logs and CLI tools are ignored. Docker context is default-deny with exact production asset exceptions and final secret/cache exclusions. Validated image does not receive backend secrets during CI.
- API model selection uses server catalog IDs; there is no API upload of arbitrary pickle/model path. Deserialization is of owner-approved, checksum-verified assets. LLM tools are bounded backend operations; source inspection did not find eval/exec/subprocess request execution in backend app code.
- Runtime is non-root, no reload/debug; Linux test used read-only filesystem and no outbound network. Production must permit only required outbound services such as Gemini. Runtime data/model download is unnecessary once the image is built.
- Concurrency is bounded to eight uvicorn connections/tasks; one worker avoids multiplying model/state memory. LLM budget limits calls per process and two in-flight AI requests. These controls do not replace ingress/IP limits for public heavy endpoints or shared quotas across replicas. Provider/WAF controls and load validation remain pre-public-traffic gates.
- CORS must contain only selected production/preview origins. CORS is not authentication or protection against scripted API clients. No admin mutation endpoints were found among current app routes; `/docs` is API documentation, not proof of service readiness.
- Monitor health and feature probes, restarts/OOM, peak memory, CPU, latency, 429/503/5xx, AI fallback categories, rate limits and spend. Do not log keys, authorization headers, credential-bearing URLs, env dumps or raw private prompts.
- Full global statistical-grid cold/warm behavior, overlapping users, cache prewarming, cloud restart, and host HTTPS are still unverified. Keep warm-up disabled until measured. Maintain memory headroom and bound ingress before public load.
- Forecast skill is variable and precipitation skill is limited; confidence/intervals and limitations must stay visible. Hazard screening is not an official warning. Do not change models or statistics to improve a demo verdict.

## Public end-to-end test matrix

No public service exists yet; all production/browser results below are **NOT RUN**, not PASS.

| Feature | Linux/API evidence | Public browser result |
|---|---|---|
| Landing, Get Started, navigation | Frontend local build/tests previously passed | NOT RUN |
| Explorer/Scientist, switching, tutorials/replay | Local frontend tests previously passed | NOT RUN |
| NASA datasets/variables and regional series/trends | PASS: real GPM, GLDAS, MERRA-2 | NOT RUN |
| Global statistical maps and time-lapse | Only bounded scientific-grid smoke here | NOT RUN |
| Mekong reference | PASS: n=288, slope=3.163604736328125, p=0.11031644898805326, significant=false | NOT RUN |
| Contradiction Hunter | Prior regression tests only; not part of this Linux live smoke | NOT RUN |
| Gemini Detective and function calling | No live Gemini call in this stage | NOT RUN |
| Forecast all five variables, Satellite/Outlook | PASS: 10 scenarios, 12/18 lead months, maps, intervals/probabilities, analogs, backtest, explanations, defaults | NOT RUN |
| Scientific Reports and PDF download/text extraction | No production PDF created | NOT RUN |
| Refresh/deep links, mobile layout | SPA config prepared; no real browser test | NOT RUN |
| CORS, production HTTPS, restart and abuse handling | Container error contracts/cache passed; no cloud host | NOT RUN |

Public website URL: **not created**. Production API URL: **not created**. Deployment is not complete. The verified milestone is the Linux production container; the next steps require the explicit billing/account decisions above.
