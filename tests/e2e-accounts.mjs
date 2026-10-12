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
await b.click("#authSwitch");
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

console.log("errores:", errors);
const ok = checks.every(Boolean) && errors.length === 0;
console.log(ok ? "OK" : "FALLÓ");
await browser.close();
await env.cleanup();
process.exit(ok ? 0 : 1);
