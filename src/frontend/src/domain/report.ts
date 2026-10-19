// 결과 보고서 모델. 이전 ExperimentReport.tsx는 색 변화 실험 한 건의 문구와 수치를 컴포넌트에 박아 두었다.
// 그것을 데이터로 끌어내, 어떤 실행이든 같은 화면이 그리게 한다. 없는 절(반응식·색 변화 등)은 그리지 않는다.

import type {DataSource, Severity} from '../graph/model';

/** 차트 색 자리. 실제 색은 토큰(--chart-1…5)이 정한다. 지표 순서대로 준다. */
export type ChartTone = 1 | 2 | 3 | 4 | 5;

export type ReportMetric = {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  ticks: number[];
  tone: ChartTone;
  /** 값을 보일 때 소수 자리. */
  digits: number;
  /** 이 지표를 어떻게 읽었는지. 탭 차트 아래와 인쇄에 모두 쓴다. */
  description: string;
};

/** 경과 초 t의 지표 값. 그 시점에 없던 값은 비워 둔다(0으로 채우면 차트가 거짓말을 한다). */
export type ReportReading = {t: number; values: Record<string, number | undefined>};

export type ReportEventKind = 'detect' | 'dose' | 'target' | 'verify' | 'pause' | 'resume' | 'estop' | 'done' | 'error';
export type ReportEvent = {kind: ReportEventKind; at: number; label: string};
/** 구간: 보정(감지 → 검증), 일시정지 등. 차트에 음영으로 그린다. */
export type ReportSpan = {kind: 'correction' | 'pause'; from: number; to: number; label: string};
export type ReportThreshold = {metric: string; value: number; label: string};

export type ReportKpi = {
  label: string;
  value: string;
  unit?: string;
  /** 시작 대비 변화 등 한 줄. */
  change?: string;
  badge?: {text: string; tone: 'good' | 'neutral' | 'warn'};
};

export type ReportHazard = {severity: Severity; text: string};
export type ReportMaterial = {
  order: string;
  role: string;
  name: string;
  english?: string;
  formula: string;
  cas: string;
  phase: string;
  concentration: string;
  amount: string;
  /** 추가 투입 등 투입량 옆에 붙는 말. */
  amountNote?: string;
  hazards: ReportHazard[];
};

export type ReactionStep = {index: string; title: string; tempo: string; formula: string; text: string};
export type ProcedureStep = {no: string; title: string; text: string; meta?: string};
export type ColorFrame = {at: number; label: string; detail: string; color: string; coverage: number};

export type AgentStage = 'detect' | 'assess' | 'act' | 'verify';
export const agentStageLabel: Record<AgentStage, string> = {
  detect: '감지',
  assess: '판단',
  act: '실행',
  verify: '검증',
};
export type AgentStep = {stage: AgentStage; at: number; title: string; text: string};
export type AgentLogRow = {at: number; op: string; detail: string};
export type TimelineItem = {at: number; title: string; text: string; status: 'done' | 'warning' | 'agent' | 'stopped'};

export type RunReport = {
  meta: {
    id: string;
    title: string;
    /** 'YYYY. MM. DD'. */
    date: string;
    /** 'HH:MM:SS'. */
    startedAt: string;
    endedAt: string;
    /** 초. */
    duration: number;
    source: DataSource;
    /** fixture: 이전 레포의 색 변화 실험 기록. run: 이 앱에서 돌린 실행 기록에서 만든 것. 둘은 섞지 않는다. */
    basis: 'fixture' | 'run';
    planVersion?: number;
    /** 표본 간격(초). */
    interval: number;
  };
  outcome: {achieved: boolean; label: string; detail: string; corrections: number};
  summary: {headline: string; body: string; facts: {label: string; value: string}[]};
  kpis: ReportKpi[];
  materials: ReportMaterial[];
  materialNotes: string[];
  reactions?: {steps: ReactionStep[]; conclusion: string};
  procedure?: {steps: ProcedureStep[]; note?: string};
  metrics: ReportMetric[];
  readings: ReportReading[];
  events: ReportEvent[];
  spans: ReportSpan[];
  thresholds: ReportThreshold[];
  /** 지표 표 아래 시작 → 끝 같은 보조 수치. */
  secondary: {label: string; value: string; note?: string}[];
  colorFrames?: {title: string; frames: ColorFrame[]; caption: string; conclusion: {title: string; text: string}};
  agent?: {
    title: string;
    intro: string;
    steps: AgentStep[];
    outcome: {label: string; duration: string};
    boundary: {within: boolean; text: string};
  };
  agentLog: AgentLogRow[];
  timeline: TimelineItem[];
  conclusion: {title: string; paragraphs: string[]};
};

// ── 시간 ───────────────────────────────────────────────

/** 경과 초 → 'mm:ss'. 한 시간이 넘으면 분이 60을 넘는다(보고서는 분:초로 읽는 쪽이 낫다). */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** 시간축 눈금. 좁으면(480px 아래) 세 개, 넓으면 다섯 개쯤. 30초·1분·2분… 같은 읽기 좋은 간격에 끝 시각을 더한다. */
export function timeTicks(duration: number, width: number): number[] {
  if (duration <= 0) return [0];
  const parts = width < 480 ? 2 : 4;
  const steps = [10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  const target = duration / parts;
  // 목표 간격에 비율로 가장 가까운 간격(512초 ÷ 4 = 128 → 2분).
  const step =
    target > 3600
      ? Math.ceil(target / 3600) * 3600
      : steps.reduce((best, s) => (Math.abs(Math.log(s / target)) < Math.abs(Math.log(best / target)) ? s : best));
  const ticks: number[] = [];
  // 끝 눈금과 너무 가까운 눈금은 빼서 글자가 겹치지 않게 한다.
  for (let t = 0; t < duration - step * 0.4; t += step) ticks.push(t);
  ticks.push(duration);
  return ticks;
}

// ── 값 ─────────────────────────────────────────────────

export function metricSeries(report: RunReport, key: string): {t: number; v: number}[] {
  return report.readings.flatMap((r) => {
    const v = r.values[key];
    return typeof v === 'number' && Number.isFinite(v) ? [{t: r.t, v}] : [];
  });
}

/** 지표의 관측 범위(min–max) 안에서 0–1. 인쇄용 겹침 차트가 네 지표를 한 축에 놓을 때 쓴다. */
export function normalize(value: number, metric: Pick<ReportMetric, 'min' | 'max'>): number {
  const span = metric.max - metric.min;
  return span === 0 ? 0.5 : (value - metric.min) / span;
}

export function formatMetric(value: number | undefined, metric: Pick<ReportMetric, 'digits'>): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: metric.digits});
}

export function startEnd(report: RunReport, key: string) {
  const series = metricSeries(report, key);
  if (series.length === 0) return null;
  const values = series.map((p) => p.v);
  return {
    first: series[0]!.v,
    last: series.at(-1)!.v,
    min: Math.min(...values),
    max: Math.max(...values),
    count: series.length,
  };
}

/**
 * 실행 기록처럼 범위가 미리 정해지지 않은 지표의 축. 관측값에 위아래 여유를 두고, 읽기 좋은 간격으로 3–5개 눈금.
 * 값이 거의 같아도(pH 6.38~6.40) 축이 0 폭이 되지 않게 최소 폭을 둔다.
 */
export function niceAxis(values: readonly number[], minSpan: number): {min: number; max: number; ticks: number[]} {
  if (values.length === 0) return {min: 0, max: 1, ticks: [0, 0.5, 1]};
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const raw = (hi - lo) / 3;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 1000; v += step) ticks.push(Number(v.toFixed(6)));
  return {min, max, ticks};
}

/** 차트 aria-label: 무엇이 어떻게 변했고, 그 사이 무슨 일이 있었는지. 그림을 못 보는 사람이 같은 것을 읽게. */
export function chartSummary(report: RunReport, metric: ReportMetric): string {
  const range = startEnd(report, metric.key);
  const unit = metric.unit === metric.label ? '' : ` ${metric.unit}`;
  const values = range
    ? `시작 ${formatMetric(range.first, metric)}${unit}에서 끝 ${formatMetric(range.last, metric)}${unit}. 최저 ${formatMetric(range.min, metric)}, 최고 ${formatMetric(range.max, metric)}. ${range.count}개 측정.`
    : '기록된 값이 없습니다.';
  const thresholds = report.thresholds
    .filter((t) => t.metric === metric.key)
    .map((t) => `기준선 ${t.label}.`)
    .join(' ');
  const events = report.events.map((e) => `${mmss(e.at)} ${e.label}`).join(', ');
  const spans = report.spans.map((s) => `${mmss(s.from)}–${mmss(s.to)} ${s.label}`).join(', ');
  return [`${metric.label} 추이.`, values, thresholds, events && `사건: ${events}.`, spans && `구간: ${spans}.`]
    .filter(Boolean)
    .join(' ');
}

// ── 채팅에 싣는 요약 ─────────────────────────────────────

/** LLM이 '이 결과 요약해 줘', '왜 요오드를 추가했어?'에 답할 수 있게 보고서의 결론·판단·사건만 추린다. */
export type ReportBrief = {
  id: string;
  title: string;
  basis: RunReport['meta']['basis'];
  source: DataSource;
  outcome: {label: string; detail: string; corrections: number};
  headline: string;
  body: string;
  kpis: {label: string; value: string}[];
  /** 에이전트 판단 단계. 목업 실행 기록에는 없다. */
  agent: {stage: string; at: string; title: string; text: string}[];
  events: {at: string; label: string}[];
  conclusion: {title: string; paragraphs: string[]};
};

export function reportBrief(report: RunReport): ReportBrief {
  return {
    id: report.meta.id,
    title: report.meta.title,
    basis: report.meta.basis,
    source: report.meta.source,
    outcome: {label: report.outcome.label, detail: report.outcome.detail, corrections: report.outcome.corrections},
    headline: report.summary.headline,
    body: report.summary.body,
    kpis: report.kpis.map((k) => ({label: k.label, value: [k.value, k.unit].filter(Boolean).join(' ')})),
    agent: (report.agent?.steps ?? []).map((s) => ({
      stage: agentStageLabel[s.stage],
      at: mmss(s.at),
      title: s.title,
      text: s.text,
    })),
    events: report.events.map((e) => ({at: mmss(e.at), label: e.label})),
    conclusion: report.conclusion,
  };
}

// ── CSV ────────────────────────────────────────────────

const csvField = (value: string | number) => {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 사건을 그 시각 이하의 가장 가까운 측정 행에 붙인다. 같은 행에 여럿이면 ' / '로 잇는다. */
function eventsByRow(report: RunReport): Map<number, string[]> {
  const rows = report.readings.map((r) => r.t);
  const out = new Map<number, string[]>();
  for (const event of [...report.events].sort((a, b) => a.at - b.at)) {
    let index = -1;
    for (let i = 0; i < rows.length && rows[i]! <= event.at; i += 1) index = i;
    if (index < 0) index = 0;
    const list = out.get(index) ?? [];
    list.push(event.label);
    out.set(index, list);
  }
  return out;
}

/**
 * 센서 CSV. 엑셀에서 한글이 깨지지 않게 UTF-8 BOM을 붙이고, 줄은 CRLF로 끝낸다.
 * 열: 경과 시간(mm:ss), 경과 초, 지표별 값(열 이름에 단위), 그 시점의 사건.
 */
export function reportCsv(report: RunReport): string {
  const header = [
    '경과 시간',
    '경과 초',
    ...report.metrics.map((m) => (m.unit && m.unit !== m.label ? `${m.label} (${m.unit})` : m.label)),
    '사건',
  ];
  const events = eventsByRow(report);
  const rows = report.readings.map((r, i) => [
    mmss(r.t),
    r.t,
    ...report.metrics.map((m) => r.values[m.key] ?? ''),
    (events.get(i) ?? []).join(' / '),
  ]);
  return '﻿' + [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

export const reportCsvName = (report: RunReport) => `${report.meta.id}-sensor-data.csv`;
