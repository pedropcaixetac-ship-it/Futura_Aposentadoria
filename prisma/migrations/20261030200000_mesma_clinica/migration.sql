-- Trava no próprio banco: um registro só pode apontar para paciente, profissional, atendimento etc.
-- da MESMA clínica. O sistema já confere isso em cada tela; esta é a segunda proteção, para que um
-- erro futuro no código nunca misture dados de duas clínicas.
CREATE OR REPLACE FUNCTION conferir_mesma_clinica()
RETURNS trigger AS $$
DECLARE
  novo jsonb := to_jsonb(NEW);
  antigo jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  i int := 0;
  coluna text;
  tabela text;
  valor text;
  clinica_ligada text;
BEGIN
  WHILE i < TG_NARGS LOOP
    coluna := TG_ARGV[i];
    tabela := TG_ARGV[i + 1];
    i := i + 2;
    valor := novo ->> coluna;
    CONTINUE WHEN valor IS NULL;
    -- Numa alteração, só confere a ligação que mudou (ou se a própria clínica mudou).
    CONTINUE WHEN antigo IS NOT NULL AND antigo ->> coluna IS NOT DISTINCT FROM valor
      AND antigo ->> 'clinicId' IS NOT DISTINCT FROM novo ->> 'clinicId';
    EXECUTE format('SELECT "clinicId" FROM %I WHERE id = $1', tabela) INTO clinica_ligada USING valor;
    IF clinica_ligada IS DISTINCT FROM novo ->> 'clinicId' THEN
      RAISE EXCEPTION 'Registro de % ligado a % de outra clínica', TG_TABLE_NAME, tabela;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "appointment_mesma_clinica"
BEFORE INSERT OR UPDATE ON "Appointment"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('professionalId', 'User', 'patientId', 'Patient', 'encounterId', 'Encounter', 'createdById', 'User');

CREATE TRIGGER "auditlog_mesma_clinica"
BEFORE INSERT OR UPDATE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('userId', 'User');

CREATE TRIGGER "charge_mesma_clinica"
BEFORE INSERT OR UPDATE ON "Charge"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('patientId', 'Patient', 'professionalId', 'User', 'encounterId', 'Encounter', 'priceItemId', 'PriceItem');

CREATE TRIGGER "clinicaldocument_mesma_clinica"
BEFORE INSERT OR UPDATE ON "ClinicalDocument"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('encounterId', 'Encounter', 'patientId', 'Patient', 'authorId', 'User');

CREATE TRIGGER "employmentcontract_mesma_clinica"
BEFORE INSERT OR UPDATE ON "EmploymentContract"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('userId', 'User');

CREATE TRIGGER "encounter_mesma_clinica"
BEFORE INSERT OR UPDATE ON "Encounter"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('patientId', 'Patient', 'professionalId', 'User', 'templateId', 'RecordTemplate');

CREATE TRIGGER "expense_mesma_clinica"
BEFORE INSERT OR UPDATE ON "Expense"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('purchaseId', 'Purchase');

CREATE TRIGGER "obligationentry_mesma_clinica"
BEFORE INSERT OR UPDATE ON "ObligationEntry"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('obligationId', 'TaxObligation');

CREATE TRIGGER "patient_mesma_clinica"
BEFORE INSERT OR UPDATE ON "Patient"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('healthPlanId', 'HealthPlan');

CREATE TRIGGER "payrollentry_mesma_clinica"
BEFORE INSERT OR UPDATE ON "PayrollEntry"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('contractId', 'EmploymentContract');

CREATE TRIGGER "recordtemplate_mesma_clinica"
BEFORE INSERT OR UPDATE ON "RecordTemplate"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('ownerId', 'User');

CREATE TRIGGER "scheduleblock_mesma_clinica"
BEFORE INSERT OR UPDATE ON "ScheduleBlock"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('professionalId', 'User');

CREATE TRIGGER "signedpdf_mesma_clinica"
BEFORE INSERT OR UPDATE ON "SignedPdf"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('patientId', 'Patient', 'encounterId', 'Encounter', 'documentId', 'ClinicalDocument', 'signerId', 'User');

CREATE TRIGGER "teleconsultation_mesma_clinica"
BEFORE INSERT OR UPDATE ON "Teleconsultation"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('patientId', 'Patient', 'professionalId', 'User', 'encounterId', 'Encounter', 'appointmentId', 'Appointment');

CREATE TRIGGER "vacation_mesma_clinica"
BEFORE INSERT OR UPDATE ON "Vacation"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('contractId', 'EmploymentContract');

CREATE TRIGGER "whatsappmessage_mesma_clinica"
BEFORE INSERT OR UPDATE ON "WhatsappMessage"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('updatedById', 'User');

CREATE TRIGGER "workhours_mesma_clinica"
BEFORE INSERT OR UPDATE ON "WorkHours"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('professionalId', 'User');
