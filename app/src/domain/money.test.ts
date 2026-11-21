import { describe, it, expect } from 'vitest';
import { parseAmount, formatWon, formatAmountInput } from './money';

describe('money', () => {
  it('parseAmount 변형 입력', () => {
    expect(parseAmount('12,000원')).toEqual({ ok: true, value: 12000 });
    expect(parseAmount(' 12000 ')).toEqual({ ok: true, value: 12000 });
    expect(parseAmount('0')).toEqual({ ok: true, value: 0 });
    expect(parseAmount('')).toEqual({ ok: false, error: 'empty' });
    expect(parseAmount('1000.5')).toEqual({ ok: false, error: 'invalid' });
    expect(parseAmount('abc')).toEqual({ ok: false, error: 'invalid' });
    expect(parseAmount('-1')).toEqual({ ok: false, error: 'negative' });
    expect(parseAmount('100000000000')).toEqual({ ok: false, error: 'too-large' });
    expect(parseAmount('99999999999')).toEqual({ ok: true, value: 99999999999 });
  });
  it('표기', () => {
    expect(formatWon(51450)).toBe('51,450');
    expect(formatAmountInput('12a000')).toBe('12,000');
    expect(formatAmountInput('')).toBe('');
    expect(formatAmountInput('007')).toBe('7');
    expect(formatAmountInput('000')).toBe('0');
  });
});
