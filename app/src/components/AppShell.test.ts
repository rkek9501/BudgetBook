import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import * as api from '@/api/commands';

vi.mock('@/api/commands', () => ({
  dbStatus: vi.fn(),
  bootstrap: vi.fn(),
  loadPeriod: vi.fn(),
  retryOpen: vi.fn(),
  listBackups: vi.fn().mockResolvedValue([]),
  restoreBackup: vi.fn(),
  openBackupFolder: vi.fn(),
  setSetting: vi.fn(),
}));

import { useLedgerStore } from '@/stores/ledger';
import AppShell from './AppShell.vue';
import Toast from './Toast.vue';

function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const ledger = useLedgerStore();
  const refresh = vi.spyOn(ledger, 'refreshToday');
  const w = mount(AppShell, { slots: { default: '<p id="body">본문</p>' }, global: { plugins: [pinia] } });
  return { w, ledger, refresh };
}

describe('AppShell', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('ready 전에는 슬롯 없음, ready 후 슬롯, dbError면 오류 화면', async () => {
    const { w, ledger } = setup();
    expect(w.find('#body').exists()).toBe(false);
    ledger.ready = true;
    await w.vm.$nextTick();
    expect(w.find('#body').exists()).toBe(true);
    ledger.dbError = 'x';
    await w.vm.$nextTick();
    expect(w.find('#body').exists()).toBe(false);
    expect(w.text()).toContain('가계부 데이터를 열 수 없어요');
  });

  it('다시 시도 성공 → 실제 init이 dbError를 지워 오류 화면에서 슬롯으로 전환', async () => {
    vi.useRealTimers();
    vi.mocked(api.retryOpen).mockResolvedValue({ ok: true, error: null, backupError: null });
    vi.mocked(api.dbStatus).mockResolvedValue({ ok: true, error: null, backupError: null });
    vi.mocked(api.bootstrap).mockResolvedValue({
      settings: { accountingStartDay: 1, theme: 'macos', appearance: 'system' },
      categories: [{ id: 1, name: '식비', color: '#FCB9BA' }],
      isFresh: false,
    } as never);
    vi.mocked(api.loadPeriod).mockResolvedValue({
      expenses: [], noExpenseDays: [], notes: [], fixedAmounts: [],
    });
    const { w, ledger } = setup();
    ledger.ready = true;
    ledger.dbError = 'broken';
    await w.vm.$nextTick();
    expect(w.find('#body').exists()).toBe(false);
    await w.findAll('button').find((b) => b.text() === '다시 시도')!.trigger('click');
    await flushPromises();
    expect(ledger.dbError).toBeNull();
    expect(w.find('#body').exists()).toBe(true);
  });

  it('1분마다·포커스 시 refreshToday, 언마운트하면 정리', () => {
    const { w, refresh } = setup();
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('focus'));
    expect(refresh).toHaveBeenCalledTimes(2);
    w.unmount();
    vi.advanceTimersByTime(120_000);
    window.dispatchEvent(new Event('focus'));
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('4초 뒤 사라지고, 클릭해도 사라진다', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const ledger = useLedgerStore();
    const w = mount(Toast, { global: { plugins: [pinia] } });
    expect(w.text()).toBe('');
    ledger.toast = '안내';
    await w.vm.$nextTick();
    expect(w.text()).toContain('안내');
    vi.advanceTimersByTime(4000);
    expect(ledger.toast).toBeNull();
    ledger.toast = '또';
    await w.vm.$nextTick();
    await w.find('[role="status"]').trigger('click');
    expect(ledger.toast).toBeNull();
  });
});
