# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

El formato sigue una versión simplificada de
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Unreleased]

### Added

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

- Se definió el contrato obligatorio `build`/`start`/`dev` para todas las apps,
  los launchers raíz `build-all.sh`, `run-all.sh` y `run-dev-all.sh`, y la regla
  de compilar únicamente webapp y backoffice; API y agente ejecutan TypeScript
  directamente con Bun y mantienen un `build` no-op.
- Se reemplazó el `bun init` inicial por el scaffold aprobado y se normalizaron
  las configuraciones Nginx de referencia con dominios `example.com`.
- Se marcó `docs/PLAN-SCAFFOLDING-v0.md` como implementado.

### Fixed

- La ausencia de `TELEGRAM_BOT_TOKEN` ahora mantiene el polling de Telegram
  deshabilitado aunque el script solicite habilitarlo; no se inicia el proceso
  `getUpdates`, health informa `disabled` y no se generan reintentos ni backoff.
- Se restauraron las cuatro configuraciones Nginx de referencia originales,
  modificando únicamente sus nombres y dominios a valores `example.*`; se
  retiró la estructura de upstreams, snippets y configuración agregadora que no
  correspondía al material de referencia. Cada archivo vuelve a ser un virtual
  host autónomo que puede convivir con otros proyectos en el Nginx de destino.

### Security

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
