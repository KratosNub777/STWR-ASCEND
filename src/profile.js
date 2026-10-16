// Perfil e historial de estudio: solo dibuja a partir de los datos que le pasa app.js.
import { dayKey, addDays, mondayOf, monthKeys, escapeHtml } from "./util.js";

const FLAME = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2s5 4.6 5 10a5 5 0 0 1-10 0c0-2 1-3.6 2-4.6 0 1.6.8 2.8 2 3.1C10.6 7.6 12 2 12 2Z"/></svg>';

export const timeLabel = (m) => {
  m = Math.round(Number(m) || 0);
  return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;
};
const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dayLabel = (k) => cap(parseKey(k).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" }));
const num = (v) => Number(v) || 0;

/** Días con al menos una sesión, del más nuevo al más viejo: [[clave, {m, s}]]. */
function activeDays(days) {
  return Object.keys(days).filter((k) => num(days[k] && days[k].s) > 0).sort().reverse().map((k) => [k, { m: num(days[k].m), s: num(days[k].s) }]);
}

/** Racha más larga dentro de los días guardados. */
function longestStreak(keys) {
  const set = new Set(keys);
  let best = 0;
  keys.forEach((k) => {
    if (set.has(dayKey(addDays(parseKey(k), -1)))) return; // no es el comienzo de una racha
    let n = 0, d = parseKey(k);
    while (set.has(dayKey(d))) { n++; d = addDays(d, 1); }
    best = Math.max(best, n);
  });
  return best;
}

const stat = (label, value, sub = "") =>
  `<div class="stat"><small>${label}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ""}</div>`;

/** Pestaña "Resumen": números clave y tiempo por capítulo. */
export function summaryHtml({ days, chapters, total, streak, posWeek, posMonth, posAll, players }) {
  const list = activeDays(days);
  const best = list.reduce((b, x) => (x[1].m > (b ? b[1].m : 0) ? x : b), null);
  const weekKeys = Array.from({ length: 7 }, (_, i) => dayKey(addDays(mondayOf(new Date()), i)));
  const week = weekKeys.reduce((a, k) => { const d = days[k]; return d ? { m: a.m + num(d.m), s: a.s + num(d.s) } : a; }, { m: 0, s: 0 });
  const now = new Date();
  const month = monthKeys(now.getFullYear(), now.getMonth()).reduce((a, k) => { const d = days[k]; return d ? { m: a.m + num(d.m), s: a.s + num(d.s) } : a; }, { m: 0, s: 0 });
  const today = days[dayKey(new Date())] || { m: 0, s: 0 };
  const avg = list.length ? Math.round(list.reduce((a, x) => a + x[1].m, 0) / list.length) : 0;
  const pos = (p) => (p ? `Puesto ${p} de ${players}` : "Sin puesto todavía");

  let html = '<div class="stat-grid">'
    + stat("Estudiado en total", timeLabel(total.m), `${total.s} ${total.s === 1 ? "sesión" : "sesiones"}`)
    + stat("Hoy", timeLabel(today.m), `${num(today.s)} ${num(today.s) === 1 ? "sesión" : "sesiones"}`)
    + stat("Esta semana", timeLabel(week.m), pos(posWeek))
    + stat(`Este mes (${now.toLocaleDateString("es", { month: "long" })})`, timeLabel(month.m), pos(posMonth))
    + stat("Ranking general", posAll ? `#${posAll}` : "—", pos(posAll))
    + stat("Racha actual", `${FLAME}${streak} ${streak === 1 ? "día" : "días"}`, `Máxima: ${longestStreak(list.map((x) => x[0]))} (últimos 70 días)`)
    + stat("Promedio por día activo", list.length ? timeLabel(avg) : "—", `${list.length} ${list.length === 1 ? "día" : "días"} con estudio`)
    + stat("Mejor día", best ? timeLabel(best[1].m) : "—", best ? dayLabel(best[0]) : "")
    + "</div>";

  const rows = Object.keys(chapters).map(Number).filter((n) => n >= 1 && n <= 13 && num(chapters[n].m) > 0).sort((a, b) => a - b);
  const maxCh = Math.max(1, ...rows.map((n) => num(chapters[n].m)));
  html += '<h3 class="profile-sub">Tiempo por capítulo</h3>';
  html += rows.length
    ? '<ul class="bars">' + rows.map((n) => {
        const c = chapters[n];
        return `<li><span class="bar-label">Cap. ${n}</span><span class="bar"><i style="width:${Math.max(4, (num(c.m) / maxCh) * 100).toFixed(1)}%"></i></span><span class="bar-val">${timeLabel(c.m)}</span></li>`;
      }).join("") + "</ul>"
    : '<p class="profile-empty">Todavía no estudiaste ningún capítulo. Completá una sesión y aparece acá.</p>';
  return html;
}

/** Pestaña "Historial": gráfico de los últimos 14 días y lista de días agrupada por semana. */
export function historyHtml({ days }) {
  const today = new Date();
  const last14 = Array.from({ length: 14 }, (_, i) => dayKey(addDays(today, i - 13)));
  const max = Math.max(1, ...last14.map((k) => num(days[k] && days[k].m)));
  let html = '<h3 class="profile-sub">Últimos 14 días</h3><div class="spark" role="img" aria-label="Minutos estudiados por día en los últimos 14 días">'
    + last14.map((k) => {
        const m = num(days[k] && days[k].m);
        const d = parseKey(k);
        const isToday = k === dayKey(today);
        return `<div class="spark-col${isToday ? " today" : ""}" title="${escapeHtml(dayLabel(k))}: ${timeLabel(m)}"><span class="spark-bar"><i style="height:${m ? Math.max(6, (m / max) * 100).toFixed(1) : 0}%"></i></span><small>${d.getDate()}</small></div>`;
      }).join("") + "</div>";

  const list = activeDays(days);
  if (!list.length) return html + '<p class="profile-empty">Todavía no hay sesiones en tu historial. Cada sesión de estudio completa queda anotada acá, con su día, sus minutos y su capítulo.</p>';

  const thisMon = mondayOf(today);
  const groups = new Map();
  list.forEach(([k, v]) => {
    const mon = mondayOf(parseKey(k));
    const key = dayKey(mon);
    if (!groups.has(key)) groups.set(key, { mon, items: [], m: 0, s: 0 });
    const g = groups.get(key);
    g.items.push([k, v]); g.m += v.m; g.s += v.s;
  });
  const weekTitle = (mon) => {
    const diff = Math.round((thisMon - mon) / (7 * 864e5));
    if (diff === 0) return "Esta semana";
    if (diff === 1) return "Semana pasada";
    return `Semana del ${mon.toLocaleDateString("es", { day: "numeric", month: "long" })}`;
  };
  const maxDay = Math.max(...list.map((x) => x[1].m));
  html += '<h3 class="profile-sub">Día por día</h3>';
  groups.forEach((g) => {
    html += `<section class="hist-week"><header><b>${weekTitle(g.mon)}</b><span>${timeLabel(g.m)} · ${g.s} ${g.s === 1 ? "sesión" : "sesiones"}</span></header><ul>`
      + g.items.map(([k, v]) =>
        `<li><div class="hist-top"><span class="hist-day">${dayLabel(k)}</span><span class="hist-val">${timeLabel(v.m)} · ${v.s} ${v.s === 1 ? "sesión" : "sesiones"}</span></div><span class="bar"><i style="width:${Math.max(4, (v.m / maxDay) * 100).toFixed(1)}%"></i></span></li>`
      ).join("") + "</ul></section>";
  });
  return html + '<p class="profile-empty">Se guardan los últimos 70 días. El total general nunca se borra.</p>';
}
