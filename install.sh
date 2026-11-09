#!/bin/sh
# HomeBudget installer. Downloads ready-made images; never builds locally.
set -eu

fail() { printf '%s\n' "$*" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || fail 'Install Docker with Docker Compose first.'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 is required.'
docker info >/dev/null 2>&1 || fail 'Start Docker before installing HomeBudget.'

demo=false
auth_choice=keep
for option in "$@"; do
  case "$option" in
    --demo) demo=true ;;
    --auth) [ "$auth_choice" = keep ] || fail 'Choose only one auth option.'; auth_choice=local ;;
    --no-auth) [ "$auth_choice" = keep ] || fail 'Choose only one auth option.'; auth_choice=none ;;
    *) fail 'Usage: sh install.sh [--demo] [--auth|--no-auth]' ;;
  esac
done

version=${HOMEBUDGET_VERSION:-2026.11.1}
case "$version" in ''|*[!0-9A-Za-z.-]*) fail 'Invalid HOMEBUDGET_VERSION.' ;; esac

if [ -f "$0" ] && [ -f "$(dirname "$0")/docker-compose.yml" ]; then
  root=$(CDPATH='' cd "$(dirname "$0")" && pwd)
else
  command -v curl >/dev/null 2>&1 || fail 'curl is required.'
  command -v tar >/dev/null 2>&1 || fail 'tar is required.'
  root=${HOMEBUDGET_DIR:-"$PWD/homebudget"}
  [ ! -e "$root" ] || fail "Directory already exists: $root. Run its install.sh instead."
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT HUP INT TERM
  curl -fL --retry 3 "https://github.com/MaciejDybowski/home-budget/releases/download/v$version/homebudget-compose.tar.gz" -o "$tmp/source.tar.gz"
  mkdir "$tmp/source"
  tar -xzf "$tmp/source.tar.gz" -C "$tmp/source"
  [ -f "$tmp/source/docker-compose.yml" ] || fail 'Downloaded archive is not a HomeBudget deployment bundle.'
  mkdir -p "$(dirname "$root")"
  mv "$tmp/source" "$root"
  root=$(CDPATH='' cd "$root" && pwd)
fi

cd "$root"
umask 077
new_install=false
if [ ! -e .env ]; then
  new_install=true
  if [ "$auth_choice" = keep ]; then
    if ( : </dev/tty ) 2>/dev/null; then
      printf '%s' 'Require login? [Y/n] ' >/dev/tty
      read -r answer </dev/tty
      case "$answer" in n|N|no) auth_choice=none ;; *) auth_choice=local ;; esac
    else
      fail 'For a new non-interactive installation choose --auth or --no-auth explicitly.'
    fi
  fi
  # Never initialize credentials over an existing database, even if .env was lost.
  [ ! -d pgdata ] || [ -z "$(ls -A pgdata)" ] || fail 'Existing pgdata found without .env. Restore its original database credentials.'
  password=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
  [ "${#password}" -eq 64 ] || fail 'Could not generate database credentials.'
  # noclobber prevents two concurrent installers from replacing each other's .env.
  (set -C; printf 'HOMEBUDGET_VERSION=%s\nPOSTGRES_USER=postgres\nPOSTGRES_DB=budgetdb\nPOSTGRES_PASSWORD=%s\nFRONTEND_BIND=0.0.0.0\nFRONTEND_PORT=3001\nAUTH_MODE=%s\n' "$version" "$password" "$auth_choice" > .env)
elif [ "$auth_choice" != keep ]; then
  fail 'Existing .env is preserved. Change AUTH_MODE and credentials in that file explicitly; run install.sh without auth options for updates.'
fi

docker compose config --quiet
printf '%s\n' 'Downloading ready-made images. No local build is required.'
docker compose pull
if [ "$new_install" = true ] && [ "$auth_choice" = local ]; then
  origin=${APP_ORIGIN:-}
  if [ -z "$origin" ]; then
    ( : </dev/tty ) 2>/dev/null || fail 'Set APP_ORIGIN for non-interactive --auth. Installation remains locked until configured.'
    printf '%s' 'Application origin, e.g. https://budget.example.org or http://localhost:3001: ' >/dev/tty
    read -r origin </dev/tty
  fi
  case "$origin" in ''|*[!a-zA-Z0-9:/._-]*) fail 'Invalid application origin.' ;; esac
  case "$origin" in https://*) secure=true ;; http://*) secure=false ;; *) fail 'Use an HTTP(S) origin.' ;; esac
  printf "APP_ORIGIN='%s'\nAUTH_COOKIE_SECURE=%s\n" "$origin" "$secure" >> .env
  printf '%s\n' 'Set the shared username and password on the first browser visit. The first visitor owns setup; complete it before sharing the address.'
fi
docker compose stop budget-app-frontend budget-app-backend
docker compose up -d --no-build --pull never --wait --wait-timeout 180
if [ "$demo" = true ]; then
  docker compose exec -T budget-app-backend npm run db:demo -- --confirm-empty
fi
printf '\n%s\n' "HomeBudget is running. Default address: http://localhost:3001 (or your configured FRONTEND_PORT)." \
  "Files and persistent database: $root" \
  'On another device use this computer/server address. Keep it in your trusted LAN/VPN.'
