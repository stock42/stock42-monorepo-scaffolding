# Guía de desarrollo Stock42

Esta guía describe cómo usar y extender el scaffold. Las reglas obligatorias de
trabajo están en `AGENTS.md`; el plan que dio origen a la arquitectura está en
`docs/PLAN-SCAFFOLDING-v0.md`.

## 1. Requisitos

- Bun `1.3.14` o compatible con el `packageManager` fijado.
- Una instancia MongoDB real y una base existente.
- Nginx para validar o desplegar el reverse proxy.
- Una API key DeepSeek capaz de usar `deepseek-v4-pro`.
- Chromium de Playwright para E2E.

No se requiere Node como runtime, Docker, systemd, Redis, un ORM ni un emulador
MongoDB. Nunca se crea `.env.local`.

## 2. Instalación

```bash
bun install --frozen-lockfile
```

Para el primer install que genera deliberadamente un lockfile se usa
`bun install`; después se conserva `bun.lock` y se usa el modo frozen.

Cada app documenta su configuración:

```text
apps/api/.env.example
apps/agent/.env.example
apps/webapp/.env.example
apps/backoffice/.env.example
```

Para crear o actualizar los cuatro archivos `.env` de forma interactiva:

```bash
bun run update:env
```

La herramienta permite elegir desarrollo, tests o producción. Enter conserva
el valor existente o aplica el default indicado; los secretos internos nuevos
se generan de forma criptográficamente aleatoria y no se muestran. Las
variables adicionales de un `.env` existente se preservan. La API key de
DeepSeek, el tenant autorizado para tests y otros datos que no pueden inferirse
se informan como pendientes.

Los ejemplos no son credenciales utilizables. En producción también se puede
inyectar la configuración desde el mecanismo del despliegue. Bun carga `.env`
de la app cuando el proceso se inicia desde ese workspace.

## 3. Estructura

```text
apps/
  api/          API pública s42-core, MongoDB y WebSocket
  agent/        servidor privado y runtime durable
  webapp/       Next.js para usuarios de tenant
  backoffice/   Next.js para plataforma y operación de tenants
packages/
  contracts/    schemas Zod y tipos públicos
  ui/           shadcn base-nova y tokens compartidos
  api-client/   cliente HTTP seguro
  typescript-config/
  eslint-config/
```

Una app es un proceso desplegable. Una app nunca importa otra app. Todo contrato
compartible se mueve a `packages/*`; un package nunca importa `apps/*`.

`bun run boundaries` comprueba:

- imports cruzados entre apps;
- scripts `build`, `start` y `dev` en toda app;
- `build` no-op exacto en API y agent;
- ausencia de `pages/api`, `[...slug]` y `[[...slug]]`.

## 4. Comandos

```bash
bun run dev            # coordina las cuatro apps
bun run start          # exige builds Next existentes
bun run update:env     # crea o actualiza los .env de cada app
./run-all.sh --build   # compila las webapps y luego inicia todo
./build-all.sh         # compila solo webapp y backoffice

bun run check-types
bun run lint
bun run test
bun run boundaries
bun run format:check
bun audit
bun run secret-scan   # requiere Gitleaks; recorre todo el historial Git
```

Los launchers usan listas explícitas. Si se agrega o renombra una app hay que
revisar `build-all.sh`, `run-all.sh`, `run-dev-all.sh`, el script raíz `build`
y Nginx.

### Regla de build

Solo `@stock42/webapp` y `@stock42/backoffice` ejecutan `next build`.
`@stock42/api` y `@stock42/agent` declaran:

```json
{
  "build": "bun -e \"process.exit(0)\""
}
```

API y agente ejecutan TypeScript desde source. Typecheck, lint y tests continúan
siendo gates reales; el no-op no los reemplaza y nunca se genera `dist`.

## 5. Turborepo y paquetes

El root usa workspaces Bun, catálogo de versiones compartidas e instalación
aislada en `bunfig.toml`. Las dependencias internas usan `workspace:*`.

Los packages son JIT:

- exportan `.ts`/`.tsx` por entradas públicas;
- Next transpila los packages internos;
- Bun los consume directamente;
- no tienen scripts ficticios de build.

`check-types` y `lint` dependen de sus equivalentes upstream, no de builds
completos. Las tareas persistentes `dev` y `start` no usan caché.

## 6. Configuración MongoDB

API y agent deben usar exactamente los mismos `MONGODB_URI` y `MONGODB_DB`.
El nombre no se deriva ni se cambia para tests. El boot verifica conectividad,
ejecuta migraciones idempotentes y deja que cada módulo asegure sus índices.

Nunca:

- crear una base de test adicional;
- ejecutar `dropDatabase`;
- iniciar MongoMemoryServer;
- levantar MongoDB desde CI;
- borrar documentos sin un filtro de fixture autorizado.

Los tests de integración exigen `API_TEST_ENABLED=true`. Los proyectos
consumidores deben etiquetar fixtures con un `testRunId`, limitarlos al
`TEST_TENANT_ID` aprobado y limpiar exclusivamente esos documentos.

## 7. API y s42-core

La API fija `s42-core@3.0.13`. `Modules` descubre
`src/modules/**/__module__.ts`, `RouteControllers` despacha sus controllers y
`WebSocketController`/`WebSocketControllers` administran la ruta `/ws`, su
upgrade y lifecycle nativos. Las suscripciones y el fan-out usan
`subscribe`/`unsubscribe`/`publish` de Bun sobre topics derivados por el
servidor. El listener pertenece a la app para compartir:

- callback HTTP de s42-core;
- CORS corregido;
- rate limiting;
- gateways binarios;
- el dispatcher WebSocket nativo de s42-core.

El package publicado de s42-core expone source y actualmente no pasa con
`noUncheckedIndexedAccess`; por eso solo `apps/api/tsconfig.json` desactiva esa
opción. El resto del monorepo conserva el gate estricto.

### Módulos

Los nombres son capacidades sin prefijo de producto:

```text
health
auth
administrators
tenants
operators
users
agent
telegram-ai
email-marketing
files
```

Cada controller declara método y path completo. Los errores pasan por un
handler que devuelve un mensaje público sanitizado y registra en consola el
error completo junto con metadata segura. Cookies, authorization, passwords y
tokens nunca forman parte de esa metadata.

### Model y storage

Los Models validan con Zod, exponen getters/setters necesarios y serializan un
documento plano:

```text
uuid
tenantId
createdAt
updatedAt
version
campos del dominio
```

Los storages concretos extienden el `MongoDBStorage` delgado local. No se
importa el storage interno de s42-core. No existe envelope `data/_v/_n`, query
ilimitada, fallback de test ni tool Mongo genérica.

## 8. Boot y administrador inicial

El orden del boot es:

1. validar configuración;
2. conectar y hacer ping a MongoDB;
3. construir el contexto;
4. ejecutar migraciones;
5. crear índices por módulo;
6. asegurar el administrador de plataforma sólo si el bootstrap está habilitado;
7. ejecutar seeds solo bajo opt-in explícito;
8. cargar módulos s42-core;
9. iniciar HTTP y WebSocket;
10. marcar readiness.

`apps/api/.env` debe definir:

```env
DEFAULT_ADMIN_BOOTSTRAP_ENABLED=true
DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=...
```

El default es `DEFAULT_ADMIN_BOOTSTRAP_ENABLED=false`; email y password pueden
quedar vacíos. Al habilitarlo, `bun run update:env` exige ambos valores sin
mostrar la contraseña. La API busca el email después de asegurar sus índices,
crea un administrador activo si no existe y persiste únicamente el hash de
`Bun.password`. Si existe, conserva nombre, estado y password; cambiar la
variable no funciona como reset. En un proyecto nuevo se habilita para el
primer boot y se vuelve a `false` después de verificar el acceso.

Estas credenciales se usan en `/login` del Backoffice con el modo
`Plataforma`. Para altas adicionales se mantiene
`bun run --cwd apps/api administrator:create` con `ADMIN_EMAIL`, `ADMIN_NAME` y
`ADMIN_PASSWORD`.

## 9. Tenancy

- `platform_admin`: crea tenants y otros administradores.
- `tenant_owner`: administra operadores y usuarios de su tenant.
- `tenant_operator`: opera capacidades autorizadas dentro del tenant.
- `tenant_user`: usa la webapp.

Crear un tenant reserva un UUID, crea el owner con ese `tenantId` y crea el
tenant con `ownerOperatorId`. Ante un fallo de la segunda escritura se elimina
exclusivamente el owner recién creado. Los índices únicos hacen idempotentes
los slugs y emails por ámbito.

Todo query tenant-scoped toma el tenant desde el actor firmado. Un parámetro de
cliente nunca permite cambiar de tenant.

## 10. Autenticación

Access y refresh son tokens HMAC en cookies HttpOnly, `SameSite=Lax`,
`Path=/` y `Secure` configurable. El refresh rota en cada renovación y produce
un nuevo contexto CSRF.

No hay sesiones revocables en MongoDB por decisión de v0. Consecuencias:

- logout borra cookies, pero no revoca un token robado;
- no se detecta reuse de refresh;
- no hay revocación individual por dispositivo.

Se mitiga con expiración corta de access, rotación de emisión, cookies
protegidas y CSRF. Agregar sesiones revocables es un cambio de arquitectura,
no un helper incidental.

Cada request autenticada vuelve a consultar identidad y tenant activos, y
reconstruye el rol actual antes de autorizar. La misma revalidación se aplica al
consumir un ticket WebSocket; desactivar una identidad o cambiar su rol no queda
diferido hasta el vencimiento del access token.

### CSRF

Se usa `Bun.CSRF` con secreto explícito. Bun `1.3.14` no respeta actualmente el
`sessionId` documentado; el scaffold agrega un HMAC sobre
`sessionId + token-nativo` y lo verifica con comparación timing-safe. Los tests
demuestran que un token válido para `session-a` falla en `session-b`.

El flujo browser es:

1. `POST /api/auth/csrf`;
2. recibir token en JSON y contexto en cookie HttpOnly;
3. enviar `x-csrf-token` en login o mutación;
4. recibir otro token al iniciar o renovar sesión.

### CORS y rate limit

`CORS_ORIGINS=*` refleja el Origin válido y agrega `Vary: Origin`; nunca combina
el literal `*` con credenciales. Producción exige una allowlist real,
`COOKIE_SECURE=true`, rate limit activo, flags de test apagados, secretos
independientes y no-placeholder, y URL privada del agente.
`Origin: null` y origins malformados se rechazan.

`WEBSOCKET_PUBLIC_URL` es la URL `ws://` o `wss://` exacta terminada en `/ws`
que la API entrega junto con cada ticket. Producción exige `wss:` y un hostname
no-placeholder; no se deriva de headers controlados por el cliente.

`TRUSTED_PROXIES` enumera IPs exactas. La API ignora `X-Forwarded-For` de peers
no confiables y recorre la cadena validada desde el edge confiable. Nginx
reemplaza ese header con `$remote_addr`. El rate limit local se particiona por
esa IP antes de autenticar y por actor/tenant para agentes, devuelve
`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` y `Retry-After` en 429. Antes de escalar horizontalmente hay que elegir un backend distribuido.

## 11. Next.js y shadcn

Las apps fueron creadas con `bun create next-app@latest`, usan App Router y
consumen `@stock42/ui` con estilo shadcn `base-nova`. Geist Sans y Mono, tokens
graphite/blue y componentes compartidos forman el sistema visual.

`packages/ui/src/components` contiene todo el catálogo `registry:ui`
materializable de shadcn 4.16.0. El registry publica 61 entradas: 60 generan un
componente `.tsx`; `form` es actualmente una entrada de compatibilidad vacía y
los formularios se componen con `field.tsx`. El hook requerido por `sidebar`
vive en `packages/ui/src/hooks`.

Los componentes se agregan o actualizan siempre desde `packages/ui`, usando
prioritariamente el MCP/registry oficial. No se generan copias dentro de
`apps/webapp` o `apps/backoffice`. `@stock42/ui` exporta componentes y hooks por
subpath.

Los Route Handlers son BFF explícitos:

```text
app/api/auth/login/route.ts
app/api/tenants/create/route.ts
app/api/tenants/[id]/operators/create/route.ts
app/api/agent/runs/create/route.ts
app/api/telegram-ai/access/create/route.ts
```

No hay proxy catch-all. El BFF valida input con Zod, filtra headers, propaga
solo cookies esperadas y no intenta parsear HTML como JSON.

Puertos por defecto:

- webapp: `WEBAPP_PORT=3820`;
- backoffice: `BACKOFFICE_PORT=3821`;
- API: `API_PORT=3822`;
- agent interno: `AGENT_PORT=4100`.

Cada variable se configura en el `.env` de su app. Los scripts `dev` y `start`
de las aplicaciones Next respetan el puerto configurado y conservan esos
valores como fallback. `API_INTERNAL_URL` apunta por defecto a
`http://127.0.0.1:3822`.

## 12. Runtime durable de agentes

`apps/agent` contiene cinco entrypoints operativos:

- `all.ts`: coordinador de procesos de la app;
- `server.ts`: HTTP interno autenticado;
- `launcher.ts`: claim y `Bun.spawn` por run;
- `supervisor.ts`: heartbeat, deadline, cancelación y recolección;
- `telegram.ts`: `getUpdates`, autorización y entrega de respuestas;
- `process.ts`: ejecuta exactamente un run.

El coordinador detiene los entrypoints core si uno termina. Telegram tiene un
supervisor separado: si su proceso termina, se reinicia con backoff y el HTTP
permanece disponible. El launcher usa un claim atómico, respeta concurrencia
global/tenant, entrega al worker solo un allowlist de variables y registra
PID/proceso.

### Estado durable

MongoDB contiene conversaciones, mensajes, runs, eventos, confirmations,
procesos, ejecuciones de tools, uploads, artifacts, entregas, sesiones Telegram,
offset/health de polling y accesos `Telegram AI`. Los estados son:

```text
queued → starting → running → succeeded
                         ├── waiting → queued
                         ├── cancel_requested → cancelled/killed
                         └── failed/timed_out/crashed
```

Los eventos tienen secuencia monotónica por run. HTTP permite replay por cursor
y WebSocket solo acelera la entrega; no es fuente de verdad.

Cada worker queda cercado por `processId`. Heartbeats, transitions y commits de
tools verifican el intento activo. `SIGTERM` aborta providers y tools; timeout y
cancelación esperan `AGENT_CANCEL_GRACE_MS`, verifican que el PID siga ligado al
process document y sólo entonces escalan a `SIGKILL`. La ejecución de cada tool
se persiste por `runId + toolCallId + inputHash`: las idempotentes pueden
reanudarse y las no idempotentes con outcome incierto exigen reconciliación.

### DeepSeek

El único modelo permitido es `deepseek-v4-pro`. El request habilita thinking y
`reasoning_effort=high|max`. Cuando DeepSeek solicita tools, el
`reasoning_content` de la respuesta assistant se conserva en la continuación.
Prompts y reasoning completos no se imprimen en logs.

### Tools y confirmations

El registry incluye:

- lectura de tiempo y contexto tenant;
- PDF controlado;
- CSV acotado;
- inspección de uploads;
- listado de artifacts;
- Telegram con ledger durable y reconciliación manual de outcomes inciertos.

No existen tools `find`, `aggregate`, `update` o `delete` genéricas para
MongoDB. Las tools read corren con autorización; las write auditan eventos; las
critical crean una confirmation durable. Aprobar no cambia argumentos: el
input está hasheado y almacenado con el tool call. La confirmation incluye un
preview server-owned. Los CSV neutralizan celdas que comienzan con `=`, `+`,
`-` o `@`; Telegram recibe un `destinationId` activo del tenant, nunca un chat
arbitrario elegido por el modelo, y revalida el binding antes de enviar. Como
`sendMessage` no acepta idempotency key, un outcome ambiguo no se reenvía a
ciegas y queda para reconciliación manual. Rechazo o expiración vuelve al loop
como resultado explícito.

### Telegram: entrega y polling

El runtime usa `getUpdates` con long polling acotado, `limit=100`,
`allowed_updates=["message"]` y offset durable en MongoDB. Cada update se
confirma avanzando a `update_id + 1` únicamente después de procesarlo. El bot
acepta mensajes privados de IDs activos registrados en `Telegram AI`; tenant,
actor y rol se obtienen del registro server-side y nunca del mensaje. Antes de
cada uso también se comprueba que el tenant y el administrador u operador
vinculado continúen activos.

Los mensajes crean runs del mismo runtime durable usado por HTTP, conservan una
conversación por chat, admiten `/status <run-id>` y `/cancel <run-id>`, y
entregan la respuesta final de forma idempotente. Las confirmations críticas se
notifican por Telegram y se resuelven desde el backoffice.

Política operativa:

```text
bun run dev                         → polling false
bun run dev:telegram                → polling true con token, opt-in local
bun run start / ./run-all.sh        → polling true con token, producción
ejecución directa del entrypoint    → polling false por defecto
```

`run-dev-all.sh` invoca `dev`, por lo que nunca habilita polling. Health reporta
`telegram.enabled=false` y `state=disabled` cuando el flag está apagado o
`TELEGRAM_BOT_TOKEN` está ausente. Sin token no se inicia el proceso Telegram ni
se programan reintentos. Con polling efectivo, un fallo degrada health sin
derribar el listener y se reintenta, incluido `409 Conflict`, con backoff de 1 a
30 segundos. El token nunca se registra.

Telegram no permite usar `getUpdates` mientras existe un webhook configurado.
El scaffold no elimina webhooks automáticamente: se debe elegir un único modo
operativo. Se recomienda un token exclusivo para desarrollo incluso al usar el
opt-in.

### Interfaces del backoffice

- `Agente AI`: interfaz HTTP con selección explícita de tenant para
  administradores de plataforma, conversación durable, estado, cancelación,
  replay y confirmations.
- `Telegram AI`: CRUD de IDs de usuario autorizados. Un ID es globalmente único,
  se liga al tenant y al actor autenticado que lo crea, y puede quedar activo o
  inactivo con control optimista de versión.
- `Email marketing`: grupos y miembros manuales, plantillas HTML, programación
  y detención de campañas, estado de entrega y operación de entradas del
  spooler. Sólo `platform_admin` y `tenant_owner` pueden acceder; la API vuelve
  a aplicar la política en cada endpoint.

### Email marketing y spooler

La API persiste `user_groups`, `user_group_members`, `email_templates`,
`email_campaigns` y `email_spooler`. Una campaña copia asunto y cuerpo ya
renderizados para cada usuario activo del grupo; las variables soportadas son
`{{displayName}}`, `{{email}}` y sus variantes `{{user.*}}`. Los valores del
usuario se escapan al insertarlos en HTML.

La entrega queda deshabilitada por defecto. Para habilitarla:

```dotenv
EMAIL_SPOOLER_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=mailer
SMTP_PASS=...
MAIL_FROM=news@example.com
```

`EMAIL_SPOOLER_INTERVAL_MS`, `EMAIL_SPOOLER_BATCH_SIZE`,
`EMAIL_SPOOLER_MAX_ATTEMPTS` y `EMAIL_SPOOLER_LEASE_MS` controlan frecuencia,
lote, reintentos y lease. El worker reclama cada entrada de forma atómica,
recupera leases vencidos y sólo marca `sent` después de que SMTP confirma. Los
errores quedan acotados a 1.000 caracteres y no incluyen body ni credenciales.

## 13. Uploads y artifacts

MongoDB guarda metadata; los bytes viven en filesystem configurable. Los
nombres físicos son UUID generados. Se validan:

- tenant y owner;
- tamaño declarado y real;
- allowlist MIME;
- magic bytes o UTF-8;
- SHA-256;
- path confinado al storage root.

El baseline no crea una abstracción S3 hasta que un proyecto la necesite.

## 14. WebSocket

`POST /auth/ws-tickets/create` genera un ticket firmado, hasheado en MongoDB,
con TTL de 60 segundos y consumo atómico de una vez. `/ws` verifica ticket y
Origin desde el callback `upgrade` del `WebSocketController` antes de que
s42-core acepte la conexión sobre el mismo listener HTTP. El handshake exige el
subprotocolo versionado `stock42.realtime.v1`.

El gateway ofrece:

- mensajes Zod;
- subscribe/unsubscribe nativos por topic server-owned;
- autorización del run contra el agente;
- aislamiento tenant;
- 20 canales por socket;
- 60 mensajes por minuto;
- payload de 64 KiB;
- límite de backpressure;
- pings nativos, idle timeout y cleanup;
- eventos del agente con cursor.

`@stock42/api-client/realtime` obtiene una URL pública y un ticket nuevos para
cada conexión, aplica backoff con jitter, reanuda cada canal desde su cursor y
ordena/deduplica eventos. Webapp y Backoffice lo consumen en operación normal;
si el canal cae, usan temporalmente
`GET /agent/runs/:id/events?cursor=N` hasta reconectar. Las conexiones se
renuevan al superar cinco minutos para revalidar la sesión.

## 15. Tests

```bash
bun run test       # unitarios; no toca MongoDB
bun run test:api   # suite HTTP, opt-in a Mongo real
bun run test:e2e   # Chromium desktop/mobile
```

Playwright se habilita con `E2E_ENABLED=true` y credenciales de fixtures
existentes. Usa Bun, no npm. Los proveedores externos se prueban mediante
servidores fake de contrato en cada proyecto consumidor; MongoDB nunca se
mockea.

## 16. Nginx

`nginx/` conserva tres virtual hosts autónomos basados en las configuraciones
de referencia de VisionSanar:

```text
example.com                 → 127.0.0.1:3820
backoffice.example.com      → 127.0.0.1:3821
api.example.com             → 127.0.0.1:3822
```

Cada archivo puede copiarse individualmente a la ubicación de virtual hosts de
una instalación Nginx existente donde conviven otros proyectos. El directorio
no incluye ni reemplaza el `nginx.conf` global del servidor, y no declara
upstreams, snippets, logs ni certificados compartidos.

Después de copiar el archivo se usa el mecanismo de inclusión ya configurado en
el servidor y se valida la instalación completa con `nginx -t` antes de
recargarla. Estos ejemplos no asumen control sobre los demás proyectos.

Todo cambio de dominio, puerto, path, WebSocket, upload, timeout, health o
header de proxy exige actualizar Nginx.

Los tres hosts fijan `X-Forwarded-For $remote_addr`; la API sólo lo acepta si la
IP peer aparece en `TRUSTED_PROXIES`. El host de API reenvía además
`Sec-WebSocket-Protocol` para conservar la negociación
`stock42.realtime.v1`.

## 17. CI

GitHub Actions descarga Gitleaks `8.30.1` con SHA-256 fijado, escanea el
historial completo y luego ejecuta install frozen, formato, boundaries, tipos,
lint, audit, unit tests y `build-all.sh`. El job de integración:

- nunca levanta MongoDB;
- exige secretos hacia una base existente autorizada;
- falla cerrado si faltan;
- no corre en forks sin secretos;
- ejecuta API real y Playwright Chromium desktop/mobile;
- publica logs y reportes ante fallos.

## 18. Extensión segura

Para agregar una capacidad:

1. definir o extender el schema en `@stock42/contracts`;
2. implementar el módulo API con path explícito;
3. hacer que su storage sea dueño de sus índices;
4. crear un Route Handler BFF concreto si el browser lo necesita;
5. promover UI a `@stock42/ui` solo si ambas webapps la comparten;
6. agregar tests;
7. revisar scripts y Nginx si cambia una superficie operativa;
8. actualizar `CHANGELOG.md`, commit y push.

No agregar DDD, arquitectura hexagonal, buses, repositories o factories por
convención. Se crea únicamente la capa que resuelve una necesidad comprobada.
