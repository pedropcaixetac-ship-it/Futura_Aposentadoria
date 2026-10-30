-- O perfil que pode tudo passa a se chamar "Gerente do sistema"; "Administrador(a)" fica para a equipe do administrativo.
UPDATE "User" SET "jobTitle" = 'Gerente do sistema' WHERE "jobTitle" = 'Gerente / administrador(a)';
