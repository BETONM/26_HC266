import {useEffect, useId, useRef, useState, type CSSProperties} from 'react';
import {AxisBottom, AxisLeft} from '@visx/axis';
import {Group} from '@visx/group';
import {scaleLinear} from '@visx/scale';
import {AreaClosed, Line, LinePath} from '@visx/shape';
import {
  chartSummary,
  formatMetric,
  metricSeries,
  mmss,
  normalize,
  startEnd,
  timeTicks,
  type ReportEvent,
  type ReportMetric,
  type RunReport,
} from '../domain/report';

const HEIGHT = 288;
const MARGIN = {top: 36, right: 24, bottom: 52, left: 56};
const MIN_WIDTH = 240;

/** 차트 폭은 감싸는 칸을 따라간다(최소 240px). 폭이 바뀌면 눈금 수도 바뀐다. */
function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? 0;
      if (w > 0) setWidth(Math.max(MIN_WIDTH, Math.round(w)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return {ref, width};
}

// 세로선으로 그리는 사건. 감지·검증은 보정 구간의 양끝이라 음영이 이미 말하고, 완료는 차트 끝이다.
const LINED: ReadonlySet<ReportEvent['kind']> = new Set(['dose', 'target', 'estop', 'error']);
export const linedEvents = (report: RunReport) => report.events.filter((e) => LINED.has(e.kind));

/** 지표마다 다른 선 모양. 색을 못 가르는 종이(흑백 인쇄)에서도 지표를 구분하게. */
const STROKES: {width: number; dash?: string}[] = [
  {width: 2.2},
  {width: 3},
  {width: 2, dash: '7 4'},
  {width: 2, dash: '2 4'},
  {width: 2, dash: '10 3 2 3'},
];
export const strokeOf = (index: number) => STROKES[index % STROKES.length]!;
const seriesColor = (metric: ReportMetric) => ({'--series': `var(--chart-${metric.tone})`}) as CSSProperties;

/** 지표 하나의 차트. 보정 구간 음영, 사건 세로선, 기준선, 면 그라디언트, 마지막 값 점. */
export function MetricChart({report, metric}: {report: RunReport; metric: ReportMetric}) {
  const {ref, width} = useChartWidth();
  const gradientId = useId();
  const series = metricSeries(report, metric.key);
  const duration = Math.max(report.meta.duration, 1);
  const x = scaleLinear({domain: [0, duration], range: [MARGIN.left, width - MARGIN.right]});
  const y = scaleLinear({domain: [metric.min, metric.max], range: [HEIGHT - MARGIN.bottom, MARGIN.top], clamp: true});
  const top = MARGIN.top;
  const bottom = HEIGHT - MARGIN.bottom;
  const last = series.at(-1);
  return (
    <div ref={ref} className="report-chart-wrap" style={seriesColor(metric)}>
      <svg
        className="report-chart"
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={chartSummary(report, metric)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="report-chart-fill-top" />
            <stop offset="100%" className="report-chart-fill-bottom" />
          </linearGradient>
        </defs>
        <text x={MARGIN.left} y={18} className="report-chart-note">
          {metric.unit}
        </text>
        <text x={width - MARGIN.right} y={18} textAnchor="end" className="report-chart-note">
          {report.meta.interval}초 간격 · {series.length}개 측정
        </text>
        {report.spans.map((s) => (
          <rect
            key={`${s.kind}-${s.from}`}
            className="report-chart-span"
            data-kind={s.kind}
            x={x(s.from)}
            y={top}
            width={Math.max(1, x(s.to) - x(s.from))}
            height={bottom - top}
          />
        ))}
        {metric.ticks.map((tick) => (
          <Line
            key={tick}
            className="report-chart-grid"
            from={{x: MARGIN.left, y: y(tick)}}
            to={{x: width - MARGIN.right, y: y(tick)}}
          />
        ))}
        {report.thresholds
          .filter((t) => t.metric === metric.key)
          .map((t) => (
            <Group key={t.value}>
              <Line
                className="report-chart-threshold"
                from={{x: MARGIN.left, y: y(t.value)}}
                to={{x: width - MARGIN.right, y: y(t.value)}}
              />
              <text x={width - MARGIN.right - 6} y={y(t.value) - 8} textAnchor="end" className="report-chart-label">
                {t.label}
              </text>
            </Group>
          ))}
        <AreaClosed data={series} x={(p) => x(p.t)} y={(p) => y(p.v)} yScale={y} fill={`url(#${gradientId})`} />
        {linedEvents(report).map((e) => (
          <Line
            key={`${e.kind}-${e.at}`}
            className="report-chart-event"
            data-kind={e.kind}
            from={{x: x(e.at), y: top}}
            to={{x: x(e.at), y: bottom}}
          />
        ))}
        <LinePath data={series} x={(p) => x(p.t)} y={(p) => y(p.v)} className="report-chart-line" />
        {last && <circle className="report-chart-last" cx={x(last.t)} cy={y(last.v)} r={5} />}
        <AxisLeft
          scale={y}
          left={MARGIN.left}
          tickValues={metric.ticks}
          tickFormat={(v) => formatMetric(Number(v), metric)}
          hideAxisLine
          hideTicks
          tickLabelProps={() => ({className: 'report-chart-tick', textAnchor: 'end', dx: -6, dy: 4})}
        />
        <AxisBottom
          scale={x}
          top={bottom}
          tickValues={timeTicks(duration, width)}
          tickFormat={(v) => mmss(Number(v))}
          hideAxisLine
          hideTicks
          tickLabelProps={() => ({className: 'report-chart-tick', textAnchor: 'middle', dy: 10})}
        />
        <text
          x={(MARGIN.left + width - MARGIN.right) / 2}
          y={HEIGHT - 6}
          textAnchor="middle"
          className="report-chart-note"
        >
          실험 경과 시간
        </text>
      </svg>
    </div>
  );
}

const OVERLAY_W = 840;
const OVERLAY_H = 232;
const OVERLAY = {top: 32, right: 20, bottom: 42, left: 20};

/**
 * 인쇄용: 모든 지표를 각자의 관측 범위로 정규화해 한 축에 겹친다. 종이에서는 탭을 넘길 수 없어서다.
 * 색과 함께 선 굵기·점선이 지표를 가른다.
 */
export function OverlayChart({report}: {report: RunReport}) {
  const duration = Math.max(report.meta.duration, 1);
  const x = scaleLinear({domain: [0, duration], range: [OVERLAY.left, OVERLAY_W - OVERLAY.right]});
  const y = scaleLinear({domain: [0, 1], range: [OVERLAY_H - OVERLAY.bottom, OVERLAY.top]});
  const top = OVERLAY.top;
  const bottom = OVERLAY_H - OVERLAY.bottom;
  const names = report.metrics.map((m) => m.label).join(', ');
  const events = linedEvents(report)
    .map((e) => `${mmss(e.at)} ${e.label}`)
    .join(', ');
  return (
    <svg
      className="report-chart report-overlay"
      viewBox={`0 0 ${OVERLAY_W} ${OVERLAY_H}`}
      role="img"
      aria-label={`${names}를 각 지표의 관측 범위로 정규화해 한 축에 겹친 추이.${events ? ` 사건: ${events}.` : ''}`}
    >
      <text x={OVERLAY.left} y={16} className="report-chart-note">
        {report.metrics.length}개 지표 겹쳐 보기 · 각 지표의 관측 범위로 정규화
      </text>
      <text x={OVERLAY_W - OVERLAY.right} y={16} textAnchor="end" className="report-chart-note">
        {report.meta.interval}초 간격 · {report.readings.length}개 측정
      </text>
      {report.spans.map((s) => (
        <rect
          key={`${s.kind}-${s.from}`}
          className="report-chart-span"
          data-kind={s.kind}
          x={x(s.from)}
          y={top}
          width={Math.max(1, x(s.to) - x(s.from))}
          height={bottom - top}
        />
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <Line
          key={f}
          className="report-chart-grid"
          from={{x: OVERLAY.left, y: y(f)}}
          to={{x: OVERLAY_W - OVERLAY.right, y: y(f)}}
        />
      ))}
      {report.thresholds.map((t) => {
        const metric = report.metrics.find((m) => m.key === t.metric);
        if (!metric) return null;
        const ty = y(normalize(t.value, metric));
        return (
          <Group key={`${t.metric}-${t.value}`}>
            <Line
              className="report-chart-threshold"
              from={{x: OVERLAY.left, y: ty}}
              to={{x: OVERLAY_W - OVERLAY.right, y: ty}}
            />
            <text x={OVERLAY.left + 6} y={ty - 7} className="report-chart-label">
              {metric.label} {t.label}
            </text>
          </Group>
        );
      })}
      {linedEvents(report).map((e) => (
        <Line
          key={`${e.kind}-${e.at}`}
          className="report-chart-event"
          data-kind={e.kind}
          from={{x: x(e.at), y: top}}
          to={{x: x(e.at), y: bottom}}
        />
      ))}
      {report.metrics.map((metric, i) => {
        const series = metricSeries(report, metric.key);
        const stroke = strokeOf(i);
        const last = series.at(-1);
        return (
          <Group key={metric.key} style={seriesColor(metric)}>
            <LinePath
              data={series}
              x={(p) => x(p.t)}
              y={(p) => y(normalize(p.v, metric))}
              className="report-chart-line"
              strokeWidth={stroke.width}
              strokeDasharray={stroke.dash}
            />
            {last && <circle className="report-chart-last" cx={x(last.t)} cy={y(normalize(last.v, metric))} r={4} />}
          </Group>
        );
      })}
      {timeTicks(duration, OVERLAY_W).map((t) => (
        <text key={t} x={x(t)} y={bottom + 18} textAnchor="middle" className="report-chart-tick">
          {mmss(t)}
        </text>
      ))}
      <text x={OVERLAY_W / 2} y={OVERLAY_H - 4} textAnchor="middle" className="report-chart-note">
        실험 경과 시간
      </text>
    </svg>
  );
}

/** 지표별 시작 → 끝. 선 견본은 겹침 차트와 같은 굵기·점선이다. */
export function MetricLegend({report}: {report: RunReport}) {
  return (
    <ul className="report-legend">
      {report.metrics.map((metric, i) => {
        const range = startEnd(report, metric.key);
        const stroke = strokeOf(i);
        const unit = metric.unit === metric.label ? '' : ` ${metric.unit}`;
        return (
          <li key={metric.key} style={seriesColor(metric)}>
            <svg className="report-legend-swatch" viewBox="0 0 28 8" aria-hidden="true">
              <line x1="1" y1="4" x2="27" y2="4" strokeWidth={stroke.width} strokeDasharray={stroke.dash} />
            </svg>
            <b>{metric.label}</b>
            <span>
              {range ? `${formatMetric(range.first, metric)} → ${formatMetric(range.last, metric)}${unit}` : '값 없음'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** 차트 아래 음영·세로선이 무엇인지. */
export function EventLegend({report}: {report: RunReport}) {
  const lined = linedEvents(report);
  if (report.spans.length === 0 && lined.length === 0) return null;
  return (
    <ul className="report-event-legend">
      {report.spans.map((s) => (
        <li key={`${s.kind}-${s.from}`}>
          <i className="report-key-span" data-kind={s.kind} aria-hidden="true" />
          {mmss(s.from)}–{mmss(s.to)} {s.label}
        </li>
      ))}
      {lined.map((e) => (
        <li key={`${e.kind}-${e.at}`}>
          <i className="report-key-event" data-kind={e.kind} aria-hidden="true" />
          {mmss(e.at)} {e.label}
        </li>
      ))}
    </ul>
  );
}
