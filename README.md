# Calendario de Camiones — RVC

Coordinación de recepciones y despachos de camiones por obra. React + Vite, datos y login en Supabase, sitio en GitHub Pages.

## Seguridad

- **Sin sesión no se ve nada**: la app muestra solo el login y la base rechaza cualquier consulta anónima (RLS).
- **Roles** (tabla `perfiles`): `lector` solo ve · `editor` crea/edita/elimina obras y camiones · `admin` además gestiona usuarios.
- Los permisos los impone **la base de datos** (políticas RLS), no la app: aunque alguien llame la API directamente, un lector no puede escribir.
- **Registro público desactivado**: solo un admin crea usuarios, vía la Edge Function `admin-usuarios` (la única que usa la service role key, que nunca llega al navegador).
- Claves cifradas por Supabase Auth, mínimo 8 caracteres, límite de intentos de login, sesiones con expiración.
- Los usuarios entran con "usuario + clave"; internamente cada uno es `<usuario>@calendario-rvc.invalid` (dominio reservado que nadie puede registrar, así nadie puede recibir correos de recuperación).
- Auditoría: cada camión guarda quién lo creó y quién lo modificó por última vez.

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

## Desarrollo

```
npm install
npm run dev
```

## Publicar en GitHub Pages

`npm run build` y publicar `dist/` (base relativa, funciona en cualquier ruta).
