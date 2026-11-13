import React, { useState } from 'react';
import { Bot, ChevronRight, HelpCircle, Send, Sparkles, X, BookOpen, AlertCircle, Play } from 'lucide-react';
import { TerraScopeApi, type AIExplainResponse } from '../lib/api';
import type { CellProperties, Metric, RegionId, Variable } from '../lib/types';

interface AIEarthDetectiveProps {
  currentVariable?: Variable | null;
  currentRegion?: RegionId | null;
  currentPeriod?: string;
  selectedCell?: CellProperties | null;
  metric?: Metric | null;
}

const SAMPLE_QUESTIONS = [
  'Can you forecast 2030 rainfall in Northern Vietnam?',
  'Explain this p-value in simple terms.',
  'How to interpret the 95% Confidence Interval?',
  'What is the difference between GPM IMERG and GLDAS?',
  'Did climate change cause these regional differences?',
];

export function AIEarthDetective({
  currentVariable,
  currentRegion,
  currentPeriod,
  selectedCell: _selectedCell,
  metric,
}: AIEarthDetectiveProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Array<{ q: string; response: AIExplainResponse }>>([]);

  const handleAsk = async (textToAsk: string) => {
    if (!textToAsk.trim()) return;
    setLoading(true);
    setQuery('');

    try {
      const response = await TerraScopeApi.explainQuery({
        question: textToAsk,
        context: {
          variable: currentVariable ?? undefined,
          region: currentRegion ?? undefined,
          period: currentPeriod,
          metric: metric ?? undefined,
        },
      });

      setHistory(prev => [...prev, { q: textToAsk, response }]);
    } catch {
      // Graceful error handling
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      void handleAsk(query);
    }
  };

  // Close on Escape key
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  return (
    <>
      {/* Sleek Floating Entry Point */}
      <div className="fixed bottom-4 right-4 z-40">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="group flex items-center gap-2 rounded-full bg-[#16362a] text-white px-3 py-2 shadow-lg shadow-[#16362a]/20 hover:bg-[#0f271e] transition-all hover:scale-[1.02] active:scale-[0.98] border border-[#2b5944]/60 focus:outline-none focus:ring-2 focus:ring-[#16804a]/50 cursor-pointer"
          aria-expanded={isOpen}
          aria-label="Toggle AI Earth Detective assistant"
        >
          <div className="relative">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#16804a] text-white shadow-2xs">
              <Bot size={13} />
            </span>
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34d399] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10b981]"></span>
            </span>
          </div>
          <div className="text-left pr-1">
            <div className="text-[11px] font-bold tracking-tight flex items-center gap-1">
              AI Detective
              <span className="rounded bg-[#20513b] px-1 py-0.2 text-[8px] font-semibold text-[#86efac]">
                Preview
              </span>
            </div>
          </div>
        </button>
      </div>

      {/* Dimmed Backdrop Scrim */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#07161f]/35 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-out Drawer */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-detective-title"
          className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col border-l border-[#dbe7df] animate-in slide-in-from-right duration-250"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#1f4a38] bg-[#16362a] px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#16804a] text-white">
                <Bot size={19} />
              </div>
              <div>
                <h3 id="ai-detective-title" className="text-sm font-bold flex items-center gap-2">
                  AI Earth Detective
                  <span className="rounded-full bg-[#24523c] px-2 py-0.5 text-[9px] font-semibold text-[#86efac]">
                    Planned /explain
                  </span>
                </h3>
                <p className="text-[11px] text-[#a9cfb9]">
                  Environmental reasoning & statistics explainer
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1.5 text-[#a9cfb9] hover:bg-[#204937] hover:text-white transition"
              aria-label="Close assistant"
            >
              <X size={18} />
            </button>
          </div>

          {/* Planned Feature Banner */}
          <div className="bg-[#fefaf4] border-b border-[#f5dfc6] px-4 py-2.5 text-xs text-[#8a5b1e] flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-[#c27b2b]" />
            <div className="text-[11px] leading-relaxed">
              <strong>Preview:</strong> Illustrates how the upcoming FastAPI{' '}
              <code className="bg-[#fceddc] px-1 rounded font-mono text-[10px]">/explain</code>{' '}
              endpoint translates satellite trends into plain language explanations.
            </div>
          </div>

          {/* Chat / Content Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {history.length === 0 && (
              <div className="space-y-4 text-xs text-[#527260]">
                <div className="rounded-xl border border-[#e2ece5] bg-[#f8faf9] p-4">
                  <div className="font-bold text-sm text-[#16362a] mb-1 flex items-center gap-1.5">
                    <Sparkles size={15} className="text-[#16804a]" />
                    How to use the assistant
                  </div>
                  <p className="leading-relaxed text-[#617b6c]">
                    Earth observation data involves statistical methods like Theil–Sen slope estimation
                    and Seasonal Mann–Kendall hypothesis testing.
                  </p>
                  <p className="mt-2 leading-relaxed text-[#617b6c]">
                    Select any suggested inquiry below or ask a custom question:
                  </p>
                </div>

                <div>
                  <div className="font-semibold uppercase tracking-wider text-[10px] text-[#71877b] mb-2 flex items-center gap-1">
                    <HelpCircle size={12} />
                    Suggested Inquiries
                  </div>
                  <div className="space-y-1.5">
                    {SAMPLE_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => void handleAsk(q)}
                        className="w-full text-left rounded-xl border border-[#e2ece5] bg-white p-2.5 text-xs font-medium text-[#16362a] hover:border-[#16804a] hover:bg-[#f3f9f5] transition flex items-center justify-between group shadow-2xs"
                      >
                        <span>{q}</span>
                        <ChevronRight size={14} className="text-[#a4c0af] group-hover:text-[#16804a]" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {history.map((item, idx) => (
              <div key={idx} className="space-y-3">
                {/* User query bubble */}
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#16804a] px-3.5 py-2 text-xs text-white shadow-xs font-medium">
                    {item.q}
                  </div>
                </div>

                {/* Assistant response card (Rule R7: displays cited_numbers, actions, and disclaimer) */}
                <div className="rounded-2xl border border-[#e2ece5] bg-white p-4 shadow-xs space-y-3 text-xs leading-relaxed text-[#16362a]">
                  <div className="flex items-center justify-between border-b border-[#edf3ef] pb-2">
                    <span className="font-bold text-[#166534] flex items-center gap-1.5">
                      <BookOpen size={13} />
                      Scientific Synthesis
                    </span>
                    <span className="rounded bg-[#edf6f0] px-2 py-0.5 text-[10px] font-semibold text-[#16804a]">
                      AI-generated
                    </span>
                  </div>

                  <p className="text-[#2b4c3b]">{item.response.answer}</p>

                  {/* Cited Numbers Chips (Rule R7) */}
                  {item.response.cited_numbers && item.response.cited_numbers.length > 0 && (
                    <div className="rounded-xl border border-[#d8e8dc] bg-[#f8fbf9] p-2.5 space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#4d705c]">
                        Cited Statistical Values
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.response.cited_numbers.map((cn, ci) => (
                          <span
                            key={ci}
                            className="inline-flex items-center gap-1 rounded-md bg-white border border-[#d1e3d7] px-2 py-0.5 text-[11px] font-medium text-[#164e3a] shadow-2xs"
                            title={`Source field: ${cn.source_field}`}
                          >
                            <span className="text-[#658774]">{cn.label}:</span>
                            <strong className="font-semibold text-[#166534]">
                              {cn.value} {cn.units}
                            </strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key points insights */}
                  {item.response.keyPoints && item.response.keyPoints.length > 0 && (
                    <div className="rounded-xl bg-[#f8faf9] p-3 border border-[#e5eee8]">
                      <div className="font-semibold text-[11px] text-[#164e3a] mb-1.5">Key Insights</div>
                      <ul className="list-disc list-inside space-y-1 text-[11px] text-[#4d705c]">
                        {item.response.keyPoints.map((pt, i) => (
                          <li key={i}>{pt}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Runnable Actions from AI (Section 4.9) */}
                  {item.response.actions && item.response.actions.length > 0 && (
                    <div className="pt-1">
                      {item.response.actions.map((act, ai) => (
                        <button
                          key={ai}
                          type="button"
                          onClick={() => {
                            setIsOpen(false);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#16804a] text-white px-2.5 py-1.5 text-[11px] font-semibold hover:bg-[#12683c] transition shadow-xs"
                        >
                          <Play size={11} fill="currentColor" />
                          <span>
                            Run analysis ({act.params?.variable_id === 'imerg_precip' ? 'Precipitation' : 'Soil Moisture'})
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {item.response.scientificReferences && item.response.scientificReferences.length > 0 && (
                    <div className="text-[10px] text-[#71877b] border-t border-[#edf3ef] pt-2">
                      <span className="font-semibold text-[#506e5d]">Methodology Sources: </span>
                      {item.response.scientificReferences.join('; ')}
                    </div>
                  )}

                  {item.response.suggestedFollowUps && (
                    <div className="pt-2 border-t border-[#edf3ef]">
                      <div className="text-[10px] font-semibold text-[#71877b] mb-1.5">Related Queries:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.response.suggestedFollowUps.map((followUp, fi) => (
                          <button
                            key={fi}
                            type="button"
                            onClick={() => void handleAsk(followUp)}
                            className="rounded-lg border border-[#d2e4d8] bg-[#f0f6f2] px-2 py-1 text-[10px] font-medium text-[#185336] hover:bg-[#e1f0e6] transition"
                          >
                            {followUp}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mandatory AI Disclaimer (Rule R7) */}
                  <div className="rounded-lg border border-[#f5dfc6] bg-[#fefaf4] p-2 text-[10px] leading-tight text-[#8a5b1e] flex items-start gap-1.5">
                    <AlertCircle size={12} className="shrink-0 text-[#c27b2b] mt-0.5" />
                    <span>{item.response.disclaimer}</span>
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 rounded-xl bg-[#f0f7f3] p-3 text-xs text-[#16804a] border border-[#d2e6da]">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#16804a] border-t-transparent" />
                <span>Synthesizing environmental context...</span>
              </div>
            )}
          </div>

          {/* Footer Input */}
          <div className="border-t border-[#e2ece5] bg-white p-3.5">
            <form onSubmit={handleFormSubmit} className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about p-values, trends, or NASA data..."
                className="flex-1 rounded-xl border border-[#d8e5dd] bg-[#f8faf9] px-3.5 py-2 text-xs text-[#16362a] placeholder-[#8ba395] focus:border-[#16804a] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16804a]/15"
              />
              <button
                type="submit"
                disabled={!query.trim() || loading}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#16804a] text-white hover:bg-[#126b3e] transition disabled:opacity-40"
                aria-label="Submit query"
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
