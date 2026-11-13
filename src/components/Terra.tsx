interface TerraProps {
  size?: number;
  width?: number;
  height?: number;
  className?: string;
  ariaLabel?: string;
  decorative?: boolean;
}

export function Terra({
  size = 80,
  width,
  height,
  className = '',
  ariaLabel = 'Terra, a round Earth detective mascot with a hat and a magnifying glass',
  decorative = false,
}: TerraProps) {
  const w = width ?? size;
  const h = height ?? Math.round((size * 100) / 110);

  return (
    <svg
      viewBox="0 0 110 100"
      width={w}
      height={h}
      role={decorative ? 'presentation' : 'img'}
      aria-label={decorative ? undefined : ariaLabel}
      aria-hidden={decorative ? 'true' : undefined}
      className={`shrink-0 ${className}`}
      style={{ display: 'inline-block' }}
    >
      {/* Earth Body */}
      <circle cx="50" cy="58" r="34" fill="#8cc4ee" />
      {/* Continents */}
      <path d="M26 50c5-9 17-8 19 0s-5 13-11 13-12-5-8-13z" fill="#9edbb5" />
      <path d="M58 74c4-6 14-6 16 0s-4 9-9 9-9-4-7-9z" fill="#9edbb5" />
      <path d="M60 40c6-3 13 1 11 7s-9 5-12 1-2-7 1-8z" fill="#9edbb5" />
      {/* Eyes with sparkle */}
      <circle cx="40" cy="60" r="4" fill="#2b2540" />
      <circle cx="58" cy="60" r="4" fill="#2b2540" />
      <circle cx="41.3" cy="58.6" r="1.3" fill="#ffffff" />
      <circle cx="59.3" cy="58.6" r="1.3" fill="#ffffff" />
      {/* Rosy Blush Cheeks */}
      <circle cx="33" cy="68" r="4.5" fill="#f6a7a0" opacity=".75" />
      <circle cx="65" cy="68" r="4.5" fill="#f6a7a0" opacity=".75" />
      {/* Smile */}
      <path d="M43 69q6 5 12 0" fill="none" stroke="#2b2540" stroke-width="2.6" stroke-linecap="round" />
      {/* Detective Hat Brim & Crown */}
      <ellipse cx="50" cy="31" rx="33" ry="6" fill="#7a4a2e" />
      <path d="M29 31q1-19 21-19t21 19z" fill="#9b6440" />
      {/* Hat Ribbon */}
      <rect x="30" y="24" width="40" height="5" rx="2.5" fill="#f6c94c" />
      {/* Magnifying Glass */}
      <circle cx="92" cy="70" r="11" fill="#eaf7ff" stroke="#2b2540" stroke-width="4" />
      <path d="M84 78l-10 10" stroke="#2b2540" stroke-width="5.5" stroke-linecap="round" />
    </svg>
  );
}
