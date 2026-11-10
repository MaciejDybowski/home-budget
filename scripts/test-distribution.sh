#!/bin/sh
# Build as a publisher, push to a disposable registry, install without source code.
set -eu
root=$(CDPATH='' cd "$(dirname "$0")/.." && pwd)
registry=homebudget-distribution-registry
if docker container inspect "$registry" >/dev/null 2>&1; then
  printf '%s\n' "Distribution test already exists: $registry" >&2
  exit 1
fi
tmp=$(mktemp -d)
created_registry=false
export COMPOSE_PROJECT_NAME=homebudget-distribution-test
export COMPOSE_FILE="$tmp/bundle/docker-compose.yml:$root/scripts/compose.distribution-test.yml"
export FRONTEND_BIND=127.0.0.1 FRONTEND_PORT=43102
export BACKEND_IMAGE=localhost:15000/home-budget-backend:test
export FRONTEND_IMAGE=localhost:15000/home-budget-frontend:test
export LOCAL_BACKEND_IMAGE="$BACKEND_IMAGE" LOCAL_FRONTEND_IMAGE="$FRONTEND_IMAGE"
cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ -f "$tmp/bundle/.env" ]; then
    (cd "$tmp/bundle" && if [ "$status" -ne 0 ]; then docker compose logs --tail 60; fi; docker compose down) || true
  fi
  if [ "$created_registry" = true ]; then docker rm -f "$registry" >/dev/null || true; fi
  # PostgreSQL owns files on Linux; only this test's generated data is mounted.
  docker run --rm --network none -v "$tmp:/test-cleanup" --entrypoint sh postgres:15-alpine -c 'rm -rf /test-cleanup/bundle/pgdata' || true
  rm -rf "$tmp" || true
  exit "$status"
}
trap cleanup EXIT HUP INT TERM
docker run -d --name "$registry" -p 127.0.0.1:15000:5000 registry:2 >/dev/null
created_registry=true
python3 "$root/scripts/package-release.py" 2026.11.2 "$tmp/bundle"
# Source contexts exist only on the publisher side of this test.
POSTGRES_PASSWORD=test_build_only docker compose -f "$root/docker-compose.yml" -f "$root/compose.build.yml" build budget-app-backend
POSTGRES_PASSWORD=test_build_only docker compose -f "$root/docker-compose.yml" -f "$root/compose.build.yml" build budget-app-frontend
docker push "$BACKEND_IMAGE"
docker push "$FRONTEND_IMAGE"
sh "$tmp/bundle/install.sh" --no-auth
HOMEBUDGET_URL=http://127.0.0.1:43102 node "$root/scripts/check-install.mjs" empty
cd "$tmp/bundle"
docker compose exec -T budget-app-backend npm run db:demo -- --confirm-empty
HOMEBUDGET_URL=http://127.0.0.1:43102 node "$root/scripts/check-install.mjs" demo
if docker compose exec -T budget-app-backend npm run db:demo -- --confirm-empty; then
  printf '%s\n' 'A second demo seed unexpectedly succeeded.' >&2
  exit 1
fi
before=$(cksum .env)
sh install.sh
[ "$before" = "$(cksum .env)" ]
HOMEBUDGET_URL=http://127.0.0.1:43102 node "$root/scripts/check-install.mjs" demo
printf '%s\n' 'Distribution verified: registry pulls, no source contexts/builds, demo protection and preserved configuration/data.'
