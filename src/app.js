// STWR-ASCEND: reloj, capítulos, tiempos, ranking y racha.
import { $, store, pad, dayKey, addDays, mondayOf, weekKeys, clone, escapeHtml, confirmDialog, avatarHtml, resizePhoto } from "./util.js";
import { unlockAudio, chime, keepAwake } from "./sound.js";
import {
  isConfigured, currentAccount, register, logIn, requestResetCode, confirmReset, logOut, watchPlayers, loadMine, createMine, updateMine, removeField, accountEmail
} from "./data.js";
import { summaryHtml, historyHtml, timeLabel } from "./profile.js";
import { isNative, scheduleAlerts, cancelAlerts, SITE_URL } from "./native.js";
// ---------- Constantes ----------
const OPTIONS = {
  study: [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90],
  short: [0, 3, 5, 10, 15],
  long: [0, 10, 15, 20, 25, 30]
};
const DEFAULT_MINS = { study: 25, short: 5, long: 15 };
const dur = (phase) => timer.mins[phase] * 60e3;
const PHASE_LABEL = { study: "Estudio", short: "Descanso corto", long: "Descanso largo" };
const KEEP_DAYS = 70;
const FLAME = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2s5 4.6 5 10a5 5 0 0 1-10 0c0-2 1-3.6 2-4.6 0 1.6.8 2.8 2 3.1C10.6 7.6 12 2 12 2Z"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4.5" height="16" rx="1.2"/><rect x="13.5" y="4" width="4.5" height="16" rx="1.2"/></svg>';
const TROPHY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v2H8v-2h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3V3Zm0 4H6v1a2 2 0 0 0 1 1.7V7Zm10 0v2.7A2 2 0 0 0 18 8V7h-1Z"/></svg>';

// ---------- Estado ----------
let myName = store.get("pomo.name", "");
let myId = null;
let connected = false;     // sesión iniciada en Firebase
let players = [];          // [{id, name, days}]
let view = store.get("pomo.view", "week");
if (!["day", "week", "all"].includes(view)) view = "week";
let prevRanks = null;      // {weekKey, ranks: {id: pos}, mins: {id: min}}
let pending = store.get("pomo.pending", []); // sesiones aún sin guardar en la base

let timer = Object.assign(
  { phase: "study", status: "idle", endAt: 0, remaining: 25 * 60e3, cycle: 0, chapter: 1, mins: { ...DEFAULT_MINS } },
  store.get("pomo.timer", {})
);
if (!OPTIONS[timer.phase]) timer.phase = "study";
const minsLabel = (m) => (m === 0 ? "Sin descanso" : `${m} min`);
timer.mins = Object.assign({ ...DEFAULT_MINS }, timer.mins);
// minutos permitidos al personalizar (0 en descansos = sin descanso)
const RANGE = { study: [5, 180], short: [0, 60], long: [0, 60] };
const validMins = (k, m) => Number.isInteger(m) && m >= RANGE[k][0] && m <= RANGE[k][1];
timer.custom = Object.assign({ study: false, short: false, long: false }, timer.custom);
Object.keys(OPTIONS).forEach((k) => { if (!validMins(k, timer.mins[k])) timer.mins[k] = DEFAULT_MINS[k]; });
const CHAPTERS = 13;
const validChap = (n) => Number.isInteger(n) && n >= 1 && n <= CHAPTERS;
if (!validChap(timer.chapter)) timer.chapter = 1;

// ---------- Temporizador ----------
const CIRC = 2 * Math.PI * 118;
$("ringBar").style.strokeDasharray = CIRC.toFixed(2);

function saveTimer() { store.set("pomo.timer", timer); }
function remainingMs() {
  return timer.status === "running" ? Math.max(0, timer.endAt - Date.now()) : timer.remaining;
}
function fmt(ms) {
  const s = Math.ceil(ms / 1000);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

// El reloj se calcula siempre por hora de fin (endAt), nunca contando segundos:
// así no se atrasa con la app en segundo plano o la pantalla apagada.
// `from` permite encadenar una fase justo donde terminó la anterior.
function start(from) {
  unlockAudio();
  if (timer.status === "running") return;
  const fresh = timer.phase === "study" && timer.status === "idle";
  timer.endAt = (from || Date.now()) + timer.remaining;
  timer.status = "running";
  saveTimer(); keepAwake(true); renderTimer(); planAlerts();
  if (fresh) writeProfile({ current: timer.chapter });
}
function pause() {
  if (timer.status !== "running") return;
  timer.remaining = Math.max(0, timer.endAt - Date.now());
  timer.status = "paused";
  saveTimer(); keepAwake(false); renderTimer(); planAlerts();
}
function setPhase(phase, autoStart, from) {
  timer.phase = phase;
  timer.remaining = dur(phase);
  timer.status = "idle";
  timer.endAt = 0;
  if (autoStart) { start(from); return; }
  saveTimer(); renderTimer(); planAlerts();
}
function resetPhase() {
  timer.remaining = dur(timer.phase);
  timer.status = "idle"; timer.endAt = 0;
  saveTimer(); keepAwake(false); renderTimer(); planAlerts();
}

// Avisos del sistema (app Android): fin de la fase actual y, si después viene un descanso, fin de ese descanso.
function planAlerts() {
  if (!isNative()) return;
  if (timer.status !== "running") { cancelAlerts(); return; }
  const alerts = [];
  if (timer.phase === "study") {
    const next = (timer.cycle || 0) + 1 >= 4 ? "long" : "short";
    const brk = timer.mins[next];
    alerts.push({
      at: timer.endAt,
      title: `¡Sesión completa! +${timer.mins.study} min`,
      body: brk ? `Capítulo ${timer.chapter}. Ahora toca ${next === "long" ? "el descanso largo" : "descansar"} ${brk} minutos.`
                : `Capítulo ${timer.chapter}. Seguís de corrido con la próxima sesión.`
    });
    if (brk) alerts.push({ at: timer.endAt + brk * 60e3, title: "Fin del descanso", body: "Cuando quieras, arrancá la próxima sesión." });
  } else {
    alerts.push({ at: timer.endAt, title: "Fin del descanso", body: "Cuando quieras, arrancá la próxima sesión." });
  }
  scheduleAlerts(alerts);
}

function completePhase() {
  const finished = timer.phase;
  const endedAt = timer.endAt || Date.now();
  chime(finished);
  if (finished === "study") {
    timer.cycle = (timer.cycle || 0) + 1;
    recordSession(new Date(timer.endAt || Date.now()));
    const long = timer.cycle >= 4;
    if (long) timer.cycle = timer.mins.long === 0 ? 0 : timer.cycle;
    const next = long ? "long" : "short";
    const gained = `<b>+${timer.mins.study} minutos</b> de Capítulo ${timer.chapter} sumados al ranking.`;
    if (timer.mins[next] === 0) {
      // sin descanso: la próxima sesión de estudio arranca sola
      toast(`${gained} Seguís de corrido con la próxima sesión.`);
      // encadena solo si volviste a tiempo: no se suman sesiones que nadie estudió mientras la app estaba cerrada
      setPhase("study", true, Date.now() - endedAt < 60e3 ? endedAt : undefined);
    } else {
      toast(long ? `<b>¡Cuarta sesión completa!</b> Te ganaste ${timer.mins.long} minutos de descanso.`
                 : `${gained} Ahora, ${timer.mins.short} minutos de descanso.`);
      setPhase(next, true, endedAt);
    }
  } else {
    if (finished === "long") timer.cycle = 0;
    keepAwake(false);
    toast("<b>Fin del descanso.</b> Cuando quieras, arrancá la próxima sesión.");
    setPhase("study", false);
  }
}
function tick() {
  if (timer.status === "running" && Date.now() >= timer.endAt) completePhase();
  renderClock();
}

let resetArmed = 0;
function onReset() {
  const midStudy = timer.phase === "study" && timer.status !== "idle";
  if (midStudy && !resetArmed) {
    resetArmed = setTimeout(disarmReset, 3500);
    renderTimer();
    return;
  }
  disarmReset(true);
  resetPhase();
}
function disarmReset(silent) {
  clearTimeout(resetArmed); resetArmed = 0;
  if (!silent) renderTimer();
}

function renderClock() {
  const ms = remainingMs();
  $("clock").textContent = fmt(ms);
  const frac = 1 - ms / dur(timer.phase);
  $("ringBar").style.strokeDashoffset = (CIRC * (1 - frac)).toFixed(2);
}
function renderTimer() {
  document.body.dataset.phase = timer.phase;
  document.querySelectorAll(".phase-tabs span").forEach((s) => s.classList.toggle("on", s.dataset.p === timer.phase));
  const running = timer.status === "running";
  $("startBtn").innerHTML = running ? `${ICON_PAUSE}<span>Pausar</span>`
    : `${ICON_PLAY}<span>${timer.status === "paused" ? "Seguir" : "Iniciar"}</span>`;
  const sub = {
    idle: timer.phase === "study" ? "Listo para estudiar" : `${PHASE_LABEL[timer.phase]} listo`,
    running: timer.phase === "study" ? "Concentración total" : "Despejate un rato",
    paused: "En pausa"
  };
  $("clockSub").textContent = sub[timer.status];
  const rb = $("resetBtn");
  rb.classList.toggle("warn", !!resetArmed);
  rb.querySelector("span").textContent = resetArmed ? "¿Seguro?" : "Reiniciar";
  $("skipBtn").hidden = timer.phase === "study";
  const note = $("timerNote");
  if (resetArmed) note.innerHTML = "Tocá <b>¿Seguro?</b> otra vez para reiniciar. Esta sesión <b>no va a sumar</b> minutos.";
  else if (timer.phase === "study") note.innerHTML = `Solo suman las sesiones de <b>${timer.mins.study} minutos completas</b>. Si reiniciás a mitad, esos minutos no cuentan.`;
  else note.innerHTML = "Los descansos no suman minutos, pero ayudan a rendir en la próxima sesión.";
  renderChapters();
  const done = timer.cycle || 0;
  $("cycle").innerHTML = Array.from({ length: 4 }, (_, i) => `<i class="${i < done ? "done" : ""}"></i>`).join("")
    + `<span>${timer.mins.long === 0 ? `${done}/4 del ciclo · sin descanso largo` : `${done}/4 hasta el descanso largo`}</span>`;
  renderClock();
}

// ---------- Capítulo y tiempos ----------
const SELECTS = { study: "durStudy", short: "durShort", long: "durLong" };
const CUSTOM = { study: "customStudy", short: "customShort", long: "customLong" };
function setupLocked() { return timer.status !== "idle"; }
const valueHtml = (m) => (m === 0 ? '<span class="zero">Sin descanso</span>' : `${m}<small>min</small>`);
function nearestOption(k, m) {
  return OPTIONS[k].reduce((best, o) => (Math.abs(o - m) < Math.abs(best - m) ? o : best), OPTIONS[k][0]);
}
function applyMins(k, n) {
  timer.mins[k] = n;
  if (timer.phase === k && timer.status === "idle") {
    if (n === 0) { setPhase("study", false); return; }
    timer.remaining = dur(k);
  }
  saveTimer(); renderTimer();
}
// Lista desplegable propia (la nativa no se puede estilizar)
let openDd = null;
function closeDd(focusBtn) {
  if (!openDd) return;
  const { btn, list } = openDd;
  list.hidden = true; btn.setAttribute("aria-expanded", "false");
  openDd = null;
  if (focusBtn) btn.focus();
}
function makeDropdown(btnId, items, getValue, onPick) {
  const btn = $(btnId), list = $(btnId + "List");
  items.forEach(({ value, html }) => {
    const o = document.createElement("button");
    o.type = "button"; o.className = "dd-opt"; o.setAttribute("role", "option");
    o.dataset.v = String(value); o.tabIndex = -1;
    o.innerHTML = `<span>${html}</span><span class="dot" aria-hidden="true"></span>`;
    list.append(o);
  });
  const opts = () => [...list.children];
  function open() {
    if (btn.disabled) return;
    closeDd();
    const cur = String(getValue());
    opts().forEach((o) => o.setAttribute("aria-selected", String(o.dataset.v === cur)));
    list.hidden = false; btn.setAttribute("aria-expanded", "true");
    openDd = { btn, list };
    const sel = opts().find((o) => o.dataset.v === cur) || opts()[0];
    sel.focus({ preventScroll: true });
    sel.scrollIntoView({ block: "nearest" });
  }
  btn.addEventListener("click", (e) => { e.stopPropagation(); openDd && openDd.btn === btn ? closeDd() : open(); });
  btn.addEventListener("keydown", (e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); } });
  list.addEventListener("click", (e) => {
    e.stopPropagation();
    const o = e.target.closest(".dd-opt");
    if (!o) return;
    closeDd(true);
    onPick(Number(o.dataset.v));
  });
  list.addEventListener("keydown", (e) => {
    const all = opts(), i = all.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); all[Math.min(all.length - 1, i + 1)].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); all[Math.max(0, i - 1)].focus(); }
    else if (e.key === "Escape") { e.preventDefault(); closeDd(true); }
    else if (e.key === "Tab") closeDd();
  });
}
document.addEventListener("click", () => closeDd());
function fillSelects() {
  makeDropdown("chapSelect",
    Array.from({ length: CHAPTERS }, (_, i) => ({ value: i + 1, html: `Capítulo ${i + 1}` })),
    () => timer.chapter,
    (n) => {
      if (setupLocked() || !validChap(n)) return renderChapters();
      timer.chapter = n; saveTimer(); renderChapters();
    });
  Object.entries(SELECTS).forEach(([k, id]) => {
    makeDropdown(id,
      OPTIONS[k].map((m) => ({ value: m, html: m === 0 ? "Sin descanso" : `${m}<span class="muted">min</span>` })),
      () => timer.mins[k],
      (n) => {
        if (setupLocked() || !OPTIONS[k].includes(n)) return renderChapters();
        applyMins(k, n);
      });
  });
}
function renderChapters() {
  const locked = setupLocked();
  if (locked) closeDd();
  $("chapSelect").disabled = locked;
  $("chapValue").textContent = `Capítulo ${timer.chapter}`;
  $("chapBox").classList.toggle("locked", locked && timer.phase !== "study");
  Object.entries(SELECTS).forEach(([k, id]) => {
    const m = timer.mins[k];
    const custom = timer.custom[k] || !OPTIONS[k].includes(m);
    const input = $(CUSTOM[k]);
    $(id).disabled = locked;
    $(k + "Value").innerHTML = valueHtml(m);
    $(k + "SelWrap").hidden = custom;
    $(CUSTOM[k] + "Row").hidden = !custom;
    $(k + "Hint").hidden = !custom;
    $(k + "Box").classList.toggle("is-custom", custom);
    $(k + "Box").classList.toggle("locked", locked);
    const t = $(k + "Toggle");
    t.setAttribute("aria-pressed", String(custom));
    t.lastChild.textContent = custom ? "Personalizado" : "Personalizar";
    t.disabled = locked;
    if (document.activeElement !== input) input.value = String(m);
    input.disabled = locked;
  });
  $("tabStudy").textContent = `Estudio ${timer.mins.study}′`;
  $("tabShort").textContent = timer.mins.short ? `Descanso ${timer.mins.short}′` : "Sin descanso";
  $("tabLong").textContent = timer.mins.long ? `Largo ${timer.mins.long}′` : "Sin largo";
  const mine = myChapters()[timer.chapter];
  const mm = mine ? Number(mine.m) || 0 : 0;
  $("chapInfo").innerHTML = locked && timer.phase === "study" ? "Estudiando ahora" : `Llevás <b>${mm} min</b>`;
}
Object.entries(SELECTS).forEach(([k, id]) => {
  $(k + "Toggle").addEventListener("click", () => {
    if (setupLocked()) return;
    const on = !(timer.custom[k] || !OPTIONS[k].includes(timer.mins[k]));
    timer.custom[k] = on;
    if (!on) { applyMins(k, nearestOption(k, timer.mins[k])); return; }
    saveTimer(); renderChapters();
    const input = $(CUSTOM[k]);
    try { input.focus(); input.select(); } catch {}
  });
  const input = $(CUSTOM[k]);
  const commit = () => {
    if (setupLocked()) return renderChapters();
    const raw = Math.round(Number(input.value));
    if (input.value.trim() === "" || !Number.isFinite(raw)) { input.value = String(timer.mins[k]); return; }
    const n = Math.min(RANGE[k][1], Math.max(RANGE[k][0], raw));
    input.value = String(n);
    if (n !== raw) toast(`<b>${k === "study" ? "El estudio" : "El descanso"} va de ${RANGE[k][0]} a ${RANGE[k][1]} minutos.</b> Lo dejé en ${n}.`);
    applyMins(k, n);
  };
  input.addEventListener("change", commit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
});
fillSelects();

$("startBtn").addEventListener("click", () => (timer.status === "running" ? pause() : start()));
$("resetBtn").addEventListener("click", onReset);
$("skipBtn").addEventListener("click", () => {
  if (timer.phase === "long") timer.cycle = 0;
  keepAwake(false); setPhase("study", false);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") { tick(); if (timer.status === "running") keepAwake(true); }
});
setInterval(tick, 250);

// ---------- Registro de sesiones ----------
function recordSession(when) {
  pending.push({ day: dayKey(when), at: when.getTime(), chapter: timer.chapter, m: timer.mins.study });
  store.set("pomo.pending", pending);
  // se ve al instante en la tabla, aunque la base tarde
  rebuild(); renderBoard(); renderChapters();
  flush();
}
function applySessions(days, list) {
  list.forEach(({ day, m }) => {
    const d = days[day] || { m: 0, s: 0 };
    days[day] = { m: (Number(d.m) || 0) + sessionMins(m), s: (Number(d.s) || 0) + 1 };
  });
}
// las sesiones viejas en cola no traían minutos: eran de 25
const sessionMins = (m) => (validMins("study", m) ? m : 25);
function applyChapters(chapters, list) {
  list.forEach(({ chapter, m }) => {
    if (!validChap(chapter)) return;
    const c = chapters[chapter] || { m: 0, s: 0 };
    chapters[chapter] = { m: (Number(c.m) || 0) + sessionMins(m), s: (Number(c.s) || 0) + 1 };
  });
}
function pruneDays(days) {
  const cutoff = dayKey(addDays(new Date(), -KEEP_DAYS));
  Object.keys(days).forEach((k) => { if (k < cutoff) delete days[k]; });
  return days;
}

// ---------- Guardado en Firestore ----------
// Las escrituras van en fila, de a una. Las sesiones se guardan en tandas del mismo día y capítulo,
// que es lo que validan las reglas de seguridad (firestore.rules).
let chain = Promise.resolve();
function queue(task) {
  chain = chain.then(task).catch(onWriteError);
  return chain;
}
let retryTimer = 0;
function onWriteError(e) {
  const code = e && e.code;
  if (code === "permission-denied") {
    // las reglas rechazaron el guardado (por ejemplo, minutos que todavía no pasaron): reintenta más tarde
    clearTimeout(retryTimer);
    retryTimer = setTimeout(flush, 5 * 60e3);
  } else if (code === "resource-exhausted") {
    toast("<b>La base del ranking llegó a su límite gratis de hoy.</b> Tus sesiones quedan guardadas y se suman mañana.");
  }
  // sin conexión u otros errores: la cola sigue en el dispositivo y se reintenta al volver la conexión
  return false;
}
const ready = () => connected && !!myId;

async function ensureDoc() {
  const cur = await loadMine();
  if (cur) return cur;
  if (!myName) return null;
  await createMine(myName);
  return loadMine();
}

// nombre, foto o capítulo actual: no suma minutos (photo: texto de la foto, o null para quitarla)
function writeProfile(fields) {
  if (!ready()) return;
  queue(async () => {
    const cur = await ensureDoc();
    if (!cur) return;
    const patch = {};
    if (fields.name && cur.name !== fields.name) patch.name = fields.name;
    if (validChap(fields.current) && cur.current !== fields.current) patch.current = fields.current;
    if (typeof fields.photo === "string" && cur.photo !== fields.photo) patch.photo = fields.photo;
    if (fields.photo === null && cur.photo) patch.photo = removeField();
    if (Object.keys(patch).length) await updateMine(patch, false);
  });
}

function dropPending(list) {
  pending = pending.filter((x) => !list.includes(x));
  store.set("pomo.pending", pending);
  rebuild(); renderBoard(); renderChapters();
}

let flushing = false;
function flush() {
  if (!pending.length || flushing || !ready()) return;
  flushing = true;
  let saved = false;
  queue(async () => {
    const cur = await ensureDoc();
    if (!cur) return;
    // lo que ya está en la base (por ejemplo, guardado sin conexión antes de cerrar la app) no se vuelve a sumar
    const done = Number(cur.lastSession) || 0;
    const stale = pending.filter((x) => x.at <= done);
    if (stale.length) dropPending(stale);
    const fresh = pending.filter((x) => x.at > done);
    if (!fresh.length) { saved = true; return; }
    const first = fresh[0];
    const batch = [];
    for (const x of fresh) {
      if (x.day !== first.day || x.chapter !== first.chapter || batch.length >= 20) break;
      batch.push(x);
    }
    const days = clone(cur.days), chapters = clone(cur.chapters), total = readTotal(cur.total, cur.days);
    applySessions(days, batch);
    applyChapters(chapters, batch);
    addToTotal(total, batch);
    const patch = { days: pruneDays(days), chapters, total, lastDay: first.day, lastSession: batch[batch.length - 1].at };
    if (validChap(first.chapter)) patch.current = first.chapter;
    await updateMine(patch, true);
    dropPending(batch);
    saved = true;
  }).finally(() => {
    flushing = false;
    if (saved && pending.length) flush();
  });
}
window.addEventListener("online", () => { if (!connected) connect(); else flush(); });

// jugadores = lo que dice la base + mis sesiones que todavía no se guardaron
let rawDocs = [];
function rebuild() {
  players = rawDocs.map(({ id, data }) => ({
    id,
    name: typeof data.name === "string" ? data.name.slice(0, 24) : "",
    days: JSON.parse(JSON.stringify(data.days && typeof data.days === "object" ? data.days : {})),
    chapters: JSON.parse(JSON.stringify(data.chapters && typeof data.chapters === "object" ? data.chapters : {})),
    total: readTotal(data.total, data.days),
    current: validChap(data.current) ? data.current : null,
    photo: typeof data.photo === "string" && data.photo.startsWith("data:image/jpeg;base64,") ? data.photo : ""
  }));
  const me = players.find((p) => p.id === myId);
  if (me) {
    store.set("pomo.localDays", me.days);
    store.set("pomo.localChapters", me.chapters);
    // sesiones de la cola que la base todavía no tiene (las ya guardadas sin conexión no se cuentan dos veces)
    const mineDoc = rawDocs.find((d) => d.id === myId);
    const done = Number(mineDoc && mineDoc.data.lastSession) || 0;
    const notSaved = pending.filter((x) => x.at > done);
    applySessions(me.days, notSaved);
    applyChapters(me.chapters, notSaved);
    addToTotal(me.total, notSaved);
  }
}

// ---------- Racha y totales ----------
function streakOf(days) {
  let d = new Date();
  if (!(days[dayKey(d)] && days[dayKey(d)].s)) d = addDays(d, -1); // hoy todavía cuenta como "en juego"
  let n = 0;
  while (days[dayKey(d)] && Number(days[dayKey(d)].s) > 0) { n++; d = addDays(d, -1); }
  return n;
}
function totals(days, keys) {
  let m = 0, s = 0;
  keys.forEach((k) => { const d = days[k]; if (d) { m += Number(d.m) || 0; s += Number(d.s) || 0; } });
  return { m, s };
}
// total histórico: se guarda aparte porque los días viejos se van borrando
function sumDays(days) { return totals(days || {}, Object.keys(days || {})); }
function readTotal(t, days) {
  return t && typeof t === "object" && Number.isFinite(Number(t.m))
    ? { m: Number(t.m) || 0, s: Number(t.s) || 0 }
    : sumDays(days);
}
function addToTotal(total, list) {
  list.forEach(({ m }) => { total.m += sessionMins(m); total.s += 1; });
}
function rankList(keys) {
  const list = players.filter((p) => p.name).map((p) => ({ ...p, ...(keys === "all" ? p.total : totals(p.days, keys)), streak: streakOf(p.days) }));
  list.sort((a, b) => b.m - a.m || b.s - a.s || a.name.localeCompare(b.name, "es"));
  let pos = 0, last = -1;
  list.forEach((p, i) => { if (p.m !== last) { pos = i + 1; last = p.m; } p.pos = pos; });
  return list;
}
function myChapters() {
  const me = players.find((p) => p.id === myId);
  if (me) return me.chapters;
  const ch = JSON.parse(JSON.stringify(store.get("pomo.localChapters", {})));
  applyChapters(ch, pending);
  return ch;
}
function localDays() {
  // mis días según la base más lo pendiente; sirve también sin conexión
  const me = players.find((p) => p.id === myId);
  if (me) return me.days;
  const days = JSON.parse(JSON.stringify(store.get("pomo.localDays", {})));
  applySessions(days, pending);
  return days;
}

// ---------- Render del ranking ----------
function myPlayer() { return players.find((p) => p.id === myId); }
function renderMe() {
  $("meName").textContent = myName || "—";
  const mine = myPlayer();
  $("meAvatar").innerHTML = avatarHtml(myName, mine && mine.photo, "avatar-sm");
  const n = streakOf(localDays());
  const el = $("meStreak");
  el.classList.toggle("off", n === 0);
  el.innerHTML = `${FLAME}${n} ${n === 1 ? "día" : "días"}`;
}

function renderBoard() {
  renderMe();
  renderProfile();
  const now = new Date();
  const keys = view === "day" ? [dayKey(now)] : view === "all" ? "all" : weekKeys(mondayOf(now));
  const list = rankList(keys);
  $("tabDay").setAttribute("aria-selected", String(view === "day"));
  $("tabWeek").setAttribute("aria-selected", String(view === "week"));
  $("tabAll").setAttribute("aria-selected", String(view === "all"));
  $("boardTitle").textContent = { day: "Ranking de hoy", week: "Ranking de la semana", all: "Ranking general" }[view];
  $("thTime").textContent = view === "all" ? "Tiempo" : "Minutos";

  const leaderMins = list.length ? list[0].m : 0;
  const tbody = $("rows");
  tbody.textContent = "";
  list.forEach((p) => {
    const tr = document.createElement("tr");
    const isLead = p.m > 0 && p.m === leaderMins;
    if (isLead) tr.classList.add("lead");
    if (p.id === myId) tr.classList.add("me");
    if (p.m === 0) tr.classList.add("zero");

    const tdPos = document.createElement("td");
    tdPos.innerHTML = `<span class="pos">${p.pos}</span>`;

    const tdName = document.createElement("td");
    tdName.className = "name-cell";
    const line = document.createElement("div");
    line.className = "name-line";
    const nm = document.createElement("span");
    nm.className = "pname"; nm.textContent = p.name;
    line.append(nm);
    if (isLead) line.insertAdjacentHTML("beforeend", `<span class="tag tag-lead">${{ week: "Líder", day: "Líder de hoy", all: "Récord" }[view]}</span>`);
    if (p.id === myId) line.insertAdjacentHTML("beforeend", '<span class="tag tag-me">Vos</span>');
    if (p.current) line.insertAdjacentHTML("beforeend", `<span class="tag tag-chap" title="Capítulo que está estudiando">Cap. ${p.current}</span>`);
    if (p.streak > 0) line.insertAdjacentHTML("beforeend", `<span class="mini-streak" title="Racha">${FLAME}${p.streak}</span>`);
    const row = document.createElement("div");
    row.className = "name-row";
    row.insertAdjacentHTML("beforeend", avatarHtml(p.name, p.photo));
    row.append(line);
    tdName.append(row);

    const tdMin = document.createElement("td");
    tdMin.className = "num";
    tdMin.innerHTML = view === "all" && p.m >= 60
      ? `<span class="mins">${Math.floor(p.m / 60)}<small>h</small> ${p.m % 60}<small>min</small></span>`
      : `<span class="mins">${p.m}<small>min</small></span>`;
    const tdSes = document.createElement("td");
    tdSes.className = "num sess";
    tdSes.textContent = p.s;
    tr.append(tdPos, tdName, tdMin, tdSes);
    tbody.append(tr);
  });
  $("tableWrap").hidden = list.length === 0;
  const anyMinutes = list.some((p) => p.m > 0);
  $("empty").hidden = anyMinutes;
  $("empty").innerHTML = view === "day"
    ? "<strong>Hoy todavía nadie sumó minutos</strong>Completá una sesión de estudio y quedás arriba de la tabla."
    : view === "all"
    ? "<strong>Todavía no hay tiempo acumulado</strong>Acá se suma todo lo que estudió cada uno desde que empezó, sin reinicios."
    : "<strong>La semana arranca en cero</strong>Cuando alguien complete una sesión de estudio, aparece acá con sus minutos y sesiones.";

  // meta: participantes y reinicio del lunes
  const nextMon = addDays(mondayOf(now), 7);
  const left = nextMon - now;
  const dd = Math.floor(left / 864e5), hh = Math.floor((left % 864e5) / 36e5);
  const people = list.length;
  $("boardMeta").innerHTML = `<span><b>${people}</b> ${people === 1 ? "participante" : "participantes"}</span>`
    + (view === "all" ? "<span>Suma todo lo estudiado, <b>nunca se reinicia</b></span>"
      : `<span>Reinicio semanal en <b>${dd > 0 ? dd + " d " : ""}${hh} h</b></span>`);

  // ganador de la semana pasada
  const lastWeek = rankList(weekKeys(addDays(mondayOf(now), -7)));
  const champ = lastWeek[0];
  if (champ && champ.m > 0) {
    const winners = lastWeek.filter((p) => p.m === champ.m).map((p) => p.name).join(" y ");
    $("champName").textContent = `${winners} · ${champ.m} min`;
    $("champ").hidden = false;
  } else $("champ").hidden = true;
}

// ---------- Mensajes de ánimo al subir de puesto ----------
const CHEERS_ME = [
  "Seguí así, ya casi tocás la cima.",
  "Ese esfuerzo se nota. Vamos por más.",
  "Un pomodoro más y quién te para.",
  "Los demás ya te ven venir."
];
const CHEERS_OTHER = [
  "Se pone picante la tabla.",
  "¿Lo vas a dejar pasar?",
  "Hora de abrir los apuntes.",
  "La competencia está que arde."
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function checkClimbs() {
  const now = new Date();
  const wk = dayKey(mondayOf(now));
  const list = rankList(weekKeys(mondayOf(now)));
  const ranks = {}, mins = {};
  list.forEach((p) => { ranks[p.id] = p.pos; mins[p.id] = p.m; });
  if (prevRanks && prevRanks.weekKey === wk) {
    list.forEach((p) => {
      const before = prevRanks.ranks[p.id];
      if (before && p.pos < before && p.m > (prevRanks.mins[p.id] || 0)) {
        if (p.id === myId) {
          toast(`<b>¡Subiste al puesto ${p.pos}!</b> ${p.pos === 1 ? "Ahora sos líder de la semana. Defendé la corona." : pick(CHEERS_ME)}`, true);
        } else {
          const safe = escapeHtml(p.name);
          toast(`<b>${safe} subió al puesto ${p.pos}.</b> ${pick(CHEERS_OTHER)}`);
        }
      }
    });
  }
  prevRanks = { weekKey: wk, ranks, mins };
}
function toast(html, mine) {
  const el = document.createElement("div");
  el.className = "toast" + (mine ? " me-up" : "");
  el.innerHTML = `${TROPHY}<div>${html}</div>`;
  $("toasts").append(el);
  setTimeout(() => el.remove(), 5200);
  while ($("toasts").children.length > 3) $("toasts").firstChild.remove();
}

// ---------- Avisos ----------
let offline = false;
function showBanner() {
  const b = $("banner");
  if (!isConfigured()) {
    b.className = "banner warn";
    b.innerHTML = "<b>Falta configurar Firebase.</b> Pegá los datos de tu proyecto en <b>src/firebase-config.js</b> para activar el ranking compartido. El reloj ya funciona.";
    b.hidden = false;
  } else if (offline) {
    b.className = "banner warn";
    b.innerHTML = "<b>Sin conexión con el ranking.</b> Tus sesiones quedan guardadas en este dispositivo y se suman solas cuando vuelva internet.";
    b.hidden = false;
  } else b.hidden = true;
}

// ---------- Entrada con nombre ----------
function openGate(prefill) {
  $("nameInput").value = prefill || "";
  $("gateErr").textContent = "";
  $("gate").hidden = false;
  setTimeout(() => { try { $("nameInput").focus(); } catch {} }, 50);
}
// Nombres comparados sin mayúsculas, tildes ni espacios de más: "Facundo", "facundo" y "Fácundo " son el mismo.
const normName = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const nameTaken = (name) => players.some((p) => p.id !== myId && p.name && normName(p.name) === normName(name));
const TAKEN_MSG = "Ese nombre ya lo usa otra persona. Probá con otro o agregale una inicial.";

// El ranking confirmado por el servidor: hace falta para saber qué nombres ya existen.
let rankingReady = false;
let readyWaiters = [];
function markRankingReady() {
  rankingReady = true;
  readyWaiters.forEach((fn) => fn());
  readyWaiters = [];
}
function waitRanking(ms) {
  if (rankingReady || !isConfigured()) return Promise.resolve();
  return new Promise((res) => { readyWaiters.push(res); setTimeout(res, ms); });
}

let gateBusy = false;
$("gateForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (gateBusy) return;
  const v = $("nameInput").value.replace(/\s+/g, " ").trim().slice(0, 24);
  if (!v) { $("gateErr").textContent = "Escribí un nombre para aparecer en el ranking."; return; }
  unlockAudio();
  if (!rankingReady) {
    // antes de aceptar el nombre, espera a que llegue el ranking (o sigue sin él si no hay internet)
    gateBusy = true;
    const btn = $("gateBtn"), label = btn.textContent;
    btn.disabled = true; btn.textContent = "Revisando nombres…";
    await waitRanking(8000);
    btn.disabled = false; btn.textContent = label;
    gateBusy = false;
  }
  if (nameTaken(v)) { $("gateErr").textContent = TAKEN_MSG; return; }
  myName = v;
  store.set("pomo.name", v);
  $("gate").hidden = true;
  writeProfile({ name: v });
  const me = players.find((p) => p.id === myId);
  if (me) me.name = v;
  renderBoard();
  unlockAudio();
});
$("editName").addEventListener("click", () => openGate(myName));

// ---------- Perfil e historial ----------
const profileDlg = $("profileDlg");
let profileTab = "info";
let profileHtml = "";
function profileMsg(text, ok) { $("profileMsg").className = ok ? "gate-err ok" : "gate-err"; $("profileMsg").textContent = text; }

function renderProfile() {
  if (!profileDlg.open) return;
  const mine = myPlayer();
  const days = localDays(), chapters = myChapters();
  const total = mine ? mine.total : sumDays(days);
  $("profileAvatar").innerHTML = avatarHtml(myName, mine && mine.photo, "avatar-lg");
  $("profileName").textContent = myName || "Sin nombre";
  $("profileEmail").textContent = accountEmail() || (connected ? "" : "Sin cuenta iniciada en este dispositivo");
  $("photoRemove").hidden = !(mine && mine.photo);
  $("pTabInfo").setAttribute("aria-selected", String(profileTab === "info"));
  $("pTabHist").setAttribute("aria-selected", String(profileTab === "hist"));
  const posIn = (list) => { const x = list.find((p) => p.id === myId); return x && x.m > 0 ? x.pos : 0; };
  const week = rankList(weekKeys(mondayOf(new Date())));
  const all = rankList("all");
  const streak = streakOf(days);
  $("profileChips").innerHTML = `<span class="streak${streak ? "" : " off"}">${FLAME}${streak} ${streak === 1 ? "día" : "días"}</span>`
    + `<span class="tag tag-chap">${timeLabel(total.m)} en total</span>`;
  const body = profileTab === "hist"
    ? historyHtml({ days })
    : summaryHtml({ days, chapters, total, streak, posWeek: posIn(week), posAll: posIn(all), players: all.length });
  // solo se redibuja si cambió algo, para no perder el scroll cada vez que se refresca el ranking
  if (body !== profileHtml) { profileHtml = body; $("profileBody").innerHTML = body; }
}
function openProfile(tab) {
  profileTab = tab;
  profileMsg("");
  profileHtml = "";
  profileDlg.showModal();
  renderProfile();
  $("profileBody").scrollTop = 0;
}
$("meOpen").addEventListener("click", () => openProfile("info"));
$("historyBtn").addEventListener("click", () => openProfile("hist"));
$("profileClose").addEventListener("click", () => profileDlg.close());
profileDlg.addEventListener("click", (e) => { if (e.target === profileDlg) profileDlg.close(); });
$("pTabInfo").addEventListener("click", () => { profileTab = "info"; renderProfile(); $("profileBody").scrollTop = 0; });
$("pTabHist").addEventListener("click", () => { profileTab = "hist"; renderProfile(); $("profileBody").scrollTop = 0; });
$("profileRename").addEventListener("click", () => { profileDlg.close(); openGate(myName); });
const pickPhoto = () => {
  if (!ready()) { profileMsg("Para poner tu foto tenés que haber iniciado sesión y tener internet."); return; }
  $("photoInput").click();
};
$("avatarBtn").addEventListener("click", pickPhoto);
$("photoPick").addEventListener("click", pickPhoto);
$("photoInput").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const photo = await resizePhoto(file);
    writeProfile({ photo });
    profileMsg("Foto guardada. Ya aparece en el ranking.", true);
  } catch (err) {
    profileMsg(err && err.message === "too-big" ? "Esa foto no se pudo reducir lo suficiente. Probá con otra." : "Elegí un archivo de imagen (JPG, PNG…).");
  }
});
$("photoRemove").addEventListener("click", () => { writeProfile({ photo: null }); profileMsg("Foto quitada.", true); });

// ---------- Pestañas ----------
function setView(v) { view = v; store.set("pomo.view", v); renderBoard(); }
$("tabDay").addEventListener("click", () => setView("day"));
$("tabWeek").addEventListener("click", () => setView("week"));
$("tabAll").addEventListener("click", () => setView("all"));

// refresco por cambio de día/semana (solo render)
let lastDay = dayKey(new Date());
setInterval(() => {
  const k = dayKey(new Date());
  if (k !== lastDay) { lastDay = k; prevRanks = null; }
  renderBoard();
}, 60e3);

// ---------- Conexión con la base compartida ----------
// El ranking se lee sin cuenta; para sumar minutos hace falta haber entrado con correo y contraseña.
let connecting = false;
let unwatch = null;
let synced = false;        // ya se acomodó el nombre con el de la base en esta sesión
async function connect() {
  if (!isConfigured()) { showBanner(); return; }
  if (connecting || connected) return;
  connecting = true;
  let account;
  try {
    account = await currentAccount();
  } catch {
    // sin internet en el primer uso: se reintenta cuando vuelva la conexión
    offline = true; showBanner();
    connecting = false;
    return;
  }
  connecting = false;
  watch();
  if (account && !account.anonymous) enter(account.uid);
  else {
    // sin cuenta, o con la anónima de antes: hay que registrarse (la anónima se convierte y conserva sus minutos)
    if (account) myId = account.uid;
    if ($("auth").hidden && $("reset").hidden) openAuth("register");
  }
}

// ya con cuenta: desde acá se guardan sesiones y nombre
function enter(uid) {
  myId = uid;
  connected = true;
  offline = false;
  showBanner();
  $("auth").hidden = true;
  $("logoutBtn").hidden = false;
  rebuild();
  if (rankingReady) syncProfile();
  renderBoard();
  renderChapters();
}

// la primera vez que hay cuenta y ranking confirmado por el servidor: recién ahí se sabe qué nombres están tomados
function syncProfile() {
  if (synced || !connected || !rankingReady) return;
  synced = true;
  const me = players.find((p) => p.id === myId);
  if (me && me.name && !myName) { myName = me.name; store.set("pomo.name", myName); $("gate").hidden = true; }
  if (myName && (!me || me.name !== myName)) {
    if (nameTaken(myName)) {
      // el nombre guardado en este dispositivo ya lo usa otra persona: pedir otro antes de guardarlo
      openGate(myName);
      $("gateErr").textContent = TAKEN_MSG;
    } else writeProfile({ name: myName });
  } else if (!myName) openGate("");
  flush();
}

function watch() {
  if (unwatch) return;
  unwatch = watchPlayers((docs, fromCache) => {
    rawDocs = docs;
    rebuild();
    if (!fromCache && !rankingReady) markRankingReady();
    syncProfile();
    if (offline) { offline = false; showBanner(); }
    checkClimbs();
    renderBoard();
    renderChapters();
    if (!$("auth").hidden) renderAuth();
  }, () => { offline = true; showBanner(); });
}

// ---------- Cuenta: registro, inicio de sesión y salida ----------
let authMode = "register";
let authBusy = false;
const AUTH_ERRORS = {
  "auth/email-already-in-use": "Ese correo ya tiene una cuenta. Tocá \"Iniciar sesión\" para entrar.",
  "auth/credential-already-in-use": "Ese correo ya tiene una cuenta. Tocá \"Iniciar sesión\" para entrar.",
  "auth/invalid-email": "Ese correo no es válido.",
  "auth/missing-email": "Escribí tu correo.",
  "auth/weak-password": "La contraseña tiene que tener al menos 6 caracteres.",
  "auth/missing-password": "Escribí tu contraseña.",
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/invalid-login-credentials": "Correo o contraseña incorrectos.",
  "auth/wrong-password": "Correo o contraseña incorrectos.",
  "auth/user-not-found": "Correo o contraseña incorrectos.",
  "auth/too-many-requests": "Demasiados intentos. Esperá un rato y probá de nuevo.",
  "auth/network-request-failed": "Sin conexión. Para entrar necesitás internet.",
  "auth/operation-not-allowed": "Falta activar el inicio con correo y contraseña en Firebase."
};
const authError = (e) => AUTH_ERRORS[e && e.code] || "No se pudo. Probá de nuevo.";
// errores de la recuperación: el servidor devuelve un motivo corto, que llega en e.message
const RESET_ERRORS = {
  "invalid-email": "Ese correo no es válido.",
  "too-soon": "Ya te mandamos un código hace un momento. Esperá un minuto para pedir otro.",
  "invalid-code": "El código no es correcto. Revisalo o pedí uno nuevo.",
  "expired-code": "El código venció. Pedí uno nuevo.",
  "weak-password": "La contraseña tiene que tener al menos 6 caracteres.",
  "mail-failed": "No pudimos mandar el correo. Probá de nuevo en un rato.",
  "update-failed": "No se pudo cambiar la contraseña. Probá de nuevo.",
  "lookup-failed": "No se pudo. Probá de nuevo en un rato.",
  "not-configured": "Falta conectar el servidor del código (ver docs/FIREBASE.md, sección 6)."
};
const resetError = (e) => {
  const reason = String((e && e.message) || "");
  if (reason === "network") return AUTH_ERRORS["auth/network-request-failed"];
  return RESET_ERRORS[reason] || "No se pudo. Probá de nuevo.";
};

function openAuth(mode) {
  authMode = mode;
  $("authErr").textContent = "";
  $("authErr").className = "gate-err";
  $("authName").value = myName;
  $("authPass").value = "";
  $("gate").hidden = true;
  $("auth").hidden = false;
  renderAuth();
  setTimeout(() => { try { $(mode === "register" && !$("authName").value ? "authName" : "authEmail").focus(); } catch {} }, 50);
}
// minutos que esta persona ya sumó sin cuenta en este dispositivo
function anonMinutes() {
  const me = players.find((p) => p.id === myId);
  return me ? me.total.m : 0;
}
function renderAuth() {
  const reg = authMode === "register";
  const mins = anonMinutes();
  // el ranking puede llegar después de abrir la pantalla: completa el nombre que ya tenía sin cuenta
  const me = players.find((p) => p.id === myId);
  if (!$("authName").value && me && me.name) $("authName").value = me.name;
  $("authTitle").textContent = reg ? "Creá tu cuenta" : "Entrá a tu cuenta";
  $("authText").textContent = reg
    ? (mins > 0
      ? `Para seguir compitiendo, creá tu cuenta. Tus ${mins} minutos y tu nombre se mantienen, y vas a poder entrar desde cualquier dispositivo.`
      : "Con tu cuenta entrás desde cualquier dispositivo y tus minutos te siguen.")
    : (mins > 0
      ? `Ojo: los ${mins} minutos que sumaste en este dispositivo sin cuenta quedan en una fila aparte. Si son tuyos y es tu primera vez, mejor creá la cuenta.`
      : "Usá el correo y la contraseña con los que te registraste.");
  $("authNameField").hidden = !reg;
  $("authPass").autocomplete = reg ? "new-password" : "current-password";
  $("authPass").placeholder = reg ? "Al menos 6 caracteres" : "";
  $("authBtn").textContent = reg ? "Crear cuenta" : "Entrar";
  $("authTabRegister").setAttribute("aria-selected", String(reg));
  $("authTabLogin").setAttribute("aria-selected", String(!reg));
  $("authForgot").hidden = reg;
}
$("authTabRegister").addEventListener("click", () => { if (authMode !== "register") openAuth("register"); });
$("authTabLogin").addEventListener("click", () => { if (authMode !== "login") openAuth("login"); });

// ---------- Recuperar contraseña (pantalla aparte del inicio de sesión) ----------
// Paso 1: correo → mandamos el código. Paso 2: código del correo + contraseña nueva.
let resetStep = "email";
let resetBusy = false;
const resetErr = (msg, ok) => { $("resetErr").className = ok ? "gate-err ok" : "gate-err"; $("resetErr").textContent = msg; };

function openReset(step, email) {
  resetStep = step;
  resetErr("");
  $("auth").hidden = true;
  $("gate").hidden = true;
  $("reset").hidden = false;
  $("resetEmail").value = email || "";
  $("resetCode").value = "";
  $("resetPass").value = "";
  renderReset();
  setTimeout(() => { try { $(step === "email" ? "resetEmail" : "resetCode").focus(); } catch {} }, 50);
}
function renderReset() {
  const first = resetStep === "email";
  const email = $("resetEmail").value.trim();
  $("resetTitle").textContent = first ? "Recuperá tu contraseña" : "Elegí tu contraseña nueva";
  $("resetText").textContent = first
    ? "Escribí el correo de tu cuenta y te mandamos un código para elegir una contraseña nueva."
    : (email
      ? `Si ${email} tiene cuenta, te mandamos un código de 6 dígitos. Escribilo acá y elegí tu contraseña nueva. Mirá también en spam.`
      : "Escribí el código de 6 dígitos que te llegó por correo y elegí tu contraseña nueva.");
  $("resetEmailField").hidden = !first;
  $("resetCodeField").hidden = first;
  $("resetPassField").hidden = first;
  $("resetResend").hidden = first || !email;
  $("resetSubmit").textContent = first ? "Mandar código" : "Cambiar contraseña";
}

$("authForgot").addEventListener("click", () => openReset("email", $("authEmail").value.trim()));
$("resetBack").addEventListener("click", () => {
  const email = $("resetEmail").value.trim();
  $("reset").hidden = true;
  openAuth("login");
  if (email) $("authEmail").value = email;
});
$("resetResend").addEventListener("click", async () => {
  const email = $("resetEmail").value.trim();
  if (!email || resetBusy) return;
  resetBusy = true;
  try { await requestResetCode(email); resetErr("Listo, te mandamos otro código.", true); }
  catch (e) { resetErr(resetError(e)); }
  finally { resetBusy = false; }
});
$("resetForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (resetBusy) return;
  resetErr("");
  const btn = $("resetSubmit"), label = btn.textContent;
  if (resetStep === "email") {
    const email = $("resetEmail").value.trim();
    if (!email) { resetErr(AUTH_ERRORS["auth/missing-email"]); return; }
    resetBusy = true; btn.disabled = true; btn.textContent = "Mandando…";
    try {
      await requestResetCode(email);
      resetStep = "code";
      renderReset();
      resetErr("Código enviado. Puede tardar un minuto en llegar.", true);
      try { $("resetCode").focus(); } catch {}
    } catch (e2) { resetErr(resetError(e2)); }
    finally { resetBusy = false; btn.disabled = false; if (resetStep === "email") btn.textContent = label; }
    return;
  }
  const email = $("resetEmail").value.trim();
  const code = $("resetCode").value.replace(/\D/g, "");
  const pass = $("resetPass").value;
  if (code.length !== 6) { resetErr("Escribí el código de 6 dígitos que te llegó por correo."); return; }
  if (!pass) { resetErr(AUTH_ERRORS["auth/missing-password"]); return; }
  resetBusy = true; btn.disabled = true; btn.textContent = "Cambiando…";
  try {
    await confirmReset(email, code, pass);
    $("reset").hidden = true;
    openAuth("login");
    $("authEmail").value = email;
    $("authErr").className = "gate-err ok";
    $("authErr").textContent = "Listo, cambiaste tu contraseña. Entrá con la nueva.";
    setTimeout(() => { try { $("authPass").focus(); } catch {} }, 60);
  } catch (e2) { resetErr(resetError(e2)); }
  finally { resetBusy = false; btn.disabled = false; btn.textContent = label; }
});

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (authBusy) return;
  const err = $("authErr");
  err.className = "gate-err"; err.textContent = "";
  const email = $("authEmail").value.trim();
  const pass = $("authPass").value;
  const reg = authMode === "register";
  const name = $("authName").value.replace(/\s+/g, " ").trim().slice(0, 24);
  if (reg && !name) { err.textContent = "Escribí un nombre para aparecer en el ranking."; return; }
  if (!email) { err.textContent = AUTH_ERRORS["auth/missing-email"]; return; }
  if (!pass) { err.textContent = AUTH_ERRORS["auth/missing-password"]; return; }
  unlockAudio();
  authBusy = true;
  const btn = $("authBtn"), label = btn.textContent;
  btn.disabled = true; btn.textContent = reg ? "Creando cuenta…" : "Entrando…";
  try {
    if (reg) {
      // antes de aceptar el nombre, espera a que llegue el ranking
      await waitRanking(8000);
      if (nameTaken(name)) { err.textContent = TAKEN_MSG; return; }
      const uid = await register(email, pass);
      myName = name;
      store.set("pomo.name", name);
      enter(uid);
    } else {
      const uid = await logIn(email, pass);
      // el nombre y los minutos salen de la cuenta, no de lo que había en este dispositivo
      myName = "";
      store.set("pomo.name", "");
      store.set("pomo.localDays", {});
      store.set("pomo.localChapters", {});
      enter(uid);
    }
  } catch (e2) {
    err.textContent = authError(e2);
  } finally {
    btn.disabled = false; btn.textContent = label;
    authBusy = false;
  }
});

$("logoutBtn").addEventListener("click", async () => {
  const unsaved = pending.length > 0;
  const ok = await confirmDialog(unsaved
    ? {
        tone: "warn",
        title: "Tenés sesiones sin guardar",
        text: `${pending.length} ${pending.length === 1 ? "sesión todavía no se guardó" : "sesiones todavía no se guardaron"}. Si cerrás sesión ahora, se pierden.`,
        okLabel: "Cerrar igual"
      }
    : {
        title: "¿Cerrar sesión?",
        text: "Vas a salir de tu cuenta en este dispositivo. Tu progreso queda guardado.",
        okLabel: "Cerrar sesión"
      });
  if (!ok) return;
  try { await logOut(); } catch {}
  // lo guardado en el dispositivo era de esta cuenta
  ["pomo.name", "pomo.pending", "pomo.localDays", "pomo.localChapters"].forEach((k) => store.set(k, k === "pomo.name" ? "" : k === "pomo.pending" ? [] : {}));
  location.reload();
});

// ---------- Arranque ----------
export function startApp() {
  if (timer.phase !== "study" && !timer.mins[timer.phase]) { timer.phase = "study"; timer.status = "idle"; timer.remaining = dur("study"); }
  if (timer.status === "running" && Date.now() >= timer.endAt) {
    // terminó mientras la página estaba cerrada: se completa igual
    completePhase();
  }
  if (timer.status === "running") { keepAwake(true); planAlerts(); }
  renderTimer();
  renderBoard();
  // sin Firebase configurado no hay cuentas: alcanza con el nombre
  if (!myName && !isConfigured()) openGate("");
  connect();
  checkForUpdate();
}

// App Android: avisa si hay un APK más nuevo publicado
async function checkForUpdate() {
  const mine = Number(import.meta.env.VITE_APP_VERSION) || 0;
  if (!isNative() || !mine) return;
  try {
    const res = await fetch(`${SITE_URL}version.json`, { cache: "no-store" });
    const info = await res.json();
    if (Number(info.version) > mine && typeof info.apk === "string" && info.apk.startsWith("https://")) {
      const bar = $("updateBar");
      bar.href = info.apk;
      bar.hidden = false;
    }
  } catch {}
}
