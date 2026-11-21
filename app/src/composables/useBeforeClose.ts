// 창을 닫기 전에 저장해야 할 것들(입력 중인 메모 등)을 모아 두는 작은 등록부.
// 저장이 실패했으면 false(또는 throw/reject)를 돌려준다. 그 밖의 값은 성공으로 본다.
type Callback = () => Promise<unknown> | unknown;

export interface FlushResult {
  ok: boolean;
  timedOut: boolean;
}

const callbacks = new Set<Callback>();

/** 닫기 전에 실행할 콜백을 등록한다. 돌려받은 함수로 해제한다. */
export function registerBeforeClose(cb: Callback): () => void {
  callbacks.add(cb);
  return () => {
    callbacks.delete(cb);
  };
}

/** 등록된 콜백을 모두 실행하고 기다린다. 멈춘 저장이 닫기를 막지 않도록 timeoutMs 뒤에는 끝낸다. */
export async function flushAll(timeoutMs: number): Promise<FlushResult> {
  const all = [...callbacks].map(async (cb) => {
    try {
      return (await cb()) !== false;
    } catch {
      return false;
    }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const results = await Promise.race([Promise.all(all), timeout]);
  clearTimeout(timer);
  if (results === null) return { ok: false, timedOut: true };
  return { ok: results.every(Boolean), timedOut: false };
}
