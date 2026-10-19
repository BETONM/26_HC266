import {describe, expect, it} from 'vitest';
import {toChatEvent} from '../chat/events';
import {changedActionIds, parsePlan, planProgress, planSteps, removedActions, stepNumber, type PlanGroup} from './plan';

const group = (id: string, labels: string[]): PlanGroup => ({
  id,
  title: id,
  target: '',
  actions: labels.map((label, i) => ({id: `${id}-${i + 1}`, label})),
  basis: [],
});

const groups = [group('a', ['파지', '이동', '분주']), group('b', ['교반', '안치'])];

describe('계획 순번과 진행 위치', () => {
  it('묶음을 펼쳐 전체 순번을 매긴다', () => {
    expect(planSteps(groups).map((s) => `${stepNumber(s.order)} ${s.label}`)).toEqual([
      '01 파지',
      '02 이동',
      '03 분주',
      '04 교반',
      '05 안치',
    ]);
  });

  it('cursor는 끝난 동작의 수다', () => {
    expect(planProgress(groups, 0).active?.label).toBe('파지');
    expect(planProgress(groups, 3).active?.label).toBe('교반');
    expect(planProgress(groups, 5)).toMatchObject({done: 5, active: null, isComplete: true});
    expect(planProgress(groups, 99).done).toBe(5);
    expect(planProgress(groups, Number.NaN).done).toBe(0);
  });
});

describe('changedActionIds', () => {
  it('맨 뒤로 옮긴 동작만 바뀐 것으로 본다. 번호만 당겨진 동작은 그대로다', () => {
    const moved = [
      group('a', ['파지', '이동', '분주']),
      {...group('b', []), actions: [groups[1]!.actions[1]!, groups[0]!.actions[0]!]},
    ];
    moved[0]!.actions = moved[0]!.actions.slice(1);
    expect(changedActionIds(groups, moved)).toEqual(['a-1']);
  });

  it('다른 묶음으로 옮겨 간 동작은 순서가 같아도 바뀐 것이다', () => {
    const regrouped = [
      {...groups[0]!, actions: groups[0]!.actions.slice(0, 2)},
      {...groups[1]!, actions: [groups[0]!.actions[2]!, ...groups[1]!.actions]},
    ];
    expect(changedActionIds(groups, regrouped)).toEqual(['a-3']);
  });

  it('첫 버전에는 바뀐 동작이 없고, 뺀 동작은 따로 알 수 있다', () => {
    expect(changedActionIds(undefined, groups)).toEqual([]);
    const removed = [groups[0]!, {...groups[1]!, actions: groups[1]!.actions.slice(1)}];
    expect(changedActionIds(groups, removed)).toEqual([]);
    expect(removedActions(groups, removed).map((s) => s.id)).toEqual(['b-1']);
  });
});

describe('parsePlan', () => {
  const raw = {id: 'plan-1', graphSnapshotId: 'cfg-1', versions: [{version: 1, summary: '만듦', groups}]};

  it('버전 목록에서 지금 버전을 정한다', () => {
    const plan = parsePlan({...raw, versions: [...raw.versions, {version: 2, summary: '바꿈', groups}]}, 'live');
    expect(plan).toMatchObject({version: 2, source: 'live'});
  });

  it('동작 하나라도 모양이 틀리거나 id가 겹치면 계획 전체를 버린다', () => {
    const broken = {...raw, versions: [{version: 1, groups: [{...groups[0], actions: [{id: 'x'}]}]}]};
    expect(parsePlan(broken, 'live')).toBeNull();
    const duplicated = {...raw, versions: [{version: 1, groups: [group('a', ['파지']), group('a', ['이동'])]}]};
    expect(parsePlan(duplicated, 'live')).toBeNull();
    expect(parsePlan({...raw, versions: []}, 'live')).toBeNull();
  });

  it('서버의 plan 이벤트도 같은 검증을 거친다', () => {
    expect(toChatEvent({type: 'plan', plan: raw})).toMatchObject({type: 'plan', plan: {version: 1, source: 'live'}});
    expect(toChatEvent({type: 'plan', plan: {id: 'p', version: 1}})).toBeNull();
  });
});
