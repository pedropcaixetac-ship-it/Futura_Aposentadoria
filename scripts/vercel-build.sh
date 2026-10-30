#!/bin/sh
# Roda na Vercel a cada publicação: atualiza o banco, carrega os dados iniciais e monta o site.
# As migrações usam a conexão direta do Neon (DATABASE_URL_UNPOOLED) quando ela existe.
set -e
if [ -n "$DATABASE_URL_UNPOOLED" ]; then
  DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma migrate deploy
else
  npx prisma migrate deploy
fi
npx prisma db seed
npx next build
