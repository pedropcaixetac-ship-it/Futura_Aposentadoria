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
- Teleconsulta por vídeo (Resolução CFM 2.314/2022): o profissional cria a teleconsulta no prontuário e envia o link
  ao paciente (copiar ou WhatsApp). O paciente abre no celular, sem instalar nada, aceita o termo de consentimento
  e entra na chamada. O vídeo fica ao lado do atendimento, não é gravado, e o termo aceito (texto, hora e IP) fica
  guardado no prontuário sem poder ser alterado

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

Para o vídeo da teleconsulta, crie uma conta na [Daily](https://www.daily.co), copie a chave de API (Developers → API keys)
e cadastre-a como `DAILY_API_KEY` nas variáveis de ambiente. Sem a chave, o resto do sistema funciona e a teleconsulta
avisa que o vídeo não está ativado.

Tecnologias: Next.js 15, TypeScript, PostgreSQL com Prisma e Tailwind CSS.
A tabela CID-10 (`prisma/data/cid10.tsv`) vem do DATASUS.
