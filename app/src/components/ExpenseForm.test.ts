import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ExpenseForm from './ExpenseForm.vue';
import { useLedgerStore } from '@/stores/ledger';
import { MESSAGES } from '@/domain/messages';

function setup(withCategories = true) {
  setActivePinia(createPinia());
  const ledger = useLedgerStore();
  if (withCategories) {
    ledger.categories = [
      { id: 1, name: '식비', color: '#FCB9BA' },
      { id: 2, name: '교통', color: '#1F3A5F' },
    ];
  }
  const add = vi.spyOn(ledger, 'addExpense').mockResolvedValue(true);
  const w = mount(ExpenseForm, { props: { date: '2026-11-15' }, attachTo: document.body });
  const inputs = () => w.findAll('input');
  return { ledger, add, w, desc: () => inputs()[0], amount: () => inputs()[1], select: () => w.find('select') };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('ExpenseForm', () => {
  it('검증 문구: 내용 없음/금액 abc/음수/분류 없음', async () => {
    const { w, add, desc, amount } = setup();
    await w.find('button.add').trigger('click');
    expect(w.text()).toContain(MESSAGES.descriptionRequired);
    expect(w.text()).toContain(MESSAGES.amountInvalid);

    await desc().setValue('점심');
    await amount().setValue('abc'); // 숫자만 남기므로 빈 값 -> amountInvalid
    await w.find('button.add').trigger('click');
    expect(w.text()).not.toContain(MESSAGES.descriptionRequired);
    expect(w.text()).toContain(MESSAGES.amountInvalid);

    // 포맷터가 '-'를 지우므로 음수 문구는 검증 함수 경로로 확인한다.
    const { validateExpenseFields } = await import('./expenseValidation');
    const neg = validateExpenseFields('a', '-5', 1);
    expect(neg.ok === false && neg.errors.amount).toBe(MESSAGES.amountNegative);
    const big = validateExpenseFields('a', '999,999,999,999', 1);
    expect(big.ok === false && big.errors.amount).toBe(MESSAGES.amountTooLarge);
    expect(add).not.toHaveBeenCalled();
  });

  it('분류가 없으면 categoryRequired', async () => {
    const { w, add, desc, amount } = setup(false);
    await desc().setValue('점심');
    await amount().setValue('1000');
    await w.find('button.add').trigger('click');
    expect(w.text()).toContain(MESSAGES.categoryRequired);
    expect(add).not.toHaveBeenCalled();
  });

  it('금액은 입력 중 콤마로 표기된다', async () => {
    const { amount } = setup();
    await amount().setValue('1234567');
    expect((amount().element as HTMLInputElement).value).toBe('1,234,567');
  });

  it('Enter 이동: 내용 -> 금액 -> 분류 -> 제출', async () => {
    const { add, desc, amount, select } = setup();
    await desc().setValue('점심');
    await amount().setValue('12000');
    await desc().trigger('keydown', { key: 'Enter' });
    expect(document.activeElement).toBe(amount().element);
    await amount().trigger('keydown', { key: 'Enter' });
    expect(document.activeElement).toBe(select().element);
    await select().trigger('keydown', { key: 'Enter' });
    expect(add).toHaveBeenCalledWith({ date: '2026-11-15', description: '점심', amount: 12000, categoryId: 1 });
  });

  it('성공 후 분류 유지, 내용 포커스', async () => {
    const { w, add, desc, amount, select } = setup();
    await select().setValue('2');
    await desc().setValue('버스');
    await amount().setValue('1450');
    await w.find('button.add').trigger('click');
    await vi.waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    await w.vm.$nextTick();
    await w.vm.$nextTick();
    expect((desc().element as HTMLInputElement).value).toBe('');
    expect((amount().element as HTMLInputElement).value).toBe('');
    expect((select().element as HTMLSelectElement).value).toBe('2');
    expect(document.activeElement).toBe(desc().element);
  });

  it('저장 중 재제출 무시', async () => {
    const { w, add, desc, amount, select } = setup();
    let resolve!: (v: boolean) => void;
    add.mockReturnValue(new Promise<boolean>((r) => { resolve = r; }));
    await desc().setValue('점심');
    await amount().setValue('1000');
    await select().trigger('keydown', { key: 'Enter' });
    await select().trigger('keydown', { key: 'Enter' });
    await w.find('button.add').trigger('click');
    expect(add).toHaveBeenCalledTimes(1);
    resolve(true);
    await vi.waitFor(() => expect((desc().element as HTMLInputElement).value).toBe(''));
  });

  it('실패하면 입력을 지우지 않고 다시 제출할 수 있다', async () => {
    const { w, add, desc, amount } = setup();
    add.mockResolvedValueOnce(false);
    await desc().setValue('점심');
    await amount().setValue('1000');
    await w.find('button.add').trigger('click');
    await vi.waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    await w.vm.$nextTick();
    expect((desc().element as HTMLInputElement).value).toBe('점심');
    await w.find('button.add').trigger('click');
    expect(add).toHaveBeenCalledTimes(2);
  });
});
