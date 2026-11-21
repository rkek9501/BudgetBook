import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Sheet from '@/components/Sheet.vue';
import CategoryDeleteDialog from './CategoryDeleteDialog.vue';

const targets = [
  { id: 2, name: '교통', color: '#1F3A5F' },
  { id: 3, name: '문화', color: '#FCB9BA' },
];

function mountInSheet(onClose: () => void) {
  return mount(
    {
      components: { Sheet, CategoryDeleteDialog },
      props: ['onCancel', 'onClose'],
      template: `<Sheet :open="true" title="설정" @close="onClose">
        <CategoryDeleteDialog name="식비" :expense-count="2" :note-count="0" :targets="targets" @cancel="onCancel" />
      </Sheet>`,
      data: () => ({ targets }),
    },
    { attachTo: document.body, props: { onClose, onCancel: () => (cancelled += 1) } },
  );
}
let cancelled = 0;
afterEach(() => {
  document.body.innerHTML = '';
  cancelled = 0;
});

const key = (el: Element, k: string, shiftKey = false) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));

describe('CategoryDeleteDialog', () => {
  it('열리면 select에 포커스, Esc는 대화상자만 닫고 시트는 닫지 않음', async () => {
    let closed = 0;
    const w = mountInSheet(() => (closed += 1));
    await nextTick();
    await nextTick();
    const select = document.querySelector('.dialog select')!;
    expect(document.activeElement).toBe(select);
    key(select, 'Escape');
    expect(cancelled).toBe(1);
    expect(closed).toBe(0);
    w.unmount();
  });

  it('마지막 컨트롤에서 Tab → 대화상자 안에서 순환', async () => {
    const w = mountInSheet(() => {});
    await nextTick();
    await nextTick();
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('.dialog button'));
    const last = buttons[buttons.length - 1];
    last.focus();
    key(last, 'Tab');
    expect(document.activeElement).toBe(document.querySelector('.dialog select'));
    w.unmount();
  });

  it('select에서 Tab → 다음 버튼, 처음에서 Shift+Tab → 끝으로(밖으로 나가지 않음)', async () => {
    const w = mountInSheet(() => {});
    await nextTick();
    await nextTick();
    const select = document.querySelector<HTMLElement>('.dialog select')!;
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('.dialog button'));
    select.focus();
    key(select, 'Tab');
    expect(document.activeElement).toBe(buttons[0]);
    select.focus();
    key(select, 'Tab', true);
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    expect(document.querySelector('.dialog')!.contains(document.activeElement)).toBe(true);
    w.unmount();
  });
});
