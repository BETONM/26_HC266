// 구성 확정 전 검증. 실험 직전의 마지막 관문이라, 막는 이유를 숨기지 않고 하나씩 보여 준다.

import {hasLabel, type GraphSnapshot} from '../graph/model';
import {checkStock, draftHazards, specFromDraftGraph, type DraftHazard, type DraftSpec, type StockIssue} from './draft';

export type ConfirmCheck = {
  spec: DraftSpec;
  /** 재고 부족·미보유·만료. 하나라도 있으면 확정할 수 없다. */
  blockers: StockIssue[];
  /** high·critical 위험. 하나씩 '확인함'을 눌러야 확정할 수 있다. */
  mustAcknowledge: DraftHazard[];
  /** 그 밖의 위험. 보여 주기만 한다. */
  others: DraftHazard[];
};

export function checkConfirmation(inventory: GraphSnapshot, draftGraph: GraphSnapshot): ConfirmCheck | null {
  const spec = specFromDraftGraph(draftGraph);
  if (!spec) return null;
  const hazards = draftHazards(inventory, spec);
  const severe = (h: DraftHazard) => h.hazard.properties.severity === 'high' || h.hazard.properties.severity === 'critical';
  return {
    spec,
    blockers: checkStock(inventory, spec),
    mustAcknowledge: hazards.filter(severe),
    others: hazards.filter((h) => !severe(h)),
  };
}

/** 확정할 수 있는가: 막는 재고 문제가 없고, 확인해야 할 위험을 모두 확인했다. */
export function canConfirm(check: ConfirmCheck, acknowledged: ReadonlySet<string>): boolean {
  return check.blockers.length === 0 && check.mustAcknowledge.every((h) => acknowledged.has(h.hazard.id));
}

/**
 * 스냅샷 id. 같은 그래프면 같은 id다(FNV-1a). 노드·관계 순서와 속성 키 순서에 흔들리지 않게 정렬해서 잰다.
 * 계획과 보고서가 '어느 구성으로 했는가'를 이 id로 가리킨다.
 */
export function snapshotId(graph: GraphSnapshot): string {
  const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]));
    }
    return value;
  };
  const canonical = JSON.stringify({
    nodes: [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id)).map(sortKeys),
    relationships: [...graph.relationships].sort((a, b) => a.id.localeCompare(b.id)).map(sortKeys),
  });
  let h = 2166136261;
  for (let i = 0; i < canonical.length; i += 1) h = Math.imul(h ^ canonical.charCodeAt(i), 16777619);
  return `cfg-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

export function draftName(graph: GraphSnapshot): string {
  const node = graph.nodes.find((n) => hasLabel(n, 'Experiment') && n.properties.kind === 'draft');
  return node ? String(node.properties.name) : '실험';
}
