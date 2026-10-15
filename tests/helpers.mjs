// Ayudas compartidas por las pruebas e2e.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Guarda el código de verificación que devuelve el Worker de prueba (DEV:1) en page.verifyCode. */
export function captureCodes(page) {
  page.on("response", async (res) => {
    if (/\/verify\/send$/.test(res.url())) { try { page.verifyCode = (await res.json()).debugCode; } catch {} }
  });
}

/** Crea una cuenta desde la pantalla de registro y completa la verificación del correo. */
export async function registerAndVerify(page, name, email, pass) {
  await page.fill("#authName", name);
  await page.fill("#authEmail", email);
  await page.fill("#authPass", pass);
  await page.click("#authBtn");
  await sleep(3000);
  await page.fill("#codeInput", page.verifyCode);
  await page.click("#codeSubmit");
  await sleep(3500);
}
