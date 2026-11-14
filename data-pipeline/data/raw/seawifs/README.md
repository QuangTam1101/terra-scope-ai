# SeaWiFS (NASA OB.DAAC) – chlorophyll-a mặt biển, toàn cầu, theo tháng

**Nguồn trên trang challenge:** "Time-Series Analysis of Remotely-Sensed SeaWiFS Chlorophyll in River-Influenced
Coastal Regions" (NASA resources). Đó là bài báo hướng dẫn dựng chuỗi thời gian và kiểm định ý nghĩa thống kê; đây là
loại dữ liệu bài báo dùng. **Script:** `download/seawifs.py` (đăng nhập bằng `.env`).

| Mục | Giá trị |
|---|---|
| File | `SEASTAR_SEAWIFS_GAC.<YYYYMMDD>_<YYYYMMDD>.L3m.MO.CHL.chlor_a.9km.nc`, một file mỗi tháng, nguyên như NASA phát hành (1,9 GB) |
| Sản phẩm | SeaWiFS Level-3 mapped, trung bình tháng, 9 km, bản xử lý lại 2022 (CMR `SeaWiFS_L3m_CHL`) |
| Biến | `chlor_a`: chlorophyll-a, mg/m³, fill `-32767`, miền hợp lệ 0,001–100; kèm `palette` (bảng màu hiển thị) |
| Lưới | 1/12° ≈ 9 km, lat 2160 × lon 4320, **lat giảm dần** (bắc → nam) |
| Thời gian | 1997-09 → 2010-12: 157 tháng. **File không có trục `time`**: tháng nằm trong tên file |

## Cần biết trước khi dùng

- **SeaWiFS ngừng hoạt động cuối 2010**: chỉ trùng 2001–2010 với các nguồn khác. Dùng làm ví dụ phương pháp của bài
  báo, hoặc thay bằng MODIS-Aqua nếu cần chuỗi dài hơn.
- **Thiếu 3 tháng**: 2008-02, 2008-03, 2009-05 (NASA không có file). `preprocess/clean.py` để NaN cho các tháng này.
- **Chỉ có trên biển**: ô đất liền và ô bị mây/băng che là fill.
- Phân bố rất lệch (trung vị vài phần mười, tối đa gần 100 mg/m³ sát bờ); NASA hiển thị theo thang log
  (`display_scale: log`), nên tính xu hướng trên `log10(chlor_a)`.
- Tải bằng link có `rel` kết thúc `/data#` trong CMR; link `service#` là OPeNDAP, trả 429 khi tải nhiều file.
