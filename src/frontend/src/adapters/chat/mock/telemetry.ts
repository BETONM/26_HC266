// 실행 중 질문에 대한 목업 답. 화면이 ChatRequest에 실어 보낸 최신 장비 값과 진행만 쓴다(목업이 값을 지어내지 않는다).

import type {TelemetrySnapshot} from '../../../chat/types';
import {stepNumber} from '../../../domain/plan';
import {clockTime, runStateLabel} from '../../../domain/run';
import {withParticle} from './korean';

const fmt = (v: number | undefined, digits: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : null;

type Metric = {key: 'ph' | 'ec' | 'tds' | 'temp' | 'thermal'; name: string; pattern: RegExp};

const METRICS: Metric[] = [
  {key: 'ph', name: 'pH', pattern: /(ph|피에이치)/i},
  {key: 'ec', name: '전도도(EC)', pattern: /(전도도|\bec\b)/i},
  {key: 'tds', name: 'TDS', pattern: /tds/i},
  {key: 'temp', name: '용액 온도', pattern: /(온도(?!.*열화상)|temp)/i},
  {key: 'thermal', name: '열화상', pattern: /열화상/},
];

function line(t: TelemetrySnapshot, key: Metric['key']): string | null {
  const s = t.sensors;
  if (key === 'thermal') {
    const v = fmt(t.thermal.value, 1);
    return v ? `열화상 ${v} °C(${t.thermal.caption})` : `열화상 값 없음(${t.thermal.caption})`;
  }
  if (!s) return null;
  if (key === 'ph') return fmt(s.ph, 2) && `pH ${fmt(s.ph, 2)}`;
  if (key === 'ec') return fmt(s.ec, 0) && `전도도 ${fmt(s.ec, 0)} µS/cm`;
  if (key === 'tds') return fmt(s.tds, 0) && `TDS ${fmt(s.tds, 0)} ppm`;
  return fmt(s.temp, 1) && `용액 온도 ${fmt(s.temp, 1)} °C`;
}

/** '지금 pH 얼마야?' → 물은 값을 먼저, 나머지를 뒤에. 값이 오래됐거나 오류가 있으면 그것부터 말한다. */
export function describeTelemetry(t: TelemetrySnapshot | null, question: string): string {
  if (!t || (!t.sensors && t.thermal.value === undefined)) {
    return '아직 받은 장비 값이 없습니다. 실행을 시작하면 모니터링에서 2초마다 값을 받습니다. 값을 지어내지 않으려고 숫자를 말하지 않았습니다.';
  }
  const asked = METRICS.filter((m) => m.pattern.test(question)).map((m) => m.key);
  const order: Metric['key'][] = [
    ...asked,
    ...(['ph', 'ec', 'tds', 'thermal'] as const).filter((k) => !asked.includes(k)),
  ];
  const lines = order.map((k) => line(t, k)).filter((l): l is string => Boolean(l));
  const [first, ...rest] = lines;
  const when = t.at ? `${clockTime(t.at)}에 받은 값` : '마지막으로 받은 값';
  const warnings = [
    t.sensors?.stale ? '센서 값이 오래된 데이터입니다. 센서 보드가 갱신을 멈췄을 수 있습니다.' : null,
    t.sensorError ? `센서 값을 받지 못해 마지막 값을 말했습니다(${t.sensorError}).` : null,
  ].filter(Boolean);
  const head = first ? `지금 ${first}입니다(${when}).` : `물은 값이 아직 없습니다(${when}).`;
  return [head, ...warnings, rest.length > 0 ? `그 밖에: ${rest.join(', ')}.` : ''].filter(Boolean).join(' ');
}

/** '지금 뭐 하는 중이야?' → 상태, 지금 동작과 묶음, 마친 수, 다음 동작. */
export function describeRun(t: TelemetrySnapshot | null): string {
  const run = t?.run;
  if (!run) return '아직 실행을 시작하지 않았습니다. 실행 계획 탭에서 계획을 확인하고 실행을 시작하세요.';
  const percent = run.total === 0 ? 100 : Math.round((run.cursor / run.total) * 100);
  const done = `${run.total}동작 중 ${run.cursor}개를 마쳤습니다(${percent}%).`;
  if (run.state === 'done') return `실행을 마쳤습니다. ${done} 보고서를 볼 수 있습니다.`;
  if (run.state === 'stopped') return `비상 정지로 멈춘 상태입니다. ${done} 멈춘 뒤에는 이어서 실행하지 않습니다.`;
  const now = run.current ? `${stepNumber(run.current.order)} ${run.current.label}(${run.current.group})` : '다음 동작';
  const next = run.next ? ` 다음은 ${run.next}입니다.` : ' 이것이 마지막 동작입니다.';
  if (run.state === 'paused') return `${runStateLabel.paused} 중입니다. 멈춘 동작은 ${now}입니다. ${done}${next}`;
  return `지금 ${withParticle(now, '을/를')} 하는 중입니다. ${done}${next}`;
}
