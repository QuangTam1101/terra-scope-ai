// "Read more" under a Detective answer: a curated, hand-checked reading list. The model never writes URLs or citations;
// a source shows only when an evidence trend's variable is in `variables` and its area sits inside `bbox`.
// Each page was opened in a browser on 2026-11-16 and its `why` line checked against the page text.
// These are background reading on the place and topic, never proof of what caused the user's trend.

type BBox = [number, number, number, number];

export interface ReadingSource {
  title: string; publisher: string; year: number; url: string;
  /** One line on what the page says, worded from the page itself. */
  why: string;
  variables: string[];
  /** West, south, east, north. */
  bbox: BBox;
}

const RAIN = ["imerg_precip", "gpcc_precip", "cru_precip"];
const AIR = ["gldas_air_temperature", "merra2_air_temperature_2m", "modis_lst_day", "modis_lst_night"];
const SOIL = ["gldas_root_zone_moisture", "gldas_soil_moisture_0_10cm", "gldas_soil_moisture_10_40cm",
  "gldas_soil_moisture_40_100cm", "gldas_soil_moisture_100_200cm", "smap_soil_moisture_surface"];

export const READING: ReadingSource[] = [
  {
    title: "Assessing recovery and change in West Africa's rainfall regime from a 161-year record",
    publisher: "International Journal of Climatology (USGS Publications Warehouse)", year: 2018,
    url: "https://pubs.usgs.gov/publication/70249426",
    why: "A 602-gauge record from 1854 to 2014 suggests Sahel rain has not fully recovered from the 1970s and 1980s droughts, with more recovery in the east than the west.",
    variables: RAIN, bbox: [-17, 10, 40, 20],
  },
  {
    title: "Drying Out", publisher: "Jackson School of Geosciences, University of Texas at Austin", year: 2014,
    url: "https://www.jsg.utexas.edu/news/?p=5660",
    why: "Rain gauges show the southern Amazon dry season lasting about a week longer per decade since 1979; satellites saw greenness drop in the 2005 and 2010 droughts.",
    variables: [...RAIN, "modis_ndvi"], bbox: [-65, -15, -45, -5],
  },
  {
    title: "Phytoplankton Bloom in the Gulf of Mexico", publisher: "NASA Earth Observatory", year: 2004,
    url: "https://science.nasa.gov/earth/earth-observatory/phytoplankton-bloom-in-the-gulf-of-mexico-14372/",
    why: "SeaWiFS saw a plume of algae off the Mississippi Delta after floods; the article says farm runoff may have supplied the nutrients.",
    variables: ["modisa_chlorophyll"], bbox: [-95, 27, -85, 31],
  },
  {
    title: "Utilizing Landsat imageries to monitor urban heat islands in Hanoi, Vietnam from 2009 to 2021",
    publisher: "Journal of Science on Natural Resources and Environment (Vietnam Journals Online)", year: 2022,
    url: "https://vjol.info.vn/hunre/en/article/view/74497",
    why: "Landsat surface temperatures show Hanoi's heat-island area tripled from 2009 to 2021 (3.1% to 9.4%), on pixels far finer than our grid.",
    variables: AIR, bbox: [105.3, 20.5, 106.1, 21.4],
  },
  {
    title: "The 2010–2015 megadrought in central Chile: impacts on regional hydroclimate and vegetation",
    publisher: "Hydrology and Earth System Sciences", year: 2017,
    url: "https://hess.copernicus.org/articles/21/6307/2017/",
    why: "Since 2010 central Chile (30–38° S) has had rainfall deficits of 25–45% a year, with steep falls in river flow, reservoirs and groundwater.",
    variables: [...SOIL, ...RAIN, "modis_ndvi"], bbox: [-73, -38, -70, -30],
  },
  {
    title: "The Arctic has warmed nearly four times faster than the globe since 1979",
    publisher: "Communications Earth & Environment", year: 2022,
    url: "https://www.nature.com/articles/s43247-022-00498-3",
    why: "Several observational datasets show the Arctic (north of 66.5° N) warmed nearly four times faster than the globe over 1979–2021.",
    variables: AIR, bbox: [-180, 66.5, 180, 90],
  },
  {
    title: "Trends in primary production in the California Current detected with satellite data",
    publisher: "Journal of Geophysical Research: Oceans", year: 2009,
    url: "https://doi.org/10.1029/2008JC004979",
    why: "Satellite data showed peak chlorophyll blooms rising along the California coast over 1997–2007; the authors say the reasons are not clear.",
    variables: ["modisa_chlorophyll"], bbox: [-126, 32, -117, 42],
  },
  {
    title: "European State of the Climate 2024", publisher: "Copernicus Climate Change Service and WMO", year: 2025,
    url: "https://climate.copernicus.eu/esotc/2024",
    why: "Since the 1980s Europe has warmed about twice as fast as the global average, the fastest of any continent.",
    variables: AIR, bbox: [-10, 36, 40, 70],
  },
];

const area = (b: BBox) => (b[2] - b[0]) * (b[3] - b[1]);

/** Sources for the trends in one answer: variable listed, area centre inside the source box and the area at most
 *  4× the box (so "Whole world" or a city-to-country jump does not pick up a local study). At most 3, no repeats. */
export function readingFor(trends: { variable_id: string; region: { bbox: BBox } }[], list = READING): ReadingSource[] {
  const out: ReadingSource[] = [];
  for (const t of trends) {
    const [w, s, e, n] = t.region.bbox, x = (w + e) / 2, y = (s + n) / 2;
    for (const r of list) {
      const [rw, rs, re, rn] = r.bbox;
      if (!out.includes(r) && r.variables.includes(t.variable_id) && x >= rw && x <= re && y >= rs && y <= rn
        && area(t.region.bbox) <= 4 * area(r.bbox)) out.push(r);
    }
  }
  return out.slice(0, 3);
}
