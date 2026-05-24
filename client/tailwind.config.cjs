/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./client/index.html",
    "./client/src/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        muted: "#475467",
        line: "#dbe3ef",
        brand: "#2563eb"
      },
      boxShadow: {
        soft: "0 20px 55px rgba(15, 23, 42, 0.10)",
        tight: "0 1px 2px rgba(15, 23, 42, 0.06)"
      }
    }
  },
  plugins: []
};
