# STWR-ASCEND

Pomodoro competitivo para estudiar con amigos: reloj circular, capítulos del 1 al 13, tiempos personalizables
y ranking compartido en vivo (Hoy, Esta semana y General), con racha de días y avisos al subir de puesto.

## Estructura

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | La página (estructura). |
| `src/styles.css` | El diseño. |
| `src/app.js` | Reloj, capítulos, tiempos, ranking, racha y avisos. |
| `src/data.js` | Conexión con Firebase (cuentas con correo y contraseña, y Firestore). |
| `src/firebase-config.js` | **Las claves de tu proyecto de Firebase: el único archivo que tenés que completar.** |
| `src/util.js`, `src/sound.js` | Fechas, almacenamiento del dispositivo, sonido y pantalla encendida. |
| `firestore.rules` | Reglas de seguridad de la base de datos. |
| `tests/` | Pruebas de las reglas y de la app con dos usuarios, usando el emulador de Firebase. |
| `artifact/index.html` | La versión original que corre dentro de Claude (referencia). |
| `src/native.js` | Funciones de la app Android: notificaciones y pantalla encendida. |
| `public/` | Manifiesto de la PWA, service worker e íconos. |
| `android/` | Proyecto Android generado con Capacitor (nombre, ícono, orientación vertical, permisos). |
| `capacitor.config.json` | Configuración de la app Android. |
| `.github/workflows/publicar.yml` | Publica la web en GitHub Pages y compila el APK en cada cambio. |
| `tools/make-icons.mjs` | Regenera los íconos si cambia el dibujo. |
| `docs/FIREBASE.md` | Guía paso a paso para crear el proyecto gratis en Firebase. |
| `docs/ANDROID.md` | Firma del APK, instalación en el celular y cómo compartirlo. |

## Links

- Web: https://kratosnub777.github.io/STWR-ASCEND/
- APK: https://github.com/KratosNub777/STWR-ASCEND/releases/latest/download/STWR-ASCEND.apk

## Comandos

```bash
npm install          # instala todo (una sola vez)
npm run dev          # abre la app en http://localhost:5173
npm run build        # genera la versión final en dist/
npm run test:rules   # prueba las reglas de seguridad con el emulador
```

Pruebas de punta a punta con el emulador (dos usuarios y sin conexión):

```bash
npm run emulators                  # terminal 1
VITE_USE_EMULATOR=1 npx vite       # terminal 2
node tests/e2e-two-users.mjs       # terminal 3
node tests/e2e-offline.mjs
node tests/e2e-same-name.mjs
node tests/e2e-accounts.mjs
```

## Datos en Firestore

Colección `players`, un documento por persona (id = uid de su cuenta; quienes jugaban sin cuenta conservan el mismo al registrarse):

- `name`: nombre (1 a 24 caracteres).
- `days`: minutos y sesiones por día (`"2026-10-12": { m, s }`), de los últimos 70 días.
- `chapters`: minutos y sesiones por capítulo (`"3": { m, s }`).
- `total`: total histórico `{ m, s }`, para el ranking General.
- `current`: capítulo que está estudiando.
- `updatedAt`: hora del servidor del último guardado.
- `lastAt`: hora del servidor del último guardado que sumó minutos. Las reglas lo usan para que nadie sume más minutos que el tiempo real que pasó.
- `lastDay`, `lastSession`: día y marca de la última tanda guardada. Evitan contar dos veces una sesión guardada sin conexión.
