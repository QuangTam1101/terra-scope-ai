import type { Config } from 'tailwindcss';
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { ink: '#193e2d', mist: '#f5faf6', accent: '#16804a' }, boxShadow: { soft: '0 8px 32px rgba(26, 77, 48, .045)' } } },
  plugins: [],
} satisfies Config;
