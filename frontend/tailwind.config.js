/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
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
    },
  },
  plugins: [],
}