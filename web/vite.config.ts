import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  resolve: {
    alias: {
      "@core": "/src",
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: "../dist-web",
    emptyOutDir: true,
  },
});

