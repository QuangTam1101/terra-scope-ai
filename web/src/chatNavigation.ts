import type { ChatAction, Region, Variable } from "./api";
import type { Selection } from "./store";

type Plan = { ok: true; page: ChatAction["page"]; selection: Partial<Selection>; hunt?: { a: string; b: string } }
  | { ok: false; reason: string };

/** Pages currently select complete years. Never round month-specific chat evidence. */
export function planChatNavigation(action: ChatAction, variables: Variable[], regions: Region[]): Plan {
  const p = action.params;
  if (!/^\d{4}-01$/.test(p.start) || !/^\d{4}-12$/.test(p.end) || p.start > p.end) {
    return { ok: false, reason: "This period cannot be represented exactly on the selected page. Keep the evidence in Detective." };
  }
  const variable = variables.find((v) => v.id === p.variable_id);
  if (!variable) return { ok: false, reason: "The selected variable is not available in the page catalog." };
  const region = p.region;
  const preset = region.type === "preset" ? regions.find((r) => r.id === region.id) : undefined;
  const place = region.type === "bbox" ? { ref: region, label: "Selected area", bbox: region.bbox }
    : preset ? { ref: region, label: preset.name, bbox: preset.bbox } : undefined;
  if (!place) return { ok: false, reason: "The region is not in the current catalog." };
  const selection = { parameter: variable.parameter, variableId: variable.id, place,
    startYear: Number(p.start.slice(0, 4)), endYear: Number(p.end.slice(0, 4)),
    startMonth: Number(p.start.slice(5, 7)) || 1, endMonth: Number(p.end.slice(5, 7)) || 12 };
  if (action.page === "hunt") {
    if (region.type !== "preset" || p.region_b?.type !== "preset") {
      return { ok: false, reason: "Hunt navigation needs two catalog presets. The comparison evidence stays in Detective." };
    }
    const secondRegion = p.region_b;
    const other = regions.find((r) => r.id === secondRegion.id);
    if (!other) return { ok: false, reason: "The second region is not in the current catalog." };
    return { ok: true, page: action.page, selection, hunt: { a: region.id, b: other.id } };
  }
  return { ok: true, page: action.page, selection };
}
