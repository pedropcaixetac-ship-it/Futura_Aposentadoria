-- Número de linhas de cada tabela do sistema, em ordem, uma por linha ("Tabela"|linhas).
-- Usado pela cópia de segurança diária para conferir que a cópia restaurada está completa.
SELECT format('%I', c.relname) || '|' ||
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;
