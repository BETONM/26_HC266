import {describe, expect, it} from 'vitest';
import {hasLabel, type GraphNode, type GraphSnapshot} from './model';
import {filterGraph, mergeSnapshots, neighborhood} from './ops';
import {parseGraph} from './parse';

const hazard = (id: string, severity = 'high'): GraphNode => ({
  id,
  labels: ['Hazard'],
  properties: {title: `위험 ${id}`, description: '설명', severity},
});
const location = (id: string, name = id): GraphNode => ({id, labels: ['Location'], properties: {name}});
const rel = (id: string, startNode: string, endNode: string, type = 'CAUSES') => ({
  id,
  type,
  startNode,
  endNode,
  properties: {},
});

describe('parseGraph', () => {
  it('어긋난 노드·관계만 버리고 나머지는 살린다', () => {
    const {graph, warnings} = parseGraph({
      nodes: [
        location('a'),
        hazard('h1'),
        hazard('h2', 'severe'), // 모르는 심각도
        {id: 'x', labels: ['Alien'], properties: {}},
        'not-a-node',
      ],
      relationships: [rel('r1', 'a', 'h1'), rel('r2', 'a', 'missing'), rel('r3', 'a', 'h1', 'LIKES')],
    });
    expect(graph.nodes.map((n) => n.id)).toEqual(['a', 'h1']);
    expect(graph.relationships.map((r) => r.id)).toEqual(['r1']);
    // Alien 노드는 '모르는 라벨'과 '아는 라벨 없음' 두 경고를 남긴다.
    expect(warnings).toHaveLength(6);
  });

  it('Neo4j HTTP API graph 결과를 펼치고 중복 노드를 한 번만 남긴다', () => {
    const neo4j = {
      results: [
        {
          columns: ['n'],
          data: [
            {graph: {nodes: [{...location('1'), id: 1}, hazard('2')], relationships: [rel('9', '1', '2')]}},
            {graph: {nodes: [{...location('1'), id: 1}], relationships: []}},
          ],
        },
      ],
      errors: [],
    };
    const {graph, warnings} = parseGraph(neo4j, 'live');
    expect(warnings).toEqual([]);
    expect(graph.source).toBe('live');
    expect(graph.nodes.map((n) => n.id)).toEqual(['1', '2']);
    expect(graph.relationships).toHaveLength(1);
  });

  it('모르는 라벨은 무시하고 아는 라벨로 노드를 남긴다', () => {
    const {graph, warnings} = parseGraph({nodes: [{...location('a'), labels: ['Location', 'Archived']}]});
    expect(graph.nodes[0]?.labels).toEqual(['Location']);
    expect(warnings).toHaveLength(1);
  });

  it('알아볼 수 없는 응답은 빈 그래프와 경고', () => {
    const {graph, warnings} = parseGraph('nope');
    expect(graph.nodes).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});

describe('hasLabel', () => {
  it('라벨과 속성 모양이 모두 맞아야 참이다', () => {
    expect(hasLabel(hazard('h'), 'Hazard')).toBe(true);
    expect(hasLabel(hazard('h', 'nope'), 'Hazard')).toBe(false);
    expect(hasLabel(hazard('h'), 'Location')).toBe(false);
  });
});

describe('mergeSnapshots', () => {
  const base: GraphSnapshot = {nodes: [location('a'), hazard('h1')], relationships: [rel('r1', 'a', 'h1')] as never};

  it('추가와 변경을 구분해서 돌려준다', () => {
    const patch: GraphSnapshot = {
      nodes: [location('a'), hazard('h1', 'critical'), location('b')],
      relationships: [rel('r2', 'b', 'h1')] as never,
    };
    const result = mergeSnapshots(base, patch);
    expect(result.nodes).toEqual({added: ['b'], changed: ['h1']});
    expect(result.relationships).toEqual({added: ['r2'], changed: []});
    expect(result.graph.nodes.map((n) => n.id)).toEqual(['a', 'h1', 'b']);
  });

  it('속성 키 순서만 다르면 바뀐 것으로 보지 않는다', () => {
    const reordered = {...hazard('h1'), properties: {severity: 'high', description: '설명', title: '위험 h1'}};
    expect(mergeSnapshots(base, {nodes: [reordered], relationships: []}).nodes.changed).toEqual([]);
  });

  it('끝점이 없는 관계는 병합하지 않는다', () => {
    const result = mergeSnapshots(base, {nodes: [], relationships: [rel('r9', 'a', 'ghost')] as never});
    expect(result.relationships.added).toEqual([]);
  });

  it('목업과 실측을 섞으려 하면 거절한다', () => {
    expect(() => mergeSnapshots({...base, source: 'mock'}, {...base, source: 'live'})).toThrow('한 그래프에 합칠 수 없습니다');
  });
});

describe('neighborhood', () => {
  // a - b - c - d (방향은 섞여 있다)
  const chain: GraphSnapshot = {
    nodes: ['a', 'b', 'c', 'd'].map((id) => location(id)),
    relationships: [rel('ab', 'a', 'b'), rel('cb', 'c', 'b'), rel('cd', 'c', 'd')] as never,
  };

  it('방향과 상관없이 n-hop 안의 노드를 모은다', () => {
    expect(neighborhood(chain, ['b'], 1).nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
    expect(neighborhood(chain, ['a'], 2).relationships.map((r) => r.id).sort()).toEqual(['ab', 'cb']);
  });

  it('0-hop은 seed만, 없는 seed는 무시한다', () => {
    expect(neighborhood(chain, ['d', 'zzz'], 0).nodes.map((n) => n.id)).toEqual(['d']);
  });
});

describe('filterGraph', () => {
  const graph: GraphSnapshot = {
    nodes: [location('a', '시약장 A'), hazard('h1', 'critical'), hazard('h2', 'low')],
    relationships: [rel('r1', 'a', 'h1'), rel('r2', 'a', 'h2')] as never,
  };

  it('라벨과 속성으로 거르고, 양 끝이 남은 관계만 둔다', () => {
    const result = filterGraph(graph, {labels: ['Hazard'], where: {severity: 'critical'}});
    expect(result.nodes.map((n) => n.id)).toEqual(['h1']);
    expect(result.relationships).toEqual([]);
  });

  it('글자 검색은 공백과 대소문자를 무시한다', () => {
    expect(filterGraph(graph, {text: '시약장a'}).nodes.map((n) => n.id)).toEqual(['a']);
  });
});
