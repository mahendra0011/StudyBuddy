/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./client/index.html",
    "./client/src/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        muted: "#475467",
        line: "#dbe3ef",
        brand: "#2563eb"
      },
      boxShadow: {
        soft: "0 16px 40px rgba(15, 23, 42, 0.08)",
        tight: "0 1px 2px rgba(15, 23, 42, 0.05)"
      }
    }
  },
  plugins: []
};
