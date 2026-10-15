# Crear el proyecto gratis en Firebase (paso a paso)

Tiempo estimado: 10 minutos. No hace falta tarjeta de crédito: se usa el plan gratuito **Spark**.

Son cinco partes:
1. Crear el proyecto.
2. Registrar la app web y copiar la configuración.
3. Activar el inicio de sesión con correo y contraseña.
4. Crear la base de datos y pegar las reglas.
5. Autorizar la dirección de la web publicada.

---

## 1. Crear el proyecto

1. Entrá a **https://console.firebase.google.com** con tu cuenta de Google.
2. Tocá **Crear un proyecto** (puede decir "Agregar proyecto").
3. Nombre: `stwr-ascend` (o el que quieras). Tocá **Continuar**.
4. Cuando pregunte por **Google Analytics**, desactivalo: no hace falta. Tocá **Crear proyecto**.
5. Esperá unos segundos y tocá **Continuar**.

## 2. Registrar la app web y copiar la configuración

1. En la pantalla principal del proyecto, tocá el ícono **`</>`** (dice "Web").
2. Apodo de la app: `STWR-ASCEND`. **No** marques "Firebase Hosting". Tocá **Registrar app**.
3. Aparece un bloque de código parecido a este:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "stwr-ascend.firebaseapp.com",
     projectId: "stwr-ascend",
     storageBucket: "stwr-ascend.firebasestorage.app",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```

4. Copiá esos seis valores y pegalos en el archivo **`src/firebase-config.js`** del repo, en lugar de cada `"PEGAR_AQUI"` (dejá las comillas).
   - Si preferís, mandalos por el chat y los pego yo. **No son secretos**: cualquiera que abra la web los puede ver. Lo que protege la base son las reglas del paso 4.
5. Tocá **Ir a la consola**.

Si cerraste esa pantalla: engranaje ⚙ (arriba a la izquierda) → **Configuración del proyecto** → bajá hasta **Tus apps** → **Configuración del SDK** → opción **Configuración**.

## 3. Activar el inicio de sesión con correo y contraseña

Cada persona crea su cuenta con correo y contraseña, y entra con ella desde cualquier dispositivo.

1. Menú de la izquierda: **Compilación** (en inglés, *Build*) → **Authentication**.
2. Tocá **Comenzar**.
3. Pestaña **Método de acceso** (*Sign-in method*) → elegí **Correo electrónico/contraseña** → activá el primer interruptor (no hace falta el de "vínculo por correo") → **Guardar**.
4. Si el proyecto ya existía con **Anónimo** activado, dejalo así: quienes jugaban sin cuenta la convierten en una cuenta con correo y conservan sus minutos.

## 4. Crear la base de datos y pegar las reglas

1. Menú de la izquierda: **Compilación** → **Firestore Database** → **Crear base de datos**.
2. Si pregunta la edición, elegí **Standard**.
3. Ubicación: elegí la más cercana a ustedes, por ejemplo `southamerica-east1 (São Paulo)`. **No se puede cambiar después.** Tocá **Siguiente**.
4. Elegí **Comenzar en modo de producción** y tocá **Crear**.
5. Cuando se abra la base, entrá a la pestaña **Reglas**.
6. Borrá todo lo que hay y pegá el contenido completo del archivo **`firestore.rules`** de este repo.
7. Tocá **Publicar**.

Listo. La colección `players` no hace falta crearla: aparece sola cuando entra la primera persona.

## 5. Permitir la web publicada (un paso más, 1 minuto)

Firebase solo deja iniciar sesión desde direcciones autorizadas.

1. Menú de la izquierda: **Authentication** → pestaña **Configuración** (*Settings*) → **Dominios autorizados**.
2. Tocá **Agregar dominio** y escribí: `kratosnub777.github.io`
3. Tocá **Agregar**.

`localhost` ya viene autorizado: es el que usa la app Android, así que no hay que agregar nada para el APK.

## 6. Código de 6 dígitos para recuperar la contraseña (gratis, sin tarjeta)

La pantalla **Recuperar contraseña** manda un código de 6 dígitos al correo y con él se elige una contraseña nueva. Lo hace un pequeño servidor (carpeta `worker/`) que se publica **una vez** en Cloudflare Workers, plan gratis, sin tarjeta. Hasta que se publique, la pantalla muestra "Falta conectar el servidor del código".

**Por qué hace falta:** Firebase solo manda correos con un enlace largo. Un código corto necesita un servidor que lo genere, lo mande y cambie la contraseña con permisos de administrador. El código se guarda con hash, vale 10 minutos, se usa una sola vez y tiene máximo 5 intentos.

Vas a necesitar: **Node.js** instalado, una terminal dentro de la carpeta del repo y unos 20 minutos.

### 6.1 Clave de administrador de Firebase
Sirve para que el servidor pueda cambiar contraseñas. Es gratis y no cambia tu plan.

1. Consola de Firebase → engranaje ⚙ → **Configuración del proyecto** → pestaña **Cuentas de servicio**.
2. Tocá **Generar nueva clave privada** → **Generar clave**. Se descarga un archivo `.json`.
3. **Es un secreto**: no lo subas al repo, no lo mandes por chat ni lo compartas. Con él se puede administrar tu proyecto. Cuando termines el paso 6.5, borralo de tu computadora.

### 6.2 Cuenta de correo (Brevo, gratis)
1. Creá una cuenta en https://www.brevo.com (300 correos por día gratis).
2. **Remitentes, dominios e IP** → **Remitentes** → **Agregar un remitente**. Poné tu correo (por ejemplo, tu Gmail) y confirmalo con el enlace que te llega. Sin esto Brevo no manda nada.
3. **SMTP y API** → pestaña **Claves de API** → **Generar una nueva clave API**. Copiala: después no se vuelve a mostrar.

### 6.3 Cuenta de Cloudflare (gratis)
1. Creá una cuenta en https://dash.cloudflare.com/sign-up. No pide tarjeta.
2. Confirmá tu correo.

### 6.4 Publicar el servidor
1. Abrí `worker/wrangler.toml` y cambiá `MAIL_FROM = "CAMBIAR@ejemplo.com"` por el correo que verificaste en Brevo. Guardá el archivo.
2. En la terminal, uno por uno:

```
git pull
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

   - `wrangler login` abre el navegador: tocá **Allow**.
   - En el primer `deploy` puede pedirte elegir un nombre de subdominio `workers.dev`: elegí uno (por ejemplo, tu nombre).
   - Al terminar imprime una dirección parecida a `https://stwr-reset.TU-SUBDOMINIO.workers.dev`. **Copiala.**

3. Cargá los dos secretos (te pide el valor y lo escondés al pegarlo):

```
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
```

   - En el primero pegá la clave de Brevo.
   - En el segundo pegá **todo el contenido** del archivo `.json` del paso 6.1 (de la `{` a la `}`). Si te resulta más fácil: `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT < ruta/al/archivo.json`.

### 6.5 Conectar la app
1. Abrí `src/firebase-config.js` y reemplazá `https://stwr-reset.PEGAR_AQUI.workers.dev` por la dirección del paso 6.4.
2. Subí el cambio a `main` (el flujo de publicación actualiza la web y el APK solos).
3. Ahora sí, borrá de tu computadora el `.json` del paso 6.1.

### 6.6 Probar
Abrí la app → **Iniciar sesión** → **Olvidé mi contraseña** → poné el correo de una cuenta que exista. Tiene que llegar un correo con el código (mirá en **spam** la primera vez). Escribilo, elegí la contraseña nueva y entrá con ella.

### Si algo falla
| Síntoma | Causa probable |
|---|---|
| "Falta conectar el servidor del código" | No reemplazaste `PEGAR_AQUI` en `src/firebase-config.js`, o no se publicó la web con ese cambio |
| "No se pudo. Probá de nuevo." | El servidor no está publicado, o falta algún secreto. Mirá los registros con `npx wrangler tail` dentro de `worker/` y repetí el pedido |
| "No pudimos mandar el correo" | Clave de Brevo mal pegada, o `MAIL_FROM` distinto del remitente verificado en Brevo |
| No llega nada, pero no hay error | Revisá spam y, en Brevo, **Transaccional** → **Logs**. Si el correo no tiene cuenta, el servidor responde igual y no manda nada (a propósito) |
| "Ya te mandamos un código hace un momento" | Esperá 1 minuto: es el límite anti-abuso |

Si cambiás un secreto o `wrangler.toml`, volvé a correr `npx wrangler deploy` dentro de `worker/`.

### Probar en tu computadora (opcional)
Sin mandar correos ni tocar tu proyecto real: en tres terminales, `npm run emulators`, `cd worker && npx wrangler dev --port 8787 --var DEV:1 --var FIREBASE_AUTH_EMULATOR:http://127.0.0.1:9099 --var FIREBASE_PROJECT:demo-stwr` y `VITE_USE_EMULATOR=1 npm run dev`. Con `DEV:1` el servidor no manda correo: devuelve el código en la respuesta. **Nunca** pongas `DEV` en el servidor publicado.

---

## ¿Cómo sé que funcionó?

Abrí la web publicada, escribí tu nombre y volvé a **Firestore Database → Datos**. Tiene que aparecer la colección `players` con un documento a tu nombre.

## Límites del plan gratis

Para un grupo de amigos sobra: 50.000 lecturas y 20.000 escrituras por día, y 1 GB de datos.
Si algún día se pasara, la app no se rompe: el ranking deja de actualizarse hasta el día siguiente y las sesiones quedan guardadas en cada teléfono.
