import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

const key = (el: Element, k: string, shiftKey = false) => {
  const e = new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
};

describe('ConfirmDialog', () => {
  it('Tab/Shift+Tab은 두 버튼 안에서만 순환하고 항상 기본 동작을 막는다', async () => {
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    const w = mount(ConfirmDialog, { props: { open: true, message: '삭제할까요?' }, attachTo: document.body });
    await nextTick();
    await nextTick();
    const [cancel, confirm] = Array.from(document.querySelectorAll<HTMLElement>('.dialog button'));
    expect(document.activeElement).toBe(cancel);
    expect(key(cancel, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(confirm);
    key(confirm, 'Tab');
    expect(document.activeElement).toBe(cancel);
    key(cancel, 'Tab', true);
    expect(document.activeElement).toBe(confirm);
    expect(document.activeElement).not.toBe(outside);
    w.unmount();
  });

  it('Esc는 cancel', async () => {
    const w = mount(ConfirmDialog, { props: { open: true, message: 'm' }, attachTo: document.body });
    await nextTick();
    key(document.querySelector('.dialog')!, 'Escape');
    expect(w.emitted('cancel')).toHaveLength(1);
    w.unmount();
  });
});
