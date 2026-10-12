// Sin conexión: la sesión queda en cola en el dispositivo y se suma sola (una sola vez) al volver internet.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.clock.install();
await page.goto(URL);
await page.fill("#authName", "Caro");
await page.fill("#authEmail", "caro@prueba.com");
await page.fill("#authPass", "secreta123");
await page.click("#authBtn");
await sleep(2500);
const uid = await page.evaluate(() => new Promise((res) => {
  const req = indexedDB.open("firebaseLocalStorageDb");
  req.onsuccess = () => {
    const all = req.result.transaction("firebaseLocalStorage").objectStore("firebaseLocalStorage").getAll();
    all.onsuccess = () => res(all.result.map((x) => x.value && x.value.uid).find(Boolean));
  };
}));
await admin((db) => updateDoc(doc(db, "players", uid), { lastAt: Timestamp.fromMillis(Date.now() - 3600e3) }));
await sleep(1000);

await page.click("#startBtn");          // arranca una sesión de 25 minutos
await sleep(800);
await ctx.setOffline(true);
await page.clock.fastForward("25:02");  // pasan 25 minutos sin internet
await sleep(2500);
const t1 = (await admin((db) => getDoc(doc(db, "players", uid)))).data().total;
console.log("Sin internet → base:", JSON.stringify(t1), "| cola en el teléfono:", await page.evaluate(() => JSON.parse(localStorage.getItem("pomo.pending")).length),
  "| ranking propio:", await page.$$eval("#rows tr.me", (r) => r.map((x) => x.innerText.replace(/\s+/g, " "))));
await ctx.setOffline(false);
await sleep(6000);
const t2 = (await admin((db) => getDoc(doc(db, "players", uid)))).data().total;
console.log("Con internet → base:", JSON.stringify(t2), "| cola:", await page.evaluate(() => JSON.parse(localStorage.getItem("pomo.pending")).length));
await page.reload(); await sleep(3000);
const t3 = (await admin((db) => getDoc(doc(db, "players", uid)))).data().total;
console.log("Después de recargar (no duplica) → base:", JSON.stringify(t3));
await browser.close();
await env.cleanup();
