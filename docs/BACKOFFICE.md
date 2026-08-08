# Backoffice

## Alcance

`apps/backoffice` es la aplicación Next.js de control multi-tenant.

La base implementada permite:

- login de administradores de plataforma y operadores;
- navegación y páginas según rol;
- alta y listado de tenants;
- creación del owner junto con el tenant;
- listado y alta de operadores y usuarios;
- interfaz HTTP del agente durable;
- cancelación y replay de eventos del run;
- aprobación o rechazo de operaciones críticas;
- CRUD de IDs autorizados en Telegram AI;
- Route Handlers BFF explícitos;
- UI compartida desde `@stock42/ui`;
- tests Bun y Playwright.

Los usuarios finales `tenant_user` no pueden entrar al Backoffice.

## Ejecución

```bash
cd apps/backoffice
bun run dev
bun run build
bun run start
```

Configuración:

| Variable           | Default                 | Uso                                  |
| ------------------ | ----------------------- | ------------------------------------ |
| `BACKOFFICE_PORT`  | `3821`                  | Puerto de `next dev` y `next start`. |
| `API_INTERNAL_URL` | `http://127.0.0.1:3822` | URL server-only de la API.           |

La referencia está en `apps/backoffice/.env.example`. Desde la raíz se usa
`bun run update:env`. No crear `.env.local`.

Sólo Webapp y Backoffice se compilan. `build-all.sh` y `run-all.sh --build`
mantienen esa regla.

## Roles

| Rol               | Tenant efectivo     | Capacidades base                                               |
| ----------------- | ------------------- | -------------------------------------------------------------- |
| `platform_admin`  | Seleccionado por UI | Tenants, personas, agente y Telegram AI para cualquier tenant. |
| `tenant_owner`    | Tenant de la sesión | Personas, agente y Telegram AI del tenant propio.              |
| `tenant_operator` | Tenant de la sesión | Lectura de personas y agente del tenant propio.                |
| `tenant_user`     | No aplica           | Acceso denegado al Backoffice.                                 |

La API es la autoridad. `ControlShell` oculta navegación según rol, pero cada
endpoint vuelve a validar actor y tenant.

`tenant_operator` no es un manager: la API rechaza altas de operadores,
usuarios y accesos Telegram. El componente base de personas se comparte entre
owner y operator y actualmente puede renderizar formularios de alta al
operator; esas escrituras fallan server-side. No relajar la API para resolver
una diferencia de UX.

## Rutas de interfaz

| Path               | Rol                                | Función                           |
| ------------------ | ---------------------------------- | --------------------------------- |
| `/`                | Cualquiera                         | Redirige a `/dashboard`.          |
| `/login`           | Público                            | Login de plataforma o tenant.     |
| `/dashboard`       | Administrador u operador           | Resumen del control plane.        |
| `/tenants`         | `platform_admin`                   | Directorio y alta de tenants.     |
| `/tenants/[id]`    | `platform_admin`                   | Operadores y usuarios del tenant. |
| `/people`          | `tenant_owner` o `tenant_operator` | Personas del tenant de la sesión. |
| `/agent`           | Administrador u operador           | Agente durable en tiempo real.    |
| `/telegram-ai`     | `platform_admin` o `tenant_owner`  | CRUD de IDs Telegram autorizados. |
| `/email-marketing` | `platform_admin` o `tenant_owner`  | Grupos, campañas y spooler.       |

`app/(protected)/layout.tsx` exige un actor cuyo `kind` no sea `user`.

## Login y sesión

El formulario permite dos modos:

- Plataforma: `actorKind=administrator`, email y password.
- Tenant: `actorKind=operator`, tenant slug, email y password.

En modo Plataforma se usan las credenciales
`DEFAULT_ADMIN_EMAIL`/`DEFAULT_ADMIN_PASSWORD` configuradas en `apps/api`. El
boot de la API crea esa identidad cuando el email todavía no existe. Si ya
existe, no reemplaza su password ni la reactiva. Las variables permanecen en el
runtime de la API: el Backoffice sólo envía los valores escritos por el usuario
y no los expone ni los precarga.

Flujo:

1. solicita CSRF anónimo;
2. envía las credenciales al BFF;
3. la API valida identidad y estado;
4. recibe access/refresh cookies HttpOnly;
5. redirige a `/dashboard`;
6. el layout vuelve a resolver `/auth/me` server-side.

Logout obtiene CSRF, limpia las cookies en la API y vuelve a `/login`.

`API_INTERNAL_URL` nunca se expone al navegador.

## Shell de control

`ControlShell`:

- muestra identidad y rol;
- presenta navegación role-aware;
- separa administración global de operación de tenant;
- conserva el contenido dentro del layout autenticado;
- usa primitives de `@stock42/ui`.

La etiqueta visual “API disponible” es parte del shell base; no reemplaza una
consulta runtime de health. No usarla como evidencia operativa.

## Gestión de tenants

### Administrador de plataforma

`TenantManager`:

- lista tenants con paginación acotada;
- crea nombre, slug y owner inicial;
- navega al detalle por UUID;
- muestra estado activo/inactivo.

La API:

- exige `platform_admin`;
- valida el contrato Zod;
- hashea el password del owner con `Bun.password`;
- evita colisiones de slug;
- crea primero el owner y compensa esa creación si falla el tenant;
- registra auditoría.

La operación no usa una transacción MongoDB multi-documento; no describirla
como transacción atómica.

Los Route Handlers para actualizar estado y crear otro administrador existen,
pero no tienen todavía una pantalla visible en la base actual.

### Personas del tenant

`TenantPeople` carga en paralelo:

- `/operators`;
- `/users`.

Un owner o platform admin puede crear operadores y usuarios con nombre, email y
password inicial. Los listados están siempre acotados y tenant-scoped.

El owner inicial tiene `role=owner`; los operadores adicionales tienen
`role=operator`. Los usuarios finales se autentican después en `apps/webapp`.

## Agente AI

`BackofficeAgentPanel` es la interfaz en tiempo real del runtime durable.

Para un `platform_admin`:

- carga hasta 100 tenants;
- exige seleccionar un tenant antes de crear un run.

Para un owner u operator:

- fija el tenant desde la sesión;
- no permite seleccionar otro.

Flujo de ejecución:

1. obtiene CSRF;
2. crea un run con manifest `assistant`;
3. genera una idempotency key;
4. conserva el `conversationId` para mensajes siguientes;
5. obtiene un ticket de un uso y abre el WebSocket público con el subprotocolo
   versionado;
6. se suscribe al run desde el cursor durable y actualiza estado y eventos;
7. usa replay HTTP cada 3 segundos sólo mientras el canal se reconecta;
8. muestra respuesta, estado e intento;
9. permite cancelar;
10. detecta `confirmation.required` y muestra tool, destino, tenant y preview
    server-owned cuando están disponibles;
11. permite aprobar o rechazar sin permitir editar los argumentos;
12. cierra el cliente al llegar a un estado terminal.

Estados terminales:

- `succeeded`;
- `failed`;
- `cancelled`;
- `timed_out`;
- `killed`;
- `crashed`.

El cliente compartido renueva el ticket en cada reconexión, aplica backoff con
jitter, reanuda el canal, deduplica y ordena eventos. Un `platform_admin` envía
el tenant seleccionado al suscribirse; el servidor vuelve a autorizar ese run
antes de derivar el topic nativo.

La autorización final no depende del panel: `tenant_operator` sólo opera runs y
confirmations propios; `tenant_owner` puede administrar recursos del tenant y
`platform_admin` del tenant seleccionado. Una denegación server-side se presenta
como recurso no encontrado.

## Telegram AI

La pantalla `/telegram-ai` administra la allowlist que consume
`apps/agent`.

Un registro guarda:

- `telegramUserId` numérico;
- label;
- tenant;
- actor que autorizó el acceso;
- rol del actor;
- estado;
- timestamps;
- versión.

Capacidades:

- listar por tenant;
- crear un ID;
- editar label;
- activar o desactivar;
- eliminar con confirmación;
- seleccionar tenant para `platform_admin`;
- fijar el tenant para `tenant_owner`.

Update y delete envían `expectedVersion`. Si otro actor modificó el registro, la
API responde conflicto y obliga a recargar.

Un `telegramUserId` sólo puede existir una vez globalmente. El runtime vuelve a
validar en cada mensaje que:

- el acceso siga activo;
- el tenant siga activo;
- el administrador u operador ligado siga activo;
- tenant, actor y rol coincidan.

El CRUD no habilita por sí solo el polling. También se necesitan
`TELEGRAM_POLLING_ENABLED=true` y `TELEGRAM_BOT_TOKEN`.

## Email marketing

La pantalla `/email-marketing` reúne cuatro superficies:

- campañas: selección de grupo y plantilla, programación, resumen por estado y
  detención;
- grupos: alta manual, activación, miembros reales del tenant, altas
  idempotentes y bajas auditadas;
- plantillas: alta y edición de nombre, asunto, HTML y estado;
- spooler: salud tenant-scoped, destinatario, snapshot del contenido, estado,
  intentos, error acotado, envío inmediato y detención.

Un `platform_admin` selecciona tenant; un `tenant_owner` queda fijado al tenant
de su sesión. La página redirige a otros roles y la API aplica nuevamente
`requireTenantManager`. Todas las mutaciones usan CSRF. El navegador nunca
recibe host, usuario o password SMTP, y tampoco puede elegir libremente el
remitente: `MAIL_FROM` pertenece al runtime de la API.

## BFF

El helper `lib/api-proxy.ts`:

- valida bodies con schemas compartidos;
- reenvía sólo cookie, CSRF y correlation ID;
- fija JSON y `no-store`;
- evita redirects automáticos;
- filtra headers hop-by-hop;
- devuelve `502` JSON si la API no está disponible.

### Auth

| Método | Route Handler                 | Upstream                  |
| ------ | ----------------------------- | ------------------------- |
| `POST` | `/api/auth/csrf`              | `/auth/csrf`              |
| `POST` | `/api/auth/login`             | `/auth/login`             |
| `POST` | `/api/auth/logout`            | `/auth/logout`            |
| `GET`  | `/api/auth/me`                | `/auth/me`                |
| `POST` | `/api/auth/refresh`           | `/auth/refresh`           |
| `POST` | `/api/auth/ws-tickets/create` | `/auth/ws-tickets/create` |

### Plataforma y personas

| Método  | Route Handler                        |
| ------- | ------------------------------------ |
| `POST`  | `/api/administrators/create`         |
| `GET`   | `/api/tenants`                       |
| `POST`  | `/api/tenants/create`                |
| `GET`   | `/api/tenants/[id]`                  |
| `PATCH` | `/api/tenants/[id]/update`           |
| `GET`   | `/api/tenants/[id]/operators`        |
| `POST`  | `/api/tenants/[id]/operators/create` |
| `GET`   | `/api/tenants/[id]/users`            |
| `POST`  | `/api/tenants/[id]/users/create`     |

### Agente

| Método | Route Handler                           |
| ------ | --------------------------------------- |
| `POST` | `/api/agent/runs/create`                |
| `GET`  | `/api/agent/runs/[id]`                  |
| `GET`  | `/api/agent/runs/[id]/events`           |
| `POST` | `/api/agent/runs/[id]/cancel`           |
| `POST` | `/api/agent/confirmations/[id]/approve` |
| `POST` | `/api/agent/confirmations/[id]/reject`  |

### Telegram AI

| Método   | Route Handler                         |
| -------- | ------------------------------------- |
| `GET`    | `/api/telegram-ai/access`             |
| `POST`   | `/api/telegram-ai/access/create`      |
| `PATCH`  | `/api/telegram-ai/access/[id]/update` |
| `DELETE` | `/api/telegram-ai/access/[id]`        |

### Email marketing

| Método   | Route Handler                                       |
| -------- | --------------------------------------------------- |
| `GET`    | `/api/email-marketing/groups`                       |
| `POST`   | `/api/email-marketing/groups/create`                |
| `PATCH`  | `/api/email-marketing/groups/[id]/update`           |
| `GET`    | `/api/email-marketing/groups/[id]/members`          |
| `POST`   | `/api/email-marketing/groups/[id]/members/add`      |
| `DELETE` | `/api/email-marketing/groups/[id]/members/[userId]` |
| `GET`    | `/api/email-marketing/templates`                    |
| `POST`   | `/api/email-marketing/templates/create`             |
| `PATCH`  | `/api/email-marketing/templates/[id]/update`        |
| `GET`    | `/api/email-marketing/campaigns`                    |
| `POST`   | `/api/email-marketing/campaigns/create`             |
| `POST`   | `/api/email-marketing/campaigns/[id]/stop`          |
| `GET`    | `/api/email-marketing/spooler`                      |
| `GET`    | `/api/email-marketing/spooler/health`               |
| `POST`   | `/api/email-marketing/spooler/[id]/send-now`        |
| `POST`   | `/api/email-marketing/spooler/[id]/stop`            |

No usar catch-all. Cada path debe permanecer explícito.

## UI compartida

Los primitives shadcn `base-nova` viven exclusivamente en:

```text
packages/ui/src/components
```

`apps/backoffice/components` contiene componentes de negocio y composición,
como `TenantManager`, `TenantPeople`, `BackofficeAgentPanel` y
`TelegramAiManager`.

No instalar ni copiar primitives shadcn dentro de la app.

## Agregar un módulo del Backoffice

1. Definir permisos por rol y tenant.
2. Implementar primero el contrato y autorización en la API.
3. Crear Route Handlers explícitos.
4. Agregar una página dentro de `(protected)`.
5. Verificar el rol server-side antes de renderizar.
6. Mantener la autorización equivalente en la API.
7. Obtener CSRF para cada mutación.
8. Parsear request y response con contratos Zod compartidos.
9. Agregar navegación sólo a los roles autorizados.
10. Agregar tests de contrato, RBAC y Playwright.
11. Actualizar este documento y `CHANGELOG.md`.

No esconder solamente un link: probar también la llamada directa al endpoint.

## Tests

```bash
bun run --cwd apps/backoffice test
bun run --cwd apps/backoffice check-types
bun run --cwd apps/backoffice lint
bun run --cwd apps/backoffice test:e2e
```

Playwright usa:

- `BACKOFFICE_E2E_URL`, default `http://127.0.0.1:3821`;
- `E2E_ENABLED=true`;
- `E2E_ADMIN_EMAIL`;
- `E2E_ADMIN_PASSWORD`.

El E2E actual valida:

- login de administrador;
- acceso al directorio de tenants;
- acceso al Agente AI;
- acceso a Telegram AI.

Los tests usan la base MongoDB configurada y credenciales existentes. Nunca
crean una base nueva ni emulan MongoDB.

Un cambio role-aware debe cubrir:

- navegación visible/oculta;
- redirect de la página;
- API autorizada/denegada;
- intento de cruzar tenant;
- CSRF de mutaciones.

## Nginx

`nginx/backoffice.example.com` apunta a `127.0.0.1:3821`. Es un virtual host
autónomo para copiar en un Nginx donde conviven otros proyectos.

Si cambia `BACKOFFICE_PORT`, dominio, body limit, timeout, path o headers,
actualizar ese archivo en la misma tarea.

## Checklist de cambio

- Política de roles definida.
- UI y API aplican la misma política.
- Tenant derivado de sesión o selección autorizada.
- Route Handlers explícitos y contratos Zod.
- CSRF en mutaciones.
- Components shadcn importados desde `@stock42/ui`.
- Unit tests y E2E proporcionales.
- `docs/BACKOFFICE.md`, `GUIDE.md` y `CHANGELOG.md` sincronizados.
- Nginx sincronizado si cambia la superficie pública.

## Documentos relacionados

- [API.md](./API.md): endpoints y autorización server-side.
- [AI-AGENTS.md](./AI-AGENTS.md): runtime durable y Telegram.
- [WEBAPP.md](./WEBAPP.md): portal de usuarios.
- [GUIDE.md](../GUIDE.md): guía integral del monorepo.
