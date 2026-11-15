# Vercel workspace and cost options — TERRA-SCOPE AI

Checked 15/11/2026. Status: target Hobby project created/configured; deployment evaluation in progress, no paid plan accepted.

## Target workspace and verified access

Owner-selected scope slug: `quang-tam-thieus-projects`. The URL is user-provided; it is not proof of CLI access or plan.

| Field | Verified result |
|---|---|
| CLI authenticated user | `quangtamthieu6-1893` after owner login |
| Target in returned teams | Yes |
| Target-scoped project listing | Success |
| Direct target team API | Success |
| Target display name / scope ID / billing plan | Quang Tam Thieu's projects / `team_BVZgxczVQK25bk1mALKxaUtf` / Hobby |
| Deployment to previous Pro scope | Not performed |

Use the account that owns or can access the target, then inspect the actual team record. Do not create another workspace with a similar name or silently fall back to the previous scope.

```powershell
npm exec --yes --package=vercel -- vercel login
npm exec --yes --package=vercel -- vercel whoami
npm exec --yes --package=vercel -- vercel teams list --json
npm exec --yes --package=vercel -- vercel project ls --scope quang-tam-thieus-projects --json
```

The owner completes browser login/MFA; no tokens or passwords should be pasted into chat. Once verified, use explicit target scope on every mutation. If the plan is paid or a new charge is required, request approval before deployment.

## Why Render was proposed, and the cheaper Vercel possibilities

The backend needs scientific Python/native dependencies, five NetCDF cubes, ten trusted model files and writable regenerable cache. A continuously running container preserves loaded state and avoids repeated cold starts. Render was a simple managed-container proposal, **not a requirement** and not evidence the project cannot run on Vercel.

Current official Vercel docs also provide **Container Runtime beta** and **Services**, including Docker-based HTTP backends alongside a frontend. This needs evaluation before choosing an always-on paid host. It would be incorrect to compare the complete 725 MiB Docker image directly to the standard Python Function's 500 MB bundle cap and conclude Container Runtime is unavailable.

| Option | Advertised plan price | Fit and pending checks |
|---|---|---|
| Vercel Hobby frontend | 0 USD/month within quotas | Good first candidate for Vite assets; target plan/access and account eligibility still unknown |
| Hobby frontend + Vercel Container Runtime beta backend | No fixed backend subscription under Hobby; subject to quotas | Hobby Functions have 2 GB / 1 vCPU limits. Backend memory must be measured independently; full workload has not been tested in this runtime |
| Vercel Pro + container backend | From 20 USD/month plus usage | Functions allow up to 4 GB / 2 vCPU. Potentially cheaper for intermittent demo traffic, but no fixed all-inclusive cost and no guarantee of fit |
| Vercel frontend + an 8 GB container host | Additional provider compute cost | More memory headroom; Render proposal 135 USD/month managed, or a self-managed DigitalOcean 8 GiB VM around 48 USD/month. Neither is purchased |

Prices do not include applicable taxes or overages. Pro includes usage credit; included credit does not imply unlimited compute. Do not upgrade a plan or accept recurring charges automatically.

## Evidence and technical caveats

- Linux Docker validation passed: 10 Forecast scenarios, actual HTTP NASA series/trends/grid/cache, defaults/errors and Mekong reference. Image 759,937,372 bytes; cgroup peak 4,040,663,040 bytes under 4 GiB / 2 CPU, no OOM.
- That peak includes server, in-container verification client and page/filesystem caches. It is **not** a measurement of one Vercel Function instance. It neither proves Hobby fits nor proves Pro cannot fit.
- Container Runtime uses Functions limits and Active CPU pricing, and scales idle production instances down after five minutes. Cold starts may re-import libraries/reload models/rebuild cache.
- Standard Python Functions have a 500 MB uncompressed bundle cap; large-function beta eligibility is separate. Container images have their own registry/optimization constraints that also need checking.
- Vercel Daemons are continuous background workers, not an automatic replacement for the HTTP API. Do not deploy FastAPI as a daemon solely to evade HTTP runtime limits.
- The backend Dockerfile now fetches the approved public release and verifies the pinned manifest at build time. This avoids missing ignored model artifacts on a Git checkout. Public-download unit tests passed; the revised Docker/Vercel cloud build still needs validation.
- Container writable paths, tmpfs/cache behavior, request concurrency, cold/warm global grids, restart and response limits need Vercel-specific tests. Preserve scientific algorithms and verified numeric outputs during packaging changes.
- Separate frontend/backend projects can retain `web` as frontend root with a real HTTPS API origin. A same-project Services setup requires reviewing the root/routing/build configuration; do not mix the two configurations without testing.

## Next decision

Access and Hobby plan are now verified. Evaluate the root Services deployment within free quotas, with `/api` routed to the container and Vite assets to the frontend service. Keep Render on hold. Do not upgrade, switch workspace, remove features or change scientific algorithms to force a successful deployment. No production readiness claim is valid until actual runtime and public E2E checks pass.

Official references:

- [Vercel pricing](https://vercel.com/pricing)
- [Functions limits](https://vercel.com/docs/functions/limitations)
- [Container Runtime](https://vercel.com/docs/functions/runtimes/container)
- [Services](https://vercel.com/docs/services)
- [Daemons](https://vercel.com/docs/daemons)
- [CLI login](https://vercel.com/docs/cli/login)
