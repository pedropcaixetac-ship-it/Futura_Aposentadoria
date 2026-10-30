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

Tecnologias: Next.js 15, TypeScript, PostgreSQL com Prisma e Tailwind CSS.
A tabela CID-10 (`prisma/data/cid10.tsv`) vem do DATASUS.
