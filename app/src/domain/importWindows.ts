import type { DateStr, MonthStr } from './types';
import { normalizeHex } from './categories';
import { MAX_AMOUNT } from './money';

export interface ImportPayload {
  categories: { sourceId: number; name: string; color: string }[];
  expenses: { date: DateStr; description: string; amount: number; sourceCategoryId: number }[];
  noExpenseDays: DateStr[];
  fixedItems: { name: string; sortOrder: number; amounts: { month: MonthStr; amount: number }[] }[];
  notes: { month: MonthStr; sourceCategoryId: number; note: string }[];
  accountingStartDay: number;
}
export interface ImportPreview {
  categories: number;
  expenses: number;
  noExpenseDays: number;
  fixedItems: number;
  notes: number;
  unclassified: number;
}
export type ImportResult =
  | { ok: true; payload: ImportPayload; preview: ImportPreview }
  | { ok: false; error: 'invalid-json' | 'unsupported-format' };

const DEFAULT_COLOR = '#BDBDBD';
const UNCLASSIFIED_NAME = '미분류';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const NOTE_KEY_RE = /^(\d{4}-(?:0[1-9]|1[0-2])):(-?\d+)$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const nameKey = (s: string) => s.trim().toLocaleLowerCase('ko');
const amountOf = (v: unknown) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_AMOUNT);
};

export function parseWindowsData(text: string): ImportResult {
  let root: unknown;
  try {
    // 메모장 등에서 저장한 UTF-8 BOM이 앞에 붙어 있어도 읽는다.
    root = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }
  if (!isObj(root) || !Array.isArray(root.Categories) || !Array.isArray(root.DayData)) {
    return { ok: false, error: 'unsupported-format' };
  }

  // 카테고리
  const categories: ImportPayload['categories'] = [];
  const idMap = new Map<number, number>(); // 원본 ID -> payload sourceId
  const byName = new Map<string, number>();
  for (const c of root.Categories) {
    if (!isObj(c) || typeof c.Id !== 'number' || !Number.isFinite(c.Id)) continue;
    const id = c.Id;
    let name = typeof c.CategoryName === 'string' ? c.CategoryName.trim() : '';
    if (name === '') name = `카테고리 ${id}`;
    const key = nameKey(name);
    const first = byName.get(key);
    if (first !== undefined) {
      if (!idMap.has(id)) idMap.set(id, first);
      continue;
    }
    if (idMap.has(id)) continue;
    const color = (typeof c.Color === 'string' && normalizeHex(c.Color.slice(-6))) || DEFAULT_COLOR;
    categories.push({ sourceId: id, name, color });
    idMap.set(id, id);
    byName.set(key, id);
  }

  let unclassified = 0;
  const resolve = (rawId: unknown): number => {
    const mapped = typeof rawId === 'number' ? idMap.get(rawId) : undefined;
    if (mapped !== undefined) return mapped;
    unclassified++;
    const existing = byName.get(nameKey(UNCLASSIFIED_NAME));
    if (existing !== undefined) return existing;
    // 원본 ID와 겹치지 않는 가상 ID (원본에 음수 ID가 있어도 안전)
    const id = Math.min(0, ...categories.map(c => c.sourceId)) - 1;
    categories.push({ sourceId: id, name: UNCLASSIFIED_NAME, color: DEFAULT_COLOR });
    byName.set(nameKey(UNCLASSIFIED_NAME), id);
    return id;
  };

  // 지출과 무지출
  const expenses: ImportPayload['expenses'] = [];
  const noExpense = new Set<DateStr>();
  const expenseDates = new Set<DateStr>();
  for (const d of root.DayData) {
    if (!isObj(d) || typeof d.Date !== 'string' || d.Date.length < 10) continue;
    const date = d.Date.slice(0, 10);
    if (!DATE_RE.test(date)) continue;
    if (d.IsNoExpenseDay === true) {
      noExpense.add(date);
      continue;
    }
    expenseDates.add(date);
    expenses.push({
      date,
      description: typeof d.Description === 'string' && d.Description.trim() !== '' ? d.Description : '(내용 없음)',
      amount: amountOf(d.Amount),
      sourceCategoryId: resolve(d.CategoryId),
    });
  }
  const noExpenseDays = [...noExpense].filter(x => !expenseDates.has(x)).sort();

  // 고정 지출
  const fixedItems: ImportPayload['fixedItems'] = [];
  const fixedNames = new Set<string>();
  if (Array.isArray(root.FixedExpenses)) {
    for (const f of root.FixedExpenses) {
      if (!isObj(f) || typeof f.Name !== 'string') continue;
      let name = f.Name.trim();
      // 이름이 겹치면 버리지 않고 " (2)", " (3)"을 붙여 금액 기록을 모두 가져온다.
      if (fixedNames.has(nameKey(name))) {
        const base = name;
        let n = 2;
        while (fixedNames.has(nameKey(`${base} (${n})`))) n++;
        name = `${base} (${n})`;
      }
      fixedNames.add(nameKey(name));
      const amounts: { month: MonthStr; amount: number }[] = [];
      if (isObj(f.MonthlyAmounts)) {
        for (const [month, v] of Object.entries(f.MonthlyAmounts)) {
          if (!MONTH_RE.test(month)) continue;
          const amount = amountOf(v);
          if (amount > 0) amounts.push({ month, amount });
        }
      }
      amounts.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
      fixedItems.push({ name, sortOrder: fixedItems.length, amounts });
    }
  }

  // 메모 (같은 월·카테고리로 합쳐지면 줄바꿈으로 잇는다)
  const noteMap = new Map<string, ImportPayload['notes'][number]>();
  if (isObj(root.CategoryNotes)) {
    for (const [key, v] of Object.entries(root.CategoryNotes)) {
      const m = NOTE_KEY_RE.exec(key);
      if (!m || typeof v !== 'string' || v.trim() === '') continue;
      const sourceCategoryId = resolve(Number(m[2]));
      const k = `${m[1]}:${sourceCategoryId}`;
      const prev = noteMap.get(k);
      if (prev) prev.note += `\n${v}`;
      else noteMap.set(k, { month: m[1], sourceCategoryId, note: v });
    }
  }
  const notes = [...noteMap.values()];

  const sd = root.AccountingStartDay;
  const accountingStartDay = typeof sd === 'number' && Number.isInteger(sd) && sd >= 1 && sd <= 31 ? sd : 25;

  return {
    ok: true,
    payload: { categories, expenses, noExpenseDays, fixedItems, notes, accountingStartDay },
    preview: {
      categories: categories.length,
      expenses: expenses.length,
      noExpenseDays: noExpenseDays.length,
      fixedItems: fixedItems.length,
      notes: notes.length,
      unclassified,
    },
  };
}
