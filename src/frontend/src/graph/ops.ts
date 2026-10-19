import type {GraphNode, GraphRelationship, GraphSnapshot, NodeLabel} from './model';

export type IdChanges = {added: string[]; changed: string[]};
export type MergeResult = {
  graph: GraphSnapshot;
  nodes: IdChanges;
  relationships: IdChanges;
};

// properties는 JSON에서 온 평범한 값이라 구조 비교로 충분하다. 키 순서가 달라도 같다고 본다.
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) =>
    sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

function upsert<T extends {id: string}>(base: T[], patch: T[]): {items: T[]} & IdChanges {
  const items = new Map(base.map((item) => [item.id, item]));
  const added: string[] = [];
  const changed: string[] = [];
  for (const item of patch) {
    const previous = items.get(item.id);
    if (!previous) added.push(item.id);
    else if (!sameValue(previous, item)) changed.push(item.id);
    items.set(item.id, item);
  }
  return {items: [...items.values()], added, changed};
}

/**
 * id 기준으로 patch를 base 위에 덮어쓴다. 새로 생기거나 바뀐 id를 함께 돌려줘서
 * 그래프 패널이 그것만 잠시 강조할 수 있게 한다. 이미 있는 노드의 순서는 그대로 둔다.
 */
export function mergeSnapshots(base: GraphSnapshot, patch: GraphSnapshot): MergeResult {
  if (base.source && patch.source && base.source !== patch.source) {
    throw new Error('목업 그래프와 실측 그래프는 한 그래프에 합칠 수 없습니다.');
  }
  const nodes = upsert(base.nodes, patch.nodes);
  const nodeIds = new Set(nodes.items.map((node) => node.id));
  // 끝점이 없는 관계는 그릴 수 없다. 파서와 같은 규칙으로 버린다.
  const patchRels = patch.relationships.filter((rel) => nodeIds.has(rel.startNode) && nodeIds.has(rel.endNode));
  const relationships = upsert(base.relationships, patchRels);
  const source = base.source ?? patch.source;
  return {
    graph: {nodes: nodes.items, relationships: relationships.items, ...(source && {source})},
    nodes: {added: nodes.added, changed: nodes.changed},
    relationships: {added: relationships.added, changed: relationships.changed},
  };
}

/** 관계 방향과 상관없이 seed에서 hops번 안에 닿는 노드와, 그 노드끼리의 관계를 뽑는다. */
export function neighborhood(graph: GraphSnapshot, seedIds: readonly string[], hops: number): GraphSnapshot {
  const adjacency = new Map<string, string[]>();
  for (const rel of graph.relationships) {
    adjacency.set(rel.startNode, [...(adjacency.get(rel.startNode) ?? []), rel.endNode]);
    adjacency.set(rel.endNode, [...(adjacency.get(rel.endNode) ?? []), rel.startNode]);
  }
  const known = new Set(graph.nodes.map((node) => node.id));
  let frontier = seedIds.filter((id) => known.has(id));
  const visited = new Set(frontier);
  for (let depth = 0; depth < hops && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return inducedSubgraph(graph, visited);
}

export type NodeFilter = {
  /** 하나라도 가지면 통과한다. 비어 있거나 없으면 라벨로 거르지 않는다. */
  labels?: readonly NodeLabel[];
  /** 모든 키가 같은 값이어야 통과한다. */
  where?: Record<string, unknown>;
  /** 이름·영문명·화학식·CAS·제목 중 하나에 들어 있으면 통과한다. 대소문자와 공백을 무시한다. */
  text?: string;
};

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '');
const TEXT_FIELDS = ['name', 'english', 'formula', 'cas', 'title'] as const;

export function matchesNode(node: GraphNode, filter: NodeFilter): boolean {
  if (filter.labels && filter.labels.length > 0 && !node.labels.some((label) => filter.labels?.includes(label))) {
    return false;
  }
  if (filter.where && !Object.entries(filter.where).every(([key, value]) => sameValue(node.properties[key], value))) {
    return false;
  }
  if (filter.text !== undefined) {
    const needle = normalize(filter.text);
    if (needle.length === 0) return true;
    return TEXT_FIELDS.some((field) => {
      const value = node.properties[field];
      return typeof value === 'string' && normalize(value).includes(needle);
    });
  }
  return true;
}

/** 조건에 맞는 노드와, 양 끝이 모두 남은 관계만 남긴다. */
export function filterGraph(graph: GraphSnapshot, filter: NodeFilter): GraphSnapshot {
  const kept = new Set(graph.nodes.filter((node) => matchesNode(node, filter)).map((node) => node.id));
  return inducedSubgraph(graph, kept);
}

export function inducedSubgraph(graph: GraphSnapshot, ids: ReadonlySet<string>): GraphSnapshot {
  const nodes = graph.nodes.filter((node) => ids.has(node.id));
  const relationships = graph.relationships.filter((rel) => ids.has(rel.startNode) && ids.has(rel.endNode));
  return {nodes, relationships, ...(graph.source && {source: graph.source})};
}

export function relationshipsOf(graph: GraphSnapshot, nodeId: string): GraphRelationship[] {
  return graph.relationships.filter((rel) => rel.startNode === nodeId || rel.endNode === nodeId);
}
