// Nombres repetidos: aunque alguien escriba el nombre apenas abre la app (antes de que cargue el ranking),
// no puede usar un nombre que ya tiene otra persona, ni con otras mayúsculas o tildes.
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { collection, getDocs } from "firebase/firestore";

const URL = process.env.APP_URL || "http://localhost:5173/";
const env = await initializeTestEnvironment({
  projectId: "demo-stwr",
  firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 }
});
await env.clearFirestore();
const names = async () => {
  let out = [];
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = (await getDocs(collection(ctx.firestore(), "players"))).docs.map((d) => d.data().name).sort();
  });
  return out;
};
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

const a = await open();
await a.fill("#nameInput", "Facundo");
await a.click("#gateBtn");
await sleep(3000);

// la segunda persona escribe enseguida, sin esperar a que cargue el ranking
const b = await open();
await b.fill("#nameInput", "fácundo ");
await b.click("#gateBtn");
await sleep(4000);
const err = await b.$eval("#gateErr", (x) => x.textContent);
const gateOpen = await b.$eval("#gate", (x) => !x.hidden);
console.log("Segundo 'fácundo': error =", JSON.stringify(err), "| sigue en la pantalla de nombre:", gateOpen);

await b.fill("#nameInput", "Facundo V");
await b.click("#gateBtn");
await sleep(3000);
console.log("Con 'Facundo V': pantalla cerrada =", await b.$eval("#gate", (x) => x.hidden));
console.log("Nombres en la base:", await names());
console.log("errores:", errors);
const ok = err.includes("ya lo usa") && gateOpen && JSON.stringify(await names()) === JSON.stringify(["Facundo", "Facundo V"]);
console.log(ok ? "OK" : "FALLÓ");
await browser.close();
await env.cleanup();
process.exit(ok ? 0 : 1);
