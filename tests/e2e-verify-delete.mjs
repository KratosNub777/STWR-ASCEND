// Verificación del correo al registrarse y eliminación de la cuenta, los dos con código por correo.
// Hace falta el Worker en local: cd worker && npx wrangler dev --port 8787 --var DEV:1 \
//   --var FIREBASE_AUTH_EMULATOR:http://127.0.0.1:9099 --var FIREBASE_PROJECT:demo-stwr \
//   --var FIREBASE_API_KEY:demo-key --var FIRESTORE_EMULATOR:http://127.0.0.1:8080
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc } from "firebase/firestore";

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
const accountExists = async (email) => {
  const r = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-stwr/accounts:lookup", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer owner" }, body: JSON.stringify({ email: [email] })
  });
  return !!((await r.json()).users || []).length;
};

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const errors = [];
const page = await (await browser.newContext()).newPage();
page.on("pageerror", (e) => errors.push(e.message));
// el Worker en modo de prueba devuelve el código en la respuesta (en producción solo llega por correo)
const codes = {};
page.on("response", async (res) => {
  const m = res.url().match(/\/(verify|delete)\/send$/);
  if (m) { try { codes[m[1]] = (await res.json()).debugCode; } catch {} }
});
await page.goto(URL);
await sleep(2500);

// 1) registro: pide el código antes de entrar
await page.fill("#authName", "Dani");
await page.fill("#authEmail", "dani@prueba.com");
await page.fill("#authPass", "secreta123");
await page.click("#authBtn");
await sleep(3000);
check("después de registrarse pide el código", await page.$eval("#codeGate", (x) => !x.hidden) && (await page.$eval("#codeTitle", (x) => x.textContent)) === "Verificá tu correo");
check("el texto nombra el correo", (await page.$eval("#codeText", (x) => x.textContent)).includes("dani@prueba.com"));
check("todavía no entró a la app (sin botón de salir)", await page.$eval("#logoutBtn", (x) => x.hidden));
check("el servidor generó un código de 6 dígitos", /^\d{6}$/.test(codes.verify || ""), String(codes.verify));
await page.fill("#codeInput", codes.verify === "000000" ? "111111" : "000000");
await page.click("#codeSubmit");
await sleep(1500);
check("un código incorrecto se rechaza", (await page.$eval("#codeErr", (x) => x.textContent)).includes("no es correcto") && await page.$eval("#codeGate", (x) => !x.hidden));
await page.fill("#codeInput", codes.verify);
await page.click("#codeSubmit");
await sleep(3500);
check("con el código correcto entra a la app", await page.$eval("#codeGate", (x) => x.hidden) && await page.$eval("#logoutBtn", (x) => !x.hidden));
const uid = await page.evaluate(() => new Promise((res) => {
  const req = indexedDB.open("firebaseLocalStorageDb");
  req.onsuccess = () => {
    const all = req.result.transaction("firebaseLocalStorage").objectStore("firebaseLocalStorage").getAll();
    all.onsuccess = () => res(all.result.map((x) => x.value).find((v) => v && v.uid).uid);
  };
}));
const saved = await admin((db) => getDoc(doc(db, "players", uid)));
check("se crea su documento en el ranking", saved.exists() && saved.data().name === "Dani");

// 2) recargar con la cuenta verificada entra directo
await page.reload(); await sleep(3000);
check("al volver no vuelve a pedir el código", await page.$eval("#codeGate", (x) => x.hidden) && await page.$eval("#logoutBtn", (x) => !x.hidden));

// 3) eliminar: dos preguntas, después el código
await page.click("#meOpen");
await page.click("#deleteBtn");
check("primera pregunta", (await page.$eval("#confirmTitle", (x) => x.textContent)) === "¿Eliminar tu cuenta?");
await page.click("#confirmCancel");
await sleep(400);
check("cancelar la primera no sigue", await page.$eval("#codeGate", (x) => x.hidden) && await page.$eval("#profileDlg", (d) => d.open));
await page.click("#deleteBtn");
await page.click("#confirmOk");
await sleep(400);
check("segunda pregunta", (await page.$eval("#confirmTitle", (x) => x.textContent)) === "¿Seguro de verdad?");
await page.click("#confirmCancel");
await sleep(400);
check("cancelar la segunda no manda el código", codes.delete === undefined && await page.$eval("#codeGate", (x) => x.hidden));
await page.click("#deleteBtn");
await page.click("#confirmOk"); await sleep(400);
await page.click("#confirmOk"); await sleep(2500);
check("pide el código para eliminar", await page.$eval("#codeGate", (x) => !x.hidden) && (await page.$eval("#codeTitle", (x) => x.textContent)).includes("eliminar"));
check("el servidor generó el código de borrado", /^\d{6}$/.test(codes.delete || ""), String(codes.delete));
check("la cuenta sigue existiendo antes de confirmar", await accountExists("dani@prueba.com") && (await admin((db) => getDoc(doc(db, "players", uid)))).exists());
await page.fill("#codeInput", codes.delete === "000000" ? "111111" : "000000");
await page.click("#codeSubmit");
await sleep(1500);
check("código incorrecto no borra nada", (await accountExists("dani@prueba.com")) && (await admin((db) => getDoc(doc(db, "players", uid)))).exists());
await page.fill("#codeInput", codes.delete);
await page.click("#codeSubmit");
await sleep(4000);
check("la cuenta y el documento se borraron", !(await accountExists("dani@prueba.com")) && !(await admin((db) => getDoc(doc(db, "players", uid)))).exists());
check("vuelve al registro con aviso", await page.$eval("#auth", (x) => !x.hidden) && (await page.$eval("#authErr", (x) => x.textContent)).includes("se eliminó"));

check("sin errores en la página", errors.length === 0, errors.join(" | "));
await browser.close();
await env.cleanup();
process.exit(checks.every(Boolean) ? 0 : 1);
