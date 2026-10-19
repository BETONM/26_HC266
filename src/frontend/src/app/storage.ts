// 저장이 막힌 브라우저(사생활 보호 모드, 용량 초과, 쿠키 차단)에서도 그 탭 안에서는 동작해야 한다.
// localStorage가 던지면 조용히 메모리로 옮겨 간다. 새로고침하면 사라지지만 쓰는 동안은 깨지지 않는다.

export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function createSafeStorage(getBacking: () => KeyValueStorage | undefined): KeyValueStorage & {persistent(): boolean} {
  const memory = new Map<string, string>();
  let backing: KeyValueStorage | undefined;
  try {
    backing = getBacking();
  } catch {
    backing = undefined;
  }

  const fallBack = () => {
    backing = undefined;
  };

  return {
    getItem(key) {
      if (backing) {
        try {
          return backing.getItem(key);
        } catch {
          fallBack();
        }
      }
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      memory.set(key, value);
      if (!backing) return;
      try {
        backing.setItem(key, value);
      } catch {
        fallBack();
      }
    },
    removeItem(key) {
      memory.delete(key);
      if (!backing) return;
      try {
        backing.removeItem(key);
      } catch {
        fallBack();
      }
    },
    persistent: () => backing !== undefined,
  };
}

export const browserStorage = createSafeStorage(() => window.localStorage);
