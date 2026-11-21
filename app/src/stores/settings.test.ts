import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/commands');

import * as api from '@/api/commands';
import { useSettingsStore } from './settings';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(api.setSetting).mockReset();
  vi.mocked(api.setSetting).mockResolvedValue(undefined);
});

describe('settings store', () => {
  it('load로 상태를 채운다', () => {
    const s = useSettingsStore();
    s.load({ accountingStartDay: 16, theme: 'diary', appearance: 'dark' });
    expect([s.accountingStartDay, s.theme, s.appearance]).toEqual([16, 'diary', 'dark']);
  });

  it('setter는 저장 후 반영한다', async () => {
    const s = useSettingsStore();
    await s.setStartDay(20);
    await s.setTheme('mono');
    await s.setAppearance('light');
    expect(api.setSetting).toHaveBeenCalledWith('accounting_start_day', '20');
    expect(api.setSetting).toHaveBeenCalledWith('theme', 'mono');
    expect(api.setSetting).toHaveBeenCalledWith('appearance', 'light');
    expect([s.accountingStartDay, s.theme, s.appearance]).toEqual([20, 'mono', 'light']);
  });

  it('저장 실패 시 상태를 바꾸지 않고 오류를 던진다', async () => {
    const s = useSettingsStore();
    vi.mocked(api.setSetting).mockRejectedValue(new Error('x'));
    await expect(s.setStartDay(9)).rejects.toThrow();
    expect(s.accountingStartDay).toBe(1);
  });
});
