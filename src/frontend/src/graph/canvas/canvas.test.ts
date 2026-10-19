import {describe, expect, it} from 'vitest';
import {createSeedGraph} from '../../adapters/graph/seed';
import {buildDraftGraph, draftFromTemplate} from '../../domain/draft';
import type {GraphSnapshot} from '../model';
import {drawnEdges, groupNodes, labelOf, STATION_GROUP} from './declutter';
import {ForceLayout, hashUnit, type NodeInfos} from './layout';
import {textWidth, truncate} from './measure';
import {firstInReadingOrder, nextInDirection} from './nav';
import {easeEnter, ensureVisible, fitBounds, keepAnchor, toScreen, zoomAt} from './viewport';

const infosOf = (graph: GraphSnapshot): NodeInfos => new Map(graph.nodes.map((n) => [n.id, {r: 8, labeled: true}]));
const positions = (layout: ForceLayout) => new Map([...layout.nodes].map(([id, n]) => [id, {x: n.x!, y: n.y!}]));

describe('viewport', () => {
  it('커서 아래 점을 고정한 채 확대하고, 0.3~3배로 묶는다', () => {
    const view = {k: 1, tx: 0, ty: 0};
    const zoomed = zoomAt(view, 2, {x: 100, y: 50});
    expect(toScreen(zoomed, {x: 100, y: 50})).toEqual({x: 100, y: 50});
    expect(zoomAt(view, 100, {x: 0, y: 0}).k).toBe(3);
    expect(zoomAt(view, 0.01, {x: 0, y: 0}).k).toBe(0.3);
  });

  it('fitBounds는 여백을 피해 가운데 맞춘다', () => {
    const view = fitBounds(
      {x0: -100, y0: -50, x1: 100, y1: 50},
      {width: 400, height: 300},
      {top: 0, right: 0, bottom: 100, left: 0},
      5,
    );
    expect(view.k).toBe(2);
    // 중심(0,0)이 여백을 뺀 영역(400×200)의 가운데에 온다.
    expect(toScreen(view, {x: 0, y: 0})).toEqual({x: 200, y: 100});
  });

  it('keepAnchor는 기준점의 화면 비율 위치와 줌을 지킨다', () => {
    const view = {k: 1.5, tx: 30, ty: -20};
    const anchor = {x: 100, y: 80};
    const before = toScreen(view, anchor);
    const next = keepAnchor(view, {width: 1440, height: 900}, {width: 1040, height: 900}, anchor);
    const after = toScreen(next, anchor);
    expect(next.k).toBe(1.5);
    expect(after.x / 1040).toBeCloseTo(before.x / 1440, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('ensureVisible은 화면 밖 점만 가장 적게 옮긴다', () => {
    const view = {k: 1, tx: 0, ty: 0};
    expect(ensureVisible(view, {width: 100, height: 100}, {x: 50, y: 50}, 10)).toBe(view);
    expect(ensureVisible(view, {width: 100, height: 100}, {x: 150, y: 50}, 10)).toEqual({k: 1, tx: -60, ty: 0});
  });

  it('easeEnter는 0과 1을 지나고 단조 증가한다', () => {
    expect(easeEnter(0)).toBeCloseTo(0, 5);
    expect(easeEnter(1)).toBeCloseTo(1, 5);
    const samples = Array.from({length: 11}, (_, i) => easeEnter(i / 10));
    expect(samples.every((v, i) => i === 0 || v >= samples[i - 1]!)).toBe(true);
  });
});

describe('nextInDirection', () => {
  const points = new Map([
    ['c', {x: 0, y: 0}],
    ['r', {x: 100, y: 10}],
    ['far-r', {x: 300, y: 0}],
    ['d', {x: 5, y: 90}],
    ['diag', {x: 60, y: 200}],
  ]);
  it('방향 쪽 원뿔 안에서 가장 가까운 노드', () => {
    expect(nextInDirection(points, 'c', 'right')).toBe('r');
    expect(nextInDirection(points, 'c', 'down')).toBe('d');
    expect(nextInDirection(points, 'c', 'left')).toBeNull();
    expect(nextInDirection(points, 'c', 'up')).toBeNull();
  });
  it('읽는 순서의 첫 노드는 왼쪽 위', () => {
    expect(firstInReadingOrder(points)).toBe('c');
  });
});

describe('measure', () => {
  it('한글은 라틴보다 넓게 잰다', () => {
    expect(textWidth('가나', 10)).toBeGreaterThan(textWidth('ab', 10));
  });
  it('긴 이름은 줄임표로 자른다', () => {
    const cut = truncate('아주 아주 아주 긴 시약 이름입니다 정말로', 14, 100);
    expect(cut.endsWith('…')).toBe(true);
    expect(textWidth(cut, 14)).toBeLessThanOrEqual(100);
  });
});

describe('ForceLayout', () => {
  const lab = createSeedGraph();
  const settled = () => {
    const layout = new ForceLayout();
    layout.setGraph(lab, infosOf(lab), {animate: false});
    return layout;
  };

  it('같은 그래프 → 같은 배치(결정적), 넓게 퍼지고 보관 위치는 그리지 않는다', () => {
    const a = settled();
    const b = settled();
    expect(positions(a)).toEqual(positions(b));
    const xs = [...positions(a).values()].map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(500);
    expect(a.visible.some((n) => n.label === 'Location')).toBe(false);
  });

  it('같은 보관 위치의 시약은 다른 묶음보다 제 묶음 자리에 가깝다', () => {
    const layout = settled();
    const general = layout.anchors.get('loc-general')!;
    const glassware = layout.anchors.get('loc-glassware')!;
    for (const id of ['chem-water', 'chem-cacl2', 'chem-na2co3']) {
      const p = layout.nodes.get(id)!;
      expect(Math.hypot(p.x! - general.x, p.y! - general.y)).toBeLessThan(
        Math.hypot(p.x! - glassware.x, p.y! - glassware.y),
      );
    }
    // 시약 묶음은 왼쪽, 기구·장비 묶음은 오른쪽.
    expect(general.x).toBeLessThan(0);
    expect(glassware.x).toBeGreaterThan(0);
    expect(layout.anchors.get(STATION_GROUP)!.x).toBeGreaterThan(0);
  });

  it('갱신할 때 기존 노드는 순간이동하지 않고, 초안은 본뜬 템플릿 자리에서 생겨난다', () => {
    const layout = settled();
    const before = positions(layout);
    const draft = buildDraftGraph(lab, draftFromTemplate(lab, 'exp-clock', 'exp-draft-1')!);
    const {placed} = layout.setGraph(draft, infosOf(draft), {animate: true});
    expect(placed).toEqual(['exp-draft-1']);
    const after = positions(layout);
    for (const node of draft.nodes) {
      if (node.id === 'exp-draft-1' || node.labels[0] === 'Location') continue;
      expect(after.get(node.id)).toEqual(before.get(node.id));
    }
    expect(after.get('exp-draft-1')).toEqual(before.get('exp-clock'));
    // 움직임은 그다음 프레임부터 이어진다.
    expect(layout.tick()).toBe(true);
  });

  it('그래프에서 빠졌다 돌아온 노드는 원래 자리에 나타난다', () => {
    const layout = settled();
    const before = positions(layout).get('eq-bottle-250');
    const subset: GraphSnapshot = {nodes: lab.nodes.filter((n) => n.id === 'chem-kio3'), relationships: []};
    layout.setGraph(subset, infosOf(subset), {animate: true});
    layout.setGraph(lab, infosOf(lab), {animate: true});
    expect(positions(layout).get('eq-bottle-250')).toEqual(before);
  });

  it('끄는 동안은 포인터에 붙고, 놓으면 고정하지 않는다', () => {
    const layout = settled();
    layout.hold(0.28);
    layout.drag('chem-kio3', 999, -999);
    for (let i = 0; i < 10; i += 1) layout.tick();
    const n = layout.nodes.get('chem-kio3')!;
    expect([n.x, n.y]).toEqual([999, -999]);
    layout.release('chem-kio3');
    layout.hold(0);
    for (let i = 0; i < 300; i += 1) layout.tick();
    // 링크와 묶음이 끌어 돌려놓는다.
    expect(Math.hypot(n.x! - 999, n.y! + 999)).toBeGreaterThan(300);
  });

  it('hashUnit은 0~1의 고정값', () => {
    expect(hashUnit('a')).toBe(hashUnit('a'));
    expect(hashUnit('a')).not.toBe(hashUnit('b'));
    expect(hashUnit('xyz')).toBeGreaterThanOrEqual(0);
    expect(hashUnit('xyz')).toBeLessThan(1);
  });
});

describe('declutter', () => {
  const lab = createSeedGraph();

  it('보관 위치로 묶고, 장비는 로봇 스테이션 하나로 모은다', () => {
    const {groups, groupOf} = groupNodes(lab);
    expect(groupOf.get('chem-kio3')).toBe('loc-oxidizer');
    expect(groupOf.get('dev-arm')).toBe(STATION_GROUP);
    expect(groups.find((g) => g.id === STATION_GROUP)!.members).toHaveLength(8);
    expect(groups.find((g) => g.id === 'loc-general')!.side).toBe('left');
    expect(groups.find((g) => g.id === 'loc-glassware')!.side).toBe('right');
  });

  it('보관 선은 그리지 않고, 같은 묶음의 기구·장비는 선 하나로 합친다', () => {
    const {groupOf} = groupNodes(lab);
    const edges = drawnEdges(lab, groupOf);
    expect(edges.some((e) => e.type === 'STORED_AT')).toBe(false);
    // 템플릿 → 공용 로봇 스테이션은 가리킬 때만, 기구 선반으로 가는 합친 선은 늘.
    const station = edges.find((e) => e.id === `group:exp-clock>${STATION_GROUP}`)!;
    expect(station).toMatchObject({type: 'GROUP', show: 'focus', count: 8});
    expect(edges.find((e) => e.id === 'group:exp-clock>loc-glassware')).toMatchObject({type: 'GROUP', show: 'always'});
    // 낱낱의 REQUIRES는 가리킬 때만.
    expect(edges.filter((e) => e.type === 'REQUIRES').every((e) => e.show === 'focus')).toBe(true);
    const always = edges.filter((e) => e.show === 'always').length;
    // 71개 관계 가운데 늘 그리는 선은 36개(합친 선 포함).
    expect(always).toBeLessThan(lab.relationships.length * 0.6);
  });

  it('이름표: 시약은 화학식, 높음 이상 위험과 실험은 늘, 나머지는 가리킬 때', () => {
    const byId = new Map(lab.nodes.map((n) => [n.id, n]));
    expect(labelOf(byId.get('chem-kio3')!)).toMatchObject({text: 'KIO₃', formula: true, always: true});
    expect(labelOf(byId.get('hz-so2-release')!)).toMatchObject({text: 'SO₂ 발생', always: true, essential: true});
    expect(labelOf(byId.get('hz-eye-irritant')!).always).toBe(false);
    expect(labelOf(byId.get('exp-clock')!)).toMatchObject({text: '색 변화', always: true});
    expect(labelOf(byId.get('eq-beaker-100')!).always).toBe(false);
  });
});

describe('cullLabels', () => {
  it('겹치면 우선순위가 높은 것만 남기고, 안 겹치면 모두 남긴다', async () => {
    const {cullLabels} = await import('./cull');
    const kept = cullLabels([
      {id: 'chem', x: 0, y: 0, width: 80, height: 16, priority: 1},
      {id: 'hazard', x: 10, y: 4, width: 80, height: 16, priority: 10},
      {id: 'far', x: 300, y: 0, width: 80, height: 16, priority: 0},
    ]);
    expect([...kept].sort()).toEqual(['far', 'hazard']);
  });

  it('기본 자리가 막히면 다른 자리를 쓴다', async () => {
    const {placeLabels} = await import('./cull');
    const blocker = {id: 'other', x: 0, y: 20, width: 10, height: 10, priority: 0};
    const label = {id: 'hz', x: 0, y: 20, width: 40, height: 14, priority: 70, alternatives: [{x: 0, y: -20}]};
    expect(placeLabels([label], 2, [blocker]).get('hz')).toBe(1);
    // 어디도 비지 않으면 우선순위가 keepAbove 이상일 때만 기본 자리에 남는다.
    const boxed = {...label, alternatives: [{x: 0, y: 20}]};
    expect(placeLabels([boxed], 2, [blocker]).has('hz')).toBe(false);
    expect(placeLabels([{...boxed, priority: 170}], 2, [blocker], 100).get('hz')).toBe(0);
  });

  it('다른 노드를 덮는 이름표는 숨기되, 우선순위가 높으면 남긴다', async () => {
    const {cullLabels} = await import('./cull');
    const node = {id: 'other', x: 0, y: 0, width: 10, height: 10, priority: 0};
    const label = {id: 'chem', x: 0, y: 0, width: 40, height: 14, priority: 30};
    expect(cullLabels([label], 2, [node]).size).toBe(0);
    expect(cullLabels([{...label, id: 'other'}], 2, [node]).size).toBe(1);
    expect(cullLabels([{...label, priority: 130}], 2, [node], 100).size).toBe(1);
  });
});
