# Prontuário Eletrônico (Futura Aposentadoria)

Sistema de prontuário eletrônico e gestão de clínicas com vários profissionais, no estilo do iClinic.
Este é o primeiro módulo: **Prontuário**.

## O que já funciona

- Login por clínica, com perfis de administrador, profissional de saúde e recepção. No campo de login vale
  o e-mail, o CPF ou o número do conselho (CRM, CRP...), como "123456" ou "CRM 123456/SP"
- Cadastro de pacientes completo, em blocos: identificação (com foto, RG, Cartão SUS), contato, endereço
  (o CEP preenche rua, bairro e cidade), convênio, responsável legal e consentimento LGPD.
  Obrigatórios: nome completo, CPF, celular (WhatsApp) e data de nascimento
- Cadastro rápido para a recepção (nome, nascimento e celular), marcado como "cadastro incompleto" até ser completado
- Confere CPF e Cartão SUS e avisa sobre paciente já cadastrado (mesmo CPF, mesmo cartão, ou mesmo nome e nascimento)
- Busca de pacientes por nome, CPF, telefone, carteirinha ou Cartão SUS
- Resumo clínico do paciente: alergias (em destaque), medicamentos em uso e antecedentes
- Atendimentos com modelos personalizáveis por especialidade, ou evolução livre
- Diagnóstico com busca na tabela CID-10 oficial do DATASUS
- Rascunho editável só pelo autor. Depois de finalizado, o atendimento não pode ser alterado nem apagado,
  apenas complementado por adendo (CFM 1.638/2002 e Lei 13.787/2018). O próprio banco de dados bloqueia isso
- Código de integridade em cada atendimento finalizado, que avisa se o conteúdo for adulterado
- Recepção vê o cadastro, mas não o conteúdo clínico
- Auditoria (LGPD): quem abriu ou alterou cada prontuário, quando e de onde. Esses registros também não podem ser apagados
- Impressão do atendimento e PDF do atendimento finalizado
- Receitas, atestados, pedidos de exame e relatórios emitidos dentro do atendimento, em PDF com o cabeçalho da clínica.
  Depois de emitidos não podem ser alterados nem apagados. É sobre esses PDFs que entrará a assinatura digital ICP-Brasil
- Barra lateral com a clínica, o usuário, o setor e o menu de cada perfil
- "Usar modelo" ao lado de cada campo do atendimento, com os textos prontos de cada profissional
- WhatsApp (primeira etapa): botão "Enviar no WhatsApp" na ficha do paciente, que abre o WhatsApp da recepção com o
  texto pronto (contato ou aviso de retorno). Só aparece se o paciente autorizou no cadastro (LGPD), e cada envio fica na auditoria

### Financeiro

- Resumo do mês: quanto entrou, quanto saiu, saldo, quanto falta receber e pagamentos atrasados
- Receitas: cobrança de cada atendimento finalizado (ou avulsa), com forma de pagamento e situação
- Despesas da clínica, com vencimento e aviso de atraso
- Tabela de preços, que preenche o valor da cobrança
- Repasse por profissional (porcentagem do valor recebido), que pode ser lançado como despesa
- Recibo numerado, com valor por extenso, para imprimir ou salvar em PDF
- O administrador vê tudo; a recepção lança cobranças e recebe pagamentos; cada profissional vê só o próprio repasse

### Cadastro de servidores (só administrador)

- Tabela com a equipe: nome completo, função, setor/especialidade e situação, com filtros por nome/e-mail/CPF/conselho,
  função, setor e situação (ativos, desligados ou todos)
- Cadastro de cada pessoa com CPF e registro no conselho, que servem para entrar no sistema
- Dá para cadastrar quem faz parte da equipe mas não usa o sistema (ex.: limpeza): sem e-mail, sem senha e sem login
- Nos três pontinhos de cada linha: editar cadastro, editar permissões e registrar desligamento (ou reativar)
- Editar permissões escolhe as abas que aparecem para a pessoa. As regras de cada perfil continuam valendo:
  conteúdo clínico só para quem tem conselho, e o cadastro de servidores só para administradores
- Desligamento com data e motivo: a pessoa perde o acesso na hora, mas continua no cadastro, porque assina atendimentos antigos
- Tudo fica na auditoria

## Usuários de demonstração

Código da clínica: `demo`. Senha de todos: `senha123`. Dá para entrar pelo e-mail, pelo CPF ou pelo conselho.

| E-mail | CPF (fictício) | Conselho | Perfil |
| --- | --- | --- | --- |
| ana@demo.com | 529.982.247-25 | CRM 123456/SP | Médica |
| carlos@demo.com | 390.533.447-05 | CRP 06/98765 | Psicólogo |
| recepcao@demo.com | 111.444.777-35 | | Recepção |
| admin@demo.com | 123.456.789-09 | | Administrador |

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
