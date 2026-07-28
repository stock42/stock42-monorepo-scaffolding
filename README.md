# Stock42 Monorepo Scaffolding

Base Bun-first para productos multi-tenant de Stock42. Incluye Turborepo,
webapp y backoffice Next.js, API s42-core con MongoDB y WebSocket, y un runtime
durable de agentes DeepSeek.

## Inicio rápido

```bash
bun install
cp apps/api/.env.example apps/api/.env
cp apps/agent/.env.example apps/agent/.env
./run-dev-all.sh
```

Los valores de MongoDB deben apuntar a una base existente. Nunca se crea
`.env.local`.

```bash
./build-all.sh       # compila solo webapp y backoffice
./run-all.sh --build # compila webapps y ejecuta las cuatro apps
bun run check-types
bun run test
bun run boundaries
```

El agente se puede invocar desde el módulo `Agente AI` del backoffice por HTTP
y desde Telegram mediante `getUpdates`. Los IDs autorizados se administran con
el CRUD `Telegram AI` y quedan ligados a un tenant y actor en MongoDB. El
desarrollo mantiene el polling deshabilitado; el opt-in local es
`bun run --cwd apps/agent dev:telegram`, mientras `run-all.sh` usa el modo
productivo.

Consulta [GUIDE.md](./GUIDE.md) para configuración, arquitectura, seguridad,
pruebas y despliegue. Las reglas obligatorias están en [AGENTS.md](./AGENTS.md).
