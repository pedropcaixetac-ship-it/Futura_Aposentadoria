# Prontuário Eletrônico (Futura Aposentadoria)

Sistema de prontuário eletrônico e gestão de clínicas com vários profissionais, no estilo do iClinic.
Este é o primeiro módulo: **Prontuário**.

## O que já funciona

- Login por clínica, com perfis de administrador, profissional de saúde e recepção
- Cadastro e busca de pacientes (nome, CPF, telefone)
- Resumo clínico do paciente: alergias (em destaque), medicamentos em uso e antecedentes
- Atendimentos com modelos personalizáveis por especialidade, ou evolução livre
- Diagnóstico com busca na tabela CID-10 oficial do DATASUS
- Rascunho editável só pelo autor. Depois de finalizado, o atendimento não pode ser alterado nem apagado,
  apenas complementado por adendo (CFM 1.638/2002 e Lei 13.787/2018). O próprio banco de dados bloqueia isso
- Código de integridade em cada atendimento finalizado, que avisa se o conteúdo for adulterado
- Recepção vê o cadastro, mas não o conteúdo clínico
- Auditoria (LGPD): quem abriu ou alterou cada prontuário, quando e de onde. Esses registros também não podem ser apagados
- Impressão do atendimento
- Barra lateral com a clínica, o usuário, o setor e o menu de cada perfil
- "Usar modelo" ao lado de cada campo do atendimento, com os textos prontos de cada profissional

### Financeiro

- Resumo do mês: quanto entrou, quanto saiu, saldo, quanto falta receber e pagamentos atrasados
- Receitas: cobrança de cada atendimento finalizado (ou avulsa), com forma de pagamento e situação
- Despesas da clínica, com vencimento e aviso de atraso
- Tabela de preços, que preenche o valor da cobrança
- Repasse por profissional (porcentagem do valor recebido), que pode ser lançado como despesa
- Recibo numerado, com valor por extenso, para imprimir ou salvar em PDF
- O administrador vê tudo; a recepção lança cobranças e recebe pagamentos; cada profissional vê só o próprio repasse

## Usuários de demonstração

Código da clínica: `demo`. Senha de todos: `senha123`.

| E-mail | Perfil |
| --- | --- |
| ana@demo.com | Médica (CRM) |
| carlos@demo.com | Psicólogo (CRP) |
| recepcao@demo.com | Recepção |
| admin@demo.com | Administrador |

## Para quem for rodar o código

Precisa de Node.js 20+ e PostgreSQL.

```bash
npm install
cp .env.example .env        # ajuste DATABASE_URL
npx prisma migrate deploy   # cria as tabelas e as travas do prontuário
npm run db:seed             # CID-10 e clínica de demonstração
npm run dev                 # abre em http://localhost:3000
npm test                    # testes (precisam do banco)
```

Na Vercel, o comando `vercel-build` (em `scripts/vercel-build.sh`) aplica as migrações, carrega os dados iniciais e monta o site.
Basta conectar um banco Neon ao projeto, que cria `DATABASE_URL` e `DATABASE_URL_UNPOOLED`.

Tecnologias: Next.js 15, TypeScript, PostgreSQL com Prisma e Tailwind CSS.
A tabela CID-10 (`prisma/data/cid10.tsv`) vem do DATASUS.
