# Webapp

## Alcance

`apps/webapp` es la aplicación Next.js para usuarios finales registrados dentro
de un tenant.

La base implementada incluye:

- login por tenant slug, email y password;
- sesión mediante cookies HttpOnly emitidas por la API;
- layout protegido exclusivo para `tenant_user`;
- dashboard tenant-aware;
- creación de runs del agente mediante HTTP;
- Route Handlers BFF explícitos para auth, agente, uploads y artifacts;
- componentes shadcn compartidos desde `@stock42/ui`;
- tests Bun y Playwright Chromium desktop/mobile.

No es el backoffice. Administradores y operadores no pueden entrar al layout
protegido de esta app.

## Ejecución

```bash
cd apps/webapp
bun run dev
bun run build
bun run start
```

El puerto por defecto es `3820`. Puede cambiarse con `WEBAPP_PORT`.

Configuración:

| Variable           | Default                 | Uso                                  |
| ------------------ | ----------------------- | ------------------------------------ |
| `WEBAPP_PORT`      | `3820`                  | Puerto de `next dev` y `next start`. |
| `API_INTERNAL_URL` | `http://127.0.0.1:3822` | URL server-only de la API.           |

La referencia vive en `apps/webapp/.env.example`. Se puede generar el `.env`
con `bun run update:env` desde la raíz. No crear `.env.local`.

Sólo Webapp y Backoffice se compilan. `build-all.sh` mantiene la allowlist
explícita y `run-all.sh --build` exige `.next/BUILD_ID` antes de iniciar.

## Arquitectura

```text
Browser
  → Next.js Webapp
    → app/api/**/route.ts
      → API_INTERNAL_URL
        → apps/api
          → apps/agent, sólo cuando corresponde
```

El navegador nunca llama directamente a la API interna ni al agente. Los
Route Handlers:

- validan bodies con Zod;
- propagan sólo cookies, CSRF y correlation ID;
- fijan `redirect: manual`;
- usan `cache: no-store`;
- filtran headers de la respuesta mediante `@stock42/api-client`;
- devuelven un error JSON controlado ante una API no disponible.

No agregar un proxy catch-all. Cada operación debe tener su archivo
`app/api/<path>/route.ts`.

## Rutas de interfaz

| Path         | Acceso        | Función                                   |
| ------------ | ------------- | ----------------------------------------- |
| `/`          | Cualquiera    | Redirige a `/dashboard`.                  |
| `/login`     | Público       | Login de usuario con tenant slug.         |
| `/dashboard` | `tenant_user` | Shell del tenant y panel base del agente. |

`app/(protected)/layout.tsx` llama `requireUser` en el servidor. Si no hay
sesión o el actor no es `kind=user`, redirige a `/login`.

La protección de Next es una barrera de UX. La API vuelve a autenticar y
autorizar cada operación.

## Login y sesión

Flujo:

1. El formulario solicita `POST /api/auth/csrf`.
2. La API crea un contexto CSRF anónimo HttpOnly.
3. El formulario envía `actorKind=user`, `tenantSlug`, email y password.
4. La API valida que el tenant y el usuario estén activos.
5. La respuesta fija access y refresh cookies HttpOnly.
6. Next redirige a `/dashboard` y vuelve a leer `/auth/me`.

Logout obtiene un nuevo CSRF, llama `/api/auth/logout`, limpia las cookies y
redirige a `/login`.

`lib/session.ts` se usa sólo en Server Components y layouts. Serializa las
cookies de la request actual y consulta `/auth/me` mediante
`@stock42/api-client`.

## BFF

### Auth

| Método | Route Handler                 | Upstream                  |
| ------ | ----------------------------- | ------------------------- |
| `POST` | `/api/auth/csrf`              | `/auth/csrf`              |
| `POST` | `/api/auth/login`             | `/auth/login`             |
| `POST` | `/api/auth/logout`            | `/auth/logout`            |
| `GET`  | `/api/auth/me`                | `/auth/me`                |
| `POST` | `/api/auth/refresh`           | `/auth/refresh`           |
| `POST` | `/api/auth/ws-tickets/create` | `/auth/ws-tickets/create` |

### Agente

| Método | Route Handler                 | Función                |
| ------ | ----------------------------- | ---------------------- |
| `POST` | `/api/agent/runs/create`      | Encola un run.         |
| `GET`  | `/api/agent/runs/[id]`        | Lee estado del run.    |
| `GET`  | `/api/agent/runs/[id]/events` | Replay desde `cursor`. |
| `POST` | `/api/agent/runs/[id]/cancel` | Solicita cancelación.  |

El tenant no se envía desde la UI de usuarios. La API lo deriva de la sesión
`tenant_user`.

### Archivos

| Método | Route Handler                 | Función                  |
| ------ | ----------------------------- | ------------------------ |
| `POST` | `/api/uploads/intents/create` | Crea un intent validado. |
| `PUT`  | `/api/uploads/[id]/content`   | Reenvía bytes y CSRF.    |
| `GET`  | `/api/artifacts/[id]`         | Descarga un artifact.    |

Uploads y artifacts usan handlers dedicados porque transportan bytes y headers
distintos de un JSON normal.

## Dashboard y agente

El dashboard muestra:

- identidad del usuario;
- indicador de tenant conectado;
- tarjetas base de actividad, aislamiento y sesión;
- formulario del asistente.

`AgentPanel` actualmente:

1. obtiene CSRF;
2. crea un run con manifest `assistant`;
3. genera una idempotency key;
4. muestra el UUID encolado.

La base BFF ya expone lectura, eventos y cancelación, y la API ofrece WebSocket.
La UI actual todavía no sigue el run, no renderiza respuesta, no resuelve
confirmations y no abre WebSocket. Esas capacidades no deben documentarse como
terminadas hasta implementar sus componentes.

## UI compartida

Todos los componentes shadcn viven en:

```text
packages/ui/src/components
```

La app importa por subpath:

```ts
import { Button } from "@stock42/ui/components/button";
```

No ejecutar shadcn dentro de `apps/webapp` ni copiar componentes a
`apps/webapp/components`. Ese directorio contiene composición específica del
producto, no primitives del design system.

El estilo base es `base-nova`, con Geist Sans/Mono y tokens compartidos. Cuando
se agrega o actualiza un primitive, se hace en `packages/ui` usando
prioritariamente el registry/MCP oficial y se valida todo el catálogo.

## Agregar funcionalidad

### Nueva página

1. Elegir una ruta explícita en App Router.
2. Colocarla dentro de `(protected)` si requiere usuario.
3. Obtener el actor en Server Components con `requireUser`.
4. Mantener la autorización real en la API.
5. Componer UI desde `@stock42/ui`.
6. Agregar estado cliente sólo cuando hay interacción real.

### Nueva operación API

1. Definir o reutilizar el contrato en `@stock42/contracts`.
2. Crear el endpoint público en `apps/api`.
3. Crear el Route Handler exacto en `apps/webapp/app/api`.
4. Validar el body con el schema Zod en el BFF.
5. Propagar CSRF para mutaciones.
6. Parsear la respuesta con el schema compartido.
7. Agregar test de contrato y Playwright si cambia un flujo visible.

Se permiten segmentos simples como `[id]`. Están prohibidos `[...slug]`,
`[[...slug]]` y `pages/api`.

## Seguridad

- `API_INTERNAL_URL` es server-only; no usar prefijo `NEXT_PUBLIC_`.
- No leer access/refresh tokens desde JavaScript del navegador.
- Toda mutación autenticada obtiene y envía `x-csrf-token`.
- No confiar en tenant, actor o rol enviados por un componente.
- No reenviar todos los headers del navegador.
- No llamar al runtime del agente directamente.
- No renderizar HTML de un upstream como si fuera JSON.
- No usar navegación oculta como sustituto de autorización.

## Tests

```bash
bun run --cwd apps/webapp test
bun run --cwd apps/webapp check-types
bun run --cwd apps/webapp lint
bun run --cwd apps/webapp test:e2e
```

Playwright usa:

- `WEBAPP_E2E_URL`, default `http://127.0.0.1:3820`;
- `E2E_ENABLED=true`;
- `E2E_TENANT_SLUG`;
- `E2E_USER_EMAIL`;
- `E2E_USER_PASSWORD`.

El E2E actual valida login y logout reales. Usa la base MongoDB configurada y
credenciales existentes; nunca crea o emula una base.

Para un nuevo flujo:

- probar Chromium desktop y mobile;
- cubrir estado autorizado y denegado;
- usar labels y roles accesibles;
- no hardcodear cookies ni tokens;
- conservar artifacts de Playwright sólo ante fallos.

## Nginx

`nginx/example.com` apunta a `127.0.0.1:3820` y es un virtual host autónomo que
puede copiarse a un servidor Nginx compartido.

Si cambia `WEBAPP_PORT`, dominio, body limit, timeout, path o headers, se debe
actualizar el archivo Nginx en la misma tarea.

## Checklist de cambio

- Contratos compartidos actualizados.
- Route Handler explícito.
- Autorización API verificada.
- CSRF en mutaciones.
- UI importada desde `@stock42/ui`.
- Unit tests y E2E proporcionales.
- `docs/WEBAPP.md`, `GUIDE.md` y `CHANGELOG.md` sincronizados.
- Nginx sincronizado cuando cambia la superficie pública.

## Documentos relacionados

- [API.md](./API.md): endpoints, auth, multi-tenancy y WebSocket.
- [AI-AGENTS.md](./AI-AGENTS.md): lifecycle del runtime.
- [BACKOFFICE.md](./BACKOFFICE.md): control de plataforma y tenants.
- [GUIDE.md](../GUIDE.md): guía integral del monorepo.
