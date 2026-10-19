import {describe, expect, it} from 'vitest';
import {createSeedGraph} from '../adapters/graph/seed';
import {canConfirm, checkConfirmation, snapshotId} from './confirm';
import {buildDraftGraph, draftFromTemplate} from './draft';

const inventory = createSeedGraph();
const draftOf = (template: string) => buildDraftGraph(inventory, draftFromTemplate(inventory, template, 'exp-draft-1')!);

describe('checkConfirmation', () => {
  it('색 변화 실험: 막는 재고 문제 없음, high·critical 위험 2개를 확인해야 한다', () => {
    const check = checkConfirmation(inventory, draftOf('exp-clock'))!;
    expect(check.blockers).toEqual([]);
    expect(check.mustAcknowledge.map((h) => h.hazard.id)).toEqual(['hz-so2-release', 'hz-oxidizer-fire']);
    expect(canConfirm(check, new Set())).toBe(false);
    expect(canConfirm(check, new Set(['hz-so2-release']))).toBe(false);
    expect(canConfirm(check, new Set(['hz-so2-release', 'hz-oxidizer-fire']))).toBe(true);
  });

  it('재고 부족이면 위험을 모두 확인해도 확정할 수 없다', () => {
    const check = checkConfirmation(inventory, draftOf('exp-precipitation'))!;
    expect(check.blockers.map((b) => b.kind)).toEqual(['short']);
    expect(canConfirm(check, new Set(check.mustAcknowledge.map((h) => h.hazard.id)))).toBe(false);
  });

  it('초안이 없으면 null', () => {
    expect(checkConfirmation(inventory, {nodes: [], relationships: []})).toBeNull();
  });
});

describe('snapshotId', () => {
  it('같은 그래프면 순서가 달라도 같은 id, 내용이 다르면 다른 id', () => {
    const graph = draftOf('exp-clock');
    const shuffled = {...graph, nodes: [...graph.nodes].reverse(), relationships: [...graph.relationships].reverse()};
    expect(snapshotId(shuffled)).toBe(snapshotId(graph));
    expect(snapshotId(graph)).toMatch(/^cfg-[0-9a-f]{8}$/);
    expect(snapshotId(draftOf('exp-titration'))).not.toBe(snapshotId(graph));
  });
});
