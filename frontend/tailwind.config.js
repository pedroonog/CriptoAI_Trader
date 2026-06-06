/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0B0E14',
          panel: '#151A23',
          border: '#2A2E39'
        },
        brand: {
          green: '#00C853',
          red: '#FF3B30',
          blue: '#2962FF'
        }
      }
    },
  },
  plugins: [],
}