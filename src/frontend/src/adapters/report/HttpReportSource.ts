// 보고서 서버. 실행 기록을 서버가 갖고 있으니 id로 받는다: GET /runs/{id}/report → RunReport(JSON).
// 서버가 아직 없어 경로만 정해 두었다. 응답 모양은 src/domain/report.ts의 RunReport다(README 'API 목록').

import type {RunReport} from '../../domain/report';
import type {ReportRequest, ReportSource} from './ReportSource';

export class HttpReportSource implements ReportSource {
  readonly source = 'live' as const;

  constructor(private readonly baseUrl: string) {}

  async getReport({runId}: ReportRequest, signal?: AbortSignal): Promise<RunReport> {
    const response = await fetch(`${this.baseUrl}/runs/${encodeURIComponent(runId)}/report`, {signal});
    if (!response.ok) throw new Error(`보고서를 받지 못했습니다 (${response.status}).`);
    const report = (await response.json()) as RunReport;
    // 서버가 출처를 빠뜨려도 실측으로 표시한다. 이 구현은 실제 서버에서만 받는다.
    return {...report, meta: {...report.meta, source: report.meta?.source ?? 'live'}};
  }
}
