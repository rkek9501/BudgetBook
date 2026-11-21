import type { Category, CategoryNote, DateStr, Expense, FixedAmount, MonthStr, Period } from './types';
import { compareCategories } from './categories';
import { periodDates } from './period';

export interface SummaryRow { category: Category; total: number; note: string }
export interface MonthSummary {
  rows: SummaryRow[];
  variableTotal: number;
  fixedTotal: number;
  grandTotal: number;
  noExpenseCount: number;
}

const inPeriod = (p: Period, d: DateStr): boolean => p.start <= d && d <= p.end;

export function buildMonthSummary(i: {
  period: Period; month: MonthStr; categories: Category[]; expenses: Expense[];
  noExpenseDays: DateStr[]; notes: CategoryNote[]; fixedAmounts: FixedAmount[];
}): MonthSummary {
  const totals = new Map<number, number>();
  let variableTotal = 0;
  for (const e of i.expenses) {
    if (!inPeriod(i.period, e.date)) continue;
    variableTotal += e.amount;
    totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + e.amount);
  }
  const noteOf = new Map<number, string>();
  for (const n of i.notes) if (n.month === i.month) noteOf.set(n.categoryId, n.note);

  const rows: SummaryRow[] = i.categories
    .filter(c => totals.has(c.id) || noteOf.has(c.id))
    .sort(compareCategories)
    .map(c => ({ category: c, total: totals.get(c.id) ?? 0, note: noteOf.get(c.id) ?? '' }));

  const fixedTotal = i.fixedAmounts.filter(f => f.month === i.month).reduce((s, f) => s + f.amount, 0);
  const noExpenseCount = new Set(i.noExpenseDays.filter(d => inPeriod(i.period, d))).size;
  return { rows, variableTotal, fixedTotal, grandTotal: variableTotal + fixedTotal, noExpenseCount };
}

export interface DayCellData { date: DateStr; expenses: Expense[]; total: number; noExpense: boolean }

export function buildDayCells(
  period: Period, expenses: Expense[], noExpenseDays: DateStr[], categories: Category[],
): DayCellData[] {
  const catOf = new Map(categories.map(c => [c.id, c]));
  const byDate = new Map<DateStr, Expense[]>();
  for (const e of expenses) {
    const list = byDate.get(e.date);
    if (list) list.push(e); else byDate.set(e.date, [e]);
  }
  const noExp = new Set(noExpenseDays);
  return periodDates(period).map(date => {
    const list = (byDate.get(date) ?? []).slice().sort((a, b) => {
      const ca = catOf.get(a.categoryId);
      const cb = catOf.get(b.categoryId);
      if (ca && cb) return compareCategories(ca, cb);
      return ca ? -1 : cb ? 1 : 0; // 알 수 없는 카테고리는 뒤로
    });
    return { date, expenses: list, total: list.reduce((s, e) => s + e.amount, 0), noExpense: noExp.has(date) };
  });
}

export function fitChips(count: number, availablePx: number, chipPx: number, morePx: number): { visible: number; hidden: number } {
  if (count * chipPx <= availablePx) return { visible: count, hidden: 0 };
  const visible = Math.min(count, Math.max(0, Math.floor((availablePx - morePx) / chipPx)));
  return { visible, hidden: count - visible };
}
