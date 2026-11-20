import { TZDate } from '@date-fns/tz';
import type { DateStr, MonthStr } from './types';

let nowProvider: () => number = Date.now;

/** 테스트용: "지금" 시각 공급자를 바꾼다. 기본값은 Date.now. */
export function setNowProvider(fn: () => number): void {
  nowProvider = fn;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function parseDate(d: DateStr): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

function fromMs(ms: number): DateStr {
  const t = new Date(ms);
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

function parseMonth(m: MonthStr): [number, number] {
  const [y, mo] = m.split('-').map(Number);
  return [y, mo];
}

export function todayKst(): DateStr {
  const t = new TZDate(nowProvider(), 'Asia/Seoul');
  return `${pad(t.getFullYear(), 4)}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

export function addDays(d: DateStr, n: number): DateStr {
  return fromMs(parseDate(d) + n * 86_400_000);
}

export function addMonths(m: MonthStr, n: number): MonthStr {
  const [y, mo] = parseMonth(m);
  const idx = y * 12 + (mo - 1) + n;
  return `${pad(Math.floor(idx / 12), 4)}-${pad((idx % 12 + 12) % 12 + 1)}`;
}

export function daysInMonth(m: MonthStr): number {
  const [y, mo] = parseMonth(m);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

export function weekday(d: DateStr): number {
  return new Date(parseDate(d)).getUTCDay();
}

export function monthOf(d: DateStr): MonthStr {
  return d.slice(0, 7);
}

export function formatMonthTitle(m: MonthStr): string {
  const [y, mo] = parseMonth(m);
  return `${y}년 ${mo}월`;
}

export function formatDateLong(d: DateStr): string {
  const [y, mo, day] = d.split('-').map(Number);
  return `${y}년 ${mo}월 ${day}일`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function formatDayTitle(d: DateStr): string {
  const [, mo, day] = d.split('-').map(Number);
  return `${mo}월 ${day}일 (${WEEKDAYS[weekday(d)]})`;
}
