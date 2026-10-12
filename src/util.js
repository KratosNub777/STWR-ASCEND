// Utilidades compartidas: DOM, almacenamiento del dispositivo y fechas.

export const $ = (id) => document.getElementById(id);

// Solo comodidades del dispositivo (nombre, tiempos, cola de sesiones).
export const store = {
  get(k, fallback) {
    try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

// Fechas en hora local; la semana va de lunes a domingo.
export const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const mondayOf = (d) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(x, -((x.getDay() + 6) % 7));
};
export const weekKeys = (monday) => Array.from({ length: 7 }, (_, i) => dayKey(addDays(monday, i)));

export const clone = (v) => JSON.parse(JSON.stringify(v ?? {}));

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
