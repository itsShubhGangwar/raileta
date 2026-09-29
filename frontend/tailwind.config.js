/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        rail: {
          navy: '#0B162C',
          deep: '#112244',
          royal: '#1E3A8A',
          indigo: '#3730A3',
          accent: '#4F46E5',
          gold: '#F59E0B',
        },
      },
      boxShadow: {
        'rail-card': '0 10px 30px -5px rgba(15, 23, 42, 0.08), 0 4px 12px -2px rgba(15, 23, 42, 0.04)',
        'rail-float': '0 22px 45px -10px rgba(15, 23, 42, 0.18), 0 8px 20px -6px rgba(30, 58, 138, 0.12)',
      },
    },
  },
  plugins: [],
};
