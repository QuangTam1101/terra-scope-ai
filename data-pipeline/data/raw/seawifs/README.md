# SeaWiFS (NASA OB.DAAC) – chlorophyll-a vùng biển cửa sông Mekong

**Nguồn trên trang challenge:** "Time-Series Analysis of Remotely-Sensed SeaWiFS Chlorophyll in River-Influenced
Coastal Regions" (NASA resources). Đó là bài báo hướng dẫn tạo chuỗi thời gian và kiểm định ý nghĩa thống kê; file này
là loại dữ liệu bài báo dùng, cắt cho vùng biển trong bbox Mekong (vịnh Thái Lan, cửa sông Mekong, biển Đông ven Việt
Nam).
**Script:** `download/seawifs.py` (đăng nhập bằng `.env`).

| Mục | Giá trị |
|---|---|
| File | `seawifs_chlor_a_monthly_9km_mekong_199709-201012.nc` |
| Sản phẩm | SeaWiFS Level-3 mapped, trung bình tháng, 9 km (`SEASTAR_SEAWIFS_GAC.*.L3m.MO.CHL.chlor_a.9km.nc`), bản xử lý lại 2022 |
| Biến | `chlor_a`: nồng độ chlorophyll-a, mg/m³ (giá trị hợp lệ 0,001–100) |
| Lưới | 1/12° ≈ 9 km, 324 lat × 192 lon, tâm ô trong bbox 94–110°E, 8–35°N |
| Thời gian | 1997-09 → 2010-12: 157 tháng; `time` = ngày đầu tháng (lấy từ tên file) |

## Cần biết trước khi dùng

- **SeaWiFS ngừng hoạt động cuối 2010**, nên chỉ trùng 2001–2010 với các nguồn khác. Dùng làm ví dụ phương pháp
  của bài báo, hoặc thay bằng MODIS-Aqua nếu cần chuỗi dài hơn.
- **Thiếu 3 tháng**: 2008-02, 2008-03, 2009-05 (không có file từ NASA). Trục `time` bỏ qua các tháng này chứ không có
  lớp NaN thay thế; dùng `ds.resample(time="MS").mean()` nếu cần trục tháng đều.
- **Chỉ có trên biển**: ô đất liền và ô bị mây che là NaN. Khoảng 84 % giá trị là NaN; 13 358 trên 62 208 ô có ít
  nhất một tháng hợp lệ.
- Phân bố rất lệch (trung vị ~0,26, tối đa ~98 mg/m³ sát bờ); NASA hiển thị biến này theo thang log
  (`display_scale: log`), nên tính xu hướng trên `log10(chlor_a)`.
- Thuộc tính toàn cục (attrs) của file là của tháng đầu tiên (1997-09); chỉ `chlor_a` và các trục toạ độ đúng cho cả
  chuỗi.
