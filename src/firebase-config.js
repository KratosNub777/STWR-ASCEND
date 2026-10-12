// ─────────────────────────────────────────────────────────────
//  Configuración de Firebase: el ÚNICO archivo que tenés que tocar.
//
//  1. Entrá a https://console.firebase.google.com y abrí tu proyecto.
//  2. Engranaje ⚙ (arriba a la izquierda) → "Configuración del proyecto".
//  3. Bajá hasta "Tus apps" → tu app web (</>) → "Configuración del SDK" → opción "Configuración".
//  4. Copiá los valores y reemplazá cada "PEGAR_AQUI" de abajo (dejá las comillas).
//
//  Estos datos NO son secretos: identifican tu proyecto y viajan igual en la web.
//  Lo que protege la base son las reglas de firestore.rules.
// ─────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: "AIzaSyDPs9S-MWTp65P9Kv0mPbNpi4sp3nE5IRM",
  authDomain: "stwr-ascend.firebaseapp.com",
  projectId: "stwr-ascend",
  storageBucket: "stwr-ascend.firebasestorage.app",
  messagingSenderId: "699592526388",
  appId: "1:699592526388:web:559c392811ca9f10c29861"
};
