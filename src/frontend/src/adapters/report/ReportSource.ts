import type {RunReport} from '../../domain/report';
import type {RunReportInput} from '../../domain/reportFromRun';
import type {DataSource} from '../../graph/model';

/**
 * 실행 하나의 보고서. 서버는 실행 기록을 갖고 있으니 id만 보내면 되지만, 목업은 기록이 이 브라우저에만 있어
 * 화면이 가진 기록(run·확정 구성·계획)을 함께 넘긴다. http 구현은 local을 쓰지 않는다.
 */
export type ReportRequest = {runId: string; local?: RunReportInput};

export interface ReportSource {
  readonly source: DataSource;
  getReport(request: ReportRequest, signal?: AbortSignal): Promise<RunReport>;
  /** 예시 보고서(이전 레포의 색 변화 실험). 목업에만 있다. 없으면 화면이 예시 보기를 숨긴다. */
  getExample?(signal?: AbortSignal): Promise<RunReport>;
}
