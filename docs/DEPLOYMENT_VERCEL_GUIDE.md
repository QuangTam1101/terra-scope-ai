# TERRA-SCOPE AI — triển khai production

Ngày audit: 15/11/2026. Baseline: `main`, commit `248e3e6323ecb89ffe330f7a34c1ae73d5bad793`.
Các cấu hình dưới đây đang ở working tree; chưa commit/push, chưa tạo hosting hoặc deployment công khai.
Review trước Linux validation: xem `PREDEPLOYMENT_REVIEW.md`. Workflow hiện chỉ cho phép `publish=false`, không còn bước login/push registry.

## 1. Kiến trúc được đề xuất

Frontend tĩnh React/Vite trên **Vercel**. FastAPI chạy **một container lâu dài** trên hosting Docker có HTTPS, ví dụ Render Web Service từ private container image. Có thể dùng cùng image trên VM có reverse proxy HTTPS.

| Tiêu chí | A: cả frontend và API trên Vercel Functions | B: Vercel + backend container (đề xuất) |
|---|---|---|
| Tương thích | FastAPI được hỗ trợ; cần đóng gói/runtime entrypoint riêng | Giữ nguyên uvicorn và các đường dẫn Linux trong image |
| Dung lượng | Python bundle chuẩn tối đa 500 MB; large functions là beta | Image chứa thư viện khoa học, cube và model; không chịu giới hạn bundle Functions |
| RAM/CPU | Hobby tối đa 2 GB/1 vCPU, Pro 4 GB/2 vCPU theo docs hiện hành | Chọn tài nguyên theo phép đo thực tế; đề xuất thử 4–8 GB, 2 CPU, 1 worker |
| Thời gian | Hobby tối đa 300 s; Pro có giới hạn khác và beta mở rộng | Request dài không bị giới hạn function; vẫn cần timeout của host/client |
| Khởi động | Import khoa học, đọc cube/model lặp lại khi cold start | Process giữ dataset/model/cache trong RAM |
| Lưu trữ | Không dùng filesystem function làm persistent cache | Cube/model bất biến trong image; cache ra đĩa có thể tái tạo |
| Chi phí | Static frontend nhẹ; function CPU/RAM và egress có thể tăng | Frontend theo gói Vercel; backend compute liên tục, registry, egress, Gemini và disk tùy chọn |
| Bảo trì | Cần điều chỉnh đóng gói/cache, chưa chứng minh đủ tài nguyên | Một image có tag theo commit, cập nhật có kiểm soát |

Giới hạn tham khảo: [Vercel Functions](https://vercel.com/docs/functions/limitations), [Python runtime](https://vercel.com/docs/functions/runtimes/python).
Không khẳng định phương án A bất khả thi, nhưng chưa có bằng chứng rằng workload đầy đủ đáp ứng giới hạn của nó.

Frontend dùng **API origin HTTPS trực tiếp** qua `VITE_API_BASE_URL`, tận dụng cơ chế đã có trong `web/src/api.ts` cho mọi fetch API. Không đi qua Vercel Function hoặc external rewrite để tránh thêm timeout proxy cho bản đồ/forecast. Cần cấu hình CORS chính xác. Vite proxy `/api` chỉ phục vụ local.

## 2. Kết quả audit và các điều kiện còn thiếu

- Entrypoint backend: `backend.app.main:app`; frontend: `web/src/main.tsx`.
- Hash routing (`#explore`, `#forecast`, `#hunt`, `#detective`, `#report`, `#start`) giữ nguyên. `web/vercel.json` có SPA fallback, loại `/api` để API cấu hình thiếu không biến thành HTML.
- Atlas bản đồ và mã PDF/report được bundle từ frontend; không cần browser Gemini client.
- Năm cube 1° được Git theo dõi: tổng **148,041,112 bytes** (~141.2 MiB), mỗi cube 288 × 180 × 360. Cả năm đã mở bằng xarray và đọc một ô thành công.
- Thư mục Python site-packages local khoảng 535 MiB; đây là toàn môi trường Windows, không phải số đo image Linux hay RAM peak.
- Đã tải đủ **10 model** từ release private chính chủ bằng `gh release download`: `forecast_{precip,soil_moisture,tair_land,evap_gldas,t2m}.joblib` và mỗi biến có thêm hậu tố `_outlook.joblib`. Tổng 362,447,123 bytes (~345.7 MiB).
- `metrics.json`, `metrics_outlook.json`, `reality_check.json` và `processed_data/indices/climate_indices.csv` đã được Git theo dõi.
- `gh repo view` xác nhận repo **PRIVATE**. Với Git credential đã lưu, `gh release list/view` xác nhận tên `Forecast models v1`, tag `forecast-models-v1`, đủ 10 joblib + `SHA256SUMS.txt`. 404 trước đó do truy cập không xác thực; không phải release thiếu.
- Đã kiểm tra SHA256 của toàn bộ model trước khi deserialize. SHA256 manifest được pin: `def7b92323142bceeca5491622a311b631e1acbaf59bd49e35684113fe8b7985`. Gate artifact/cube hiện `ready: true`. Model và manifest tải về được Git-ignore.
- `indices.load()` sẽ tải NOAA nếu thiếu CSV; image giữ CSV hiện có để tránh phụ thuộc tải lúc khởi động. Quy trình cập nhật indices phải được kiểm tra riêng.
- Backend có cache trong RAM và cache grid trên đĩa. Không thấy yêu cầu database session; chat/case phía frontend dùng storage trình duyệt. Disk cache có thể mất khi redeploy mà không làm mất cube/model trong image; cold request sẽ tính lại.
- Tính grid toàn cầu có thể vượt timeout 45 giây của một số lệnh frontend khi cache lạnh. Sau khi hosting, prewarm qua API trước khi mở traffic và đo runtime/RAM; không thay thuật toán hoặc timeout để che lỗi.
- Chưa xác minh live Gemini, model entitlement, quota hoặc hành vi trên Linux. Không có request Gemini phát sinh phí trong audit này.
- Smoke test model thật đã qua cả 5 biến × Outlook/Satellite: forecast vùng 18/12 tháng, bản đồ lead 3, khoảng dự báo, xác suất, backtest, analogs, drivers, giải thích và metadata. Chi tiết: `docs/FORECAST_DEPLOYMENT_VERIFICATION.json`. Đây là kiểm tra tính chạy được/contract, không phải tái đánh giá predictive skill bằng holdout mới.
- Phát hiện và sửa lỗi request bản đồ Satellite không có `month`: mặc định dùng origin satellite + 3 tháng, thay vì hiện tại + 3 tháng ngoài phạm vi dữ liệu. Explicit month, mô hình và thống kê giữ nguyên. Có regression assertion trong `backend/tests/test_forecast_api.py`.
- HTTP socket thật ở `127.0.0.1:8000`: forecast Outlook 13 tháng (2026-11 đến 2027-11), Satellite 12 tháng, map Outlook, map Satellite mặc định (2025-03, 64.762 cells), status hai mode và Reality Check đều trả 200 sau sửa. Các trường hợp 5 biến × 2 mode được kiểm tra thêm qua FastAPI TestClient.
- Trên Windows với BLAS/OpenMP 1 thread: regional request khoảng 7,9–13,8 giây, map khoảng 1,2–12,2 giây trong lượt smoke cuối. Một backend process qua socket ghi nhận peak working set ~1.591 MiB; đây không phải benchmark tải đồng thời hoặc peak Linux. RAM 4–8 GB là mức khởi đầu cần xác minh trên hosting.

## 3. Backend: chuẩn bị artifact và image

1. Model hiện đã được tải và xác minh tại máy này. Khi dựng máy mới, dùng GitHub CLI có quyền đọc repo private (`gh auth login` hoặc `GH_TOKEN` từ secret store); không đăng token vào chat.
2. Dùng downloader bên dưới để lấy lại artifact; script tải vào temp, kiểm tra manifest được pin và SHA256 cả 10 file trước khi chép vào `data-pipeline/models/`. Nó từ chối ghi đè file local khác checksum. Giữ nguyên ba JSON metrics. Các joblib vẫn được Git ignore.

```powershell
gh auth login
gh repo view QuangTam1101/terra-scope-ai --json nameWithOwner,visibility
gh release list --repo QuangTam1101/terra-scope-ai
gh release view forecast-models-v1 --repo QuangTam1101/terra-scope-ai
.\.venv\Scripts\python.exe scripts/fetch-forecast-models.py --manifest-sha256 def7b92323142bceeca5491622a311b631e1acbaf59bd49e35684113fe8b7985
```

`gh` portable đã tải chính thức và kiểm tra checksum tại `scripts/.local/github-cli/gh.exe`; có thể dùng `--gh` để trỏ tới file đó. Nó chưa có gh login riêng; audit dùng Git credential manager hiện có, token chỉ trong bộ nhớ tiến trình. Script không tự lấy token khỏi credential manager.
3. Chạy gate sau; cần `ready: true` trước khi build image production:

```powershell
Set-Location D:\Projects\terra-scope-ai
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python scripts\check-deployment.py
Get-FileHash data-pipeline\models\*.joblib -Algorithm SHA256
```

Gate xác minh manifest được pin và toàn bộ checksum trước khi load model bằng loader hiện tại, sau đó đọc cube/metadata/CSV. Không gọi mạng hoặc sửa NASA data. Gate hiện passed. Requirements đang dùng scikit-learn 1.9.1, joblib 1.6.0; không thay thuật toán hoặc train lại.

4. Cài/bật Docker Desktop rồi build từ **repo root**. Dockerfile chỉ copy backend, package pipeline/config, processed_data và models; `.dockerignore` loại secrets, raw data và môi trường local. Model ignored bởi Git vẫn được đưa vào Docker context khi đã có tại máy.

```powershell
docker build -f backend/Dockerfile -t terra-scope-api:248e3e6 .
```

Python 3.13 slim, libgomp, backend requirements; một uvicorn worker, giới hạn concurrency 8, native BLAS threads 1; chạy user không phải root. Gate chạy trong image: thiếu/hỏng model sẽ làm build fail rõ ràng. Docker chưa có tại môi trường audit nên chưa kiểm tra Linux build hoặc compatibility của model pickle.

5. Sau khi phê duyệt registry/hosting, tự thay tên tài khoản và đẩy image vào registry private bạn quản lý (push image khác với push Git):

```powershell
$image = 'ghcr.io/YOUR_GITHUB_OWNER/terra-scope-api:248e3e6'
docker tag terra-scope-api:248e3e6 $image
docker login ghcr.io
docker push $image
```

Không ghi registry token vào file hoặc lệnh history. Chỉ thực hiện sau khi duyệt việc upload artifact. Nên dùng digest bất biến cho production và khóa dependency sau khi Linux build được xác minh.

6. Render Dashboard → New → Web Service → Existing Image; nhập image/digest và registry credential trong dashboard. Chọn region gần người dùng và tài nguyên phù hợp (4–8 GB RAM là dự toán thử nghiệm, chưa phải benchmark). Xem giá/chi phí ước tính trước Create. Health Check Path: `/api/v1/health`. Image dùng biến `PORT` do host cấp, bind `0.0.0.0`, không dùng `--reload`.
7. Thêm các biến backend ở mục 4. Tạo service và chờ `/api/v1/health`, `/api/v1/variables`, `/api/v1/forecast/status?variable_id=imerg_precip` đạt. Ghi lại HTTPS backend origin.
8. Cache disk là tùy chọn: gắn disk ở vị trí riêng, đặt `GRID_CACHE_DIR` tới thư mục có quyền ghi của user `app`. Không mount disk rỗng đè lên thư mục model/cube. Với image hiện tại, cache `/app/backend/.cache/grids` ghi được nhưng sẽ mất khi redeploy nếu không có disk.

Đã chuẩn bị `.github/workflows/build-backend-image.yml`: sau khi chủ repo review/đưa file lên `main`, GitHub Actions → **Build verified Forecast backend image** → Run workflow. Chỉ chấp nhận `publish=false`: tải release bằng `github.token` với `contents:read`, kiểm tra checksum được pin, build Linux image và chạy smoke test qua HTTP thật. `publish=true` bị chặn; workflow không có quyền packages:write hoặc bước push. Tag local là SHA commit đầy đủ. Workflow chỉ manual, chưa được chạy trong audit này; không tạo hosting hoặc public deployment. Cần review quota/phí Actions trước khi chạy.

Linux validation dùng 2 CPU, RAM 4 GiB, 1 worker; container filesystem read-only, cache và `/tmp` là tmpfs có giới hạn, không có network ra ngoài hoặc port public. Script test HTTP loopback trong container kiểm tra Forecast 5 biến × 2 mode, NASA GPM/GLDAS/MERRA-2 series/trends/grid và cache. Workflow lưu report, image bytes, package versions, memory samples/peak, state và logs trong artifact `linux-validation-reports` (7 ngày); không upload cube, model hoặc image. Không thể gọi đây là Linux passed cho tới khi run thật thành công.

Render từ prebuilt image cần chọn image/digest mới rồi deploy theo quy trình riêng; Git main không tự cập nhật backend image. Đừng chọn import Git Docker build khi artifact ignored chưa được cấp: checkout Git không có model. Token tải release không đưa vào Docker build args/layers; model được tải trước build và chỉ artifact đã xác minh được copy vào image. Hosting chỉ cần quyền kéo image private, không cần GitHub release token lúc runtime. Review package visibility của GHCR sau publish.

Chi phí: kiểm tra [Render pricing](https://render.com/pricing), [disk](https://render.com/docs/disks), [Vercel pricing](https://vercel.com/pricing) trước khi tạo tài nguyên. Container RAM đủ chạy scientific workload thường cần gói trả phí; free tier chưa được chứng minh đủ. Thêm giới hạn chi tiêu Gemini, hạn mức backend/edge cho public traffic. Giới hạn LLM hiện tại nằm trong một process, không phải quota dùng chung nhiều replica. Không tăng workers/replicas trước khi đo tải, bộ nhớ và rate limit.

## 4. Biến môi trường

| Nơi đặt | Tên biến | Cách sử dụng |
|---|---|---|
| Vercel Production/Preview | `VITE_API_BASE_URL` | Public backend HTTPS origin, không `/api`, không slash cuối; bắt buộc trên Vercel |
| Backend | `CORS_ORIGINS` | Danh sách exact origins Vercel/custom domain được phép, phân cách dấu phẩy; thêm preview domain từng cái |
| Backend | `LLM_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL` | Provider/model đã kiểm tra quyền trong project Google; key chỉ trong secret settings backend |
| Backend | `LLM_TIMEOUT_SECONDS`, `LLM_MAX_OUTPUT_TOKENS`, `LLM_REQUESTS_PER_MINUTE` | Giới hạn Gemini theo `.env.example` hiện có |
| Backend, tùy chọn | `AGENT_MAX_TOOL_CALLS`, `AGENT_MAX_STEPS`, `AGENT_TIMEOUT_SECONDS`, `AGENT_MAX_EVIDENCE_BYTES` | Giữ giới hạn hiện có |
| Backend | `WARM_UP` | Bắt đầu 0; chỉ bật 1 sau đo tài nguyên |
| Backend, tùy chọn | `GRID_CACHE_DIR`, `PIPELINE_DIR`, `CUBE_DIR`, `GRID_V2_DIR`, `GRID_V2` | Paths Linux; chỉ override nếu thực sự đã provision dữ liệu tương ứng |
| Backend hosting | `PORT` | Host cấp; không đặt cổng Windows vào production |

Không đưa `.env` local lên Git, image hoặc Vercel. `backend/.env` tự load local; môi trường process trên host ưu tiên hơn file. `GEMINI_MODEL` hiện ví dụ là `gemini-3.8-flash`, chưa xác minh quyền sử dụng trên Google project trong lượt này. Key trống vẫn chạy Template Mode. Không thêm `VITE_GEMINI_API_KEY`.

## 5. Vercel Dashboard — chủ repo thực hiện

Các file cấu hình cần được review/commit/push lên `main` trước. Agent chưa được phép push và đã để nguyên working tree để bạn review.

1. Mở https://vercel.com/ → Log In → Continue with GitHub; cấp quyền cho đúng repo.
2. Add New → Project → Import `QuangTam1101/terra-scope-ai`.
3. Chọn production branch `main`. Nếu màn Import không có trường branch, kiểm tra ngay sau tạo project tại Settings → Environments → Production → Branch Tracking (hoặc Git → Production Branch tùy giao diện).
4. Root Directory: **`web`**. Framework Preset: **Vite**.
5. Install Command: **`npm ci`**; Build Command: **`npm run build`**; Output Directory: **`dist`**. Node.js: **22.x** (local audit Node 20.19.5; cloud Node 22 chưa chạy tại đây).
6. Environment Variables: đặt **`VITE_API_BASE_URL`** = backend HTTPS origin thật cho Production; Preview chỉ trỏ backend được phép. Không nhập key Gemini.
7. Review `web/vercel.json`: SPA fallback, API dùng origin trực tiếp. Không tạo rewrite tới localhost. Vite config sẽ từ chối hosted build nếu origin thiếu, là localhost hoặc không HTTPS.
8. Xem gói/chi phí. Khi backend đã sẵn sàng và cấu hình đã lên Git, bấm **Deploy**.
9. Mở deployment → Build Logs. Khi trạng thái Ready, lấy URL `.vercel.app` trong Domains/Visit. Ready chưa chứng minh API/forecast đã hoạt động.
10. Đặt domain production ổn định vào `CORS_ORIGINS` ở backend, restart/redeploy backend. Với preview URL mới, thêm exact origin; không dùng `*` cho toàn bộ preview.
11. Chạy checklist mục 7 trước khi công bố URL. Production/Preview env là build-time: sửa `VITE_API_BASE_URL` phải **Redeploy**, không chỉ restart backend.
12. Settings → Git: xác nhận repo liên kết và Production Branch `main`; push/merge mới vào `main` sẽ tạo production deployment. Các branch khác thường tạo preview theo cấu hình project. Kiểm tra Ignored Build Step và thông báo GitHub nếu push không trigger.

Tài liệu: [Vite trên Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Git integration](https://vercel.com/docs/git), [environment variables](https://vercel.com/docs/environment-variables).

## 6. Lệnh kiểm tra local

```powershell
Set-Location D:\Projects\terra-scope-ai
.\.venv\Scripts\Activate.ps1
$env:LLM_PROVIDER = 'template'
python -m pytest -q backend/tests
python scripts/check-deployment.py
python -m unittest discover -s scripts/tests -v
$env:OMP_NUM_THREADS = '1'
$env:OPENBLAS_NUM_THREADS = '1'
python scripts/smoke-forecast.py --output docs/FORECAST_DEPLOYMENT_VERIFICATION.json
Set-Location web
npm ci --dry-run --ignore-scripts
npm run typecheck
npm run build
npm test
```

Dry-run chỉ xác minh lockfile/install plan, không tương đương clean Linux install. Để cài sạch dependencies trên một checkout riêng: `npm ci`.

Backend terminal (giữ secret local trong `backend/.env`):

```powershell
Set-Location D:\Projects\terra-scope-ai
$env:LLM_PROVIDER = 'template'
$env:WARM_UP = '0'
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Frontend terminal:

```powershell
Set-Location D:\Projects\terra-scope-ai\web
npm run dev -- --host localhost --port 5173 --strictPort
```

`Ctrl+C` dừng từng server. Test URL: `http://localhost:5173/`, `http://127.0.0.1:8000/docs`. Nếu cổng đã có server đang chạy, dùng lại server đó hoặc dừng đúng server trước khi khởi động.

## 7. Kiểm tra production sau khi có URL

Thay placeholder bằng domain thật:

```powershell
$api = 'https://YOUR_BACKEND_HOST'
$site = 'https://YOUR_PROJECT.vercel.app'
Invoke-RestMethod "$api/api/v1/health"
Invoke-RestMethod "$api/api/v1/variables"
Invoke-RestMethod "$api/api/v1/forecast/status?variable_id=imerg_precip"
$body = @{ variable_id='imerg_precip'; region=@{type='preset';id='mekong_delta'}; start='2001-01'; end='2024-12' } | ConvertTo-Json -Depth 5
$trend = Invoke-RestMethod "$api/api/v1/trends" -Method Post -ContentType 'application/json' -Body $body
$trend | Select-Object n,slope_per_decade,p_value,significant
$forecast = @{variable_id='imerg_precip';region=@{type='preset';id='mekong_delta'};mode='outlook';months=1} | ConvertTo-Json -Depth 5
Invoke-RestMethod "$api/api/v1/forecast" -Method Post -ContentType 'application/json' -Body $forecast -TimeoutSec 120
Invoke-WebRequest "$api/api/v1/variables" -Method Options -Headers @{Origin=$site;'Access-Control-Request-Method'='GET'} -UseBasicParsing
```

Mekong trên năm cube mặc định: n=288, slope=+3.163604736328125 mm/month/decade, raw p=0.11031644898805326, significant=false. Nếu dùng grid v2 hoặc dữ liệu khác phải ghi provenance, không tự ép kết quả về reference.

Kiểm tra trong browser DevTools → Network/Console:

- [ ] Landing, ảnh, video, Get Started hoạt động.
- [ ] Explorer/Scientist modes, tutorial, quay lại/tiếp tục hoạt động.
- [ ] Explore map/atlas, chọn vùng và kỳ, `/series`, `/trends`, grid/timelapse có response hợp lệ.
- [ ] Contradiction Hunter trả kết quả thật, không lỗi timeout ở cache lạnh/ấm.
- [ ] Detective giữ evidence và navigation; Template hoạt động. Chỉ test live Gemini sau phê duyệt request có thể phát sinh phí; `configured=true` không đủ xác nhận live.
- [ ] Forecast có dự báo cho cả Outlook và Satellite, intervals/probabilities/metadata hợp lệ, không 503 model.
- [ ] Reports dùng đúng số liệu, tải PDF và mở file PDF kiểm tra nội dung/layout.
- [ ] Refresh và mở tab mới các link `#explore`, `#forecast`, `#hunt`, `#detective`, `#report?case=...`; test SPA pathname fallback nếu dùng link pathname.
- [ ] Mọi API request tới HTTPS backend thật, không localhost, không mixed content, không CORS error.
- [ ] Frontend/response/log không chứa key; cache lạnh và ấm đều đáp ứng UX/timeouts.
- [ ] Đo peak RAM, CPU và độ trễ khi có vài người dùng đồng thời trước mở public traffic.

Hiện **chưa có URL public** được cung cấp; checklist chưa chạy trên production và chưa có browser E2E deployment.

## 8. Kết quả kiểm thử của lượt chuẩn bị

| Kiểm tra | Kết quả |
|---|---|
| Backend regression, Gemini SDK bị mock/cấm mạng trong fixture | 258 passed |
| Frontend typecheck | Passed |
| Frontend build local | Passed; cảnh báo chunk chính >500 kB |
| Frontend tests | 66 passed; có cảnh báo HMR port 24678 đã dùng, không fail test |
| npm ci dry-run | Passed; chưa clean install Linux |
| Build giả lập Vercel với HTTPS origin public minh họa | Passed; không gọi host minh họa |
| Build Vercel thiếu API origin | Bị chặn như thiết kế |
| Health, variables, docs trong FastAPI TestClient | 200 |
| CORS khi thiếu production origin / khi thêm exact HTTPS origin | 400 / 200 với allow-origin đúng |
| NASA Mekong trend thật | 200, trùng reference n/slope/p/significant |
| Mở 5 cube thật | Passed |
| Gate toàn bộ artifact | Passed: 10/10 model SHA256 hợp lệ, load thành công, 5 cube mở được |
| Integrity gate regression | 6 passed: corrupt/missing model, manifest đổi, duplicate và path traversal bị từ chối |
| Forecast thật, 5 biến × 2 mode | 10/10 passed; regional horizon 18/12 tháng, map, intervals/probabilities, backtest, analogs, drivers, explanation, metadata |
| UI defaults, Reality Check, lỗi biên và NASA reference | Passed; xem JSON report |
| Forecast qua localhost HTTP socket thật | Passed: status/inference 2 mode, map, Reality Check; Satellite default map đã sửa |
| Docker/Linux build, cloud Node 22, cloud RAM/load, live Gemini, browser/public deployment | Not tested |

## 9. Lỗi thường gặp, logs và rollback

| Triệu chứng | Cách xử lý |
|---|---|
| Vercel không tìm thấy package.json/dist | Root Directory `web`, không phải repo root |
| Hosted build yêu cầu API origin | Đặt VITE_API_BASE_URL HTTPS đúng environment rồi redeploy |
| API nhận HTML/index.html | Kiểm tra build-time base URL; proxy dev không tồn tại trên Vercel |
| CORS error | Backend phải chứa exact frontend origin, không path/slash cuối; restart process |
| MODEL_NOT_READY | Cấp đúng 10 artifact, kiểm tra checksum và gate, build image mới |
| DATA_NOT_READY | Kiểm tra cube trong image, path Linux và biến override; không mount volume rỗng đè dữ liệu |
| OOM/cold grid timeout | Đo peak RAM, giữ 1 worker, provision RAM đủ và prewarm/cache trước traffic |
| Template fallback | Xem category log an toàn, model entitlement/key/quota trên backend; không in key |
| PDF/font/ảnh lỗi | Xem asset response, console và mở PDF thực tế; không chỉ kiểm tra homepage |

Vercel: Project → Deployments → deployment → Build Logs; frontend lỗi runtime xem browser Console/Network (frontend tĩnh không có backend function log). Backend: Render service → Logs/Metrics/Events. Chỉ chia sẻ category/request ID/status đã lọc; không gửi env dump, header authorization, signed URL hay raw exception có secret.

Rollback: chọn deployment tốt trước đó trong Vercel Deployments → Promote/Rollback theo UI/quyền gói; kiểm tra env/API contract. Backend chọn lại image **digest** đã kiểm thử và redeploy, giữ cube/model cùng phiên bản. Không reset/force-push Git. [Vercel rollback](https://vercel.com/docs/instant-rollback), [Render deploys](https://render.com/docs/deploys).

Git review trước khi chủ repo quyết định commit/push:

```powershell
git status --short --branch
git diff --check
git diff --stat
git diff -- .gitignore backend/.env.example web/.gitignore web/vite.config.ts
git ls-files '*env*' '*.joblib'
git check-ignore backend/.env web/.env.production data-pipeline/models/forecast_precip.joblib
```

Các file mới chưa tracked cần đọc trực tiếp hoặc mở trong VS Code Source Control. Không dùng `git add .` trước review. Audit secret tự động chỉ là kiểm tra giới hạn, không thay thế GitHub Secret Scanning/full-history audit trước công bố repo.

## 10. Những việc chủ repo cần duyệt/làm tiếp

1. Model đã được xác minh; chủ repo quyết định hosting/tài nguyên và ngân sách.
2. Review các file, tự commit/push cấu hình lên main hoặc cho phép agent thực hiện ở lượt sau.
3. Duyệt upload image/artifact vào registry và tạo backend hosting; nhập credentials trực tiếp trong dashboard.
4. Tạo Vercel project theo mục 5, cấu hình backend origin và CORS; cung cấp URL public để kiểm thử.
5. Phê duyệt riêng live Gemini nếu muốn xác nhận AI có thể phát sinh phí.

## 11. File thay đổi trong working tree

| File | Mục đích |
|---|---|
| `.gitignore` | Ignore env secrets và Python cache |
| `.dockerignore` | Loại secrets, raw data, venv, local artifacts khỏi build context |
| `.github/workflows/build-backend-image.yml` | Manual fetch/checksum/build/HTTP smoke và resource reports; chỉ validation, không publish |
| `backend/Dockerfile` | Image FastAPI đầy đủ NASA/model; gate offline và user không root |
| `backend/.env.example` | Mẫu CORS, cache và warm-up cho hosting |
| `backend/app/forecast_service.py` | Sửa tháng mặc định Satellite map và mô tả API |
| `backend/tests/test_forecast_api.py` | Regression cho tháng mặc định Satellite map |
| `data-pipeline/.gitignore` | Ignore manifest tải kèm model |
| `web/.gitignore` | Ignore env production/local, cho phép example |
| `web/.env.example` | Public API origin, không chứa secret |
| `web/vercel.json` | Build/install/dist và SPA routing |
| `web/vite.config.ts` | Chặn cấu hình API origin production thiếu/không HTTPS |
| `scripts/forecast_artifacts.py` | Verify checksum, manifest pin và bộ 10 model chính xác |
| `scripts/fetch-forecast-models.py` | gh download + verify trước khi cài model |
| `scripts/check-deployment.py` | Gate cube/model/metadata production |
| `scripts/smoke-forecast.py` | Smoke thật qua FastAPI endpoints, không gọi Gemini |
| `scripts/tests/test_forecast_artifacts.py` | 6 integrity tests bằng byte fixtures |
| `docs/FORECAST_DEPLOYMENT_VERIFICATION.json` | Kết quả định lượng smoke model thật |
| `DEPLOYMENT_VERCEL_GUIDE.md` | Hướng dẫn và trạng thái kiểm chứng |

File local ignored: 10 joblib + `SHA256SUMS.txt` trong `data-pipeline/models/`, gh portable và release staging trong `scripts/.local/`. Không có joblib nào được Git theo dõi. Scan giới hạn các tracked text file không tìm thấy bản sao key Gemini đang cấu hình; chưa chứng nhận toàn bộ Git history sạch secret. Cube và mã thuật toán trong `data-pipeline/pipeline` không có diff.
