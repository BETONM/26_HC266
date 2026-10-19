// 로봇 실행과 그 기록. 진행 위치(cursor)는 계획과 같이 '끝난 동작의 수'다.
// 실행 기록은 6단계 보고서의 입력이라, 실행하는 동안 센서 시계열·진행 이벤트·오류·사용자 조작을 모두 쌓는다.

import type {DataSource} from '../graph/model';
import {clampCursor, planSteps, type PlanGroup, type PlanStep} from './plan';

export type RunState = 'running' | 'paused' | 'done' | 'stopped';

export const runStateLabel: Record<RunState, string> = {
  running: '진행 중',
  paused: '일시정지',
  done: '완료',
  stopped: '비상 정지',
};

/**
 * 실행 화면의 시각 표기 '13:47:40'. 장비 로그는 고정폭 글꼴이라 '13시 47분'처럼 한글이 섞이면 칸이 어긋난다.
 * 그래서 로캘 표기 대신 24시간 숫자로 맞춘다.
 */
export function clockTime(iso: string | null | undefined, withSeconds = true): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getHours())}:${two(d.getMinutes())}${withSeconds ? `:${two(d.getSeconds())}` : ''}`;
}

/** 시작부터 지금(끝났으면 끝난 때)까지 걸린 시간. '4:07', 한 시간이 넘으면 '1:02:07'. */
export function elapsedTime(startIso: string, endIso: string | null | undefined, nowMs: number): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : nowMs;
  if (Number.isNaN(start) || Number.isNaN(end)) return '—';
  const total = Math.max(0, Math.floor((end - start) / 1000));
  const two = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

export const isRunActive = (state: RunState) => state === 'running' || state === 'paused';

export type RunStatus = {runId: string; cursor: number; total: number; state: RunState; updatedAt: string};

export type RunLogKind = 'start' | 'step' | 'pause' | 'resume' | 'estop' | 'done' | 'error' | 'device';

/** 실행 로그 한 줄. by는 누가 일으켰나: 사용자 조작(일시정지·E-STOP)과 장치·로봇이 낸 것을 가른다. */
export type RunLogEntry = {at: string; kind: RunLogKind; message: string; by: 'user' | 'system'; cursor?: number};

/** 2초마다 쌓는 센서 표본. 값이 없던 항목은 비워 둔다(0으로 채우면 보고서 그래프가 거짓말을 한다). */
export type TelemetrySample = {
  at: string;
  cursor: number;
  ph?: number;
  ec?: number;
  tds?: number;
  temp?: number;
  /** 열화상 대표값(추적 영역 평균, 없으면 프레임 최고). */
  thermal?: number;
  stale?: boolean;
};

export type RunRecord = {
  id: string;
  planId: string;
  /** 시작 시점의 계획 버전. 이 뒤로 계획은 바뀌지 않는다. */
  planVersion: number;
  graphSnapshotId: string;
  startedAt: string;
  endedAt?: string;
  state: RunState;
  cursor: number;
  total: number;
  samples: TelemetrySample[];
  events: RunLogEntry[];
  source: DataSource;
};

/** 로봇이 보낸 상태를 기록에 반영한다. 끝났으면(완료·비상 정지) 종료 시각을 한 번만 적는다. */
export function applyRunStatus(record: RunRecord, status: RunStatus, event?: RunLogEntry): RunRecord {
  const ended = !isRunActive(status.state);
  return {
    ...record,
    state: status.state,
    cursor: clampCursor(status.cursor, status.total),
    total: status.total,
    endedAt: ended ? (record.endedAt ?? status.updatedAt) : record.endedAt,
    events: event ? [...record.events, event] : record.events,
  };
}

/** 한 실행이 너무 길어도 저장소를 넘치지 않게 표본 수에 상한을 둔다. 2초 간격이면 2시간 분량이다. */
export const MAX_SAMPLES = 3600;

export function appendSample(record: RunRecord, sample: TelemetrySample): RunRecord {
  const last = record.samples.at(-1);
  // 같은 폴링 결과를 두 번 쌓지 않는다.
  if (last && last.at === sample.at) return record;
  return {...record, samples: [...record.samples, sample].slice(-MAX_SAMPLES)};
}

export function appendEvent(record: RunRecord, event: RunLogEntry): RunRecord {
  return {...record, events: [...record.events, event]};
}

// ── 진행 표시: 묶음마다 앞뒤 세 동작만 ───────────────────────────

export const PLAN_WINDOW = 3;

/**
 * 묶음 안에서 보여 줄 세 동작의 시작 위치(이전 레포 planWindowStart).
 * 아직 시작 안 한 묶음은 처음부터, 이미 끝난 묶음은 마지막 세 개, 진행 중인 묶음은 현재 동작을 가운데에.
 */
export function planWindowStart(groupSteps: readonly PlanStep[], cursor: number): number {
  const length = groupSteps.length;
  if (length === 0) return 0;
  const offset = groupSteps[0]!.order;
  const focus = cursor < offset ? 0 : cursor >= offset + length ? length - 1 : cursor - offset;
  return Math.min(Math.max(0, length - PLAN_WINDOW), Math.max(0, focus - 1));
}

export type StepState = 'done' | 'active' | 'todo';

export function stepState(order: number, cursor: number, state: RunState): StepState {
  if (order < cursor) return 'done';
  // 비상 정지나 완료 뒤에는 '지금 하는 중'인 동작이 없다.
  return order === cursor && isRunActive(state) ? 'active' : 'todo';
}

export function groupWindows(groups: readonly PlanGroup[], cursor: number) {
  const steps = planSteps(groups);
  return groups.map((group) => {
    const own = steps.filter((s) => s.group.id === group.id);
    const start = planWindowStart(own, cursor);
    return {
      group,
      steps: own,
      visible: own.slice(start, start + PLAN_WINDOW),
      hiddenBefore: start,
      hiddenAfter: Math.max(0, own.length - start - PLAN_WINDOW),
    };
  });
}
