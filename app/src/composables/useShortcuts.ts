import { onBeforeUnmount, onMounted } from 'vue';
import { useLedgerStore } from '@/stores/ledger';
import { isImeKey } from './useAmountInput';

const isMac = () => /Mac/.test(navigator.platform || navigator.userAgent);

export function dialogOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

function isTextTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement ||
    t.isContentEditable
  );
}

export function useShortcuts() {
  const ledger = useLedgerStore();

  function onKeydown(e: KeyboardEvent) {
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    if (!mod || e.altKey || e.shiftKey) return;
    if (isImeKey(e) || dialogOpen()) return;
    // 한글 입력 상태에서는 key가 자모('ㅜ')로 올 수 있어, 영문자가 아닐 때만 물리 키(code)로 판정한다.
    const isN = e.key === 'n' || e.key === 'N' || (!/^[A-Za-z]$/.test(e.key) && e.code === 'KeyN');
    if (isN) {
      e.preventDefault();
      const sel = ledger.selectedDate;
      if (sel !== null && sel >= ledger.period.start && sel <= ledger.period.end) {
        ledger.select(sel);
      } else {
        // 선택이 없거나 보는 기간 밖이면 오늘이 속한 회계월로 이동한다(상태는 바로 바뀐다).
        void ledger.goToday();
      }
      ledger.requestDescriptionFocus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (isTextTarget(e.target)) return;
      e.preventDefault();
      void (e.key === 'ArrowLeft' ? ledger.goPrev() : ledger.goNext());
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
}
