import {useEffect, useState, type ReactNode} from 'react';
import {Button, Dialog, Heading, Modal, ModalOverlay} from 'react-aria-components';
import {CAMERAS, type CameraId} from '../adapters/device/types';
import {useAppStore} from '../app/store';
import {currentVersion, planProgress, stepNumber, versionOf, type ExecutionPlan} from '../domain/plan';
import {clockTime, elapsedTime, groupWindows, isRunActive, stepState, type RunRecord} from '../domain/run';
import {deviceStatuses, formatValue, POLL_INTERVAL_MS, primaryThermalReading} from '../device/feed';
import {severityLabel} from '../graph/model';
import {hazardsBySeverity, SeverityGlyph} from '../hazard/HazardBadge';
import {showHazardList} from '../workspace/GraphPanel';
import {useVideo} from './feed';
import {EStopButton, PauseButton, RunStateBadge, useRefocusOnRunEnd} from './RunControls';
import {ThermalDialog} from './ThermalDialog';
import {TREND_POINTS, trendPoints, trendRange} from './trend';
import {VideoView} from './VideoView';
import './monitoring.css';

const SPARK_W = 120;
const SPARK_H = 28;

/** 실행 중에만 1초마다 다시 그린다(경과 시간). 끝나면 멈춘다. */
function useNow(ticking: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}

// ── 머리: 무엇이 어떤 상태로 얼마나 돌았는지, 그리고 멈추는 단추 ──

function RunHead({run, name}: {run: RunRecord; name: string}) {
  const active = isRunActive(run.state);
  const now = useNow(active);
  return (
    <header className="mon-head">
      <div className="mon-head-text">
        <p className="plan-eyebrow">{name}</p>
        <h2 id="stage-title-monitoring" className="stage-title monitor-title" tabIndex={-1}>
          모니터링 <RunStateBadge state={run.state} />
        </h2>
        <p className="mon-meta">
          <span>
            경과 <strong className="mon-clock">{elapsedTime(run.startedAt, run.endedAt, now)}</strong>
          </span>
          <span>
            {clockTime(run.startedAt)} 시작{run.endedAt && ` · ${clockTime(run.endedAt)} 끝남`}
          </span>
          <span>계획 v{run.planVersion}</span>
          {run.source === 'mock' && <span>목업 실행 · 비상 정지는 기록만 남깁니다</span>}
        </p>
      </div>
      {active ? (
        <div className="monitor-controls">
          <PauseButton />
          {/* 비상 정지는 묻지 않고 바로 보낸다. 되묻는 사이가 위험할 수 있다. */}
          <EStopButton />
        </div>
      ) : (
        <Button
          id="monitor-report"
          className="primary-button monitor-report"
          onPress={() => useAppStore.setState({stage: 'report'})}
        >
          보고서 보기
        </Button>
      )}
    </header>
  );
}

// ── 지금: 하는 동작과 진행, 장치 상태 ──

function NowBand({run, plan}: {run: RunRecord; plan: ExecutionPlan}) {
  const groups = (versionOf(plan, run.planVersion) ?? currentVersion(plan)).groups;
  const progress = planProgress(groups, run.cursor);
  const percent = run.total === 0 ? 100 : Math.round((run.cursor / run.total) * 100);
  useRefocusOnRunEnd(run.state);
  const sensors = useAppStore((s) => s.telemetry.sensors);
  const lastUpdated = useAppStore((s) => s.telemetry.lastUpdated);
  // 상태마다 '지금' 줄의 뜻이 다르다. 일시정지에는 움직이는 것처럼 읽히지 않게, 비상 정지에는 멈춘 동작을 남긴다.
  const label =
    run.state === 'done'
      ? '모든 동작을 마쳤습니다'
      : run.state === 'stopped'
        ? '비상 정지 · 이 동작 중에 멈췄습니다'
        : run.state === 'paused'
          ? '일시정지 · 재개하면 이어서 할 동작'
          : '지금 하는 동작';
  return (
    <section className="mon-now" aria-labelledby="monitor-now">
      <div className="monitor-now">
        <h3 id="monitor-now" className="monitor-now-label" tabIndex={-1}>
          {label}
        </h3>
        {progress.active && (
          <p className="monitor-now-step">
            <span className="plan-step-no">{stepNumber(progress.active.order)}</span> {progress.active.label}
            <span className="monitor-now-group">
              {' '}
              · {progress.active.group.title} · {progress.active.group.target}
            </span>
          </p>
        )}
        <div className="mon-progress-row">
          <div
            className="monitor-progress"
            role="progressbar"
            aria-label="실행 진행"
            aria-valuemin={0}
            aria-valuemax={run.total}
            aria-valuenow={run.cursor}
            aria-valuetext={`${run.total}동작 중 ${run.cursor}개 마침, ${percent}%`}
          >
            <span style={{width: `${percent}%`}} />
          </div>
          <span className="mon-progress-count" aria-hidden="true">
            {run.cursor}/{run.total} · {percent}%
          </span>
        </div>
        {sensors?.stale && (
          <p className="monitor-stale">센서 값이 갱신되지 않습니다(마지막 {clockTime(sensors.ts ?? lastUpdated)}).</p>
        )}
      </div>
      <DeviceStatusList />
    </section>
  );
}

/** 장치 상태. 상태는 점 모양과 글자로 함께 알린다(색만으로 가르지 않는다). */
function DeviceStatusList() {
  const health = useAppStore((s) => s.telemetry.health);
  const error = useAppStore((s) => s.telemetry.error);
  const lastUpdated = useAppStore((s) => s.telemetry.lastUpdated);
  const source = useAppStore((s) => s.telemetry.source);
  return (
    <div className="mon-devices">
      <h3 id="device-title" className="mon-title">
        장치{' '}
        <span className="monitor-count">
          {clockTime(lastUpdated)} 갱신 · {POLL_INTERVAL_MS / 1000}초마다{source === 'mock' && ' · 목업 장비'}
        </span>
      </h3>
      <ul className="device-list" aria-labelledby="device-title">
        {deviceStatuses(health).map((item) => (
          <li key={item.id} data-state={item.state} title={item.detail ?? undefined}>
            <span className="device-mark" aria-hidden="true" />
            <span className="device-name">{item.name}</span>
            <span className="device-label">{item.label}</span>
            {item.detail && <span className="sr-only"> · {item.detail}</span>}
          </li>
        ))}
      </ul>
      {error && <p className="monitor-note">장비 상태를 받지 못했습니다. {error}</p>}
    </div>
  );
}

// ── 카메라 셋 ──

function CameraTile({id, name}: {id: CameraId; name: string}) {
  const video = useVideo(id);
  const [open, setOpen] = useState(false);
  const info = video.handle?.info;
  const meta = [
    info?.label,
    info?.width ? `${info.width}×${info.height}` : null,
    info?.frameRate ? `${Math.round(info.frameRate)}fps` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const status = video.handle ? '실시간' : video.loading ? '연결 중' : '연결 안 됨';
  return (
    <figure className="camera-tile" data-camera={id} data-live={video.handle ? true : undefined}>
      {video.handle ? (
        <Button className="camera-frame" onPress={() => setOpen(true)} aria-label={`${name} 크게 보기 (${status})`}>
          <VideoView source={video.handle.source} label={`${name} 실시간 영상`} className="camera-video" />
        </Button>
      ) : (
        <p className="camera-frame camera-placeholder">
          {video.error || (video.loading ? '카메라 연결 중' : '카메라 없음')}
        </p>
      )}
      <figcaption className="camera-tag" aria-hidden={video.handle ? true : undefined}>
        <span className="camera-tag-dot" aria-hidden="true" />
        {name} · {status}
      </figcaption>
      {video.handle && (
        <ModalShell isOpen={open} onOpenChange={setOpen} title={name} subtitle={meta}>
          <VideoView
            source={video.handle.source}
            label={`${name} 실시간 영상(크게)`}
            className="camera-video camera-video-large"
          />
        </ModalShell>
      )}
    </figure>
  );
}

function Cameras() {
  return (
    <section className="mon-cams" aria-labelledby="camera-title">
      <h3 id="camera-title" className="sr-only">
        카메라
      </h3>
      {CAMERAS.map((c) => (
        <CameraTile key={c.id} id={c.id} name={c.name} />
      ))}
    </section>
  );
}

// ── 센서: 지금 값 + 최근 흐름 ──

function Sparkline({
  title,
  values,
  minSpan,
  digits,
}: {
  title: string;
  values: number[];
  minSpan: number;
  digits: number;
}) {
  const range = trendRange(values, minSpan);
  const points = range ? trendPoints(values, range, SPARK_W, SPARK_H) : [];
  const summary = range
    ? `최근 ${values.length}개, 최저 ${formatValue(Math.min(...values), digits)}, 최고 ${formatValue(Math.max(...values), digits)}`
    : '아직 기록이 없습니다';
  return (
    <svg
      className="spark"
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${title} 추이: ${summary}`}
    >
      {points.length > 0 && (
        <polyline className="spark-line" points={points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} />
      )}
    </svg>
  );
}

function SensorTile({
  label,
  unit,
  value,
  caption,
  stale,
  children,
}: {
  label: string;
  unit?: string;
  value: string;
  caption: string;
  stale?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="sensor-tile" data-stale={stale ? true : undefined}>
      <span className="sensor-label">
        {label}
        {unit && <span className="sensor-unit"> · {unit}</span>}
      </span>
      <span className="sensor-value">{value}</span>
      {children}
      <span className="sensor-caption">{stale ? `오래된 데이터 · ${stale} 값` : caption}</span>
    </div>
  );
}

function SensorTiles({run, onOpenThermal}: {run: RunRecord; onOpenThermal(): void}) {
  const telemetry = useAppStore((s) => s.telemetry);
  const thermal = useAppStore((s) => s.thermal);
  const [tableOpen, setTableOpen] = useState(false);
  const s = telemetry.sensors;
  // 오래된 값이면 그 값을 받은 시각을 함께 쓴다. 멈춘 값을 지금 값으로 읽지 않게.
  const stale = s?.stale ? clockTime(s.ts ?? telemetry.lastUpdated) : null;
  // 출처는 장비 어댑터가 정한다(목업 값을 측정값이라 부르지 않는다).
  const source = telemetry.sensorError
    ? '센서 오류 · 마지막 값'
    : s
      ? telemetry.source === 'mock'
        ? '목업 값'
        : '측정값'
      : telemetry.loading
        ? '센서 확인 중'
        : '값 없음';
  const recent = run.samples.slice(-TREND_POINTS);
  const series = (key: 'ph' | 'ec' | 'tds' | 'thermal') =>
    recent.flatMap((x) => (typeof x[key] === 'number' ? [x[key]] : []));
  const reading = primaryThermalReading(thermal);
  return (
    <section className="mon-sensors" aria-labelledby="sensor-title">
      <div className="mon-section-head">
        <h3 id="sensor-title" className="mon-title">
          센서{' '}
          <span className="monitor-count">
            {source} · 최근 {recent.length}개
          </span>
        </h3>
        <Button className="text-button" onPress={() => setTableOpen(true)} isDisabled={recent.length === 0}>
          표로 보기
        </Button>
      </div>
      <div className="sensor-grid">
        <SensorTile label="pH" value={formatValue(s?.ph, 2)} caption="산도" stale={stale}>
          <Sparkline title="pH" values={series('ph')} minSpan={0.2} digits={2} />
        </SensorTile>
        <SensorTile label="EC" unit="µS/cm" value={formatValue(s?.ec, 1)} caption="전도도" stale={stale}>
          <Sparkline title="전도도" values={series('ec')} minSpan={20} digits={0} />
        </SensorTile>
        <SensorTile label="TDS" unit="ppm" value={formatValue(s?.tds, 1)} caption="총 용존 고형물" stale={stale}>
          <Sparkline title="TDS" values={series('tds')} minSpan={10} digits={0} />
        </SensorTile>
        <Button
          className="sensor-tile sensor-tile-button"
          onPress={onOpenThermal}
          aria-label={`열화상 ${formatValue(reading.value, 1)} °C, ${reading.caption}. 열화상 열기`}
        >
          <span className="sensor-label">
            열화상<span className="sensor-unit"> · °C</span>
          </span>
          <span className="sensor-value">{formatValue(reading.value, 1)}</span>
          <Sparkline title="열화상" values={series('thermal')} minSpan={1} digits={1} />
          <span className="sensor-caption">{reading.caption}</span>
          <span className="sensor-open">
            {thermal.rois.length > 0 ? `영역 ${thermal.rois.length}개 · 열기` : '열기'}
          </span>
        </Button>
      </div>
      {telemetry.sensorError && <p className="monitor-note">센서 값을 받지 못했습니다. {telemetry.sensorError}</p>}
      <ModalShell isOpen={tableOpen} onOpenChange={setTableOpen} title="센서 기록" subtitle={`최근 ${recent.length}개`}>
        <div className="mon-table-wrap">
          <table className="trend-table">
            <caption className="sr-only">최근 센서 값</caption>
            <thead>
              <tr>
                <th scope="col">시각</th>
                <th scope="col">pH</th>
                <th scope="col">EC (µS/cm)</th>
                <th scope="col">TDS (ppm)</th>
                <th scope="col">열화상 (°C)</th>
              </tr>
            </thead>
            <tbody>
              {[...recent].reverse().map((x) => (
                <tr key={x.at}>
                  <td>{clockTime(x.at)}</td>
                  <td>{formatValue(x.ph, 2)}</td>
                  <td>{formatValue(x.ec, 0)}</td>
                  <td>{formatValue(x.tds, 0)}</td>
                  <td>{formatValue(x.thermal, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ModalShell>
    </section>
  );
}

// ── 계획 진행 ──

const STEP_STATE_TEXT = {done: '마침', active: '하는 중', todo: '대기'} as const;

function PlanProgress({run, plan}: {run: RunRecord; plan: ExecutionPlan}) {
  const [allOpen, setAllOpen] = useState(false);
  const groups = (versionOf(plan, run.planVersion) ?? currentVersion(plan)).groups;
  const windows = groupWindows(groups, run.cursor);
  // 동작까지 보이는 묶음은 지금 하는 묶음 하나(끝났으면 마지막 묶음). 나머지는 '몇 개 마침'만.
  const focus = windows.find(({steps}) => steps.some((s) => s.order >= run.cursor)) ?? windows.at(-1) ?? null;
  const row = (order: number, label: string) => {
    const state = stepState(order, run.cursor, run.state);
    return (
      <li key={order} className="progress-step" data-state={state}>
        <span className="progress-mark" aria-hidden="true" />
        <span className="plan-step-no">{stepNumber(order)}</span>
        <span className="progress-label">{label}</span>
        <span className="sr-only"> ({STEP_STATE_TEXT[state]})</span>
      </li>
    );
  };
  return (
    <section className="mon-plan mon-panel" aria-labelledby="progress-title">
      <div className="mon-section-head">
        <h3 id="progress-title" className="mon-title">
          계획 진행
        </h3>
        <Button className="text-button" onPress={() => setAllOpen(true)}>
          전체 {run.total}동작
        </Button>
      </div>
      {/* 칸이 낮아도 지금 하는 곳이 먼저 보이게: 지금 묶음의 동작 몇 개 → 묶음별 진행(지금 묶음은 굵게). */}
      <div className="progress-body">
        {focus && <ol className="progress-steps">{focus.visible.map((s) => row(s.order, s.label))}</ol>}
        <ol className="progress-groups" aria-label="묶음별 진행">
          {windows.map((w) => {
            const doneCount = w.steps.filter((s) => s.order < run.cursor).length;
            return (
              <li key={w.group.id} className="progress-group" data-current={w === focus || undefined}>
                <span className="progress-group-name">{w.group.title}</span>
                <span className="monitor-count">
                  {doneCount}/{w.steps.length}
                  {w === focus && <span className="sr-only"> (지금 묶음)</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <ModalShell
        isOpen={allOpen}
        onOpenChange={setAllOpen}
        title="계획 진행"
        subtitle={`v${run.planVersion} · 읽기 전용`}
      >
        <ol className="progress-steps progress-all">
          {windows.flatMap(({steps}) => steps.map((s) => row(s.order, s.label)))}
        </ol>
      </ModalShell>
    </section>
  );
}

// ── 위험 ──

/** 이 실험의 위험 전부. 무거운 것부터, 모양·심각도 글자·제목을 함께. 위험은 대시보드에서 유일한 어두운 면이다. */
function HazardPanel() {
  const graph = useAppStore((s) => s.confirmed?.graph ?? s.draftGraph);
  const hazards = hazardsBySeverity(graph);
  return (
    <section className="mon-hazards hz-card" aria-labelledby="mon-hazard-title">
      <div className="mon-section-head">
        <h3 id="mon-hazard-title" className="hz-card-title">
          이 실험의 위험 <span className="mon-hazard-count">{hazards.length}건</span>
        </h3>
        <Button className="hz-card-link" onPress={showHazardList}>
          목록
        </Button>
      </div>
      {hazards.length === 0 ? (
        <p className="hz-card-empty">등록된 위험이 없습니다. 실제 제품의 MSDS로 한 번 더 확인하세요.</p>
      ) : (
        <ul className="mon-hazard-list">
          {hazards.map((h) => (
            <li key={h.id} data-severity={h.properties.severity}>
              <SeverityGlyph severity={h.properties.severity} />
              <span className="mon-hazard-severity">{severityLabel[h.properties.severity]}</span>
              <span className="mon-hazard-name">{h.properties.title}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── 장비 로그 ──

function DeviceLog({run}: {run: RunRecord}) {
  const events = [...run.events].reverse().slice(0, 30);
  return (
    <section className="mon-log mon-panel" aria-labelledby="log-title">
      <div className="mon-section-head">
        <h3 id="log-title" className="mon-title">
          장비 로그 <span className="monitor-count">{run.events.length}건</span>
        </h3>
      </div>
      {/* 로그만 칸 안에서 넘긴다. 최신이 맨 위라 넘친 것은 지난 기록이다.
          넘치는 칸은 브라우저가 키보드 포커스를 준다(Chrome·Firefox의 focusable scroller). */}
      <ol className="device-log" aria-label="장비 로그, 최신순">
        {events.map((e, i) => (
          <li key={`${e.at}-${i}`} data-kind={e.kind}>
            <time>{clockTime(e.at)}</time>
            <span>
              {e.kind === 'error' || e.kind === 'device' ? '오류 · ' : e.by === 'user' ? '조작 · ' : ''}
              {e.message}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ModalShell({
  isOpen,
  onOpenChange,
  title,
  subtitle,
  children,
}: {
  isOpen: boolean;
  onOpenChange(o: boolean): void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <ModalOverlay className="modal-overlay" isDismissable isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal className="modal modal-wide">
        <Dialog className="dialog">
          {({close}) => (
            <>
              <div className="dialog-head">
                <div>
                  <Heading slot="title" className="dialog-title">
                    {title}
                  </Heading>
                  {subtitle && <p className="dialog-subtitle">{subtitle}</p>}
                </div>
                <div className="dialog-head-actions">
                  <EStopButton compact showStopped />
                  <Button className="secondary-button" onPress={close}>
                    닫기
                  </Button>
                </div>
              </div>
              {children}
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/**
 * 실행을 시작한 뒤의 가운데 카드. 요약 열을 접고 그 자리까지 넓혀 관제 화면처럼 한 화면에 모두 둔다:
 * 머리(상태·경과·비상 정지) → 지금 하는 동작과 장치 → 센서(왼쪽 2×2) · 카메라 셋(오른쪽, 탑뷰 위 · 팔 둘 아래)
 * → 계획 진행 · 위험 · 장비 로그.
 * 화면이 충분히 크면 스크롤 없이 카드 높이에 맞추고(카메라와 아래 칸이 늘고 준다), 작으면 한 줄로 흐른다.
 */
export function MonitoringStage() {
  const run = useAppStore((s) => s.run);
  const plan = useAppStore((s) => s.plan);
  const confirmed = useAppStore((s) => s.confirmed);
  const [thermalOpen, setThermalOpen] = useState(false);

  if (!run || !plan) return <p className="stage-placeholder">모니터링은 실행을 시작하면 열립니다.</p>;

  return (
    <article className="monitor" aria-labelledby="stage-title-monitoring">
      <div className="mon-grid">
        <RunHead run={run} name={confirmed?.name ?? '실험'} />
        <NowBand run={run} plan={plan} />
        <SensorTiles run={run} onOpenThermal={() => setThermalOpen(true)} />
        <Cameras />
        <PlanProgress run={run} plan={plan} />
        <HazardPanel />
        <DeviceLog run={run} />
      </div>
      <ThermalDialog isOpen={thermalOpen} onOpenChange={setThermalOpen} />
    </article>
  );
}
