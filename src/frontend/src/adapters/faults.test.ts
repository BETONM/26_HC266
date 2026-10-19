import {describe, expect, it} from 'vitest';
import {createFaultInjector, MockFaultError, sleep} from './faults';

describe('createFaultInjector', () => {
  it('정해진 순번마다 실패한다', async () => {
    const faults = createFaultInjector({failEvery: 3});
    const outcomes = [];
    for (let i = 0; i < 6; i += 1) {
      outcomes.push(await faults.run().then(() => 'ok', (e: unknown) => (e instanceof MockFaultError ? 'fail' : 'other')));
    }
    expect(outcomes).toEqual(['ok', 'ok', 'fail', 'ok', 'ok', 'fail']);
  });

  it('지연 중 abort되면 AbortError로 끝난다', async () => {
    const controller = new AbortController();
    const pending = sleep(1000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({name: 'AbortError'});
  });
});
