// 그래프 DB 스냅샷을 '그려 보일 그래프'로 줄이는 규칙. 모두 순수 함수다.
// 3단계 뒤 사용자 피드백(글씨가 너무 많고 관계가 너무 복잡하다)에서 나왔다. 데이터는 그대로 두고 그리는 방식만 바꾼다.
//  - 보관 위치(STORED_AT)는 선이 아니라 묶음(둥근 웅덩이)으로 그린다. Location 노드 자체는 묶음 이름이 된다.
//  - 장비는 보관 위치가 없지만 모든 실험이 함께 쓴다. '로봇 스테이션' 묶음 하나로 모은다.
//  - 실험 → 같은 묶음의 기구·장비 여러 개(REQUIRES)는 묶음으로 가는 선 하나로 합친다. 낱낱의 선은 가리킬 때만 보인다.
//  - 이름표는 실험·시약(화학식)·높음 이상 위험에만 늘 붙인다. 나머지는 가리키거나 가까이 볼 때 뜬다.

import {hasLabel, nodeName, type GraphNode, type GraphSnapshot, type RelationshipType} from '../model';
import {truncate} from './measure';

export const STATION_GROUP = 'group:station';
export const STATION_NAME = '로봇 스테이션';

export type Group = {
  id: string;
  name: string;
  members: string[];
  /** 시약 묶음은 왼쪽, 기구·장비 묶음은 오른쪽에 놓아 실험이 그 사이 가운데에 오게 한다. */
  side: 'left' | 'right';
};

/** 노드 → 묶음. 보관 위치가 그래프에 있을 때만 묶는다. 그래프에 없는 위치로 가는 STORED_AT은 무시한다. */
export function groupNodes(graph: GraphSnapshot): {groups: Group[]; groupOf: Map<string, string>} {
  const locations = new Map(graph.nodes.filter((n) => hasLabel(n, 'Location')).map((n) => [n.id, n]));
  const ids = new Set(graph.nodes.map((n) => n.id));
  const groupOf = new Map<string, string>();
  for (const rel of graph.relationships) {
    if (rel.type === 'STORED_AT' && locations.has(rel.endNode) && ids.has(rel.startNode))
      groupOf.set(rel.startNode, rel.endNode);
  }
  for (const node of graph.nodes) {
    if (hasLabel(node, 'Device') && !groupOf.has(node.id)) groupOf.set(node.id, STATION_GROUP);
  }
  const members = new Map<string, string[]>();
  // 노드 순서대로 모아 결정적으로 만든다.
  for (const node of graph.nodes) {
    const g = groupOf.get(node.id);
    if (g) members.set(g, [...(members.get(g) ?? []), node.id]);
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const order = [...locations.keys(), STATION_GROUP].filter((id) => members.has(id));
  const groups = order.map((id): Group => {
    const list = members.get(id)!;
    const chemicals = list.filter((m) => byId.get(m)?.labels[0] === 'Chemical').length;
    return {
      id,
      name: id === STATION_GROUP ? STATION_NAME : nodeName(locations.get(id)!),
      members: list,
      side: chemicals * 2 >= list.length ? 'left' : 'right',
    };
  });
  return {groups, groupOf};
}

export type DrawnEdge = {
  id: string;
  type: RelationshipType | 'GROUP';
  source: string;
  /** GROUP이면 비어 있고 toGroup으로 간다. */
  target?: string;
  toGroup?: string;
  /** GROUP으로 합친 관계 수. */
  count?: number;
  /** always: 늘 그림. focus: 끝점을 가리키거나 선택했을 때만. */
  show: 'always' | 'focus';
};

/** 그릴 선. 관계 id는 그대로 쓰고, 합친 선은 `group:<실험>><묶음>`. */
export function drawnEdges(graph: GraphSnapshot, groupOf: ReadonlyMap<string, string>): DrawnEdge[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges: DrawnEdge[] = [];
  const merged = new Map<string, DrawnEdge>();
  for (const rel of graph.relationships) {
    const a = byId.get(rel.startNode);
    const b = byId.get(rel.endNode);
    if (!a || !b || rel.type === 'STORED_AT' || a.labels[0] === 'Location' || b.labels[0] === 'Location') continue;
    if (rel.type === 'REQUIRES') {
      const group = groupOf.get(b.id);
      if (group) {
        const key = `group:${a.id}>${group}`;
        // 로봇 스테이션은 모든 실험이 함께 쓴다. 템플릿마다 그 선을 늘 그리면 정보 없이 화면만 가로지른다.
        // 구성 중인 실험(초안)의 것만 늘 그린다.
        const shared = group === STATION_GROUP && !isDraftExperiment(a);
        const entry = merged.get(key) ?? {
          id: key,
          type: 'GROUP' as const,
          source: a.id,
          toGroup: group,
          count: 0,
          show: shared ? ('focus' as const) : ('always' as const),
        };
        entry.count! += 1;
        merged.set(key, entry);
        edges.push({id: rel.id, type: rel.type, source: a.id, target: b.id, show: 'focus'});
        continue;
      }
    }
    // 시약이 직접 만드는 생성물은 실험 → 생성물 선과 겹친다. 시약을 가리킬 때만 보인다.
    const show = rel.type === 'PRODUCES' && a.labels[0] === 'Chemical' ? 'focus' : 'always';
    edges.push({id: rel.id, type: rel.type, source: a.id, target: b.id, show});
  }
  return [...edges, ...merged.values()];
}

export const isDraftExperiment = (node: GraphNode) => hasLabel(node, 'Experiment') && node.properties.kind === 'draft';

export type NodeLabelInfo = {
  text: string;
  /** 화학식이면 글꼴 굵기와 크기를 바꾼다. */
  formula: boolean;
  /** 멀리서 봐도 늘 붙이는 이름표인가. */
  always: boolean;
  /** 아주 멀리서(좁은 화면) 볼 때도 남기는가. */
  essential: boolean;
  /** 겹칠 때 남는 순서. 높을수록 먼저 자리를 차지한다. */
  priority: number;
};

const LABEL_PX = 12;

/** 그래프 위 이름표. 전체 이름은 aria-label·설명 카드·상세 패널에 있다. */
export function labelOf(node: GraphNode): NodeLabelInfo {
  if (hasLabel(node, 'Experiment')) {
    const draft = node.properties.kind === 'draft';
    const text = draft ? '실험 초안' : (node.properties.shortName ?? truncate(node.properties.name, 14, 112));
    return {text, formula: false, always: true, essential: true, priority: draft ? 60 : 50};
  }
  if (hasLabel(node, 'Chemical'))
    return {
      text: node.properties.formula || node.properties.name,
      formula: Boolean(node.properties.formula),
      always: true,
      essential: false,
      priority: 30,
    };
  if (hasLabel(node, 'Hazard')) {
    const {severity, shortName, title} = node.properties;
    const serious = severity === 'critical' || severity === 'high';
    return {
      text: shortName ?? truncate(title, LABEL_PX, 96),
      formula: false,
      always: serious,
      essential: severity === 'critical',
      // 위험이 실험보다 먼저 자리를 차지한다. 실험 직전 도구에서 위험 이름이 실험 이름에 밀려 숨으면 안 된다.
      priority: severity === 'critical' ? 70 : severity === 'high' ? 58 : 14,
    };
  }
  if (hasLabel(node, 'Product')) {
    const {formula, name} = node.properties;
    return {
      text: formula ?? truncate(name, LABEL_PX, 96),
      formula: Boolean(formula),
      always: false,
      essential: false,
      priority: 12,
    };
  }
  return {text: truncate(nodeName(node), LABEL_PX, 96), formula: false, always: false, essential: false, priority: 10};
}

/** 노드 반지름(화면 px, 배율 1 기준). 시약은 남은 양이 많을수록 조금 크다. */
export function radiusOf(node: GraphNode): number {
  if (hasLabel(node, 'Experiment')) return node.properties.kind === 'draft' ? 16 : 14;
  if (hasLabel(node, 'Chemical')) return Math.min(11, 5.5 + Math.sqrt(Math.max(0, node.properties.quantity)) / 5);
  // 위험은 심각할수록 크다. 그래프에서 가장 작은 표시가 위험이면 첫째 규칙(위험이 먼저)이 뒤집힌다.
  if (hasLabel(node, 'Hazard')) return {critical: 12, high: 11, medium: 9, low: 7}[node.properties.severity];
  if (hasLabel(node, 'Equipment')) return 5.5;
  return 5;
}

/** 그리는 노드인가. 보관 위치는 노드 대신 묶음 이름으로만 보인다. */
export const isDrawnNode = (node: GraphNode) => node.labels[0] !== 'Location';
