import {describe, expect, it} from 'vitest';
import {draftFromTemplate} from '../../../domain/draft';
import {currentVersion, planSteps, stepNumber, type ExecutionPlan} from '../../../domain/plan';
import {createSeedGraph} from '../../graph/seed';
import {classifyIntent} from './intent';
import {editPlan, generatePlan, parsePlanEdit} from './plan';
import {describeRun, describeTelemetry} from './telemetry';
import type {TelemetrySnapshot} from '../../../chat/types';

const seed = createSeedGraph();
const clock = draftFromTemplate(seed, 'exp-clock', 'exp-draft-1')!;
const labels = (plan: ExecutionPlan) =>
  planSteps(currentVersion(plan).groups).map((s) => `${stepNumber(s.order)} ${s.label}`);

function edited(plan: ExecutionPlan, text: string): ExecutionPlan {
  const outcome = editPlan(plan, text);
  if (outcome.kind !== 'changed') throw new Error(outcome.reply);
  return outcome.plan;
}

describe('계획 만들기', () => {
  it('색 변화 실험은 이전 레포의 planSeeds(3묶음 16동작)를 쓴다', () => {
    const plan = generatePlan(seed, clock, 'cfg-1');
    const v1 = currentVersion(plan);
    expect(v1.groups.map((g) => `${g.title} · ${g.target}`)).toEqual([
      '시약 분주 · 녹말 지시약',
      '시약 분취 · 요오드산 칼륨',
      '반응 개시 · 교반 및 기구 정리',
    ]);
    expect(planSteps(v1.groups)).toHaveLength(16);
    // 같은 묶음 안 같은 이름이 있어도 id는 순번이라 겹치지 않는다.
    expect(new Set(planSteps(v1.groups).map((s) => s.id)).size).toBe(16);
    expect(v1.groups[0]!.basis[0]).toEqual({nodeId: 'chem-starch', note: '5 mL · 지시약'});
    expect(plan).toMatchObject({id: 'plan-cfg-1', graphSnapshotId: 'cfg-1', version: 1, source: 'mock'});
  });

  it('다른 실험은 USES·REQUIRES에서 규칙으로 만든다', () => {
    const spec = draftFromTemplate(seed, 'exp-precipitation', 'exp-draft-1')!;
    const plan = generatePlan(seed, spec, 'cfg-2');
    expect(labels(plan)).toEqual([
      '01 시약병 파지',
      '02 레일 이동 · 반응 비커',
      '03 반응 비커에 분주 · 25 mL',
      '04 레일 이동 · 시약 보관대',
      '05 시약병 안치',
      '06 시약병 파지',
      '07 레일 이동 · 반응 비커',
      '08 반응 비커에 분주 · 25 mL',
      '09 레일 이동 · 시약 보관대',
      '10 시약병 안치',
      '11 반응 비커 교반',
      '12 반응 비커 안치',
      '13 레일 이동 · 기구 선반',
      '14 메스실린더 정리',
    ]);
    expect(currentVersion(plan).groups.map((g) => g.target)).toEqual([
      '염화 칼슘 수용액',
      '탄산 나트륨 수용액',
      '교반 및 기구 정리',
    ]);
  });

  it('색 변화 실험이라도 시약을 바꾼 구성은 규칙으로 만든다', () => {
    const changed = {...clock, uses: clock.uses.filter((u) => u.chemicalId !== 'chem-starch')};
    const plan = generatePlan(seed, changed, 'cfg-3');
    expect(currentVersion(plan).groups[0]!.id).toBe('dispense-chem-nahso3');
    // 센서가 필요한 구성은 첫 시약을 넣기 전에 프로브를 꽂는다.
    expect(labels(plan).slice(0, 3)).toEqual(['01 시약병 파지', '02 레일 이동 · 반응 비커', '03 센서 프로브 삽입']);
  });

  it('같은 입력에는 같은 계획이다', () => {
    expect(generatePlan(seed, clock, 'cfg-1')).toEqual(generatePlan(seed, clock, 'cfg-1'));
  });
});

describe('채팅으로 계획 고치기', () => {
  const v1 = generatePlan(seed, clock, 'cfg-1');

  it('읽는 말', () => {
    expect(parsePlanEdit('교반을 맨 뒤로')).toEqual({kind: 'move', target: {name: '교반'}, to: 'end'});
    expect(parsePlanEdit('센서 프로브 삽입을 마개 개방 뒤로')).toEqual({
      kind: 'move',
      target: {name: '센서 프로브 삽입'},
      to: 'after',
      anchor: {name: '마개 개방'},
    });
    expect(parsePlanEdit('05 삭제')).toEqual({kind: 'remove', target: {number: 5}});
    expect(parsePlanEdit('5번 동작 빼 줘')).toEqual({kind: 'remove', target: {number: 5}});
    expect(parsePlanEdit('되돌려 줘')).toEqual({kind: 'revert'});
    expect(parsePlanEdit('v1로 되돌려 줘')).toEqual({kind: 'revert', version: 1});
    expect(parsePlanEdit('좀 더 빠르게 해 줘')).toEqual({kind: 'unknown'});
  });

  it('교반을 맨 뒤로 → v2, 바뀐 요약', () => {
    const v2 = edited(v1, '교반을 맨 뒤로');
    expect(v2.version).toBe(2);
    expect(v2.versions.at(-1)!.summary).toBe('반응 비커 교반을 맨 뒤로');
    expect(labels(v2).at(-1)).toBe('16 반응 비커 교반');
    expect(v2.versions[0]).toEqual(v1.versions[0]);
  });

  it('센서 프로브 삽입을 마개 개방 뒤로', () => {
    const v2 = edited(v1, '센서 프로브 삽입을 마개 개방 뒤로');
    expect(labels(v2).slice(2, 4)).toEqual(['03 마개 개방', '04 센서 프로브 삽입']);
    expect(v2.versions.at(-1)!.summary).toBe('센서 프로브 삽입을 마개 개방 뒤로');
  });

  it('05 삭제 → 번호가 당겨진다', () => {
    const outcome = editPlan(v1, '05 삭제');
    expect(outcome.kind).toBe('changed');
    if (outcome.kind !== 'changed') return;
    expect(outcome.reply).toContain('05 반응 비커에 분주를 뺐습니다');
    expect(labels(outcome.plan)).toHaveLength(15);
    expect(labels(outcome.plan)[4]).toBe('05 마개 폐쇄');
  });

  it('이름이 여러 동작에 맞으면 번호로 되묻고 계획을 바꾸지 않는다', () => {
    const outcome = editPlan(v1, '레일 이동 · 시험관대 삭제');
    expect(outcome.kind).toBe('unchanged');
    expect(outcome.reply).toContain("'레일 이동 · 시험관대'에 맞는 동작이 2개");
    expect(outcome.reply).toContain('- 09 레일 이동 · 시험관대');
    expect(outcome.reply).toContain('- 15 레일 이동 · 시험관대');
    // '레일 이동'은 레일 이동 다섯 개 모두에 맞는다.
    expect(editPlan(v1, '레일 이동 삭제').reply).toContain('5개');
  });

  it('알아듣지 못했거나 없는 동작이면 그대로 둔다', () => {
    expect(editPlan(v1, '좀 더 빠르게 해 줘').kind).toBe('unchanged');
    expect(editPlan(v1, '30 삭제').reply).toContain('01부터 16까지');
    expect(editPlan(v1, '녹말 지시약 빼 줘').reply).toContain("'녹말 지시약'에 맞는 동작을 찾지 못해");
    expect(editPlan(v1, '되돌려 줘').reply).toContain('첫 버전');
    expect(editPlan(v1, '반응 비커 교반을 반응 비커 교반 뒤로').kind).toBe('unchanged');
  });

  it('되돌리기는 지난 버전을 지우지 않고 새 버전으로 쌓는다', () => {
    const v2 = edited(v1, '교반을 맨 뒤로');
    const v3 = edited(v2, '되돌려 줘');
    expect(v3.version).toBe(3);
    expect(v3.versions.map((v) => v.summary)).toEqual([
      '확정한 구성으로 만듦',
      '반응 비커 교반을 맨 뒤로',
      'v1로 되돌림',
    ]);
    expect(labels(v3)).toEqual(labels(v1));
    expect(labels(edited(v3, 'v2로 되돌려 줘'))).toEqual(labels(v2));
  });

  it('계획이 있으면 빼기·옮기기 말은 계획 수정으로 분류한다', () => {
    const intent = (text: string) => classifyIntent(text, {mentionsInventory: true, hasPlan: true}).kind;
    expect(intent('반응 비커 교반 삭제')).toBe('plan-edit');
    expect(intent('05 삭제')).toBe('plan-edit');
    expect(intent('센서 프로브 삽입을 마개 개방 뒤로')).toBe('plan-edit');
    expect(classifyIntent('녹말 빼 줘', {mentionsInventory: true}).kind).toBe('modify');
  });
});

describe('실행 중 질문', () => {
  const snapshot: TelemetrySnapshot = {
    at: '2026-10-17T03:04:05.000Z',
    sensors: {ph: 6.523, ec: 1004.2, tds: 502.1, temp: 23.81},
    sensorError: null,
    thermal: {value: 26.14, caption: '프레임 최고 온도'},
    devices: [],
    run: {
      state: 'running',
      cursor: 6,
      total: 16,
      current: {order: 6, label: '레일 이동 · 시약 보관대', group: '시약 분주 · 녹말 지시약'},
      next: '시약병 안치',
    },
  };
  const intent = (text: string) => classifyIntent(text, {mentionsInventory: false, hasPlan: true, hasRun: true}).kind;

  it('분류: 실행 중이면 값·진행 질문', () => {
    expect(intent('지금 pH 얼마야?')).toBe('telemetry');
    expect(intent('지금 뭐 하는 중이야?')).toBe('run-status');
    expect(classifyIntent('지금 pH 얼마야?', {mentionsInventory: false}).kind).not.toBe('telemetry');
  });

  it('물은 값을 먼저, 받은 시각과 함께', () => {
    const answer = describeTelemetry(snapshot, '지금 pH 얼마야?');
    expect(answer.startsWith('지금 pH 6.52입니다(')).toBe(true);
    expect(answer).toContain('그 밖에: 전도도 1004 µS/cm, TDS 502 ppm, 열화상 26.1 °C(프레임 최고 온도)');
    expect(describeTelemetry({...snapshot, sensors: {...snapshot.sensors, stale: true}}, 'pH')).toContain(
      '오래된 데이터',
    );
    expect(describeTelemetry(null, 'pH')).toContain('값을 지어내지 않으려고');
  });

  it('진행: 지금 동작, 마친 수, 다음', () => {
    expect(describeRun(snapshot)).toBe(
      '지금 07 레일 이동 · 시약 보관대(시약 분주 · 녹말 지시약)를 하는 중입니다. 16동작 중 6개를 마쳤습니다(38%). 다음은 시약병 안치입니다.',
    );
    expect(describeRun({...snapshot, run: {...snapshot.run!, state: 'stopped'}})).toContain('비상 정지로 멈춘 상태');
    expect(describeRun(null)).toContain('아직 실행을 시작하지 않았습니다');
  });
});
