// 목업 LLM의 답. 인벤토리와 위험은 GraphSource를 실제로 조회해서 만든다. 시드를 바꾸면 답도 바뀐다.
// 같은 요청에는 언제나 같은 답을 낸다(결정적).

import type {ChatEvent, ChatRequest} from '../../../chat/types';
import {
  buildDraftGraph,
  checkStock,
  draftFromTemplate,
  draftHazards,
  specFromDraftGraph,
  type DraftHazard,
  type DraftSpec,
  type StockIssue,
} from '../../../domain/draft';
import {
  hasLabel,
  inventoryStatusLabel,
  severityLabel,
  severityRank,
  usageRoleLabel,
  type Severity,
  type GraphNode,
  type GraphSnapshot,
  type UsageRole,
} from '../../../graph/model';
import {inducedSubgraph, neighborhood} from '../../../graph/ops';
import type {GraphSource} from '../../graph/GraphSource';
import {classifyIntent, type Intent} from './intent';
import {formatAmount, withParticle} from './korean';
import {findMentions} from './names';
import {describePlan, editPlan, generatePlan} from './plan';
import {describeRun, describeTelemetry} from './telemetry';
import {explainReport, summarizeReport} from './report';

export const DEFAULT_DRAFT_ID = 'exp-draft-1';

const EXAMPLES = [
  '어떤 실험 할 수 있어?',
  '색 변화 실험 하고 싶어',
  '요오드산 칼륨 얼마나 남았어? 어디 있어?',
  '이 실험에서 위험한 건 뭐야?',
];

type Ctx = {request: ChatRequest; source: GraphSource; signal: AbortSignal; inventory: GraphSnapshot; text: string};

const text = (value: string): ChatEvent => ({type: 'text-delta', text: value});
const status = (label: string): ChatEvent => ({type: 'status', label});
const bullet = (lines: string[]) => lines.map((line) => `- ${line}`).join('\n');

/** 'A와 B', 'A, B과 C'. */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -2).map((n) => `${n}, `).join('')}${withParticle(names.at(-2)!, '과/와')} ${names.at(-1)}`;
}

export async function* respondMock(request: ChatRequest, source: GraphSource, signal: AbortSignal): AsyncGenerator<ChatEvent> {
  const last = [...request.messages].reverse().find((m) => m.role === 'user');
  const userText = last?.content ?? '';
  yield status('요청을 읽는 중');
  const inventory = await source.getAll(signal);
  const ctx: Ctx = {request, source, signal, inventory, text: userText};

  if (request.action === 'generate-plan') {
    yield* answerGeneratePlan(ctx);
    return;
  }

  const mentionsInventory = findMentions(userText, inventory, ['Chemical', 'Equipment', 'Device']).length > 0;
  const intent = classifyIntent(userText, {
    mentionsInventory,
    hasPlan: request.state.plan !== null,
    hasRun: request.state.runPlanVersion !== null,
    hasReport: Boolean(request.state.report),
  });

  // 확정한 구성은 채팅으로 바로 바꾸지 않는다. 실행 계획과 보고서가 그 구성을 기준으로 하기 때문이다.
  if (request.state.confirmedGraphId && (intent.kind === 'compose' || intent.kind === 'modify')) {
    yield text(
      "구성이 이미 확정되어 있어 바꾸지 않았습니다. 바꾸려면 확정한 구성을 바탕으로 새 초안을 만들어야 합니다. 새 초안을 만들까요? '새 초안 만들어 줘'라고 답하거나 실행 계획 탭의 '새 초안 만들기'를 누르세요.",
    );
    return;
  }

  switch (intent.kind) {
    case 'new-draft':
      yield* answerNewDraft(ctx);
      break;
    case 'inventory':
      yield* answerInventory(ctx);
      break;
    case 'explore':
      yield* answerExplore(ctx);
      break;
    case 'compose':
      yield* answerCompose(ctx);
      break;
    case 'modify':
      yield* answerModify(ctx, intent);
      break;
    case 'hazard':
      yield* answerHazard(ctx);
      break;
    case 'plan-edit':
      yield* answerPlanEdit(ctx);
      break;
    case 'run-status':
      yield text(describeRun(ctx.request.state.telemetry));
      break;
    case 'telemetry':
      yield text(describeTelemetry(ctx.request.state.telemetry, ctx.text));
      break;
    case 'report-summary':
      yield text(summarizeReport(ctx.request.state.report!));
      break;
    case 'report-why':
      yield text(explainReport(ctx.request.state.report!, ctx.text));
      break;
    case 'unknown':
      yield* answerUnknown();
      break;
  }
}

function* answerUnknown(): Generator<ChatEvent> {
  yield text(`요청을 알아듣지 못했습니다. 그래프와 실험 초안은 그대로 두었습니다.\n\n이렇게 물어보세요.\n${bullet(EXAMPLES)}`);
}

// ── 인벤토리 ─────────────────────────────────────────────────────

function locationOf(inventory: GraphSnapshot, nodeId: string): GraphNode | undefined {
  const rel = inventory.relationships.find((r) => r.type === 'STORED_AT' && r.startNode === nodeId);
  return rel ? inventory.nodes.find((n) => n.id === rel.endNode) : undefined;
}

function describeItem(inventory: GraphSnapshot, node: GraphNode, draft: DraftSpec | null): string {
  const location = locationOf(inventory, node.id);
  const where = location ? `${location.properties.name}에 있습니다` : '보관 위치가 등록되어 있지 않습니다';
  if (hasLabel(node, 'Chemical')) {
    const p = node.properties;
    const parts = [
      `${withParticle(`${p.name}(${p.formula}, ${p.concentration})`, '은/는')} ${formatAmount(p.quantity)} ${p.unit} 남아 있고, ${where}.`,
      `로트 ${p.lot}, 유효기간 ${p.expiresAt}.`,
    ];
    if (p.status === 'expired') parts.push(`유효기간이 지나 쓸 수 없습니다.`);
    if (p.status === 'low') parts.push(`재고가 부족한 상태(${inventoryStatusLabel.low})로 표시되어 있습니다.`);
    const use = draft?.uses.find((u) => u.chemicalId === node.id);
    if (use) {
      parts.push(`지금 초안에서는 ${formatAmount(use.amount)} ${use.unit}를 씁니다.`);
      if (use.amount > p.quantity) parts.push(`보유량보다 ${formatAmount(use.amount - p.quantity)} ${use.unit} 모자랍니다.`);
    }
    return parts.join(' ');
  }
  if (hasLabel(node, 'Equipment')) {
    const p = node.properties;
    return `${withParticle(`${p.name}(${p.spec})`, '은/는')} ${p.quantity}개 있고, ${where}.`;
  }
  if (hasLabel(node, 'Device')) {
    return `${withParticle(`${node.properties.name}(${node.properties.model})`, '은/는')} 로봇 스테이션에 설치된 장비입니다. 연결 상태는 장비 API에 연결되면 확인할 수 있습니다.`;
  }
  return String(node.properties.name ?? node.id);
}

async function* answerInventory(ctx: Ctx): AsyncGenerator<ChatEvent> {
  yield status('인벤토리 조회 중');
  const draft = specFromDraftGraph(ctx.request.state.draftGraph);
  const mentions = findMentions(ctx.text, ctx.inventory, ['Chemical', 'Equipment', 'Device']);
  if (mentions.length > 0) {
    const ids = mentions.map((m) => m.node.id);
    const result = await ctx.source.getNeighborhood(ids, 1, ctx.signal);
    // 이웃 중 보관 위치만 남긴다. 조회 결과가 '이 시약이 어디 있나'에 답하도록.
    const keep = new Set([...ids, ...result.relationships.filter((r) => r.type === 'STORED_AT' && ids.includes(r.startNode)).map((r) => r.endNode)]);
    yield {type: 'graph', graph: inducedSubgraph(result, keep), mode: 'replace', focus: ids};
    yield text(mentions.map((m) => describeItem(ctx.inventory, m.node, draft)).join('\n\n'));
    return;
  }

  const result = await ctx.source.search({labels: ['Chemical', 'Equipment', 'Location']}, ctx.signal);
  const chemicals = ctx.inventory.nodes.filter((n) => hasLabel(n, 'Chemical'));
  const equipment = ctx.inventory.nodes.filter((n) => hasLabel(n, 'Equipment'));
  yield {type: 'graph', graph: result, mode: 'replace', focus: chemicals.map((n) => n.id)};
  const chemLines = chemicals.map((n) => {
    const p = n.properties as {name: string; quantity: number; unit: string; status: keyof typeof inventoryStatusLabel};
    const flag = p.status === 'available' ? '' : ` · ${inventoryStatusLabel[p.status]}`;
    return `${p.name} ${formatAmount(p.quantity)} ${p.unit}${flag}`;
  });
  const eqLines = equipment.map((n) => `${n.properties.name}(${n.properties.spec}) ${n.properties.quantity}개`);
  const problems = chemicals.filter((n) => n.properties.status !== 'available');
  const summary =
    problems.length > 0
      ? `확인이 필요한 시약: ${problems.map((n) => `${n.properties.name}(${inventoryStatusLabel[n.properties.status as 'low' | 'expired']})`).join(', ')}.`
      : '모든 시약이 사용 가능한 상태입니다.';
  yield text(`보유 시약 ${chemicals.length}종과 기구 ${equipment.length}종입니다.\n\n시약\n${bullet(chemLines)}\n\n기구\n${bullet(eqLines)}\n\n${summary}`);
}

// ── 실험 탐색 ────────────────────────────────────────────────────

function stockSummary(issues: StockIssue[]): string {
  return issues
    .map((issue) => {
      if (issue.kind === 'expired') return `${issue.name} 만료(${issue.expiresAt})`;
      if (issue.kind === 'missing') return `${issue.name} 미보유`;
      return `${issue.name} 부족(${formatAmount(issue.need)} ${issue.unit} 필요, ${formatAmount(issue.have)} ${issue.unit} 보유)`;
    })
    .join(', ');
}

async function* answerExplore(ctx: Ctx): AsyncGenerator<ChatEvent> {
  yield status('실험 템플릿 조회 중');
  const templates = await ctx.source.search({labels: ['Experiment'], where: {kind: 'template'}}, ctx.signal);
  if (templates.nodes.length === 0) {
    yield text('등록된 실험 템플릿이 없습니다. 쓰고 싶은 시약을 말씀해 주시면 인벤토리에서 찾아보겠습니다.');
    return;
  }
  const ids = templates.nodes.map((n) => n.id);
  const subgraph = await ctx.source.getNeighborhood(ids, 1, ctx.signal);
  yield {type: 'graph', graph: subgraph, mode: 'replace', focus: ids};
  const lines = templates.nodes.map((node) => {
    const p = node.properties as {name: string; description: string; duration?: string};
    const spec = draftFromTemplate(ctx.inventory, node.id, DEFAULT_DRAFT_ID);
    const issues = spec ? checkStock(ctx.inventory, spec) : [];
    const ready = issues.length === 0 ? '지금 바로 할 수 있습니다.' : `준비가 필요합니다: ${stockSummary(issues)}.`;
    return `${p.name}${p.duration ? ` (${p.duration})` : ''} — ${p.description} ${ready}`;
  });
  yield text(
    `지금 인벤토리로 할 수 있는 실험은 ${templates.nodes.length}가지입니다.\n\n${bullet(lines)}\n\n하고 싶은 실험을 말씀해 주세요. 예: '색 변화 실험 하고 싶어'`,
  );
}

// ── 실험 구성 ────────────────────────────────────────────────────

const TEMPLATE_HINTS: Array<[RegExp, string]> = [
  [/(색\s*변화|시계\s*반응|청람)/, '색'],
  [/(앙금|침전)/, '앙금'],
  [/(적정|중화)/, '적정'],
];

/** 템플릿 이름의 낱말이 글에 몇 개 나오는지로 고른다. 시드의 템플릿이 바뀌어도 그대로 쓸 수 있게. */
function pickTemplate(inventory: GraphSnapshot, userText: string): GraphNode | null {
  const normalized = userText.replace(/\s+/g, '');
  const hints = TEMPLATE_HINTS.filter(([pattern]) => pattern.test(userText)).map(([, word]) => word);
  let best: {node: GraphNode; score: number} | null = null;
  for (const node of inventory.nodes) {
    if (!hasLabel(node, 'Experiment') || node.properties.kind !== 'template') continue;
    const words = node.properties.name.split(/[\s–+·-]+/).filter((w) => w.length >= 2 && w !== '실험');
    let score = words.filter((w) => normalized.includes(w)).length;
    score += hints.filter((hint) => node.properties.name.includes(hint)).length * 2;
    if (score > 0 && (!best || score > best.score)) best = {node, score};
  }
  return best?.node ?? null;
}

function describeDraft(inventory: GraphSnapshot, spec: DraftSpec): string {
  const nodes = new Map(inventory.nodes.map((n) => [n.id, n]));
  const chemLines = spec.uses.map((u) => {
    const name = String(nodes.get(u.chemicalId)?.properties.name ?? u.chemicalId);
    return `${name} ${formatAmount(u.amount)} ${u.unit}(${usageRoleLabel[u.role]})`;
  });
  const required = spec.requires.map((r) => nodes.get(r.targetId)).filter((n): n is GraphNode => Boolean(n));
  const equipment = required
    .filter((n) => hasLabel(n, 'Equipment'))
    .map((n) => {
      const quantity = spec.requires.find((r) => r.targetId === n.id)?.quantity;
      return `${n.properties.name} ${n.properties.spec}${quantity ? ` ${quantity}개` : ''}`;
    });
  const devices = required.filter((n) => hasLabel(n, 'Device')).map((n) => String(n.properties.name));
  const hazards = draftHazards(inventory, spec);
  const counts = (['critical', 'high', 'medium', 'low'] as const)
    .map((s) => [s, hazards.filter((h) => h.hazard.properties.severity === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${severityLabel[s]} ${n}`);
  const lines = [
    `시약: ${chemLines.join(', ') || '없음'}`,
    ...(equipment.length > 0 ? [`기구: ${equipment.join(', ')}`] : []),
    ...(devices.length > 0 ? [`장비: ${devices.join(', ')}`] : []),
    `위험: ${counts.length > 0 ? counts.join(' · ') : '등록된 위험 없음'}`,
  ];
  const issues = checkStock(inventory, spec);
  const stock = issues.length === 0 ? '재고는 모두 충분합니다.' : `재고 확인이 필요합니다: ${stockSummary(issues)}.`;
  return `${bullet(lines)}\n\n${stock}`;
}

async function* saveAndEmit(ctx: Ctx, spec: DraftSpec): AsyncGenerator<ChatEvent> {
  yield status('실험 초안 저장 중');
  const graph = buildDraftGraph(ctx.inventory, spec);
  await ctx.source.saveDraft(graph, ctx.signal);
  yield {type: 'graph', graph, mode: 'replace', focus: [spec.id]};
}

async function* answerCompose(ctx: Ctx): AsyncGenerator<ChatEvent> {
  yield status('실험 템플릿 조회 중');
  const template = pickTemplate(ctx.inventory, ctx.text);
  if (!template) {
    const names = ctx.inventory.nodes
      .filter((n) => hasLabel(n, 'Experiment') && n.properties.kind === 'template')
      .map((n) => String(n.properties.name));
    yield text(
      `어떤 실험인지 알아듣지 못해 초안을 만들지 않았습니다. 지금 할 수 있는 실험은 다음과 같습니다.\n\n${bullet(names)}`,
    );
    return;
  }
  const existing = specFromDraftGraph(ctx.request.state.draftGraph);
  const spec = draftFromTemplate(ctx.inventory, template.id, existing?.id ?? DEFAULT_DRAFT_ID)!;
  yield* saveAndEmit(ctx, spec);
  const replaced = existing ? ' 이전 초안은 이 구성으로 바꿨습니다.' : '';
  yield text(
    `${withParticle(spec.name, '으로/로')} 실험 초안을 구성했습니다.${replaced}\n\n${describeDraft(ctx.inventory, spec)}\n\n양을 바꾸거나 시약을 더하고 뺄 수 있습니다. 예: '증류수 10 mL 추가해 줘'`,
  );
}

const defaultRole = (node: GraphNode): UsageRole => (node.properties.formula === 'H₂O' ? 'solvent' : 'reactant');

async function* answerModify(ctx: Ctx, intent: Extract<Intent, {kind: 'modify'}>): AsyncGenerator<ChatEvent> {
  const spec = specFromDraftGraph(ctx.request.state.draftGraph);
  if (!spec) {
    yield text("아직 구성 중인 실험이 없어 바꾸지 않았습니다. 먼저 실험을 정해 주세요. 예: '색 변화 실험 하고 싶어'");
    return;
  }
  const mentions = findMentions(ctx.text, ctx.inventory, ['Chemical']);
  if (mentions.length === 0) {
    const name = intent.nameText.replace(/(을|를|은|는|이|가)$/, '').trim();
    yield text(
      name
        ? `${withParticle(name, '은/는')} 인벤토리에 없어 초안에 넣지 않았습니다. 보유 시약은 '재고 보여 줘'로 볼 수 있습니다.`
        : '어떤 시약을 바꿀지 알아듣지 못해 초안을 그대로 두었습니다.',
    );
    return;
  }
  if (intent.op !== 'remove' && mentions.length > 1) {
    yield text(`시약이 ${mentions.length}가지 나와서 어느 쪽 양인지 알 수 없습니다. 한 번에 하나씩 말씀해 주세요. 초안은 그대로 두었습니다.`);
    return;
  }
  if (intent.op !== 'remove' && intent.amount === undefined) {
    const name = String(mentions[0]!.node.properties.name);
    yield text(`${withParticle(name, '을/를')} 얼마나 쓸지 숫자로 알려 주세요. 예: '${name} 10 mL 추가해 줘'. 초안은 그대로 두었습니다.`);
    return;
  }

  const next: DraftSpec = {...spec, uses: spec.uses.map((u) => ({...u}))};
  const changes: string[] = [];
  for (const {node} of mentions) {
    const name = String(node.properties.name);
    const index = next.uses.findIndex((u) => u.chemicalId === node.id);
    if (intent.op === 'remove') {
      if (index === -1) changes.push(`${withParticle(name, '은/는')} 초안에 없습니다.`);
      else {
        next.uses.splice(index, 1);
        changes.push(`${withParticle(name, '을/를')} 뺐습니다.`);
      }
      continue;
    }
    const amount = intent.amount!;
    if (index === -1) {
      next.uses.push({chemicalId: node.id, amount, unit: 'mL', role: defaultRole(node)});
      changes.push(`${withParticle(name, '을/를')} ${formatAmount(amount)} mL 추가했습니다.`);
    } else {
      const use = next.uses[index]!;
      const before = use.amount;
      use.amount = intent.op === 'add' ? before + amount : amount;
      changes.push(`${name}: ${formatAmount(before)} → ${formatAmount(use.amount)} mL`);
    }
  }

  const changed = JSON.stringify(next.uses) !== JSON.stringify(spec.uses);
  if (!changed) {
    yield text(`${changes.join(' ')} 바꾼 것이 없어 초안을 그대로 두었습니다.`);
    return;
  }
  yield* saveAndEmit(ctx, next);
  yield text(`${changes.join('\n')}\n\n지금 구성입니다.\n\n${describeDraft(ctx.inventory, next)}`);
}

/** 확정한 구성을 바탕으로 번호가 하나 큰 새 초안을 만든다. 확정 기록은 화면 쪽에 그대로 남는다. */
async function* answerNewDraft(ctx: Ctx): AsyncGenerator<ChatEvent> {
  const spec = specFromDraftGraph(ctx.request.state.draftGraph);
  if (!spec) {
    yield text("구성 중인 실험이 없어 새 초안을 만들지 않았습니다. 먼저 실험을 정해 주세요. 예: '색 변화 실험 하고 싶어'");
    return;
  }
  if (!ctx.request.state.confirmedGraphId) {
    yield text('지금 초안은 아직 확정 전이라 그대로 고칠 수 있습니다. 새 초안을 따로 만들지 않았습니다.');
    return;
  }
  const match = /^(.*-)(\d+)$/.exec(spec.id);
  const nextId = match ? `${match[1]}${Number(match[2]) + 1}` : `${spec.id}-2`;
  yield* saveAndEmit(ctx, {...spec, id: nextId});
  yield text(`확정한 구성을 바탕으로 새 초안을 만들었습니다. 이제 채팅으로 바꿀 수 있습니다. 확정 기록은 그대로 남아 있습니다.\n\n${describeDraft(ctx.inventory, {...spec, id: nextId})}`);
}

// ── 실행 계획 ────────────────────────────────────────────────────

async function* answerGeneratePlan(ctx: Ctx): AsyncGenerator<ChatEvent> {
  const {confirmedGraphId, draftGraph} = ctx.request.state;
  const spec = specFromDraftGraph(draftGraph);
  if (!confirmedGraphId || !spec) {
    yield text('확정한 구성이 없어 실행 계획을 만들지 않았습니다. 먼저 구성을 확정해 주세요.');
    return;
  }
  yield status('실행 계획 만드는 중');
  const plan = generatePlan(ctx.inventory, spec, confirmedGraphId);
  yield {type: 'plan', plan};
  yield text(describePlan(plan, spec.name));
}

function* answerPlanEdit(ctx: Ctx): Generator<ChatEvent> {
  const {plan, runPlanVersion} = ctx.request.state;
  if (!plan) {
    yield text('실행 계획은 구성을 확정한 뒤에 만들어집니다. 지금은 바꿀 계획이 없어서 아무것도 바꾸지 않았습니다.');
    return;
  }
  if (runPlanVersion !== null) {
    yield text(`실행을 v${runPlanVersion} 계획으로 이미 시작해서 계획을 바꾸지 않았습니다. 시작한 뒤에는 계획을 고칠 수 없습니다.`);
    return;
  }
  const outcome = editPlan(plan, ctx.text);
  if (outcome.kind === 'changed') yield {type: 'plan', plan: outcome.plan};
  yield text(outcome.reply);
}

// ── 위험 ─────────────────────────────────────────────────────────

function hazardLine(h: DraftHazard): string {
  const p = h.hazard.properties;
  const condition = h.conditions.length > 0 ? ` · 조건: ${[...new Set(h.conditions)].join(' / ')}` : '';
  const kind = h.combination ? ' · 이 실험에서 섞여 생기는 위험' : '';
  return `[${severityLabel[p.severity]}] ${p.title} — ${h.sources.join(', ')}${condition}${kind}. 대응: ${p.mitigation ?? '등록된 대응 없음'}`;
}

async function* answerHazard(ctx: Ctx): AsyncGenerator<ChatEvent> {
  yield status('위험 정보 조회 중');
  const mentions = findMentions(ctx.text, ctx.inventory, ['Chemical']);

  if (mentions.length >= 2) {
    const ids = mentions.map((m) => m.node.id);
    const names = mentions.map((m) => String(m.node.properties.name));
    // 둘 다에서 CAUSES로 이어지는 위험이 '섞으면 생기는 위험'이다.
    const shared = ctx.inventory.nodes.filter(
      (n) =>
        hasLabel(n, 'Hazard') &&
        ids.every((id) => ctx.inventory.relationships.some((r) => r.type === 'CAUSES' && r.startNode === id && r.endNode === n.id)),
    );
    const reactions = ctx.inventory.relationships.filter(
      (r) => r.type === 'REACTS_WITH' && ids.includes(r.startNode) && ids.includes(r.endNode),
    );
    yield {type: 'graph', graph: inducedSubgraph(ctx.inventory, new Set([...ids, ...shared.map((n) => n.id)])), mode: 'replace', focus: ids};
    if (shared.length === 0 && reactions.length === 0) {
      yield text(
        `${joinNames(names)} 사이에 등록된 반응이나 조합 위험은 없습니다. 등록되지 않은 위험이 없다는 뜻은 아니니, 섞기 전에 제품의 MSDS를 확인하세요.`,
      );
      return;
    }
    const lines = shared
      .filter((n) => hasLabel(n, 'Hazard'))
      .sort((a, b) => severityRank(b.properties.severity as Severity) - severityRank(a.properties.severity as Severity))
      .map((n) => {
        const p = n.properties as {title: string; severity: Severity; mitigation?: string};
        return `[${severityLabel[p.severity]}] ${p.title}. 대응: ${p.mitigation ?? '등록된 대응 없음'}`;
      });
    const reactionLines = reactions.map((r) => `반응: ${r.properties.formula ?? ''}${r.properties.condition ? ` (${r.properties.condition})` : ''}`.trim());
    const verdict = shared.some((n) => ['high', 'critical'].includes(String(n.properties.severity)))
      ? '섞지 마세요.'
      : '섞을 수는 있지만 아래 위험에 대비하세요.';
    yield text(`${withParticle(joinNames(names), '을/를')} 함께 쓰면 다음이 생길 수 있습니다. ${verdict}\n\n${bullet([...lines, ...reactionLines])}`);
    return;
  }

  const spec = specFromDraftGraph(ctx.request.state.draftGraph);
  if (mentions.length === 1 || !spec) {
    if (mentions.length === 0) {
      yield text("어떤 실험이나 시약의 위험을 볼지 알려 주세요. 구성 중인 실험이 아직 없습니다. 예: '아황산 수소 나트륨과 염산 섞어도 돼?'");
      return;
    }
    const node = mentions[0]!.node;
    const single: DraftSpec = {id: 'probe', name: '', description: '', uses: [{chemicalId: node.id, amount: 0, unit: 'mL', role: 'reactant'}], requires: [], produces: []};
    const hazards = draftHazards(ctx.inventory, single);
    yield {type: 'graph', graph: neighborhood(ctx.inventory, [node.id], 1), mode: 'replace', focus: [node.id]};
    yield text(
      hazards.length === 0
        ? `${withParticle(String(node.properties.name), '은/는')} 등록된 위험이 없습니다. 실제 제품의 MSDS로 한 번 더 확인하세요.`
        : `${String(node.properties.name)}의 위험을 심각도순으로 정리했습니다.\n\n${bullet(hazards.map(hazardLine))}`,
    );
    return;
  }

  const hazards = draftHazards(ctx.inventory, spec);
  const graph = buildDraftGraph(ctx.inventory, spec);
  yield {type: 'graph', graph, mode: 'merge', focus: hazards.map((h) => h.hazard.id)};
  if (hazards.length === 0) {
    yield text(`${spec.name}에는 등록된 위험이 없습니다. 실제 제품의 MSDS로 한 번 더 확인하세요.`);
    return;
  }
  yield text(`${spec.name}에서 주의할 위험을 심각도순으로 정리했습니다.\n\n${bullet(hazards.map(hazardLine))}`);
}

export {EXAMPLES as MOCK_EXAMPLES};
