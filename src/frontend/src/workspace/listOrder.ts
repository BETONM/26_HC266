import {NODE_LABELS, SEVERITIES, hasLabel, type GraphNode, type GraphSnapshot, type NodeLabel} from '../graph/model';

// 목록으로 볼 때의 순서. 위험이 가장 먼저 읽혀야 하므로 Hazard 묶음을 맨 앞에, 그 안은 심각도가 높은 순으로 둔다.
// 3단계의 '목록으로 보기'(그래프의 글 대안)도 이 순서를 쓴다.

export const LIST_LABEL_ORDER: NodeLabel[] = ['Hazard', ...NODE_LABELS.filter((label) => label !== 'Hazard')];

const severityOrder = [...SEVERITIES].reverse();

export type NodeGroup = {label: NodeLabel; nodes: GraphNode[]};

export function groupForList(graph: GraphSnapshot): NodeGroup[] {
  return LIST_LABEL_ORDER.flatMap((label) => {
    const nodes = graph.nodes.filter((node) => node.labels[0] === label);
    if (nodes.length === 0) return [];
    if (label === 'Hazard') {
      // 같은 심각도 안에서는 원래 순서를 지킨다(Array.sort는 안정 정렬).
      nodes.sort((a, b) => rank(a) - rank(b));
    }
    return [{label, nodes}];
  });
}

const rank = (node: GraphNode) => (hasLabel(node, 'Hazard') ? severityOrder.indexOf(node.properties.severity) : severityOrder.length);
