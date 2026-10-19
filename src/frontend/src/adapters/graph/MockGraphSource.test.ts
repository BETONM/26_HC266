import {describe, expect, it} from 'vitest';
import {hasLabel, type GraphSnapshot} from '../../graph/model';
import {parseGraph} from '../../graph/parse';
import {MockGraphSource} from './MockGraphSource';
import {createSeedGraph} from './seed';

describe('시드', () => {
  it('파서를 경고 없이 통과한다', () => {
    const {graph, warnings} = parseGraph(createSeedGraph(), 'mock');
    expect(warnings).toEqual([]);
    expect(graph.nodes.length).toBe(createSeedGraph().nodes.length);
    expect(graph.relationships.length).toBe(createSeedGraph().relationships.length);
  });

  it('id가 겹치지 않는다', () => {
    const seed = createSeedGraph();
    const ids = [...seed.nodes, ...seed.relationships].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('재고 부족과 만료 사례, 템플릿 3종, 양쪽에서 잇는 조합 위험이 있다', () => {
    const seed = createSeedGraph();
    const chemicals = seed.nodes.filter((n) => hasLabel(n, 'Chemical'));
    expect(chemicals.some((n) => n.properties.status === 'low')).toBe(true);
    expect(chemicals.some((n) => n.properties.status === 'expired')).toBe(true);
    expect(seed.nodes.filter((n) => hasLabel(n, 'Experiment'))).toHaveLength(3);
    const so2Causes = seed.relationships.filter((r) => r.type === 'CAUSES' && r.endNode === 'hz-so2-release');
    expect(so2Causes.map((r) => r.startNode).sort()).toEqual(['chem-hcl', 'chem-nahso3']);
  });
});

describe('MockGraphSource', () => {
  it('결과에 mock 출처를 달고, 결과를 고쳐도 메모리 그래프는 그대로다', async () => {
    const source = new MockGraphSource();
    const all = await source.getAll();
    expect(all.source).toBe('mock');
    all.nodes.length = 0;
    expect((await source.getAll()).nodes.length).toBeGreaterThan(0);
  });

  it('글자로 시약을 찾는다', async () => {
    const result = await new MockGraphSource().search({labels: ['Chemical'], text: 'KIO₃'});
    expect(result.nodes.map((n) => n.id)).toEqual(['chem-kio3']);
  });

  it('이웃을 n-hop으로 준다', async () => {
    const result = await new MockGraphSource().getNeighborhood(['chem-kio3'], 1);
    const ids = result.nodes.map((n) => n.id);
    expect(ids).toContain('loc-oxidizer');
    expect(ids).toContain('hz-oxidizer-fire');
  });

  it('주입한 실패를 낸다', async () => {
    const source = new MockGraphSource({faults: {failEvery: 1}});
    await expect(source.getAll()).rejects.toThrow('목업에 주입한 실패');
  });

  describe('saveDraft', () => {
    const draft = (uses: string[]): GraphSnapshot => ({
      nodes: [
        {id: 'exp-draft-1', labels: ['Experiment'], properties: {name: '내 실험', description: '', kind: 'draft'}},
        // 인벤토리 노드를 고친 채로 보내도 반영되면 안 된다.
        {
          id: 'chem-kio3',
          labels: ['Chemical'],
          properties: {...createSeedGraph().nodes.find((n) => n.id === 'chem-kio3')!.properties, quantity: 0},
        },
      ],
      relationships: uses.map((id, i) => ({
        id: `draft-use-${i}`,
        type: 'USES' as const,
        startNode: 'exp-draft-1',
        endNode: id,
        properties: {amount: 10, unit: 'mL', role: 'reactant'},
      })),
    });

    it('초안을 저장하고, 갱신하면 빠진 USES가 사라진다', async () => {
      const source = new MockGraphSource();
      const first = await source.saveDraft(draft(['chem-kio3', 'chem-starch']));
      expect(first.experimentId).toBe('exp-draft-1');
      expect(first.graph.relationships.filter((r) => r.type === 'USES')).toHaveLength(2);

      await source.saveDraft(draft(['chem-kio3']));
      const after = await source.getNeighborhood(['exp-draft-1'], 1);
      expect(after.relationships.filter((r) => r.type === 'USES').map((r) => r.endNode)).toEqual(['chem-kio3']);
    });

    it('이미 있는 인벤토리 노드는 덮어쓰지 않는다', async () => {
      const source = new MockGraphSource();
      const {warnings} = await source.saveDraft(draft(['chem-kio3']));
      expect(warnings).toHaveLength(1);
      const [kio3] = (await source.getByIds(['chem-kio3'])).nodes;
      expect(kio3?.properties.quantity).toBe(180);
    });

    it('초안 노드가 없으면 거절한다', async () => {
      await expect(new MockGraphSource().saveDraft({nodes: [], relationships: []})).rejects.toThrow('실험 초안 노드는 하나여야 합니다');
    });
  });
});
