# Saldo — finanzas personales para dos cuentas

App web instalable (PWA), con Supabase Auth, movimientos en PostgreSQL y privacidad protegida por **Row Level Security**.

## Qué incluye

- Alta e inicio de sesión independientes por correo y contraseña.
- Gastos e ingresos en **pesos uruguayos (UYU)**, con categorías, notas y fecha.
- Resumen por mes, balance personal, estadísticas por categoría, búsqueda, edición, eliminación y exportación CSV.
- Conexión entre dos cuentas mediante un código temporal de 12 caracteres válido durante siete días.
- Cada movimiento es privado por defecto; su dueño puede marcarlo como **compartido con la pareja**.
- La pareja solo ve los movimientos específicamente compartidos, **nunca el balance global ni todos los movimientos privados**.
- Desvincular la pareja vuelve privados los movimientos compartidos de ambos.
- Instalación como app en Android/iOS desde el navegador (PWA).

## 1. Crear Supabase (necesario una sola vez)

1. Entrar en <https://supabase.com/dashboard> y crear un proyecto nuevo (por ejemplo, `saldo`). Guardar de forma segura la contraseña de la base de datos.
2. Abrir **SQL Editor** → **New query**. Copiar el contenido completo de `supabase.sql` y ejecutarlo con **Run**. Esto crea tablas, funciones y reglas de acceso (RLS).
3. Ir a **Project Settings** → **API** (o **Connect** según versión). Copiar el **Project URL** y la clave **Publishable** (`sb_publishable_...`) o la clave pública **anon**.
4. Abrir `config.js` y reemplazar `PEGA_TU_SUPABASE_URL` y `PEGA_TU_PUBLISHABLE_O_ANON_KEY` por esos dos valores.
5. **NUNCA** poner en `config.js` las claves `service_role`, `sb_secret_...`, credenciales SQL, ni contraseñas. Los valores de `config.js` se publican en la web; solo van claves diseñadas para uso público.

## 2. Publicarla en GitHub Pages

1. En GitHub, crear un repositorio nuevo, por ejemplo **saldo**. Si querés limitar quién puede ver el código, podés guardar el proyecto en un repositorio privado, pero la publicación de GitHub Pages puede seguir siendo pública y depende de tu plan. El acceso a las cuentas y los movimientos igualmente queda protegido por Supabase Auth y RLS.
2. Subir **el contenido de esta carpeta** a la raíz del repo: `index.html`, `styles.css`, `app.js`, `config.js`, `supabase.sql`, `sw.js`, `manifest.webmanifest` e `icons/` (para la app solo son necesarios los archivos web, no el SQL ni este README).
3. Abrir **Settings → Pages**. En **Build and deployment**, elegir **Deploy from a branch** → `main` / `(root)` y guardar.
4. La URL esperada será `https://TU_USUARIO.github.io/saldo/` (si el repositorio se llama `saldo`). Confirmar la URL que GitHub muestre en Pages; **esa dirección es un ejemplo, no una URL ya publicada**.
5. En Supabase, ir a **Authentication → URL Configuration**. Configurar **Site URL** con la URL real de Pages, con `/` final. Agregar esa misma URL en **Redirect URLs**. Esto es necesario para confirmación de correo y recuperación de contraseña.
6. Para el primer uso mantener la **confirmación de correo electrónico habilitada**. Cada persona se registra con un correo distinto y confirma su dirección.

**Nota:** el CDN de Supabase y las fuentes de Google requieren internet. El icono se puede instalar aunque para sincronizar datos es necesario conectarse.

## 3. Vincular las cuentas

1. Cada persona abre la URL y crea su usuario **con su propio email y contraseña**.
2. Uno de los dos abre **En pareja → Generar código de invitación** y se lo pasa al otro por un canal privado.
3. La otra persona entra en **En pareja → Código de invitación** e introduce el código.
4. Para compartir: al crear o editar cualquier movimiento, activar **Compartir con mi pareja**.
5. Para dejar de compartir: editar el movimiento y desmarcarlo. También pueden **Desvincular** desde En pareja; esto vuelve privados automáticamente los compartidos de ambos.

## 4. Instalar en el celular

- **Android (Chrome):** abrir la URL HTTPS → menú de tres puntos → **Instalar app** o **Agregar a pantalla principal**.
- **iPhone (Safari):** abrir la URL HTTPS → botón Compartir → **Agregar a inicio**.

La instalación PWA no almacena una copia independiente de los datos: los registros se consultan desde Supabase. Para introducir o sincronizar nuevos movimientos se necesita conexión a internet.

## 5. Sobre seguridad y privacidad

- Las políticas SQL de RLS limitan lectura de movimientos a su dueño o a la pareja vinculada **solo si** `shared_with_partner = true`.
- Nadie puede editar ni borrar movimientos ajenos.
- La columna de dueño se comprueba también en cada escritura.
- Una cuenta no puede vincularse con más de una pareja a la vez.
- El acceso está protegido por correo, contraseña y las sesiones de Supabase; no hay cuentas predeterminadas ni contraseñas compartidas.
- **La privacidad respecto a terceros no equivale a cifrado de extremo a extremo.** El servicio Supabase aloja los datos y el titular del proyecto puede administrarlos desde su panel. Para finanzas muy sensibles, evaluar respaldos y controles adicionales.
- Antes de usar con datos reales, conviene probar desde **dos cuentas de prueba**: compartir un movimiento, comprobar que otro privado sea invisible, desconectar y volver a probar.

## 6. Actualizaciones y mantenimiento

- Si cambiás `config.js` en el repositorio, la app publicada tomará la configuración nueva al actualizar estando online.
- Si algo falla, abrir DevTools → Console / Network, comprobar `config.js`, la ejecución del SQL y los redirect URLs.
- La app usa `@supabase/supabase-js` v2 por CDN. Se recomienda revisar periódicamente sus actualizaciones.
- El código es un **proyecto listo para configurar y desplegar**, pero no está conectado a una cuenta ni publicado hasta que realices los pasos de Supabase y GitHub.

## Estructura

```
saldo_pareja/
  index.html
  styles.css
  app.js
  config.js                 ← completar con URL y clave pública
  supabase.sql              ← ejecutar en Supabase SQL Editor
  manifest.webmanifest
  sw.js
  icons/
    icon-192.png
    icon-512.png
```
