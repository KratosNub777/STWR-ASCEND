// STWR-ASCEND: reloj, capítulos, tiempos, ranking y racha.
import { $, store, pad, dayKey, addDays, mondayOf, weekKeys, clone, escapeHtml } from "./util.js";
import { unlockAudio, chime, keepAwake } from "./sound.js";
import { isConfigured, signIn, watchPlayers, loadMine, createMine, updateMine } from "./data.js";
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
