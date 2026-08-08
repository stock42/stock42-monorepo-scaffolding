# Stock42 New Era

Análisis integral y backlog propuesto para evolucionar el scaffolding v0.

Fecha del análisis: 2026-08-08

Baseline revisado: `main@b6e1c30`

Estado de `s42-core`: `3.0.13` declarado en `apps/api`, resuelto en `bun.lock` y
publicado como última versión al momento del análisis.

## 1. Propósito y alcance

Este documento analiza el monorepo completo y propone mejoras, nuevas features
y funcionalidades. Se revisaron:

- `apps/api`, `apps/agent`, `apps/webapp` y `apps/backoffice`;
- `packages/contracts`, `packages/api-client`, `packages/ui`,
  `packages/typescript-config` y `packages/eslint-config`;
- contratos HTTP, autenticación, autorización, MongoDB, runtime agéntico,
  uploads, artifacts, Telegram y WebSocket;
- Turborepo, scripts raíz, generador de entorno, CI, Nginx, tests y
  documentación.

Los ítems son propuestas. No implican autorización para implementarlos y deben
ejecutarse en tareas separadas, con alcance y criterios de aceptación propios.

## 2. Resumen ejecutivo

La base v0 es coherente con las decisiones arquitectónicas aprobadas: Bun-first,
cuatro apps desplegables, packages compartidos, API modular con `s42-core`,
MongoDB, contratos Zod, Next.js App Router, shadcn centralizado, agente durable y
WebSocket dentro de la API.

La actualización de WebSocket quedó completada sobre `s42-core@3.0.13`: la API
registra `/ws` con `WebSocketController` y `WebSocketControllers`, conserva un
único `Bun.serve`, negocia un subprotocolo versionado y usa topics nativos de
Bun para suscripción y publicación. Webapp y Backoffice comparten un cliente
tipado con ticket renovable, reconexión, replay, orden y deduplicación. El único
trabajo relacionado que permanece en este roadmap es optimizar la ingestión
interna API → agente y sumar observabilidad de producción.

Antes de ampliar producto existen ocho frentes prioritarios:

1. autorización por propietario/rol en runs, eventos, confirmaciones y
   artifacts;
2. origen confiable de IP para rate limiting detrás de Nginx;
3. control de side effects del agente y destinos salientes de Telegram;
4. índices e invariantes faltantes en el storage agéntico;
5. gate `boundaries` actualmente fallido;
6. ocho advisories reportados por `bun audit`;
7. configuración productiva que todavía depende de defaults de la CLI;
8. estados operativos mostrados por la UI que hoy son estáticos.

## 3. Fortalezas que conviene preservar

- Las apps no importan código fuente entre sí y el código compartido vive en
  `packages/*`.
- API y agente ejecutan TypeScript con Bun y no generan un `dist` artificial.
- Solo webapp y backoffice se compilan desde la allowlist explícita.
- Los Route Handlers son explícitos y no existen catch-all.
- Los contratos públicos están centralizados en Zod.
- Los documentos de tenancy son planos, versionados y tienen índices propios.
- Los tokens se transportan en cookies HttpOnly y las mutaciones usan CSRF.
- Los tickets WebSocket son firmados, duran 60 segundos, se persisten hasheados
  y son de un solo uso.
- El agente no expone tools MongoDB genéricas y exige confirmación para tools
  críticas.
- La cola, eventos, confirmaciones y procesos del agente son durables en
  MongoDB.
- Telegram obtiene tenant, actor y rol desde datos server-owned y no desde el
  mensaje entrante.
- Los tests de integración están protegidos para usar exclusivamente la base
  existente configurada.
- La ausencia de `TELEGRAM_BOT_TOKEN` deshabilita realmente el polling.
- El generador de entornos conserva valores adicionales, sincroniza secretos
  compartidos y nunca crea `.env.local`.
- Los virtual hosts Nginx son autónomos y no pretenden controlar la instalación
  completa.

## 4. Criterio de prioridad

| Prioridad | Significado                                                           |
| --------- | --------------------------------------------------------------------- |
| P0        | Debe resolverse antes de presentar el scaffold como base productiva.  |
| P1        | Completa contratos ya existentes y debería integrar la próxima etapa. |
| P2        | Agrega madurez de producto, operación o experiencia de desarrollo.    |
| P3        | Capacidad opcional para despliegues que necesiten escala o HA.        |

## 5. P0 — Corrección, seguridad y gates

**Estado al 2026-08-08:** los ocho P0 de implementación quedaron resueltos en
el árbol actual. El texto de cada ítem conserva el diagnóstico del baseline
para explicar la decisión y evitar regresiones.

| ID            | Cierre implementado                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| `NE-SEC-001`  | Matriz por owner/manager en HTTP interno, runs, events, confirmations, uploads, artifacts, WebSocket y Telegram.     |
| `NE-SEC-002`  | `TRUSTED_PROXIES`, cadena IP validada, Nginx sin header heredado, headers de cuota y `Retry-After`.                  |
| `NE-SEC-003`  | AbortSignal, fencing por `processId`, grace real, ownership de PID y ledger idempotente de tool executions.          |
| `NE-SEC-004`  | Telegram por destination UUID activo, confirmation preview, revalidación pre-envío y neutralización de fórmulas CSV. |
| `NE-DATA-001` | Índices únicos/operativos, invariantes concurrentes, verificador read-only con `listIndexes`/`explain` y retención.  |
| `NE-CI-001`   | Boundaries modela owner de importer/target y cubre app, package y tooling raíz con tests.                            |
| `NE-DEP-001`  | Overrides mínimos y lockfile actualizado; `bun audit` queda sin advisories.                                          |
| `NE-CFG-001`  | Loaders productivos fail-closed, bootstrap opt-in y revalidación activa de identidad/tenant/rol.                     |

La comprobación de índices sobre una base desplegada sigue siendo una operación
de infraestructura: se ejecuta con `bun run --cwd apps/agent indexes:verify`
contra la base existente expresamente autorizada. No se ejecuta automáticamente
contra una base desconocida durante una auditoría del repositorio.

### NE-SEC-001 — Autorización por recurso y actor

**Tipo:** corrección de seguridad

**Superficies:** API, agente, contratos, webapp, backoffice, Telegram y tests.

El tenant se valida correctamente, pero varios recursos solo se filtran por
`tenantId`. Un actor del mismo tenant puede consultar eventos, cancelar un run,
resolver una confirmation o descargar un artifact de otro actor si conoce sus
UUID. El HTTP interno firma `actorId`, pero las lecturas y cancelaciones del
storage no lo aplican; la resolución de confirmations registra al actor que
decidió, pero no exige que sea propietario o manager autorizado.

Propuesta:

- definir una matriz explícita por recurso y acción;
- permitir a `tenant_user` operar solo recursos propios;
- decidir expresamente si owner y operator pueden administrar todos los runs
  del tenant o solo los propios;
- reservar approvals críticos al propietario original o a roles managers;
- aplicar la misma política en HTTP, WebSocket, descarga de artifacts y
  comandos Telegram;
- firmar y validar el rol necesario en el canal API → agente, sin confiar en
  datos del cliente;
- devolver `404` cuando corresponda evitar revelar existencia.

Criterios de aceptación:

- una matriz automatizada cubre actor propio, otro actor del mismo tenant,
  manager y otro tenant;
- no se puede leer, cancelar, aprobar, rechazar ni descargar fuera de la
  política;
- la UI oculta acciones no permitidas, pero la decisión final permanece en el
  servidor.

### NE-SEC-002 — IP confiable y rate limiting detrás de proxy

**Tipo:** corrección de seguridad

**Superficies:** API, configuración, Nginx y tests.

El rate limit HTTP usa directamente `x-forwarded-for` cuando existe. Nginx usa
`$proxy_add_x_forwarded_for`, por lo que un cliente puede aportar una cadena
distinta en cada request y alterar la key del bucket. El limiter también es
local al proceso y no expone headers de cuota aunque `api-client` ya los
permite.

Propuesta:

- declarar proxies confiables de forma explícita;
- derivar una única IP normalizada desde el peer confiable y la cadena
  forwarded validada;
- ignorar headers forwarded cuando el peer no es confiable;
- reutilizar la misma resolución en rate limit, login y auditoría;
- emitir `RateLimit-*` o el contrato ya previsto y `Retry-After`;
- agregar casos de spoofing y múltiples proxies en tests.

El rate limit distribuido queda en P3; esta corrección debe funcionar con una
sola instancia sin depender de Redis.

### NE-SEC-003 — Side effects agénticos abortables y proceso cercado

**Tipo:** corrección de seguridad y consistencia

**Superficies:** agente y tests.

El timeout de una tool usa `Promise.race`, pero no aborta la operación
subyacente. El supervisor marca un run como `timed_out` inmediatamente después
de enviar `SIGTERM`, sin esperar grace ni confirmar la salida. Además,
`process.kill(pid, 0)` valida que exista un PID, no que continúe perteneciendo al
process document original. Un proceso tardío o un PID reutilizado puede ejecutar
side effects después del estado terminal.

Propuesta:

- propagar `AbortSignal` a providers y tools;
- aplicar el mismo grace `SIGTERM` → verificación → `SIGKILL` a timeout y
  cancelación;
- usar un token de fencing por `processId`/attempt antes de heartbeat,
  transitions y side effects;
- persistir la ejecución por `(runId, toolCallId, inputHash)` y aplicar de forma
  efectiva el atributo `idempotent` del catálogo de tools;
- hacer que una tool valide que el run sigue activo inmediatamente antes de
  comprometer una escritura externa;
- registrar outcome real de terminación y no asumir que la señal detuvo el
  proceso.

### NE-SEC-004 — Destinos Telegram permitidos y CSV seguro

**Tipo:** corrección de seguridad

**Superficies:** tools del agente y Telegram.

`send_telegram_message` acepta cualquier `chatId` numérico. La confirmación
humana reduce el riesgo, pero no garantiza que el destino pertenezca al tenant
o a una autorización vigente. Los CSV escapan comillas, pero una celda que
empieza con `=`, `+`, `-` o `@` puede ejecutar una fórmula al abrirse en una
planilla.

Propuesta:

- resolver Telegram por un destination ID server-owned ligado a un binding
  activo, no por un chat arbitrario generado por el modelo;
- mostrar destino, tenant y preview del mensaje en la confirmation;
- revalidar el binding inmediatamente antes del envío;
- neutralizar fórmulas CSV con una política documentada y testeada;
- conservar el contenido original como dato, pero exportarlo de forma segura.

### NE-DATA-001 — Índices e invariantes del runtime agéntico

**Tipo:** corrección de performance y consistencia

**Superficies:** agente, migraciones/boot y tests Mongo.

Existen buenos índices de cola y tenant, pero faltan índices directos para
consultas frecuentes por `runs.uuid` y `processes.uuid`. Tampoco hay un índice
único para `(tenantId, conversation.uuid)`. El upsert concurrente de una
conversación podría duplicarla y las operaciones por run/process degradarán a
`COLLSCAN` al crecer el volumen.

Propuesta mínima:

- `runs_uuid_unique`;
- `processes_uuid_unique`;
- `conversations_tenant_uuid_unique`;
- revisar con `explain()` los filtros de claim, supervision, eventos,
  confirmaciones y delivery Telegram;
- verificar los índices construidos en la base desplegada, no solo las
  definiciones del código;
- agregar una prueba concurrente de creación/reanudación de conversación.

También debe definirse una política de retención para runs, eventos, mensajes,
processes, uploads rechazados y deliveries; los TTL no deben aplicarse a datos
que todavía sean evidencia operativa o de auditoría.

### NE-CI-001 — Restaurar el gate de boundaries

**Tipo:** corrección de tooling

**Superficies:** scripts y CI.

`bun run boundaries` falla en el baseline porque
`scripts/update-env.test.ts` importa los loaders de configuración de API y
agente. El scanner reporta cualquier specifier que contenga `/apps/`, incluso
cuando el archivo consumidor es tooling raíz y no una app o package.

Propuesta:

- modelar ownership del importador y del destino;
- mantener prohibido `apps/A → apps/B` y `packages/* → apps/*`;
- decidir explícitamente si el tooling raíz puede validar contratos de apps;
- agregar tests positivos y negativos para app, package y script raíz;
- dejar CI verde sin excepciones por nombre de archivo.

### NE-DEP-001 — Resolver y clasificar advisories

**Tipo:** mantenimiento de seguridad

**Superficies:** catálogo, manifests, overrides y lockfile.

`bun audit` reportó 8 vulnerabilidades: 4 high, 3 moderate y 1 low, vinculadas
a `fast-uri`, `brace-expansion`, `nanoid`, `hono` y `js-yaml`. Varias rutas son
de tooling, pero el gate de CI falla igualmente y la presencia no debe
confundirse con explotabilidad runtime.

Propuesta:

- determinar para cada advisory si alcanza runtime, build o solo desarrollo;
- actualizar dependencias directas y overrides con el menor cambio compatible;
- mover CLIs de desarrollo fuera de `dependencies` runtime cuando corresponda;
- verificar `bun audit`, tests, builds y contenido de producción;
- documentar solo excepciones temporales con owner, razón y fecha de expiración.

No ejecutar un `bun update --latest` global sin revisión de impacto.

### NE-CFG-001 — Configuración productiva fail-closed

**Tipo:** hardening

**Superficies:** API, agente, generador de entorno y tests.

El generador propone defaults productivos seguros, pero los loaders aceptan
`CORS_ORIGINS=*`, `COOKIE_SECURE=false`, flags de test y hosts internos
expuestos aunque `NODE_ENV=production`. El access token tampoco revalida el
estado actual de identidad/tenant hasta el refresh.

Propuesta:

- rechazar en producción wildcard CORS con credenciales, cookies no seguras y
  flags de test;
- exigir secretos distintos y bloquear placeholders conocidos;
- exigir bind privado del agente salvo override explícito;
- separar el bootstrap inicial del steady state para no exigir indefinidamente
  una contraseña administrativa que ya no se utiliza;
- revalidar identidad y tenant en operaciones sensibles y al crear/consumir un
  ticket WebSocket;
- definir qué cambio de rol o estado invalida sesiones y conexiones activas;
- cubrir el contrato productivo directamente en los loaders, no solo en la
  CLI.

## 6. P1 — Completar la plataforma existente

### NE-RT-001 — Cliente WebSocket real en webapp y backoffice

**Tipo:** mejora y funcionalidad

**Superficies:** webapp, backoffice, api-client, contracts, API y Nginx.

**Estado:** completado el 2026-08-08.

Cierre implementado:

- se agregó a `@stock42/api-client` un cliente browser tipado;
- se obtiene un ticket de un uso por BFF y se conecta mediante una URL pública
  explícitamente configurada;
- se suscribe `agent:run:<uuid>` con cursor durable;
- se soportan ack, eventos, pings nativos, backoff con jitter, renovación de ticket,
  replay tras reconexión y cierre al completar el run;
- el polling quedó limitado a un fallback acotado;
- se muestran estado, progreso, respuesta y errores recuperables;
- se probaron reconexión, evento duplicado, cursor atrasado, publicación por topic y
  aislamiento tenant.

Artifacts y confirmations completos de la Webapp conservan sus ítems de
producto propios; no bloquean el transporte realtime.

### NE-RT-002 — Topics nativos de `s42-core`/Bun

**Tipo:** mejora técnica

**Superficies:** API y tests.

**Estado:** completado el 2026-08-08.

Cierre implementado:

- el socket se suscribe al topic autorizado después de validar el run;
- se desuscribe por topic al cerrar o recibir `unsubscribe`;
- se publica una única vez por topic desde el listener compartido;
- tenant y autorización quedan fuera del nombre controlado por el cliente;
- se consulta el número de subscribers sin exponer topics ni payloads;
- se corrigió el caso donde una resuscripción existente era rechazada al llegar al
  límite de 20 canales.

### NE-RT-003 — Bridge API → agente eficiente

**Tipo:** mejora de escalabilidad

**Superficies:** API, agente y contratos internos.

`AgentEventBridge` ejecuta una consulta HTTP por run suscripto y por segundo, en
secuencia, y reintenta sin telemetría. Ya conserva los principals reales de los
suscriptores y prueba otro principal autorizado si uno pierde acceso, pero el
costo sigue escalando con el número de runs activos.

Propuesta incremental, sin mover WebSocket fuera de la API:

1. agregar un endpoint batch de múltiples cursores o un stream HTTP interno
   autenticado;
2. aplicar backoff, límites, métricas y logs de reconexión;
3. mantener replay desde MongoDB como fuente durable;
4. documentar el mecanismo de fan-out si en el futuro hay más de una API.

### NE-WEB-001 — Workspace agéntico completo para usuarios

**Tipo:** nueva funcionalidad

**Superficies:** webapp, API, agente y contracts.

La webapp ya sigue un run en tiempo real, muestra su respuesta, permite
cancelarlo y conserva la conversación durante la sesión. Para convertirse en
un workspace completo todavía necesita historial recuperable, recarga del run
activo, archivos, artifacts y estados de interacción más ricos.

Propuesta:

- timeline de run y estado en tiempo real;
- historial de conversaciones del actor;
- reanudación de conversación con contexto;
- composer multiline, cancelación y retry explícito;
- upload con checksum/progreso y selección de archivo para el run;
- cards seguras para artifacts con nombre, tipo, tamaño y hash;
- estados empty/loading/error/offline accesibles;
- persistencia del run activo al recargar la página.

### NE-BO-001 — Backoffice operativo y no demostrativo

**Tipo:** nueva funcionalidad

**Superficies:** backoffice y API.

El dashboard muestra “Readiness verificado” y “API disponible” de forma
estática. La administración de personas solo crea y lista; las tablas cargan
la primera página y no tienen búsqueda, filtros ni manejo visible de conflictos
de versión.

Propuesta:

- health real de API, MongoDB, agente y Telegram;
- métricas de cola: queued, running, waiting, failed y oldest age;
- runs recientes con tenant/actor, filtros y acciones autorizadas;
- búsqueda y paginación cursor-based de tenants y personas;
- edición de nombre/email/estado y feedback de optimistic concurrency;
- approvals con detalle de tool, input seguro, destino y expiración;
- eliminar badges operativos simulados cuando no exista dato real.

### NE-IAM-001 — Lifecycle completo de identidades y tenants

**Tipo:** nueva funcionalidad

**Superficies:** API, contracts y backoffice.

Propuesta:

- activar/desactivar administradores, operators y users;
- editar nombre y email con versionado;
- reset o cambio de password sin volver a crear la identidad;
- transferir ownership con protección contra “tenant sin owner”;
- suspender un tenant y revocar el acceso derivado;
- invitaciones de un solo uso con expiración;
- registrar todas las mutaciones en audit;
- impedir que un actor se quite a sí mismo el último acceso administrativo.

### NE-IAM-002 — Sesiones revocables y refresh rotation verificable

**Tipo:** mejora de seguridad

**Superficies:** API, MongoDB, webapp y backoffice.

Propuesta:

- persistir sesiones por `sid` con hash del refresh, expiración y estado;
- rotar dentro de la misma familia y detectar reuse del token anterior;
- logout de sesión actual y “cerrar todas las sesiones”;
- listar dispositivos/sesiones recientes sin almacenar información sensible;
- cerrar tickets/conexiones WebSocket cuando la sesión sea revocada;
- conservar access tokens cortos y validar operaciones de alto riesgo.

Esto reemplaza el riesgo explícitamente aceptado en v0; no debe agregarse como
un middleware superficial sin modelo de sesión.

### NE-AUD-001 — Explorador de auditoría

**Tipo:** nueva funcionalidad

**Superficies:** API, agente y backoffice.

La API escribe audit para tenancy, administradores y Telegram AI, pero no
expone consultas ni cubre de forma uniforme runs, confirmations y archivos.

Propuesta:

- endpoint paginado por tenant, actor, action, target y rango temporal;
- vista backoffice con filtros y detalle sanitizado;
- registrar create/cancel/retry de runs, decisiones de confirmation, cambios de
  identidad y descargas sensibles;
- exportación CSV segura;
- retención definida y acceso exclusivo de roles autorizados;
- correlation ID para unir request, audit y logs.

### NE-DATA-002 — Alta de tenant realmente consistente

**Tipo:** corrección de consistencia

**Superficies:** API y backoffice.

La UI afirma que tenant y owner se crean “de forma atómica”. La implementación
real hace dos escrituras con compensación; un crash entre ellas puede dejar
drift aunque el catch normal elimine el owner.

Propuesta:

- usar una transacción Mongo cuando el deployment autorizado la soporte; o
- mantener compensación, cambiar el texto de UI y agregar un reconciliador
  idempotente que detecte owners huérfanos y tenants sin owner.

La alternativa elegida debe probar fallos entre cada escritura.

### NE-AGT-001 — Context window y memoria conversacional controlada

**Tipo:** corrección y mejora

**Superficies:** agente y contracts.

El agente carga hasta 500 mensajes en orden ascendente. Al superar el límite
conserva los más antiguos y omite los más recientes. Tampoco existe presupuesto
de tokens, compaction ni resumen durable.

Propuesta:

- conservar siempre el tramo más reciente;
- medir tokens antes de invocar DeepSeek;
- resumir por bloques con referencia a los mensajes originales;
- limitar contenido de tool results y metadata;
- separar memoria visible, resumen y mensajes provider-ready;
- probar conversaciones largas, tool calls y reanudación.

### NE-AGT-002 — Cola justa y concurrencia con garantías

**Tipo:** mejora de runtime

**Superficies:** agente y MongoDB.

El launcher inspecciona los 20 runs queued más antiguos. Si pertenecen a un
tenant ya saturado, puede dejar sin atención runs de otros tenants que estén
más abajo. Los counts global/per-tenant previos al claim tampoco forman una
reserva atómica entre múltiples launchers.

Propuesta:

- scheduling justo entre tenants;
- claim con lease/fencing y límite verificable;
- prioridad opcional con valores acotados y server-owned;
- métrica de queue age y starvation;
- retry manual, retry reason y dead-letter operacional;
- tests concurrentes con dos launchers y tenants saturados.

### NE-AGT-003 — Resiliencia y telemetría DeepSeek

**Tipo:** mejora de runtime

**Superficies:** agente y backoffice.

El cliente tiene timeout, pero no retry selectivo, backoff, circuit breaker ni
telemetría persistida de `usage`. El schema recibe tokens y luego los descarta.

Propuesta:

- clasificar 429, 5xx, timeout, error de contrato y respuesta vacía;
- retry acotado solo para fallos seguros;
- backoff con jitter y circuit breaker local;
- persistir prompt/completion/total tokens, latencia y finish reason;
- agregar límites/cuotas por tenant y alertas de consumo;
- no almacenar ni exponer reasoning privado en UI o logs;
- mantener `deepseek-v4-pro` como modelo default aprobado.

### NE-FILE-001 — Uploads y artifacts como feature completa

**Tipo:** nueva funcionalidad

**Superficies:** webapp, API, agente y backoffice.

Los endpoints y storages existen, pero no hay experiencia de usuario completa.

Propuesta:

- UI de intención → checksum → upload → ready;
- progreso, cancelación y mensajes por mismatch;
- listado por propietario/run con paginación;
- preview segura cuando el MIME lo permita y download forzado en los demás;
- eliminación lógica y política de retención;
- cuota por tenant/actor;
- reconciliador para archivos huérfanos o documentos cuyo archivo no existe.

### NE-FILE-002 — Streaming y consumo de memoria acotado

**Tipo:** mejora de performance

**Superficies:** api-client, BFF, API y agente.

`toBrowserResponse` materializa el upstream completo con `arrayBuffer()`. Esto
incluye descargas de artifacts a través de la webapp. API y agente también
materializan uploads, aunque hoy están limitados a 10–12 MiB.

Propuesta:

- preservar `upstream.body` como stream en el BFF;
- mantener allowlist de headers y cookies;
- evitar doble buffering en downloads;
- alinear límites de Next, Nginx, API y agente;
- evaluar streaming de upload solo si el límite futuro lo justifica;
- testear archivos máximos, aborts del cliente y upstream interrumpido.

### NE-API-001 — Cliente/BFF compartido, timeouts y errores consistentes

**Tipo:** mejora técnica

**Superficies:** api-client, webapp y backoffice.

`lib/api-proxy.ts` y `lib/session.ts` están duplicados. Los proxies no aplican
timeout; las UIs convierten muchos errores en un texto genérico y pierden
`errorId`, detalles contractuales y conflictos `409`.

Propuesta:

- extraer a `@stock42/api-client/server` solo la lógica realmente idéntica;
- conservar Route Handlers explícitos dentro de cada app;
- timeout y abort en requests server-to-server;
- decoder browser tipado para `ApiError`;
- mostrar `errorId` en errores operativos sin filtrar detalles sensibles;
- preservar status upstream, especialmente 404, 409, 429 y 503;
- tests de cookies múltiples, streaming, timeout y respuesta no JSON.

### NE-API-002 — Autenticación interna con replay controlado

**Tipo:** hardening

**Superficies:** API, agente y contratos internos.

La firma HMAC interna cubre timestamp, método, path, query, body, tenant y
actor. No existe un nonce consumible, por lo que una request capturada puede
repetirse dentro de la ventana temporal. `AgentClient` envía idempotency keys en
algunas operaciones, pero el server interno no las aplica de forma uniforme.

Propuesta:

- incluir nonce/request ID firmado en mutaciones;
- consumirlo una sola vez con TTL corto o combinarlo con idempotencia durable;
- firmar el rol/policy context requerido por NE-SEC-001;
- definir semántica idempotente para create, cancel, confirmation y upload;
- propagar correlation ID sin incorporarlo a logs sensibles;
- mantener el listener privado; mTLS queda como opción del deployment, no como
  requisito del scaffold local.

### NE-OPS-001 — Health, observabilidad y shutdown veraces

**Tipo:** mejora operativa

**Superficies:** API, agente, backoffice y scripts.

`/health/ready` de API informa `agent: configured`, no reachability. Los logs
usan `console` con estructuras diferentes y no se genera un correlation ID de
punta a punta. El shutdown de API y del server interno del agente usa stop
forzado.

Propuesta:

- separar liveness, readiness y dependency status;
- comprobar agente con un timeout corto y reportar degraded sin exponer datos;
- agregar métricas de request, error, rate limit, sockets, queue, provider y
  Telegram;
- generar/validar `x-correlation-id` y propagarlo API → agente;
- redacción recursiva y centralizada en logs;
- terminal reasons públicos acotados a códigos; detalles internos solo en logs
  sanitizados y audit autorizado;
- shutdown con período de drain acotado antes de forzar;
- dashboard basado en estos datos, no en strings estáticos.

### NE-NGX-001 — Separar tráfico HTTP y WebSocket en Nginx

**Tipo:** mejora operativa y de seguridad

**Superficies:** Nginx y documentación.

El virtual host de API aplica `proxy_buffering off` y timeouts de una hora a
todo `/`, aunque solo `/ws` necesita upgrade y conexión larga. También acepta
128 MiB mientras la API tiene límites mucho menores.

Propuesta:

- location exacto o dedicado para `/ws` con upgrade y timeouts largos;
- location HTTP con buffering/timeouts normales;
- `client_max_body_size` alineado con el contrato efectivo;
- estrategia documentada para que tickets en query no queden en access logs;
- headers forwarded compatibles con NE-SEC-002;
- conservar cada archivo como virtual host autónomo.

### NE-UI-001 — Navegación responsive y accesibilidad

**Tipo:** corrección de UX

**Superficies:** webapp, backoffice y UI.

El sidebar del backoffice desaparece por debajo de `lg` sin navegación móvil
alternativa. La webapp también oculta navegación y varios estados son solo
texto/badge visual.

Propuesta:

- drawer/sidebar mobile accesible desde `@stock42/ui`;
- foco visible, skip link, landmarks y anuncio de cambios de run;
- loading/error/not-found boundaries;
- validación de contraste y teclado;
- labels consistentes y errores asociados a campos;
- test Playwright desktop/mobile y axe sobre flujos críticos.

### NE-WEB-002 — Headers de seguridad en las superficies Next.js

**Tipo:** hardening

**Superficies:** webapp, backoffice y Nginx.

Las apps deshabilitan `poweredByHeader`, pero no definen CSP, protección de
framing, referrer policy ni permissions policy.

Propuesta:

- CSP compatible con Next.js y los recursos realmente utilizados;
- `frame-ancestors`/protección contra clickjacking;
- `Referrer-Policy` y `Permissions-Policy` mínimas;
- HSTS únicamente en el deployment que termine TLS;
- tests que verifiquen headers sin fijar hosts o certificados en el repo;
- documentar excepciones por integración, sin usar `unsafe-*` como default.

### NE-QA-001 — Cobertura de comportamiento crítico

**Tipo:** mejora de calidad

**Superficies:** todo el monorepo.

La suite unitaria valida contratos y baselines, pero casi no ejecuta el state
machine real del agente. Los dos E2E actuales cubren login/logout y acceso al
directorio de tenants.

Agregar prioritariamente:

- matriz de autorización NE-SEC-001;
- lifecycle completo de run: queued → running → waiting → resumed → terminal;
- idempotencia concurrente, retry, cancel y timeout;
- launcher/supervisor con procesos temporales y cleanup garantizado;
- context window largo y latest messages;
- Telegram offset, delivery, revocación y destino autorizado;
- upload/artifact con propiedad y archivo faltante;
- WebSocket ticket, subscribe, reconnect, replay y backpressure;
- BFF cookies, errores, timeout y streaming;
- E2E del agente tanto en webapp como backoffice.

Las pruebas Mongo deben seguir usando únicamente la base autorizada, fixtures
marcados y cleanup por UUID; nunca `dropDatabase`.

## 7. P2 — Nuevas funcionalidades de producto y DX

### NE-FEAT-001 — Centro de runs y conversaciones

- listar conversaciones propias o administrables según rol;
- renombrar, archivar y reabrir;
- listar runs por estado, fecha, actor y manifest;
- retry explícito con nuevo idempotency key y vínculo al run anterior;
- compartir artifacts solo mediante grants server-owned y expirables;
- conservar exportación de transcript sin reasoning privado.

### NE-FEAT-002 — Centro de approvals

- bandeja global de confirmations pendientes;
- filtros por tenant, tool, actor y expiración;
- preview estructurada y diff de input;
- política opcional de doble aprobación para acciones de mayor riesgo;
- motivos de rechazo y audit completo;
- notificación WebSocket y Telegram sin aprobar automáticamente.

### NE-FEAT-003 — Configuración del agente por tenant

- catálogo de tools habilitadas por tenant y rol;
- límites de concurrencia, tiempo y consumo por tenant;
- prompt/contexto de negocio versionado y server-owned;
- destinations externas nombradas;
- env allowlist mínima por manifest; no entregar a cada child secretos de
  polling o servicio que no necesita;
- historial de cambios y rollback de configuración;
- ninguna tool MongoDB genérica.

### NE-FEAT-004 — Jobs programados

- runs únicos o recurrentes con timezone del tenant;
- idempotencia por occurrence;
- pause/resume y próxima ejecución visible;
- límite de concurrencia compartido con runs interactivos;
- approvals siguen siendo obligatorias para side effects críticos;
- audit y delivery de resultado.

### NE-FEAT-005 — Telegram mejorado

- `/new`, `/history` y selección segura de conversación;
- respuestas con artifacts mediante links expirables o envío permitido;
- botones de status/cancel con callback validado;
- health y última actualización visibles en backoffice;
- webhook como modo alternativo explícito para deployments compatibles;
- exclusión mutua estricta entre webhook y `getUpdates`.

### NE-FEAT-006 — Webhooks e integraciones salientes

- endpoints registrados por tenant con secret hasheado;
- allowlist de eventos y destinos;
- firma HMAC, timestamp, retry con backoff y idempotency key;
- protección SSRF y resolución DNS/IP validada;
- delivery log y replay manual;
- ninguna URL sugerida por el modelo se usa directamente.

### NE-FEAT-007 — MFA, passkeys y SSO empresarial

- TOTP/passkey para administradores y owners;
- recovery codes hasheados y regenerables;
- OIDC por tenant como capacidad opcional;
- step-up auth para owner transfer, secrets y approvals críticos;
- políticas de sesión integradas con NE-IAM-002.

### NE-FEAT-008 — Configuración y branding del tenant

- nombre visible, logo, locale, timezone y preferencias;
- límites y capacidades habilitadas;
- branding aplicado a webapp sin afectar backoffice global;
- assets validados, con ownership y retención;
- contrato versionado y fallback seguro.

### NE-FEAT-009 — API keys y service accounts

- credenciales server-to-server por tenant con scopes mínimos;
- secret visible una sola vez y persistido como hash;
- expiración, rotación y revocación;
- rate limit y audit propios;
- sin reutilizar cookies de usuario ni el token interno API → agente.

### NE-DX-001 — Evolución del scaffold por capacidades

- checklist para agregar/retirar apps y sincronizar launchers;
- script de diagnóstico read-only para puertos, env requeridas, builds y
  readiness;
- templates de módulo API, Route Handler y contrato Zod;
- capability flags documentados para Telegram, agente, uploads y realtime;
- ningún generador debe crear `.env.local` ni inventar infraestructura.

### NE-DX-002 — Turborepo y CI más eficientes

- corregir `test:api.outputs`: hoy declara `coverage/**` sin generarlo;
- agregar coverage real o retirar el output ficticio;
- usar `--affected` en feedback rápido manteniendo un job completo protegido;
- habilitar remote cache solo con política de secretos y ownership definida;
- declarar únicamente env vars que cambien outputs cacheables;
- evitar dos builds idénticos entre jobs cuando pueda transferirse el artifact;
- pinning por SHA de GitHub Actions y actualización automatizada de
  dependencias;
- generar SBOM/provenance si el scaffold se distribuye externamente.

### NE-DX-003 — Design system verificable

- mantener shadcn exclusivamente en `@stock42/ui`;
- agregar shells responsive compartidos solo cuando haya dos consumidores
  reales;
- documentación visual de tokens y estados;
- tests de interacción para componentes críticos;
- visual regression y accesibilidad en componentes usados por ambas apps;
- evitar una Storybook completa si no existe un flujo de mantenimiento.

### NE-DOC-001 — Documentación viva y contratos operativos

- tabla de rutas generada/verificada contra controllers y Route Handlers;
- matriz de roles y recursos como fuente revisable;
- runbooks de incidente para Mongo, agente, Telegram y WebSocket;
- política de retención, backup y restore;
- registro de decisiones para riesgos aceptados y su fecha de revisión;
- quitar claims estáticos que no estén respaldados por health o tests.

## 8. P3 — Escala y alta disponibilidad opcionales

Estos ítems no deben convertirse en requisitos del scaffold base.

### NE-SCALE-001 — Fan-out WebSocket multi-instancia

Cuando exista más de una API, las subscriptions/topics nativas siguen siendo
locales al proceso. Incorporar un bridge explícito de eventos hacia cada
instancia y publicar localmente en el listener de `s42-core`. Redis, SQS o
EventsDomain deben elegirse por el deployment, no por moda.

### NE-SCALE-002 — Rate limiting y sesiones distribuidas

Solo para despliegues multi-instancia: buckets compartidos con operación
atómica, sesiones revocables compartidas y estrategia fail-open/fail-closed
documentada por endpoint.

### NE-SCALE-003 — Launcher/supervisor en HA

Leases renovables, fencing token, reaping seguro, límites de concurrencia
atómicos y observabilidad por worker. Nunca señalar un PID remoto ni asumir que
dos hosts comparten namespace de procesos.

### NE-SCALE-004 — Object storage para archivos

Adapter explícito para S3-compatible cuando local disk no sea durable o
compartido. Mantener metadata en MongoDB, URLs prefirmadas cortas, checksum,
cuotas, lifecycle y reconciliación. Local disk sigue siendo válido en
deployments simples.

### NE-SCALE-005 — Deployment profiles

Docker, systemd, Kubernetes, TLS y backup automatizado continúan fuera del
alcance v0. Pueden agregarse como profiles separados únicamente cuando exista
un deployment objetivo concreto, sin reemplazar los virtual hosts autónomos ni
inventar nombres/credenciales.

## 9. Mapa por superficie

| Superficie        | Situación actual                                      | Próximo resultado recomendado                            |
| ----------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| `apps/api`        | HTTP/WS, auth activa, resource policy y trusted proxy | Métricas y health real                                   |
| `apps/agent`      | Runtime cercado, effects durables, tools y Telegram   | Cola justa, contexto acotado y telemetría                |
| `apps/webapp`     | Login, run conversacional, respuesta y WebSocket      | Historial, uploads, artifacts y workspace completo       |
| `apps/backoffice` | Tenants, personas, agente y Telegram AI básicos       | Operación real, audit, approvals e identity lifecycle    |
| `contracts`       | Contratos HTTP y realtime versionado                  | Recursos listables, policies y errores completos         |
| `api-client`      | HTTP/BFF y cliente WebSocket browser                  | Streaming interno, timeout y error decoder               |
| `ui`              | Catálogo shadcn compartido                            | Shell responsive y pruebas accesibles de piezas críticas |
| Config packages   | Strict TS y lint compartido                           | Mantener simples; agregar reglas solo por fallos reales  |
| Scripts/Turbo     | Launchers, env CLI y boundaries por ownership         | Affected/coverage y diagnóstico                          |
| CI                | Pipeline, audit y secret scan fail-closed             | Ampliar escenarios críticos                              |
| Nginx             | Tres vhosts autónomos con forwarding confiable        | Separar `/ws` y alinear límites                          |
| Docs              | Guías, policy y runbooks por superficie               | Referencias verificables y operación de features P1      |

## 10. Secuencia recomendada

### Etapa A — Base confiable

**Completada en el árbol actual.** El gate local cubre los P0; antes de declarar
una base desplegada se debe ejecutar `indexes:verify`, integración y E2E contra
infraestructura expresamente autorizada.

1. NE-SEC-001, NE-SEC-002, NE-SEC-003 y NE-SEC-004.
2. NE-DATA-001 y NE-CFG-001.
3. NE-CI-001 y NE-DEP-001 hasta recuperar CI verde.
4. Tests adversariales de NE-QA-001 para impedir regresiones.

Gate: no hay acceso cross-actor, side effects tardíos conocidos, spoofing de
IP ni gates rojos.

### Etapa B — Realtime y producto utilizable

1. NE-RT-001 y NE-RT-002.
2. NE-WEB-001 y NE-BO-001.
3. NE-FILE-001, NE-FILE-002 y NE-API-001.
4. NE-UI-001 y E2E desktop/mobile.

Gate: un usuario crea un run, recibe eventos por WebSocket, recarga y recupera
el cursor, ve el resultado y descarga únicamente sus artifacts.

### Etapa C — Gobierno y operación

1. NE-IAM-001, NE-IAM-002 y NE-AUD-001.
2. NE-AGT-001, NE-AGT-002 y NE-AGT-003.
3. NE-OPS-001, NE-NGX-001 y NE-RT-003.

Gate: identidades y sesiones tienen lifecycle, el agente es observable y el
backoffice refleja estado real.

### Etapa D — Features seleccionadas

Elegir NE-FEAT-* según el primer producto que consuma el scaffold. No activar
todas las capacidades por defecto.

## 11. Métricas de éxito

- 0 accesos cross-actor/cross-tenant en la matriz de autorización.
- 100 % de gates obligatorios en verde.
- 0 advisories sin triage, owner y fecha de revisión.
- p95 de entrega API → WebSocket medido y con objetivo por deployment.
- 0 polling por run desde la UI en operación normal.
- queue age y starvation visibles por tenant.
- 100 % de side effects críticos con confirmation y fencing vigente.
- 100 % de downloads validados por tenant, actor/policy y artifact.
- health del dashboard derivado de endpoints reales.
- flujos E2E críticos cubiertos en desktop y mobile.

## 12. Validaciones ejecutadas durante el análisis

| Comando                     | Resultado                                                               |
| --------------------------- | ----------------------------------------------------------------------- |
| `git pull --ff-only`        | Sin cambios remotos pendientes.                                         |
| `npm view s42-core version` | `3.0.13`.                                                               |
| `bun run check-types`       | Correcto.                                                               |
| `bun run lint`              | Correcto.                                                               |
| `bun run test`              | Correcto; varios resultados provinieron del cache local de Turbo.       |
| `bun run test:tools`        | 8 tests correctos.                                                      |
| `./build-all.sh`            | Webapp y backoffice correctos desde el cache local de Turbo.            |
| `bun run format:check`      | Correcto.                                                               |
| `bun run boundaries`        | Falló por los dos imports legítimos del tooling descritos en NE-CI-001. |
| `bun audit`                 | Falló con 8 advisories descritos en NE-DEP-001.                         |

No se ejecutaron en este análisis los tests de integración Mongo ni Playwright:
requieren la base existente autorizada y el lifecycle temporal de las cuatro
apps. Su código y configuración sí fueron incluidos en la auditoría.

## 13. Límites que no deberían cambiar

- WebSocket sigue viviendo en `apps/api` y usando el listener compartido.
- La UI no reemplaza autorización server-side.
- DeepSeek `deepseek-v4-pro` sigue siendo el default aprobado.
- No se agregan tools MongoDB genéricas.
- No se importa código fuente entre apps.
- No se crea `.env.local`.
- No se introduce DDD, arquitectura hexagonal, CQRS o event sourcing.
- Redis, object storage y orquestadores no son requisitos de corrección del
  scaffold simple.
- Telegram polling continúa deshabilitado por defecto en desarrollo y nunca
  convive con webhook para el mismo bot.
