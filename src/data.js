// Capa de datos: Firebase Authentication (anónima) + Firestore.
// Colección "players": un documento por persona, con id = uid anónimo.

import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, connectAuthEmulator } from "firebase/auth";
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
