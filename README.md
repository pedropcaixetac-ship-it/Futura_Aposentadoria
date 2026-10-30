# Prontuário Eletrônico (Futura Aposentadoria)

Sistema de prontuário eletrônico e gestão de clínicas com vários profissionais, no estilo do iClinic.
Este é o primeiro módulo: **Prontuário**.

## O que já funciona

- Login por clínica, com perfis de administrador, profissional de saúde e recepção. No campo de login vale
  o e-mail, o CPF ou o número do conselho (CRM, CRP...) junto com a UF do registro
- Cadastro de pacientes completo, em blocos: identificação (com foto, RG, Cartão SUS), contato, endereço
  (o CEP preenche rua, bairro e cidade), convênio, responsável legal e consentimento LGPD.
  Obrigatórios: nome completo, CPF, celular (WhatsApp) e data de nascimento
- Cadastro rápido para a recepção (nome, nascimento e celular), marcado como "cadastro incompleto" até ser completado
- Confere CPF e Cartão SUS e avisa sobre paciente já cadastrado (mesmo CPF, mesmo cartão, ou mesmo nome e nascimento)
- Busca de pacientes enquanto se digita (nome, CPF, telefone, data de nascimento, convênio, carteirinha ou Cartão SUS), com a data da última consulta
- Histórico de atendimentos por ano, com filtros (profissional, tipo, período, CID), busca por palavra com destaque e consulta aberta na própria tela
- Impressão do histórico completo ou filtrado (só atendimentos finalizados)
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
  Depois de emitidos não podem ser alterados nem apagados
- Assinatura digital ICP-Brasil com certificado em nuvem (VIDaaS e BirdID), no padrão PAdES. O profissional autoriza
  uma vez no app do certificado e assina por 8 horas com um clique. Fora da produção há um "certificado de teste",
  sem validade jurídica, para experimentar. As credenciais de cada provedor vão nas variáveis de `.env.example`
- Barra lateral com a clínica, o usuário, o setor e o menu de cada perfil
- "Usar modelo" ao lado de cada campo do atendimento, com os textos prontos de cada profissional
- Teleconsulta por vídeo (Resolução CFM 2.314/2022): o profissional cria a teleconsulta no prontuário e envia o link
  ao paciente (copiar ou WhatsApp). O paciente abre no celular, sem instalar nada, aceita o termo de consentimento
  e entra na chamada. O vídeo fica ao lado do atendimento, não é gravado, e o termo aceito (texto, hora e IP) fica
  guardado no prontuário sem poder ser alterado
- Agenda por dia (uma coluna por profissional) e por semana, com horários de atendimento, bloqueios
  (almoço, férias), cadastro rápido de paciente, aviso de horário ocupado com opção de encaixe,
  situação da consulta em cores e sala de espera. O profissional inicia o atendimento direto da agenda,
  e a consulta vira "Atendido" quando o atendimento é finalizado
- Atender: a tela do profissional, com a sala de espera dele e a agenda dele do dia, de onde inicia o atendimento
- Recepção: lista das consultas do dia, onde a recepcionista marca quem confirmou, chegou ou faltou,
  e a sala de espera com o tempo de espera de cada paciente
- WhatsApp (primeira etapa): botão "Enviar no WhatsApp" na ficha do paciente, que abre o WhatsApp da recepção com o
  texto pronto (contato ou aviso de retorno). Só aparece se o paciente autorizou no cadastro (LGPD), e cada envio fica na auditoria
- WhatsApp na agenda: botão "Pedir confirmação" em cada consulta (também na Recepção, com o aviso das consultas de amanhã),
  retorno previsto anotado na consulta e a lista "Retornos para avisar" na Recepção. A mensagem ainda é enviada pela recepcionista
- Mensagens do WhatsApp editáveis por clínica (Recepção > Mensagens do WhatsApp), com partes preenchidas sozinhas como [paciente] e [hora]

### Financeiro

- Resumo do mês: quanto entrou, quanto saiu, saldo, quanto falta receber e pagamentos atrasados
- Receitas: cobrança de cada atendimento finalizado (ou avulsa), com forma de pagamento e situação
- Despesas da clínica, com vencimento e aviso de atraso
- Compras: entrada de nota fiscal de compra (material, medicamento, insumo, equipamento), com itens, lote e validade.
  O XML da NF-e enviado pelo fornecedor preenche tudo sozinho. O pagamento (à vista ou em parcelas) entra nas Despesas,
  e a mesma nota não pode ser lançada duas vezes
- Tabela de preços, que preenche o valor da cobrança
- Repasse por profissional (porcentagem do valor recebido), que pode ser lançado como despesa
- Recibo numerado, com valor por extenso, para imprimir ou salvar em PDF
- O administrador vê tudo; a recepção lança cobranças e recebe pagamentos; cada profissional vê só o próprio repasse

### Cadastro de servidores (só administrador)

- Tabela com a equipe: nome completo, função, setor/especialidade e situação, com filtros por nome/e-mail/CPF/conselho,
  função, setor e situação (ativos, desligados ou todos)
- Cadastro de cada pessoa com os mesmos dados do paciente (foto, documentos, contato, endereço com busca pelo CEP),
  mais CPF e registro no conselho, que servem para entrar no sistema
- Função, especialidade e setor em listas prontas (com "Outro" para digitar). A função já sugere o perfil de acesso e o conselho
- Perfis de saúde: acesso completo (médico, enfermeiro, psicólogo...) ou restrito (técnico/auxiliar de enfermagem, radiologia...).
  O restrito vê o resumo clínico e só os próprios atendimentos; não abre consultas de outros, não emite documentos nem imprime o histórico
- "Dr."/"Dra." aparece sozinho antes do nome de médicos, psicólogos e dentistas ("Dra." quando o sexo é feminino).
  Não se digita no nome: se vier digitado, é retirado ao salvar
- Dá para cadastrar quem faz parte da equipe mas não usa o sistema (ex.: limpeza): sem e-mail, sem senha e sem login
- Nos três pontinhos de cada linha: editar cadastro, editar permissões e registrar desligamento (ou reativar)
- Editar permissões escolhe as abas que aparecem para a pessoa. As regras de cada perfil continuam valendo:
  conteúdo clínico só para quem tem conselho, e o cadastro de servidores só para administradores
- Desligamento com data e motivo: a pessoa perde o acesso na hora, mas continua no cadastro, porque assina atendimentos antigos
- Tudo fica na auditoria

### Meu cadastro (todos os perfis)

- Cada pessoa vê os próprios dados do cadastro de servidores, só para leitura (quem corrige é o administrador)
- Pode trocar a própria senha (pede a senha atual) e cuidar do certificado digital (antes ficava na aba "Assinatura digital")
- A permissão "Assinatura digital" continua em "Editar permissões"; ela decide se a pessoa assina e vê o certificado aqui

### Contabilidade e trabalhista

- Aba para o administrador e para o novo perfil "Auxiliar administrativo" (e para quem o administrador liberar em "Editar permissões")
- Usa a mesma equipe do cadastro de servidores: aqui entram só os dados do contrato de trabalho (vínculo CLT, PJ, estágio ou autônomo,
  admissão, salário, jornada, PIS, Pix). Nome, CPF, função, setor e desligamento vêm do cadastro de servidores
- Férias (CLT): períodos de cada ano trabalhado, prazo para tirar, dias já tirados e férias marcadas, com aviso de férias vencendo ou vencidas
- Aviso do fim do contrato de experiência (90 dias)
- Folha do mês: faltas, horas extras, outros ganhos e descontos de cada funcionário para enviar ao contador, e o líquido que ele devolve.
  Um botão lança os salários como despesas no Financeiro, com vencimento no 5º dia útil
- Impostos e obrigações do mês (FGTS, INSS/DCTFWeb, DAS, ISS, eSocial, salários, 13º...), com vencimento, atraso e "marcar como pago".
  Com o valor pago, a guia entra como despesa no Financeiro. A lista pode ser ajustada para cada clínica
- Dados do contador e planilha do mês (abre no Excel) com receitas, despesas, folha e obrigações, para enviar ao contador

## Usuários de demonstração

Código da clínica: `demo`. Senha de todos: `senha123`. Dá para entrar pelo e-mail, pelo CPF ou pelo conselho.

| E-mail | CPF (fictício) | Conselho | Perfil |
| --- | --- | --- | --- |
| ana@demo.com | 529.982.247-25 | CRM 123456/SP | Médica |
| carlos@demo.com | 390.533.447-05 | CRP 06/98765 | Psicólogo |
| recepcao@demo.com | 111.444.777-35 | | Recepção |
| admin@demo.com | 123.456.789-09 | | Administrador |
| administrativo@demo.com | | | Auxiliar administrativo |

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
