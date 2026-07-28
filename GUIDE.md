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

Los ejemplos no son credenciales utilizables. Copiarlos a `.env` es opcional;
en producción se recomienda inyectar las variables desde el mecanismo del
despliegue. Bun carga `.env` de la app cuando el proceso se inicia desde ese
workspace.

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
./run-all.sh --build   # compila las webapps y luego inicia todo
./build-all.sh         # compila solo webapp y backoffice

bun run check-types
bun run lint
bun run test
bun run boundaries
bun run format:check
bun audit
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

La API fija `s42-core@3.0.10`. `Modules` descubre
`src/modules/**/__module__.ts` y `RouteControllers` despacha sus controllers.
El listener pertenece a la app para compartir:

- callback HTTP de s42-core;
- CORS corregido;
- rate limiting;
- gateways binarios;
- `/ws` de Bun.

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
6. ejecutar seeds solo bajo opt-in explícito;
7. cargar módulos s42-core;
8. iniciar HTTP y WebSocket;
9. marcar readiness.

No se crea un administrador por default. El primer administrador se crea de
forma explícita, sin pasar la contraseña como argumento visible:

```bash
MONGODB_URI='...' \
MONGODB_DB='...' \
ADMIN_EMAIL='admin@example.com' \
ADMIN_NAME='Platform Admin' \
ADMIN_PASSWORD='...' \
bun run --cwd apps/api administrator:create
```

El script no imprime la contraseña.

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
el literal `*` con credenciales. Producción debería declarar una allowlist.
`Origin: null` y origins malformados se rechazan.

El rate limit local se particiona por IP antes de autenticar y por
actor/tenant para agentes. Es suficiente para una instancia. Antes de escalar
horizontalmente hay que elegir un backend distribuido.

## 11. Next.js y shadcn

Las apps fueron creadas con `bun create next-app@latest`, usan App Router y
consumen `@stock42/ui` con estilo shadcn `base-nova`. Geist Sans y Mono, tokens
graphite/blue y componentes compartidos forman el sistema visual.

Los Route Handlers son BFF explícitos:

```text
app/api/auth/login/route.ts
app/api/tenants/create/route.ts
app/api/tenants/[id]/operators/create/route.ts
```

No hay proxy catch-all. El BFF valida input con Zod, filtra headers, propaga
solo cookies esperadas y no intenta parsear HTML como JSON.

Puertos:

- webapp: `3000`;
- backoffice: `3001`;
- API: `4000`;
- agent interno: `4100`.

## 12. Runtime durable de agentes

`apps/agent` contiene cuatro entrypoints operativos:

- `all.ts`: coordinador de procesos de la app;
- `server.ts`: HTTP interno autenticado;
- `launcher.ts`: claim y `Bun.spawn` por run;
- `supervisor.ts`: heartbeat, deadline, cancelación y recolección;
- `process.ts`: ejecuta exactamente un run.

El coordinador detiene los demás entrypoints si uno termina. El launcher usa un
claim atómico, respeta concurrencia global/tenant, entrega al worker solo un
allowlist de variables y registra PID/proceso.

### Estado durable

MongoDB contiene conversaciones, mensajes, runs, eventos, confirmations,
procesos, uploads, artifacts y entregas. Los estados son:

```text
queued → starting → running → succeeded
                         ├── waiting → queued
                         ├── cancel_requested → cancelled/killed
                         └── failed/timed_out/crashed
```

Los eventos tienen secuencia monotónica por run. HTTP permite replay por cursor
y WebSocket solo acelera la entrega; no es fuente de verdad.

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
- Telegram idempotente.

No existen tools `find`, `aggregate`, `update` o `delete` genéricas para
MongoDB. Las tools read corren con autorización; las write auditan eventos; las
critical crean una confirmation durable. Aprobar no cambia argumentos: el
input está hasheado y almacenado con el tool call. Rechazo o expiración vuelve
al loop como resultado explícito.

### Telegram: entrega y polling

El baseline v0 es únicamente saliente: la tool usa `sendMessage` y no consume
`getUpdates`. Por eso el scaffold actual no puede competir con producción por
el long polling ni provocar el `409 Conflict` de Telegram.

La política queda preparada y protegida por tests para cualquier proyecto que
agregue un adaptador entrante:

```text
bun run dev                         → polling false
bun run dev:telegram                → polling true, opt-in local
bun run start / ./run-all.sh        → polling true, producción
ejecución directa del entrypoint    → polling false por defecto
```

`run-dev-all.sh` invoca `dev`, por lo que nunca habilita polling. Un futuro
runtime de Telegram debe mantener el HTTP independiente, reportar
`telegram.enabled=false` y `state=disabled` en local, degradar health sin
derribar el listener y reintentar fallos de polling con backoff de 1 a 30
segundos. El token nunca se registra. Se recomienda un token exclusivo para
desarrollo incluso cuando se usa el opt-in.

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
Origin antes del upgrade.

El gateway ofrece:

- mensajes Zod;
- subscribe/unsubscribe;
- autorización del run contra el agente;
- aislamiento tenant;
- 20 canales por socket;
- 60 mensajes por minuto;
- payload de 64 KiB;
- límite de backpressure;
- ping/pong y cleanup;
- eventos del agente con cursor.

Después de una reconexión se usa `GET /agent/runs/:id/events?cursor=N`.

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

`nginx/` incluye un baseline HTTP completo:

```text
example.com                 → 127.0.0.1:3000
backoffice.example.com      → 127.0.0.1:3001
api.example.com             → 127.0.0.1:4000
apps/agent                  → no publicado
```

`/ws` configura upgrade y timeouts; `/uploads/` desactiva request buffering.
No hay certificados ni paths privados hardcodeados.

```bash
sudo nginx -t -c "$PWD/nginx/nginx.conf" -p "$PWD/nginx"
```

Nginx valida también el `bind` de los listeners; el uso de `sudo` es necesario
cuando el baseline conserva los puertos HTTP privilegiados.

Todo cambio de dominio, puerto, path, WebSocket, upload, timeout, health o
header de proxy exige actualizar Nginx.

## 17. CI

GitHub Actions ejecuta install frozen, formato, boundaries, tipos, lint, audit,
unit tests y `build-all.sh`. El job de integración:

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
