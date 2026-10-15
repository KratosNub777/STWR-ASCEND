// Genera los íconos de la web (PWA) y de Android a partir de un dibujo SVG.
// Uso: node tools/make-icons.mjs   (requiere Playwright y Chromium)
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const BG = "#000004";
// el dibujo es el logo en PNG (public/icons/logo-emblema.png); viewBox 0..100
const logo = "data:image/png;base64," + readFileSync("public/icons/logo-emblema.png").toString("base64");
const art = () => `<image href="${logo}" x="0" y="0" width="100" height="100"/>`;
const svg = (size, { bg = BG, shape = "square", scale = 1 } = {}) => {
  const pad = (100 - 100 * scale) / 2;
  const back = shape === "none" ? "" : shape === "circle"
    ? `<circle cx="50" cy="50" r="50" fill="${bg}"/>`
    : shape === "rounded" ? `<rect width="100" height="100" rx="22" fill="${bg}"/>` : `<rect width="100" height="100" fill="${bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${back}
    <g transform="translate(${pad} ${pad}) scale(${scale})">${art()}</g></svg>`;
};
// silueta blanca para la barra de notificaciones (Android la exige monocroma)
const statSvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
  <circle cx="12" cy="4.6" r="2.6" fill="#fff"/><path d="M12 8.6 3 21.5h5.2L12 15.2l3.8 6.3H21Z" fill="#fff"/></svg>`;

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage();
async function png(file, markup, w, h = w) {
  mkdirSync(dirname(file), { recursive: true });
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  writeFileSync(file, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } }));
}

// Web / PWA
await png("public/icons/icon-192.png", svg(192, { shape: "rounded" }), 192);
await png("public/icons/icon-512.png", svg(512, { shape: "rounded" }), 512);
await png("public/icons/maskable-512.png", svg(512, { scale: 0.72 }), 512);
await png("public/icons/apple-touch-icon.png", svg(180), 180);

// Android: ícono clásico, redondo y adaptable (frente + fondo de color)
const res = "android/app/src/main/res";
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(dens)) {
  await png(`${res}/mipmap-${d}/ic_launcher.png`, svg(48 * k, { shape: "rounded" }), 48 * k);
  await png(`${res}/mipmap-${d}/ic_launcher_round.png`, svg(48 * k, { shape: "circle", scale: 0.86 }), 48 * k);
  await png(`${res}/mipmap-${d}/ic_launcher_foreground.png`, svg(108 * k, { shape: "none", scale: 0.6 }), 108 * k);
  await png(`${res}/drawable-${d}/ic_stat_timer.png`, statSvg(24 * k), 24 * k);
}
writeFileSync(`${res}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);

// Pantallas de carga: fondo oscuro con el ícono al centro, con los mismos tamaños que trae Capacitor
const { execSync } = await import("node:child_process");
const splashes = execSync(`find ${res} -name splash.png`).toString().trim().split("\n");
for (const f of splashes) {
  const buf = readFileSync(f);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const s = Math.round(Math.min(w, h) * 0.32);
  await png(f, `<div style="width:${w}px;height:${h}px;background:${BG};display:grid;place-items:center">${svg(s, { shape: "none" })}</div>`, w, h);
}
await browser.close();
console.log("Íconos generados.");
