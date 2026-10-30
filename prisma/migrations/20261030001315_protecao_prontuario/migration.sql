-- Proteções do prontuário no próprio banco de dados, para valerem mesmo
-- que algum erro no sistema tente burlar as regras.
-- CFM 1.638/2002 e Lei 13.787/2018: o prontuário não pode ser apagado e,
-- depois de finalizado, não pode ser alterado (só complementado por adendo).

CREATE OR REPLACE FUNCTION bloquear_alteracao_atendimento_finalizado()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Atendimentos do prontuário não podem ser excluídos';
  END IF;
  IF OLD.status = 'FINALIZADO' THEN
    RAISE EXCEPTION 'Atendimento finalizado não pode ser alterado; use um adendo';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER encounter_imutavel
BEFORE UPDATE OR DELETE ON "Encounter"
FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_atendimento_finalizado();

CREATE OR REPLACE FUNCTION bloquear_alteracao_registro()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registros de % não podem ser alterados nem excluídos', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER addendum_imutavel
BEFORE UPDATE OR DELETE ON "Addendum"
FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_registro();

CREATE TRIGGER auditlog_imutavel
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_registro();
