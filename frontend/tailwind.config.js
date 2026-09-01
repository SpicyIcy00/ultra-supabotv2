/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        'xs': '475px',
      },
      colors: {
        background: '#0e1117',
        foreground: '#ffffff',
        primary: {
          DEFAULT: '#00d2ff',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#3a47d5',
          foreground: '#ffffff',
        },

        // George's palette. ADDITIVE — the tokens above are the existing dark
        // app theme and keep their meaning exactly. George is cream-on-navy and
        // would invert every existing page if it redefined `background` or
        // `primary`, so it namespaces instead. Only components under
        // src/components/george and GeorgePage use `george-*`.
        george: {
          cream: '#FBF7EF',   // page surface
          paper: '#FFFDF8',   // raised surface: cards, receipts, input
          line: '#E4DCCB',    // hairline borders on cream
          navy: '#12233F',    // primary text and headings
          slate: '#4A5D78',   // secondary text, metadata
          muted: '#8496AC',   // tertiary: timestamps, citations
          // RESERVED: "needs you" only — notices and approvals (UI rule 5).
          // Never use for errors, warnings or emphasis.
          accent: '#D2691E',
          'accent-soft': '#FBEDE1',
        },
      },
      fontFamily: {
        // System serif — no webfont, so headings paint on first frame with no
        // FOUT and no network dependency.
        'george-serif': ['ui-serif', 'Georgia', 'Cambria', '"Times New Roman"', 'serif'],
      },
      minHeight: {
        'touch': '44px',
      },
      minWidth: {
        'touch': '44px',
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
}