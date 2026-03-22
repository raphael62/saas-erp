/**
 * Daily target formula (system-wide):
 *
 *   Daily Target = Total Target / (month days − Sundays)
 *
 * Working days = calendar days in the month excluding Sundays.
 * Used for: SSR/POS daily targets, VSR daily targets, commission calculations.
 */

/**
 * Count calendar days in the month of `isoDate` that are not Sunday (day 0).
 * Used for: Daily Target = Total Target / working days
 */
export function countMonthDaysExcludingSundays(isoDate: string): number {
  const s = isoDate.slice(0, 10);
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return 0;
  const y = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(month) || month < 1 || month > 12) return 0;
  const last = new Date(y, month, 0).getDate();
  let n = 0;
  for (let day = 1; day <= last; day++) {
    if (new Date(y, month - 1, day).getDay() !== 0) n++;
  }
  return n;
}

/**
 * Daily target from monthly target. Uses formula: Total Target / (month days − Sundays).
 * Works for both quantity and value targets (VSR qty, SSR value, commission).
 */
export function dailyTargetFromMonthly(
  monthlyTarget: number,
  isoDateInMonth: string
): number {
  const workingDays = countMonthDaysExcludingSundays(isoDateInMonth);
  if (workingDays <= 0 || !Number.isFinite(monthlyTarget)) return 0;
  return monthlyTarget / workingDays;
}

/** Alias for dailyTargetFromMonthly — used for VSR target qty. */
export function dailyTargetQtyFromMonthly(
  targetQty: number,
  isoDateInMonth: string
): number {
  return dailyTargetFromMonthly(targetQty, isoDateInMonth);
}
