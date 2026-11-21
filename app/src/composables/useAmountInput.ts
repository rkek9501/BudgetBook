import { ref } from 'vue';
import { formatAmountInput } from '@/domain/money';

// 숫자만 있는 입력(콤마·공백·끝의 '원' 허용)은 천 단위 콤마로 보여주고,
// 그 밖의 입력은 사용자가 친 그대로 두어 제출 때 parseAmount가 오류로 알리게 한다.
export function formatAmountLive(text: string): string {
  let s = text.replace(/[\s,]/g, '');
  if (s.endsWith('원')) s = s.slice(0, -1);
  return /^\d+$/.test(s) ? formatAmountInput(s) : text;
}

export function useAmountInput(onChange?: () => void) {
  const amount = ref('');
  function onInput(e: Event) {
    const el = e.target as HTMLInputElement;
    amount.value = formatAmountLive(el.value);
    el.value = amount.value;
    onChange?.();
  }
  return { amount, onInput };
}

// 한글 조합 중 Enter 등은 조합 확정용이므로 동작으로 처리하지 않는다.
export function isImeKey(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229;
}
