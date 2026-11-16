// F5 case starter: curated "detective cases" that each pair a place type with a hypothesis from a real source.
// Only parameters live here. Results always come from POST /trends when the user presses Investigate.
// Sources were opened and checked on 2026-11-15 (see the agent report for the HTTP status of each URL).
import type { RegionRef } from "./api";

/** The place types the challenge names, in chip order. */
export const PLACE_TYPES = ["desert", "rain forest", "river delta", "big city", "farmland", "mountains or snow", "coast"] as const;
export const CURIOSITIES = ["rain", "soil water", "heat", "evaporation", "ocean life"] as const;
export type PlaceType = (typeof PLACE_TYPES)[number];
export type Curiosity = (typeof CURIOSITIES)[number];

export interface StarterCase {
  id: string;
  placeType: PlaceType;
  curiosity: Curiosity;
  /** At most 10 words. */
  question: string;
  variable_id: string;
  place: RegionRef;
  /** Short display name of the place, for the card and the place label. */
  placeName: string;
  /** "YYYY-MM", inside the variable's coverage. */
  start: string;
  end: string;
  /** At most 25 words, phrased as something to test. */
  hypothesis: string;
  source: { title: string; publisher: string; url: string; year: number };
}

export const STARTER_CASES: StarterCase[] = [
  {
    id: "sahel-rain", placeType: "desert", curiosity: "rain",
    question: "Is the Sahel, on the Sahara's edge, getting wetter?",
    variable_id: "gpcc_precip", place: { type: "bbox", bbox: [-17, 10, 40, 20] }, placeName: "Sahel",
    start: "2001-01", end: "2020-12",
    hypothesis: "Sahel rain may still be recovering from the droughts of the 1970s and 1980s, faster in the east than the west.",
    source: { title: "Assessing recovery and change in West Africa's rainfall regime from a 161-year record",
      publisher: "International Journal of Climatology (USGS Publications Warehouse)", url: "https://pubs.usgs.gov/publication/70249426", year: 2018 },
  },
  {
    id: "amazon-rain", placeType: "rain forest", curiosity: "rain",
    question: "Is the southern Amazon getting less rain?",
    // ponytail: bbox equal to the `southern_amazon` preset, so it works before the backend reloads the new catalog.
    variable_id: "imerg_precip", place: { type: "bbox", bbox: [-65, -15, -45, -5] }, placeName: "Southern Amazon",
    start: "2001-01", end: "2024-12",
    hypothesis: "Dry seasons in the southern Amazon have grown longer, so the total rain may be falling too.",
    source: { title: "Drying Out", publisher: "Jackson School of Geosciences, University of Texas at Austin",
      url: "https://www.jsg.utexas.edu/news/?p=5660", year: 2014 },
  },
  {
    id: "mississippi-algae", placeType: "river delta", curiosity: "ocean life",
    question: "Is algae growing off the Mississippi River Delta?",
    variable_id: "modisa_chlorophyll", place: { type: "bbox", bbox: [-95, 27, -85, 31] }, placeName: "Gulf of Mexico by the Mississippi Delta",
    start: "2003-01", end: "2025-12",
    hypothesis: "Farm runoff carried by the Mississippi feeds algae, so algae near its delta may have increased.",
    source: { title: "Phytoplankton Bloom in the Gulf of Mexico", publisher: "NASA Earth Observatory",
      url: "https://science.nasa.gov/earth/earth-observatory/phytoplankton-bloom-in-the-gulf-of-mexico-14372/", year: 2004 },
  },
  {
    id: "hanoi-heat", placeType: "big city", curiosity: "heat",
    question: "Is the air over Hanoi getting warmer?",
    variable_id: "gldas_air_temperature", place: { type: "preset", id: "hanoi" }, placeName: "Hanoi",
    start: "2001-01", end: "2025-12",
    // The source measures land surface heat on 30 m Landsat pixels; our grid squares are larger than the city.
    hypothesis: "Hanoi's heat islands tripled in area from 2009 to 2021. Grid squares are bigger than the city: does the wider area warm too?",
    source: { title: "Utilizing Landsat imageries to monitor urban heat islands in Hanoi, Vietnam from 2009 to 2021",
      publisher: "Journal of Science on Natural Resources and Environment (Vietnam Journals Online)",
      url: "https://vjol.info.vn/hunre/en/article/view/74497", year: 2022 },
  },
  {
    id: "chile-root-water", placeType: "farmland", curiosity: "soil water",
    question: "Is farm soil in central Chile drying out?",
    variable_id: "gldas_root_zone_moisture", place: { type: "preset", id: "central_chile" }, placeName: "Central Chile",
    start: "2001-01", end: "2025-12",
    hypothesis: "Central Chile's long drought since 2010 may have dried the soil where crop roots drink.",
    source: { title: "The 2010–2015 megadrought in central Chile: impacts on regional hydroclimate and vegetation",
      publisher: "Hydrology and Earth System Sciences", url: "https://hess.copernicus.org/articles/21/6307/2017/", year: 2017 },
  },
  {
    id: "arctic-heat", placeType: "mountains or snow", curiosity: "heat",
    question: "How fast is the snowy Arctic warming?",
    variable_id: "merra2_air_temperature_2m", place: { type: "bbox", bbox: [-180, 66.5, 180, 90] }, placeName: "Arctic",
    start: "2001-01", end: "2025-12",
    hypothesis: "The Arctic may be warming several times faster than the world as a whole.",
    source: { title: "The Arctic has warmed nearly four times faster than the globe since 1979",
      publisher: "Communications Earth & Environment", url: "https://www.nature.com/articles/s43247-022-00498-3", year: 2022 },
  },
  {
    id: "california-coast-algae", placeType: "coast", curiosity: "ocean life",
    question: "Are algae blooms growing along California's coast?",
    variable_id: "modisa_chlorophyll", place: { type: "bbox", bbox: [-126, 32, -117, 42] }, placeName: "California coast",
    start: "2003-01", end: "2025-12",
    hypothesis: "An earlier satellite study found bigger algae blooms along California's coast; check whether 2003 to 2025 agrees.",
    source: { title: "Trends in primary production in the California Current detected with satellite data",
      publisher: "Journal of Geophysical Research (copy at CCE LTER, UC San Diego)",
      url: "https://ccelter.ucsd.edu/wp-content/uploads/bibliodocs/077ccelter.pdf", year: 2009 },
  },
];

/** Cases matching the picked chips (null = any). */
export const matchCases = (placeType: PlaceType | null, curiosity: Curiosity | null) =>
  STARTER_CASES.filter((c) => (!placeType || c.placeType === placeType) && (!curiosity || c.curiosity === curiosity));
