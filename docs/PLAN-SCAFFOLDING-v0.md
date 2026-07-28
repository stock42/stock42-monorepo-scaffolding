# Plan de construcción del scaffolding Stock42 v0

Estado: implementado como scaffolding v0

Fecha de la planificación: 2026-07-28

Repositorio canónico: `stock42/stock42-monorepo-scaffolding`

Rama principal: `main`

## 1. Propósito

Este documento define el plan ejecutable para construir el scaffolding base de
los monorepos Stock42. El resultado debe permitir iniciar proyectos
multi-tenant con:

- Bun como runtime, package manager y test runner prioritario.
- Turborepo como coordinador de tareas y caché.
- API basada en `s42-core`.
- MongoDB como única base de datos.
- Contratos y validaciones con Zod.
- Aplicaciones Next.js para todas las superficies web.
- Componentes shadcn compartidos.
- Backoffice, webapp, API y runtime agéntico incluidos desde el inicio.
- Nginx actualizado y listo para actuar como reverse proxy.
- Tests unitarios, de integración HTTP y E2E.
- Flujo Git obligatorio de pull, implementación, validación, changelog, commit y
  push.

Este documento conserva la estructura, el orden, los contratos mínimos, los
criterios de aceptación y los límites usados para implementar el scaffold v0.

## 2. Decisiones confirmadas

Las siguientes decisiones son vinculantes para v0:

1. El repositorio canónico es
   `https://github.com/stock42/stock42-monorepo-scaffolding.git`.
2. Todos los procesos desplegables viven en `apps/`.
3. Las aplicaciones incluidas son exactamente:
   - `apps/api`
   - `apps/agent`
   - `apps/webapp`
   - `apps/backoffice`
4. No se incluye una landing.
5. Todas las aplicaciones web usan Next.js, App Router y Route Handlers.
6. Los Route Handlers tienen paths explícitos. Se permiten segmentos dinámicos
   simples como `[id]`; se prohíben `[...slug]` y `[[...slug]]`.
7. shadcn usa el estilo `base-nova` y se comparte desde `packages/ui`.
8. Los paquetes base son:
   - `@stock42/contracts`
   - `@stock42/ui`
   - `@stock42/api-client`
   - `@stock42/typescript-config`
   - `@stock42/eslint-config`
9. No existe `agent-sdk` separado en v0. Los contratos compartibles del agente
   viven en `@stock42/contracts`; toda su lógica y control viven en
   `apps/agent`.
10. La API usa la versión publicada de `s42-core`, sin modificar ni copiar el
    repositorio del framework.
11. El almacenamiento Mongo es local a la API, delgado y con documentos planos.
12. Los modelos definen contrato, getters y setters. Los storages concretos
    extienden una base `MongoDBStorage` simple.
13. La estructura multi-tenant incluye administradores de plataforma, tenants,
    owners, operadores y usuarios.
14. El backoffice incluye la base de administración de plataforma y tenants.
15. La webapp incluye la base de autenticación de usuarios de tenant.
16. El agente implementa el modelo durable completo de VisionSanar: launcher,
    proceso aislado por ejecución, heartbeat, supervisor, cancelación,
    recolección, replay e idempotencia.
17. El único modelo LLM permitido por defecto es `deepseek-v4-pro`, con
    razonamiento habilitado siempre que el endpoint lo soporte.
18. La primera versión incluye tools de dominio, Telegram, PDF, CSV, uploads y
    artifacts.
19. No se exponen tools Mongo genéricas al modelo.
20. `/ws` es funcional, vive en `apps/api` y comparte el servidor y puerto de la
    API.
21. Los tests usan la base MongoDB realmente configurada. No crean otra base,
    no levantan un emulador y no usan Mongo en memoria.
22. Playwright usa Chromium en perfiles desktop y mobile para mantener un
    baseline rápido.
23. Nginx se incluye completo como reverse proxy, sin Docker, systemd ni
    certificados hardcodeados.
24. `initial.md` se conserva.
25. Los restos del `bun init` actual son descartables durante la implementación.
26. Las configuraciones Nginx existentes se conservan como referencia y luego
    se reemplazan por configuraciones genéricas con dominios como
    `example.com`, `api.example.com` y `backoffice.example.com`.
27. No se implementa DDD ni arquitectura hexagonal.
28. No se crean helpers, capas o servicios que no respondan a una necesidad
    concreta.
29. Nunca se crea `.env.local`.
30. Cada tarea futura termina con actualización de `CHANGELOG.md`, commit y
    push obligatorios.
31. Cada workspace dentro de `apps/*` declara obligatoriamente los scripts
    `build`, `start` y `dev` en su `package.json`.
32. Solo `apps/webapp` y `apps/backoffice` se compilan. `apps/api` y
    `apps/agent` se ejecutan directamente desde TypeScript con Bun y sus scripts
    `build` son no-op exitosos; nunca generan `dist`.
33. La raíz incluye como launchers operativos `build-all.sh`, `run-all.sh` y
    `run-dev-all.sh`.
34. `build-all.sh` mantiene una allowlist explícita de webapps Next.js.
    `run-all.sh` y `run-dev-all.sh` inician todas las apps y deben mantenerse
    sincronizados con `apps/*`.

## 3. Alcance de v0

### 3.1 Incluido

- Workspace Bun con linker aislado y catálogo de versiones compartidas.
- Pipeline Turborepo, caché y límites entre workspaces.
- Configuración TypeScript y ESLint compartida.
- Contratos Zod compartidos.
- Componentes shadcn compartidos.
- Dos aplicaciones Next.js funcionales.
- API funcional con `s42-core`.
- Acceso MongoDB real.
- Boot explícito e idempotente.
- Módulos base de salud, autenticación, administración y tenancy.
- Autenticación por cookies para backoffice y webapp.
- Runtime agéntico durable completo.
- Integración API → agente mediante HTTP interno autenticado.
- WebSocket funcional en la API.
- Nginx para todas las superficies públicas.
- Scripts raíz para compilar solo las webapps y ejecutar todas las apps en modo
  producción o desarrollo.
- Tests, fixtures seguros, Playwright y CI.
- Documentación operativa y de desarrollo.

### 3.2 Fuera de alcance

- Landing pública.
- Docker y Docker Compose.
- Unidades systemd.
- Certificados TLS o paths de certificados fijados en el repositorio.
- Kubernetes u otro orquestador.
- DDD, arquitectura hexagonal, CQRS o event sourcing.
- ORM.
- MongoDB en memoria o emulado.
- Creación automática de bases de datos para tests.
- Importaciones directas entre aplicaciones.
- `agent-sdk` compartido.
- Tools Mongo arbitrarias o acceso libre del LLM a colecciones.
- Aliases legacy de DeepSeek y modelos económicos alternativos.
- Sesiones revocables almacenadas en Mongo.
- Redis como requisito de corrección.

## 4. Estado inicial y tratamiento de archivos existentes

La implementación debe comenzar desde el contenido actual, pero no debe asumir
que los restos de `bun init` forman parte del diseño:

- Se conserva `initial.md` como registro del pedido original.
- Se reemplazan `package.json`, `bun.lock`, `index.ts` y `tsconfig.json` cuando
  la etapa de bootstrap lo requiera.
- Se revisa `README.md` y se sustituye por la introducción real del scaffold.
- Se reemplaza el contenido contradictorio de `CLAUDE.md`; el archivo final
  debe indicar que `AGENTS.md` se lee antes de realizar cualquier tarea.
- Las cuatro configuraciones Nginx específicas de VisionSanar no se copian como
  configuración productiva. Se usan como referencia para generar archivos
  genéricos y se eliminan los nombres, hosts y puertos de ese producto.
- `.agents/` y `skills-lock.json` se evalúan durante el bootstrap. Solo se
  conservan si forman parte deliberada de la experiencia de desarrollo del
  scaffold.

La primera implementación debe mostrar el diff de cada archivo descartado o
reemplazado y no debe borrar `initial.md`.

## 5. Arquitectura objetivo

```text
.
├── apps/
│   ├── api/
│   ├── agent/
│   ├── webapp/
│   └── backoffice/
├── packages/
│   ├── api-client/
│   ├── contracts/
│   ├── eslint-config/
│   ├── typescript-config/
│   └── ui/
├── docs/
│   └── PLAN-SCAFFOLDING-v0.md
├── nginx/
│   ├── api.example.com.conf
│   ├── backoffice.example.com.conf
│   ├── example.com.conf
│   └── snippets/
├── .github/
│   └── workflows/
├── AGENTS.md
├── CLAUDE.md
├── GUIDE.md
├── CHANGELOG.md
├── README.md
├── build-all.sh
├── run-all.sh
├── run-dev-all.sh
├── bunfig.toml
├── package.json
├── turbo.json
└── bun.lock
```

### 5.1 Regla de dependencias

La dirección permitida es:

```text
apps/* ───────────────► packages/*

apps/webapp ──HTTP────► apps/api
apps/backoffice ─HTTP─► apps/api
apps/api ──HTTP interno autenticado──► apps/agent

apps/* ───────X───────► apps/*
packages/* ───X───────► apps/*
```

Una aplicación nunca importa código fuente de otra aplicación. Compartir tipos
no justifica romper esa frontera: el contrato debe moverse a
`@stock42/contracts`.

### 5.2 Procesos

- `apps/api`: servidor público de API y WebSocket.
- `apps/webapp`: servidor Next.js para usuarios de tenant.
- `apps/backoffice`: servidor Next.js para administración.
- `apps/agent`: aplicación privada con varios entrypoints operativos:
  servidor interno, launcher, supervisor y procesos de ejecución.

Que `apps/agent` tenga más de un entrypoint no lo convierte en varias apps. El
dominio, la persistencia y el runtime continúan siendo propiedad de una sola
aplicación.

Todo directorio bajo `apps/*` es, por definición, un proceso ejecutable. Por
eso debe responder a `bun run build`, `bun run start` y `bun run dev`. Un
workspace que no pueda iniciar un proceso pertenece a `packages/*`, no a
`apps/*`.

## 6. Bun y Turborepo

### 6.1 Workspace

El `package.json` raíz debe:

- declarar `private: true`;
- fijar una versión explícita de Bun en `packageManager`;
- declarar `workspaces` para `apps/*` y `packages/*`;
- definir un catálogo de versiones comunes;
- delegar las tareas recursivas a `turbo run`;
- evitar dependencias de aplicación en la raíz.

`bunfig.toml` debe seleccionar instalaciones aisladas. Las dependencias internas
se declaran con `workspace:*`.

El catálogo debe centralizar únicamente versiones realmente compartidas, por
ejemplo TypeScript, Zod, React, Next.js, ESLint, Playwright y tipos de Node/Bun.
No se crea un catálogo masivo que oculte las dependencias específicas de cada
workspace.

### 6.2 Contrato uniforme de scripts por app

El contrato obligatorio es:

| App | `build` | `start` | `dev` |
| --- | --- | --- | --- |
| `apps/webapp` | `next build` | `next start` | `next dev` |
| `apps/backoffice` | `next build` | `next start` | `next dev` |
| `apps/api` | No-op exitoso | Bun sobre `src/index.ts` | Bun hot/watch sobre `src/index.ts` |
| `apps/agent` | No-op exitoso | Coordinador Bun de todos sus entrypoints | Coordinador Bun en modo desarrollo |

Los manifests de API y agente deben usar el mismo no-op Bun explícito:

```json
{
  "scripts": {
    "build": "bun -e \"process.exit(0)\""
  }
}
```

No se usa `bun build`, `tsc` con emit, bundlers ni un `outdir` para API o
agente. `check-types`, lint y tests siguen siendo gates reales e independientes
del no-op de build.

La API ejecuta el source:

```json
{
  "scripts": {
    "build": "bun -e \"process.exit(0)\"",
    "start": "bun run src/index.ts",
    "dev": "bun --hot src/index.ts"
  }
}
```

El agente expone un coordinador pequeño que inicia su servidor interno,
launcher y supervisor:

```json
{
  "scripts": {
    "build": "bun -e \"process.exit(0)\"",
    "start": "bun run src/entrypoints/all.ts",
    "dev": "bun --hot src/entrypoints/all.ts"
  }
}
```

El coordinador no compila nada. Inicia procesos desde source, propaga señales,
detiene todos los hijos cuando uno falla y devuelve el exit code causante.

Los paquetes internos son JIT o configuración y no están obligados a declarar
`build`, `start` o `dev`. En particular, un package nunca recibe scripts
ficticios para satisfacer un launcher de apps.

### 6.3 Launchers raíz

El diseño combina lo mejor de los scripts auditados:

- Farmasun aporta la allowlist explícita de webapps y el lifecycle de PIDs.
- VisionSanar aporta la separación `build-all.sh`, `run-all.sh` y
  `run-dev-all.sh`, además de la regla comprobada de que una librería nunca
  debe vivir bajo `apps/*`.
- Capacitar aporta validación previa de Bun y manifests, fail-fast y cleanup
  cuando un proceso termina.
- RastreaSalud aporta `--build` y la verificación de `.next/BUILD_ID` antes de
  usar `next start`.

No se copian los builds de API, launcher o supervisor encontrados en algunos de
esos repositorios. En este scaffold esos procesos siempre ejecutan TypeScript
directamente con Bun.

Los tres archivos son ejecutables y usan Bash estricto, raíz resuelta desde
`BASH_SOURCE`, validación de Bun y paths absolutos derivados de la raíz. No
dependen del directorio desde el cual los invoque el usuario.

#### `build-all.sh`

- compila exclusivamente `apps/webapp` y `apps/backoffice`;
- usa una allowlist explícita, nunca un glob `apps/*`;
- valida que ambas tengan `package.json`;
- delega cada build al script del package a través de Turborepo o del filtro de
  Bun;
- falla si una webapp falla;
- nunca ejecuta el `build` de API o agente;
- nunca genera ni busca `dist` para API o agente;
- imprime un resumen final claro.

El `package.json` raíz expone `build` con filtros explícitos:

```json
{
  "scripts": {
    "build": "turbo run build --filter=@stock42/webapp --filter=@stock42/backoffice"
  }
}
```

`build-all.sh` puede delegar a `bun run build`, manteniendo la allowlist tanto
en el script raíz como en el comando Turbo. Agregar una nueva webapp exige
actualizar deliberadamente ambas listas.

#### `run-all.sh`

- inicia las cuatro apps en modo producción mediante su propio `bun run start`;
- mantiene una lista explícita de `api`, `agent`, `webapp` y `backoffice`;
- verifica antes de iniciar que cada app tenga `package.json` y script `start`;
- por defecto exige `.next/BUILD_ID` solo para webapp y backoffice;
- acepta `--build` para ejecutar `build-all.sh` antes de iniciar;
- nunca exige artefactos compilados a API o agente;
- conserva PIDs, propaga `INT` y `TERM`, espera la salida y limpia todos los
  procesos;
- si una app termina o falla, detiene las demás y devuelve su exit code;
- no publica ni inicia Nginx.

#### `run-dev-all.sh`

- inicia las cuatro apps mediante su propio `bun run dev`;
- no ejecuta ningún build previo;
- mantiene la misma lista explícita que `run-all.sh`;
- aplica la misma propagación de señales, espera y cleanup;
- es el comando recomendado para desarrollo integral local.

Los scripts raíz pueden exponer:

```json
{
  "scripts": {
    "build": "turbo run build --filter=@stock42/webapp --filter=@stock42/backoffice",
    "start": "./run-all.sh",
    "dev": "./run-dev-all.sh"
  }
}
```

La lógica de cada aplicación permanece en su `package.json`; los launchers solo
validan, coordinan y gestionan el ciclo de vida de procesos.

### 6.4 Pipeline Turbo

Las tareas base serán:

- `dev`: persistente, sin caché.
- `start`: persistente, sin caché y sin build implícito.
- `build`: depende de `^build`, pero el comando raíz lo filtra a las dos
  webapps.
- `check-types`: depende de los `check-types` de sus dependencias, no de todos
  los builds.
- `lint`: depende de los `lint` de sus dependencias, no de todos los builds.
- `test`: ejecuta tests no E2E y conserva outputs de cobertura si se habilitan.
- `test:api`: integración HTTP de la API.
- `test:e2e`: Playwright.
- `boundaries`: valida límites entre apps y packages.
- `format:check`: valida formato sin mutar archivos.

Outputs mínimos:

- Next.js: `.next/**`, excluyendo `.next/cache/**` y `.next/dev/**`.
- Cobertura: `coverage/**` solo para tareas que la produzcan.
- Playwright: `playwright-report/**` y `test-results/**`.

No se declara `dist/**` como output general porque API, agente y packages no se
compilan. Los paquetes compartidos usan TypeScript JIT y son consumidos por el
bundler de las webapps o directamente por Bun.

Las variables de entorno se declaran por tarea y por workspace. No se mantiene
una lista global sobredimensionada en `turbo.json`. La caché nunca debe capturar
secretos o resultados dependientes de secretos como si fueran equivalentes.

### 6.5 Boundaries

Se aplican dos controles complementarios:

1. Boundaries de Turborepo para modelar tags y dependencias permitidas.
2. Reglas ESLint o un script pequeño para prohibir imports desde `apps/*` hacia
   otra app.

El control debe detectar tanto aliases como rutas relativas. La regla se
considera satisfecha solo si un test negativo demuestra que un import
`apps/api` → `apps/agent/src/...` falla.

## 7. Configuración y secretos

### 7.1 Reglas

- Nunca crear `.env.local`.
- No usar un `.env` raíz como fuente implícita para todas las apps.
- Cada aplicación documenta sus variables en su propio `.env.example`.
- Los secretos reales se inyectan en runtime o mediante el mecanismo de
  despliegue del proyecto consumidor.
- Los valores de ejemplo nunca contienen credenciales utilizables.
- Los logs y errores sanitizan cookies, authorization headers, tokens,
  contraseñas, bodies sensibles y secretos de proveedores.

### 7.2 Variables por aplicación

`apps/api` será dueño de variables como:

- puerto y host;
- URI y nombre de la base Mongo existente;
- orígenes CORS;
- secretos de firma de acceso, refresh, CSRF y tickets WebSocket;
- URL y service token del agente;
- límites configurables por actor y tenant.

`apps/agent` será dueño de:

- puerto y host interno;
- MongoDB configurado;
- service token interno;
- clave DeepSeek;
- modelo `deepseek-v4-pro`;
- parámetros de launcher, heartbeat, supervisor y concurrencia;
- credenciales Telegram;
- storage path de uploads y artifacts;
- relay opcional de eventos, si el proyecto lo habilita.

Las aplicaciones Next.js exponen al browser solo variables deliberadamente
públicas. La URL interna de la API, cookies y service tokens permanecen en el
runtime del servidor Next.

## 8. Contratos compartidos

`@stock42/contracts` contiene exclusivamente:

- esquemas Zod;
- tipos inferidos de esos esquemas;
- envelopes de respuestas;
- códigos de error públicos;
- contratos de autenticación;
- contratos de tenants, administradores, operadores y usuarios;
- contratos API → agente;
- contratos de eventos y tickets WebSocket;
- contratos de uploads, artifacts y confirmations.

No contiene:

- acceso MongoDB;
- llamadas HTTP;
- lógica de negocio;
- acceso a variables de entorno;
- código de runtime del agente;
- componentes React.

Cada entrada pública se exporta desde el `package.json` del paquete. Las apps no
deben importar rutas internas del paquete.

## 9. API con s42-core

### 9.1 Estructura prevista

```text
apps/api/
├── src/
│   ├── boot/
│   │   ├── index.ts
│   │   ├── migrations.ts
│   │   └── test-seeds.ts
│   ├── config/
│   ├── errors/
│   ├── mongodb/
│   │   └── MongoDBStorage.ts
│   ├── modules/
│   │   ├── health/
│   │   ├── auth/
│   │   ├── administrators/
│   │   ├── tenants/
│   │   ├── operators/
│   │   ├── users/
│   │   └── agent/
│   ├── websocket/
│   └── index.ts
├── test/
└── package.json
```

Los módulos se nombran por capacidad y nunca usan prefijos del proyecto como
`rs-`, `cai-`, `vs-` o similares.

### 9.2 Convención de módulo

Un módulo puede contener, solo cuando corresponda:

```text
modules/users/
├── manifest.ts
├── controllers/
├── models/
├── services/
└── tests/
```

No se obliga a crear todos esos directorios. Un módulo sencillo puede tener un
manifest, un controller y un storage. No se crean repositories, use cases,
ports, adapters, factories o buses por convención.

### 9.3 Rutas

Cada operación tiene método y path explícitos. Ejemplos:

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/ws-tickets/create`
- `POST /administrators/create`
- `GET /tenants`
- `POST /tenants/create`
- `GET /tenants/:id`
- `PATCH /tenants/:id/update`
- `POST /tenants/:id/operators/create`
- `GET /tenants/:id/operators`
- `POST /tenants/:id/users/create`
- `GET /tenants/:id/users`
- `POST /agent/runs/create`
- `POST /agent/runs/:id/cancel`
- `POST /agent/confirmations/:id/approve`
- `POST /agent/confirmations/:id/reject`

La allowlist de autenticación se define por combinación exacta de método y
path. No se decide acceso mediante coincidencias parciales inseguras.

### 9.4 Integración con s42-core

- Se usa la versión publicada y fijada en el manifest.
- Los manifests de módulo se validan con Zod.
- La secuencia crítica de boot no depende del campo metadata `dependencies` de
  los módulos, porque ese campo no impone orden de inicialización.
- No se intenta importar el `MongoDBStorage` interno de `s42-core`.
- El WebSocket usa directamente la capacidad de `Bun.serve` dentro de la API,
  respetando el mismo listener.
- Se encapsulan o corrigen en el borde de la aplicación las limitaciones
  conocidas de CORS y cierre del servidor, sin forking del framework.

## 10. MongoDB y modelos

### 10.1 Documento plano

Los documentos usan campos de primer nivel. La forma base será:

```text
uuid
tenantId, cuando corresponda
createdAt
updatedAt
version
campos del dominio
```

No se usa el envelope histórico `{ data, uuid, _added, _v, _n }`.

`_id` sigue siendo responsabilidad de MongoDB. `uuid` es la identidad pública y
estable. Las respuestas HTTP nunca filtran campos internos no declarados por su
schema.

### 10.2 Model

Cada `Model`:

- recibe y valida datos con Zod;
- define los getters y setters necesarios;
- controla la forma serializable del documento;
- mantiene invariantes pequeñas del dato;
- no abre conexiones;
- no conoce HTTP;
- no funciona como service locator.

El patrón de referencia es
`apps/api/modules/email-campaign/models/CampaignModel.ts` de Farmasun, adaptado a
documentos planos y al naming del scaffold.

### 10.3 MongoDBStorage

La clase base:

- recibe una colección Mongo explícita;
- implementa solo operaciones repetidas y seguras;
- trabaja con modelos y documentos planos;
- no inventa filtros de negocio;
- no contiene fallbacks de testing;
- no ejecuta queries ilimitadas por defecto;
- no crea índices globales por conocimiento de todos los módulos;
- no permite `$out` ni `$merge` desde entradas externas.

Cada storage de dominio extiende esa clase y añade únicamente queries que el
módulo necesita. El patrón de referencia es
`apps/api/modules/email-campaign/services/campaign-storage.ts` de Farmasun.

### 10.4 Índices y tenancy

Cada módulo es propietario de sus índices. Como mínimo se evaluarán:

- unicidad de email normalizado por ámbito;
- unicidad de slug o identificador externo del tenant;
- búsquedas por `tenantId`;
- listados paginados por `tenantId` y estado;
- TTL solo para datos realmente efímeros, como tickets WebSocket;
- claim y heartbeat del runtime agéntico;
- secuencia y replay de eventos del agente.

Todo query de datos tenant-scoped debe recibir `tenantId` desde un contexto
autorizado, no desde una selección libre del body.

## 11. Boot

El boot conserva la idea de RastreaSalud, pero reduce el acoplamiento.

Orden previsto:

1. Validar configuración con Zod y detenerse ante ausencias.
2. Crear el cliente Mongo y verificar conectividad.
3. Construir el contexto compartido de la API.
4. Ejecutar migraciones pendientes de forma idempotente.
5. Pedir a cada módulo que asegure sus colecciones e índices.
6. Ejecutar seeds de test solo si están habilitados de forma explícita.
7. Construir y registrar módulos `s42-core`.
8. Preparar el gateway interno hacia el agente.
9. Preparar tickets, upgrade y registry WebSocket.
10. Iniciar el listener.
11. Exponer readiness solo cuando las dependencias obligatorias estén listas.

Características obligatorias:

- pasos nombrados y logs con duración;
- reejecución segura;
- errores fatales visibles;
- ningún administrador o dataset de negocio creado de forma implícita;
- migraciones con identificador y registro de ejecución;
- mecanismo de cierre testeable dentro de las capacidades disponibles.

## 12. Modelo de tenancy e identidad

### 12.1 Actores

| Actor | Ámbito | Responsabilidad base |
| --- | --- | --- |
| Administrador de plataforma | Global | Crear y administrar tenants |
| Owner de tenant | Un tenant | Administrar su tenant y sus operadores |
| Operador | Un tenant | Operar capacidades habilitadas del tenant |
| Usuario | Un tenant | Usar la webapp y recursos propios |

El owner es una especialización autorizada de operador, no una segunda
infraestructura de autenticación. El tenant mantiene una referencia inequívoca
a su owner actual.

### 12.2 Entidades mínimas

- `administrators`: identidad, estado, credenciales y rol global.
- `tenants`: identidad, estado, owner, configuración mínima y timestamps.
- `operators`: tenant, identidad, estado y rol `owner` u `operator`.
- `users`: tenant, identidad, estado y perfil de usuario.

No se incorporan entidades de negocio específicas de un producto.

### 12.3 Reglas mínimas

- Solo un administrador de plataforma puede crear un tenant.
- Crear un tenant y asignar su owner es una operación idempotente y auditable.
- Un owner solo administra su tenant.
- Un operador nunca cambia de tenant por un parámetro del cliente.
- Un usuario pertenece a un tenant y autentica en la webapp.
- Emails y otras identidades se normalizan antes de indexar.
- Un actor inactivo no obtiene ni renueva credenciales.
- Toda respuesta y evento conserva separación de tenant.

### 12.4 Backoffice

El backoffice debe incluir bases navegables y funcionales para:

- login de administradores y operadores;
- listado y alta de tenants para administradores;
- detalle y estado del tenant;
- asignación del owner;
- listado, alta y estado de operadores;
- listado, alta y estado de usuarios del tenant;
- logout y renovación de sesión;
- estados de carga, vacío, error y acceso denegado.

La navegación se adapta al ámbito del actor. Un administrador ve plataforma y
tenants; un owner u operador ve únicamente su tenant y sus capacidades.

### 12.5 Webapp

La webapp debe incluir:

- login de usuario;
- renovación y logout;
- recuperación de la identidad actual;
- shell autenticado;
- página inicial protegida;
- manejo de sesión vencida y acceso denegado.

No incluye funcionalidades de negocio ajenas al scaffold.

## 13. Autenticación y seguridad

### 13.1 Cookies y tokens

- Access y refresh se transportan en cookies `HttpOnly`.
- En producción se usa `Secure`.
- `SameSite` y `Path` se declaran explícitamente.
- El borrado repite exactamente `Path` y `Domain` usados al crear la cookie.
- El refresh se rota en cada renovación exitosa.
- El endpoint de refresh devuelve también un nuevo token CSRF ligado al nuevo
  contexto de autenticación.
- Los tiempos de vida son configurables y tienen defaults conservadores.

No se almacenan sesiones revocables en Mongo. Por lo tanto, v0 no puede
garantizar detección de reutilización de un refresh robado ni revocación
individual multi-dispositivo. Logout borra cookies del cliente, pero un token
filtrado puede conservar validez hasta expirar. Esta limitación debe quedar
documentada en `GUIDE.md` y cubierta por expiraciones cortas, rotación de
emisión y protección estricta de cookies. Cambiar este compromiso requiere una
decisión posterior.

### 13.2 CSRF

Se usa `Bun.CSRF`:

- la generación y verificación se ligan al identificador firmado del contexto
  de refresh;
- el secreto de producción es explícito y compartido por todas las instancias;
- no se acepta el secreto aleatorio por thread como configuración productiva;
- el browser envía el token en un header dedicado;
- login, refresh, logout y toda mutación autenticada por cookie se evalúan;
- una rotación de refresh invalida el binding CSRF anterior.

### 13.3 CORS

La configuración admite una allowlist y el default solicitado de aceptar todos
los orígenes. Su implementación debe respetar el protocolo:

- nunca combinar el valor literal `Access-Control-Allow-Origin: *` con
  credenciales;
- cuando `allow all` y cookies estén habilitados, reflejar el `Origin` recibido,
  emitir `Vary: Origin` y aplicar el resto de controles;
- permitir métodos y headers explícitos;
- rechazar origins malformados y `Origin: null` salvo habilitación deliberada;
- recomendar una allowlist concreta para despliegues productivos en `GUIDE.md`.

### 13.4 Errores y logs

Un handler central:

- genera un identificador de error;
- devuelve códigos y mensajes sanitizados al cliente;
- registra en consola el error completo, stack, causa y metadata segura de la
  request;
- nunca imprime authorization headers, cookies, tokens, passwords, secrets ni
  payloads sensibles completos;
- distingue errores esperados de validación y autorización de fallos internos.

“Loguear todo” significa conservar toda la información diagnóstica del error y
su contexto seguro, no filtrar secretos.

### 13.5 Rate limit

- configurable por entorno;
- particionado por actor autenticado y tenant;
- por IP solo cuando todavía no existe identidad;
- políticas distintas para login, refresh, uploads, agente y WebSocket;
- headers claros de límite y retry;
- memoria local aceptable para desarrollo de una instancia;
- backend distribuido exigido antes de escalar horizontalmente.

### 13.6 API → agente

- el agente escucha en loopback o red privada;
- cada request usa un service token;
- se valida audiencia, firma o token, timestamp e idempotency key;
- Nginx no publica el agente;
- los errores internos no cruzan sin sanitización hacia el cliente final.

## 14. Aplicaciones Next.js

### 14.1 Creación

Cada aplicación se genera inicialmente con:

```text
bun create next-app@latest <nombre>
```

Luego se normaliza para el workspace, se fijan versiones desde el catálogo y se
eliminan ejemplos no usados.

### 14.2 App Router y BFF

Se usa App Router. Los Route Handlers actúan como BFF cuando la operación
necesita cookies server-side, protección CSRF o traducción del contrato API.

Ejemplos válidos:

```text
app/api/auth/login/route.ts
app/api/auth/refresh/route.ts
app/api/auth/logout/route.ts
app/api/auth/me/route.ts
app/api/tenants/create/route.ts
app/api/tenants/[id]/route.ts
app/api/tenants/[id]/operators/create/route.ts
```

Ejemplos prohibidos:

```text
app/api/[...path]/route.ts
app/api/[[...slug]]/route.ts
pages/api/*
```

Cada handler:

- valida input y output con contratos Zod;
- llama a `@stock42/api-client`;
- filtra headers;
- propaga solo cookies esperadas;
- preserva status codes útiles;
- no se convierte en un proxy catch-all.

### 14.3 UI compartida

`@stock42/ui`:

- se inicializa con shadcn `base-nova`;
- posee su `components.json`;
- exporta componentes desde entradas públicas;
- no importa código de las apps;
- contiene primitives y patrones realmente compartidos;
- conserva estilos y tokens compatibles con ambas aplicaciones.

Cada app tiene su propio `components.json`, aliases correctos y estilos globales.
Los componentes específicos de una pantalla permanecen en la app; no todo debe
promoverse a `packages/ui`.

## 15. API client

`@stock42/api-client` ofrece clientes tipados para runtime servidor y, cuando sea
seguro, browser.

Responsabilidades:

- construir URLs y requests con paths explícitos;
- validar bodies de respuesta;
- propagar correlation IDs;
- manejar respuestas no JSON;
- filtrar headers hop-by-hop;
- representar errores API sin asumir que toda respuesta es JSON;
- recibir cookies desde los BFF sin almacenarlas globalmente.

No contiene estado de sesión global, componentes React ni conocimiento de
MongoDB.

## 16. Runtime agéntico completo

### 16.1 Propiedad y estructura

Toda la lógica queda dentro de `apps/agent`:

```text
apps/agent/src/
├── http/
├── orchestration/
├── runtime/
│   ├── contracts/
│   ├── launcher/
│   ├── process/
│   ├── store/
│   └── supervisor/
├── providers/
│   └── deepseek/
├── tools/
│   ├── registry/
│   ├── domain/
│   ├── telegram/
│   ├── documents/
│   ├── uploads/
│   └── artifacts/
└── entrypoints/
    ├── all.ts
    ├── server.ts
    ├── launcher.ts
    └── supervisor.ts
```

Los entrypoints comparten código interno, pero ningún otro workspace importa
esos archivos.

`all.ts` es el coordinador operativo invocado por los scripts `start` y `dev`
del package. No reemplaza al launcher durable de runs: solo inicia y supervisa
los entrypoints de la app. Todos ellos se ejecutan desde TypeScript con Bun, sin
un paso de compilación.

### 16.2 Persistencia durable

MongoDB es la fuente de verdad. Colecciones mínimas:

- conversaciones;
- mensajes;
- runs;
- eventos de run y tool;
- confirmations;
- procesos y heartbeats;
- uploads;
- artifacts;
- entregas externas, cuando Telegram u otro efecto lo requiera.

Cada run tiene:

- `uuid`, `tenantId`, actor y conversation;
- manifest o tipo de tarea;
- estado;
- idempotency key;
- input validado;
- intentos y política de retry;
- timestamps de enqueue, claim, inicio, progreso y finalización;
- proceso asignado;
- motivo terminal sanitizado;
- secuencia monotónica de eventos.

### 16.3 Estados

El lifecycle mínimo:

```text
queued
starting
running
waiting
cancel_requested
succeeded
failed
cancelled
timed_out
killed
crashed
```

Solo las transiciones declaradas son válidas. Marcar terminal es idempotente.
El sistema distingue cancelación pedida, proceso terminado y proceso muerto.

### 16.4 Manifest

Cada tipo de trabajo tiene un manifest Zod con:

- identidad y versión;
- clase `tool` o `subagent`;
- schema de input y output;
- nivel de acción `A0`, `A1`, `A2` o `A3`;
- allowlist de variables de entorno;
- intervalos de heartbeat y progreso significativo;
- timeout máximo;
- período de gracia de cancelación;
- concurrencia global y por tenant;
- política de retry;
- eventos permitidos.

El manifest nunca habilita automáticamente acceso Mongo o secretos.

### 16.5 Launcher

El launcher:

- reclama runs con una operación atómica;
- respeta concurrencia global y por tenant;
- evita ejecutar dos veces la misma idempotency key;
- crea el proceso mediante `Bun.spawn`;
- entrega solo un entorno allowlisted;
- adjunta PID e identidad de proceso;
- registra el inicio o revierte el claim de forma segura;
- no depende del directorio de trabajo de otra app.

### 16.6 Proceso de ejecución

Cada proceso:

- carga un único run;
- valida otra vez su input;
- emite heartbeat;
- registra progreso significativo;
- ejecuta el orchestration loop;
- persiste mensajes y tool events;
- atiende cancelación;
- finaliza con un estado terminal y output validado;
- no confía en argumentos sin verificar.

### 16.7 Supervisor

El supervisor:

- proyecta salud desde heartbeat, progreso y estado del proceso;
- detecta start timeout, inactivity timeout y deadline total;
- pide `SIGTERM` primero;
- usa `SIGKILL` solo después del grace period;
- recolecta PIDs huérfanos;
- distingue crash, timeout, kill y cancelación;
- puede reanudar o reintentar según manifest;
- nunca marca éxito basándose solo en exit code si falta output válido.

### 16.8 Replay y transporte de eventos

Los eventos durables tienen cursor y secuencia. Un cliente puede pedir todos los
eventos posteriores a un cursor.

La primera implementación funciona con MongoDB y HTTP interno. Puede añadirse
un relay Redis para baja latencia cuando exista `REDIS_URL`, pero:

- Redis no es fuente de verdad;
- perder un mensaje de relay no pierde el evento;
- reconectar usa replay desde MongoDB;
- no configurar Redis no impide ejecutar el runtime.

## 17. DeepSeek

### 17.1 Modelo

- Modelo único: `deepseek-v4-pro`.
- No usar `deepseek-chat`, `deepseek-reasoner` ni `deepseek-v4-flash`.
- Thinking se habilita explícitamente cuando el endpoint lo permita.
- `reasoning_effort` usa `high` como default y puede elevarse a `max` para
  manifests expresamente configurados.
- El modelo y thinking quedan registrados en metadata del run.

### 17.2 Tool calls

El loop debe preservar `reasoning_content` entre la respuesta que solicita
tools y la continuación posterior. Omitir ese contenido rompe el contrato del
modo razonador.

Cada iteración:

1. valida la respuesta del proveedor;
2. persiste texto, razonamiento permitido y tool calls según la política de
   datos;
3. autoriza cada tool;
4. ejecuta o crea una confirmation;
5. agrega resultados sanitizados;
6. continúa conservando el contexto requerido por DeepSeek;
7. limita cantidad de pasos, tiempo y tokens.

Los logs no imprimen prompts o reasoning sensibles completos por defecto.

## 18. Tools, confirmations y efectos

### 18.1 Clasificación

| Clase | Semántica | Ejecución |
| --- | --- | --- |
| Read | Sin efecto externo relevante | Automática si está autorizada |
| Write | Modifica estado dentro del ámbito esperado | Requiere autorización del actor y auditoría |
| Critical | Efecto sensible, costoso o irreversible | Requiere confirmation explícita |

La clasificación del manifest no puede degradarse por decisión del modelo.

### 18.2 Registry

Cada tool declara:

- nombre estable;
- descripción;
- input y output Zod;
- clase de acción;
- permisos requeridos;
- ámbitos de tenant;
- timeout;
- política de retry e idempotencia;
- función ejecutora.

No existe una tool genérica para `find`, `aggregate`, `update` o `delete` sobre
MongoDB. Las tools son operaciones de dominio acotadas.

### 18.3 Confirmations

- almacenadas en MongoDB;
- ligadas a run, actor, tenant, tool e input hasheado;
- expiran;
- solo se resuelven una vez;
- aprobar no permite cambiar argumentos;
- rechazar devuelve un resultado explícito al loop;
- el API verifica que quien confirma tenga autoridad.

### 18.4 Telegram

La integración inicial contempla:

- envío de mensajes;
- entrega idempotente;
- reintentos acotados;
- registro del identificador externo;
- redacción de token en logs;
- clasificación write o critical según el destino y contenido.

No se incluye un webhook público genérico sin autenticación.

### 18.5 PDF y CSV

- generación desde estructuras validadas, no desde comandos arbitrarios;
- encoding y delimitadores explícitos para CSV;
- límites de filas, tamaño y tiempo;
- HTML o templates controlados para PDF;
- resultados almacenados como artifacts;
- metadata con MIME, tamaño, hash, owner y tenant.

### 18.6 Uploads y artifacts

MongoDB guarda metadata, no blobs base64.

El baseline usa filesystem local configurable para bytes y un storage interno
con:

- nombre generado, nunca confiado desde el cliente;
- aislamiento por tenant;
- límite de tamaño;
- allowlist de MIME y validación real;
- hash;
- estado de procesamiento;
- acceso autenticado mediante la API;
- protección contra path traversal;
- cleanup explícito.

Un adaptador S3 puede agregarse después, pero no se abstrae antes de necesitarlo.

## 19. Integración API → agente

El módulo `agent` de `apps/api`:

- valida el request público;
- resuelve actor y tenant;
- genera idempotency key;
- llama por HTTP al servidor interno de `apps/agent`;
- nunca importa código del agente;
- traduce errores internos a contratos públicos;
- expone cancelación, confirmaciones, estado y replay.

El servidor interno del agente:

- autentica service token;
- valida contratos Zod;
- no acepta selección arbitraria de tenant;
- expone health y readiness privados;
- permite enqueue, status, cancel, confirm y events-after-cursor;
- puede ofrecer un stream interno de eventos con reconexión y cursor.

## 20. WebSocket

### 20.1 Endpoint

`/ws` vive en `apps/api` y usa el mismo `Bun.serve` y puerto que HTTP.

Flujo:

1. El cliente autenticado solicita
   `POST /auth/ws-tickets/create`.
2. La API crea un ticket firmado, de vida corta y uso único.
3. El cliente conecta a `/ws` con el ticket.
4. El upgrade valida firma, expiración, origin, actor, tenant y consumo único.
5. El servidor adjunta contexto autorizado a la conexión.

Los tickets consumidos se registran de forma atómica. Si se usa TTL en Mongo,
la colección pertenece al módulo WebSocket y no se trata como una sesión de
autenticación general.

### 20.2 Capacidades

- schemas Zod para todos los mensajes;
- subscribe y unsubscribe por canales autorizados;
- aislamiento tenant;
- canales de progreso del agente;
- ping/pong y detección de conexiones muertas;
- límites de payload;
- backpressure y límite de cola;
- rate limit de mensajes y suscripciones;
- cantidad máxima de canales por socket;
- correlation IDs;
- cleanup al cerrar;
- códigos de cierre deliberados;
- compresión deshabilitada por defecto;
- validación de Origin;
- replay durable por cursor mediante HTTP/MongoDB.

El WebSocket no es fuente de verdad. Después de una reconexión, el cliente usa
el cursor para recuperar eventos faltantes.

## 21. Nginx

### 21.1 Superficies públicas

- `example.com` → `apps/webapp` en loopback.
- `backoffice.example.com` → `apps/backoffice` en loopback.
- `api.example.com` → `apps/api` en loopback.
- `apps/agent` no tiene virtual host público.

Los puertos son placeholders coherentes y documentados en `GUIDE.md`.

### 21.2 Configuración requerida

- upstreams o `proxy_pass` a loopback;
- forwarding de `Host`, IP y protocolo;
- `map $http_upgrade` para WebSocket;
- upgrade de `/ws` únicamente hacia la API;
- timeouts adecuados para HTTP y WebSocket;
- límites de body coherentes con uploads;
- buffering deliberado;
- headers de seguridad compatibles con cada app;
- logs separados;
- health endpoints utilizables;
- ausencia de dominios VisionSanar;
- ausencia de certificado y path privado hardcodeado.

El baseline HTTP debe ser válido por sí mismo. TLS se documenta como integración
del despliegue y puede incorporarse con un snippet local administrado fuera del
repositorio.

### 21.3 Regla de mantenimiento

`AGENTS.md` debe ordenar revisar y actualizar `nginx/` cuando una tarea cambie:

- apps públicas;
- dominios;
- puertos;
- paths;
- WebSocket;
- timeouts;
- límites de body;
- health checks;
- headers de proxy.

Una tarea con cualquiera de esos cambios no está completa si Nginx queda
desactualizado.

## 22. Tests

### 22.1 Capas

1. `bun:test` para schemas, models, storages, servicios, auth, tools y runtime.
2. Tests HTTP contra la API `s42-core` realmente levantada.
3. Tests de integración API → agente contra procesos reales controlados.
4. Playwright sobre webapp y backoffice.
5. Tests de Nginx mediante validación sintáctica cuando Nginx esté disponible.

Los proveedores externos, como DeepSeek y Telegram, se reemplazan por servidores
fake de contrato. MongoDB no se reemplaza.

### 22.2 Base de datos existente

Los tests:

- reciben la URI y el nombre exacto de una base ya existente;
- nunca derivan un nombre nuevo;
- nunca llaman `dropDatabase`;
- nunca crean un servidor Mongo;
- nunca usan MongoMemoryServer;
- fallan si falta configuración;
- fallan si el entorno no está marcado como autorizado para tests;
- crean solo fixtures con un `testRunId` único;
- trabajan dentro de un tenant de test autorizado;
- limpian únicamente documentos que contengan ese `testRunId`;
- verifican el filtro antes de cualquier borrado;
- preservan datos ajenos incluso si una suite falla;
- implementan cleanup recuperable al siguiente run.

Los índices forman parte de la base real. El boot puede asegurarlos de forma
idempotente, pero no crea otra base.

### 22.3 API

La suite HTTP debe cubrir:

- health y readiness;
- validación de schemas;
- login, refresh, logout y CSRF;
- separación por actor y tenant;
- alta y administración de tenants;
- owner y operadores;
- usuarios;
- paginación y filtros;
- errores sanitizados;
- CORS;
- rate limits;
- agent enqueue, status, cancel y confirmation;
- upload y descarga autorizada;
- tickets WebSocket de un uso;
- handshake, suscripciones, aislamiento y replay;
- shutdown de procesos de test.

### 22.4 Playwright

Proyectos:

- Chromium desktop.
- Chromium mobile mediante emulación.

Flujos mínimos:

- login y logout de usuario en webapp;
- sesión expirada y renovación;
- login de administrador;
- creación de tenant;
- asignación de owner;
- creación y estado de operador;
- creación y estado de usuario;
- acceso denegado entre tenants;
- ejecución de agente y progreso visible;
- confirmation de una acción crítica;
- descarga de artifact;
- reconexión WebSocket con replay.

Playwright arranca procesos con comandos Bun. No usa `npm run dev`.

## 23. CI

El workflow de GitHub Actions:

1. checkout;
2. instalación de Bun fijado;
3. `bun install --frozen-lockfile`;
4. comprobación de formato;
5. boundaries;
6. check de tipos;
7. lint;
8. `bun audit`;
9. tests unitarios;
10. tests HTTP e integración;
11. `./build-all.sh`, que compila exclusivamente webapp y backoffice;
12. Playwright Chromium desktop/mobile;
13. publicación de artifacts de test ante fallos.

No se levanta un service container MongoDB porque eso contradiría la decisión de
usar la base existente. CI recibe secretos protegidos que apuntan a una base
preexistente y explícitamente autorizada para fixtures de CI. Si esa
configuración no existe, las suites dependientes de Mongo fallan cerradas; no
degradan a mocks.

Las ejecuciones desde forks no reciben secretos ni corren suites que necesiten
la base. El workflow debe distinguir esa condición de un test aprobado.

Turborepo puede usar caché remota cuando se configure, pero:

- no es requisito de v0;
- los secretos se declaran correctamente como inputs cuando alteren resultados;
- Playwright e integración con la base real no reutilizan resultados inseguros.

## 24. Archivos rectores

### 24.1 AGENTS.md

Debe contener, como mínimo:

- leer el propio `AGENTS.md` y los archivos equivalentes anidados;
- no crear `.env.local`;
- no ampliar alcance sin aprobación;
- sugerir mejoras y riesgos antes de implementarlos;
- verificar el worktree antes de cambiar;
- ejecutar `git pull --ff-only` antes de cada tarea;
- implementar solo lo pedido;
- validar proporcionalmente al riesgo;
- actualizar `CHANGELOG.md` en cada tarea;
- revisar Nginx ante todo cambio operativo relacionado;
- hacer commit obligatorio;
- hacer push obligatorio;
- no terminar con cambios de la tarea sin commitear o sin publicar;
- preservar cambios ajenos;
- no importar código entre apps;
- exigir `build`, `start` y `dev` en cada `apps/*/package.json`;
- compilar solo webapp y backoffice;
- mantener `build` como no-op en API y agente;
- revisar `build-all.sh`, `run-all.sh` y `run-dev-all.sh` cuando se agregue,
  elimine, renombre o cambie el comando de una app;
- usar Bun first, Next.js, shadcn, MongoDB, Zod y `s42-core`;
- prohibir DDD y arquitectura hexagonal;
- prohibir catch-all Route Handlers;
- prohibir bases de test nuevas o emuladas.

Para el primer commit de un repositorio remoto vacío se documenta la excepción:
no existe una rama materializada de la cual hacer pull. Después del bootstrap no
hay excepción.

### 24.2 CLAUDE.md

Debe ser breve y comenzar indicando que `AGENTS.md` se lee y se cumple antes de
cualquier acción. No debe mantener reglas contradictorias ni promover frontend
servido por Bun en lugar de Next.js.

### 24.3 GUIDE.md

Debe explicar:

- requisitos;
- instalación con Bun;
- comandos Turbo;
- uso de `build-all.sh`, `run-all.sh` y `run-dev-all.sh`;
- diferencia entre compilar webapps y ejecutar API/agente desde source;
- estructura y límites;
- configuración por app;
- cómo usar la base Mongo existente sin crear otra;
- boot y migraciones;
- roles y tenancy;
- auth, cookies y CSRF;
- cómo desarrollar webapp y backoffice;
- runtime del agente;
- tools y confirmations;
- uploads y artifacts;
- WebSocket;
- tests;
- Nginx;
- CI;
- cómo extender el scaffold sin romper sus reglas.

### 24.4 CHANGELOG.md

Se mantiene en formato Keep a Changelog simplificado, con sección
`[Unreleased]`. Cada tarea agrega su cambio de forma automática antes del
commit.

## 25. Etapas de implementación

Cada etapa es un cambio revisable. Antes de comenzarla se ejecuta
`git status`, se comprueba la rama y se hace `git pull --ff-only`. Al terminar:
validaciones de la etapa, `CHANGELOG.md`, commit y push.

### Etapa 0 — Bootstrap documental y limpieza controlada

Objetivo: convertir el directorio actual en la raíz deliberada del scaffold.

Acciones:

- preservar `initial.md`;
- inventariar el contenido no trackeado;
- reemplazar restos de `bun init` con archivos raíz mínimos;
- crear `AGENTS.md`, `CLAUDE.md`, `GUIDE.md` y README;
- crear `.gitignore` adecuado sin ocultar archivos de configuración requeridos;
- conservar este plan;
- no introducir aplicaciones todavía.

Criterios de aceptación:

- no existe `.env.local`;
- `initial.md` sigue presente e idéntico;
- CLAUDE remite a AGENTS;
- AGENTS contiene pull/changelog/commit/push y mantenimiento Nginx;
- el árbol raíz ya no afirma que Bun sirve el frontend;
- diff limitado al bootstrap.

### Etapa 1 — Workspace Bun y pipeline Turbo

Objetivo: establecer el sistema de paquetes y tareas.

Acciones:

- crear `package.json` raíz;
- configurar workspaces, catálogo y `workspace:*`;
- crear `bunfig.toml` con linker aislado;
- instalar Turborepo;
- crear `turbo.json`;
- definir tareas `build`, `start`, `dev` y outputs;
- fijar que el build raíz filtre únicamente webapp y backoffice;
- agregar chequeo inicial de boundaries;
- generar lockfile con Bun.

Criterios de aceptación:

- `bun install --frozen-lockfile` funciona después de generar el lockfile;
- `bun run turbo run build --dry` muestra el grafo esperado;
- no hay dependencias de app en root;
- el dry run de build no selecciona API ni agente;
- lint/types no fuerzan builds completos innecesarios;
- los límites detectan imports cruzados.

### Etapa 2 — Configuración y contratos compartidos

Objetivo: crear las bases reutilizables no visuales.

Acciones:

- crear `@stock42/typescript-config`;
- crear `@stock42/eslint-config`;
- crear `@stock42/contracts`;
- definir envelopes, errores, auth, tenancy, agente, uploads, artifacts y WS;
- agregar exports públicos;
- agregar tests de schemas.

Criterios de aceptación:

- cada paquete hace check de tipos de forma aislada;
- los consumers importan solo exports públicos;
- inputs inválidos fallan en tests;
- contracts no importa ninguna app ni runtime.

### Etapa 3 — shadcn y aplicaciones Next.js

Objetivo: materializar webapp y backoffice con UI compartida.

Acciones:

- crear ambas apps con `bun create next-app@latest`;
- migrarlas al workspace/catálogo;
- inicializar shadcn `base-nova`;
- crear `@stock42/ui`;
- configurar `components.json` y aliases;
- crear shells mínimos, tema y páginas de health visual;
- crear Route Handlers explícitos de ejemplo;
- declarar `build`, `start` y `dev` en ambas webapps;
- crear `build-all.sh` con allowlist exclusiva de webapp y backoffice;
- prohibir catch-all routes.

Criterios de aceptación:

- ambas apps construyen;
- `./build-all.sh` produce únicamente los dos `.next`;
- API y agente no forman parte del grafo ejecutado por `build-all.sh`;
- ambas consumen un componente real desde `@stock42/ui`;
- no duplican primitives compartidas;
- no existe `pages/api`;
- no existe `[...slug]` ni `[[...slug]]`.

### Etapa 4 — Núcleo API, s42-core y MongoDB

Objetivo: levantar una API mínima contra MongoDB real.

Acciones:

- crear `apps/api`;
- declarar `build` no-op, `start` desde source y `dev` hot/watch;
- integrar la versión publicada de `s42-core`;
- validar configuración con Zod;
- implementar el `MongoDBStorage` delgado;
- implementar handler central de errores;
- implementar CORS correcto;
- crear módulo health;
- agregar readiness Mongo;
- preparar cierre testeable.

Criterios de aceptación:

- health distingue live de ready;
- `bun run build` dentro de la API termina exitosamente sin crear `dist`;
- `start` y `dev` ejecutan `src/index.ts` con Bun;
- la API no arranca con configuración inválida;
- un test HTTP usa el servidor real;
- los errores públicos están sanitizados;
- no se importa MongoDBStorage desde internals de `s42-core`;
- CORS nunca usa wildcard literal con credentials.

### Etapa 5 — Boot, migraciones e índices

Objetivo: implementar inicialización ordenada e idempotente.

Acciones:

- crear runner de boot;
- crear registro simple de migraciones;
- delegar índices a módulos;
- agregar seeds explícitos de test;
- medir y loguear pasos;
- probar doble ejecución.

Criterios de aceptación:

- correr boot dos veces conserva estado válido;
- cada índice tiene owner;
- no se crean datasets de negocio;
- los seeds no corren sin flag y entorno autorizados;
- un fallo detiene readiness.

### Etapa 6 — Tenancy, actores y autenticación

Objetivo: implementar la base multi-tenant completa.

Acciones:

- modelos y storages de administrators, tenants, operators y users;
- índices;
- endpoints explícitos;
- login por tipo de actor;
- cookies access/refresh;
- rotación de refresh;
- CSRF ligado al contexto;
- permisos y aislamiento tenant;
- rate limit configurable;
- auditoría mínima de operaciones administrativas.

Criterios de aceptación:

- un administrador crea tenant y owner;
- owner y operador quedan limitados a su tenant;
- usuario autentica en su tenant;
- refresh rota cookies y CSRF;
- un actor inactivo no renueva;
- tests negativos prueban aislamiento;
- la limitación de no tener sesiones revocables está documentada.

### Etapa 7 — Flujos base de webapp y backoffice

Objetivo: conectar las aplicaciones Next con la API.

Acciones:

- implementar `@stock42/api-client`;
- crear BFF Route Handlers explícitos;
- crear pantallas de login;
- crear protección de shell;
- crear administración de tenants, owner, operadores y usuarios;
- crear estados de error, vacío y loading;
- incorporar CSRF y refresh.

Criterios de aceptación:

- cookies sensibles no llegan a JavaScript del browser;
- el API client valida respuestas;
- una respuesta HTML inesperada no se parsea ciegamente como JSON;
- roles ven solo la navegación permitida;
- no hay proxy catch-all.

### Etapa 8 — Store y contratos del runtime agéntico

Objetivo: crear la fuente de verdad durable.

Acciones:

- crear `apps/agent`;
- declarar `build` no-op y scripts `start`/`dev` sobre
  `src/entrypoints/all.ts`;
- implementar el coordinador de entrypoints y su propagación de señales;
- crear `run-all.sh` y `run-dev-all.sh` en la raíz con las cuatro apps
  explícitas;
- implementar configuración y servidor interno;
- definir manifests;
- crear colecciones y storages de conversations, messages, runs, events y
  confirmations;
- implementar enqueue, claim, attach, heartbeat, cancel y terminal;
- implementar cursor y replay;
- agregar idempotencia.

Criterios de aceptación:

- dos claims concurrentes no ejecutan el mismo run;
- `bun run build` dentro del agente termina sin crear `dist`;
- todas las apps declaran `build`, `start` y `dev`;
- un smoke con Bun stub demuestra que ambos launchers seleccionan exactamente
  api, agent, webapp y backoffice sin abrir puertos;
- estados y transiciones están validados;
- terminal es idempotente;
- replay devuelve secuencia ordenada;
- API y agente comparten solo contracts.

### Etapa 9 — Launcher, proceso y supervisor

Objetivo: ejecutar runs en procesos Bun aislados y recuperables.

Acciones:

- entrypoint launcher;
- `Bun.spawn` con env allowlist;
- worker por run;
- heartbeat y progreso;
- supervisor;
- cancelación `SIGTERM`/`SIGKILL`;
- timeouts, crash recovery y retries;
- límites globales y por tenant.

Criterios de aceptación:

- cancelación termina el proceso y persiste estado correcto;
- un proceso sin heartbeat se recolecta;
- un proceso que excede deadline queda diferenciado de un crash;
- reiniciar launcher/supervisor no pierde runs;
- el cwd no apunta a otra app.

### Etapa 10 — Orchestration DeepSeek

Objetivo: ejecutar el loop razonador con `deepseek-v4-pro`.

Acciones:

- provider DeepSeek;
- thinking explícito;
- reasoning effort configurable dentro de los valores aprobados;
- conservación de `reasoning_content`;
- tool-call loop;
- límites de turnos, tiempo y tokens;
- persistencia segura y sanitización;
- fake provider para tests.

Criterios de aceptación:

- todo request usa `deepseek-v4-pro`;
- no aparecen aliases legacy ni Flash;
- un ciclo con tool call conserva reasoning;
- fallos del proveedor tienen retry acotado;
- secretos y prompts sensibles no aparecen completos en logs.

### Etapa 11 — Tools, Telegram, documentos, uploads y artifacts

Objetivo: completar las capacidades agénticas v0.

Acciones:

- registry y autorización;
- clasificación read/write/critical;
- confirmation;
- tools de dominio de ejemplo;
- Telegram;
- PDF;
- CSV;
- upload seguro;
- artifact storage local y descarga autenticada.

Criterios de aceptación:

- ninguna tool permite queries Mongo arbitrarias;
- una acción critical no ejecuta antes de aprobación;
- aprobar no cambia argumentos;
- Telegram es idempotente;
- artifacts no están en base64 en Mongo;
- path traversal, MIME y tamaño tienen tests.

### Etapa 12 — Gateway de agente y WebSocket

Objetivo: integrar el runtime con clientes públicos sin exponerlo.

Acciones:

- módulo agent en API;
- service token;
- endpoints de run, cancel, confirmation y replay;
- `/ws`;
- tickets de un uso;
- subscripciones autorizadas;
- heartbeat, backpressure y límites;
- puente de eventos del agente;
- reconexión con cursor.

Criterios de aceptación:

- el agente no está públicamente accesible;
- reutilizar un ticket falla;
- un tenant no recibe eventos de otro;
- perder el socket no pierde el historial;
- API HTTP y WS comparten puerto;
- Nginx soporta upgrade.

### Etapa 13 — Nginx genérico

Objetivo: reemplazar las referencias de VisionSanar con proxy completo.

Acciones:

- crear hosts genéricos;
- apuntar a loopback;
- configurar headers;
- configurar `/ws`;
- alinear uploads y timeouts;
- validar sintaxis;
- documentar integración TLS sin certs hardcodeados;
- confirmar que el agente no tiene host.

Criterios de aceptación:

- no queda ningún dominio o path de VisionSanar;
- la configuración HTTP pasa `nginx -t` en un entorno compatible;
- WebSocket conserva upgrade;
- los límites coinciden con API;
- no hay Docker, systemd ni certificados.

### Etapa 14 — Suite integral y CI

Objetivo: convertir los criterios anteriores en gates automáticos.

Acciones:

- completar bun:test;
- completar tests HTTP;
- completar integración API/agente;
- configurar fixtures en la base existente;
- configurar Playwright desktop/mobile;
- crear GitHub Actions;
- ejecutar `build-all.sh` como único gate de compilación;
- agregar smoke tests de selección, señales y cleanup de los launchers;
- documentar secretos y comportamiento en forks;
- publicar reportes ante fallos.

Criterios de aceptación:

- ninguna suite crea o emula una base;
- cleanup solo toca fixtures propias;
- CI instala con lockfile congelado;
- boundaries, types, lint, audit, tests, build de las dos webapps y E2E son
  gates;
- CI no ejecuta `bun build` ni espera `dist` para API o agente;
- los procesos de test se cierran;
- las fallas reportan suficiente evidencia sin secretos.

### Etapa 15 — Documentación, ensayo desde cero y release v0

Objetivo: demostrar que el scaffold puede reutilizarse.

Acciones:

- completar GUIDE y README;
- revisar AGENTS y CLAUDE;
- ejecutar instalación limpia;
- probar `build-all.sh`, `run-all.sh --build` y `run-dev-all.sh` sin dejar
  procesos huérfanos;
- ejecutar todos los gates;
- comprobar configuración Nginx;
- comprobar que no hay referencias de producto;
- revisar dependencias y licencias;
- registrar release en changelog;
- taggear v0 solo con aprobación expresa.

Criterios de aceptación:

- una persona puede seguir GUIDE desde un checkout limpio;
- el árbol coincide con este plan;
- no existen imports cross-app;
- no existe `.env.local`;
- no quedan prefijos ni dominios de proyectos fuente;
- solo las webapps generan artefactos de build;
- los tres launchers raíz están documentados, son ejecutables y están
  sincronizados con las cuatro apps;
- todos los gates pasan;
- commit y push finalizados.

## 26. Matriz de validación final

| Área | Evidencia requerida |
| --- | --- |
| Bun | Instalación reproducible con lockfile congelado |
| Turbo | Grafo, caché y outputs correctos |
| Build | Solo webapp y backoffice generan `.next`; API/agente no generan `dist` |
| Launchers | Build allowlisted y start/dev de las cuatro apps con cleanup |
| Boundaries | Test negativo de import cross-app |
| Next.js | Builds de webapp y backoffice |
| shadcn | Componentes `base-nova` compartidos |
| API | HTTP smoke y suite completa sobre `s42-core` |
| MongoDB | Tests contra la base configurada, sin crear otra |
| Tenancy | Pruebas positivas y negativas por rol/tenant |
| Auth | Cookies, refresh, CSRF, CORS y errores |
| Agent | Enqueue, claim, process, heartbeat, cancel y replay |
| DeepSeek | Contrato razonador y tool-call loop |
| Tools | Autorización y confirmations |
| Artifacts | Upload, hash, metadata y descarga |
| WebSocket | Ticket único, aislamiento, backpressure y replay |
| Nginx | Sintaxis, routing y upgrade |
| Playwright | Chromium desktop/mobile |
| CI | Todos los gates en GitHub Actions |
| Docs | AGENTS, CLAUDE, GUIDE, README y CHANGELOG alineados |
| Git | Pull previo, changelog, commit y push por tarea |

## 27. Riesgos aceptados y controles

### 27.1 Refresh sin sesiones revocables

Riesgo aceptado: no existe revocación individual ni detección fuerte de replay.

Controles:

- expiración corta;
- rotación en cada uso;
- cookies protegidas;
- CSRF ligado al contexto;
- sanitización de logs;
- documentación visible.

### 27.2 CORS abierto por default

Riesgo aceptado: una configuración demasiado amplia facilita integración desde
orígenes no deseados.

Controles:

- implementación protocolar correcta;
- rate limits;
- CSRF;
- auth estricta;
- recomendación productiva de allowlist;
- configuración explícita y observable.

### 27.3 Tests sobre una base existente

Riesgo aceptado: un bug de fixtures podría afectar datos compartidos.

Controles:

- marca de entorno;
- tenant autorizado;
- `testRunId`;
- filtros de cleanup verificados;
- prohibición de `dropDatabase`;
- ausencia de tests destructivos sobre datos ajenos;
- fail-closed ante configuración ambigua.

### 27.4 Runtime completo en v0

Riesgo aceptado: launcher, procesos y supervisor aumentan superficie operativa.

Controles:

- una sola app propietaria;
- manifests Zod;
- estados explícitos;
- MongoDB como verdad;
- entrypoints pequeños;
- tests de crash/cancel/restart;
- sin SDK o abstracciones prematuras.

### 27.5 Artifacts en filesystem local

Riesgo aceptado: el baseline no comparte bytes entre hosts.

Controles:

- documentar que escala horizontal requiere storage compartido;
- mantener metadata y hashes en Mongo;
- aislar acceso tras la API;
- no crear una abstracción S3 no solicitada en v0.

## 28. Fuentes de diseño auditadas

### Repositorios

- `/home/lortmorris/repos/capacitar.ai`
- `/home/lortmorris/repos/visionsanar`
- `/home/lortmorris/repos/rastreasalud/sources/rastreasalud-monorepo`
- `/home/lortmorris/repos/s42-core`
- `/home/lortmorris/repos/farmasun/source`

### Referencias principales

- Boot de RastreaSalud:
  `apps/backend/src/boot`
- Storage de RastreaSalud:
  `apps/backend/src/MongoDBStorage/index.ts`
- Auth de RastreaSalud:
  `apps/backend/src/modules/mws-auth`
- Runtime durable de VisionSanar:
  `packages/agent-runtime`
- Arquitectura agéntica de Farmasun:
  `AGENT_AI.md`
- Model de referencia:
  `apps/api/modules/email-campaign/models/CampaignModel.ts`
- Storage de referencia:
  `apps/api/modules/email-campaign/services/campaign-storage.ts`
- Build de webapps de Farmasun:
  `build-all.sh`
- Launcher integral de Farmasun:
  `run-all.sh`
- Build y launchers de VisionSanar:
  `build-all.sh`, `run-all.sh` y `run-dev-all.sh`
- Build y launcher de Capacitar:
  `build-all.sh` y `run-all.sh`
- Build y launcher con verificación `.next` de RastreaSalud:
  `build-all.sh` y `run-all.sh`

### Documentación oficial

- [Bun workspaces](https://bun.sh/docs/pm/workspaces)
- [Bun isolated installs](https://bun.sh/docs/pm/isolated-installs)
- [Bun cookies](https://bun.sh/docs/runtime/cookies)
- [Bun CSRF](https://bun.sh/docs/runtime/csrf)
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [shadcn monorepo](https://ui.shadcn.com/docs/monorepo)
- [Turborepo documentation](https://turborepo.com/docs)
- [DeepSeek thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/)

## 29. Definición de terminado de cada tarea

Una tarea del scaffold está terminada únicamente cuando:

1. se verificó el worktree y la rama;
2. se hizo `git pull --ff-only`;
3. se implementó solo el alcance acordado;
4. se actualizaron contratos y documentación afectados;
5. se revisó `nginx/` si cambió una superficie operativa;
6. se revisaron `build-all.sh`, `run-all.sh` y `run-dev-all.sh` si cambió una
   app o su comando de ejecución;
7. se ejecutaron las validaciones proporcionales al cambio;
8. se separaron fallos preexistentes de regresiones propias;
9. se actualizó `CHANGELOG.md`;
10. se revisó el diff y la ausencia de secretos;
11. se creó un commit intencional;
12. se hizo push al remoto canónico;
13. se informó qué fue validado y qué no pudo validarse.

No alcanza con compilar, crear un commit o hacer push para afirmar que un
despliegue está funcionando. Implementación, configuración, test y runtime son
evidencias distintas.
