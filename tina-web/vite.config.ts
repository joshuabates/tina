import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@convex/_generated": path.resolve(__dirname, "../convex/_generated"),
      "@convex": path.resolve(__dirname, "../convex"),
    },
  },
  server: {
    port: 5173,
  },
});
