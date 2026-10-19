import {describe, expect, it} from 'vitest';
import type {GraphSnapshot} from '../graph/model';
import {hazardsBySeverity} from './HazardBadge';

const hazard = (id: string, severity: string) => ({
  id,
  labels: ['Hazard' as const],
  properties: {title: id, description: '', severity},
});

describe('hazardsBySeverity', () => {
  it('무거운 것부터, 같은 심각도는 그래프 순서대로, 위험이 아닌 노드는 뺀다', () => {
    const graph: GraphSnapshot = {
      nodes: [
        hazard('a', 'medium'),
        {id: 'x', labels: ['Location'], properties: {name: '선반'}},
        hazard('b', 'critical'),
        hazard('c', 'medium'),
        hazard('d', 'high'),
      ],
      relationships: [],
    };
    expect(hazardsBySeverity(graph).map((n) => n.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(hazardsBySeverity(null)).toEqual([]);
  });
});
