# AI Agents

## Alcance

`apps/agent` contiene toda la lógica agéntica del monorepo. Es un proceso
privado, Bun-first y durable, inspirado en el runtime de VisionSanar.

La aplicación:

- recibe runs autenticados desde `apps/api`;
- persiste conversaciones, mensajes, runs, eventos y confirmaciones en MongoDB;
- ejecuta cada run en un proceso Bun aislado;
- controla concurrencia, heartbeat, timeout, cancelación y reintento;
- usa exclusivamente DeepSeek `deepseek-v4-pro`;
- registra tools Zod clasificadas como `read`, `write` o `critical`;
- administra uploads y artifacts fuera de MongoDB;
- ofrece interfaces HTTP interna y Telegram `getUpdates`.

No se importa código fuente entre `apps/api` y `apps/agent`. Ambos comparten
solamente contratos de `@stock42/contracts` y se comunican por HTTP firmado.
Nginx no expone el agente públicamente.

## Topología de procesos

`src/entrypoints/all.ts` coordina la aplicación:

```text
apps/agent
├── server       HTTP interno y health
├── launcher     claim de runs y creación de procesos
├── supervisor   deadlines, heartbeat, cancelación y confirmations
├── process      un proceso aislado por run
└── telegram     getUpdates y entrega, sólo cuando está habilitado
```

`server`, `launcher` y `supervisor` son procesos core. Si alguno termina,
`all.ts` detiene la app completa para evitar un runtime parcialmente operativo.

Telegram tiene lifecycle separado. Una caída de polling no derriba HTTP ni los
procesos core; el coordinador vuelve a crear su entrypoint con backoff.

La app no se compila. `build` es un no-op exitoso y `start`/`dev` ejecutan
TypeScript directamente con Bun.

## Modos de ejecución

| Comando                                 | HTTP | Runtime durable | Telegram polling  |
| --------------------------------------- | ---- | --------------- | ----------------- |
| `bun run --cwd apps/agent dev`          | Sí   | Sí              | Forzado a `false` |
| `bun run --cwd apps/agent dev:telegram` | Sí   | Sí              | Opt-in local      |
| `bun run --cwd apps/agent start`        | Sí   | Sí              | Solicitado        |
| `bun run --cwd apps/agent server`       | Sí   | No launcher     | No                |
| `bun run --cwd apps/agent launcher`     | No   | Sólo launcher   | No                |
| `bun run --cwd apps/agent supervisor`   | No   | Sólo supervisor | No                |

Aunque un script solicite polling, la ausencia de `TELEGRAM_BOT_TOKEN` fuerza
`telegram.pollingEnabled=false`. En ese caso no se crea el proceso Telegram, no
se llama `getUpdates` y no se programa backoff.

`./run-dev-all.sh` usa `dev`. `./run-all.sh` usa `start`.

## Configuración

La referencia completa está en `apps/agent/.env.example`. El generador
interactivo es `bun run update:env`.

### Proceso y MongoDB

| Variable              | Default       | Uso                                           |
| --------------------- | ------------- | --------------------------------------------- |
| `NODE_ENV`            | `development` | Entorno runtime.                              |
| `AGENT_HOST`          | `127.0.0.1`   | Interfaz HTTP privada.                        |
| `AGENT_PORT`          | `4100`        | Puerto HTTP privado.                          |
| `MONGODB_URI`         | requerido     | Misma instancia configurada para la API.      |
| `MONGODB_DB`          | requerido     | Misma base existente configurada para la API. |
| `AGENT_SERVICE_TOKEN` | requerido     | Secreto compartido API → agente.              |

### DeepSeek

| Variable                    | Default                    | Uso                       |
| --------------------------- | -------------------------- | ------------------------- |
| `DEEPSEEK_API_KEY`          | requerido                  | Credencial del proveedor. |
| `DEEPSEEK_BASE_URL`         | `https://api.deepseek.com` | Endpoint compatible.      |
| `DEEPSEEK_MODEL`            | `deepseek-v4-pro`          | Único modelo permitido.   |
| `DEEPSEEK_REASONING_EFFORT` | `high`                     | `high` o `max`.           |

El cliente envía `thinking: { type: "enabled" }`, tools de función y
`reasoning_effort`. El contrato de configuración y el contrato público del run
fijan `deepseek-v4-pro`; no agregar aliases u otros proveedores sin una decisión
de arquitectura explícita.

### Runtime

| Variable                       | Default  | Uso                                 |
| ------------------------------ | -------- | ----------------------------------- |
| `AGENT_LAUNCH_INTERVAL_MS`     | `1000`   | Frecuencia del claim.               |
| `AGENT_SUPERVISOR_INTERVAL_MS` | `2000`   | Frecuencia de supervisión.          |
| `AGENT_GLOBAL_CONCURRENCY`     | `4`      | Runs activos globales.              |
| `AGENT_TENANT_CONCURRENCY`     | `2`      | Runs activos por tenant.            |
| `AGENT_HEARTBEAT_MS`           | `5000`   | Heartbeat del proceso de run.       |
| `AGENT_INACTIVITY_TIMEOUT_MS`  | `120000` | Inactividad máxima.                 |
| `AGENT_RUN_TIMEOUT_MS`         | `900000` | Deadline total del run.             |
| `AGENT_CANCEL_GRACE_MS`        | `10000`  | Gracia entre `SIGTERM` y `SIGKILL`. |

### Archivos

| Variable                | Default       | Uso                          |
| ----------------------- | ------------- | ---------------------------- |
| `UPLOAD_STORAGE_PATH`   | `./uploads`   | Bytes validados recibidos.   |
| `ARTIFACT_STORAGE_PATH` | `./artifacts` | Outputs generados por tools. |
| `MAX_UPLOAD_BYTES`      | `10485760`    | Límite máximo configurable.  |

MongoDB almacena metadata y hashes, nunca blobs base64.

### Telegram

| Variable                        | Default                    | Uso                              |
| ------------------------------- | -------------------------- | -------------------------------- |
| `TELEGRAM_BOT_TOKEN`            | vacío                      | Token opcional; nunca se loguea. |
| `TELEGRAM_POLLING_ENABLED`      | `false`                    | Gate explícito del polling.      |
| `TELEGRAM_API_BASE_URL`         | `https://api.telegram.org` | API de Telegram.                 |
| `TELEGRAM_POLL_TIMEOUT_SECONDS` | `25`                       | Long polling, máximo 50.         |
| `TELEGRAM_POLL_BACKOFF_MIN_MS`  | `1000`                     | Backoff mínimo.                  |
| `TELEGRAM_POLL_BACKOFF_MAX_MS`  | `30000`                    | Backoff máximo.                  |
| `TELEGRAM_DELIVERY_INTERVAL_MS` | `1000`                     | Reconciliación de respuestas.    |

## Contrato HTTP interno

El servidor escucha por defecto en `127.0.0.1:4100`.

| Método | Path                                 | Función                             |
| ------ | ------------------------------------ | ----------------------------------- |
| `GET`  | `/internal/health/live`              | Liveness y estado de Telegram.      |
| `GET`  | `/internal/health/ready`             | Readiness de MongoDB y Telegram.    |
| `POST` | `/internal/runs`                     | Encola un run idempotente.          |
| `GET`  | `/internal/runs/:id`                 | Lee un run tenant-scoped.           |
| `GET`  | `/internal/runs/:id/events?cursor=N` | Replay durable, hasta 200 eventos.  |
| `POST` | `/internal/runs/:id/cancel`          | Solicita cancelación.               |
| `POST` | `/internal/confirmations/:id`        | Aprueba o rechaza una confirmation. |
| `POST` | `/internal/uploads/intents`          | Crea metadata de upload.            |
| `PUT`  | `/internal/uploads/:id/content`      | Escribe bytes validados.            |
| `GET`  | `/internal/artifacts/:id`            | Entrega un artifact del tenant.     |

Salvo liveness, cada request requiere:

- `Authorization: Bearer <AGENT_SERVICE_TOKEN>`;
- `x-service-timestamp`, con tolerancia de 30 segundos;
- `x-service-signature`, HMAC de método, path, query y body;
- `x-tenant-id`;
- `x-actor-id`.

El body y el contexto firmado deben coincidir. La API pública nunca reenvía
tenant o actor sin resolverlos previamente desde la sesión.

## Ciclo de un run

Estados soportados:

```text
queued
  → starting
  → running
  → waiting
  → queued
  → succeeded | failed | cancelled | timed_out | killed | crashed
```

También existe `cancel_requested` entre un run activo y su terminación.

Flujo:

1. `AgentStore.enqueue` valida idempotencia por `tenantId + idempotencyKey`.
2. Crea o reutiliza la conversación.
3. Persiste el mensaje del usuario y el primer evento.
4. `Launcher` respeta concurrencia global y por tenant.
5. Hace claim atómico del run y crea un proceso `process.ts`.
6. El proceso marca `running`, emite heartbeat y ejecuta el orquestador.
7. El orquestador invoca DeepSeek y procesa como máximo 12 pasos.
8. Cada mensaje, tool y cambio de estado se persiste antes de publicarse.
9. El proceso finaliza o queda `waiting` por una confirmation.
10. `Supervisor` controla procesos ausentes, deadlines, heartbeat y
    cancelaciones.

Un proceso que cae deja el run en `crashed`. Si no superó `retryLimit`, vuelve a
`queued`.

La cancelación:

- cancela directamente runs `queued` o `waiting`;
- marca `cancel_requested` para runs activos;
- envía `SIGTERM`;
- después de `AGENT_CANCEL_GRACE_MS`, usa `SIGKILL` y marca `killed`.

## Persistencia

Colecciones del runtime:

| Colección                 | Contenido                                         |
| ------------------------- | ------------------------------------------------- |
| `agent_conversations`     | Conversaciones por tenant y actor.                |
| `agent_messages`          | Mensajes user/assistant/tool y reasoning.         |
| `agent_runs`              | Estado durable, claim, deadlines e idempotencia.  |
| `agent_events`            | Stream ordenado por `runId + sequence`.           |
| `agent_confirmations`     | Efectos críticos pendientes y resolución humana.  |
| `agent_processes`         | PID, launcher y salida de cada proceso.           |
| `agent_uploads`           | Intents y metadata de uploads.                    |
| `agent_artifacts`         | Metadata y hashes de outputs.                     |
| `agent_deliveries`        | Envíos Telegram idempotentes.                     |
| `agent_telegram_access`   | IDs autorizados administrados por la API.         |
| `agent_telegram_sessions` | Chat → conversación durable.                      |
| `agent_telegram_runtime`  | Offset, heartbeat, errores y backoff del polling. |

El runtime usa la misma base configurada que la API. Nunca crea una base nueva
ni usa MongoDB en memoria.

## Manifests

`ManifestRegistry` registra actualmente `assistant`:

- versión `1.0.0`;
- tipo `subagent`;
- action level `A3`;
- input y output Zod;
- allowlist explícita de variables para el proceso hijo;
- concurrencia, heartbeat, timeouts y retry;
- catálogo de eventos permitido.

Para agregar un manifest:

1. Definir contratos Zod compartidos.
2. Crear el manifest con id y versión estables.
3. Declarar solamente las variables necesarias en `envAllowlist`.
4. Registrar el manifest.
5. Agregar ejecución y tests de lifecycle.
6. Documentar permisos, outputs, límites e idempotencia.

No pasar `Bun.env` completo a un proceso de run.

## Tools

`ToolRegistry` contiene:

| Tool                    | Clase      | Roles                                                |
| ----------------------- | ---------- | ---------------------------------------------------- |
| `get_current_time`      | `read`     | Todos.                                               |
| `get_tenant_context`    | `read`     | Todos.                                               |
| `inspect_upload`        | `read`     | Todos.                                               |
| `list_artifacts`        | `read`     | Todos.                                               |
| `generate_csv`          | `write`    | Todos.                                               |
| `generate_pdf`          | `write`    | Todos.                                               |
| `send_telegram_message` | `critical` | `platform_admin`, `tenant_owner`, `tenant_operator`. |

Cada tool debe declarar:

- nombre y descripción;
- input y output Zod;
- `actionClass`;
- roles permitidos;
- timeout;
- idempotencia;
- función `execute`.

Una tool `critical` no se ejecuta en el primer proceso. El runtime persiste una
confirmation con hash del input, pasa el run a `waiting` y exige aprobación o
rechazo. La confirmation vence a los 15 minutos. Al resolverse, el run vuelve a
cola y reanuda el tool call exacto.

No registrar tools MongoDB genéricas ni permitir que el modelo elija tenant,
actor o rol.

## Uploads y artifacts

Un upload se ejecuta en dos pasos:

1. intent con nombre, MIME, tamaño y SHA-256;
2. `PUT` de bytes exactos.

El runtime verifica:

- tenant y owner;
- estado `pending`;
- tamaño declarado y máximo;
- SHA-256;
- firma de PDF/JPEG/PNG/WebP o UTF-8 válido para texto/CSV;
- path resuelto dentro del directorio configurado.

MIME soportados para uploads:

- `application/pdf`;
- `text/csv`;
- `text/plain`;
- `image/jpeg`;
- `image/png`;
- `image/webp`.

Los artifacts generados soportan PDF, CSV y texto. El nombre se sanea, los bytes
se almacenan en filesystem y MongoDB conserva metadata, tamaño y SHA-256.

## Telegram `getUpdates`

### Regla local/producción

- `dev`: HTTP/runtime sin polling;
- `dev:telegram`: polling local opt-in;
- `start`: solicita polling productivo;
- sin token: polling deshabilitado en todos los modos.

Desarrollo y producción no deben consumir `getUpdates` simultáneamente con el
mismo token. Tampoco se debe combinar webhook y `getUpdates` para el mismo bot.
Un token exclusivo para desarrollo evita conflictos 409.

### Recepción

`TelegramPollingRuntime`:

1. lee el offset durable;
2. llama `getUpdates` con `limit=100`, timeout acotado y sólo `message`;
3. avanza el offset después de procesar cada update;
4. acepta únicamente mensajes privados, con texto y usuario no-bot;
5. busca el `telegramUserId` activo;
6. vuelve a validar tenant e identidad activa en MongoDB;
7. recupera o crea la conversación del chat;
8. encola un run con idempotency key derivada del `update_id`;
9. confirma recepción por Telegram.

IDs desconocidos, inactivos o ligados a identidades/tenants inactivos se
ignoran.

Comandos:

- `/start` y `/help`;
- `/status <run-id>`;
- `/cancel <run-id>`.

### Entrega

El reconciliador entrega:

- aviso cuando un run necesita confirmación;
- respuesta final en chunks de hasta 4000 caracteres;
- estado terminal para fallo, cancelación, timeout o crash.

Antes de entregar vuelve a verificar que el binding de Telegram siga activo y
coincida con tenant, actor y rol. Si fue revocado, marca la entrega como
`revoked`.

Los envíos tienen registro idempotente y hasta tres intentos por llamada.

### Resiliencia y health

Errores de red, rate limit y `409 Conflict`:

- no detienen el HTTP;
- cambian Telegram a `degraded`;
- guardan error sanitizado, restart count y próximo retry;
- reintentan con backoff entre 1 y 30 segundos;
- respetan `retry_after` cuando Telegram lo informa.

Health devuelve:

- `enabled: false`, `state: disabled` y HTTP 200 cuando no hay polling;
- `polling` cuando el heartbeat es reciente;
- `degraded` cuando hay error o heartbeat vencido.

El token se sanea de mensajes de error y nunca debe aparecer en logs.

## Interfaces públicas

El agente puede invocarse por:

- Webapp: HTTP BFF → API → agente;
- Backoffice: HTTP BFF → API → agente, con replay y confirmations;
- Telegram: `getUpdates` → agente, usando accesos administrados por la API.

La API también ofrece WebSocket para eventos. La interfaz actual del Backoffice
usa polling HTTP con cursor; no documentar esa pantalla como cliente WebSocket
hasta que se implemente esa integración.

## Desarrollo de una tool

1. Identificar el efecto real y asignar `read`, `write` o `critical`.
2. Definir schemas Zod acotados.
3. Derivar tenant y actor desde `ToolContext`.
4. Definir roles mínimos.
5. Implementar timeout e idempotencia.
6. Registrar en `ToolRegistry`.
7. Persistir artifacts o deliveries antes de afirmar el efecto.
8. Agregar tests de input inválido, rol denegado, timeout y reintento.
9. Actualizar este documento y `CHANGELOG.md`.

Una tool sensible debe ser `critical`; no se sustituye confirmación humana por
una instrucción en el prompt.

## Tests y validación

```bash
bun run --cwd apps/agent test
bun run --cwd apps/agent check-types
bun run --cwd apps/agent lint
```

Los tests actuales cubren:

- firma del servicio interno;
- modelo y reasoning;
- manifest y lifecycle;
- ausencia de tools MongoDB genéricas;
- gate por flag + token;
- modos `dev`, `dev:telegram` y `start`;
- health HTTP-only;
- offset y contrato de `getUpdates`;
- error 409 sanitizado.

Ante un cambio de Telegram, validar además un smoke temporal que confirme que
`dev` no llama `getUpdates` y que no deja procesos escuchando al terminar.

## Documentos relacionados

- [API.md](./API.md): frontera pública, autenticación y módulo `agent`.
- [BACKOFFICE.md](./BACKOFFICE.md): interfaz HTTP y CRUD Telegram AI.
- [WEBAPP.md](./WEBAPP.md): interfaz de usuario.
- [GUIDE.md](../GUIDE.md): operación integral del monorepo.
