// Aplicativo do paciente. O paciente entra com o código da clínica, o CPF e a data de nascimento.
// Como não há senha, o aplicativo mostra só as consultas (nada do prontuário), trava a entrada
// depois de várias tentativas erradas e registra tudo na auditoria.

export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;
export const PATIENT_SESSION_DAYS = 7;

export function isLocked(p: { appLockedUntil: Date | null }, now = new Date()) {
  return !!p.appLockedUntil && p.appLockedUntil > now;
}

// Depois de um erro: soma a tentativa e, ao chegar no limite, trava e zera a contagem.
export function afterFailure(p: { appLoginFailures: number }, now = new Date()) {
  const failures = p.appLoginFailures + 1;
  if (failures < MAX_FAILURES) return { appLoginFailures: failures, appLockedUntil: null };
  return { appLoginFailures: 0, appLockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60 * 1000) };
}

// Aceita o que o campo de data do celular manda ("1990-12-31") ou "31/12/1990".
export function parseBirthDate(value: string) {
  const v = value.trim();
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : br ? [br[3], br[2], br[1]] : [];
  if (!y) return null;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.getUTCDate() === Number(d) && date.getUTCMonth() === Number(m) - 1 ? date : null;
}

// A data de nascimento é guardada como dia (meia-noite UTC); compara só o dia.
export function sameDay(a: Date, b: Date) {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

// O paciente só mexe em consultas que ainda não começaram e que a recepção ainda não marcou como chegada.
type PatientAppointment = { status: string; startsAt: Date };

export function patientCanConfirm(a: PatientAppointment, now = new Date()) {
  return a.status === "AGENDADO" && a.startsAt > now;
}

export function patientCanCancel(a: PatientAppointment, now = new Date()) {
  return (a.status === "AGENDADO" || a.status === "CONFIRMADO") && a.startsAt > now;
}

// Motivo digitado pelo paciente (opcional). Que foi pelo aplicativo, a agenda já mostra como "Desmarcado pelo app".
export function patientCancelReason(reason: string) {
  return reason.trim().slice(0, 300) || null;
}

// Marcação pelo aplicativo: o paciente escolhe um horário livre da agenda do profissional.
export const BOOKING_DAYS = 30;
// Antecedência mínima, para a recepção não ser pega de surpresa.
export const MIN_NOTICE_MINUTES = 60;
// Limite de consultas futuras marcadas pelo próprio paciente, para ninguém lotar a agenda.
export const MAX_APP_BOOKINGS = 3;

export function bookable<T extends { start: Date }>(slots: T[], now = new Date()) {
  const limit = now.getTime() + MIN_NOTICE_MINUTES * 60 * 1000;
  return slots.filter((s) => s.start.getTime() >= limit);
}

// O que o paciente fez por último pelo aplicativo nesta consulta (para o quadro da Recepção).
export function lastAppAction(a: {
  status: string;
  createdInAppAt: Date | null;
  rescheduledInAppAt: Date | null;
  cancelledInAppAt: Date | null;
}) {
  if (a.status === "DESMARCADO") return a.cancelledInAppAt ? { label: "Desmarcou", at: a.cancelledInAppAt } : null;
  if (a.rescheduledInAppAt && (!a.createdInAppAt || a.rescheduledInAppAt > a.createdInAppAt)) return { label: "Remarcou", at: a.rescheduledInAppAt };
  return a.createdInAppAt ? { label: "Marcou", at: a.createdInAppAt } : null;
}
