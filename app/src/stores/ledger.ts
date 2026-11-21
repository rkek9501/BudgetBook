import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import * as api from '@/api/commands';
import type { ExpenseUpdate, NewExpense, PeriodData } from '@/api/commands';
import { DEFAULT_CATEGORIES, sortCategories } from '@/domain/categories';
import { addMonths, todayKst } from '@/domain/dates';
import { MESSAGES } from '@/domain/messages';
import { accountMonthOf, accountPeriod } from '@/domain/period';
import { buildDayCells, buildMonthSummary } from '@/domain/summary';
import type { Category, DateStr, MonthStr, Period } from '@/domain/types';
import { useSettingsStore } from './settings';

export function messageForError(e: unknown): string {
  const code = e instanceof Error ? (e as { code?: unknown }).code : undefined;
  switch (code) {
    case 'day_has_expenses':
      return MESSAGES.noExpenseBlocked;
    case 'last_category':
      return MESSAGES.lastCategory;
    case 'duplicate_name':
      return MESSAGES.categoryDuplicate;
    default:
      return MESSAGES.saveFailed;
  }
}

const emptyData = (): PeriodData => ({ expenses: [], noExpenseDays: [], notes: [], fixedAmounts: [] });

export const useLedgerStore = defineStore('ledger', () => {
  const settings = useSettingsStore();

  const ready = ref(false);
  const dbError = ref<string | null>(null);
  const categories = ref<Category[]>([]);
  const today = ref<DateStr>(todayKst());
  const viewMonth = ref<MonthStr>(accountMonthOf(today.value, settings.accountingStartDay));
  const period = ref<Period>(accountPeriod(viewMonth.value, settings.accountingStartDay));
  const selectedDate = ref<DateStr | null>(null);
  const activeTab = ref<'day' | 'summary'>('day');
  const data = ref<PeriodData>(emptyData());
  const toast = ref<string | null>(null);
  const saving = ref(false);
  const focusTick = ref(0);
  const focusPending = ref(false);

  const sortedCategories = computed(() => sortCategories(categories.value));
  const dayCells = computed(() =>
    buildDayCells(period.value, data.value.expenses, data.value.noExpenseDays, categories.value),
  );
  const summary = computed(() =>
    buildMonthSummary({
      period: period.value,
      month: viewMonth.value,
      categories: categories.value,
      expenses: data.value.expenses,
      noExpenseDays: data.value.noExpenseDays,
      notes: data.value.notes,
      fixedAmounts: data.value.fixedAmounts,
    }),
  );

  const recomputePeriod = () => {
    period.value = accountPeriod(viewMonth.value, settings.accountingStartDay);
  };

  function failDb(e: unknown): boolean {
    if (e instanceof Error && (e as { code?: unknown }).code === 'db_unavailable') {
      dbError.value = e.message || 'db_unavailable';
      return true;
    }
    return false;
  }

  // 늦게 도착한 이전 요청이 새 데이터를 덮어쓰지 않도록 요청 번호로 걸러낸다.
  let reloadSeq = 0;
  async function reload() {
    const seq = ++reloadSeq;
    const result = await api.loadPeriod(period.value.start, period.value.end, viewMonth.value);
    if (seq === reloadSeq) data.value = result;
  }

  // 화면 이동처럼 호출자가 오류를 받지 않는 곳에서 쓴다.
  async function reloadQuietly() {
    try {
      await reload();
    } catch (e) {
      if (!failDb(e)) toast.value = MESSAGES.loadFailed;
    }
  }

  async function init() {
    dbError.value = null;
    try {
      const status = await api.dbStatus();
      if (!status.ok) {
        dbError.value = status.error ?? 'unknown';
        return;
      }
      if (status.backupError) toast.value = MESSAGES.backupFailed;
      const boot = await api.bootstrap();
      settings.load(boot.settings);
      categories.value = boot.isFresh
        ? await api.seedDefaultCategories(DEFAULT_CATEGORIES)
        : boot.categories;
      today.value = todayKst();
      viewMonth.value = accountMonthOf(today.value, settings.accountingStartDay);
      recomputePeriod();
      selectedDate.value = today.value;
      activeTab.value = 'day';
      await reload();
    } catch (e) {
      if (!failDb(e)) dbError.value = (e instanceof Error && e.message) || 'unknown';
    } finally {
      ready.value = true;
    }
  }

  async function refreshCategories() {
    try {
      categories.value = (await api.bootstrap()).categories;
    } catch (e) {
      if (!failDb(e)) throw e;
    }
  }

  async function shiftMonth(n: number) {
    viewMonth.value = addMonths(viewMonth.value, n);
    recomputePeriod();
    const d = selectedDate.value;
    if (d !== null && (d < period.value.start || d > period.value.end)) {
      selectedDate.value = null;
      activeTab.value = 'summary';
    }
    await reloadQuietly();
  }
  const goPrev = () => shiftMonth(-1);
  const goNext = () => shiftMonth(1);

  async function goToday() {
    today.value = todayKst();
    viewMonth.value = accountMonthOf(today.value, settings.accountingStartDay);
    recomputePeriod();
    selectedDate.value = today.value;
    activeTab.value = 'day';
    await reloadQuietly();
  }

  function select(date: DateStr) {
    selectedDate.value = date;
    activeTab.value = 'day';
  }

  function setTab(t: 'day' | 'summary') {
    activeTab.value = t;
  }

  // 날짜가 바뀌었으면 today만 갱신한다. 보던 달은 움직이지 않는다.
  // 날짜가 바뀐 순간에는 그날 자동 백업도 요청한다. 예외는 던지지 않는다.
  async function refreshToday() {
    if (dbError.value !== null) return;
    const t = todayKst();
    if (t === today.value) return;
    today.value = t;
    try {
      await api.runDailyBackup();
    } catch (e) {
      if (!failDb(e)) toast.value = MESSAGES.backupFailed;
    }
  }

  async function onStartDayChanged(oldDay: number, newDay: number) {
    if (oldDay === newDay) return;
    viewMonth.value = accountMonthOf(today.value, newDay);
    period.value = accountPeriod(viewMonth.value, newDay);
    selectedDate.value = today.value;
    activeTab.value = 'day';
    await reloadQuietly();
  }

  async function write(fn: () => Promise<unknown>): Promise<boolean> {
    saving.value = true;
    try {
      await fn();
    } catch (e) {
      if (!failDb(e)) toast.value = messageForError(e);
      saving.value = false;
      return false;
    }
    try {
      await reload();
    } catch (e) {
      // 쓰기는 이미 저장됐다. 다시 시도하면 중복되므로 true를 돌려준다.
      if (!failDb(e)) toast.value = MESSAGES.reloadFailed;
    } finally {
      saving.value = false;
    }
    return true;
  }

  const addExpense = (input: NewExpense) => write(() => api.addExpense(input));
  const updateExpense = (u: ExpenseUpdate) => write(() => api.updateExpense(u));
  const deleteExpense = (id: string) => write(() => api.deleteExpense(id));
  const setNoExpense = (date: DateStr, on: boolean) => write(() => api.setNoExpenseDay(date, on));

  // 입력 중인 텍스트 영역을 흔들지 않도록 다시 불러오지 않고 로컬만 갱신한다.
  // month는 메모를 입력한 달이다. 보는 달이 바뀐 뒤에도 입력한 달에 저장한다.
  async function saveNote(
    categoryId: number,
    note: string,
    month: MonthStr = viewMonth.value,
  ): Promise<boolean> {
    try {
      await api.saveNote(month, categoryId, note);
    } catch (e) {
      if (!failDb(e)) toast.value = messageForError(e);
      return false;
    }
    if (viewMonth.value !== month) return true;
    const rest = data.value.notes.filter((n) => !(n.month === month && n.categoryId === categoryId));
    data.value = {
      ...data.value,
      notes: note.trim() === '' ? rest : [...rest, { month, categoryId, note }],
    };
    return true;
  }

  function requestDescriptionFocus() {
    focusPending.value = true;
    focusTick.value += 1;
  }

  function clearToast() {
    toast.value = null;
  }

  return {
    ready, dbError, categories, viewMonth, period, selectedDate, activeTab, data, today, toast, saving, focusTick, focusPending,
    sortedCategories, dayCells, summary,
    init, reload, failDb, refreshCategories, goPrev, goNext, goToday, select, setTab, refreshToday,
    onStartDayChanged, addExpense, updateExpense, deleteExpense, setNoExpense, saveNote, clearToast,
    requestDescriptionFocus,
  };
});
