# Monorepo scaffolding Stock42
El objetivo es que creemos un monorepo con turbo repo como scaffolding para todos los proyectos.
Para ello, debemos seguir algunas reglas:

- Para API se usa s42-core como framework
- Bunjs first
- Las webapps (landings, frontend para clientes, backoffice, etc) siempre con Next.js
- Usar shadcn siempre.
- Tener el sistema agentico en una app (su logica, control, flows, etc) y poder invocarlos desde un modulo del API si así lo demanda el proyecto.
- La base de datos es MongoDB
- Se validan los tipos y contratos con zod.
- Si se require websocket, se crea dentro del api.
- Siempre se debe tener un directorio nginx con la config necesaria para nginx (reverse proxy) para que funcione.



## Archivos bases
Los archivos importantes son:
- AGENTS.md :  todas las reglas fuertes y directivas minimas a seguir
- CLAUDE.md (debe indicar en su interior que se debe leer AGENTS.md)
- GUIDE.md : la guia de desarrollo para el proyecto
- CHANGELOG.md : el archivo en el cual se debe registrar de forma automática cada cambio que se realiza.

Regla para AGENTS.md
Cada vez que el usuario pide una tareas, denemos hacer pull del repo, realizar la tarea, hacer la actualizacion de CHANGELOG.md y luego hacer el commit.


## Directorio de donde sacamos info
El objetivo es analizar los siguientes monorepos de distintos proyectos, para `aprender` como construir un mono repo, obteniendo las mejores practicas de cada uno de ellos, y generar el mejor scaffoldind posible:

- /home/lortmorris/repos/capacitar.ai
- /home/lortmorris/repos/visionsanar
- /home/lortmorris/repos/rastreasalud/sources/rastreasalud-monorepo
- /home/lortmorris/repos/s42-core
- /home/lortmorris/repos/farmasun/source

Algunas cosas que me parece sumamente importante:

- El concepto de boot /home/lortmorris/repos/rastreasalud/sources/rastreasalud-monorepo/apps/backend/src/boot
- MongoDBStorage /home/lortmorris/repos/rastreasalud/sources/rastreasalud-monorepo/apps/backend/src/MongoDBStorage/index.ts
- el module /home/lortmorris/repos/rastreasalud/sources/rastreasalud-monorepo/apps/backend/src/modules/mws-auth
- En visionsanar el sistema del sdk para agentes
- de farmasun, el super agente AI que tiene en su backoffice
- Normalizar los nombres de los modulos de API (que no inicien con una nomenclatura estilo `rs-` o `cai-` o cosas asi)
- Test con playwright
- Test completos de API
- Los agentes, siempre con deepseek


## Output esperado
El objetivo es generar el archivo ./docs/PLAN-SCAFFOLDING-v0.md con todo el plan, separado por etapas, para la construccion del scaffolding.

No debe generar nada mas que ese archivo con el plan.


## Reglas a seguir

- Todas las apps (webapps, api, etc) van dentro del directorio ./apps
- Usar como prioridad el mcp de bunjs
- Usar como prioridad el mcp de shadcn
- una app next se crea `bun create next-app@latest my-bun-app`
- En next, usamos siempre el pattern api routes https://nextjs.org/docs/pages/building-your-application/routing/api-routes
- No usamos wildcars para api routes, usamos path completo, ej: app/api/users/create/route.ts
- Codigo simple, sin muchos patrones que no sean necesario
- Nunca implementar DDD o arquitectura hexagonal


## Como comenzar?
Primero que nada, audita todos los directorios con proyectos anteriormente mencionado, y hasme preguntas de que me gustaría implementar y que no.


Se muy detallista.
