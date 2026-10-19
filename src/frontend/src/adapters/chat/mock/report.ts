// 보고서를 띄운 뒤의 질문에 대한 목업 답. 화면이 ChatRequest에 실어 보낸 보고서 요약(결론·에이전트 판단·사건)만 쓴다.
// 보고서에 없는 이유를 지어내지 않는다. 찾지 못하면 찾지 못했다고 답한다.

import type {ReportBrief} from '../../../domain/report';

const basisNote = (r: ReportBrief) =>
  r.basis === 'fixture'
    ? '예시 보고서(이전 레포의 발표용 기록, 실측 아님)'
    : r.source === 'mock'
      ? '이번 목업 실행의 보고서'
      : '이번 실행의 보고서';

/** '이 결과 요약해 줘'. 결과 → 한 줄 요약 → 핵심 지표 → 결론. */
export function summarizeReport(r: ReportBrief): string {
  const lines = [
    `${r.title} — ${basisNote(r)} 요약입니다.`,
    '',
    `- 결과: ${r.outcome.label} · ${r.outcome.detail} · 자율 보정 ${r.outcome.corrections}회`,
    `- ${r.headline} ${r.body}`,
    ...r.kpis.map((k) => `- ${k.label}: ${k.value}`),
    `- 결론: ${r.conclusion.title}. ${r.conclusion.paragraphs[0] ?? ''}`.trim(),
  ];
  return lines.join('\n');
}

type Topic = {pattern: RegExp; keywords: RegExp};

// 질문이 무엇의 이유를 묻는지. 그 말이 들어 있는 판단 단계·사건을 찾는다.
const TOPICS: Topic[] = [
  {pattern: /(추가|투입|넣|요오드|분주|보정)/, keywords: /(추가|투입|분주|보정|요오드)/},
  {pattern: /(멈|정지|중단|e-?stop)/i, keywords: /(비상\s*정지|E-STOP|멈|중단)/i},
  {pattern: /(일시\s*정지|쉬)/, keywords: /일시정지/},
  {pattern: /(검증|확인|재개)/, keywords: /(검증|재개|확인)/},
];

/** '왜 요오드를 추가했어?'. 에이전트 판단(감지 → 판단 → 실행 → 검증)이 있으면 그것으로, 없으면 사건으로 답한다. */
export function explainReport(r: ReportBrief, question: string): string {
  const topic = TOPICS.find((t) => t.pattern.test(question));
  const act = r.agent.find((s) => s.stage === '실행' && (!topic || topic.keywords.test(`${s.title} ${s.text}`)));
  if (act && r.agent.length > 0) {
    const step = (stage: string) => r.agent.find((s) => s.stage === stage);
    const detect = step('감지');
    const assess = step('판단');
    const verify = step('검증');
    return [
      `${act.at}에 에이전트가 '${act.title}'을(를) 했습니다(${basisNote(r)} 기준).`,
      '',
      detect && `- 감지(${detect.at}): ${detect.title}. ${detect.text}`,
      assess && `- 판단(${assess.at}): ${assess.title}. ${assess.text}`,
      `- 실행(${act.at}): ${act.text}`,
      verify && `- 검증(${verify.at}): ${verify.title}. ${verify.text}`,
      '',
      `보고서의 해석: ${r.conclusion.paragraphs[0] ?? r.conclusion.title}`,
    ]
      .filter((line): line is string => typeof line === 'string')
      .join('\n');
  }
  const event = topic ? r.events.find((e) => topic.keywords.test(e.label)) : undefined;
  if (event) {
    const who = /E-STOP|비상\s*정지|일시정지/i.test(event.label) ? ' 사용자 조작으로 기록되어 있습니다.' : '';
    return `${event.at}에 '${event.label}'이(가) 기록되어 있습니다.${who} ${basisNote(r)}에는 그 이유를 적은 판단 기록이 없어 더 말하지 않았습니다.`;
  }
  if (r.agent.length === 0) {
    return `${basisNote(r)}에는 에이전트의 자율 판단 기록이 없습니다. 로봇은 확정한 계획을 순서대로 수행했습니다. 그래서 '왜'에 답할 근거가 없습니다. 이유를 지어내지 않으려고 추측하지 않았습니다.`;
  }
  return `보고서에서 그 질문의 이유를 찾지 못했습니다. 기록된 판단은 ${r.agent.map((s) => `${s.at} ${s.stage} '${s.title}'`).join(', ')}입니다. 이 중 하나를 물어보세요.`;
}
