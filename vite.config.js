import { defineConfig } from "vite";

// Política de seguridad de contenido: solo se carga código propio y solo se habla con Firebase,
// el servidor de recuperación y la página que anuncia versiones nuevas. Se agrega solo al compilar
// (en desarrollo Vite inyecta scripts propios para recargar).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",          // los avatares usan style="" con el color
  "img-src 'self' data: blob:",                // fotos de perfil (data:) y selector de foto (blob:)
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://stwr-reset.pomodorinho.workers.dev https://kratosnub777.github.io",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join("; ");

const csp = () => ({
  name: "csp-meta",
  apply: "build",
  transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" }]
});

// base "./": la misma compilación sirve para GitHub Pages (subcarpeta) y para la app Android.
export default defineConfig({
  base: "./",
  plugins: [csp()],
  // Firestore pesa ~600 kB: es normal para esta app
  build: { outDir: "dist", target: "es2020", chunkSizeWarningLimit: 900 }
});
