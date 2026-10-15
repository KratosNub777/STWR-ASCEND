// Ranking mensual: suma solo los días del mes en curso y muestra al ganador del mes pasado.
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, Timestamp } from "firebase/firestore";

const URL = process.env.APP_URL || "http://localhost:5173/";
const env = await initializeTestEnvironment({
  projectId: "demo-stwr",
  firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 }
});
await env.clearFirestore();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (label, ok, extra = "") => { checks.push(ok); console.log(ok ? "✓" : "✗", label, extra); };
const pad = (n) => String(n).padStart(2, "0");
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const thisMonth = key(new Date(now.getFullYear(), now.getMonth(), 1));
const lastMonth = key(new Date(now.getFullYear(), now.getMonth() - 1, 15));
const player = (name, days) => {
  const t = Object.values(days).reduce((a, d) => ({ m: a.m + d.m, s: a.s + d.s }), { m: 0, s: 0 });
  return { name, days, chapters: {}, total: t, updatedAt: Timestamp.now(), lastAt: Timestamp.now() };
};
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "players", "ana"), player("Ana", { [thisMonth]: { m: 50, s: 2 }, [lastMonth]: { m: 25, s: 1 } }));
  await setDoc(doc(db, "players", "beto"), player("Beto", { [thisMonth]: { m: 100, s: 4 }, [lastMonth]: { m: 10, s: 1 } }));
});

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const errors = [];
const page = await (await browser.newContext()).newPage();
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL);
await sleep(3000);
await page.fill("#authName", "Carla");
await page.fill("#authEmail", "carla@prueba.com");
await page.fill("#authPass", "secreta123");
await page.click("#authBtn");
await sleep(3000);
await page.click("#tabMonth");
const title = await page.$eval("#boardTitle", (x) => x.textContent);
check("título con el nombre del mes", title.startsWith("Ranking de ") && title !== "Ranking de la semana", title);
const rows = await page.$$eval("#rows tr", (t) => t.map((r) => r.innerText.replace(/\s+/g, " ").trim()));
check("Beto primero con 100 min y Ana segunda con 50", rows[0].includes("Beto") && rows[0].includes("100") && rows[1].includes("Ana") && rows[1].includes("50"), JSON.stringify(rows));
check("no suma el mes pasado", !rows.join(" ").includes("125") && !rows.join(" ").includes("110"));
check("avisa el reinicio mensual", (await page.$eval("#boardMeta", (x) => x.textContent)).includes("Reinicio mensual"));
check("muestra al ganador del mes pasado (Ana, 25 min)", (await page.$eval("#champ", (x) => !x.hidden)) && (await page.$eval("#champName", (x) => x.textContent)).includes("Ana · 25") && (await page.$eval("#champLabel", (x) => x.textContent)).startsWith("Ganó "));
await page.click("#tabWeek");
check("la semana vuelve a decir 'la semana pasada'", (await page.$eval("#champLabel", (x) => x.textContent)) === "Ganó la semana pasada");
await page.reload(); await sleep(2500);
check("la pestaña elegida se recuerda", (await page.$eval("#tabWeek", (x) => x.getAttribute("aria-selected"))) === "true");
check("sin errores en la página", errors.length === 0, errors.join(" | "));
await browser.close();
await env.cleanup();
process.exit(checks.every(Boolean) ? 0 : 1);
