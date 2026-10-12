# Crear el proyecto gratis en Firebase (paso a paso)

Tiempo estimado: 10 minutos. No hace falta tarjeta de crédito: se usa el plan gratuito **Spark**.

Son cinco partes:
1. Crear el proyecto.
2. Registrar la app web y copiar la configuración.
3. Activar el inicio de sesión anónimo.
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
