# Contribuir a Stock42 Agentic Monorepo

Gracias por mejorar el scaffold. Las contribuciones deben preservar su objetivo:
una base Bun-first, multi-tenant y simple para productos agénticos, sin capas
ceremoniales ni accesos implícitos entre aplicaciones.

## Antes de comenzar

1. Lee [AGENTS.md](./AGENTS.md) y la [guía de desarrollo](./GUIDE.md).
2. Busca un issue existente o abre uno para cambios funcionales relevantes.
3. Para vulnerabilidades usa exclusivamente [SECURITY.md](./SECURITY.md).
4. Mantén cada pull request acotado a un problema comprobable.

Al enviar una contribución aceptas que se licencie bajo
[Apache License 2.0](./LICENSE), de acuerdo con la sección 5 de esa licencia,
salvo que la marques expresamente como “Not a Contribution”. Actualmente el
proyecto no exige CLA ni DCO adicional.

## Requisitos locales

- Bun `>=1.3.14`;
- una base MongoDB ya existente y expresamente autorizada para integración;
- DeepSeek solamente para validar ejecuciones reales del agente;
- Playwright/Chromium solamente para E2E.

Instala dependencias desde un clon limpio:

```bash
bun install --frozen-lockfile
bun run update:env
```

`update:env` crea archivos `.env` por aplicación. Nunca crees `.env.local`, una
base alternativa, un emulador MongoDB ni una base en memoria. No registres ni
adjuntes valores de los `.env`.

## Arquitectura que debe preservarse

- Los procesos desplegables viven en `apps/*`.
- Una app nunca importa código fuente de otra app.
- El código compartido vive en `packages/*`; los packages tampoco importan apps.
- Solo `apps/webapp` y `apps/backoffice` se compilan.
- API y agente ejecutan TypeScript con Bun y conservan un `build` no-op.
- La API pública usa la versión publicada de `s42-core` y comparte listener HTTP
  y WebSocket.
- La lógica agéntica vive exclusivamente en `apps/agent`.
- MongoDB es la única base de datos y Zod define contratos compartidos.
- Los Route Handlers Next.js son explícitos; no se aceptan catch-all ni
  `pages/api`.
- Los componentes shadcn se incorporan a `@stock42/ui`, no dentro de una app.

Antes de cambiar una superficie lee su documento:

- [API](./docs/API.md)
- [AI Agents](./docs/AI-AGENTS.md)
- [Webapp](./docs/WEBAPP.md)
- [Backoffice](./docs/BACKOFFICE.md)

## Seguridad y tenancy

- Deriva tenant, actor y rol de la sesión o del canal interno firmado.
- Aplica autorización en API/runtime; ocultar UI no es autorización.
- Un `tenant_user` y un `tenant_operator` solo operan sus propios recursos
  agénticos. `tenant_owner` y `platform_admin` pueden administrar los recursos
  del tenant autorizado.
- Una tool debe declarar contrato, roles, timeout, idempotencia y confirmation
  cuando produce un efecto crítico.
- Nunca expongas tools MongoDB genéricas al modelo.
- Nunca registres cookies, passwords, service tokens, credenciales de proveedor
  ni headers de autorización.
- Los secrets y placeholders productivos deben fallar de forma cerrada.

## Flujo de desarrollo

1. Define o actualiza el contrato en `@stock42/contracts`.
2. Implementa la autorización server-side y tests negativos.
3. Agrega BFF/UI solo cuando la capacidad los necesite.
4. Actualiza Nginx si cambia una app pública, path, puerto, WebSocket, headers,
   límites o timeouts.
5. Actualiza la documentación de todas las superficies afectadas.
6. Agrega una entrada a `CHANGELOG.md`.

No incorpores DDD, arquitectura hexagonal, CQRS, event sourcing ni abstracciones
sin un uso concreto aprobado.

## Validación

Antes de abrir el pull request ejecuta:

```bash
bun run format:check
bun run boundaries
bun run check-types
bun run lint
bun run audit
bun run test
bun run test:tools
bun run build
```

Para escanear el historial instala Gitleaks y ejecuta:

```bash
bun run secret-scan
```

Las suites que escriben en MongoDB requieren opt-in y una base existente
autorizada:

```bash
bun run test:api
bun run test:e2e
bun run --cwd apps/agent indexes:verify
```

`indexes:verify` sólo lee `listIndexes()` y planes `explain()` de la base
configurada. Nunca ejecutes `dropDatabase`. No inicies procesos persistentes
como parte de una validación; los procesos temporales deben tener cleanup
garantizado.

## Pull requests

Describe:

- problema y alcance;
- decisiones de seguridad/autorización;
- contratos, migraciones o índices afectados;
- comandos ejecutados y resultados;
- validaciones no ejecutadas y motivo;
- documentación y Nginx actualizados cuando corresponda.

No incluyas archivos generados, caches, logs, reports, `.env` ni artifacts de
agentes. Los mantenedores pueden pedir que un cambio grande se divida antes de
revisarlo.
