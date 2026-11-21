import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
vi.mock('@/api/commands', async (orig) => ({
  ...(await orig<object>()),
  loadPeriod: vi.fn(async () => ({ expenses: [], noExpenseDays: [], notes: [], fixedAmounts: [] })),
}));

import SummaryTab from './SummaryTab.vue';
import RightPanel from './RightPanel.vue';
import { useLedgerStore } from '@/stores/ledger';
import { MESSAGES } from '@/domain/messages';

function setup(empty = false) {
  setActivePinia(createPinia());
  const ledger = useLedgerStore();
  ledger.categories = [
    { id: 1, name: '식비', color: '#FCB9BA' },
    { id: 2, name: '교통', color: '#1F3A5F' },
  ];
  ledger.viewMonth = '2026-11';
  ledger.period = { start: '2026-11-01', end: '2026-11-30' };
  ledger.data = empty
    ? { expenses: [], noExpenseDays: [], notes: [], fixedAmounts: [] }
    : {
        expenses: [
          { id: 'a', date: '2026-11-03', description: '점심', amount: 50000, categoryId: 1 },
          { id: 'b', date: '2026-11-04', description: '버스', amount: 1450, categoryId: 2 },
        ],
        noExpenseDays: ['2026-11-05'],
        notes: [{ month: '2026-11', categoryId: 1, note: '기존' }],
        fixedAmounts: [{ month: '2026-11', itemId: 'f1', amount: 555000 }],
      };
  const save = vi.spyOn(ledger, 'saveNote').mockResolvedValue(true);
  const w = mount(SummaryTab, { attachTo: document.body });
  return { ledger, w, save };
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('SummaryTab', () => {
  it('행·합계·무지출 횟수 표기 (51,450 / 555,000 / 606,450 / 1회)', () => {
    const { w } = setup();
    const t = w.text();
    expect(t).toContain('2026년 11월 1일 ~ 2026년 11월 30일');
    expect(t).toContain('50,000원');
    expect(t).toContain('1,450원');
    expect(t).toContain('51,450원');
    expect(t).toContain('555,000원');
    expect(t).toContain('606,450원');
    expect(t).toContain('무지출 데이 1회');
  });

  it('행이 없으면 빈 달 문구', () => {
    const { w } = setup(true);
    expect(w.text()).toContain(MESSAGES.emptyMonth);
  });

  it('메모는 하나만 펼쳐짐', async () => {
    const { w } = setup();
    const rows = () => w.findAll('button.category-row');
    await rows()[0].trigger('click');
    expect(rows()[0].attributes('aria-expanded')).toBe('true');
    expect(w.findAll('textarea')).toHaveLength(1);
    await rows()[1].trigger('click');
    expect(rows()[0].attributes('aria-expanded')).toBe('false');
    expect(rows()[1].attributes('aria-expanded')).toBe('true');
    expect(w.findAll('textarea')).toHaveLength(1);
    expect(w.find('textarea').attributes('aria-label')).toBe('교통 메모');
  });

  it('메모 디바운스: 연속 입력 후 500ms에 1회 저장', async () => {
    const { w, save } = setup();
    await w.findAll('button.category-row')[0].trigger('click');
    const ta = w.find('textarea');
    expect((ta.element as HTMLTextAreaElement).value).toBe('기존');
    await ta.setValue('가');
    vi.advanceTimersByTime(300);
    await ta.setValue('가나');
    vi.advanceTimersByTime(499);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(1, '가나', '2026-11');
  });

  it('접으면 대기 중인 저장을 즉시 실행', async () => {
    const { w, save } = setup();
    const row = w.findAll('button.category-row')[0];
    await row.trigger('click');
    await w.find('textarea').setValue('새 메모');
    await row.trigger('click');
    expect(save).toHaveBeenCalledWith(1, '새 메모', '2026-11');
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('포커스를 잃으면 즉시 저장', async () => {
    const { w, save } = setup();
    await w.findAll('button.category-row')[0].trigger('click');
    const ta = w.find('textarea');
    await ta.setValue('abc');
    await ta.trigger('blur');
    expect(save).toHaveBeenCalledWith(1, 'abc', '2026-11');
  });

  it('달이 바뀌면 입력한 달로 즉시 저장하고 접음', async () => {
    const { ledger, w, save } = setup();
    await w.findAll('button.category-row')[0].trigger('click');
    await w.find('textarea').setValue('A달 메모');
    ledger.viewMonth = '2026-12';
    await flushPromises();
    expect(save).toHaveBeenCalledWith(1, 'A달 메모', '2026-11');
    expect(w.find('textarea').exists()).toBe(false);
  });

  it('입력 직후 다음 달로 이동해도(기간·행 변경) 입력한 달로 한 번 저장', async () => {
    const { ledger, w, save } = setup();
    await w.findAll('button.category-row')[0].trigger('click');
    await w.find('textarea').setValue('이동 전 메모');
    await ledger.goNext();
    await flushPromises();
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(1, '이동 전 메모', '2026-11');
  });

  it('입력 직후 오늘로 이동해도 입력한 달로 한 번 저장', async () => {
    vi.setSystemTime(new Date('2026-11-21T03:00:00Z'));
    const { ledger, w, save } = setup();
    ledger.viewMonth = '2026-10';
    ledger.period = { start: '2026-10-01', end: '2026-10-31' };
    ledger.data = {
      expenses: [{ id: 'z', date: '2026-10-03', description: '점심', amount: 100, categoryId: 1 }],
      noExpenseDays: [],
      notes: [],
      fixedAmounts: [],
    };
    await flushPromises();
    await w.findAll('button.category-row')[0].trigger('click');
    await w.find('textarea').setValue('10월 메모');
    await ledger.goToday();
    await flushPromises();
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(1, '10월 메모', '2026-10');
  });

  it('언마운트 시 대기 중인 저장을 실행', async () => {
    const { w, save } = setup();
    await w.findAll('button.category-row')[0].trigger('click');
    await w.find('textarea').setValue('bye');
    w.unmount();
    expect(save).toHaveBeenCalledWith(1, 'bye', '2026-11');
  });

  it('저장 중 새 입력이 있어도 마지막 값이 마지막에 저장', async () => {
    const { w, save } = setup();
    const order: string[] = [];
    let release!: () => void;
    save.mockImplementationOnce(async (_c, note) => {
      order.push(note);
      await new Promise<void>((r) => (release = r));
      return true;
    });
    save.mockImplementation(async (_c, note) => {
      order.push(note);
      return true;
    });
    await w.findAll('button.category-row')[0].trigger('click');
    const ta = w.find('textarea');
    await ta.setValue('1');
    vi.advanceTimersByTime(500);
    await ta.setValue('12');
    vi.advanceTimersByTime(500);
    expect(order).toEqual(['1']);
    release();
    await flushPromises();
    expect(order).toEqual(['1', '12']);
  });

  it('메모만 있는 행: 비워도 디바운스로는 저장하지 않고 행 유지, 접으면 빈 저장', async () => {
    const { ledger, w, save } = setup();
    ledger.data = { ...ledger.data, expenses: [ledger.data.expenses[1]] };
    await w.vm.$nextTick();
    const row = w.findAll('button.category-row')[0];
    expect(row.text()).toContain('식비');
    await row.trigger('click');
    await w.find('textarea').setValue('');
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
    expect(w.find('textarea').exists()).toBe(true);
    await row.trigger('click');
    expect(save).toHaveBeenCalledWith(1, '', '2026-11');
  });

  it('펼친 행이 사라지면 펼침 상태 해제', async () => {
    const { ledger, w } = setup();
    ledger.data = { ...ledger.data, expenses: [ledger.data.expenses[1]] };
    await w.vm.$nextTick();
    await w.findAll('button.category-row')[0].trigger('click');
    ledger.data = { ...ledger.data, notes: [] };
    await w.vm.$nextTick();
    expect(w.find('textarea').exists()).toBe(false);
    ledger.data = { ...ledger.data, notes: [{ month: '2026-11', categoryId: 1, note: '다시' }] };
    await w.vm.$nextTick();
    expect(w.find('textarea').exists()).toBe(false);
  });

  it('저장 실패하면 접을 때 같은 글로 다시 저장', async () => {
    const { w, save } = setup();
    save.mockResolvedValueOnce(false);
    const row = w.findAll('button.category-row')[0];
    await row.trigger('click');
    await w.find('textarea').setValue('실패글');
    vi.advanceTimersByTime(500);
    await flushPromises();
    expect(save).toHaveBeenCalledTimes(1);
    await row.trigger('click');
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(1, '실패글', '2026-11');
  });

  it('고정 지출 카드 클릭 → open-fixed', async () => {
    const { w } = setup();
    await w.find('button.fixed-card').trigger('click');
    expect(w.emitted('open-fixed')).toHaveLength(1);
    expect(w.find('button.fixed-card').text()).toContain('고정 지출');
  });
});

describe('RightPanel 요약', () => {
  it('요약 탭에서 open-fixed를 다시 내보냄', async () => {
    setActivePinia(createPinia());
    const ledger = useLedgerStore();
    ledger.activeTab = 'summary';
    const w = mount(RightPanel);
    await w.find('button.fixed-card').trigger('click');
    expect(w.emitted('open-fixed')).toHaveLength(1);
  });
});
