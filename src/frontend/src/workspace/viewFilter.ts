import {hasLabel, type GraphSnapshot, type NodeLabel} from '../graph/model';
import {inducedSubgraph} from '../graph/ops';

export type ViewFilter = {hiddenLabels: readonly NodeLabel[]; hazardsOnly: boolean};

/**
 * 그래프 패널의 필터. '위험만 보기'는 위험 노드와 그 위험을 일으키는 노드만 남긴다.
 * 위험만 덩그러니 남으면 무엇 때문에 생기는 위험인지 알 수 없다.
 */
export function applyViewFilter(graph: GraphSnapshot, filter: ViewFilter): GraphSnapshot {
  const keep = new Set<string>();
  if (filter.hazardsOnly) {
    const hazards = new Set(graph.nodes.filter((n) => hasLabel(n, 'Hazard')).map((n) => n.id));
    for (const id of hazards) keep.add(id);
    for (const rel of graph.relationships) {
      if ((rel.type === 'HAS_HAZARD' || rel.type === 'CAUSES') && hazards.has(rel.endNode)) keep.add(rel.startNode);
    }
  } else {
    for (const node of graph.nodes) keep.add(node.id);
  }
  const hidden = new Set(filter.hiddenLabels);
  for (const node of graph.nodes) {
    if (hidden.has(node.labels[0]!)) keep.delete(node.id);
  }
  return inducedSubgraph(graph, keep);
}

/** 그래프에 실제로 있는 라벨만. 필터 단추를 없는 라벨까지 늘어놓지 않는다. */
export function labelsPresent(graph: GraphSnapshot): NodeLabel[] {
  return [...new Set(graph.nodes.map((n) => n.labels[0]!))];
}

/** 구성 중인 실험의 구성요소: 초안 노드와, 초안이 직접 쓰는(USES·REQUIRES·PRODUCES) 노드. 위험은 넣지 않는다. */
export function draftComponents(graph: GraphSnapshot): Set<string> {
  const draft = graph.nodes.find((n) => hasLabel(n, 'Experiment') && n.properties.kind === 'draft');
  if (!draft) return new Set();
  const ids = new Set([draft.id]);
  for (const rel of graph.relationships) {
    if (rel.startNode === draft.id && (rel.type === 'USES' || rel.type === 'REQUIRES' || rel.type === 'PRODUCES')) ids.add(rel.endNode);
  }
  return ids;
}
