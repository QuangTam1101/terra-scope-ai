// "Same cause, opposite trends": the hand-off link from Explore, the choice of pair, ready-made examples and the
// "How can one process do both?" table. Data and pure logic only; every number on screen comes from /hunt/discover,
// /compare and /series. Sources were opened and checked on 2026-11-16 (Crossref record plus the abstract): each row
// says only what its source's abstract supports.
import type { BBox, CompareResponse, HuntCandidate, Variable } from "./api";

export interface Source { cite: string; title: string; url: string }
export interface Mechanism {
  id: string; variables: string[];
  /** One known explanation, 1–2 plain sentences. */
  text: string;
  caveat?: string;
  source: Source;
  caveatSource?: Source;
}

export const MECHANISMS: Mechanism[] = [
  { id: "rain", variables: ["imerg_precip", "gpcc_precip", "cru_precip"],
    text: "Warmer air holds more water vapour, so winds carry more of it out of dry zones into rainy ones. Wet places can then get wetter and dry places drier.",
    caveat: "Over land the real pattern is messier: only about a tenth of the land follows this simple rule.",
    source: { cite: "Held and Soden, 2006, Journal of Climate", title: "Robust responses of the hydrological cycle to global warming", url: "https://doi.org/10.1175/JCLI3990.1" },
    caveatSource: { cite: "Greve and others, 2014, Nature Geoscience", title: "Global assessment of trends in wetting and drying over land", url: "https://doi.org/10.1038/ngeo2247" } },
  { id: "soil", variables: ["gldas_soil_moisture_0_10cm", "gldas_soil_moisture_10_40cm", "gldas_soil_moisture_40_100cm",
    "gldas_soil_moisture_100_200cm", "gldas_root_zone_moisture", "smap_soil_moisture_surface"],
    text: "Satellite soil records follow \"drier in dry places, wetter in wet places\" about twice as often as the reverse. In dry places, drier soil heats the air, which makes it thirstier still.",
    caveat: "Only about half of the soil water trends they found follow this pattern.",
    source: { cite: "Feng and Zhang, 2015, Scientific Reports", title: "Global land moisture trends: drier in dry and wetter in wet over land", url: "https://doi.org/10.1038/srep18018" } },
  { id: "evaporation", variables: ["gldas_evapotranspiration", "modis_et"],
    text: "A warming climate lets the air take more water from the land, so evaporation can rise where water is plentiful. Where soils dry out, there is less water to give, and evaporation can stall or fall.",
    source: { cite: "Jung and others, 2010, Nature", title: "Recent decline in the global land evapotranspiration trend due to limited moisture supply", url: "https://doi.org/10.1038/nature09396" } },
  { id: "vegetation", variables: ["modis_ndvi"],
    text: "Extra carbon dioxide in the air helps plants grow, so many places have turned greener. Warmer air is also thirstier, and where it dries plants out, greening can stall or reverse.",
    source: { cite: "Yuan and others, 2019, Science Advances", title: "Increased atmospheric vapor pressure deficit reduces global vegetation growth", url: "https://doi.org/10.1126/sciadv.aax1396" } },
  { id: "algae", variables: ["seawifs_chlorophyll"],
    text: "Warming makes the sunlit top of the ocean float more firmly on the cold water below. Fewer nutrients reach warm seas, so algae there drop, while cold seas can get a longer growing season.",
    caveat: "This explanation comes from computer models of a warming ocean.",
    source: { cite: "Sarmiento and others, 2004, Global Biogeochemical Cycles", title: "Response of ocean ecosystems to climate warming", url: "https://doi.org/10.1029/2003GB002134" } },
];

/** The mechanism row for a variable, or null when we have no checked explanation for it. */
export const mechanismFor = (variableId: string): Mechanism | null => MECHANISMS.find((m) => m.variables.includes(variableId)) ?? null;

export interface PairPlace { name: string; bbox: BBox }
export interface OppositeExample { id: string; question: string; variable_id: string; start: string; end: string; up: PairPlace; down: PairPlace }

// Each one met the bar on the public 1° cubes (2026-11-16): each place alone has a Hamed-Rao adjusted p < 0.05 and a
// 95% interval that excludes zero, in opposite directions, and /compare says opposite_significant. Numbers in the report.
export const OPPOSITE_EXAMPLES: OppositeExample[] = [
  { id: "algae-atlantic", question: "Ocean algae: more in the cold south, less in the warm tropics?", variable_id: "seawifs_chlorophyll",
    start: "2001-01", end: "2010-12",
    up: { name: "South Atlantic, east of Patagonia", bbox: [-50, -50, -40, -40] },
    down: { name: "Tropical North Atlantic", bbox: [-40, 10, -30, 20] } },
  { id: "rain-pacific", question: "Rain: wetter in the rainy tropics, drier in a dry ocean zone?", variable_id: "imerg_precip",
    start: "2001-01", end: "2024-12",
    up: { name: "Seas of eastern Indonesia", bbox: [120, -10, 130, 0] },
    down: { name: "Southeast Pacific, far west of Peru", bbox: [-110, -20, -100, -10] } },
  { id: "evaporation-siberia-namibia", question: "Evaporation: up in wet Siberia, down in dry Namibia?", variable_id: "gldas_evapotranspiration",
    start: "2001-01", end: "2025-12",
    up: { name: "Western Siberia, Russia", bbox: [70, 60, 80, 70] },
    down: { name: "Namibia", bbox: [10, -30, 20, -20] } },
];

/** The scan: 10° squares over the whole world except Antarctica and the far Arctic (504 squares, under the 600 limit). */
export const SCAN = { extent: [-180, -60, 180, 80] as BBox, tile_deg: 10, max_candidates: 5 };

export interface OppositeRequest { variableId: string; start: string; end: string }

/** "#hunt?opposite" opens the view; with a variable and period it also starts the scan (Explore's button, shared links). */
export const oppositeHash = (r: OppositeRequest | null) =>
  r ? `#hunt?opposite=${encodeURIComponent(r.variableId)}&from=${r.start}&to=${r.end}` : "#hunt?opposite";

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
/** null: not an opposite-trends link; "open": open the view only; otherwise a valid request to run. */
export function parseOpposite(hash: string): OppositeRequest | "open" | null {
  const m = hash.match(/^#\/?hunt\?(.*)$/);
  if (!m) return null;
  const q = new URLSearchParams(m[1]);
  if (!q.has("opposite")) return null;
  const variableId = q.get("opposite") ?? "", start = q.get("from") ?? "", end = q.get("to") ?? "";
  return /^[a-z0-9_]{1,60}$/.test(variableId) && YM.test(start) && YM.test(end) && start <= end ? { variableId, start, end } : "open";
}

/** Default period: whole calendar years of the record, the same rule the server uses to precompute its trend maps. */
export function wholeYears(coverage: Variable["coverage"]): { start: string; end: string } | null {
  if (!coverage) return null;
  const start = coverage.start.endsWith("-01") ? coverage.start : `${Number(coverage.start.slice(0, 4)) + 1}-01`;
  const end = coverage.end.endsWith("-12") ? coverage.end : `${Number(coverage.end.slice(0, 4)) - 1}-12`;
  return start <= end ? { start, end } : null;
}

/** The pair to show first: one whose gap passed the difference test, else the best re-tested one, else the top pattern. */
export const bestPair = (cands: HuntCandidate[]): HuntCandidate | null =>
  cands.find((c) => c.test?.verdict === "opposite_significant") ?? cands.find((c) => c.test) ?? cands[0] ?? null;

export type PairVerdict = CompareResponse["verdict"] | null;
/** Honest labels: the verdict of /compare as returned, or "not tested" for a map pattern. */
export const PAIR_STATUS: Record<CompareResponse["verdict"] | "untested", { label: string; cls: "sig" | "np" | "ne" }> = {
  opposite_significant: { label: "Opposite trends, and the gap between them passed the test", cls: "sig" },
  opposite_not_significant: { label: "Opposite directions, but the test cannot confirm the gap", cls: "np" },
  same_direction: { label: "Not opposite after all: both places change the same way", cls: "ne" },
  insufficient_data: { label: "Not enough data to test this pair", cls: "ne" },
  untested: { label: "Map pattern only: not tested as two places", cls: "ne" },
};
export const pairStatus = (v: PairVerdict) => PAIR_STATUS[v ?? "untested"];

const lat = (v: number) => (v === 0 ? "0°" : `${Math.abs(v)}°${v > 0 ? "N" : "S"}`);
const lon = (v: number) => (v === 0 ? "0°" : `${Math.abs(v)}°${v > 0 ? "E" : "W"}`);
/** A scanned square has no name: say where it is. */
export const boxName = (b: BBox) => `Square ${lat(b[1])} to ${lat(b[3])}, ${lon(b[0])} to ${lon(b[2])}`;
