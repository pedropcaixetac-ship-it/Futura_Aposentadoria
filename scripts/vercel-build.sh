#!/bin/sh
# Roda na Vercel a cada publicação: atualiza o banco, carrega os dados iniciais e monta o site.
# As migrações usam a conexão direta do Neon (DATABASE_URL_UNPOOLED) quando ela existe.
set -e
migrate() {
  if [ -n "$DATABASE_URL_UNPOOLED" ]; then
    DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma migrate "$@"
  else
    npx prisma migrate "$@"
  fi
}
# Bancos de teste em que a migração do login por CPF falhou (a coluna cpf já
# existia por causa da assinatura digital) ficam marcados como "falha". Isto
# libera a nova tentativa, que agora é segura. Onde não houve falha, não faz nada.
migrate resolve --rolled-back 20261030041500_login_cpf_crm >/dev/null 2>&1 || true
migrate deploy
npx prisma db seed
npx next build
