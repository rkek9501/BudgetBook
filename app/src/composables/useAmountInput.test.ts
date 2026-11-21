import { describe, expect, it } from 'vitest';
import { formatAmountLive, isImeKey } from './useAmountInput';

describe('formatAmountLive', () => {
  it('숫자만 있으면 콤마 표기', () => {
    expect(formatAmountLive('1234567')).toBe('1,234,567');
    expect(formatAmountLive('12,000원')).toBe('12,000');
    expect(formatAmountLive(' 12000 ')).toBe('12,000');
    expect(formatAmountLive('')).toBe('');
  });
  it('숫자가 아닌 것이 섞이면 입력 그대로', () => {
    expect(formatAmountLive('1000.5')).toBe('1000.5');
    expect(formatAmountLive('-5')).toBe('-5');
    expect(formatAmountLive('abc')).toBe('abc');
    expect(formatAmountLive('12원3')).toBe('12원3');
  });
});

describe('isImeKey', () => {
  it('조합 중이거나 keyCode 229면 true', () => {
    expect(isImeKey(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }))).toBe(true);
    expect(isImeKey({ isComposing: false, keyCode: 229 } as KeyboardEvent)).toBe(true);
    expect(isImeKey(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(false);
  });
});
