// 목업 보고서. 둘을 섞지 않는다: 이 앱의 실행 기록에서 만든 것(basis 'run')과 예시 fixture(basis 'fixture').

import {reportFromRun} from '../../domain/reportFromRun';
import {abortError, createFaultInjector, type FaultOptions} from '../faults';
import {fixtureReport} from './mock/fixture';
import type {ReportRequest, ReportSource} from './ReportSource';

export class MockReportSource implements ReportSource {
  readonly source = 'mock' as const;
  private faults;

  constructor(options: {faults?: FaultOptions} = {}) {
    this.faults = createFaultInjector(options.faults);
  }

  async getReport(request: ReportRequest, signal?: AbortSignal) {
    await this.faults.run(signal);
    if (signal?.aborted) throw abortError();
    if (!request.local || request.local.run.id !== request.runId) {
      throw new Error('이 브라우저에 그 실행 기록이 없습니다. 실행한 브라우저에서 열어야 보고서를 만들 수 있습니다.');
    }
    return reportFromRun(request.local);
  }

  async getExample(signal?: AbortSignal) {
    await this.faults.run(signal);
    if (signal?.aborted) throw abortError();
    return fixtureReport();
  }
}
