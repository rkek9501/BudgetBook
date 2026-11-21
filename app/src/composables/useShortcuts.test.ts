import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

const h = vi.hoisted(() => ({ menu: null as ((id: string) => void) | null, unlisten: vi.fn(), open: vi.fn() }));
vi.mock('@/api/commands', async (orig) => ({
  ...(await orig<object>()),
  onMenu: vi.fn(async (fn: (id: string) => void) => {
    h.menu = fn;
    return h.unlisten;
  }),
  openBackupFolder: h.open,
}));

import App from '@/App.vue';
import RightPanel from '@/components/RightPanel.vue';
import { useShortcuts } from './useShortcuts';
import { useLedgerStore } from '@/stores/ledger';
import { MESSAGES } from '@/domain/messages';

const stubs = {
  AppShell: { template: '<div><slot /></div>' },
  MainLayout: true,
  FixedExpenseSheet: true,
  SettingsSheet: { name: 'SettingsSheet', props: ['initialTab', 'action'], emits: ['action-done', 'close'], template: '<div class="settings" :data-tab="initialTab" :data-action="action" />' },
};

function setupApp() {
  setActivePinia(createPinia());
  const ledger = useLedgerStore();
  vi.spyOn(ledger, 'init').mockResolvedValue();
  const goPrev = vi.spyOn(ledger, 'goPrev').mockResolvedValue();
  const goNext = vi.spyOn(ledger, 'goNext').mockResolvedValue();
  const goToday = vi.spyOn(ledger, 'goToday').mockResolvedValue();
  const w = mount(App, { global: { stubs }, attachTo: document.body });
  return { ledger, goPrev, goNext, goToday, w };
}

beforeEach(() => {
  document.body.innerHTML = '';
  h.menu = null;
  h.unlisten.mockClear();
  h.open.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('메뉴 id → 동작', () => {
  it('prev-month, next-month, today, tab-day, tab-summary, settings', async () => {
    const { ledger, goPrev, goNext, goToday, w } = setupApp();
    await flushPromises();
    h.menu!('prev-month');
    h.menu!('next-month');
    h.menu!('today');
    expect([goPrev, goNext, goToday].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);

    ledger.selectedDate = null;
    h.menu!('tab-summary');
    expect(ledger.activeTab).toBe('summary');
    h.menu!('tab-day');
    expect(ledger.activeTab).toBe('day');
    expect(ledger.selectedDate).toBe(ledger.today);

    h.menu!('settings');
    await flushPromises();
    expect(w.find('.settings').attributes('data-tab')).toBe('general');
  });

  it('import/export → 데이터 탭 + action, action-done에서 초기화', async () => {
    const { w } = setupApp();
    await flushPromises();
    h.menu!('export');
    await flushPromises();
    const s = w.find('.settings');
    expect(s.attributes('data-tab')).toBe('data');
    expect(s.attributes('data-action')).toBe('export');
    w.findComponent({ name: 'SettingsSheet' }).vm.$emit('action-done');
    await flushPromises();
    expect(w.find('.settings').attributes('data-action')).toBeUndefined();
  });

  it('open-backups 실패 → 토스트', async () => {
    const { ledger } = setupApp();
    await flushPromises();
    h.open.mockRejectedValue(new Error('x'));
    h.menu!('open-backups');
    await flushPromises();
    expect(ledger.toast).toBe(MESSAGES.saveFailed);
  });

  it('대화상자가 열려 있으면 무시, 언마운트하면 해제', async () => {
    const { goPrev, w } = setupApp();
    await flushPromises();
    const d = document.createElement('div');
    d.setAttribute('role', 'dialog');
    document.body.appendChild(d);
    h.menu!('prev-month');
    expect(goPrev).not.toHaveBeenCalled();
    w.unmount();
    expect(h.unlisten).toHaveBeenCalled();
  });
});

describe('useShortcuts', () => {
  function setup() {
    setActivePinia(createPinia());
    const ledger = useLedgerStore();
    const goPrev = vi.spyOn(ledger, 'goPrev').mockResolvedValue();
    const goNext = vi.spyOn(ledger, 'goNext').mockResolvedValue();
    const w = mount(
      defineComponent({
        setup() {
          useShortcuts();
          return () => null;
        },
      }),
      { attachTo: document.body },
    );
    return { ledger, goPrev, goNext, w };
  }
  const key = (k: string, target: EventTarget = window, extra: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key: k, ctrlKey: true, metaKey: true, bubbles: true, cancelable: true, ...extra });
    target.dispatchEvent(e);
    return e;
  };

  it('⌘N → 날짜 탭 + 내용 칸 포커스 요청', () => {
    const { ledger } = setup();
    ledger.selectedDate = null;
    ledger.activeTab = 'summary';
    const before = ledger.focusTick;
    const e = key('n');
    expect(e.defaultPrevented).toBe(true);
    expect(ledger.selectedDate).toBe(ledger.today);
    expect(ledger.activeTab).toBe('day');
    expect(ledger.focusTick).toBe(before + 1);
  });

  it('⌘←/→ → 이전·다음 달, 입력칸에서는 가로채지 않음', () => {
    const { goPrev, goNext } = setup();
    key('ArrowLeft');
    key('ArrowRight');
    expect([goPrev.mock.calls.length, goNext.mock.calls.length]).toEqual([1, 1]);
    const input = document.createElement('input');
    document.body.appendChild(input);
    const e = key('ArrowLeft', input);
    expect(goPrev).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(false);
  });

  it('대화상자 열림·IME 조합 중에는 무시, 언마운트하면 해제', () => {
    const { ledger, w } = setup();
    const before = ledger.focusTick;
    key('n', window, { isComposing: true });
    expect(ledger.focusTick).toBe(before);
    const d = document.createElement('div');
    d.setAttribute('role', 'alertdialog');
    document.body.appendChild(d);
    key('n');
    expect(ledger.focusTick).toBe(before);
    d.remove();
    w.unmount();
    key('n');
    expect(ledger.focusTick).toBe(before);
  });
});

describe('⌘N 포커스 (폼이 아직 마운트되지 않은 경우)', () => {
  it.each([
    ['요약 탭', 'summary', '2026-11-15'],
    ['선택한 날짜 없음', 'day', null],
  ] as const)('%s에서 ⌘N → 내용 칸이 포커스를 받는다', async (_n, tab, sel) => {
    setActivePinia(createPinia());
    const ledger = useLedgerStore();
    ledger.categories = [{ id: 1, name: '식비', color: '#FCB9BA' }];
    ledger.selectedDate = sel;
    ledger.activeTab = tab;
    mount(
      defineComponent({
        components: { RightPanel },
        setup() {
          useShortcuts();
        },
        template: '<RightPanel />',
      }),
      { attachTo: document.body },
    );
    await flushPromises();
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, metaKey: true, bubbles: true, cancelable: true }),
    );
    await flushPromises();
    const desc = document.querySelector('form.expense-form input') as HTMLInputElement;
    expect(desc).not.toBeNull();
    expect(document.activeElement).toBe(desc);
    expect(ledger.focusPending).toBe(false);
  });
});
