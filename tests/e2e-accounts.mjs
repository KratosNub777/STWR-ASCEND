// Cuentas: quien jugaba sin cuenta (anónimo) se registra y conserva su uid y sus minutos;
// después entra desde otro dispositivo con su correo y ve lo mismo. También prueba errores y cerrar sesión.
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, getDocs, setDoc, collection, Timestamp } from "firebase/firestore";

const URL = process.env.APP_URL || "http://localhost:5173/";
const env = await initializeTestEnvironment({
  projectId: "demo-stwr",
  firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 }
});
await env.clearFirestore();
await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-stwr/accounts", { method: "DELETE" });
const admin = async (fn) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = await fn(ctx.firestore()); }); return out; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const errors = [];
async function open() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL);
  return page;
}
// usuario guardado por Firebase en el dispositivo
const authUser = (page) => page.evaluate(() => new Promise((res) => {
  const req = indexedDB.open("firebaseLocalStorageDb");
  req.onsuccess = () => {
    const all = req.result.transaction("firebaseLocalStorage").objectStore("firebaseLocalStorage").getAll();
    all.onsuccess = () => {
      const u = all.result.map((x) => x.value).find((v) => v && v.uid);
      res(u ? { uid: u.uid, anonymous: u.isAnonymous, email: u.email } : null);
    };
  };
}));
const rows = (page) => page.$$eval("#rows tr", (trs) => trs.map((r) => r.innerText.replace(/\s+/g, " ").trim()));
const checks = [];
const check = (label, ok, extra = "") => { checks.push(ok); console.log(ok ? "✓" : "✗", label, extra); };

// 1) Lucas jugaba antes de que existieran las cuentas: sesión anónima con 50 minutos
const a = await open();
const anonUid = await a.evaluate(async () => {
  // misma copia de Firebase que usa la app (Vite la sirve con la misma URL)
  const src = await (await fetch("/src/data.js")).text();
  const authUrl = src.match(/from\s+"([^"]*firebase_auth[^"]*)"/)[1];
  const { getAuth, signInAnonymously } = await import(authUrl);
  return (await signInAnonymously(getAuth())).user.uid;
});
const today = new Date().toISOString().slice(0, 10);
await admin((db) => setDoc(doc(db, "players", anonUid), {
  name: "Lucas", days: { [today]: { m: 50, s: 2 } }, chapters: { 3: { m: 50, s: 2 } }, total: { m: 50, s: 2 },
  updatedAt: Timestamp.now(), lastAt: Timestamp.now()
}));
await a.reload();
await sleep(3000);
check("Lucas anónimo ve la pantalla de crear cuenta", await a.$eval("#auth", (x) => !x.hidden));
const text = await a.$eval("#authText", (x) => x.textContent);
check("le avisa que conserva sus minutos", text.includes("50 minutos"), JSON.stringify(text));
check("nombre ya cargado", (await a.$eval("#authName", (x) => x.value)) === "Lucas");
await a.fill("#authEmail", "lucas@prueba.com");
await a.fill("#authPass", "secreta123");
await a.click("#authBtn");
await sleep(3000);
const u1 = await authUser(a);
check("cuenta creada sin cambiar el uid", u1.uid === anonUid && !u1.anonymous && u1.email === "lucas@prueba.com", JSON.stringify(u1));
check("pantalla cerrada", await a.$eval("#auth", (x) => x.hidden));
const d1 = (await admin((db) => getDoc(doc(db, "players", anonUid)))).data();
check("sus 50 minutos siguen en la base", d1.total.m === 50 && d1.name === "Lucas");

// 2) Otro dispositivo: contraseña mal, después bien
const b = await open();
await sleep(2500);
await b.click("#authTabLogin");
await b.fill("#authEmail", "lucas@prueba.com");
await b.fill("#authPass", "otra-cosa");
await b.click("#authBtn");
await sleep(1500);
check("contraseña incorrecta avisa", (await b.$eval("#authErr", (x) => x.textContent)).includes("incorrectos"));
await b.fill("#authPass", "secreta123");
await b.click("#authBtn");
await sleep(3000);
check("entra en el otro dispositivo", await b.$eval("#auth", (x) => x.hidden));
check("con el mismo uid", (await authUser(b)).uid === anonUid);
check("y su nombre de la cuenta", (await b.$eval("#meName", (x) => x.textContent)) === "Lucas");
await b.click("#tabAll");
const r = await rows(b);
check("su fila con 50 minutos marcada como Vos", r.length === 1 && r[0].includes("Lucas") && /vos/i.test(r[0]) && r[0].includes("50"), JSON.stringify(r));

// 3) Cerrar sesión vuelve a pedir la cuenta
b.on("dialog", (dlg) => dlg.accept());
await b.click("#logoutBtn");
await sleep(3000);
check("al cerrar sesión pide la cuenta otra vez", await b.$eval("#auth", (x) => !x.hidden));
check("y no queda ningún usuario en el dispositivo", (await authUser(b)) === null);

// 4) Un correo ya usado no crea otra cuenta
const c = await open();
await sleep(2500);
await c.fill("#authName", "Mora");
await c.fill("#authEmail", "lucas@prueba.com");
await c.fill("#authPass", "secreta123");
await c.click("#authBtn");
await sleep(2000);
check("correo repetido avisa", (await c.$eval("#authErr", (x) => x.textContent)).includes("ya tiene una cuenta"));
const docs = await admin((db) => getDocs(collection(db, "players")));
check("en la base sigue habiendo un solo jugador", docs.size === 1);

// 5) Recuperar contraseña: pantalla propia, llega un código de 6 dígitos y con él se cambia.
// Hace falta el Worker en local: cd worker && npx wrangler dev --port 8787 --var DEV:1 \
//   --var FIREBASE_AUTH_EMULATOR:http://127.0.0.1:9099 --var FIREBASE_PROJECT:demo-stwr
// Con DEV:1 el Worker no manda correo: devuelve el código en la respuesta de /send, y acá se lee de ahí.
const RESET_API = process.env.RESET_API || "http://127.0.0.1:8787";
// se espera a que aparezca el mensaje en vez de dormir un tiempo fijo
const resetMsg = async (page, re) => {
  try { await page.waitForFunction((src) => new RegExp(src).test(document.querySelector("#resetErr").textContent), re.source, { timeout: 10000 }); } catch {}
  return page.$eval("#resetErr", (x) => x.textContent);
};
const f = await open();
await sleep(2500);
await f.click("#authTabLogin");
await f.fill("#authEmail", "lucas@prueba.com");
let code = null;
f.on("response", async (r) => { if (r.url().endsWith("/send")) { try { code = (await r.json()).debugCode || code; } catch {} } });
await f.click("#authForgot");
check("abre una pantalla aparte para recuperar", (await f.$eval("#reset", (x) => !x.hidden)) && (await f.$eval("#auth", (x) => x.hidden)));
check("con el correo ya puesto", (await f.$eval("#resetEmail", (x) => x.value)) === "lucas@prueba.com");
await f.click("#resetSubmit");
await sleep(3000);
check("pasa al paso del código", await f.$eval("#resetCodeField", (x) => !x.hidden));
check("se generó un código de 6 dígitos", /^\d{6}$/.test(code || ""), String(code));
await f.fill("#resetPass", "nueva-clave-1");
await f.fill("#resetCode", "12345");
await f.click("#resetSubmit");
await sleep(500);
check("un código corto avisa sin llamar al servidor", (await f.$eval("#resetErr", (x) => x.textContent)).includes("6 dígitos"));
await f.fill("#resetCode", code === "000000" ? "111111" : "000000");
await f.click("#resetSubmit");
{ const m = await resetMsg(f, /no es correcto/); check("un código incorrecto avisa", m.includes("no es correcto"), JSON.stringify(m)); }
await f.click("#resetResend");
{ const m = await resetMsg(f, /Esperá/); check("no deja pedir otro código enseguida", m.includes("Esperá"), JSON.stringify(m)); }
check("sin cambiar la contraseña todavía", await (async () => {
  const r = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "lucas@prueba.com", password: "secreta123", returnSecureToken: true })
  });
  return r.ok;
})());
await f.fill("#resetCode", code);
await f.click("#resetSubmit");
await sleep(3000);
check("vuelve al inicio de sesión con el correo", (await f.$eval("#auth", (x) => !x.hidden)) && (await f.$eval("#authEmail", (x) => x.value)) === "lucas@prueba.com");
await f.fill("#authPass", "secreta123");
await f.click("#authBtn");
await sleep(1500);
check("la contraseña vieja ya no sirve", (await f.$eval("#authErr", (x) => x.textContent)).includes("incorrectos"));
await f.fill("#authPass", "nueva-clave-1");
await f.click("#authBtn");
await sleep(3000);
check("entra con la contraseña nueva", await f.$eval("#auth", (x) => x.hidden));
const again = await fetch(`${RESET_API}/confirm`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "lucas@prueba.com", code, password: "otra-clave-9" })
});
check("el código sirve una sola vez", again.status === 403);

console.log("errores:", errors);
const ok = checks.every(Boolean) && errors.length === 0;
console.log(ok ? "OK" : "FALLÓ");
await browser.close();
await env.cleanup();
process.exit(ok ? 0 : 1);
