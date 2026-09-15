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
          // THE SIX CHROME TOKENS FOLLOW THE ROOM'S THEME (2026-09-15).
          // They were these exact hexes and still are outside the room; the
          // values now live in src/index.css as RGB channels and are
          // overridden inside `.room` per theme in room/room.css. The channel
          // form is what keeps `bg-george-line/40` working. The reason is at
          // the top of index.css: /pages/:id renders these components inside
          // the room's dark chrome, where a fixed navy is unreadable.
          cream: 'rgb(var(--g-cream) / <alpha-value>)',   // page surface
          paper: 'rgb(var(--g-paper) / <alpha-value>)',   // raised: cards, receipts, input
          line: 'rgb(var(--g-line) / <alpha-value>)',     // hairline borders
          navy: 'rgb(var(--g-navy) / <alpha-value>)',     // primary text and headings
          slate: 'rgb(var(--g-slate) / <alpha-value>)',   // secondary text, metadata
          muted: 'rgb(var(--g-muted) / <alpha-value>)',   // tertiary: timestamps, citations
          // RESERVED: "needs you" only — notices and approvals (UI rule 5).
          // Never use for errors, warnings or emphasis.
          accent: '#D2691E',
          'accent-soft': '#FBEDE1',

          // SEMANTIC DATA COLOUR (UI System V2, Stage 5). A separate namespace
          // from the chrome and from the accent, and the invariant that admits
          // a token here is: EVERY TOKEN NAMES A REAL DATA OR INTERACTION
          // STATE. There is no ceiling on how many, and there is no token
          // for a feeling, an emphasis or an empty space.
          //
          // `up` and `down` are a direction of CHANGE the tool measured — more
          // and less — never good and bad: a fall in returns is a rise in
          // something. They appear only inside an instrument whose own data
          // declares direction (a ranking by change, a driver split), never on
          // a bare figure, and never as the only carrier: the bar diverges from
          // a drawn zero line and the signed figure is printed beside it.
          //
          // Blue against coral, not green against red. Validated 2026-09-08
          // with the dataviz palette validator on this cream surface: the
          // green/red pair failed (deutan ΔE 5.7 — the pair ~8% of men cannot
          // separate — and the green read as grey); this pair passes every
          // check (protan ΔE 18.5, chroma clear, ≥3:1 on cream).
          data: {
            up: '#2E6FA8',
            down: '#C0472B',
            // A change of exactly zero, when a bar has to exist for it.
            flat: '#8496AC',
          },
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