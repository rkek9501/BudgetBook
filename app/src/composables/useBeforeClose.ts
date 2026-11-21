// 창을 닫기 전에 저장해야 할 것들(입력 중인 메모 등)을 모아 두는 작은 등록부.
type Callback = () => Promise<unknown> | unknown;

const callbacks = new Set<Callback>();

/** 닫기 전에 실행할 콜백을 등록한다. 돌려받은 함수로 해제한다. */
export function registerBeforeClose(cb: Callback): () => void {
  callbacks.add(cb);
  return () => {
    callbacks.delete(cb);
  };
}

/** 등록된 콜백을 모두 실행하고 기다린다. 멈춘 저장이 닫기를 막지 않도록 timeoutMs 뒤에는 끝낸다. */
export async function flushAll(timeoutMs: number): Promise<void> {
  const all = [...callbacks].map(async (cb) => {
    try {
      await cb();
    } catch {
      // 저장 실패는 각 저장 경로가 화면에 알린다. 닫기는 막지 않는다.
    }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  await Promise.race([Promise.all(all), timeout]);
  clearTimeout(timer);
}
