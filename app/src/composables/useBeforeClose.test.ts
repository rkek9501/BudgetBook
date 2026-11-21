import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushAll, registerBeforeClose } from './useBeforeClose';

afterEach(() => vi.useRealTimers());

describe('useBeforeClose', () => {
  it('등록된 콜백을 모두 기다린다', async () => {
    const done: string[] = [];
    const un1 = registerBeforeClose(async () => {
      await Promise.resolve();
      done.push('a');
    });
    const un2 = registerBeforeClose(() => {
      done.push('b');
    });
    await flushAll(2000);
    expect(done.sort()).toEqual(['a', 'b']);
    un1();
    un2();
    done.length = 0;
    await flushAll(2000);
    expect(done).toEqual([]);
  });

  it('멈춘 저장이 있어도 시간 제한 뒤에 끝난다', async () => {
    vi.useFakeTimers();
    const un = registerBeforeClose(() => new Promise<void>(() => {}));
    let finished = false;
    const p = flushAll(2000).then(() => {
      finished = true;
    });
    await vi.advanceTimersByTimeAsync(1999);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(finished).toBe(true);
    un();
  });

  it('거부(실패)하거나 던져도 나머지를 기다리고 끝난다', async () => {
    const ok = vi.fn();
    const u1 = registerBeforeClose(() => Promise.reject(new Error('x')));
    const u2 = registerBeforeClose(() => {
      throw new Error('sync');
    });
    const u3 = registerBeforeClose(async () => ok());
    await expect(flushAll(2000)).resolves.toBeUndefined();
    expect(ok).toHaveBeenCalled();
    u1();
    u2();
    u3();
  });
});
