import { useState } from 'react';
import { Database, MapPin, Play, CheckCircle2, Compass, X, ChevronRight, Sparkles } from 'lucide-react';

interface OnboardingGuideProps {
  hasVariable: boolean;
  hasDataset: boolean;
  hasRegion: boolean;
  hasPeriod: boolean;
  isAnalyzed: boolean;
  onRunDemo?: () => void;
}

export function OnboardingGuide({
  hasVariable,
  hasDataset,
  hasRegion,
  hasPeriod,
  isAnalyzed,
  onRunDemo,
}: OnboardingGuideProps) {
  const [dismissed, setDismissed] = useState(false);

  if (isAnalyzed || dismissed) return null;

  const hasStep1 = hasVariable && hasDataset;
  const hasStep2 = hasRegion && hasPeriod;
  const isReady = hasStep1 && hasStep2;

  return (
    <div className="relative flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d8e6de] bg-gradient-to-r from-[#f4faf6] via-white to-[#f4faf6] px-3.5 py-2.5 shadow-2xs">
      {/* Title & icon */}
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#16804a] text-white shadow-2xs">
          <Compass size={14} />
        </span>
        <span className="text-xs font-bold text-[#16362a] tracking-tight">
          Quick Setup:
        </span>
      </div>

      {/* Modern Compact Stepper Pills */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* Step 1 */}
        <div
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
            hasStep1
              ? 'bg-[#e2f5e8] text-[#166534] border border-[#b9e5c9]'
              : 'bg-[#fafcfb] text-[#527361] border border-[#e2ebe5]'
          }`}
        >
          {hasStep1 ? (
            <CheckCircle2 size={13} className="text-[#16804a]" />
          ) : (
            <Database size={12} className="text-[#71877b]" />
          )}
          <span>1. Variable & Dataset</span>
        </div>

        <ChevronRight size={12} className="text-[#9cb5a6] hidden sm:inline-block" />

        {/* Step 2 */}
        <div
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
            hasStep2
              ? 'bg-[#e2f5e8] text-[#166534] border border-[#b9e5c9]'
              : 'bg-[#fafcfb] text-[#527361] border border-[#e2ebe5]'
          }`}
        >
          {hasStep2 ? (
            <CheckCircle2 size={13} className="text-[#16804a]" />
          ) : (
            <MapPin size={12} className="text-[#71877b]" />
          )}
          <span>2. Study Region & Window</span>
        </div>

        <ChevronRight size={12} className="text-[#9cb5a6] hidden sm:inline-block" />

        {/* Step 3 */}
        <div
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
            isReady
              ? 'bg-[#16804a] text-white shadow-xs font-semibold'
              : 'bg-[#fafcfb] text-[#8ea396] border border-[#e2ebe5]'
          }`}
        >
          <Play size={10} fill="currentColor" />
          <span>3. Run Analysis</span>
        </div>
      </div>

      {/* 1-Click Demo Shortcut (Rule R12) & Dismiss Button */}
      <div className="flex items-center gap-2">
        {onRunDemo && (
          <button
            type="button"
            onClick={onRunDemo}
            className="inline-flex items-center gap-1 rounded-lg border border-[#c6e5d2] bg-white px-2.5 py-1 text-[11px] font-bold text-[#16804a] shadow-2xs hover:bg-[#ebf8f0] transition-colors"
            title="Load calibrated demonstration parameters and run trend analysis immediately"
          >
            <Sparkles size={11} className="text-[#16804a]" />
            <span>Try 1-Click Demo</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-[#8ea396] hover:text-[#16362a] p-1 rounded-md transition-colors"
          aria-label="Dismiss setup guide"
          title="Dismiss guide"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
