-- Guias de convênio também só podem apontar para paciente, profissional, atendimento e convênio da mesma clínica.
CREATE TRIGGER "insuranceclaim_mesma_clinica"
BEFORE INSERT OR UPDATE ON "InsuranceClaim"
FOR EACH ROW EXECUTE FUNCTION conferir_mesma_clinica('healthPlanId', 'HealthPlan', 'patientId', 'Patient', 'professionalId', 'User', 'encounterId', 'Encounter');
