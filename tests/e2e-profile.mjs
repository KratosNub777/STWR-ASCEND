// Perfil e historial: una cuenta con días de estudio ve su resumen y su historial, pone una foto
// (se guarda en la base y aparece en el ranking) y la quita.
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";

const URL = process.env.APP_URL || "http://localhost:5173/";
const env = await initializeTestEnvironment({
  projectId: "demo-stwr",
  firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 }
});
await env.clearFirestore();
await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-stwr/accounts", { method: "DELETE" });
const admin = async (fn) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = await fn(ctx.firestore()); }); return out; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (label, ok, extra = "") => { checks.push(ok); console.log(ok ? "✓" : "✗", label, extra); };

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const errors = [];
const page = await (await browser.newContext()).newPage();
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL);
await sleep(2500);

// cuenta nueva
await page.fill("#authName", "Sofi");
await page.fill("#authEmail", "sofi@prueba.com");
await page.fill("#authPass", "secreta123");
await page.click("#authBtn");
await sleep(3000);
const uid = await page.evaluate(() => new Promise((res) => {
  const req = indexedDB.open("firebaseLocalStorageDb");
  req.onsuccess = () => {
    const all = req.result.transaction("firebaseLocalStorage").objectStore("firebaseLocalStorage").getAll();
    all.onsuccess = () => res(all.result.map((x) => x.value).find((v) => v && v.uid).uid);
  };
}));

// días de estudio ya guardados (hoy, ayer y hace 9 días)
const key = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
await admin((db) => setDoc(doc(db, "players", uid), {
  name: "Sofi", days: { [key(0)]: { m: 50, s: 2 }, [key(1)]: { m: 75, s: 3 }, [key(9)]: { m: 25, s: 1 } },
  chapters: { 2: { m: 100, s: 4 }, 5: { m: 50, s: 2 } }, total: { m: 150, s: 6 },
  updatedAt: Timestamp.now(), lastAt: Timestamp.fromMillis(Date.now() - 600e3)
}));
await page.reload();
await sleep(3000);

check("avatar con inicial en la cabecera", (await page.$eval("#meAvatar", (x) => x.innerText.trim())) === "S");

// resumen
await page.click("#meOpen");
check("abre el perfil", await page.$eval("#profileDlg", (d) => d.open));
check("muestra el nombre y el correo", (await page.$eval("#profileName", (x) => x.textContent)) === "Sofi" && (await page.$eval("#profileEmail", (x) => x.textContent)) === "sofi@prueba.com");
const sum = await page.$eval("#profileBody", (x) => x.innerText.replace(/\s+/g, " "));
check("resumen: total 2 h 30 min y 6 sesiones", sum.includes("2 h 30 min") && sum.includes("6 sesiones"), sum.slice(0, 160));
check("resumen: tiempo por capítulo", sum.includes("Cap. 2") && sum.includes("1 h 40 min") && sum.includes("Cap. 5"));
check("resumen: racha de 2 días", sum.includes("2 días"));

// historial
await page.click("#pTabHist");
const hist = await page.$eval("#profileBody", (x) => x.innerText.replace(/\s+/g, " "));
check("historial lista los 3 días", (await page.$$("#profileBody .hist-week li")).length === 3, hist.slice(0, 200));
check("historial: gráfico de 14 días", (await page.$$("#profileBody .spark-col")).length === 14);
check("historial: 1 h 15 min de ayer", hist.includes("1 h 15 min"));
await page.click("#profileClose");
await page.click("#historyBtn");
check("el botón de historial abre en Historial", (await page.$eval("#pTabHist", (x) => x.getAttribute("aria-selected"))) === "true");

// foto: un PNG grande de prueba
const png = await page.evaluate(() => {
  const c = document.createElement("canvas"); c.width = 640; c.height = 480;
  const g = c.getContext("2d"); g.fillStyle = "#e33"; g.fillRect(0, 0, 640, 480); g.fillStyle = "#39f"; g.fillRect(200, 100, 240, 280);
  return c.toDataURL("image/png").split(",")[1];
});
const file = join(mkdtempSync(join(tmpdir(), "foto-")), "foto.png");
writeFileSync(file, Buffer.from(png, "base64"));
await page.setInputFiles("#photoInput", file);
await sleep(2500);
const saved = (await admin((db) => getDoc(doc(db, "players", uid)))).data();
check("la foto queda en la base como JPEG chico", typeof saved.photo === "string" && saved.photo.startsWith("data:image/jpeg;base64,") && saved.photo.length < 12000, `${saved.photo && saved.photo.length} caracteres`);
check("no se tocaron los minutos", saved.total.m === 150 && saved.name === "Sofi");
check("la foto se ve en el perfil", (await page.$$("#profileAvatar img")).length === 1);
await page.click("#profileClose");
check("la foto se ve en el ranking", (await page.$$("#rows .avatar img")).length === 1);
check("la foto se ve en la cabecera", (await page.$$("#meAvatar img")).length === 1);

// otro usuario la ve en el ranking: se lee la colección sin cuenta
const other = await (await browser.newContext()).newPage();
await other.goto(URL); await sleep(3000);
check("otra persona ve la foto en el ranking", (await other.$$("#rows .avatar img")).length === 1);

// quitar
await page.click("#meOpen");
await page.click("#photoRemove");
await sleep(2000);
const after = (await admin((db) => getDoc(doc(db, "players", uid)))).data();
check("quitar la foto la borra de la base", after.photo === undefined && after.total.m === 150);
check("vuelve la inicial", (await page.$$("#profileAvatar img")).length === 0);

check("sin errores en la página", errors.length === 0, errors.join(" | "));
await browser.close();
await env.cleanup();
process.exit(checks.every(Boolean) ? 0 : 1);
