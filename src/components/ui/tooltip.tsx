import React, { useState, useRef, useEffect, useId } from 'react';
import { HelpCircle, Info, X } from 'lucide-react';

interface InfoTooltipProps {
  title: string;
  content?: string;
  formula?: string;
  icon?: 'help' | 'info';
  children?: React.ReactNode;
  metadata?: Array<{ label: string; value: string }>;
  details?: React.ReactNode;
}

export function InfoTooltip({
  title,
  content,
  formula,
  icon = 'info',
  children,
  metadata,
  details,
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<{
    vertical: 'top' | 'bottom';
    horizontal: 'left' | 'center' | 'right';
  }>({ vertical: 'bottom', horizontal: 'center' });
  const containerRef = useRef<HTMLDivElement>(null);
  const leaveTimeoutRef = useRef<number | null>(null);
  const hoverOpenedAtRef = useRef<number>(0);
  const tooltipId = useId();

  // Position calculation to completely prevent clipping on viewport edges
  useEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    // If element is within 360px of top of viewport, flip to render downward
    const vertical = rect.top < 360 ? 'bottom' : 'top';
    // If element is within 200px of right edge of viewport, align to right
    // If element is within 140px of left edge of viewport, align to left
    let horizontal: 'left' | 'center' | 'right' = 'center';
    if (window.innerWidth - rect.right < 200) {
      horizontal = 'right';
    } else if (rect.left < 140) {
      horizontal = 'left';
    }
    setPlacement({ vertical, horizontal });
  }, [open]);

  const handleMouseEnter = () => {
    if (leaveTimeoutRef.current) {
      window.clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    hoverOpenedAtRef.current = Date.now();
    setOpen(true);
  };

  const handleMouseLeave = () => {
    leaveTimeoutRef.current = window.setTimeout(() => {
      setOpen(false);
    }, 180);
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (leaveTimeoutRef.current) {
      window.clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    // If opened via mouseEnter in last 400ms, keep it pinned/open
    const elapsed = Date.now() - hoverOpenedAtRef.current;
    if (elapsed < 400 && open) {
      return;
    }
    setOpen((prev) => !prev);
  };

  // Close on Click-Outside or Escape key
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      if (leaveTimeoutRef.current) {
        window.clearTimeout(leaveTimeoutRef.current);
      }
    };
  }, [open]);

  const verticalClass = placement.vertical === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';
  const horizontalClass =
    placement.horizontal === 'right'
      ? 'right-0 translate-x-0'
      : placement.horizontal === 'left'
      ? 'left-0 translate-x-0'
      : 'left-1/2 -translate-x-1/2';

  const arrowVerticalClass =
    placement.vertical === 'top'
      ? 'top-full -mt-px border-t-[#16362a]'
      : 'bottom-full -mb-px border-b-[#16362a]';
  const arrowHorizontalClass =
    placement.horizontal === 'right'
      ? 'right-3'
      : placement.horizontal === 'left'
      ? 'left-3'
      : 'left-1/2 -translate-x-1/2';

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className="inline-flex items-center text-[#71877b] hover:text-[#16804a] transition-colors focus:outline-none focus:ring-1 focus:ring-[#16804a]/40 rounded p-0.5 cursor-pointer"
        onClick={handleButtonClick}
        onFocus={() => setOpen(true)}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        aria-label={`Scientific note about ${title}`}
      >
        {children ? (
          children
        ) : icon === 'help' ? (
          <HelpCircle size={13} className="opacity-75 hover:opacity-100" />
        ) : (
          <Info size={13} className="opacity-75 hover:opacity-100" />
        )}
      </button>

      {open && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`absolute ${verticalClass} ${horizontalClass} z-50 w-64 sm:w-72 max-w-[calc(100vw-32px)] rounded-xl border border-[#2b5944]/50 bg-[#16362a] p-3 text-xs text-white shadow-xl animate-in fade-in zoom-in-95`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="font-semibold text-[#86efac] flex items-center gap-1.5 text-xs">
              <Info size={13} className="text-[#36ca89] shrink-0" />
              <span>{title}</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[#8ea89a] hover:text-white p-0.5 rounded cursor-pointer"
              aria-label="Close tooltip"
            >
              <X size={12} />
            </button>
          </div>
          {content && <p className="leading-relaxed text-[#e4f1ea] text-[11px]">{content}</p>}

          {/* Structured Scientific Metadata Popover (Part 2 & 4) */}
          {metadata && metadata.length > 0 && (
            <div className="mt-2 divide-y divide-[#23533e] rounded-lg border border-[#23533e] bg-[#0d231a] px-2.5 py-0.5 text-[10px]">
              {metadata.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-1 gap-2">
                  <span className="text-[#86efac]/85 font-medium">{item.label}</span>
                  <span className="text-white font-mono text-right truncate max-w-[170px]" title={item.value}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {details && <div className="mt-2">{details}</div>}

          {formula && (
            <div className="mt-1.5 rounded-lg bg-[#0f251d] px-2 py-0.5 font-mono text-[10px] text-[#86e2b6] border border-[#235340]">
              {formula}
            </div>
          )}
          {/* Subtle arrow pointer */}
          <div className={`absolute ${arrowVerticalClass} ${arrowHorizontalClass} border-4 border-transparent`} />
        </div>
      )}
    </div>
  );
}
