/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Rajdhani', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        kevlar: '#d4a017',
        plasma: '#22d3ee',
      },
      boxShadow: {
        hud: '0 0 40px rgba(34, 211, 238, 0.08)',
      },
    },
  },
  plugins: [],
}
