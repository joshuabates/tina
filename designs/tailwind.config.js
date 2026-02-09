/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f8fafc",
        ink: "#0f172a",
      },
      boxShadow: {
        panel: "0 16px 32px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};
