/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Release 1.0 accessibility: Tailwind's slate-500 (#64748b) and slate-600 (#475569) are
        // 4.1:1 and 2.6:1 on the ink-925 background; these lifted values give ≥ 5.1:1 and ≥ 4.7:1
        // (WCAG AA for small text) while keeping the three-step hierarchy slate-400 > 500 > 600.
        slate: {
          500: '#7a8aa4',
          600: '#6e7e94',
        },
        ink: {
          950: '#05070a',
          925: '#080b10',
          900: '#0b0f15',
          850: '#10151d',
          800: '#141b25',
          700: '#1d2632',
          600: '#2a3542',
          500: '#3b4756',
        },
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.25' },
        },
      },
      animation: {
        blink: 'blink 0.9s steps(2, start) infinite',
      },
    },
  },
  plugins: [
    // `short:` — phones held sideways (too short for header + 3D view + sheet). Added as a variant
    // rather than a raw screen so Tailwind's arbitrary min-[…]/max-[…] variants keep working.
    ({ addVariant }) => addVariant('short', '@media (max-height: 500px) and (orientation: landscape)'),
  ],
}
