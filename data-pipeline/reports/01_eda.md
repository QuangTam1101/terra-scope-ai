# EDA dữ liệu thô (sinh tự động bởi `preprocess/eda.py`)

Giá trị thô: chưa áp `scale_factor`, chưa đổi fill thành NaN.

## imerg_precip

- File: `data/raw/giovanni/GPM_3IMERGM_07_precipitation/*.nc4` (288 file)
- Thời gian: 2001-01-01 → 2024-12-01; 288 bước / 288 kỳ vọng; thiếu 0; trùng 0
- `Grid/precipitation` float32, trục (time=1, lon=3600 [-179.95 … 179.95, bước 0.0999908], lat=1800 [-89.95 … 89.95, bước 0.0999985]); thuộc tính: `{'units': 'mm/hr', '_FillValue': np.float32(-9999.9), 'CodeMissingValue': '-9999.9'}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-03-01, 2005-05-01, 2007-07-01, 2009-09-01, 2011-11-01, 2014-01-01, 2016-03-01, 2018-05-01, 2020-07-01, 2022-09-01, 2024-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| Grid/precipitation | 0.6254 | 0 | 0 | 0 | 0.044 | 0.604 | 3.218 | 0 | 6.803 | 0 |

## gldas_soilmoi0_10cm

- File: `data/raw/giovanni/GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst/*.nc4` (288 file)
- Thời gian: 2001-01-01 → 2024-12-01; 288 bước / 288 kỳ vọng; thiếu 0; trùng 0
- `SoilMoi0_10cm_inst` float32, trục (time=1, lat=600 [-59.875 … 89.875, bước 0.25], lon=1440 [-179.875 … 179.875, bước 0.25]); thuộc tính: `{'units': 'kg m-2', '_FillValue': np.float32(-9999.0), 'missing_value': np.float32(-9999.0)}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-03-01, 2005-05-01, 2007-07-01, 2009-09-01, 2011-11-01, 2014-01-01, 2016-03-01, 2018-05-01, 2020-07-01, 2022-09-01, 2024-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| SoilMoi0_10cm_inst | 71.9 | 0 | 2 | 3.335 | 24.86 | 100 | 100 | 0 | 3.952 | 100 |

## gldas_soilmoi10_40cm

- File: `data/raw/giovanni/GLDAS_NOAH025_M_2_1_SoilMoi10_40cm_inst/*.nc4` (288 file)
- Thời gian: 2001-01-01 → 2024-12-01; 288 bước / 288 kỳ vọng; thiếu 0; trùng 0
- `SoilMoi10_40cm_inst` float32, trục (time=1, lat=600 [-59.875 … 89.875, bước 0.25], lon=1440 [-179.875 … 179.875, bước 0.25]); thuộc tính: `{'units': 'kg m-2', '_FillValue': np.float32(-9999.0), 'missing_value': np.float32(-9999.0)}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-03-01, 2005-05-01, 2007-07-01, 2009-09-01, 2011-11-01, 2014-01-01, 2016-03-01, 2018-05-01, 2020-07-01, 2022-09-01, 2024-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| SoilMoi10_40cm_inst | 71.9 | 0 | 6 | 22.43 | 73.88 | 300 | 300 | 0 | 0 |  |

## gldas_soilmoi40_100cm

- File: `data/raw/giovanni/GLDAS_NOAH025_M_2_1_SoilMoi40_100cm_inst/*.nc4` (288 file)
- Thời gian: 2001-01-01 → 2024-12-01; 288 bước / 288 kỳ vọng; thiếu 0; trùng 0
- `SoilMoi40_100cm_inst` float32, trục (time=1, lat=600 [-59.875 … 89.875, bước 0.25], lon=1440 [-179.875 … 179.875, bước 0.25]); thuộc tính: `{'units': 'kg m-2', '_FillValue': np.float32(-9999.0), 'missing_value': np.float32(-9999.0)}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-03-01, 2005-05-01, 2007-07-01, 2009-09-01, 2011-11-01, 2014-01-01, 2016-03-01, 2018-05-01, 2020-07-01, 2022-09-01, 2024-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| SoilMoi40_100cm_inst | 71.9 | 0 | 12 | 39.85 | 140.5 | 600 | 600 | 0 | 0 |  |

## gldas_soilmoi100_200cm

- File: `data/raw/giovanni/GLDAS_NOAH025_M_2_1_SoilMoi100_200cm_inst/*.nc4` (288 file)
- Thời gian: 2001-01-01 → 2024-12-01; 288 bước / 288 kỳ vọng; thiếu 0; trùng 0
- `SoilMoi100_200cm_inst` float32, trục (time=1, lat=600 [-59.875 … 89.875, bước 0.25], lon=1440 [-179.875 … 179.875, bước 0.25]); thuộc tính: `{'units': 'kg m-2', '_FillValue': np.float32(-9999.0), 'missing_value': np.float32(-9999.0)}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-03-01, 2005-05-01, 2007-07-01, 2009-09-01, 2011-11-01, 2014-01-01, 2016-03-01, 2018-05-01, 2020-07-01, 2022-09-01, 2024-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| SoilMoi100_200cm_inst | 71.9 | 0 | 20 | 83.46 | 269.3 | 1000 | 1000 | 0 | 0 |  |

## gldas_rootmoist

- File: `data/raw/giovanni/GLDAS_NOAH025_M_2_1_RootMoist_inst/*.nc4` (288 file)
- Thời gian: 2001-01-01 → 2024-12-01; 288 bước / 288 kỳ vọng; thiếu 0; trùng 0
- `RootMoist_inst` float32, trục (time=1, lat=600 [-59.875 … 89.875, bước 0.25], lon=1440 [-179.875 … 179.875, bước 0.25]); thuộc tính: `{'units': 'kg m-2', '_FillValue': np.float32(-9999.0), 'missing_value': np.float32(-9999.0)}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-03-01, 2005-05-01, 2007-07-01, 2009-09-01, 2011-11-01, 2014-01-01, 2016-03-01, 2018-05-01, 2020-07-01, 2022-09-01, 2024-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| RootMoist_inst | 71.9 | 0 | 2 | 4.034 | 241.4 | 779.1 | 908.3 | 0 | 3.952 | 100 |

## gldas_tair_f

- File: `data/raw/giovanni/GLDAS_NOAH025_M_2_1_Tair_f_inst/*.nc4` (288 file)
- Thời gian: 2001-01-01 → 2024-12-01; 288 bước / 288 kỳ vọng; thiếu 0; trùng 0
- `Tair_f_inst` float32, trục (time=1, lat=600 [-59.875 … 89.875, bước 0.25], lon=1440 [-179.875 … 179.875, bước 0.25]); thuộc tính: `{'units': 'K', '_FillValue': np.float32(-9999.0), 'missing_value': np.float32(-9999.0)}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-03-01, 2005-05-01, 2007-07-01, 2009-09-01, 2011-11-01, 2014-01-01, 2016-03-01, 2018-05-01, 2020-07-01, 2022-09-01, 2024-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| Tair_f_inst | 71.53 | 0 | 224.7 | 240.1 | 286.5 | 307.7 | 314.6 | 0 | 0 |  |

## gldas_evap

- File: `data/raw/giovanni/GLDAS_NOAH025_M_2_1_Evap_tavg/*.nc4` (288 file)
- Thời gian: 2001-01-01 → 2024-12-01; 288 bước / 288 kỳ vọng; thiếu 0; trùng 0
- `Evap_tavg` float32, trục (time=1, lat=600 [-59.875 … 89.875, bước 0.25], lon=1440 [-179.875 … 179.875, bước 0.25]); thuộc tính: `{'units': 'kg m-2 s-1', '_FillValue': np.float32(-9999.0), 'missing_value': np.float32(-9999.0)}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-03-01, 2005-05-01, 2007-07-01, 2009-09-01, 2011-11-01, 2014-01-01, 2016-03-01, 2018-05-01, 2020-07-01, 2022-09-01, 2024-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| Evap_tavg | 71.9 | 0 | -4.596e-06 | -1.908e-07 | 8.701e-06 | 5.787e-05 | 9.227e-05 | 4.004 | 0 |  |

## merra2_t2m

- File: `data/raw/giovanni/M2IMNXASM_5_12_4_T2M/*.nc4` (288 file)
- Thời gian: 2001-01-01 → 2024-12-01; 288 bước / 288 kỳ vọng; thiếu 0; trùng 0
- `T2M` float32, trục (time=1, lat=361 [-90 … 90, bước 0.5], lon=576 [-180 … 179.375, bước 0.625]); thuộc tính: `{'units': 'K', '_FillValue': np.float32(1e+15), 'missing_value': np.float32(1e+15), 'fmissing_value': np.float32(1e+15), 'valid_range': [-999999986991104.0, 999999986991104.0]}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-03-01, 2005-05-01, 2007-07-01, 2009-09-01, 2011-11-01, 2014-01-01, 2016-03-01, 2018-05-01, 2020-07-01, 2022-09-01, 2024-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| T2M | 0 | 0 | 204.9 | 213.6 | 283.5 | 303.9 | 314.6 | 0 | 0 |  |

## cru_pre

- File: `data/raw/knmi_cru_gpcc/cru_ts4.10.*.pre.dat.nc` (3 file)
- Thời gian: 2001-01-01 → 2025-12-01; 300 bước / 300 kỳ vọng; thiếu 0; trùng 0
- `pre` float32, trục (time=120 [36905 … 40526, bước 30], lat=360 [-89.75 … 89.75, bước 0.5], lon=720 [-179.75 … 179.75, bước 0.5]); thuộc tính: `{'units': 'mm/month', 'correlation_decay_distance': np.float32(450.0), '_FillValue': np.float32(9.96921e+36), 'missing_value': np.float32(9.96921e+36)}`
- `stn` int32, trục (time=120 [36905 … 40526, bước 30], lat=360 [-89.75 … 89.75, bước 0.5], lon=720 [-179.75 … 179.75, bước 0.5]); thuộc tính: `{'_FillValue': np.int32(-999), 'missing_value': np.int32(-999)}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-16, 2003-04-16, 2005-07-16, 2007-10-16, 2010-01-16, 2012-04-16, 2014-08-16, 2016-11-16, 2019-02-15, 2021-05-16, 2023-08-16, 2025-12-16):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| pre | 73.99 | 0 | 0 | 0 | 30.3 | 378.4 | 2121 | 0 | 0.1943 | 0.1, 0 |
| stn | 73.99 | 0 | 0 | 0 | 5 | 8 | 8 | 0 |  |  |

Phân bố `stn` ở ô có `pre` hợp lệ (giá trị: tỉ lệ): 8: 33.5 %, 0: 15.5 %, 1: 10.4 %, 2: 8.0 %, 3: 7.7 %, 4: 7.1 %

## gpcc_precip

- File: `data/raw/knmi_cru_gpcc/full_data_monthly_v2022_*_025.nc` (2 file)
- Thời gian: 2001-01-01 → 2020-12-01; 240 bước / 240 kỳ vọng; thiếu 0; trùng 0
- `precip` float32, trục (time=120 [0 … 86904, bước 744], lat=720 [89.875 … -89.875, bước -0.25], lon=1440 [-179.875 … 179.875, bước 0.25]); thuộc tính: `{'units': 'mm/month', 'code': np.int32(20), '_FillValue': np.float32(-99999.99), 'missing_value': np.float32(-99999.99)}`
- `numgauge` float32, trục (time=120 [0 … 86904, bước 744], lat=720 [89.875 … -89.875, bước -0.25], lon=1440 [-179.875 … 179.875, bước 0.25]); thuộc tính: `{'units': 'gauges per gridcell', 'code': np.int32(21), '_FillValue': np.float32(-99999.99), 'missing_value': np.float32(-99999.99)}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2002-10-01, 2004-08-01, 2006-06-01, 2008-03-01, 2010-01-01, 2011-11-01, 2013-09-01, 2015-06-01, 2017-04-01, 2019-02-01, 2020-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| precip | 71.9 | 0 | 0 | 0 | 27.79 | 434.8 | 3358 | 0 | 0.01098 | 0 |
| numgauge | 0 | 0 | 0 | 0 | 0 | 1 | 37 | 0 |  |  |

Phân bố `numgauge` ở ô có `precip` hợp lệ (giá trị: tỉ lệ): 0: 93.5 %, 1: 4.7 %, 2: 1.0 %, 3: 0.4 %, 4: 0.2 %, 5: 0.1 %

## seawifs_chlor_a

- File: `data/raw/seawifs/*.L3m.MO.CHL.chlor_a.9km.nc` (157 file)
- Thời gian: 1997-09-01 → 2010-12-01; 157 bước / 160 kỳ vọng; thiếu 3: 2008-02-01, 2008-03-01, 2009-05-01; trùng 0
- `chlor_a` float32, trục (lat=2160 [89.9583 … -89.9583, bước -0.0833359], lon=4320 [-179.958 … 179.958, bước 0.0833282]); thuộc tính: `{'units': 'mg m^-3', '_FillValue': np.float32(-32767.0), 'valid_min': np.float32(0.001), 'valid_max': np.float32(100.0)}`

Giá trị thô trên 12 bước thời gian rải đều (1997-09-01, 1998-11-01, 2000-01-01, 2001-03-01, 2002-05-01, 2003-07-01, 2004-10-01, 2005-12-01, 2007-02-01, 2008-06-01, 2009-09-01, 2010-12-01):

| biến | fill % | NaN % | ngoài valid range % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|---|
| chlor_a | 61.14 | 0 | 0 | 0.001 | 0.01713 | 0.1332 | 3.793 | 99.72 | 0 | 0 |  |

## gsom_prcp (trạm GHCN)

- `stations.csv`: 85525 trạm có PRCP trong 2001–2024 theo kiểm kê GHCN-Daily; 81148 có file GSOM
- Dòng 2001–2024: 8072959; PRCP trống 4.9 %
- Số tháng có PRCP mỗi trạm (trên 288): trung vị 58; ≥ 240: 11292 trạm; ≥ 180: 17516; 0: 648
- PRCP (mm/tháng) min/p1/p50/p99/p99,99/max: 0.0 / 0.0 / 53.3 / 359.7 / 1146.1 / 3088.0; âm: 0
- `PRCP_ATTRIBUTES` (trên dòng có PRCP): số ngày thiếu > 0 ở 15.4 % (tối đa 5); cờ đo: rỗng: 92.0 %, a: 7.5 %, T: 0.5 %; cờ chất lượng: rỗng: 100.0 %
- Mã nguồn: N: 27.9 %, a: 18.4 %, 7: 12.1 %, 0: 11.8 %, E: 9.9 %, m: 4.1 %, C: 4.1 %, S: 3.0 %; 2024 trạm chỉ có nguồn `S` (synop GTS)
