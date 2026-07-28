# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

El formato sigue una versión simplificada de
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Unreleased]

### Added

- Se agregó `docs/PLAN-SCAFFOLDING-v0.md` con la arquitectura aprobada, etapas
  de implementación, criterios de aceptación, estrategia de seguridad, runtime
  agéntico, testing, CI y reglas operativas del scaffolding Stock42.

### Changed

- Se definió el contrato obligatorio `build`/`start`/`dev` para todas las apps,
  los launchers raíz `build-all.sh`, `run-all.sh` y `run-dev-all.sh`, y la regla
  de compilar únicamente webapp y backoffice; API y agente ejecutan TypeScript
  directamente con Bun y mantienen un `build` no-op.
