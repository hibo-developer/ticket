# Tickets Cotepa

PWA empresarial modular para gestionar tickets/recibos y gastos con adjuntos, permisos granulares, auditoría y descargas seguras mediante Supabase.

## Requisitos
- Node.js (recomendado 20+)
- Proyecto Supabase (URL + ANON KEY + SERVICE ROLE KEY para Edge Functions)

## Configuración
1. Copia variables de entorno:
   - Duplica `.env.example` a `.env.local`
   - Rellena:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
2. Crea el esquema en Supabase:
   - Ejecuta el SQL de [20260731_000001_init.sql](file:///c:/Oddo/supabase/migrations/20260731_000001_init.sql) en el SQL editor de Supabase.
3. Crea el bucket y políticas:
   - Está incluido en la migración (bucket privado `tickets-cotepa` + políticas sobre `storage.objects`).
4. Despliega las Edge Functions:
   - [storage-sign-download](file:///c:/Oddo/supabase/functions/storage-sign-download/index.ts)
   - [auth-create-user](file:///c:/Oddo/supabase/functions/auth-create-user/index.ts)
   - Variables requeridas en Supabase Functions:
     - `SUPABASE_URL`
     - `SUPABASE_ANON_KEY`
     - `SERVICE_ROLE_KEY`

## Arranque
```bash
npm install
npm run dev
```

## Primer uso (setup)
1. Entra en `/login` y usa la opción “Crear cuenta”.
2. Introduce un correo válido y una contraseña fuerte.
3. Si Supabase Auth no puede enviar el enlace mágico, la app intentará crear el usuario automáticamente mediante la Edge Function `auth-create-user` y después entrar con la contraseña.
4. Tras entrar, la app te redirige a `/setup` para crear la organización inicial y asignarte como administrador.
5. En `/admin`:
   - Activa/desactiva módulos.
   - Crea roles y asigna permisos a cada rol.

### Configuración necesaria en Supabase Auth
Para que el primer usuario pueda registrarse correctamente, revisa estas opciones en el panel de Supabase:
- Auth > Settings > Email auth: activa el flujo de email y confirma que el proveedor de correo esté configurado.
- Auth > Settings > URL Configuration: define `http://localhost:5173` como redirect URL de desarrollo y añade también la URL real del despliegue si aplica.
- Auth > Settings > User signups: asegúrate de que el registro de usuarios esté permitido.
- Si ves errores 400/429 al enviar el enlace mágico, la app intentará usar la Edge Function `auth-create-user`; si esa ruta falla, revisa el panel y el log de la función.

## Tests
```bash
npm run test:run
npm run test:coverage
npm run check
```

## E2E (Playwright)
1. Arranca el servidor:
   ```bash
   npm run dev
   ```
2. En otra terminal:
   ```bash
   npx playwright install
   npm run e2e
   ```

## Estructura modular
- Núcleo: `src/core/*`
- Módulos: `src/modules/<moduleId>/*`
  - Cada módulo exporta `manifest.ts` con rutas y navegación.
  - La tabla `module_toggles` controla qué módulos están habilitados por organización.
