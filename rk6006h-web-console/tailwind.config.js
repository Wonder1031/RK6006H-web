/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 工业仪表风格主色
        surface: {
          DEFAULT: '#0f1419',
          panel: '#161b22',
          raised: '#1f2630',
        },
        accent: {
          DEFAULT: '#3b82f6',
          warn: '#f59e0b',
          danger: '#ef4444',
          ok: '#22c55e',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Cascadia Code"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
