// "Open in Giovanni": rebuild the same analysis (variable, area, months) in NASA Giovanni so users can check
// our numbers with NASA's own tool. Only the link is built here; nothing is sent to Giovanni by the app.

/** Our variable id → Giovanni data id (same NASA product and layer as our processed files). */
export const GIOVANNI_DATA: Record<string, string> = {
  imerg_precip: "GPM_3IMERGM_07_precipitation",
  gldas_soil_moisture_0_10cm: "GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst",
  gldas_air_temperature: "GLDAS_NOAH025_M_2_1_Tair_f_inst",
  gldas_evapotranspiration: "GLDAS_NOAH025_M_2_1_Evap_tavg",
  gldas_potential_evapotranspiration: "GLDAS_NOAH025_M_2_1_PotEvap_tavg",
  merra2_air_temperature_2m: "M2IMNXASM_5_12_4_T2M",
  // Checked in Giovanni's /configured-variables/ list on 2026-11-15. SMAP, SeaWiFS, GPCC and CRU are not there.
  gldas_soil_moisture_10_40cm: "GLDAS_NOAH025_M_2_1_SoilMoi10_40cm_inst",
  gldas_soil_moisture_40_100cm: "GLDAS_NOAH025_M_2_1_SoilMoi40_100cm_inst",
  gldas_soil_moisture_100_200cm: "GLDAS_NOAH025_M_2_1_SoilMoi100_200cm_inst",
  gldas_root_zone_moisture: "GLDAS_NOAH025_M_2_1_RootMoist_inst",
};

/** Last month Giovanni can serve, when it ends before our files do (Giovanni "Valid Range", checked 2026-11-14).
 *  Our 0.5° IMERG file runs to 2025-12 but its last three months are empty. */
export const GIOVANNI_END: Record<string, string> = { imerg_precip: "2025-09" };

const BASE = "https://giovanni.gsfc.nasa.gov/giovanni/";
const lastDay = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const r = (x: number) => String(Math.round(x * 1000) / 1000);

/** Giovanni "Time Series, Area-Averaged" link, or null when the variable is not in Giovanni. */
export function giovanniUrl(variableId: string, bbox: [number, number, number, number], start: string, end: string): string | null {
  const data = GIOVANNI_DATA[variableId];
  if (!data || !/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end)) return null;
  const last = GIOVANNI_END[variableId];
  if (last && end > last) end = last;
  if (start > end) return null;
  const [w, s, e, n] = bbox;
  const parts = [
    "service=ArAvTs",
    `starttime=${start}-01T00:00:00Z`,
    `endtime=${end}-${String(lastDay(end)).padStart(2, "0")}T23:59:59Z`,
    `bbox=${[w, s, e, n].map(r).join(",")}`,
    `data=${data}`,
  ];
  return `${BASE}#${parts.join("&")}`;
}

/** AppEEARS is where the MODIS variables come from; it has no deep link, so we point to its request page. */
export const APPEEARS_URL = "https://appeears.earthdatacloud.nasa.gov/task/area";
