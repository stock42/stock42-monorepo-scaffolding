# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

El formato sigue una versión simplificada de
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Unreleased]

### Added

- Se agregó ERA2.md con la visión arquitectónica y de producto para llevar el
  monorepo a una plataforma agent-native adoptable hacia 2030: baseline
  verificable, amenazas y deuda, Trust Kernel, Agent OS, software factory
  actualizable, operación enterprise, modelo de negocio, roadmap E2-P0 a E2-P3,
  criterios de aceptación, métricas y gobernanza.

- Se implementó email marketing de extremo a extremo: contratos Zod,
  colecciones e índices MongoDB tenant-aware, grupos manuales y miembros,
  plantillas HTML versionadas, campañas idempotentes con snapshots por usuario,
  spooler SMTP persistente con lease/reintentos/estados terminales, auditoría,
  BFF explícito y una pantalla Backoffice para programación y operación. La
  entrega queda deshabilitada por defecto y exige configuración SMTP completa y
  un `MAIL_FROM` server-owned.

- Se completó el tiempo real nativo de extremo a extremo: `/ws` negocia el
  subprotocolo `stock42.realtime.v1`, autoriza topics tenant-aware y publica con
  `subscribe`/`unsubscribe`/`publish` de `s42-core`/Bun; Webapp y Backoffice
  comparten un cliente tipado con tickets renovables, reconexión con jitter,
  orden, deduplicación y replay HTTP acotado como fallback. El shutdown conserva
  el workaround de `s42-core` para el contador WebSocket obsoleto de Bun 1.3.14
  y Nginx reenvía explícitamente el subprotocolo negociado.
- Se agregó `WEBSOCKET_PUBLIC_URL`, validada como `ws://`/`wss://` exacta en
  `/ws` y obligatoriamente segura en producción, para no derivar el endpoint
  público desde headers del cliente.
- Se adoptó Apache License 2.0 y se agregaron `SECURITY.md` y
  `CONTRIBUTING.md` con soporte public preview, reporte privado, esquema
  inbound=outbound, arquitectura, tenancy y gates de contribución.
- Se agregó un gate de Gitleaks `8.30.1` sobre todo el historial Git, binario y
  SHA-256 fijados en CI, con una única excepción por fingerprint para un
  placeholder histórico verificado.
- Se agregó `indexes:verify`, una inspección read-only de índices y planes
  `explain()` del agente contra la base MongoDB configurada y autorizada.
- Se reescribió `README.md` como presentación integral del scaffold agéntico:
  propuesta de valor, arquitectura, cobertura funcional, stack, flujo durable
  de runs, seguridad, quick start, guía de extensión, operación, límites reales
  y mapa de documentación para desarrolladores que creen un producto nuevo.
- Se agregó `docs/PUBLICATION.md` con la auditoría de exposición, bloqueos P0,
  decisiones de licencia/gobierno, archivos comunitarios, gates, ensayo desde un
  clon limpio, configuración recomendada de GitHub y runbook para convertir el
  repositorio en un template público sin confundir push con visibilidad.
- Se agregó `NEWERA.md` con un análisis integral del monorepo y un backlog
  priorizado de correcciones, mejoras y nuevas funcionalidades para seguridad,
  autorización, WebSocket nativo de `s42-core`, runtime agéntico, producto,
  operación, testing, CI y escalabilidad opcional.
- Se agregó el bootstrap idempotente y explícito del administrador de
  plataforma: con `DEFAULT_ADMIN_BOOTSTRAP_ENABLED=true` la API exige email y
  password, crea la cuenta al arrancar si no existe y permite ingresar desde el
  modo Plataforma del Backoffice.
- Se agregaron `docs/API.md`, `docs/AI-AGENTS.md`, `docs/WEBAPP.md` y
  `docs/BACKOFFICE.md` con arquitectura, funcionalidad real, configuración,
  seguridad, rutas, operación, testing y guías de extensión por superficie; se
  incorporó su lectura obligatoria y mantenimiento en `AGENTS.md`.
- Se agregó `bun run update:env`, una CLI interactiva para crear o actualizar
  los `.env` de las cuatro apps según el escenario de desarrollo, tests o
  producción, con defaults contextuales, secretos ocultos y sincronizados,
  preservación de configuración adicional y permisos `0600`.
- Se agregó la interfaz entrante Telegram mediante `getUpdates`, offset durable,
  conversaciones por chat, runs idempotentes, comandos de estado/cancelación,
  entrega de respuestas y notificación de confirmations.
- Se incorporaron al backoffice `Agente AI`, como interfaz HTTP tenant-aware
  sobre el runtime durable, y `Telegram AI`, con CRUD versionado de IDs
  autorizados ligados al tenant y actor que los registra.
- Se creó el módulo API `telegram-ai` con contrato Zod, Model,
  `MongoDBStorage`, índices propios, autorización, auditoría y endpoints
  explícitos de alta, listado, edición y baja.
- Se agregó `docs/PLAN-SCAFFOLDING-v0.md` con la arquitectura aprobada, etapas
  de implementación, criterios de aceptación, estrategia de seguridad, runtime
  agéntico, testing, CI y reglas operativas del scaffolding Stock42.
- Se creó el workspace Bun/Turborepo con instalaciones aisladas, catálogo
  central de versiones, límites entre apps y paquetes, configuración compartida
  de TypeScript/ESLint y los paquetes `contracts`, `ui`, `api-client`,
  `typescript-config` y `eslint-config`.
- Se instaló en `packages/ui/src/components` el catálogo completo materializable
  de shadcn 4.16.0 para `base-nova`: 60 componentes compartidos, el hook
  requerido por `sidebar`, sus dependencias y tokens de estilo. La entrada
  `form` del registry actual es un marcador vacío y se resuelve mediante
  `field`.
- Se incorporaron `apps/webapp` y `apps/backoffice` sobre Next.js App Router,
  BFF mediante Route Handlers explícitos, shadcn `base-nova`, UI compartida,
  autenticación por cookies y bases funcionales para usuarios, tenants,
  operadores y administradores.
- Se implementó `apps/api` con s42-core, boot idempotente, migraciones e índices
  propiedad de cada módulo, documentos MongoDB planos, Models y storages
  delgados, multi-tenancy, autorización por rol y auditoría.
- Se agregó autenticación con cookies HttpOnly, rotación de refresh, CSRF ligado
  a sesión, CORS configurable, rate limit, errores productivos sanitizados,
  tickets WebSocket de un solo uso y `/ws` con aislamiento por tenant,
  heartbeat, límites y replay de eventos.
- Se creó `apps/agent` como runtime privado durable con conversaciones,
  mensajes, runs, eventos, confirmaciones, launcher, procesos aislados,
  heartbeat, supervisor, cancelación, reintentos e idempotencia sobre MongoDB.
  DeepSeek `deepseek-v4-pro` es el único modelo configurado.
- Se incorporaron tools agénticas tipadas para lectura, escritura y operaciones
  críticas; confirmaciones, Telegram, PDF, CSV, uploads y artifacts mantienen
  autorización e idempotencia explícitas y no exponen tools MongoDB genéricas.
- Se agregaron tests unitarios con `bun:test`, integración HTTP contra la base
  MongoDB configurada sin crear ni emular bases, Playwright Chromium
  desktop/mobile y CI fail-closed para la integración protegida.
- Se agregó el baseline Nginx para webapp, backoffice, API, WebSocket y uploads,
  sin virtual host público para el agente, certificados hardcodeados, Docker ni
  systemd.
- Se documentaron instalación, configuración, operación, testing, seguridad,
  módulos, runtime agéntico y mantenimiento en `README.md`, `GUIDE.md`,
  `AGENTS.md` y `CLAUDE.md`.

### Changed

- Se reemplazaron las instancias Mongo-backed de `apps/api` por storages y
  servicios estáticos: el boot registra el `MongoClient` como dependencia
  `db` de `s42-core`, cada operación resuelve su colección desde ese registro y
  `src/boot/indexes.ts` garantiza en un único paso todos los índices de API,
  incluidos migraciones, auditoría y tickets WebSocket.
- El task Turbo `test:api` ahora permite explícitamente la configuración de
  runtime y los secretos que consume la integración, incluido el endpoint
  WebSocket público, para no ejecutar CI con variables filtradas por modo
  estricto.
- La configuración productiva de API/agente ahora falla cerrada ante CORS
  wildcard o placeholder, cookies inseguras, tests activos, rate limit apagado,
  secretos placeholder/reutilizados, URL pública del agente o bind público sin
  override explícito; el bootstrap administrativo queda apagado por defecto.
- La firma API → agente cubre tenant, actor y rol, y cada request autenticada o
  ticket WebSocket revalida identidad, tenant y rol actuales en MongoDB.
- Nginx reemplaza `X-Forwarded-For` con `$remote_addr`; la API sólo confía en
  peers enumerados por `TRUSTED_PROXIES` y expone headers de cuota y
  `Retry-After`.
- Se actualizó la API de `s42-core@3.0.10` a `3.0.13` y se migró `/ws` al
  contrato nativo `WebSocketController`/`WebSocketControllers`, conservando el
  listener HTTP compartido, los tickets de un uso, el aislamiento tenant, los
  límites del gateway y un handshake real en la suite de integración.
- Se alinearon los puertos configurables de WebApp (`WEBAPP_PORT=3820`),
  Backoffice (`BACKOFFICE_PORT=3821`) y API (`API_PORT=3822`) con sus virtual
  hosts Nginx, el generador de `.env`, los defaults runtime, Playwright y CI.
- Se retiró `nginx/clinical.example.com` del conjunto de virtual hosts de
  referencia.
- Se definió el contrato obligatorio `build`/`start`/`dev` para todas las apps,
  los launchers raíz `build-all.sh`, `run-all.sh` y `run-dev-all.sh`, y la regla
  de compilar únicamente webapp y backoffice; API y agente ejecutan TypeScript
  directamente con Bun y mantienen un `build` no-op.
- Se reemplazó el `bun init` inicial por el scaffold aprobado y se normalizaron
  las configuraciones Nginx de referencia con dominios `example.com`.
- Se marcó `docs/PLAN-SCAFFOLDING-v0.md` como implementado.

### Fixed

- Se corrigió el gate de boundaries para modelar ownership del importador y
  destino: tooling raíz puede validar apps, pero app→app y package→app siguen
  prohibidos y cubiertos por tests.
- Se actualizaron overrides transitivos y `bun.lock` hasta dejar `bun audit`
  sin vulnerabilidades reportadas.
- Runs, events, confirmations, uploads y artifacts aplican owner/manager dentro
  del tenant; `tenant_user`/`tenant_operator` sólo operan recursos propios y las
  denegaciones no revelan existencia.
- La ausencia de `TELEGRAM_BOT_TOKEN` ahora mantiene el polling de Telegram
  deshabilitado aunque el script solicite habilitarlo; no se inicia el proceso
  `getUpdates`, health informa `disabled` y no se generan reintentos ni backoff.
- Se restauraron las configuraciones Nginx de referencia originales,
  modificando únicamente sus nombres y dominios a valores `example.*`; se
  retiró la estructura de upstreams, snippets y configuración agregadora que no
  correspondía al material de referencia. Cada archivo vuelve a ser un virtual
  host autónomo que puede convivir con otros proyectos en el Nginx de destino.

### Security

- El runtime agéntico propaga `AbortSignal`, cerca heartbeats/transitions/effects
  por `processId`, verifica ownership de PID, aplica grace real antes de
  `SIGKILL` y persiste cada tool execution por
  `runId + toolCallId + inputHash` para hacer efectiva la idempotencia.
- Telegram crítico recibe un destination UUID server-owned, guarda destino y
  preview en la confirmation y revalida el binding antes de enviar. Las
  exportaciones CSV neutralizan fórmulas iniciadas por `=`, `+`, `-` o `@`.
- Se agregaron índices únicos y operativos para runs, conversations, processes,
  tool executions y deliveries, y se documentó una política de retención sin
  TTL implícitos sobre evidencia operativa.
- El bootstrap persiste únicamente el hash generado por `Bun.password`, no
  registra passwords ni hashes y nunca sobrescribe nombre, estado o credenciales
  de un administrador ya existente.
- `getUpdates` queda aislado del proceso HTTP, conserva el default local
  deshabilitado y reintenta fallos/409 con backoff de 1–30 segundos sin
  derribar el agente. Tenant, actor y rol se resuelven desde MongoDB; mensajes
  de IDs desconocidos o inactivos se ignoran, al igual que bindings cuyo tenant
  o actor ya no estén activos.
- Se deshabilitó explícitamente el long polling de Telegram en `dev` y por
  defecto en ejecuciones directas; `dev:telegram` queda como opt-in local y
  `start` lo habilita para producción. Tests y boundaries protegen este
  contrato para evitar consumidores `getUpdates` concurrentes y errores 409.
- Se documentó la exclusión mutua entre webhook y `getUpdates`; el scaffold no
  elimina webhooks de forma automática.
- Se fijaron overrides transitivos para resolver los avisos conocidos de
  dependencias detectados por `bun audit`.
- Se estableció como regla obligatoria no leer, copiar, modificar, eliminar ni
  rotar credenciales salvo autorización explícita del usuario.
