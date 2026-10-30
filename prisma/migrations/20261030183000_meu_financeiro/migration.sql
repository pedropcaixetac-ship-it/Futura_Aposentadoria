-- A aba "Financeiro" foi dividida em duas: "Financeiro" (administração) e "Meu financeiro" (profissionais).
-- Quem tem permissões personalizadas e é profissional de saúde passa de "financeiro" para "meu-financeiro".
UPDATE "User"
SET "allowedTabs" = array_append(array_remove("allowedTabs", 'financeiro'), 'meu-financeiro')
WHERE "customTabs" = true
  AND 'financeiro' = ANY("allowedTabs")
  AND "role" IN ('PROFISSIONAL', 'TECNICO');
