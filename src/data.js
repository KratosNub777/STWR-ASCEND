// Capa de datos: Firebase Authentication (cuentas con correo y contraseña) + Firestore.
// Colección "players": un documento por persona, con id = uid de su cuenta.
// Las cuentas anónimas de antes se convierten en cuentas con correo sin cambiar el uid, así no pierden sus minutos.

import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import {
  getAuth, connectAuthEmulator, EmailAuthProvider, linkWithCredential,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut
} from "firebase/auth";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  connectFirestoreEmulator, collection, doc, onSnapshot, getDoc, setDoc, updateDoc, deleteField, serverTimestamp
} from "firebase/firestore";
import { firebaseConfig, RESET_API_URL, APPCHECK_SITE_KEY } from "./firebase-config.js";

const USE_EMULATOR = import.meta.env.VITE_USE_EMULATOR === "1";

export const isConfigured = () =>
  USE_EMULATOR || Object.values(firebaseConfig).every((v) => typeof v === "string" && v && v !== "PEGAR_AQUI");

let app = null, auth = null, db = null, uid = null;

function init() {
  if (app) return;
  const config = USE_EMULATOR ? { apiKey: "demo-key", projectId: "demo-stwr", appId: "demo-app" } : firebaseConfig;
  app = initializeApp(config);
  // Mientras no esté configurada (ver src/firebase-config.js) no hace nada: la app sigue andando igual.
  if (!USE_EMULATOR && APPCHECK_SITE_KEY && APPCHECK_SITE_KEY !== "PEGAR_AQUI") {
    try { initializeAppCheck(app, { provider: new ReCaptchaV3Provider(APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true }); } catch {}
  }
  auth = getAuth(app);
  auth.languageCode = "es";
  try {
    // caché en el dispositivo: el ranking aparece rápido y las escrituras esperan a que vuelva la conexión
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = getFirestore(app);
  }
  if (USE_EMULATOR) {
    const host = import.meta.env.VITE_EMULATOR_HOST || "127.0.0.1";
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
  }
}

/**
 * La cuenta guardada en este dispositivo, sin crear ninguna: { uid, anonymous, email } o null.
 * anonymous = true en quienes entraron antes de que existieran las cuentas.
 */
export async function currentAccount() {
  init();
  await auth.authStateReady();
  const u = auth.currentUser;
  if (u) uid = u.uid;
  return u ? { uid: u.uid, anonymous: u.isAnonymous, email: u.email || "", verified: u.emailVerified } : null;
}

/** Crea una cuenta. Si el dispositivo tenía una cuenta anónima, la convierte (mismo uid, mismos minutos). */
export async function register(email, password) {
  init();
  const u = auth.currentUser;
  const cred = u && u.isAnonymous
    ? await linkWithCredential(u, EmailAuthProvider.credential(email, password))
    : await createUserWithEmailAndPassword(auth, email, password);
  uid = cred.user.uid;
  return uid;
}

/** Entra a una cuenta que ya existe y devuelve su uid. */
export async function logIn(email, password) {
  init();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  uid = cred.user.uid;
  return uid;
}

// Servidor del código de recuperación (Worker de Cloudflare). En las pruebas con emuladores se usa el local.
const resetUrl = () =>
  USE_EMULATOR ? `http://${import.meta.env.VITE_EMULATOR_HOST || "127.0.0.1"}:8787` : RESET_API_URL;

/** POST al Worker. Si falla, lanza un Error cuyo message es el motivo corto ("invalid-code", "too-soon", "network"…). */
async function resetCall(path, body) {
  if (resetUrl().includes("PEGAR_AQUI")) throw new Error("not-configured");
  let res;
  try {
    res = await fetch(resetUrl() + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch { throw new Error("network"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "unknown");
  return data;
}

/** Pide el código de 6 dígitos por correo. Responde igual exista o no la cuenta. */
export function requestResetCode(email) {
  return resetCall("/send", { email });
}

/** Cambia la contraseña con el código que llegó por correo. */
export function confirmReset(email, code, password) {
  return resetCall("/confirm", { email, code, password });
}

/**
 * Códigos por correo que pide el servidor con la sesión de la cuenta.
 * kind = "verify" (verificar el correo al registrarse) o "delete" (eliminar la cuenta).
 * Si el correo ya estaba verificado, sendCode devuelve { verified: true }.
 */
async function sessionToken() {
  const u = auth && auth.currentUser;
  if (!u) throw new Error("bad-session");
  return u.getIdToken(true);
}
export async function sendCode(kind) {
  return resetCall(`/${kind}/send`, { idToken: await sessionToken() });
}
export async function confirmCode(kind, code) {
  await resetCall(`/${kind}/confirm`, { idToken: await sessionToken(), code });
  if (kind === "verify") {
    // la sesión tiene que enterarse de que el correo ya está verificado (lo piden las reglas)
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
  } else {
    try { await signOut(auth); } catch {}   // la cuenta ya no existe
  }
}

export function logOut() {
  init();
  return signOut(auth);
}

/**
 * Escucha la colección completa en vivo. cb recibe ([{id, data}], fromCache):
 * fromCache = true mientras los datos salen solo de la caché del dispositivo, sin confirmar con el servidor.
 */
export function watchPlayers(cb, onError) {
  init();
  return onSnapshot(
    collection(db, "players"),
    { includeMetadataChanges: true },
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, data: d.data() || {} })), snap.metadata.fromCache),
    onError
  );
}

const myRef = () => doc(db, "players", uid);

/** Mi documento (del servidor, o de la caché si no hay conexión). null si no existe. */
export async function loadMine() {
  const snap = await getDoc(myRef());
  return snap.exists() ? snap.data() : null;
}

/** Crea mi documento vacío. Las reglas solo aceptan crearlo en cero. */
export function createMine(name) {
  return setDoc(myRef(), {
    name, days: {}, chapters: {}, total: { m: 0, s: 0 },
    updatedAt: serverTimestamp(), lastAt: serverTimestamp()
  });
}

/** Actualiza campos de mi documento. progress = true cuando suma minutos. */
export function updateMine(patch, progress) {
  const extra = progress ? { lastAt: serverTimestamp() } : {};
  return updateDoc(myRef(), { ...patch, ...extra, updatedAt: serverTimestamp() });
}

/** Campo que borra un dato de mi documento (por ejemplo, quitar la foto de perfil). */
export const removeField = () => deleteField();

/** Correo de la cuenta con la sesión iniciada ("" si no hay). */
export function accountEmail() {
  return (auth && auth.currentUser && auth.currentUser.email) || "";
}

/** ¿La cuenta con la sesión iniciada ya verificó su correo con el código? */
export const accountVerified = () => !!(auth && auth.currentUser && auth.currentUser.emailVerified);
