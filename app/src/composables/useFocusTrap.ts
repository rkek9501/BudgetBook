export const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function focusablesIn(container: HTMLElement | null): HTMLElement[] {
  return Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
}

// WebKit은 기본 설정에서 Tab이 버튼·체크박스를 건너뛰므로, 브라우저에 맡기지 않고
// 대화상자 안의 포커스 가능한 요소 목록에서 직접 다음·이전 요소로 옮긴다(처음↔끝 순환).
export function trapTab(e: KeyboardEvent, container: HTMLElement | null): void {
  if (e.key !== 'Tab' || !container) return;
  e.preventDefault();
  const list = focusablesIn(container);
  if (list.length === 0) {
    container.focus();
    return;
  }
  const i = list.indexOf(document.activeElement as HTMLElement);
  let next: number;
  if (i === -1) next = e.shiftKey ? list.length - 1 : 0;
  else next = (i + (e.shiftKey ? -1 : 1) + list.length) % list.length;
  list[next].focus();
}
