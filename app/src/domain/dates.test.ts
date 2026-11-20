import { afterEach, describe, expect, it } from 'vitest';
import {
  addDays, addMonths, daysInMonth, formatDateLong, formatDayTitle,
  formatMonthTitle, monthOf, setNowProvider, todayKst, weekday,
} from './dates';

describe('dates', () => {
  afterEach(() => setNowProvider(Date.now));

  it('UTC 15:30은 한국 날짜로 다음 날', () => {
    setNowProvider(() => Date.UTC(2026, 10, 15, 15, 30));
    expect(todayKst()).toBe('2026-11-16');
  });
  it('날짜 연산', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(daysInMonth('2028-02')).toBe(29);
    expect(weekday('2026-11-15')).toBe(0);
    expect(monthOf('2026-11-15')).toBe('2026-11');
  });
  it('표기', () => {
    expect(formatMonthTitle('2026-09')).toBe('2026년 9월');
    expect(formatDateLong('2026-10-25')).toBe('2026년 10월 25일');
    expect(formatDayTitle('2026-11-15')).toBe('11월 15일 (일)');
  });
});
