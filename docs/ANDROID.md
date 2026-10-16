# App Android: APK, instalación y cómo compartirla

El APK se compila solo en GitHub cada vez que entra un cambio a la rama `main`. No hace falta Android Studio.

## 1. Cargar la clave de firma (una sola vez)

Android solo instala una actualización encima de la anterior si las dos están firmadas con la **misma clave**.
La clave **no está en el repo** (el repo es público): vive como "secreto" de GitHub, junto con su contraseña.

1. Entrá a **https://github.com/KratosNub777/STWR-ASCEND/settings/secrets/actions**
2. Tocá **New repository secret** y cargá estos dos (si ya existía `ANDROID_KEYSTORE_PASSWORD`, tocá el lápiz y reemplazá el valor):
   - `ANDROID_KEYSTORE_BASE64`: el contenido completo del archivo `stwr-release.p12.base64.txt` que te pasó Claude.
   - `ANDROID_KEYSTORE_PASSWORD`: la contraseña que te pasó Claude en el chat.
3. Guardá el archivo `.p12` y la contraseña en un lugar seguro **fuera del repo** (gestor de contraseñas o nube privada). Si se pierden, la próxima versión no se podrá instalar encima y todos tendrían que desinstalar y volver a instalar.

Mientras estos secretos no estén cargados, GitHub compila el APK igual pero **no lo publica**, para que nadie instale una versión con otra firma.

### Crear una clave nueva (solo si hace falta rotarla)

```
keytool -genkeypair -keystore stwr-release.p12 -storetype PKCS12 -alias stwr \
  -keyalg RSA -keysize 4096 -validity 36500
base64 -w0 stwr-release.p12 > stwr-release.p12.base64.txt
```

Usá una contraseña larga y aleatoria (la misma para el almacén y la clave) y cargá los dos secretos como arriba. Cambiar la clave obliga a desinstalar y reinstalar la app en cada celular.

## 2. Descargar el APK

Link fijo, siempre apunta a la última versión:

**https://github.com/KratosNub777/STWR-ASCEND/releases/latest/download/STWR-ASCEND.apk**

También está en **https://github.com/KratosNub777/STWR-ASCEND/releases** (archivo `STWR-ASCEND.apk`).

## 3. Instalarlo en el celular

1. Abrí el link de arriba **desde el celular** (por ejemplo, tocándolo en WhatsApp). Se descarga `STWR-ASCEND.apk`.
2. Tocá la notificación de descarga, o abrí la app **Archivos** → **Descargas** → `STWR-ASCEND.apk`.
3. La primera vez Android avisa que no permite instalar apps de esta fuente. Tocá **Configuración** y activá **Permitir de esta fuente** para la app desde la que lo abriste (Chrome, WhatsApp o Archivos). Volvé atrás.
4. Tocá **Instalar**. Si aparece "Google Play Protect" diciendo que la app es desconocida, tocá **Más detalles** → **Instalar de todas formas**. Es normal en apps que no están en Play Store.
5. Abrí **STWR-ASCEND**. La primera vez que inicies una sesión te va a pedir permiso para **notificaciones**: tocá **Permitir**, así suena aunque el celular esté bloqueado.

## 4. Pasárselo a tus amigos

Mandales por WhatsApp el link fijo del paso 2. Cada uno sigue los pasos del punto 3.

Mensaje listo para copiar:

> Bajate la app de STWR-ASCEND para competir estudiando: https://github.com/KratosNub777/STWR-ASCEND/releases/latest/download/STWR-ASCEND.apk
> Si el Android te frena, tocá "Configuración" y "Permitir de esta fuente". Si no tenés Android, usá la web: https://kratosnub777.github.io/STWR-ASCEND/

## 5. Actualizaciones

Cuando entra un cambio a `main`, GitHub publica un APK nuevo en unos 5 a 10 minutos.
La app instalada se da cuenta sola y muestra arriba **"Hay una versión nueva de la app"**: se toca, se descarga y se instala encima. No se pierden los datos ni el lugar en el ranking.

## Si algo falla

- **"La app no está instalada" o "conflicto con un paquete existente"**: el APK nuevo tiene otra firma. Pasa solo si cambió la clave o la contraseña. Hay que desinstalar y volver a instalar (se pierde la identidad anónima en ese celular).
- **No suena la notificación**: revisá Ajustes → Apps → STWR-ASCEND → Notificaciones (activadas) y que la batería no esté en modo "restringido" para la app.
