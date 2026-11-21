import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import DayCell from './DayCell.vue';
import type { DayCellData } from '@/domain/summary';
import type { Category } from '@/domain/types';

const cats: Category[] = [
  { id: 1, name: '식비', color: '#FCB9BA' },
  { id: 2, name: '교통', color: '#1F3A5F' },
];
const exp = (i: number, categoryId = 1) => ({
  id: `e${i}`, date: '2026-11-15', description: `내역${i}`, amount: 1000 * i, categoryId,
});
const cell = (n: number, extra: Partial<DayCellData> = {}): DayCellData => {
  const expenses = Array.from({ length: n }, (_, i) => exp(i + 1));
  return { date: '2026-11-15', expenses, total: expenses.reduce((s, e) => s + e.amount, 0), noExpense: false, ...extra };
};
const mountCell = (c: DayCellData, p: { isToday?: boolean; isSelected?: boolean } = {}) =>
  mount(DayCell, { props: { cell: c, categories: cats, isToday: false, isSelected: false, ...p } });

let trigger: ((h: number) => void) | null = null;
function mockRO() {
  vi.stubGlobal('ResizeObserver', class {
    cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) { this.cb = cb; trigger = (h) => this.cb([{ contentRect: { height: h } } as ResizeObserverEntry], this as never); }
    observe() {}
    disconnect() {}
    unobserve() {}
  });
}

afterEach(() => { vi.unstubAllGlobals(); trigger = null; });

describe('DayCell', () => {
  it('칩 4개, 높이 부족 → 3개와 "+1건"', async () => {
    mockRO();
    const w = mountCell(cell(4));
    trigger!(22 * 3 + 18); // 칩 3개 + 더보기 줄
    await w.vm.$nextTick();
    expect(w.findAll('.chip')).toHaveLength(3);
    expect(w.find('.more').text()).toBe('+1건');
  });

  it('높이가 충분하면 전부 보이고 +N건 없음', async () => {
    mockRO();
    const w = mountCell(cell(4));
    trigger!(200);
    await w.vm.$nextTick();
    expect(w.findAll('.chip')).toHaveLength(4);
    expect(w.find('.more').exists()).toBe(false);
  });

  it('ResizeObserver가 없으면 전부 표시', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const w = mountCell(cell(5));
    expect(w.findAll('.chip')).toHaveLength(5);
  });

  it('칩 색: 카테고리 배경, 대비 글자색', () => {
    const c = cell(0);
    c.expenses = [exp(1, 1), exp(2, 2)];
    const chips = mountCell(c).findAll('.chip');
    expect(chips[0].attributes('style')).toMatch(/[^-]color: (#000000|rgb\(0, 0, 0\))/i);
    expect(chips[1].attributes('style')).toMatch(/[^-]color: (#ffffff|rgb\(255, 255, 255\))/i);
  });

  it('무지출이면 도장만, 합계 없음; 오늘·선택 클래스', () => {
    const w = mountCell({ date: '2026-11-15', expenses: [], total: 0, noExpense: true }, { isToday: true, isSelected: true });
    expect(w.find('.stamp').exists()).toBe(true);
    expect(w.find('.chip').exists()).toBe(false);
    expect(w.find('.total').exists()).toBe(false);
    expect(w.classes()).toContain('today');
    expect(w.classes()).toContain('selected');
    expect(w.attributes('aria-label')).toBe('11월 15일, 무지출');
  });

  it('합계 표시와 aria-label, 0이면 합계 숨김', () => {
    const w = mountCell(cell(2));
    expect(w.find('.head .total').text()).toBe('3,000원');
    expect(w.attributes('aria-label')).toBe('11월 15일, 지출 3,000원');
    expect(mountCell(cell(0)).find('.total').exists()).toBe(false);
  });

  it('일요일·토요일 숫자 클래스', () => {
    expect(mountCell(cell(0)).find('.day-num').classes()).toContain('sun'); // 2026-11-15 일요일
    expect(mountCell({ ...cell(0), date: '2026-11-21' }).find('.day-num').classes()).toContain('sat');
  });
});
