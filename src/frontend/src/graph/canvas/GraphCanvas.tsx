import {useEffect, useId, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {SeverityShapes} from '../../hazard/HazardBadge';
import {hasLabel, type GraphNode, type GraphSnapshot, type Severity} from '../model';
import {drawnEdges, groupNodes, isDraftExperiment, isDrawnNode, labelOf, radiusOf, type DrawnEdge} from './declutter';
import {GraphEngine, labelOffset} from './engine';
import {nodeAriaLabel, relationBrief} from './labels';
import type {NodeInfo} from './layout';
import {textWidth} from './measure';
import {firstInReadingOrder} from './nav';
import type {Insets} from './viewport';
import './graph.css';

const CHANGED_HIGHLIGHT_MS = 4000;

export type FitRequest = {key: string; ids: readonly string[]; duration: number};

export type GraphCanvasControl = {
  zoom(factor: number): void;
  fitAll(): void;
  reveal(id: string): void;
  /** 노드 중심의 화면 좌표(그래프 SVG 기준). */
  screenPosition(id: string): {x: number; y: number} | null;
};

export type GraphCanvasProps = {
  graph: GraphSnapshot;
  /** 구성 중인 실험의 구성요소. 강조색 테두리가 붙는다. Hazard는 넣어도 표시하지 않는다. */
  tinted: ReadonlySet<string>;
  changedIds: readonly string[];
  selectedId: string | null;
  /** key가 바뀌면 ids(비면 전체)로 화면을 맞춘다. */
  fit: FitRequest;
  /** 그래프 SVG 가장자리에서 보이는 영역까지의 여백(px). 맞출 때마다 새로 잰다. */
  getInsets(): Insets;
  /** 노드를 누르거나 Enter. */
  onActivate(id: string): void;
  /** 빈 곳을 누르거나 Esc. */
  onClear(): void;
  onHover?(id: string | null): void;
  /** 키보드 포커스가 노드에 오거나(id) 그래프를 떠날 때(null). 설명 카드가 쓴다. */
  onFocusChange?(id: string | null): void;
  label: string;
  describedBy?: string;
  /** 바깥 단추(확대·축소·전체 보기)가 쓰는 손잡이. */
  controlRef?: {current: GraphCanvasControl | null};
};

function severityOf(node: GraphNode | undefined): Severity | null {
  return node && hasLabel(node, 'Hazard') ? node.properties.severity : null;
}

/** 이름표 글자 크기(px, 배율 1). graph.css의 .node-label 크기와 같다. */
const labelPx = (node: GraphNode, formula: boolean) => (node.labels[0] === 'Experiment' ? 14 : formula ? 13.5 : 12);

function NodeShape({node, r}: {node: GraphNode; r: number}) {
  const severity = severityOf(node);
  if (severity) {
    return (
      <svg className="node-glyph" x={-r} y={-r} width={r * 2} height={r * 2} viewBox="0 0 16 16" aria-hidden="true">
        <SeverityShapes severity={severity} />
      </svg>
    );
  }
  switch (node.labels[0]) {
    case 'Experiment':
      return (
        <>
          <circle className="node-shape" r={r} />
          <circle className="node-core" r={r * 0.42} />
          {isDraftExperiment(node) && (
            <path
              className="node-cross"
              d={`M${-r - 9} 0H${-r - 3}M${r + 3} 0H${r + 9}M0 ${-r - 9}V${-r - 3}M0 ${r + 3}V${r + 9}`}
            />
          )}
        </>
      );
    case 'Equipment':
      return <rect className="node-shape" x={-r} y={-r} width={r * 2} height={r * 2} rx={2.5} />;
    case 'Device':
      return (
        <rect
          className="node-shape"
          x={-r * 0.8}
          y={-r * 0.8}
          width={r * 1.6}
          height={r * 1.6}
          rx={1.5}
          transform="rotate(45)"
        />
      );
    default:
      return <circle className="node-shape" r={r} />;
  }
}

/**
 * 연구실 그래프. 첫 화면과 작업 화면에서 같은 인스턴스로 남는다.
 * SVG는 화면 전체 한 장이고 보이는 영역(getInsets)만 바뀐다. 진입 전환은 그 영역에 맞춰 화면을 옮기는 움직임이다.
 */
export function GraphCanvas(props: GraphCanvasProps) {
  const {
    graph,
    tinted,
    changedIds,
    selectedId,
    fit,
    getInsets,
    onActivate,
    onClear,
    onHover,
    onFocusChange,
    label,
    describedBy,
    controlRef,
  } = props;
  const hintId = useId();
  // url(#…) 안에서 쓸 수 있게 영숫자만 남긴다.
  const poolFilterId = `pool-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [engine] = useState(
    () =>
      new GraphEngine({
        onActivate: () => {},
        onClear: () => {},
        onHover: () => {},
        onFocusNode: () => {},
      }),
  );

  // 콜백과 설정은 늘 최신 것을 쓴다. 엔진은 한 번만 만든다.
  useLayoutEffect(() => {
    engine.configure({
      callbacks: {
        onActivate,
        onClear,
        onHover: (id) => {
          setHoverId(id);
          onHover?.(id);
        },
        onFocusNode: (id) => {
          setFocusedId(id);
          onFocusChange?.(id);
        },
      },
      getInsets,
      anchorId: selectedId,
    });
  }, [engine, onActivate, onClear, onHover, onFocusChange, getInsets, selectedId]);

  useEffect(() => {
    const svg = svgRef.current;
    return svg ? engine.attach(svg) : undefined;
  }, [engine]);

  const nodes = useMemo(() => graph.nodes.filter(isDrawnNode), [graph]);
  const labels = useMemo(() => new Map(nodes.map((n) => [n.id, labelOf(n)])), [nodes]);
  const infos = useMemo(
    () => new Map<string, NodeInfo>(nodes.map((n) => [n.id, {r: radiusOf(n), labeled: labels.get(n.id)!.always}])),
    [nodes, labels],
  );
  const {groups, groupOf} = useMemo(() => groupNodes(graph), [graph]);
  const edges = useMemo(() => drawnEdges(graph, groupOf), [graph, groupOf]);
  useLayoutEffect(() => engine.setGraph(graph, infos), [engine, graph, infos]);

  useEffect(() => engine.requestFit(fit.key, fit.ids, fit.duration), [engine, fit.key, fit.ids, fit.duration]);

  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      zoom: (factor) => engine.zoomBy(factor),
      fitAll: () => engine.fitTo([], 480),
      reveal: (id) => engine.reveal(id),
      screenPosition: (id) => engine.screenPosition(id),
    };
    return () => {
      controlRef.current = null;
    };
  }, [controlRef, engine]);

  // 바뀐 노드 강조는 몇 초 뒤 사라진다.
  const changedKey = changedIds.join('|');
  const [expiredKey, setExpiredKey] = useState('');
  useEffect(() => {
    if (!changedKey) return;
    const timer = window.setTimeout(() => setExpiredKey(changedKey), CHANGED_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [changedKey]);
  const changed = useMemo(
    () => new Set(changedKey !== expiredKey ? changedIds : []),
    [changedIds, changedKey, expiredKey],
  );

  const nodesById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const rel of graph.relationships) {
      if (!map.has(rel.startNode)) map.set(rel.startNode, new Set());
      if (!map.has(rel.endNode)) map.set(rel.endNode, new Set());
      map.get(rel.startNode)!.add(rel.endNode);
      map.get(rel.endNode)!.add(rel.startNode);
    }
    return map;
  }, [graph]);
  const relsById = useMemo(() => new Map(graph.relationships.map((r) => [r.id, r])), [graph]);

  // 키보드 진입점: 포커스한 노드 > 선택한 노드 > 읽는 순서의 첫 노드. 탭 정지는 그래프 전체에 하나뿐이다.
  const tabStopId = useMemo(() => {
    if (focusedId && nodesById.has(focusedId)) return focusedId;
    if (selectedId && nodesById.has(selectedId)) return selectedId;
    const points = new Map(
      nodes.flatMap((n) => {
        const p = engine.positionOf(n.id);
        return p ? [[n.id, p] as const] : [];
      }),
    );
    return firstInReadingOrder(points);
  }, [focusedId, selectedId, nodesById, nodes, engine]);

  const highlight = hoverId ?? selectedId;
  const near = highlight ? (neighbors.get(highlight) ?? new Set<string>()) : null;
  const hotGroup = highlight ? groupOf.get(highlight) : undefined;

  // 관계가 많은 노드를 가리키면 설명 글이 겹겹이 쌓인다. 넷까지만 글로 달고, 그보다 많으면 설명 카드·상세 패널에 맡긴다.
  const describeLimit = 4;
  const hoverEdges = hoverId
    ? edges.filter((e) => e.type !== 'GROUP' && (e.source === hoverId || e.target === hoverId)).length
    : 0;
  const describeHover = hoverEdges > 0 && hoverEdges <= describeLimit;

  const edgeSeverity = (edge: DrawnEdge) =>
    severityOf(nodesById.get(edge.target ?? '')) ?? severityOf(nodesById.get(edge.source));
  const touches = (edge: DrawnEdge, id: string | null) => id != null && (edge.source === id || edge.target === id);

  return (
    <svg
      ref={svgRef}
      className="graph-canvas"
      role="group"
      aria-label={label}
      aria-describedby={[hintId, describedBy].filter(Boolean).join(' ')}
    >
      <desc id={hintId}>
        방향키로 노드 사이를 옮겨 다니고 Enter로 엽니다. +와 −로 확대·축소하고 0으로 전체를 봅니다.
      </desc>
      <defs>
        {/* 필터는 sRGB로 계산한다. 기본값(linearRGB)은 어두운 색에서 계단 같은 띠를 만든다. */}
        <filter id={poolFilterId} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feGaussianBlur
            ref={(el) => engine.registerPoolBlur(el)}
            in="SourceGraphic"
            stdDeviation="14"
            result="blur"
          />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 48 -20" />
        </filter>
      </defs>
      <g ref={(el) => engine.setViewport(el)}>
        <g className="graph-pools" aria-hidden="true">
          {groups.map((group) => (
            <g
              key={group.id}
              className="graph-pool"
              data-group={group.id}
              data-hot={hotGroup === group.id || undefined}
              data-tint={group.members.some((m) => tinted.has(m)) || undefined}
              filter={`url(#${poolFilterId})`}
            >
              {group.members.map((m) => (
                <circle key={m} ref={(el) => engine.registerPoolBlob(group.id, m, el)} />
              ))}
            </g>
          ))}
        </g>
        <g className="graph-pool-labels" aria-hidden="true">
          {groups.map((group) => (
            <text
              key={group.id}
              className="graph-pool-label"
              ref={(el) => engine.registerPoolLabel(group.id, el, textWidth(group.name, 12))}
            >
              {group.name}
            </text>
          ))}
        </g>
        <g className="graph-edges" aria-hidden="true">
          {edges.map((edge) => {
            const severity = edge.type === 'GROUP' ? null : edgeSeverity(edge);
            const incident = touches(edge, highlight);
            const focused = touches(edge, focusedId);
            // 관계 설명은 가리키거나 키보드로 고른 노드에만 단다. 선택만으로 달면 상세 패널을 여는 순간 글자가 겹겹이 쌓인다.
            const described = (describeHover && touches(edge, hoverId)) || focused;
            const rel = relsById.get(edge.id);
            const tint =
              edge.type !== 'GROUP' && tinted.has(edge.source) && (edge.target ? tinted.has(edge.target) : false);
            const text = rel && described ? relationBrief(rel) : null;
            return (
              <g
                key={edge.id}
                ref={(el) => engine.registerEdge(edge, el, text ? textWidth(text, 12) : 0)}
                className="graph-edge"
                data-type={edge.type}
                data-show={edge.show}
                data-severity={severity ?? undefined}
                data-tint={tint || (edge.type === 'GROUP' && tinted.has(edge.source)) || undefined}
                data-dim={(highlight != null && !incident) || undefined}
                data-active={incident || focused || undefined}
              >
                <line />
                {text && (
                  <text className="graph-edge-label" textAnchor="middle">
                    {text}
                  </text>
                )}
              </g>
            );
          })}
        </g>
        <g className="graph-nodes">
          {nodes.map((node) => {
            const r = infos.get(node.id)!.r;
            const info = labels.get(node.id)!;
            const severity = severityOf(node);
            const experiment = node.labels[0] === 'Experiment';
            const status =
              typeof node.properties.status === 'string' && node.properties.status !== 'available'
                ? node.properties.status
                : undefined;
            const meta = {r, label: info, labelWidth: textWidth(info.text, labelPx(node, info.formula)), experiment};
            return (
              <g
                key={node.id}
                ref={(el) => engine.registerNode(node.id, el, meta)}
                className="graph-node"
                data-node-id={node.id}
                data-label={node.labels[0]}
                data-severity={severity ?? undefined}
                data-status={status}
                data-draft={isDraftExperiment(node) || undefined}
                // 공용 로봇 스테이션의 장비에는 테두리를 달지 않는다(웅덩이가 대신 물든다). 다 달면 파란 고리 묶음이 위험보다 먼저 보인다.
                data-tint={(!severity && node.labels[0] !== 'Device' && tinted.has(node.id)) || undefined}
                data-selected={selectedId === node.id || undefined}
                data-changed={changed.has(node.id) || undefined}
                data-dim={(near != null && node.id !== highlight && !near.has(node.id)) || undefined}
                role="button"
                tabIndex={node.id === tabStopId ? 0 : -1}
                aria-label={nodeAriaLabel(node, {neighbors: neighbors.get(node.id)?.size ?? 0})}
                aria-pressed={selectedId === node.id}
              >
                <circle className="node-hit" r={r + 8} />
                <circle className="node-changed" r={r + 11} />
                <circle className="node-halo" r={r + 6} />
                {/* 키보드 포커스는 고른 것·선택 고리와 겹치지 않게 한 겹 바깥에 둔다. */}
                <circle className="node-focus" r={r + 10} />
                {/* 히어로(파란 면) 위에서 위험 기호를 신호색 그대로 읽히게 까는 흰 원 */}
                {severity && <circle className="node-disc" r={r + 3} />}
                {status && <circle className="node-status" r={r + 3.5} />}
                <NodeShape node={node} r={r} />
                <text
                  className={`node-label${info.formula ? ' node-label-formula' : ''}`}
                  y={labelOffset(r, experiment)}
                  textAnchor="middle"
                >
                  {info.text}
                </text>
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
}
