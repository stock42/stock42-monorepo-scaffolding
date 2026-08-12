# API

## Alcance

`apps/api` es la única API pública del monorepo. Usa Bun, la versión publicada
de `s42-core`, MongoDB y contratos Zod compartidos desde
`@stock42/contracts`.

Sus responsabilidades son:

- exponer HTTP y WebSocket en un único listener;
- autenticar administradores, operadores y usuarios;
- aplicar autorización multi-tenant;
- administrar tenants, owners, operadores, usuarios y accesos de Telegram AI;
- ejecutar el boot, migraciones e índices;
- actuar como frontera pública del runtime privado de agentes;
- validar y reenviar uploads y artifacts;
- normalizar CORS, rate limits y errores.

La lógica agéntica no vive en la API. El módulo `agent` valida la sesión y el
tenant, y luego invoca `apps/agent` mediante HTTP interno firmado.

## Ejecución

Desde la raíz:

```bash
./run-dev-all.sh
./run-all.sh --build
```

Para ejecutar sólo la API:

```bash
cd apps/api
bun run dev
bun run start
```

El puerto por defecto es `3822` y puede cambiarse con `API_PORT`. El host se
configura con `API_HOST`. El script `build` es deliberadamente un no-op: la API
ejecuta TypeScript con Bun y nunca genera `dist`.

La configuración de referencia está en `apps/api/.env.example`. Para crear o
actualizar los `.env` administrados por el proyecto se usa:

```bash
bun run update:env
```

No crear `.env.local`.

## Inicio y cierre

`src/index.ts` ejecuta esta secuencia:

1. Valida la configuración con Zod.
2. Ejecuta `runBoot`.
3. Descubre los módulos de `src/modules` mediante `s42-core`.
4. Registra los controllers y hooks HTTP.
5. Registra `/ws` con `WebSocketController` y `WebSocketControllers` de
   `s42-core`.
6. Crea un único `Bun.serve` y le entrega el dispatcher WebSocket nativo.
7. Conecta el publisher nativo al bridge de eventos e inicia la revalidación
   periódica de conexiones.
8. Atiende `SIGINT` y `SIGTERM`, detiene timers y sockets, contempla el contador
   WebSocket obsoleto de Bun 1.3.14, cierra MongoDB y limpia dependencias.

El listener tiene:

- `idleTimeout` de 30 segundos;
- body máximo de 12 MiB;
- CORS y rate limit antes del despacho;
- IP normalizada desde el peer y proxies explícitamente confiables;
- gateway binario explícito para uploads y artifacts;
- upgrade y lifecycle WebSocket administrados por `s42-core`;
- errores sanitizados con `errorId`;
- `Cache-Control: no-store` y `X-Content-Type-Options: nosniff`.

## Boot

`src/boot/index.ts` ejecuta pasos secuenciales, observables y fail-fast:

1. conexión MongoDB;
2. `ping`;
3. registro del `MongoClient` como dependencia `db` en `Dependencies`;
4. creación y registro del `AppContext`;
5. garantía centralizada de índices desde `src/boot/indexes.ts`;
6. migraciones idempotentes;
7. bootstrap idempotente del administrador sólo bajo opt-in;
8. seeds de test, sólo si están habilitados explícitamente;
9. cambio de readiness a `true`.

Cada paso informa nombre y duración. Un fallo detiene el arranque.

Las migraciones se registran en la colección `migrations`. Una migración nueva
debe tener un identificador único, ser idempotente y no crear bases de datos.

`API_TEST_SEEDS=true` sólo es válido junto con `API_TEST_ENABLED=true` y un
`TEST_TENANT_ID` existente. Los seeds nunca crean identidades de negocio ni
bases de test implícitas.

## Configuración

| Variable                          | Default          | Uso                                                    |
| --------------------------------- | ---------------- | ------------------------------------------------------ |
| `NODE_ENV`                        | `development`    | Entorno runtime.                                       |
| `API_HOST`                        | `127.0.0.1`      | Interfaz del listener.                                 |
| `API_PORT`                        | `3822`           | Puerto HTTP y WebSocket.                               |
| `MONGODB_URI`                     | requerido        | URI de una base MongoDB existente.                     |
| `MONGODB_DB`                      | requerido        | Nombre exacto de la base existente.                    |
| `DEFAULT_ADMIN_BOOTSTRAP_ENABLED` | `false`          | Opt-in para crear el administrador inicial.            |
| `DEFAULT_ADMIN_EMAIL`             | vacío            | Requerido sólo cuando el bootstrap está activo.        |
| `DEFAULT_ADMIN_PASSWORD`          | vacío            | Requerido con bootstrap; entre 12 y 256 caracteres.    |
| `AUTH_ACCESS_SECRET`              | requerido        | Firma HMAC del access token; mínimo 32 caracteres.     |
| `AUTH_REFRESH_SECRET`             | requerido        | Firma HMAC del refresh token; mínimo 32 caracteres.    |
| `CSRF_SECRET`                     | requerido        | Firma y binding de CSRF; mínimo 32 caracteres.         |
| `WEBSOCKET_TICKET_SECRET`         | requerido        | Firma de tickets WebSocket de un solo uso.             |
| `WEBSOCKET_PUBLIC_URL`            | `ws://.../ws`    | Endpoint público que recibe el cliente con el ticket.  |
| `CORS_ORIGINS`                    | `*`              | Allowlist separada por comas; producción la restringe. |
| `COOKIE_SECURE`                   | `false`          | Agrega `Secure` a las cookies.                         |
| `ACCESS_TOKEN_TTL_SECONDS`        | `900`            | Vida del access token.                                 |
| `REFRESH_TOKEN_TTL_SECONDS`       | `604800`         | Vida del refresh token.                                |
| `AGENT_INTERNAL_URL`              | `127.0.0.1:4100` | URL privada de `apps/agent`.                           |
| `ALLOW_PUBLIC_AGENT_URL`          | `false`          | Override explícito para una URL no privada.            |
| `AGENT_SERVICE_TOKEN`             | requerido        | Token compartido API → agente; mínimo 32 caracteres.   |
| `TRUSTED_PROXIES`                 | vacío            | IPs exactas autorizadas a aportar `X-Forwarded-For`.   |
| `RATE_LIMIT_ENABLED`              | `true`           | Activa el rate limit local del proceso.                |
| `RATE_LIMIT_WINDOW_SECONDS`       | `60`             | Ventana de rate limit.                                 |
| `RATE_LIMIT_REQUESTS`             | `120`            | Límite HTTP general por origen.                        |
| `RATE_LIMIT_LOGIN_REQUESTS`       | `10`             | Límite específico de login.                            |
| `RATE_LIMIT_AGENT_REQUESTS`       | `20`             | Límite por tenant y actor para crear runs.             |
| `EMAIL_SPOOLER_ENABLED`           | `false`          | Opt-in del worker persistente de campañas.             |
| `SMTP_HOST`                       | vacío            | Host SMTP; requerido si el worker está activo.         |
| `SMTP_PORT`                       | `587`            | Puerto SMTP.                                           |
| `SMTP_SECURE`                     | `false`          | Conexión SMTP TLS implícita.                           |
| `SMTP_USER`                       | vacío            | Usuario SMTP server-only.                              |
| `SMTP_PASS`                       | vacío            | Password SMTP server-only.                             |
| `MAIL_FROM`                       | vacío            | Remitente fijado por servidor para toda campaña.       |
| `EMAIL_SPOOLER_INTERVAL_MS`       | `60000`          | Frecuencia de revisión de la cola.                     |
| `EMAIL_SPOOLER_BATCH_SIZE`        | `25`             | Entradas reclamadas por ciclo, máximo efectivo 100.    |
| `EMAIL_SPOOLER_MAX_ATTEMPTS`      | `3`              | Intentos antes del estado terminal `failed`.           |
| `EMAIL_SPOOLER_LEASE_MS`          | `300000`         | Lease para recuperar procesos interrumpidos.           |
| `API_TEST_ENABLED`                | `false`          | Habilita integración contra la base configurada.       |
| `API_TEST_SEEDS`                  | `false`          | Habilita el paso explícito de seeds.                   |
| `TEST_TENANT_ID`                  | vacío            | Tenant existente autorizado para tests.                |

El rate limiter actual vive en memoria y limita cada proceso por separado. No
debe documentarse como un límite distribuido. Responde headers
`RateLimit-Limit`, `RateLimit-Remaining` y `RateLimit-Reset`; una respuesta 429
agrega `Retry-After`.

En `production` la configuración falla si CORS contiene wildcard/dominios
placeholder, las cookies no son seguras, se habilitan flags de test, se apaga
el rate limit, se reutilizan secretos, quedan placeholders o la URL del agente
es pública sin override. El override debe ser una decisión deliberada del
despliegue, no un default del template.

La URL WebSocket pública debe usar `wss:`, no contener credenciales, query ni
fragment y terminar exactamente en `/ws`. Se configura explícitamente para no
confiar en `Host` o headers de proxy enviados por el cliente.

## Módulos

Cada módulo vive en `src/modules/<capacidad>`, tiene un `__module__.ts` válido y
usa nombres sin prefijo de producto.

| Módulo            | Responsabilidad                                               |
| ----------------- | ------------------------------------------------------------- |
| `health`          | Liveness y readiness.                                         |
| `auth`            | Login, refresh, logout, sesión, CSRF y tickets WebSocket.     |
| `administrators`  | Alta de administradores de plataforma.                        |
| `tenants`         | Alta, listado, consulta y estado de tenants.                  |
| `operators`       | Alta y listado de owners/operadores dentro de un tenant.      |
| `users`           | Alta y listado de usuarios finales dentro de un tenant.       |
| `telegram-ai`     | CRUD de IDs autorizados para la interfaz Telegram del agente. |
| `email-marketing` | Grupos, plantillas, campañas y spooler SMTP tenant-aware.     |
| `agent`           | Frontera pública tenant-aware hacia el runtime privado.       |
| `files`           | Intents, contenido binario y descarga de artifacts.           |

### Rutas HTTP

| Método   | Path                               | Autorización principal                       |
| -------- | ---------------------------------- | -------------------------------------------- |
| `GET`    | `/health/live`                     | Pública.                                     |
| `GET`    | `/health/ready`                    | Pública; informa boot/Mongo.                 |
| `POST`   | `/auth/csrf`                       | Pública o ligada a la sesión existente.      |
| `POST`   | `/auth/login`                      | CSRF anónimo previo.                         |
| `POST`   | `/auth/refresh`                    | Refresh cookie y CSRF.                       |
| `POST`   | `/auth/logout`                     | Sesión y CSRF.                               |
| `GET`    | `/auth/me`                         | Sesión.                                      |
| `POST`   | `/auth/ws-tickets/create`          | Sesión y CSRF.                               |
| `POST`   | `/administrators/create`           | `platform_admin` y CSRF.                     |
| `GET`    | `/tenants`                         | `platform_admin`.                            |
| `POST`   | `/tenants/create`                  | `platform_admin` y CSRF.                     |
| `GET`    | `/tenants/:id`                     | Actor con acceso al tenant.                  |
| `PATCH`  | `/tenants/:id/update`              | `platform_admin` y CSRF.                     |
| `GET`    | `/tenants/:id/operators`           | Actor con acceso al tenant.                  |
| `POST`   | `/tenants/:id/operators/create`    | `platform_admin` o `tenant_owner`, con CSRF. |
| `GET`    | `/tenants/:id/users`               | Actor con acceso al tenant.                  |
| `POST`   | `/tenants/:id/users/create`        | `platform_admin` o `tenant_owner`, con CSRF. |
| `GET`    | `/telegram-ai/access`              | Manager del tenant indicado.                 |
| `POST`   | `/telegram-ai/access/create`       | Manager del tenant y CSRF.                   |
| `PATCH`  | `/telegram-ai/access/:id/update`   | Manager del tenant, versión esperada y CSRF. |
| `DELETE` | `/telegram-ai/access/:id`          | Manager del tenant, versión esperada y CSRF. |
| `GET`    | `/user-groups`                     | Manager del tenant indicado.                 |
| `POST`   | `/user-groups/create`              | Manager del tenant y CSRF.                   |
| `PATCH`  | `/user-groups/:id/update`          | Manager, versión esperada y CSRF.            |
| `GET`    | `/user-groups/:id/members`         | Manager del tenant indicado.                 |
| `POST`   | `/user-groups/:id/members/add`     | Manager del tenant y CSRF.                   |
| `DELETE` | `/user-groups/:id/members/:userId` | Manager del tenant y CSRF.                   |
| `GET`    | `/email-templates`                 | Manager del tenant indicado.                 |
| `POST`   | `/email-templates/create`          | Manager del tenant y CSRF.                   |
| `PATCH`  | `/email-templates/:id/update`      | Manager, versión esperada y CSRF.            |
| `GET`    | `/email-campaigns`                 | Manager del tenant indicado.                 |
| `POST`   | `/email-campaigns/create`          | Manager, idempotency key y CSRF.             |
| `POST`   | `/email-campaigns/:id/stop`        | Manager del tenant y CSRF.                   |
| `GET`    | `/email-spooler`                   | Manager del tenant indicado.                 |
| `GET`    | `/email-spooler/health`            | Manager; métricas limitadas al tenant.       |
| `POST`   | `/email-spooler/:id/send-now`      | Manager del tenant y CSRF.                   |
| `POST`   | `/email-spooler/:id/stop`          | Manager del tenant y CSRF.                   |
| `POST`   | `/agent/runs/create`               | Sesión, tenant válido, CSRF y rate limit.    |
| `GET`    | `/agent/runs/:id`                  | Actor autorizado para el tenant.             |
| `GET`    | `/agent/runs/:id/events`           | Actor autorizado; cursor durable.            |
| `POST`   | `/agent/runs/:id/cancel`           | Actor autorizado y CSRF.                     |
| `POST`   | `/agent/confirmations/:id/approve` | Actor autorizado y CSRF.                     |
| `POST`   | `/agent/confirmations/:id/reject`  | Actor autorizado y CSRF.                     |
| `POST`   | `/uploads/intents/create`          | Actor de tenant y CSRF.                      |
| `PUT`    | `/uploads/:id/content`             | Actor de tenant, owner del intent y CSRF.    |
| `GET`    | `/artifacts/:id`                   | Actor del tenant propietario.                |

Las rutas son explícitas. No agregar controllers catch-all ni proxies
genéricos.

### Email marketing

El módulo usa cinco colecciones planas con índices propios:
`user_groups`, `user_group_members`, `email_templates`, `email_campaigns` y
`email_spooler`. Sólo `platform_admin` y `tenant_owner` pueden operar la
capacidad y toda consulta vuelve a fijar `tenantId` en servidor.

Las campañas requieren grupo y plantilla activos, un `MAIL_FROM` válido y una
clave de idempotencia. La API resuelve como máximo 5.000 miembros, descarta
usuarios inactivos y persiste una copia de destinatario, asunto y cuerpo por
usuario. Si el alta del lote falla, elimina las entradas parciales y deja la
campaña en `failed`.

El worker sólo arranca con `EMAIL_SPOOLER_ENABLED=true` y configuración SMTP
completa. Reclama entradas mediante `findOneAndUpdate`, asigna lease, reintenta
con backoff y nunca marca `sent` antes de la confirmación del transporte. Stop
de campaña cambia primero el estado de la campaña y luego detiene entradas
pendientes; un worker que observe una campaña terminal libera su lease como
`stopped`. Un envío que ya alcanzó SMTP no es revocable, pero su finalización no
puede sobrescribir el estado `stopped` de la campaña.

## Autenticación y autorización

Los actores soportados son:

| Kind            | Role              | Alcance                                     |
| --------------- | ----------------- | ------------------------------------------- |
| `administrator` | `platform_admin`  | Plataforma y cualquier tenant seleccionado. |
| `operator`      | `tenant_owner`    | Administración del tenant propio.           |
| `operator`      | `tenant_operator` | Lectura/operación dentro del tenant propio. |
| `user`          | `tenant_user`     | Webapp y recursos del tenant propio.        |

Las cookies `s42_access`, `s42_refresh` y `s42_csrf_context` son HttpOnly,
`SameSite=Lax` y usan `Secure` cuando `COOKIE_SECURE=true`.

El refresh emite un nuevo par de tokens. La implementación base no mantiene una
colección de sesiones revocables ni invalida de forma individual un refresh
anterior; no asumir esas propiedades al extender autenticación.

CSRF combina `Bun.CSRF` con un HMAC ligado al `sid`. Toda mutación autenticada
debe llamar `authenticatedRequest(request, { csrf: true })`.

`authenticatedRequest` revalida la identidad y el tenant en MongoDB y reconstruye
el rol actual antes de cada decisión. Usuarios u operadores inactivos, tenants
inactivos y roles modificados no conservan acceso sólo porque el token todavía
sea criptográficamente válido.

La autorización se aplica en el servidor:

- `requirePlatformAdministrator`;
- `requireTenantAccess`;
- `requireTenantManager`.

Para runs, conversaciones, eventos, confirmations, uploads y artifacts,
`tenant_user` y `tenant_operator` sólo acceden a recursos cuyo owner es su actor
actual. `tenant_owner` y `platform_admin` pueden operar recursos del tenant que
la API ya resolvió y firmó. Las denegaciones por recurso responden 404 para no
revelar existencia.

Ocultar una pantalla o enlace en Next.js nunca reemplaza estas verificaciones.

## WebSocket

El endpoint local por defecto es:

```text
ws://127.0.0.1:3822/ws?ticket=<ticket-de-un-solo-uso>
```

Flujo:

1. El cliente autenticado solicita `POST /auth/ws-tickets/create` con CSRF.
2. La API persiste el hash en `websocket_tickets` y responde el ticket junto
   con `webSocketUrl`.
3. El cliente conecta con `stock42.realtime.v1`; el upgrade consume el ticket
   de forma atómica, revalida actor/tenant/rol y rechaza otro subprotocolo.
4. El cliente se suscribe a `agent:run:<uuid>` con su cursor. Sólo
   `platform_admin` debe enviar además el tenant seleccionado.
5. La API vuelve a revalidar al actor, verifica el run y deriva internamente el
   topic `tenant:<tenantId>:agent:run:<runId>`.
6. El socket usa `subscribe`/`unsubscribe` nativos y el bridge entrega cada
   evento con un único `server.publish` al topic autorizado.

La ruta se declara como `WebSocketController<SocketData>` y se agrega a un
registro `WebSocketControllers`. La API conserva la propiedad del
`Bun.serve` para aplicar CORS, rate limiting y gateways binarios al tráfico
HTTP, mientras s42-core resuelve el routing, el upgrade y el lifecycle
WebSocket nativo sobre ese mismo listener.

`@stock42/api-client/realtime` implementa el cliente browser compartido: pide
CSRF y ticket nuevos, valida el protocolo, renueva el ticket en cada reconexión,
aplica backoff con jitter, reanuda desde cursor y entrega en orden aun si recibe
eventos duplicados o fuera de secuencia. Tras aceptar un run por HTTP, el
Backoffice recibe progreso, estado, respuesta terminal y replay exclusivamente
por esta suscripción WebSocket; una reconexión abre otro socket y reanuda desde
el cursor durable, sin polling browser a `GET /agent/runs/:id` ni a
`GET /agent/runs/:id/events`.

Los eventos `run.progress` exponen solamente resúmenes operativos acotados
(`analyzing`, tools, confirmation y respuesta final). No publican
`reasoning_content` del proveedor. Cada `run.status` incluye un snapshot del run
público; por eso el evento terminal lleva el output necesario para renderizar la
respuesta sin otra consulta HTTP. MongoDB y el endpoint interno por cursor
siguen siendo la fuente durable que alimenta el bridge de la API.

Límites vigentes:

- payload máximo de 64 KiB;
- backpressure de 256 KiB;
- máximo 20 canales por conexión;
- máximo 60 mensajes por minuto por socket;
- pings nativos de `s42-core`/Bun y cierre por 70 segundos de inactividad;
- renovación forzada a los cinco minutos para revalidar la sesión;
- compresión deshabilitada.

## MongoDB, Models y Storage

Los documentos de negocio son planos:

```text
uuid
createdAt
updatedAt
version
...campos del dominio
```

No se usa el envelope histórico `data/_v/_n`.

El patrón obligatorio es:

1. El contrato público vive en `packages/contracts`.
2. El Model valida con Zod, encapsula getters/setters y expone `toPublic`.
3. Un storage estático delgado extiende `MongoDBStorage`, declara su
   `collectionName` y no tiene constructor.
4. Cada método estático resuelve el `MongoClient` registrado como `db` en
   `Dependencies` y ejecuta sólo las queries necesarias para el módulo.
5. `src/boot/indexes.ts` declara y garantiza todos los índices antes de las
   migraciones y del bootstrap administrativo.
6. El controller valida input, autenticación, tenant y respuesta.

`MongoDBStorage` sólo ofrece resolución de colección, inserción, búsqueda
simple y listado cursor-based acotado a 100 elementos. Los storages no se
instancian ni conservan un handle Mongo propio. No agregar repositorios
genéricos, query builders ni tools MongoDB abiertas.

Las escrituras con concurrencia usan `expectedVersion`; si el documento cambió,
la API responde conflicto en lugar de sobrescribirlo silenciosamente.

## Comunicación con el agente

`AgentClient` firma cada request con:

- bearer token interno;
- timestamp con ventana de 30 segundos;
- HMAC de timestamp, método, path, query, tenant, actor, rol y body;
- `x-tenant-id`;
- `x-actor-id`;
- `x-actor-role`;
- idempotency key cuando corresponde.

La URL del agente nunca debe exponerse al navegador ni a Nginx. El proxy
autorizado es API → agente, no webapp → agente.

## Agregar un módulo

Secuencia mínima:

1. Crear `src/modules/<nombre>/__module__.ts`.
2. Agregar contratos compartidos en `packages/contracts` si cruzan procesos.
3. Crear un Model sólo si el módulo persiste documentos.
4. Crear un storage sólo si hay persistencia necesaria.
5. Agregar controllers con método y path exactos.
6. Aplicar autenticación, CSRF y autorización por tenant en cada controller.
7. Declarar el `collectionName` estático y agregar sus índices a
   `src/boot/indexes.ts` únicamente cuando corresponda.
8. Agregar tests unitarios y tests HTTP para el flujo.
9. Actualizar este documento, `GUIDE.md`, `CHANGELOG.md` y Nginx si cambia la
   superficie pública.

No implementar DDD, arquitectura hexagonal, CQRS ni capas sin uso concreto.

## Administrador inicial

El bootstrap está apagado por defecto. Con
`DEFAULT_ADMIN_BOOTSTRAP_ENABLED=true`, email y password se vuelven obligatorios
y, después de asegurar el índice único, cada arranque consulta el email
normalizado:

- si no existe, crea un `platform_admin` activo con nombre
  `Administrador principal`;
- si ya existe, no cambia su nombre, estado ni password;
- ante dos arranques concurrentes, el índice único determina el alta y ambos
  procesos continúan usando la identidad existente.

La contraseña se hashea con `Bun.password` antes de persistirla. Ni la
contraseña ni su hash se imprimen en logs. Cambiar
`DEFAULT_ADMIN_PASSWORD` no resetea una cuenta existente; para crear una
identidad distinta se debe configurar deliberadamente otro email.

El administrador ingresa en `apps/backoffice` desde `/login`, modo
`Plataforma`, con el email y password configurados. El navegador nunca recibe
estas variables.

Para crear administradores adicionales por operación explícita sigue
disponible:

```bash
cd apps/api
ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... bun run administrator:create
```

Ese comando también requiere `MONGODB_URI` y `MONGODB_DB`, falla si el email
ya existe y no imprime passwords.

## Tests y validación

```bash
bun run --cwd apps/api test
bun run --cwd apps/api check-types
bun run --cwd apps/api lint
bun run test:api
```

`test:api` es opt-in y usa exclusivamente `MONGODB_URI` y `MONGODB_DB`
configurados. Nunca debe crear otra base, usar Mongo en memoria ni ejecutar
`dropDatabase`. El flujo cubre alta de grupo y plantilla, encolado idempotente,
consulta tenant-scoped y detención de una campaña sin habilitar entrega SMTP.

Para un cambio de API, validar como mínimo:

- contratos Zod;
- autorización positiva y negativa;
- aislamiento entre tenants;
- CSRF en mutaciones;
- error sanitizado;
- índices o concurrencia si hay persistencia;
- ruta pública y proxy Nginx si cambian paths, puerto, body o WebSocket.

## Nginx

`nginx/api.example.com` apunta a `127.0.0.1:3822`, reemplaza
`X-Forwarded-For` con `$remote_addr`, incluye upgrade WebSocket, reenvía
`Sec-WebSocket-Protocol` y puede copiarse como virtual host independiente a un
servidor Nginx compartido. Esa IP de Nginx debe figurar en `TRUSTED_PROXIES`.

Si se modifica `API_PORT`, `/ws`, límites de body, headers o timeouts, se debe
actualizar ese archivo en la misma tarea.

## Documentos relacionados

- [AI-AGENTS.md](./AI-AGENTS.md): runtime privado, DeepSeek, tools y Telegram.
- [WEBAPP.md](./WEBAPP.md): interfaz de usuarios y BFF.
- [BACKOFFICE.md](./BACKOFFICE.md): control multi-tenant y operación del agente.
- [GUIDE.md](../GUIDE.md): guía integral del monorepo.
