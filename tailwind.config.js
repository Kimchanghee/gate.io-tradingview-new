/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
    './routes/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'gate-primary': '#17d8a3',
        'gate-secondary': '#1a1f2e',
        'gate-dark': '#0d1421',
        'gate-card': '#1a1f2e',
        'gate-border': '#2d3446',
        'gate-text': '#ffffff',
        'gate-text-secondary': '#8b95a7',
        'gate-success': '#17d8a3',
        'gate-danger': '#f85149',
        'gate-warning': '#ffa116',
      },
    },
  },
  plugins: [],
};
