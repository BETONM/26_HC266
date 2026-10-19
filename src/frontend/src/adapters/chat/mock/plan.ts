// 목업 LLM의 실행 계획. 만들기(확정한 구성 → v1)와 채팅 수정(옮기기·빼기·되돌리기 → 새 버전)을 한다.
// 실제 LLM이 붙으면 이 일은 서버가 하고, 화면은 plan 이벤트로 받은 결과만 그린다.

import {draftFromTemplate, type DraftSpec} from '../../../domain/draft';
import {
  currentVersion,
  planSteps,
  stepNumber,
  versionOf,
  type ExecutionPlan,
  type PlanBasis,
  type PlanGroup,
  type PlanStep,
} from '../../../domain/plan';
import {hasLabel, usageRoleLabel, type GraphSnapshot} from '../../../graph/model';
import {formatAmount, withParticle} from './korean';

// 이전 레포 experimentPlan.ts의 planSeeds. 색 변화 실험(템플릿 그대로)일 때만 쓴다.
// 이전 계획과 같게 아황산 수소 나트륨은 따로 분주하지 않는다(시드 내용을 바꾸지 않았다).
const CLOCK_TEMPLATE_ID = 'exp-clock';
const CLOCK_SEEDS: {id: string; title: string; target: string; actions: string[]; basis: PlanBasis[]}[] = [
  {
    id: 'reagent-starch',
    title: '시약 분주',
    target: '녹말 지시약',
    actions: [
      '시약병 파지',
      '레일 이동 · 반응 비커',
      '센서 프로브 삽입',
      '마개 개방',
      '반응 비커에 분주',
      '마개 폐쇄',
      '레일 이동 · 시약 보관대',
      '시약병 안치',
    ],
    basis: [
      {nodeId: 'chem-starch'},
      {nodeId: 'eq-beaker-100', note: '분주할 곳'},
      {nodeId: 'dev-ph', note: '센서 프로브'},
      {nodeId: 'dev-temp', note: '센서 프로브'},
      {nodeId: 'dev-arm', note: '파지·분주'},
      {nodeId: 'dev-rail', note: '레일 이동'},
    ],
  },
  {
    id: 'cylinder-iodate',
    title: '시약 분취',
    target: '요오드산 칼륨',
    actions: ['레일 이동 · 시험관대', '메스실린더 파지', '레일 이동 · 반응 비커', '반응 비커에 주입'],
    basis: [
      {nodeId: 'chem-kio3'},
      {nodeId: 'eq-cylinder-50', note: '분취'},
      {nodeId: 'eq-tube-rack', note: '메스실린더 자리'},
      {nodeId: 'eq-beaker-100', note: '주입할 곳'},
    ],
  },
  {
    id: 'reaction-stir',
    title: '반응 개시',
    target: '교반 및 기구 정리',
    actions: ['반응 비커 교반', '반응 비커 안치', '레일 이동 · 시험관대', '메스실린더 안치'],
    basis: [
      {nodeId: 'eq-beaker-100', note: '교반'},
      {nodeId: 'eq-cylinder-50', note: '정리'},
      {nodeId: 'eq-tube-rack', note: '정리할 곳'},
    ],
  },
];

// 같은 묶음 안에 '레일 이동 · 시험관대'처럼 같은 이름이 나오므로 id는 이름이 아니라 순번으로 만든다.
const withIds = (id: string, labels: string[]) => labels.map((label, i) => ({id: `${id}-${i + 1}`, label}));

function nameOf(inventory: GraphSnapshot, id: string): string {
  return String(inventory.nodes.find((n) => n.id === id)?.properties.name ?? id);
}

/** 시약 노드의 근거에는 이 실험이 쓰는 양과 역할을 붙인다. */
function usageNote(spec: DraftSpec, chemicalId: string): string | undefined {
  const use = spec.uses.find((u) => u.chemicalId === chemicalId);
  return use ? `${formatAmount(use.amount)} ${use.unit} · ${usageRoleLabel[use.role]}` : undefined;
}

function isClockAsTemplate(inventory: GraphSnapshot, spec: DraftSpec): boolean {
  if (spec.templateId !== CLOCK_TEMPLATE_ID) return false;
  const template = draftFromTemplate(inventory, CLOCK_TEMPLATE_ID, spec.id);
  const ids = (s: DraftSpec) =>
    s.uses
      .map((u) => u.chemicalId)
      .sort()
      .join();
  return template !== null && ids(template) === ids(spec);
}

function clockGroups(spec: DraftSpec): PlanGroup[] {
  const present = new Set([...spec.uses.map((u) => u.chemicalId), ...spec.requires.map((r) => r.targetId)]);
  return CLOCK_SEEDS.map((seed) => ({
    id: seed.id,
    title: seed.title,
    target: seed.target,
    actions: withIds(seed.id, seed.actions),
    // 확정 그래프에 없는 노드는 근거로 들지 않는다.
    basis: seed.basis
      .filter((b) => present.has(b.nodeId))
      .map((b) => (b.note ? b : {...b, ...(usageNote(spec, b.nodeId) && {note: usageNote(spec, b.nodeId)})})),
  }));
}

/** 템플릿이 아닌 구성: 시약마다 파지 → 이동 → 분주 → 이동 → 안치, 마지막에 교반·정리. */
function ruleGroups(inventory: GraphSnapshot, spec: DraftSpec): PlanGroup[] {
  const required = spec.requires
    .map((r) => inventory.nodes.find((n) => n.id === r.targetId))
    .filter((n) => n !== undefined);
  const equipment = required.filter((n) => hasLabel(n, 'Equipment'));
  const beaker = equipment.find((n) => String(n.properties.name).includes('비커'));
  const vessel = beaker ? String(beaker.properties.name) : '반응 용기';
  const sensors = required.filter((n) => hasLabel(n, 'Device') && n.properties.kind === 'sensor');
  const arm = required.find((n) => hasLabel(n, 'Device') && n.properties.kind === 'robot-arm');
  const rail = required.find((n) => hasLabel(n, 'Device') && n.properties.kind === 'rail');
  const common: PlanBasis[] = [
    ...(beaker ? [{nodeId: beaker.id, note: '분주할 곳'}] : []),
    ...(arm ? [{nodeId: arm.id, note: '파지·분주'}] : []),
    ...(rail ? [{nodeId: rail.id, note: '레일 이동'}] : []),
  ];

  const groups = spec.uses.map((use, index): PlanGroup => {
    const id = `dispense-${use.chemicalId}`;
    const verb = use.role === 'titrant' ? '적하' : '분주';
    const labels = [
      '시약병 파지',
      `레일 이동 · ${vessel}`,
      `${vessel}에 ${verb} · ${formatAmount(use.amount)} ${use.unit}`,
      '레일 이동 · 시약 보관대',
      '시약병 안치',
    ];
    // 센서는 첫 시약을 넣기 전에 한 번만 꽂는다.
    if (index === 0 && sensors.length > 0) labels.splice(2, 0, '센서 프로브 삽입');
    return {
      id,
      title: use.role === 'titrant' ? '적정' : '시약 분주',
      target: nameOf(inventory, use.chemicalId),
      actions: withIds(id, labels),
      basis: [
        {nodeId: use.chemicalId, note: usageNote(spec, use.chemicalId)!},
        ...common,
        ...(index === 0 ? sensors.map((s) => ({nodeId: s.id, note: '센서 프로브'})) : []),
      ],
    };
  });

  const others = equipment.filter((n) => n !== beaker);
  groups.push({
    id: 'finish',
    title: '반응 개시',
    target: '교반 및 기구 정리',
    actions: withIds('finish', [
      `${vessel} 교반`,
      `${vessel} 안치`,
      ...(others.length > 0
        ? ['레일 이동 · 기구 선반', ...others.map((n) => `${String(n.properties.name)} 정리`)]
        : []),
    ]),
    basis: [
      ...(beaker ? [{nodeId: beaker.id, note: '교반'}] : []),
      ...others.map((n) => ({nodeId: n.id, note: '정리'})),
    ],
  });
  return groups;
}

/** 확정한 구성으로 v1 계획을 만든다. */
export function generatePlan(inventory: GraphSnapshot, spec: DraftSpec, graphSnapshotId: string): ExecutionPlan {
  const groups = isClockAsTemplate(inventory, spec) ? clockGroups(spec) : ruleGroups(inventory, spec);
  return {
    id: `plan-${graphSnapshotId}`,
    graphSnapshotId,
    version: 1,
    versions: [{version: 1, summary: '확정한 구성으로 만듦', groups}],
    source: 'mock',
  };
}

// ── 채팅 수정 ──────────────────────────────────────────────────

/** 동작을 가리키는 말: 전체 순번(1부터) 또는 이름 일부. */
export type StepRef = {number: number} | {name: string};

export type PlanEdit =
  | {kind: 'move'; target: StepRef; to: 'start' | 'end'}
  | {kind: 'move'; target: StepRef; to: 'after' | 'before'; anchor: StepRef}
  | {kind: 'remove'; target: StepRef}
  | {kind: 'revert'; version?: number}
  | {kind: 'unknown'};

const normalize = (text: string) => text.replace(/[\s·]/g, '').toLowerCase();

/** '05번 동작을' → {number: 5}, '마개 개방을' → {name: '마개 개방'}. */
function readRef(raw: string): StepRef | null {
  const text = raw
    .trim()
    .replace(/(을|를|은|는|이|가)$/, '')
    .replace(/\s*동작$/, '')
    .trim();
  const number = /^(\d{1,3})\s*번?$/.exec(text);
  if (number) return {number: Number(number[1])};
  return text.length > 0 ? {name: text} : null;
}

export function parsePlanEdit(input: string): PlanEdit {
  const text = input.trim().replace(/[.!?。]+$/, '');

  if (/(되돌려|되돌리|원래대로|복구)/.test(text)) {
    const v = /v\s*(\d+)/i.exec(text) ?? /(\d+)\s*(?:번째\s*)?버전/.exec(text);
    return v ? {kind: 'revert', version: Number(v[1])} : {kind: 'revert'};
  }

  const edge =
    /^(.*?)\s*(?:을|를)?\s*(?:(?:맨|제일|가장)\s*(뒤|앞|끝|처음|마지막)|(끝|처음|마지막))\s*(?:으로|로|에)?(?:\s|$)/.exec(
      text,
    );
  if (edge) {
    const target = readRef(edge[1]!);
    const where = edge[2] ?? edge[3]!;
    if (target) return {kind: 'move', target, to: where === '앞' || where === '처음' ? 'start' : 'end'};
  }

  const relative = /^(.*?)(?:을|를)\s+(.*?)\s*(뒤|다음|앞)\s*(?:으로|로|에)/.exec(text);
  if (relative) {
    const target = readRef(relative[1]!);
    const anchor = readRef(relative[2]!);
    if (target && anchor) return {kind: 'move', target, to: relative[3] === '앞' ? 'before' : 'after', anchor};
  }

  const remove = /^(.*?)\s*(?:삭제|빼|없애|지워|제거)/.exec(text);
  if (remove) {
    const target = readRef(remove[1]!);
    if (target) return {kind: 'remove', target};
  }

  return {kind: 'unknown'};
}

export type Resolved = {kind: 'one'; step: PlanStep} | {kind: 'many'; steps: PlanStep[]} | {kind: 'none'};

/**
 * 말을 동작 하나에 맞춘다. 이름이 여러 동작에 맞으면 고르지 않고 후보를 돌려준다.
 * 이름이 꼭 같은 동작이 있으면 그것만 후보로 둔다('레일 이동 · 반응 비커'가 '레일 이동'보다 좁다).
 */
export function resolveStep(ref: StepRef, groups: readonly PlanGroup[]): Resolved {
  const steps = planSteps(groups);
  if ('number' in ref) {
    const step = steps[ref.number - 1];
    return step ? {kind: 'one', step} : {kind: 'none'};
  }
  const query = normalize(ref.name);
  const exact = steps.filter((s) => normalize(s.label) === query);
  const partial = exact.length > 0 ? exact : steps.filter((s) => normalize(s.label).includes(query));
  if (partial.length === 1) return {kind: 'one', step: partial[0]!};
  return partial.length > 1 ? {kind: 'many', steps: partial} : {kind: 'none'};
}

const clone = (groups: readonly PlanGroup[]): PlanGroup[] => groups.map((g) => ({...g, actions: [...g.actions]}));

/** 동작 하나를 빼고, 비어 버린 묶음도 뺀다. */
export function removeStep(groups: readonly PlanGroup[], id: string): PlanGroup[] {
  return clone(groups)
    .map((g) => ({...g, actions: g.actions.filter((a) => a.id !== id)}))
    .filter((g) => g.actions.length > 0);
}

/** 동작을 옮긴다. 맨 앞·맨 뒤는 첫·마지막 묶음으로, 기준 동작 앞뒤는 기준 동작의 묶음으로 간다. */
export function moveStep(
  groups: readonly PlanGroup[],
  id: string,
  to: {where: 'start' | 'end'} | {where: 'after' | 'before'; anchorId: string},
): PlanGroup[] {
  const action = planSteps(groups).find((s) => s.id === id);
  if (!action) return clone(groups);
  const moved = {id: action.id, label: action.label};
  // 빼고 나서 넣는다. 묶음이 비면 지운다(맨 뒤로 옮긴 동작이 마지막 묶음의 유일한 동작일 수도 있다).
  const rest = clone(groups).map((g) => ({...g, actions: g.actions.filter((a) => a.id !== id)}));
  if (!('anchorId' in to)) {
    if (to.where === 'start') rest[0]!.actions.unshift(moved);
    else rest.at(-1)!.actions.push(moved);
  } else {
    const group = rest.find((g) => g.actions.some((a) => a.id === to.anchorId));
    if (!group) return clone(groups);
    const at = group.actions.findIndex((a) => a.id === to.anchorId);
    group.actions.splice(to.where === 'after' ? at + 1 : at, 0, moved);
  }
  return rest.filter((g) => g.actions.length > 0);
}

/** 수정 결과: 새 계획과 답, 또는 계획을 바꾸지 않은 이유. */
export type EditOutcome = {kind: 'changed'; plan: ExecutionPlan; reply: string} | {kind: 'unchanged'; reply: string};

const stepName = (s: PlanStep) => `${stepNumber(s.order)} ${s.label}`;
const EDIT_EXAMPLES = ['교반을 맨 뒤로', '센서 프로브 삽입을 마개 개방 뒤로', '05 삭제', '되돌려 줘'];

function ambiguous(word: string, steps: PlanStep[]): string {
  return `'${word}'에 맞는 동작이 ${steps.length}개라 계획을 바꾸지 않았습니다. 어느 것인지 번호로 알려 주세요.\n${steps
    .map((s) => `- ${stepName(s)}`)
    .join('\n')}`;
}

const refWord = (ref: StepRef) => ('number' in ref ? stepNumber(ref.number - 1) : ref.name);

function notFound(ref: StepRef, total: number): string {
  return 'number' in ref
    ? `${refWord(ref)}번 동작이 없어 계획을 바꾸지 않았습니다. 지금 계획은 01부터 ${stepNumber(total - 1)}까지입니다.`
    : `계획에서 '${ref.name}'에 맞는 동작을 찾지 못해 계획을 바꾸지 않았습니다.`;
}

function withVersion(plan: ExecutionPlan, summary: string, groups: PlanGroup[]): ExecutionPlan {
  const version = plan.version + 1;
  return {...plan, version, versions: [...plan.versions, {version, summary, groups}]};
}

/** 채팅 한 줄로 계획을 고친다. 알아듣지 못했거나 대상이 애매하면 계획을 그대로 둔다. */
export function editPlan(plan: ExecutionPlan, input: string): EditOutcome {
  const groups = currentVersion(plan).groups;
  const total = planSteps(groups).length;
  const edit = parsePlanEdit(input);

  if (edit.kind === 'unknown') {
    return {
      kind: 'unchanged',
      reply: `어떻게 바꿀지 알아듣지 못해 계획을 그대로 두었습니다.\n\n이렇게 말해 보세요.\n${EDIT_EXAMPLES.map((e) => `- ${e}`).join('\n')}`,
    };
  }

  if (edit.kind === 'revert') {
    const target = edit.version ?? plan.version - 1;
    if (target < 1)
      return {kind: 'unchanged', reply: '지금이 첫 버전(v1)이라 되돌릴 버전이 없습니다. 계획을 그대로 두었습니다.'};
    if (target === plan.version)
      return {kind: 'unchanged', reply: `지금 계획이 이미 v${target}입니다. 계획을 그대로 두었습니다.`};
    const old = versionOf(plan, target);
    if (!old)
      return {
        kind: 'unchanged',
        reply: `v${target} 계획이 없어 그대로 두었습니다. 지금 계획은 v1부터 v${plan.version}까지 있습니다.`,
      };
    const next = withVersion(plan, `${withParticle(`v${target}`, '으로/로')} 되돌림`, clone(old.groups));
    return {
      kind: 'changed',
      plan: next,
      reply: `v${target} 계획으로 되돌려 ${withParticle(`v${next.version}`, '으로/로')} 남겼습니다. v${plan.version}까지의 기록은 그대로 있어 다시 돌아갈 수 있습니다.`,
    };
  }

  const target = resolveStep(edit.target, groups);
  if (target.kind === 'many') return {kind: 'unchanged', reply: ambiguous(refWord(edit.target), target.steps)};
  if (target.kind === 'none') return {kind: 'unchanged', reply: notFound(edit.target, total)};
  const step = target.step;

  if (edit.kind === 'remove') {
    const next = withVersion(plan, `${stepName(step)} 삭제`, removeStep(groups, step.id));
    const after = planSteps(currentVersion(next).groups).length;
    const empty = !currentVersion(next).groups.some((g) => g.id === step.group.id);
    return {
      kind: 'changed',
      plan: next,
      reply: `${withParticle(stepName(step), '을/를')} 뺐습니다. 계획 v${next.version}, ${after}동작입니다.${
        empty ? ` 동작이 남지 않은 '${step.group.title} · ${step.group.target}' 묶음도 뺐습니다.` : ''
      }${step.order < after ? ' 뒤 동작의 번호가 하나씩 당겨졌습니다.' : ''}`,
    };
  }

  if (!('anchor' in edit)) {
    const already = edit.to === 'end' ? step.order === total - 1 : step.order === 0;
    if (already)
      return {
        kind: 'unchanged',
        reply: `${withParticle(step.label, '은/는')} 이미 맨 ${edit.to === 'end' ? '뒤' : '앞'}에 있어 계획을 그대로 두었습니다.`,
      };
    const word = edit.to === 'end' ? '맨 뒤로' : '맨 앞으로';
    const next = withVersion(
      plan,
      `${withParticle(step.label, '을/를')} ${word}`,
      moveStep(groups, step.id, {where: edit.to}),
    );
    const moved = planSteps(currentVersion(next).groups).find((s) => s.id === step.id)!;
    return {
      kind: 'changed',
      plan: next,
      reply: `${withParticle(stepName(step), '을/를')} ${word} 옮겼습니다. 이제 ${stepNumber(moved.order)}번입니다. 계획 v${next.version}입니다.`,
    };
  }

  const anchor = resolveStep(edit.anchor, groups);
  if (anchor.kind === 'many') return {kind: 'unchanged', reply: ambiguous(refWord(edit.anchor), anchor.steps)};
  if (anchor.kind === 'none') return {kind: 'unchanged', reply: notFound(edit.anchor, total)};
  if (anchor.step.id === step.id)
    return {kind: 'unchanged', reply: '옮길 동작과 기준 동작이 같아 계획을 그대로 두었습니다.'};
  const side = edit.to === 'after' ? '뒤로' : '앞으로';
  const nextGroups = moveStep(groups, step.id, {where: edit.to, anchorId: anchor.step.id});
  const moved = planSteps(nextGroups).find((s) => s.id === step.id)!;
  if (moved.order === step.order && moved.group.id === step.group.id) {
    return {
      kind: 'unchanged',
      reply: `${withParticle(step.label, '은/는')} 이미 ${anchor.step.label} ${edit.to === 'after' ? '뒤' : '앞'}에 있어 계획을 그대로 두었습니다.`,
    };
  }
  const next = withVersion(plan, `${withParticle(step.label, '을/를')} ${anchor.step.label} ${side}`, nextGroups);
  return {
    kind: 'changed',
    plan: next,
    reply: `${withParticle(stepName(step), '을/를')} ${stepName(anchor.step)} ${side} 옮겼습니다. 이제 ${stepNumber(moved.order)}번입니다. 계획 v${next.version}입니다.`,
  };
}

/** v1을 알리는 답. 묶음별 번호 범위를 함께 적는다. */
export function describePlan(plan: ExecutionPlan, experimentName: string): string {
  const groups = currentVersion(plan).groups;
  const steps = planSteps(groups);
  const lines = groups.map((g) => {
    const own = steps.filter((s) => s.group.id === g.id);
    return `- ${stepNumber(own[0]!.order)}–${stepNumber(own.at(-1)!.order)} ${g.title} · ${g.target}`;
  });
  return `확정한 구성(${experimentName})으로 실행 계획 ${withParticle(`v${plan.version}`, '을/를')} 만들었습니다. ${groups.length}묶음 ${steps.length}동작입니다.\n${lines.join('\n')}\n\n계획은 화면에서 고치지 않고 채팅으로 고칩니다. 예: '교반을 맨 뒤로', '05 삭제'. 계획이 맞으면 작업 영역의 '실행 시작'을 누르세요.`;
}
