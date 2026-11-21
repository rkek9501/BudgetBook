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

  async function reload() {
    data.value = await api.loadPeriod(period.value.start, period.value.end, viewMonth.value);
  }

  async function init() {
    try {
      const status = await api.dbStatus();
      if (!status.ok) {
        dbError.value = status.error ?? 'unknown';
        return;
      }
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
      if (!failDb(e)) throw e;
    } finally {
      ready.value = true;
    }
  }

  async function refreshCategories() {
    categories.value = (await api.bootstrap()).categories;
  }

  async function shiftMonth(n: number) {
    viewMonth.value = addMonths(viewMonth.value, n);
    recomputePeriod();
    const d = selectedDate.value;
    if (d !== null && (d < period.value.start || d > period.value.end)) {
      selectedDate.value = null;
      activeTab.value = 'summary';
    }
    await reload();
  }
  const goPrev = () => shiftMonth(-1);
  const goNext = () => shiftMonth(1);

  async function goToday() {
    today.value = todayKst();
    viewMonth.value = accountMonthOf(today.value, settings.accountingStartDay);
    recomputePeriod();
    selectedDate.value = today.value;
    activeTab.value = 'day';
    await reload();
  }

  function select(date: DateStr) {
    selectedDate.value = date;
    activeTab.value = 'day';
  }

  function setTab(t: 'day' | 'summary') {
    activeTab.value = t;
  }

  // 날짜가 바뀌었으면 today만 갱신한다. 보던 달은 움직이지 않는다.
  function refreshToday() {
    const t = todayKst();
    if (t !== today.value) today.value = t;
  }

  async function onStartDayChanged(oldDay: number, newDay: number) {
    if (oldDay === newDay) return;
    viewMonth.value = accountMonthOf(today.value, newDay);
    period.value = accountPeriod(viewMonth.value, newDay);
    selectedDate.value = today.value;
    activeTab.value = 'day';
    await reload();
  }

  async function write(fn: () => Promise<unknown>): Promise<boolean> {
    saving.value = true;
    try {
      await fn();
      await reload();
      return true;
    } catch (e) {
      toast.value = messageForError(e);
      return false;
    } finally {
      saving.value = false;
    }
  }

  const addExpense = (input: NewExpense) => write(() => api.addExpense(input));
  const updateExpense = (u: ExpenseUpdate) => write(() => api.updateExpense(u));
  const deleteExpense = (id: string) => write(() => api.deleteExpense(id));
  const setNoExpense = (date: DateStr, on: boolean) => write(() => api.setNoExpenseDay(date, on));

  // 입력 중인 텍스트 영역을 흔들지 않도록 다시 불러오지 않고 로컬만 갱신한다.
  async function saveNote(categoryId: number, note: string): Promise<boolean> {
    const month = viewMonth.value;
    try {
      await api.saveNote(month, categoryId, note);
    } catch (e) {
      toast.value = messageForError(e);
      return false;
    }
    const rest = data.value.notes.filter((n) => !(n.month === month && n.categoryId === categoryId));
    data.value = {
      ...data.value,
      notes: note.trim() === '' ? rest : [...rest, { month, categoryId, note }],
    };
    return true;
  }

  function clearToast() {
    toast.value = null;
  }

  return {
    ready, dbError, categories, viewMonth, period, selectedDate, activeTab, data, today, toast, saving,
    sortedCategories, dayCells, summary,
    init, reload, refreshCategories, goPrev, goNext, goToday, select, setTab, refreshToday,
    onStartDayChanged, addExpense, updateExpense, deleteExpense, setNoExpense, saveNote, clearToast,
  };
});
