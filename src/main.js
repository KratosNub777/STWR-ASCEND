// Fuentes incluidas en la app (funcionan sin internet)
import "@fontsource/bricolage-grotesque/latin-500.css";
import "@fontsource/bricolage-grotesque/latin-700.css";
import "@fontsource/bricolage-grotesque/latin-800.css";
import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-500.css";
import "@fontsource/figtree/latin-600.css";
import "@fontsource/figtree/latin-700.css";
import "./styles.css";
import { startApp } from "./app.js";
import { isNative } from "./native.js";

startApp();

// Web: instalar como app y abrir sin conexión. En la app Android no hace falta.
if (!isNative() && "serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
