import { isCelsius, seriesF, trendF, variableF, type TempUnit } from "./units";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, errorText, type BBox, type ChatContext, type ChatHistoryTurn, type ChatResponse, type Region, type RegionRef, type SeriesResponse, type TrendResponse, type Variable } from "./api";
import { pointPlace, setGridCell } from "./places";
import { pageFromHash } from './pageRouting';
import type { RegionalProgress } from "./progress";
import type { ReportComparison } from "./report/model";
import { CASE_SCHEMA, type CaseItem, type SavedCase } from "./cases";
import { initialAudience, saveAudience, type Audience } from "./audience";

export type Page = "landing" | "start" | "home" | "explore" | "forecast" | "hunt" | "detective" | "report";

export interface Place { ref: RegionRef; label: string; bbox: BBox }
import { periodEnd, periodStart } from "./period";
export interface Selection { parameter: string; variableId: string; startYear: number; endYear: number; startMonth?: number; endMonth?: number; place: Place }
export interface Run { key: string; series: SeriesResponse; trend: TrendResponse; variable: Variable; place: Place }
export interface ChatExchange { id: string; question: string; context: ChatContext; response?: ChatResponse; error?: string }

interface Store {
  page: Page; go: (p: Page) => void;
  variables: Variable[]; regions: Region[]; ready: boolean;
  sel: Selection; setSel: (patch: Partial<Selection>) => void;
  run: Run | null; running: boolean; runAnalysis: (override?: Partial<Selection>) => Promise<boolean>;
  /** Real per-request state of the running regional analysis (Phase 8.5A); null when idle. */
  progress: RegionalProgress | null; cancelAnalysis: () => void;
  history: Run[];
  /** Comparisons the user added to the report (Hunt, dataset agreement). */
  comparisons: ReportComparison[]; addComparison: (c: ReportComparison) => void; removeReportItem: (key: string) => void;
  backendVersion: string;
  /** Phase 8.5D4: snapshot of the report's analyses as a reproducible case, and reopening one (recomputed). */
  makeCase: (title: string) => SavedCase | null;
  openCase: (c: SavedCase) => Promise<{ ok: number; failed: number; changed: string[] }>;
  tempUnit: TempUnit; setTempUnit: (u: TempUnit) => void;
  /** Presentation preference only (Explorer / Scientist). Kept apart from the scientific state above. */
  audience: Audience; setAudience: (a: Audience) => void;
  toast: string | null; showError: (e: unknown) => void; clearToast: () => void;
  variable: Variable | undefined;
  chatTurns: ChatExchange[]; chatBusy: boolean;
  sendChat: (message: string, context: ChatContext) => Promise<void>;
  clearChat: () => void;
  chatContext: ChatContext | null;
  huntSelection: { a: string; b: string } | null;
  setHuntSelection: (value: { a: string; b: string }) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider missing");
  return s;
};

export const WORLD: Place = { ref: { type: "preset", id: "global" }, label: "Whole world", bbox: [-180, -90, 180, 90] };

export function cellPlace(lon: number, lat: number): Place {
  return pointPlace(lat, lon);   // label is plain coordinates, e.g. "16.5°S, 0.5°E"
}

export function areaPlace(bbox: BBox): Place {
  const [w, s, e, n] = bbox;
  const lat = (v: number) => `${Math.abs(v)}°${v >= 0 ? "N" : "S"}`;
  const lon = (v: number) => `${Math.abs(v)}°${v >= 0 ? "E" : "W"}`;
  return { ref: { type: "bbox", bbox }, label: `Area near ${lat(Math.round((s + n) / 2))}, ${lon(Math.round((w + e) / 2))}`, bbox };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>(() => pageFromHash(location.hash));
  useEffect(() => {
    // a link to another page (for example a Landing feature card) opens that page at its top
    const sync = () => setPage((prev) => { const next = pageFromHash(location.hash); if (next !== prev) window.scrollTo({ top: 0 }); return next; });
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [ready, setReady] = useState(false);
  const [sel, setSelState] = useState<Selection>({
    parameter: "air_temperature", variableId: "merra2_air_temperature_2m", startYear: 2001, endYear: 2024, place: WORLD,
  });
  const [run, setRun] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<Run[]>([]);
  const [comparisons, setComparisons] = useState<ReportComparison[]>([]);
  const [backendVersion, setBackendVersion] = useState("unknown");
  const addComparison = useCallback((c: ReportComparison) => setComparisons((x) => [c, ...x.filter((y) => y.key !== c.key)].slice(0, 8)), []);
  const removeReportItem = useCallback((key: string) => { setComparisons((x) => x.filter((y) => y.key !== key)); setHistory((h) => h.filter((r) => r.key !== key)); }, []);
  const [toast, setToast] = useState<string | null>(null);
  const [tempUnit, setTempUnitState] = useState<TempUnit>(() => { try { return localStorage.getItem("tempUnit") === "F" ? "F" : "C"; } catch { return "C"; } });
  const setTempUnit = useCallback((u: TempUnit) => { setTempUnitState(u); try { localStorage.setItem("tempUnit", u); } catch { /* private mode */ } }, []);
  // Switching audience only changes this value: no request is made, nothing in the analysis state is touched.
  const [audience, setAudienceState] = useState<Audience>(() => initialAudience());
  const setAudience = useCallback((a: Audience) => { setAudienceState(a); saveAudience(a); }, []);
  const reqId = useRef(0);
  const runCtrl = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<RegionalProgress | null>(null);
  // Session memory survives page navigation; a reload starts a new conversation.
  const [chatTurns, setChatTurns] = useState<ChatExchange[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const [huntSelection, setHuntSelection] = useState<{ a: string; b: string } | null>(null);
  const chatInFlight = useRef(false);
  const audienceRef = useRef(audience);
  audienceRef.current = audience;

  const sendChat = useCallback(async (message: string, context: ChatContext) => {
    const question = message.trim();
    if (!question || question.length > 2000 || chatInFlight.current) return;
    chatInFlight.current = true;
    const id = crypto.randomUUID();
    const prior: ChatHistoryTurn[] = chatTurns.filter((t) => t.response).slice(-12).flatMap((t) => [
      { role: "user" as const, content: t.question },
      { role: "assistant" as const, content: t.response!.answer.slice(0, 2000) },
    ]);
    setChatTurns((t) => [...t, { id, question, context }]);
    setChatBusy(true);
    try {
      const response = await api.chat({ message: question, context, history: prior, use_tools: true, audience_mode: audienceRef.current });
      setChatTurns((turns) => turns.map((t) => t.id === id ? { ...t, response } : t));
      if (response.resolved_context) setChatContext(response.resolved_context);
    } catch (e) {
      setChatTurns((turns) => turns.map((t) => t.id === id ? { ...t, error: errorText(e) } : t));
    } finally {
      chatInFlight.current = false;
      setChatBusy(false);
    }
  }, [chatTurns]);

  const clearChat = useCallback(() => {
    if (!chatInFlight.current) { setChatTurns([]); setChatContext(null); }
  }, []);

  const go = useCallback((p: Page) => { setPage(p); location.hash = p; window.scrollTo({ top: 0 }); }, []);
  const showError = useCallback((e: unknown) => setToast(errorText(e)), []);

  useEffect(() => {
    api.health().then((h) => setBackendVersion(h.version)).catch(() => undefined);
    Promise.all([api.variables(), api.regions()])
      .then(([v, r]) => {
        setVariables(v); setRegions(r.regions); setGridCell(r.limits.cell_size_deg); setReady(true);
        // default period = everything the data covers (the backend pre-computes maps for exactly this period)
        const end = v.find((x) => x.id === "merra2_air_temperature_2m")?.coverage?.end;
        if (end) setSelState((s) => ({ ...s, endYear: Number(end.slice(0, 4)), endMonth: 12 }));
      })
      .catch(showError);
  }, [showError]);

  const setSel = useCallback((patch: Partial<Selection>) => {
    setSelState((s) => ({ ...s, ...patch })); setChatContext(null); setHuntSelection(null);
  }, []);

  const runAnalysis = useCallback(async (override?: Partial<Selection>) => {
    const s = { ...sel, ...override };
    if (override) { setSelState(s); setChatContext(null); }
    const variable = variables.find((v) => v.id === s.variableId);
    if (!variable) return false;
    const id = ++reqId.current;
    runCtrl.current?.abort();                         // a newer analysis replaces the old one
    const ctrl = new AbortController(); runCtrl.current = ctrl;
    const start = periodStart(s), end = periodEnd(s);
    const base: RegionalProgress = { place: s.place.label, parameter: variable.parameter_name, dataset: variable.dataset_name,
      start, end, series: "pending", trend: "pending" };
    setProgress(base);
    const mark = (k: "series" | "trend", st: "done" | "failed") => { if (id === reqId.current) setProgress((p) => p && { ...p, [k]: st }); };
    setRunning(true);
    try {
      const [series, trend] = await Promise.all([
        api.series(s.variableId, s.place.ref, start, end, ctrl.signal).then((x) => { mark("series", "done"); return x; }, (e) => { mark("series", "failed"); throw e; }),
        api.trends(s.variableId, s.place.ref, start, end, ctrl.signal).then((x) => { mark("trend", "done"); return x; }, (e) => { mark("trend", "failed"); throw e; }),
      ]);
      if (id !== reqId.current) return false;           // a newer run started meanwhile: never show a stale result
      const r: Run = { key: trend.trend_id, series, trend, variable, place: s.place };
      setRun(r);
      setHistory((h) => [r, ...h.filter((x) => x.key !== r.key)].slice(0, 12));
      return true;
    } catch (e) {
      if (id === reqId.current && !ctrl.signal.aborted) showError(e);
      return false;
    } finally {
      if (id === reqId.current) { setRunning(false); setProgress(null); runCtrl.current = null; }
    }
  }, [sel, variables, showError]);

  const refOf = (r: { type: string; id?: string | null; bbox: BBox }): RegionRef =>
    r.type === "preset" && r.id ? { type: "preset", id: r.id } : { type: "bbox", bbox: r.bbox };

  const makeCase = useCallback((title: string): SavedCase | null => {
    const items: CaseItem[] = [
      ...history.map((h): CaseItem => ({ kind: "trend", variable_id: h.variable.id, region: h.place.ref, place_label: h.place.label, bbox: h.place.bbox,
        start: h.trend.start, end: h.trend.end, method: "seasonal_mk", alpha: 0.05,
        saved_result: { trend_id: h.trend.trend_id, slope_per_decade: h.trend.slope_per_decade, p_value: h.trend.p_value,
          significant: h.trend.significant, units: h.trend.units, product: h.trend.source.product, version: h.trend.source.version } })),
      ...comparisons.filter((c) => c.kind === "regions" && c.test).map((c): CaseItem => ({ kind: "compare", variable_id: c.a.trend.variable_id,
        region_a: refOf(c.a.trend.region), region_b: refOf(c.b.trend.region), label_a: c.a.label, label_b: c.b.label,
        start: c.a.trend.start, end: c.a.trend.end, method: "seasonal_mk", alpha: 0.05,
        saved_result: { compare_id: c.test!.compare_id, verdict: c.test!.verdict, slope_diff_per_decade: c.test!.difference.slope_diff_per_decade, p_value: c.test!.difference.p_value } })),
      ...comparisons.filter((c) => c.kind !== "regions" || !c.test).flatMap((c): CaseItem[] => [c.a, c.b].map((side) => ({ kind: "trend", variable_id: side.trend.variable_id,
        region: refOf(side.trend.region), place_label: side.label, bbox: side.trend.region.bbox, start: side.trend.start, end: side.trend.end,
        method: "seasonal_mk", alpha: 0.05 }))),
    ].slice(0, 12);
    if (!items.length) return null;
    const id = `case-${Date.now().toString(36)}`;
    return { schema: CASE_SCHEMA, id, title: title.trim().slice(0, 120) || "Saved case", created_at: new Date().toISOString(), backend_version: backendVersion, items };
  }, [history, comparisons, backendVersion]);

  const openCase = useCallback(async (c: SavedCase) => {
    let ok = 0, failed = 0; const changed: string[] = [];
    const close = (a: number | null | undefined, b: number | null | undefined) => a === b || (a != null && b != null && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a)));
    const label = (r: RegionRef, fallback: string) => (r.type === "preset" ? regions.find((x) => x.id === r.id)?.name ?? fallback : fallback);
    for (const it of c.items) {
      const variable = variables.find((v) => v.id === it.variable_id);
      if (!variable) { failed++; continue; }
      try {
        if (it.kind === "trend") {
          const [series, trend] = await Promise.all([api.series(it.variable_id, it.region, it.start, it.end), api.trends(it.variable_id, it.region, it.start, it.end)]);
          const place: Place = { ref: it.region, label: label(it.region, it.place_label), bbox: trend.region.bbox };
          const r: Run = { key: trend.trend_id, series, trend, variable, place };
          setHistory((h) => [r, ...h.filter((x) => x.key !== r.key)].slice(0, 12));
          if (it.saved_result && (!close(it.saved_result.slope_per_decade, trend.slope_per_decade) || !close(it.saved_result.p_value, trend.p_value)))
            changed.push(`${place.label} (${variable.dataset_name}, ${it.start} to ${it.end})`);
        } else {
          const [cmp, sa, sb] = await Promise.all([api.compare(it.variable_id, it.region_a, it.region_b, it.start, it.end),
            api.series(it.variable_id, it.region_a, it.start, it.end), api.series(it.variable_id, it.region_b, it.start, it.end)]);
          const la = label(it.region_a, it.label_a), lb = label(it.region_b, it.label_b);
          setComparisons((x) => [{ key: cmp.compare_id, kind: "regions" as const, title: `${variable.parameter_name}: ${la} vs ${lb}`,
            a: { label: la, dataset: variable.dataset_name, trend: cmp.a, series: sa }, b: { label: lb, dataset: variable.dataset_name, trend: cmp.b, series: sb },
            units: variable.display_units, variableName: variable.parameter_name, test: cmp }, ...x.filter((y) => y.key !== cmp.compare_id)].slice(0, 8));
          if (it.saved_result && (it.saved_result.verdict !== cmp.verdict || !close(it.saved_result.p_value, cmp.difference.p_value))) changed.push(`${la} vs ${lb}`);
        }
        ok++;
      } catch { failed++; }
    }
    return { ok, failed, changed };
  }, [variables, regions]);

  const cancelAnalysis = useCallback(() => {
    if (!runCtrl.current) return;
    reqId.current++; runCtrl.current.abort(); runCtrl.current = null;
    setRunning(false); setProgress(null);
  }, []);

  // Everything the pages read goes through the chosen temperature unit (the API always answers in °C).
  const shown = useMemo(() => {
    if (tempUnit === "C") return { variables, run, history };
    const runF = (r: Run): Run => (isCelsius(r.variable.display_units)
      ? { ...r, variable: variableF(r.variable), series: seriesF(r.series), trend: trendF(r.trend) } : r);
    return { variables: variables.map(variableF), run: run && runF(run), history: history.map(runF) };
  }, [tempUnit, variables, run, history]);

  const value = useMemo<Store>(() => ({
    page, go, variables: shown.variables, regions, ready, sel, setSel, run: shown.run, running, runAnalysis, progress, cancelAnalysis, history: shown.history, comparisons, addComparison, removeReportItem, backendVersion, makeCase, openCase,
    toast, showError, clearToast: () => setToast(null), tempUnit, setTempUnit, audience, setAudience,
    variable: shown.variables.find((v) => v.id === sel.variableId),
    chatTurns, chatBusy, sendChat, clearChat, chatContext, huntSelection, setHuntSelection,
  }), [page, go, shown, regions, ready, sel, setSel, running, runAnalysis, progress, cancelAnalysis, comparisons, addComparison, removeReportItem, backendVersion, makeCase, openCase, toast, showError, tempUnit, setTempUnit, audience, setAudience,
       chatTurns, chatBusy, sendChat, clearChat, chatContext, huntSelection]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
