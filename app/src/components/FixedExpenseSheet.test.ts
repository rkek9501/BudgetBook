import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import FixedExpenseSheet from './FixedExpenseSheet.vue';
import * as api from '@/api/commands';
import { MESSAGES } from '@/domain/messages';

vi.mock('@/api/commands', () => ({ loadFixed: vi.fn(), saveFixed: vi.fn() }));

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const qa = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
const btn = (label: string) => qa('button').find((b) => b.textContent?.trim() === label)!;

async function setup(
  data = {
    items: [
      { id: 'a', name: '월세', sortOrder: 0 },
      { id: 'b', name: '통신비', sortOrder: 1 },
    ],
    amounts: [
      { itemId: 'a', month: '2026-10', amount: 500000 },
      { itemId: 'b', month: '2026-10', amount: 55000 },
      { itemId: 'b', month: '2026-11', amount: 0 },
    ],
  },
) {
  setActivePinia(createPinia());
  vi.mocked(api.loadFixed).mockResolvedValue(data);
  vi.mocked(api.saveFixed).mockResolvedValue(undefined as never);
  const w = mount(FixedExpenseSheet, { props: { startMonth: '2026-11' }, attachTo: document.body });
  await flushPromises();
  return w;
}
const amountInputs = () => qa('.fixed-row input') as HTMLInputElement[];
async function type(el: HTMLInputElement, v: string) {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('FixedExpenseSheet', () => {
  it('지난달 불러오기는 빈칸만 채우고 0은 유지', async () => {
    const w = await setup();
    expect(amountInputs().map((i) => i.value)).toEqual(['', '0']);
    btn('지난달 금액 불러오기').click();
    await flushPromises();
    expect(amountInputs().map((i) => i.value)).toEqual(['500,000', '0']);
    w.unmount();
  });

  it('중복 이름은 입력 줄 아래에 표시', async () => {
    const w = await setup();
    await type(q('.add-row input') as HTMLInputElement, ' 월세 ');
    btn('추가').click();
    await flushPromises();
    expect(q('.add-error')!.textContent).toBe(MESSAGES.fixedDuplicate);
    await type(q('.add-row input') as HTMLInputElement, '  ');
    btn('추가').click();
    await flushPromises();
    expect(q('.add-error')!.textContent).toBe(MESSAGES.fixedNameRequired);
    w.unmount();
  });

  it('취소하면 saveFixed 호출 없음', async () => {
    const w = await setup();
    btn('취소').click();
    await flushPromises();
    expect(api.saveFixed).not.toHaveBeenCalled();
    expect(w.emitted('close')).toHaveLength(1);
    w.unmount();
  });

  it('저장 시 빈칸은 금액 행 없음, 0은 0으로 전달', async () => {
    const w = await setup();
    await type(q('.add-row input') as HTMLInputElement, '보험');
    btn('추가').click();
    await flushPromises();
    await type(amountInputs()[2], '0');
    btn('저장').click();
    await flushPromises();
    const [items, amounts] = vi.mocked(api.saveFixed).mock.calls[0];
    expect(items.map((i) => [i.name, i.sortOrder])).toEqual([['월세', 0], ['통신비', 1], ['보험', 2]]);
    const newId = items[2].id;
    expect(newId).toBeTruthy();
    expect(amounts).toHaveLength(4);
    expect(amounts).toContainEqual({ itemId: 'b', month: '2026-11', amount: 0 });
    expect(amounts).toContainEqual({ itemId: newId, month: '2026-11', amount: 0 });
    expect(amounts).not.toContainEqual(expect.objectContaining({ itemId: 'a', month: '2026-11' }));
    expect(w.emitted('saved')).toHaveLength(1);
    w.unmount();
  });

  it('잘못된 금액이면 항목 이름이 들어간 문구, 저장 안 함', async () => {
    const w = await setup();
    await type(amountInputs()[0], 'abc');
    btn('저장').click();
    await flushPromises();
    expect(api.saveFixed).not.toHaveBeenCalled();
    expect(q('.save-error')!.textContent).toBe(MESSAGES.fixedAmountInvalid('월세'));
    expect(w.emitted('saved')).toBeUndefined();
    w.unmount();
  });

  it('삭제는 확인 뒤 항목과 금액을 제거, 저장 실패는 시트 유지', async () => {
    const w = await setup();
    q('[aria-label="월세 삭제"]')!.click();
    await flushPromises();
    expect(document.body.textContent).toContain(MESSAGES.confirmDeleteFixed('월세'));
    btn('삭제').click();
    await flushPromises();
    expect(qa('.fixed-row')).toHaveLength(1);
    vi.mocked(api.saveFixed).mockRejectedValue(new Error('x'));
    btn('저장').click();
    await flushPromises();
    const [items, amounts] = vi.mocked(api.saveFixed).mock.calls[0];
    expect(items.map((i) => i.id)).toEqual(['b']);
    expect(amounts.every((a) => a.itemId === 'b')).toBe(true);
    expect(q('.save-error')!.textContent).toBe(MESSAGES.saveFailed);
    expect(w.emitted('saved')).toBeUndefined();
    w.unmount();
  });

  it('합계 미리보기와 월 이동', async () => {
    const w = await setup();
    expect(q('.total')!.textContent).toBe('이번 달 합계 0원');
    q('[aria-label="이전 달"]')!.click();
    await flushPromises();
    expect(q('.total')!.textContent).toBe('이번 달 합계 555,000원');
    w.unmount();
  });

  it('항목이 없으면 안내 문구', async () => {
    const w = await setup({ items: [], amounts: [] });
    expect(document.body.textContent).toContain(MESSAGES.emptyFixed);
    w.unmount();
  });

  it('저장 중에는 취소·Esc로 닫히지 않고, 성공하면 saved', async () => {
    const w = await setup();
    let resolve!: () => void;
    vi.mocked(api.saveFixed).mockReturnValue(new Promise<void>((r) => { resolve = r; }) as never);
    btn('저장').click();
    await flushPromises();
    expect((btn('취소') as HTMLButtonElement).disabled).toBe(true);
    btn('취소').click();
    q('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await flushPromises();
    expect(w.emitted('close')).toBeUndefined();
    resolve();
    await flushPromises();
    expect(w.emitted('saved')).toHaveLength(1);
    w.unmount();
  });

  it('저장 중 실패하면 실패 문구를 보이고 시트는 열려 있음', async () => {
    const w = await setup();
    let reject!: (e: Error) => void;
    vi.mocked(api.saveFixed).mockReturnValue(new Promise<void>((_, r) => { reject = r; }) as never);
    btn('저장').click();
    await flushPromises();
    q('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    reject(new Error('x'));
    await flushPromises();
    expect(w.emitted('close')).toBeUndefined();
    expect(q('.save-error')!.textContent).toBe(MESSAGES.saveFailed);
    expect(q('[role=dialog]')).not.toBeNull();
    expect((btn('취소') as HTMLButtonElement).disabled).toBe(false);
    w.unmount();
  });
});
