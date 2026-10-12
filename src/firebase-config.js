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
  apiKey: "PEGAR_AQUI",
  authDomain: "PEGAR_AQUI",
  projectId: "PEGAR_AQUI",
  storageBucket: "PEGAR_AQUI",
  messagingSenderId: "PEGAR_AQUI",
  appId: "PEGAR_AQUI"
};
