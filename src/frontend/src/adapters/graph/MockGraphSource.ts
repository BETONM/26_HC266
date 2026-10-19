import {hasLabel, type GraphSnapshot} from '../../graph/model';
import {filterGraph, inducedSubgraph, mergeSnapshots, neighborhood, type NodeFilter} from '../../graph/ops';
import {parseGraph} from '../../graph/parse';
import {createFaultInjector, type FaultOptions} from '../faults';
import type {DraftSaveResult, GraphSource} from './GraphSource';
import {createSeedGraph} from './seed';

// 초안이 바꿀 수 있는 것은 실험 자신에서 나가는 관계뿐이다. 인벤토리를 고치지 않는다.
const DRAFT_OWNED_TYPES = new Set(['USES', 'REQUIRES', 'HAS_HAZARD', 'PRODUCES']);

/** 메모리 그래프 + 시드. 결정적이며 지연·실패를 주입할 수 있다. */
export class MockGraphSource implements GraphSource {
  private graph: GraphSnapshot;
  private faults;

  constructor(options: {seed?: GraphSnapshot; faults?: FaultOptions} = {}) {
    this.graph = structuredClone(options.seed ?? createSeedGraph());
    this.graph.source = 'mock';
    this.faults = createFaultInjector(options.faults);
  }

  // 호출한 쪽이 결과를 고쳐도 메모리 그래프가 바뀌지 않도록 복사해서 준다.
  private snapshot(graph: GraphSnapshot): GraphSnapshot {
    return structuredClone({...graph, source: 'mock'});
  }

  async getAll(signal?: AbortSignal) {
    await this.faults.run(signal);
    return this.snapshot(this.graph);
  }

  async search(filter: NodeFilter, signal?: AbortSignal) {
    await this.faults.run(signal);
    return this.snapshot(filterGraph(this.graph, filter));
  }

  async getByIds(ids: readonly string[], signal?: AbortSignal) {
    await this.faults.run(signal);
    return this.snapshot(inducedSubgraph(this.graph, new Set(ids)));
  }

  async getNeighborhood(ids: readonly string[], hops: number, signal?: AbortSignal) {
    await this.faults.run(signal);
    return this.snapshot(neighborhood(this.graph, ids, hops));
  }

  async saveDraft(draft: GraphSnapshot, signal?: AbortSignal): Promise<DraftSaveResult> {
    await this.faults.run(signal);
    // 초안은 인벤토리 노드를 싣지 않고 id로만 가리킬 수 있다. 끝점 검사를 저장된 그래프까지 넓히려고
    // 저장된 노드를 함께 넣어 검증한 뒤, 초안이 실어 온 노드만 다시 골라낸다.
    const draftNodeIds = new Set(draft.nodes.map((n) => n.id));
    const {graph: checked, warnings} = parseGraph(
      {
        nodes: [...draft.nodes, ...this.graph.nodes.filter((n) => !draftNodeIds.has(n.id))],
        relationships: draft.relationships,
      },
      'mock',
    );
    const parsed = {...checked, nodes: checked.nodes.filter((n) => draftNodeIds.has(n.id))};
    const drafts = parsed.nodes.filter((n) => hasLabel(n, 'Experiment') && n.properties.kind === 'draft');
    if (drafts.length !== 1) {
      throw new Error(`실험 초안 노드는 하나여야 합니다. 받은 개수: ${drafts.length}`);
    }
    const experimentId = drafts[0]!.id;
    const existingIds = new Set(this.graph.nodes.map((n) => n.id));

    // 이미 있는 인벤토리·위험 노드는 초안이 덮어쓰지 못하게 한다. 새 노드와 초안 노드만 받는다.
    const acceptedNodes = parsed.nodes.filter((n) => n.id === experimentId || !existingIds.has(n.id));
    const skipped = parsed.nodes.length - acceptedNodes.length;
    if (skipped > 0) warnings.push(`이미 있는 노드 ${skipped}개는 초안으로 바꾸지 않았습니다.`);

    const base: GraphSnapshot = {
      ...this.graph,
      relationships: this.graph.relationships.filter(
        (r) => !(r.startNode === experimentId && DRAFT_OWNED_TYPES.has(r.type)),
      ),
    };
    this.graph = mergeSnapshots(base, {nodes: acceptedNodes, relationships: parsed.relationships, source: 'mock'}).graph;

    return {experimentId, graph: this.snapshot(neighborhood(this.graph, [experimentId], 1)), warnings};
  }
}
