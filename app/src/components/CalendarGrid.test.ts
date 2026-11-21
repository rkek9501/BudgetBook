import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { useLedgerStore } from '@/stores/ledger';
import CalendarGrid from './CalendarGrid.vue';

function setup(sel: string | null = null) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const ledger = useLedgerStore();
  ledger.categories = [{ id: 1, name: '식비', color: '#FCB9BA' }];
  ledger.today = '2026-11-15';
  ledger.viewMonth = '2026-11';
  ledger.period = { start: '2026-10-25', end: '2026-11-24' };
  ledger.selectedDate = sel;
  const w = mount(CalendarGrid, { global: { plugins: [pinia] } });
  return { w, ledger };
}

describe('CalendarGrid', () => {
  it('시작일 25, 2026-11: 첫 칸 25가 일요일 열, 31칸, 5행', () => {
    const { w } = setup();
    const cells = w.findAll('.day-cell');
    expect(cells).toHaveLength(31);
    expect(w.findAll('.week-row')).toHaveLength(5);
    expect(w.findAll('.weekday').map((e) => e.text())).toEqual(['일', '월', '화', '수', '목', '금', '토']);
    // 2026-10-25는 일요일 → 빈칸 없음
    expect(w.find('.week-row').findAll('.blank')).toHaveLength(0);
    expect(cells[0].attributes('aria-label')).toContain('10월 25일');
  });

  it('날짜 클릭 → select(date)', async () => {
    const { w, ledger } = setup();
    await w.findAll('.day-cell')[3].trigger('click');
    expect(ledger.selectedDate).toBe('2026-10-28');
  });

  it('방향키 → 기간 안에서만 이동', async () => {
    const { w, ledger } = setup('2026-10-25');
    const grid = w.find('.grid');
    expect(grid.attributes('tabindex')).toBe('0');
    await grid.trigger('keydown', { key: 'ArrowLeft' });
    expect(ledger.selectedDate).toBe('2026-10-25');
    await grid.trigger('keydown', { key: 'ArrowRight' });
    expect(ledger.selectedDate).toBe('2026-10-26');
    await grid.trigger('keydown', { key: 'ArrowDown' });
    expect(ledger.selectedDate).toBe('2026-11-02');
    await grid.trigger('keydown', { key: 'ArrowUp' });
    expect(ledger.selectedDate).toBe('2026-10-26');
    ledger.selectedDate = '2026-11-24';
    await grid.trigger('keydown', { key: 'ArrowRight' });
    expect(ledger.selectedDate).toBe('2026-11-24');
    await grid.trigger('keydown', { key: 'ArrowDown' });
    expect(ledger.selectedDate).toBe('2026-11-24');
  });

  it('선택이 없으면 오늘(기간 안)에서 시작, ⌘+방향키는 무시', async () => {
    const { w, ledger } = setup(null);
    await w.find('.grid').trigger('keydown', { key: 'ArrowRight' });
    expect(ledger.selectedDate).toBe('2026-11-16');
    await w.find('.grid').trigger('keydown', { key: 'ArrowRight', metaKey: true });
    expect(ledger.selectedDate).toBe('2026-11-16');
  });

  it('오늘·선택 표시', () => {
    const { w } = setup('2026-11-20');
    expect(w.findAll('.day-cell.today')).toHaveLength(1);
    expect(w.findAll('.day-cell.selected')).toHaveLength(1);
  });
});
