# Política de seguridad

## Versiones soportadas

Stock42 Agentic Monorepo se encuentra en **public preview**. Recibe correcciones
de seguridad únicamente la versión más reciente de la rama `main` y, cuando
existan releases, la última release publicada.

| Versión                        | Soporte de seguridad                |
| ------------------------------ | ----------------------------------- |
| Último `main` / última release | Sí                                  |
| Commits o releases anteriores  | No                                  |
| Forks y productos derivados    | Responsabilidad de sus mantenedores |

## Reportar una vulnerabilidad

No publiques vulnerabilidades, credenciales ni datos sensibles en issues,
pull requests, Discussions o canales públicos.

Usa **Report a vulnerability** en la pestaña Security del repositorio:

<https://github.com/stock42/stock42-monorepo-scaffolding/security/advisories/new>

Antes de hacer público el repositorio, los mantenedores deben habilitar
**Private vulnerability reporting**. Si la opción todavía no está disponible,
conserva el reporte y vuelve a intentarlo cuando el canal privado esté activo;
no lo reemplaces por un issue público.

Incluye, sin adjuntar secretos reales:

- componente y commit afectados;
- impacto y escenario de amenaza;
- pasos mínimos para reproducir;
- precondiciones, rol y límites de tenant;
- mitigación conocida, si existe;
- forma segura de contactar al investigador desde GitHub.

No incluyas cookies, passwords, tokens, headers de autorización, credenciales
MongoDB ni claves de proveedores. Usa valores redactados o credenciales de
prueba ya revocadas.

## Respuesta y divulgación

Durante public preview la atención es best effort y no existe un SLA
contractual. Los mantenedores procurarán:

1. confirmar recepción por el advisory privado;
2. validar alcance y versiones afectadas;
3. coordinar mitigación, corrección y release;
4. solicitar CVE cuando corresponda;
5. publicar el advisory después de que exista una corrección utilizable.

La divulgación pública debe coordinarse con los mantenedores. Si el reporte
incluye una credencial válida, el primer paso es revocarla o rotarla; retirar el
texto de un commit no invalida el secreto ni elimina automáticamente el
historial.

## Alcance prioritario

Se consideran especialmente sensibles:

- autenticación, cookies, CSRF y refresh tokens;
- autorización entre actores, tenants, runs, confirmations y archivos;
- tickets y canales WebSocket;
- firma del canal API → agente;
- ejecución de tools, fencing, cancelación e idempotencia;
- bindings, polling y entregas Telegram;
- uploads, artifacts y escapes de filesystem;
- secretos, workflows y cadena de dependencias.

Los hallazgos fuera de seguridad deben abrirse como issues normales después de
que el repositorio sea público.
