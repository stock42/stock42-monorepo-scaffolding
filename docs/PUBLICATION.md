# Preparación para publicación pública

## 1. Objetivo

Convertir `stock42/stock42-monorepo-scaffolding` en un repositorio público y en
un template de GitHub que cualquier desarrollador pueda usar para crear un
producto SaaS agéntico con Bun, Next.js, MongoDB, `s42-core` y DeepSeek.

Este documento separa tres acciones distintas:

1. **Preparar el código y la documentación.** Puede hacerse mientras el repo
   permanece privado.
2. **Publicar cambios Git.** Commit y push actualizan la rama privada; no
   alteran la visibilidad.
3. **Cambiar la visibilidad a pública.** Es una decisión explícita de gobierno
   con consecuencias permanentes sobre la exposición del historial y las
   copias de terceros.

## 2. Veredicto al 8 de agosto de 2026

**Los P0 de preparación técnica están cerrados; no cambiar todavía la
visibilidad.** Falta completar la revisión de superficies alojadas en GitHub,
aprobar marca/historial y configurar el repositorio como producto público. Esas
acciones no se pueden inferir de un push de código.

### Estado de gates

| Prioridad | Estado    | Gate                                                                                                                      |
| --------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| P0        | Cumplido  | `LICENSE` contiene el texto oficial exacto de Apache License 2.0.                                                         |
| P0        | Cumplido  | `bun run boundaries` modela ownership sin excepciones por archivo y pasa sus tests.                                       |
| P0        | Cumplido  | Overrides/lockfile mínimos dejan `bun audit` sin advisories.                                                              |
| P0        | Cumplido  | Gitleaks 8.30.1 recorrió `--all`; el único match era un placeholder histórico identificado por fingerprint y documentado. |
| P0        | Cumplido  | Los ocho P0 de `NEWERA.md` están implementados y tienen validación local proporcional.                                    |
| P1        | Parcial   | Existen `SECURITY.md` y `CONTRIBUTING.md`; código de conducta, soporte y owners requieren responsables reales.            |
| P1        | Pendiente | Aprobar exposición de referencias históricas e identidad Git del autor.                                                   |
| P1        | Pendiente | Revisar GitHub Actions/artifacts y configurar metadata, template, rulesets y security features.                           |

El código ya no tiene un bloqueo P0 conocido. Los P1 operativos siguen
impidiendo recomendar el cambio de visibilidad o un anuncio público.

## 3. Evidencia de la auditoría inicial

La inspección tomó como baseline el commit `6ae2146`, antes de agregar esta
documentación, y se realizó sin leer ni imprimir archivos `.env` locales ni
credenciales.

| Área                           | Resultado                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| GitHub                         | Repositorio `stock42/stock42-monorepo-scaffolding`, rama `main`, visibilidad `private`                                          |
| Alcance Git                    | 326 archivos tracked, 15 commits, sin tags en el baseline auditado                                                              |
| Archivos de entorno históricos | Solo se detectaron los cuatro `.env.example`; no apareció un `.env` real en el historial                                        |
| Heurística de secretos         | Sin coincidencias de claves privadas, tokens GitHub/AWS/Telegram ni URLs MongoDB con credenciales en el historial inspeccionado |
| Herramientas especializadas    | Gitleaks `8.30.1` recorrió los 17 commits alcanzables con `--all` y `--redact=100`; resultado final sin leaks abiertos          |
| Identidad Git                  | Los commits exponen `cesar@stock42.com`; el propietario debe confirmar que ese email puede hacerse público                      |
| Referencias internas           | `initial.md` y el plan histórico contienen paths locales y nombres de repositorios usados como referencia                       |
| Licencia                       | Apache License 2.0, texto oficial exacto en `LICENSE`                                                                           |
| Comunidad                      | `SECURITY.md` y `CONTRIBUTING.md` presentes; faltan responsables reales para Code of Conduct, support y CODEOWNERS              |
| Automatización GitHub          | Existe `.github/workflows/ci.yml`, pero no templates de issues/PR, CODEOWNERS ni Dependabot                                     |
| Gates conocidos                | `boundaries`, unit tests, tipos y audit verificados localmente; MongoDB/E2E requieren infraestructura autorizada                |

El match inicial de Gitleaks fue `generic-api-key` en el placeholder histórico
de `AUTH_ACCESS_SECRET` dentro de `apps/api/.env.example`, commit
`9125dab8f3495cef275264e6de9d3b2e892f1e98`. No se conserva ni publica el valor.
La excepción usa únicamente el fingerprint exacto en `.gitleaksignore`; una
segunda ejecución completa terminó sin hallazgos. CI descarga el binario
oficial con versión y SHA-256 fijados en lugar de depender de un Action que
requiera licencia adicional para repositorios de organización.

### Evidencia de cierre P0

Sobre el árbol de cierre se verificó:

- `bun install --frozen-lockfile`: sin cambios;
- `bun run format:check`, `bun run check-types` y `bun run lint`: verdes;
- `bun run test`: 45 tests unitarios verdes en los workspaces;
- `bun run test:tools`: 9 tests del generador de entorno;
- `bun run boundaries`: 5 tests y scanner verde;
- `bun audit`: sin vulnerabilidades reportadas;
- `bun run build`: builds Next.js de webapp y backoffice verdes;
- Gitleaks: 17 commits y material público nuevo/modificado sin leaks abiertos.

No se ejecutaron `test:api`, `test:e2e` ni `indexes:verify`: requieren una base
MongoDB existente y expresamente autorizada, que no se proporcionó para esta
tarea. No se creó una base, emulador ni proceso persistente para sustituirla.

### Alcance del secret scan final

Antes de abrir el repositorio se debe analizar:

- cada commit y blob alcanzable del historial, no solo el árbol actual;
- branches y tags remotos;
- nombres de archivos y metadata Git;
- logs, caches y artifacts retenidos por GitHub Actions;
- issues, pull requests, wikis, releases y packages, si existen;
- URLs con credenciales, claves privadas, JWT secrets, tokens de proveedores,
  cookies y valores de configuración productiva.

Si aparece un secreto real, primero se revoca o rota en el proveedor y luego se
evalúa una reescritura coordinada del historial. Borrar el texto en un commit
nuevo no retira el valor de commits anteriores.

## 4. Decisiones que debe tomar el propietario

### 4.1 Licencia decidida

El objetivo declarado —que cualquier desarrollador pueda clonar y crear un
proyecto— necesita permisos expresos. Hacer público el repositorio sin licencia
permite leerlo y forkarlo dentro de GitHub, pero no concede por sí solo una
licencia general para usar, modificar y redistribuir el código.

El propietario eligió **Apache License 2.0**. `LICENSE` contiene el texto
oficial sin modificaciones. Las contribuciones aceptadas siguen
inbound=outbound conforme a la sección 5; no se exige CLA ni DCO adicional.
Nombre, logo y política de marca continúan siendo una decisión separada de la
licencia de copyright/patentes. Este documento no sustituye asesoramiento legal.

### 4.2 Identidad y marca

Definir antes de abrir:

- si los packages conservarán el scope `@stock42/*` en proyectos generados;
- si el nombre “Stock42” puede usarse en derivados o solo identifica el
  template original;
- logo, social preview, descripción pública y URL del proyecto;
- qué nombres de repositorios de referencia pueden permanecer documentados;
- si `cesar@stock42.com` es una identidad pública aceptada para el historial.

### 4.3 Modelo de contribución

Decidido:

- se aceptan pull requests externos siguiendo `CONTRIBUTING.md`;
- las contribuciones usan Apache-2.0 inbound=outbound, sin DCO ni CLA;

Todavía se debe decidir:

- mantenedores y CODEOWNERS por apps/packages;
- SLA y canal para issues, preguntas y reportes de seguridad;
- código de conducta y contacto real de enforcement;
- política de versiones, releases, soporte y compatibilidad.

No deben publicarse archivos comunitarios con emails ficticios o responsables
que no hayan aceptado ese rol.

### 4.4 Nivel de promesa

El README presenta el alcance real y diferencia lo implementado de lo
pendiente. Hay que elegir una etiqueta pública coherente:

- **experimental:** útil para explorar y contribuir, sin promesa productiva;
- **public preview:** arquitectura estable, gates P0 cerrados y cambios posibles;
- **production-ready:** solo después de cerrar los gates y riesgos P0 acordados.

El nivel elegido es **public preview**, no `production-ready`.

## 5. Archivos públicos necesarios

GitHub usa el community profile para comprobar documentación básica de un
proyecto público. Estado actual:

```text
LICENSE                    # creado
SECURITY.md                # creado
CONTRIBUTING.md            # creado
CODE_OF_CONDUCT.md
SUPPORT.md
.github/
├── CODEOWNERS
├── dependabot.yml
├── ISSUE_TEMPLATE/
│   ├── bug_report.yml
│   ├── feature_request.yml
│   └── config.yml
└── pull_request_template.md
```

Contenido mínimo:

- `SECURITY.md`: versiones soportadas, vía **privada** de reporte, tiempos de
  acuse y prohibición de publicar vulnerabilidades como issue.
- `CONTRIBUTING.md`: setup real, comandos obligatorios, política MongoDB,
  boundaries, documentación y definición de done.
- `CODE_OF_CONDUCT.md`: texto reconocido y contacto de enforcement.
- `SUPPORT.md`: qué se atiende como issue, qué va a Discussions y qué soporte no
  está incluido.
- `CODEOWNERS`: propietarios reales de `apps/api`, `apps/agent`, webs,
  packages, seguridad y workflows.
- issue forms: versión de Bun, sistema operativo, reproducción mínima y logs
  redactados.
- PR template: alcance, tests, seguridad, migraciones, documentación y
  compatibilidad.

Los archivos comunitarios pueden heredarse desde un repositorio público
`.github` de la organización, pero la licencia debe estar en este repositorio.

## 6. Calidad mínima antes de abrir

### 6.1 Gates obligatorios

En un clon limpio y con Bun 1.3.14:

```bash
bun install --frozen-lockfile
bun run format:check
bun run check-types
bun run lint
bun run test
bun run boundaries
bun run audit
bun run secret-scan
bun run build
```

La rama protegida no debe aceptar merges si falla alguno de los gates acordados.
Un warning aceptado necesita owner, justificación, fecha de revisión y un issue
visible; no debe ocultarse debilitando CI.

### 6.2 Validaciones con infraestructura

En una base MongoDB existente, aislada y expresamente autorizada:

```bash
bun run test:api
bun run test:e2e
```

Además se debe ensayar:

- bootstrap del administrador y logins de plataforma/tenant;
- aislamiento entre dos tenants;
- handshake versionado, ticket de un uso, topics nativos, reconexión y replay;
- creación, cancelación, timeout, retry y recuperación de runs;
- confirmation aprobada, rechazada y vencida;
- upload, artifact y descarga fuera de scope;
- Telegram disabled/degraded y un flujo opt-in con bot de prueba;
- parada limpia y reinicio con trabajo pendiente.

### 6.3 Rehearsal de consumidor

Probar desde una máquina o contenedor sin estado del equipo mantenedor:

1. crear un repositorio mediante **Use this template**;
2. clonar sin credenciales de la organización original;
3. ejecutar `bun install --frozen-lockfile`;
4. completar `bun run update:env` con una base existente;
5. arrancar `./run-dev-all.sh`;
6. iniciar sesión, crear un run y observar su estado;
7. verificar que todos los enlaces del README funcionen;
8. confirmar que el nuevo repo no herede secretos, remotes ni historial no
   deseado.

## 7. Configuración recomendada en GitHub

### Metadata

**Descripción propuesta:**

> Bun-first multi-tenant agentic monorepo with Next.js webapp/backoffice,
> s42-core API, MongoDB, native WebSocket and durable DeepSeek agents.

**Topics propuestos:**

```text
bun
turborepo
typescript
nextjs
mongodb
websocket
ai-agents
deepseek
shadcn-ui
multi-tenant
s42-core
```

Agregar un social preview legible y marcar **Template repository**. GitHub
explica que un repositorio creado desde un template comienza con archivos y
estructura propios, sin compartir la historia de commits como un fork:
[crear un repositorio desde un template](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template)
y [configurar el repositorio como template](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository?apiVersion=2022-11-28).

### Ruleset de `main`

- pull request obligatorio;
- al menos una aprobación de CODEOWNER en áreas sensibles;
- conversaciones resueltas antes del merge;
- CI obligatoria y actualizada con la rama;
- bloquear force pushes y eliminación de la rama;
- commits firmados si el equipo puede sostener esa política;
- limitar cambios de workflows y archivos de seguridad a mantenedores.

### Seguridad

- activar Dependabot alerts y security updates;
- activar secret scanning y push protection cuando el plan de GitHub lo
  permita;
- habilitar private vulnerability reporting;
- configurar permisos de Actions en modo mínimo, preferentemente lectura;
- revisar qué workflows reciben secrets y evitar secretos en PRs de forks;
- agregar CodeQL o una alternativa después de definir su gate y ownership.

GitHub documenta secret scanning y push protection dentro de
[Secret security](https://docs.github.com/en/code-security/concepts/secret-security).

### Comunidad

Verificar el community profile público y completar cada archivo recomendado por
GitHub: [About community profiles](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories)
y [Setting up your project for healthy contributions](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions).

## 8. Revisión del historial y referencias internas

Hay dos categorías distintas:

1. **Información sensible:** secretos, credenciales, datos personales no
   aprobados o infraestructura privada. Debe retirarse y, si fue válida, rotarse
   antes de publicar.
2. **Información contextual:** paths locales, nombres de proyectos de referencia
   y decisiones históricas. No es necesariamente secreta, pero el propietario
   debe aprobar su exposición.

En el estado auditado, `initial.md` y `docs/PLAN-SCAFFOLDING-v0.md` incluyen
referencias locales/históricas. Sanitizarlas en el árbol actual no las elimina
de commits anteriores. No se recomienda reescribir el historial solo por
estética: una reescritura cambia SHAs y exige coordinación. Sí corresponde
hacerla si el secret scan encuentra material que no puede hacerse público.

## 9. Runbook del cambio de visibilidad

### Antes

- [x] Propietario aprueba Apache License 2.0.
- [ ] Propietario aprueba marca y exposición del historial.
- [x] Todos los P0 de código de esta guía tienen criterio de salida cumplido.
- [x] Secret scan formal del historial Git sin hallazgos abiertos.
- [ ] Revisados Actions logs, artifacts, releases, packages, issues y PRs.
- [ ] README y community files validados desde un clon limpio.
- [ ] Ruleset, CODEOWNERS, permisos de Actions y security features preparados.
- [ ] Backup y plan de respuesta ante un hallazgo post-publicación.

### Cambio controlado

- [ ] Registrar commit/tag exacto aprobado para publicar.
- [ ] Cambiar la visibilidad desde GitHub con un owner autorizado.
- [ ] Confirmar inmediatamente el acceso anónimo y la rama por defecto.
- [ ] Marcar el repositorio como template.
- [ ] Verificar metadata, topics, licencia y community profile.
- [ ] Crear un repo descartable con **Use this template** y repetir el smoke test.
- [ ] Abrir un PR desde fork y verificar que CI no exponga secretos.
- [ ] Habilitar alertas y private vulnerability reporting.

### Después

- [ ] Monitorear secret/security alerts y primeras ejecuciones de CI.
- [ ] Publicar una release inicial con compatibilidad y limitaciones conocidas.
- [ ] Abrir issues para deuda aceptada con owner y prioridad.
- [ ] Anunciar el proyecto solo después de validar el recorrido anónimo.

GitHub advierte que cambiar la visibilidad afecta Actions, forks y acceso al
código. Una vez público, no puede asumirse que volverlo privado retire clones,
forks o caches existentes. Revisar la documentación actual antes de ejecutar el
cambio: [Setting repository visibility](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).

## 10. Definición de listo para publicación

El repositorio está listo cuando una persona sin contexto interno puede:

1. entender en menos de cinco minutos qué producto base recibe;
2. generar su propio repo desde el template;
3. configurar las cuatro apps sin conocer infraestructura de Stock42;
4. arrancar y validar un flujo autenticado y un run;
5. encontrar documentación de cada superficie y una ruta de contribución;
6. conocer con precisión las limitaciones y garantías de seguridad;
7. usar, modificar y redistribuir el código bajo una licencia explícita;
8. reportar un bug o vulnerabilidad por el canal correcto;
9. confiar en que la rama pública pasa sus gates declarados.

Hasta cumplir esos criterios, commit y push pueden continuar normalmente en el
repositorio privado, pero el cambio de visibilidad debe permanecer pendiente.
