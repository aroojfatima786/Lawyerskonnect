/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        lk: {
          canvas: '#F8FAFC',
          surface: '#FFFFFF',
          navy: '#0F172A',
          accent: '#2563EB',
          success: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
          border: '#E2E8F0',
          muted: '#64748B',
          gold: '#C9A227',
        },
      },
      boxShadow: {
        'lk-card': '0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.06)',
        'lk-card-md': '0 4px 6px -1px rgb(15 23 42 / 0.07), 0 2px 4px -2px rgb(15 23 42 / 0.05)',
        'lk-card-lg': '0 10px 40px -10px rgb(15 23 42 / 0.12)',
      },
      maxWidth: {
        content: '1200px',
        wide: '1280px',
      },
    },
  },
  plugins: [],
};
