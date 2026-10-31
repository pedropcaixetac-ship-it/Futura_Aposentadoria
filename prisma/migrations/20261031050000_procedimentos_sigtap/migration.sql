-- Tabela de procedimentos do SUS (SIGTAP), para a busca nos laudos APAC e AIH.
CREATE TABLE "SigtapProcedure" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "SigtapProcedure_pkey" PRIMARY KEY ("code")
);

-- Nome sem acentos e em minúsculas, para "eletrocardiografia" achar "ELETROCARDIOGRÁFIA".
ALTER TABLE "SigtapProcedure" ADD COLUMN "searchName" TEXT GENERATED ALWAYS AS (
  lower(translate(
    "name",
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
  ))
) STORED;
