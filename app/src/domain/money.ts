export const MAX_AMOUNT = 99_999_999_999;

export type ParseAmountResult =
  | { ok: true; value: number }
  | { ok: false; error: 'empty' | 'invalid' | 'negative' | 'too-large' };

export function parseAmount(input: string): ParseAmountResult {
  let s = input.trim().replace(/[\s,]/g, '');
  if (s.endsWith('원')) s = s.slice(0, -1);
  if (s === '') return { ok: false, error: 'empty' };
  if (/^-\d+$/.test(s)) return { ok: false, error: 'negative' };
  if (!/^\d+$/.test(s)) return { ok: false, error: 'invalid' };
  const value = Number(s);
  if (value > MAX_AMOUNT) return { ok: false, error: 'too-large' };
  return { ok: true, value };
}

const won = new Intl.NumberFormat('ko-KR');

export function formatWon(n: number): string {
  return won.format(n);
}

export function formatAmountInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (digits === '') return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
