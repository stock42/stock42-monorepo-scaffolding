#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly ROOT_DIR
readonly WEB_APPS=("apps/webapp" "apps/backoffice")

command -v bun >/dev/null 2>&1 || {
  echo "Error: Bun es obligatorio." >&2
  exit 1
}

for app in "${WEB_APPS[@]}"; do
  [[ -f "${ROOT_DIR}/${app}/package.json" ]] || {
    echo "Error: falta ${app}/package.json." >&2
    exit 1
  }
done

echo "Compilando únicamente: ${WEB_APPS[*]}"
(
  cd "${ROOT_DIR}"
  bun run build
)

for app in "${WEB_APPS[@]}"; do
  [[ -f "${ROOT_DIR}/${app}/.next/BUILD_ID" ]] || {
    echo "Error: ${app} no produjo .next/BUILD_ID." >&2
    exit 1
  }
done

echo "Build completo: webapp y backoffice. API y agent no fueron compilados."
