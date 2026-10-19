import {
  hasLabel,
  isNodeLabel,
  isRecord,
  isRelationshipType,
  type DataSource,
  type GraphNode,
  type GraphRelationship,
  type GraphSnapshot,
} from './model';

export type ParseResult = {graph: GraphSnapshot; warnings: string[]};

// Neo4j는 id를 숫자로 주기도 한다. 문자열로 맞춰 두면 병합·조회에서 같은 키로 비교된다.
const toId = (value: unknown): string | null => {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
};

function parseNode(raw: unknown, warnings: string[], index: number): GraphNode | null {
  if (!isRecord(raw)) {
    warnings.push(`노드 #${index}: 객체가 아니어서 버렸습니다.`);
    return null;
  }
  const id = toId(raw.id);
  if (!id) {
    warnings.push(`노드 #${index}: id가 없어 버렸습니다.`);
    return null;
  }
  if (!Array.isArray(raw.labels)) {
    warnings.push(`노드 ${id}: labels가 배열이 아니어서 버렸습니다.`);
    return null;
  }
  // 모르는 라벨은 노드를 버릴 이유가 아니다. 서버가 라벨을 늘려도 아는 라벨로는 계속 보여 준다.
  const labels = raw.labels.filter(isNodeLabel);
  const unknown = raw.labels.filter((label) => !isNodeLabel(label));
  if (unknown.length > 0) warnings.push(`노드 ${id}: 모르는 라벨 ${unknown.join(', ')}을(를) 무시했습니다.`);
  if (labels.length === 0) {
    warnings.push(`노드 ${id}: 아는 라벨이 없어 버렸습니다.`);
    return null;
  }
  const properties = isRecord(raw.properties) ? raw.properties : {};
  const node: GraphNode = {id, labels, properties};
  const invalid = labels.filter((label) => !hasLabel(node, label));
  if (invalid.length > 0) {
    warnings.push(`노드 ${id}: ${invalid.join(', ')} 속성 모양이 맞지 않아 버렸습니다.`);
    return null;
  }
  return node;
}

function parseRelationship(raw: unknown, warnings: string[], index: number): GraphRelationship | null {
  if (!isRecord(raw)) {
    warnings.push(`관계 #${index}: 객체가 아니어서 버렸습니다.`);
    return null;
  }
  const id = toId(raw.id);
  if (!id) {
    warnings.push(`관계 #${index}: id가 없어 버렸습니다.`);
    return null;
  }
  if (!isRelationshipType(raw.type)) {
    warnings.push(`관계 ${id}: 모르는 type ${String(raw.type)}이어서 버렸습니다.`);
    return null;
  }
  const startNode = toId(raw.startNode);
  const endNode = toId(raw.endNode);
  if (!startNode || !endNode) {
    warnings.push(`관계 ${id}: startNode 또는 endNode가 없어 버렸습니다.`);
    return null;
  }
  const properties = isRecord(raw.properties) ? raw.properties : {};
  return {id, type: raw.type, startNode, endNode, properties};
}

/**
 * Neo4j HTTP API의 `results[].data[].graph`를 모두 펼친다. 같은 노드가 여러 행에 반복해서
 * 나오므로 id로 한 번만 남긴다. 스냅샷 모양(`{nodes, relationships}`)이면 그대로 쓴다.
 */
function collectParts(raw: unknown): {nodes: unknown[]; relationships: unknown[]} | null {
  if (!isRecord(raw)) return null;
  if (Array.isArray(raw.nodes) || Array.isArray(raw.relationships)) {
    return {
      nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
      relationships: Array.isArray(raw.relationships) ? raw.relationships : [],
    };
  }
  if (!Array.isArray(raw.results)) return null;
  const nodes: unknown[] = [];
  const relationships: unknown[] = [];
  for (const result of raw.results) {
    if (!isRecord(result) || !Array.isArray(result.data)) continue;
    for (const row of result.data) {
      if (!isRecord(row) || !isRecord(row.graph)) continue;
      if (Array.isArray(row.graph.nodes)) nodes.push(...row.graph.nodes);
      if (Array.isArray(row.graph.relationships)) relationships.push(...row.graph.relationships);
    }
  }
  return {nodes, relationships};
}

/**
 * 원본을 느슨하게 받아 검증한다. 모양이 어긋난 노드·관계는 버리고 경고만 남긴다.
 * 하나 때문에 전체를 버리면 그래프가 통째로 사라져 실험 직전에 아무것도 볼 수 없게 된다.
 */
export function parseGraph(raw: unknown, source?: DataSource): ParseResult {
  const warnings: string[] = [];
  const parts = collectParts(raw);
  if (!parts) {
    warnings.push('그래프 응답 모양을 알아볼 수 없어 빈 그래프로 처리했습니다.');
    return {graph: {nodes: [], relationships: [], ...(source && {source})}, warnings};
  }

  const nodes = new Map<string, GraphNode>();
  parts.nodes.forEach((rawNode, index) => {
    const node = parseNode(rawNode, warnings, index);
    if (node && !nodes.has(node.id)) nodes.set(node.id, node);
  });

  const relationships = new Map<string, GraphRelationship>();
  parts.relationships.forEach((rawRel, index) => {
    const rel = parseRelationship(rawRel, warnings, index);
    if (!rel || relationships.has(rel.id)) return;
    if (!nodes.has(rel.startNode) || !nodes.has(rel.endNode)) {
      warnings.push(`관계 ${rel.id}: 끝점 노드가 그래프에 없어 버렸습니다.`);
      return;
    }
    relationships.set(rel.id, rel);
  });

  return {
    graph: {nodes: [...nodes.values()], relationships: [...relationships.values()], ...(source && {source})},
    warnings,
  };
}
