# EDA dữ liệu thô (sinh tự động bởi `preprocess/eda.py`)

Giá trị thô: chưa áp `scale_factor`, chưa đổi fill thành NaN.

## imerg_precip

- File: `data/raw/giovanni/GPM_3IMERGM_07_precipitation/*.nc4` (297 file)
- Thời gian: 2001-01-01 → 2025-09-01; 297 bước / 297 kỳ vọng; thiếu 0; trùng 0
- `Grid/precipitation` float32, trục (time=1, lon=3600 [-179.95 … 179.95, bước 0.0999908], lat=1800 [-89.95 … 89.95, bước 0.0999985]); thuộc tính: `{'units': 'mm/hr', '_FillValue': np.float32(-9999.9), 'CodeMissingValue': '-9999.9'}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-03-01, 2005-06-01, 2007-09-01, 2009-12-01, 2012-03-01, 2014-06-01, 2016-09-01, 2018-12-01, 2021-03-01, 2023-06-01, 2025-09-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| Grid/precipitation | 0.616 | 0 | 0 | 0 | 0.046 | 0.604 | 2.958 | 0 | 6.509 | 0 |

## gldas_soilmoi0_10cm

- File: `data/raw/giovanni/GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst/*.nc4` (300 file)
- Thời gian: 2001-01-01 → 2025-12-01; 300 bước / 300 kỳ vọng; thiếu 0; trùng 0
- `SoilMoi0_10cm_inst` float32, trục (time=1, lat=600 [-59.875 … 89.875, bước 0.25], lon=1440 [-179.875 … 179.875, bước 0.25]); thuộc tính: `{'units': 'kg m-2', '_FillValue': np.float32(-9999.0), 'missing_value': np.float32(-9999.0)}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-04-01, 2005-07-01, 2007-10-01, 2010-01-01, 2012-04-01, 2014-08-01, 2016-11-01, 2019-02-01, 2021-05-01, 2023-08-01, 2025-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| SoilMoi0_10cm_inst | 71.9 | 0 | 2 | 3.348 | 24.65 | 100 | 100 | 0 | 3.952 | 100 |

## gldas_soilmoi10_40cm

- File: `data/raw/giovanni/GLDAS_NOAH025_M_2_1_SoilMoi10_40cm_inst/*.nc4` (300 file)
- Thời gian: 2001-01-01 → 2025-12-01; 300 bước / 300 kỳ vọng; thiếu 0; trùng 0
- `SoilMoi10_40cm_inst` float32, trục (time=1, lat=600 [-59.875 … 89.875, bước 0.25], lon=1440 [-179.875 … 179.875, bước 0.25]); thuộc tính: `{'units': 'kg m-2', '_FillValue': np.float32(-9999.0), 'missing_value': np.float32(-9999.0)}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-04-01, 2005-07-01, 2007-10-01, 2010-01-01, 2012-04-01, 2014-08-01, 2016-11-01, 2019-02-01, 2021-05-01, 2023-08-01, 2025-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| SoilMoi10_40cm_inst | 71.9 | 0 | 6 | 22.27 | 73.9 | 300 | 300 | 0 | 0 |  |

## gldas_soilmoi40_100cm

- File: `data/raw/giovanni/GLDAS_NOAH025_M_2_1_SoilMoi40_100cm_inst/*.nc4` (300 file)
- Thời gian: 2001-01-01 → 2025-12-01; 300 bước / 300 kỳ vọng; thiếu 0; trùng 0
- `SoilMoi40_100cm_inst` float32, trục (time=1, lat=600 [-59.875 … 89.875, bước 0.25], lon=1440 [-179.875 … 179.875, bước 0.25]); thuộc tính: `{'units': 'kg m-2', '_FillValue': np.float32(-9999.0), 'missing_value': np.float32(-9999.0)}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-04-01, 2005-07-01, 2007-10-01, 2010-01-01, 2012-04-01, 2014-08-01, 2016-11-01, 2019-02-01, 2021-05-01, 2023-08-01, 2025-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| SoilMoi40_100cm_inst | 71.9 | 0 | 12 | 40.04 | 140.6 | 600 | 600 | 0 | 0 |  |

## gldas_soilmoi100_200cm

- File: `data/raw/giovanni/GLDAS_NOAH025_M_2_1_SoilMoi100_200cm_inst/*.nc4` (300 file)
- Thời gian: 2001-01-01 → 2025-12-01; 300 bước / 300 kỳ vọng; thiếu 0; trùng 0
- `SoilMoi100_200cm_inst` float32, trục (time=1, lat=600 [-59.875 … 89.875, bước 0.25], lon=1440 [-179.875 … 179.875, bước 0.25]); thuộc tính: `{'units': 'kg m-2', '_FillValue': np.float32(-9999.0), 'missing_value': np.float32(-9999.0)}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-04-01, 2005-07-01, 2007-10-01, 2010-01-01, 2012-04-01, 2014-08-01, 2016-11-01, 2019-02-01, 2021-05-01, 2023-08-01, 2025-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| SoilMoi100_200cm_inst | 71.9 | 0 | 20 | 83.32 | 269.1 | 1000 | 1000 | 0 | 0 |  |

## gldas_rootmoist

- File: `data/raw/giovanni/GLDAS_NOAH025_M_2_1_RootMoist_inst/*.nc4` (300 file)
- Thời gian: 2001-01-01 → 2025-12-01; 300 bước / 300 kỳ vọng; thiếu 0; trùng 0
- `RootMoist_inst` float32, trục (time=1, lat=600 [-59.875 … 89.875, bước 0.25], lon=1440 [-179.875 … 179.875, bước 0.25]); thuộc tính: `{'units': 'kg m-2', '_FillValue': np.float32(-9999.0), 'missing_value': np.float32(-9999.0)}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-04-01, 2005-07-01, 2007-10-01, 2010-01-01, 2012-04-01, 2014-08-01, 2016-11-01, 2019-02-01, 2021-05-01, 2023-08-01, 2025-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| RootMoist_inst | 71.9 | 0 | 2 | 3.994 | 241.6 | 781.4 | 903.6 | 0 | 3.952 | 100 |

## gldas_tair_f

- File: `data/raw/giovanni/GLDAS_NOAH025_M_2_1_Tair_f_inst/*.nc4` (300 file)
- Thời gian: 2001-01-01 → 2025-12-01; 300 bước / 300 kỳ vọng; thiếu 0; trùng 0
- `Tair_f_inst` float32, trục (time=1, lat=600 [-59.875 … 89.875, bước 0.25], lon=1440 [-179.875 … 179.875, bước 0.25]); thuộc tính: `{'units': 'K', '_FillValue': np.float32(-9999.0), 'missing_value': np.float32(-9999.0)}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-04-01, 2005-07-01, 2007-10-01, 2010-01-01, 2012-04-01, 2014-08-01, 2016-11-01, 2019-02-01, 2021-05-01, 2023-08-01, 2025-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| Tair_f_inst | 71.53 | 0 | 229.4 | 240.9 | 286.3 | 308 | 314.9 | 0 | 0 |  |

## gldas_evap

- File: `data/raw/giovanni/GLDAS_NOAH025_M_2_1_Evap_tavg/*.nc4` (300 file)
- Thời gian: 2001-01-01 → 2025-12-01; 300 bước / 300 kỳ vọng; thiếu 0; trùng 0
- `Evap_tavg` float32, trục (time=1, lat=600 [-59.875 … 89.875, bước 0.25], lon=1440 [-179.875 … 179.875, bước 0.25]); thuộc tính: `{'units': 'kg m-2 s-1', '_FillValue': np.float32(-9999.0), 'missing_value': np.float32(-9999.0)}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-04-01, 2005-07-01, 2007-10-01, 2010-01-01, 2012-04-01, 2014-08-01, 2016-11-01, 2019-02-01, 2021-05-01, 2023-08-01, 2025-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| Evap_tavg | 71.9 | 0 | -3.587e-06 | -3.279e-07 | 8.003e-06 | 5.705e-05 | 8.871e-05 | 3.821 | 0 |  |

## merra2_t2m

- File: `data/raw/giovanni/M2IMNXASM_5_12_4_T2M/*.nc4` (300 file)
- Thời gian: 2001-01-01 → 2025-12-01; 300 bước / 300 kỳ vọng; thiếu 0; trùng 0
- `T2M` float32, trục (time=1, lat=361 [-90 … 90, bước 0.5], lon=576 [-180 … 179.375, bước 0.625]); thuộc tính: `{'units': 'K', '_FillValue': np.float32(1e+15), 'missing_value': np.float32(1e+15), 'fmissing_value': np.float32(1e+15), 'valid_range': [-999999986991104.0, 999999986991104.0]}`

Giá trị thô trên 12 bước thời gian rải đều (2001-01-01, 2003-04-01, 2005-07-01, 2007-10-01, 2010-01-01, 2012-04-01, 2014-08-01, 2016-11-01, 2019-02-01, 2021-05-01, 2023-08-01, 2025-12-01):

| biến | fill % | NaN % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|
| T2M | 0 | 0 | 204.2 | 213.1 | 283.4 | 303.9 | 313.9 | 0 | 0 |  |

## smap

- File: `data/raw/smap/*/*.nc4` (3845 file)
- Thời gian: 2015-03-31 → 2025-12-31; 3845 bước / 3929 kỳ vọng; thiếu 84: 2015-05-13, 2015-12-16, 2016-05-01, 2016-09-27, 2019-06-20, 2019-06-21, 2019-06-22, 2019-06-23, 2019-06-24, 2019-06-25, 2019-06-26, 2019-06-27 …; trùng 0
- `Soil_Moisture_Retrieval_Data_AM/soil_moisture` float32, trục (y=406 [7.29652e+06 … -7.29652e+06, bước -36032.2], x=964 [-1.73495e+07 … 1.73495e+07, bước 36032.2]); thuộc tính: `{'_FillValue': np.float32(-9999.0), 'units': 'cm**3/cm**3', 'valid_min': np.float32(0.02), 'valid_max': np.float32(0.5), 'grid_mapping': '/EASE2_global_projection_36km', 'dimensions': 'y x'}`
- `Soil_Moisture_Retrieval_Data_AM/retrieval_qual_flag` uint16, trục (y=406 [7.29652e+06 … -7.29652e+06, bước -36032.2], x=964 [-1.73495e+07 … 1.73495e+07, bước 36032.2]); thuộc tính: `{'_FillValue': np.uint16(65534), 'flag_masks': '1s, 2s, 4s, 8s', 'flag_meanings': 'Retrieval_recommended Retrieval_attempted Retrieval_success FT_retrieval_success', 'HDF5_HARDLINK': '/Soil_Moisture_Retrieval_Data_AM/retrieval_qual_flag_dca', 'grid_mapping': '/EASE2_global_projection_36km', 'dimensions': 'y x'}`
- `Soil_Moisture_Retrieval_Data_PM/soil_moisture_pm` float32, trục (y=406 [7.29652e+06 … -7.29652e+06, bước -36032.2], x=964 [-1.73495e+07 … 1.73495e+07, bước 36032.2]); thuộc tính: `{'_FillValue': np.float32(-9999.0), 'units': 'cm**3/cm**3', 'valid_min': np.float32(0.02), 'valid_max': np.float32(0.5), 'grid_mapping': '/EASE2_global_projection_36km', 'dimensions': 'y x'}`
- `Soil_Moisture_Retrieval_Data_PM/retrieval_qual_flag_pm` uint16, trục (y=406 [7.29652e+06 … -7.29652e+06, bước -36032.2], x=964 [-1.73495e+07 … 1.73495e+07, bước 36032.2]); thuộc tính: `{'_FillValue': np.uint16(65534), 'flag_masks': '1s, 2s, 4s, 8s', 'flag_meanings': 'Retrieval_recommended Retrieval_attempted Retrieval_success FT_retrieval_success', 'grid_mapping': '/EASE2_global_projection_36km', 'dimensions': 'y x'}`

Giá trị thô trên 12 bước thời gian rải đều (2015-03-31, 2016-03-16, 2017-03-02, 2018-02-15, 2019-01-30, 2020-02-17, 2021-01-31, 2022-01-16, 2023-02-15, 2024-01-31, 2025-01-14, 2025-12-31):

| biến | fill % | NaN % | ngoài valid range % | min | p1 | p50 | p99 | max | âm % | hằng số theo t % | giá trị hằng hay gặp |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Soil_Moisture_Retrieval_Data_AM/soil_moisture | 93.47 | 0 | 0.3408 | 0.02 | 0.02 | 0.1637 | 0.6073 | 0.9138 | 0 | nan |  |
| Soil_Moisture_Retrieval_Data_AM/retrieval_qual_flag | 0 | 0 |  | 0 | 0 | 7 | 15 | 15 | 0 |  |  |
| Soil_Moisture_Retrieval_Data_PM/soil_moisture_pm | 93.22 | 0 | 0.2923 | 0.02 | 0.02184 | 0.1615 | 0.6031 | 0.9138 | 0 | nan |  |
| Soil_Moisture_Retrieval_Data_PM/retrieval_qual_flag_pm | 0 | 0 |  | 0 | 0 | 7 | 15 | 15 | 0 |  |  |

Phân bố `Soil_Moisture_Retrieval_Data_AM/retrieval_qual_flag` ở ô có `Soil_Moisture_Retrieval_Data_AM/soil_moisture` hợp lệ (giá trị: tỉ lệ): 8: 41.7 %, 9: 20.1 %, 0: 17.3 %, 1: 11.2 %, 13: 7.0 %, 5: 2.7 %

Phân bố `Soil_Moisture_Retrieval_Data_PM/retrieval_qual_flag_pm` ở ô có `Soil_Moisture_Retrieval_Data_PM/soil_moisture_pm` hợp lệ (giá trị: tỉ lệ): 8: 42.1 %, 9: 22.3 %, 0: 16.9 %, 1: 10.5 %, 13: 4.4 %, 5: 3.8 %

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

- `stations.csv`: 87256 trạm có PRCP trong 2001–2025 theo kiểm kê GHCN-Daily; 82839 có file GSOM
- Dòng 2001–2025: 8428975; PRCP trống 4.9 %
- Số tháng có PRCP mỗi trạm (trên 300): trung vị 59; ≥ 240: 11827 trạm; ≥ 180: 18199; 0: 659
- PRCP (mm/tháng) min/p1/p50/p99/p99,99/max: 0.0 / 0.0 / 53.3 / 358.0 / 1151.0 / 3088.0; âm: 0
- `PRCP_ATTRIBUTES` (trên dòng có PRCP): số ngày thiếu > 0 ở 15.6 % (tối đa 5); cờ đo: rỗng: 91.9 %, a: 7.6 %, T: 0.5 %; cờ chất lượng: rỗng: 100.0 %
- Mã nguồn: N: 28.9 %, a: 18.2 %, 7: 12.3 %, 0: 11.3 %, E: 9.8 %, C: 4.1 %, m: 4.0 %, S: 3.0 %; 1893 trạm chỉ có nguồn `S` (synop GTS)
