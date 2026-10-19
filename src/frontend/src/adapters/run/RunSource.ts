import type {RunLogEntry, RunStatus} from '../../domain/run';
import type {DataSource} from '../../graph/model';

export type StartRunRequest = {
  runId: string;
  planId: string;
  planVersion: number;
  graphSnapshotId: string;
  /** 로봇이 순서대로 할 동작. 순번 = 배열 위치. */
  steps: {id: string; label: string}[];
};

export type RunUpdate = {status: RunStatus; event?: RunLogEntry};

/**
 * 로봇 실행. 진행 위치와 상태(running·paused·done·stopped)를 흘려보내고, 일시정지·재개·비상 정지를 받는다.
 * 진행 위치는 '끝난 동작의 수'다.
 */
export interface RunSource {
  readonly source: DataSource;
  start(request: StartRunRequest, signal?: AbortSignal): Promise<RunStatus>;
  /**
   * 실행의 상태 변화를 받는다. 돌려준 함수를 부르면 그만 받는다.
   * known은 화면이 마지막으로 안 상태다. 새로고침 뒤 다시 붙을 때, 목업은 이것과 request로 진행을 이어 간다.
   * 실제 서버는 runId만 쓴다(진행은 서버가 안다).
   */
  connect(request: StartRunRequest, known: RunStatus | null, listener: (update: RunUpdate) => void): () => void;
  pause(runId: string, signal?: AbortSignal): Promise<RunStatus>;
  resume(runId: string, signal?: AbortSignal): Promise<RunStatus>;
  emergencyStop(runId: string, signal?: AbortSignal): Promise<RunStatus>;
}
