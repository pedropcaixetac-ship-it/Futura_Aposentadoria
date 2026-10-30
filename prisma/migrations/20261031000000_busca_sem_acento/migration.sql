-- Nome do paciente sem acentos e em minúsculas, calculado pelo próprio banco, para a busca
-- achar "José" quando a recepcionista digita "jose" (e "Gonçalves" com "goncalves").
ALTER TABLE "Patient" ADD COLUMN "searchName" TEXT GENERATED ALWAYS AS (
  lower(translate(
    "name" || ' ' || coalesce("socialName", ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
  ))
) STORED;
