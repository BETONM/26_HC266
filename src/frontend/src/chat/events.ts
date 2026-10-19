import {parsePlan} from '../domain/plan';
import {hasLabel, isRecord, type GraphSnapshot} from '../graph/model';
import {mergeSnapshots} from '../graph/ops';
import {parseGraph} from '../graph/parse';
import type {ChatEvent} from './types';

/**
 * 서버가 보낸 JSON 한 덩어리를 ChatEvent로 검증한다. 모양이 틀리면 null.
 * graph 이벤트의 그래프는 파서를 거쳐 어긋난 노드·관계를 버린다.
 */
export function toChatEvent(raw: unknown): ChatEvent | null {
  if (!isRecord(raw) || typeof raw.type !== 'string') return null;
  switch (raw.type) {
    case 'text-delta':
      return typeof raw.text === 'string' ? {type: 'text-delta', text: raw.text} : null;
    case 'status':
      return typeof raw.label === 'string' ? {type: 'status', label: raw.label} : null;
    case 'graph': {
      if (raw.mode !== 'merge' && raw.mode !== 'replace') return null;
      const {graph} = parseGraph(raw.graph, 'live');
      const focus = Array.isArray(raw.focus) ? raw.focus.filter((id): id is string => typeof id === 'string') : undefined;
      return {type: 'graph', graph, mode: raw.mode, ...(focus && {focus})};
    }
    case 'plan': {
      const plan = parsePlan(raw.plan, 'live');
      return plan ? {type: 'plan', plan} : null;
    }
    case 'done':
      return {type: 'done'};
    case 'error':
      return {type: 'error', message: typeof raw.message === 'string' ? raw.message : '알 수 없는 오류입니다.'};
    default:
      return null;
  }
}

/**
 * 화면에 있던 그래프와 비교해 새로 나타나거나 속성이 바뀐 노드 id. 연구실 전체에서 초안으로 넘어갈 때,
 * 이미 지도에 있던 시약까지 '새것'으로 강조하면 정말 새로 생긴 초안 노드가 묻힌다.
 */
export function diffNodeIds(before: GraphSnapshot | null, after: GraphSnapshot): string[] {
  const old = new Map((before?.nodes ?? []).map((n) => [n.id, JSON.stringify(n)]));
  return after.nodes.filter((n) => old.get(n.id) !== JSON.stringify(n)).map((n) => n.id);
}

/** 실험 초안 노드를 품은 그래프인가. 초안과 조회 결과를 구분하는 기준이다. */
export function draftExperimentId(graph: GraphSnapshot): string | null {
  const node = graph.nodes.find((n) => hasLabel(n, 'Experiment') && n.properties.kind === 'draft');
  return node?.id ?? null;
}

export type GraphView = {
  /** 구성 중인 실험 초안. */
  draft: GraphSnapshot | null;
  /** 초안과 상관없는 조회 결과(인벤토리 질의 등). */
  query: GraphSnapshot | null;
};

export type GraphApplyResult = GraphView & {focus: string[]; changedIds: string[]};

/**
 * 한 응답의 graph 이벤트를 모두 모아 한 번에 반영한다. 스트리밍 중에 하나씩 반영하면
 * 레이아웃이 계속 흔들린다. 초안 노드를 품은 이벤트는 초안에, 나머지는 조회 결과에 간다.
 */
export function applyGraphEvents(view: GraphView, events: readonly ChatEvent[]): GraphApplyResult {
  let {draft, query} = view;
  const focus: string[] = [];
  const changed = new Set<string>();
  for (const event of events) {
    if (event.type !== 'graph') continue;
    const target = draftExperimentId(event.graph) !== null ? 'draft' : 'query';
    const previous = target === 'draft' ? draft : query;
    let next: GraphSnapshot;
    if (event.mode === 'replace' || !previous) {
      next = event.graph;
      const before = new Map([...(previous?.nodes ?? []), ...(previous?.relationships ?? [])].map((i) => [i.id, i]));
      for (const item of [...next.nodes, ...next.relationships]) {
        const old = before.get(item.id);
        if (!old || JSON.stringify(old) !== JSON.stringify(item)) changed.add(item.id);
      }
    } else {
      const merged = mergeSnapshots(previous, event.graph);
      next = merged.graph;
      for (const id of [...merged.nodes.added, ...merged.nodes.changed, ...merged.relationships.added, ...merged.relationships.changed]) {
        changed.add(id);
      }
    }
    if (target === 'draft') draft = next;
    else query = next;
    focus.push(...(event.focus ?? []));
  }
  return {draft, query, focus: [...new Set(focus)], changedIds: [...changed]};
}
