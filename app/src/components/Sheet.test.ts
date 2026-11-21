import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Sheet from './Sheet.vue';

beforeEach(() => {
  document.body.innerHTML = '';
});

function mk(open = true) {
  return mount(Sheet, {
    props: { open, title: '제목' },
    slots: { default: '<input id="a" /><button id="b">b</button>' },
    attachTo: document.body,
  });
}

describe('Sheet', () => {
  it('닫힘이면 렌더하지 않고, 열리면 body에 dialog로 렌더', async () => {
    const w = mk(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await w.setProps({ open: true });
    const d = document.querySelector('[role="dialog"]')!;
    expect(d.getAttribute('aria-modal')).toBe('true');
    const id = d.getAttribute('aria-labelledby')!;
    expect(document.getElementById(id)!.textContent).toBe('제목');
    w.unmount();
  });

  it('Esc는 close를 낸다', async () => {
    const w = mk();
    document.querySelector('[role="dialog"]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(w.emitted('close')).toHaveLength(1);
    w.unmount();
  });

  it('열면 시트 안으로 포커스, Tab은 안에서 순환, 닫으면 복귀', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const w = mk(false);
    await w.setProps({ open: true });
    await w.vm.$nextTick();
    const d = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(d.contains(document.activeElement)).toBe(true);
    (document.getElementById('b') as HTMLElement).focus();
    d.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(d.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.getElementById('b'));
    await w.setProps({ open: false });
    expect(document.activeElement).toBe(opener);
    w.unmount();
  });
});
