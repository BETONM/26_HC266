// 5단계 실행 기록(RunRecord)에서 보고서를 만든다. 기록에 있는 것만 쓴다.
// 목업 로봇은 계획을 순서대로 돌릴 뿐 스스로 판단하지 않으므로, 에이전트 판단·반응식·색 변화 절은 만들지 않는다.

import {hasLabel, severityRank, usageRoleLabel, type GraphSnapshot} from '../graph/model';
import {specFromDraftGraph} from './draft';
import {currentVersion, planSteps, stepNumber, versionOf, type ExecutionPlan} from './plan';
import {
  mmss,
  niceAxis,
  formatMetric,
  type ChartTone,
  type ReportEvent,
  type ReportEventKind,
  type ReportMaterial,
  type ReportMetric,
  type ReportReading,
  type ReportSpan,
  type RunReport,
  type TimelineItem,
} from './report';
import {clockTime, type RunLogKind, type RunRecord, type TelemetrySample} from './run';

export type RunReportInput = {
  run: RunRecord;
  /** 확정한 구성. 재료 표의 출처다. */
  confirmed: {name: string; graph: GraphSnapshot} | null;
  plan: ExecutionPlan | null;
};

type SampleKey = 'ph' | 'ec' | 'tds' | 'temp' | 'thermal';
const METRIC_DEFS: {key: SampleKey; label: string; unit: string; digits: number; minSpan: number; tone: ChartTone}[] = [
  {key: 'ec', label: '전도도', unit: 'µS/cm', digits: 0, minSpan: 20, tone: 1},
  {key: 'ph', label: 'pH', unit: 'pH', digits: 2, minSpan: 0.2, tone: 3},
  {key: 'tds', label: 'TDS', unit: 'ppm', digits: 0, minSpan: 10, tone: 5},
  {key: 'temp', label: '용액 온도', unit: '°C', digits: 1, minSpan: 1, tone: 4},
  {key: 'thermal', label: '열화상', unit: '°C', digits: 1, minSpan: 1, tone: 2},
];

const EVENT_KIND: Partial<Record<RunLogKind, ReportEventKind>> = {
  pause: 'pause',
  resume: 'resume',
  estop: 'estop',
  done: 'done',
  error: 'error',
  device: 'error',
};

const two = (n: number) => String(n).padStart(2, '0');
function dateLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${d.getFullYear()}. ${two(d.getMonth() + 1)}. ${two(d.getDate())}`;
}

const secondsBetween = (fromIso: string, toIso: string) =>
  Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000));

function metricFor(def: (typeof METRIC_DEFS)[number], samples: TelemetrySample[], mock: boolean): ReportMetric | null {
  const values = samples.flatMap((s) => (typeof s[def.key] === 'number' ? [s[def.key] as number] : []));
  if (values.length === 0) return null;
  const axis = niceAxis(values, def.minSpan);
  const shape = {digits: def.digits};
  const unit = def.unit === def.label ? '' : ` ${def.unit}`;
  const stale = samples.filter((s) => s.stale && typeof s[def.key] === 'number').length;
  // 해석은 하지 않는다. 기록된 수치만 문장으로 옮긴다(목업 값을 반응의 증거처럼 말하지 않게).
  const description = [
    `시작 ${formatMetric(values[0], shape)}${unit}에서 끝 ${formatMetric(values.at(-1), shape)}${unit}. 최저 ${formatMetric(Math.min(...values), shape)}, 최고 ${formatMetric(Math.max(...values), shape)}.`,
    stale > 0 ? `갱신되지 않은 값 ${stale}개가 섞여 있습니다.` : '',
    mock ? '목업 장비가 만든 값이라 반응 해석에 쓰지 않습니다.' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return {key: def.key, label: def.label, unit: def.unit, ...axis, tone: def.tone, digits: def.digits, description};
}

/** 확정 그래프에서 이 실험이 쓴 시약과 그 위험. 위험은 무거운 것부터, 조건이 있으면 괄호로. */
export function materialsFrom(graph: GraphSnapshot | null): ReportMaterial[] {
  const spec = specFromDraftGraph(graph);
  if (!graph || !spec) return [];
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  return spec.uses.map((use, index) => {
    const node = nodes.get(use.chemicalId);
    const p = node && hasLabel(node, 'Chemical') ? node.properties : null;
    const hazards = graph.relationships
      .filter((r) => (r.type === 'HAS_HAZARD' || r.type === 'CAUSES') && r.startNode === use.chemicalId)
      .flatMap((r) => {
        const h = nodes.get(r.endNode);
        if (!h || !hasLabel(h, 'Hazard')) return [];
        const condition = typeof r.properties.condition === 'string' ? ` (${r.properties.condition})` : '';
        return [{severity: h.properties.severity, text: `${h.properties.title}${condition}`}];
      })
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
    return {
      order: two(index + 1),
      role: usageRoleLabel[use.role] ?? use.role,
      name: p?.name ?? use.chemicalId,
      ...(p?.english && {english: p.english}),
      formula: p?.formula ?? '—',
      cas: p?.cas ?? '—',
      phase: p?.phase ?? '—',
      concentration: p?.concentration ?? '—',
      amount: `${use.amount} ${use.unit}`,
      hazards,
    };
  });
}

export function reportFromRun({run, confirmed, plan}: RunReportInput): RunReport {
  const mock = run.source === 'mock';
  const end = run.endedAt ?? run.samples.at(-1)?.at ?? run.startedAt;
  const duration = secondsBetween(run.startedAt, end);
  const at = (iso: string) => Math.min(duration, secondsBetween(run.startedAt, iso));

  const metrics = METRIC_DEFS.flatMap((def) => metricFor(def, run.samples, mock) ?? []);
  const readings: ReportReading[] = run.samples.map((s) => ({
    t: at(s.at),
    values: Object.fromEntries(metrics.map((m) => [m.key, s[m.key as SampleKey]])),
  }));

  const events: ReportEvent[] = run.events.flatMap((e) => {
    const kind = EVENT_KIND[e.kind];
    return kind ? [{kind, at: at(e.at), label: e.message}] : [];
  });
  // 일시정지 → 재개(재개가 없으면 끝)를 구간으로.
  const spans: ReportSpan[] = [];
  let pausedAt: number | null = null;
  for (const e of run.events) {
    if (e.kind === 'pause') pausedAt = at(e.at);
    if ((e.kind === 'resume' || e.kind === 'estop' || e.kind === 'done') && pausedAt !== null) {
      spans.push({kind: 'pause', from: pausedAt, to: at(e.at), label: '일시정지'});
      pausedAt = null;
    }
  }
  if (pausedAt !== null) spans.push({kind: 'pause', from: pausedAt, to: duration, label: '일시정지'});

  const groups = plan ? (versionOf(plan, run.planVersion) ?? currentVersion(plan)).groups : [];
  const steps = planSteps(groups);
  const stopped = run.state === 'stopped';
  const done = run.state === 'done';
  const stoppedStep = stopped ? steps[run.cursor] : undefined;
  const materials = materialsFrom(confirmed?.graph ?? null);

  // 타임라인: 시작, 묶음을 마친 때, 일시정지·재개, 끝(완료·비상 정지·오류).
  const timeline: TimelineItem[] = [
    {at: 0, title: '실행 시작', text: `계획 v${run.planVersion} · ${run.total}동작`, status: 'done'},
  ];
  for (const e of run.events) {
    if (e.kind === 'step' && typeof e.cursor === 'number') {
      const finished = steps[e.cursor - 1];
      const next = steps[e.cursor];
      if (finished && (!next || next.group.id !== finished.group.id)) {
        timeline.push({
          at: at(e.at),
          title: `${finished.group.title} 마침`,
          text: `${finished.group.target} · ${stepNumber(e.cursor)}동작까지`,
          status: 'done',
        });
      }
    }
    if (e.kind === 'pause' || e.kind === 'resume') {
      timeline.push({
        at: at(e.at),
        title: e.kind === 'pause' ? '일시정지' : '재개',
        text: e.message,
        status: 'warning',
      });
    }
    if (e.kind === 'estop') timeline.push({at: at(e.at), title: '비상 정지', text: e.message, status: 'stopped'});
    if (e.kind === 'error') timeline.push({at: at(e.at), title: '오류', text: e.message, status: 'warning'});
    if (e.kind === 'done') timeline.push({at: at(e.at), title: '실행 완료', text: e.message, status: 'done'});
  }

  const sourceNote = mock
    ? '목업 로봇과 목업 장비로 돌린 기록입니다. 센서 값은 실측이 아닙니다.'
    : '실제 장비에서 받은 기록입니다.';
  const sampleCount = run.samples.length;
  const kpis: RunReport['kpis'] = [
    {
      label: '진행',
      value: `${run.cursor}/${run.total}`,
      unit: '동작',
      change: done ? '계획한 동작을 모두 마침' : stopped ? `${stepNumber(run.cursor)} 동작 중 멈춤` : '진행 중',
      badge: done ? {text: '완료', tone: 'good'} : stopped ? {text: '비상 정지', tone: 'warn'} : undefined,
    },
    {label: '실행 시간', value: mmss(duration), change: `2초 간격 · ${sampleCount}개 측정`},
    ...metrics
      .filter((m) => m.key === 'ph' || m.key === 'ec')
      .map((m) => {
        const values = readings.flatMap((r) => (typeof r.values[m.key] === 'number' ? [r.values[m.key]!] : []));
        return {
          label: `최종 ${m.label}`,
          value: formatMetric(values.at(-1), m),
          unit: m.unit === m.label ? undefined : m.unit,
          change: `시작 ${formatMetric(values[0], m)}`,
        };
      }),
  ];

  return {
    meta: {
      id: run.id,
      title: confirmed?.name ?? '실험',
      date: dateLabel(run.startedAt),
      startedAt: clockTime(run.startedAt),
      endedAt: clockTime(end),
      duration,
      source: run.source,
      basis: 'run',
      planVersion: run.planVersion,
      interval: 2,
    },
    outcome: done
      ? {achieved: true, label: '계획 완료', detail: '중단 없이 끝까지', corrections: 0}
      : stopped
        ? {achieved: false, label: '비상 정지', detail: `${run.cursor}/${run.total}동작에서 멈춤`, corrections: 0}
        : {achieved: false, label: '진행 중', detail: `${run.cursor}/${run.total}동작`, corrections: 0},
    summary: {
      headline: done
        ? `계획한 ${run.total}동작을 모두 마쳤습니다.`
        : stopped
          ? `비상 정지로 ${run.cursor}/${run.total}동작에서 멈췄습니다.`
          : `${run.cursor}/${run.total}동작까지 진행했습니다.`,
      body: sourceNote,
      facts: [
        {label: dateLabel(run.startedAt), value: `${clockTime(run.startedAt)}–${clockTime(end)}`},
        {label: '계획', value: `v${run.planVersion} · ${run.total}동작`},
        {label: '시약', value: materials.length > 0 ? `${materials.length}종` : '기록 없음'},
        {label: '센서 표본', value: `${sampleCount}개`},
      ],
    },
    kpis,
    materials,
    materialNotes: materials.length
      ? ['확정한 구성(그래프)에서 가져왔습니다. 위험 심각도와 문구는 실제 사용 제품의 MSDS로 한 번 더 확인하세요.']
      : [],
    procedure: groups.length
      ? {
          steps: groups.map((g) => {
            const own = steps.filter((s) => s.group.id === g.id);
            const finished = own.filter((s) => s.order < run.cursor).length;
            const range = own.length ? `${stepNumber(own[0]!.order)}–${stepNumber(own.at(-1)!.order)}` : '';
            return {
              no: range,
              title: `${g.title} · ${g.target}`,
              text: own.map((s) => s.label).join(' → '),
              meta: `${finished}/${own.length} 마침`,
            };
          }),
          note: `실행한 계획 v${run.planVersion}의 묶음입니다.`,
        }
      : undefined,
    metrics,
    readings,
    events,
    spans,
    thresholds: [],
    secondary: metrics.map((m) => {
      const values = readings.flatMap((r) => (typeof r.values[m.key] === 'number' ? [r.values[m.key]!] : []));
      const unit = m.unit === m.label ? '' : ` ${m.unit}`;
      return {
        label: `${m.label} 시작 → 끝`,
        value: `${formatMetric(values[0], m)} → ${formatMetric(values.at(-1), m)}${unit}`,
      };
    }),
    agentLog: run.events.map((e) => ({at: at(e.at), op: e.kind.toUpperCase(), detail: e.message})),
    timeline,
    conclusion: done
      ? {
          title: '계획대로 끝났습니다',
          paragraphs: [
            '이 실행에는 에이전트의 자율 판단이 기록되지 않았습니다. 로봇은 확정한 계획을 순서대로 수행했습니다.',
            mock
              ? '목업 장비 값이라 반응은 해석하지 않았습니다. 실제 장비로 같은 계획을 돌리면 이 자리에 해석이 들어갑니다.'
              : '센서 추이를 보고 반응이 기대대로 진행됐는지 확인하세요.',
          ],
        }
      : stopped
        ? {
            title: '비상 정지로 중단했습니다',
            paragraphs: [
              stoppedStep
                ? `${stepNumber(stoppedStep.order)} ${stoppedStep.label}(${stoppedStep.group.title}) 중에 멈췄습니다.`
                : `${run.cursor}/${run.total}동작에서 멈췄습니다.`,
              '멈춘 뒤의 상태(용액, 기구와 로봇팔 위치)를 직접 확인한 뒤 정리하세요. 같은 계획을 다시 돌리려면 처음부터 시작해야 합니다.',
            ],
          }
        : {title: '아직 진행 중입니다', paragraphs: ['실행이 끝나면 결과를 정리합니다.']},
  };
}
