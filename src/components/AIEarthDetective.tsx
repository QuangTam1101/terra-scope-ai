import { useState, useEffect, type FormEvent } from 'react';
import { Terra } from './Terra.tsx';
import { Card } from './ui/card.tsx';
import { TerraScopeApi, type AIExplainResponse } from '../lib/api.ts';
import type { Metric, RegionId, Variable } from '../lib/types.ts';

interface AIEarthDetectiveProps {
  currentVariable?: Variable | null;
  currentRegion?: RegionId | null;
  currentPeriod?: string;
  selectedCell?: any;
  metric?: Metric | null;
  onApplyAction?: (action: string) => void;
  initialQuery?: string;
}

const SAMPLE_PROMPTS = [
  'Is the world getting warmer?',
  'Where is soil drying?',
  'Why do datasets disagree?',
  'Explain this p-value in simple terms',
  'Can you forecast 2030 temperature?',
];

export function AIEarthDetective({
  currentVariable,
  currentRegion,
  currentPeriod = '2001-2024',
  metric,
  onApplyAction,
  initialQuery,
}: AIEarthDetectiveProps) {
  const [query, setQuery] = useState(initialQuery || '');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<
    Array<{ q: string; response: AIExplainResponse; isInitial?: boolean }>
  >([
    {
      q: 'Is the Mekong Delta getting hotter?',
      response: {
        answer:
          'Yes, the Delta warmed by +0.28 °C per decade with 95% CI [0.19, 0.33], Mann–Kendall p < 0.001, adjusted p < 0.001. GLDAS agrees: +0.34 °C per decade. Causes are not tested.',
        disclaimer:
          'AI-generated explanation based strictly on statistical results. Trend lines are past trends, not forecasts.',
        cited_numbers: [
          { label: "Sen's slope per decade", value: 0.28, units: '°C per decade', source_field: 'trend.slope_per_decade' },
          { label: '95% CI low', value: 0.19, units: '°C', source_field: 'trend.slope_ci' },
          { label: 'Mann–Kendall p', value: 0.001, units: 'p', source_field: 'trend.p_value' },
          { label: 'Adjusted p', value: 0.001, units: 'p_adj', source_field: 'trend.p_value_autocorr_adjusted' },
        ],
        actions: [
          { type: 'explore', params: { region: 'mekong_delta', label: 'Explore full trend for Mekong Delta' } },
          { type: 'compare', params: { dataset: 'gldas', label: 'Compare with GLDAS dataset' } },
        ],
        model: 'offline-template',
        isSimulated: true,
        status: 'live',
      },
      isInitial: true,
    },
  ]);

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  const handleAsk = async (textToAsk: string) => {
    if (!textToAsk.trim() || loading) return;
    setLoading(true);
    const qText = textToAsk;
    setQuery('');

    try {
      const response = await TerraScopeApi.explainQuery({
        question: qText,
        context: {
          variable: currentVariable ?? undefined,
          region: currentRegion ?? undefined,
          period: currentPeriod,
          metric: metric ?? undefined,
        },
      });

      setHistory((prev) => [...prev, { q: qText, response }]);
    } catch {
      // Fallback response with offline template indicator
      setHistory((prev) => [
        ...prev,
        {
          q: qText,
          response: {
            answer:
              'Based on NASA observations, historical trends represent past statistical changes, not causal proofs or forecasts.',
            disclaimer: 'AI-generated explanation based strictly on calculated statistics.',
            cited_numbers: [],
            actions: [],
            model: 'offline-template',
            isSimulated: true,
            status: 'live',
          },
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      void handleAsk(query);
    }
  };

  return (
    <div className="flex flex-wrap gap-5 items-start max-w-[1200px] w-full">
      {/* Main Conversation Stream */}
      <main className="flex-1 basis-[560px] min-w-0 flex flex-col gap-4 max-w-[860px]">
        {/* Header with Mascot */}
        <div className="flex items-center gap-3.5">
          <Terra size={68} />
          <h1 className="font-fredoka text-2xl sm:text-3xl font-semibold text-[#2b2540]">
            Ask Terra
          </h1>
        </div>

        {/* Scientific Disclaimer Banner */}
        <div
          role="note"
          className="bg-white border-2 border-[#2b2540] rounded-[20px] p-3.5 sm:p-4 font-bold text-xs sm:text-sm text-[#2b2540] leading-relaxed shadow-sm"
        >
          Terra only explains numbers from the statistics engine and can be wrong, especially about causes. Trend lines are past trends, not forecasts.
        </div>

        {/* Message Stream */}
        <div className="flex flex-col gap-4">
          {history.map((item, idx) => (
            <div key={idx} className="flex flex-col gap-3">
              {/* User Question Bubble */}
              <div className="self-end bg-[#2b2540] text-white rounded-[24px_24px_8px_24px] px-4 py-3 font-bold text-sm sm:text-base max-w-[75%] shadow-sm">
                {item.q}
              </div>

              {/* Offline Template Badge if applicable */}
              {item.response.model === 'offline-template' && (
                <div className="bg-white border-2 border-dashed border-[#8d86a0] rounded-[24px] p-3.5 flex flex-col gap-1 max-w-[660px]">
                  <span className="font-extrabold text-[11px] text-[#4e4860]">
                    Offline · template answer, no AI model used
                  </span>
                  <span className="font-semibold text-xs sm:text-sm text-[#2b2540] leading-relaxed">
                    {item.response.answer}
                  </span>
                </div>
              )}

              {/* AI Response Card (if not pure offline template or with citations) */}
              {item.response.model !== 'offline-template' && (
                <Card className="p-4 sm:p-5 rounded-[24px_24px_24px_8px] flex flex-col gap-2.5 max-w-[660px]">
                  <span className="badge-cute bg-[#2b2540] text-white self-start text-[10px] tracking-wider font-extrabold">
                    AI-GENERATED
                  </span>

                  <div className="font-semibold text-sm sm:text-base leading-relaxed text-[#2b2540]">
                    {item.response.answer}
                  </div>

                  {/* Cited numbers pills */}
                  {item.response.cited_numbers && item.response.cited_numbers.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1 border-t border-[#ece3d3]/70">
                      {item.response.cited_numbers.map((cn, cidx) => (
                        <span key={cidx} className="pt-cute" title={`Source: ${cn.source_field}`}>
                          <b>{cn.value >= 0 ? `+${cn.value}` : cn.value} {cn.units}</b>
                          <small>from trend result</small>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Action suggestions */}
                  {item.response.actions && item.response.actions.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {item.response.actions.map((act, aidx) => (
                        <button
                          key={aidx}
                          type="button"
                          onClick={() => onApplyAction?.(act.params?.label || act.type)}
                          className="chip-cute text-xs bg-[#ede6fb] text-[#2b2540] hover:bg-[#2b2540] hover:text-white transition-colors"
                        >
                          {act.params?.label || act.type}
                        </button>
                      ))}
                    </div>
                  )}
                </Card>
              )}
            </div>
          ))}

          {loading && (
            <div className="card-cute p-4 rounded-[24px_24px_24px_8px] flex items-center gap-2 max-w-[280px]">
              <span className="animate-spin text-base">🔍</span>
              <span className="font-bold text-xs sm:text-sm text-[#4e4860]">
                Terra is checking the statistics engine…
              </span>
            </div>
          )}
        </div>

        {/* Question Input Form */}
        <form onSubmit={handleSubmit} className="flex gap-2.5 mt-2">
          <label htmlFor="terra-q" className="sr-only">Ask Terra</label>
          <input
            id="terra-q"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about a place, trend, or NASA dataset…"
            className="flex-1 min-h-[50px] border-0 rounded-full bg-white shadow-card px-5 font-semibold text-sm text-[#2b2540] outline-none focus:ring-2 focus:ring-[#2b2540]"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            aria-label="Send"
            className="w-[50px] h-[50px] rounded-full bg-[#2b2540] text-white flex items-center justify-center cursor-pointer hover:bg-[#1d4f86] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
      </main>

      {/* Right Sidebar: Analysis Context & Prompt Suggestions */}
      <aside
        aria-label="Analysis Terra ran"
        className="flex-1 basis-[260px] max-w-[320px] card-cute p-5 flex flex-col gap-3.5"
      >
        <span className="font-fredoka text-lg font-semibold text-[#2b2540]">
          Analysis Terra ran
        </span>

        <div className="bg-[#f3eefe] rounded-[18px] p-3 font-semibold text-xs leading-relaxed text-[#2b2540]">
          POST /trends<br />
          parameter: {currentVariable || 'air temperature (2 m)'}<br />
          dataset: MERRA-2 (M2IMNXASM 5.12.4)<br />
          region: {currentRegion || 'Mekong Delta'}<br />
          {currentPeriod} · 288 months
        </div>

        <span className="font-semibold text-xs leading-relaxed text-[#3d3752]">
          Terra picks the variable, dataset, place, and period. The statistics engine computes every number.
        </span>

        <span className="font-fredoka text-base font-semibold text-[#2b2540] pt-2 border-t border-[#ece3d3]/80">
          Try asking
        </span>

        <div className="flex flex-col gap-2">
          {SAMPLE_PROMPTS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => void handleAsk(p)}
              className="btn-cute soft text-xs text-left justify-start py-2.5 h-auto leading-tight"
            >
              {p}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
