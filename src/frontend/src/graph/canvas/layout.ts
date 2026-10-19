// 포스 레이아웃. 계산만 d3-force에 맡기고 그리기는 우리가 한다.
//
// 3단계에서는 미리 다 돌려 놓고 멈춘 지도였다. 사용자가 '움직이지 않아 보는 재미가 없다'고 해서 시뮬레이션을 살려 둔다.
// - 처음: 다 퍼진 모습을 미리 계산해 화면 맞춤에 쓰고, 실제로는 가운데에서 묶음 자리로 퍼져 나간다(bloom).
// - 끌기: 끄는 노드를 따라 이웃이 출렁이고, 놓으면 고정하지 않고 제자리로 돌아간다.
// - 갱신: 새 노드는 이웃(초안은 본뜬 템플릿) 자리에서 생겨나고, 기존 노드는 순간이동 없이 그 자리에서 이어 움직인다.
//   초안은 쓰는 시약·기구를 조금 끌어당긴다. 묶음이 붙잡고 있어 멀리 끌려오지는 않는다.
// 규칙
// - 같은 그래프 → 같은 배치(결정적). 초기 위치는 id 해시로, d3의 난수는 고정 씨앗으로 정한다.
// - 위치는 그래프에서 잠시 빠진 노드도 기억한다. 조회 결과에서 연구실 전체로 돌아오면 원래 자리에 다시 나타난다.
// - 동작 줄이기에서는 움직임을 보여 주지 않고 그 자리에서 다 돌린 결과만 쓴다.

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import {hasLabel, type GraphSnapshot, type NodeLabel, type RelationshipType} from '../model';
import {groupNodes, isDrawnNode, type Group} from './declutter';
import type {Bounds, Point} from './viewport';

export type LayoutNode = SimulationNodeDatum & {
  id: string;
  label: NodeLabel;
  r: number;
  labeled: boolean;
  group: string | null;
};
type LayoutLink = SimulationLinkDatum<LayoutNode> & {distance: number; strength: number};

/** 노드마다 레이아웃이 알아야 하는 것: 반지름(겹침)과 이름표를 늘 다는지(이름표 자리까지 비운다). */
export type NodeInfo = {r: number; labeled: boolean};
export type NodeInfos = ReadonlyMap<string, NodeInfo>;

const LINK: Partial<Record<RelationshipType, {distance: number; strength: number}>> = {
  USES: {distance: 120, strength: 0.18},
  REACTS_WITH: {distance: 64, strength: 0.1},
  HAS_HAZARD: {distance: 26, strength: 0.9},
  CAUSES: {distance: 48, strength: 0.2},
  PRODUCES: {distance: 50, strength: 0.4},
  REQUIRES: {distance: 110, strength: 0.05},
};

/** 묶음 자리를 놓는 타원. 시약 묶음은 왼쪽 호, 기구·장비 묶음은 오른쪽 호에 놓는다. */
const ANCHOR_RX = 480;
const ANCHOR_RY = 230;
const ANCHOR_STEP = (36 * Math.PI) / 180;
const GROUP_PULL = 0.14;
/** 퍼지기 시작할 때 묶음 자리의 배율. */
export const BLOOM_START = 0.08;
const SETTLE_TICKS = 360;
const UPDATE_TICKS = 200;

/** 결정적 난수(LCG). d3-force가 겹친 노드를 떼어 놓을 때 쓰는 난수를 고정한다. */
export function seededRandom(seed = 1): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** 문자열 → 0~1 사이 고정값. 새 노드를 이웃 근처 어느 쪽에 놓을지 정하는 데 쓴다. */
export function hashUnit(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}

/** 한쪽 호의 i번째 자리: 가운데, 위, 아래, 더 위, 더 아래 순. */
function slotAngle(side: Group['side'], index: number): number {
  const step = Math.ceil(index / 2) * ANCHOR_STEP * (index % 2 === 1 ? -1 : 1);
  return side === 'left' ? Math.PI - step : step;
}

export class ForceLayout {
  /** 지금까지 본 모든 노드의 자리. 그래프에서 빠져도 지우지 않는다. */
  readonly nodes = new Map<string, LayoutNode>();
  /** 묶음 자리. 한번 정하면 바꾸지 않는다. 바꾸면 갱신 때마다 묶음이 통째로 옮겨 다닌다. */
  readonly anchors = new Map<string, Point>();
  private anchorSides = new Map<string, Group['side']>();
  private simulation: Simulation<LayoutNode, LayoutLink>;
  private current: LayoutNode[] = [];
  private groups: Group[] = [];
  /** 묶음 자리의 배율. 퍼지는 동안 BLOOM_START → 1. */
  private spread = 1;
  /** 다 퍼진 모습의 경계. 첫 화면 맞춤에 쓴다(퍼지는 동안 화면을 다시 맞추느라 흔들리지 않게). */
  settledBounds: Bounds | null = null;

  constructor() {
    this.simulation = forceSimulation<LayoutNode, LayoutLink>()
      .randomSource(seededRandom(7))
      // 기본값(0.4)보다 마찰을 줄여 끌면 이웃이 출렁이며 따라온다. 그래도 몇 초 안에 멈춘다.
      .velocityDecay(0.26)
      .alphaDecay(0.022)
      .force(
        'charge',
        forceManyBody<LayoutNode>()
          .strength((n) => (n.label === 'Experiment' ? -420 : n.label === 'Hazard' ? -60 : -110))
          .distanceMax(420),
      )
      .force('collide', forceCollide<LayoutNode>((n) => n.r + (n.labeled ? 20 : 7)).strength(0.85))
      .force(
        'x',
        forceX<LayoutNode>(0).strength((n) => (n.label === 'Experiment' ? 0.09 : 0.012)),
      )
      .force(
        'y',
        forceY<LayoutNode>(0).strength((n) => (n.label === 'Experiment' ? 0.12 : 0.016)),
      )
      .force('group', (alpha: number) => this.pullToGroups(alpha))
      .stop();
  }

  /** 지금 그리는 노드들. 순서는 그래프의 노드 순서와 같다. 보관 위치는 묶음 이름이 되므로 빠진다. */
  get visible(): readonly LayoutNode[] {
    return this.current;
  }

  get groupList(): readonly Group[] {
    return this.groups;
  }

  private pullToGroups(alpha: number) {
    for (const node of this.current) {
      const anchor = node.group ? this.anchors.get(node.group) : undefined;
      if (!anchor || node.x === undefined || node.y === undefined) continue;
      node.vx = (node.vx ?? 0) + (anchor.x * this.spread - node.x) * GROUP_PULL * alpha;
      node.vy = (node.vy ?? 0) + (anchor.y * this.spread - node.y) * GROUP_PULL * alpha;
    }
  }

  private assignAnchors(groups: readonly Group[]) {
    for (const side of ['left', 'right'] as const) {
      const used = [...this.anchorSides.values()].filter((s) => s === side).length;
      // 큰 묶음이 호의 가운데를 차지한다.
      const fresh = groups
        .filter((g) => g.side === side && !this.anchors.has(g.id))
        .sort((a, b) => b.members.length - a.members.length || (a.id < b.id ? -1 : 1));
      fresh.forEach((g, i) => {
        const angle = slotAngle(side, used + i);
        this.anchors.set(g.id, {x: Math.cos(angle) * ANCHOR_RX, y: Math.sin(angle) * ANCHOR_RY});
        this.anchorSides.set(g.id, side);
      });
    }
  }

  /**
   * 새 그래프를 받는다. 처음 보는 노드만 자리를 정하고, 기존 노드는 지금 자리에서 그대로 이어 간다.
   * animate가 거짓이면(동작 줄이기·테스트) 그 자리에서 다 돌린 결과로 바로 간다.
   * 돌려준 값: 새로 자리를 정한 노드 id와 첫 그래프였는지.
   */
  setGraph(graph: GraphSnapshot, infos: NodeInfos, options: {animate: boolean}): {placed: string[]; first: boolean} {
    const first = this.nodes.size === 0;
    const {groups, groupOf} = groupNodes(graph);
    this.assignAnchors(groups);
    this.groups = groups;
    const drawn = graph.nodes.filter(isDrawnNode);
    const neighbors = new Map<string, string[]>();
    for (const rel of graph.relationships) {
      neighbors.set(rel.startNode, [...(neighbors.get(rel.startNode) ?? []), rel.endNode]);
      neighbors.set(rel.endNode, [...(neighbors.get(rel.endNode) ?? []), rel.startNode]);
    }

    const placed: string[] = [];
    for (const gn of drawn) {
      const info = infos.get(gn.id) ?? {r: 6, labeled: false};
      const group = groupOf.get(gn.id) ?? null;
      const existing = this.nodes.get(gn.id);
      if (existing) {
        Object.assign(existing, {r: info.r, labeled: info.labeled, group, label: gn.labels[0]!});
        continue;
      }
      let at: Point;
      const known = (neighbors.get(gn.id) ?? [])
        .map((id) => this.nodes.get(id))
        .filter((n): n is LayoutNode => Boolean(n));
      // 템플릿을 본뜬 초안은 그 템플릿이 있던 자리에서 생겨난다. 고른 실험이 그 자리에서 초안이 되는 셈이다.
      const templateId = typeof gn.properties.templateId === 'string' ? gn.properties.templateId : null;
      const template = templateId ? this.nodes.get(templateId) : undefined;
      const anchor = group ? this.anchors.get(group) : undefined;
      const angle = hashUnit(gn.id) * Math.PI * 2;
      if (template && !graph.nodes.some((n) => n.id === templateId)) {
        at = {x: template.x ?? 0, y: template.y ?? 0};
      } else if (first) {
        // 퍼지기 전 자리: 묶음 자리를 가운데 쪽으로 줄인 곳 둘레.
        const base = anchor ?? {x: 0, y: 0};
        at = {x: base.x * BLOOM_START + Math.cos(angle) * 18, y: base.y * BLOOM_START + Math.sin(angle) * 18};
      } else if (known.length > 0) {
        const cx = known.reduce((s, n) => s + (n.x ?? 0), 0) / known.length;
        const cy = known.reduce((s, n) => s + (n.y ?? 0), 0) / known.length;
        at = {x: cx + Math.cos(angle) * 40, y: cy + Math.sin(angle) * 40};
      } else {
        const base = anchor ?? {x: 0, y: 0};
        at = {x: base.x + Math.cos(angle) * 30, y: base.y + Math.sin(angle) * 30};
      }
      this.nodes.set(gn.id, {
        id: gn.id,
        label: gn.labels[0]!,
        r: info.r,
        labeled: info.labeled,
        group,
        x: at.x,
        y: at.y,
        vx: 0,
        vy: 0,
      });
      placed.push(gn.id);
    }

    this.current = drawn.map((n) => this.nodes.get(n.id)!);
    this.simulation.nodes(this.current);
    this.simulation.force(
      'link',
      forceLink<LayoutNode, LayoutLink>(this.linksFor(graph))
        .id((n) => n.id)
        .distance((l) => l.distance)
        .strength((l) => l.strength),
    );

    if (first) {
      // 다 퍼진 모습을 먼저 계산해 경계를 남긴다. 움직임을 보여 줄 때는 퍼지기 전 자리로 되돌린다.
      const start = this.current.map((n) => ({x: n.x!, y: n.y!}));
      this.simulation.alpha(1);
      this.run(SETTLE_TICKS);
      this.settledBounds = this.bounds();
      if (options.animate) {
        this.current.forEach((n, i) => Object.assign(n, start[i], {vx: 0, vy: 0}));
        this.spread = BLOOM_START;
        this.simulation.alpha(1);
      } else {
        this.stopMotion();
      }
    } else if (placed.length > 0 || this.current.length > 0) {
      // 답마다 크게 데우면 기존 노드가 몇 초씩 흘러간다. 새 노드가 자리 잡고 초안이 재료를 조금 당길 만큼만.
      this.simulation.alpha(Math.max(this.simulation.alpha(), 0.25));
      if (!options.animate) {
        this.run(UPDATE_TICKS);
        this.stopMotion();
      }
    }
    return {placed, first};
  }

  private linksFor(graph: GraphSnapshot): LayoutLink[] {
    const ids = new Set(this.current.map((n) => n.id));
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const links: LayoutLink[] = [];
    for (const rel of graph.relationships) {
      if (!ids.has(rel.startNode) || !ids.has(rel.endNode)) continue;
      let spec = LINK[rel.type];
      const source = byId.get(rel.startNode)!;
      const draft = hasLabel(source, 'Experiment') && source.properties.kind === 'draft';
      const target = byId.get(rel.endNode)!;
      if (rel.type === 'REQUIRES' && target.labels[0] === 'Device') {
        // 장비는 모든 실험이 함께 쓴다. 템플릿마다 끌면 스테이션이 가운데로 무너진다. 초안만 살짝 끈다.
        spec = draft ? {distance: 150, strength: 0.05} : undefined;
      } else if (draft && rel.type === 'REQUIRES') spec = {distance: 150, strength: 0.08};
      else if (draft && rel.type === 'USES') spec = {distance: 100, strength: 0.2};
      if (spec) links.push({source: rel.startNode, target: rel.endNode, ...spec});
    }
    return links;
  }

  private run(ticks: number) {
    for (let i = 0; i < ticks; i += 1) this.simulation.tick();
  }

  private stopMotion() {
    for (const n of this.current) {
      n.vx = 0;
      n.vy = 0;
    }
    this.simulation.alpha(0);
  }

  private bounds(): Bounds | null {
    if (this.current.length === 0) return null;
    const xs = this.current.map((n) => n.x ?? 0);
    const ys = this.current.map((n) => n.y ?? 0);
    return {x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys)};
  }

  /** 퍼지는 동안 매 프레임 부른다. 0~1. */
  setSpread(value: number) {
    this.spread = value;
  }

  /** 퍼지기·끌기 동안 시뮬레이션이 식지 않게 붙잡는다. 0이면 놓는다. */
  hold(target: number) {
    this.simulation.alphaTarget(target);
    if (target > 0) this.simulation.alpha(Math.max(this.simulation.alpha(), target));
  }

  /** 끄는 동안 그 노드만 포인터에 붙인다. 이웃은 링크로 따라온다. */
  drag(id: string, x: number, y: number) {
    const n = this.nodes.get(id);
    if (!n) return;
    n.fx = x;
    n.fy = y;
  }

  /** 놓으면 고정하지 않는다. 링크와 묶음이 제자리로 되돌린다. */
  release(id: string) {
    const n = this.nodes.get(id);
    if (!n) return;
    n.fx = undefined;
    n.fy = undefined;
  }

  /** 한 걸음. 아직 움직이는 중이면 true. */
  tick(): boolean {
    if (this.simulation.alpha() < this.simulation.alphaMin()) return false;
    this.simulation.tick();
    return true;
  }
}
