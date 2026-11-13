import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        fredoka: ['Fredoka', '"Baloo 2"', 'Nunito', 'system-ui', 'sans-serif'],
        nunito: ['Nunito', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: '#fbf6ec',
        surface: '#ffffff',
        ink: '#2b2540',
        muted: '#4e4860',
        'muted-2': '#5e5872',
        line: '#ece3d3',
        track: '#efe7d8',
        hover: '#f6f1e8',
        lavender: '#ede6fb',
        'lavender-2': '#f3eefe',
        peach: '#fde2d4',
        'peach-ink': '#7a3b22',
        coral: '#e8735a',
        quality: '#7fd1c2',
        'trend-inc-bold': '#c4621a',
        'trend-inc-mid': '#f2a65a',
        'trend-inc-pale': '#fbe0c4',
        'trend-dec-bold': '#2f6fb3',
        'trend-dec-mid': '#7fb2e5',
        'trend-dec-pale': '#cfe1f4',
        nodata: '#a7a3b0',
      },
      boxShadow: {
        card: '0 10px 26px rgba(90, 70, 40, .09), 0 1px 0 rgba(90, 70, 40, .06)',
        pin: '0 4px 10px rgba(90, 70, 40, .18)',
        soft: '0 8px 22px rgba(90, 70, 40, .09), 0 1px 0 rgba(90, 70, 40, .06)',
      },
      borderRadius: {
        card: '28px',
      },
    },
  },
  plugins: [],
} satisfies Config;
