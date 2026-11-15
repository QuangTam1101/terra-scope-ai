# TERRA-SCOPE AI — pre-deployment review và Linux validation

Ngày: 15/11/2026. Scope: review và chuẩn bị Linux validation; không commit/push, publish image, mua hosting hoặc deploy public.

## VERIFIED — bằng chứng hiện có

- Đã review toàn bộ 19 file thay đổi từ lượt chuẩn bị trước; danh sách đánh giá ở dưới. Báo cáo này là file thứ 20.
- Sau fetch, `HEAD` và `origin/main` cùng là `248e3e6323ecb89ffe330f7a34c1ae73d5bad793`.
- Trước review, index trống. Scan 19 candidate text files (khoảng 82 KB lúc kiểm tra) không thấy key Gemini đang cấu hình hoặc pattern API key/private key/GitHub token phổ biến. Không in key hoặc `.env` contents.
- Không có real `.env` hoặc joblib được Git theo dõi. Candidate list không có `.nc`, `.joblib`, `.parquet`. Năm cube NASA đã có trong main từ trước, không có diff dữ liệu hoặc code `data-pipeline/pipeline`.
- Repo PRIVATE, release `Forecast models v1` / tag `forecast-models-v1` và 10 model đã được kiểm tra bằng Git credential hiện có. Manifest pin trong source bảo vệ cả manifest lẫn từng model trước khi deserialize.
- `pip check` local: passed. Integrity unit tests: 6 passed. Windows backend/frontend regression từ lượt trước: 258 / 66 passed, typecheck/build passed.
- `actionlint 1.7.12` (binary chính thức được xác minh SHA256) lint workflow sửa đổi: passed. Chưa có shellcheck/pyflakes tại máy nên hai integration đó tắt khi lint; Linux run vẫn là kiểm tra quyết định.
- Smoke script sau mở rộng đã chạy qua HTTP socket thật trên **Windows**: 10/10 forecast cases, UI defaults, Reality Check, error contracts, reference Mekong và NASA GPM/GLDAS/MERRA-2 series/trends/grid/cache đều passed. Report local ignored: `scripts/.local/predeployment-http-smoke.json`; đây không phải Linux evidence.
- Kết thúc review có 20 candidate text files (19 file ban đầu + báo cáo này), không binary/model/cube/env thật; index vẫn trống. Chưa stage, commit, push hoặc dispatch workflow.
- Docker và Podman không có trong PATH; WSL báo chưa cài. GitHub chưa có workflow/run validation này. Không thể suy ra Linux pass từ kết quả Windows.

## Các vấn đề đã sửa trong review

1. Workflow trước có `packages:write` và nhánh publish image. Hiện chỉ `contents:read`, không registry login/push, và từ chối `publish=true`. `checkout` không lưu Git credential; token chỉ ở env của bước tải release, không chuyển vào Docker build args hoặc container.
2. Pin `actions/checkout` và `actions/upload-artifact` theo SHA đã tra trực tiếp từ official tag. Release model vẫn dùng repo/tag cố định, có pin SHA256 manifest trong code. Không dùng `pull_request_target` hoặc chạy code PR từ fork với secret.
3. `.dockerignore` chuyển sang default deny, chỉ mở app code, requirements, region config, năm cube, climate CSV, đúng 10 model/manifest/metrics và hai gate script. Exclude secret/key/cache đặt cuối. Không gửi `.git`, raw data, các venv, backup, web/node_modules hoặc staging vào build context.
4. Docker build thêm `pip check`; image tiếp tục verify toàn bộ artifact trước load và chạy user không root. Dependency ranges và base image tag còn chưa khóa digest: Linux job sẽ ghi image bytes và `pip freeze`; cần pin bản Linux đã kiểm thử trước chiến lược rebuild dài hạn.
5. Smoke test thêm chế độ HTTP loopback, series/trends/grid thật GPM/GLDAS/MERRA-2 và kiểm tra cache đĩa. Không sửa statistical engine hoặc model. Report Windows cũ được giữ nguyên, Linux có artifact riêng.
6. CI khởi động chính production CMD uvicorn trong container 4 GiB/2 CPU, filesystem read-only với cache/tmpfs ghi được, network none và không publish port. Điều này kiểm tra startup, non-root, permissions, timeout, artifact loading và inference qua socket thật.

## Review từng file

| File | Đánh giá và giới hạn |
|---|---|
| `.gitignore` | Env trừ examples, Python cache được ignore; không thay tracking cube đã có |
| `.dockerignore` | Default deny + exact data/model list; Docker thực thi patterns cần được xác nhận bằng CI |
| `.github/workflows/build-backend-image.yml` | Manual, main only, publish=false only, contents:read, pinned actions, cleanup/logs; job token private release access còn pending run thật |
| `backend/Dockerfile` | Linux Python 3.13, libgomp, pip check, checksum gate, non-root, một worker; image size/ABI còn pending |
| `backend/.env.example` | Chỉ placeholders/defaults; localhost CORS dành local, production phải override |
| `backend/app/forecast_service.py` | Chỉ sửa default target month Satellite map; không đổi inference/statistics |
| `backend/tests/test_forecast_api.py` | Assertion bảo vệ Satellite default map; test synthetic không thay model production |
| `data-pipeline/.gitignore` | Model và checksum tải về không vào Git |
| `web/.gitignore` | Ignore env production/local; cho phép example |
| `web/.env.example` | Public API origin, không secret |
| `web/vercel.json` | Root web, npm ci/build/dist, SPA rewrite loại api; Vercel cloud routing chưa chạy |
| `web/vite.config.ts` | HTTPS origin bắt buộc khi VERCEL=1; không đổi React plugin/dev proxy; build đã kiểm tra local |
| `scripts/forecast_artifacts.py` | Pin manifest, exact 10 entries, reject duplicate/path traversal/missing/hash mismatch |
| `scripts/fetch-forecast-models.py` | gh authenticated download vào temp, verify toàn bộ trước copy, không deserialize, từ chối overwrite khác checksum |
| `scripts/check-deployment.py` | Verify trước loader, mở cube và load 10 model, metadata/CSV; không chứng nhận predictive skill |
| `scripts/smoke-forecast.py` | Thật qua HTTP hoặc TestClient, kiểm tra forecast/analytics/cache; không gọi Gemini, input loopback cố định |
| `scripts/tests/test_forecast_artifacts.py` | Byte fixtures, không pickle; 6 negative/positive integrity tests |
| `docs/FORECAST_DEPLOYMENT_VERIFICATION.json` | Report Windows, số liệu tổng hợp, không cube/model/secret; không gắn nhãn Linux |
| `DEPLOYMENT_VERCEL_GUIDE.md` | Đã cập nhật scope workflow và status; hướng dẫn hosting/public chỉ thực hiện sau phê duyệt riêng |

## PENDING — Linux gate phải đạt

1. Private release tải được bằng **job GITHUB_TOKEN contents:read**. Local account credential thành công chưa chứng minh job token thành công. Nếu 404, kiểm tra owner/repo/tag, Actions policies và job permissions trong log; không đưa PAT vào Docker args hoặc log.
2. Docker Linux build cài đủ wheels/native libs; `pip check` và artifact gate thành công.
3. Production uvicorn khởi động dưới user app, bind 0.0.0.0 và health sẵn sàng; không cần key Gemini.
4. HTTP smoke đủ 10 forecast cases; NASA series/trends/grid/cache; defaults, errors, Reality Check và Mekong reference giữ nguyên.
5. Không OOM, container không crash, cache ghi được. Xem `memory-peak-bytes.txt`, `memory-samples.jsonl`, `container-state.json`; 4 GiB/2 CPU chỉ chứng minh workload tuần tự của CI, chưa chứng minh nhiều người dùng.
6. Đọc `image-bytes.txt` để có kích thước image uncompressed thực tế. Artifact + cube đã ~487 MiB; với Python/native deps/base image, **dự toán** khoảng 1–2 GB uncompressed, chưa đo Linux. Dự trù host disk 10–20 GB cho image/layers/cache/logs/rollback; không coi đó là nhu cầu RAM.
7. `publish=false` không tạo container registry image hoặc public endpoint. Workflow vẫn có thể tiêu thụ Actions minutes/storage của repo private; chủ repo kiểm tra quota trước khi Run.

Khi run hoàn tất: chỉ kết luận **Linux production container validated** nếu job thành công và evidence trên khớp. Live Gemini, browser E2E public, load đồng thời và dữ liệu mới hơn snapshot vẫn là kiểm tra riêng. Climate indices hiện đến khoảng 06/2026 cho Outlook origin; theo thời gian phải cập nhật snapshot theo quy trình nhóm, không vượt model horizon để làm test pass.

## Exact PowerShell Git commands — CHƯA thực thi

Chỉ chạy sau khi chủ repo duyệt commit và push. Không dùng `git add .` hoặc `-f`. Nếu main upstream đã đổi, dừng để review lại, không reset/rebase tự động.

```powershell
Set-Location D:\Projects\terra-scope-ai
git fetch origin main
if ((git branch --show-current) -ne 'main') { throw 'Expected main branch' }
if ((git rev-parse HEAD) -ne (git rev-parse origin/main)) { throw 'Review upstream changes before proceeding' }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Existing staged changes: review before staging' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Fix diff errors first' }

$deploymentFiles = @(
  '.gitignore'
  '.dockerignore'
  '.github/workflows/build-backend-image.yml'
  'backend/Dockerfile'
  'backend/.env.example'
  'backend/app/forecast_service.py'
  'backend/tests/test_forecast_api.py'
  'data-pipeline/.gitignore'
  'web/.gitignore'
  'web/.env.example'
  'web/vercel.json'
  'web/vite.config.ts'
  'scripts/forecast_artifacts.py'
  'scripts/fetch-forecast-models.py'
  'scripts/check-deployment.py'
  'scripts/smoke-forecast.py'
  'scripts/tests/test_forecast_artifacts.py'
  'docs/FORECAST_DEPLOYMENT_VERIFICATION.json'
  'DEPLOYMENT_VERCEL_GUIDE.md'
  'PREDEPLOYMENT_REVIEW.md'
)
git add --dry-run -- @deploymentFiles
git add -- @deploymentFiles
if ($LASTEXITCODE -ne 0) { throw 'Staging failed' }
$staged = @(git diff --cached --name-only)
if (Compare-Object ($deploymentFiles | Sort-Object) ($staged | Sort-Object)) { throw 'Unexpected staged file list' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Staged diff check failed' }
git diff --cached --stat
git diff --cached --numstat
git status --short
# Review the staged diff locally; do not paste credentials into chat.
git diff --cached
git commit -m "Prepare verified Forecast deployment and Linux container validation"
git push origin main
```

Nếu lệnh add lỗi Windows ACL, dừng và giữ index để review; không dùng reset/force push. Chưa chạy add/commit/push trong lượt review này.

## Trigger workflow publish=false và lấy evidence

Sau khi các file đã lên default branch `main`:

1. GitHub repo → Settings → Actions → General: kiểm tra Actions được phép, policies cho checkout/upload-artifact; không cần bật write permissions toàn repo. Kiểm tra quota trong Billing/Actions.
2. Repo → Actions → **Build verified Forecast backend image** → **Run workflow**.
3. Branch: `main`. Ô `publish` **bỏ chọn/false**. Bấm Run workflow.
4. Mở run mới, xác nhận đúng commit vừa push. Đọc các bước fetch → checksum/build → startup → HTTP smoke. Các bước có failure không được bỏ qua để báo pass.
5. Cuối run tải artifact **linux-validation-reports**: Linux JSON, smoke/server log, Python package list, image bytes, memory samples/peak và state. Report không chứa model hoặc cube.
6. Cung cấp run URL hoặc run ID trong cuộc trò chuyện để agent đọc log thật, chẩn đoán và sửa lỗi. Chưa có run để phân tích tại thời điểm review.

CLI thay thế (cần `gh auth login`, không paste token):

```powershell
gh workflow run build-backend-image.yml --repo QuangTam1101/terra-scope-ai --ref main -f publish=false
gh run list --repo QuangTam1101/terra-scope-ai --workflow build-backend-image.yml --limit 5
# Replace RUN_ID with the new run's numeric ID.
gh run watch RUN_ID --repo QuangTam1101/terra-scope-ai --exit-status
gh run view RUN_ID --repo QuangTam1101/terra-scope-ai --log-failed
gh run download RUN_ID --repo QuangTam1101/terra-scope-ai --name linux-validation-reports --dir scripts/.local/linux-validation-RUN_ID
```

Chỉ xem logs local hoặc chia sẻ evidence đã lọc. Không tải artifact lên public hoặc nhập secret để làm workflow pass.

## Sau Linux pass — phương án hosting và dự toán có điều kiện

Ưu tiên vận hành đơn giản: **Render Web Service từ private Docker image**, một worker, ít nhất 2 CPU / 4 GB RAM nếu CI 4 GiB pass có đủ headroom. Nếu peak gần giới hạn hoặc nhiều người dùng, benchmark 8 GB trước khi chọn gói. Theo [Render pricing](https://render.com/pricing) kiểm tra ngày 15/11/2026: `2c-4g` khoảng **85 USD/tháng**, `2c-8g` khoảng **135 USD/tháng** cho compute; chưa gồm thuế, workspace plan tùy chọn, egress vượt quota, registry, Gemini hoặc disk. Persistent disk tùy chọn khoảng 0,25 USD/GB/tháng, không bắt buộc để giữ cube/model bất biến trong image.

Đây là dự toán phục vụ quyết định, **chưa phải sizing được xác minh hoặc đề nghị mua ngay**. Chốt provider/gói sau khi đọc số đo Linux. Không chọn gói free 512 MB từ kết quả Windows peak ~1,55 GiB. Không tự tăng replica/worker vì sẽ tăng RAM và rate-limit Gemini hiện không dùng quota chung giữa process.

Tham khảo: [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [Docker build context](https://docs.docker.com/build/concepts/context/). Không publish image hoặc tạo hosting trong milestone hiện tại.
