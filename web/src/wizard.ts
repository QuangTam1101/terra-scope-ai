// "Start investigating": three plain questions (topic, kind of place, period) give a short ranked list of variables.
// Deterministic on purpose: the ranking is the TABLE below, never a model call. Only variables that the backend lists
// as available with a coverage are suggested, and every period is clamped to that variable's own record.
// Pure module (no React, no DOM), unit tested in tests/wizard.test.mjs.
import type { RegionRef, Variable } from "./api";
import { clampPeriod } from "./period";
import { STARTER_CASES, type Curiosity, type PlaceType } from "./starterCases";

export const TOPICS = [
  { id: "water", label: "Rain and water" }, { id: "heat", label: "Heat" }, { id: "plants", label: "Plants" },
  { id: "soil", label: "Soil" }, { id: "ocean", label: "Ocean" },
] as const;
export const PLACES = [
  { id: "desert", label: "A desert" }, { id: "rainforest", label: "A rainforest" }, { id: "farmland", label: "Farmland" },
  { id: "city", label: "A big city" }, { id: "ocean", label: "The ocean" }, { id: "cold", label: "A cold region" },
  { id: "map", label: "Pick on the map" },
] as const;
export type TopicId = (typeof TOPICS)[number]["id"];
export type PlaceId = (typeof PLACES)[number]["id"];

export interface Suggested { name: string; ref: RegionRef }
const box = (name: string, bbox: [number, number, number, number]): Suggested => ({ name, ref: { type: "bbox", bbox } });
const preset = (name: string, id: string): Suggested => ({ name, ref: { type: "preset", id } });

/** Default example region per kind of place (boxes on the 0.5° grid; presets from backend/app/catalog.py). */
export const PLACE_REGION: Record<Exclude<PlaceId, "map">, Suggested> = {
  desert: box("Sahara", [-10, 18, 30, 30]),
  rainforest: preset("Southern Amazon", "southern_amazon"),
  farmland: box("US Corn Belt", [-97, 37, -83, 45]),
  city: preset("Hanoi", "hanoi"),
  ocean: box("California Current", [-126, 32, -117, 42]),
  cold: box("Arctic", [-180, 66.5, 180, 90]),
};

type Item = [variableId: string, reason: string];
interface Row { items: Item[]; region?: Suggested }

// Topic × place → variable ids in rank order, each with a one-line reason. Missing cell = nothing fits (soil at sea).
const TABLE: Record<TopicId, Partial<Record<PlaceId, Row>>> = {
  water: {
    desert: { items: [["imerg_precip", "Desert rain is rare, so even a small change in yearly rain matters."],
      ["gpcc_precip", "Rain gauges at desert towns give a second, ground-based opinion."],
      ["gldas_potential_evapotranspiration", "Hotter, drier air pulls harder on what little water there is."]] },
    rainforest: { items: [["imerg_precip", "Longer dry seasons could show up as less rain each year."],
      ["gldas_evapotranspiration", "Forests send huge amounts of water back to the air; less may mean stressed trees."],
      ["gpcc_precip", "Rain gauges check what the satellites see."]] },
    farmland: { items: [["imerg_precip", "Crops depend on rain; a slow shift changes what farmers can grow."],
      ["gldas_evapotranspiration", "Fields release water through leaves; a change shows how thirsty crops are."],
      ["cru_precip", "Weather stations give a second opinion on the rain."]] },
    city: { items: [["imerg_precip", "Cities can change local rain; satellites see the whole area at once."],
      ["gpcc_precip", "Cities have many rain gauges, a good check on the satellites."]] },
    ocean: { items: [["imerg_precip", "Satellites measure rain at sea, where there are almost no gauges."]] },
    cold: { items: [["imerg_precip", "Warmer air holds more water, so cold regions may get more rain and snow."],
      ["cru_precip", "Weather stations in the far north give a second opinion."]] },
    map: { items: [["imerg_precip", "Satellite rain covers every place on Earth, land and sea."],
      ["gpcc_precip", "Rain gauges on land check what the satellites see."],
      ["gldas_evapotranspiration", "Shows how much water goes back to the air from land."]] },
  },
  heat: {
    desert: { items: [["modis_lst_day", "Desert ground gets extremely hot by day; a satellite sees the ground itself."],
      ["merra2_air_temperature_2m", "Air temperature shows whether the whole region is warming."],
      ["gldas_air_temperature", "A land model gives a second opinion on the air temperature."]] },
    rainforest: { items: [["gldas_air_temperature", "Drying or cleared forest can warm the air above it."],
      ["modis_lst_day", "Where trees are lost, the ground heats up faster in the sun."],
      ["merra2_air_temperature_2m", "A second source for the air temperature."]] },
    farmland: { items: [["gldas_air_temperature", "Warmer growing seasons change what farmers can plant."],
      ["modis_lst_day", "Bare or dry fields heat up more in the sun than green ones."],
      ["gldas_potential_evapotranspiration", "Heat makes crops thirstier even when the rain stays the same."]] },
    city: { items: [["modis_lst_night", "Cities hold the day's heat and stay warm at night: the urban heat island."],
      ["modis_lst_day", "Roofs and roads get much hotter than fields in the sun."],
      ["merra2_air_temperature_2m", "Air temperature shows warming of the wider area around the city."]] },
    ocean: { items: [["merra2_air_temperature_2m", "Covers the sea too, so it shows warming over the ocean."]] },
    cold: { items: [["merra2_air_temperature_2m", "The Arctic may be warming several times faster than the world."],
      ["gldas_air_temperature", "A land model checks the warming over cold land."]] },
    map: { items: [["merra2_air_temperature_2m", "Air temperature over land and sea, anywhere on Earth."],
      ["gldas_air_temperature", "A land model gives a second opinion over land."],
      ["modis_lst_day", "Shows how hot the ground itself gets by day."]] },
  },
  plants: {
    desert: { items: [["modis_ndvi", "Desert edges can turn greener after wet years or barer in drought."],
      ["gpcc_precip", "Plants in dry places follow the rain, so check the rain too."],
      ["gldas_root_zone_moisture", "Roots drink from this soil layer; it tells if plants have water."]] },
    rainforest: { items: [["modis_ndvi", "A drop in greenness can flag forest loss or drought stress."],
      ["gldas_evapotranspiration", "Healthy forests release a lot of water through their leaves."],
      ["gldas_root_zone_moisture", "Deep roots keep trees alive in dry seasons."]] },
    farmland: { items: [["modis_ndvi", "Greenness follows crops; a trend shows changes in farming or drought."],
      ["gldas_root_zone_moisture", "Crop roots drink from this layer; drier soil means thirstier crops."],
      ["gldas_evapotranspiration", "Growing crops release water through their leaves."]] },
    city: { items: [["modis_ndvi", "As cities grow, green fields turn into roofs and roads."],
      ["modis_lst_day", "Fewer plants usually means hotter ground in the sun."]] },
    ocean: { items: [["seawifs_chlorophyll", "Tiny ocean plants (algae) are the ocean's version of greenness."]] },
    cold: { items: [["modis_ndvi", "Warmer summers may let more plants grow in the far north."],
      ["merra2_air_temperature_2m", "Check whether the warming that helps plants is there."]] },
    map: { items: [["modis_ndvi", "Greenness from space shows where plants thrive or struggle."],
      ["gldas_root_zone_moisture", "Roots drink from this soil layer."],
      ["gldas_evapotranspiration", "Plants release water through their leaves."]] },
  },
  soil: {
    desert: { items: [["gldas_soil_moisture_0_10cm", "Even a desert's top soil shows if rare rains soak in more or less."],
      ["smap_soil_moisture_surface", "A satellite sees bare desert soil clearly, with no trees in the way."],
      ["gldas_root_zone_moisture", "The deeper layer where the few desert plants drink."]] },
    rainforest: { items: [["gldas_root_zone_moisture", "Deep roots keep trees alive through dry seasons; is this layer drying?"],
      ["gldas_soil_moisture_0_10cm", "The top layer reacts first to longer dry seasons."],
      ["gldas_soil_moisture_100_200cm", "The deepest layer changes slowly and holds the forest's reserve."]] },
    farmland: { items: [["gldas_root_zone_moisture", "Where crop roots drink; drying here means thirsty crops."],
      ["smap_soil_moisture_surface", "A satellite reading of the top 5 cm, good over open fields."],
      ["gldas_soil_moisture_0_10cm", "The top layer dries first in a drought."]] },
    city: { items: [["gldas_soil_moisture_0_10cm", "The land around a growing city may dry out at the surface."],
      ["gldas_root_zone_moisture", "The deeper layer that parks and nearby farms depend on."]] },
    cold: { items: [["gldas_soil_moisture_0_10cm", "Thawing ground in cold regions can change how wet the soil is."],
      ["gldas_soil_moisture_10_40cm", "A deeper layer, slower to react to thaw."]] },
    map: { items: [["gldas_soil_moisture_0_10cm", "How wet the top soil is, on any land."],
      ["gldas_root_zone_moisture", "The layer where plant roots drink."],
      ["smap_soil_moisture_surface", "A satellite reading of the top 5 cm (not under thick forest)."]] },
  },
  ocean: {
    desert: { region: box("Atlantic off the Sahara", [-20, 15, -15, 30]),
      items: [["seawifs_chlorophyll", "Cold, rich water rises along this desert coast and feeds algae."]] },
    rainforest: { region: box("Amazon river mouth", [-52, 0, -45, 6]),
      items: [["seawifs_chlorophyll", "The Amazon pours river water into the sea; algae near its mouth may follow."]] },
    farmland: { region: box("Gulf of Mexico by the Mississippi Delta", [-95, 27, -85, 31]),
      items: [["seawifs_chlorophyll", "Farm fertiliser washes down the Mississippi and can feed algae in the Gulf."]] },
    city: { region: box("Sea off New York", [-75, 38.5, -71, 41]),
      items: [["seawifs_chlorophyll", "Rivers and wastewater from a big coastal city can feed algae offshore."],
        ["merra2_air_temperature_2m", "Air over the coastal sea, next to the city."]] },
    ocean: { items: [["seawifs_chlorophyll", "Algae are the base of the ocean food web; satellites see their colour."],
      ["merra2_air_temperature_2m", "Air over the sea warms with the water below."],
      ["imerg_precip", "Satellites measure rain at sea, where there are almost no gauges."]] },
    cold: { region: box("Barents Sea", [20, 70, 50, 80]),
      items: [["seawifs_chlorophyll", "As sea ice shrinks, more sunlight reaches the water and algae can bloom."],
        ["merra2_air_temperature_2m", "Air over the Arctic sea is warming fast."]] },
    map: { items: [["seawifs_chlorophyll", "Ocean algae, seen from space (sea only)."],
      ["merra2_air_temperature_2m", "Air temperature over the sea."]] },
  },
};

/** "longest": each variable's whole record. "recent": its last 10 calendar years. "custom": whole years from–to. */
export type PeriodChoice = { kind: "longest" } | { kind: "recent" } | { kind: "custom"; from: number; to: number };

/** The chosen period clamped to one variable's coverage; null when the two do not overlap. */
export function periodFor(coverage: Variable["coverage"], choice: PeriodChoice) {
  if (!coverage) return null;
  if (choice.kind === "longest") return clampPeriod(coverage.start, coverage.end, coverage);
  if (choice.kind === "recent") return clampPeriod(`${Number(coverage.end.slice(0, 4)) - 9}-01`, coverage.end, coverage);
  return choice.from > choice.to ? null : clampPeriod(`${choice.from}-01`, `${choice.to}-12`, coverage);
}

export interface Suggestion { variable: Variable; reason: string; start: string; end: string; clamped: boolean; short: boolean }

/** Ranked suggestions: table order, dropping variables that are missing, unavailable or have no months in the period. */
export function rankVariables(topic: TopicId, place: PlaceId, variables: Variable[], choice: PeriodChoice, max = 3): Suggestion[] {
  return (TABLE[topic][place]?.items ?? []).flatMap(([id, reason]) => {
    const variable = variables.find((v) => v.id === id && v.available);
    const p = variable && periodFor(variable.coverage, choice);
    return variable && p ? [{ variable, reason, ...p }] : [];
  }).slice(0, max);
}

/** Example region for a topic and kind of place; null for "Pick on the map" (the user draws it). */
export const regionFor = (topic: TopicId, place: PlaceId): Suggested | null =>
  place === "map" ? null : TABLE[topic][place]?.region ?? PLACE_REGION[place];

// Curated research cases (starterCases.ts) shown as clues when they match the answers.
const CASE_PLACE: Record<PlaceType, PlaceId> = { desert: "desert", "rain forest": "rainforest", "river delta": "farmland",
  "big city": "city", farmland: "farmland", "mountains or snow": "cold", coast: "ocean" };
const CASE_TOPIC: Record<Curiosity, TopicId> = { rain: "water", "soil water": "soil", heat: "heat", evaporation: "water", "ocean life": "ocean" };
export const cluesFor = (topic: TopicId, place: PlaceId) =>
  STARTER_CASES.filter((c) => CASE_TOPIC[c.curiosity] === topic && CASE_PLACE[c.placeType] === place);

/** Every variable id the table can suggest (for tests). */
export const tableIds = () => [...new Set(Object.values(TABLE).flatMap((r) => Object.values(r).flatMap((x) => x!.items.map(([id]) => id))))];
