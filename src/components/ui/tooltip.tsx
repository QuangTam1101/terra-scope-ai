import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Info, HelpCircle, X } from 'lucide-react';

export interface InfoTooltipProps {
  title: string;
  content?: string;
  metadata?: Array<{ label: string; value: string }>;
  formula?: string;
  details?: ReactNode;
  icon?: 'info' | 'help';
  children?: ReactNode;
}

export function InfoTooltip({
  title,
  content,
  metadata,
  formula,
  details,
  icon = 'info',
  children,
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{
    vertical: 'top' | 'bottom';
    horizontal: 'center' | 'left' | 'right';
  }>({ vertical: 'bottom', horizontal: 'center' });

  const tooltipId = useRef(`tooltip-${Math.random().toString(36).slice(2, 9)}`).current;

  useEffect(() => {
    if (!open) return;

    const computePlacement = () => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const popoverWidth = 280;
      const popoverHeight = 160;

      const spaceBelow = window.innerHeight - rect.bottom;
      const vertical: 'top' | 'bottom' =
        spaceBelow < popoverHeight && rect.top > popoverHeight ? 'top' : 'bottom';

      let horizontal: 'center' | 'left' | 'right' = 'center';
      const centerPos = rect.left + rect.width / 2;
      if (centerPos + popoverWidth / 2 > window.innerWidth - 16) {
        horizontal = 'right';
      } else if (centerPos - popoverWidth / 2 < 16) {
        horizontal = 'left';
      }

      setPlacement({ vertical, horizontal });
    };

    computePlacement();
    window.addEventListener('resize', computePlacement);
    window.addEventListener('scroll', computePlacement, true);
    return () => {
      window.removeEventListener('resize', computePlacement);
      window.removeEventListener('scroll', computePlacement, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleMouseEnter = () => {
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;
    setOpen(true);
  };

  const handleMouseLeave = () => {
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;
    setOpen(false);
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((prev) => !prev);
  };

  const verticalClass =
    placement.vertical === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';
  const horizontalClass =
    placement.horizontal === 'right'
      ? 'right-0 translate-x-0'
      : placement.horizontal === 'left'
      ? 'left-0 translate-x-0'
      : 'left-1/2 -translate-x-1/2';

  const arrowVerticalClass =
    placement.vertical === 'top'
      ? 'top-full -mt-px border-t-[#2b2540]'
      : 'bottom-full -mb-px border-b-[#2b2540]';
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
        className="inline-flex items-center text-[#4e4860] hover:text-[#2b2540] transition-colors focus:outline-none focus:ring-2 focus:ring-[#2b2540] rounded-full p-0.5 cursor-pointer"
        onClick={handleButtonClick}
        onFocus={() => setOpen(true)}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        aria-label={`Note about ${title}`}
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
          className={`absolute ${verticalClass} ${horizontalClass} z-50 w-64 sm:w-72 max-w-[calc(100vw-32px)] rounded-[18px] border border-[#4e4860] bg-[#2b2540] p-3 text-xs text-white shadow-card animate-in fade-in zoom-in-95 font-nunito`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="font-extrabold text-[#ede6fb] flex items-center gap-1.5 text-xs">
              <Info size={13} className="text-[#ede6fb] shrink-0" />
              <span>{title}</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[#ece3d3] hover:text-white p-0.5 rounded cursor-pointer"
              aria-label="Close tooltip"
            >
              <X size={12} />
            </button>
          </div>
          {content && <p className="leading-relaxed text-[#fbf6ec] text-[11px] font-semibold">{content}</p>}

          {metadata && metadata.length > 0 && (
            <div className="mt-2 divide-y divide-[#3c3454] rounded-xl border border-[#3c3454] bg-[#1f1a2e] px-2.5 py-0.5 text-[10px]">
              {metadata.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-1 gap-2">
                  <span className="text-[#ede6fb] font-semibold">{item.label}</span>
                  <span className="text-white font-mono text-right truncate max-w-[170px]" title={item.value}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {details && <div className="mt-2">{details}</div>}

          {formula && (
            <div className="mt-1.5 rounded-lg bg-[#1f1a2e] px-2 py-0.5 font-mono text-[10px] text-[#ede6fb] border border-[#3c3454]">
              {formula}
            </div>
          )}
          <div className={`absolute ${arrowVerticalClass} ${arrowHorizontalClass} border-4 border-transparent`} />
        </div>
      )}
    </div>
  );
}
