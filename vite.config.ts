import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/ux-task-tracker/" : "/",
  plugins: [react()],
  build: {
    sourcemap: false,
  },
}));
