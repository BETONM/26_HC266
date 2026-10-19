// 노드와 관계를 사람이 읽는 말로. 그래프 그림, 스크린 리더 레이블, 목록이 같은 말을 쓴다.

import {
  hasLabel,
  inventoryStatusLabel,
  severityLabel,
  usageRoleLabel,
  type GraphNode,
  type GraphRelationship,
  type NodeLabel,
  type RelationshipType,
  type UsageRole,
} from '../model';
import type {NodeLines} from './measure';

export const labelName: Record<NodeLabel, string> = {
  Experiment: '실험',
  Chemical: '시약',
  Equipment: '기구',
  Device: '장비',
  Location: '위치',
  Hazard: '위험',
  Product: '생성물',
};

/** 엣지에 늘 붙이는 짧은 이름. */
export const relationShort: Record<RelationshipType, string> = {
  USES: '사용',
  REQUIRES: '필요',
  STORED_AT: '보관',
  HAS_HAZARD: '위험',
  REACTS_WITH: '반응',
  PRODUCES: '생성',
  CAUSES: '유발',
};

/** 호버·포커스 때 보이는 전체 설명. */
export function relationFull(rel: GraphRelationship): string {
  const p = rel.properties;
  const parts = [relationShort[rel.type]];
  if (rel.type === 'USES') {
    if (typeof p.amount === 'number') parts.push(`${p.amount} ${String(p.unit ?? '')}`.trim());
    if (typeof p.role === 'string' && p.role in usageRoleLabel) parts.push(usageRoleLabel[p.role as UsageRole]);
  }
  if (rel.type === 'REQUIRES' && typeof p.purpose === 'string') parts.push(p.purpose);
  if (rel.type === 'REQUIRES' && typeof p.quantity === 'number') parts.push(`${p.quantity}개`);
  if ((rel.type === 'CAUSES' || rel.type === 'REACTS_WITH') && typeof p.condition === 'string') parts.push(p.condition);
  if (rel.type === 'REACTS_WITH' && typeof p.formula === 'string') parts.push(p.formula);
  return parts.join(' · ');
}

/**
 * 그래프 위에 다는 짧은 관계 설명. 반응식처럼 긴 것은 빼고 조건·양·목적만 16자 안으로.
 * 전체는 relationFull로 설명 카드·상세·목록에 있다.
 */
export function relationBrief(rel: GraphRelationship): string {
  const p = rel.properties;
  let detail = '';
  if (rel.type === 'USES' && typeof p.amount === 'number') detail = `${p.amount} ${String(p.unit ?? '')}`.trim();
  else if (rel.type === 'REQUIRES' && typeof p.purpose === 'string') detail = p.purpose;
  else if ((rel.type === 'CAUSES' || rel.type === 'REACTS_WITH') && typeof p.condition === 'string')
    detail = p.condition;
  if (!detail) return relationShort[rel.type];
  const cut = [...detail].length > 16 ? `${[...detail].slice(0, 15).join('')}…` : detail;
  return `${relationShort[rel.type]} · ${cut}`;
}

export function primaryLabel(node: GraphNode): NodeLabel {
  return node.labels[0]!;
}

export function nodeLines(node: GraphNode): NodeLines {
  if (hasLabel(node, 'Hazard')) return {tag: severityLabel[node.properties.severity], name: node.properties.title};
  const tag = labelName[primaryLabel(node)];
  if (hasLabel(node, 'Chemical')) {
    const p = node.properties;
    const status = p.status === 'available' ? '' : ` · ${inventoryStatusLabel[p.status]}`;
    return {tag, name: p.name, detail: `${p.quantity} ${p.unit}${status}`};
  }
  if (hasLabel(node, 'Equipment')) {
    const p = node.properties;
    const status = p.status === 'available' ? '' : ` · ${inventoryStatusLabel[p.status]}`;
    return {tag, name: p.name, detail: `${p.spec} · ${p.quantity}개${status}`};
  }
  if (hasLabel(node, 'Experiment'))
    return {tag: node.properties.kind === 'draft' ? '구성 중인 실험' : tag, name: node.properties.name};
  if (hasLabel(node, 'Product') && node.properties.formula)
    return {tag, name: node.properties.name, detail: node.properties.formula};
  if (hasLabel(node, 'Device')) return {tag, name: node.properties.name, detail: node.properties.model};
  return {tag, name: String(node.properties.name ?? node.id)};
}

/** 스크린 리더용 한 줄. 예: '위험, 매우 높음, 이산화황(SO₂) 가스 발생'. */
export function nodeAriaLabel(node: GraphNode, extras: {neighbors: number}): string {
  const lines = nodeLines(node);
  const kind = hasLabel(node, 'Hazard') ? '위험' : lines.tag;
  const parts = [kind, ...(hasLabel(node, 'Hazard') ? [lines.tag] : []), lines.name];
  if (lines.detail) parts.push(lines.detail);
  parts.push(`연결 ${extras.neighbors}개`);
  return parts.join(', ');
}
