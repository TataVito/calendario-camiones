# Calendario de Camiones — RVC

Coordinación de recepciones y despachos de camiones por obra. React + Vite, datos y login en Supabase, sitio en GitHub Pages.

## Seguridad

- **Sin sesión no se ve nada**: la app muestra solo el login y la base rechaza cualquier consulta anónima (RLS).
- **Roles** (tabla `perfiles`): `lector` solo ve · `porteria` registra llegada / inicio / salida (con hora real) y sube fotos de guías · `editor` crea/edita/elimina camiones · `admin` (de obra) en sus obras edita la obra, se salta las reglas, ve el historial y gestiona lectores/portería/editores · `superusuario` ve y hace todo, y es el único que crea/elimina obras y crea admins.
- **Permisos por obra** (`obra_usuarios`): cada usuario (admin incluido) ve solo las obras asignadas; el súper usuario ve todas.
- **Reglas**: solo admin y súper usuario agendan en fechas pasadas y modifica/elimina camiones completados. Las horas reales solo las fija la función `marcar_porteria`.
- **Fotos de guías**: bucket privado `guias` (solo imágenes, máx. 5 MB, ruta `<obra>/<camión>/<archivo>`), visibles solo con acceso a la obra mediante enlaces firmados de 1 hora.
- Los permisos los impone **la base de datos** (políticas RLS), no la app: aunque alguien llame la API directamente, un lector no puede escribir.
- **Registro público desactivado**: solo un admin crea usuarios, vía la Edge Function `admin-usuarios` (la única que usa la service role key, que nunca llega al navegador).
- Claves cifradas por Supabase Auth, mínimo 8 caracteres, límite de intentos de login, sesiones con expiración.
- Los usuarios entran con "usuario + clave"; internamente cada uno es `<usuario>@calendario-rvc.invalid` (dominio reservado que nadie puede registrar, así nadie puede recibir correos de recuperación).
- Auditoría: cada camión guarda quién lo creó y quién lo modificó por última vez.
- **Choques de horario** revisados por la base (con bloqueo por obra y día, así dos personas que agendan a la vez no quedan ambas): solo se agenda encima marcando "Agendar igual", que queda registrado.
- **Página publicada con CSP**: solo ejecuta código propio y solo se conecta con Supabase. Tailwind y las tipografías van dentro de la app (sin CDN).
- **Cierre de sesión por inactividad** (2 horas, también si se cierra y reabre el navegador); al salir se borran las copias locales de datos.

## Puesta en marcha (una sola vez)

1. **Crear proyecto** en https://supabase.com (región São Paulo).
2. **SQL Editor** → pegar y ejecutar `supabase/migrations/20261007000000_esquema_inicial.sql`.
3. **Authentication → Sign In / Providers**:
   - Desactivar **Allow new users to sign up**.
   - En Email: desactivar **Confirm email**; largo mínimo de clave: 8.
4. **Edge Function** `admin-usuarios`: Edge Functions → Deploy a new function → Via Editor, nombre `admin-usuarios`, pegar `supabase/functions/admin-usuarios/index.ts`.
   Opcional: en Edge Functions → Secrets, `ORIGENES_PERMITIDOS=https://<usuario>.github.io` (restringe CORS).
5. **Primer admin**: Authentication → Users → Add user → email `<usuario>@calendario-rvc.invalid`, clave, marcar *Auto Confirm User*. Luego en SQL Editor:
   ```sql
   update public.perfiles set rol = 'admin' where usuario = '<usuario>';
   ```
6. **Configurar la app**: copiar `.env.example` a `.env.local` con la URL y la anon key (Project Settings → API).

## Mantenimiento automático (GitHub Actions)

- **Mantener activo** (`mantener-activo.yml`): lunes y jueves llama a la función `ping` para que el plan gratis de Supabase no pause el proyecto.
- **Respaldo semanal** (`respaldo.yml`): cada domingo vuelca la base (esquema `public` + usuarios de Auth), la cifra con AES-256 y la guarda 90 días como artefacto. Necesita dos secretos del repositorio:
  - `SUPABASE_DB_URL`: Supabase → Connect → **Session pooler** (URI con la clave de la base).
  - `RESPALDO_CLAVE`: una frase larga que solo conozca el admin. **Sin ella el respaldo no se puede abrir.**
  - Restaurar: `gpg -d respaldo-AAAA-MM-DD.sql.gpg > respaldo.sql` y luego `psql "<url>" -f respaldo.sql`.
  - `SUPABASE_SECRET_KEY` (opcional): llave secreta de Supabase; con ella el respaldo incluye también las **fotos de guías** (`fotos-AAAA-MM-DD.tar.gz.gpg`).
- **Respaldo manual**: Administración → Respaldo descarga un Excel con todas las tablas.
- GitHub desactiva las tareas programadas de un repositorio público tras 60 días sin commits; si llega el aviso por correo, reactivarlas en la pestaña Actions.

## Celular y sin señal

- Se puede **instalar** (Chrome: menú ⋮ → Instalar app / Agregar a pantalla principal).
- Sin señal abre la última versión y los últimos datos cargados. Las marcas de portería se guardan en el equipo con la **hora en que se pulsó** y se envían solas al volver la conexión (la base acepta hasta 12 horas atrás). Las fotos necesitan conexión.

## Desarrollo

```
npm install
npm run dev
```

## Publicar en GitHub Pages

`npm run build` y publicar `dist/` (base relativa, funciona en cualquier ruta).
