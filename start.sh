#!/bin/bash
# Usage:
#   ./start.sh                  # start all services
#   ./start.sh frontend         # start only frontend
#   ./start.sh relay backend    # start relay + backend
#   ./start.sh stop             # stop all running services
#
# Services: frontend | relay | backend

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pids"
mkdir -p "$PID_DIR"

# ── helpers ───────────────────────────────────────────────────────────────────

start_service() {
  local name="$1"
  local log="$SCRIPT_DIR/${name}.log"
  local pid_file="$PID_DIR/${name}.pid"

  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    # Verify the PID still belongs to our service
    local cmdline check_match=""
    cmdline=$(cat /proc/"$(cat "$pid_file")"/cmdline 2>/dev/null | tr '\0' ' ')
    case "$name" in
      frontend|relay) check_match="pnpm dev" ;;
      backend)        check_match="uvicorn" ;;
    esac
    if [[ -n "$check_match" && "$cmdline" == *"$check_match"* ]]; then
      echo "  [$name] already running (PID $(cat "$pid_file"))"
      return
    fi
    # PID was recycled, clean up stale pid file and continue starting
    rm -f "$pid_file"
  fi

  case "$name" in
    frontend)
      source ~/.nvm/nvm.sh && nvm use 20 > /dev/null 2>&1
      nohup bash -c "source ~/.nvm/nvm.sh && nvm use 20 > /dev/null 2>&1 && cd '$SCRIPT_DIR' && pnpm dev --host" > "$log" 2>&1 &
      ;;
    relay)
      source ~/.nvm/nvm.sh && nvm use 20 > /dev/null 2>&1
      nohup bash -c "source ~/.nvm/nvm.sh && nvm use 20 > /dev/null 2>&1 && cd '$SCRIPT_DIR/relay' && pnpm install --silent && pnpm dev" > "$log" 2>&1 &
      ;;
    backend)
      nohup bash -c "cd '$SCRIPT_DIR/backend' && uv run uvicorn main:app --host 0.0.0.0 --port 8000" > "$log" 2>&1 &
      ;;
    *)
      echo "  Unknown service: $name"
      return
      ;;
  esac

  echo $! > "$pid_file"
  echo "  [$name] started (PID $!) → ${name}.log"
}

stop_service() {
  local name="$1"
  local pid_file="$PID_DIR/${name}.pid"

  if [[ ! -f "$pid_file" ]]; then
    echo "  [$name] not running"
    return
  fi

  local pid
  pid=$(cat "$pid_file")

  if kill -0 "$pid" 2>/dev/null; then
    # Verify the PID still belongs to our service, not a recycled PID
    local cmdline
    cmdline=$(cat /proc/"$pid"/cmdline 2>/dev/null | tr '\0' ' ')
    local match=""
    case "$name" in
      frontend) match="pnpm dev" ;;
      relay)    match="pnpm dev" ;;
      backend)  match="uvicorn" ;;
    esac
    if [[ -n "$match" && "$cmdline" != *"$match"* ]]; then
      echo "  [$name] PID $pid was recycled (now: ${cmdline:0:60}…), skipping kill"
      rm -f "$pid_file"
      return
    fi
    kill "$pid"
    echo "  [$name] stopped (PID $pid)"
  else
    echo "  [$name] was not running"
  fi
  rm -f "$pid_file"
}

status_service() {
  local name="$1"
  local pid_file="$PID_DIR/${name}.pid"

  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    local cmdline check_match=""
    cmdline=$(cat /proc/"$(cat "$pid_file")"/cmdline 2>/dev/null | tr '\0' ' ')
    case "$name" in
      frontend|relay) check_match="pnpm dev" ;;
      backend)        check_match="uvicorn" ;;
    esac
    if [[ -n "$check_match" && "$cmdline" == *"$check_match"* ]]; then
      echo "  [$name] running (PID $(cat "$pid_file"))"
    else
      echo "  [$name] stopped (stale PID recycled)"
      rm -f "$pid_file"
    fi
  else
    echo "  [$name] stopped"
    rm -f "$pid_file"
  fi
}

ALL_SERVICES=(frontend relay backend)

# ── commands ──────────────────────────────────────────────────────────────────

case "${1:-}" in
  stop)
    echo "Stopping services..."
    shift
    services=("${@:-${ALL_SERVICES[@]}}")
    for svc in "${services[@]}"; do stop_service "$svc"; done
    ;;

  status)
    echo "Service status:"
    for svc in "${ALL_SERVICES[@]}"; do status_service "$svc"; done
    ;;

  restart)
    shift
    services=("${@:-${ALL_SERVICES[@]}}")
    echo "Restarting: ${services[*]}"
    for svc in "${services[@]}"; do stop_service "$svc"; done
    sleep 1
    for svc in "${services[@]}"; do start_service "$svc"; done
    ;;

  ""|frontend|relay|backend)
    # No subcommand or service names → start listed services (default: all)
    if [[ -z "${1:-}" ]]; then
      services=("${ALL_SERVICES[@]}")
    else
      services=("$@")
    fi
    echo "Starting: ${services[*]}"
    for svc in "${services[@]}"; do start_service "$svc"; done
    ;;

  *)
    echo "Usage: $0 [stop|status|restart] [frontend] [relay] [backend]"
    exit 1
    ;;
esac
