import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';

const setTheme = vi.fn().mockResolvedValue(undefined);
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn(() => ({ setTheme })) }));
import { getCurrentWindow } from '@tauri-apps/api/window';
vi.mock('@/api/commands', () => ({ setSetting: vi.fn() }));

import { useSettingsStore } from '@/stores/settings';
import { useAppearance } from './useAppearance';

let osDark = false;
let listeners: Array<() => void> = [];
function installMatchMedia() {
  listeners = [];
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return osDark;
    },
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: () => void) => {
      listeners = listeners.filter((l) => l !== fn);
    },
  }));
}
const flipOs = (dark: boolean) => {
  osDark = dark;
  listeners.forEach((l) => l());
};

function mountIt() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const Comp = defineComponent({
    setup() {
      useAppearance();
      return () => null;
    },
  });
  const w = mount(Comp, { global: { plugins: [pinia] } });
  return { w, settings: useSettingsStore() };
}
const html = () => document.documentElement;

describe('useAppearance', () => {
  beforeEach(() => {
    setTheme.mockClear();
    osDark = false;
    installMatchMedia();
    html().removeAttribute('data-theme');
    html().removeAttribute('data-appearance');
  });

  it('system + OS 다크 → data-appearance=dark, OS가 라이트로 바뀌면 즉시 light', async () => {
    osDark = true;
    const { settings } = mountIt();
    await nextTick();
    expect(settings.appearance).toBe('system');
    expect(html().dataset.appearance).toBe('dark');
    expect(html().dataset.theme).toBe('macos');
    expect(setTheme).toHaveBeenLastCalledWith(null);
    flipOs(false);
    await nextTick();
    expect(html().dataset.appearance).toBe('light');
  });

  it('light 고정이면 OS 다크여도 light, 창 테마 setTheme("light")', async () => {
    osDark = true;
    const { settings } = mountIt();
    settings.appearance = 'light';
    await nextTick();
    expect(html().dataset.appearance).toBe('light');
    expect(setTheme).toHaveBeenLastCalledWith('light');
    flipOs(true);
    await nextTick();
    expect(html().dataset.appearance).toBe('light');
  });

  it('테마를 바꾸면 data-theme이 바로 바뀐다', async () => {
    const { settings } = mountIt();
    settings.theme = 'diary';
    await nextTick();
    expect(html().dataset.theme).toBe('diary');
  });

  it('getCurrentWindow가 동기적으로 던져도 예외 없이 html 속성은 설정된다', async () => {
    vi.mocked(getCurrentWindow).mockImplementationOnce(() => {
      throw new Error('no tauri');
    });
    mountIt();
    await flushPromises();
    expect(html().dataset.appearance).toBe('light');
  });

  it('setTheme이 reject돼도 예외 없이 html 속성은 설정된다', async () => {
    setTheme.mockRejectedValueOnce(new Error('denied'));
    mountIt();
    await flushPromises();
    expect(html().dataset.theme).toBe('macos');
    expect(html().dataset.appearance).toBe('light');
  });

  it('언마운트하면 matchMedia 구독을 해제한다', () => {
    const { w } = mountIt();
    expect(listeners.length).toBe(1);
    w.unmount();
    expect(listeners.length).toBe(0);
  });
});
