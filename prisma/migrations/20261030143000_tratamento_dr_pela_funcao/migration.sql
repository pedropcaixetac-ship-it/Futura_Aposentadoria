-- "Dr."/"Dra." passa a ser colocado pelo sistema conforme a função (médico, psicólogo, dentista).
-- Quem foi cadastrado como "Dra. Fulana" fica com sexo feminino (se ainda não informado) e o nome sem o título.
UPDATE "User" SET "sex" = 'F' WHERE "sex" IS NULL AND "name" ~* '^\s*dra\.?\s+';
UPDATE "User" SET "sex" = 'M' WHERE "sex" IS NULL AND "name" ~* '^\s*dr\.?\s+';
UPDATE "User" SET "name" = btrim(regexp_replace("name", '^\s*dra?\.?\s+', '', 'i')) WHERE "name" ~* '^\s*dra?\.?\s+';

-- Funções digitadas à mão passam para os nomes da lista pronta.
UPDATE "User" SET "sex" = 'F' WHERE "sex" IS NULL AND "jobTitle" IN ('Médica', 'Psicóloga', 'Enfermeira', 'Cirurgiã-dentista');
UPDATE "User" SET "jobTitle" = 'Médico(a)' WHERE "jobTitle" IN ('Médico', 'Médica', 'Medico', 'Medica');
UPDATE "User" SET "jobTitle" = 'Psicólogo(a)' WHERE "jobTitle" IN ('Psicólogo', 'Psicóloga', 'Psicologo', 'Psicologa');
UPDATE "User" SET "jobTitle" = 'Enfermeiro(a)' WHERE "jobTitle" IN ('Enfermeiro', 'Enfermeira');
UPDATE "User" SET "jobTitle" = 'Cirurgião(ã)-dentista' WHERE "jobTitle" IN ('Dentista', 'Cirurgião-dentista', 'Cirurgiã-dentista');
UPDATE "User" SET "jobTitle" = 'Gerente / administrador(a)' WHERE "jobTitle" IN ('Administrador', 'Administradora');
