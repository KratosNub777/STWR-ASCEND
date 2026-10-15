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
// Todos los días de un mes (month: 0 a 11)
export const monthKeys = (year, month) =>
  Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => dayKey(new Date(year, month, i + 1)));
export const weekKeys = (monday) => Array.from({ length: 7 }, (_, i) => dayKey(addDays(monday, i)));

export const clone = (v) => JSON.parse(JSON.stringify(v ?? {}));

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Confirmación con el diseño de la app (en vez del confirm() del navegador). Devuelve una promesa<boolean>.
const ICON_LOGOUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>';
const ICON_WARN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';

export function confirmDialog({ title, text, okLabel = "Aceptar", cancelLabel = "Cancelar", tone = "logout" }) {
  const dlg = $("confirmDlg");
  if (!dlg || typeof dlg.showModal !== "function") return Promise.resolve(window.confirm(`${title}\n\n${text}`));
  $("confirmTitle").textContent = title;
  $("confirmText").textContent = text;
  $("confirmOk").textContent = okLabel;
  $("confirmCancel").textContent = cancelLabel;
  const icon = $("confirmIcon");
  icon.className = "confirm-icon" + (tone === "warn" ? " warn" : "");
  icon.innerHTML = tone === "warn" ? ICON_WARN : ICON_LOGOUT;
  return new Promise((resolve) => {
    const done = () => {
      dlg.removeEventListener("close", done);
      dlg.removeEventListener("click", onBackdrop);
      resolve(dlg.returnValue === "ok");
    };
    // un clic fuera de la tarjeta (sobre el fondo) cancela
    const onBackdrop = (e) => { if (e.target === dlg) dlg.close("cancel"); };
    dlg.returnValue = "cancel";
    dlg.addEventListener("close", done);
    dlg.addEventListener("click", onBackdrop);
    dlg.showModal();
  });
}

// Avatar: la foto si hay, y si no, la inicial del nombre sobre un color que sale del propio nombre.
const AVATAR_COLORS = ["#ff6b4a", "#5fd3b5", "#9c9dff", "#f5c451", "#ff8fb1", "#5fb0ff", "#b58cff", "#7bd96b"];
export function avatarHtml(name, photo, extra = "") {
  const cls = `avatar${extra ? " " + extra : ""}`;
  if (photo) return `<span class="${cls}"><img src="${escapeHtml(photo)}" alt="" loading="lazy"></span>`;
  const n = String(name || "?").trim();
  let h = 0;
  for (const c of n) h = (h * 31 + c.codePointAt(0)) >>> 0;
  const initial = escapeHtml((Array.from(n)[0] || "?").toUpperCase());
  return `<span class="${cls}" style="background:${AVATAR_COLORS[h % AVATAR_COLORS.length]}">${initial}</span>`;
}

// Reduce una foto elegida a un cuadrado de 96 px en JPEG (unos pocos KB) para guardarla en el documento del jugador.
// Devuelve el texto "data:image/jpeg;base64,..." o lanza un Error si el archivo no es una imagen.
export async function resizePhoto(file, size = 96, maxChars = 12000) {
  if (!file || !/^image\//.test(file.type)) throw new Error("not-image");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error("not-image"));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error("not-image");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#12111c";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    for (let q = 0.82; q >= 0.4; q -= 0.14) {
      const out = canvas.toDataURL("image/jpeg", q);
      if (out.length <= maxChars) return out;
    }
    throw new Error("too-big");
  } finally {
    URL.revokeObjectURL(url);
  }
}
