import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/feed": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/metrics": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/trending": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/demo": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/seed": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
