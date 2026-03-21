/**
 * Count calendar days in the month of `isoDate` that are not Sunday (day 0).
 * Used for VSR daily target: monthly target qty ÷ this count.
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

/** Daily target quantity from monthly VSR target qty for that calendar month. */
export function dailyTargetQtyFromMonthly(targetQty: number, isoDateInMonth: string): number {
  const d = countMonthDaysExcludingSundays(isoDateInMonth);
  if (d <= 0 || !Number.isFinite(targetQty)) return 0;
  return targetQty / d;
}
