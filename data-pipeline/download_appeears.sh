#!/bin/sh
# Gửi các request AppEEARS cho VÙNG MẪU R1–R4 (docs/04, mục 3c) song song, chạy nền, mỗi request 1 log.
# Vùng mẫu dùng để kiểm chứng cube lưới toàn cầu; phân tích trên web đọc cube (download_grid.py).
# Tài khoản đọc từ file .env (EARTHDATA_USER=..., EARTHDATA_PASS=...). Chạy:   sh download_appeears.sh
# Xem tiến độ:  tail -f data/raw/appeears/*/log.txt
# Nếu mất kết nối giữa chừng:  .venv/bin/python appeears.py fetch $(cat data/raw/appeears/R1_mvp_MOD13A3/task_id.txt) data/raw/appeears/R1_mvp_MOD13A3
set -e
cd "$(dirname "$0")"
PY=.venv/bin/python
$PY -c "import appeears; appeears.login()" || exit 1   # kiểm tra đăng nhập trước khi gửi request

OUT=data/raw/appeears
S=01-01-2001; E=12-31-2024

start() {  # start NAME POLYGONS LAYERS START END
  mkdir -p "$OUT/$1"
  nohup $PY -u appeears.py area "$2" "$3" "$4" "$5" "$OUT/$1" netcdf4 native > "$OUT/$1/log.txt" 2>&1 &
  echo "đã gửi $1 (log: $OUT/$1/log.txt)"
}

R=config/regions.geojson   # thêm vùng ở bất kỳ đâu trên thế giới vào file này
start R1_mvp_MOD13A3   $R MOD13A3.061:_1_km_monthly_NDVI,MOD13A3.061:_1_km_monthly_VI_Quality $S $E
# R2 tách ngày / đêm: gộp chung 4 layer bị AppEEARS từ chối (vượt giới hạn số file 31.4%, 13/11)
start R2a_mvp_MOD11A2_day   $R MOD11A2.061:LST_Day_1km,MOD11A2.061:QC_Day     $S $E
start R2b_mvp_MOD11A2_night $R MOD11A2.061:LST_Night_1km,MOD11A2.061:QC_Night $S $E
start R3_mvp_MOD16A2GF $R MOD16A2GF.061:ET_500m,MOD16A2GF.061:ET_QC_500m,MOD16A2GF.061:PET_500m $S $E
# R4 tĩnh: SRTM chụp 02/2000 nên khoảng ngày bắt đầu từ 2000; MCD12Q1 có từ 2001 (mỗi năm 1 ảnh)
start R4_static        $R MCD12Q1.061:LC_Type1,SRTMGL3_NC.003:SRTMGL3_DEM 01-01-2000 $E
