import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/commands', () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    ApiError,
    dbStatus: vi.fn(),
    bootstrap: vi.fn(),
    seedDefaultCategories: vi.fn(),
    loadPeriod: vi.fn(),
    addExpense: vi.fn(),
    updateExpense: vi.fn(),
    deleteExpense: vi.fn(),
    setNoExpenseDay: vi.fn(),
    saveNote: vi.fn(),
    setSetting: vi.fn(),
  };
});

import * as api from '@/api/commands';
import type { PeriodData } from '@/api/commands';
import { DEFAULT_CATEGORIES } from '@/domain/categories';
import { setNowProvider } from '@/domain/dates';
import { MESSAGES } from '@/domain/messages';
import { useLedgerStore } from './ledger';
import { useSettingsStore } from './settings';

const kst = (iso: string) => () => new Date(`${iso}+09:00`).getTime();
const EMPTY = { expenses: [], noExpenseDays: [], notes: [], fixedAmounts: [] };
const cats = [{ id: 1, name: '식비', color: '#FCB9BA' }];

function setup(startDay = 1, isFresh = false) {
  vi.mocked(api.dbStatus).mockResolvedValue({ ok: true, error: null });
  vi.mocked(api.bootstrap).mockResolvedValue({
    settings: { accountingStartDay: startDay, theme: 'macos', appearance: 'system' },
    categories: cats,
    isFresh,
  });
  vi.mocked(api.seedDefaultCategories).mockResolvedValue(
    DEFAULT_CATEGORIES.map((c, i) => ({ id: i + 1, ...c })),
  );
  vi.mocked(api.loadPeriod).mockResolvedValue(EMPTY);
}

beforeEach(() => {
  setActivePinia(createPinia());
  for (const f of Object.values(api)) {
    if (typeof f === 'function' && 'mockReset' in f) (f as ReturnType<typeof vi.fn>).mockReset();
  }
  setNowProvider(kst('2026-11-15T12:00:00'));
});
afterEach(() => setNowProvider(Date.now));

describe('ledger store', () => {
  it('시작일 16, 오늘 11-15 → 회계월 2026-10, 오늘 선택, 날짜 탭 (ISSUE-01)', async () => {
    setup(16);
    const s = useLedgerStore();
    await s.init();
    expect(s.viewMonth).toBe('2026-10');
    expect(s.selectedDate).toBe('2026-11-15');
    expect(s.activeTab).toBe('day');
    expect(s.ready).toBe(true);
    expect(s.dbError).toBeNull();
    expect(api.loadPeriod).toHaveBeenCalledWith('2026-10-16', '2026-11-15', '2026-10');
  });

  it('DB를 열 수 없으면 dbError', async () => {
    vi.mocked(api.dbStatus).mockResolvedValue({ ok: false, error: 'locked' });
    const s = useLedgerStore();
    await s.init();
    expect(s.dbError).toBe('locked');
    expect(s.ready).toBe(true);
    expect(api.bootstrap).not.toHaveBeenCalled();
  });

  it('init 중 db_unavailable이면 dbError', async () => {
    setup();
    vi.mocked(api.loadPeriod).mockRejectedValue(new api.ApiError('db_unavailable', 'x'));
    const s = useLedgerStore();
    await s.init();
    expect(s.dbError).toBeTruthy();
    expect(s.ready).toBe(true);
  });

  it('처음 실행이면 기본 카테고리 8개를 넣는다', async () => {
    setup(1, true);
    const s = useLedgerStore();
    await s.init();
    expect(api.seedDefaultCategories).toHaveBeenCalledWith(DEFAULT_CATEGORIES);
    expect(s.categories).toHaveLength(8);
  });

  it('처음이 아니면 기본 카테고리를 넣지 않는다', async () => {
    setup();
    const s = useLedgerStore();
    await s.init();
    expect(api.seedDefaultCategories).not.toHaveBeenCalled();
    expect(s.categories).toEqual(cats);
  });

  it('다음 달로 가면 기간 밖 선택이 풀리고 요약 탭', async () => {
    setup();
    const s = useLedgerStore();
    await s.init();
    await s.goNext();
    expect(s.viewMonth).toBe('2026-12');
    expect(s.selectedDate).toBeNull();
    expect(s.activeTab).toBe('summary');
    await s.goPrev();
    expect(s.viewMonth).toBe('2026-11');
    s.select('2026-11-03');
    expect(s.activeTab).toBe('day');
    await s.goPrev();
    expect(s.selectedDate).toBeNull();
  });

  it('goToday는 오늘로 돌아온다', async () => {
    setup();
    const s = useLedgerStore();
    await s.init();
    await s.goNext();
    await s.goToday();
    expect(s.viewMonth).toBe('2026-11');
    expect(s.selectedDate).toBe('2026-11-15');
    expect(s.activeTab).toBe('day');
  });

  it('시작일이 같으면 보던 달 유지 (ISSUE-02)', async () => {
    setup(16);
    const s = useLedgerStore();
    await s.init();
    await s.goPrev();
    vi.mocked(api.loadPeriod).mockClear();
    await s.onStartDayChanged(16, 16);
    expect(s.viewMonth).toBe('2026-09');
    expect(api.loadPeriod).not.toHaveBeenCalled();
  });

  it('시작일이 바뀌면 오늘이 속한 회계월로 이동', async () => {
    setup(1);
    const s = useLedgerStore();
    await s.init();
    await s.goPrev();
    useSettingsStore().load({ accountingStartDay: 16, theme: 'macos', appearance: 'system' });
    await s.onStartDayChanged(1, 16);
    expect(s.viewMonth).toBe('2026-10');
    expect(s.selectedDate).toBe('2026-11-15');
    expect(s.activeTab).toBe('day');
  });

  it('자정이 지나면 오늘 갱신', async () => {
    setup();
    const s = useLedgerStore();
    await s.init();
    setNowProvider(kst('2026-11-16T00:01:00'));
    s.refreshToday();
    expect(s.today).toBe('2026-11-16');
    expect(s.viewMonth).toBe('2026-11');
    expect(s.selectedDate).toBe('2026-11-15');
  });

  it('추가 실패 시 false와 저장 실패 문구', async () => {
    setup();
    const s = useLedgerStore();
    await s.init();
    vi.mocked(api.addExpense).mockRejectedValue(new Error('boom'));
    const ok = await s.addExpense({ date: '2026-11-15', description: 'a', amount: 1, categoryId: 1 });
    expect(ok).toBe(false);
    expect(s.toast).toBe(MESSAGES.saveFailed);
    expect(s.saving).toBe(false);
    s.clearToast();
    expect(s.toast).toBeNull();
  });

  it('추가 성공 시 true와 다시 불러오기', async () => {
    setup();
    const s = useLedgerStore();
    await s.init();
    vi.mocked(api.addExpense).mockResolvedValue({} as never);
    vi.mocked(api.loadPeriod).mockClear();
    expect(await s.addExpense({ date: '2026-11-15', description: 'a', amount: 1, categoryId: 1 })).toBe(true);
    expect(api.loadPeriod).toHaveBeenCalledTimes(1);
  });

  it('무지출 거부 코드는 전용 문구', async () => {
    setup();
    const s = useLedgerStore();
    await s.init();
    vi.mocked(api.setNoExpenseDay).mockRejectedValue(new api.ApiError('day_has_expenses', ''));
    expect(await s.setNoExpense('2026-11-15', true)).toBe(false);
    expect(s.toast).toBe(MESSAGES.noExpenseBlocked);
  });

  it('메모 저장은 다시 불러오지 않고 로컬에 반영', async () => {
    setup();
    const s = useLedgerStore();
    await s.init();
    vi.mocked(api.saveNote).mockResolvedValue(undefined);
    vi.mocked(api.loadPeriod).mockClear();
    await s.saveNote(1, 'a');
    expect(api.saveNote).toHaveBeenCalledWith('2026-11', 1, 'a');
    expect(s.data.notes).toEqual([{ month: '2026-11', categoryId: 1, note: 'a' }]);
    await s.saveNote(1, 'b');
    expect(s.data.notes).toHaveLength(1);
    expect(s.data.notes[0].note).toBe('b');
    await s.saveNote(1, '  ');
    expect(s.data.notes).toEqual([]);
    expect(api.loadPeriod).not.toHaveBeenCalled();
  });

  it('refreshCategories는 카테고리를 교체한다', async () => {
    setup();
    const s = useLedgerStore();
    await s.init();
    vi.mocked(api.bootstrap).mockResolvedValue({
      settings: { accountingStartDay: 1, theme: 'macos', appearance: 'system' },
      categories: [...cats, { id: 2, name: '교통', color: '#B7D9FC' }],
      isFresh: false,
    });
    await s.refreshCategories();
    expect(s.categories).toHaveLength(2);
  });
  it('늦게 도착한 이전 달 응답은 버린다 (경합)', async () => {
    setup();
    const s = useLedgerStore();
    await s.init();
    const resolvers: ((d: PeriodData) => void)[] = [];
    vi.mocked(api.loadPeriod).mockImplementation(() => new Promise((r) => resolvers.push(r)));
    const p1 = s.goNext(); // 2026-12
    const p2 = s.goNext(); // 2027-01
    const exp = { id: 'x', date: '2026-12-01', description: 'old', amount: 1, categoryId: 1 };
    resolvers[1](EMPTY);
    await p2;
    resolvers[0]({ ...EMPTY, expenses: [exp] });
    await p1;
    expect(s.viewMonth).toBe('2027-01');
    expect(s.data.expenses).toEqual([]);
  });

  it('쓰기 성공 후 다시 불러오기 실패는 true와 reloadFailed', async () => {
    setup();
    const s = useLedgerStore();
    await s.init();
    vi.mocked(api.addExpense).mockResolvedValue({} as never);
    vi.mocked(api.loadPeriod).mockRejectedValue(new Error('net'));
    expect(await s.addExpense({ date: '2026-11-15', description: 'a', amount: 1, categoryId: 1 })).toBe(true);
    expect(s.toast).toBe(MESSAGES.reloadFailed);
    expect(s.saving).toBe(false);
  });

  it('init 중 일반 오류도 dbError로 알린다', async () => {
    setup();
    vi.mocked(api.bootstrap).mockRejectedValue(new Error('broken'));
    const s = useLedgerStore();
    await expect(s.init()).resolves.toBeUndefined();
    expect(s.dbError).toBe('broken');
    expect(s.ready).toBe(true);
  });

  it('쓰기 중 db_unavailable이면 dbError', async () => {
    setup();
    const s = useLedgerStore();
    await s.init();
    vi.mocked(api.deleteExpense).mockRejectedValue(new api.ApiError('db_unavailable', 'gone'));
    expect(await s.deleteExpense('x')).toBe(false);
    expect(s.dbError).toBe('gone');
  });
});
