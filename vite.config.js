import { defineConfig } from "vite";

// base "./": la misma compilación sirve para GitHub Pages (subcarpeta) y para la app Android.
export default defineConfig({
  base: "./",
  // Firestore pesa ~600 kB: es normal para esta app
  build: { outDir: "dist", target: "es2020", chunkSizeWarningLimit: 900 }
});
