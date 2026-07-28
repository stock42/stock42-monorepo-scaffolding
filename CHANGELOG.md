# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

El formato sigue una versión simplificada de
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Unreleased]

### Added

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

### Security

- Se fijaron overrides transitivos para resolver los avisos conocidos de
  dependencias detectados por `bun audit`.
- Se estableció como regla obligatoria no leer, copiar, modificar, eliminar ni
  rotar credenciales salvo autorización explícita del usuario.
