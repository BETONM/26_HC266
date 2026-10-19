import {useCallback, useEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import {Button, ToggleButton, ToggleButtonGroup, type Key} from 'react-aria-components';
import {enterFromNode, loadLabGraph} from '../app/chatController';
import {ConfigWarnings} from '../app/ConfigWarnings';
import {useAppStore, type GraphViewMode} from '../app/store';
import {GraphCanvas, type GraphCanvasControl} from '../graph/canvas/GraphCanvas';
import {labelName, nodeLines} from '../graph/canvas/labels';
import {LegendGlyph} from '../graph/canvas/LegendGlyph';
import {noInsets, type Insets} from '../graph/canvas/viewport';
import {
  hasLabel,
  nodeName,
  severityRank,
  type GraphNode,
  type GraphSnapshot,
  type NodeLabel,
  type Severity,
} from '../graph/model';
import {HazardBadge, SeverityGlyph} from '../hazard/HazardBadge';
import {ListView} from './ListView';
import {NodeDetail} from './NodeDetail';
import {applyViewFilter, draftComponents, labelsPresent} from './viewFilter';

type Source = 'lab' | 'draft' | 'query';
const titles: Record<Source, string> = {lab: '연구실 전체', draft: '구성 중인 실험', query: '조회 결과'};
const EMPTY = new Set<string>();
/** 진입 전환 시간. tokens.css의 --motion-enter와 같다. 그래프 카드가 줄어드는 동안 화면도 같은 시간에 따라간다. */
const ENTER_MS = 600;
/** 설명 카드가 차지하는 대략의 자리(px). 이 안에 가리킨 노드가 있으면 카드를 반대쪽으로 옮긴다. */
const HOVER_CARD_BOX = {width: 320, height: 180};

/** 요약 열의 '전체 보기'처럼 그래프 카드 밖에서 그래프를 움직일 때 쓴다. */
export const graphControl: {current: GraphCanvasControl | null} = {current: null};

/** 다른 곳(위험 요약의 '위험 목록 보기')에서 목록의 위험 절로 보낼 때 쓴다. */
export function showHazardList() {
  useAppStore.setState({graphViewMode: 'list', stage: 'graph', pane: 'work'});
  requestAnimationFrame(() => document.getElementById('hazard-list')?.focus());
}

/** 첫 화면 부제. 연구실에 무엇이 있는지 한 문장으로. */
function inventorySentence(graph: GraphSnapshot | null): string {
  if (!graph) return '연구실 그래프를 불러오는 중입니다.';
  const count = (label: NodeLabel) => graph.nodes.filter((n) => n.labels[0] === label).length;
  return `시약 ${count('Chemical')}종, 기구 ${count('Equipment')}종, 장비 ${count('Device')}대가 준비되어 있습니다. 물어보거나 노드를 눌러 시작하세요.`;
}

/** 이 노드에서 나가는 위험(HAS_HAZARD·CAUSES), 심각도 높은 순. */
function hazardsOf(graph: GraphSnapshot, id: string) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const found = graph.relationships
    .filter((r) => (r.type === 'HAS_HAZARD' || r.type === 'CAUSES') && r.startNode === id)
    .map((r) => byId.get(r.endNode))
    .filter((n): n is GraphNode => Boolean(n) && hasLabel(n!, 'Hazard'));
  return [...new Map(found.map((n) => [n.id, n])).values()].sort(
    (a, b) =>
      severityRank(String(b.properties.severity) as Severity) - severityRank(String(a.properties.severity) as Severity),
  );
}

function HoverCard({
  node,
  graph,
  corner,
}: {
  node: GraphNode;
  graph: GraphSnapshot | null;
  corner: 'start' | 'end' | 'bottom';
}) {
  const lines = nodeLines(node);
  const hazard = hasLabel(node, 'Hazard') ? node : null;
  // 시약을 가리키면 그 시약의 위험이 먼저 보여야 한다. 둘까지 적고 나머지는 수만.
  const hazards = !hazard && graph ? hazardsOf(graph, node.id) : [];
  return (
    <div className="hover-card" data-corner={corner} aria-hidden="true">
      <p className="hover-card-title">
        {hazard ? <SeverityGlyph severity={hazard.properties.severity} /> : <LegendGlyph label={node.labels[0]!} />}
        <strong>{lines.name}</strong>
      </p>
      <p className="hover-card-kind">{hazard ? `위험 · ${lines.tag}` : lines.tag}</p>
      {lines.detail && <p>{lines.detail}</p>}
      {hazard?.properties.mitigation && <p>대응: {hazard.properties.mitigation}</p>}
      {hazards.length > 0 && (
        <ul className="hover-card-hazards">
          {hazards.slice(0, 2).map((h) => (
            <li key={h.id}>
              {hasLabel(h, 'Hazard') && <HazardBadge severity={h.properties.severity} title={h.properties.title} />}
            </li>
          ))}
          {hazards.length > 2 && <li className="hover-card-more">외 {hazards.length - 2}건</li>}
        </ul>
      )}
    </div>
  );
}

/** 48rem 이상. 넓은 폭에서는 노드 상세를 요약 열이 그린다. */
export function useWide() {
  const query = '(min-width: 48rem)';
  const [wide, setWide] = useState(() => typeof window === 'undefined' || window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setWide(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return wide;
}

export function GraphPanel() {
  const screen = useAppStore((s) => s.screen);
  const draft = useAppStore((s) => s.draftGraph);
  const query = useAppStore((s) => s.queryGraph);
  const lab = useAppStore((s) => s.lab);
  const selectedId = useAppStore((s) => s.selectedNodeId);
  const viewMode = useAppStore((s) => s.graphViewMode);
  const hiddenLabels = useAppStore((s) => s.hiddenLabels);
  const hazardsOnly = useAppStore((s) => s.hazardsOnly);
  const focusIds = useAppStore((s) => s.focusIds);
  const changedIds = useAppStore((s) => s.changedIds);
  const revision = useAppStore((s) => s.graphRevision);
  const hasMessages = useAppStore((s) => s.messages.length > 0);
  const regionRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const [headHeight, setHeadHeight] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const wide = useWide();
  // 키보드로 고른 노드에도 설명 카드를 띄운다. 마우스만 쓰는 사람만 설명을 받으면 안 된다.
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    void loadLabGraph();
  }, []);

  const labGraph = lab.status === 'ready' ? lab.graph : null;
  // 첫 화면은 언제나 연구실 전체. 진입 뒤 첫 답이 끝나기 전에는 초안·조회 결과가 없으므로 그대로 전체다.
  const source: Source = screen === 'landing' ? 'lab' : draft ? 'draft' : query ? 'query' : 'lab';
  const base: GraphSnapshot | null = source === 'draft' ? draft : source === 'query' ? query : labGraph;
  const shown = useMemo(
    () => (base ? applyViewFilter(base, {hiddenLabels, hazardsOnly}) : null),
    [base, hiddenLabels, hazardsOnly],
  );
  const tinted = useMemo(() => (source === 'draft' && base ? draftComponents(base) : EMPTY), [source, base]);
  const inventory = labGraph ?? base;
  const findNode = (id: string | null) =>
    id ? (base?.nodes.find((n) => n.id === id) ?? labGraph?.nodes.find((n) => n.id === id) ?? null) : null;
  const selected = findNode(selectedId);
  const hovered = findNode(hoverId ?? focusId);
  const detailOpen = Boolean(selected) && screen === 'workspace';

  // 설명 카드는 그래프 영역 왼쪽 위에 뜬다. 가리킨 노드나 그 이웃이 그 자리 밑에 있으면 오른쪽 위로 옮겨 가리지 않는다.
  const [hoverCorner, setHoverCorner] = useState<'start' | 'end' | 'bottom'>('start');
  useEffect(() => {
    const id = hoverId ?? focusId;
    const region = regionRef.current?.getBoundingClientRect();
    const wrap = wrapRef.current?.getBoundingClientRect();
    if (!id || !region || !wrap || !base) return;
    // 가리킨 노드와 그 이웃, 그리고 매우 높은 위험은 늘 카드 밑에 두지 않는다. 탐색 중에 가장 무거운 위험이 가려지면 안 된다.
    const critical = base.nodes
      .filter((n) => hasLabel(n, 'Hazard') && n.properties.severity === 'critical')
      .map((n) => n.id);
    const ids = [
      id,
      ...critical,
      ...base.relationships.flatMap((r) => (r.startNode === id ? [r.endNode] : r.endNode === id ? [r.startNode] : [])),
    ];
    const left = region.left - wrap.left;
    const top = region.top - wrap.top;
    const right = region.right - wrap.left;
    const bottom = region.bottom - wrap.top;
    const points = ids.flatMap((nid) => {
      const p = graphControl.current?.screenPosition(nid);
      return p ? [p] : [];
    });
    const {width: w, height: h} = HOVER_CARD_BOX;
    // 왼쪽 위 → 오른쪽 위 → 왼쪽 아래 순으로 비어 있는 모서리를 고른다.
    const corners = [
      {corner: 'start' as const, hit: (p: {x: number; y: number}) => p.x < left + w && p.y < top + h},
      {corner: 'end' as const, hit: (p: {x: number; y: number}) => p.x > right - w && p.y < top + h},
      {corner: 'bottom' as const, hit: (p: {x: number; y: number}) => p.x < left + w && p.y > bottom - h},
    ];
    setHoverCorner(corners.find((c) => !points.some(c.hit))?.corner ?? 'start');
  }, [hoverId, focusId, base]);

  // 보이는 영역(.graph-region)을 그래프 SVG 기준 여백으로 잰다. 맞출 때마다 새로 재므로 화면이 바뀐 직후의 자리를 쓴다.
  const getInsets = useCallback((): Insets => {
    const region = regionRef.current?.getBoundingClientRect();
    const svg = wrapRef.current?.getBoundingClientRect();
    if (!region || !svg || region.width === 0) return noInsets;
    return {
      top: region.top - svg.top,
      left: region.left - svg.left,
      right: svg.right - region.right,
      bottom: svg.bottom - region.bottom,
    };
  }, []);

  // 그래프 카드 머리말(제목·도구·범례)의 실제 높이. 범례가 두 줄이 되면 그만큼 그래프·목록·상세가 아래로 내려간다.
  useEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const observer = new ResizeObserver(
      ([entry]) => entry && setHeadHeight(Math.ceil(entry.borderBoxSize[0]?.blockSize ?? head.offsetHeight)),
    );
    observer.observe(head);
    return () => observer.disconnect();
  }, []);

  // 포커스 노드만으로 맞추면 하나만 크게 확대된다. 그 노드의 이웃까지 넣어 맞춘다.
  const fit = useMemo(() => {
    // 조회 결과는 결과 전체가 답이다. 일부만 맞추면 결과가 화면 밖으로 밀려난 줄 모른다.
    // '위험만 보기'나 종류 필터를 바꾸면 남은 것에 맞춰 다시 맞춘다. 위험을 보려고 누른 단추가 위험을 작게 보여 주면 안 된다.
    const filterKey = `${hazardsOnly}:${hiddenLabels.join(',')}`;
    // key에 화면을 넣는다. 첫 화면과 진입 직후(아직 초안이 없을 때)는 대상이 같아 key가 같으면 엔진이 같은 요청으로 보고 건너뛴다.
    if (screen === 'landing' || source === 'query' || !shown || hazardsOnly || hiddenLabels.length > 0)
      return {key: `${screen}:${revision}:${source}:${filterKey}`, ids: [], duration: ENTER_MS};
    const ids = new Set(focusIds.filter((id) => shown.nodes.some((n) => n.id === id)));
    for (const rel of shown.relationships) {
      if (ids.has(rel.startNode)) ids.add(rel.endNode);
      else if (ids.has(rel.endNode)) ids.add(rel.startNode);
    }
    return {
      key: `${screen}:${revision}:${source}:${filterKey}:${[...ids].sort().join(',')}`,
      ids: [...ids],
      duration: ENTER_MS,
    };
  }, [revision, source, screen, focusIds, shown, hazardsOnly, hiddenLabels]);

  const onActivate = useCallback(
    (id: string) => {
      const node = base?.nodes.find((n) => n.id === id);
      if (screen === 'landing') {
        if (node) enterFromNode(id, nodeName(node));
        return;
      }
      useAppStore.setState({selectedNodeId: id});
    },
    [base, screen],
  );
  const onClear = useCallback(() => useAppStore.setState({selectedNodeId: null}), []);

  // 상세 패널을 열면 선택한 노드가 그 밑에 숨지 않게 옮긴다.
  useEffect(() => {
    if (detailOpen && selectedId) graphControl.current?.reveal(selectedId);
  }, [detailOpen, selectedId]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const present = base ? labelsPresent(base) : [];
  const visibleLabels = present.filter((l) => !hiddenLabels.includes(l));
  const counts = (l: NodeLabel) => base?.nodes.filter((n) => n.labels[0] === l).length ?? 0;
  const draftName =
    source === 'draft'
      ? draft?.nodes.find((n) => hasLabel(n, 'Experiment') && n.properties.kind === 'draft')
      : undefined;

  return (
    <div
      className="graph-panel"
      data-screen={screen}
      data-view={viewMode}
      style={headHeight ? ({'--g-head': `${headHeight}px`} as CSSProperties) : undefined}
    >
      <header className="graph-head" ref={headRef}>
        <div className="graph-heading">
          {screen === 'landing' ? (
            <>
              <h1 className="hero-title">무엇을 실험해 볼까요?</h1>
              <p className="hero-sub">{inventorySentence(labGraph)}</p>
              <div className="hero-actions">
                {hasMessages && (
                  <Button className="text-button" onPress={() => useAppStore.getState().setScreen('workspace')}>
                    진행 중인 대화로 돌아가기
                  </Button>
                )}
                <Button
                  className="text-button"
                  onPress={() => useAppStore.setState({graphViewMode: viewMode === 'list' ? 'graph' : 'list'})}
                >
                  {viewMode === 'list' ? '그래프로 보기' : '목록으로 보기'}
                </Button>
              </div>
              <ConfigWarnings />
            </>
          ) : (
            <>
              <h2 className="graph-title">
                {titles[source]}
                {base?.source === 'mock' && <span className="source-tag">목업 데이터</span>}
              </h2>
              {draftName && <p className="graph-sub">{nodeName(draftName)}</p>}
            </>
          )}
        </div>
        <div className="graph-tools">
          {screen === 'workspace' && (
            <ToggleButtonGroup
              className="segmented"
              aria-label="보기 방식"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[viewMode]}
              onSelectionChange={(keys: Set<Key>) => {
                const [next] = keys;
                if (next) useAppStore.setState({graphViewMode: next as GraphViewMode});
              }}
            >
              <ToggleButton id="graph" className="segmented-button">
                그래프
              </ToggleButton>
              <ToggleButton id="list" className="segmented-button">
                목록
              </ToggleButton>
            </ToggleButtonGroup>
          )}
          {/* 좁은 폭에서는 종류 단추를 접어 둔다. 그래프가 화면의 대부분을 차지해야 한다. */}
          <Button
            className="secondary-button filters-toggle"
            aria-expanded={filtersOpen}
            aria-controls="graph-filters"
            onPress={() => setFiltersOpen((v) => !v)}
          >
            필터{hiddenLabels.length > 0 || hazardsOnly ? ' · 적용 중' : ''}
          </Button>
          {viewMode === 'graph' && (
            <div className="zoom-controls" role="group" aria-label="확대·축소">
              <Button className="icon-button" aria-label="축소" onPress={() => graphControl.current?.zoom(0.8)}>
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                  <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </Button>
              <Button className="icon-button" aria-label="확대" onPress={() => graphControl.current?.zoom(1.25)}>
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                  <path d="M3.5 8h9M8 3.5v9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </Button>
              <Button className="icon-button" aria-label="전체 보기" onPress={() => graphControl.current?.fitAll()}>
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                  <path
                    d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Button>
            </div>
          )}
        </div>
        {/* 범례가 곧 필터다. 모양이 무엇을 뜻하는지 알려 주고, 눌러서 그 종류를 숨기거나 보인다. */}
        <div className="graph-filters" id="graph-filters" data-open={filtersOpen || undefined}>
          {present.length > 1 && (
            <ToggleButtonGroup
              className="filter-chips"
              aria-label="보여 줄 종류"
              selectionMode="multiple"
              selectedKeys={visibleLabels}
              onSelectionChange={(keys: Set<Key>) =>
                useAppStore.setState({hiddenLabels: present.filter((l) => !keys.has(l))})
              }
            >
              {present.map((l: NodeLabel) => (
                <ToggleButton key={l} id={l} className="filter-chip">
                  <LegendGlyph label={l} />
                  {labelName[l]}
                  <span className="filter-count">{counts(l)}</span>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}
        </div>
      </header>

      {/* 그래프 SVG는 화면 전체 한 장이다. 카드 모양으로 잘라 보이고, 진입 때는 자르는 틀만 줄어든다. */}
      <div className="graph-canvas-wrap" ref={wrapRef} hidden={viewMode === 'list' || !shown}>
        {shown && (
          <GraphCanvas
            graph={shown}
            tinted={tinted}
            changedIds={screen === 'workspace' ? changedIds : []}
            selectedId={screen === 'workspace' ? selectedId : null}
            fit={fit}
            getInsets={getInsets}
            onActivate={onActivate}
            onClear={onClear}
            onHover={setHoverId}
            onFocusChange={setFocusId}
            label={`${titles[source]} 그래프, 노드 ${shown.nodes.length}개`}
            controlRef={graphControl}
          />
        )}
      </div>
      <div className="graph-frame" aria-hidden="true" />
      <div className="graph-region" ref={regionRef} data-detail={detailOpen || undefined} aria-hidden="true" />

      {!shown && lab.status === 'loading' && (
        <p className="graph-state" role="status">
          연구실 그래프를 불러오는 중입니다.
        </p>
      )}
      {!shown && lab.status === 'error' && (
        <div className="graph-state" role="alert">
          <p>연구실 그래프를 불러오지 못했습니다. {lab.message}</p>
          <Button className="text-button" onPress={() => void loadLabGraph()}>
            다시 불러오기
          </Button>
        </div>
      )}
      {shown && shown.nodes.length === 0 && viewMode === 'graph' && (
        <p className="graph-state graph-empty">필터에 맞는 노드가 없습니다. 위의 종류 단추를 다시 켜 보세요.</p>
      )}
      {hovered && viewMode === 'graph' && !detailOpen && <HoverCard node={hovered} graph={base} corner={hoverCorner} />}

      {/* 목록은 그래프 보기에서도 숨겨 둔 채 그린다. 인쇄할 때는 그래프 대신 목록이 나온다. */}
      {shown && inventory && (
        <div className="list-view-wrap" hidden={viewMode !== 'list'}>
          <ListView
            graph={shown}
            draft={source === 'draft' ? base : null}
            inventory={inventory}
            onSelect={(id) => useAppStore.setState({selectedNodeId: id})}
          />
        </div>
      )}
      {detailOpen && !wide && selected && inventory && (
        <NodeDetail node={selected} inventory={inventory} draft={source === 'draft' ? base : null} onClose={onClear} />
      )}
    </div>
  );
}
