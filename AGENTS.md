# Directivas de trabajo del monorepo Stock42

Estas reglas son obligatorias para toda tarea en el repositorio. Un
`AGENTS.md` anidado puede agregar restricciones para su subárbol, pero no
debilitar estas directivas.

## Flujo obligatorio de cada tarea

1. Leer este archivo y los `AGENTS.md` anidados que correspondan.
2. Ejecutar `git status` y preservar cualquier trabajo ajeno o no relacionado.
3. Ejecutar `git pull --ff-only` antes de modificar archivos. No inspeccionar,
   imprimir, reemplazar ni eliminar credenciales Git.
4. Implementar únicamente el alcance solicitado.
5. Ejecutar validaciones proporcionales al riesgo.
6. Actualizar `CHANGELOG.md` con cada cambio relevante.
7. Hacer un commit intencional y obligatorio.
8. Hacer push obligatorio de ese commit.

No se considera terminada una tarea si quedan cambios propios sin commit o si
el commit no fue publicado. Si pull, commit o push están realmente bloqueados,
se informa el error exacto sin alterar credenciales.

## Alcance y seguridad

- Nunca crear `.env.local`.
- Respetar el mecanismo de configuración existente.
- No ampliar el alcance con abstracciones, refactors o protecciones no
  solicitadas. Las mejoras, riesgos y oportunidades se proponen antes de
  implementarlas.
- Nunca modificar, retirar, rotar, copiar ni exponer credenciales.
- Nunca registrar cookies, headers de autorización, passwords, service tokens
  ni secretos de proveedores.
- Preservar cambios ajenos y no usar operaciones Git destructivas.
- Los tests Mongo usan exclusivamente la base configurada y autorizada: nunca
  crean otra base, nunca levantan un emulador, nunca usan Mongo en memoria y
  nunca ejecutan `dropDatabase`.

## Arquitectura

- Bun es runtime, package manager y test runner prioritario.
- Todos los procesos desplegables viven en `apps/*`.
- Todo directorio `apps/*` declara scripts `build`, `start` y `dev`.
- Solo `apps/webapp` y `apps/backoffice` se compilan.
- `apps/api` y `apps/agent` ejecutan TypeScript con Bun. Su script `build`
  permanece como no-op exitoso y nunca genera `dist`.
- Toda webapp usa Next.js, App Router y shadcn.
- Los Route Handlers son explícitos. Se prohíben `pages/api`, `[...slug]` y
  `[[...slug]]`.
- La API usa la versión publicada de `s42-core`.
- MongoDB es la única base de datos y Zod valida tipos y contratos.
- WebSocket, cuando existe, vive en `apps/api` y comparte su listener.
- La lógica agéntica vive exclusivamente en `apps/agent`; la API la invoca por
  HTTP interno autenticado.
- El proveedor agéntico permitido por defecto es DeepSeek y el modelo es
  `deepseek-v4-pro`.
- Una app nunca importa código fuente de otra app. El código compartido vive en
  `packages/*`, que tampoco importa apps.
- Los módulos API se nombran por capacidad, sin prefijos de producto.
- Mantener código simple. No implementar DDD, arquitectura hexagonal, CQRS,
  event sourcing ni capas ceremoniales.

## Scripts y operación

- `build-all.sh` mantiene una allowlist explícita de webapps Next.js y jamás
  compila API o agente.
- `run-all.sh` y `run-dev-all.sh` mantienen una lista explícita de todas las
  apps.
- Al agregar, eliminar, renombrar o cambiar scripts de una app, revisar los
  tres launchers y el filtro `build` raíz.
- El long polling de Telegram nunca se habilita por defecto en desarrollo ni
  en una ejecución directa: `dev` fuerza `TELEGRAM_POLLING_ENABLED=false`,
  `dev:telegram` es el opt-in local y `start` lo habilita para producción.
  `run-dev-all.sh` usa `dev` y `run-all.sh` usa `start`. En todos los modos,
  la ausencia de `TELEGRAM_BOT_TOKEN` mantiene el polling deshabilitado, sin
  iniciar el proceso Telegram ni programar reintentos.
- La integración entrante de Telegram separa el lifecycle HTTP del polling,
  informa `disabled`/`degraded` en health y supervisa `getUpdates` con backoff
  acotado sin apagar el HTTP. Los IDs autorizados se administran en el módulo
  `Telegram AI`; nunca se confía en tenant, actor o rol enviados por Telegram.
- No ejecutar `getUpdates` y webhook con el mismo bot. Un `409 Conflict` se
  degrada y reintenta sin terminar el servidor HTTP.
- Cuando una tarea cambie apps públicas, dominios, puertos, paths, WebSocket,
  health checks, timeouts, límites de body o headers de proxy, actualizar
  `nginx/` en la misma tarea.
- No iniciar procesos persistentes salvo que el usuario lo solicite. Para
  validaciones se permiten procesos temporales con cleanup garantizado.

## Documentación

- `GUIDE.md` es la guía operativa y de desarrollo.
- `CHANGELOG.md` se actualiza automáticamente en cada tarea.
- `docs/PLAN-SCAFFOLDING-v0.md` conserva las decisiones de arquitectura
  aprobadas.
