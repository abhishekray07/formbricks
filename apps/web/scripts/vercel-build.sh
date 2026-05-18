#!/usr/bin/env bash
set -euo pipefail

# Vercel build entrypoint for the Formbricks fork.
# Runs from apps/web (Vercel Root Directory). Hops to the monorepo root
# for turbo + pnpm-workspace operations.

cd "$(dirname "$0")/../../.."

if [ -z "${NEXTAUTH_URL:-}" ] && [ -n "${VERCEL_URL:-}" ]; then
  export NEXTAUTH_URL="https://${VERCEL_URL}"
fi
if [ -z "${WEBAPP_URL:-}" ] && [ -n "${VERCEL_URL:-}" ]; then
  export WEBAPP_URL="https://${VERCEL_URL}"
fi

echo "==> Building @formbricks/database (and its workspace deps)"
pnpm turbo run build --filter=@formbricks/database

echo "==> Applying Prisma migrations against DATABASE_URL"
pnpm --filter @formbricks/database db:migrate:deploy

if [ "${VERCEL_ENV:-}" = "preview" ] || [ "${FORMBRICKS_FORCE_SEED:-0}" = "1" ]; then
  echo "==> Seeding database (VERCEL_ENV=${VERCEL_ENV:-unset})"
  ALLOW_SEED=true pnpm --filter @formbricks/database exec tsx src/seed.ts
else
  echo "==> Skipping seed (VERCEL_ENV=${VERCEL_ENV:-unset})"
fi

# Next 16's build pipeline stats apps/web/.env and ENOENTs when the file is missing.
# On Vercel envs come from process.env, so the file content is irrelevant — only its
# existence matters. Disabling output:"standalone" wasn't enough to bypass the stat.
touch apps/web/.env

echo "==> Building @formbricks/web"
pnpm turbo run build --filter=@formbricks/web
