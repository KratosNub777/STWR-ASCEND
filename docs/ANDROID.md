# App Android: APK, instalación y cómo compartirla

El APK se compila solo en GitHub cada vez que se sube un cambio al repo. No hace falta Android Studio.

## 1. Cargar la contraseña de la firma (una sola vez)

Android solo instala una actualización encima de la anterior si las dos están firmadas con la **misma clave**.
La clave está en el repo (`android/app/stwr-release.p12`) protegida por una contraseña, y la contraseña tiene que guardarse en GitHub como "secreto" para que nadie más la vea.

1. Entrá a **https://github.com/KratosNub777/STWR-ASCEND/settings/secrets/actions**
2. Tocá **New repository secret**.
3. En **Name** escribí exactamente: `ANDROID_KEYSTORE_PASSWORD`
4. En **Secret** pegá la contraseña que te pasó Claude en el chat.
5. Tocá **Add secret**.
6. Guardá esa contraseña también en algún lugar seguro (por ejemplo, tus notas). Si se pierde, la próxima versión de la app no se va a poder instalar encima y todos tendrían que desinstalar y volver a instalar.

Mientras este secreto no esté cargado, GitHub compila el APK igual pero **no lo publica**, para que nadie instale una versión con otra firma.

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
