import {describe, expect, it} from 'vitest';
import {reportBrief, type ReportBrief} from '../../../domain/report';
import {fixtureReport} from '../../report/mock/fixture';
import {classifyIntent} from './intent';
import {explainReport, summarizeReport} from './report';

const example = reportBrief(fixtureReport());
const stoppedRun: ReportBrief = {
  ...example,
  id: 'run-1',
  basis: 'run',
  agent: [],
  outcome: {label: '비상 정지', detail: '8/16동작에서 멈춤', corrections: 0},
  events: [
    {at: '00:06', label: '일시정지했습니다.'},
    {at: '00:20', label: 'E-STOP. 목업 실행이라 실제 장비에는 신호를 보내지 않았습니다(실제 장비 미연결).'},
  ],
};

describe('보고서 질문 분류', () => {
  it('보고서를 띄웠을 때만 요약·이유 질문으로 읽는다. "추가"가 들어 있어도 바꾸는 말이 아니다', () => {
    const ctx = {mentionsInventory: true, hasPlan: true, hasRun: true, hasReport: true};
    expect(classifyIntent('이 결과 요약해 줘', ctx).kind).toBe('report-summary');
    expect(classifyIntent('왜 요오드를 추가했어?', ctx).kind).toBe('report-why');
    expect(classifyIntent('실험 결과 어땠어?', ctx).kind).toBe('report-summary');
    expect(classifyIntent('이 결과 요약해 줘', {...ctx, hasReport: false}).kind).not.toBe('report-summary');
  });
});

describe('보고서 목업 답', () => {
  it('요약: 출처, 결과, 지표, 결론', () => {
    const text = summarizeReport(example);
    expect(text).toContain('예시 보고서(이전 레포의 발표용 기록, 실측 아님)');
    expect(text).toContain('결과: 반응 목표 충족');
    expect(text).toContain('최종 청람색 면적: 93.4 %');
    expect(text).toContain('결론: 색 변화는 확인, 원인은 추정');
  });

  it('왜 요오드를 추가했어? → 감지·판단·실행·검증 순서로, 보고서의 해석과 함께', () => {
    const text = explainReport(example, '왜 요오드를 추가했어?');
    expect(text.startsWith("03:42에 에이전트가 '요오드 용액 2.0 mL 추가'")).toBe(true);
    const order = ['감지(03:20)', '판단(03:24)', '실행(03:42)', '검증(04:48)'].map((s) => text.indexOf(s));
    expect(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1]!))).toBe(true);
    expect(text).toContain('원인 확정과는 구분');
  });

  it('판단 기록이 없는 실행: 사건은 말하되 이유는 지어내지 않는다', () => {
    expect(explainReport(stoppedRun, '왜 멈췄어?')).toContain("00:20에 'E-STOP.");
    expect(explainReport(stoppedRun, '왜 멈췄어?')).toContain('사용자 조작');
    expect(explainReport(stoppedRun, '왜 요오드를 추가했어?')).toContain('자율 판단 기록이 없습니다');
  });
});
