// 실험 초안의 규칙. 목업 LLM이 초안을 만들 때와, 3단계에서 구성 확정 전에 검증할 때 같은 함수를 쓴다.

import {
  hasLabel,
  severityRank,
  type GraphNode,
  type GraphRelationship,
  type GraphSnapshot,
  type TypedNode,
  type UsageRole,
} from '../graph/model';

export type DraftUse = {chemicalId: string; amount: number; unit: string; role: UsageRole};
export type DraftRequirement = {targetId: string; quantity?: number; purpose?: string};
export type DraftSpec = {
  id: string;
  name: string;
  description: string;
  templateId?: string;
  uses: DraftUse[];
  requires: DraftRequirement[];
  produces: string[];
};

const byId = (graph: GraphSnapshot) => new Map(graph.nodes.map((n) => [n.id, n]));
const outgoing = (graph: GraphSnapshot, id: string, type: GraphRelationship['type']) =>
  graph.relationships.filter((r) => r.startNode === id && r.type === type);

/** 실험 템플릿을 그대로 본뜬 초안. 템플릿이 없으면 null. */
export function draftFromTemplate(inventory: GraphSnapshot, templateId: string, draftId: string): DraftSpec | null {
  const template = inventory.nodes.find((n) => n.id === templateId);
  if (!template || !hasLabel(template, 'Experiment')) return null;
  return {
    id: draftId,
    name: template.properties.name,
    description: template.properties.description,
    templateId,
    uses: outgoing(inventory, templateId, 'USES').map((r) => ({
      chemicalId: r.endNode,
      amount: Number(r.properties.amount),
      unit: String(r.properties.unit),
      role: r.properties.role as UsageRole,
    })),
    requires: outgoing(inventory, templateId, 'REQUIRES').map((r) => ({
      targetId: r.endNode,
      ...(typeof r.properties.quantity === 'number' && {quantity: r.properties.quantity}),
      ...(typeof r.properties.purpose === 'string' && {purpose: r.properties.purpose}),
    })),
    produces: outgoing(inventory, templateId, 'PRODUCES').map((r) => r.endNode),
  };
}

/** 초안 서브그래프에서 초안 명세를 되읽는다. 대화 상태(ChatRequest)에는 그래프만 실려 오기 때문이다. */
export function specFromDraftGraph(graph: GraphSnapshot | null): DraftSpec | null {
  if (!graph) return null;
  const node = graph.nodes.find((n) => hasLabel(n, 'Experiment') && n.properties.kind === 'draft');
  if (!node || !hasLabel(node, 'Experiment')) return null;
  const templateId = node.properties.templateId;
  return {
    id: node.id,
    name: node.properties.name,
    description: node.properties.description,
    ...(typeof templateId === 'string' && {templateId}),
    uses: outgoing(graph, node.id, 'USES').map((r) => ({
      chemicalId: r.endNode,
      amount: Number(r.properties.amount),
      unit: String(r.properties.unit),
      role: r.properties.role as UsageRole,
    })),
    requires: outgoing(graph, node.id, 'REQUIRES').map((r) => ({
      targetId: r.endNode,
      ...(typeof r.properties.quantity === 'number' && {quantity: r.properties.quantity}),
      ...(typeof r.properties.purpose === 'string' && {purpose: r.properties.purpose}),
    })),
    produces: outgoing(graph, node.id, 'PRODUCES').map((r) => r.endNode),
  };
}

export type DraftHazard = {
  hazard: TypedNode<'Hazard'>;
  /** 이 위험을 일으키는 초안 안의 물질 이름. */
  sources: string[];
  /** CAUSES 관계의 조건. 물질 자체의 위험(HAS_HAZARD)이면 없다. */
  conditions: string[];
  /** 초안 안의 두 물질 이상이 함께 일으키는 위험. 이 실험에서 실제로 생길 수 있다. */
  combination: boolean;
};

/**
 * 초안에서 생길 수 있는 위험을 심각도순으로 모은다. 같은 심각도라면 조합 위험을 먼저 둔다.
 * 조합 위험은 이 실험에서 섞이기 때문에 생기는 것이라 조건부 위험보다 먼저 읽혀야 한다.
 */
export function draftHazards(inventory: GraphSnapshot, spec: DraftSpec): DraftHazard[] {
  const nodes = byId(inventory);
  const sourceIds = new Set([...spec.uses.map((u) => u.chemicalId), ...productIds(inventory, spec)]);
  const found = new Map<string, DraftHazard>();
  for (const rel of inventory.relationships) {
    if ((rel.type !== 'HAS_HAZARD' && rel.type !== 'CAUSES') || !sourceIds.has(rel.startNode)) continue;
    const hazard = nodes.get(rel.endNode);
    const source = nodes.get(rel.startNode);
    if (!hazard || !hasLabel(hazard, 'Hazard') || !source) continue;
    const entry = found.get(hazard.id) ?? {hazard, sources: [], conditions: [], combination: false};
    const name = String(source.properties.name);
    if (!entry.sources.includes(name)) entry.sources.push(name);
    if (rel.type === 'CAUSES' && typeof rel.properties.condition === 'string') entry.conditions.push(rel.properties.condition);
    found.set(hazard.id, entry);
  }
  for (const entry of found.values()) {
    const causers = inventory.relationships.filter(
      (r) => r.type === 'CAUSES' && r.endNode === entry.hazard.id && sourceIds.has(r.startNode),
    );
    entry.combination = causers.length >= 2;
  }
  return [...found.values()].sort(
    (a, b) =>
      severityRank(b.hazard.properties.severity) - severityRank(a.hazard.properties.severity) ||
      Number(b.combination) - Number(a.combination),
  );
}

function productIds(inventory: GraphSnapshot, spec: DraftSpec): string[] {
  const used = new Set(spec.uses.map((u) => u.chemicalId));
  const fromChemicals = inventory.relationships
    .filter((r) => r.type === 'PRODUCES' && used.has(r.startNode))
    .map((r) => r.endNode);
  return [...new Set([...spec.produces, ...fromChemicals])];
}

export type StockIssue = {
  chemicalId: string;
  name: string;
  kind: 'short' | 'expired' | 'missing';
  need: number;
  have: number;
  unit: string;
  expiresAt?: string;
};

/** 재고 부족(요청량 > 보유량), 미보유, 만료를 찾는다. 같은 시약에 둘 이상이면 모두 낸다. */
export function checkStock(inventory: GraphSnapshot, spec: DraftSpec): StockIssue[] {
  const nodes = byId(inventory);
  const issues: StockIssue[] = [];
  for (const use of spec.uses) {
    const node = nodes.get(use.chemicalId);
    if (!node || !hasLabel(node, 'Chemical')) {
      issues.push({chemicalId: use.chemicalId, name: use.chemicalId, kind: 'missing', need: use.amount, have: 0, unit: use.unit});
      continue;
    }
    const {name, quantity, unit, status, expiresAt} = node.properties;
    const have = convert(quantity, unit, use.unit);
    if (status === 'expired') issues.push({chemicalId: node.id, name, kind: 'expired', need: use.amount, have, unit: use.unit, expiresAt});
    if (use.amount > have) issues.push({chemicalId: node.id, name, kind: 'short', need: use.amount, have, unit: use.unit});
  }
  return issues;
}

// 단위가 다르면 mL 기준으로 맞춘다. 모르는 단위끼리는 그대로 비교한다.
function convert(value: number, from: string, to: string): number {
  if (from === to) return value;
  const toMl: Record<string, number> = {mL: 1, L: 1000};
  if (toMl[from] && toMl[to]) return (value * toMl[from]) / toMl[to];
  return value;
}

const relId = (draftId: string, type: string, target: string) => `${draftId}:${type}:${target}`;

/**
 * 초안 명세와 인벤토리로 초안 서브그래프를 만든다. 초안 노드와 그 관계에 더해, 쓰는 물질의 보관 위치·위험·
 * 생성물과 그 사이의 관계를 함께 담는다. 그래프 패널이 이것만으로 '무엇을 쓰고 무엇이 위험한지'를 그릴 수 있게 한다.
 */
export function buildDraftGraph(inventory: GraphSnapshot, spec: DraftSpec): GraphSnapshot {
  const nodes = byId(inventory);
  const usedIds = new Set(spec.uses.map((u) => u.chemicalId));
  const products = productIds(inventory, spec);
  const hazards = draftHazards(inventory, spec);
  const include = new Set<string>([
    ...usedIds,
    ...spec.requires.map((r) => r.targetId),
    ...products,
    ...hazards.map((h) => h.hazard.id),
  ]);
  for (const rel of inventory.relationships) {
    if (rel.type === 'STORED_AT' && include.has(rel.startNode)) include.add(rel.endNode);
  }

  const draftNode: GraphNode = {
    id: spec.id,
    labels: ['Experiment'],
    properties: {
      name: spec.name,
      description: spec.description,
      kind: 'draft',
      ...(spec.templateId && {templateId: spec.templateId}),
    },
  };
  const draftRels: GraphRelationship[] = [
    ...spec.uses.map((u) => ({
      id: relId(spec.id, 'USES', u.chemicalId),
      type: 'USES' as const,
      startNode: spec.id,
      endNode: u.chemicalId,
      properties: {amount: u.amount, unit: u.unit, role: u.role},
    })),
    ...spec.requires.map((r) => ({
      id: relId(spec.id, 'REQUIRES', r.targetId),
      type: 'REQUIRES' as const,
      startNode: spec.id,
      endNode: r.targetId,
      properties: {...(r.quantity !== undefined && {quantity: r.quantity}), ...(r.purpose && {purpose: r.purpose})},
    })),
    ...spec.produces.map((id) => ({
      id: relId(spec.id, 'PRODUCES', id),
      type: 'PRODUCES' as const,
      startNode: spec.id,
      endNode: id,
      properties: {},
    })),
    // 초안 안에서 섞여 생기는 위험은 실험 자신의 위험이기도 하다.
    ...hazards
      .filter((h) => h.combination)
      .map((h) => ({
        id: relId(spec.id, 'HAS_HAZARD', h.hazard.id),
        type: 'HAS_HAZARD' as const,
        startNode: spec.id,
        endNode: h.hazard.id,
        properties: {},
      })),
  ];

  const inventoryRels = inventory.relationships.filter((rel) => {
    if (!include.has(rel.startNode) || !include.has(rel.endNode)) return false;
    // 초안에 없는 시약끼리의 반응·조합은 이 실험과 상관없다.
    if (rel.type === 'REACTS_WITH') return usedIds.has(rel.startNode) && usedIds.has(rel.endNode);
    return rel.type !== 'USES' && rel.type !== 'REQUIRES';
  });

  return {
    nodes: [draftNode, ...[...include].flatMap((id) => (nodes.get(id) ? [nodes.get(id)!] : []))],
    relationships: [...draftRels, ...inventoryRels],
    ...(inventory.source && {source: inventory.source}),
  };
}
