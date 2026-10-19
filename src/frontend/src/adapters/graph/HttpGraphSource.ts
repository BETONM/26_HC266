import type {GraphSnapshot} from '../../graph/model';
import type {NodeFilter} from '../../graph/ops';
import type {DraftSaveResult, GraphSource} from './GraphSource';

// TODO: 그래프 DB(예: Neo4j) 앞단 API가 정해지면 구현한다.
// - 응답은 `parseGraph(body, 'live')`로 검증한다. Neo4j HTTP API graph 결과도 그대로 받는다.
// - 경로 문자열은 이 파일 안에만 둔다.
export class HttpGraphSource implements GraphSource {
  constructor(private readonly baseUrl: string) {}

  private notReady(): never {
    throw new Error(`그래프 API(${this.baseUrl || '주소 미설정'})는 아직 연결되지 않았습니다.`);
  }

  async getAll(_signal?: AbortSignal): Promise<GraphSnapshot> {
    return this.notReady();
  }
  async search(_filter: NodeFilter, _signal?: AbortSignal): Promise<GraphSnapshot> {
    return this.notReady();
  }
  async getByIds(_ids: readonly string[], _signal?: AbortSignal): Promise<GraphSnapshot> {
    return this.notReady();
  }
  async getNeighborhood(_ids: readonly string[], _hops: number, _signal?: AbortSignal): Promise<GraphSnapshot> {
    return this.notReady();
  }
  async saveDraft(_draft: GraphSnapshot, _signal?: AbortSignal): Promise<DraftSaveResult> {
    return this.notReady();
  }
}
