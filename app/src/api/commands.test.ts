import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  ApiError,
  deleteCategory,
  loadPeriod,
  onMenu,
  saveNote,
  setNoExpenseDay,
  setSetting,
} from './commands';

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue(undefined);
  vi.mocked(listen).mockReset();
});

describe('commands', () => {
  it('커맨드 이름과 인자 표기', async () => {
    await deleteCategory(3, 5);
    expect(invoke).toHaveBeenCalledWith('delete_category', { id: 3, moveTo: 5 });
    await saveNote('2026-11', 1, 'x');
    expect(invoke).toHaveBeenCalledWith('save_note', { month: '2026-11', categoryId: 1, note: 'x' });
    await loadPeriod('2026-10-25', '2026-11-24', '2026-11');
    expect(invoke).toHaveBeenCalledWith('load_period', {
      start: '2026-10-25',
      end: '2026-11-24',
      month: '2026-11',
    });
    await setNoExpenseDay('2026-11-01', true);
    expect(invoke).toHaveBeenCalledWith('set_no_expense_day', { date: '2026-11-01', on: true });
    await setSetting('theme', 'mono');
    expect(invoke).toHaveBeenCalledWith('set_setting', { key: 'theme', value: 'mono' });
  });

  it('오류는 ApiError(code)', async () => {
    vi.mocked(invoke).mockRejectedValueOnce({ code: 'last_category', message: 'x' });
    const p = deleteCategory(1, null);
    await expect(p).rejects.toMatchObject({ code: 'last_category', message: 'x' });
    vi.mocked(invoke).mockRejectedValueOnce({ code: 'last_category', message: 'x' });
    await expect(deleteCategory(1, null)).rejects.toBeInstanceOf(ApiError);
  });

  it('객체가 아닌 오류는 unknown 코드', async () => {
    vi.mocked(invoke).mockRejectedValueOnce('boom');
    await expect(deleteCategory(1, null)).rejects.toMatchObject({ code: 'unknown', message: 'boom' });
  });

  it('onMenu는 payload를 전달하고 unlisten을 반환', async () => {
    const unlisten = vi.fn();
    let cb: ((e: { payload: string }) => void) | undefined;
    vi.mocked(listen).mockImplementation(async (_name, handler) => {
      cb = handler as never;
      return unlisten;
    });
    const handler = vi.fn();
    const off = await onMenu(handler);
    expect(listen).toHaveBeenCalledWith('menu', expect.any(Function));
    cb!({ payload: 'today' });
    expect(handler).toHaveBeenCalledWith('today');
    expect(off).toBe(unlisten);
  });
});
