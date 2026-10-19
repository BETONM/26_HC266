// 목업 공통 지연·실패 주입. 오류 화면을 개발 중에 재현하려면 실패가 '가끔'이 아니라
// 정해진 순번에 일어나야 한다. 그래서 난수 대신 호출 횟수로 실패를 정한다.

export type FaultOptions = {
  /** 모든 호출 앞에 두는 지연(ms). */
  latencyMs?: number;
  /** n번째 호출마다 실패시킨다(1이면 매번). 0이나 없으면 실패하지 않는다. */
  failEvery?: number;
  /** 실패할 때 쓰는 메시지. */
  failMessage?: string;
  /** 스트림을 주는 목업에서, n번째 호출마다 끝 신호 없이 중간에 끊는다. */
  disconnectEvery?: number;
};

export class MockFaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MockFaultError';
  }
}

export function abortError(): DOMException {
  return new DOMException('요청이 취소되었습니다.', 'AbortError');
}

/** signal로 끊을 수 있는 대기. 끊기면 AbortError로 거절한다. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, {once: true});
  });
}

export function createFaultInjector(options: FaultOptions = {}) {
  let calls = 0;
  return {
    /** 지연을 기다린 뒤, 순번이 맞으면 실패한다. */
    async run(signal?: AbortSignal): Promise<void> {
      calls += 1;
      const call = calls;
      await sleep(options.latencyMs ?? 0, signal);
      const every = options.failEvery ?? 0;
      if (every > 0 && call % every === 0) {
        throw new MockFaultError(options.failMessage ?? '목업에 주입한 실패입니다.');
      }
    },
    /** 방금 run한 호출이 중간에 끊겨야 하는가. */
    shouldDisconnect(): boolean {
      const every = options.disconnectEvery ?? 0;
      return every > 0 && calls > 0 && calls % every === 0;
    },
    reset() {
      calls = 0;
    },
  };
}

export type FaultInjector = ReturnType<typeof createFaultInjector>;
