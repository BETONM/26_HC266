// 로봇 실행 계획. 묶음(무엇을 하는가) → 동작(로봇이 하는 일)의 두 단계 목록이다.
// 계획은 화면에서 직접 고치지 않는다. 수정은 채팅으로 요청하고, LLM이 새 버전을 통째로 낸다.
// 그래서 버전마다 전체 목록을 남긴다. 되돌리기와 '무엇이 바뀌었나'가 둘 다 이 기록에서 나온다.

import {isRecord, type DataSource} from '../graph/model';

export type PlanAction = {id: string; label: string};

/** 이 묶음이 어느 노드에서 나왔는가. note는 '5 mL · 지시약'처럼 그 노드를 쓰는 이유다. */
export type PlanBasis = {nodeId: string; note?: string};

export type PlanGroup = {id: string; title: string; target: string; actions: PlanAction[]; basis: PlanBasis[]};

export type PlanVersion = {version: number; summary: string; groups: PlanGroup[]};

export type ExecutionPlan = {
  id: string;
  /** 기준이 된 확정 그래프 스냅샷 id. 확정을 풀고 새로 확정하면 다른 계획이 된다. */
  graphSnapshotId: string;
  /** 지금 버전. versions의 마지막과 같다. */
  version: number;
  /** v1부터 지금까지. 되돌려도 지난 버전을 지우지 않고 새 버전으로 쌓는다. */
  versions: PlanVersion[];
  source: DataSource;
};

export type PlanStep = PlanAction & {group: PlanGroup; groupIndex: number; order: number};

export function currentVersion(plan: ExecutionPlan): PlanVersion {
  return plan.versions.at(-1)!;
}

export function versionOf(plan: ExecutionPlan, version: number): PlanVersion | undefined {
  return plan.versions.find((v) => v.version === version);
}

/** 묶음을 펼친 전체 동작. order는 0부터다. 화면 번호는 stepNumber로 만든다. */
export function planSteps(groups: readonly PlanGroup[]): PlanStep[] {
  let order = 0;
  return groups.flatMap((group, groupIndex) =>
    group.actions.map((action) => ({...action, group, groupIndex, order: order++})),
  );
}

/** 화면에 쓰는 전체 순번. 두 자리로 맞춰 '05 삭제'처럼 부르기 쉽게 한다. */
export function stepNumber(order: number): string {
  return String(order + 1).padStart(2, '0');
}

// 진행 위치(cursor)는 '끝난 동작의 수'다. steps[cursor]가 지금 실행 중인 동작이고,
// cursor가 전체 수와 같으면 계획이 끝난 상태다.
export function clampCursor(value: number, count: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(count, Math.max(0, Math.round(value)));
}

export function planProgress(groups: readonly PlanGroup[], cursor: number) {
  const steps = planSteps(groups);
  const done = clampCursor(cursor, steps.length);
  return {
    done,
    total: steps.length,
    active: done < steps.length ? steps[done]! : null,
    isComplete: done >= steps.length,
  };
}

/**
 * 앞 버전과 비교해 새로 생겼거나 자리가 바뀐 동작 id.
 * 하나를 맨 뒤로 옮기면 그 뒤의 동작은 번호만 당겨질 뿐이다. 그것까지 강조하면 무엇을 옮겼는지 묻힌다.
 * 그래서 두 순서의 최장 공통 부분열에 남은 동작은 '그대로'로 보고, 빠진 것만 바뀐 것으로 친다.
 * 다른 묶음으로 옮겨 간 동작도 바뀐 것이다.
 */
export function changedActionIds(before: readonly PlanGroup[] | undefined, after: readonly PlanGroup[]): string[] {
  const next = planSteps(after);
  if (!before) return [];
  const prev = planSteps(before);
  const prevGroup = new Map(prev.map((s) => [s.id, s.group.id]));
  const a = prev.map((s) => s.id);
  const b = next.map((s) => s.id);
  // LCS 표. 계획은 수십 동작이라 O(n²)로 충분하다.
  const table = Array.from({length: a.length + 1}, () => Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const kept = new Set<string>();
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) {
      kept.add(b[j]!);
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) i += 1;
    else j += 1;
  }
  return next.filter((s) => !kept.has(s.id) || prevGroup.get(s.id) !== s.group.id).map((s) => s.id);
}

/** 앞 버전에 있다가 이번 버전에서 빠진 동작. */
export function removedActions(before: readonly PlanGroup[] | undefined, after: readonly PlanGroup[]): PlanStep[] {
  if (!before) return [];
  const ids = new Set(planSteps(after).map((s) => s.id));
  return planSteps(before).filter((s) => !ids.has(s.id));
}

// ── 서버 응답 검증 ─────────────────────────────────────────────

const str = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function parseGroup(raw: unknown): PlanGroup | null {
  if (!isRecord(raw) || !str(raw.id) || !str(raw.title) || !Array.isArray(raw.actions)) return null;
  const actions = raw.actions.flatMap((a): PlanAction[] =>
    isRecord(a) && str(a.id) && str(a.label) ? [{id: a.id, label: a.label}] : [],
  );
  if (actions.length !== raw.actions.length) return null;
  const basis = Array.isArray(raw.basis)
    ? raw.basis.flatMap((b): PlanBasis[] =>
        isRecord(b) && str(b.nodeId) ? [{nodeId: b.nodeId, ...(str(b.note) && {note: b.note})}] : [],
      )
    : [];
  return {id: raw.id, title: raw.title, target: typeof raw.target === 'string' ? raw.target : '', actions, basis};
}

/**
 * 서버가 보낸 계획을 검증한다. 동작 하나라도 모양이 틀리면 계획 전체를 버린다.
 * 실행 직전의 목록에서 동작이 조용히 빠지는 쪽이 계획을 받지 못하는 쪽보다 위험하다.
 */
export function parsePlan(raw: unknown, source: DataSource): ExecutionPlan | null {
  if (!isRecord(raw) || !str(raw.id) || !str(raw.graphSnapshotId) || !Array.isArray(raw.versions)) return null;
  const versions: PlanVersion[] = [];
  for (const v of raw.versions) {
    if (!isRecord(v) || typeof v.version !== 'number' || !Array.isArray(v.groups)) return null;
    const groups = v.groups.map(parseGroup);
    if (groups.some((g) => g === null)) return null;
    versions.push({
      version: v.version,
      summary: typeof v.summary === 'string' ? v.summary : '',
      groups: groups as PlanGroup[],
    });
  }
  if (versions.length === 0) return null;
  // 같은 계획 안에서 동작 id가 겹치면 '바뀐 동작'과 진행 위치를 가릴 수 없다.
  for (const v of versions) {
    const ids = planSteps(v.groups).map((s) => s.id);
    if (new Set(ids).size !== ids.length) return null;
  }
  return {id: raw.id, graphSnapshotId: raw.graphSnapshotId, version: versions.at(-1)!.version, versions, source};
}
