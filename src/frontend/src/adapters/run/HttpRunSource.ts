// 로봇 서버 실행 API. 서버가 아직 없어 자리만 둔다. 붙일 때 같은 인터페이스로 채운다
// (예: POST /runs, GET /runs/{id}/events(SSE), POST /runs/{id}/pause|resume|estop).

import type {RunStatus} from '../../domain/run';
import type {RunSource, RunUpdate, StartRunRequest} from './RunSource';

const notYet = () => new Error('로봇 서버 실행 API가 아직 연결되지 않았습니다.');

export class HttpRunSource implements RunSource {
  readonly source = 'live' as const;

  constructor(readonly baseUrl: string) {}

  async start(_request: StartRunRequest): Promise<RunStatus> {
    throw notYet();
  }

  connect(_request: StartRunRequest, _known: RunStatus | null, _listener: (update: RunUpdate) => void): () => void {
    return () => {};
  }

  async pause(): Promise<RunStatus> {
    throw notYet();
  }

  async resume(): Promise<RunStatus> {
    throw notYet();
  }

  async emergencyStop(): Promise<RunStatus> {
    throw notYet();
  }
}
