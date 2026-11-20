import { describe, it, expect } from 'vitest';
import { accountPeriod, accountMonthOf, calendarLayout, periodDates } from './period';
import { addDays, addMonths } from './dates';
import type { MonthStr } from './types';

describe('회계기간', () => {
  it.each([
    [25, '2026-11', '2026-10-25', '2026-11-24'], [1, '2026-11', '2026-11-01', '2026-11-30'],
    [10, '2026-11', '2026-11-10', '2026-12-09'], [19, '2026-11', '2026-11-19', '2026-12-18'],
    [20, '2026-11', '2026-10-20', '2026-11-19'], [31, '2026-02', '2026-01-31', '2026-02-27'],
    [31, '2026-03', '2026-02-28', '2026-03-30'], [30, '2028-03', '2028-02-29', '2028-03-29'],
    [29, '2028-03', '2028-02-29', '2028-03-28'],
  ])('시작일 %i, %s → %s ~ %s', (s, m, start, end) => {
    expect(accountPeriod(m, s)).toEqual({ start, end });
  });

  it.each([
    ['2026-11-26', 25, '2026-12'], ['2026-11-03', 5, '2026-10'],
    ['2026-11-15', 25, '2026-11'], ['2026-11-15', 16, '2026-10'],
    ['2026-01-31', 31, '2026-02'], ['2026-03-30', 31, '2026-03'],
  ])('%s, 시작일 %i → 회계월 %s', (d, s, m) => expect(accountMonthOf(d, s)).toBe(m));

  it('연속성: 시작일 1~31, 2026-01~2028-12의 모든 회계기간은 빈틈·겹침 없이 이어진다', () => {
    for (let s = 1; s <= 31; s++) {
      let m: MonthStr = '2026-01';
      while (m < '2028-12') {
        const next = addMonths(m, 1);
        expect(accountPeriod(next, s).start, `S=${s} ${m}`).toBe(addDays(accountPeriod(m, s).end, 1));
        m = next;
      }
    }
  });

  it('달력 배치', () => {
    expect(calendarLayout(accountPeriod('2026-11', 25))).toEqual({ leadingBlanks: 0, rows: 5 });
  });

  it('periodDates는 시작~종료를 모두 나열한다', () => {
    const d = periodDates(accountPeriod('2026-11', 25));
    expect(d).toHaveLength(31);
    expect(d[0]).toBe('2026-10-25');
    expect(d[30]).toBe('2026-11-24');
  });
});
