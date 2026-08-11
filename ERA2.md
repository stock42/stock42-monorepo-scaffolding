# Stock42 ERA 2 — 2030, hoy

Plan estratégico y técnico para convertir Stock42 Agentic Monorepo en una
plataforma mundial de creación de software agéntico.

**Estado:** propuesta de arquitectura y producto; no autoriza por sí sola la
implementación de sus iniciativas.

**Fecha del análisis:** 2026-08-11

**Baseline revisado:** main@25d1f31

**Relación con NEWERA.md:** NEWERA conserva la auditoría táctica que llevó el
scaffold v0 a su estado actual. ERA2 parte de ese resultado y define la segunda
era: producto actualizable, trustable, agent-native, enterprise y global.

## 1. Decisión ejecutiva

Stock42 ya no debe evolucionar como una colección de funcionalidades dentro de
un template. Debe evolucionar como una **Agentic Application Platform**:

- una referencia ejecutable completa para construir SaaS multi-tenant;
- un kernel de contratos, identidad, políticas, ejecución y evidencia;
- una fábrica de capacidades que humanos y agentes puedan extender sin romper
  seguridad, tenancy ni operación;
- un producto actualizable, con compatibilidad y migraciones, no un fork que
  envejece desde el día en que se copia;
- una base abierta Apache 2.0 que pueda desplegarse en infraestructura propia o
  consumirse como servicio administrado.

La unidad fundamental del software hacia 2030 no será la pantalla ni el CRUD.
Será la combinación:

    intención
      + contexto autorizado
      + política
      + capacidad ejecutable
      + estado durable
      + evidencia verificable
      + control humano proporcional al riesgo

Stock42 ya contiene una primera versión real de esa combinación: runs durables,
tools tipadas, confirmations, fencing, replay, WebSocket, tenancy y canales.
La oportunidad es convertir esas decisiones en una especificación de
plataforma estable, mensurable y extensible.

Ningún plan puede garantizar que “todas las empresas” adopten un producto. Sí
puede maximizar esa probabilidad eliminando los motivos racionales para no
adoptarlo: riesgo, lock-in, fork drift, falta de evidencia, dificultad de
operación, mala experiencia inicial, incompatibilidad y ausencia de soporte.
Este documento está diseñado alrededor de esos inhibidores.

### La promesa ERA 2

> Una empresa describe una capacidad de negocio; un agente la materializa sobre
> contratos y generadores gobernados; Stock42 demuestra con tests, evals,
> políticas y trazas que la capacidad es segura, tenant-aware, operable y
> actualizable.

### Las seis apuestas que deben permanecer estables

1. **Núcleo simple.** Cuatro apps desplegables y paquetes compartidos. No se
   paga el costo de microservicios antes de necesitarlo.
2. **Contratos antes que implementación.** Zod, manifests, policies y eventos
   son la interfaz durable entre humanos, agentes y procesos.
3. **Autonomía segura.** Ningún prompt concede autoridad. La autoridad proviene
   de identidad, tenant, scopes, budgets, policy y confirmations.
4. **Evidencia antes que claims.** “Seguro”, “ready”, “rápido” y “compatible”
   deben derivar de mediciones o gates reproducibles.
5. **Actualización antes que scaffolding.** Crear un proyecto es el minuto cero;
   mantenerlo durante diez años es el producto.
6. **Interoperabilidad sin pérdida de control.** Protocolos abiertos se
   implementan en adaptadores autorizados; no atraviesan el kernel de seguridad.

## 2. Qué existe realmente hoy

El inventario se realizó sobre código, configuración, tests, CI y documentación.
No se infiere deployment ni comportamiento productivo desde el repositorio.

### 2.1 Inventario verificable

| Área             | Capacidad implementada                                                                                 | Madurez observada                            |
| ---------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Workspace        | Bun 1.3.14, Turborepo, cuatro apps, cinco packages compartidos y boundaries automáticos                | Sólida                                       |
| Webapp           | Next.js 16, login tenant-aware, BFF, run conversacional, cancelación, WebSocket y replay               | Preview funcional                            |
| Backoffice       | Tenants, personas, agente, confirmations, Telegram AI y email marketing                                | Preview funcional                            |
| API              | Bun, s42-core 3.0.13, 44 controllers explícitos, MongoDB, auth, auditoría y files gateway              | Sólida para una instancia                    |
| Contratos        | Nueve entradas compartidas Zod para auth, tenancy, agente, archivos, email, Telegram y realtime        | Buena base                                   |
| MongoDB API      | Storages estáticos resueltos por Dependencies y 35 índices centralizados en boot                       | Sólida                                       |
| Realtime         | WebSocket nativo de s42-core/Bun, tickets de un uso, topics server-owned, límites, reconexión y replay | Completo para una instancia                  |
| Runtime agéntico | Queue durable, launcher, proceso por run, supervisor, fencing, cancelación, retries y estado terminal  | Arquitectura diferencial                     |
| Modelo           | DeepSeek deepseek-v4-pro, thinking, tool calls y reasoning high o max                                  | Proveedor único                              |
| Tools            | Siete tools acotadas; read, write y critical; confirmations y ledger de efectos                        | Baseline seguro                              |
| Telegram         | Accesos server-owned, polling durable opt-in, health degradable, commands y delivery                   | Completo para getUpdates                     |
| Archivos         | Intents, checksum, MIME, path confinement, filesystem local y artifacts autorizados                    | Funcional, single-host                       |
| Email marketing  | Grupos, plantillas, campañas, snapshots, spooler SMTP con leases y backoffice                          | Entrega base, no suite de compliance         |
| Calidad          | 21 archivos de test tracked, unit tests, integración Mongo opt-in, dos E2E y CI                        | Cobertura insuficiente del lifecycle crítico |
| UI               | 60 componentes shadcn compartidos en base-nova                                                         | Catálogo amplio, poca verificación visual    |
| Publicación      | Apache 2.0, README integral, SECURITY, CONTRIBUTING, auditoría y Gitleaks                              | Código preparado; gobierno alojado pendiente |

También se verificaron 305 archivos TypeScript/TSX de apps y packages, 54 Route
Handlers BFF explícitos y ausencia de imports de source entre apps. Estos
números describen el baseline del 11 de agosto de 2026; no son KPIs de producto.

### 2.2 Fortalezas que constituyen propiedad intelectual arquitectónica

- Separación real entre experiencia pública, control plane, API pública y
  ejecución privada.
- MongoDB como fuente durable de runs y eventos; WebSocket es acelerador, no
  fuente de verdad.
- Contexto de tenant, actor y rol derivado por servidor y firmado en el canal
  interno.
- Autorización de recursos por owner o manager, con 404 para reducir
  enumeración.
- Tickets WebSocket hasheados, expirables y consumidos atómicamente.
- Topics WebSocket derivados por servidor y publicados con el mecanismo nativo
  de s42-core/Bun.
- Procesos agénticos cercados por processId, con verificación del comando del
  proceso antes de señalizar un PID.
- Side effects con claim durable, input hash e idempotencia explícita.
- Tools críticas detenidas en estado waiting hasta una confirmation humana.
- Destinos Telegram resueltos desde bindings activos server-owned.
- Ausencia deliberada de tools MongoDB genéricas.
- Contratos Zod compartidos desde browser hasta runtime.
- Configuración productiva fail-closed para secretos, CORS, cookies, tests y
  exposición accidental del agente.
- Índices API centralizados en boot y verificador read-only para índices del
  agente.
- Launchers explícitos, builds limitados a Next.js y cleanup de procesos.
- Secret scan de historial y auditoría de dependencias en CI.

### 2.3 Límites actuales que no deben ocultarse

| Límite actual                                              | Consecuencia                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| Refresh tokens sin sesión durable                          | No hay revocación por dispositivo ni detección de reuse        |
| DeepSeek y modelo literal en el contrato público           | Riesgo de concentración y upgrade costoso                      |
| Reasoning completo persistido en mensajes                  | Superficie de privacidad, retención y acceso                   |
| Contexto de hasta 500 mensajes                             | Costo y tamaño de prompt sin presupuesto explícito             |
| Bridge API → agente por run y por segundo                  | Costo lineal y latencia variable al crecer                     |
| Rate limit y sockets locales al proceso                    | No existe garantía distribuida                                 |
| Supervisor basado en PID local                             | No soporta workers multi-host                                  |
| Filesystem local                                           | Uploads y artifacts no son compartidos ni durables entre hosts |
| Campaign build síncrono, máximo 5.000 usuarios             | Latencia, memoria y throughput acotados                        |
| Sin suppression list ni unsubscribe                        | Email marketing incompleto para uso comercial global           |
| Health parcial y badges estáticos                          | La UI puede afirmar un estado no medido                        |
| BFF sin timeout común y con buffering                      | Riesgo de memoria y requests colgados                          |
| Nginx aplica configuración larga a todo el host API        | HTTP normal hereda costos de WebSocket                         |
| Sin OTel ni SLOs                                           | No se puede demostrar disponibilidad, latencia o costo         |
| Sin OpenAPI, catálogo de capabilities ni conformance suite | Integración y generación dependen de conocimiento humano       |
| Sin CLI de create, doctor y upgrade                        | El template se convierte en forks divergentes                  |
| Sin release tags ni política de compatibilidad             | No existe una unidad estable de adopción                       |
| GitHub community governance incompleto                     | La contribución externa no tiene owners ni soporte definidos   |

## 3. Qué será el software real de 2030

ERA 2 asume cinco cambios de fondo.

### 3.1 De aplicaciones a organizaciones digitales ejecutables

Una aplicación dejará de ser un conjunto de pantallas pasivas. Será una red de
actores humanos y agénticos que reciben objetivos, coordinan tareas, utilizan
capacidades y producen resultados verificables. La UI seguirá siendo
importante, pero será una consola de intención, supervisión, excepción y
evidencia.

### 3.2 De funciones a capacidades gobernadas

Una función técnica no es una capability. Una capability ERA 2 debe declarar:

- identidad y versión;
- contrato de entrada, salida y eventos;
- roles, scopes y recursos;
- nivel de acción y política de confirmation;
- datos que puede leer y escribir;
- egress permitido;
- presupuesto de tiempo, tokens, dinero y side effects;
- idempotencia y reconciliación;
- observabilidad y audit;
- evals y SLO;
- política de compatibilidad y migración.

### 3.3 De prompts a software verificable

Los prompts son configuración versionada, no autoridad. Una actualización de
prompt o modelo debe pasar evals, pruebas adversariales, budgets y aprobación
igual que una actualización de código.

### 3.4 De “AI feature” a sistema socio-técnico

El producto debe gobernar quién definió el objetivo, qué datos recibió el
modelo, qué tool solicitó, qué policy autorizó, quién confirmó, qué efecto se
comprometió, qué costó y cómo se repara. La explicación útil no es el chain of
thought; es esa evidencia causal.

### 3.5 De template a plataforma evolutiva

El problema comercial no es generar el primer commit. Es actualizar cientos de
productos derivados sin reescribirlos ni romper su dominio. La ventaja mundial
de Stock42 debe ser el upgrade seguro y asistido por agentes.

## 4. Arquitectura objetivo

La arquitectura mantiene las cuatro apps actuales y agrega contratos de
plataforma, no microservicios obligatorios.

    Canales y experiencias
      Webapp | Backoffice | Telegram | API clients | canales futuros
                                |
    Trust y control plane
      Identity | Sessions | Policy | Consent | Audit | Tenancy | Quotas
                                |
    Capability gateway
      HTTP | s42-core WebSocket | contracts | idempotency | event ingress
                                |
    Agent execution plane
      manifests | planner | model gateway | tool runtime | workers | scheduler
                                |
    Data y evidence plane
      MongoDB | events | memory | artifacts | usage | evals | audit export
                                |
    Ecosystem plane
      CLI | SDK | MCP/A2A adapters | marketplace | conformance | upgrades

### 4.1 Regla de despliegue

El default continúa siendo un **modular monolith distribuido en cuatro
procesos**. Una capacidad se separa sólo cuando existe una razón medible:

- necesita escalar independientemente por al menos un orden de magnitud;
- tiene un boundary de seguridad o compliance distinto;
- necesita aislamiento de fallos o release cadence independiente;
- existe un owner operativo capaz de sostenerla;
- el costo de red, consistencia y operación está presupuestado.

Antes de esos umbrales, separar servicios reduce velocidad y aumenta la
superficie de fallo.

### 4.2 Dos perfiles oficiales

| Perfil                | Propósito                                          | Garantías                                                                                       |
| --------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Community single-node | Desarrollo, pilotos y productos de escala moderada | Cuatro apps, MongoDB, filesystem local, limits locales                                          |
| Enterprise cell       | Alta disponibilidad y residencia regional          | API y workers horizontales, event relay, storage de objetos, sesiones y rate limit distribuidos |

Los perfiles comparten contratos y conformance. Enterprise cell no debe
convertir Redis, Kubernetes o un cloud particular en dependencia del core.

### 4.3 Cell architecture para escala global

En vez de una instancia mundial que mezcle todos los datos, cada cell debe
contener API, runtime, MongoDB y storage de un conjunto acotado de tenants en una
región. Un control plane global conserva sólo metadata mínima de routing y
operación. Esto reduce blast radius, habilita residencia de datos y permite
escalar por incorporación de cells.

La cell no se implementa hasta cerrar sesiones, event stream, storage y workers
multi-host. Es una topología de destino, no una excusa para complejidad hoy.

## 5. Registro de riesgos y deuda estratégica

Prioridad ERA 2 no equivale a la prioridad histórica de NEWERA. Los P0 de
NEWERA están cerrados. Los siguientes E2-P0 son los nuevos gates para pasar de
public preview a plataforma confiable y adoptable.

| ID          | Prioridad | Riesgo comprobado o potencial                                                | Impacto                                                                      | Resultado requerido                                             |
| ----------- | --------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| E2-COR-001  | P0        | eventSequence se incrementa antes de insertar el evento                      | Gap durable, cliente esperando una secuencia inexistente y estado sin evento | Cursor gap-tolerant y commit atómico o reconciliable            |
| E2-IAM-001  | P0        | Refresh stateless sin session family                                         | Token robado válido hasta expirar; sin logout global                         | Sesiones revocables, reuse detection y cierre de sockets        |
| E2-AI-001   | P0        | Reasoning privado se persiste completo                                       | Fuga de datos, retención excesiva y exposición interna                       | Política de minimización, cifrado y retención separada          |
| E2-AI-002   | P0        | No existe eval suite del lifecycle real                                      | Cambios de prompt/modelo pueden degradar seguridad y resultado               | Evals versionadas como gate de release                          |
| E2-INT-001  | P0        | HMAC interno admite replay dentro de 30 segundos                             | Mutaciones capturadas pueden repetirse                                       | Nonce consumible e idempotencia uniforme                        |
| E2-MKT-001  | P0        | No hay consent ledger, suppression ni unsubscribe                            | Riesgo legal, reputacional y de deliverability                               | Consent/suppression y baja de un click antes de campañas reales |
| E2-OBS-001  | P0        | Logs console y health parcial                                                | No existe evidencia operativa end-to-end                                     | OTel, correlation, redaction y dependency health                |
| E2-SUP-001  | P0        | Actions principales no están fijadas por commit y no hay SBOM/provenance     | Riesgo de supply chain y baja confianza enterprise                           | SSDF, pinning, SBOM, firma y provenance                         |
| E2-PUB-001  | P0        | No hay releases, compatibility policy, CODEOWNERS ni rehearsal público final | Adopción sin unidad estable ni gobernanza                                    | Release 1.0 preview verificable y gobierno real                 |
| E2-DX-001   | P0        | Copiar el template crea fork drift                                           | Cada consumidor queda solo ante upgrades                                     | Project manifest, doctor, upgrade y codemods                    |
| E2-RT-001   | P1        | Bridge interno hace polling secuencial por run                               | Throughput O(runs), latencia y carga Mongo/HTTP                              | Stream o batch interno con cursor y backpressure                |
| E2-CTX-001  | P1        | Hasta 500 mensajes entran al prompt                                          | Context overflow, costo y latencia sin control                               | Context compiler, memoria y token budgets                       |
| E2-MOD-001  | P1        | Un modelo literal define runtime y schema público                            | Vendor concentration y cambios incompatibles                                 | Model profiles estables; DeepSeek continúa como default         |
| E2-FILE-001 | P1        | Upload se bufferiza en browser BFF, API y agente                             | Multiplicación de memoria y mala cancelación                                 | Streaming con límites y checksum incremental                    |
| E2-HA-001   | P1        | PID, rate limits, WebSocket y files son locales                              | No hay HA horizontal segura                                                  | Leases, relay y adapters del perfil cell                        |
| E2-QUE-001  | P1        | Conteo de concurrencia y claim no forman una reserva atómica multi-launcher  | Oversubscription en HA                                                       | Semáforo durable, fairness y fencing distribuido                |
| E2-MKT-002  | P1        | Construcción de campaña síncrona y claim global                              | Request largo, falta de fairness y presión de memoria                        | Audience build asíncrono, chunks y cuotas por tenant            |
| E2-LLM-001  | P1        | Usage se valida y luego se descarta; sin retries ni circuit breaker          | Sin control de costo ni resiliencia                                          | Usage ledger, budgets, retry policy y circuit breaker           |
| E2-DATA-001 | P1        | Tenant creation y otras invariantes multi-documento usan compensación        | Estados parciales ante fallos complejos                                      | Transacción cuando esté disponible más reconciliador            |
| E2-UI-001   | P1        | Badges de health estáticos y navegación mobile incompleta                    | Decisiones operativas erróneas y baja accesibilidad                          | Estado real, responsive, WCAG y error boundaries                |
| E2-API-001  | P1        | BFF duplicado, sin timeout y con respuesta bufferizada                       | Requests colgados, memory pressure y errores pobres                          | Transporte server compartido con timeout y streaming            |
| E2-NGX-001  | P1        | Timeouts WebSocket y 128 MiB aplican a todo el host                          | Recursos excesivos y logs de ticket                                          | Locations separadas, límites alineados y logs seguros           |
| E2-AUD-001  | P1        | Audit es write-only y no tamper-evident                                      | Evidencia difícil de consultar, exportar y preservar                         | Explorer, export firmado e immutable sink opcional              |
| E2-PRV-001  | P1        | No hay clasificación, retention engine ni data subject workflow              | Riesgo de privacidad y almacenamiento indefinido                             | Data catalog, políticas y borrado/export controlado             |

## 6. Pilares de ERA 2

### Pilar A — Trust Kernel

Stock42 debe ofrecer una capa de confianza reutilizable por todas las
capacidades:

- sesiones revocables y step-up authentication;
- authorization policy por capability, recurso, actor, tenant y contexto;
- consent y confirmation como conceptos distintos;
- audit append-only, consultable y exportable;
- clasificación de datos y política de retención;
- idempotencia, replay protection y correlation;
- secrets rotation y keys por entorno;
- evidence bundle por release y por run.

El Trust Kernel no será un framework abstracto. Comenzará consolidando las
reglas ya repetidas en auth, agente, Telegram, WebSocket, files y email.

### Pilar B — Agent Operating System

El runtime debe convertirse en un sistema operativo de trabajo digital:

- manifests versionados;
- catálogo de capabilities y tools filtrado por policy;
- model gateway con DeepSeek como implementación de referencia;
- context compiler y memoria gobernada;
- budgets de tokens, dinero, tiempo y efectos;
- scheduler para trabajos interactivos y programados;
- workers aislados y recuperables;
- confirmations y multi-approval;
- trace, replay, simulation y evals;
- interop MCP y A2A en gateways explícitos.

### Pilar C — Data and Evidence Plane

Cada dato debe tener owner, clasificación, propósito y lifecycle. Cada efecto
debe dejar evidencia suficiente para responder:

- qué ocurrió;
- quién o qué lo inició;
- con qué versión de modelo, prompt, manifest y tool;
- qué policy tomó la decisión;
- qué datos se consultaron;
- quién confirmó;
- cuánto costó;
- cuál fue el resultado externo;
- cómo se repara o revierte.

### Pilar D — Realtime and Performance

Realtime no significa “usar WebSocket”; significa entregar cambios con latencia
previsible, backpressure, replay y comportamiento correcto bajo fallos. El
listener nativo de s42-core se preserva. La evolución se concentra en ingestión
interna, fan-out multi-instancia y SLOs.

### Pilar E — Agent-native Software Factory

Un agente debe poder entender y extender un repositorio Stock42 sin heurísticas:

- manifest de proyecto y capabilities instaladas;
- catálogo generado de rutas, contratos, roles, índices y tools;
- generadores para módulo API, BFF, UI, tool y migración;
- reglas de arquitectura verificables por máquina;
- comandos doctor, test, eval y upgrade;
- tareas con criterios de aceptación y evidence output;
- conformance suite que detecte cambios inseguros.

### Pilar F — Enterprise Control Plane

Backoffice debe evolucionar de CRUD inicial a centro de gobierno:

- identidad y acceso;
- catálogo de agentes, prompts, tools y policies;
- queue, runs, approvals, incidents y costs;
- auditoría y compliance evidence;
- integrations y secrets metadata;
- quotas, plans y feature entitlements;
- data lifecycle y regional cells.

### Pilar G — Ecosistema y negocio

La adopción se vuelve acumulativa cuando terceros pueden crear valor sin
forkear el core:

- SDK y compatibility contract;
- marketplace firmado de capabilities;
- reference applications por industria;
- partner program para software factories;
- certificación técnica y de seguridad;
- LTS y soporte enterprise;
- managed control plane y cells administradas.

## 7. Arquitectura de seguridad 2030

La seguridad de Stock42 debe asumir que prompts, documentos, tools, modelos,
integraciones y hasta capabilities de terceros pueden ser hostiles o estar
comprometidos. El objetivo no es lograr que el modelo “se comporte”; es impedir
que una salida no confiable obtenga autoridad no concedida.

OWASP identifica amenazas específicas de sistemas agénticos y recomienda
analizarlas mediante threat models, límites de autoridad y controles sobre la
ejecución. Stock42 ya mitiga parte de ese problema con tools acotadas, scopes,
confirmations y fencing, pero debe formalizarlo como su
[Agentic Security Profile](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/).

### 7.1 Trust boundaries

| Frontera                        | Entrada no confiable         | Autoridad aceptable | Control objetivo                               |
| ------------------------------- | ---------------------------- | ------------------- | ---------------------------------------------- |
| Browser → BFF                   | Body, headers, IDs, archivos | Ninguna implícita   | Zod, CSRF, cookies HttpOnly, body limits       |
| BFF → API                       | Cookie y request de usuario  | Sesión revalidada   | timeout, correlation, schema, policy           |
| API → agente                    | Contexto firmado             | Capability concreta | nonce, audience, idempotency, mTLS opcional    |
| Usuario → modelo                | Texto y archivos             | Cero                | instruction/data separation y content trust    |
| Modelo → tool                   | Nombre y argumentos          | Cero                | registry, policy, scopes, budget, confirmation |
| Tool → sistema externo          | Efecto                       | Sólo scope aprobado | egress allowlist, secret broker, ledger        |
| Capability de terceros → kernel | Código y manifest            | Cero por defecto    | firma, sandbox, permisos y conformance         |
| Event stream → clientes         | Eventos y cursor             | Recurso autorizado  | tenant topic, gap handling, replay             |
| Operador → control plane        | Configuración y approvals    | Rol más step-up     | separation of duties y audit                   |

### 7.2 Controles obligatorios del Trust Kernel

1. **Sesiones como entidades durables.**
   - Hash del refresh actual y familia de rotación.
   - Reuse detection y revocación de toda la familia.
   - Lista de dispositivos/sesiones con metadata minimizada.
   - Logout actual, logout global y revocación administrativa.
   - Cierre de tickets y sockets vinculados al sid.
   - Step-up para ownership, secrets, billing y acciones A3.

2. **Policy decision antes de cada efecto.**
   - Sujeto, tenant, capability, acción, recurso, clasificación y contexto.
   - Policy version incluida en audit y tool execution.
   - Default deny.
   - Decisión independiente de texto de prompt.
   - Cache corto sólo cuando la revocación esté correctamente modelada.

3. **Replay e idempotencia.**
   - Request ID y nonce firmados en mutaciones internas.
   - Consumo atómico con TTL.
   - Idempotency key con scope, request hash y respuesta durable.
   - Reconciliación explícita para outcomes externos inciertos.

4. **Secrets broker.**
   - El modelo nunca ve secretos.
   - Las tools reciben handles o clientes acotados, no variables globales.
   - Rotación, versionado y audit de uso.
   - KMS o secret manager como adapter de deployment.
   - BYOK opcional para tenants enterprise.

5. **Egress control.**
   - Destinos registrados por servidor.
   - DNS e IP revalidados contra SSRF.
   - Protocolos, puertos y redirects allowlisted.
   - Presupuesto de requests y bytes.
   - Ninguna URL sugerida por el modelo se ejecuta directamente.

6. **Sandbox por perfil.**
   - Community: proceso Bun con env allowlist, filesystem confinado y límites.
   - Enterprise: worker aislado con límites de CPU, memoria, red y filesystem.
   - Una capability declara el perfil mínimo; no puede degradarlo en runtime.

7. **Audit de alta integridad.**
   - Append-only desde la aplicación.
   - Schemas por event type, sin metadata libre ilimitada.
   - Export periódico firmado a un sink inmutable.
   - Retention hold para incidentes y evidencia.
   - Read access separado de write access.

### 7.3 Prompt injection y contaminación de memoria

Toda entrada debe clasificarse como una de estas categorías:

- instrucción confiable de plataforma;
- política o configuración aprobada;
- objetivo de usuario autenticado;
- dato interno recuperado;
- contenido externo no confiable;
- output de modelo no confiable;
- resultado de tool firmado por runtime.

El context compiler conserva esa procedencia. Contenido externo nunca puede
transformarse en system instruction por concatenación. Cuando una tool recibe
datos derivados de contenido no confiable, el ledger conserva la cadena de
provenance. Una acción crítica sigue requiriendo policy y confirmation aunque
el modelo afirme que “el usuario ya autorizó”.

La memoria debe tener controles contra poisoning:

- escritura sólo mediante capability autorizada;
- fuente, actor, fecha, clasificación y expiración;
- revisión o moderación para memoria compartida;
- rollback y cuarentena;
- recuperación limitada al tenant y propósito;
- evals de contaminación y cross-tenant retrieval.

### 7.4 Reasoning, prompts y privacidad

El reasoning privado no es una explicación para el usuario ni un registro de
auditoría confiable. ERA 2 debe:

- no enviarlo a Webapp, Backoffice, logs o analytics;
- no persistirlo por default después de completar el provider turn;
- si el proveedor exige continuidad, mantenerlo cifrado y con TTL corto dentro
  del run;
- separar prompts de plataforma, datos de usuario y resultados de tool;
- guardar para audit versiones, hashes y hechos observables, no pensamiento
  interno;
- permitir una política tenant que prohíba persistencia de inputs sensibles;
- ejecutar data loss prevention antes de enviar contexto a un proveedor.

El programa de riesgo debe seguir las funciones govern, map, measure y manage
del [NIST AI RMF y su Generative AI Profile](https://www.nist.gov/itl/ai-risk-management-framework).
No alcanza con un checklist de seguridad: cada capability necesita evaluación
según contexto, impacto y tolerancia de riesgo.

### 7.5 Privacidad, residencia y regulatory evidence

Stock42 no debe afirmar compliance por instalar un módulo. Debe generar
evidencia que permita a cada producto demostrarla con asesoramiento legal y
controles de infraestructura:

- data catalog por colección/campo;
- purpose y legal basis configurables;
- consent ledger;
- retention policy y legal hold;
- export, rectificación y borrado del sujeto;
- residencia por cell;
- cifrado en tránsito y en reposo;
- subprocessor y model-provider registry;
- incident timeline;
- human oversight y decisiones de policy;
- model, prompt, dataset y eval versions.

La regulación de IA evoluciona y varía por jurisdicción. La arquitectura debe
soportar transparencia, documentación, human oversight, evaluación y registro
sin hardcodear una interpretación legal. La
[Comisión Europea mantiene una guía viva del AI Act](https://digital-strategy.ec.europa.eu/en/faqs/navigating-ai-act);
por eso los compliance packs deben ser versionados y fechados.

### 7.6 Email marketing seguro y utilizable comercialmente

El spooler actual resuelve entrega básica, pero una plataforma global necesita
antes de habilitar campañas reales:

- consent ledger con fuente, propósito, timestamp y prueba;
- global suppression list por tenant y motivo;
- unsubscribe firmado, expirable y sin login;
- List-Unsubscribe y List-Unsubscribe-Post;
- separación estricta entre email transaccional y marketing;
- bounce, complaint y feedback processing;
- quiet hours, timezone y frequency caps;
- remitente, dominio y postal identity por tenant;
- validación operacional de SPF, DKIM y DMARC;
- plantillas con preview, texto plano y link policy;
- cuotas y reputación por tenant;
- export de evidencia y derecho de oposición.

El diseño one-click debe seguir
[RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html). La
[FTC exige un mecanismo de opt-out para mensajes comerciales](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
y el
[GDPR reconoce el derecho a oponerse al marketing directo](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679).
Estos links son referencias de diseño, no asesoramiento legal.

### 7.7 Supply chain y desarrollo seguro

El repositorio público debe adoptar un perfil verificable basado en
[NIST SSDF](https://csrc.nist.gov/pubs/sp/800/218/final):

- branch protection y CODEOWNERS reales;
- Actions fijadas por commit;
- dependencias automatizadas con review;
- secret scanning y push protection;
- SAST, dependency audit y análisis de licencias;
- SBOM CycloneDX por release;
- artifacts y contenedores firmados;
- provenance de build;
- vulnerability disclosure y SLA por nivel;
- patch releases reproducibles;
- threat model y security review para cambios A3;
- evidence bundle descargable por release.

Meta inicial: SLSA Build L2 para artifacts oficiales, porque exige provenance
firmada producida por una plataforma hosted. La especificación vigente y sus
niveles están en [SLSA 1.2](https://slsa.dev/spec/v1.2/).

## 8. Agent Operating System

### 8.1 Manifest v2

El manifest será el contrato central de una capability agéntica.

| Campo                  | Propósito                                                  |
| ---------------------- | ---------------------------------------------------------- |
| id y version           | Identidad estable y compatibilidad                         |
| input, output y events | Schemas públicos                                           |
| modelProfile           | Política de modelo, no nombre hardcodeado en el cliente    |
| tools                  | Allowlist por capability                                   |
| roles y scopes         | Autoridad máxima posible                                   |
| actionLevel            | A0 a A3                                                    |
| dataPolicy             | Clasificación, residency, retention y provider constraints |
| contextPolicy          | Fuentes, token budget y memory policy                      |
| executionPolicy        | Timeout, retry, concurrency, sandbox y network             |
| costPolicy             | Tokens, currency budget y stop conditions                  |
| humanControl           | Confirmation, step-up o multi-approval                     |
| evalSuite              | Casos funcionales, seguridad y regresión                   |
| slo                    | Queue, latency, completion y quality objectives            |
| compatibility          | Schema versions y migration path                           |

El manifest se firma o incluye en el artifact de release. Un run persiste su
manifest version exacta para poder explicarse y reproducirse.

### 8.2 Model gateway

DeepSeek deepseek-v4-pro permanece como default aprobado. ERA 2 desacopla el
contrato público del nombre de modelo mediante perfiles:

- default-reasoning;
- low-latency;
- high-assurance;
- data-residency;
- offline o self-hosted cuando exista soporte real.

Cada perfil resuelve un modelo aprobado por environment/tenant y conserva:

- provider y model version;
- request policy;
- token usage;
- latency;
- retries y error taxonomy;
- costo normalizado;
- data processing region;
- eval score mínimo;
- fecha de aprobación.

Agregar proveedores no es un objetivo en sí mismo. Se incorpora un adapter sólo
cuando pasa la misma conformance y existe demanda. No se implementa un mínimo
común que elimine capacidades útiles de DeepSeek.

### 8.3 Context compiler y memoria

El runtime actual carga hasta 500 mensajes completos. Debe reemplazarse por un
context compiler determinista que produzca un context plan auditable:

1. instrucciones de plataforma versionadas;
2. policy y actor context;
3. objetivo y estado del run;
4. mensajes recientes dentro de budget;
5. resumen durable versionado;
6. memoria recuperada con provenance;
7. artifacts o datos necesarios;
8. tool catalog filtrado;
9. token reserve para respuesta y tools.

Tipos de memoria:

| Tipo           | Vida                | Uso                                       |
| -------------- | ------------------- | ----------------------------------------- |
| Working        | Un run              | Estado temporal y tool results            |
| Conversational | Una conversación    | Resumen y mensajes relevantes             |
| Episodic       | Actor o tenant      | Hechos aprobados de interacciones previas |
| Semantic       | Tenant              | Conocimiento indexado con provenance      |
| Policy         | Plataforma o tenant | Reglas aprobadas, nunca inferidas         |

No se agrega vector search por moda. Primero se define calidad de recuperación,
autorización, deletion y evals. MongoDB continúa como sistema de registro; un
índice vectorial es un mecanismo de búsqueda, no una nueva fuente de verdad.

### 8.4 Tool SDK y policy-filtered registry

Cada tool debe poder desarrollarse como package con:

- schemas Zod;
- capability y action class;
- scopes de datos y egress;
- roles y policy predicates;
- timeout, retry e idempotencia;
- dry-run o preview;
- compensation o reconciliation;
- test kit;
- audit schema;
- health y dependency metadata.

El modelo recibe sólo tools permitidas para ese run. Actualmente el registry
envía todo el catálogo y rechaza después por rol; ERA 2 filtra antes del
provider call y vuelve a autorizar inmediatamente antes del efecto.

### 8.5 Plans, workflows y subagents

La plataforma debe soportar tres niveles, activados gradualmente:

1. **Single agent loop:** baseline actual, ideal para tareas breves.
2. **Durable workflow:** steps declarados, retries, timers y approvals.
3. **Multi-agent task graph:** roles especializados, contratos de handoff,
   budgets compartidos y supervisor.

Un task graph no es una conversación libre entre agentes. Cada nodo tiene
input/output, owner, deadline, policy y evidencia. No existe recursión ilimitada
ni creación autónoma de agentes sin budget.

### 8.6 Human control proporcional

| Nivel | Ejemplo                                     | Control                                 |
| ----- | ------------------------------------------- | --------------------------------------- |
| A0    | Responder o resumir                         | Automático                              |
| A1    | Leer datos autorizados                      | Automático con audit                    |
| A2    | Escribir estado reversible                  | Policy, preview y undo                  |
| A3    | Efecto externo, dinero, identidad o borrado | Step-up y confirmation                  |
| A3+   | Alto impacto regulado                       | Separation of duties o doble aprobación |

La UI de confirmation muestra hechos server-owned: destino, cambio, costo,
policy, expiry y diff. Nunca muestra sólo una descripción producida por el
modelo.

### 8.7 Evals como tests de producto

Cada capability estable debe tener:

- golden tasks;
- authorization matrix;
- prompt injection cases;
- tool misuse and malformed argument cases;
- long-context and memory poisoning cases;
- cancellation, timeout, crash y retry;
- provider failure and degraded mode;
- quality rubric;
- latency y cost budget;
- bias o safety cases relevantes al dominio;
- canary y rollback criteria.

Una release de prompt, model, tool o context compiler falla si cae bajo el
threshold aprobado. Los resultados conservan versión, seed cuando aplique,
dataset hash y environment. Los evals no deben enviar datos productivos a CI.

### 8.8 Trace, replay y simulation

El run debe poder reproducirse sin repetir efectos:

- event log gap-tolerant;
- model responses grabadas o sustituidas por fixtures;
- tool results replayed desde ledger;
- side effects en dry-run;
- policy decisions y manifest exactos;
- timeline visual de intentos y approvals;
- fork desde un checkpoint hacia un entorno sandbox.

Esto convierte debugging, auditoría y mejora de prompts en una disciplina de
ingeniería, no en lectura de logs.

### 8.9 Interoperabilidad

Stock42 debe soportar estándares abiertos sin convertirlos en bypass:

- **MCP client gateway:** consumir tools externas detrás de scopes, OAuth,
  egress policy, schema pinning y confirmation.
- **MCP server gateway:** publicar sólo capabilities seleccionadas, nunca el
  ToolRegistry interno completo.
- **A2A gateway:** descubrir y delegar tareas a agentes externos con budgets y
  contracts.
- **OpenAPI/JSON Schema:** describir HTTP y capabilities para SDKs y agentes.
- **CloudEvents u otro envelope evaluado:** sólo si mejora interop sin sustituir
  el event stream durable actual.

MCP advierte que el protocolo habilita acceso a datos y ejecución, y pone
consentimiento y control del usuario como principios centrales. Su
[especificación de autorización](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
también exige audience binding y prohíbe token passthrough. A2A se incorpora
como adapter para tareas entre agentes independientes conforme a su
[especificación oficial](https://a2a-protocol.org/v0.3.0/specification/).

## 9. Performance, resiliencia y observabilidad

### 9.1 SLOs iniciales

Estos valores son budgets propuestos para el perfil de referencia, no
mediciones del sistema actual. Deben validarse con hardware y dataset
publicados.

| SLI                               | Budget inicial          | Condición                             |
| --------------------------------- | ----------------------- | ------------------------------------- |
| API read p95                      | menor a 250 ms          | sin llamada a proveedor externo       |
| API mutation p95                  | menor a 500 ms          | sin campaign materialization          |
| Auth p95                          | menor a 400 ms          | incluye password verify sólo en login |
| Event committed → browser p95     | menor a 750 ms          | WebSocket healthy, una cell           |
| WebSocket reconnect p95           | menor a 5 s             | ticket nuevo y replay                 |
| Event loss                        | 0 durable               | ante reinicio de API o socket         |
| Cross-tenant delivery             | 0                       | test adversarial permanente           |
| Queue age interactive p95         | menor a 5 s             | dentro de capacidad contratada        |
| Cancel request → process stop p95 | menor a grace más 2 s   | worker healthy                        |
| Agent run success                 | por capability          | nunca una métrica global engañosa     |
| Email duplicate confirmed send    | 0                       | idempotencia y reconciliation         |
| API availability                  | 99,9 por ciento         | perfil enterprise, mensual            |
| Recovery point                    | definido por profile    | Mongo y object storage                |
| Recovery time                     | probado trimestralmente | no sólo documentado                   |

### 9.2 Event plane

E2-COR-001 se resuelve antes de optimizar:

- cursor opaco o gap-tolerant;
- persistencia consistente de state y event;
- reconciliador para transiciones sin evento;
- replay paginado y snapshot de run;
- batch o stream interno autenticado;
- backpressure por subscriber y tenant;
- métricas de lag;
- fan-out local mediante s42-core;
- relay por cell sólo para multi-instancia.

El cliente no debe asumir que sequence más uno siempre existe. Debe poder
detectar un gap, pedir replay y continuar desde el cursor confirmado por el
servidor.

### 9.3 Queue y workers

- Claim con lease y fencing token.
- Reserva atómica de concurrencia global y tenant.
- Weighted fair scheduling por tenant y priority class.
- Interactive, scheduled y batch queues con budgets compartidos.
- Oldest age, saturation y starvation como métricas.
- Graceful drain durante deploy.
- Remote worker identity; nunca señalizar PID de otro host.
- Dead-letter y manual reconciliation para outcomes inciertos.
- Autoscaling basado en queue age y duración, no sólo CPU.

### 9.4 Files y artifacts

- Streaming browser → BFF → API → storage.
- Checksum incremental.
- Límites coherentes en Next, Nginx, API y storage.
- Multipart sólo cuando el tamaño lo justifique.
- Object storage adapter en enterprise.
- URLs presigned de vida corta cuando la policy lo permita.
- Malware scanning y quarantine profile.
- Quota por tenant, owner y MIME.
- Reconciliador metadata/bytes.
- Lifecycle y legal hold.

### 9.5 Email pipeline

- Campaign creation encola un audience build.
- Resolución de miembros en chunks con snapshot versionado.
- Suppression check inmediatamente antes del claim y del send.
- Leases por worker y tenant fairness.
- Rate por dominio, tenant y provider.
- Webhook o feedback ingestion idempotente.
- Bounce y complaint state machine.
- Cost, deliverability y queue age por tenant.
- No almacenar bodies indefinidamente si la evidencia puede conservar un hash.

### 9.6 Provider resilience

- Timeout por connect y response.
- Retry sólo para errores clasificados como transitorios.
- Exponential backoff con jitter y Retry-After.
- Circuit breaker por provider/region.
- Concurrency y token buckets.
- Fallback sólo entre model profiles aprobados.
- Abort propagado hasta fetch y tools.
- Usage persistido por run, tenant y capability.
- Budget preflight y hard stop.
- Degraded mode que preserve funcionalidades no agénticas.

### 9.7 OpenTelemetry

Stock42 necesita traces, metrics y logs correlacionados mediante OpenTelemetry,
un estándar vendor-neutral que soporta esas señales
[en una misma arquitectura](https://opentelemetry.io/docs/concepts/signals/).

Trace mínimo:

    browser request
      → Next BFF
      → API controller
      → Mongo query o internal agent request
      → enqueue
      → launcher
      → worker
      → model turn
      → policy decision
      → tool execution
      → external effect
      → event delivery

Métricas mínimas:

- request count, latency y error por route template;
- Mongo latency y pool saturation;
- rate limit rejects;
- WebSocket connections, subscriptions, backpressure y reconnects;
- event lag y replay gaps;
- queue depth, age, claims y starvation;
- run duration y terminal reason;
- provider latency, tokens, errors y cost;
- tool latency, confirmation wait y uncertain outcomes;
- file bytes, rejects y orphan count;
- email queue, send, bounce, complaint y suppression;
- Telegram poll lag, retries y deliveries.

Tenant ID, user ID, run ID y raw path no deben usarse como labels de métricas.
OpenTelemetry advierte que la cardinalidad determina el costo de memoria de las
métricas y que atributos de alta cardinalidad pueden producir crecimiento no
acotado
[en cada stream](https://opentelemetry.io/docs/concepts/signals/metrics/#cardinality-limits).
El detalle por tenant pertenece a traces muestreadas, logs controlados o
analytics agregadas con política explícita.

### 9.8 Chaos, load y recovery

Antes de una release estable se deben ejecutar escenarios reproducibles:

- API reinicia con sockets activos;
- agente reinicia con queued, running y waiting;
- worker muere antes y después de un side effect;
- Mongo primary cambia;
- provider responde lento, 429, 500 o payload inválido;
- event stream pierde conexión y reanuda;
- object storage no está disponible;
- SMTP confirma tarde o corta conexión;
- Telegram devuelve 409 y 429;
- clock skew dentro y fuera de tolerancia;
- deploy drena sin perder trabajo;
- restore de backup en una cell aislada.

Cada prueba produce un informe con SLO observado, no sólo pass/fail.

## 10. Agent-native Software Factory

La adopción mundial no llegará porque el repositorio tenga muchas features.
Llegará si una software factory puede crear, comprender, validar, extender y
actualizar una solución con una economía radicalmente mejor que mantener su
propio framework interno.

### 10.1 Experiencia de creación

La experiencia objetivo es:

    bunx create-stock42 mi-proyecto
    cd mi-proyecto
    bun run doctor
    bun run dev

El scaffolder debe preguntar sólo decisiones de producto: nombre, perfiles de
despliegue, idiomas, capacidades y proveedores habilitados. No debe inventar
credenciales, infraestructura ni tenants. El resultado tiene que incluir un
happy path autenticado, un agente demostrable y datos de ejemplo no sensibles.

### 10.2 Project manifest y CLI

Un archivo machine-readable, stock42.project.json, será la fuente de verdad de:

- versión del kernel y schema del proyecto;
- capacidades instaladas y sus versiones;
- apps, packages y puertos;
- perfiles de modelo permitidos;
- migraciones aplicadas;
- feature flags y compatibility range;
- extensiones propias y archivos protegidos.

La CLI oficial debe cubrir:

- create: nuevo proyecto desde una release firmada;
- doctor: runtime, variables requeridas, puertos, Mongo, migraciones y drift;
- add y remove: capabilities con manifests y migraciones reversibles;
- generate: módulos, contratos, pantallas, tools y tests según convenciones;
- test y eval: validación determinista y agéntica;
- migrate: cambios de datos explícitos, observables y reanudables;
- upgrade: merge semántico entre releases, con reporte previo de conflictos;
- evidence: SBOM, provenance, checks, evals y artefactos de auditoría.

### 10.3 Evitar el fork drift

La arquitectura de distribución debe distinguir:

1. Kernel: contratos y runtime actualizables con SemVer.
2. Reference product: las cuatro apps que demuestran el sistema completo.
3. Domain capabilities: módulos instalables y removibles.
4. Project space: código del cliente que el upgrader nunca pisa sin permiso.

Cada archivo generado debe declarar ownership o estrategia de merge. Cada
release debe probar upgrades desde las versiones soportadas, incluyendo un
proyecto modificado. Un template que sólo se clona una vez es un pasivo; una
plataforma actualizable es un producto.

### 10.4 Capability Kit

Una capability empresarial debe poder empaquetar:

- contratos Zod y schemas de eventos;
- API controllers, storage e índices;
- tools agénticas y policies;
- pantallas webapp/backoffice y navegación;
- permisos y audit actions;
- configuración y documentación;
- migraciones de datos;
- unit, integration, E2E y eval suites;
- métricas y dashboards;
- manifest de compatibilidad y threat model delta.

Su instalación no debe editar archivos centrales de manera frágil. Los puntos
de extensión deben ser explícitos y validados por la conformance suite.

### 10.5 Arquitectura legible por agentes

Para que un agente de desarrollo trabaje con seguridad, el repositorio necesita
más contexto estructurado y menos convenciones implícitas:

- AGENTS.md jerárquicos y cortos;
- catálogo de capacidades y owners;
- JSON schemas para manifests y configuración;
- machine-readable route, event, permission y tool catalogs;
- architecture tests para los límites apps/packages;
- comandos deterministas de inspección y validación;
- ejemplos pequeños con resultados esperados;
- diff budget y paths permitidos por tarea;
- evidencia obligatoria antes de declarar completitud.

El agente propone; los checks, policies y owners deciden. Nunca se convierte el
texto de un prompt en autorización.

### 10.6 Conformance suite

El producto debe publicar un único comando que demuestre:

- límites arquitectónicos;
- paridad de contratos API/BFF;
- aislamiento tenant;
- matriz de permisos;
- lifecycle completo de sesión y agente;
- reanudación de eventos;
- migración y upgrade;
- redacción de secretos;
- accesibilidad básica;
- manifest e índices consistentes;
- ausencia de drift del proyecto.

Los tests que dependen de servicios reales deben anunciar prerequisitos y usar
exclusivamente destinos autorizados. Un skip nunca debe parecer una aprobación.

### 10.7 Documentación y laboratorio consumidor

La documentación global debe tener inglés como idioma canónico y español como
versión mantenida, con versionado, búsqueda, quickstarts por rol y ejemplos que
se ejecutan en CI. Cada release candidata debe probarse en una máquina o
contenedor limpio: clonar, configurar, iniciar, autenticar, ejecutar un agente,
confirmar un tool, recibir eventos, enviar un email de prueba y actualizar a la
siguiente versión.

Ese clean-room consumer lab es el test de producto más importante del monorepo.

## 11. Producto empresarial completo

### 11.1 Identity and Access

- sesiones visibles, revocables y con detección de reuse;
- MFA y step-up para efectos críticos;
- OIDC/SAML para SSO y SCIM para lifecycle;
- service accounts con scopes y rotación;
- roles custom sobre permisos versionados;
- tenant hierarchy, teams y resource scopes;
- emergency access auditado y temporal.

### 11.2 Agent Control Center

El Backoffice debe operar agentes, no sólo mostrarlos:

- versiones de manifest y rollout por cohortes;
- model profile, budget y límites por agente/tenant;
- tool policies y confirmation policies;
- queue, workers, stuck runs y replay;
- eval scorecards y regresiones;
- trazas de decisiones, costos y efectos;
- pause, drain, cancel y rollback;
- simulación antes de habilitar una versión.

### 11.3 Data Control Center

- clasificación y lineage;
- políticas de retención por clase;
- exportación, rectificación y eliminación;
- legal hold;
- regiones permitidas;
- encryption key policy;
- consentimientos y suppressions;
- restore drills y evidencia de borrado.

### 11.4 Integration Hub

Las integraciones deben ser capacidades gobernadas: webhooks firmados con
replay protection, scheduler durable, event subscriptions, secrets references,
health, retries, dead letters y schemas versionados. SMTP y Telegram son los
primeros adapters; no deben definir el límite de la plataforma.

### 11.5 Usage, budgets y economía

- token, tool, storage, email y egress usage por tenant;
- presupuestos preventivos y alertas;
- costo estimado antes de workflows caros;
- quotas y rate plans;
- showback y chargeback;
- export a billing sin acoplar el kernel a un proveedor comercial.

### 11.6 Cells, residencia y disaster recovery

Cada cell debe contener API, workers, datos y conexiones de una región o grupo
de tenants. El control plane ubica tenants pero no participa en cada request.
La adopción enterprise exige RPO/RTO declarados, restore probado, runbooks,
capacity model y separación de blast radius; no alcanza con tener backups.

### 11.7 Compliance packs

Los packs no pueden afirmar certificación automática. Deben entregar controles,
configuración, checks, evidencia y gaps para marcos como SOC 2, ISO 27001,
GDPR y, según el dominio, salud o finanzas. La responsabilidad final sigue
siendo de la organización que opera el sistema.

## 12. Estrategia de adopción y negocio

### 12.1 Posicionamiento

Stock42 debe ocupar una categoría clara:

> La plataforma open source para construir software empresarial agent-native,
> gobernado, observable y actualizable con Bun, TypeScript, MongoDB y agentes.

No competir como otro starter de Next.js ni como un chat wrapper. El producto
es el sistema operativo de una organización digital: identidad, capacidades,
agentes, tools, eventos, evidencia y operación.

### 12.2 Contrato open source

El núcleo Apache 2.0 debe seguir siendo genuinamente útil en producción:

- referencia full-stack completa;
- identidad local y RBAC;
- agent runtime y tool governance;
- realtime;
- email y Telegram;
- observabilidad portable;
- CLI, SDK y conformance suite;
- self-hosting documentado.

La edición comercial no debe degradar artificialmente seguridad básica,
portabilidad ni capacidad de salir del servicio.

### 12.3 Líneas de negocio sostenibles

1. Managed Cloud: cells administradas, upgrades, backups y SLO contractual.
2. Enterprise Control Plane: SSO/SCIM, policy federation, fleet y compliance.
3. LTS y soporte: backports, advisories, arquitectura y incident response.
4. Capability marketplace: distribución y revenue share con verificación.
5. Factory enablement: formación, certificación y aceleradores sectoriales.
6. Private AI: gateways, modelos y despliegues soberanos.

### 12.4 Flywheel

El crecimiento debe retroalimentarse:

    mejor clean-room DX
      → más proyectos reales
      → más capabilities reutilizables
      → mayor cobertura de conformance y evals
      → menor riesgo de adopción enterprise
      → más inversión en el núcleo

La métrica no es cantidad de código generado. Es tiempo hasta valor, frecuencia
de upgrades exitosos, defectos evitados y porcentaje de capacidades reutilizadas.

### 12.5 Programa para software factories

- reference architectures por escala y regulación;
- curriculum con ejercicios verificables;
- certificación basada en implementación, no asistencia;
- partner tiers ligados a calidad, upgrades y seguridad;
- migration toolkit desde stacks existentes;
- blueprints de estimación y operación;
- office hours y RFCs públicos;
- directorio de partners con historial verificable.

### 12.6 Marketplace seguro

Toda capability publicada debe declarar permisos, datos, destinos externos,
migraciones, modelos y costos esperados. La plataforma debe verificar firma,
provenance, vulnerabilidades, conformance, compatibilidad y política de soporte.
Instalar una capability es una decisión de supply chain, no un copy/paste.

### 12.7 Go-to-market

La secuencia propuesta es:

1. Desarrolladores: quickstart impecable, ejemplos y upgrades confiables.
2. Software factories: kits, conformance, partners y economics demostrables.
3. Equipos plataforma: control plane, cells, policy y observabilidad.
4. Industrias reguladas: compliance packs y despliegues soberanos.

Los casos públicos deben medir reducción de lead time, incidentes, costo de
operación y tiempo de upgrade; evitar testimonios sin evidencia.

## 13. Roadmap priorizado

Las prioridades ERA 2 se identifican como E2-P0 a E2-P3 para no confundirlas
con los P0 de publicación ya documentados en NEWERA.md. Los plazos indican una
secuencia razonable para un equipo dedicado; no sustituyen estimación ni
asignación de owners.

### E2-P0 — Trust y productización, 0 a 90 días

Ningún desarrollo enterprise o marketplace debe adelantarse a este gate.

| ID       | Entregable                | Criterio de aceptación                                                                                                                  | Dependencia                    |
| -------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| E2-P0.1  | Event plane correcto      | Secuencia y persistencia son atómicas o reconciliables; reconnect recupera cada evento; carga sostenida no produce gaps silenciosos     | Especificación de evento       |
| E2-P0.2  | Session control           | Sesiones listables y revocables, refresh rotation por familia, reuse detection y cierre global; tests de robo/replay                    | Modelo de sesión               |
| E2-P0.3  | Internal trust            | Nonce o request ID de un solo uso, replay cache, audiencia, idempotencia por efecto y redacción recursiva                               | Contrato API-agent             |
| E2-P0.4  | AI safety baseline        | Threat model agentic, política de prompt/reasoning, input provenance, eval dataset versionado y blocking thresholds en CI               | Owners de producto y seguridad |
| E2-P0.5  | Email compliance          | Consentimiento/provenance, suppression list, unsubscribe normal y one-click, bounce/complaint states y rate policy                      | Decisión legal y proveedor     |
| E2-P0.6  | Observabilidad base       | Request/run correlation end-to-end, OTel traces/metrics/logs, queue/event/provider dashboards y alertas accionables                     | Collector y backend elegidos   |
| E2-P0.7  | HTTP y BFF seguros        | Timeouts y aborts; streaming para archivos; límites por ruta; Nginx separa HTTP de WebSocket; CSP, frame, referrer y permissions policy | Threat model web               |
| E2-P0.8  | Supply chain verificable  | Actions pinneadas por commit, SBOM, provenance, dependency review, secret scan y release artifacts firmados o attestados                | GitHub público configurado     |
| E2-P0.9  | Release pública repetible | CODEOWNERS reales, reglas de branch, contacto de seguridad, clean-room rehearsal, tag SemVer y checks requeridos                        | Decisiones de owners           |
| E2-P0.10 | Producto actualizable     | Project manifest, doctor y prueba de upgrade sobre un proyecto modificado; drift report sin pérdida silenciosa                          | Contrato kernel/project        |

Salida del gate: una organización externa puede clonar, entender, ejecutar,
evaluar, asegurar y actualizar el producto sin conocimiento tribal. Si esa
prueba falla, aún existe un buen repositorio, no una plataforma adoptable.

### E2-P1 — Agent OS y producto completo, 3 a 6 meses

| ID       | Entregable                 | Criterio de aceptación                                                                                   |
| -------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| E2-P1.1  | Context compiler y memoria | Presupuesto por capas, compaction verificable, provenance, memoria tipada y delete/export                |
| E2-P1.2  | Model gateway              | Profiles por tarea, usage/cost persistido, timeout/retry/circuit breaker y fallback gobernado            |
| E2-P1.3  | Policy engine              | Tools filtradas antes del modelo, input/output policy, approvals por riesgo y deny evidence              |
| E2-P1.4  | Durable workers            | Claims y concurrency seguros para múltiples launchers, heartbeats, drain y stuck-run recovery            |
| E2-P1.5  | Event bridge escalable     | Batch/stream por cursor y suscripción compartida; cero polling por run                                   |
| E2-P1.6  | Agent workspace            | Chat/run history, archivos, artifacts, confirmaciones, cancelación, reconnect y estados de error reales  |
| E2-P1.7  | Operations Backoffice      | Queue, workers, runs, sessions, audit, email y Telegram operables con permisos específicos               |
| E2-P1.8  | Evals y replay             | Suites de calidad/safety/performance, trace export, deterministic replay y release gate                  |
| E2-P1.9  | Capability Kit             | Un módulo de referencia instala API, UI, tool, permissions, indexes, docs y tests sin edición frágil     |
| E2-P1.10 | Test pyramid real          | Lifecycle de agentes, autorización, multi-tenant, realtime y side effects probados más allá de contratos |

### E2-P2 — Enterprise y escala, 6 a 12 meses

| ID      | Entregable             | Criterio de aceptación                                                                |
| ------- | ---------------------- | ------------------------------------------------------------------------------------- |
| E2-P2.1 | Enterprise IAM         | OIDC/SAML, SCIM, MFA, service accounts, custom roles y emergency access               |
| E2-P2.2 | Distributed state      | Object storage, shared rate limit, shared session/replay state y workers horizontales |
| E2-P2.3 | Cell architecture      | Placement, isolation, capacity, RPO/RTO y restore/drain demostrados por cell          |
| E2-P2.4 | Integration Hub        | Scheduler, signed webhooks, event subscriptions, dead letters y secrets references    |
| E2-P2.5 | Data governance        | Clasificación, lineage, retention, export/delete, legal hold y region policy          |
| E2-P2.6 | Immutable evidence     | Audit append-only verificable, export firmado y consultas operativas con retention    |
| E2-P2.7 | Usage y budgets        | Medición, quotas, showback/chargeback y budget enforcement por tenant/capability      |
| E2-P2.8 | Global product quality | Inglés/español mantenidos, WCAG 2.2 AA, mobile, browser matrix y performance budgets  |
| E2-P2.9 | Compliance packs       | Controles, gaps y evidencia reproducible, sin claims de certificación automática      |

### E2-P3 — Ecosistema global, 12 a 24 meses

| ID      | Entregable         | Criterio de aceptación                                                               |
| ------- | ------------------ | ------------------------------------------------------------------------------------ |
| E2-P3.1 | CLI y SDK estables | Compatibilidad publicada, migraciones probadas y soporte de versiones definido       |
| E2-P3.2 | Marketplace        | Firma, provenance, permissions manifest, scoring, revocación y revenue share         |
| E2-P3.3 | MCP y A2A          | Adapters explícitos, auth segura, discovery gobernado y conformance tests            |
| E2-P3.4 | Managed Cloud      | Cells administradas, tenant placement, upgrades, backups y SLO contractual           |
| E2-P3.5 | Partner network    | Formación, certificación práctica, directorio y quality score verificable            |
| E2-P3.6 | LTS program        | Cadencia, backports, advisories, EOL y upgrade paths financiables                    |
| E2-P3.7 | Sovereign AI       | Profiles para gateways y modelos self-hosted, data boundary y benchmarks comparables |

### Horizonte continuo 2028–2030

- revisar anualmente supuestos sobre modelos, regulación, identidad y standards;
- mantener una suite de compatibilidad con providers y runtimes soportados;
- experimentar con verificación formal en policies y workflows críticos;
- medir energía, tokens, latencia y costo como recursos de primera clase;
- preservar exportabilidad de datos, traces, manifests y capabilities;
- retirar abstracciones que no demuestren adopción o reducción de riesgo.

## 14. Los primeros 30 y 90 días

### Días 1–30: fijar invariantes

**Semana 1 — Contratos.** Congelar el schema de eventos v1, escribir el threat
model transversal, definir clases de datos, SLOs, support matrix y ownership.

**Semana 2 — Trust Kernel.** Corregir event sequencing/replay, diseñar sesiones
revocables y cerrar replay/idempotencia del canal interno.

**Semana 3 — Evidencia.** Instrumentar el primer trace end-to-end, persistir
usage de modelos, crear eval fixtures y definir consent/suppression de email.

**Semana 4 — Producto.** Especificar project manifest, prototipar doctor,
ejecutar clean-room rehearsal y cerrar los controles públicos de GitHub.

Resultado de día 30: decisiones irreversibles explicitadas, tres riesgos P0 con
implementación en curso y un tablero que distingue hecho, medido y supuesto.

### Días 31–90: completar E2-P0

1. Terminar session control, internal trust y email compliance.
2. Llevar OTel, timeouts, streaming, headers y Nginx a production-ready.
3. Convertir evals, event reconnect y upgrade en gates de CI.
4. Publicar una release candidate con SBOM/provenance.
5. Hacer que un equipo externo complete el consumer lab sin ayuda síncrona.
6. Corregir cada fricción del laboratorio antes del primer tag estable.

Resultado de día 90: release instalable y actualizable, controles críticos
verificados, evidencia observable y primer caso externo reproducible.

## 15. Sistema de métricas

No se debe gestionar ERA 2 por cantidad de commits, líneas, prompts o estrellas.

### 15.1 Adopción y developer experience

- tiempo mediano desde clone hasta primer run autenticado exitoso;
- porcentaje de quickstarts completados sin soporte humano;
- tasa de upgrade exitoso sobre proyectos modificados;
- tiempo para construir una capability con API, UI, tool y tests;
- porcentaje de documentación ejecutable que pasa en CI;
- proyectos activos que permanecen dentro de la support window.

Objetivo inicial: primer valor en menos de 20 minutos en un entorno con
prerequisitos, y al menos 95% de upgrades exitosos en el corpus soportado.

### 15.2 Trust y seguridad

- cero accesos cross-tenant en conformance y producción;
- 100% de efectos críticos con policy decision y ledger;
- cobertura de permisos por ruta, tool y operación;
- tiempo de revocación de sesión/capability comprometida;
- edad de vulnerabilidades y secretos expuestos;
- porcentaje de artifacts con SBOM y provenance;
- restauraciones y ejercicios de incident response exitosos.

### 15.3 Calidad agéntica

- task success y policy compliance por capability;
- regresiones de eval bloqueadas antes de release;
- confirmaciones innecesarias y denegaciones correctas;
- tool error, uncertain outcome y duplicated-effect rate;
- context efficiency: resultado por token/costo/latencia;
- incidentes de prompt injection y memory poisoning detectados.

### 15.4 Performance y resiliencia

- SLO attainment y error budget burn;
- queue age p95 y run terminal latency;
- pérdida, gap y lag de eventos;
- reconnect success;
- provider throttling, circuit state y degraded-mode success;
- RPO/RTO observado en restore drills.

### 15.5 Comunidad y negocio

- contributors y maintainers activos, no sólo cuentas;
- tiempo de primera respuesta y merge de contribuciones;
- capabilities verificadas y upgrades compatibles;
- partner delivery quality y retención;
- costo total por outcome y margen de servicios gestionados;
- ingresos reinvertidos en mantenimiento del núcleo.

Cada objetivo necesita baseline, owner, ventana y fuente de datos antes de ser
usado como compromiso comercial.

## 16. Gobernanza, releases y compatibilidad

### 16.1 Niveles de madurez

Cada API, capability y feature se declara como:

- experimental: puede romper y no procesa producción crítica;
- preview: contrato visible, feedback activo, migración asistida;
- stable: SemVer, documentación, SLO, threat model y conformance;
- LTS: ventana extendida, backports y EOL anunciado.

Una etiqueta visual o una fecha no promueven madurez. Lo hacen la evidencia y
el compromiso de mantenimiento.

### 16.2 Contratos versionados

Se versionan explícitamente:

- HTTP, WebSocket y event schemas;
- project y capability manifests;
- agent manifests, tool inputs y outputs;
- permission catalog y audit actions;
- storage migrations y indexes;
- CLI y SDK;
- export formats y evidence bundles.

Toda ruptura necesita migration path, codemod cuando sea razonable, deprecation
window y prueba desde cada versión soportada. El número exacto de versiones y
los plazos de deprecación son decisiones comerciales a aprobar, no supuestos de
este documento.

### 16.3 Decisiones públicas

- RFC para cambios transversales, seguridad o contratos estables;
- registro breve de decisiones de arquitectura;
- threat model delta para nuevas trust boundaries;
- owners reales para code, security y release;
- roadmap público que distinga committed, planned y exploring;
- security advisories y CVE cuando corresponda;
- reunión o informe periódico de compatibilidad y salud.

### 16.4 Cadencia propuesta

- snapshots automatizados para integración;
- releases estables regulares sólo si pasan consumer lab;
- security releases fuera de cadencia;
- LTS con ventana financiada y política publicada;
- una capability nunca obliga a actualizar todo el sistema sin explicar por qué.

La cadencia definitiva debe corresponder a la capacidad real del equipo de
mantener, soportar y corregir; prometer más reduce confianza.

## 17. Qué no hacer

1. No dividir en microservicios antes de que ownership, escala o blast radius lo
   justifiquen.
2. No agregar proveedores de modelos para inflar una matriz de logos; agregar
   perfiles por necesidad verificada.
3. No exponer una tool Mongo genérica ni permitir que un prompt defina scope,
   tenant o autorización.
4. No ejecutar cambios autónomos en producción sin policy, evidencia y rollback.
5. No almacenar razonamiento interno, prompts o payloads sensibles por defecto.
6. No declarar compliance, alta disponibilidad o performance sin pruebas.
7. No enviar telemetría oculta desde instalaciones self-hosted.
8. No mezclar APIs de control internas con contratos públicos sin versionado.
9. No convertir cada capability en un fork ni cada cliente en una rama eterna.
10. No hacer del marketplace una vía para eludir permisos o supply chain.
11. No esconder skips de integración detrás de un check verde.
12. No construir features de AI sin outcome, eval y presupuesto operativo.
13. No diseñar infraestructura global que un proyecto pequeño deba pagar.
14. No reemplazar simplicidad por frameworks ceremoniales ajenos a Stock42.

## 18. Decisiones que requieren aprobación de los responsables

Este documento recomienda dirección, pero no toma decisiones empresariales que
requieren autoridad explícita:

| Decisión                                           | Por qué bloquea                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| Marca, dominio y política de trademark             | Define nombre del CLI, packages, marketplace y programa de partners |
| Maintainers, CODEOWNERS y security contacts        | Sin personas responsables no existe release pública sostenible      |
| Support window y LTS                               | Determina costo, compatibilidad y promesa comercial                 |
| Frontera open source/enterprise                    | Evita sorpresas y protege la confianza del ecosistema               |
| Package scope y canal de distribución              | Necesario para CLI, SDK y manifests verificables                    |
| Backend de observabilidad y política de telemetría | Afecta privacidad, costo y operación self-hosted                    |
| Proveedores/modelos soportados                     | Define eval matrix, fallback y compromiso de soporte                |
| Regiones, Managed Cloud y RPO/RTO                  | Requiere inversión e infraestructura real                           |
| Proveedor y jurisdicciones de email                | Condiciona consentimiento, suppressions y operación legal           |
| Programa de certificación y revenue share          | Define incentivos y calidad del marketplace                         |

Hasta aprobarlas, se pueden diseñar interfaces portables y recolectar evidencia;
no se deben inventar nombres, credenciales, responsables ni compromisos.

## 19. Definición de “2030, hoy”

No significa implementar diez años de features inmediatamente. Significa tomar
hoy las decisiones que evitan quedar atrapados mañana.

Stock42 alcanza el estándar ERA 2 cuando:

- un equipo externo crea y actualiza un proyecto sin intervención del core team;
- un agente opera con identidad, policy, presupuesto, evals y evidencia;
- cada efecto externo es atribuible, idempotente o declaradamente incierto;
- eventos y workflows sobreviven reinicios y escalado sin pérdida silenciosa;
- datos y memoria tienen provenance, lifecycle y controles de región;
- seguridad, performance y recuperación se miden contra SLOs;
- una capability cruza API, agente y UI mediante contratos instalables;
- las interfaces públicas tienen versionado y migraciones verificadas;
- la edición open source sigue siendo portable y operable;
- el modelo de negocio financia mantenimiento, seguridad y compatibilidad;
- una software factory gana más reutilizando y actualizando que forkeando;
- la evidencia distingue con claridad diseño, test, release y producción.

La meta de adopción global no puede garantizarse desde un plan. Sí puede
convertirse en una hipótesis medible: Stock42 será adoptable si reduce el tiempo
hasta valor y el costo de cambio sin trasladar riesgo oculto a seguridad,
operación o clientes.

## 20. Principio de ejecución

El orden final es deliberado:

    Trust Kernel
      → producto actualizable
      → Agent OS verificable
      → operación enterprise
      → ecosistema global

Si se altera ese orden, el crecimiento multiplica deuda y riesgo. Si se respeta,
cada cliente, capability, eval y partner aumenta el valor del núcleo.

La primera decisión práctica es aprobar o ajustar E2-P0. Luego cada ítem debe
convertirse en una especificación pequeña con owner, threat model, métricas,
tests, rollout y rollback. ERA2.md mantiene la dirección; no debe convertirse
en un backlog infinito ni reemplazar el diseño de cada entrega.

## 21. Fuentes y criterio de análisis

Este plan se construyó inspeccionando el código, contratos, tests, scripts,
configuración operativa y documentación del monorepo en la revisión indicada al
inicio. Un elemento se describe como actual sólo cuando existe evidencia en el
repositorio; los objetivos de latencia, escala, compliance y adopción se
presentan como propuestas hasta que exista medición o validación externa.

Referencias primarias que informan el objetivo:

- NIST AI Risk Management Framework y GenAI Profile:
  https://www.nist.gov/itl/ai-risk-management-framework
- OWASP GenAI Security Project, Agentic AI Threats and Mitigations:
  https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/
- Unión Europea, guía vigente sobre AI Act:
  https://digital-strategy.ec.europa.eu/en/faqs/navigating-ai-act
- NIST Secure Software Development Framework, SP 800-218:
  https://csrc.nist.gov/pubs/sp/800/218/final
- SLSA specification 1.2:
  https://slsa.dev/spec/v1.2/
- OpenTelemetry signals y cardinality limits:
  https://opentelemetry.io/docs/concepts/signals/
  y https://opentelemetry.io/docs/concepts/signals/metrics/#cardinality-limits
- Model Context Protocol, authorization specification:
  https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- Agent2Agent Protocol specification:
  https://a2a-protocol.org/v0.3.0/specification/
- RFC 8058, one-click unsubscribe:
  https://www.rfc-editor.org/rfc/rfc8058.html
- FTC, CAN-SPAM compliance guide:
  https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- Reglamento General de Protección de Datos, texto oficial:
  https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679

Las referencias definen prácticas y obligaciones generales; no certifican este
repositorio ni sustituyen revisión legal, auditoría o pruebas de producción.
