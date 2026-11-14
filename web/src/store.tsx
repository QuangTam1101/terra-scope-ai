import { isCelsius, seriesF, trendF, variableF, type TempUnit } from "./units";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, errorText, type BBox, type ChatContext, type ChatHistoryTurn, type ChatResponse, type Region, type RegionRef, type SeriesResponse, type TrendResponse, type Variable } from "./api";
import { pointPlace, setGridCell } from "./places";
import { pageFromHash } from './pageRouting';

export type Page = "landing" | "home" | "explore" | "hunt" | "detective" | "report";

export interface Place { ref: RegionRef; label: string; bbox: BBox }
export interface Selection { parameter: string; variableId: string; startYear: number; endYear: number; place: Place }
export interface Run { key: string; series: SeriesResponse; trend: TrendResponse; variable: Variable; place: Place }
export interface ChatExchange { id: string; question: string; context: ChatContext; response?: ChatResponse; error?: string }

interface Store {
  page: Page; go: (p: Page) => void;
  variables: Variable[]; regions: Region[]; ready: boolean;
  sel: Selection; setSel: (patch: Partial<Selection>) => void;
  run: Run | null; running: boolean; runAnalysis: (override?: Partial<Selection>) => Promise<boolean>;
  history: Run[];
  tempUnit: TempUnit; setTempUnit: (u: TempUnit) => void;
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
    const sync = () => setPage(pageFromHash(location.hash));
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
  const [toast, setToast] = useState<string | null>(null);
  const [tempUnit, setTempUnitState] = useState<TempUnit>(() => { try { return localStorage.getItem("tempUnit") === "F" ? "F" : "C"; } catch { return "C"; } });
  const setTempUnit = useCallback((u: TempUnit) => { setTempUnitState(u); try { localStorage.setItem("tempUnit", u); } catch { /* private mode */ } }, []);
  const reqId = useRef(0);
  // Session memory survives page navigation; a reload starts a new conversation.
  const [chatTurns, setChatTurns] = useState<ChatExchange[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const [huntSelection, setHuntSelection] = useState<{ a: string; b: string } | null>(null);
  const chatInFlight = useRef(false);

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
      const response = await api.chat({ message: question, context, history: prior, use_tools: true });
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
    Promise.all([api.variables(), api.regions()])
      .then(([v, r]) => {
        setVariables(v); setRegions(r.regions); setGridCell(r.limits.cell_size_deg); setReady(true);
        // default period = everything the data covers (the backend pre-computes maps for exactly this period)
        const end = v.find((x) => x.id === "merra2_air_temperature_2m")?.coverage?.end;
        if (end) setSelState((s) => ({ ...s, endYear: Number(end.slice(0, 4)) }));
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
    const start = `${s.startYear}-01`, end = `${s.endYear}-12`;
    setRunning(true);
    try {
      const [series, trend] = await Promise.all([
        api.series(s.variableId, s.place.ref, start, end),
        api.trends(s.variableId, s.place.ref, start, end),
      ]);
      if (id !== reqId.current) return false;           // a newer run started meanwhile
      const r: Run = { key: trend.trend_id, series, trend, variable, place: s.place };
      setRun(r);
      setHistory((h) => [r, ...h.filter((x) => x.key !== r.key)].slice(0, 12));
      return true;
    } catch (e) {
      if (id === reqId.current) showError(e);
      return false;
    } finally {
      if (id === reqId.current) setRunning(false);
    }
  }, [sel, variables, showError]);

  // Everything the pages read goes through the chosen temperature unit (the API always answers in °C).
  const shown = useMemo(() => {
    if (tempUnit === "C") return { variables, run, history };
    const runF = (r: Run): Run => (isCelsius(r.variable.display_units)
      ? { ...r, variable: variableF(r.variable), series: seriesF(r.series), trend: trendF(r.trend) } : r);
    return { variables: variables.map(variableF), run: run && runF(run), history: history.map(runF) };
  }, [tempUnit, variables, run, history]);

  const value = useMemo<Store>(() => ({
    page, go, variables: shown.variables, regions, ready, sel, setSel, run: shown.run, running, runAnalysis, history: shown.history,
    toast, showError, clearToast: () => setToast(null), tempUnit, setTempUnit,
    variable: shown.variables.find((v) => v.id === sel.variableId),
    chatTurns, chatBusy, sendChat, clearChat, chatContext, huntSelection, setHuntSelection,
  }), [page, go, shown, regions, ready, sel, setSel, running, runAnalysis, toast, showError, tempUnit, setTempUnit,
       chatTurns, chatBusy, sendChat, clearChat, chatContext, huntSelection]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
