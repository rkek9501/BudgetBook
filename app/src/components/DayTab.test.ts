import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import DayTab from './DayTab.vue';
import RightPanel from './RightPanel.vue';
import { useLedgerStore } from '@/stores/ledger';
import { MESSAGES } from '@/domain/messages';

const DATE = '2026-11-15';
const exp = (id: string, description: string, amount: number, categoryId = 1) => ({
  id, date: DATE, description, amount, categoryId,
});

function setup(expenses = [exp('e1', '점심', 12000), exp('e2', '버스', 1450, 2)], noExpenseDays: string[] = []) {
  setActivePinia(createPinia());
  const ledger = useLedgerStore();
  ledger.categories = [
    { id: 1, name: '식비', color: '#FCB9BA' },
    { id: 2, name: '교통', color: '#1F3A5F' },
  ];
  ledger.selectedDate = DATE;
  ledger.data = { expenses, noExpenseDays, notes: [], fixedAmounts: [] };
  const spies = {
    update: vi.spyOn(ledger, 'updateExpense').mockResolvedValue(true),
    del: vi.spyOn(ledger, 'deleteExpense').mockResolvedValue(true),
    noExp: vi.spyOn(ledger, 'setNoExpense').mockResolvedValue(true),
  };
  const w = mount(DayTab, { props: { date: DATE }, attachTo: document.body });
  return { ledger, w, ...spies };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('DayTab', () => {
  it('제목과 목록(입력 순서, 이름·금액)', () => {
    const { w } = setup();
    expect(w.find('.title').text()).toBe('11월 15일 (일)');
    const rows = w.findAll('.expense-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('점심');
    expect(rows[0].text()).toContain('식비');
    expect(rows[0].text()).toContain('12,000원');
    expect(rows[1].text()).toContain('1,450원');
  });

  it('지출 있으면 무지출 토글 비활성 + 안내', () => {
    const { w } = setup();
    expect((w.find('input[role="switch"]').element as HTMLInputElement).disabled).toBe(true);
    expect(w.text()).toContain(MESSAGES.noExpenseBlocked);
  });

  it('지출 없으면 토글 가능, 켜면 setNoExpense(date, true)', async () => {
    const { w, noExp } = setup([]);
    const sw = w.find('input[role="switch"]');
    expect((sw.element as HTMLInputElement).disabled).toBe(false);
    expect(w.text()).not.toContain(MESSAGES.noExpenseBlocked);
    await sw.setValue(true);
    expect(noExp).toHaveBeenCalledWith(DATE, true);
  });

  it('무지출인 날은 목록 대신 상태 문구, 폼은 유지', () => {
    const { w } = setup([], [DATE]);
    expect(w.text()).toContain('지출 없이 보낸 날이에요.');
    expect(w.find('.expense-form').exists()).toBe(true);
    expect((w.find('input[role="switch"]').element as HTMLInputElement).checked).toBe(true);
  });

  it('행 편집: Esc 취소, Enter 저장', async () => {
    const { w, update } = setup();
    await w.findAll('.expense-row .view')[0].trigger('click');
    const desc = w.find('.expense-row input[aria-label="내용"]');
    await desc.setValue('저녁');
    await desc.trigger('keydown', { key: 'Escape' });
    expect(update).not.toHaveBeenCalled();
    expect(w.find('.expense-row input[aria-label="내용"]').exists()).toBe(false);
    expect(w.findAll('.expense-row')[0].text()).toContain('점심');

    await w.findAll('.expense-row .view')[0].trigger('click');
    const d2 = w.find('.expense-row input[aria-label="내용"]');
    await d2.setValue('저녁');
    await d2.trigger('keydown', { key: 'Enter' });
    expect(update).toHaveBeenCalledWith({ id: 'e1', description: '저녁', amount: 12000, categoryId: 1 });
  });

  it('행 편집 금액 오류는 amountInvalidForEdit', async () => {
    const { w, update } = setup();
    await w.findAll('.expense-row .view')[0].trigger('click');
    const amount = w.find('.expense-row input[aria-label="금액"]');
    await amount.setValue('');
    await amount.trigger('keydown', { key: 'Enter' });
    expect(w.text()).toContain(MESSAGES.amountInvalidForEdit);
    expect(update).not.toHaveBeenCalled();
  });

  it('행 편집 금액 1000.5는 amountInvalidForEdit, 저장 안 함', async () => {
    const { w, update } = setup();
    await w.findAll('.expense-row .view')[0].trigger('click');
    const amount = w.find('.expense-row input[aria-label="금액"]');
    await amount.setValue('1000.5');
    expect((amount.element as HTMLInputElement).value).toBe('1000.5');
    await amount.trigger('keydown', { key: 'Enter' });
    expect(w.text()).toContain(MESSAGES.amountInvalidForEdit);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([{ isComposing: true }, { keyCode: 229 }])('행 편집 중 조합 Enter %j는 저장 안 함', async (init) => {
    const { w, update } = setup();
    await w.findAll('.expense-row .view')[0].trigger('click');
    const desc = w.find('.expense-row input[aria-label="내용"]');
    await desc.setValue('저녁');
    await desc.trigger('keydown', { key: 'Enter', ...init });
    expect(update).not.toHaveBeenCalled();
    expect(w.find('.expense-row input[aria-label="내용"]').exists()).toBe(true);
  });

  it('삭제 버튼 -> 확인창 -> 삭제, 취소하면 삭제 안 함', async () => {
    const { w, del } = setup();
    await w.findAll('button[aria-label="삭제"]')[0].trigger('click');
    const dlg = w.find('[role="alertdialog"]');
    expect(dlg.exists()).toBe(true);
    expect(dlg.text()).toContain(MESSAGES.confirmDeleteExpense);
    expect(document.activeElement?.textContent).toBe('취소');
    await dlg.trigger('keydown', { key: 'Escape' });
    expect(w.find('[role="alertdialog"]').exists()).toBe(false);
    expect(del).not.toHaveBeenCalled();

    await w.findAll('button[aria-label="삭제"]')[0].trigger('click');
    const buttons = w.findAll('[role="alertdialog"] button');
    await buttons[1].trigger('click');
    expect(del).toHaveBeenCalledWith('e1');
  });

  it('포커스된 행에서 Backspace는 삭제 확인창을 연다', async () => {
    const { w } = setup();
    await w.findAll('.expense-row')[1].trigger('keydown', { key: 'Backspace' });
    expect(w.find('[role="alertdialog"]').exists()).toBe(true);
  });
});

describe('RightPanel', () => {
  it('탭 라벨과 연결, 날짜 없으면 안내', async () => {
    setActivePinia(createPinia());
    const ledger = useLedgerStore();
    ledger.viewMonth = '2026-11';
    ledger.selectedDate = DATE;
    const w = mount(RightPanel);
    const tabs = w.findAll('[role="tab"]');
    expect(tabs.map((t) => t.text())).toEqual(['11월 15일', '11월 요약']);
    expect(tabs[0].attributes('aria-selected')).toBe('true');
    await tabs[1].trigger('click');
    expect(ledger.activeTab).toBe('summary');
    await tabs[0].trigger('click');
    ledger.selectedDate = null;
    await w.vm.$nextTick();
    expect(w.findAll('[role="tab"]')[0].text()).toBe('날짜');
    expect(w.text()).toContain('달력에서 날짜를 고르세요.');
  });
});
