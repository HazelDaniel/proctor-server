#!/usr/bin/env bash
source $(dirname $0)/../../.zshrc
DATABASE_URL=$(echo $DATABASE_URL) pnpm drizzle-kit generate &&\
DATABASE_URL=$(echo $DATABASE_URL) pnpm drizzle-kit migrate
