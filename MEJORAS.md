# Mejoras concretas del proyecto

Relevamiento del **9 de septiembre de 2026**, sobre `main` en
`645276564215fff8c8090b0cbb4c9abaac84e114`, después de `git pull --ff-only`.

Este documento contiene **45 propuestas**, basadas en el código actual y en
verificaciones locales. No autoriza ni implementa esas mejoras. La prioridad es
corregir comportamientos existentes y completar operaciones que el proyecto ya
ofrece, conservando Bun, MongoDB, Next.js, shadcn compartido y `s42-core`.

## Alcance y evidencia

| Superficie revisada | Qué se contrastó                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| API                 | Boot, configuración, auth, CSRF, roles, tenancy, storages, índices, auditoría, errores, archivos, email y WebSocket.   |
| Agente              | Contratos, cola, launcher, supervisor, procesos, orquestación, DeepSeek, confirmations, uploads, artifacts y Telegram. |
| Webapp y Backoffice | Sesión, BFF, formularios, permisos visibles, listados, paneles agénticos y navegación responsive.                      |
| Paquetes            | Contratos Zod, transporte HTTP/WebSocket, catálogo UI, configuración TypeScript y ESLint.                              |
| Operación y calidad | Launchers, Turborepo, configuración de entornos, Nginx, CI, tests y documentos operativos/roadmaps.                    |

Se revisaron los caminos de ejecución y sus consumidores, no sólo nombres de
archivos o comentarios. Las reproducciones de fallos usaron datos sintéticos y
dobles de dependencias; no se conectaron a MongoDB ni a proveedores reales.
No se inspeccionaron credenciales ni archivos `.env` locales.

### Validaciones realizadas

| Validación                                                    | Resultado                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `bun run check-types`                                         | Correcto; 7 tareas, 5 recuperadas de caché.                                                 |
| `bun run lint`                                                | Correcto; 7 tareas, 5 recuperadas de caché.                                                 |
| `bun run test` y repetición con `bunx turbo run test --force` | **60 tests correctos**; segunda ejecución sin caché.                                        |
| `bun run test:tools`                                          | **9 tests correctos**.                                                                      |
| `bun run boundaries`                                          | **5 tests correctos** y scanner correcto.                                                   |
| `bun run format:check`                                        | Correcto sobre el baseline.                                                                 |
| `./build-all.sh`                                              | Correcto; Backoffice compilado y Webapp recuperada de caché. API y agente no se compilaron. |
| `bun audit`                                                   | **Falla: 18 alertas, 2 críticas, 8 altas y 8 moderadas**, agrupadas en 8 paquetes.          |
| Plan de Turbo mediante `--dry=json`                           | Confirmada la omisión de variables E2E detallada en M13.                                    |

No se ejecutaron integración MongoDB, E2E autenticados, `indexes:verify`, pruebas
de carga ni verificación de producción. Tampoco se verificaron TLS, backups,
reglas de GitHub o explotación de vulnerabilidades. Un test unitario verde no
demuestra esas propiedades. Los errores siguientes son hallazgos de código o
reproducciones controladas, **no incidentes atribuidos a producción**.

### Reproducciones que respaldan la prioridad

| Caso                                                                                                                            | Resultado observado                                                                         | Propuesta |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------- |
| Configuración productiva con `https://fcorp.invalid`, `https://127.audit.invalid` y `https://10.audit.invalid` como URL interna | Las tres se aceptan sin override; no se realizó ninguna conexión.                           | M02       |
| Request BFF con una IP sintética y upstream sustituido                                                                          | La IP no llega al upstream; tampoco se envía `AbortSignal`.                                 | M03, M16  |
| Evento de formulario en Chromium, antes y después de un `await`                                                                 | `currentTarget` pasa de presente a `null`.                                                  | M04       |
| Alta de tenant con inserción exitosa y fallo posterior de auditoría                                                             | Tenant conservado y owner eliminado.                                                        | M05       |
| Fallo al insertar el primer evento, seguido de un segundo evento                                                                | Se persiste secuencia 2; el cliente no entrega ningún evento porque espera 1.               | M06       |
| Fallo del acuse Telegram seguido de un envío que exige reconciliación                                                           | Dos lecturas del update y ningún avance de offset.                                          | M09       |
| Detención de campaña entre su lectura y el cambio a `sending`                                                                   | El estado vuelve a `sending` y se invoca el transporte simulado.                            | M10       |
| Filtrado BFF de una respuesta de archivo                                                                                        | Se pierden `Content-Disposition`, `X-Artifact-Sha256`, `Cache-Control` y `RateLimit-Limit`. | M17       |
| 20 candidatos de un tenant al límite, seguidos por uno de otro tenant habilitado                                                | `claimNext()` devuelve `null` pese a existir capacidad global.                              | M19       |
| PDF con emoji y división de una palabra de 100 caracteres                                                                       | Helvetica rechaza el emoji; la expresión de corte conserva sólo 82 caracteres.              | M26       |

## Cómo priorizar

- **Alta:** error funcional, consistencia, seguridad o gate que conviene resolver
  antes de ampliar funcionalidades.
- **Media:** completa o mejora una operación existente; se puede ejecutar después
  de estabilizar los errores de prioridad alta.
- **Baja:** mantenimiento acotado sin bloqueo inmediato.

El esfuerzo es relativo: **S** = cambio localizado; **M** = varias piezas y
pruebas; **L** = estado persistido o recuperación entre procesos. No son promesas
de calendario. Cada ítem se considera terminado cuando satisface su comprobación
y actualiza los contratos/documentos afectados.

## Seguridad, errores funcionales y consistencia

### M01. Actualizar las dependencias que hoy hacen fallar la auditoría

**Alta · M · Verificado con `bun audit`.**

El [manifest raíz](./package.json), el [lockfile](./bun.lock) y los manifests de
[API](./apps/api/package.json) y [UI](./packages/ui/package.json) resuelven versiones
reportadas de `next`, `nodemailer`, `sharp`, `nanoid`, `fast-uri`, `js-yaml`, `hono`
y `qs`. Varios overrides fijan precisamente versiones que ahora tienen alertas.
El CI ejecuta este gate y su comando falla en el baseline actual.

Actualizar selectivamente, revisar los overrides y mantener Next/ESLint de Next
alineados. No ejecutar una actualización indiscriminada de todo el monorepo.
Los avisos oficiales de Next indican correcciones en **16.3.3**: uno afecta a
[servidores Windows](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36)
y el otro a [optimización de AVIF](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4).
Este workspace es Linux y no se encontró uso de `next/image` en las apps; no se
demostró una ruta explotable. Nodemailer recibe emails individuales validados,
lo cual también importa al evaluar su
[aviso de addressparser](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-2x7j-588g-ccc2).

**Comprobación:** instalación frozen reproducible, audit sin alertas pendientes,
types, lint, tests y ambos builds; comprobar por separado runtime y tooling.

### M02. Corregir la clasificación de hosts privados

**Alta · S · Reproducido.**

`isPrivateAgentUrl()` e `isPrivateHost()` en la configuración de
[API](./apps/api/src/config/index.ts) y [agente](./apps/agent/src/config/index.ts)
aceptan prefijos de texto como `fc`, `fd`, `127.` o `10.` sin verificar primero
que sean direcciones IP. Un hostname DNS ordinario puede pasar el control de
privacidad. Es un error del validador de configuración, no una prueba de SSRF
desde una request pública.

Usar `isIP()` antes de evaluar rangos IP y una regla explícita para los nombres
internos admitidos. Revisar la misma validación en
[update-env](./scripts/update-env.ts), conservando los overrides explícitos.

**Comprobación:** los tres hostnames sintéticos anteriores se rechazan sin
override; loopback, rangos privados reales y nombres internos autorizados pasan.

### M03. Conservar la IP confiable a través del BFF

**Alta · M · Reproducido en el proxy; consecuencia visible en código.**

Los proxies de [Webapp](./apps/webapp/lib/api-proxy.ts) y
[Backoffice](./apps/backoffice/lib/api-proxy.ts) descartan `X-Forwarded-For`.
La [API](./apps/api/src/index.ts) termina aplicando el límite HTTP y el de login
a la IP del proceso Next. Usuarios distintos comparten así los buckets de
120 requests/minuto y 10 intentos de login/minuto configurados por defecto.

Definir y probar el salto de confianza Nginx → Next → API. Propagar únicamente
la IP normalizada por el proxy confiable, incluyendo handlers de archivos;
no copiar ciegamente el header que envía un cliente directo. Actualizar los
[virtual hosts](./nginx/) y la configuración de proxies en esa tarea.

**Comprobación:** dos clientes a través del BFF consumen cuotas diferentes;
un cliente directo no puede elegir su IP mediante headers falsificados.

### M04. Corregir los formularios que usan el evento después de un `await`

**Alta · S · Patrón confirmado y mecanismo reproducido en Chromium.**

`event.currentTarget.reset()` aparece después de requests asíncronas en
[tenants](./apps/backoffice/components/tenant-manager.tsx),
[personas](./apps/backoffice/components/tenant-people.tsx),
[Telegram AI](./apps/backoffice/components/telegram-ai-manager.tsx) y
[email marketing](./apps/backoffice/components/email-marketing-manager.tsx).
El recurso puede haberse creado y el formulario fallar al resetearse, antes de
recargar la lista. En algunas acciones el error queda como rechazo sin capturar.

Guardar `const formElement = event.currentTarget` antes del primer `await` y
utilizar esa referencia. Capturar errores en cada handler y deshabilitar el
envío mientras se procesa, donde todavía falta.

**Comprobación:** cada alta exitosa limpia el formulario, actualiza la lista y
no muestra un falso error ni produce una segunda escritura por doble clic.

### M05. Evitar que un fallo de auditoría deje un tenant sin owner

**Alta · S · Reproducido.**

En [TenancyService.createTenant](./apps/api/src/modules/tenants/services/TenancyService.ts),
la creación del tenant y la auditoría comparten un `try`. Si falla sólo
`AuditService.record()`, el `catch` elimina el owner aunque el tenant ya exista.

Limitar la compensación a la creación fallida del tenant. Manejar y registrar
separadamente el fallo de auditoría, con recuperación explícita; no borrar una
identidad de una creación que ya se confirmó. No requiere introducir una nueva
arquitectura ni asumir soporte de transacciones MongoDB.

**Comprobación:** inyectar fallos de inserción y auditoría por separado; nunca
queda un tenant apuntando al owner que acaba de eliminarse.

### M06. Hacer recuperable la secuencia durable de eventos

**Alta · L · Reproducido.**

[AgentStore.appendEvent](./apps/agent/src/runtime/store/AgentStore.ts) incrementa
`eventSequence` y después inserta el evento en otra escritura. Un fallo entre
ambas deja un hueco. El [cliente realtime](./packages/api-client/src/realtime.ts)
espera exactamente `cursor + 1`; el
[bridge](./apps/api/src/websocket/AgentEventBridge.ts) puede avanzar al último
evento leído. También hay que contemplar inserciones que terminan fuera de orden.

Persistir una reserva recuperable del evento antes de exponer su secuencia, o
hacer atómica esa unidad si la instalación ya soporta transacciones. El bridge
debe avanzar sólo sobre el tramo confirmado. Definir una recuperación explícita
para huecos existentes; no saltarlos silenciosamente ni perder eventos.

**Comprobación:** fallos entre escrituras y productores concurrentes no congelan
el Backoffice; replay entrega progreso y estado terminal en orden, sin pérdidas.

### M07. Publicar runs en la cola sólo cuando su entrada esté completa

**Alta · M · Confirmado por orden de escrituras.**

[AgentStore.enqueue](./apps/agent/src/runtime/store/AgentStore.ts) inserta el run
como `queued` antes de guardar conversación, mensaje y evento inicial.
`claimNext()` ya puede reclamarlo. Si falla `addMessage()`, un reintento encuentra
el run existente y lo devuelve sin completar la preparación.

Agregar un estado o flag de preparación que excluya el run del claim hasta
terminar las escrituras. Completar idempotentemente preparaciones interrumpidas.
Conservar la clave existente por tenant, actor e idempotencia.

**Comprobación:** pausar o fallar cada escritura del alta; el launcher nunca
ejecuta un run sin su mensaje y el reintento no crea mensajes ni runs duplicados.

### M08. Reanudar todos los tool calls pendientes tras una confirmación

**Alta · M · Confirmado por el flujo del orquestador.**

En el [orquestador](./apps/agent/src/orchestration/AgentOrchestrator.ts), una tool
crítica interrumpe el `for` de `assistant.tool_calls`. Al reanudar,
`resumeResolvedConfirmation()` agrega sólo la respuesta de esa tool y vuelve
a consultar al proveedor. Las llamadas posteriores del mismo mensaje quedan
sin respuesta.

Reconstruir y continuar los tool calls pendientes del mensaje almacenado,
reutilizando los resultados existentes. Validar que cada `tool_call_id` tenga
exactamente una respuesta antes de la siguiente completion.

**Comprobación:** una respuesta con una tool crítica seguida de otra tool
funciona al aprobar, rechazar o expirar; no omite llamadas ni duplica efectos.

### M09. Aislar fallos de entrega de Telegram del avance de recepción

**Alta · M · Reproducido.**

[TelegramPollingRuntime](./apps/agent/src/telegram/TelegramPollingRuntime.ts)
avanza el offset después de enviar el acuse. Si el envío falla, el update se
procesa otra vez, pero [TelegramService](./apps/agent/src/tools/telegram/TelegramService.ts)
rechaza el delivery anterior incierto y exige reconciliación. El offset puede
quedar bloqueado indefinidamente. En entregas, el `catch` exterior al lote deja
que un run fallido impida procesar los siguientes.

Separar aceptación durable del update y entrega del acuse; guardar la incidencia
sin bloquear la recepción. Aislar errores por delivery y ofrecer una operación
acotada para resolver los estados inciertos ya existentes. Mantener la regla de
no reenviar automáticamente un efecto cuyo resultado no se conoce.

**Comprobación:** falla el acuse de un update y siguen entrando los siguientes;
un delivery pendiente de revisión no detiene las respuestas de otros runs.

### M10. Impedir que el worker reactive campañas detenidas

**Alta · M · Reproducido.**

[EmailMarketingService.process](./apps/api/src/modules/email-marketing/services/EmailMarketingService.ts)
lee la campaña y luego llama `setStatus(..., "sending")`. El
[storage](./apps/api/src/modules/email-marketing/services/EmailMarketingStorage.ts)
actualiza sin comparar el estado previo. Si se detiene entre ambos pasos, vuelve
a `sending`. `sendNow()` y la finalización también usan lecturas y escrituras
separadas. El test actual del helper terminal no cubre esta carrera.

Hacer las transiciones con estado/version esperados y verificar el resultado
antes del envío. Un `stopped` no debe poder sobrescribirse por un worker tardío.
Un mensaje que ya llegó a SMTP sigue siendo irrevocable.

**Comprobación:** intercalar stop antes del claim, antes de `sending`, durante
SMTP y antes de finalizar; la campaña conserva `stopped` y se detiene lo pendiente.

### M11. Normalizar la zona horaria al programar campañas

**Alta · S · Confirmado por contrato y comparación del storage.**

[IsoDateSchema](./packages/contracts/src/common.ts) acepta offsets, pero
[createCampaign](./apps/api/src/modules/email-marketing/services/EmailMarketingService.ts)
persiste `scheduledAt` sin normalizar. `claimDue()` compara cadenas contra una
fecha UTC. Por ejemplo, `12:00-03:00` representa `15:00Z`, pero su texto ordena
antes que `13:00Z`. El formulario convierte a UTC; un consumidor válido de la
API no está obligado a hacerlo.

Convertir a `new Date(value).toISOString()` en la frontera de escritura y
revisar los registros con offset mediante una migración acotada.

**Comprobación:** fechas equivalentes en UTC y con offset se reclaman al mismo
instante; ninguna se adelanta por comparación lexicográfica.

### M12. Mantener el mensaje reciente al limitar el contexto del agente

**Alta · M · Confirmado en la consulta.**

[messagesForConversation](./apps/agent/src/runtime/store/AgentStore.ts) ordena
ascendente y limita a 500: conserva los primeros mensajes, no los últimos.
Superado ese umbral puede excluir la solicitud que acaba de crear el run.
Además, el límite por cantidad no controla el tamaño total enviado a DeepSeek.

Seleccionar una ventana reciente, restaurar su orden cronológico y preservar
pares completos de tool call/resultado. Aplicar un presupuesto de contexto y
una salida explícita cuando no alcance. No hace falta agregar memoria vectorial.

**Comprobación:** con 501 mensajes entra la última solicitud; no quedan tool calls
huérfanos y el tamaño del contexto tiene un límite verificable.

### M13. Pasar a Playwright las variables que sus tests realmente usan

**Alta · S · Verificado con el plan de Turbo.**

[turbo.json](./turbo.json) omite `E2E_TENANT_SLUG`, `WEBAPP_E2E_URL` y
`BACKOFFICE_E2E_URL` en `test:e2e`. El
[workflow](./.github/workflows/ci.yml) define el slug, pero el modo estricto no
lo entrega al test; [auth.spec.ts](./apps/webapp/e2e/auth.spec.ts) termina usando
una organización vacía. El preflight tampoco exige todas las credenciales E2E
que luego consume.

Declarar esas variables y validar la configuración completa antes de iniciar
las apps. Esperar disponibilidad de ambas webs además de la API, con diagnóstico
claro cuando una no inicia.

**Comprobación:** valores sintéticos llegan al proceso de test sin imprimirse;
la configuración incompleta falla temprano y las URLs configuradas se respetan.

## Completar el comportamiento existente

### M14. Utilizar el refresh que ya está implementado

**Media · M · Confirmado por ausencia de consumidores.**

Existen handlers `/auth/refresh`, pero los helpers de sesión de
[Webapp](./apps/webapp/lib/session.ts) y [Backoffice](./apps/backoffice/lib/session.ts)
sólo consultan `/auth/me`. Ante el vencimiento del access, de 15 minutos por
defecto, devuelven `null` aunque siga vigente el refresh de siete días.
El cliente realtime tampoco recupera esa sesión al renovar tickets.

Implementar una renovación coordinada mediante un Route Handler capaz de emitir
cookies, con CSRF y un único reintento. Diferenciar 401 de caída del upstream;
no convertir cualquier fallo de red en un logout ni reenviar mutaciones sin
control de idempotencia.

**Comprobación:** access vencido + refresh válido conserva la sesión; refresh
inválido lleva a login; requests concurrentes no producen renovaciones en bucle.

### M15. Incorporar revocación real de sesión, como evolución de v0

**Media · L · Limitación explícitamente aceptada en el diseño original.**

[AuthService](./apps/api/src/modules/auth/services/AuthService.ts) verifica firma,
vencimiento e identidad, pero no consumo del refresh. Logout sólo elimina cookies.
El [plan, sección 27.1](./docs/PLAN-SCAFFOLDING-v0.md#271-refresh-sin-sesiones-revocables)
acepta este límite; no corresponde presentarlo como incumplimiento oculto.

Una mejora concreta es una colección de sesiones con hash de refresh, consumo
atómico, revocación y vencimiento. Integrar logout, cambio de contraseña y
validación de sesión sin reemplazar el sistema de identidad. La
[guía de sesiones de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
respalda invalidar la sesión en servidor al cerrarla.

**Comprobación:** un refresh ya usado no vuelve a renovar y una sesión cerrada
deja de autorizar operaciones, incluyendo la política elegida para WebSocket.

### M16. Acotar requests HTTP y distinguir errores de contrato y disponibilidad

**Media · M · Ausencias confirmadas en los transportes.**

Los BFF no fijan timeout ni propagan cancelación. Además, devuelven
`toBrowserResponse()` sin `await` dentro del `try`, por lo que un fallo al consumir
el body puede escapar de ese `catch`. El
[servidor interno](./apps/agent/src/http/server.ts) convierte errores Zod y JSON
inválido en 500; [AgentClient](./apps/api/src/modules/agent/services/AgentClient.ts)
convierte casi todos los rechazos en 502.

Poner deadlines explícitos, propagar aborto y esperar la conversión dentro del
manejo de errores. Mapear 400/403/404/409 de forma segura y reservar 502/504 para
fallos del upstream. Compartir el helper BFF idéntico en `api-client`, conservando
todos los Route Handlers explícitos.

**Comprobación:** upstream colgado, body truncado y JSON inválido tienen respuesta
acotada; un error del usuario no se presenta como caída de infraestructura.

### M17. Preservar headers y descargar archivos sin cargarlos completos en el BFF

**Media · S · Filtrado reproducido.**

[responseHeadersForBrowser](./packages/api-client/src/server.ts) descarta el nombre
de descarga, hash y `Cache-Control`. También permite `x-ratelimit-*` mientras la
API emite `RateLimit-*`. `toBrowserResponse()` copia siempre todo el body con
`arrayBuffer()`, incluso en el [handler de artifacts](./apps/webapp/app/api/artifacts/[id]/route.ts).

Separar el passthrough de archivos del JSON: preservar los headers de descarga
autorizados, `no-store` y los nombres de rate limit vigentes; transmitir el stream.

**Comprobación:** el archivo conserva nombre, bytes y hash; cookies múltiples se
mantienen separadas y los headers hop-by-hop siguen excluidos.

### M18. Rechazar uploads excesivos antes de bufferizarlos

**Media · M · Diferencia de límites confirmada.**

El [BFF de uploads](./apps/webapp/app/api/uploads/[id]/content/route.ts) lee todo el
body antes de consultar la API. Nginx permite **128 MiB**, la API recibe hasta
**12 MiB** y el contrato de upload admite **10 MiB**. `MAX_UPLOAD_BYTES` permite
valores que después contradicen esos límites fijos.

Alinear el límite efectivo por ruta y validar tamaño antes y durante la lectura,
también sin `Content-Length`. Mantener bufferizado lo necesario para la firma
actual, pero siempre acotado. Separar `/ws` del HTTP común en Nginx para no dar
a toda la API los timeouts de una hora del WebSocket.

**Comprobación:** un upload que supera el máximo devuelve 413 sin acumularlo
completo; uploads válidos y WebSocket siguen funcionando con su configuración.

### M19. Evitar que un tenant bloquee el acceso a la cola de otros

**Media · S · Reproducido sin múltiples launchers.**

[claimNext](./apps/agent/src/runtime/store/AgentStore.ts) sólo inspecciona los
primeros 20 candidatos. Si todos pertenecen a un tenant que ya alcanzó su cupo,
devuelve `null` aunque haya trabajo elegible detrás y capacidad global libre.

Recorrer candidatos en páginas acotadas o excluir los tenants saturados durante
ese ciclo. No hace falta implementar un scheduler distribuido.

**Comprobación:** con dos runs activos de A, veinte pendientes de A y uno de B,
el siguiente claim toma B respetando los límites existentes.

### M20. Rechazar manifests inexistentes y manejar fallos de los ciclos del runtime

**Media · M · Confirmado en contrato y entrypoints.**

[CreateAgentRunInputSchema](./packages/contracts/src/agent.ts) acepta cualquier
manifest. Se detecta que no existe recién después del claim en
[Launcher](./apps/agent/src/runtime/launcher/Launcher.ts). Los timers de Launcher
y [Supervisor](./apps/agent/src/runtime/supervisor/Supervisor.ts) llaman promesas
con `void` y sin `catch`; un error de Mongo o del manifest no tiene recuperación
local controlada. `attachProcess()` también puede fallar antes de registrar el hijo.

Validar el manifest antes de encolar, capturar errores por ciclo, registrar el
estado degradado y limpiar un hijo cuyo registro falle. Evitar dejar trabajo
en `starting` sólo por un input inválido.

**Comprobación:** manifest desconocido devuelve 400; un fallo transitorio de un
ciclo no deja una promesa sin manejar ni un proceso fuera de supervisión.

### M21. Acotar el apagado y esperar las tareas que siguen en curso

**Media · M · Confirmado en los métodos de stop.**

[Launcher.stop](./apps/agent/src/runtime/launcher/Launcher.ts) envía SIGTERM y
espera indefinidamente. El [entrypoint conjunto](./apps/agent/src/entrypoints/all.ts)
apaga al supervisor a la vez, por lo que su escalamiento normal a SIGKILL ya no
resuelve un hijo atascado. `Supervisor.stop()` no espera su ciclo en curso.
La API espera el lote SMTP antes de bajar readiness.

Detener nuevos claims, bajar readiness primero, esperar trabajo activo durante
una gracia y terminar únicamente hijos propios que excedan ese plazo. Cerrar
Mongo después de los ciclos y collectors pendientes. Probar también los
[launchers raíz](./run-all.sh).

**Comprobación:** SIGTERM con run activo, ciclo Mongo lento o SMTP pendiente
termina dentro del plazo y no deja procesos hijos ni escrituras tras cerrar Mongo.

### M22. Recuperar runs y conversaciones al recargar la interfaz

**Media · M · Limitación visible del producto actual.**

[AgentPanel](./apps/webapp/components/agent-panel.tsx) y
[BackofficeAgentPanel](./apps/backoffice/components/backoffice-agent-panel.tsx)
guardan run y conversación sólo en estado React. Una recarga pierde su referencia
aunque el run siga ejecutándose. Tampoco hay un listado operativo desde el que
volver a una confirmation iniciada desde Telegram.

Agregar rutas explícitas para listar y abrir runs/conversaciones autorizados,
con paginación y selección por URL. Reconstruir mensajes, artifacts y
confirmations pendientes desde Mongo; incluir abrir un run por su UUID.

**Comprobación:** recargar durante una ejecución o abrir un UUID desde Telegram
recupera el estado; otro actor sin permiso obtiene 404.

### M23. No ejecutar dos turnos de la misma conversación en paralelo

**Media · M · Camino permitido hoy por UI y backend.**

Los paneles vuelven a habilitar Ejecutar al recibir el 202, aunque el run siga
activo. En el store el límite es por tenant, no por conversación. Dos runs leen
y escriben el mismo historial y la UI deja de seguir el primero.

Bloquear el siguiente envío de esa conversación mientras tenga un turno activo
y aplicar la misma regla al claim/alta para cubrir dos pestañas y Telegram.
Una opción mínima es devolver 409 con la referencia al run activo.

**Comprobación:** dos solicitudes simultáneas para la misma conversación no
intercalan tool calls ni pierden seguimiento; otras conversaciones siguen operando.

### M24. Aprovechar el snapshot WebSocket también en la Webapp

**Media · S · Confirmado en el consumidor.**

En [AgentPanel](./apps/webapp/components/agent-panel.tsx), cada evento dispara
`refreshRun()` por HTTP, incluyendo eventos de progreso y tools. El Backoffice
ya consume `payload.run` mediante
[updateAgentRunFromEvent](./apps/backoffice/lib/agent-run-events.ts).
Las requests adicionales pueden responder fuera de orden y muestran estados viejos.

Compartir la reducción de eventos en un package y aplicar snapshots directamente.
Conservar el replay de reconexión que requiera la Webapp, sin hacer un GET por evento.

**Comprobación:** un run completo recibe su respuesta por WebSocket y no genera
GETs de estado durante una conexión saludable; al reconectar recupera lo perdido.

### M25. Mostrar y descargar los artifacts que el agente ya genera

**Media · M · Capacidad backend sin cierre de interfaz.**

[ToolRegistry](./apps/agent/src/tools/registry/ToolRegistry.ts) genera PDF/CSV y
emite `artifact.created`, pero los paneles muestran sólo texto. El Backoffice
no tiene handlers de archivos; el [gateway](./apps/api/src/modules/files/gateway.ts)
exige `actor.tenantId`, por lo que el administrador de plataforma tampoco puede
descargar usando su tenant seleccionado.

Mostrar los artifacts del run y completar el BFF de descarga. Resolver el tenant
del administrador mediante scope explícito y autorización server-side, igual que
para runs. M17 debe acompañar esta tarea. El selector de uploads puede agregarse
después, dejando claro que `inspect_upload` hoy sólo lee metadata, no contenido.

**Comprobación:** generar y descargar PDF/CSV desde ambas superficies; propietario,
owner y administrador reciben el acceso definido y otro tenant queda excluido.

### M26. Evitar PDFs con texto perdido o caracteres que rompen la generación

**Media · S/M · Reproducido.**

`generate_pdf` en [ToolRegistry](./apps/agent/src/tools/registry/ToolRegistry.ts)
usa Helvetica WinAnsi, que rechaza emojis y otros caracteres. El corte por regex
puede descartar el inicio de palabras largas y no mide el ancho del texto.
El título no se ajusta al ancho disponible.

Usar una fuente con cobertura definida y una estrategia explícita para caracteres
no soportados. Dividir líneas por ancho medido sin descartar caracteres; aplicar
el mismo ajuste al título y conservar la paginación.

**Comprobación:** texto español, Unicode, URLs largas, saltos de línea y títulos
extensos producen PDFs legibles; el texto extraído coincide con la entrada admitida.

## Backoffice y email marketing

### M27. Consumir la paginación que la API ya ofrece

**Media · M · Confirmado en todos los listados principales.**

[TenantManager](./apps/backoffice/components/tenant-manager.tsx) y
[TenantPeople](./apps/backoffice/components/tenant-people.tsx) piden 50 registros.
Agente, Telegram AI y [email marketing](./apps/backoffice/components/email-marketing-manager.tsx)
piden 100. Los componentes descartan `pagination.nextCursor`; los elementos
posteriores quedan inaccesibles, incluidos tenants que deben seleccionarse.

Agregar siguiente/cargar más y búsqueda server-side donde corresponda al selector.
Separar el contador de elementos visibles del total; no aumentar arbitrariamente
los límites para ocultar el problema.

**Comprobación:** acceder y operar sobre los registros 51 y 101; cambiar de tenant
reinicia correctamente cursor, selección y resultados.

### M28. Agregar navegación móvil real al Backoffice

**Media · S · Confirmado en el shell y en el E2E.**

El único menú de [ControlShell](./apps/backoffice/components/control-shell.tsx)
tiene `hidden ... lg:flex`; no hay alternativa móvil. El
[E2E de tenants](./apps/backoffice/e2e/tenants.spec.ts) intenta usar ese enlace
también en el proyecto Pixel 7. El acceso del dashboard sólo abre administración,
no todas las capacidades del menú.

Agregar un botón y Sheet accesible desde `@stock42/ui`, reutilizando la lista de
navegación y sus permisos. Mostrar la ruta activa y asegurar cierre por teclado.

**Comprobación:** en Pixel 7 se navega por todas las opciones autorizadas sin
escribir URLs; el E2E usa el menú visible y también pasa con teclado.

### M29. Alinear los formularios visibles con los permisos existentes

**Media · S · Confirmado y ya reconocido por la documentación.**

[TenantPeople](./apps/backoffice/components/tenant-people.tsx) sólo recibe
`tenantId`, por lo que también muestra altas a `tenant_operator`. La API las
rechaza correctamente. Ese usuario recibe una invitación a ejecutar algo que
no puede hacer.

Pasar la capacidad de gestionar personas desde la página autorizada y renderizar
las altas sólo para owner y administrador. Mantener la autorización de API.

**Comprobación:** operator puede listar pero no ve altas; owner/admin sí;
la escritura directa no autorizada sigue devolviendo 403.

### M30. Descartar respuestas de un tenant que ya no está seleccionado

**Media · S · Confirmado en las cargas asíncronas.**

Las cargas de [email marketing](./apps/backoffice/components/email-marketing-manager.tsx)
y [Telegram AI](./apps/backoffice/components/telegram-ai-manager.tsx) no cancelan
la request previa ni comprueban la selección al aplicar el resultado. Una respuesta
lenta del tenant A puede mostrarse después de seleccionar B. La API mantiene el
aislamiento, pero el panel mezcla contexto visual y acciones.

Abortar cargas anteriores o usar una generación de request; limpiar selección,
errores y datos al cambiar tenant/grupo. Distinguir carga inicial de lista vacía.

**Comprobación:** retrasar A, seleccionar B y completar A al final; la pantalla
mantiene únicamente datos y acciones de B.

### M31. Mostrar salud observada, no etiquetas estáticas

**Media · M · Confirmado en UI y endpoints.**

[ControlShell](./apps/backoffice/components/control-shell.tsx) dice “API disponible”
y el [dashboard](<./apps/backoffice/app/(protected)/dashboard/page.tsx>) “Readiness
verificado” sin medirlo. La API informa agente `configured`; el
[ready interno](./apps/agent/src/http/server.ts) dice Mongo `ready` sin ping actual
cuando Telegram está deshabilitado. Launcher y supervisor no aportan heartbeat
propio a ese estado.

Como corrección mínima, quitar las afirmaciones no verificadas. Para un estado
operativo útil, consultar health acotado y distinguir configuración de
disponibilidad, mostrando fecha de comprobación y degradación de workers.

**Comprobación:** API, Mongo o launcher detenidos no dejan indicadores verdes
que afirmen que esas capacidades siguen disponibles.

### M32. Completar la administración básica de identidades existentes

**Media · M · Ausencia comprobada en módulos y pantallas.**

Los módulos de [usuarios](./apps/api/src/modules/users/) y
[operadores](./apps/api/src/modules/operators/) sólo ofrecen alta/listado;
administradores sólo alta. El sistema revalida `status`, pero no hay flujo normal
para desactivar personas ni cambiar contraseñas iniciales. El update de estado
de tenant ya existe, aunque no se expone desde su pantalla.

Agregar edición/desactivación y cambio de contraseña con permisos actuales,
versión esperada y auditoría. Exponer primero el cambio de estado de tenant ya
implementado. Para contraseñas, empezar por cambio autenticado y reset
administrativo; no introducir SSO ni un proveedor nuevo.

**Comprobación:** una identidad desactivada deja de autenticarse, el último owner
no queda eliminado accidentalmente y los cambios de otro tenant son rechazados.

### M33. Limitar la audiencia y el tamaño total al preparar campañas

**Media · M · Límites y materialización confirmados.**

[createCampaign](./apps/api/src/modules/email-marketing/services/EmailMarketingService.ts)
toma los primeros 5.000 miembros sin detectar que haya más. Un grupo puede superar
ese tamaño con varias altas. Además construye todos los cuerpos renderizados en
memoria: el máximo admitido de 500.000 caracteres por cuerpo multiplicado por
5.000 destinatarios permite 2.500 millones de caracteres antes de overhead.
No se midió ese consumo; surge de los límites aceptados por el código.

Detectar y rechazar explícitamente una audiencia fuera del máximo elegido;
mostrar destinatarios activos/excluidos. Preparar en lotes acotados y limitar
bytes totales. Agregar recuperación de campañas que queden `scheduled` con
entradas `ready:false` después de una interrupción, sin activar lotes incompletos.

**Comprobación:** 5.001 miembros no producen una campaña truncada silenciosamente;
fallar a mitad de preparación permite completar o fallar limpiamente sin envíos.

### M34. Distinguir fallos SMTP de entregas cuyo resultado es incierto

**Media · M · Confirmado en el límite del efecto externo.**

[process](./apps/api/src/modules/email-marketing/services/EmailMarketingService.ts)
agrupa `sendMail()` y `markSent()` en el mismo `try`. Si SMTP acepta y luego falla
Mongo, el `catch` programa otro intento. Recuperar un lease `processing` vencido
tampoco determina si el mensaje llegó. El transporte no fija timeouts propios;
su timeout de socket documentado es de
[10 minutos](https://nodemailer.com/smtp), frente al lease default de 5 minutos.

Separar rechazo de transporte de fallo de persistencia posterior a la aceptación.
Registrar resultado incierto para revisión y conservar identificador del mensaje;
no prometer entrega exactamente una vez. Acotar transporte y apagado con tiempos
coherentes con el lease, y comprobar el resultado de las escrituras cercadas.

**Comprobación:** SMTP acepta y falla `markSent`: no se reenvía automáticamente;
un rechazo inequívoco sigue la política de reintentos sin superar el máximo.

### M35. Aligerar las consultas de campañas y spooler

**Media · M · Trabajo redundante confirmado.**

[campaigns-list](./apps/api/src/modules/email-marketing/controllers/campaigns-list.ts)
ejecuta una agregación de resumen por campaña. El listado del spooler incluye
el body HTML completo de cada entrada, hasta 100 cuerpos de 500.000 caracteres,
aunque la tabla no los necesite todos simultáneamente.

Agrupar los resúmenes de la página en una consulta y cargar el contenido completo
al abrir el detalle. Revisar `explain()` de esas consultas y de listados
tenant+UUID: varios [índices](./apps/api/src/boot/indexes.ts) interponen `status`
aunque el listado no lo filtra. Cambiar índices sólo con el plan observado,
sin afirmar que actualmente haya lentitud de producción.

**Comprobación:** una página de N campañas no dispara N agregaciones; el listado
del spooler no transfiere bodies y los filtros conservan aislamiento y paginación.

### M36. Permitir excluir destinatarios de futuras campañas

**Media · M · Falta funcional del módulo de marketing.**

El [módulo](./apps/api/src/modules/email-marketing/) usa pertenencia a grupo y
estado de la cuenta, pero no tiene una preferencia de recepción ni una baja
de marketing. Quitar a alguien de un grupo no evita agregarlo a otro y no afecta
entradas ya preparadas. Desactivar su cuenta es una operación distinta.

Agregar exclusión de marketing por tenant/usuario y un mecanismo de baja acotado.
Filtrar al preparar y volver a comprobar antes de enviar. Hacer visible el motivo
de exclusión al operador; no convertir esto en una plataforma de marketing nueva.

**Comprobación:** un destinatario dado de baja no recibe entradas aún no enviadas
ni campañas posteriores, aunque permanezca en un grupo y su cuenta esté activa.

## Operación, trazabilidad y mantenimiento

### M37. Registrar el tenant efectivo en la auditoría administrativa

**Media · S · Confirmado en AuditService y sus llamadas.**

[AuditService.record](./apps/api/src/audit/AuditService.ts) usa siempre
`actor.tenantId`. Para un administrador de plataforma queda `null`, incluso al
operar sobre un tenant. Algunos callers incluyen el tenant en metadata, pero
el índice principal y la clasificación del evento usan el campo superior.

Pasar explícitamente el tenant del recurso autorizado para operaciones tenant,
manteniendo `null` para acciones realmente globales. No derivarlo de metadata
sin validar ni de un campo enviado libremente por el navegador.

**Comprobación:** crear/modificar recursos como platform admin deja el evento en
la consulta auditada del tenant correcto, conservando el actor original.

### M38. Corregir la sanitización y conservar una correlación útil

**Media · M · Defectos locales confirmados; no se inspeccionaron logs reales.**

[safeMetadata](./apps/api/src/errors/handler.ts) convierte la clave a minúsculas,
pero su set contiene `refreshToken` y `accessToken` con mayúsculas. Sólo filtra
el primer nivel y los errores inesperados se registran completos. El servidor
del agente también imprime `cause`; SMTP guarda el mensaje recibido en
`lastError`. El BFF reenvía correlation ID, pero la cadena no lo conserva como
identificador operativo de extremo a extremo.

Normalizar claves, sanitizar causas/metadata anidadas mediante campos permitidos
y convertir errores externos a códigos/mensajes seguros. Generar o validar una
correlación y vincularla a request, run y error. No registrar tokens, cookies,
cuerpos de email ni prompts para obtener trazabilidad.

**Comprobación:** fixtures con valores sensibles sintéticos no aparecen en logs
ni errores públicos; el `errorId` de la UI permite localizar la operación.

### M39. Conservar el consumo de tokens que DeepSeek ya devuelve

**Media · S/M · Información descartada en el cliente actual.**

[DeepSeekClient](./apps/agent/src/providers/deepseek/DeepSeekClient.ts) parsea
`usage` y `finish_reason`, pero devuelve sólo el mensaje. No se puede conocer
desde el run cuánto consumió ni distinguir una terminación por límite.

Devolver y persistir usage por llamada/intento, acumularlo por run y registrar
el motivo de fin. Si falta usage, informar desconocido, no cero. Detectar
truncamiento antes de marcar la respuesta como exitosa. Empezar por cantidades
de tokens; no hace falta facturación ni otro proveedor.

**Comprobación:** un run de varias llamadas suma sus consumos una sola vez;
`finish_reason` por límite no se muestra como respuesta completa.

### M40. Liberar listeners de espera en el polling Telegram

**Baja · S · Confirmado en el helper.**

`wait()` en [TelegramPollingRuntime](./apps/agent/src/telegram/TelegramPollingRuntime.ts)
agrega un listener de abort en cada espera y sólo lo elimina cuando se aborta.
La resolución normal del timer no lo retira; el loop de entregas vuelve a
registrarlo cada segundo por defecto.

Quitar el listener tanto al completar la espera como al abortar, sin cambiar
la política de polling, backoff ni habilitación.

**Comprobación:** miles de esperas completadas no acumulan listeners; abortar
resuelve inmediatamente y limpia el timer correspondiente.

### M41. Probar los comportamientos que hoy escapan a los gates

**Media · M por grupo de correcciones · Brecha comprobada por hallazgos y tests.**

Los tests de [Webapp](./apps/webapp/test/api-proxy.test.ts) validan un schema,
pero no ejecutan `proxyApi`. Los de
[Backoffice](./apps/backoffice/test/contracts.test.ts) cubren principalmente
contratos/reductores. Los E2E cubren login y navegación, no las altas que fallan
en M04. Runtime y SMTP tienen poca cobertura de fallos entre escrituras.

Agregar regresiones al corregir M03–M12 y M16–M26: BFF real con upstream de prueba,
formularios, replay, cancelación, reanudación y transporte SMTP/Telegram
sustituido. En integración Mongo, asegurar cleanup incluso si falla una
aserción antes de [markFixtures](./apps/api/test/integration/api.test.ts), y cerrar
la API en `finally` aunque falle una eliminación. Separar el test integral único
en escenarios identificables, sin multiplicar infraestructura.

**Comprobación:** cada regresión falla con su código anterior y pasa con la
corrección. Integración usa sólo la base autorizada, con IDs propios; nunca
`dropDatabase`, nuevas bases ni Mongo en memoria.

### M42. Poder comprobar y recuperar el storage local existente

**Media · M · Límite operativo del código actual.**

[ArtifactService.save](./apps/agent/src/tools/artifacts/ArtifactService.ts)
escribe el archivo antes de metadata/evento; un fallo posterior puede dejar
bytes sin referencia. Los uploads también cruzan filesystem y Mongo. La
[guía](./GUIDE.md) describe el storage local, pero no ofrece un procedimiento
conjunto de recuperación ni una comprobación de correspondencia entre ambos.

Agregar un diagnóstico read-only de archivos ausentes/huérfanos, tamaño y hashes,
y documentar backup/restauración de Mongo más directorios configurados. Proponer
retención por estado antes de cualquier limpieza; no borrar evidencia ni agregar
TTL de negocio automáticamente. No implica migrar a S3 ni contratar servicios.

**Comprobación:** detectar un archivo ausente y otro huérfano sin modificar datos;
un ensayo autorizado recupera metadata y bytes concordantes. La existencia de
backups externos queda por verificar, no se supone que falten.

### M43. Separar el estado vigente de las evaluaciones históricas

**Baja · S · Contradicciones documentales verificadas.**

[README](./README.md) afirma que los gates de dependencias están cerrados,
[PUBLICATION](./docs/PUBLICATION.md) conserva el audit verde del 8 de agosto y
[NEWERA](./NEWERA.md) todavía enumera como pendientes problemas ya corregidos.
[GUIDE](./GUIDE.md) atribuye fallback HTTP a ambas interfaces, mientras el
Backoffice actual usa WebSocket; [BACKOFFICE](./docs/BACKOFFICE.md) también
conserva referencias iniciales a interfaz HTTP y bootstrap sin mencionar el opt-in.

Fechar los resultados y separar expresamente snapshot histórico de estado actual.
Enlazar este relevamiento como backlog concreto y dejar ERA2 como visión, sin
duplicar ni reescribir sus decisiones. Corregir la descripción operativa al
cambiar cada funcionalidad.

**Comprobación:** los documentos no afirman audit verde sin ejecución vigente,
no recomiendan implementar lo ya presente y describen los modos reales de sesión,
bootstrap y transporte.

### M44. Revalidar permisos antes de comenzar o reanudar trabajo encolado

**Media · M · Frontera temporal confirmada en el runtime.**

La API revalida identidad y tenant al aceptar la request, pero
[AgentOrchestrator](./apps/agent/src/orchestration/AgentOrchestrator.ts) usa el rol
almacenado en el run. `assertActiveAttempt()` sólo verifica estado/proceso.
Desactivar un tenant mediante el endpoint existente no impide por sí mismo que
un run previamente encolado comience después o que continúe tras una espera.

Revalidar identidad, tenant y permiso al comenzar/reanudar, y antes de efectos
sensibles. Definir qué estado terminal y motivo corresponde a una revocación,
reutilizando la política existente; no agregar un motor genérico de permisos.

**Comprobación:** encolar, desactivar el tenant y luego intentar el claim/ejecución
no llama al proveedor ni ejecuta tools; el caso equivalente tras una confirmation
también queda bloqueado y auditado.

### M45. No anunciar un crash como definitivo mientras todavía se va a reintentar

**Alta · M · Inconsistencia confirmada entre productor y consumidores.**

[Launcher.collect](./apps/agent/src/runtime/launcher/Launcher.ts) publica `crashed`
y después vuelve a `queued` si queda un reintento. Ambos paneles tratan `crashed`
como terminal y cierran el seguimiento; Telegram también lo considera entregable.
Además, [transition](./apps/agent/src/runtime/store/AgentStore.ts) no limpia
`finishedAt` al reencolar. El supervisor marca crashes por proceso ausente, pero
no aplica el mismo reintento que el launcher.

Decidir el reintento antes de publicar un terminal definitivo; conservar el
fallo del intento como evento y hacer explícito que el run continúa. Unificar
esa decisión en los dos caminos de recuperación y limpiar los campos terminales
al reencolar.

**Comprobación:** un primer proceso que cae y un segundo que termina correctamente
mantienen el seguimiento de la UI y entregan una única respuesta final; al agotar
los intentos sí se publica el crash definitivo.

## Orden de ejecución sugerido

1. **Restablecer y hacer útiles los gates:** M01 y M13; acompañar cada corrección
   con la regresión concreta de M41.
2. **Resolver errores de uso y seguridad acotados:** M02–M05, M10 y M11.
3. **Cerrar consistencia del runtime:** M06–M09, M12 y M45; después M19–M21 y M44.
4. **Completar sesión y transporte:** M14, M16–M18 y M24. M15 es una decisión
   explícita de evolución del límite aceptado, no un requisito oculto de v0.
5. **Completar la operación diaria:** M22–M23, M25–M39 y M42 según la superficie
   que se use primero. M40 y M43 son tareas pequeñas independientes.

No se propone hacer las 45 a la vez. Las primeras tareas deben cerrar errores
reproducibles y gates; las siguientes se eligen por utilidad del flujo existente.

## Qué conservar y qué no justifica trabajo ahora

Conservar el listener compartido HTTP/WebSocket, tickets de un uso, autorización
por tenant/owner, CSRF, validación Zod, contratos compartidos, UI centralizada,
polling Telegram opt-in, filesystem local y build no-op de API/agente. Ya están
implementados y no se listan como funcionalidades faltantes.

Este relevamiento no encuentra una necesidad demostrada de Kubernetes, Redis,
Kafka, otra base de datos, microservicios adicionales, DDD, CQRS, event sourcing,
un marketplace, múltiples proveedores de IA, SSO enterprise, arquitectura
multi-región ni un rediseño visual completo. Tampoco propone índices nuevos sin
consultas medidas, porcentajes de cobertura arbitrarios o cambios de credenciales.

La escala horizontal, el cumplimiento legal específico y las políticas de
retención requieren datos/decisiones del producto. No se presentan como problemas
confirmados de esta instalación ni se utilizan para inflar este backlog.
