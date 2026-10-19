// 목업 로봇 실행. 타이머로 동작을 하나씩 끝낸다. 일시정지하면 그 동작에서 쓴 시간을 기억했다가 재개 때 이어 간다.
// E-STOP은 진행만 멈추고 로그를 남긴다. 실제 장비에는 아무 신호도 가지 않는다.

import {stepNumber} from '../../domain/plan';
import {isRunActive, type RunLogEntry, type RunState, type RunStatus} from '../../domain/run';
import {createFaultInjector, MockFaultError, type FaultOptions} from '../faults';
import type {RunSource, RunUpdate, StartRunRequest} from './RunSource';

export type MockRunOptions = {
  /** 동작 하나에 걸리는 시간(ms). */
  stepMs?: number;
  faults?: FaultOptions;
  now?: () => number;
};

type MockRun = {
  request: StartRunRequest;
  status: RunStatus;
  /** 지금 동작을 시작한(또는 재개한) 시각. */
  stepStartedAt: number;
  /** 일시정지 전까지 지금 동작에 쓴 시간. */
  spentInStep: number;
  timer?: ReturnType<typeof setTimeout>;
  listeners: Set<(update: RunUpdate) => void>;
};

export const MOCK_ESTOP_NOTE = '목업 실행이라 실제 장비에는 정지 신호를 보내지 않았습니다(실제 장비 미연결).';

export class MockRunSource implements RunSource {
  readonly source = 'mock' as const;
  private runs = new Map<string, MockRun>();
  private latest: string | null = null;
  private stepMs: number;
  private faults;
  private now: () => number;

  constructor(options: MockRunOptions = {}) {
    this.stepMs = Math.max(1, options.stepMs ?? 3000);
    this.faults = createFaultInjector(options.faults);
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * 가장 최근 실행이 어디까지 갔나(0~1, 진행 중인 동작의 경과 포함). 목업 장비가 센서 값과 장면을 이것에 맞춘다.
   * 실행이 없으면 null.
   */
  progress(): {fraction: number; state: RunState} | null {
    const run = this.latest ? this.runs.get(this.latest) : undefined;
    if (!run) return null;
    const {cursor, total, state} = run.status;
    const inStep = state === 'running' ? run.spentInStep + (this.now() - run.stepStartedAt) : run.spentInStep;
    const partial = isRunActive(state) ? Math.min(1, inStep / this.stepMs) : 0;
    return {fraction: total === 0 ? 1 : Math.min(1, (cursor + partial) / total), state};
  }

  async start(request: StartRunRequest, signal?: AbortSignal): Promise<RunStatus> {
    await this.command(signal);
    const run = this.create(request, {
      runId: request.runId,
      cursor: 0,
      total: request.steps.length,
      state: 'running',
      updatedAt: this.stamp(),
    });
    this.emit(run, {
      kind: 'start',
      message: `v${request.planVersion} 계획으로 실행을 시작했습니다. ${request.steps.length}동작.`,
      by: 'user',
    });
    this.schedule(run);
    return run.status;
  }

  connect(request: StartRunRequest, known: RunStatus | null, listener: (update: RunUpdate) => void): () => void {
    let run = this.runs.get(request.runId);
    // 새로고침으로 목업 메모리가 비었으면 화면이 기억한 상태에서 이어 간다.
    if (!run && known) {
      run = this.create(request, {...known, updatedAt: this.stamp()});
      if (known.state === 'running') this.schedule(run);
    }
    if (!run) return () => {};
    run.listeners.add(listener);
    listener({status: run.status});
    return () => run.listeners.delete(listener);
  }

  async pause(runId: string, signal?: AbortSignal): Promise<RunStatus> {
    await this.command(signal);
    const run = this.require(runId);
    if (run.status.state !== 'running') return run.status;
    this.clear(run);
    run.spentInStep += this.now() - run.stepStartedAt;
    this.update(run, 'paused', {kind: 'pause', message: '일시정지했습니다.', by: 'user'});
    return run.status;
  }

  async resume(runId: string, signal?: AbortSignal): Promise<RunStatus> {
    await this.command(signal);
    const run = this.require(runId);
    if (run.status.state !== 'paused') return run.status;
    run.stepStartedAt = this.now();
    this.update(run, 'running', {kind: 'resume', message: '재개했습니다.', by: 'user'});
    this.schedule(run);
    return run.status;
  }

  async emergencyStop(runId: string): Promise<RunStatus> {
    // 비상 정지는 지연·실패 주입을 거치지 않는다. 멈추라는 명령이 목업 때문에 늦어지면 안 된다.
    const run = this.require(runId);
    if (!isRunActive(run.status.state)) return run.status;
    this.clear(run);
    this.update(run, 'stopped', {kind: 'estop', message: `E-STOP. ${MOCK_ESTOP_NOTE}`, by: 'user'});
    return run.status;
  }

  // ── 내부 ──

  private stamp() {
    return new Date(this.now()).toISOString();
  }

  private async command(signal?: AbortSignal) {
    try {
      await this.faults.run(signal);
    } catch (error) {
      if (error instanceof MockFaultError)
        throw new Error(`로봇 서버가 명령을 받지 못했습니다. ${error.message}`, {cause: error});
      throw error;
    }
  }

  private create(request: StartRunRequest, status: RunStatus): MockRun {
    const old = this.runs.get(request.runId);
    if (old) this.clear(old);
    const run: MockRun = {
      request,
      status,
      stepStartedAt: this.now(),
      spentInStep: 0,
      listeners: old?.listeners ?? new Set(),
    };
    this.runs.set(request.runId, run);
    this.latest = request.runId;
    return run;
  }

  private require(runId: string): MockRun {
    const run = this.runs.get(runId);
    if (!run) throw new Error('이 실행을 로봇 서버가 모릅니다. 화면을 새로 고쳐 다시 연결해 주세요.');
    return run;
  }

  private clear(run: MockRun) {
    if (run.timer !== undefined) clearTimeout(run.timer);
    run.timer = undefined;
  }

  private schedule(run: MockRun) {
    this.clear(run);
    run.timer = setTimeout(() => this.advance(run), Math.max(0, this.stepMs - run.spentInStep));
  }

  private advance(run: MockRun) {
    run.timer = undefined;
    if (run.status.state !== 'running') return;
    const done = run.request.steps[run.status.cursor];
    const cursor = run.status.cursor + 1;
    run.spentInStep = 0;
    run.stepStartedAt = this.now();
    run.status = {...run.status, cursor, updatedAt: this.stamp()};
    this.emit(run, {
      kind: 'step',
      message: `${stepNumber(cursor - 1)} ${done?.label ?? ''} 완료`,
      by: 'system',
      cursor,
    });
    if (cursor >= run.status.total) {
      this.update(run, 'done', {kind: 'done', message: '계획의 모든 동작을 마쳤습니다.', by: 'system'});
      return;
    }
    this.schedule(run);
  }

  private update(run: MockRun, state: RunState, event: Omit<RunLogEntry, 'at'>) {
    run.status = {...run.status, state, updatedAt: this.stamp()};
    this.emit(run, event);
  }

  private emit(run: MockRun, event: Omit<RunLogEntry, 'at'>) {
    const update: RunUpdate = {
      status: run.status,
      event: {...event, at: run.status.updatedAt, cursor: event.cursor ?? run.status.cursor},
    };
    for (const listener of run.listeners) listener(update);
  }
}
