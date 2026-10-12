// Prueba de punta a punta contra el emulador: dos personas, una completa una sesión,
// la otra la ve aparecer en vivo en el ranking.
// Requiere: emuladores corriendo (npm run emulators) y la app con VITE_USE_EMULATOR=1 (npx vite).
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";

const URL = process.env.APP_URL || "http://localhost:5173/";
const env = await initializeTestEnvironment({
  projectId: "demo-stwr",
  firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 }
});
await env.clearFirestore();
const admin = async (fn) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = await fn(ctx.firestore()); }); return out; };

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const errors = [];
async function person(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(URL);
  await page.fill("#authName", name);
  await page.fill("#authEmail", `${name.toLowerCase()}@prueba.com`);
  await page.fill("#authPass", "secreta123");
  await page.click("#authBtn");
  return page;
}
const rows = (page) => page.$$eval("#rows tr", (trs) => trs.map((r) => r.innerText.replace(/\s+/g, " ").trim()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ana = await person("Ana");
const beto = await person("Beto");
await sleep(2500);
const uidAna = await ana.evaluate(async () => {
  const req = indexedDB.open("firebaseLocalStorageDb");
  return await new Promise((res) => {
    req.onsuccess = () => {
      const tx = req.result.transaction("firebaseLocalStorage", "readonly");
      const all = tx.objectStore("firebaseLocalStorage").getAll();
      all.onsuccess = () => res(all.result.map((x) => x.value && x.value.uid).find(Boolean));
    };
  });
});
console.log("uid de Ana:", uidAna);
console.log("Beto ve (al entrar):", await rows(beto));

// Para no esperar 25 minutos reales: atrasamos 1 hora el último guardado de Ana (como si hubiera pasado el tiempo)
await admin((db) => updateDoc(doc(db, "players", uidAna), { lastAt: Timestamp.fromMillis(Date.now() - 3600e3) }));
// y simulamos que su reloj de 25 minutos ya terminó
await ana.evaluate(() => {
  const t = JSON.parse(localStorage.getItem("pomo.timer") || "{}");
  Object.assign(t, { phase: "study", status: "running", endAt: Date.now() - 1000, chapter: 4 });
  t.mins = { study: 25, short: 5, long: 15 };
  localStorage.setItem("pomo.timer", JSON.stringify(t));
});
await ana.reload();
await sleep(3000);

const saved = await admin((db) => getDoc(doc(db, "players", uidAna)));
const d = saved.data();
console.log("Documento de Ana en la base:", JSON.stringify({ name: d.name, days: d.days, chapters: d.chapters, total: d.total, current: d.current, lastDay: d.lastDay }));
console.log("Cola pendiente de Ana:", await ana.evaluate(() => localStorage.getItem("pomo.pending")));
console.log("Beto ve (en vivo, Esta semana):", await rows(beto));
await beto.click("#tabAll");
console.log("Beto ve (General):", await rows(beto));
console.log("Ana ve:", await rows(ana));
console.log("errores:", errors);
await browser.close();
await env.cleanup();
