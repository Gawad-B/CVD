/** Adult-only: the model was trained on adults, so the app rejects anything outside this range. */
export const MIN_PATIENT_AGE = 18;
export const MAX_PATIENT_AGE = 120;

interface YMD {
  y: number;
  m: number;
  d: number;
}

/** Strict "YYYY-MM-DD" parse (no Date, so no timezone shifts). Returns null for impossible dates. */
export function parseIsoDate(value: string | null | undefined): YMD | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1) return null;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= daysInMonth ? { y, m, d } : null;
}

/** Today as local "YYYY-MM-DD" (for the date input's `max`). */
export function todayIso(today: Date = new Date()): string {
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${String(today.getFullYear()).padStart(4, "0")}-${mm}-${dd}`;
}

/** Whole years since the date of birth, or null if it is missing, invalid or in the future. */
export function ageFromDob(dob: string | null | undefined, today: Date = new Date()): number | null {
  const parsed = parseIsoDate(dob);
  if (!parsed) return null;
  let age = today.getFullYear() - parsed.y;
  const month = today.getMonth() + 1;
  if (month < parsed.m || (month === parsed.m && today.getDate() < parsed.d)) age -= 1;
  return age >= 0 ? age : null;
}

/** Validation message for a date of birth, or null when it is a valid adult date. */
export function dobProblem(dob: string, today: Date = new Date()): string | null {
  if (!dob) return "Enter the date of birth.";
  if (!parseIsoDate(dob)) return "Enter a valid date of birth.";
  const age = ageFromDob(dob, today);
  if (age === null) return "Date of birth can't be in the future.";
  if (age < MIN_PATIENT_AGE || age > MAX_PATIENT_AGE) {
    return `Patients must be ${MIN_PATIENT_AGE}–${MAX_PATIENT_AGE} years old; the model is adult-only.`;
  }
  return null;
}
