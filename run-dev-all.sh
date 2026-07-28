#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly ROOT_DIR
readonly APPS=("api" "agent" "webapp" "backoffice")
PIDS=()

cleanup() {
  local exit_code=$?
  trap - INT TERM EXIT
  for pid in "${PIDS[@]:-}"; do
    kill -TERM "${pid}" 2>/dev/null || true
  done
  wait "${PIDS[@]:-}" 2>/dev/null || true
  exit "${exit_code}"
}

trap cleanup INT TERM EXIT

command -v bun >/dev/null 2>&1 || {
  echo "Error: Bun es obligatorio." >&2
  exit 1
}

for app in "${APPS[@]}"; do
  manifest="${ROOT_DIR}/apps/${app}/package.json"
  [[ -f "${manifest}" ]] || {
    echo "Error: falta apps/${app}/package.json." >&2
    exit 1
  }
  bun -e '
    const manifest = await Bun.file(Bun.argv[1]).json();
    if (!manifest.scripts?.dev) process.exit(1);
  ' "${manifest}" || {
    echo "Error: apps/${app} no declara script dev." >&2
    exit 1
  }
done

for app in "${APPS[@]}"; do
  echo "Iniciando apps/${app} en desarrollo..."
  (
    cd "${ROOT_DIR}/apps/${app}"
    exec bun run dev
  ) &
  PIDS+=("$!")
done

set +e
wait -n "${PIDS[@]}"
exit_code=$?
set -e
echo "Una app terminó (código ${exit_code}); deteniendo las restantes." >&2
exit "${exit_code}"
