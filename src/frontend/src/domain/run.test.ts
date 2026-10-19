import {afterEach, describe, expect, it, vi} from 'vitest';
import {MockRunSource} from '../adapters/run/MockRunSource';
import type {RunUpdate, StartRunRequest} from '../adapters/run/RunSource';
import {planSteps, type PlanGroup} from './plan';
import {
  appendSample,
  applyRunStatus,
  elapsedTime,
  groupWindows,
  MAX_SAMPLES,
  planWindowStart,
  stepState,
  type RunRecord,
} from './run';

const group = (id: string, n: number): PlanGroup => ({
  id,
  title: id,
  target: '',
  actions: Array.from({length: n}, (_, i) => ({id: `${id}-${i + 1}`, label: `${id}${i + 1}`})),
  basis: [],
});
const groups = [group('a', 8), group('b', 4), group('c', 4)];

const record = (): RunRecord => ({
  id: 'run-1',
  planId: 'plan-1',
  planVersion: 2,
  graphSnapshotId: 'cfg-1',
  startedAt: '2026-10-17T00:00:00.000Z',
  state: 'running',
  cursor: 0,
  total: 16,
  samples: [],
  events: [],
  source: 'mock',
});

describe('elapsedTime', () => {
  const start = '2026-10-17T05:00:00.000Z';
  it('분:초, 한 시간이 넘으면 시:분:초', () => {
    expect(elapsedTime(start, null, Date.parse('2026-10-17T05:04:07Z'))).toBe('4:07');
    expect(elapsedTime(start, null, Date.parse('2026-10-17T06:02:07Z'))).toBe('1:02:07');
  });
  it('끝났으면 끝난 때까지, 시계가 거꾸로면 0', () => {
    expect(elapsedTime(start, '2026-10-17T05:00:30Z', Date.parse('2026-10-17T09:00:00Z'))).toBe('0:30');
    expect(elapsedTime(start, null, Date.parse('2026-10-17T04:59:00Z'))).toBe('0:00');
    expect(elapsedTime('잘못', null, 0)).toBe('—');
  });
});

describe('planWindowStart', () => {
  const stepsOf = (id: string) => planSteps(groups).filter((s) => s.group.id === id);

  it('시작 전 묶음은 처음부터, 끝난 묶음은 마지막 세 개, 진행 중인 묶음은 현재 동작 중심', () => {
    expect(planWindowStart(stepsOf('b'), 0)).toBe(0);
    expect(planWindowStart(stepsOf('a'), 12)).toBe(5);
    expect(planWindowStart(stepsOf('a'), 4)).toBe(3);
    expect(planWindowStart(stepsOf('a'), 0)).toBe(0);
  });

  it('창 밖의 동작 수를 함께 준다', () => {
    const [a] = groupWindows(groups, 4);
    expect(a!.visible.map((s) => s.label)).toEqual(['a4', 'a5', 'a6']);
    expect([a!.hiddenBefore, a!.hiddenAfter]).toEqual([3, 2]);
  });
});

describe('실행 기록', () => {
  it('끝나면 종료 시각을 한 번만 적고, 이벤트를 쌓는다', () => {
    const done = applyRunStatus(
      record(),
      {runId: 'run-1', cursor: 16, total: 16, state: 'done', updatedAt: 't1'},
      {at: 't1', kind: 'done', message: '끝', by: 'system'},
    );
    expect(done).toMatchObject({state: 'done', endedAt: 't1', cursor: 16});
    expect(applyRunStatus(done, {runId: 'run-1', cursor: 16, total: 16, state: 'done', updatedAt: 't2'}).endedAt).toBe(
      't1',
    );
    expect(done.events).toHaveLength(1);
  });

  it('같은 시각 표본은 두 번 쌓지 않고, 상한을 넘으면 오래된 것부터 버린다', () => {
    let r = appendSample(record(), {at: 't1', cursor: 0, ph: 6.7});
    r = appendSample(r, {at: 't1', cursor: 0, ph: 6.7});
    expect(r.samples).toHaveLength(1);
    const full = {...r, samples: Array.from({length: MAX_SAMPLES}, (_, i) => ({at: `s${i}`, cursor: 0}))};
    expect(appendSample(full, {at: 'new', cursor: 1}).samples.at(0)?.at).toBe('s1');
  });

  it('비상 정지·완료 뒤에는 하는 중인 동작이 없다', () => {
    expect(stepState(3, 3, 'running')).toBe('active');
    expect(stepState(3, 3, 'stopped')).toBe('todo');
    expect(stepState(2, 3, 'stopped')).toBe('done');
  });
});

describe('MockRunSource', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const request: StartRunRequest = {
    runId: 'run-1',
    planId: 'plan-1',
    planVersion: 2,
    graphSnapshotId: 'cfg-1',
    steps: [
      {id: 's1', label: '시약병 파지'},
      {id: 's2', label: '레일 이동'},
      {id: 's3', label: '분주'},
    ],
  };

  function setup() {
    vi.useFakeTimers();
    let now = 0;
    const source = new MockRunSource({stepMs: 1000, now: () => now});
    const updates: RunUpdate[] = [];
    const tick = async (ms: number) => {
      now += ms;
      await vi.advanceTimersByTimeAsync(ms);
    };
    return {source, updates, tick};
  }

  it('동작을 하나씩 끝내고, 마지막에 완료한다', async () => {
    const {source, updates, tick} = setup();
    await source.start(request);
    source.connect(request, null, (u) => updates.push(u));
    await tick(1000);
    expect(updates.at(-1)?.event?.message).toBe('01 시약병 파지 완료');
    await tick(2000);
    expect(updates.at(-1)?.status).toMatchObject({cursor: 3, state: 'done'});
    expect(updates.at(-1)?.event?.kind).toBe('done');
  });

  it('일시정지는 그 동작에 쓴 시간을 기억했다가 재개 때 이어 간다', async () => {
    const {source, tick} = setup();
    await source.start(request);
    await tick(600);
    await source.pause('run-1');
    await tick(5000);
    expect(source.progress()?.fraction).toBeCloseTo(0.6 / 3);
    await source.resume('run-1');
    await tick(399);
    expect(source.progress()?.state).toBe('running');
    await tick(1);
    expect(source.progress()?.fraction).toBeCloseTo(1 / 3);
  });

  it('E-STOP은 바로 멈추고 실제 장비 미연결을 기록한다', async () => {
    const {source, updates, tick} = setup();
    await source.start(request);
    source.connect(request, null, (u) => updates.push(u));
    const status = await source.emergencyStop('run-1');
    expect(status.state).toBe('stopped');
    expect(updates.at(-1)?.event).toMatchObject({kind: 'estop', by: 'user'});
    expect(updates.at(-1)?.event?.message).toContain('실제 장비 미연결');
    await tick(5000);
    expect(source.progress()?.state).toBe('stopped');
  });

  it('새로고침으로 메모리가 비었으면 화면이 기억한 상태에서 이어 간다', async () => {
    const {source, updates, tick} = setup();
    source.connect(request, {runId: 'run-1', cursor: 2, total: 3, state: 'running', updatedAt: 't'}, (u) =>
      updates.push(u),
    );
    expect(updates[0]?.status.cursor).toBe(2);
    await tick(1000);
    expect(updates.at(-1)?.status.state).toBe('done');
  });
});
