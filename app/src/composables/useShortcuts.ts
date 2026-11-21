import { onBeforeUnmount, onMounted } from 'vue';
import { useLedgerStore } from '@/stores/ledger';
import { isImeKey } from './useAmountInput';

const isMac = () => /Mac/.test(navigator.platform || navigator.userAgent);

function dialogOpen(): boolean {
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
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      ledger.select(ledger.selectedDate ?? ledger.today);
      ledger.setTab('day');
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
