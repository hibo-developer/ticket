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
     - `VITE_AUTH_REDIRECT_URL` (en local: `http://localhost:5173`; en producción: `https://ticket-cotepa.netlify.app`)
2. Crea el esquema en Supabase:
   - Ejecuta el SQL de [20260731_000001_init.sql](file:///c:/Oddo/supabase/migrations/20260731_000001_init.sql) en el SQL editor de Supabase.
3. Crea el bucket y políticas:
   - Está incluido en la migración (bucket privado `tickets-cotepa` + políticas sobre `storage.objects`).
4. Despliega las Edge Functions:
   - [storage-sign-download](file:///c:/Oddo/supabase/functions/storage-sign-download/index.ts)
  - [admin-create-user](file:///c:/Oddo/supabase/functions/admin-create-user/index.ts)
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
3. La creación de usuarios en producción se recomienda hacerla por invitación o desde Admin → Usuarios (admins), evitando el auto-registro sin control.
4. Tras entrar, la app te redirige a `/setup` para crear la organización inicial y asignarte como administrador.
5. En `/admin`:
   - Activa/desactiva módulos.
   - Crea roles y asigna permisos a cada rol.

## Captura de tickets + OCR (móvil)
En el detalle de un ticket (`/tickets/:id`) se pueden adjuntar imágenes del ticket desde la cámara y autocompletar datos mediante OCR:
- Botón “Capturar foto” (móvil): abre la cámara del dispositivo (cuando el navegador lo soporta).
- OCR en cliente (Tesseract): extrae y propone `fecha`, `importe total` y `establecimiento`.
- Los datos se rellenan en el formulario de “Datos” y el usuario puede corregirlos antes de guardar.

Notas:
- La precisión del OCR depende del ticket (contraste, arrugas, iluminación, idioma).
- La primera ejecución puede descargar datos de idioma del OCR.

## Descarga/compartir imágenes (alta resolución)
En la lista de tickets (`/tickets`) se puede:
- Seleccionar uno o varios tickets.
- Descargar un ZIP con las imágenes originales (sin recomprimir).
- Compartir desde móvil (Web Share) si el navegador lo soporta; si se seleccionan varias imágenes, se comparte un ZIP.

### Configuración necesaria en Supabase Auth
Para que el primer usuario pueda registrarse correctamente, revisa estas opciones en el panel de Supabase:
- Auth > Settings > Email auth: activa el flujo de email y confirma que el proveedor de correo esté configurado.
- Auth > Settings > URL Configuration: define `Site URL` como `https://ticket-cotepa.netlify.app` en producción.
- Auth > Settings > URL Configuration: añade `http://localhost:5173` para desarrollo y `https://ticket-cotepa.netlify.app` a la lista de `Redirect URLs`.
- Auth > Settings > User signups: asegúrate de que el registro de usuarios esté permitido.
- Si ves errores 400/429 al enviar el enlace mágico, revisa el proveedor de email de Supabase, URLs de redirección y rate limits. Para acceso por invitación, usa Admin → Usuarios.

### Redirecciones por entorno
- En desarrollo, la app usa `http://localhost:5173` para los enlaces mágicos y callbacks de auth.
- En producción, Netlify fija `VITE_AUTH_REDIRECT_URL=https://ticket-cotepa.netlify.app` desde [netlify.toml](file:///c:/ticket-1/netlify.toml), evitando que un fallback local termine embebido en el build.
- Si no existe variable configurada, el cliente usa `window.location.origin`; solo cae en `localhost` cuando el entorno es de desarrollo.

## Seguridad (imágenes y datos)
- Storage: bucket privado `tickets-cotepa` con políticas por organización (prefijo `org_<org_id>`).
- Acceso a descargas: se usan signed URLs temporales vía Edge Function (`storage-sign-download`) y auditoría.
- Transporte: HTTPS (Netlify/Supabase) + tokens de Supabase en cabeceras.
- Cifrado en reposo: Supabase cifra el almacenamiento en reposo a nivel de infraestructura; evita almacenar datos sensibles en metadatos/URLs.
- OCR: se ejecuta en el cliente (no envía imágenes a terceros).

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
