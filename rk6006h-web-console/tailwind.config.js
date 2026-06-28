/** @type {import('tailwindcss').Config} */
//
// 颜色 token 全部由 CSS 变量驱动（见 src/styles/global.css :root），
// 切换 [data-theme] 即可在浅色/深色间整体换肤，无需改动组件。
// accent 为强调色（按钮/告警），两套主题通用。
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'rgb(var(--c-bg) / <alpha-value>)',
          panel: 'rgb(var(--c-panel) / <alpha-value>)',
          raised: 'rgb(var(--c-panel-raised) / <alpha-value>)',
        },
        // 语义文字色：主 / 次 / 弱
        ink: {
          DEFAULT: 'rgb(var(--c-text) / <alpha-value>)',
          muted: 'rgb(var(--c-text-muted) / <alpha-value>)',
          faint: 'rgb(var(--c-text-faint) / <alpha-value>)',
        },
        // 叠加色：边框 / 悬停高光（深色主题=白、浅色主题=深，按需取透明度）
        overlay: 'rgb(var(--c-overlay) / <alpha-value>)',
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
