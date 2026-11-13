# 05 — Machine Learning Feasibility Report (AppEEARS + Giovanni) & Contradiction Hunter

> **Câu hỏi của báo cáo:**
> 1. Với hai nguồn dữ liệu đã chọn (AppEEARS, Giovanni), **những bài toán ML/thống kê nào làm được** trong 39 giờ, ở mức nào?
> 2. Feature **Contradiction Hunter** (quét để tìm hai nơi có diễn biến ngược nhau về thời tiết, khí hậu, lượng mưa, đặc điểm địa lý…) làm thế nào, và làm sao chắc "mâu thuẫn" là **thật**, không phải nhiễu thống kê?
>
> **Kết luận ngắn: khả thi.**
> - Lõi là **thống kê + tìm kiếm cặp**. ML chỉ ở mức nhẹ (k-NN, KMeans) và **không cần deep learning**.
> - **Rủi ro lớn nhất là dương tính giả.** Quét 64.800 ô lưới 1° toàn cầu chắc chắn tìm thấy "mâu thuẫn" chỉ do ngẫu nhiên. Mục 5 dành cho cách chống lại điều đó.
> - **Cả hai nguồn cùng nằm trên một lưới toàn cầu 1°** (01, mục 5):
>   - Giovanni qua Harmony HOSS: **lượng mưa, ẩm đất, nhiệt độ không khí, bốc hơi** trên cả lưới (P0). Contradiction Hunter cho lượng mưa chạy được **toàn cầu**.
>   - AppEEARS: **NDVI, LST, ET** qua point request tại tâm các ô đất liền (P1).
>
> **Định nghĩa Contradiction Hunter (team chốt):**
> - **Tự tìm** các khu vực có xu hướng biến đổi **trái ngược nhau**.
> - Ví dụ: khu vực A **lượng mưa tăng**, khu vực B **giảm**.
> - **So sánh và kiểm định** xem sự khác biệt có thực sự **đáng tin cậy** không.
>
> → Đây là **loại A** (mục 4), làm ở mức **P0**, chạy được cho **mọi biến**, kể cả lượng mưa.
> - **Khu vực không cho trước:** ô lưới significant cùng chiều, liền kề được gom thành **điểm nóng**.
> - Người dùng cũng chọn được **hai vùng bất kỳ** để so sánh.
> - Các loại B, C, D là mở rộng.
>
> **Code trong báo cáo đã chạy thử** cùng script kiểm thử của 03 (3 khối: z-score, FDR, hoán vị + Sen) ✅.

---

## 1. Dữ liệu có gì, và ML làm được gì với từng loại

### 1.1 Đặc tính dữ liệu quyết định phương pháp

| Biến | Nguồn | Phủ không gian trong pipeline | Đặc tính quan trọng cho ML |
|---|---|---|---|
| `ndvi` | AppEEARS MOD13A3 | **Lưới toàn cầu** (point, P1) + vùng mẫu | Có mùa mạnh; bị mây (thiếu dữ liệu theo mùa); giới hạn trên ~0.9 (bão hoà ở rừng rậm) |
| `lst_day`, `lst_night` | AppEEARS MOD11A2 | **Lưới toàn cầu** (point, P1) + vùng mẫu | Chỉ đo khi trời quang (clear-sky bias); Terra trôi quỹ đạo gần đây (03, K7) |
| `et`, `pet`, `et_pet_ratio` | AppEEARS MOD16A2GF | **Lưới toàn cầu** (point, P1) + vùng mẫu | Sản phẩm **mô hình hoá**, đã lấp khoảng trống → ít thiếu dữ liệu; `et_pet_ratio` là chỉ số khô hạn |
| `land_cover`, `elevation` | AppEEARS MCD12Q1, SRTM | Thuộc tính tĩnh | Dùng làm **đặc trưng** để tìm "song sinh", không phải chuỗi thời gian; SRTM chỉ ~60°N–56°S ⚠️ |
| `precip` | Giovanni IMERG | **Lưới toàn cầu** (HOSS, P0) + vùng mẫu | Phân phối lệch phải (nhiều tháng ít mưa, ít tháng mưa rất lớn) → so bằng anomaly/hạng tốt hơn so trung bình |
| `soil_moisture`, `tair_land`, `evap_gldas` | Giovanni GLDAS | **Lưới toàn cầu** (HOSS, P0; `evap_gldas` P1) + vùng mẫu | Mô hình, không bị mây; **chỉ đất liền**, từ 60°S lên |
| `t2m` | Giovanni MERRA-2 | **Lưới toàn cầu** (HOSS, P0) + vùng mẫu | Tái phân tích, toàn cầu, đều đặn |

**Khối lượng dữ liệu:**
- Mỗi biến một cube `(288 tháng × 180 × 360 ô)`, float32 ≈ **75 MB**. 10 biến ≈ 750 MB trên đĩa, nạp từng biến khi cần, vừa RAM laptop.
- Vùng mẫu: vài vùng × 10 biến × 288 tháng, khoảng **nghìn dòng**.
- Như vậy dữ liệu **nhỏ** với ML hiện đại, và đó là một lý do nữa để không dùng deep learning.

### 1.2 Bảng khả thi theo bài toán

| Bài toán | Biến | Chế độ | Phương pháp | Khả thi trong hackathon? | Ưu tiên |
|---|---|---|---|---|---|
| Xu hướng 24 năm có ý nghĩa không | Tất cả biến chuỗi | Vùng, lưới | Seasonal Mann-Kendall + Sen (thống kê) | ✅ Có | P0 |
| Tháng nào bất thường | Tất cả | Vùng, lưới | z-score theo tháng của chính nơi đó | ✅ Có | P1 |
| **Contradiction Hunter A** (xu hướng ngược) | Mọi biến chuỗi (P0: precip, soil_moisture, tair_land, t2m) | Lưới toàn cầu (điểm nóng) + 2 vùng người dùng chọn | Trend + FDR + gom điểm nóng + kiểm định khác biệt | ✅ Có, code + test đạt | **P0** |
| **Contradiction Hunter C** ("song sinh" ngược) | + DEM, land cover | Lưới | **k-NN** (scikit-learn) | ✅ Có | **P1** |
| Vùng khí hậu – địa hình (tô màu bản đồ) | Đặc trưng tĩnh + khí hậu nền | Lưới | **KMeans** | ✅ Có | P1 (phụ) |
| **Contradiction Hunter B** (dị thường ngược cùng tháng) | ndvi, lst, et | Lưới | z-score + gộp cụm không gian | ✅ Có, tốn công gộp cụm | P2 |
| **Contradiction Hunter D** (mâu thuẫn giữa biến) | AppEEARS + Giovanni | Lưới, vùng | Tương quan anomaly, luật vật lý | ⚠️ Làm được bản đơn giản | P2 |
| "Biến nào giải thích NDVI?" | ndvi ~ precip, t2m, soil_moisture | Vùng | Hồi quy tuyến tính trên anomaly | ⚠️ Có, nhưng dễ bị hiểu thành nhân quả | P2, diễn đạt cẩn thận |
| Dự báo tương lai | — | — | — | ❌ Không: ngoài phạm vi challenge, 288 điểm/chuỗi quá ít | Không làm |
| Deep learning / embedding | — | — | — | ❌ Không: dữ liệu nhỏ, không giải thích được, tốn thời gian | Không làm |

---

## 2. Quyết định nền tảng: so sánh **anomaly**, không so giá trị tuyệt đối

Đây là quyết định quan trọng nhất của Contradiction Hunter.

**Vấn đề:** trên quy mô toàn cầu, mùa ở **Bắc và Nam bán cầu ngược nhau**. Tháng 1 là giữa mùa đông ở Moscow, giữa mùa hè ở Sydney. So LST tuyệt đối thì mỗi năm ta lại "phát hiện" một mâu thuẫn khổng lồ, nhưng đó là kiến thức phổ thông. Lượng mưa cũng vậy: vùng gió mùa và vùng Địa Trung Hải có mùa mưa ngược nhau một cách bình thường.

**Giải pháp:** với mỗi nơi, mỗi biến, so với **khí hậu của chính nơi đó** (trung bình và độ lệch chuẩn của cùng tháng qua các năm):

```
z(nơi, tháng t) = (giá_trị(t) − TB các năm cùng tháng) / độ lệch chuẩn các năm cùng tháng
```

`z = +2` nghĩa là "cao bất thường **so với chính nơi này** vào thời điểm này trong năm". Nhịp mùa của hai bán cầu tự triệt tiêu.

**Code:** [`pipeline/contradictions.py`](../pipeline/contradictions.py) → `monthly_z()` (test: `tests/test_contradictions.py`)

- Loại A dùng xu hướng (Sen's slope). Bản thân Seasonal MK đã miễn nhiễm với chu kỳ mùa.
- Loại B, C, D dùng `z`.
- *Lượng mưa:* phân phối lệch, nên z của tháng mưa cực lớn có thể rất cao. Với `precip`, có thể dùng thêm hạng phân vị (percentile) để đọc dễ hơn 🔬 (03, K13).

---

## 3. Dữ liệu đầu vào

| Đầu vào | Từ đâu | Ghi chú |
|---|---|---|
| **Cube Giovanni** `precip`, `soil_moisture`, `tair_land`, `t2m` (+ `evap_gldas`) | Harmony HOSS → `bin_to_grid` 1° (01, S1–S7) | Mỗi ô = **trung bình khối** các ô gốc 0.1°–0.5° |
| **Cube AppEEARS** `ndvi`, `lst_day`, `lst_night`, `et`, `pet` (+ `et_pet_ratio`) | Point request tại tâm ô đất liền → `points_to_cube` | Mỗi ô là **1 pixel tại tâm ô**, không phải trung bình ô 🔬 (03, K6) |
| Xu hướng từng ô: Sen's slope, z, p, **q (FDR)** | `grid_trend()`, tính khi gọi cho khoảng thời gian người dùng chọn | ~4 s toàn cầu × 24 năm |
| Độ cao, thảm phủ | SRTMGL3_DEM, MCD12Q1 `LC_Type1` ✅ (vùng mẫu; trên lưới cần thêm point tĩnh, P1) | Thuộc tính tĩnh cho loại C |
| Khí hậu nền: trung bình năm, biên độ mùa; chênh ngày–đêm LST; ET/PET trung bình; mưa trung bình năm | Tính từ các cube | Không cần tải thêm |

*Vì sao lấy lưới Giovanni bằng HOSS thay vì gọi Giovanni từng điểm:* 15.000 điểm × 5 biến ≈ 75.000 lời gọi `/timeseries`, chắc chắn vượt quota. HOSS trả cả lưới gốc trong **mỗi biến một job**. Team chốt cách này ngày 13/11.

---

## 4. Phương pháp cho từng loại mâu thuẫn

| Loại | Định nghĩa | Ví dụ câu chuyện | Giá trị kể chuyện |
|---|---|---|---|
| **A. Xu hướng ngược** | Cùng một biến, nơi X **tăng** có ý nghĩa, nơi Y **giảm** có ý nghĩa (2001–2024) | "LST ban ngày ở X tăng 0.6 °C/thập kỷ, ở Y giảm 0.4 °C/thập kỷ" | Cao, đúng câu chữ challenge: *"a variable can trend one way in one region and the opposite way in another"* |
| **B. Dị thường ngược cùng tháng** | Cùng tháng, X cao bất thường (z > +2), Y thấp bất thường (z < −2) | "7/2010: miền tây nước Nga nóng bất thường (z > +3) trong khi nơi khác mát bất thường" | Cao |
| **C. "Song sinh" trái ngược** | X, Y **giống nhau về địa lý** nhưng xu hướng ngược | "Hai đồng cỏ giống hệt nhau: một nơi xanh lên, một nơi khô đi" | **Cao nhất**: loại bỏ lời giải thích "vì chúng khác nhau" |
| **D. Mâu thuẫn giữa biến** | Tại cùng một nơi, hai biến lẽ ra cùng chiều lại ngược chiều | "Mưa tăng nhưng NDVI giảm" | Trung bình–cao, cần dữ liệu Giovanni |

### Loại A — Xu hướng ngược (thống kê, không cần ML) — **lõi của Contradiction Hunter**

Quy trình 5 bước, áp cho từng biến (lượng mưa, NDVI, LST, ET, ẩm đất, T2M…):

```
Bước 1 — Xu hướng từng ô:       grid_trend: Seasonal MK + Sen cho mọi ô 1° (khoảng thời gian chọn) → z, slope, p; FDR → q
Bước 2 — Tự tìm khu vực:         ô q < 0.05 CÙNG chiều, LIỀN KỀ (8 hướng) → điểm nóng; bỏ điểm nóng < 4 ô
                                   chuỗi TB cos(vĩ độ) mỗi điểm nóng → xu hướng lại + FDR
                                   S+ = điểm nóng tăng có q < 0.05;  S− = điểm nóng giảm có q < 0.05
Bước 3 — Ghép cặp:               mọi cặp (i ∈ S+, j ∈ S−); điểm = min(|z_i|, |z_j|); giữ top N mỗi phía
Bước 4 — Kiểm định KHÁC BIỆT:    D(t) = anomaly_i(t) − anomaly_j(t)
                                   H0: hai xu hướng bằng nhau  ⇔  D không có xu hướng
                                   p_diff  = Hamed-Rao MK trên D (hiệu chỉnh tự tương quan)
                                   Δslope  = Sen's slope của D  (= xu hướng i − xu hướng j, đơn vị/thập kỷ)
                                   CI 95%  = moving-block bootstrap (khối 12 tháng) phần dư của D
                                   ổn định = dấu xu hướng mỗi nơi giữ nguyên ở 2001–2012 và 2013–2024
Bước 5 — Kết luận:               FDR trên p_diff của mọi cặp → q_diff
                                   ĐÁNG TIN CẬY ⇔ q_diff < 0.05  VÀ  CI 95% không chứa 0  VÀ  ổn định
```

- *Vì sao kiểm định trên hiệu D thay vì so hai p-value:* "A tăng có ý nghĩa, B giảm có ý nghĩa" chưa chứng minh **khác biệt giữa A và B** có ý nghĩa. Lấy hiệu D thì biến động chung của hai nơi (ví dụ năm El Niño làm cả hai khô) bị triệt tiêu, chỉ còn phần khác nhau thật. Kiểm định trở nên chặt và đúng câu hỏi hơn.
- *Vì sao Hamed-Rao và block bootstrap:* các tháng liền nhau giống nhau (tự tương quan). Kiểm định thường sẽ "quá tự tin". Hamed-Rao hiệu chỉnh p-value; bootstrap theo khối 12 tháng giữ nguyên cấu trúc đó khi ước lượng CI.
- *Vì sao kiểm tra hai nửa giai đoạn:* loại các "xu hướng" thực ra là **một bước nhảy** (ví dụ đổi cảm biến, một năm cực đoan ở cuối chuỗi).
- *Vì sao gom điểm nóng thay vì ghép từng ô:*
  - Ghép thẳng từng ô cho hàng nghìn cặp gần như trùng nhau, vì đó là các ô cạnh nhau của cùng một vùng.
  - Điểm nóng là "khu vực" theo đúng nghĩa người dùng hiểu (có bbox để vẽ lên bản đồ), và giảm số phép kiểm định.
- 🔬 (03, K19) *Chọn rồi mới kiểm định:* điểm nóng được chọn **vì** significant, nên p_diff của cặp tăng × giảm gần như luôn nhỏ. Giá trị thật của bước 4 nằm ở **độ lớn và CI** của khác biệt, ở **độ ổn định hai nửa**, và ở **lớp 2 hoán vị** (mục 5): số điểm nóng thật so với khi xáo năm.
- *Hai vùng người dùng chọn* (`compare_regions`): bỏ qua bước 1–3, chạy thẳng bước 4 trên chuỗi hai vùng. Không có vấn đề "chọn rồi mới kiểm định", vì vùng được chọn trước khi xem kết quả.
- *Cách hiển thị trên website:* "Lượng mưa ở A tăng 12 mm/tháng/thập kỷ, ở B giảm 10; khác biệt 22 (CI 95%: 15–29), q = 0.001, **đáng tin cậy**".

- *Vì sao `min`:* một phía rất mạnh ghép với một phía vừa qua ngưỡng thì không thuyết phục.
- *Vì sao bắt buộc q (FDR) thay vì p:* với 64.800 ô, nếu **không nơi nào** có xu hướng thật thì vẫn có ~5% × 64.800 ≈ **3.200 ô** mỗi biến có p < 0.05 chỉ do ngẫu nhiên. Ghép chúng thành cặp cho hàng triệu "mâu thuẫn" giả. FDR kiểm soát tỷ lệ phát hiện sai trong số kết quả được báo cáo. Đo trên lưới nhiễu thuần 180 × 360: **0 ô** significant sau FDR ✅.
- *Chi phí:* top N cặp theo `min` chắc chắn nằm trong top N của mỗi phía, nên chỉ cần sắp xếp hai danh sách. Mất vài giây.

**Code:**
- Toàn bộ: [`pipeline/contradictions.py`](../pipeline/contradictions.py) → `hunt_global()`.
- Bước 1: [`pipeline/grid.py`](../pipeline/grid.py) → `grid_trend()`.
- Bước 2: `hotspot_regions()`, `hotspot_obs()`, `trends.trends_table()`.
- Bước 3–5: `find_opposite_trends()`, gọi `scan_type_a()` và `pair_difference_test()`.
- Cho web: `api.find_contradictions()`, `api.compare_regions()`.

**Test:**
- `tests/test_contradictions.py`: 2 nơi mưa tăng, 2 nơi giảm, 2 nơi chỉ nhiễu, có tín hiệu chung kiểu ENSO → tìm đúng 4 cặp, không báo nhầm cặp nhiễu, CI chứa hiệu thật.
- `tests/test_grid.py`: lưới có một khối tăng, một khối giảm → tìm đúng hai điểm nóng và cặp đáng tin cậy; lưới nhiễu thuần → không có điểm nóng nào.

*Ví dụ kiểm tra* (đã test): p = [0.01, 0.04, 0.03, 0.005] → q = [0.02, 0.04, 0.04, 0.02].

### Loại C — "Song sinh" trái ngược (ML nhẹ: k-NN)

```
1. Vector đặc trưng mỗi điểm (chuẩn hoá z-score từng cột):
   [độ cao, NDVI TB, biên độ mùa NDVI, LST ngày TB, chênh ngày–đêm LST TB, ET TB năm, ET/PET TB]
   + ràng buộc: CÙNG lớp LC_Type1
2. k-nearest neighbors (k = 10) trong không gian đặc trưng (scikit-learn NearestNeighbors)
3. Giữ các cặp song sinh có xu hướng ngược dấu (cả hai q < 0.05)
4. Điểm = độ_tương_đồng(i, j) × min(|z_slope_i|, |z_slope_j|)
```

**Code:** [`pipeline/contradictions.py`](../pipeline/contradictions.py) → `twins_type_c()` (test: `tests/test_contradictions.py`)

- *Vì sao chênh ngày–đêm LST và ET/PET:* hai đặc trưng này phân biệt khí hậu khô với ẩm. Sa mạc có chênh ngày–đêm lớn và ET/PET thấp. Khi có cube IMERG thì thêm **mưa trung bình năm** vào vector đặc trưng.
- *Vì sao không dùng khoảng cách địa lý làm "giống nhau":* hai điểm cạnh nhau có thể một ở đồng bằng, một ở núi. Hai đồng cỏ giống nhau ở hai châu lục khác nhau mà ngược xu hướng chính là cặp thú vị nhất.
- *Điểm thiếu độ cao* (ngoài ~60°N–56°S): chạy k-NN không có cột độ cao cho nhóm này, hoặc loại khỏi loại C ⚠️.

| Lựa chọn | Ưu | Nhược | Đề xuất |
|---|---|---|---|
| **k-NN** | Đơn giản; mỗi điểm có "song sinh" riêng; dễ giải thích ("10 nơi giống nhất") | Phụ thuộc cách chuẩn hoá | ✅ **Chọn** |
| KMeans (k ≈ 8–12) | Ra "vùng khí hậu" đẹp để tô bản đồ | Phải chọn k; điểm ở biên cụm bị chia khiên cưỡng | Dùng phụ, để tô màu |
| HDBSCAN | Tự chọn số cụm | Thêm phụ thuộc, khó giải thích cho học sinh | Không |
| Deep learning / embedding | — | Dữ liệu nhỏ, không giải thích được | **Không** |

### Loại B — Dị thường ngược cùng tháng (P2)

```
Với mỗi biến v, mỗi tháng t: cặp (i, j) với z_i(t) > +2 và z_j(t) < −2
Gộp theo sự kiện: mỗi phía là một CỤM điểm lân cận cùng dấu
Xếp hạng theo |z_i| + |z_j| và diện tích cụm
```

**Code:** [`pipeline/contradictions.py`](../pipeline/contradictions.py) → `anomaly_events_type_b()` (DBSCAN haversine; test: `tests/test_contradictions.py`)

**Cảnh báo định lượng.** Nếu dị thường độc lập thì:
- P(z > 2) ≈ 2.275%.
- P(một cặp có z > 2 và z < −2 trong cùng tháng) ≈ 0.02275² ≈ 0.052%.

Số "sự kiện" thuần ngẫu nhiên kỳ vọng:

```
Số cặp điểm   = 15.000 × 14.999 / 2               ≈ 1,12 × 10⁸
Mỗi biến      = 1,12 × 10⁸ × 288 tháng × 0,00052   ≈ 1,7 × 10⁷ "sự kiện"
4 biến lưới   = 4 × 1,7 × 10⁷                      ≈ 6,7 × 10⁷ "sự kiện"
```

Tức là **hàng chục triệu "sự kiện" ngẫu nhiên**. Vì vậy loại B **không thể** báo "có ý nghĩa thống kê" theo từng cặp. Chỉ trình bày như **top sự kiện nổi bật**, và gộp cụm không gian là **bắt buộc**. Đây là lý do loại B xếp P2.

### Loại D — Mâu thuẫn giữa các biến (P2)

Loại D cần hiểu vật lý để biết thế nào là "lẽ ra". Nó cần cả hai nguồn trên cùng lưới:

| Cặp biến | "Lẽ ra" (thường gặp) | Mâu thuẫn đáng chú ý | Lời giải thích có thể (không khẳng định) |
|---|---|---|---|
| `precip` ↑ (Giovanni) vs `ndvi` | Nơi thiếu nước: mưa tăng → NDVI tăng | **Mưa tăng nhưng NDVI giảm** | Đô thị hoá, mất rừng, ngập úng, cháy |
| `soil_moisture` ↓ (Giovanni) vs `et` (AppEEARS) | Đất khô hơn → bốc thoát hơi giảm | **Ẩm đất giảm nhưng ET tăng** | Tưới tiêu lấy nước ngầm |
| `lst_day` (AppEEARS) vs `t2m` (Giovanni) | Cùng chiều | **LST tăng nhanh hơn hẳn T2M** | Mất thảm thực vật, đô thị hoá (bề mặt nóng lên hơn không khí) |
| `lst_day` vs `et` (chỉ AppEEARS, chạy được trên lưới) | Nơi thiếu nước (ET/PET thấp): tương quan **âm**. Nơi thiếu năng lượng (lạnh): tương quan **dương** | Nơi thiếu nước mà tương quan dương | Tưới tiêu, đổi cây trồng |

- Tính trên **anomaly** của cả hai biến, theo từng ô lưới hoặc từng vùng người dùng chọn.
- Rủi ro diễn giải sai rất cao (độ trễ: NDVI phản ứng với mưa trễ 1–3 tháng; ranh giới giữa hai chế độ). Template **chỉ nêu hiện tượng**, kèm "các khả năng cần kiểm chứng".

---

## 5. Làm sao biết mâu thuẫn là THẬT?

Ba lớp bảo vệ:

**Lớp 1: FDR (Benjamini–Hochberg).** Bắt buộc cho loại A và C (code ở trên).

**Lớp 2: kiểm định hoán vị, "nếu không có gì thật, ta sẽ tìm thấy bao nhiêu?"**

```
Lặp 100 lần:
  Xáo trộn thứ tự CÁC NĂM (giữ tháng trong năm; MỌI ĐIỂM dùng CÙNG một hoán vị)
  → tính lại xu hướng → chạy lại quét loại A/C → đếm số cặp
So sánh số cặp thật với phân phối số cặp khi xáo trộn
```

- Thật 40 cặp, xáo trộn trung bình 3 → có tín hiệu thật. Xáo trộn cũng ~40 → chỉ là nhiễu, **không trình bày**.
- *Vì sao cùng một hoán vị cho mọi điểm:* các điểm gần nhau tương quan với nhau (một đợt nắng nóng phủ cả vùng). Xáo riêng từng điểm sẽ phá tương quan đó, khiến dữ liệu xáo trộn "sạch" hơn thực tế, và ta đánh giá thấp mức nhiễu.
- *Làm sao cho nhanh:* có hai cách.
  - `grid_trend` đã vector hoá: ~4 s cho toàn cầu × 24 năm ✅, nên 100 lần hoán vị ≈ **7 phút mỗi biến**. Cách này đếm được số điểm nóng, đúng như quy trình thật.
  - Nhanh hơn: **Sen's slope trên trung bình năm** (`sen_slope_per_year`), ~0.2 s mỗi lần cho 15.000 chuỗi ✅.

**Code:** [`pipeline/contradictions.py`](../pipeline/contradictions.py) → `permute_years()`, `sen_slope_per_year()` (test: `tests/test_contradictions.py`)

**Lớp 3: kiểm tra bằng sự kiện đã biết.** Pipeline phải "thấy" lại các sự kiện ai cũng biết. Không thấy thì pipeline có lỗi.

| Sự kiện | Biến AppEEARS (lưới) | Biến Giovanni (lưới) | Kỳ vọng |
|---|---|---|---|
| Nắng nóng Nga 7–8/2010 | `lst_day` z ≫ 0; `ndvi` z < 0 | `t2m` (MERRA-2) z ≫ 0 | Các điểm quanh Moscow nổi bật trong top loại B |
| Hạn hán + cháy rừng Úc 2019–20 | `ndvi` z < 0 (12/2019–2/2020); `lst_day` z > 0 | `precip` (IMERG) thâm hụt mạnh năm 2019 | Đông nam Úc: NDVI âm mạnh đi cùng mưa thấp |
| Lũ miền Trung Việt Nam 10/2020 | (`ndvi` có thể giảm) | `precip` (IMERG) z ≫ 0 tại các ô Quảng Trị – Thừa Thiên Huế | Tháng 10/2020 nổi bật trong chuỗi mưa |

🔬 Đăng bổ sung 1–2 sự kiện (03, K15).

---

## 6. Đầu ra

`api.find_contradictions(biến, start, end)` → `web/data/contradictions_<biến>.json` (bản mặc định 2001–2024; khoảng khác tính khi gọi):

```json
{
  "variable": "precip", "name": "Lượng mưa", "unit": "mm/month",
  "source": "GPM IMERG Final Monthly V07 (GPM_3IMERGM.07), NASA GES DISC qua Giovanni/Harmony",
  "start": null, "end": null,
  "hotspots": [
    {"region_id": "h1_up", "label": 1, "direction": "up", "n_cells": 23,
     "bbox": [-62.0, -12.0, -55.0, -7.0], "median_slope_per_decade": 9.8},
    {"region_id": "h7_down", "label": 7, "direction": "down", "n_cells": 11,
     "bbox": [28.0, -4.0, 32.0, 0.0], "median_slope_per_decade": -7.1}
  ],
  "pairs": [
    {"variable": "precip", "region_up": "h1_up", "region_down": "h7_down", "z_up": 4.1, "z_down": -3.6,
     "slope_diff_per_decade": 16.9, "ci95_low": 11.2, "ci95_high": 22.5, "p_diff": 0.0004,
     "stable_halves": true, "q_diff": 0.002, "reliable": true}
  ],
  "method": "Grid trend + FDR → gom ô liền kề cùng chiều → kiểm định khác biệt từng cặp (docs/05)",
  "limitations": ["Xu hướng quan sát được không chứng minh nguyên nhân.", "…"]
}
```

*(Số liệu là giả, chỉ minh hoạ định dạng.)*

- `hotspots[].bbox` để vẽ khung điểm nóng lên bản đồ; `region_up` / `region_down` trỏ tới `hotspots[].region_id`.
- `reliable = q_diff < 0.05` **và** CI 95% không chứa 0 **và** `stable_halves`.
- Sẽ **thêm** (không đổi tên trường cũ):
  - `explanation_vi`: câu giải thích template (04, CH-5);
  - `permutation_baseline`: `{"real_hotspots", "null_mean", "null_p95"}` (lớp 2, P1–P2);
  - `type`: `trend_opposite` (A) · `twin_opposite` (C) · `anomaly_opposite` (B) · `cross_variable` (D) khi có các loại khác.
- `api.compare_regions(...)` trả cùng khối kết quả cho hai vùng người dùng chọn: `region_a`, `region_b`, `difference`, `reliable` (01, mục 7).

**Câu giải thích sinh bằng template có điền số, không dùng mô hình ngôn ngữ.**
- *Vì sao:* template không thể bịa số hay bịa nguyên nhân. Website khoa học nói sai một con số là mất uy tín.
- Template chỉ mô tả **cái gì** và **bao nhiêu**, **không** khẳng định **tại sao** (03, K14).
- AI Earth Detective được diễn đạt lại, nhưng chỉ dùng số có trong kết quả (01, mục 7).

---

## 7. Đánh giá khả thi

| Hạng mục | Loại A | Loại C | Loại B | Loại D |
|---|---|---|---|---|
| Cần ML? | Không (thống kê + gom cụm liền kề) | Có, nhẹ (k-NN, KMeans) | Không (z + gộp cụm) | Không (tương quan + luật vật lý) |
| Dữ liệu | Cube mọi biến | + DEM, `LC_Type1` | Cube | Cube của cả hai nguồn |
| Trạng thái | ✅ code + test (`hunt_global`, `compare_regions`) | Có hàm `twins_type_c` | Có hàm `anomaly_events_type_b` | Chưa làm |
| Thời gian chạy | Vài giây đến vài chục giây mỗi biến (grid trend ~4 s + bootstrap các cặp) | Giây | Phút | Giây |
| Kiểm định | FDR + CI bootstrap + ổn định hai nửa + hoán vị | FDR + hoán vị | Chỉ xếp hạng sự kiện | Chỉ mô tả |
| Rủi ro chính | Dương tính giả; chọn rồi mới kiểm định | Chọn đặc trưng / chuẩn hoá | Bùng nổ số cặp ngẫu nhiên | Diễn giải sai nhân quả |
| Giá trị demo | Cao | **Rất cao** | Cao | Cao |
| **Khuyến nghị** | ✅ **P0** | P1 | P2 | P2 |

**Phụ thuộc then chốt:**
- Loại A cho biến Giovanni cần **cube HOSS** (04, T-4, đang tải từ 13/11).
- Biến MODIS cần **point request AppEEARS trên lưới**.
- Nếu HOSS bị chặn: loại A vẫn chạy bằng `compare_regions` trên vùng người dùng chọn, nhưng mất phần "tự tìm" toàn cầu cho lượng mưa (04, mục 6).

**Thư viện:** `numpy`, `pandas`, `xarray`, `scipy` (`ndimage.label` để gom ô liền kề), `pymannkendall`, `scikit-learn` (NearestNeighbors, KMeans, StandardScaler). Không cần GPU.

---

## 8. Những giới hạn phải nói rõ trên website

1. **Mâu thuẫn ≠ nguyên nhân.** Feature chỉ ra *nơi* và *mức độ*; *tại sao* cần nghiên cứu thêm.
2. **Lưới 1° (~111 km).** Vùng nhỏ hơn một ô không phân tích được. Ranh giới điểm nóng phụ thuộc lưới và ngưỡng q.
3. **Hai cách lấy giá trị ô khác nhau:**
   - Biến Giovanni là **trung bình khối** các ô gốc 0.1°–0.5°.
   - Biến MODIS là **một pixel** 1 km (ET 500 m) tại tâm ô (03, K6).
4. **LST là nhiệt độ bề mặt**, chỉ đo khi trời quang, không phải nhiệt độ không khí. ET, GLDAS, MERRA-2 là sản phẩm **mô hình hoá / tái phân tích**.
5. **GLDAS chỉ có đất liền**, từ 60°S lên; IMERG, MERRA-2 phủ cả biển, nên ô ven biển lẫn biển (03, K16).
6. **Phạm vi DEM:** SRTM ~60°N–56°S; điểm vĩ độ cao tham gia loại C với ít đặc trưng hơn.
7. **24 năm:** xu hướng có thể là một phần của dao động dài hơn (ENSO, các pha nhiều thập kỷ).
8. **Chưa có chlorophyll:** hai nguồn đã chọn không có dữ liệu quan sát màu nước biển.

---

## 9. Việc cần team quyết

| # | Câu hỏi | Đề xuất mặc định |
|---|---|---|
| 1 | Loại mâu thuẫn nào hiển thị? | A (C, B, D nếu kịp) |
| 2 | Giới hạn khoảng cách giữa hai điểm nóng? | Không giới hạn mặc định; frontend có bộ lọc |
| 3 | Bao nhiêu cặp hiển thị? | Top 10 mỗi biến (`find_contradictions(top_n=10)`) |
| 4 | Kích thước tối thiểu của điểm nóng | 4 ô 1° liền kề (`min_cells=4`) 🔬 (03, K20) |
| 5 | Ngưỡng z cho loại B | ±2 |
| 6 | Đặc trưng "song sinh" | Độ cao, NDVI TB, biên độ mùa NDVI, LST ngày TB, chênh ngày–đêm LST, ET TB, ET/PET TB, mưa TB năm; cùng lớp `LC_Type1` |
| 7 | Lưới | 1° cho mọi biến (Giovanni: trung bình khối; MODIS: 1 pixel/ô); 0.5° nếu còn giờ |
| 8 | Số lần hoán vị | 100 |
