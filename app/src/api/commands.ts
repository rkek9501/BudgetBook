import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  Category,
  CategoryNote,
  DateStr,
  Expense,
  FixedAmount,
  FixedItem,
  MonthStr,
  Settings,
} from '../domain/types';
import type { ImportPayload } from '../domain/importWindows';

export type { ImportPayload };

// Response/request shapes mirror src-tauri/src/models.rs (camelCase).
export interface PeriodData {
  expenses: Expense[];
  noExpenseDays: DateStr[];
  notes: CategoryNote[];
  fixedAmounts: FixedAmount[];
}
export interface Bootstrap { settings: Settings; categories: Category[]; isFresh: boolean }
export interface DbStatus { ok: boolean; error: string | null; backupError: string | null }
export interface NewCategory { name: string; color: string }
export interface NewExpense { date: DateStr; description: string; amount: number; categoryId: number }
export interface ExpenseUpdate { id: string; description: string; amount: number; categoryId: number }
export interface CategoryUsage { expenseCount: number; noteCount: number }
export interface FixedData { items: FixedItem[]; amounts: FixedAmount[] }
export interface BackupInfo { fileName: string; createdAt: string; expenseCount: number }
export interface ImportResult {
  categories: number;
  expenses: number;
  noExpenseDays: number;
  fixedItems: number;
  notes: number;
}

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'string') {
    const { code, message } = e as { code: string; message?: unknown };
    return new ApiError(code, typeof message === 'string' ? message : '');
  }
  return new ApiError('unknown', typeof e === 'string' ? e : e instanceof Error ? e.message : String(e));
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw toApiError(e);
  }
}

export const dbStatus = () => call<DbStatus>('db_status');
export const retryOpen = () => call<DbStatus>('retry_open');
export const runDailyBackup = () => call<void>('run_daily_backup');
export const bootstrap = () => call<Bootstrap>('bootstrap');
export const seedDefaultCategories = (categories: NewCategory[]) =>
  call<Category[]>('seed_default_categories', { categories });
export const loadPeriod = (start: DateStr, end: DateStr, month: MonthStr) =>
  call<PeriodData>('load_period', { start, end, month });
export const addExpense = (input: NewExpense) => call<Expense>('add_expense', { input });
export const updateExpense = (input: ExpenseUpdate) => call<Expense>('update_expense', { input });
export const deleteExpense = (id: string) => call<void>('delete_expense', { id });
export const setNoExpenseDay = (date: DateStr, on: boolean) =>
  call<void>('set_no_expense_day', { date, on });
export const createCategory = (name: string, color: string) =>
  call<Category>('create_category', { name, color });
export const updateCategory = (id: number, name: string, color: string) =>
  call<Category>('update_category', { id, name, color });
export const categoryUsage = (id: number) => call<CategoryUsage>('category_usage', { id });
export const deleteCategory = (id: number, moveTo: number | null) =>
  call<void>('delete_category', { id, moveTo });
export const saveNote = (month: MonthStr, categoryId: number, note: string) =>
  call<void>('save_note', { month, categoryId, note });
export const loadFixed = () => call<FixedData>('load_fixed');
export const saveFixed = (items: FixedItem[], amounts: FixedAmount[]) =>
  call<void>('save_fixed', { items, amounts });
export const setSetting = (key: string, value: string) => call<void>('set_setting', { key, value });
export const listBackups = () => call<BackupInfo[]>('list_backups');
export const restoreBackup = (fileName: string) => call<void>('restore_backup', { fileName });
export const openBackupFolder = () => call<void>('open_backup_folder');
export const readTextFile = (path: string) => call<string>('read_text_file', { path });
export const importReplaceAll = (payload: ImportPayload) =>
  call<ImportResult>('import_replace_all', { payload });
export const exportJson = (path: string) => call<void>('export_json', { path });

export function onMenu(handler: (id: string) => void): Promise<() => void> {
  return listen<string>('menu', (e) => handler(e.payload));
}
