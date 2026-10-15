// Recuperar contraseña con un código de 6 dígitos por correo.
//   POST /send    { email }                    → genera el código y lo manda por correo
//   POST /confirm { email, code, password }    → comprueba el código y cambia la contraseña
// El código se guarda con hash en un Durable Object por correo (vale 10 minutos, 5 intentos, un solo uso).
// La contraseña se cambia con la cuenta de servicio de Firebase (API de administrador de Identity Toolkit).

const CODE_TTL_MS = 10 * 60e3;
const RESEND_MS = 60e3;
const MAX_ATTEMPTS = 5;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400"
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });
const fail = (status, error) => json({ error }, status);

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const normEmail = (v) => String(v || "").trim().toLowerCase();
const same = (a, b) => {                      // comparación en tiempo constante
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
function newCode() {
  const buf = new Uint32Array(1);
  const limit = 4294967296 - (4294967296 % 1e6);   // sin sesgo
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return String(buf[0] % 1e6).padStart(6, "0");
}

// ---------- Firebase (Identity Toolkit, modo administrador) ----------
let tokenCache = { value: "", until: 0 };
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function accessToken(env) {
  if (env.FIREBASE_AUTH_EMULATOR) return "owner";            // el emulador acepta este token
  if (tokenCache.until > Date.now() + 60e3) return tokenCache.value;
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64url(enc.encode(JSON.stringify({
    iss: sa.client_email, aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/identitytoolkit", iat: now, exp: now + 3600
  })));
  const pem = sa.private_key.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8", Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${head}.${claims}`)));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` })
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const data = await res.json();
  tokenCache = { value: data.access_token, until: Date.now() + data.expires_in * 1000 };
  return tokenCache.value;
}

async function identity(env, action, body) {
  const project = env.FIREBASE_AUTH_EMULATOR ? env.FIREBASE_PROJECT : JSON.parse(env.FIREBASE_SERVICE_ACCOUNT).project_id;
  const base = env.FIREBASE_AUTH_EMULATOR
    ? `${env.FIREBASE_AUTH_EMULATOR}/identitytoolkit.googleapis.com`
    : "https://identitytoolkit.googleapis.com";
  const res = await fetch(`${base}/v1/projects/${project}/accounts:${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${await accessToken(env)}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`identity ${action} ${res.status}`);
  return res.json();
}

/** El uid de la cuenta con ese correo, o null si no existe. */
async function findUid(env, email) {
  const data = await identity(env, "lookup", { email: [email] });
  return data.users && data.users[0] ? data.users[0].localId : null;
}
