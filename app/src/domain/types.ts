export type DateStr = string; // 'YYYY-MM-DD'
export type MonthStr = string; // 'YYYY-MM'
export interface Category { id: number; name: string; color: string } // '#RRGGBB'
export interface Expense { id: string; date: DateStr; description: string; amount: number; categoryId: number }
export interface CategoryNote { month: MonthStr; categoryId: number; note: string }
export interface FixedItem { id: string; name: string; sortOrder: number }
export interface FixedAmount { itemId: string; month: MonthStr; amount: number }
export interface Period { start: DateStr; end: DateStr }
export type Theme = 'macos' | 'diary' | 'mono';
export type Appearance = 'system' | 'light' | 'dark';
export interface Settings { accountingStartDay: number; theme: Theme; appearance: Appearance }
