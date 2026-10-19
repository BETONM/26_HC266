import {describe, expect, it} from 'vitest';
import {createSeedGraph} from '../adapters/graph/seed';
import {parseGraph} from '../graph/parse';
import {buildDraftGraph, checkStock, draftFromTemplate, draftHazards, specFromDraftGraph} from './draft';

const inventory = createSeedGraph();

describe('draftFromTemplate', () => {
  it('템플릿의 USES·REQUIRES·PRODUCES를 옮긴다', () => {
    const spec = draftFromTemplate(inventory, 'exp-clock', 'd1')!;
    expect(spec.uses.map((u) => [u.chemicalId, u.amount])).toEqual([
      ['chem-starch', 5],
      ['chem-nahso3', 20],
      ['chem-kio3', 20],
    ]);
    expect(spec.requires.some((r) => r.targetId === 'dev-rgb')).toBe(true);
    expect(draftFromTemplate(inventory, 'chem-kio3', 'd1')).toBeNull();
  });
});

describe('buildDraftGraph ↔ specFromDraftGraph', () => {
  it('그래프로 만들었다가 되읽으면 같은 명세가 나온다', () => {
    const spec = draftFromTemplate(inventory, 'exp-clock', 'd1')!;
    const graph = buildDraftGraph(inventory, spec);
    expect(specFromDraftGraph(graph)).toEqual(spec);
  });

  it('파서를 경고 없이 통과하고, 위치·위험·생성물을 함께 담는다', () => {
    const graph = buildDraftGraph(inventory, draftFromTemplate(inventory, 'exp-clock', 'd1')!);
    expect(parseGraph(graph).warnings).toEqual([]);
    const ids = graph.nodes.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['loc-oxidizer', 'hz-oxidizer-fire', 'prod-starch-iodine', 'hz-iodine-stain']));
    // 초안에 없는 염산과의 반응은 담지 않는다.
    expect(graph.relationships.some((r) => r.type === 'REACTS_WITH' && r.endNode === 'chem-hcl')).toBe(false);
    // 초안 안에서 섞여 생기는 화재는 실험 자신의 위험으로도 잇는다.
    expect(graph.relationships.some((r) => r.type === 'HAS_HAZARD' && r.startNode === 'd1' && r.endNode === 'hz-oxidizer-fire')).toBe(true);
  });
});

describe('draftHazards', () => {
  it('심각도순이고, 조합 위험을 표시한다', () => {
    const hazards = draftHazards(inventory, draftFromTemplate(inventory, 'exp-clock', 'd1')!);
    expect(hazards.map((h) => h.hazard.properties.severity)).toEqual(['critical', 'high', 'medium', 'medium', 'low']);
    const fire = hazards.find((h) => h.hazard.id === 'hz-oxidizer-fire')!;
    expect(fire.combination).toBe(true);
    expect(fire.sources.sort()).toEqual(['녹말 지시약', '요오드산 칼륨 수용액']);
    // SO₂는 산이 있어야 생긴다. 이 초안에는 산이 없어 조건부 위험이다.
    expect(hazards.find((h) => h.hazard.id === 'hz-so2-release')).toMatchObject({combination: false, conditions: ['산과 접촉']});
  });
});

describe('checkStock', () => {
  it('부족·만료를 찾는다', () => {
    const precipitation = draftFromTemplate(inventory, 'exp-precipitation', 'd1')!;
    expect(checkStock(inventory, precipitation)).toEqual([
      {chemicalId: 'chem-na2co3', name: '탄산 나트륨 수용액', kind: 'short', need: 25, have: 15, unit: 'mL'},
    ]);
    const titration = draftFromTemplate(inventory, 'exp-titration', 'd1')!;
    expect(checkStock(inventory, titration).map((i) => i.kind)).toEqual(['expired']);
    expect(checkStock(inventory, draftFromTemplate(inventory, 'exp-clock', 'd1')!)).toEqual([]);
  });

  it('인벤토리에 없는 시약은 미보유다', () => {
    const spec = {...draftFromTemplate(inventory, 'exp-clock', 'd1')!, uses: [{chemicalId: 'ghost', amount: 1, unit: 'mL', role: 'reactant' as const}]};
    expect(checkStock(inventory, spec)[0]?.kind).toBe('missing');
  });
});
