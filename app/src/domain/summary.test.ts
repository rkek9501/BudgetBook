import { describe, it, expect } from 'vitest';
import { buildMonthSummary, buildDayCells, fitChips } from './summary';
import { accountPeriod } from './period';
import type { Category, CategoryNote, Expense, FixedAmount } from './types';

const categories: Category[] = [
  { id: 1, name: '식비', color: '#FCB9BA' },
  { id: 2, name: '교통', color: '#B7D9FC' },
  { id: 3, name: '생활', color: '#B8F6EE' },
  { id: 4, name: '기타', color: '#333333' },
];
const period = accountPeriod('2026-11', 25);
const ex = (id: string, date: string, description: string, amount: number, categoryId: number): Expense =>
  ({ id, date, description, amount, categoryId });
const expenses: Expense[] = [
  ex('a', '2026-11-15', '점심', 12000, 1),
  ex('b', '2026-11-15', '커피', 5000, 1),
  ex('c', '2026-11-15', '버스', 1450, 2),
  ex('d', '2026-11-15', '장보기', 33000, 4),
  ex('e', '2026-11-25', '기간 밖', 999, 1),
];
const noExpenseDays = ['2026-11-14'];
const fixedAmounts: FixedAmount[] = [
  { itemId: 'rent', month: '2026-11', amount: 500000 },
  { itemId: 'tel', month: '2026-11', amount: 55000 },
  { itemId: 'rent', month: '2026-12', amount: 1 },
];
const notes: CategoryNote[] = [
  { month: '2026-11', categoryId: 1, note: '회식이 많았음' },
  { month: '2026-11', categoryId: 3, note: '메모만' },
];
const s = buildMonthSummary({ period, month: '2026-11', categories, expenses, noExpenseDays, notes, fixedAmounts });
const cells = buildDayCells(period, expenses, noExpenseDays, categories);

describe('summary', () => {
  it('명세 실행 검증 값과 같다', () => {
    expect(s.rows.map(r => [r.category.name, r.total])).toEqual([['식비', 17000], ['교통', 1450], ['생활', 0], ['기타', 33000]]);
    expect([s.variableTotal, s.fixedTotal, s.grandTotal, s.noExpenseCount]).toEqual([51450, 555000, 606450, 1]);
    expect(s.rows[0].note).toBe('회식이 많았음');
    expect(s.rows[1].note).toBe('');
  });
  it('다른 회계월 메모는 무시한다', () => {
    const r = buildMonthSummary({ period, month: '2026-11', categories, expenses, noExpenseDays,
      notes: [{ month: '2026-10', categoryId: 2, note: 'x' }], fixedAmounts });
    expect(r.rows.map(x => x.category.name)).toEqual(['식비', '교통', '기타']);
    expect(r.rows[1].note).toBe('');
  });
  it('기간 밖 무지출은 세지 않고 중복은 한 번만 센다', () => {
    const r = buildMonthSummary({ period, month: '2026-11', categories, expenses, notes, fixedAmounts,
      noExpenseDays: ['2026-11-14', '2026-11-14', '2026-12-30'] });
    expect(r.noExpenseCount).toBe(1);
  });
  it('알 수 없는 카테고리는 합계에만 들어간다', () => {
    const odd = [...expenses, ex('z', '2026-11-15', '미상', 100, 99)];
    const r = buildMonthSummary({ period, month: '2026-11', categories, expenses: odd, noExpenseDays, notes, fixedAmounts });
    expect(r.variableTotal).toBe(51550);
    expect(r.rows).toHaveLength(4);
    const c = buildDayCells(period, odd, noExpenseDays, categories).find(x => x.date === '2026-11-15')!;
    expect(c.total).toBe(51550);
    expect(c.expenses.map(e => e.description)).toEqual(['점심', '커피', '버스', '장보기', '미상']);
  });
  it('날짜 칸', () => {
    const c = cells.find(x => x.date === '2026-11-15')!;
    expect(c.expenses.map(e => e.description)).toEqual(['점심', '커피', '버스', '장보기']);
    expect(c.total).toBe(51450);
    expect(cells.find(x => x.date === '2026-11-14')!.noExpense).toBe(true);
    expect(cells).toHaveLength(31);
    expect(cells[0].date).toBe('2026-10-25');
  });
  it('fitChips', () => {
    expect(fitChips(2, 100, 24, 18)).toEqual({ visible: 2, hidden: 0 });
    expect(fitChips(4, 90, 24, 18)).toEqual({ visible: 3, hidden: 1 });
    expect(fitChips(3, 10, 24, 18)).toEqual({ visible: 0, hidden: 3 });
  });
});
