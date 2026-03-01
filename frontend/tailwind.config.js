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