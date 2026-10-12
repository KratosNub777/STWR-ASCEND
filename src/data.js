// Capa de datos: Firebase Authentication (cuentas con correo y contraseña) + Firestore.
// Colección "players": un documento por persona, con id = uid de su cuenta.
// Las cuentas anónimas de antes se convierten en cuentas con correo sin cambiar el uid, así no pierden sus minutos.

import { initializeApp } from "firebase/app";
import {
  getAuth, signInAnonymously, connectAuthEmulator, EmailAuthProvider, linkWithCredential,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut
} from "firebase/auth";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  connectFirestoreEmulator, collection, doc, onSnapshot, getDoc, setDoc, updateDoc, serverTimestamp
} from "firebase/firestore";
import { firebaseConfig } from "./firebase-config.js";

const USE_EMULATOR = import.meta.env.VITE_USE_EMULATOR === "1";

export const isConfigured = () =>
  USE_EMULATOR || Object.values(firebaseConfig).every((v) => typeof v === "string" && v && v !== "PEGAR_AQUI");

let app = null, auth = null, db = null, uid = null;

function init() {
  if (app) return;
  const config = USE_EMULATOR ? { apiKey: "demo-key", projectId: "demo-stwr", appId: "demo-app" } : firebaseConfig;
  app = initializeApp(config);
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
  return u ? { uid: u.uid, anonymous: u.isAnonymous, email: u.email || "" } : null;
}

/** Inicia sesión anónima (o recupera la guardada en este dispositivo) y devuelve el uid. */
export async function signIn() {
  init();
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  uid = auth.currentUser.uid;
  return uid;
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

export function resetPassword(email) {
  init();
  return sendPasswordResetEmail(auth, email);
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
