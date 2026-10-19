// 로봇 실행 시작·일시정지·재개·비상 정지와 실행 기록. 화면은 이 함수들만 부르고 RunSource를 직접 다루지 않는다.

import {runSource} from '../adapters';
import type {StartRunRequest} from '../adapters/run/RunSource';
import {currentVersion, planSteps} from '../domain/plan';
import {
  appendEvent,
  appendSample,
  applyRunStatus,
  isRunActive,
  type RunLogEntry,
  type RunRecord,
  type TelemetrySample,
} from '../domain/run';
import {primaryThermalReading} from '../device/feed';
import {addEvent} from './chatController';
import {useAppStore} from './store';

let seq = 0;
const newRunId = () => `run-${Date.now().toString(36)}-${(seq += 1)}`;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function requestFor(run: RunRecord): StartRunRequest | null {
  const {plan} = useAppStore.getState();
  if (!plan || plan.id !== run.planId) return null;
  const version = plan.versions.find((v) => v.version === run.planVersion) ?? currentVersion(plan);
  return {
    runId: run.id,
    planId: run.planId,
    planVersion: run.planVersion,
    graphSnapshotId: run.graphSnapshotId,
    steps: planSteps(version.groups).map((s) => ({id: s.id, label: s.label})),
  };
}

/** 실행 기록을 고친다. 지금 실행이 아니면(새 대화로 넘어갔으면) 버린다. */
function updateRun(id: string, change: (run: RunRecord) => RunRecord) {
  const {run} = useAppStore.getState();
  if (run?.id !== id) return;
  const next = change(run);
  useAppStore.setState({run: next});
  if (next.state !== run.state) noteTransition(run.state, next);
}

/**
 * 상태가 바뀐 순간을 대화에도 한 줄 남긴다. 좁은 화면에서 대화 쪽을 보고 있어도 멈춤·정지를 알 수 있게.
 * 상태 스트림과 명령 응답 중 먼저 온 쪽에서 한 번만 불린다(updateRun이 바뀐 때만 부른다).
 */
function noteTransition(before: RunRecord['state'], run: RunRecord) {
  const at = `${run.cursor}/${run.total}동작`;
  if (run.state === 'paused') addEvent(`일시정지 · ${at}`);
  else if (run.state === 'running' && before === 'paused') addEvent('재개');
  else if (run.state === 'stopped') addEvent(`비상 정지 · ${at}에서 멈춤`);
  else if (run.state === 'done') addEvent('실행 완료 · 보고서를 볼 수 있습니다');
}

function log(id: string, entry: Omit<RunLogEntry, 'at'>) {
  updateRun(id, (r) => appendEvent(r, {...entry, at: new Date().toISOString()}));
}

let detach: (() => void) | null = null;

/** 지금 실행의 상태 스트림에 붙는다. 새로고침 뒤에도 앱이 이것을 불러 다시 붙는다. */
export function connectRun() {
  detach?.();
  detach = null;
  const {run} = useAppStore.getState();
  if (!run) return;
  const request = requestFor(run);
  if (!request) return;
  const id = run.id;
  const known = {
    runId: id,
    cursor: run.cursor,
    total: run.total,
    state: run.state,
    updatedAt: new Date().toISOString(),
  };
  detach = runSource.connect(request, isRunActive(run.state) ? known : null, ({status, event}) => {
    updateRun(id, (r) => applyRunStatus(r, status, event));
  });
}

export function disconnectRun() {
  detach?.();
  detach = null;
}

/**
 * 지금 계획으로 실행을 시작한다. 시작한 계획 버전을 실행 기록에 남기고, 이후로는 계획을 고칠 수 없다.
 * 로봇 서버가 시작을 받지 못하면 기록을 만들지 않고 이유를 돌려준다.
 */
export async function startRun(): Promise<{ok: true} | {ok: false; error: string}> {
  const {plan, run, confirmed} = useAppStore.getState();
  if (run && isRunActive(run.state)) return {ok: false, error: '이미 실행 중입니다.'};
  if (!plan || !confirmed || plan.graphSnapshotId !== confirmed.id)
    return {ok: false, error: '실행할 계획이 없습니다.'};
  const steps = planSteps(currentVersion(plan).groups);
  const record: RunRecord = {
    id: newRunId(),
    planId: plan.id,
    planVersion: plan.version,
    graphSnapshotId: plan.graphSnapshotId,
    startedAt: new Date().toISOString(),
    state: 'running',
    cursor: 0,
    total: steps.length,
    samples: [],
    events: [],
    source: runSource.source,
  };
  const request = requestFor(record);
  if (!request) return {ok: false, error: '실행할 계획이 없습니다.'};
  let status;
  try {
    status = await runSource.start(request);
  } catch (error) {
    // 로봇 서버가 시작을 받지 못했으면 실행 기록을 만들지 않는다. 계획은 그대로 고칠 수 있다.
    return {ok: false, error: errorText(error)};
  }
  const started = appendEvent(applyRunStatus(record, status), {
    at: record.startedAt,
    kind: 'start',
    message: `v${plan.version} 계획으로 실행을 시작했습니다. ${steps.length}동작.`,
    by: 'user',
  });
  useAppStore.setState({run: started, stage: 'monitoring'});
  connectRun();
  addEvent(`실행 시작 · 계획 v${plan.version}`);
  return {ok: true};
}

/** 명령을 보낸다. 실패하면 무엇을 못 했는지 앞에 붙인 문구를 돌려준다(E-STOP은 원인만, 단추가 안내를 붙인다). */
async function command(kind: 'pause' | 'resume' | 'estop'): Promise<string | null> {
  const {run} = useAppStore.getState();
  if (!run || !isRunActive(run.state)) return null;
  try {
    const status =
      kind === 'pause'
        ? await runSource.pause(run.id)
        : kind === 'resume'
          ? await runSource.resume(run.id)
          : await runSource.emergencyStop(run.id);
    updateRun(run.id, (r) => applyRunStatus(r, status));
    return null;
  } catch (error) {
    const label = kind === 'pause' ? '일시정지' : kind === 'resume' ? '재개' : '비상 정지';
    log(run.id, {kind: 'error', message: `${label} 명령을 보내지 못했습니다. ${errorText(error)}`, by: 'user'});
    if (kind === 'estop') return errorText(error);
    return `${label}하지 못했습니다. ${errorText(error)}`;
  }
}

export const pauseRun = () => command('pause');
export const resumeRun = () => command('resume');
export const emergencyStopRun = () => command('estop');

/** 장비 피드가 2초마다 부른다. 실행 중일 때만 표본을 쌓는다. */
export function recordSample() {
  const {run, telemetry, thermal} = useAppStore.getState();
  if (!run || !isRunActive(run.state) || !telemetry.lastUpdated || !telemetry.sensors) return;
  const s = telemetry.sensors;
  const reading = primaryThermalReading(thermal).value;
  const sample: TelemetrySample = {
    at: telemetry.lastUpdated,
    cursor: run.cursor,
    ...(typeof s.ph === 'number' && {ph: s.ph}),
    ...(typeof s.ec === 'number' && {ec: s.ec}),
    ...(typeof s.tds === 'number' && {tds: s.tds}),
    ...(typeof s.temp === 'number' && {temp: s.temp}),
    ...(typeof reading === 'number' && {thermal: reading}),
    ...(s.stale && {stale: true}),
  };
  updateRun(run.id, (r) => appendSample(r, sample));
}

/** 장비 오류는 바뀔 때만 기록에 남긴다(2초마다 같은 오류를 쌓지 않는다). */
export function recordDeviceError(message: string) {
  const {run} = useAppStore.getState();
  if (!run || !isRunActive(run.state)) return;
  const last = [...run.events].reverse().find((e) => e.kind === 'device');
  if (last?.message === message) return;
  log(run.id, {kind: 'device', message, by: 'system'});
}
