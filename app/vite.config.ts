import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// relative base: the app works under any sub-path (GitHub Pages serves it at /<repo>/)
export default defineConfig({
  base: "./",
  plugins: [react()],
});
