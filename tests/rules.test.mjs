// Pruebas de las reglas de Firestore con el emulador oficial.
// Se corren con: npm run test:rules
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from "firebase/firestore";

let env;
const minutesAgo = (n) => Timestamp.fromMillis(Date.now() - n * 60e3);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-stwr",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 }
  });
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

// documento existente de "ana", guardado hace `ago` minutos
async function seedAna(ago, extra = {}) {
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), "players/ana"), {
      name: "Ana", days: { "2026-10-12": { m: 25, s: 1 } }, chapters: { "3": { m: 25, s: 1 } },
      total: { m: 25, s: 1 }, current: 3, lastDay: "2026-10-12", lastSession: 1000,
      updatedAt: minutesAgo(ago), lastAt: minutesAgo(ago), ...extra
    })
  );
}
// una sesión de 25 minutos más, mismo día y capítulo
const plus25 = () => ({
  days: { "2026-10-12": { m: 50, s: 2 } }, chapters: { "3": { m: 50, s: 2 } }, total: { m: 50, s: 2 },
  current: 3, lastDay: "2026-10-12", lastSession: 2000, updatedAt: serverTimestamp(), lastAt: serverTimestamp()
});
const fresh = (name = "Ana") => ({
  name, days: {}, chapters: {}, total: { m: 0, s: 0 }, updatedAt: serverTimestamp(), lastAt: serverTimestamp()
});

test("cualquiera puede leer el ranking, aun sin sesión", async () => {
  await seedAna(30);
  await assertSucceeds(getDocs(collection(anon(), "players")));
  await assertSucceeds(getDoc(doc(as("beto"), "players/ana")));
});

test("cada uno crea solo su propio documento, y en cero", async () => {
  await assertSucceeds(setDoc(doc(as("ana"), "players/ana"), fresh()));
  await assertFails(setDoc(doc(as("beto"), "players/carla"), fresh("Carla")));
  await assertFails(setDoc(doc(anon(), "players/nadie"), fresh("Nadie")));
  await assertFails(setDoc(doc(as("dani"), "players/dani"), { ...fresh("Dani"), total: { m: 500, s: 20 } }));
});

test("nadie puede modificar ni borrar el documento de otro", async () => {
  await seedAna(30);
  await assertFails(updateDoc(doc(as("beto"), "players/ana"), { name: "Hackeado", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as("beto"), "players/ana"), plus25()));
  await assertFails(deleteDoc(doc(as("beto"), "players/ana")));
  await assertFails(deleteDoc(doc(as("ana"), "players/ana")));
});

test("cambiar el nombre o el capítulo actual está permitido", async () => {
  await seedAna(30);
  await assertSucceeds(updateDoc(doc(as("ana"), "players/ana"), { name: "Anita", current: 7, updatedAt: serverTimestamp() }));
});

test("sumar una sesión completa después del tiempo real está permitido", async () => {
  await seedAna(30);
  await assertSucceeds(updateDoc(doc(as("ana"), "players/ana"), plus25()));
});

test("no se pueden sumar más minutos que el tiempo que pasó", async () => {
  await seedAna(5);
  await assertFails(updateDoc(doc(as("ana"), "players/ana"), plus25()));
});

test("los minutos del día y del capítulo tienen que coincidir con el total", async () => {
  await seedAna(120);
  const ref = doc(as("ana"), "players/ana");
  await assertFails(updateDoc(ref, { ...plus25(), days: { "2026-10-12": { m: 500, s: 2 } } }));
  await assertFails(updateDoc(ref, { ...plus25(), chapters: { "3": { m: 900, s: 2 } } }));
  // minutos metidos en otro día sin sumarlos al total
  await assertFails(updateDoc(ref, { days: { "2026-10-12": { m: 25, s: 1 }, "2026-10-11": { m: 300, s: 3 } }, updatedAt: serverTimestamp() }));
  // dos días distintos en un mismo guardado
  await assertFails(updateDoc(ref, { ...plus25(), days: { "2026-10-12": { m: 50, s: 2 }, "2026-10-11": { m: 25, s: 1 } } }));
});
