// Sonido suave al terminar una fase y pantalla encendida mientras corre el reloj.

let audioCtx = null;

export function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}

export function chime(kind) {
  if (audioCtx) {
    try {
      const notes = kind === "study" ? [659.25, 880, 1046.5] : [523.25, 659.25];
      const t0 = audioCtx.currentTime + 0.02;
      notes.forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = "sine"; o.frequency.value = f;
        const t = t0 + i * 0.28;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
        o.connect(g).connect(audioCtx.destination);
        o.start(t); o.stop(t + 1.5);
      });
    } catch {}
  }
  try { navigator.vibrate && navigator.vibrate([120, 80, 120]); } catch {}
}

let wakeLock = null;
export async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; }
}
