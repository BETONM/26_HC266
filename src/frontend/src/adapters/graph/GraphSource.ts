import type {GraphSnapshot} from '../../graph/model';
import type {NodeFilter} from '../../graph/ops';

export type DraftSaveResult = {experimentId: string; graph: GraphSnapshot; warnings: string[]};

/**
 * 그래프 DB(인벤토리 포함) 접근. 모든 결과는 `source`를 달고 온다.
 * 실제 구현은 Neo4j 같은 그래프 DB 앞단 API에 붙는다.
 */
export interface GraphSource {
  /** 연구실 전체 그래프: 인벤토리, 보관 위치, 장비, 실험 템플릿, 위험. */
  getAll(signal?: AbortSignal): Promise<GraphSnapshot>;
  /** 라벨·속성·글자로 노드를 찾고, 찾은 노드끼리의 관계를 함께 준다. */
  search(filter: NodeFilter, signal?: AbortSignal): Promise<GraphSnapshot>;
  /** id 목록의 노드와 그 노드끼리의 관계. 없는 id는 건너뛴다. */
  getByIds(ids: readonly string[], signal?: AbortSignal): Promise<GraphSnapshot>;
  /** seed에서 hops번 안에 닿는 서브그래프. 관계 방향은 따지지 않는다. */
  getNeighborhood(ids: readonly string[], hops: number, signal?: AbortSignal): Promise<GraphSnapshot>;
  /**
   * 실험 초안 서브그래프를 저장하거나 갱신한다. 초안의 Experiment 노드(kind: 'draft')에 달린
   * USES·REQUIRES·HAS_HAZARD·PRODUCES 관계는 통째로 바꾼다. 빠진 시약이 남아 있으면 안 되기 때문이다.
   */
  saveDraft(draft: GraphSnapshot, signal?: AbortSignal): Promise<DraftSaveResult>;
}
