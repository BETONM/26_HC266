// 그래프 그림의 명령형 부분. React는 요소를 만들고, 위치·화면 이동·입력·이름표 표시는 여기서 다룬다.
// 매 프레임 React를 다시 그리면 노드가 수백 개일 때 느리고, 진입 전환 중 위치가 흔들린다.
//
// 시뮬레이션은 살아 있다(layout.ts). 바뀐 게 있거나 아직 움직이는 동안만 requestAnimationFrame을 돈다.
// 노드·이름표는 줌을 따라 그대로 커지지 않는다. 배율의 제곱근만큼만 커져(0.8~1.35배) 멀리서도 읽히고 가까이서도 덮지 않는다.

import type {GraphSnapshot} from '../model';
import {placeLabels, type LabelBox} from './cull';
import type {DrawnEdge, NodeLabelInfo} from './declutter';
import {BLOOM_START, ForceLayout, type LayoutNode, type NodeInfos} from './layout';
import {nextInDirection, type Direction} from './nav';
import {
  boundsOf,
  easeEnter,
  ensureVisible,
  fitBounds,
  keepAnchor,
  lerpView,
  noInsets,
  toWorld,
  zoomAt,
  type Bounds,
  type Insets,
  type Size,
  type View,
} from './viewport';

const DRAG_THRESHOLD_PX = 3;
const RESIZE_SETTLE_MS = 120;
/** 처음 열 때 가운데에서 묶음 자리로 퍼지는 시간. */
const BLOOM_MS = 1600;
/** 이보다 멀리서 보면(좁은 화면 등) 실험·매우 높은 위험 이름만 남긴다. */
export const FAR_ZOOM = 0.45;
/** 이만큼 가까이 보면 모든 노드에 이름을 단다. */
export const CLOSE_ZOOM = 1.7;
/** 이름표 상자 높이(화면 px, 배율 1 기준). */
const LABEL_BOX_PX = 14;
const POOL_RADIUS = 32;
const POOL_BLUR = 14;
const POOL_PAD = 26;

/** 노드의 화면 배율. 줌의 제곱근을 따르되 묶어 둔다. */
export const nodeScreenScale = (k: number) => Math.min(1.35, Math.max(0.8, Math.sqrt(k)));
/** 이름표의 화면 배율. 노드는 멀리서 작아져도 되지만 글자는 12px 아래로 줄이지 않는다(최소 크기). */
export const labelScreenScale = (k: number) => Math.min(1.35, Math.max(1, Math.sqrt(k)));
/** 이 시간 안에 다시 연 탭에서는 퍼지는 움직임을 다시 보여 주지 않는다. 시그니처는 처음 한 번이면 된다. */
const BLOOM_SEEN_KEY = 'chembot.graph.bloomed';

function bloomSeen(): boolean {
  try {
    if (window.sessionStorage.getItem(BLOOM_SEEN_KEY)) return true;
    window.sessionStorage.setItem(BLOOM_SEEN_KEY, '1');
  } catch {
    // 저장소가 막혀 있으면 매번 퍼진다. 큰 문제는 아니다.
  }
  return false;
}
/** 이름표의 노드 중심에서 아래로의 거리(노드 좌표). 실험은 바깥 링이 있어 조금 더 내린다. */
export const labelOffset = (r: number, experiment: boolean) => r + (experiment ? 22 : 15);
/** 위쪽 자리의 기준선: 노드 위로 이만큼(노드 좌표). */
export const labelAbove = (r: number) => r + 6;

export type EngineCallbacks = {
  onActivate(id: string): void;
  onClear(): void;
  onHover(id: string | null): void;
  /** 키보드 포커스가 노드에 오거나(id) 그래프를 떠날 때(null). */
  onFocusNode(id: string | null): void;
};

export type NodeMeta = {r: number; label: NodeLabelInfo; labelWidth: number; experiment: boolean};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

export class GraphEngine {
  readonly layout = new ForceLayout();
  private view: View = {k: 1, tx: 0, ty: 0};
  private size: Size = {width: 0, height: 0};
  private adjacency = new Map<string, Set<string>>();
  private svg: SVGSVGElement | null = null;
  private viewport: SVGGElement | null = null;
  private nodeEls = new Map<string, {el: SVGGElement; meta: NodeMeta}>();
  private edgeEls = new Map<
    string,
    {line: SVGLineElement | null; text: SVGTextElement | null; edge: DrawnEdge; labelWidth: number}
  >();
  private poolBlobs = new Map<string, Map<string, SVGCircleElement>>();
  private poolLabels = new Map<string, {el: SVGTextElement; width: number}>();
  private poolBlur: SVGFEGaussianBlurElement | null = null;
  private hovered: string | null = null;
  private focused: string | null = null;
  private lastPointer: {x: number; y: number} | null = null;
  private frame: number | null = null;
  private dirty = false;
  private bloom: {start: number} | null = null;
  private fitAnim: {from: View; to: View; start: number; duration: number} | null = null;
  private pendingFit: {ids: readonly string[]; duration: number} | null = null;
  private settleTimer: number | undefined;
  private lastResizeAt = 0;
  private fittedOnce = false;
  private drag: {id: string; pointerId: number; sx: number; sy: number; moved: boolean} | null = null;
  private pan: {pointerId: number; sx: number; sy: number; tx: number; ty: number; moved: boolean} | null = null;
  private observer: ResizeObserver | null = null;
  private getInsets: () => Insets = () => noInsets;
  /** 크기가 바뀔 때 화면에서 제자리를 지킬 노드(선택한 노드). 이름표도 그 이웃까지 보인다. */
  private anchorId: string | null = null;
  private lastFitKey: string | null = null;

  constructor(private callbacks: EngineCallbacks) {}

  configure(options: {callbacks: EngineCallbacks; getInsets: () => Insets; anchorId: string | null}) {
    this.callbacks = options.callbacks;
    this.getInsets = options.getInsets;
    if (this.anchorId !== options.anchorId) {
      this.anchorId = options.anchorId;
      this.requestPaint();
    }
  }

  // ── 요소 등록 ──────────────────────────────────────────────────
  setViewport(el: SVGGElement | null) {
    this.viewport = el;
    this.requestPaint();
  }
  registerNode(id: string, el: SVGGElement | null, meta: NodeMeta) {
    if (el) this.nodeEls.set(id, {el, meta});
    else this.nodeEls.delete(id);
    this.requestPaint();
  }
  /** labelWidth: 관계 설명 글의 폭(화면 px, 12px 글자 기준). 글이 없으면 0. */
  registerEdge(edge: DrawnEdge, el: SVGGElement | null, labelWidth = 0) {
    if (el)
      this.edgeEls.set(edge.id, {line: el.querySelector('line'), text: el.querySelector('text'), edge, labelWidth});
    else this.edgeEls.delete(edge.id);
    this.requestPaint();
  }
  registerPoolBlob(group: string, member: string, el: SVGCircleElement | null) {
    const blobs = this.poolBlobs.get(group) ?? new Map<string, SVGCircleElement>();
    if (el) blobs.set(member, el);
    else blobs.delete(member);
    this.poolBlobs.set(group, blobs);
    this.requestPaint();
  }
  registerPoolLabel(group: string, el: SVGTextElement | null, width: number) {
    if (el) this.poolLabels.set(group, {el, width});
    else this.poolLabels.delete(group);
    this.requestPaint();
  }
  registerPoolBlur(el: SVGFEGaussianBlurElement | null) {
    this.poolBlur = el;
    this.requestPaint();
  }

  // ── 그래프 ─────────────────────────────────────────────────────
  setGraph(graph: GraphSnapshot, infos: NodeInfos) {
    this.adjacency = new Map();
    for (const rel of graph.relationships) {
      if (!this.adjacency.has(rel.startNode)) this.adjacency.set(rel.startNode, new Set());
      if (!this.adjacency.has(rel.endNode)) this.adjacency.set(rel.endNode, new Set());
      this.adjacency.get(rel.startNode)!.add(rel.endNode);
      this.adjacency.get(rel.endNode)!.add(rel.startNode);
    }
    const motion = !prefersReducedMotion();
    // 처음 그래프를 받을 때만 퍼지는 움직임을 보여 준다. 같은 탭에서 다시 열면 다 퍼진 모습으로 시작한다.
    const animate = this.layout.nodes.size === 0 ? motion && !bloomSeen() : motion;
    const {first} = this.layout.setGraph(graph, infos, {animate});
    if (first && animate) {
      this.bloom = {start: performance.now()};
      this.layout.hold(0.35);
    }
    if (!this.fittedOnce && this.size.width > 0) {
      this.fittedOnce = true;
      this.fitTo([], 0);
    }
    this.requestPaint();
  }

  positionOf(id: string) {
    const n = this.layout.nodes.get(id);
    return n ? {x: n.x ?? 0, y: n.y ?? 0} : null;
  }

  // ── 화면 ───────────────────────────────────────────────────────
  zoomBy(factor: number) {
    this.fitAnim = null;
    const insets = this.getInsets();
    const center = {
      x: insets.left + (this.size.width - insets.left - insets.right) / 2,
      y: insets.top + (this.size.height - insets.top - insets.bottom) / 2,
    };
    this.view = zoomAt(this.view, factor, center);
    this.requestPaint();
  }

  /** duration 0이면 바로 간다. 동작 줄이기에서도 바로 간다. */
  fitTo(ids: readonly string[], duration: number) {
    const target = this.targetFor(ids);
    if (!target) return;
    if (!duration || prefersReducedMotion()) {
      this.fitAnim = null;
      this.view = target;
    } else {
      this.fitAnim = {from: this.view, to: target, start: performance.now(), duration};
    }
    this.requestPaint();
  }

  /**
   * 맞춤을 요청한다. 같은 key의 요청은 한 번만 처리한다(ids 배열이 새로 만들어져도 key가 같으면 같은 요청).
   * 그래프 크기가 바뀌는 중이면 잦아든 뒤 맞춘다. 진입 전환처럼 크기는 그대로이고 보이는 영역(insets)만 바뀌면 바로,
   * 영역이 줄어드는 움직임과 같은 시간(duration)에 걸쳐 맞춘다.
   */
  requestFit(key: string, ids: readonly string[], duration: number) {
    if (key === this.lastFitKey) return;
    this.lastFitKey = key;
    if (this.size.width === 0 || performance.now() - this.lastResizeAt < RESIZE_SETTLE_MS) {
      this.pendingFit = {ids, duration};
      this.scheduleSettledFit();
    } else {
      this.fitTo(ids, duration);
    }
  }

  private scheduleSettledFit() {
    window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => {
      const pending = this.pendingFit;
      this.pendingFit = null;
      if (pending) this.fitTo(pending.ids, pending.duration);
    }, RESIZE_SETTLE_MS);
  }

  private targetFor(ids: readonly string[]): View | null {
    if (this.size.width === 0) return null;
    const insets = this.getInsets();
    const visible = this.layout.visible;
    const chosen =
      ids.length > 0
        ? ids.map((id) => this.layout.nodes.get(id)).filter((n): n is LayoutNode => Boolean(n) && visible.includes(n!))
        : [];
    let bounds: Bounds | null;
    if (chosen.length === 0 && this.bloom && this.layout.settledBounds) {
      // 퍼지는 중에는 다 퍼진 모습에 맞춘다. 지금 모습에 맞추면 퍼지는 동안 화면 밖으로 넘친다.
      const b = this.layout.settledBounds;
      bounds = {x0: b.x0 - 64, y0: b.y0 - 48, x1: b.x1 + 64, y1: b.y1 + 56};
    } else {
      // 이름표 자리까지 넣어 맞춘다. 맞춘 뒤 가장자리 이름표가 잘리지 않게.
      // 묶음에 든 노드는 웅덩이 반지름만큼 더 넣는다. 안 넣으면 맞춘 뒤 웅덩이가 카드 끝에서 잘린다.
      const pool = POOL_RADIUS + POOL_PAD;
      const items = (chosen.length > 0 ? chosen : [...visible]).map((n) => ({
        x: n.x ?? 0,
        y: n.y ?? 0,
        halfWidth: n.r + (n.group ? pool : 40),
        halfHeight: n.r + (n.group ? pool : 30),
      }));
      bounds = boundsOf(items, 24);
    }
    if (!bounds) return null;
    return fitBounds(bounds, this.size, insets, chosen.length > 0 ? 1.4 : 1.3);
  }

  /** 노드 중심의 SVG 기준 화면 좌표. 설명 카드가 노드를 가리지 않게 자리를 고를 때 쓴다. */
  screenPosition(id: string) {
    const p = this.positionOf(id);
    return p ? {x: p.x * this.view.k + this.view.tx, y: p.y * this.view.k + this.view.ty} : null;
  }

  /** 노드가 여백(상세 패널 등) 밑이나 화면 밖이면 가장 적게 움직여 보이게 한다. 포커스는 옮기지 않는다. */
  reveal(id: string) {
    const p = this.positionOf(id);
    if (!p) return;
    const next = ensureVisible(this.view, this.size, p, 60, this.getInsets());
    if (next === this.view) return;
    if (prefersReducedMotion()) {
      this.fitAnim = null;
      this.view = next;
    } else {
      this.fitAnim = {from: this.view, to: next, start: performance.now(), duration: 240};
    }
    this.requestPaint();
  }

  /** 키보드로 옮겨 간 노드가 화면 밖이면 들여오고 포커스를 준다. */
  focusNode(id: string) {
    const p = this.positionOf(id);
    if (p) {
      const next = ensureVisible(this.view, this.size, p, 60, this.getInsets());
      if (next !== this.view) {
        this.fitAnim = null;
        this.view = next;
        this.requestPaint();
      }
    }
    this.nodeEls.get(id)?.el.focus({preventScroll: true});
  }

  // ── 그리기 ─────────────────────────────────────────────────────
  requestPaint() {
    this.dirty = true;
    if (this.frame == null && typeof requestAnimationFrame !== 'undefined')
      this.frame = requestAnimationFrame(this.loop);
  }

  private loop = () => {
    this.frame = null;
    let again = false;
    const now = performance.now();
    if (this.bloom) {
      const t = Math.min(1, (now - this.bloom.start) / BLOOM_MS);
      this.layout.setSpread(BLOOM_START + (1 - BLOOM_START) * easeInOut(t));
      if (t >= 1) {
        this.bloom = null;
        if (!this.drag?.moved) this.layout.hold(0);
      }
      again = true;
    }
    if (this.layout.tick()) again = true;
    const anim = this.fitAnim;
    if (anim) {
      const t = Math.min(1, (now - anim.start) / anim.duration);
      this.view = lerpView(anim.from, anim.to, easeEnter(t));
      if (t < 1) again = true;
      else this.fitAnim = null;
    }
    if (again || this.dirty) {
      this.paint();
      this.dirty = false;
    }
    if (again) this.frame = requestAnimationFrame(this.loop);
  };

  private paint() {
    const v = this.view;
    const s = nodeScreenScale(v.k);
    const ls = labelScreenScale(v.k);
    const sz = s / v.k;
    if (this.svg) {
      const zoom = v.k < FAR_ZOOM ? 'far' : v.k >= CLOSE_ZOOM ? 'close' : 'near';
      if (this.svg.dataset.zoom !== zoom) this.svg.dataset.zoom = zoom;
      // 이름표 크기는 CSS가 쓴다. 노드 안 이름표는 노드 배율 대비 비율, 엣지 글자·묶음 이름은 월드 단위 배율.
      this.svg.style.setProperty('--graph-label-ratio', (ls / s).toFixed(4));
      this.svg.style.setProperty('--graph-label-scale', (ls / v.k).toFixed(4));
    }
    this.viewport?.setAttribute(
      'transform',
      `translate(${v.tx.toFixed(1)},${v.ty.toFixed(1)}) scale(${v.k.toFixed(4)})`,
    );
    for (const node of this.layout.visible) {
      this.nodeEls
        .get(node.id)
        ?.el.setAttribute(
          'transform',
          `translate(${(node.x ?? 0).toFixed(1)},${(node.y ?? 0).toFixed(1)}) scale(${sz.toFixed(4)})`,
        );
    }

    // 묶음: 노드마다 큰 원을 그리고, 필터가 흐린 뒤 세게 잘라 녹아 붙은 웅덩이로 만든다.
    const centers = new Map<string, {x: number; y: number}>();
    const poolLabelBoxes: LabelBox[] = [];
    for (const group of this.layout.groupList) {
      const members = group.members.map((id) => this.layout.nodes.get(id)).filter((n): n is LayoutNode => Boolean(n));
      if (members.length === 0) continue;
      const xs = members.map((n) => n.x ?? 0);
      const ys = members.map((n) => n.y ?? 0);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      centers.set(group.id, {x: (x0 + x1) / 2, y: (y0 + y1) / 2});
      const blobs = this.poolBlobs.get(group.id);
      for (const n of members) {
        const c = blobs?.get(n.id);
        if (!c) continue;
        c.setAttribute('cx', (n.x ?? 0).toFixed(1));
        c.setAttribute('cy', (n.y ?? 0).toFixed(1));
        c.setAttribute('r', (POOL_RADIUS * sz).toFixed(1));
      }
      const label = this.poolLabels.get(group.id);
      if (label) {
        const lx = x0 - POOL_PAD * sz;
        const ly = y0 - (POOL_PAD + 8) * sz;
        label.el.setAttribute('x', lx.toFixed(1));
        label.el.setAttribute('y', ly.toFixed(1));
        const w = label.width * ls;
        poolLabelBoxes.push({
          id: `pool:${group.id}`,
          x: lx * v.k + v.tx + w / 2,
          y: ly * v.k + v.ty - 4 * ls,
          width: w,
          height: LABEL_BOX_PX * ls,
          priority: this.highlight() ? 5 : 26,
        });
      }
    }
    this.poolBlur?.setAttribute('stdDeviation', (POOL_BLUR * sz).toFixed(2));

    const edgeLabelBoxes: LabelBox[] = [];
    for (const {line, text, edge, labelWidth} of this.edgeEls.values()) {
      const a = this.layout.nodes.get(edge.source);
      const b = edge.toGroup ? centers.get(edge.toGroup) : this.layout.nodes.get(edge.target ?? '');
      if (!line || !a || !b) continue;
      line.setAttribute('x1', (a.x ?? 0).toFixed(1));
      line.setAttribute('y1', (a.y ?? 0).toFixed(1));
      line.setAttribute('x2', (b.x ?? 0).toFixed(1));
      line.setAttribute('y2', (b.y ?? 0).toFixed(1));
      if (text) {
        const mx = ((a.x ?? 0) + (b.x ?? 0)) / 2;
        const my = ((a.y ?? 0) + (b.y ?? 0)) / 2 - (4 * ls) / v.k;
        text.setAttribute('x', mx.toFixed(1));
        text.setAttribute('y', my.toFixed(1));
        edgeLabelBoxes.push({
          id: `edge:${edge.id}`,
          x: mx * v.k + v.tx,
          y: my * v.k + v.ty - 4 * ls,
          width: labelWidth * ls + 4,
          height: LABEL_BOX_PX * ls,
          priority: 90,
        });
      }
    }
    this.showLabels(s, ls, poolLabelBoxes, edgeLabelBoxes);
  }

  private highlight() {
    return this.hovered ?? this.focused ?? this.anchorId;
  }

  /**
   * 어떤 이름표를 보일지. 기본 규칙(실험·화학식·높음 이상 위험)에 줌과 가리킴을 더하고, 서로 덮거나 다른 노드를 가리면
   * 덜 중요한 쪽을 숨긴다. 가리킨 노드와 그 이웃은 노드를 덮어도 남긴다.
   */
  private showLabels(s: number, ls: number, poolLabelBoxes: LabelBox[], edgeLabelBoxes: LabelBox[]) {
    const v = this.view;
    const highlight = this.highlight();
    const near = highlight ? new Set([highlight, ...(this.adjacency.get(highlight) ?? [])]) : null;
    // 끄는 동안에는 관계 설명 글을 숨긴다. 움직이는 선마다 글이 따라다니면 읽을 수 없다.
    const dragging = Boolean(this.drag?.moved);
    const boxes: LabelBox[] = [...poolLabelBoxes, ...(dragging ? [] : edgeLabelBoxes)];
    const shapes: LabelBox[] = [];
    const on = new Set<string>();
    for (const node of this.layout.visible) {
      const entry = this.nodeEls.get(node.id);
      if (!entry) continue;
      const {meta} = entry;
      const sx = (node.x ?? 0) * v.k + v.tx;
      const sy = (node.y ?? 0) * v.k + v.ty;
      const r = meta.r * s * 0.9;
      shapes.push({id: node.id, x: sx, y: sy, width: r * 2, height: r * 2, priority: 0});
      const isNear = near?.has(node.id) ?? false;
      const wanted = isNear || v.k >= CLOSE_ZOOM || (meta.label.always && (v.k >= FAR_ZOOM || meta.label.essential));
      if (!wanted) continue;
      on.add(node.id);
      const w = meta.labelWidth * ls;
      boxes.push({
        id: node.id,
        x: sx,
        // 이름표 기준선은 노드 아래 labelOffset(노드 배율), 글자 높이는 이름표 배율을 따른다.
        y: sy + labelOffset(meta.r, meta.experiment) * s - 4 * ls,
        width: w + 4,
        height: LABEL_BOX_PX * ls,
        // 매우 높은 위험의 이름은 다른 노드를 덮어서라도 남긴다. 화면에서 가장 무거운 정보다.
        priority:
          meta.label.priority +
          (isNear ? 40 : 0) +
          (node.id === highlight ? 100 : 0) +
          (meta.label.essential && !meta.experiment ? 100 : 0),
        // 아래가 막히면 위, 그다음 오른쪽을 시도한다.
        alternatives: [
          {x: sx, y: sy - labelAbove(meta.r) * s - 4 * ls},
          {x: sx + meta.r * s + 6 + w / 2, y: sy},
        ],
      });
    }
    const placed = placeLabels(boxes, 2, shapes, 100);
    const kept = new Set(placed.keys());
    for (const [id, {el, meta}] of this.nodeEls) {
      const spot = placed.get(id);
      const show = on.has(id) && spot !== undefined;
      if (el.hasAttribute('data-label-on') !== show) el.toggleAttribute('data-label-on', show);
      if (!show) continue;
      const pos = spot === 1 ? 'above' : spot === 2 ? 'right' : 'below';
      if (el.dataset.labelPos !== pos) {
        el.dataset.labelPos = pos;
        const text = el.querySelector<SVGTextElement>('.node-label');
        if (text) {
          // 노드 좌표(노드 배율) 기준의 기준선. 오른쪽은 글자 가운데를 노드 중심 높이에 맞춘다.
          const r = meta.r;
          const y = pos === 'above' ? -labelAbove(r) : pos === 'right' ? 4 : labelOffset(r, meta.experiment);
          text.setAttribute('y', String(y));
          text.setAttribute('x', pos === 'right' ? String(r + 6) : '0');
          text.setAttribute('text-anchor', pos === 'right' ? 'start' : 'middle');
        }
      }
    }
    for (const [group, {el}] of this.poolLabels) {
      const hide = !kept.has(`pool:${group}`);
      if (el.hasAttribute('data-cull') !== hide) el.toggleAttribute('data-cull', hide);
    }
    for (const {text, edge} of this.edgeEls.values()) {
      if (!text) continue;
      const hide = !kept.has(`edge:${edge.id}`);
      if (text.hasAttribute('data-cull') !== hide) text.toggleAttribute('data-cull', hide);
    }
  }

  // ── 입력 ───────────────────────────────────────────────────────
  attach(svg: SVGSVGElement): () => void {
    this.svg = svg;
    svg.addEventListener('pointerdown', this.onPointerDown);
    svg.addEventListener('pointermove', this.onPointerMove);
    svg.addEventListener('pointerup', this.onPointerUp);
    svg.addEventListener('pointercancel', this.onPointerUp);
    svg.addEventListener('pointerleave', this.onPointerLeave);
    svg.addEventListener('wheel', this.onWheel, {passive: false});
    svg.addEventListener('keydown', this.onKeyDown);
    svg.addEventListener('focusin', this.onFocusIn);
    svg.addEventListener('focusout', this.onFocusOut);
    this.observer = new ResizeObserver(
      ([entry]) => entry && this.onResize({width: entry.contentRect.width, height: entry.contentRect.height}),
    );
    this.observer.observe(svg);
    return () => {
      svg.removeEventListener('pointerdown', this.onPointerDown);
      svg.removeEventListener('pointermove', this.onPointerMove);
      svg.removeEventListener('pointerup', this.onPointerUp);
      svg.removeEventListener('pointercancel', this.onPointerUp);
      svg.removeEventListener('pointerleave', this.onPointerLeave);
      svg.removeEventListener('wheel', this.onWheel);
      svg.removeEventListener('keydown', this.onKeyDown);
      svg.removeEventListener('focusin', this.onFocusIn);
      svg.removeEventListener('focusout', this.onFocusOut);
      this.observer?.disconnect();
      this.observer = null;
      if (this.frame != null) cancelAnimationFrame(this.frame);
      this.frame = null;
      window.clearTimeout(this.settleTimer);
      this.svg = null;
    };
  }

  /** 줌을 지키고 기준점의 화면 비율 위치를 지킨다. fit은 돌리지 않는다. */
  private onResize(next: Size) {
    const prev = this.size;
    this.size = next;
    if (next.width === 0 || next.height === 0) return;
    if (prev.width === 0 || !this.fittedOnce) {
      this.fittedOnce = true;
      this.fitTo([], 0);
      return;
    }
    this.lastResizeAt = performance.now();
    const anchorId = this.anchorId ?? this.pendingFit?.ids[0] ?? null;
    const anchorPos = anchorId ? this.positionOf(anchorId) : null;
    const anchor = anchorPos ?? toWorld(this.view, {x: prev.width / 2, y: prev.height / 2});
    this.fitAnim = null;
    this.view = keepAnchor(this.view, prev, next, anchor);
    this.requestPaint();
    if (this.pendingFit) this.scheduleSettledFit();
  }

  private nodeIdOf(target: EventTarget | null): string | null {
    return target instanceof Element ? (target.closest('[data-node-id]')?.getAttribute('data-node-id') ?? null) : null;
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !this.svg) return;
    const id = this.nodeIdOf(event.target);
    this.svg.setPointerCapture(event.pointerId);
    if (id) this.drag = {id, pointerId: event.pointerId, sx: event.clientX, sy: event.clientY, moved: false};
    else
      this.pan = {
        pointerId: event.pointerId,
        sx: event.clientX,
        sy: event.clientY,
        tx: this.view.tx,
        ty: this.view.ty,
        moved: false,
      };
  };

  private onPointerMove = (event: PointerEvent) => {
    const d = this.drag;
    const p = this.pan;
    // 호버는 포인터가 실제로 움직였을 때만 바꾼다. 진입 전환으로 그래프가 가만히 있는 커서 밑으로 미끄러져 들어올 때
    // 호버가 켜지면, 전환이 끝나는 순간 엉뚱한 노드만 밝게 남는다.
    const moved = !this.lastPointer || this.lastPointer.x !== event.clientX || this.lastPointer.y !== event.clientY;
    this.lastPointer = {x: event.clientX, y: event.clientY};
    if (!d && !p && moved) {
      const id = this.nodeIdOf(event.target);
      if (id !== this.hovered) {
        this.hovered = id;
        this.callbacks.onHover(id);
        this.requestPaint();
      }
    }
    if (d && d.pointerId === event.pointerId && this.svg) {
      if (!d.moved && Math.hypot(event.clientX - d.sx, event.clientY - d.sy) < DRAG_THRESHOLD_PX) return;
      if (!d.moved) {
        d.moved = true;
        // 끄는 동안 시뮬레이션을 데워 두어 이웃이 링크를 따라 출렁이며 온다.
        this.layout.hold(0.28);
      }
      const rect = this.svg.getBoundingClientRect();
      const world = toWorld(this.view, {x: event.clientX - rect.left, y: event.clientY - rect.top});
      this.layout.drag(d.id, world.x, world.y);
      this.requestPaint();
    } else if (p && p.pointerId === event.pointerId) {
      const dx = event.clientX - p.sx;
      const dy = event.clientY - p.sy;
      if (!p.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      p.moved = true;
      this.fitAnim = null;
      this.view = {k: this.view.k, tx: p.tx + dx, ty: p.ty + dy};
      this.requestPaint();
    }
  };

  private onPointerUp = (event: PointerEvent) => {
    const d = this.drag;
    const p = this.pan;
    this.drag = null;
    this.pan = null;
    if (this.svg?.hasPointerCapture(event.pointerId)) this.svg.releasePointerCapture(event.pointerId);
    if (d?.moved) {
      // 고정하지 않는다. 놓으면 링크와 묶음이 제자리로 되돌린다.
      this.layout.release(d.id);
      if (!this.bloom) this.layout.hold(0);
      this.requestPaint();
    }
    if (event.type === 'pointercancel') return;
    if (d && !d.moved) this.callbacks.onActivate(d.id);
    else if (p && !p.moved) this.callbacks.onClear();
  };

  private onPointerLeave = () => {
    if (this.drag) return;
    if (this.hovered === null) return;
    this.hovered = null;
    this.callbacks.onHover(null);
    this.requestPaint();
  };

  private onWheel = (event: WheelEvent) => {
    if (!this.svg) return;
    event.preventDefault();
    const rect = this.svg.getBoundingClientRect();
    this.fitAnim = null;
    this.view = zoomAt(this.view, Math.exp(-event.deltaY * 0.0015), {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
    this.requestPaint();
  };

  private onFocusIn = (event: FocusEvent) => {
    const id = this.nodeIdOf(event.target);
    if (!id) return;
    this.focused = id;
    this.callbacks.onFocusNode(id);
    this.requestPaint();
  };

  private onFocusOut = (event: FocusEvent) => {
    // 그래프 안의 다른 노드로 옮겨 갈 때는 focusin이 곧 뒤따른다.
    if (this.nodeIdOf(event.relatedTarget)) return;
    this.focused = null;
    this.callbacks.onFocusNode(null);
    this.requestPaint();
  };

  private onKeyDown = (event: KeyboardEvent) => {
    const id = this.nodeIdOf(event.target);
    const dirs: Record<string, Direction> = {ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right'};
    const dir = dirs[event.key];
    if (id && dir) {
      event.preventDefault();
      const points = new Map(this.layout.visible.map((n) => [n.id, {x: n.x ?? 0, y: n.y ?? 0}]));
      const next = nextInDirection(points, id, dir);
      if (next) this.focusNode(next);
    } else if (id && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      this.callbacks.onActivate(id);
    } else if (event.key === 'Escape') {
      this.callbacks.onClear();
    } else if (event.key === '+' || event.key === '=') {
      this.zoomBy(1.25);
    } else if (event.key === '-' || event.key === '_') {
      this.zoomBy(0.8);
    } else if (event.key === '0') {
      this.fitTo([], 480);
    }
  };
}
