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
