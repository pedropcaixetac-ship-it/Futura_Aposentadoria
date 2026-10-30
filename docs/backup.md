# Cópia de segurança do banco

O sistema tem duas proteções para os dados:

1. **Histórico do Neon (6 horas, plano gratuito).** Dá para voltar o banco a qualquer momento das últimas 6 horas
   pelo painel do Neon (Restore). Serve para um erro percebido na hora.
2. **Cópia diária no GitHub (30 dias).** Todo dia às 3h (Brasília) o GitHub copia o banco inteiro, restaura a cópia
   num banco descartável para conferir que ela volta completa, tranca com senha e guarda por 30 dias.
   Ver `.github/workflows/backup.yml`. Se algo falhar, o GitHub manda e-mail para o dono do repositório.

## Ligar a cópia diária (uma vez só)

No GitHub, no repositório: **Settings → Secrets and variables → Actions → New repository secret**.

- `BACKUP_DATABASE_URL`: no Neon, em **Connect**, escolha a branch de produção, desligue "Connection pooling"
  e copie o endereço (começa com `postgresql://`). É só leitura que a cópia faz, mas o endereço dá acesso total:
  não mande para ninguém.
- `BACKUP_SENHA`: uma senha longa inventada por você. **Guarde no gerenciador de senhas**: sem ela, nenhuma
  cópia abre, nem para nós.

Depois, em **Actions → Cópia de segurança do banco → Run workflow**, rode uma vez para ver ficar verde.

## Onde ficam as cópias

**Actions → Cópia de segurança do banco →** uma execução verde **→ Artifacts → banco-...**
O arquivo baixado é um `.zip` com `banco.dump.gpg` dentro.

## Restaurar (só em caso de perda de dados)

Nunca restaure por cima da produção sem antes ter uma cópia dela. O caminho seguro:

1. No Neon, crie um banco novo vazio (ou uma branch nova) para receber a cópia.
2. Abra a cópia com a senha:
   `gpg --decrypt banco.dump.gpg > banco.dump`
3. Restaure no banco novo:
   `pg_restore --dbname="ENDEREÇO_DO_BANCO_NOVO" --no-owner --no-acl --exit-on-error banco.dump`
4. Confira o banco novo e só então aponte a Vercel para ele (variáveis `DATABASE_URL` e `DATABASE_URL_UNPOOLED`).
