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

## 3. Activar el inicio de sesión anónimo

Así cada persona tiene un identificador propio sin crear cuenta ni contraseña.

1. Menú de la izquierda: **Compilación** (en inglés, *Build*) → **Authentication**.
2. Tocá **Comenzar**.
3. Pestaña **Método de acceso** (*Sign-in method*) → elegí **Anónimo** → activá el interruptor → **Guardar**.

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

---
