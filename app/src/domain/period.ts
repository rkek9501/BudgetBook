import type { DateStr, MonthStr, Period } from './types';
import { addDays, addMonths, daysInMonth, monthOf, weekday } from './dates';

function effectiveStart(month: MonthStr, startDay: number): DateStr {
  const day = Math.min(startDay, daysInMonth(month));
  return `${month}-${String(day).padStart(2, '0')}`;
}

/** 명세 §4.1 */
export function accountPeriod(month: MonthStr, startDay: number): Period {
  const base = startDay >= 20 ? addMonths(month, -1) : month;
  return {
    start: effectiveStart(base, startDay),
    end: addDays(effectiveStart(addMonths(base, 1), startDay), -1),
  };
}

export function accountMonthOf(date: DateStr, startDay: number): MonthStr {
  const candidate = monthOf(date);
  const p = accountPeriod(candidate, startDay);
  if (date < p.start) return addMonths(candidate, -1);
  if (date > p.end) return addMonths(candidate, 1);
  return candidate;
}

export function periodDates(p: Period): DateStr[] {
  const out: DateStr[] = [];
  for (let d = p.start; d <= p.end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function calendarLayout(p: Period): { leadingBlanks: number; rows: number } {
  const leadingBlanks = weekday(p.start);
  const days = periodDates(p).length;
  return { leadingBlanks, rows: Math.ceil((leadingBlanks + days) / 7) };
}
