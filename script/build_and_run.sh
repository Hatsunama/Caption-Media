#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-start}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

show_usage() {
  cat <<'USAGE'
usage: ./script/build_and_run.sh [mode]

Modes:
  start, run                 Start the Expo dev server
  android, --android        Start Expo and open Android
  dev-client, --dev-client  Start the custom development client server
  build-android             Build and install the native Android development app
  doctor, --doctor          Run Expo diagnostics
  help, --help              Show this help
USAGE
}

case "$MODE" in
  start|run)
    exec npx expo start
    ;;
  android|--android)
    exec npx expo start --android
    ;;
  dev-client|--dev-client)
    exec npx expo start --dev-client
    ;;
  build-android)
    exec npx expo run:android
    ;;
  doctor|--doctor)
    exec npx expo-doctor
    ;;
  help|--help)
    show_usage
    ;;
  *)
    show_usage >&2
    exit 2
    ;;
esac
