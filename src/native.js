// Funciones de la app Android (Capacitor). En el navegador no hacen nada.
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { KeepAwake } from "@capacitor-community/keep-awake";

export const isNative = () => Capacitor.isNativePlatform();

// Página pública: de acá la app lee si hay una versión nueva del APK
export const SITE_URL = "https://kratosnub777.github.io/STWR-ASCEND/";

const IDS = [101, 102];
let ready = null;

function prepare() {
  if (!ready) {
    ready = (async () => {
      let p = await LocalNotifications.checkPermissions();
      if (p.display !== "granted") p = await LocalNotifications.requestPermissions();
      if (p.display !== "granted") return false;
      await LocalNotifications.createChannel({
        id: "timer", name: "Temporizador", description: "Avisos de fin de sesión y de descanso",
        importance: 5, visibility: 1, vibration: true
      }).catch(() => {});
      return true;
    })().catch(() => false);
  }
  return ready;
}

/**
 * Programa los avisos del sistema para las horas de fin (en milisegundos).
 * Android los muestra aunque la app esté en segundo plano o la pantalla apagada.
 */
export async function scheduleAlerts(alerts) {
  if (!isNative()) return;
  try {
    await cancelAlerts();
    const future = alerts.filter((a) => a.at > Date.now() + 1000).slice(0, IDS.length);
    if (!future.length || !(await prepare())) return;
    await LocalNotifications.schedule({
      notifications: future.map((a, i) => ({
        id: IDS[i], title: a.title, body: a.body, channelId: "timer",
        schedule: { at: new Date(a.at), allowWhileIdle: true }
      }))
    });
  } catch {}
}

export async function cancelAlerts() {
  if (!isNative()) return;
  try { await LocalNotifications.cancel({ notifications: IDS.map((id) => ({ id })) }); } catch {}
}

export async function nativeKeepAwake(on) {
  try { on ? await KeepAwake.keepAwake() : await KeepAwake.allowSleep(); } catch {}
}
