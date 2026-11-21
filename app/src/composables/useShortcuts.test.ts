import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

const h = vi.hoisted(() => ({
  menu: null as ((id: string) => void) | null,
  unlisten: vi.fn(),
  open: vi.fn(),
  load: vi.fn(),
  closeHandler: null as ((e: { preventDefault: () => void }) => Promise<void>) | null,
  unlistenClose: vi.fn(),
  saveNote: vi.fn(),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async (fn: (e: { preventDefault: () => void }) => Promise<void>) => {
      h.closeHandler = fn;
      return h.unlistenClose;
    },
  }),
}));
vi.mock('@/api/commands', async (orig) => ({
  ...(await orig<object>()),
  onMenu: vi.fn(async (fn: (id: string) => void) => {
    h.menu = fn;
    return h.unlisten;
  }),
  openBackupFolder: h.open,
  loadPeriod: h.load,
  saveNote: h.saveNote,
}));

import App from '@/App.vue';
import RightPanel from '@/components/RightPanel.vue';
import { useShortcuts } from './useShortcuts';
import { useLedgerStore } from '@/stores/ledger';
import { MESSAGES } from '@/domain/messages';
import { registerBeforeClose } from './useBeforeClose';

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
  h.closeHandler = null;
  h.unlistenClose.mockClear();
  h.unlisten.mockClear();
  h.open.mockReset();
  h.load.mockReset();
  h.saveNote.mockReset();
  h.load.mockResolvedValue({ expenses: [], noExpenseDays: [], notes: [], fixedAmounts: [] });
});
afterEach(() => vi.restoreAllMocks());

describe('창 닫기 전 저장', () => {
  it('닫기 요청 시 등록된 저장을 기다리고 언마운트하면 해제', async () => {
    const { w } = setupApp();
    await flushPromises();
    expect(h.closeHandler).not.toBeNull();
    let saved = false;
    const un = registerBeforeClose(async () => {
      await Promise.resolve();
      saved = true;
    });
    const ev = { preventDefault: vi.fn() };
    await h.closeHandler!(ev);
    expect(saved).toBe(true);
    expect(ev.preventDefault).not.toHaveBeenCalled();
    un();
    w.unmount();
    expect(h.unlistenClose).toHaveBeenCalled();
  });
});

describe('창 닫기: 저장 실패·시간 초과', () => {
  afterEach(() => vi.useRealTimers());

  it('저장 실패: 첫 닫기는 막고 알림, 두 번째는 닫는다', async () => {
    const { ledger } = setupApp();
    await flushPromises();
    const un = registerBeforeClose(() => false);
    const e1 = { preventDefault: vi.fn() };
    await h.closeHandler!(e1);
    expect(e1.preventDefault).toHaveBeenCalledTimes(1);
    expect(ledger.toast).toBe(MESSAGES.memoCloseFailed);
    ledger.clearToast();
    const e2 = { preventDefault: vi.fn() };
    await h.closeHandler!(e2);
    expect(e2.preventDefault).not.toHaveBeenCalled();
    expect(ledger.toast).toBeNull();
    un();
  });

  it('시간 초과도 첫 닫기만 막는다', async () => {
    const { ledger } = setupApp();
    await flushPromises();
    vi.useFakeTimers();
    const un = registerBeforeClose(() => new Promise<void>(() => {}));
    const e1 = { preventDefault: vi.fn() };
    const p1 = h.closeHandler!(e1);
    await vi.advanceTimersByTimeAsync(2000);
    await p1;
    expect(e1.preventDefault).toHaveBeenCalledTimes(1);
    expect(ledger.toast).toBe(MESSAGES.memoCloseFailed);
    const e2 = { preventDefault: vi.fn() };
    const p2 = h.closeHandler!(e2);
    await vi.advanceTimersByTimeAsync(2000);
    await p2;
    expect(e2.preventDefault).not.toHaveBeenCalled();
    un();
  });

  it('막은 뒤 메모 저장이 성공하면 다음 닫기 실패에서 다시 막고 알린다', async () => {
    const { ledger } = setupApp();
    await flushPromises();
    const un = registerBeforeClose(() => false);
    const e1 = { preventDefault: vi.fn() };
    await h.closeHandler!(e1);
    expect(e1.preventDefault).toHaveBeenCalledTimes(1);
    // 창을 닫지 않고 계속 쓰는 동안 메모 저장이 성공한다
    h.saveNote.mockResolvedValueOnce(undefined);
    expect(await ledger.saveNote(1, '메모', '2026-11')).toBe(true);
    ledger.clearToast();
    const e2 = { preventDefault: vi.fn() };
    await h.closeHandler!(e2);
    expect(e2.preventDefault).toHaveBeenCalledTimes(1);
    expect(ledger.toast).toBe(MESSAGES.memoCloseFailed);
    un();
  });

  it('막은 뒤 메모 저장이 실패하면 막힘 상태를 유지한다', async () => {
    setupApp();
    const ledger = useLedgerStore();
    await flushPromises();
    const un = registerBeforeClose(() => false);
    await h.closeHandler!({ preventDefault: vi.fn() });
    h.saveNote.mockRejectedValueOnce(new Error('disk full'));
    expect(await ledger.saveNote(1, '메모', '2026-11')).toBe(false);
    const e2 = { preventDefault: vi.fn() };
    await h.closeHandler!(e2);
    expect(e2.preventDefault).not.toHaveBeenCalled();
    un();
  });

  it('실패 뒤 정상 저장되면 다시 첫 실패부터 막는다', async () => {
    setupApp();
    await flushPromises();
    let ok = false;
    const un = registerBeforeClose(() => ok);
    const e1 = { preventDefault: vi.fn() };
    await h.closeHandler!(e1);
    expect(e1.preventDefault).toHaveBeenCalledTimes(1);
    ok = true;
    const e2 = { preventDefault: vi.fn() };
    await h.closeHandler!(e2);
    expect(e2.preventDefault).not.toHaveBeenCalled();
    ok = false;
    const e3 = { preventDefault: vi.fn() };
    await h.closeHandler!(e3);
    expect(e3.preventDefault).toHaveBeenCalledTimes(1);
    un();
  });
});

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

  it('tab-day: 다른 달을 보는 중 선택이 없으면 오늘을 고르지 않고 빈 상태의 날짜 탭', async () => {
    const { ledger } = setupApp();
    await flushPromises();
    ledger.period = { start: '2000-01-01', end: '2000-01-31' };
    ledger.selectedDate = null;
    ledger.activeTab = 'summary';
    h.menu!('tab-day');
    expect(ledger.selectedDate).toBeNull();
    expect(ledger.activeTab).toBe('day');
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
    expect(ledger.toast).toBe(MESSAGES.openFolderFailed);
  });

  it('dbError 중에는 메뉴를 무시', async () => {
    const { ledger, goPrev, w } = setupApp();
    await flushPromises();
    ledger.dbError = 'locked';
    h.menu!('prev-month');
    h.menu!('settings');
    h.menu!('import');
    await flushPromises();
    expect(goPrev).not.toHaveBeenCalled();
    expect(w.find('.settings').exists()).toBe(false);
  });

  describe('고정 지출 저장 후 새로고침 실패', () => {
    async function saved() {
      setActivePinia(createPinia());
      const ledger = useLedgerStore();
      vi.spyOn(ledger, 'init').mockResolvedValue();
      const w = mount(App, {
        global: {
          stubs: {
            ...stubs,
            MainLayout: { name: 'MainLayout', emits: ['open-fixed'], template: '<div />' },
            FixedExpenseSheet: { name: 'FixedExpenseSheet', emits: ['saved', 'close'], template: '<div class="fixed" />' },
          },
        },
        attachTo: document.body,
      });
      await flushPromises();
      w.findComponent({ name: 'MainLayout' }).vm.$emit('open-fixed');
      await flushPromises();
      w.findComponent({ name: 'FixedExpenseSheet' }).vm.$emit('saved');
      await flushPromises();
      return ledger;
    }

    it('일반 오류 → loadFailed 토스트', async () => {
      h.load.mockRejectedValue(new Error('boom'));
      const ledger = await saved();
      expect(ledger.toast).toBe(MESSAGES.loadFailed);
      expect(ledger.dbError).toBeNull();
    });

    it('db_unavailable → 오류 화면 상태', async () => {
      h.load.mockRejectedValue(Object.assign(new Error('locked'), { code: 'db_unavailable' }));
      const ledger = await saved();
      expect(ledger.dbError).toBe('locked');
      expect(ledger.toast).toBeNull();
    });
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

  it('⌘N: 한글 입력 상태에서 key가 자모여도 code가 KeyN이면 동작', () => {
    const { ledger } = setup();
    ledger.selectedDate = null;
    ledger.activeTab = 'summary';
    const e = key('ㅜ', window, { code: 'KeyN' });
    expect(e.defaultPrevented).toBe(true);
    expect(ledger.activeTab).toBe('day');
  });

  it('⌘N: 다른 배열의 문자 키(code만 KeyN)는 가로채지 않음', () => {
    const { ledger } = setup();
    ledger.activeTab = 'summary';
    // 예: Dvorak에서 KeyN 자리의 'b'
    const e = key('b', window, { code: 'KeyN' });
    expect(e.defaultPrevented).toBe(false);
    expect(ledger.activeTab).toBe('summary');
  });

  it('⌘N: 다른 달을 보다 선택이 없으면 오늘이 속한 달로 이동하고 오늘을 선택', () => {
    const { ledger } = setup();
    const goToday = vi.spyOn(ledger, 'goToday').mockImplementation(async () => {
      ledger.selectedDate = ledger.today;
      ledger.activeTab = 'day';
    });
    ledger.period = { start: '2000-01-01', end: '2000-01-31' };
    ledger.selectedDate = null;
    ledger.activeTab = 'summary';
    const before = ledger.focusTick;
    key('n');
    expect(goToday).toHaveBeenCalledTimes(1);
    expect(ledger.selectedDate).toBe(ledger.today);
    expect(ledger.activeTab).toBe('day');
    expect(ledger.focusTick).toBe(before + 1);
  });

  it('⌘N: 기간 밖 선택도 오늘로 이동, 기간 안 선택은 유지', () => {
    const { ledger } = setup();
    const goToday = vi.spyOn(ledger, 'goToday').mockResolvedValue();
    ledger.period = { start: '2000-01-01', end: '2000-01-31' };
    ledger.selectedDate = '2000-02-05';
    key('n');
    expect(goToday).toHaveBeenCalledTimes(1);
    ledger.selectedDate = '2000-01-10';
    ledger.activeTab = 'summary';
    key('n');
    expect(goToday).toHaveBeenCalledTimes(1);
    expect(ledger.selectedDate).toBe('2000-01-10');
    expect(ledger.activeTab).toBe('day');
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
