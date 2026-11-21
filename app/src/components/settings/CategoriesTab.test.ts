import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CategoriesTab from './CategoriesTab.vue';
import * as api from '@/api/commands';
import { useLedgerStore } from '@/stores/ledger';
import { MESSAGES } from '@/domain/messages';

vi.mock('@/api/commands', () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    ApiError,
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    categoryUsage: vi.fn(),
    deleteCategory: vi.fn(),
  };
});

const qa = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
const btn = (label: string) => qa('button').find((b) => b.textContent?.trim() === label)!;

function setup() {
  document.body.innerHTML = '';
  setActivePinia(createPinia());
  const ledger = useLedgerStore();
  ledger.categories = [
    { id: 1, name: '식비', color: '#FCB9BA' },
    { id: 2, name: '교통', color: '#1F3A5F' },
  ];
  const refresh = vi.spyOn(ledger, 'refreshCategories').mockResolvedValue();
  const reload = vi.spyOn(ledger, 'reload').mockResolvedValue();
  const w = mount(CategoriesTab, { attachTo: document.body });
  return { w, ledger, refresh, reload };
}
const names = (w: ReturnType<typeof mount>) => w.findAll('.cat-item');

beforeEach(() => vi.clearAllMocks());

describe('CategoriesTab', () => {
  it('선택한 카테고리의 이름과 색을 함께 저장 (updateCategory 1회)', async () => {
    const { w, refresh, reload } = setup();
    vi.mocked(api.updateCategory).mockResolvedValue(undefined as never);
    const item = names(w).find((b) => b.text() === '식비')!;
    await item.trigger('click');
    await w.find('.edit-name').setValue('외식');
    await w.find('.edit-area .hex-input').setValue('333333');
    await w.findAll('button').find((b) => b.text() === '저장')!.trigger('click');
    await flushPromises();
    expect(api.updateCategory).toHaveBeenCalledTimes(1);
    expect(api.updateCategory).toHaveBeenCalledWith(1, '외식', '#333333');
    expect(refresh).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
    w.unmount();
  });

  it('빈 이름과 중복 이름은 추가 영역에 오류 표시', async () => {
    const { w } = setup();
    await w.findAll('button').find((b) => b.text() === '추가')!.trigger('click');
    expect(w.find('.add-error').text()).toBe(MESSAGES.categoryNameRequired);
    vi.mocked(api.createCategory).mockRejectedValue(new api.ApiError('duplicate_name', ''));
    await w.find('.add-name').setValue('식비');
    await w.findAll('button').find((b) => b.text() === '추가')!.trigger('click');
    await flushPromises();
    expect(w.find('.add-error').text()).toBe(MESSAGES.categoryDuplicate);
    w.unmount();
  });

  it('지출 있는 카테고리 삭제 → 옮길 대상 선택 후 deleteCategory(id, target)', async () => {
    const { w } = setup();
    vi.mocked(api.categoryUsage).mockResolvedValue({ expenseCount: 3, noteCount: 1 });
    vi.mocked(api.deleteCategory).mockResolvedValue(undefined as never);
    await names(w).find((b) => b.text() === '식비')!.trigger('click');
    await w.findAll('button').find((b) => b.text() === '삭제')!.trigger('click');
    await flushPromises();
    const text = document.body.textContent!;
    expect(text).toContain("'식비' 삭제");
    expect(text).toContain('지출 3건을 옮길 카테고리를 고르세요.');
    expect(text).toContain('메모 1개도 함께 옮겨요.');
    btn('옮기고 삭제').click();
    await flushPromises();
    expect(api.deleteCategory).toHaveBeenCalledWith(1, 2);
    w.unmount();
  });

  it('사용처가 없으면 확인 후 deleteCategory(id, null)', async () => {
    const { w } = setup();
    vi.mocked(api.categoryUsage).mockResolvedValue({ expenseCount: 0, noteCount: 0 });
    vi.mocked(api.deleteCategory).mockResolvedValue(undefined as never);
    await names(w).find((b) => b.text() === '교통')!.trigger('click');
    await w.findAll('button').find((b) => b.text() === '삭제')!.trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain(MESSAGES.confirmDeleteCategory('교통'));
    expect(api.deleteCategory).not.toHaveBeenCalled();
    // 확인 대화상자의 삭제 버튼(마지막)
    const del = qa('button').filter((b) => b.textContent?.trim() === '삭제');
    del[del.length - 1].click();
    await flushPromises();
    expect(api.deleteCategory).toHaveBeenCalledWith(2, null);
    w.unmount();
  });

  it('마지막 카테고리 삭제 → lastCategory 문구', async () => {
    const { w } = setup();
    vi.mocked(api.categoryUsage).mockResolvedValue({ expenseCount: 0, noteCount: 0 });
    vi.mocked(api.deleteCategory).mockRejectedValue(new api.ApiError('last_category', ''));
    await names(w)[0].trigger('click');
    await w.findAll('button').find((b) => b.text() === '삭제')!.trigger('click');
    await flushPromises();
    const del = qa('button').filter((b) => b.textContent?.trim() === '삭제');
    del[del.length - 1].click();
    await flushPromises();
    expect(w.find('.edit-error').text()).toBe(MESSAGES.lastCategory);
    w.unmount();
  });
});
