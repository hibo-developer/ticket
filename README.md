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
4. Despliega la Edge Function:
   - Carpeta: [storage-sign-download](file:///c:/Oddo/supabase/functions/storage-sign-download/index.ts)
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
1. Entra en `/login` y crea cuenta.
2. Accede a `/setup` para crear la organización inicial y asignarte como admin.
3. En `/admin`:
   - Activa/desactiva módulos.
   - Crea roles y asigna permisos a cada rol.

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
