/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Serif KR"', 'serif'],
        serif: ['"Noto Serif KR"', 'serif'],
      },
      colors: {
        background: "#f0fdf4", // Light green (Emerald 50)
        foreground: "#064e3b", // Dark emerald (Emerald 900)
        card: "#ffffff",
        primary: "#059669", // Emerald 600
      }
    },
  },
  plugins: [],
}
